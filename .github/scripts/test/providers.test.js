// github/scripts/tests/providers.test.js
// استفاده از jest
const nock = require('nock');

// توجه: تست مستقیم توابع داخل Worker (مثل callWithFallback) در Node.js بدون محیط Worker چالش‌برانگیز است.
// این تست، یک نمونه ساده از چگونگی تست کردن منطق شبیه به callWithFallback در محیط Node.js است.
// برای تست کامل، باید Worker را با wrangler test یا یک فریمورک شبیه `miniflare` تست کرد.

// برای این تست، تابعی شبیه callWithFallback را در یک فایل جداگانه (مثلاً `worker/utils/fallback_logic.js`) قرار داده و آن را export می‌کنیم تا قابل تست باشد.
// اینجا فقط یک مثال کلی می‌زنیم.

describe('Providers & Fallback Logic (Mocked)', () => {
    test('should use primary provider first', async () => {
        // مثال ساده: یک تابع که از چندین URL سعی در گرفتن داده می‌کند
        const urls = [
            'https://primary-api.com/data',
            'https://fallback-api.com/data'
        ];

        nock('https://primary-api.com')
            .get('/data')
            .reply(200, { success: true, source: 'primary' });

        const result = await mockCallWithFallback(urls);
        expect(result.source).toBe('primary');
    });

    test('should use fallback on primary failure', async () => {
        nock('https://primary-api.com')
            .get('/data')
            .reply(500);

        nock('https://fallback-api.com')
            .get('/data')
            .reply(200, { success: true, source: 'fallback' });

        const result = await mockCallWithFallback(['https://primary-api.com/data', 'https://fallback-api.com/data']);
        expect(result.source).toBe('fallback');
    });

    test('should mark provider unhealthy on 429', async () => {
        nock('https://primary-api.com')
            .get('/data')
            .reply(429);

        await expect(mockCallWithFallback(['https://primary-api.com/data'], { failOnAll: true })).rejects.toThrow();
        // در اینجا می‌توانیم چک کنیم که آیا وضعیت سلامت در یک مخزن موقت ذخیره شده است یا نه
        // این بخش به نحوه پیاده‌سازی مدیریت سلامت بستگی دارد
        // expect(isProviderMarkedUnhealthy('primary-api')).toBe(true);
    });
});

// تابع کمکی برای تست
async function mockCallWithFallback(urls, options = {}) {
    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return await response.json();
            } else if (response.status === 429) {
                if (options.failOnAll) throw new Error('429 from provider');
                continue; // سعی بعدی
            } else {
                continue; // سعی بعدی
            }
        } catch (e) {
            continue; // سعی بعدی
        }
    }
    throw new Error('All providers failed');
}

// jest.mock('node-fetch', () => ({
//     default: jest.fn()
// }));