// worker/handlers/liquidity.js
// ساده: برآورد لیکوییدیتی با استفاده از DexScreener یا fallback
import { safeFetchWithBackoff } from '../utils/fetch.js';
import { logger } from '../utils/logger.js';

const DEX_TOKEN_ENDPOINT = 'https://api.dexscreener.com/latest/dex/tokens/';

export async function runLiquidityChecks(tokenAddress, env) {
  if (!tokenAddress) throw new Error('tokenAddress required');
  try {
    const dex = await safeFetchWithBackoff(`${DEX_TOKEN_ENDPOINT}${tokenAddress}`, {}, 3, 400);
    let liquidityUSD = 0;
    if (dex) {
      // try common shapes
      if (dex.liquidityUSD) liquidityUSD = Number(dex.liquidityUSD);
      else if (Array.isArray(dex.pairs) && dex.pairs.length) liquidityUSD = Number(dex.pairs[0].liquidity?.usd || dex.pairs[0].liquidity?.usd_value || 0);
    }
    // store in KV short-term
    await env.KV_CANDIDATES.put(`liq:${tokenAddress}`, JSON.stringify({ liquidityUSD, checkedAt: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 });
    return { tokenAddress, liquidityUSD };
  } catch (e) {
    logger('warn', 'runLiquidityChecks error', e);
    return { tokenAddress, error: e.message };
  }
}
