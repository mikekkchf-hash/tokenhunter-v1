// worker/router.js
// ساده، قابل فراخوانی از index.js
// مسیرها را به handlerهای مجزا هدایت می‌کند.
// انتظارداریم env شامل bindings لازم باشد (DURABLE_RECENT, KV_CANDIDATES, KV_CONFIG, WORKER_BASE_URL, TELEGRAM_BOT_TOKEN, ...)

import { analyzeMarket } from './handlers/market.js';
import { handleTrending } from './handlers/trending.js';
import { runLiquidityChecks } from './handlers/liquidity.js';
import { analyzeSentiment } from './handlers/sentiment.js';
import { fetchNewsAndParse } from './handlers/news.js';
import { composeSignal } from './handlers/signal.js';
import { logger } from './utils/logger.js';

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  try {
    if (request.method === 'GET' && path === '/health') {
      return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), { status: 200 });
    }

    if (request.method === 'POST' && path === '/analyze/market') {
      const body = await safeJson(request);
      if (!body?.symbol) return new Response(JSON.stringify({ error: 'symbol required' }), { status: 400 });
      const res = await analyzeMarket({
        symbol: body.symbol,
        providerUrlTemplate: env.MARKET_PROVIDER_TEMPLATE,
        apiKey: env.MARKET_API_KEY,
        cfgOverrides: body.cfg || {}
      });
      return new Response(JSON.stringify(res), { status: 200 });
    }

    if (request.method === 'POST' && path === '/cron/trending') {
      const res = await handleTrending({ env });
      return new Response(JSON.stringify(res), { status: 200 });
    }

    if (request.method === 'POST' && path === '/internal/run-liquidity') {
      const body = await safeJson(request);
      if (!body?.tokenAddress) return new Response(JSON.stringify({ error: 'tokenAddress required' }), { status: 400 });
      const out = await runLiquidityChecks(body.tokenAddress, env);
      return new Response(JSON.stringify(out), { status: 200 });
    }

    if (request.method === 'POST' && path === '/cron/news') {
      const out = await fetchNewsAndParse({ env });
      return new Response(JSON.stringify(out), { status: 200 });
    }

    if (request.method === 'POST' && path === '/telegram/webhook') {
      // delegate to telegram webhook file (import dynamic to avoid cycles)
      const mod = await import('../telegram/webhook.js');
      return await mod.handleTelegramWebhook(request, env);
    }

    // fallback 404
    return new Response('not-found', { status: 404 });
  } catch (e) {
    logger('error', 'router error', e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500 });
  }
}

async function safeJson(req) {
  try { return await req.json(); } catch(e){ return null; }
}
