// worker/utils/normalize.js
// normalizeOHLCV: try to produce array of {t,o,h,l,c,v} sorted oldest->newest
export function normalizeOHLCV(raw) {
  if (!raw) return [];
  // if array of arrays: [ [t,o,h,l,c,v], ... ]
  if (Array.isArray(raw) && raw.length && Array.isArray(raw[0])) {
    return raw.map(arr => {
      return { t: Number(arr[0]), o: Number(arr[1]), h: Number(arr[2]), l: Number(arr[3]), c: Number(arr[4]), v: Number(arr[5]) };
    }).sort((a,b)=>a.t - b.t);
  }
  // if array of objects with var names
  if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object') {
    // try common keys
    return raw.map(obj => {
      return {
        t: Number(obj.t || obj.time || obj.timestamp || obj[0] || 0),
        o: Number(obj.o || obj.open || obj.open_price || obj.openPrice || obj.openUsd || 0),
        h: Number(obj.h || obj.high || obj.high_price || obj.highPrice || 0),
        l: Number(obj.l || obj.low || obj.low_price || obj.lowPrice || 0),
        c: Number(obj.c || obj.close || obj.close_price || obj.closePrice || obj.price || 0),
        v: Number(obj.v || obj.v || obj.volume || obj.total_volume || obj.vol || 0)
      };
    }).sort((a,b)=>a.t - b.t);
  }
  // fallback empty
  return [];
}
