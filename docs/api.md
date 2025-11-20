# API (Worker endpoints)

- GET /health
  returns: { ok:true, ts }

- POST /webhook/infura-tx
  body: { tx: { hash, from, to, timestamp, tokenAddress (optional) } }

- POST /cron/newpairs
  trigger DexScreener poll (cron or manual)

- POST /internal/security-checks
  body: { tokenAddress } -- runs light on-chain checks & scoring

- GET /admin/config
  returns current config from KV (consider protecting in production)
