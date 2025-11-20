// worker/handlers/trending.js
// poll DexScreener / other endpoints for new/trending tokens and write to KV_CANDIDATES (dedupe by early KV).
// env must provide KV_CANDIDATES and optionally DEXSCREENER_BASE

import { safeFetchWithBackoff } from '../utils/fetch.js';
import { logger } from '../utils/logger.js';

const DEFAULT_DEX_BASE = 'https://api.dexscreener.com/token-profiles/latest/v1';

export async function handleTrending({ env, limit = 100 } = {}) {
  const DEX_BASE = env.DEXSCREENER_BASE || DEFAULT_DEX_BASE;
  try {
    const res = await safeFetchWithBackoff(DEX_BASE, {}, 3, 400);
    const tokens = (res && (res.tokens || res.items || res.data)) || [];
    let added = 0;
    for (const t of tokens.slice(0, limit)) {
      const addr = (t.address || t.tokenAddress || (t.token && t.token.address) || t.contractAddress || '').toLowerCase();
      if (!addr) continue;
      const seenKey = `seen:${addr}`;
      const exists = await env.KV_CANDIDATES.get(seenKey);
      if (!exists) {
        const item = { tokenAddress: addr, detectedAt: new Date().toISOString(), source: 'dexscreener' };
        await env.KV_CANDIDATES.put(seenKey, JSON.stringify(item), { expirationTtl: 60 * 60 * 24 * 7 });
        added++;
        // best-effort: enqueue light security check (call internal endpoint)
        try { await fetch(`${env.WORKER_BASE_URL}/internal/security-checks`, { method: 'POST', body: JSON.stringify({ tokenAddress: addr }) }); } catch(e){ /* ignore */ }
      }
    }
    return { ok: true, added };
  } catch (e) {
    logger('warn', 'handleTrending failed', e);
    return { ok: false, error: e.message };
  }
}
