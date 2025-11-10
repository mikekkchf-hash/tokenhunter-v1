// github/scripts/scanner.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// تابع اصلی اسکن
async function runScanner() {
    console.log('🔍 Running token scanner...');
    const config = {
        coingecko_api_key: process.env.CG_API_KEY, // اختیاری
        min_market_cap: 900000, // 900k USD
        min_roi_30d: 50, // 50%
        min_roi_90d: 100, // 100%
        output_file: path.join(__dirname, '..', '..', 'data', 'profitable_tokens.csv')
    };

    let tokens = [];

    // 1. گرفتن لیست توکن‌های محبوب از CoinGecko
    try {
        // توجه: CoinGecko endpoint برای گرفتن لیست کامل نیازمند پول یا ریت‌لیمیت بالاست.
        // برای سادگی، فرض می‌کنیم یک لیست اولیه داریم یا از یک منبع ثابت استفاده می‌کنیم.
        // در عمل، ممکن است از `/coins/markets` با صفحه‌بندی استفاده شود.
        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=7d,30d,90d`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'TokenHunter/1.0',
                ...(config.coingecko_api_key && {'X-Cg-Demo-Api-Key': config.coingecko_api_key})
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        // 2. فیلتر کردن توکن‌ها
        tokens = data
            .filter(token => token.market_cap && token.market_cap >= config.min_market_cap)
            .filter(token => token.price_change_percentage_30d_in_currency >= config.min_roi_30d || token.price_change_percentage_90d_in_currency >= config.min_roi_90d)
            .map(token => ({
                token_symbol: token.symbol.toUpperCase(),
                chain: 'ethereum', // ساده
                contract_address: token.contract_address || 'NATIVE', // اگر توکن native بود، contract_address وجود ندارد
                roi_30d_pct: token.price_change_percentage_30d_in_currency,
                roi_90d_pct: token.price_change_percentage_90d_in_currency,
                market_cap_usd: token.market_cap,
                last_checked_iso: new Date().toISOString(),
                source: 'CoinGecko'
            }));

        console.log(`Found ${tokens.length} profitable tokens.`);

        // 3. ذخیره در CSV
        const csvHeader = Object.keys(tokens[0]).join(',');
        const csvRows = tokens.map(token => Object.values(token).join(','));
        const csvContent = [csvHeader, ...csvRows].join('\n');

        // اطمینان از وجود پوشه data
        const dataDir = path.dirname(config.output_file);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(config.output_file, csvContent);
        console.log(`✅ Profitable tokens saved to ${config.output_file}`);

    } catch (e) {
        console.error('Error in scanner:', e);
        // می‌توان از یک فایل کش شده یا لیست ثابت استفاده کرد
        console.log('Scanner failed, proceeding with empty list.');
        tokens = [];
    }

    return tokens;
}

if (require.main === module) {
    runScanner().catch(console.error);
}

module.exports = { runScanner };