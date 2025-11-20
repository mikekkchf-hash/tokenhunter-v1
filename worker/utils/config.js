// worker/utils/config.js
// SOURCE_FOR: REGIME, SCORING, SAFE_MODE

// 1. آستانه‌های تشخیص رژیم بازار (Market Regime Detection)
export const REGIME_THRESHOLDS = {
    // تغییر 7 روزه BTC برای ورود به رژیم صعودی (Bull)
    BULL_ENTER_PCT: 5.0,  // +5%
    // تغییر 7 روزه BTC برای ورود به رژیم نزولی (Bear)
    BEAR_ENTER_PCT: -3.0, // -3%
    // تعداد روزهای متوالی که باید یک رژیم برای فعال‌سازی کامل حفظ شود (Hysteresis)
    HYSTERESIS_DAYS: 3,
    // آستانه کل Market Cap برای فعال‌سازی رژیم ILLIQUID (مثلاً زیر $100B)
    ILLIQUID_THRESHOLD_MCAP: 100_000_000_000, 
};

// 2. ضرایب امتیازدهی بر اساس رژیم بازار (Scoring Multipliers)
// این ضرایب، Final Score را در worker/scoring_regime_aware.js تنظیم می‌کنند
export const SCORING_MULTIPLIERS = {
    BULL: 1.2,       // در بازار صعودی، سخت‌گیری بیشتر (فقط سیگنال‌های قوی‌تر)
    NEUTRAL: 1.0,    // استاندارد
    BEAR: 0.8,       // در بازار نزولی، انعطاف‌پذیری بیشتر (چون سیگنال خوب کمیاب است)
    ILLIQUID: 0.5,   // در رکود، امتیازدهی بسیار سختگیرانه
};

// 3. آستانه‌های حالت ایمن (Safe Mode Thresholds)
export const SAFE_MODE_THRESHOLDS = {
    // اگر BTC در 7 روز بیشتر از این درصد سقوط کند، SAFE_MODE فعال می‌شود
    BTC_CRASH_7D: -10.0, // -10%
    // اگر نرخ شکست API از این آستانه بالاتر رود، SAFE_MODE فعال می‌شود
    API_FAILURE_PCT: 0.15, // 15% شکست
};

// 4. تنظیمات هشدار (Alert Configuration)
export const ALERT_CONFIG = {
    MIN_SCORE: 7.0,          // حداقل امتیاز نهایی برای ارسال هشدار
    MAX_ALERTS_HOURLY: 30,   // حداکثر تعداد هشدار در ساعت
    TELEGRAM_CHAT_ID: '-5057136360',    // آیدی چت تلگرام (باید در Secret ست شود)
};

// 5. تنظیمات API Fallback
export const API_CONFIG = {
    FALLBACK_COOLDOWN_SEC: 60 * 60, // 1 ساعت بلاک برای یک Provider شکست‌خورده
};