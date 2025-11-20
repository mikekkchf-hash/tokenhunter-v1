// scripts/seed.js (ES Module ready)
// Usage:
// set CLOUDFLARE_API_TOKEN=...
// set CLOUDFLARE_ACCOUNT_ID=...
// set CLOUDFLARE_KV_NAMESPACE_ID=...
// node scripts/seed.js

import fetch from 'node-fetch';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const KV_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;

if (!TOKEN || !ACCOUNT || !KV_ID) {
  console.error('Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_KV_NAMESPACE_ID');
  process.exit(1);
}

async function put(key, value) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces/${KV_ID}/values/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/octet-stream'
    },
    body: JSON.stringify(value)
  });
  const data = await res.json();
  console.log('put', key, data.success);
}

(async () => {
  await put('SYSTEM_CONFIG', { MIN_LIQUIDITY_USD: 30000, ALERT_THRESHOLD: 80, REQUIRED_WALLETS: 3 });
  await put('wallets_seed', ['0x1111111111111111111111111111111111111111']);
  console.log('seed complete');
})();
