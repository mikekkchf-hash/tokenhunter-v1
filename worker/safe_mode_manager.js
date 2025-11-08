// worker/safe_mode_manager.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen

import { getLogger } from './utils/logger.js';
import { getConfig } from './utils/config.js';

export function decideSafeMode(regime, metrics, config) {
    const cfg = config || {
        fallback: { safe_mode_failure_threshold: 5, safe_mode_duration_hours: 24 },
        // ... سایر تنظیمات پیش‌فرض
    };

    // شرایط ورود به حالت ایمن:
    // 1. حالت بازار BEAR باشد
    // 2. یا تعداد خطا در APIها بیش از آستانه باشد (این باید از KV خوانده شود)
    // 3. یا تمام ارائه‌دهندگان یک نوع داده ناسالم شده باشند

    let safeMode = false;
    let actions = [];

    if (regime === 'BEAR') {
        safeMode = true;
        actions.push('mute_low_conf', 'increase_thresholds', 'recommend_stable');
    }

    // مثال: چک کردن تعداد خطاها از KV
    // const failureCount = await env.MY_KV.get('system_failure_count');
    // if (failureCount && failureCount >= cfg.fallback.safe_mode_failure_threshold) {
    //     safeMode = true;
    //     actions.push('system_failure_mode');
    // }

    const multipliers = safeMode ? { risk: 0.5, opportunity: 2.0 } : { risk: 1.0, opportunity: 1.0 };

    const decision = {
        safeMode,
        actions,
        multipliers,
        lastCheck: new Date().toISOString()
    };

    if (safeMode) {
        getLogger(env).log('WARN', 'Safe Mode Activated', decision);
    }

    return decision;
}