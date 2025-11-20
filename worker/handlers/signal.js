// worker/handlers/signal.js
// ترکیب نتایج مختلف به پیامی که برای تلگرام ارسال شود.
// ورودی‌ها: marketAnalysis object (از analyzeMarket)، security/score object, sentiment, trending hints
// خروجی: compact payload برای ارسال

export async function composeSignal({ marketAnalysis, security, sentiment, trending } = {}) {
  const parts = [];
  parts.push(`بازار: ${marketAnalysis.symbol} — فاز: ${marketAnalysis.regime} (اعتماد: ${marketAnalysis.metrics.confidence}%)`);
  parts.push(`قیمت: ${marketAnalysis.metrics.lastPrice} — نقدینگی تخمینی: ${Math.round(marketAnalysis.metrics.estLiquidity||0)}`);
  parts.push(`نکته: ${marketAnalysis.advice}`);
  if (security) parts.push(`امنیت قرارداد: ${Math.round((security.securityScore||0)*100)}% (${(security.details||[]).join(',') || 'no flags'})`);
  if (sentiment) parts.push(`احساسات بازار: ${sentiment.summary} (score ${Number(sentiment.sentimentScore).toFixed(2)})`);
  if (trending && trending.length) parts.push(`توکن‌های ترند اخیر: ${trending.slice(0,3).map(t=>t.tokenAddress).join(', ')}`);
  const text = parts.join('\n\n');
  return { text, compact: text.slice(0, 4000) };
}
