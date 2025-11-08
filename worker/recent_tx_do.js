// worker/recent_tx_do.js
// Durable Object: RecentTxStore
// Responsibilities:
// - keep a time-windowed list of recent txs (per token)
// - allow adding txs: addTx -> persist in storage
// - count unique wallets for a given token in a window
// - optionally trigger security-checks by POSTing to Worker internal endpoint

export class RecentTxStore {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        // `state.blockConcurrencyWhile` برای دسترسی امن به storage
    }

    async fetch(request) {
        const url = new URL(request.url);
        const tokenAddress = url.pathname.split('/')[1]; // فرض: /<token_address>

        if (request.method === 'POST') {
            // افزودن تراکنش جدید
            const txData = await request.json();
            const now = Date.now();

            await this.state.blockConcurrencyWhile(async () => {
                const recentTxs = await this.state.storage.get(tokenAddress) || [];
                recentTxs.push({ ...txData, timestamp: now });
                // حذف تراکنش‌های قدیمی‌تر از 10 دقیقه
                const tenMinutesAgo = now - (10 * 60 * 1000);
                const filteredTxs = recentTxs.filter(tx => tx.timestamp > tenMinutesAgo);
                await this.state.storage.put(tokenAddress, filteredTxs);
            });

            return new Response(JSON.stringify({ success: true }), { status: 200 });
        } else if (request.method === 'GET') {
            // گرفتن تراکنش‌های اخیر
            const recentTxs = await this.state.storage.get(tokenAddress) || [];
            const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
            const recentFiltered = recentTxs.filter(tx => tx.timestamp > tenMinutesAgo);
            return new Response(JSON.stringify(recentFiltered), { status: 200 });
        }

        return new Response('Not Found', { status: 404 });
    }
}