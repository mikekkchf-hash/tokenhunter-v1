# Main AI Agent — مشخصات و promptها

## هدف کلی
هوش اصلی (MainAgent) وظیفه دارد از ورودی‌های بازار، رویدادهای on-chain و اخبار، یک **خلاصهٔ عملی** تولید کند:  
- یک عنوان کوتاه و عملی (one-line headline)  
- یک پاراگراف rationale (چرا این سیگنال مهم است)  
- confidence (0-100)  
- پیشنهادهای عملی (۳ مورد با سطح ریسک)  
- لینک‌ها/شواهد در حد امکان

## ورودی‌ها (structured)
- market: { btcPrice, ethPrice, btcDominance, fundingRates, indexVolatility }
- topEvents: [ {token, time, type (smartBuy/sell/liquidityAdd), wallets} ]
- news: [ { title, summary, url, publishedAt } ]
- onchain: { verified: bool, liquidityUSD: number, ownerRenounced: bool, topHolderShare: 0-1 }
- config: { thresholds, weights }

## خروجی (JSON structure)
```json
{
  "headline": "string",
  "rationale": "string",
  "confidence": 85,
  "recommendations": [
    { "action": "Buy small", "reason": "low liquidity risk", "risk": "high" },
    { "action": "Wait", "reason": "confirm breakout", "risk": "low" }
  ],
  "evidence": ["https://...","https://..."]
}
