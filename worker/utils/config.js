// worker/utils/config.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

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
            // ... بقیه تنظیمات پرامپت قبلی ...
            // اضافه شده برای پرامپت ضمیمه:
            fallback: {
                provider_cooldown_ms: 300000, // 5 min
                safe_mode_failure_threshold: 5, // بعد از 5 شکست متوالی
                safe_mode_duration_hours: 24,
            },
            alert: {
                max_per_day: 5,
                max_per_hour: 2,
                cooldown_sec: 1800, // 30 min
                // زنجیره فعالیت اضطراری
                fallback_chain: ['telegram', 'discord', 'github_issue'],
            },
            chains: ["ethereum", "bsc"],
            tokens_list: ["PEPE", "SHIB"],
            // تنظیمات regime
            regime: {
                bull_threshold: 0.05, // 5% 7-day gain on BTC
                bear_threshold: -0.05, // -5% 7-day loss on BTC
                hysteresis_days: 1,
                multipliers: {
                    BULL: { risk: 1.2, opportunity: 0.8 },
                    BEAR: { risk: 0.7, opportunity: 1.5 },
                    NEUTRAL: { risk: 1.0, opportunity: 1.0 },
                }
            },
            // تنظیمات scoring regime-aware
            scoring: {
                weights: {
                    liquidity: 0.25,
                    consensus: 0.25,
                    security: 0.20,
                    holderChange: 0.15,
                    social: 0.10,
                    misc: 0.05
                }
            },
            // تنظیمات monitor
            monitor: {
                poll_interval_min: 15,
                cooldown_sec: 1800,
                max_new_txs_per_poll: 50
            },
            // ... سایر تنظیمات ...
        };
    }
    return JSON.parse(configStr);
}