// worker/handlers/market.js
// Market handler: دریافت قیمت/حجم، محاسبهٔ اندیکاتورها، تشخیص regime (Bull/Bear/Chop/Volatile)
// Export: analyzeMarket(params) -> { regime, metrics, rawIndicators }
// Designed for Cloudflare Worker environment or Node (ESM-compatible).
//
// پیش‌نیاز: وجود ماژول‌های کمکی در ../utils (safeFetch, math, normalize)
// Config از KV_CONFIG یا ENV خوانده شود (برای PoC می‌توان از پارامترهای تابع استفاده کرد)

import { safeFetchWithBackoff } from '../utils/fetch.js';
import { sma, ema, rsi, atr, momentum } from '../utils/math.js';
import { normalizeOHLCV } from '../utils/normalize.js';

// Default config (قابل override از param.cfg)
const DEFAULT_CFG = {
  lookbackMinutes: 60 * 24,   // برای دیتای تاریخی (مثلاً 1440 دقیقه = 1 روز در granularity پایین)
  granularityMinutes: 5,      // resolution (5m candles)
  smaPeriods: [20, 50],
  emaPeriods: [9, 21],
  rsiPeriod: 14,
  atrPeriod: 14,
  volatilityThreshold: 0.025, // 2.5% (نمونه)
  liquidityMinUsd: 10000,     // نمونه
  chopRsiLow: 45,
  chopRsiHigh: 55,
};

// helper: fetch OHLCV from a market-data provider
// providerUrl template must accept symbol, interval, limit (this is configurable).
async function fetchOHLCV(symbol, intervalMinutes, limit, providerUrlTemplate, apiKey) {
  // providerUrlTemplate example:
  // 'https://api.example.com/ohlcv?symbol={symbol}&interval={interval}&limit={limit}&apikey={key}'
  if (!providerUrlTemplate) throw new Error('providerUrlTemplate required');
  const url = providerUrlTemplate
    .replace('{symbol}', encodeURIComponent(symbol))
    .replace('{interval}', String(intervalMinutes))
    .replace('{limit}', String(limit || 500))
    .replace('{key}', apiKey || '');
  const res = await safeFetchWithBackoff(url, {}, 4, 400);
  // Expect standard structure: [{t, o, h, l, c, v}, ...] newest last
  // normalize best-effort:
  if (!Array.isArray(res)) {
    // try common wrappers {data: [...]}
    if (res && res.data && Array.isArray(res.data)) return res.data;
    throw new Error('unexpected OHLCV payload from provider');
  }
  return res;
}

