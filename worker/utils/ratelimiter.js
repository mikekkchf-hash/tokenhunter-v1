// worker/utils/ratelimiter.js
// پیاده‌سازی Token Bucket برای کنترل میزان تماس با APIها

export class TokenBucket {
    constructor(env, key, ratePerSecond, burst = 1) {
        this.env = env;
        this.key = key; // مثلاً 'etherscan_rate_limit'
        this.rate = ratePerSecond;
        this.capacity = burst;
    }

    async consume(tokens = 1) {
        const now = Date.now();
        const state = await this.env.MY_KV.getWithMetadata(this.key);
        let stored = state.value;
        let metadata = state.metadata || {};

        if (!stored) {
            stored = {
                tokens: this.capacity,
                lastRefill: now
            };
        } else {
            // پر کردن توکن‌ها بر اساس زمان سپری شده
            const timePassed = (now - stored.lastRefill) / 1000; // ثانیه
            stored.tokens = Math.min(this.capacity, stored.tokens + (timePassed * this.rate));
            stored.lastRefill = now;
        }

        if (stored.tokens >= tokens) {
            stored.tokens -= tokens;
            await this.env.MY_KV.put(this.key, JSON.stringify(stored), { expirationTtl: 60 * 60 * 24 }); // 1 day
            return true; // می‌توان درخواست زد
        } else {
            // ذخیره وضعیت جدید بدون کاستن (درخواست رد می‌شود)
            await this.env.MY_KV.put(this.key, JSON.stringify(stored), { expirationTtl: 60 * 60 * 24 });
            return false; // درخواست رد شد
        }
    }
}