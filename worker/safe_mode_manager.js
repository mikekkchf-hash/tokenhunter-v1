// worker/safe_mode_manager.js
// SOURCE_FOR: RESILIENCE
// SOURCE_FOR: DEPLOY

import { logger } from './utils/logger.js';
import { getConfig } from './utils/config.js';

export function decideSafeMode(regime, metrics, config, env) {
    const cfg = config || getConfig();
    let safeMode = false;
    let actions = [];
    
    // شرایط ورود به حالت ایمن:
    // 1. حالت بازار BEAR باشد
    // 2. یا تعداد خطا در APIها بیش از آستانه باشد (این باید از KV خوانده شود)
    // 3. یا تمام ارائه‌دهندگان یک نوع داده ناسالم شده باشند

    if (regime === 'BEAR') {
        safeMode = true;
        actions.push('mute_low_conf', 'increase_thresholds', 'recommend_stable');
        logger.log('WARN', 'Safe Mode activated due to BEAR market regime', { regime, actions });
    }
    
    // مثال: چک کردن تعداد خطاها از KV
    // const failureCountKey = 'system_failure_count';
    // let failureCount = 0;
    // try {
    //     const failureCountStr = await env.MY_KV.get(failureCountKey);
    //     if (failureCountStr) {
    //         failureCount = parseInt(failureCountStr);
    //     }
    // } catch (e) {
    //     logger.log('ERROR', 'Failed to read failure count from KV', e);
    // }
    // 
    // if (failureCount >= (cfg.fallback?.safe_mode_failure_threshold || 5)) {
    //     safeMode = true;
    //     actions.push('system_failure_mode');
    //     logger.log('WARN', 'Safe Mode activated due to system failures', { failureCount, threshold: cfg.fallback?.safe_mode_failure_threshold });
    // }

    const multipliers = safeMode ? { 
        risk: cfg.safe_mode?.risk_multiplier || 0.5, 
        opportunity: cfg.safe_mode?.opportunity_multiplier || 2.0 
    } : { 
        risk: 1.0, 
        opportunity: 1.0 
    };

    const decision = {
        safeMode,
        actions,
        multipliers,
        lastCheck: new Date().toISOString()
    };

    if (safeMode) {
        // ذخیره وضعیت حالت ایمن در KV
        try {
            await env.MY_KV.put('safe_mode_active', JSON.stringify(decision));
            logger.log('INFO', 'Safe mode state saved to KV');
        } catch (e) {
            logger.log('ERROR', 'Failed to save safe mode state to KV', e);
        }
    }

    return decision;
}