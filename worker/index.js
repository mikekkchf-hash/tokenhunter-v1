// worker/index.js
// Module Worker version — export default.fetch + env usage
// Assumes a separate file worker/recent_tx_do.js exporting `export class RecentTxStore { ... }`

export { RecentTxStore } from './recent_tx_do.js'; // ensure your DO class is exported

const ETHERSCAN_BASE = 'https://api.etherscan.io/api';
const DEXSCREENER_TOKEN_ENDPOINT = 'https://api.dexscreener.com/latest/dex/tokens/'; // append tokenAddress
const TELEGRAM_API_SEND = (token) => `https://api.telegram.org/bot${token}/sendMessage`;
const DEFAULT_MIN_LIQ = 30000;
const ALERT_COOLDOWN_MINUTES = 60; // default cooldown for re-alert

/* ---------- Module entrypoint ---------- */
export default {
  async fetch(request, env, ctx) {
    // route requests and pass `env` down to helpers
    try {
      return await router(request, env, ctx);
    } catch (e) {
      console.error('top-level fetch error', e);
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }
};

/* ---------- Router (uses env) ---------- */
async function router(request, env, ctx){
  try{
    const url = new URL(request.url);
    const path = url.pathname;
    if(request.method === 'GET' && path === '/health') return new Response(JSON.stringify({ok:true, ts: new Date().toISOString()}), {status:200});
    if(request.method === 'POST' && path === '/webhook/infura-tx') return await handleIncomingTx(request, env);
    if(request.method === 'POST' && path === '/cron/newpairs') return await handleCronNewPairs(request, env);
    if(request.method === 'POST' && path === '/internal/security-checks') return await runSecurityChecksHandler(request, env);
    if(request.method === 'GET' && path === '/admin/config') return new Response(JSON.stringify(await getConfig(env)), {status:200});
    return new Response('not-found', {status:404});
  }catch(e){
    console.error('router error', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

/* ---------- Helpers (env-aware) ---------- */
function nowISO(){ return new Date().toISOString(); }
function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }
function safeKey(k){ return (k||'').toString().toLowerCase().trim(); }

/* Exponential backoff + full jitter */
async function safeFetchWithBackoff(url, opts = {}, retries = 4, baseDelay = 500){
  for(let i=0;i<=retries;i++){
    try{
      const r = await fetch(url, opts);
      if(r.status === 429 || (r.status >=500 && r.status <600)){
        if(i === retries) {
          const text = await r.text().catch(()=>null);
          throw new Error(`Upstream status ${r.status} ${text||''}`);
        }
        const wait = Math.min(30000, baseDelay * Math.pow(2, i));
        const jitter = Math.random() * wait;
        await sleep(jitter);
        continue;
      }
      const text = await r.text();
      try{ return JSON.parse(text); }catch(e){ return text; }
    }catch(err){
      if(i === retries) throw err;
      const wait = Math.min(30000, baseDelay * Math.pow(2, i));
      const jitter = Math.random() * wait;
      await sleep(jitter);
    }
  }
  throw new Error('safeFetchWithBackoff failed');
}

/* Config loader (KV_CONFIG preferred) */
async function getConfig(env){
  try{
    const raw = await env.KV_CONFIG.get('SYSTEM_CONFIG');
    if(raw) {
      const parsed = JSON.parse(raw);
      parsed.MIN_LIQUIDITY_USD = Number(parsed.MIN_LIQUIDITY_USD || DEFAULT_MIN_LIQ);
      parsed.ALERT_THRESHOLD = Number(parsed.ALERT_THRESHOLD || 80);
      parsed.REQUIRED_WALLETS = Number(parsed.REQUIRED_WALLETS || 3);
      parsed.WINDOW_MINUTES = Number(parsed.WINDOW_MINUTES || 10);
      parsed.weights = parsed.weights || { smartBuys:0.25, securityScore:0.3, liquidity:0.2, holderChange:0.1, slippage:0.05, social:0.1 };
      return parsed;
    }
  }catch(e){ console.warn('getConfig KV read error', e); }
  // fallback to env vars (note: env.* variables are available via env.NAME)
  return {
    MIN_LIQUIDITY_USD: Number(env.MIN_LIQUIDITY_USD || DEFAULT_MIN_LIQ),
    ALERT_THRESHOLD: Number(env.ALERT_THRESHOLD || 80),
    REQUIRED_WALLETS: Number(env.REQUIRED_WALLETS || 3),
    WINDOW_MINUTES: Number(env.WINDOW_MINUTES || 10),
    weights: { smartBuys:0.25, securityScore:0.3, liquidity:0.2, holderChange:0.1, slippage:0.05, social:0.1 }
  };
}

/* ---------- Core flows (env passed) ---------- */

async function handleIncomingTx(request, env){
  let body;
  try{ body = await request.json(); } catch(e){ return new Response('bad payload', {status:400}); }
  const tx = body.tx || body;
  if(!tx || !tx.hash) return new Response('no-tx', {status:400});
  const tokenAddress = safeKey(tx.tokenAddress || tx.to || tx.contractAddress || tx.token || '');
  if(!tokenAddress) {
    return new Response(JSON.stringify({ ok:false, reason:'no tokenAddress' }), {status:400});
  }
  const seenKey = `seen:${tokenAddress}`;
  const seen = await env.KV_CANDIDATES.get(seenKey);
  // store tx in DO
  try{
    const id = env.DURABLE_RECENT.idFromName('recent-main');
    const obj = env.DURABLE_RECENT.get(id);
    await obj.fetch('https://do/addTx', { method: 'POST', body: JSON.stringify({ tokenAddress, from: tx.from, hash: tx.hash, timestamp: tx.timestamp || Date.now() }) });
  }catch(e){
    console.error('DO addTx failed', e);
  }
  if(!seen){
    await env.KV_CANDIDATES.put(seenKey, JSON.stringify({ tokenAddress, detectedAt: nowISO() }), { expirationTtl: 60*60*24*7 });
    try{
      const base = env.WORKER_BASE_URL || '';
      if(base) await fetch(`${base}/internal/security-checks`, { method:'POST', body: JSON.stringify({ tokenAddress }) });
    }catch(e){ console.warn('trigger security check failed', e); }
  }
  return new Response(JSON.stringify({ ok:true, seen: !!seen }), {status:200});
}

async function handleCronNewPairs(request, env){
  try{
    const res = await safeFetchWithBackoff('https://api.dexscreener.com/token-profiles/latest/v1');
    const data = res || {};
    const tokens = data.tokens || data.items || [];
    let added = 0;
    for(const t of tokens){
      const addr = safeKey(t.address || t.tokenAddress || (t.token && t.token.address) || t.contractAddress);
      if(!addr) continue;
      const seenKey = `seen:${addr}`;
      const exists = await env.KV_CANDIDATES.get(seenKey);
      if(!exists){
        await env.KV_CANDIDATES.put(seenKey, JSON.stringify({ tokenAddress: addr, detectedAt: nowISO(), source:'dexscreener' }), { expirationTtl: 60*60*24*7 });
        try{
          const base = env.WORKER_BASE_URL || '';
          if(base) await fetch(`${base}/internal/security-checks`, { method:'POST', body: JSON.stringify({ tokenAddress: addr }) });
        } catch(e){ console.warn('cron trigger security failed', e); }
        added++;
      }
    }
    return new Response(JSON.stringify({ok:true, added}), {status:200});
  }catch(e){
    console.error('cron newpairs error', e);
    return new Response('internal', {status:500});
  }
}

async function runSecurityChecksHandler(request, env){
  let body;
  try{ body = await request.json(); }catch(e){ return new Response('bad payload', {status:400}); }
  const tokenAddress = safeKey(body.tokenAddress);
  if(!tokenAddress) return new Response('no tokenAddress', {status:400});
  const breakerKey = `breaker:${tokenAddress}`;
  const breaker = await env.KV_CANDIDATES.get(breakerKey);
  if(breaker) {
    return new Response(JSON.stringify({ ok:false, reason:'circuit_open' }), { status:429 });
  }
  try{
    const abiUrl = `${ETHERSCAN_BASE}?module=contract&action=getabi&address=${tokenAddress}&apikey=${env.ETHERSCAN_API_KEY}`;
    let verified = false;
    try{
      const abiResp = await safeFetchWithBackoff(abiUrl, {}, 3, 400);
      if(abiResp && (abiResp.status === '1' || abiResp.result)) verified = true;
    }catch(e){ console.warn('abi fetch fail', e); }

    let liquidityUSD = 0;
    try{
      const dex = await safeFetchWithBackoff(`${DEXSCREENER_TOKEN_ENDPOINT}${tokenAddress}`);
      if(dex){
        if(dex.liquidityUSD) liquidityUSD = Number(dex.liquidityUSD);
        else if(Array.isArray(dex.pairs) && dex.pairs.length) liquidityUSD = Number(dex.pairs[0].liquidity?.usd || dex.pairs[0].liquidity?.usd_value || 0);
      }
    }catch(e){ console.warn('dex fetch fail', e); }

    let score = 1.0;
    const details = [];
    if(!verified){ score -= 0.6; details.push('not_verified'); }
    const cfg = await getConfig(env);
    const minLiq = Number(cfg.MIN_LIQUIDITY_USD || DEFAULT_MIN_LIQ);
    if(!liquidityUSD || liquidityUSD < minLiq){ score -= 0.2; details.push('low_liq'); }
    score = Math.max(0, Math.min(1, score));
    const result = { tokenAddress, securityScore: score, details, liquidityUSD, checkedAt: nowISO() };
    await env.KV_CANDIDATES.put(`sec:${tokenAddress}`, JSON.stringify(result), { expirationTtl: 60*60*24*7 });
    await triggerScoring({ tokenAddress, securityScore: score, liquidityUSD }, env);
    return new Response(JSON.stringify(result), {status:200});
  }catch(e){
    console.error('runSecurityChecksHandler error', e);
    await env.KV_CANDIDATES.put(breakerKey, JSON.stringify({ err: e.message }), { expirationTtl: 60 });
    return new Response('internal', {status:500});
  }
}

async function triggerScoring(payload, env){
  try{
    const id = env.DURABLE_RECENT.idFromName('recent-main');
    const obj = env.DURABLE_RECENT.get(id);
    const resp = await obj.fetch('https://do/countSmartBuys', { method: 'POST', body: JSON.stringify({ tokenAddress: payload.tokenAddress, windowMinutes: (await getConfig(env)).WINDOW_MINUTES || 10 }) });
    const countObj = await resp.json();
    const smartBuys = Number(countObj.count || 0);
    const cfg = await getConfig(env);
    const smartScore = computeSmartScore({ smartBuys, securityScore: payload.securityScore, liquidityUSD: payload.liquidityUSD, top5Share: 0, slippageScore: 0, socialScore: 0 }, cfg);
    const out = { tokenAddress: payload.tokenAddress, smartScore, securityScore: payload.securityScore, liquidityUSD: payload.liquidityUSD, computedAt: nowISO() };
    await env.KV_CANDIDATES.put(`score:${payload.tokenAddress}`, JSON.stringify(out), { expirationTtl: 60*60*24*7 });
    const alertedKey = `alerted:${payload.tokenAddress}`;
    const alertedRaw = await env.KV_CANDIDATES.get(alertedKey);
    const alerted = alertedRaw ? JSON.parse(alertedRaw) : null;
    const threshold = Number(cfg.ALERT_THRESHOLD || 80);
    const now = Date.now();
    let shouldAlert = false;
    if(out.smartScore >= threshold){
      if(!alerted) shouldAlert = true;
      else {
        const cooldownMs = (ALERT_COOLDOWN_MINUTES || 60) * 60 * 1000;
        const last = new Date(alerted.alertedAt).getTime();
        if(now - last > cooldownMs && out.smartScore > alerted.score + 10) shouldAlert = true;
      }
    }
    if(shouldAlert){
      await env.KV_CANDIDATES.put(alertedKey, JSON.stringify({ alertedAt: nowISO(), score: out.smartScore }), { expirationTtl: 60*60*24*7 });
      await sendTelegramAlert(out, env);
    }
    return out;
  }catch(e){
    console.error('triggerScoring error', e);
    return null;
  }
}

/* computeSmartScore: unchanged helper */
function computeSmartScore(d, cfg){
  const minLiq = Number(cfg.MIN_LIQUIDITY_USD || DEFAULT_MIN_LIQ);
  function norm(x,min,max){ if(isNaN(x)) return 0; if(max===min) return x>min?1:0; return Math.max(0, Math.min(1, (x-min)/(max-min))); }
  const weights = cfg.weights || { smartBuys:0.25, securityScore:0.3, liquidity:0.2, holderChange:0.1, slippage:0.05, social:0.1 };
  const sSmartBuys = norm(d.smartBuys || 0, 0, 10);
  const sLiquidity = norm(d.liquidityUSD || 0, minLiq, Math.max(minLiq,500000));
  const holderPositive = 1 - (d.top5Share || 0);
  const slippageScore = 1 - (d.slippageScore || 0);
  const socialScore = d.socialScore || 0;
  let score = (sSmartBuys * weights.smartBuys) + ((d.securityScore||0) * weights.securityScore) + (sLiquidity * weights.liquidity) + (holderPositive * weights.holderChange) + (slippageScore * weights.slippage) + (socialScore * weights.social);
  return Math.round(Math.max(0, Math.min(1, score))*100);
}

/* Telegram send - reads token from env or KV config */
function escapeTelegramMdV2(s){
  if(!s) return '';
  return s.toString().replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
async function sendTelegramAlert(payload, env){
  try{
    const cfg = await getConfig(env);
    const token = env.TELEGRAM_BOT_TOKEN || cfg.TELEGRAM_BOT_TOKEN;
    const chatId = cfg.TELEGRAM_CHAT_ID || env.TELEGRAM_CHAT_ID;
    if(!token || !chatId) { console.warn('telegram not configured'); return; }
    const msg = `*TokenHunter Alert*\nToken: \`${payload.tokenAddress}\`\nScore: *${payload.smartScore}*\nLiquidity: ${payload.liquidityUSD}\nSecurity: ${payload.securityScore}\nLink: https://dexscreener.com/ethereum/${payload.tokenAddress}`;
    const body = { chat_id: chatId, text: escapeTelegramMdV2(msg), parse_mode: 'MarkdownV2', disable_web_page_preview: true };
    await safeFetchWithBackoff(TELEGRAM_API_SEND(token), { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) }, 3, 500);
  }catch(e){ console.error('sendTelegramAlert error', e); }
}
