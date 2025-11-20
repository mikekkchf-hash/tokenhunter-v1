// scripts/backtest.js
// Usage: node scripts/backtest.js tests/mock-data/sample_tokens.json
const fs = require('fs');
const path = require('path');
const { computeSmartScore } = require('../github/smartscore');

async function run(filePath){
  const full = path.resolve(filePath);
  const raw = fs.readFileSync(full, 'utf8');
  const arr = JSON.parse(raw);
  const cfg = require('../worker/sample_config.json');
  const out = arr.map(item => {
    const score = computeSmartScore(item.metrics || {}, cfg);
    return { token: item.token, detectedAt: item.detectedAt, score, metrics: item.metrics };
  });
  console.log(JSON.stringify(out, null, 2));
}

if(require.main === module){
  const file = process.argv[2] || 'tests/mock-data/sample_tokens.json';
  run(file).catch(e => { console.error(e); process.exit(1); });
}
