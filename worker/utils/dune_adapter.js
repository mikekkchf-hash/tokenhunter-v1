// worker/dune_adapter.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

import { callWithFallback } from './utils/fallback.js'; // برای مقاومت
import { logger } from './utils/logger.js'; // برای لاگ

// کلید API (اختیاری برای queryهای عمومی)
const DUNE_API_KEY = null; // یا از env: process.env.DUNE_API_KEY

// تابع کلیدی: اجرای یک کوئری
async function runDuneQuery(queryId, params = {}, env) {
    logger(env).log('INFO', `Dune: Running query ${queryId} with params`, params);

    // مشخصات درخواست
    const url = `https://api.dune.com/api/v1/query/${queryId}/execute`;

    // سعی در اتصال با fallback
    try {
        const result = await callWithFallback({
            type: 'dune_query',
            params: { queryId, params },
            endpoint: `/api/v1/query/${queryId}/execute`,
            url: url, // مستقیم
            method: 'POST', // Dune execute یک POST است
            headers: {
                'X-Dune-API-Key': DUNE_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ parameters: params })
        }, env);

        // اگر callWithFallback موفق بود، خودش خروجی دارد
        return result.data; // فرض بر این است که callWithFallback ساختار {data: ..., provider: ...} را برمی‌گرداند

    } catch (e) {
        logger(env).log('ERROR', `Dune query ${queryId} failed`, e);
        // در صورت شکست، می‌توان یک خروجی پیش‌فرض یا خالی برگرداند
        return { result: { rows: [] } }; // خروجی خالی
    }
}

// تابع کمکی: پیدا کردن کیف‌های سودده از طریق یک query ID شناخته شده
// توجه: شما باید یک query ID واقعی پیدا کنید. این فقط یک نمونه است.
// مثلاً یک query که Top wallets by profit in the last 90 days را بدهد.
// شما باید یکی پیدا کنید و ID آن را در اینجا قرار دهید.
const DEFAULT_QUERY_ID = '3548832'; // ⚠️ این یک ID مثال است. شما باید ID واقعی را پیدا کنید.

export async function findProfitableWallets(days = 90, minROI = 50, env) {
    logger(env).log('INFO', `Dune: Finding wallets profitable over ${days} days with min ROI ${minROI}%`);

    // پارامترهای اختصاصی query (بسته به query ID ممکن است متفاوت باشد)
    // مثلاً query شما یک فیلد 'lookback_days' دارد
    const params = {
        lookback_days: days.toString(),
        min_roi_percent: minROI.toString()
    };

    try {
        const queryResult = await runDuneQuery(DEFAULT_QUERY_ID, params, env);

        // بررسی ساختار خروجی (بسته به query متفاوت است)
        // فرض: خروجی شامل یک شی `result` و یک آرایه `rows` است
        const rows = queryResult?.result?.rows || [];

        logger(env).log('INFO', `Dune: Retrieved ${rows.length} potential wallets from query.`);

        // فیلتر و نگه داشتن فیلدهای مورد نیاز
        // فرض: هر ردیف شامل فیلدهای 'wallet_address', 'total_pnl_usd', 'number_of_trades' است
        const profitableWallets = rows
            .filter(row => row.wallet_address && row.total_pnl_usd > 1000) // حداقل 1000 دلار سود
            .map(row => ({
                address: row.wallet_address.toLowerCase(), // تبدیل به کوچک برای یکنواختی
                pnl: parseFloat(row.total_pnl_usd) || 0,
                trades: parseInt(row.number_of_trades) || 0,
                roi: parseFloat(row.roi_percent) || 0 // فرض کنید این فیلد هم وجود دارد
            }))
            .sort((a, b) => b.pnl - a.pnl); // مرتب‌سازی بر اساس PnL

        logger(env).log('INFO', `Dune: Found ${profitableWallets.length} profitable wallets after filtering.`);

        return profitableWallets;

    } catch (e) {
        logger(env).log('ERROR', 'Failed to process Dune query results', e);
        return []; // در صورت خطا، یک آرایه خالی برگردان
    }
}

// تابع نمونه: پیدا کردن توکن‌های ترند
// این هم نیاز به یک query ID دیگر دارد
export async function findTrendingTokens(limit = 20, env) {
    const queryId = '123456'; // ⚠️ این یک ID مثال است. شما باید ID واقعی را پیدا کنید.
    logger(env).log('INFO', `Dune: Finding top ${limit} trending tokens`);

    try {
        const queryResult = await runDuneQuery(queryId, { limit: limit.toString() }, env);
        const rows = queryResult?.result?.rows || [];

        const tokens = rows.map(row => ({
            symbol: row.token_symbol,
            address: row.token_address,
            chain: row.chain_name,
            volume_24h: parseFloat(row.volume_24h) || 0
        }));

        logger(env).log('INFO', `Dune: Retrieved ${tokens.length} trending tokens.`);
        return tokens;

    } catch (e) {
        logger(env).log('ERROR', 'Failed to process Dune query results for tokens', e);
        return [];
    }
}
