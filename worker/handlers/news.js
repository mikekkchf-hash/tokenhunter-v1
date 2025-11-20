// worker/handlers/news.js
// جمع‌آوری اخبار از RSS و بازخورد به Worker (برای پردازش AI یا ذخیره)
// این PoC فقط RSS خوانی و ارسال خلاصه ساده است.

import { safeFetchWithBackoff } from '../utils/fetch.js';
import { logger } from '../utils/logger.js';

export async function fetchNewsAndParse({ env, feeds = [] } = {}) {
  if (!feeds || feeds.length === 0) feeds = [ 'https://cointelegraph.com/rss', 'https://www.coindesk.com/arc/outboundfeeds/rss/' ];
  const out = [];
  for (const f of feeds) {
    try{
      const res = await safeFetchWithBackoff(f, {}, 2, 300);
      if (typeof res === 'string') {
        // naive parse: split by <item>
        const items = res.split(/<item\b/).slice(1).slice(0,5);
        for (const it of items) {
          const title = (it.match(/<title>([\s\S]*?)<\/title>/i) || [null, ''])[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
          const desc  = (it.match(/<description>([\s\S]*?)<\/description>/i) || [null, ''])[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
          out.push({ title, desc, feed: f });
        }
      } else if (res && res.items) {
        for (const it of res.items.slice(0,5)) out.push({ title: it.title, desc: it.description, feed: f });
      }
    }catch(e){ logger('debug','news fetch fail', f, e.message); }
  }
  // store short-term in KV for other modules to read
  try{ await env.KV_CANDIDATES.put('recent_news', JSON.stringify(out), { expirationTtl: 60*60*6 }); } catch(e){ logger('warn','kv put failed', e); }
  return { ok: true, count: out.length, items: out.slice(0,10) };
}
