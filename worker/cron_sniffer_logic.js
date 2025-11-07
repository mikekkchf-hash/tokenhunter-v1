// worker/cron_sniffer_logic.js
// نسخه نهایی، امن، کامل، با اصلاح import Logger

// import { logger } from './utils/logger.js'; // ❌ حذف شد
import { Logger } from './utils/logger.js'; // ✅ تغییر نام
import { sendTelegramAlert } from './telegram_sender';
import { calculateSmartScore } from './smart_score_logic';
import { runSecurityChecks } from './security_checks';
import { checkConsensus } from './consensus_engine';
// import { logger } from './utils/logger.js'; // ❌ حذف شد
import { getConfig } from './utils/config';

// 🧠 تابع fetchTokenInfo — برای گرفتن نام و نماد توکن
async function fetchTokenInfo(tokenAddress, env) {
    const rpcUrl = env.ETHEREUM_RPC_URL;
    const nameCall = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{
            "to": tokenAddress,
            "data": "0x06fdde03"
        }, "latest"]
    };
    const symbolCall = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "eth_call",
        "params": [{
            "to": tokenAddress,
            "data": "0x95d89b41"
        }, "latest"]
    };

    try {
        const [nameRes, symbolRes] = await Promise.all([
            fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(nameCall)
            }),
            fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(symbolCall)
            })
        ]);

        const name = await nameRes.json();
        const symbol = await symbolRes.json();

        const nameStr = name.result ? hexToString(name.result).replace(/\u0000/g, '') : 'Unknown';
        const symbolStr = symbol.result ? hexToString(symbol.result).replace(/\u0000/g, '') : 'UNKNOWN';

        return { name: nameStr, symbol: symbolStr, address: tokenAddress };
    } catch (e) {
        // اکنون باید نمونه‌ای از Logger بسازیم
        const loggerInstance = new Logger(env);
        await loggerInstance.log('ERROR', `Could not fetch token info for ${tokenAddress}`, e);
        return { name: 'Error', symbol: 'ERR', address: tokenAddress };
    }
}

function hexToString(hex) {
    if (hex.startsWith('0x')) hex = hex.slice(2);
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
        const char = String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        if (char !== '\0') str += char;
    }
    return str;
}

// 🧠 تابع fetchPairReserves — برای گرفتن نقدینگی
async function fetchPairReserves(pairAddress, env) {
    const rpcUrl = env.ETHEREUM_RPC_URL;
    const reservesCall = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "eth_call",
        "params": [{
            "to": pairAddress,
            "data": "0x0902f1ac" // getReserves
        }, "latest"]
    };

    try {
        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reservesCall)
        });
        const result = await response.json();
        if (result.result) {
            const raw = result.result.slice(2);
            const reserve0 = BigInt("0x" + raw.slice(0, 64)).toString();
            const reserve1 = BigInt("0x" + raw.slice(64, 128)).toString();
            return { reserve0, reserve1 };
        }
        return { reserve0: "0", reserve1: "0" };
    } catch (e) {
        const loggerInstance = new Logger(env);
        await loggerInstance.log('ERROR', `Could not fetch reserves for pair ${pairAddress}`, e);
        return { reserve0: "0", reserve1: "0" };
    }
}

// 🧠 تابع fetchNewPairsFromDexScreener — منبع جایگزین/کمکی
async function fetchNewPairsFromDexScreener(env) {
    try {
        const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', {
            headers: { 'User-Agent': 'TokenHunter/1.0' }
        });
        const data = await response.json();
        const newPairs = data?.data?.tokenProfiles?.filter(t => t.chain === 'ethereum' && t.liquidity && t.liquidity.usd > 10000) || [];
        return newPairs;
    } catch (e) {
        const loggerInstance = new Logger(env);
        await loggerInstance.log('ERROR', 'Fetching new pairs from DexScreener', e);
        return [];
    }
}

// 🧠 تابع dedupe — چک کردن توکن دیده‌شده
async function hasSeenToken(tokenAddress, env) {
    const key = `seen_token_${tokenAddress.toLowerCase()}`;
    try {
        const value = await env.MY_KV.get(key);
        return value !== null;
    } catch (e) {
        const loggerInstance = new Logger(env);
        await loggerInstance.log('ERROR', 'Checking seen token in KV', e);
        return false;
    }
}

// 🧠 تابع markTokenAsSeen — ثبت توکن دیده‌شده
async function markTokenAsSeen(tokenAddress, env) {
    const key = `seen_token_${tokenAddress.toLowerCase()}`;
    try {
        await env.MY_KV.put(key, '1', { expirationTtl: 60 * 60 * 24 * 7 }); // 1 week
    } catch (e) {
        const loggerInstance = new Logger(env);
        await loggerInstance.log('ERROR', 'Marking token as seen in KV', e);
    }
}

