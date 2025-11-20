// worker/handlers/sentiment.js
// ساده: جمع‌آوری داده‌های عمومی: fear&greed (coinmarketcap API نیازمند key) یا fallback از توییتر/RSS summary.
// این نسخه PoC از RSS + simple keyword counting استفاده می‌کند.

import { safeFetchWithBackoff } from '../utils/fetch.js';
import { logger } from '../utils/logger.js';

// input: array of RSS feed urls or news objects
export async function analyzeSentiment({ feeds = [], env } = {}) {
  // اگر feeds خالی است، چند RSS عمومی اضافه کن (user باید بروز کند)
  if (!feeds || feeds.length === 0) feeds = [ 'https://cointelegraph.com/rss', 'https://www.coindesk.com/arc/outboundfeeds/rss/'];
  const combinedText = [];
  for (const f of feeds) {
    try {
      const res = await safeFetchWithBackoff(f, {}, 2, 300);
      // ساده: اگر XML برگردد، strip tags و push متن
      if (typeof res === 'string') {
        const clean = res.replace(/<\/?[^>]+(>|$)/g, ' ');
        combinedText.push(clean.slice(0, 5000));
      } else if (res && res.items) {
        for (const it of res.items.slice(0, 5)) combinedText.push((it.title || '') + ' ' + (it.description || ''));
      }
    } catch (e) { logger('debug','rss fetch fail', f, e.message); }
  }
  const text = combinedText.join(' ').toLowerCase();
  const positiveWords = ['bull', 'rally', 'surge', 'pump', 'moon', 'outperform', 'breakout', 'bullish','صعود','افزایش'];
  const negativeWords = ['dump','crash','drop','selloff','panic','bear','نزول','ریزش','سقوط'];
  let score = 0;
  for (const p of positiveWords) score += (text.split(p).length - 1);
  for (const n of negativeWords) score -= (text.split(n).length - 1);
  // normalize to -1..1
  const norm = Math.tanh(score / 10);
  return { sentimentScore: norm, rawScore: score, summary: norm > 0 ? 'positive' : (norm < 0 ? 'negative' : 'neutral') };
}
