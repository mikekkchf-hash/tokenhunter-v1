// .github/scripts/analyzer.v2.js
// SOURCE_FOR: ANALYZER
// SOURCE_FOR: DEPLOY

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { computeWalletScore } = require('../../worker/scoring_regime_aware.js');
const { callWithFallback } = require('../../worker/utils/fallback.js');
const { logger } = require('../../worker/utils/logger.js');

// تابع محاسبه PnL دقیق برای یک ولت در یک توکن
async function calculateWalletPnLAccurate(walletAddress, tokenAddress, env) {
    try {
        // 1. دریافت تمام تراکنش‌های مرتبط با این ولت و توکن
        const spec = {
            type: 'tx',
            chain: 'ethereum',
            params: {
                address: walletAddress,
                contractaddress: tokenAddress,
                startblock: 0,
                endblock: 99999999,
                sort: 'asc'
            },
            timeout: 30000 // 30 ثانیه برای درخواست‌های سنگین
        };
        
        const result = await callWithFallback(spec, env);
        const transactions = result.data.result || [];
        
        if (transactions.length === 0) {
            return {
                grossPnL: 0,
                netExpectedReturn: 0,
                tradesCount: 0,
                avgROIPct: 0
            };
        }
        
        // 2. جدا کردن خریدها و فروش‌ها
        const buys = transactions.filter(tx => 
            tx.to.toLowerCase() === walletAddress.toLowerCase() && 
            tx.value !== '0'
        );
        
        const sells = transactions.filter(tx => 
            tx.from.toLowerCase() === walletAddress.toLowerCase() && 
            tx.value !== '0'
        );
        
        // 3. گرفتن سری قیمتی برای دوره تراکنش‌ها (در محیط واقعی از CoinGecko)
        const prices = await getHistoricalPriceSeries(tokenAddress, 
            Math.min(...transactions.map(tx => parseInt(tx.timeStamp))),
            Math.max(...transactions.map(tx => parseInt(tx.timeStamp))), 
            env
        );
        
        // 4. محاسبه PnL
        let totalBuyUSD = 0;
        let totalSellUSD = 0;
        let totalFeesUSD = 0;
        let totalSlippageUSD = 0;
        
        for (const tx of buys) {
            const timestamp = parseInt(tx.timeStamp) * 1000;
            const priceUSD = getClosestPrice(prices, timestamp);
            const value = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal || 18));
            const valueUSD = value * priceUSD;
            
            totalBuyUSD += valueUSD;
            totalFeesUSD += 1; // برآورد ساده هزینه گس
            totalSlippageUSD += valueUSD * 0.005; // برآورد 0.5% لغزش
        }
        
        for (const tx of sells) {
            const timestamp = parseInt(tx.timeStamp) * 1000;
            const priceUSD = getClosestPrice(prices, timestamp);
            const value = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal || 18));
            const valueUSD = value * priceUSD;
            
            totalSellUSD += valueUSD;
            totalFeesUSD += 1; // برآورد ساده هزینه گس
            totalSlippageUSD += valueUSD * 0.005; // برآورد 0.5% لغزش
        }
        
        const grossPnL = totalSellUSD - totalBuyUSD;
        const netPnL = grossPnL - totalFeesUSD - totalSlippageUSD;
        const avgROIPct = grossPnL / totalBuyUSD * 100;
        
        return {
            grossPnL,
            netPnL,
            netExpectedReturn: netPnL / totalBuyUSD * 100,
            tradesCount: buys.length + sells.length,
            avgROIPct,
            lastActivity: new Date(Math.max(...transactions.map(tx => parseInt(tx.timeStamp) * 1000))).toISOString(),
            tokensHeld: calculateTokensHeld(buys, sells)
        };
        
    } catch (e) {
        logger.log('ERROR', `Error calculating PnL for ${walletAddress} on ${tokenAddress}`, e);
        return {
            grossPnL: 0,
            netPnL: 0,
            netExpectedReturn: 0,
            tradesCount: 0,
            avgROIPct: 0,
            lastActivity: new Date().toISOString(),
            tokensHeld: 0
        };
    }
}

// توابع کمکی (در محیط واقعی باید پیاده‌سازی کامل شوند)
async function getHistoricalPriceSeries(tokenAddress, startTimestamp, endTimestamp, env) {
    // اینجا باید از APIهای قیمت استفاده شود
    return [1000, 1050, 1100, 1150, 1200]; // مقادیر ساختگی
}

function getClosestPrice(prices, timestamp) {
    // پیدا کردن نزدیک‌ترین قیمت به timestamp
    return prices[0]; // در محیط واقعی باید هوشمندانه‌تر باشد
}

function calculateTokensHeld(buys, sells) {
    // محاسبه مقدار فعلی توکن‌های در دست
    return buys.length - sells.length;
}

