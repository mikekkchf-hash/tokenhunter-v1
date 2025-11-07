// worker/utils/config.js

export async function getConfig(env) {
    const configStr = await env.MY_KV.get('SYSTEM_CONFIG');
    if (!configStr) {
        // مقادیر پیش‌فرض
        return {
            min_liquidity_usd: 10000,
            min_consensus_wallets: 2,
            min_smart_score: 70,
            min_security_score: 7,
            max_alerts_per_hour: 5,
            rate_limits: {
                etherscan_rps: 5,
                coingecko_rpm: 30
            }
        };
    }
    return JSON.parse(configStr);
}