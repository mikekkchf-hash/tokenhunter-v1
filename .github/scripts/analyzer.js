// .github/scripts/analyzer.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// تابع گرفتن لیست توکن‌های سودده از فایل
function loadProfitableTokens() {
    const filePath = path.join(__dirname, '..', '..', 'data', 'profitable_tokens.csv');
    if (!fs.existsSync(filePath)) {
        console.log(`File ${filePath} not found. Using empty list.`);
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').slice(1); // بدون هدر
    return lines.filter(line => line.trim() !== '').map(line => {
        const [token_symbol, chain, contract_address, roi_30d_pct, roi_90d_pct, market_cap_usd, last_checked_iso, source] = line.split(',');
        return {
            token_symbol,
            chain,
            contract_address,
            roi_30d_pct: parseFloat(roi_30d_pct),
            roi_90d_pct: parseFloat(roi_90d_pct),
            market_cap_usd: parseFloat(market_cap_usd),
            last_checked_iso,
            source
        };
    });
}

// تابع محاسبه PnL یک کیف برای یک توکن
async function calculateWalletPnL(walletAddress, tokenAddress, etherscanKey) {
    try {
        const url = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${tokenAddress}&address=${walletAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${etherscanKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== '1') {
            console.error(`[Etherscan Error for ${walletAddress} on ${tokenAddress}]:`, data.message);
            return 0;
        }

        const transactions = data.result;
        let totalBuyAmount = 0;
        let totalSellAmount = 0;
        let totalBuyValue = 0;
        let totalSellValue = 0;

        for (const tx of transactions) {
            const value = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal));
            // فرض: قیمت خرید/فروش نامشخص است، فقط حجم را محاسبه می‌کنیم.
            // در عمل، باید قیمت در زمان تراکنش گرفته شود.
            if (tx.from.toLowerCase() === walletAddress.toLowerCase()) {
                // این یک فروش است
                totalSellAmount += value;
            } else if (tx.to.toLowerCase() === walletAddress.toLowerCase()) {
                // این یک خرید است
                totalBuyAmount += value;
            }
        }

        // PnL ساده: مقدار فروش - مقدار خرید
        const pnl = totalSellAmount - totalBuyAmount;
        console.log(`Wallet ${walletAddress} on ${tokenAddress}: Bought ${totalBuyAmount}, Sold ${totalSellAmount}, PnL: ${pnl}`);
        return pnl;

    } catch (e) {
        console.error(`Error calculating PnL for ${walletAddress} on ${tokenAddress}:`, e);
        return 0;
    }
}

// تابع اصلی تحلیل
async function runAnalyzer() {
    console.log('🧮 Running wallet analyzer...');
    const config = {
        etherscan_api_key: process.env.ETHERSCAN_API_KEY,
        output_file: path.join(__dirname, '..', '..', 'data', 'smart_wallets.csv'),
        min_pnl_threshold: 10, // فرض: حداقل PnL مثبت معنادار
        top_wallets_count: 20
    };

    const tokens = loadProfitableTokens();
    if (tokens.length === 0) {
        console.log("No profitable tokens to analyze. Skipping.");
        return [];
    }

    const allPnls = {};

    for (const token of tokens) {
        if (!token.contract_address || token.contract_address === 'NATIVE') continue; // فقط توکن‌های ERC20

        console.log(`Analyzing token: ${token.token_symbol} (${token.contract_address})`);
        // 1. گرفتن لیست تراکنش‌ها برای پیدا کردن کیف‌ها
        // این کار معمولاً از The Graph یا یک indexer سفارشی انجام می‌شود.
        // برای سادگی، ما فقط می‌توانیم از Etherscan تراکنش‌های اخیر یک توکن را بگیریم، اما این کار پرهزینه است.
        // روش رایج‌تر: گرفتن لیست `holders` از Covalent یا The Graph.
        // در اینجا، فقط یک فرآیند ساختگی انجام می‌دهیم.

        // فرض: ما یک لیست کیف‌هایی که در این توکن فعالیت داشته‌اند را از جایی داریم (مثلاً از Worker یا یک indexer)
        // برای مثال، یک لیست سفت از کیف‌های فرضی می‌سازیم.
        // در عمل، این بخش پیچیده است.
        const sampleWallets = [
            "0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8",
            "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
            // ... بقیه
        ];

        for (const wallet of sampleWallets) {
            const pnl = await calculateWalletPnL(wallet, token.contract_address, config.etherscan_api_key);
            if (pnl > config.min_pnl_threshold) { // فقط کیف‌های سودده
                allPnls[wallet] = (allPnls[wallet] || 0) + pnl;
            }
        }
    }

    // 3. رتبه‌بندی کیف‌ها
    const sortedWallets = Object.entries(allPnls)
        .sort((a, b) => b[1] - a[1]) // نزولی
        .slice(0, config.top_wallets_count);

    console.log('\n--- Top Calibrated Wallets ---');
    sortedWallets.forEach(([wallet, pnl], index) => {
        console.log(`${index + 1}. ${wallet}: ${pnl.toFixed(2)}`);
    });

    const topWalletsList = sortedWallets.map(([wallet, _]) => wallet);

    // 4. ذخیره در CSV
    const csvHeader = 'wallet_address,chain,tokens_held,successful_trades,avg_roi_pct,score,last_activity_iso,is_exchange_candidate,evidence_link';
    const csvRows = topWalletsList.map((addr, i) => `${addr},ethereum,"[]",0,0,${(sortedWallets[i][1]).toFixed(2)},${new Date().toISOString()},false,N/A`);
    const csvContent = [csvHeader, ...csvRows].join('\n');

    const dataDir = path.dirname(config.output_file);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(config.output_file, csvContent);
    console.log(`✅ Smart wallets saved to ${config.output_file}`);

    return topWalletsList;
}

if (require.main === module) {
    runAnalyzer().catch(console.error);
}

module.exports = { runAnalyzer };
