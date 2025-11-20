# Scoring model (مفاهیم)

SmartScore ترکیبی از:
- smartBuys (count of unique calibrated wallets in window)
- securityScore (on-chain checks)
- liquidity (USD)
- holderChange (top holder concentration)
- slippage (observed slippage on buys)
- socialScore (presence of website/twitter/profile)

Weights در SYSTEM_CONFIG قابل تغییر است.
فرمول در PoC: normalize features -> weighted sum -> scale 0-100
Backtest برای tune وزن‌ها ضروری است.
