// worker/utils/providers.js
// SOURCE_FOR: FALLBACK, DEPLOY
// تعریف تمام APIهای مورد نیاز با جزئیات Rate Limit و نوع اتصال.

export const PROVIDERS = {
    // 1. ELITE DATA / ANALYTICS (جایگزین Dune)
    // استفاده از آدرس Hosted Service عمومی The Graph
    THE_GRAPH: {
        name: 'The Graph Hosted Service',
        type: 'GRAPHQL', // برای کوئری Subgraphs عمومی
        baseUrl: 'https://api.thegraph.com/subgraphs/name/', 
        rateLimit: 500, // Query/minute (حدس محافظه‌کارانه - بسیار بالاتر از Dune)
        timeUnit: 60,
        // هیچ Fallback مستقیمی برای Dune نداریم، چون دیتای آن منحصر به فرد است.
    },
    ZAPPER: {
        name: 'Zapper GraphQL',
        type: 'GRAPHQL', // برای PNL و Wallet Scoring
        baseUrl: 'https://api.zapper.xyz/v2/graphql',
        rateLimit: 30000, // 1M requests/month ~ 30k/day (خیلی سخاوتمندانه)
        timeUnit: 86400, // 24 ساعت
        fallback: ['MORALIS'], // Moralis می‌تواند PNL ساده را محاسبه کند
    },

    // 2. REAL-TIME TX STREAM (برای Incremental Monitor در Cloudflare Worker)
    POCKET_NETWORK_ETH: {
        name: 'Pocket Network ETH',
        type: 'WEBSOCKET_RPC', // برای اتصال Low-Latency
        baseUrl: 'wss://eth-mainnet.gateway.pokt.network/v1/lb/', // نیاز به Key در URL
        rateLimit: 30, // Session/second (بسیار بالا)
        timeUnit: 1,
        fallback: ['MORALIS_WS'], // Fallback به Websocket دیگری
    },

    // 3. FALLBACKS (برای شرایط اضطراری)
    MORALIS: {
        name: 'Moralis REST (Fallback)',
        type: 'REST',
        baseUrl: 'https://deep-index.moralis.io/api/v2',
        rateLimit: 15, // Low Limit
        timeUnit: 1,
        fallback: [],
    },
    // ... سایر Fallback ها مثل CoinGecko برای قیمت (در صورت لزوم)
};