# معماری کلی — خلاصه

Edge:
- Cloudflare Workers: API gateway، light processing، Telegram dispatch
State:
- Durable Objects: RecentTxStore (windowed tx storage)
- KV: KV_CANDIDATES (tokens, config, scores, alerts)
Batch/Heavy:
- GitHub Actions: calibrator، news-scraper، backtests
Optional later:
- microservices (Docker): receipt decoder, indexer, Redis, Postgres

Patternهای مهم:
- dedupe early (KV seen:)
- safeFetchBackoff + circuit-breaker
- persistence (alerts + history)
- nightly calibrator برای wallet pool
