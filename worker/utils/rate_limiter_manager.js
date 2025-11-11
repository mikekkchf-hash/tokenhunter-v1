// worker/utils/rate_limiter_manager.js
export class RateLimiterManager {
  constructor() {
    this.limiters = {
      dune: { limit: 10, window: 60000, lastReset: Date.now() }, // 10 درخواست در 60 ثانیه
      zapper: { limit: 1000000, window: 86400000, lastReset: Date.now() }, // 1 میلیون در ماه
      pocket: { limit: 100, window: 60000, lastReset: Date.now() } // 100 درخواست در 60 ثانیه
    };
    this.counts = {
      dune: 0,
      zapper: 0,
      pocket: 0
    };
  }
  
  async waitForToken(service) {
    const now = Date.now();
    const limiter = this.limiters[service];
    
    // ریست کردن شمارنده اگر پنجره زمانی گذشته
    if (now - limiter.lastReset > limiter.window) {
      this.counts[service] = 0;
      limiter.lastReset = now;
    }
    
    // اگر به حد مجاز رسیدیم، صبر کن
    if (this.counts[service] >= limiter.limit) {
      const waitTime = limiter.window - (now - limiter.lastReset);
      console.log(`Rate limit reached for ${service}. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.counts[service] = 0;
      limiter.lastReset = Date.now();
    }
    
    this.counts[service]++;
    return true;
  }
  
  getRemaining(service) {
    const limiter = this.limiters[service];
    return Math.max(0, limiter.limit - this.counts[service]);
  }
}
