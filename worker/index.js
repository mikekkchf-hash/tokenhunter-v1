// worker/index.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

// ===== Imports =====
import { RecentTxStore } from './recent_tx_do.js';
import { runCronSniffer } from './cron_sniffer_logic.js';
import { sendTelegramAlert } from './telegram_sender.js';

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
