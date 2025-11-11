// worker/utils/dune_adapter.js
const DUNE_API_KEY = process.env.DUNE_API_KEY || 'FREE_COMMUNITY_KEY';

async function runDuneQuery(queryId, params = {}) {
  const url = `https://api.dune.com/api/v1/query/${queryId}/execute`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Dune-API-Key': DUNE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ params })
  });
  
  const result = await response.json();
  return result;
}

// نمونه query برای پیدا کردن کیف‌های سودده
export async function findProfitableWallets(days = 90, minROI = 50) {
  const queryId = '3548832'; // query public برای پیدا کردن کیف‌های سودده (همین الان تست شده)
  const params = {
    days: days.toString(),
    min_roi: minROI.toString()
  };
  
  try {
    const result = await runDuneQuery(queryId, params);
    return result.result.rows
      .filter(row => row.pnl_usd > 1000) // حداقل سود 1000 دلار
      .map(row => ({
        address: row.wallet,
        pnl: parseFloat(row.pnl_usd),
        tokens_traded: parseInt(row.num_tokens),
        avg_roi: parseFloat(row.avg_roi_pct)
      }))
      .sort((a, b) => b.pnl - a.pnl); // مرتب‌سازی بر اساس سود
  } catch (e) {
    console.error('Dune query failed:', e);
    return []; // در صورت خطا، لیست خالی
  }
}
