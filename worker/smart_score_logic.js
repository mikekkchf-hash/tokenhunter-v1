// worker/smart_score_logic.js

export async function calculateSmartScore(input, env) {
    const logger = new (await import('./utils/logger.js')).Logger(env);
    const config = await (await import('./utils/config.js')).getConfig(env);

    const {
        tokenAddress,
        pairAddress,
        liquidity = 0,
        holderChange = 0,
        socialScore = 0,
        securityScore = 10, // 0-10
        consensusCount = 0
    } = input;

    // نرمال‌سازی امتیازات (0-100)
    const normLiquidity = Math.min(100, (liquidity / config.min_liquidity_usd) * 30); // تا 30%
    const normConsensus = Math.min(100, (consensusCount / 5) * 20); // تا 20% (اگر 5 ولت خرید کرده باشند)
    const normSecurity = securityScore * 10; // 0-100
    const normHolderChange = Math.min(100, Math.abs(holderChange) * 1000); // نمونه
    const normSocial = socialScore * 10; // نمونه

    // محاسبه امتیاز نهایی با وزن‌های پیش‌فرض (قابل تغییر در config)
    const weights = {
        liquidity: 0.25,
        consensus: 0.25,
        security: 0.20,
        holderChange: 0.15,
        social: 0.10,
        misc: 0.05
    };

    let score = (normLiquidity * weights.liquidity) +
                (normConsensus * weights.consensus) +
                (normSecurity * weights.security) +
                (normHolderChange * weights.holderChange) +
                (normSocial * weights.social) +
                (weights.misc * 100); // 5% پایه

    score = Math.min(100, Math.max(0, score));

    logger.log('INFO', `Calculated SmartScore for ${tokenAddress}`, { ...input, score, components: { normLiquidity, normConsensus, normSecurity, normHolderChange, normSocial } });

    return Math.round(score);
}