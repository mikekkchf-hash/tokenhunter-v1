// .github/scripts/tests/fallback.test.js
// استفاده از jest برای تست توابع Node.js

// توجه: تست مستقیم تابع callWithFallback از worker/utils/fallback.js در Node.js بدون محیط Worker چالش‌برانگیز است.
// این فایل یک مثال کلی از نحوه نوشتن تست برای یک تابع شبیه به callWithFallback است.
// برای تست کامل تر، تابع باید قابل جدا کردن از محیط Worker باشد.

// برای مثال، فرض کنید منطق callWithFallback را در یک فایل جدا مثل `worker/utils/fallback_logic.js` داریم:
// const { callWithFallbackLogic } = require('../../worker/utils/fallback_logic'); // فرض کنید چنین فایلی وجود دارد

// یا اینکه این تست را برای یک تابع ساده‌تر که بتوانیم مستقیماً اینجا تعریف کنیم، انجام دهیم.

// --- مثال ساده از منطق شبیه callWithFallback برای تست ---
// این تابع را در اینجا تعریف می‌کنیم تا بتوانیم آن را تست کنیم
async function mockCallWithFallbackLogic(spec) {
  const { providers, fetcher } = spec; // fetcher یک تابع است که یک provider را تست می‌کند

  for (const provider of providers) {
    try {
      const result = await fetcher(provider);
      if (result.success) {
        return { data: result.data, provider: provider.name };
      }
    } catch (e) {
      console.log(`Provider ${provider.name} failed:`, e.message);
      // می‌توان اینجا منطق علامت‌گذاری ناسالم بودن را هم اضافه کرد
      continue; // سعی بعدی
    }
  }
  throw new Error("All providers failed");
}

// --- تست‌های Jest ---
describe('Mock Fallback Logic', () => {
  test('should use primary provider if it succeeds', async () => {
    const mockFetcher = jest.fn()
      .mockResolvedValueOnce({ success: true, data: { value: 'primary_data' } });

    const spec = {
      providers: [
        { name: 'Primary', url: 'https://primary.com' },
        { name: 'Fallback1', url: 'https://fallback1.com' }
      ],
      fetcher: mockFetcher
    };

    const result = await mockCallWithFallbackLogic(spec);

    expect(mockFetcher).toHaveBeenCalledTimes(1);
    expect(mockFetcher).toHaveBeenCalledWith(spec.providers[0]);
    expect(result.provider).toBe('Primary');
    expect(result.data).toEqual({ value: 'primary_data' });
  });

  test('should use fallback provider if primary fails', async () => {
    const mockFetcher = jest.fn()
      .mockRejectedValueOnce(new Error('Primary failed'))
      .mockResolvedValueOnce({ success: true, data: { value: 'fallback_data' } });

    const spec = {
      providers: [
        { name: 'Primary', url: 'https://primary.com' },
        { name: 'Fallback1', url: 'https://fallback1.com' }
      ],
      fetcher: mockFetcher
    };

    const result = await mockCallWithFallbackLogic(spec);

    expect(mockFetcher).toHaveBeenCalledTimes(2);
    expect(mockFetcher).toHaveBeenCalledWith(spec.providers[0]);
    expect(mockFetcher).toHaveBeenCalledWith(spec.providers[1]);
    expect(result.provider).toBe('Fallback1');
    expect(result.data).toEqual({ value: 'fallback_data' });
  });

  test('should throw error if all providers fail', async () => {
    const mockFetcher = jest.fn()
      .mockRejectedValueOnce(new Error('Primary failed'))
      .mockRejectedValueOnce(new Error('Fallback1 failed'));

    const spec = {
      providers: [
        { name: 'Primary', url: 'https://primary.com' },
        { name: 'Fallback1', url: 'https://fallback1.com' }
      ],
      fetcher: mockFetcher
    };

    await expect(mockCallWithFallbackLogic(spec)).rejects.toThrow("All providers failed");

    expect(mockFetcher).toHaveBeenCalledTimes(2);
  });

  test('should handle 429 error and mark provider unhealthy (conceptual)', async () => {
    // این تست فقط مفهومی است، چون مدیریت سلامت واقعی نیاز به یک حالت اشتراکی (مثل KV یا یک شی جاوااسکریپت) دارد
    // که در این محیط تست ساده قابل پیاده‌سازی کامل نیست.
    // اما می‌توانیم بررسی کنیم که آیا بعد از دریافت 429، تابع سعی می‌کند به ارائه‌دهنده بعدی مراجعه کند.
    const mockFetcher = jest.fn()
      .mockRejectedValueOnce({ status: 429, message: 'Too Many Requests' }) // فرض کنید fetcher چنین خطا را پرتاب کند
      .mockResolvedValueOnce({ success: true, data: { value: 'fallback_data' } });

    const spec = {
      providers: [
        { name: 'Primary', url: 'https://primary.com' },
        { name: 'Fallback1', url: 'https://fallback1.com' }
      ],
      fetcher: mockFetcher
    };

    // تغییر دادن تابع برای رسیدگی به خطا
    async function mockCallWithFallbackLogicFor429(spec) {
      const { providers, fetcher } = spec;

      for (const provider of providers) {
        try {
          const result = await fetcher(provider);
          if (result.success) {
            return { data: result.data, provider: provider.name };
          }
        } catch (e) {
          if (e.status === 429) {
             console.log(`Provider ${provider.name} returned 429. Marking as unhealthy (conceptual).`);
             // در اینجا معمولاً وضعیت سلامت را در یک مخزن ذخیره می‌کنیم
             continue; // سعی بعدی
          }
          console.log(`Provider ${provider.name} failed:`, e.message);
          continue; // سعی بعدی
        }
      }
      throw new Error("All providers failed");
    }


    const result = await mockCallWithFallbackLogicFor429(spec);

    expect(mockFetcher).toHaveBeenCalledTimes(2);
    expect(mockFetcher).toHaveBeenCalledWith(spec.providers[0]);
    expect(mockFetcher).toHaveBeenCalledWith(spec.providers[1]);
    expect(result.provider).toBe('Fallback1');
    expect(result.data).toEqual({ value: 'fallback_data' });
  });
});
