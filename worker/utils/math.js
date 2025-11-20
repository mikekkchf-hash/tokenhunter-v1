// worker/utils/math.js
// SMA, EMA, RSI, ATR, momentum implementations (pure JS, array inputs oldest->newest)

export function sma(series, period) {
  const res = [];
  const p = Number(period);
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    const val = Number(series[i]);
    sum += val;
    if (i >= p) {
      sum -= Number(series[i - p]);
      res.push(sum / p);
    } else if (i === p - 1) {
      res.push(sum / p);
    } else {
      res.push(null);
    }
  }
  return res;
}

export function ema(series, period) {
  const res = [];
  const p = Number(period);
  const k = 2 / (p + 1);
  let prev;
  for (let i = 0; i < series.length; i++) {
    const val = Number(series[i]);
    if (i === 0) {
      prev = val;
      res.push(prev);
      continue;
    }
    if (i < p - 1) {
      // seed via SMA when reach period-1? for simplicity use simple smoothing
      prev = prev * (1 - k) + val * k;
      res.push(prev);
      continue;
    }
    prev = prev * (1 - k) + val * k;
    res.push(prev);
  }
  return res;
}

export function rsi(series, period = 14) {
  const res = [];
  const p = Number(period);
  let gains = 0, losses = 0;
  for (let i = 0; i < series.length; i++) {
    if (i === 0) { res.push(null); continue; }
    const change = Number(series[i]) - Number(series[i-1]);
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    if (i <= p) {
      gains += gain; losses += loss;
      if (i === p) {
        const avgGain = gains / p;
        const avgLoss = losses / p;
        const rs = avgLoss === 0 ? 100 : (avgGain / avgLoss);
        res.push(100 - (100 / (1 + rs)));
      } else res.push(null);
    } else {
      // Wilder smoothing
      const prevAvgGain = res[i-1] === null ? gains / p : null;
      // to compute properly we need maintain avgGain/avgLoss state - implement simple method:
      // fallback: recompute over last p changes (slower but robust)
      let g = 0, l = 0, count = 0;
      for (let j = i - p + 1; j <= i; j++) {
        if (j <= 0) continue;
        const ch = Number(series[j]) - Number(series[j - 1]);
        g += Math.max(0, ch);
        l += Math.max(0, -ch);
        count++;
      }
      const avgGain = g / count;
      const avgLoss = l / count;
      const rs = avgLoss === 0 ? 100 : (avgGain / avgLoss);
      res.push(100 - (100 / (1 + rs)));
    }
  }
  return res;
}

export function atr(highs, lows, closes, period = 14) {
  const res = [];
  const p = Number(period);
  const trs = [];
  for (let i = 0; i < highs.length; i++) {
    if (i === 0) {
      trs.push(highs[i] - lows[i]);
    } else {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i-1]),
        Math.abs(lows[i] - closes[i-1])
      );
      trs.push(tr);
    }
  }
  for (let i = 0; i < trs.length; i++) {
    if (i < p - 1) res.push(null);
    else {
      const window = trs.slice(i - p + 1, i + 1);
      const sum = window.reduce((a,b)=>a+b,0);
      res.push(sum / p);
    }
  }
  return res;
}

export function momentum(series, n = 10) {
  if (!series || series.length < n+1) return null;
  const last = Number(series[series.length-1]);
  const past = Number(series[series.length-1 - n]);
  return (last - past) / Math.max(1e-9, Math.abs(past));
}