// main exported function
export async function analyzeMarket({
  symbol,
  providerUrlTemplate,
  apiKey = '',
  granularityMinutes,
  lookbackMinutes,
  cfgOverrides = {}
} = {}) {
  if (!symbol) throw new Error('symbol required');
  const cfg = { ...DEFAULT_CFG, ...(cfgOverrides || {}) };
  granularityMinutes = granularityMinutes || cfg.granularityMinutes;
  lookbackMinutes = lookbackMinutes || cfg.lookbackMinutes;
  // calculate number of candles
  const limit = Math.ceil(lookbackMinutes / granularityMinutes);

  // fetch OHLCV
  const raw = await fetchOHLCV(symbol, granularityMinutes, limit, providerUrlTemplate, apiKey);
  const ohlcv = normalizeOHLCV(raw); // ensures fields {t,o,h,l,c,v} and sorted oldest->newest

  // basic validation
  if (!ohlcv || ohlcv.length < Math.max(...(cfg.smaPeriods.concat(cfg.emaPeriods)) , cfg.rsiPeriod, cfg.atrPeriod) + 5) {
    throw new Error('not enough OHLCV data to compute indicators');
  }

  // compute indicators
  const closes = ohlcv.map(d => Number(d.c));
  const highs = ohlcv.map(d => Number(d.h));
  const lows = ohlcv.map(d => Number(d.l));
  const vols  = ohlcv.map(d => Number(d.v));

  const indicators = {};

  // SMA / EMA sets
  indicators.sma = {};
  for (const p of cfg.smaPeriods) indicators.sma[p] = sma(closes, p);

  indicators.ema = {};
  for (const p of cfg.emaPeriods) indicators.ema[p] = ema(closes, p);

  // RSI
  indicators.rsi = rsi(closes, cfg.rsiPeriod);

  // ATR
  indicators.atr = atr(highs, lows, closes, cfg.atrPeriod);

  // momentum (last vs n-ago)
  indicators.momentum = momentum(closes, 10); // 10-candle momentum

  // basic volatility (std of returns)
  const returns = [];
  for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i-1]) / closes[i-1]);
  const meanR = returns.reduce((a,b)=>a+b,0)/returns.length;
  const variance = returns.reduce((a,b)=>a + Math.pow(b-meanR,2), 0) / Math.max(1, returns.length-1);
  const volStd = Math.sqrt(variance); // e.g., 0.02 = 2%

  // liquidity estimate: use last candle volume * price -> naive USD liquidity (provider dependent)
  const lastPrice = closes[closes.length-1];
  const estLiquidity = lastPrice * vols[vols.length-1];

  // regime detection rules (hysteresis-friendly)
  let regime = 'unknown';
  // strong bull: short ema above long ema and momentum positive and rsi > 60
  const latestEmaShort = indicators.ema[cfg.emaPeriods[0]].slice(-1)[0];
  const latestEmaLong  = indicators.ema[cfg.emaPeriods[1]].slice(-1)[0];
  const latestRsi = indicators.rsi.slice(-1)[0];
  const lastMomentum = indicators.momentum;

  // apply thresholds
  if (volStd > cfg.volatilityThreshold) {
    regime = 'volatile';
  } else if (latestEmaShort > latestEmaLong && lastMomentum > 0 && latestRsi > 60) {
    regime = 'bull';
  } else if (latestEmaShort < latestEmaLong && lastMomentum < 0 && latestRsi < 40) {
    regime = 'bear';
  } else if (latestRsi >= cfg.chopRsiLow && latestRsi <= cfg.chopRsiHigh) {
    regime = 'chop';
  } else {
    // fallback: compare price vs sma(50)
    const latestSMA50 = indicators.sma[cfg.smaPeriods[1]].slice(-1)[0];
    if (lastPrice > latestSMA50) regime = 'bull-weak';
    else regime = 'bear-weak';
  }

  // confidence scoring: combine signals (0..1)
  let conf = 0;
  // ema alignment
  const emaAlign = Math.sign(latestEmaShort - latestEmaLong); // +1 bull, -1 bear
  conf += (Math.abs(latestEmaShort - latestEmaLong) / Math.max(1e-8, latestEmaLong)) * 0.3;
  // momentum normalized
  conf += Math.tanh(Math.abs(lastMomentum)) * 0.25;
  // rsi distance from 50
  conf += (Math.abs(latestRsi - 50) / 50) * 0.25;
  // liquidity bonus (cap)
  conf += Math.min(1, estLiquidity / Math.max(1, cfg.liquidityMinUsd)) * 0.2;
  conf = Math.max(0, Math.min(1, conf));

  const metrics = {
    lastPrice,
    estLiquidity,
    volStd,
    latestRsi,
    latestEmaShort,
    latestEmaLong,
    lastMomentum: lastMomentum,
    confidence: Math.round(conf*100)
  };

  // construct human-friendly advice templates
  let advice = '';
  if (regime === 'bull') advice = 'بازار در فاز صعودی است — میتوان روی فرصت‌های با ریسک متوسط-بالا بررسی کرد. رعایت حد ضرر ضروری است.';
  else if (regime === 'bear') advice = 'بازار نزولی است — کاهش ریسک، بررسی فرصت‌های شورت و استراتژی هج پیشنهاد می‌شود.';
  else if (regime === 'volatile') advice = 'بازار نوسان‌دار است — از اهرم سنگین پرهیز کن؛ تایید چندین منبع لازم است.';
  else if (regime === 'chop') advice = 'بازار ساید/رِنج است — استراتژی‌های range و market-making یا استراحت مناسب‌اند.';
  else advice = 'شرایط مختلط است — احتیاط و بررسی بیشتر با داده‌های کوتاه‌مدت لازم است.';

  // final payload
  const result = {
    symbol,
    regime,
    metrics,
    advice,
    indicatorsSummary: {
      sma: Object.fromEntries(Object.entries(indicators.sma).map(([k,v]) => [k, v.slice(-1)[0]])),
      ema: Object.fromEntries(Object.entries(indicators.ema).map(([k,v]) => [k, v.slice(-1)[0]])),
      rsi: indicators.rsi.slice(-3), // three last values
      atr: indicators.atr.slice(-3),
      momentum: indicators.momentum
    },
    rawIndicators: indicators,
    computedAt: new Date().toISOString()
  };

  return result;
}
