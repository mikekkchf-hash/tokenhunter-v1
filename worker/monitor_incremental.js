// worker/monitor_incremental.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

import { callWithFallback } from './utils/fallback.js';
import { getLogger } from './utils/logger.js';
import { getConfig } from './utils/config.js';
import { sendTelegramAlert } from './telegram_sender.js'; // برای ارسال هشدار فعالیت کیف

// تابع اصلی مانیتور افزایشی
export async function pollWalletsIncremental(env, config) {
    console.log("🔍 Starting incremental wallet monitor...");

    // 1. گرفتن لیست کیف‌های کالیبره از KV
    let calibratedWallets = [];
    try {
        const walletsStr = await env.MY_KV.get('calibrated_wallets');
        if (walletsStr) {
            calibratedWallets = JSON.parse(walletsStr);
        } else {
            console.log("No calibrated wallets found in KV. Skipping monitor.");
            return;
        }
    } catch (e) {
        console.error("Error fetching calibrated wallets from KV:", e);
        getLogger(env).log('ERROR', 'Failed to fetch calibrated wallets for monitor', e);
        return;
    }

    console.log(`Found ${calibratedWallets.length} calibrated wallets to monitor.`);

    // 2. گرفتن آخرین بلاک دیده‌شده برای هر کیف (یا مقدار دهی اولیه)
    const lastSeenBlocks = await getLastSeenBlocks(env, calibratedWallets);

    // 3. پال هر کیف
    for (const wallet of calibratedWallets) {
        console.log(`Polling wallet ${wallet}...`);
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
                }
            };

            const result = await callWithFallback(spec, env);
            newTxs = result.data.result || [];

        } catch (e) {
            console.error(`Error fetching txs for wallet ${wallet}:`, e);
            getLogger(env).log('ERROR', `Failed to fetch txs for wallet ${wallet}`, e);
            continue; // سعی بعدی
        }

        if (newTxs.length > 0) {
            console.log(`Found ${newTxs.length} new txs for wallet ${wallet}. Processing...`);
            // 4. پردازش تراکنش‌های جدید
            for (const tx of newTxs) {
                await processNewTx(tx, wallet, env, config);
            }
            // 5. به‌روزرسانی آخرین بلاک دیده‌شده
            const latestBlock = Math.max(...newTxs.map(t => parseInt(t.blockNumber)));
            await env.MY_KV.put(`last_seen_block_${wallet}`, latestBlock.toString());
        } else {
            console.log(`No new txs for wallet ${wallet}.`);
        }
    }
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
    if (tx.to === tx.from) return; // تراکنش داخلی

    // فرض: فقط خرید/فروش توکن (توکن‌های ERC-20)
    // برای سادگی، اگر `input` غیر از 0x باشد، ممکن است یک تراکنش توکن باشد
    // برای شناسایی دقیق، باید ABI قرارداد `to` را چک کرد.
    // در اینجا فقط یک نمونه ساده بررسی می‌کنیم.
    const isTokenTx = tx.input && tx.input.length > 2; // 0x

    if (isTokenTx) {
        // ممکن است یک خرید/فروش باشد
        // توجه: برای تشخیص دقیق، باید `input` را دیکد کرد و تابع `transfer` را پیدا کرد.
        // برای سادگی، فقط یک هشدار کلی می‌دهیم.
        const tokenAddress = tx.to; // فرض: قرارداد توکن
        const action = tx.from === wallet.toLowerCase() ? 'SELL' : 'BUY'; // فرض: اگر از کیف ما بود، فروش است
        console.log(`Potential ${action} detected on token ${tokenAddress} by wallet ${wallet}.`);

        // چک کردن کول‌داون (Cooldown) برای جلوگیری از اسپم
        const fingerprint = `${wallet}_${tokenAddress}_${action}_${Math.floor(Date.now() / (config.monitor.cooldown_sec * 1000))}`;
        const cooldownKey = `alert_cooldown_${fingerprint}`;
        const existingCooldown = await env.MY_KV.get(cooldownKey);
        if (existingCooldown) {
            console.log(`Alert cooldown active for ${fingerprint}. Skipping.`);
            return;
        }

        // ایجاد پیام و ارسال
        const alertMessage = `<b>🚨 SMART ${action}! 🐋</b>\n` +
            `<b>Wallet:</b> <code>${wallet.slice(0, 6)}...${wallet.slice(-4)}</code>\n` +
            `<b>Token:</b> <code>${tokenAddress}</code>\n` +
            `<b>Action:</b> ${action}\n` +
            `<b>TX Hash:</b> <code>${tx.hash}</code>\n` +
            `🔗 <a href="https://etherscan.io/tx/${tx.hash}">View Transaction</a>`;

        await sendTelegramAlert(alertMessage, env);

        // تنظیم کول‌داون
        await env.MY_KV.put(cooldownKey, '1', { expirationTtl: config.monitor.cooldown_sec });
    }
    // می‌توان اقدامات بیشتری برای تراکنش‌های ETH ساده یا سایر انواع انجام داد.
}