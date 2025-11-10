// worker/smart_score_logic.js (پَچ شده)
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// SOURCE_FOR: DEPLOY

import { computeWalletScore } from './scoring_regime_aware.js'; // جدید
import { getConfig } from './utils/config.js';

// نسخه جدید که از scoring_regime_aware استفاده می‌کند
export async function calculateSmartScore(input, env) {
    const config = await getConfig(env);
    
    // اطلاعات پیش‌فرض برای مواردی که در ورودی وجود ندارد
    const defaultMetrics = {
        netFlowUSD: input.liquidity || 0,
        avgROIPct: 0,
        tradesCount: 0,
        lastActivity: new Date().toISOString(),
        tokensHeld: []
    };
    
    const score = computeWalletScore(
        {
            consensus_count: input.consensusCount || 0,
            avg_roi_pct: defaultMetrics.avgROIPct
        },
        {
            liquidity_usd: input.liquidity || 0,
            chain: 'ethereum' // در عمل باید مشخص شود
        },
        {
            // سیگنال‌های تکنیکال
            social_volume: input.socialScore || 0
        },
        {
            // نشانه‌های بنیادی
            security_score: input.securityScore || 10,
            holder_change_pct: input.holderChange || 0
        },
        {
            regime: input.regime || 'NEUTRAL',
            multipliers: input.multipliers || { risk: 1.0, opportunity: 1.0 }
        },
        config
    );
    
    return Math.round(score.score0to10 * 10); // تبدیل به 0-100
}

// نسخه قدیمی به عنوان پشتیبان
export function legacyComputeScore(input) {
    // کد قدیمی باقی می‌ماند
    return 70; // نمره پیش‌فرض
}