// .github/scripts/historical_analyzer.js

require('dotenv').config();
const fetch = require('node-fetch');

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const CLOUDFLARE_API_TOKEN = process.env.CF_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const WORKER_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID; // همان KV شما

// تابع گرفتن لیست توکن‌های موفق گذشته (از منابع مختلف، مثلاً CoinGecko Top Gainers)
async function getTopGainerTokens(days = 90) {
    console.log(`Fetching top gainer tokens for last ${days} days...`);
    // نکته: CoinGecko API مستقیم برای "top gainers 90d" ممکن است نیاز به پول داشته باشد.
    // یا باید از endpoint `/coins/markets` با `price_change_percentage_90d` و مرتب‌سازی استفاده کنیم.
    // برای سادگی، فعلاً یک لیست سفت می‌سازیم، اما می‌توان با API پویا کرد.
    // اینجا فقط یک نمونه سفت برای نمایش کارکرد:
    const sampleTokens = [
        // { address: '0x...', symbol: 'SUCCTOKEN', chain: 'ethereum' },
        // { address: '0x...', symbol: 'ANOTHER', chain: 'ethereum' },
        // ...
    ];

    // TODO: جایگزین کردن با فراخوانی واقعی از CoinGecko یا منبع دیگر
    // مثال:
    // const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=price_change_percentage_90d_desc&per_page=50&page=1&sparkline=false&price_change_percentage=90d`;
    // const response = await fetch(url);
    // const data = await response.json();
    // const topGainers = data.filter(token => token.price_change_percentage_90d > 100).map(t => ({ address: t.contract_address, symbol: t.symbol, chain: 'ethereum' })); // فقط اگر قرارداد داشته باشد

    console.log(`Fetched sample list of ${sampleTokens.length} tokens for analysis.`);
    return sampleTokens;
}

// تابع محاسبه PnL یک کیف برای یک توکن
async function calculateWalletPnL(walletAddress, tokenAddress) {
    try {
        const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${walletAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== '1') {
            console.error(`[Etherscan Error for ${walletAddress} on ${tokenAddress}]:`, data.message);
            return 0;
        }

        const transactions = data.result;
        const relevantTxs = transactions.filter(tx => tx.contractAddress.toLowerCase() === tokenAddress.toLowerCase());

        let totalBuyAmount = 0;
        let totalSellAmount = 0;

        for (const tx of relevantTxs) {
            const value = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal));
            if (tx.from.toLowerCase() === walletAddress.toLowerCase()) {
                totalSellAmount += value;
            } else if (tx.to.toLowerCase() === walletAddress.toLowerCase()) {
                totalBuyAmount += value;
            }
        }

        const pnl = totalSellAmount - totalBuyAmount;
        console.log(`Wallet ${walletAddress} on ${tokenAddress}: Bought ${totalBuyAmount}, Sold ${totalSellAmount}, PnL: ${pnl}`);
        return pnl;

    } catch (e) {
        console.error(`Error calculating PnL for ${walletAddress} on ${tokenAddress}:`, e);
        return 0;
    }
}

// تابع تحلیل یک توکن
async function analyzeToken(token) {
    console.log(`\n--- Analyzing Token: ${token.symbol} (${token.address}) on ${token.chain} ---`);
    // فقط برای ETH در نظر می‌گیریم، برای BSC/SOL باید URL متفاوت شود
    const url = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${token.address}&page=1&offset=10000&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== '1') {
        console.error(`[Etherscan Error for ${token.address}]:`, data.message);
        return {};
    }

    const transactions = data.result;
    const walletsSet = new Set();
    transactions.forEach(tx => {
        walletsSet.add(tx.from);
        walletsSet.add(tx.to);
    });
    const wallets = Array.from(walletsSet);

    const walletPnls = {};
    for (const wallet of wallets) {
        if (wallet === '0x0000000000000000000000000000000000000000') continue;

        const pnl = await calculateWalletPnL(wallet, token.address);
        if (pnl > 0) {
            walletPnls[wallet] = (walletPnls[wallet] || 0) + pnl;
        }
    }

    return walletPnls;
}

// تابع اصلی
async function main() {
    console.log('Starting Historical Analysis for ALL tokens...');
    const allPnls = {};

    const tokensToAnalyze = await getTopGainerTokens(90); // مثلاً آخرین 90 روز

    if (tokensToAnalyze.length === 0) {
        console.log("No tokens found to analyze. Please check the token list source.");
        return;
    }

    for (const token of tokensToAnalyze) {
        const tokenPnls = await analyzeToken(token);
        for (const [wallet, pnl] of Object.entries(tokenPnls)) {
            allPnls[wallet] = (allPnls[wallet] || 0) + pnl;
        }
    }

    // 3. رتبه‌بندی کیف‌ها
    const sortedWallets = Object.entries(allPnls)
        .sort((a, b) => b[1] - a[1]) // نزولی
        .slice(0, 20); // برگرداندن 20 کیف برتر

    console.log('\n--- Top 20 Calibrated Wallets (by total PnL on successful tokens) ---');
    sortedWallets.forEach(([wallet, pnl], index) => {
        console.log(`${index + 1}. ${wallet}: ${pnl.toFixed(2)}`);
    });

    const topWalletsList = sortedWallets.map(([wallet, _]) => wallet);

    // 4. ذخیره در KV
    await updateKVWithSmartWallets(topWalletsList);

    // 5. ارسال گزارش روزانه به تلگرام (اختیاری - فقط اگر API Key و Chat ID داشته باشیم)
    await sendDailyReport(topWalletsList, sortedWallets);

    console.log('\nHistorical Analysis Complete.');
}

// تابع ذخیره در KV
async function updateKVWithSmartWallets(smartWallets) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${WORKER_NAMESPACE_ID}/values/calibrated_wallets`;

    const headers = {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
    };

    const body = JSON.stringify(smartWallets);

    const response = await fetch(url, {
        method: 'PUT',
        headers,
        body
    });

    if (response.ok) {
        console.log('KV updated successfully with new calibrated wallets from historical analysis.');
    } else {
        console.error('Failed to update KV:', await response.text());
    }
}

// تابع ارسال گزارش روزانه
async function sendDailyReport(topWallets, sortedWallets) {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        console.log("Telegram credentials not found. Skipping daily report.");
        return;
    }

    const top5 = sortedWallets.slice(0, 5);
    const reportMessage = `<b>📊 Daily Calibration Report</b>\n` +
        `<b>Top 5 Calibrated Wallets:</b>\n` +
        top5.map(([w, p], i) => `${i+1}. <code>${w.slice(0, 6)}...${w.slice(-4)}</code> (PnL: ${p.toFixed(2)})`).join('\n') +
        `\n<b>Total Calibrated Wallets:</b> ${topWallets.length}\n` +
        `<b>Report Time:</b> ${new Date().toISOString()}\n` +
        `🔄 List updated in KV.`;

    const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text: reportMessage,
                parse_mode: 'HTML'
            })
        });

        if (response.ok) {
            console.log('Daily report sent to Telegram successfully.');
        } else {
            console.error('Failed to send daily report to Telegram.');
        }
    } catch (e) {
        console.error('Error sending daily report to Telegram:', e);
    }
}

main().catch(console.error);
