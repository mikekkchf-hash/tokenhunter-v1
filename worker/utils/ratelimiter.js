// worker/utils/ratelimiter.js
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

// توجه: این پیاده‌سازی برای محیط Cloudflare Worker سازگار شده است.
// از KV برای ذخیره وضعیت استفاده می‌کند.

export class TokenBucket {
    constructor(env, key, ratePerSecond, burst = 1) {
        this.env = env; // Cloudflare Worker env
        this.key = key; // مثلاً 'etherscan_rate_limit'
        this.rate = ratePerSecond;
        this.capacity = burst;
    }

    // تابع اصلی برای مصرف یک توکن
    async consume(tokens = 1) {
        const now = Date.now();
        const stateKey = `rate_limit_${this.key}_state`;
        const metadataKey = `rate_limit_${this.key}_meta`;

        // خواندن وضعیت فعلی از KV
        let stored = await this.env.MY_KV.get(stateKey);
        let metadata = await this.env.MY_KV.get(metadataKey);

        if (!stored) {
            // اگر وجود نداشت، وضعیت اولیه را ایجاد کن
            stored = {
                tokens: this.capacity,
                lastRefill: now
            };
        } else {
            stored = JSON.parse(stored);
            metadata = JSON.parse(metadata || "{}");
        }

        // پر کردن توکن‌ها بر اساس زمان سپری شده
        const timePassed = (now - stored.lastRefill) / 1000; // ثانیه
        stored.tokens = Math.min(this.capacity, stored.tokens + (timePassed * this.rate));
        stored.lastRefill = now;

        if (stored.tokens >= tokens) {
            stored.tokens -= tokens;
            // ذخیره وضعیت جدید در KV
            await this.env.MY_KV.put(stateKey, JSON.stringify(stored), { expirationTtl: 60 * 60 * 24 }); // 1 day
            await this.env.MY_KV.put(metadataKey, JSON.stringify(metadata), { expirationTtl: 60 * 60 * 24 });
            return true; // می‌توان درخواست زد
        } else {
            // ذخیره وضعیت جدید بدون کاستن (درخواست رد می‌شود)
            await this.env.MY_KV.put(stateKey, JSON.stringify(stored), { expirationTtl: 60 * 60 * 24 });
            await this.env.MY_KV.put(metadataKey, JSON.stringify(metadata), { expirationTtl: 60 * 60 * 24 });
            return false; // درخواست رد شد
        }
    }

    // تابع کمکی برای منتظر ماندن تا زمانی که یک توکن آماده شود
    // توجه: این تابع در محیط Worker با توجه به محدودیت‌های زمان اجرا کار نمی‌کند.
    // استفاده از این تابع باید با دقت و معمولاً در فرآیندهای پس‌زمینه (مثل GitHub Actions) باشد.
    // در Worker اصلی، بهتر است فقط از `consume` استفاده کنید و در صورت عدم موفقیت، عملیات را لغو یا به فرآیند دیگری منتقل کنید.
    // async waitForToken(tokens = 1) {
    //     while (true) {
    //         if (await this.consume(tokens)) {
    //             return;
    //         }
    //         await new Promise(resolve => setTimeout(resolve, 100)); // 100ms
    //     }
    // }
}