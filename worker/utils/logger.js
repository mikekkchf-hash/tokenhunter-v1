// worker/utils/logger.js

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

        // ذخیره در KV برای مانیتورینگ
        const key = `log_${timestamp}`;
        await this.env.MY_KV.put(key, JSON.stringify(logEntry), { expirationTtl: 60 * 60 * 24 * 7 }); // 1 week
    }
}