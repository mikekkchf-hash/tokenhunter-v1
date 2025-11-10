// worker/scoring_regime_aware.js
// SOURCE_FOR: MARKET_REGIME
// SOURCE_FOR: ANALYZER

import { logger } from './utils/logger.js';
import { getConfig } from './utils/config.js';
import { estimateSlippage, estimateFees } from './market_utils.js';

// تابع نرمال‌سازی بر اساس صدک
function normalizePercentile(value, min, max) {
    if (max === min) return 0.5;
    const normalized = (value - min) / (max - min);
    return Math.max(0, Math.min(1, normalized));
}

export function computeWalletScore(walletStats, tokenMeta, techSignals, fundamentalFlags, regimeInfo, config) {
    const cfg = config || getConfig(); // در محیط واقعی از env استفاده شود
    const weights = cfg.scoring?.weights || {
        liquidity: 0.25,
        consensus: 0.25,
        security: 0.20,
        holderChange: 0.15,
        social: 0.10,
        misc: 0.05
    };
    
    // 1. نرمال‌سازی مؤلفه‌ها
    const liquidityScore = normalizePercentile(tokenMeta.liquidity_usd, cfg.scoring.min_liquidity_usd, cfg.scoring.max_liquidity_usd);
    const consensusScore = normalizePercentile(walletStats.consenus_count, cfg.scoring.min_consensus, cfg.scoring.max_consensus);
    const securityScore = normalizePercentile(fundamentalFlags.security_score, 0, 10);
    const holderChangeScore = normalizePercentile(Math.abs(fundamentalFlags.holder_change_pct), 0, cfg.scoring.max_holder_change);
    const socialScore = normalizePercentile(techSignals.social_volume, 0, cfg.scoring.max_social_volume);
    
    // 2. محاسبه بازده خالص (بدون هزینه‌ها و لغزش)
    const grossROI = walletStats.avg_roi_pct;
    const estFeesUSD = estimateFees(tokenMeta.chain);
    const estSlippageUSD = estimateSlippage(walletStats.avg_trade_size_usd, tokenMeta);
    
    const netExpectedReturn = grossROI - (estFeesUSD + estSlippageUSD);
    
    // 3. اعمال ضرایب حالت بازار
    const regimeMultiplier = regimeInfo.multipliers?.opportunity || 1.0;
    const riskMultiplier = regimeInfo.multipliers?.risk || 1.0;
    
    // 4. محاسبه امتیاز خام
    let rawScore = (
        liquidityScore * weights.liquidity +
        consensusScore * weights.consensus +
        securityScore * weights.security +
        holderChangeScore * weights.holderChange +
        socialScore * weights.social
    ) * 100;
    
    // 5. تعدیل بر اساس بازده خالص و حالت بازار
    rawScore = rawScore * (1 + (netExpectedReturn / 100)) * regimeMultiplier;
    
    // 6. محدود کردن به محدوده 0-100
    const boundedRawScore = Math.max(0, Math.min(100, rawScore));
    
    // 7. تبدیل به امتیاز 0-10
    const score0to10 = boundedRawScore / 10;
    
    // 8. تولید توضیحات
    let explain = `Base score: ${boundedRawScore.toFixed(1)}/100. `;
    explain += `Net expected return: ${netExpectedReturn.toFixed(1)}%. `;
    explain += `Regime adjustment: ${regimeInfo.regime} (x${regimeMultiplier}). `;
    
    if (netExpectedReturn < 0) {
        explain += '⚠️ Negative expected return. ';
    }
    
    if (fundamentalFlags.security_score < 7) {
        explain += '⚠️ Security concerns. ';
    }
    
    const componentScores = {
        liquidity: liquidityScore * 100,
        consensus: consensusScore * 100,
        security: securityScore * 100,
        holderChange: holderChangeScore * 100,
        social: socialScore * 100,
        netExpectedReturn,
        regimeMultiplier
    };
    
    return {
        componentScores,
        rawScore100: boundedRawScore,
        score0to10,
        explain,
        metrics: {
            grossROI,
            estFeesUSD,
            estSlippageUSD,
            netExpectedReturn
        }
    };
}