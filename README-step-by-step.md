# TokenHunter - ناظر اتوماتیک توکن‌های اتریوم

این پروژه یک سیستم کاملاً رایگان، 24/7، ایمن و کم‌اسپم برای شناسایی توکن‌های نوظهور و موقعیت‌های خرید ولت‌های حرفه‌ای است.

## معماری

- **Cloudflare Worker:** اسکن زنده، امتیازدهی، ارسال هشدار.
- **Cloudflare KV:** ذخیره وضعیت، لیست کالیبره، توکن‌های دیده‌شده.
- **Cloudflare Durable Objects:** تشخیص کنسوس لحظه‌ای.
- **GitHub Actions:** تحلیل تاریخی، به‌روزرسانی لیست کالیبره، گزارش روزانه.
- **Node.js Scripts:** اسکنر/آنالیزر محلی (برای تست و گسترش).

## ویژگی‌ها

- **Resilience & Fallbacks:** مقاوم در برابر خرابی API.
- **Market Regime Detection:** سیاست‌های مختلف در بازار Bull/Bear.
- **Incremental Monitoring:** فقط تراکنش‌های جدید را چک می‌کند.
- **Alert Deduplication:** جلوگیری از اسپم.
- **Secure Secrets:** مدیریت ایمن کلیدها.
- **Configurable Parameters:** تنظیم آسان آستانه‌ها و وزن‌ها.

## نیازمندی‌ها

- یک حساب [Cloudflare](https://dash.cloudflare.com/) (رایگان)
- نصب [Node.js](https://nodejs.org/) و [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- یک ربات تلگرام از [@BotFather](https://t.me/BotFather) و دریافت `BOT_TOKEN` و `CHAT_ID`
- کلیدهای API از:
  - [Etherscan](https://etherscan.io/myapikey) / [BscScan](https://bscscan.com/myapikey)
  - [CoinGecko](https://docs.coingecko.com/reference/setting-up-your-api-key) (اختیاری، برای تشخیص حالت بازار)
  - [Helius](https://www.helius.dev/) (اختیاری، برای SOL)

## مراحل نصب و راه‌اندازی

### 1. پیش‌نیازها

1.  نصب Node.js و Wrangler:
    ```bash
    npm install -g wrangler
    ```
2.  ورود به حساب Cloudflare:
    ```bash
    wrangler login
    ```

### 2. ساخت KV Namespace

1.  وارد داشبورد Cloudflare شوید.
2.  به بخش **Workers & Pages** > **KV** بروید.
3.  یک **KV Namespace** جدید بسازید و نام آن را `TokenHunter-KV` قرار دهید.
4.  `ID` این namespace را کپی کنید.

### 3. پیکربندی `wrangler.toml`

1.  فایل `wrangler.toml` را باز کنید.
2.  مقدار `account_id` را از داشبورد Cloudflare خود پیدا و جایگزین کنید.
3.  مقدار `id` در بخش `[[kv_namespaces]]` را با `ID` KV که در مرحله قبل گرفتید، جایگزین کنید.

### 4. تنظیم Secrets

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
# مقدار را وارد کنید (مثلاً 123456789:ABCdefGHI...)
wrangler secret put TELEGRAM_CHAT_ID
# مقدار را وارد کنید (مثلاً -1001234567890)
wrangler secret put ETHEREUM_RPC_URL
# مقدار را وارد کنید (مثلاً https://mainnet.infura.io/v3/YOUR_PROJECT_ID)
wrangler secret put ETHERSCAN_API_KEY
# مقدار را وارد کنید
wrangler secret put BSCSCAN_API_KEY
# مقدار را وارد کنید
wrangler secret put CG_API_KEY
# مقدار را وارد کنید (اختیاری)
wrangler secret put HELIUS_KEY
# مقدار را وارد کنید (اختیاری)
wrangler secret put COVALENT_KEY
# مقدار را وارد کنید (اختیاری)
wrangler secret put MORALIS_KEY
# مقدار را وارد کنید (اختیاری)
wrangler secret put DISCORD_WEBHOOK_URL
# مقدار را وارد کنید (اختیاری)
wrangler secret put GITHUB_PERSONAL_TOKEN
# مقدار را وارد کنید (برای فعالیت اضطراری GitHub Issue - اختیاری)
wrangler secret put GITHUB_REPO_OWNER
# مقدار را وارد کنید (مثلاً your-github-username - اختیاری)
wrangler secret put GITHUB_REPO_NAME
# مقدار را وارد کنید (مثلاً tokenhunter-calibrator - اختیاری)