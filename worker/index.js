// worker/index.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

// ===== Imports =====
import { RecentTxStore } from './recent_tx_do.js';
import { runCronSniffer } from './cron_sniffer_logic.js';
import { sendTelegramAlert } from './telegram_sender.js';

// ===== Internal Dune Helper Functions (Moved here from dune_adapter.js) =====

// تابع ساده برای تماس با API Dune
// توجه: برای استفاده کامل، باید callWithFallback را هم اینجا تعریف کنیم یا از یک ماژول مشترک استفاده کنیم.
// برای سادگی در اینجا، مستقیم fetch انجام می‌شود.
async function runDuneQuery(queryId, params = {}, env) {
    console.log(`Dune: Running query ${queryId} with params`, params);

    const url = `https://api.dune.com/api/v1/query/${queryId}/execute`;
    const headers = {
        'Content-Type': 'application/json'
        // توجه: برای queryهای عمومی، ممکن است نیاز به کلید نباشد، اما برای execute ممکن است لازم باشد.
        // اگر خطای 401 گرفتید، نیاز به API Key دارید.
        // 'X-Dune-API-Key': env.DUNE_API_KEY
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ parameters: params })
        });

        if (!response.ok) {
            console.error(`Dune API error: ${response.status} - ${response.statusText}`);
            const errorBody = await response.text();
            console.error("Error body:", errorBody);
            return { result: { rows: [] } }; // خروجی خالی در صورت خطا
        }

        const result = await response.json();
        console.log(`Dune: Query ${queryId} executed successfully.`);
        return result;

    } catch (e) {
        console.error(`Dune query ${queryId} failed:`, e);
        return { result: { rows: [] } }; // خروجی خالی در صورت خطا
    }
}


// تابع اصلی: پیدا کردن کیف‌های سودده از طریق یک query ID شناخته شده
// ⚠️ توجه: شما باید یک query ID واقعی و مناسب از Dune پیدا کنید و اینجا قرار دهید.
const DEFAULT_DUNE_QUERY_ID = '3548832'; // مثال - شما باید این را عوض کنید

export async function findProfitableWallets(days = 90, minROI = 50, env) {
    console.log(`Dune: Finding wallets profitable over ${days} days with min ROI ${minROI}%`);

    const params = {
        lookback_days: days.toString(),
        min_roi_percent: minROI.toString()
    };

    try {
        const queryResult = await runDuneQuery(DEFAULT_DUNE_QUERY_ID, params, env);

        // بررسی ساختار خروجی (بسته به query متفاوت است)
        const rows = queryResult?.result?.rows || [];

        console.log(`Dune: Retrieved ${rows.length} potential wallets from query.`);

        // فیلتر و نگه داشتن فیلدهای مورد نیاز
        // توجه: نام فیلدها (مثل wallet_address, total_pnl_usd) بستگی به query شما دارد.
        // اینجا نام‌های رایج فرض شده‌اند.
        const profitableWallets = rows
            .filter(row => row.wallet_address && (parseFloat(row.total_pnl_usd) || 0) > 1000) // حداقل 1000 دلار سود
            .map(row => ({
                address: (row.wallet_address || '').toLowerCase(), // تبدیل به کوچک برای یکنواختی
                pnl: parseFloat(row.total_pnl_usd) || 0,
                trades: parseInt(row.number_of_trades) || 0,
                roi: parseFloat(row.roi_percent) || 0 // فرض کنید این فیلد هم وجود دارد
            }))
            .sort((a, b) => b.pnl - a.pnl); // مرتب‌سازی بر اساس PnL

        console.log(`Dune: Found ${profitableWallets.length} profitable wallets after filtering.`);

        return profitableWallets;

    } catch (e) {
        console.error('Failed to process Dune query results', e);
        return []; // در صورت خطا، یک آرایه خالی برگردان
    }
}


// ===== Worker Entrypoint =====
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // --- Health check endpoint ---
        if (request.method === 'GET' && path === '/health') {
            return new Response(JSON.stringify({
                ok: true,
                ts: new Date().toISOString(),
                worker: "token-hunter",
                status: "healthy"
            }), { status: 200 });
        }

        // --- Test Telegram alert endpoint 1 (/test-telegram) ---
        if (request.method === 'GET' && path === '/test-telegram') {
            const testMessage = "✅ Worker is live and can send Telegram alerts!";
            try {
                await sendTelegramAlert(testMessage, env);
                return new Response("Test alert sent successfully via /test-telegram!", { status: 200 });
            } catch (e) {
                console.error("Error sending test alert via /test-telegram:", e);
                return new Response(`Error: ${e.message}`, { status: 500 });
            }
        }

        // --- Test Telegram alert endpoint 2 (/test-alert) ---
        if (request.method === 'GET' && path === '/test-alert') {
            const testMessage = "✅ Test alert from Token Hunter worker!";
            try {
                await sendTelegramAlert(testMessage, env);
                return new Response("Test alert sent successfully via /test-alert!", { status: 200 });
            } catch (e) {
                console.error("Error sending test alert via /test-alert:", e);
                return new Response(`Error: ${e.message}`, { status: 500 });
            }
        }

        // --- NEW: Test Dune endpoint (/test-dune) ---
        if (request.method === 'GET' && path === '/test-dune') {
            try {
                // تعداد روز و ROI مورد نظر را می‌توان از URL گرفت، یا همان مقدار پیش‌فرض استفاده شود
                const urlParams = new URLSearchParams(url.search);
                const days = parseInt(urlParams.get('days')) || 90;
                const minROI = parseFloat(urlParams.get('roi')) || 50;

                console.log(`Received /test-dune request for ${days} days and min ROI ${minROI}%`);
                const wallets = await findProfitableWallets(days, minROI, env);
                console.log(`Returning ${wallets.length} wallets from /test-dune`);

                return new Response(JSON.stringify(wallets, null, 2), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e) {
                console.error("Error in /test-dune:", e);
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // --- Cron endpoint ---
        if (request.method === 'POST' && path === '/cron') {
            console.log('Cron triggered by Cloudflare.');
            try {
                const result = await runCronSniffer(env);
                return new Response(`Cron completed successfully. Processed ${result} items.`, { status: 200 });
            } catch (e) {
                console.error("Cron error:", e);
                return new Response(`Cron failed: ${e.message}`, { status: 500 });
            }
        }

        // --- Default response (catch-all) ---
        return new Response('Hello from TokenHunter Worker!', { status: 200 });
    },
};

// ===== Export Durable Object =====
export { RecentTxStore };
