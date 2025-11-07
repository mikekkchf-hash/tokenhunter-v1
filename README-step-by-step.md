# TokenHunter - ناظر اتوماتیک توکن‌های اتریوم

این پروژه یک سیستم کاملاً رایگان و 24/7 برای شناسایی توکن‌های نوظهور و موقعیت‌های خرید ولت‌های حرفه‌ای است.

## مراحل نصب و راه‌اندازی

### 1. پیش‌نیازها

- یک حساب [Cloudflare](https://dash.cloudflare.com/) (رایگان)
- نصب [Node.js](https://nodejs.org/) و [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- یک ربات تلگرام از [@BotFather](https://t.me/BotFather) و دریافت `BOT_TOKEN` و `CHAT_ID`
- کلید API از [Etherscan](https://etherscan.io/myapikey) (رایگان)

### 2. ساخت KV Namespace

1. وارد داشبورد Cloudflare شوید.
2. به بخش **Workers & Pages** > **KV** بروید.
3. یک **KV Namespace** جدید بسازید و نام آن را `TokenHunter-KV` قرار دهید.
4. `ID` این namespace را کپی کنید. این مقدار را بعداً در `wrangler.toml` وارد می‌کنیم.

### 3. پیکربندی `wrangler.toml`

1. فایل `wrangler.toml` را باز کنید.
2. مقدار `account_id` را از داشبورد Cloudflare خود پیدا و جایگزین کنید.
3. مقدار `id` در بخش `[[kv_namespaces]]` را با `ID` KV که در مرحله قبل گرفتید، جایگزین کنید.

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