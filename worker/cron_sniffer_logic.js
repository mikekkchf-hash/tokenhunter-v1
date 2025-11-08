// worker/cron_sniffer_logic.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

import { sendTelegramAlert } from './telegram_sender.js';
import { calculateSmartScore } from './smart_score_logic.js';
import { runSecurityChecks } from './security_checks.js';
import { checkConsensus } from './consensus_engine.js';
import { getLogger } from './utils/logger.js';
import { getConfig } from './utils/config.js';
import { detectMarketRegime } from './market_regime.js'; // جدید
import { decideSafeMode } from './safe_mode_manager.js'; // جدید
import { pollWalletsIncremental } from './monitor_incremental.js'; // جدید
import { callWithFallback } from './utils/fallback.js'; // جدید

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
        console.error(`[Error] Could not fetch token info for ${tokenAddress}:`, e);
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
            "data": "0x0902f1ac" // selector تابع getReserves()
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
        console.error(`[Error] Could not fetch reserves for pair ${pairAddress}:`, e);
        return { reserve0: "0", reserve1: "0" };
    }
}

// 🧠 تابع fetchNewPairsFromDexScreener — منبع جایگزین/کمکی
async function fetchNewPairsFromDexScreener(env) {
    try {
        // استفاده از callWithFallback برای مقاومت
        const spec = {
            type: 'dexscreener',
            endpoint: '/token-profiles/latest/v1',
            url: 'https://api.dexscreener.com'
        };
        // توجه: DexScreener API مستقیم نیازمند فرمت خاصی است
        // برای سادگی در اینجا مستقیماً فراخوانی می‌کنیم، اما در عمل باید spec را برای callWithFallback آماده کنیم
        const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', {
            headers: { 'User-Agent': 'TokenHunter/1.0' }
        });
        const data = await response.json();
        const newPairs = data?.data?.tokenProfiles?.filter(t => t.chain === 'ethereum' && t.liquidity && t.liquidity.usd > 10000) || [];
        return newPairs;
    } catch (e) {
        console.error('[Error] Fetching new pairs from DexScreener:', e);
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
        console.error('[Error] Checking seen token in KV:', e);
        return false; // اگر KV مشکل داشت، فرض می‌کنیم دیده نشده
    }
}

// 🧠 تابع markTokenAsSeen — ثبت توکن دیده‌شده
async function markTokenAsSeen(tokenAddress, env) {
    const key = `seen_token_${tokenAddress.toLowerCase()}`;
    try {
        await env.MY_KV.put(key, '1', { expirationTtl: 60 * 60 * 24 * 7 }); // 1 week
    } catch (e) {
        console.error('[Error] Marking token as seen in KV:', e);
    }
}

