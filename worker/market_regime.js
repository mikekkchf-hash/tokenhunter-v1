// worker/market_regime.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen

import { callWithFallback } from './utils/fallback.js';
import { getLogger } from './utils/logger.js';
import { getConfig } from './utils/config.js';

// فرض: فقط قیمت BTC و ETH را از CoinGecko می‌خوانیم برای سادگی
export async function detectMarketRegime({ cfg, env }) {
    console.log("Detecting market regime...");
    const config = cfg || await getConfig(env);

    try {
        // 1. گرفتن قیمت‌های 7 روز گذشته برای BTC و ETH
        // spec برای گرفتن قیمت‌های تاریخی
        const priceSpec = {
            type: 'price',
            params: {
                ids: 'bitcoin,ethereum',
                vs_currencies: 'usd',
                days: 7, // این پارامتر ممکن است مستقیماً پشتیبانی نشود و نیاز به چند تماس باشد
            },
            endpoint: '/coins/markets' // تغییر endpoint
        };

        // توجه: CoinGecko API مستقیم برای 7 روز گذشته (برای چک کردن گرایش) ممکن است نیاز به پیاده‌سازی پیچیده‌تری داشته باشد
        // مثلاً گرفتن داده‌های روزانه از یک endpoint دیگر یا محاسبه تغییرات از آخرین داده
        // برای سادگی، فرض می‌کنیم یک endpoint وجود دارد که تغییرات 7 روزه را می‌دهد
        // یا اینکه مستقیماً از `/coins/bitcoin/market_chart?vs_currency=usd&days=7` استفاده می‌کنیم و آخرین و اولین قیمت را مقایسه می‌کنیم
        // اینجا یک نمونه ساده از گرفتن قیمت فعلی و تصور تغییرات 7 روزه است
        const currentPriceSpec = {
            type: 'price',
            params: { ids: 'bitcoin,ethereum', vs_currencies: 'usd' }
        };

        const result = await callWithFallback(currentPriceSpec, env);
        const data = result.data;

        const btcCurrentPrice = data.bitcoin.usd;
        const ethCurrentPrice = data.ethereum.usd;

        // فرض: ما قیمت‌های 7 روز قبل را از جایی دیگر یا یک تخمین داریم
        // برای سادگی، از یک تابع ساختگی استفاده می‌کنیم
        const btcPrice7dAgo = await getHistoricalPrice('bitcoin', 7, env);
        const ethPrice7dAgo = await getHistoricalPrice('ethereum', 7, env);

        const btcChange = ((btcCurrentPrice - btcPrice7dAgo) / btcPrice7dAgo) * 100;
        const ethChange = ((ethCurrentPrice - ethPrice7dAgo) / ethPrice7dAgo) * 100;

        // 2. محاسبه متریک‌ها
        const metrics = {
            btc_7d_pct: btcChange,
            eth_7d_pct: ethChange,
            avg_7d_change: (btcChange + ethChange) / 2,
            // realized_vol_7d: ..., // نیازمند داده‌های بیشتر
            // exchange_net_flow_7d: ..., // نیازمند داده‌های جریان خروج/ورود
            // social_vol_delta_24h: ..., // نیازمند داده‌های اجتماعی
        };

        // 3. تعیین حالت بازار بر اساس آستانه‌ها
        const bullThreshold = config.regime.bull_threshold; // مثلاً 0.05
        const bearThreshold = config.regime.bear_threshold; // مثلاً -0.05

        let regime = 'NEUTRAL';
        if (metrics.avg_7d_change >= bullThreshold) {
            regime = 'BULL';
        } else if (metrics.avg_7d_change <= bearThreshold) {
            regime = 'BEAR';
        }

        // 4. اعمال هیسترزیس (در اینجا فقط یک نمونه ساده است، در عمل نیاز به ذخیره وضعیت قبلی در KV دارد)
        // برای سادگی، فرض می‌کنیم هیسترزیس در این مرحله اعمال نمی‌شود یا در لایه بالاتر مدیریت می‌شود
        const multipliers = config.regime.multipliers[regime] || config.regime.multipliers.NEUTRAL;

        const regimeInfo = {
            regime,
            metrics,
            multipliers,
            timestamp: new Date().toISOString()
        };

        getLogger(env).log('INFO', `Market regime detected: ${regimeInfo.regime}`, regimeInfo);
        return regimeInfo;

    } catch (e) {
        console.error("Error detecting market regime:", e);
        getLogger(env).log('ERROR', 'Failed to detect market regime', e);
        // بازگشت به حالت پیش‌فرض در صورت خطا
        return {
            regime: 'NEUTRAL',
            metrics: { btc_7d_pct: 0, eth_7d_pct: 0, avg_7d_change: 0 },
            multipliers: { risk: 1.0, opportunity: 1.0 },
            timestamp: new Date().toISOString()
        };
    }
}

// تابع کمکی ساختگی برای گرفتن قیمت تاریخی
// در عمل، باید از یک API مناسب یا کش محلی/externel استفاده کرد
async function getHistoricalPrice(coinId, daysAgo, env) {
    // این فقط یک مقدار ساختگی است برای تست
    // در عمل، باید از یک منبع قابل اعتماد داده گرفت
    const mockPrices = {
        bitcoin: [50000, 52000, 51000, 53000, 54000, 53500, 55000], // قیمت‌های 7 روز اخیر
        ethereum: [3000, 3100, 3050, 3200, 3300, 3250, 3400]
    };
    const prices = mockPrices[coinId] || [0];
    const index = Math.min(daysAgo, prices.length - 1);
    return prices[prices.length - 1 - index];
}