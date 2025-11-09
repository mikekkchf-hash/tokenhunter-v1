// .github/scripts/analyzer.js
// Simple practical analyzer for beginners
require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || '';
const COINGECKO_API = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';

// helpers
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// load profitable tokens CSV
function loadProfitableTokens() {
  const filePath = path.join(__dirname, '..', '..', 'data', 'profitable_tokens.csv');
  if (!fs.existsSync(filePath)) {
    console.log(`File ${filePath} not found. Create it from scanner first.`);
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const lines = raw.split('\n');
  const header = lines.shift();
  return lines.map(line => {
    const parts = line.split(',').map(s => s.trim());
    return {
      token_symbol: parts[0],
      chain: parts[1],
      contract_address: parts[2],
      roi_30d_pct: parseFloat(parts[3] || '0'),
      roi_90d_pct: parseFloat(parts[4] || '0'),
      market_cap_usd: parseFloat(parts[5] || '0'),
      last_checked_iso: parts[6] || '',
      source: parts[7] || 'unknown'
    };
  });
}

// Etherscan token txs (paginated)
async function etherscanTokenTxs(contract, startblock=0, page=1, offset=1000) {
  const url = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${contract}&startblock=${startblock}&endblock=99999999&page=${page}&offset=${offset}&sort=asc&apikey=${ETHERSCAN_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json || json.status !== '1') {
    // Etherscan returns status '0' with message if no txs or error
    // return empty array if no txs
    // console.warn('Etherscan:', json);
    return [];
  }
  return json.result || [];
}

// get coinGecko token id by contract (ethereum)
async function getCoinGeckoIdByContract(contract) {
  try {
    const url = `${COINGECKO_API}/coins/ethereum/contract/${contract}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('no metadata');
    const meta = await r.json();
    return meta.id; // e.g., 'pepe'
  } catch (e) {
    console.warn('CoinGecko contract->id fail:', e.message);
    return null;
  }
}

// fetch price series (cached) for token id
async function fetchPriceSeries(id, fromSec, toSec) {
  try {
    const url = `${COINGECKO_API}/coins/${id}/market_chart/range?vs_currency=usd&from=${fromSec}&to=${toSec}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('price range fail');
    const data = await r.json();
    // data.prices = [[ms, price], ...]
    return data.prices || [];
  } catch (e) {
    console.warn('price series fetch error:', e.message);
    return [];
  }
}

// find nearest price from time (sec)
function findNearestPrice(pricesArray, tsSec) {
  if (!pricesArray || pricesArray.length === 0) return null;
  let best = pricesArray[0];
  let bestDiff = Math.abs(best[0]/1000 - tsSec);
  for (const p of pricesArray) {
    const d = Math.abs(p[0]/1000 - tsSec);
    if (d < bestDiff) { best = p; bestDiff = d; }
  }
  return best[1];
}

// fetch unique wallets that interacted with token (simple, paginated)
async function fetchUniqueWalletsForToken(contract, startblock=0, maxPages=5) {
  const wallets = new Set();
  for (let page = 1; page <= maxPages; page++) {
    // small delay to avoid rate limits
    await sleep(300);
    const txs = await etherscanTokenTxs(contract, startblock, page, 1000);
    if (!txs || txs.length === 0) break;
    for (const tx of txs) {
      if (tx.from) wallets.add(tx.from.toLowerCase());
      if (tx.to) wallets.add(tx.to.toLowerCase());
    }
    if (txs.length < 1000) break;
  }
  return Array.from(wallets).filter(a => a && a !== '0x0000000000000000000000000000000000000000');
}

// fetch tokentx filtered for wallet+contract (asc)
async function fetchWalletTokenTxs(wallet, contract) {
  // etherscan tokentx supports address & contractaddress filter
  const url = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${contract}&address=${wallet}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_KEY}`;
  await sleep(200);
  const r = await fetch(url);
  const j = await r.json();
  if (!j || j.status !== '1') return [];
  return j.result || [];
}

// calculate PnL with historical prices (USD)
async function calculateWalletPnLAccurate(wallet, contract, tokenMetaCache) {
  try {
    const txs = await fetchWalletTokenTxs(wallet, contract);
    if (!txs || txs.length === 0) return { grossPnL: 0, buysUSD: 0, sellsUSD: 0, txCount: 0, lastActivity: null };

    // determine time window for price series
    const firstTs = Math.floor(parseInt(txs[0].timeStamp,10));
    const lastTs = Math.floor(parseInt(txs[txs.length-1].timeStamp,10));
    // get coinGecko id cached or fetch
    let cgId = tokenMetaCache[contract] && tokenMetaCache[contract].cgId;
    if (!cgId) {
      cgId = await getCoinGeckoIdByContract(contract);
      tokenMetaCache[contract] = tokenMetaCache[contract] || {};
      tokenMetaCache[contract].cgId = cgId;
    }
    let priceSeries = tokenMetaCache[contract].priceSeries;
    if (!priceSeries || tokenMetaCache[contract].priceSeriesRange !== `${firstTs}_${lastTs}`) {
      priceSeries = await fetchPriceSeries(cgId, Math.max(0, firstTs-3600), lastTs+3600);
      tokenMetaCache[contract].priceSeries = priceSeries;
      tokenMetaCache[contract].priceSeriesRange = `${firstTs}_${lastTs}`;
      // light cache delay
      await sleep(200);
    }

    let buysUSD = 0, sellsUSD = 0;
    for (const tx of txs) {
      const qty = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal || '18',10));
      const ts = Math.floor(parseInt(tx.timeStamp,10));
      const price = findNearestPrice(priceSeries, ts);
      if (!price) continue; // skip if no price
      const usd = qty * price;
      if (tx.to && tx.to.toLowerCase() === wallet.toLowerCase()) buysUSD += usd;
      if (tx.from && tx.from.toLowerCase() === wallet.toLowerCase()) sellsUSD += usd;
    }

    const lastActivity = new Date(parseInt(txs[txs.length-1].timeStamp,10)*1000).toISOString();
    const grossPnL = sellsUSD - buysUSD;
    return { grossPnL, buysUSD, sellsUSD, txCount: txs.length, lastActivity };

  } catch (e) {
    console.error('calculateWalletPnLAccurate error', e.message);
    return { grossPnL: 0, buysUSD: 0, sellsUSD: 0, txCount: 0, lastActivity: null };
  }
}

// main run
async function runAnalyzer() {
  console.log('🧮 Analyzer v2 starting...');
  if (!ETHERSCAN_KEY) { console.error('Set ETHERSCAN_API_KEY in .env first'); return; }
  ensureDir(path.join(__dirname,'..','..','data'));
  const tokens = loadProfitableTokens();
  if (!tokens || tokens.length === 0) { console.log('No tokens to analyze'); return; }

  // load last_seen per token (for later incremental)
  const lastSeenPath = path.join(__dirname,'..','..','data','last_seen_analyzer.json');
  let lastSeen = {};
  if (fs.existsSync(lastSeenPath)) lastSeen = JSON.parse(fs.readFileSync(lastSeenPath,'utf8'));

  const tokenMetaCache = {};
  const walletMetrics = {}; // wallet -> aggregated metrics

  // limit tokens for quick test (remove or increase later)
  const tokensToProcess = tokens.slice(0, 5);

  for (const token of tokensToProcess) {
    console.log('Token:', token.token_symbol, token.contract_address);
    const startblock = lastSeen[token.contract_address] || 0;
    // get wallets (simple paginated, limit pages to avoid quota)
    const wallets = await fetchUniqueWalletsForToken(token.contract_address, startblock, 3);
    console.log(`Found ${wallets.length} wallets (sample limit)`);
    for (const w of wallets) {
      // skip contracts / exchanges superficially (simple filter)
      if (w.endsWith('0000')) continue;
      const pnlObj = await calculateWalletPnLAccurate(w, token.contract_address, tokenMetaCache);
      if (!walletMetrics[w]) walletMetrics[w] = { address: w, chain: token.chain, netFlowUSD:0, txs:0, lastActivity: null, tokensSeen: new Set() };
      walletMetrics[w].netFlowUSD += pnlObj.grossPnL;
      walletMetrics[w].txs += pnlObj.txCount;
      if (pnlObj.lastActivity) walletMetrics[w].lastActivity = pnlObj.lastActivity;
      walletMetrics[w].tokensSeen.add(token.token_symbol);
    }
    // update last seen block naïvely (could be real latest block) - for now set to 0 to re-scan next time
    lastSeen[token.contract_address] = startblock; // TODO: replace with actual latest scanned block
  }

  // convert metrics -> array and score simple
  const walletRows = Object.values(walletMetrics).map(w => {
    const avgROI = w.netFlowUSD === 0 ? 0 : (w.netFlowUSD / Math.max(1, w.txs));
    const score = Math.min(10, Math.max(0, Math.round((Math.tanh(w.netFlowUSD/1000) + Math.tanh(avgROI/100))/2 * 10)));
    return { address: w.address, chain: w.chain, netFlowUSD: w.netFlowUSD, avgROI, score, lastActivity: w.lastActivity || new Date().toISOString(), tokensHeld: Array.from(w.tokensSeen).join('|') };
  });

  // sort and take top N
  walletRows.sort((a,b) => b.netFlowUSD - a.netFlowUSD);
  const top = walletRows.slice(0, 20);

  // write CSV
  const outPath = path.join(__dirname,'..','..','data','smart_wallets.csv');
  const header = 'wallet_address,chain,net_flow_usd,avg_roi_pct,score,last_activity_iso,tokens_held';
  const lines = top.map(r => `${r.address},${r.chain},${r.netFlowUSD.toFixed(2)},${(r.avgROI).toFixed(2)},${r.score},${r.lastActivity},${r.tokensHeld}`);
  fs.writeFileSync(outPath, [header, ...lines].join('\n'),'utf8');
  console.log('✅ smart_wallets.csv written with', top.length, 'rows');

  // persist lastSeen
  fs.writeFileSync(lastSeenPath, JSON.stringify(lastSeen, null, 2),'utf8');
  console.log('✅ last_seen_analyzer.json updated');

  console.log('Analyzer finished.');
}

if (require.main === module) {
  runAnalyzer().catch(e => console.error(e));
}

module.exports = { runAnalyzer };