// تابع اصلی تحلیلگر
async function runAnalyzer(env = process.env) {
    logger.log('INFO', 'Starting advanced wallet analyzer...');
    
    // 1. خواندن توکن‌های سودده از فایل
    const tokensFile = path.join(__dirname, '..', '..', 'data', 'profitable_tokens.csv');
    if (!fs.existsSync(tokensFile)) {
        logger.log('ERROR', 'Profitable tokens file not found');
        return [];
    }
    
    const tokensContent = fs.readFileSync(tokensFile, 'utf8');
    const tokensList = tokensContent.split('\n').slice(1)
        .filter(line => line.trim())
        .map(line => {
            const [token_symbol, chain, contract_address, roi_30d_pct, roi_90d_pct, market_cap_usd] = line.split(',');
            return {
                token_symbol,
                chain,
                contract_address,
                roi_30d_pct: parseFloat(roi_30d_pct),
                roi_90d_pct: parseFloat(roi_90d_pct),
                market_cap_usd: parseFloat(market_cap_usd)
            };
        })
        .filter(token => token.contract_address && token.contract_address !== 'NATIVE');
    
    logger.log('INFO', `Found ${tokensList.length} profitable tokens to analyze`);
    
    // 2. پردازش هر توکن و پیدا کردن ولت‌های فعال
    const allWalletStats = {};
    
    for (const token of tokensList) {
        logger.log('INFO', `Analyzing token: ${token.token_symbol} (${token.contract_address})`);
        
        // در محیط واقعی، اینجا باید لیست ولت‌های فعال در این توکن دریافت شود
        // برای سادگی مثال، یک لیست ساختگی استفاده می‌کنیم
        const sampleWallets = [
            "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
            "0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8",
            "0x28c6c06298d514db089934071355e5743bf21d60"
        ];
        
        for (const wallet of sampleWallets) {
            const pnlStats = await calculateWalletPnLAccurate(wallet, token.contract_address, env);
            
            if (!allWalletStats[wallet]) {
                allWalletStats[wallet] = {
                    totalGrossPnL: 0,
                    totalNetPnL: 0,
                    totalTrades: 0,
                    avgROIPct: 0,
                    tokensWithActivity: [],
                    lastActivity: pnlStats.lastActivity
                };
            }
            
            allWalletStats[wallet].totalGrossPnL += pnlStats.grossPnL;
            allWalletStats[wallet].totalNetPnL += pnlStats.netPnL;
            allWalletStats[wallet].totalTrades += pnlStats.tradesCount;
            allWalletStats[wallet].tokensWithActivity.push({
                token: token.contract_address,
                symbol: token.token_symbol,
                netReturn: pnlStats.netExpectedReturn,
                trades: pnlStats.tradesCount
            });
            
            if (pnlStats.lastActivity > allWalletStats[wallet].lastActivity) {
                allWalletStats[wallet].lastActivity = pnlStats.lastActivity;
            }
        }
    }
    
    // 3. امتیازدهی نهایی به ولت‌ها
    const walletScores = [];
    
    for (const [walletAddress, stats] of Object.entries(allWalletStats)) {
        // محاسبه میانگین ROI
        const avgROIPct = stats.totalGrossPnL > 0 ? 
            (stats.totalGrossPnL / stats.totalTrades) : 0;
        
        // شبیه‌سازی داده‌های فنی و بنیادی
        const techSignals = {
            social_volume: 50, // برآورد ساختگی
            rsi: 60 // برآورد ساختگی
        };
        
        const fundamentalFlags = {
            security_score: 8, // برآورد ساختگی
            holder_change_pct: stats.tokensWithActivity.length * 10 // برآورد ساختگی
        };
        
        const tokenMeta = {
            liquidity_usd: 1000000, // برآورد ساختگی
            chain: 'ethereum'
        };
        
        // در محیط واقعی، حالت بازار باید دریافت شود
        const regimeInfo = {
            regime: 'NEUTRAL',
            multipliers: {
                risk: 1.0,
                opportunity: 1.0
            }
        };
        
        // محاسبه امتیاز
        const score = computeWalletScore(
            { consensus_count: stats.tokensWithActivity.length, avg_roi_pct: avgROIPct },
            tokenMeta,
            techSignals,
            fundamentalFlags,
            regimeInfo,
            {}
        );
        
        walletScores.push({
            wallet_address: walletAddress,
            chain: 'ethereum',
            net_flow_usd: stats.totalNetPnL,
            avg_roi_pct: avgROIPct,
            score: score.score0to10,
            last_activity_iso: stats.lastActivity,
            tokens_held: JSON.stringify(stats.tokensWithActivity),
            is_exchange_candidate: false,
            evidence_link: `https://etherscan.io/address/${walletAddress}`
        });
    }
    
    // 4. مرتب‌سازی و فیلتر
    walletScores.sort((a, b) => b.score - a.score);
    const topWallets = walletScores.slice(0, 20); // برگرداندن 20 ولت برتر
    
    logger.log('INFO', `Found ${topWallets.length} top calibrated wallets`);
    
    // 5. ذخیره در فایل CSV
    const csvHeader = 'wallet_address,chain,net_flow_usd,avg_roi_pct,score,last_activity_iso,tokens_held,is_exchange_candidate,evidence_link';
    const csvRows = topWallets.map(w => 
        `${w.wallet_address},${w.chain},${w.net_flow_usd},${w.avg_roi_pct},${w.score},${w.last_activity_iso},${JSON.stringify(w.tokens_held).replace(/,/g, ';')},${w.is_exchange_candidate},${w.evidence_link}`
    );
    
    const csvContent = [csvHeader, ...csvRows].join('\n');
    const outputDir = path.join(__dirname, '..', '..', 'data');
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(outputDir, 'smart_wallets.csv'), csvContent);
    logger.log('INFO', 'Smart wallets saved to data/smart_wallets.csv');
    
    // 6. ذخیره در فایل JSON برای آپلود به KV
    fs.writeFileSync(path.join(outputDir, 'smart_wallets.json'), JSON.stringify(topWallets, null, 2));
    logger.log('INFO', 'Smart wallets JSON saved to data/smart_wallets.json');
    
    // 7. ذخیره وضعیت آخرین بلاک
    const lastSeen = {
        lastChecked: new Date().toISOString(),
        version: '2.0'
    };
    
    fs.writeFileSync(path.join(outputDir, 'last_seen_analyzer.json'), JSON.stringify(lastSeen, null, 2));
    logger.log('INFO', 'Last seen state saved to data/last_seen_analyzer.json');
    
    return topWallets;
}

if (require.main === module) {
    runAnalyzer().catch(console.error);
}

module.exports = { runAnalyzer };