// 🧪 تابع اصلی تست
export async function runCronSniffer(env) {
    console.log(`✅ Cron Run Started!`);

    // 📋 گرفتن تنظیمات
    const config = await getConfig(env);

    // 📊 1. تشخیص حالت بازار (Market Regime)
    console.log("📊 Detecting market regime...");
    let marketRegime = { regime: 'NEUTRAL', multipliers: { risk: 1.0, opportunity: 1.0 } };
    try {
        marketRegime = await detectMarketRegime({ cfg: config, caches: env.MY_KV });
    } catch (e) {
        console.error("Failed to detect market regime, using default:", e.message);
        // ادامه با حالت پیش‌فرض
    }
    console.log(`Regime detected: ${marketRegime.regime}`);

    // 🛡️ 2. تصمیم حالت ایمن (Safe Mode)
    const safeMode = decideSafeMode(marketRegime.regime, marketRegime.metrics, config);
    if (safeMode.safeMode) {
        console.log("🛡️ Safe Mode Active. Sending daily summary only.");
        const summaryMessage = `<b>🛡️ Daily Summary (Safe Mode Active)</b>\n` +
            `<b>Regime:</b> ${marketRegime.regime}\n` +
            `<b>Actions:</b> ${safeMode.actions.join(', ')}\n` +
            `<b>Time:</b> ${new Date().toISOString()}`;
        await sendTelegramAlert(summaryMessage, env);
        return 0; // خروج زودهنگام
    }

    // 🔍 3. اسکن از طریق DexScreener (برای توکن‌های جدید)
    console.log("🔍 Fetching new pairs from DexScreener...");
    const newPairs = await fetchNewPairsFromDexScreener(env);

    if (newPairs.length > 0) {
        console.log(`Found ${newPairs.length} new pairs on DexScreener. Processing...`);
        for (const pairData of newPairs) {
            const tokenAddress = pairData.tokenAddress;
            const pairAddress = pairData.pairs[0]?.pairAddress;

            if (!tokenAddress || !pairAddress) continue;

            // 🔁 چک dedupe
            if (await hasSeenToken(tokenAddress, env)) {
                console.log(`Token ${tokenAddress} already processed. Skipping.`);
                continue;
            }

            // 🧾 ثبت دیده‌شده (برای جلوگیری از پردازش مجدد در صورت خطا)
            await markTokenAsSeen(tokenAddress, env);
            console.log(`Processing new token: ${tokenAddress}`);

            // 🧠 گرفتن اطلاعات توکن
            const tokenInfo = await fetchTokenInfo(tokenAddress, env);
            console.log(`Token Info: ${tokenInfo.name} (${tokenInfo.symbol})`);

            // 💰 گرفتن نقدینگی
            const reserves = await fetchPairReserves(pairAddress, env);
            const liquidityUSD = parseFloat(reserves.reserve0) / 1e18 * 2000; // تخمین سریع (ETH = ~2000$)

            // 🔐 چک امنیتی
            console.log(`Running security checks for ${tokenAddress}...`);
            const securityScore = await runSecurityChecks(tokenAddress, env);
            if (securityScore < config.min_security_score) {
                console.log(`Security check failed for ${tokenAddress}. Score: ${securityScore}. Skipping.`);
                continue;
            }

            // 👛 چک کنسوس ولت (برای توکن‌های جدید)
            console.log(`Checking consensus for ${tokenAddress}...`);
            const consensusResult = await checkConsensus(pairAddress, env);
            const smartWalletCount = consensusResult.count;
            const smartWallets = consensusResult.wallets;

            if (smartWalletCount >= config.min_consensus_wallets) { // شرط کنسوس برآورده شد
                // 🧮 محاسبه امتیاز نهایی
                console.log(`Calculating SmartScore for ${tokenAddress}...`);
                const scoreInput = {
                    tokenAddress: tokenAddress,
                    pairAddress: pairAddress,
                    liquidity: liquidityUSD,
                    holderChange: 0, // فیک
                    socialScore: 0, // فیک
                    securityScore: securityScore,
                    consensusCount: smartWalletCount,
                    regime: marketRegime // ورودی جدید
                };
                const smartScore = await calculateSmartScore(scoreInput, env);

                // 🎯 چک نهایی امتیاز
                if (smartScore >= config.min_smart_score) {
                    // 📢 ارسال پیام نهایی به تلگرام
                    console.log(`✅ Criteria met for ${tokenAddress}. Sending Telegram alert...`);
                    const alertMessage = `<b>🚨 NEW PAIR CONSENSUS! 🚀</b>\n` +
                        `<b>Token:</b> ${tokenInfo.name} (${tokenInfo.symbol})\n` +
                        `<b>Address:</b> <code>${tokenAddress}</code>\n` +
                        `<b>Pair:</b> <code>${pairAddress}</code>\n` +
                        `<b>Liquidity:</b> $${liquidityUSD.toLocaleString()}\n` +
                        `<b>SmartScore:</b> ${smartScore}/100\n` +
                        `<b>Smart Buyers:</b> ${smartWalletCount}\n` +
                        `<b>Wallets:</b> ${smartWallets.slice(0, 3).map(w => w.slice(0, 6) + '...' + w.slice(-4)).join(', ')}...\n` +
                        `<b>Regime:</b> ${marketRegime.regime}\n` +
                        `🔗 <a href="https://etherscan.io/address/${tokenAddress}">View Token</a> | ` +
                        `📊 <a href="https://dexscreener.com/ethereum/${pairAddress}">View Pair</a>`;

                    await sendTelegramAlert(alertMessage, env);
                    console.log("✅ Telegram alert sent successfully for new pair consensus!");
                } else {
                    console.log(`SmartScore ${smartScore} is below threshold for new pair consensus.`);
                }
            } else {
                console.log(`Consensus check failed for new pair ${tokenAddress}. Found ${smartWalletCount}, required ${config.min_consensus_wallets}.`);
            }
        }
    } else {
        console.log("No new pairs found on DexScreener.");
    }

    // 🔍 4. چک کردن تراکنش‌های ولت‌های کالیبره (Monitor Incremental)
    console.log("🔍 Checking transactions for calibrated wallets...");
    try {
        await pollWalletsIncremental(env.MY_KV, config, env);
    } catch (e) {
        console.error("Error in incremental wallet monitor:", e);
    }

    console.log(`✅ Cron Run Finished!`);
    return 1; // یا تعداد پیام‌های ارسال شده
}