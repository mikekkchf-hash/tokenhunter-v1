// tests/unit/computeSmartScore.test.js
const assert = require('assert');
const { computeSmartScore } = require('../../github/smartscore');

(function main(){
  const cfg = { MIN_LIQUIDITY_USD:30000, weights: { smartBuys:0.25, securityScore:0.3, liquidity:0.2, holderChange:0.1, slippage:0.05, social:0.1 } };
  const d = { smartBuys: 5, securityScore: 0.8, liquidityUSD: 100000, top5Share: 0.2, slippageScore:0.05, socialScore:0.2 };
  const score = computeSmartScore(d, cfg);
  console.log('score=', score);
  assert(typeof score === 'number' && score >= 0 && score <= 100, 'score must be 0-100');
  console.log('unit test passed');
})();
