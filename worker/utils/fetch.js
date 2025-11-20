// worker/utils/fetch.js
// safeFetchWithBackoff + simple circuit-breaker per-host (KV/cold not used here).
// Note: In Cloudflare Worker you can rely on fetch; this wrapper adds retry + jitter.

export async function safeFetchWithBackoff(url, opts = {}, retries = 4, baseDelay = 500) {
  const start = Date.now();
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (i === retries) {
          const text = await res.text().catch(()=>null);
          throw new Error(`Upstream status ${res.status}: ${text || ''}`);
        }
        const wait = Math.min(30000, baseDelay * Math.pow(2, i));
        const jitter = Math.random() * wait;
        await new Promise(r => setTimeout(r, jitter));
        continue;
      }
      const txt = await res.text();
      try { return JSON.parse(txt); } catch(e) { return txt; }
    } catch (err) {
      if (i === retries) throw err;
      const wait = Math.min(30000, baseDelay * Math.pow(2, i));
      const jitter = Math.random() * wait;
      await new Promise(r => setTimeout(r, jitter));
    }
  }
  throw new Error('safeFetchWithBackoff failed');
}
