// worker/utils/logger.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

export class Logger {
    constructor(env) {
        this.env = env;
    }

    async log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };

        console.log(`[${level}] ${message}`, data);

        // ذخیره در KV برای مانیتورینگ (اختیاری)
        // const key = `log_${timestamp}`;
        // await this.env.MY_KV.put(key, JSON.stringify(logEntry), { expirationTtl: 60 * 60 * 24 * 7 }); // 1 week
    }
}

// export یک نمونه از کلاس برای استفاده آسان در سایر فایل‌ها
// توجه: این فقط کار می‌کند اگر env در همه جا در دسترس باشد.
// روش استاندارد‌تر این است که هر فایل نمونه خود را بسازد.
// اما برای سادگی، می‌توانیم یک تابع export کنیم که نمونه بسازد.
export const getLogger = (env) => new Logger(env);