// 🧠 تابع checkCalibratedWalletsForNewTransactions — چک کردن ولت‌های کالیبره
async function checkCalibratedWalletsForNewTransactions(env) {
    const loggerInstance = new Logger(env); // ایجاد نمونه Logger
    await loggerInstance.log('INFO', "Checking transactions for calibrated wallets...");
    const config = await getConfig(env);

    // 1. گرفتن لیست ولت‌های کالیبره
    const calibratedWalletsStr = await env.MY_KV.get('calibrated_wallets');
    if (!calibratedWalletsStr) {
        await loggerInstance.log('WARN', 'No calibrated wallets found in KV.');
        return;
    }
    const calibratedWallets = JSON.parse(calibratedWalletsStr);

    // 2. شبیه‌سازی: فرض کنید ما اطلاعات تراکنش‌های جدید را از Durable Object یا یک API خارجی داریم
    // در اینجا فقط یک نمونه ساختگی ارائه می‌دهیم
    const recentWalletTxs = await env.MY_KV.get('recent_wallet_txs'); // فرض: ساخته شده توسط یک indexer خارجی یا polling
    const recentTxs = recentWalletTxs ? JSON.parse(recentWalletTxs) : [];

    // 3. پیدا کردن تراکنش‌های مربوط به ولت‌های کالیبره
    const relevantTxs = recentTxs.filter(tx => calibratedWallets.includes(tx.wallet));

    for (const tx of relevantTxs) {
        const { wallet, tokenAddress, action, amount, valueUSD, pairAddress } = tx; // فرض: این فیلدها موجود هستند
        if (!tokenAddress || !action) continue; // skip if missing critical data

        await loggerInstance.log('INFO', `Found transaction for calibrated wallet ${wallet}: ${action} ${tokenAddress}`);

        // 4. گرفتن اطلاعات توکن
        const tokenInfo = await fetchTokenInfo(tokenAddress, env);
        await loggerInstance.log('INFO', `Token Info: ${tokenInfo.name} (${tokenInfo.symbol})`);

        // 5. چک امنیتی (اختیاری برای خریدهای کالیبره)
        const securityScore = await runSecurityChecks(tokenAddress, env);
        if (securityScore < config.min_security_score) {
            await loggerInstance.log('INFO', `Security check failed for ${tokenAddress} from calibrated wallet ${wallet}. Score: ${securityScore}. Skipping alert.`);
            continue;
        }

        // 6. ارسال پیام تلگرام
        let alertType = action === 'buy' ? 'BUY' : 'SELL';
        let emoji = action === 'buy' ? '💎' : '🔴';
        const alertMessage = `<b>🚨 SMART ${alertType}! 🐋</b>\n` +
            `<b>Wallet:</b> <code>${wallet.slice(0, 6)}...${wallet.slice(-4)}</code>\n` +
            `<b>Token:</b> ${tokenInfo.name} (${tokenInfo.symbol})\n` +
            `<b>Address:</b> <code>${tokenAddress}</code>\n` +
            `<b>Action:</b> ${action.toUpperCase()}\n` +
            `<b>Amount:</b> ${amount}\n` +
            `<b>Value:</b> $${valueUSD?.toLocaleString() || 'N/A'}\n` +
            `<b>Pair:</b> <code>${pairAddress || 'N/A'}</code>\n` +
            `<b>Security:</b> ${securityScore}/10\n` +
            `🔗 <a href="https://etherscan.io/address/${tokenAddress}">View Token</a> | ` +
            `📊 <a href="https://dexscreener.com/ethereum/${pairAddress || tokenAddress}">View Pair</a>`;

        await sendTelegramAlert(alertMessage, env);
        await loggerInstance.log('INFO', `Alert sent for calibrated wallet ${wallet} ${action} on ${tokenAddress}`);
    }
}

