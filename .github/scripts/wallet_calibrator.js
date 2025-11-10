// github/scripts/wallet_calibrator.js
// این اسکریپت باید در محیط Node.js اجرا شود (مثلاً در GitHub Actions)

require('dotenv').config();
const fetch = require('node-fetch');

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const WORKER_NAMESPACE_ID = process.env.WORKER_NAMESPACE_ID; // KV ID

// فرض: یک لیست اولیه از ولت‌ها برای بررسی
const initialWallets = [
    "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", // مثال
    "0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8", // مثال
    // ... بقیه
];

async function fetchWalletTransactions(address) {
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.status === '1' ? data.result : [];
}

function calculateWalletScore(transactions) {
    // الگوریتم ساده: تعداد تراکنش‌های موفق / کل، میانگین ROI فرضی
    const successful = transactions.filter(tx => tx.isError === '0');
    const successRate = successful.length / transactions.length || 0;
    // ... محاسبات پیچیده‌تر
    return Math.min(10, successRate * 10); // نمره 0-10
}

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
        console.log('KV updated successfully with new calibrated wallets.');
    } else {
        console.error('Failed to update KV:', await response.text());
    }
}

async function main() {
    console.log('Starting wallet calibration...');
    const scores = {};

    for (const addr of initialWallets) {
        try {
            console.log(`Fetching transactions for ${addr}...`);
            const txs = await fetchWalletTransactions(addr);
            const score = calculateWalletScore(txs);
            scores[addr] = score;
            console.log(`${addr}: Score ${score}`);
        } catch (e) {
            console.error(`Error processing ${addr}:`, e);
        }
    }

    // فیلتر کردن ولت‌های با امتیاز بالا
    const highScoreWallets = Object.entries(scores)
        .filter(([addr, score]) => score >= 7) // آستانه
        .map(([addr, score]) => addr);

    console.log('High score wallets:', highScoreWallets);

    // ذخیره در KV
    await updateKVWithSmartWallets(highScoreWallets);

    console.log('Calibration finished.');
}

main().catch(console.error);