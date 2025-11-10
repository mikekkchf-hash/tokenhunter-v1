// worker/monitor_incremental.js
// SOURCE_FOR: MONITOR_INCREMENTAL
// SOURCE_FOR: DEPLOY

import { callWithFallback } from './utils/fallback.js';
import { logger } from './utils/logger.js';
import { getConfig } from './utils/config.js';
import { sendTelegramAlert } from './telegram_sender.js';

// تابع اصلی مانیتور افزایشی
export async function pollWalletsIncremental(env, config) {
    logger.log('INFO', '🔍 Starting incremental wallet monitor...');
    
    // 1. گرفتن لیست کیف‌های کالیبره از KV
    let calibratedWallets = [];
    try {
        const walletsStr = await env.MY_KV.get('calibrated_wallets');
        if (walletsStr) {
            calibratedWallets = JSON.parse(walletsStr);
            logger.log('INFO', `Found ${calibratedWallets.length} calibrated wallets to monitor.`);
        } else {
            logger.log('WARN', 'No calibrated wallets found in KV. Skipping monitor.');
            return;
        }
    } catch (e) {
        logger.log('ERROR', 'Failed to fetch calibrated wallets from KV', e);
        return;
    }

    // 2. گرفتن آخرین بلاک دیده‌شده برای هر کیف
    const lastSeenBlocks = await getLastSeenBlocks(env, calibratedWallets);

    // 3. پال هر کیف
    for (const wallet of calibratedWallets) {
        logger.log('DEBUG', `Polling wallet ${wallet}...`);
        const lastBlock = lastSeenBlocks[wallet] || 0;
        let newTxs = [];

        try {
            // فرض: فقط برای ETH
            const spec = {
                type: 'tx',
                chain: 'ethereum',
                params: {
                    address: wallet,
                    startblock: lastBlock + 1, // فقط از آخرین بلاک دیده‌شده به بعد
                    endblock: 99999999, // تا آخر
                    sort: 'asc'
                },
                timeout: 15000
            };

            const result = await callWithFallback(spec, env);
            newTxs = result.data.result || [];

            logger.log('DEBUG', `Found ${newTxs.length} new txs for wallet ${wallet}.`);

        } catch (e) {
            logger.log('ERROR', `Error fetching txs for wallet ${wallet}`, e);
            continue; // سعی بعدی
        }

        if (newTxs.length > 0) {
            logger.log('INFO', `Processing ${newTxs.length} new txs for wallet ${wallet}.`);
            // 4. پردازش تراکنش‌های جدید
            for (const tx of newTxs) {
                await processNewTx(tx, wallet, env, config);
            }
            // 5. به‌روزرسانی آخرین بلاک دیده‌شده
            const latestBlock = Math.max(...newTxs.map(t => parseInt(t.blockNumber)));
            await env.MY_KV.put(`last_seen_block_${wallet}`, latestBlock.toString());
            logger.log('INFO', `Updated last seen block for ${wallet} to ${latestBlock}.`);
        } else {
            logger.log('DEBUG', `No new txs for wallet ${wallet}.`);
        }
    }
    
    logger.log('INFO', '✅ Incremental wallet monitor completed.');
}

// تابع کمکی: گرفتن آخرین بلاک دیده‌شده برای هر کیف
async function getLastSeenBlocks(env, wallets) {
    const lastSeen = {};
    for (const wallet of wallets) {
        const key = `last_seen_block_${wallet}`;
        const blockNum = await env.MY_KV.get(key);
        lastSeen[wallet] = blockNum ? parseInt(blockNum) : 0;
    }
    return lastSeen;
}

// تابع کمکی: پردازش یک تراکنش جدید
async function processNewTx(tx, wallet, env, config) {
    // فرض: فقط تراکنش‌های خارجی (to != from)
    if (tx.to === tx.from) {
        logger.log('DEBUG', `Skipping internal tx ${tx.hash} for wallet ${wallet}.`);
        return;
    }

    // فرض: فقط خرید/فروش توکن (توکن‌های ERC-20)
    const isTokenTx = tx.input && tx.input.length > 2; // 0x

    if (isTokenTx) {
        // ممکن است یک خرید/فروش باشد
        // توجه: برای تشخیص دقیق، باید `input` را دیکد کرد و تابع `transfer` را پیدا کرد.
        const tokenAddress = tx.to; // فرض: قرارداد توکن
        const action = tx.from === wallet.toLowerCase() ? 'SELL' : 'BUY'; // فرض: اگر از کیف ما بود، فروش است
        logger.log('INFO', `Potential ${action} detected on token ${tokenAddress} by wallet ${wallet}.`);

        // چک کردن کول‌داون (Cooldown) برای جلوگیری از اسپم
        const configObj = await getConfig(env);
        const cooldownSec = configObj.alert?.cooldown_sec || 1800; // 30 دقیقه پیش‌فرض
        const fingerprint = `${wallet}_${tokenAddress}_${action}_${Math.floor(Date.now() / (cooldownSec * 1000))}`;
        const cooldownKey = `alert_cooldown_${fingerprint}`;
        const existingCooldown = await env.MY_KV.get(cooldownKey);
        
        if (existingCooldown) {
            logger.log('DEBUG', `Alert cooldown active for ${fingerprint}. Skipping.`);
            return;
        }

        // ایجاد پیام و ارسال
        const alertMessage = `<b>🚨 SMART ${action}! 🐋</b>\n` +
            `<b>Wallet:</b> <code>${wallet.slice(0, 6)}...${wallet.slice(-4)}</code>\n` +
            `<b>Token:</b> <code>${tokenAddress}</code>\n` +
            `<b>Action:</b> ${action}\n` +
            `<b>TX Hash:</b> <code>${tx.hash}</code>\n` +
            `🔗 <a href="https://etherscan.io/tx/${tx.hash}">View Transaction</a>`;

        await sendTelegramAlert(alertMessage, env, configObj);

        // تنظیم کول‌داون
        await env.MY_KV.put(cooldownKey, '1', { expirationTtl: cooldownSec });
        logger.log('INFO', `Alert sent for ${action} on token ${tokenAddress} by wallet ${wallet}. Cooldown set for ${cooldownSec} seconds.`);
    }
}