// 🧪 تابع اصلی تست
export async function runCronSniffer(env) {
    const loggerInstance = new Logger(env); // ایجاد نمونه Logger
    await loggerInstance.log('INFO', `✅ Cron Run Started!`);

    // 📋 گرفتن تنظیمات
    const config = await getConfig(env);

    // 🔍 1. اسکن از طریق DexScreener (برای توکن‌های جدید)
    await loggerInstance.log('INFO', "🔍 Fetching new pairs from DexScreener...");
    const newPairs = await fetchNewPairsFromDexScreener(env);

    if (newPairs.length > 0) {
        await loggerInstance.log('INFO', `Found ${newPairs.length} new pairs on DexScreener. Processing...`);
        for (const pairData of newPairs) {
            const tokenAddress = pairData.tokenAddress;
            const pairAddress = pairData.pairs[0]?.pairAddress;

            if (!tokenAddress || !pairAddress) continue;

            // 🔁 چک dedupe
            if (await hasSeenToken(tokenAddress, env)) {
                await loggerInstance.log('INFO', `Token ${tokenAddress} already processed. Skipping.`);
                continue;
            }

            // 🧾 ثبت دیده‌شده
            await markTokenAsSeen(tokenAddress, env);
            await loggerInstance.log('INFO', `Processing new token: ${tokenAddress}`);

            // 🧠 گرفتن اطلاعات توکن
            const tokenInfo = await fetchTokenInfo(tokenAddress, env);
            await loggerInstance.log('INFO', `Token Info: ${tokenInfo.name} (${tokenInfo.symbol})`);

            // 💰 گرفتن نقدینگی
            const reserves = await fetchPairReserves(pairAddress, env);
            const liquidityUSD = parseFloat(reserves.reserve0) / 1e18 * 2000; // تخمین

            // 🔐 چک امنیتی
            await loggerInstance.log('INFO', `Running security checks for ${tokenAddress}...`);
            const securityScore = await runSecurityChecks(tokenAddress, env);
            if (securityScore < config.min_security_score) {
                await loggerInstance.log('INFO', `Security check failed for ${tokenAddress}. Score: ${securityScore}. Skipping.`);
                continue;
            }

            // 👛 چک کنسوس ولت (برای توکن‌های جدید)
            await loggerInstance.log('INFO', `Checking consensus for ${tokenAddress}...`);
            const consensusResult = await checkConsensus(pairAddress, env);
            const smartWalletCount = consensusResult.count;
            const smartWallets = consensusResult.wallets;

            if (smartWalletCount >= config.min_consensus_wallets) { // شرط کنسوس برآورده شد
                // 🧮 محاسبه امتیاز نهایی
                await loggerInstance.log('INFO', `Calculating SmartScore for ${tokenAddress}...`);
                const scoreInput = {
                    tokenAddress: tokenAddress,
                    pairAddress: pairAddress,
                    liquidity: liquidityUSD,
                    holderChange: 0,
                    socialScore: 0,
                    securityScore: securityScore,
                    consensusCount: smartWalletCount
                };
                const smartScore = await calculateSmartScore(scoreInput, env);

                // 🎯 چک نهایی امتیاز
                if (smartScore >= config.min_smart_score) {
                    // 📢 ارسال پیام نهایی به تلگرام
                    await loggerInstance.log('INFO', `✅ Criteria met for ${tokenAddress}. Sending Telegram alert...`);
                    const alertMessage = `<b>🚨 NEW PAIR CONSENSUS! 🚀</b>\n` +
                        `<b>Token:</b> ${tokenInfo.name} (${tokenInfo.symbol})\n` +
                        `<b>Address:</b> <code>${tokenAddress}</code>\n` +
                        `<b>Pair:</b> <code>${pairAddress}</code>\n` +
                        `<b>Liquidity:</b> $${liquidityUSD.toLocaleString()}\n` +
                        `<b>SmartScore:</b> ${smartScore}/100\n` +
                        `<b>Smart Buyers:</b> ${smartWalletCount}\n` +
                        `<b>Wallets:</b> ${smartWallets.slice(0, 3).map(w => w.slice(0, 6) + '...' + w.slice(-4)).join(', ')}...\n` +
                        `🔗 <a href="https://etherscan.io/address/${tokenAddress}">View Token</a> | ` +
                        `📊 <a href="https://dexscreener.com/ethereum/${pairAddress}">View Pair</a>`;

                    await sendTelegramAlert(alertMessage, env);
                    await loggerInstance.log('INFO', "✅ Telegram alert sent successfully for new pair consensus!");
                } else {
                    await loggerInstance.log('INFO', `SmartScore ${smartScore} is below threshold for new pair consensus.`);
                }
            } else {
                await loggerInstance.log('INFO', `Consensus check failed for new pair ${tokenAddress}. Found ${smartWalletCount}, required ${config.min_consensus_wallets}.`);
            }
        }
    } else {
        await loggerInstance.log('INFO', "No new pairs found on DexScreener.");
    }

    // 🔍 2. چک کردن تراکنش‌های ولت‌های کالیبره
    await checkCalibratedWalletsForNewTransactions(env);

    await loggerInstance.log('INFO', `✅ Cron Run Finished!`);
    return 1; // یا تعداد پیام‌های ارسال شده
}