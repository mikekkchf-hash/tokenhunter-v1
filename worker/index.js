// worker/index.js

import { runCronSniffer } from './cron_sniffer_logic.js';
// اضافه کردن خط زیر: import کلاس Durable Object
import { RecentTxStore } from './recent_tx_do.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === '/cron' && request.method === 'POST') {
            // نقطه پایانی برای فعال‌سازی Cron
            const result = await runCronSniffer(env);
            return new Response(`Cron completed. Processed ${result} tokens.`, { status: 200 });
        }

        return new Response('Hello from TokenHunter!', { status: 200 });
    },
};

// اضافه کردن خط زیر: export کلاس Durable Object
export { RecentTxStore };