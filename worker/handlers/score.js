// worker/handlers/score.js
// computeSmartScore function standalone (reusable server-side & in calibrator)
export function computeSmartScore(d, cfg = {}) {
  const DEFAULT_MIN_LIQ = 30000;
  const weightsDefault = { smartBuys:0.25, securityScore:0.3, liquidity:0.2, holderChange:0.1, slippage:0.05, social:0.1 };
  const weights = cfg.weights || weightsDefault;
  const minLiq = Number(cfg.MIN_LIQUIDITY_USD || DEFAULT_MIN_LIQ);

  function norm(x, min, max) { if (isNaN(x)) return 0; if (max === min) return x > min ? 1 : 0; return Math.max(0, Math.min(1, (x - min) / (max - min))); }

  const sSmartBuys = norm(d.smartBuys || 0, 0, 10);
  const sLiquidity = norm(d.liquidityUSD || 0, minLiq, Math.max(minLiq, 500000));
  const holderPositive = 1 - (d.top5Share || 0);
  const slippageScore = 1 - (d.slippageScore || 0);
  const socialScore = d.socialScore || 0;

  let score = (sSmartBuys * weights.smartBuys) + ((d.securityScore || 0) * weights.securityScore) + (sLiquidity * weights.liquidity) + (holderPositive * weights.holderChange) + (slippageScore * weights.slippage) + (socialScore * weights.social);
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
