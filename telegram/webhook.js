// telegram/webhook.js
// minimal webhook handler for Telegram commands: /status /signal
import { logger } from '../worker/utils/logger.js';
import { composeSignal } from '../worker/handlers/signal.js';

export async function handleTelegramWebhook(request, env) {
  try {
    const body = await request.json().catch(()=>null);
    if (!body) return new Response('ok', { status: 200 });
    const message = body.message || body.edited_message;
    if (!message) return new Response('no message', { status: 200 });

    const chatId = message.chat && message.chat.id;
    const text = (message.text || '').trim();

    if (!text) return new Response('no text', { status: 200 });

    if (text.startsWith('/status')) {
      const payload = { chat_id: chatId, text: `TokenHunter status OK\nts: ${new Date().toISOString()}` };
      await sendTelegram(env, payload);
      return new Response('ok', { status: 200 });
    }

    if (text.startsWith('/signal')) {
      // format: /signal SYMBOL
      const parts = text.split(/\s+/);
      const symbol = parts[1] || (env.DEFAULT_SYMBOL || 'BTCUSDT');
      // call market analyze endpoint (internal)
      const resp = await fetch(`${env.WORKER_BASE_URL}/analyze/market`, { method: 'POST', body: JSON.stringify({ symbol }), headers: { 'Content-Type':'application/json' } });
      const analysis = await resp.json().catch(()=>null);
      const sec = await fetch(`${env.WORKER_BASE_URL}/internal/security-checks`, { method:'POST', body: JSON.stringify({ tokenAddress: symbol }) }).then(r=>r.json()).catch(()=>null);
      const sentiment = await fetch(`${env.WORKER_BASE_URL}/internal/sentiment`, { method:'POST', body: JSON.stringify({}) }).then(r=>r.json()).catch(()=>null);
      const sig = await composeSignal({ marketAnalysis: analysis, security: sec, sentiment, trending: [] });
      await sendTelegram(env, { chat_id: chatId, text: sig.text, parse_mode: 'MarkdownV2' });
      return new Response('ok', { status:200 });
    }

    // unknown command -> ignore
    return new Response('ignored', { status: 200 });
  } catch (e) {
    logger('error', 'telegram webhook error', e);
    return new Response('internal', { status: 500 });
  }
}

async function sendTelegram(env, body) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) { logger('warn','telegram token missing'); return; }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }).catch(e=>logger('warn','tg send fail', e.message));
}
