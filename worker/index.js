// worker/index.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

// اضافه کردن import
import { RecentTxStore } from './recent_tx_do.js';

import { runCronSniffer } from './cron_sniffer_logic.js';
import { sendTelegramAlert } from './telegram_sender.js';

// ... بقیه imports ...

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === '/cron' && request.method === 'POST') {
            // نقطه پایانی برای فعال‌سازی Cron - این توسط Cloudflare فراخوانی می‌شود
            console.log('Cron triggered by Cloudflare.');
            const result = await runCronSniffer(env);
            return new Response(`Cron completed. Processed ${result} items.`, { status: 200 });
        }

        if (url.pathname === '/health' && request.method === 'GET') {
            // نقطه پایانی برای چک کردن سلامت سیستم
            return new Response('OK', { status: 200 });
        }

        // سایر endpointها در صورت نیاز
        return new Response('Hello from TokenHunter!', { status: 200 });
    },
};

// اضافه کردن export کلاس Durable Object در انتهای فایل
export { RecentTxStore };