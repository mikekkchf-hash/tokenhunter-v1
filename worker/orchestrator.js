// worker/orchestrator.js
// SOURCE_FOR: DEPLOY
// این فایل، ماژول‌های مختلف را به هم متصل می‌کند و جریان اصلی برنامه را مدیریت می‌کند

import { detectMarketRegime } from './market_regime.js';
import { decideSafeMode } from './safe_mode_manager.js';
import { pollWalletsIncremental } from './monitor_incremental.js';
import { sendTelegramAlert } from './telegram_sender.js';
import { fetchNewPairsFromDexScreener } from './cron_sniffer_logic.js'; // توجه: این تابع باید از cron_sniffer_logic.js export شود
import { checkConsensus } from './consensus_engine.js';
import { runSecurityChecks } from './security_checks.js';
import { calculateSmartScore } from './smart_score_logic.js';
import { getConfig } from './utils/config.js';
import { logger } from './utils/logger.js';

// تابع اصلی ارکستراسیون
export async function orchestrateRun(env) {
    try {
        // 1. گرفتن تنظیمات
        const config = await getConfig(env);
        
        // 2. تشخیص حالت بازار
        logger.log('INFO', 'Starting orchestration run...');
        logger.log('INFO', 'Step 1: Detecting market regime...');
        const marketRegime = await detectMarketRegime({ cfg: config, env });
        logger.log('INFO', `Market regime detected: ${marketRegime.regime}`);

        // 3. تصمیم‌گیری حالت ایمن
        logger.log('INFO', 'Step 2: Deciding safe mode...');
        const safeMode = decideSafeMode(marketRegime.regime, marketRegime.metrics, config, env);
        
        if (safeMode.safeMode) {
            logger.log('WARN', 'Safe mode is active. Sending daily summary only.');
            const summaryMessage = `<b>🛡️ Daily Summary (Safe Mode Active)</b>\n` +
                `<b>Regime:</b> ${marketRegime.regime}\n` +
                `<b>Actions:</b> ${safeMode.actions.join(', ')}\n` +
                `<b>Time:</b> ${new Date().toISOString()}`;
            await sendTelegramAlert(summaryMessage, env, config);
            return 1; // فقط یک پیام خلاصه ارسال شد
        }

        // 4. اسکن توکن‌های جدید
        logger.log('INFO', 'Step 3: Fetching new pairs from DexScreener...');
        const newPairs = await fetchNewPairsFromDexScreener(env);
        logger.log('INFO', `Found ${newPairs.length} new pairs from DexScreener.`);

        // 5. پردازش توکن‌های جدید
        let alertsSent = 0;
        if (newPairs.length > 0) {
            logger.log('INFO', 'Step 4: Processing new pairs...');
            for (const pairData of newPairs) {
                const tokenAddress = pairData.tokenAddress;
                const pairAddress = pairData.pairs[0]?.pairAddress;

                if (!tokenAddress || !pairAddress) continue;

                // انجام تحلیل‌های لازم برای توکن جدید
                const tokenInfo = await fetchTokenInfo(tokenAddress, env);
                const reserves = await fetchPairReserves(pairAddress, env);
                const liquidityUSD = parseFloat(reserves.reserve0) / 1e18 * 2000;
                const securityScore = await runSecurityChecks(tokenAddress, env);
                const consensusResult = await checkConsensus(pairAddress, env);

                // محاسبه امتیاز نهایی
                const scoreInput = {
                    tokenAddress,
                    pairAddress,
                    liquidity: liquidityUSD,
                    securityScore,
                    consensusCount: consensusResult.count,
                    regime: marketRegime
                };
                
                const smartScore = await calculateSmartScore(scoreInput, env);
                
                if (smartScore >= config.min_smart_score) {
                    // ارسال پیام هشدار
                    const alertMessage = `<b>🚨 NEW PAIR CONSENSUS! 🚀</b>\n` +
                        `<b>Token:</b> ${tokenInfo.name} (${tokenInfo.symbol})\n` +
                        `<b>Address:</b> <code>${tokenAddress}</code>\n` +
                        `<b>Pair:</b> <code>${pairAddress}</code>\n` +
                        `<b>Liquidity:</b> $${liquidityUSD.toLocaleString()}\n` +
                        `<b>SmartScore:</b> ${smartScore}/100\n` +
                        `<b>Smart Buyers:</b> ${consensusResult.count}\n` +
                        `<b>Regime:</b> ${marketRegime.regime}\n` +
                        `🔗 <a href="https://etherscan.io/address/${tokenAddress}">View Token</a> | ` +
                        `📊 <a href="https://dexscreener.com/ethereum/${pairAddress}">View Pair</a>`;
                    
                    await sendTelegramAlert(alertMessage, env, config);
                    alertsSent++;
                }
            }
        }

        // 6. مانیتور کردن ولت‌های کالیبره
        logger.log('INFO', 'Step 5: Monitoring calibrated wallets...');
        await pollWalletsIncremental(env, config);

        logger.log('INFO', `✅ Orchestration completed. Total alerts sent: ${alertsSent}`);
        return alertsSent;
        
    } catch (e) {
        logger.log('ERROR', 'Orchestration failed', e);
        // در صورت خطا، حالت ایمن فعال می‌شود
        const safeMode = {
            safeMode: true,
            actions: ['emergency_mode'],
            multipliers: { risk: 0.5, opportunity: 2.0 }
        };
        
        const errorMessage = `<b>🚨 EMERGENCY MODE ACTIVATED</b>\n` +
            `Orchestration failed with error: ${e.message}\n` +
            `Time: ${new Date().toISOString()}`;
        
        await sendTelegramAlert(errorMessage, env);
        return 0;
    }
}