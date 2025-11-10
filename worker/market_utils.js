// worker/market_utils.js
// SOURCE_FOR: MARKET_REGIME
// SOURCE_FOR: ANALYZER

export function computeTechnicalIndicators(priceSeries) {
    // پیاده‌سازی ساده شده
    if (!priceSeries || priceSeries.length < 20) {
        return {
            EMA9: null,
            EMA50: null,
            RSI14: null,
            ATR14: null,
            volSurgeFlag: false
        };
    }
    
    // در عمل، این توابع باید کامل پیاده‌سازی شوند
    return {
        EMA9: priceSeries[priceSeries.length - 1] * 1.01, // مقدار ساختگی
        EMA50: priceSeries[priceSeries.length - 1] * 0.99, // مقدار ساختگی
        RSI14: 60, // مقدار ساختگی
        ATR14: priceSeries[priceSeries.length - 1] * 0.02, // مقدار ساختگی
        volSurgeFlag: priceSeries.length > 50 // مقدار ساختگی
    };
}

export function estimateSlippage(amountNative, tokenPairInfo) {
    // تخمین لغزش بر اساس نقدینگی
    if (!tokenPairInfo || !tokenPairInfo.liquidity || !tokenPairInfo.reserves) {
        return amountNative * 0.01; // 1% به صورت پیش‌فرض
    }
    
    const liquidityUSD = tokenPairInfo.liquidity;
    const tradeSizeUSD = amountNative * tokenPairInfo.priceUSD;
    
    // فرمول ساده برای تخمین لغزش
    const slippagePct = Math.min(0.1, tradeSizeUSD / (liquidityUSD * 0.01)); // حداکثر 10%
    return tradeSizeUSD * slippagePct;
}

export function estimateFees(chain) {
    // تخمین هزینه‌ها بر اساس زنجیره
    const feeEstimates = {
        'ethereum': 5.0, // USD
        'bsc': 0.3, // USD
        'solana': 0.01 // USD
    };
    return feeEstimates[chain.toLowerCase()] || 1.0;
}