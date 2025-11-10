// worker/market_regime.js
// SOURCE_FOR: MARKET_REGIME
// SOURCE_FOR: DEPLOY

import { callWithFallback } from './utils/fallback.js';
import { Logger } from './utils/logger.js';
import { getConfig } from './utils/config.js';

// مقدارهای پیش‌فرض برای تست
const MOCK_PRICES = {
    bitcoin: [50000, 52000, 51000, 53000, 54000, 53500, 55000],
    ethereum: [3000, 3100, 3050, 3200, 3300, 3250, 3400]
};

// تابع کمکی برای گرفتن قیمت‌های تاریخی (در عمل از API استفاده شود)
async function getHistoricalPrices(coinId, daysAgo, env) {
    // در محیط واقعی، این باید از API دریافت شود
    const prices = MOCK_PRICES[coinId] || [0];
    const index = Math.min(daysAgo, prices.length - 1);
    return prices[prices.length - 1 - index];
}

export async function detectMarketRegime({ cfg, env }) {
    Logger.log('INFO', 'Detecting market regime...');
    const config = cfg || await getConfig(env);
    
    try {
        // 1. دریافت قیمت فعلی BTC و ETH از CoinGecko
        const priceSpec = {
            type: 'price',
            params: { 
                ids: 'bitcoin,ethereum',
                vs_currencies: 'usd'
            },
            timeout: 15000
        };
        
        const result = await callWithFallback(priceSpec, env);
        const data = result.data;
        
        const btcCurrentPrice = data.bitcoin.usd;
        const ethCurrentPrice = data.ethereum.usd;
        
        // 2. دریافت قیمت‌های 7 روز قبل (در محیط واقعی از API دیگر و یا کش استفاده شود)
        const btcPrice7dAgo = await getHistoricalPrices('bitcoin', 7, env);
        const ethPrice7dAgo = await getHistoricalPrices('ethereum', 7, env);
        
        // 3. محاسبه تغییرات
        const btcChange = ((btcCurrentPrice - btcPrice7dAgo) / btcPrice7dAgo) * 100;
        const ethChange = ((ethCurrentPrice - ethPrice7dAgo) / ethPrice7dAgo) * 100;
        const avgChange = (btcChange + ethChange) / 2;
        
        // 4. تعیین حالت بازار
        let regime = 'NEUTRAL';
        const bullThreshold = config.regime?.bull_threshold || 5; // 5%
        const bearThreshold = config.regime?.bear_threshold || -5; // -5%
        
        if (avgChange >= bullThreshold) {
            regime = 'BULL';
        } else if (avgChange <= bearThreshold) {
            regime = 'BEAR';
        }
        
        // 5. اعمال هیسترزیس (در اینجا ساده‌سازی شده؛ در عمل باید وضعیت قبلی در KV ذخیره شود)
        const multipliers = config.regime?.multipliers?.[regime] || {
            risk: 1.0,
            opportunity: 1.0
        };
        
        const metrics = {
            btc_7d_pct: btcChange,
            eth_7d_pct: ethChange,
            avg_7d_change: avgChange,
            // realized_vol_7d: ... // در محیط واقعی محاسبه شود
            // exchange_net_flow_7d: ... // در محیط واقعی محاسبه شود
            // social_vol_delta_24h: ... // در محیط واقعی محاسبه شود
        };
        
        const regimeInfo = {
            regime,
            metrics,
            multipliers,
            hysteresis_applied: false, // در محیط واقعی باید بررسی شود
            timestamp: new Date().toISOString()
        };
        
        Logger.log('INFO', `Market regime detected: ${regimeInfo.regime}`, regimeInfo);
        return regimeInfo;
        
    } catch (e) {
        Logger.log('ERROR', 'Error detecting market regime', e);
        // در صورت خطا، حالت پیش‌فرض بازگردانده می‌شود
        return {
            regime: 'NEUTRAL',
            metrics: { 
                btc_7d_pct: 0, 
                eth_7d_pct: 0, 
                avg_7d_change: 0 
            },
            multipliers: {
                risk: 1.0,
                opportunity: 1.0
            },
            timestamp: new Date().toISOString()
        };
    }
}
