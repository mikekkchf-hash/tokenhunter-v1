// worker/telegram_sender.js

import { TokenBucket } from './utils/ratelimiter.js';
import { getConfig } from './utils/config.js';
import { getLogger } from './utils/logger.js';
// حذف import callWithFallback
// import { callWithFallback } from './utils/fallback.js';

// تابع اصلی ارسال (حذف callWithFallback و استفاده مستقیم از fetch)
export async function sendTelegramAlert(message, env, configOverride) {
    const config = configOverride || await getConfig(env);
    const logger = getLogger(env); // گرفتن نمونه logger

    // --- اضافه شده: چاپ مقادیر برای دیباگ ---
    logger.log('DEBUG', 'sendTelegramAlert called with:', { chatId: env.TELEGRAM_CHAT_ID, botTokenExists: !!env.TELEGRAM_BOT_TOKEN, message: message.substring(0, 50) + '...' });
    // ----------------------------

    // 1. چک محدودیت تعداد پیام (غیرفعال شده برای تست)
    // const rl = new TokenBucket(env, 'telegram_alerts_rate_limit',
    //     config.alert?.max_per_hour / 3600 || 0.001388,
    //     config.alert?.max_per_hour || 5
    // );
    //
    // const canSend = await rl.consume(1);
    //
    // if (!canSend) {
    //     logger.log('WARN', 'Telegram alert rate limit exceeded. Skipping message.', { message });
    //     return false;
    // }

    // 2. ارسال پیام اصلی مستقیماً با fetch
    try {
        const telegramUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        const payload = {
            chat_id: env.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        };

        logger.log('DEBUG', 'Calling fetch for Telegram API...'); // لاگ قبل از تماس
        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        logger.log('DEBUG', 'Telegram API fetch completed.'); // لاگ بعد از تماس

        const result = await response.json();
        logger.log('DEBUG', 'Telegram API response:', result); // لاگ پاسخ

        if (result.ok) {
             logger.log('INFO', 'Telegram alert sent successfully according to API response.', { message });
             return true;
        } else {
             logger.log('ERROR', 'Telegram API responded with error:', result);
             throw new Error(`Telegram API Error: ${result.description || 'Unknown error'}`);
        }

    } catch (e) {
        logger.log('ERROR', 'Failed to send Telegram alert.', e);
        // در صورت شکست، فعالیت اضطراری را فراخوانی کن
        // توجه: این تابع الان در همین فایل تعریف خواهد شد
        await sendAlertWithFallback(message, env, 'telegram');
        return false;
    }
}

// تابع جدید: ارسال فعالیت اضطراری (همان قبلی، اما تغییراتی اضافه می‌کنیم)
export async function sendAlertWithFallback(message, env, primaryChannel) {
    const config = await getConfig(env);
    // اطمینان از اینکه زنجیره وجود دارد
    const fallbackChain = config.alert?.fallback_chain || ['discord', 'github_issue'];

    if (!fallbackChain || !Array.isArray(fallbackChain)) {
        console.error("No fallback chain defined in config.");
        return false; // تغییر: برگرداندن false
    }

    // حذف کانال اصلی از زنجیره
    const remainingChannels = fallbackChain.filter(ch => ch !== primaryChannel);

    for (const channel of remainingChannels) {
        console.log(`Attempting fallback alert via ${channel}...`);
        let success = false;
        try {
            if (channel === 'discord') {
                success = await sendToDiscord(message, env);
            } else if (channel === 'github_issue') {
                success = await createGitHubIssue(message, env);
            } else {
                console.warn(`Unknown fallback channel: ${channel}`);
                continue; // سعی در کانال بعدی
            }
        } catch (e) {
            console.error(`Fallback via ${channel} failed:`, e);
            continue; // سعی در کانال بعدی
        }

        if (success) {
            console.log(`Fallback alert successful via ${channel}.`);
            getLogger(env).log('INFO', `Fallback alert sent via ${channel}`, { message });
            return true; // تغییر: برگرداندن true در صورت موفقیت
        }
    }

    console.error('All fallback channels failed.');
    getLogger(env).log('ERROR', 'All fallback channels failed', { message });
    return false; // تغییر: برگرداندن false در صورت شکست همه
}

// تابع کمکی: ارسال به Discord (همان قبلی)
async function sendToDiscord(message, env) {
    if (!env.DISCORD_WEBHOOK_URL) {
        console.log("Discord webhook URL not set, skipping.");
        return false;
    }
    try {
        const discordPayload = {
            content: `🚨 **TokenHunter Alert (Fallback from ${env.TELEGRAM_BOT_TOKEN ? 'Telegram' : 'Unknown'})**\n${message.replace(/<[^>]*>/g, '')}`
        };

        const response = await fetch(env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordPayload)
        });

        return response.ok;
    } catch (e) {
        console.error("Error sending to Discord:", e);
        return false;
    }
}

// تابع کمکی: ایجاد Issue در GitHub (همان قبلی)
async function createGitHubIssue(message, env) {
    if (!env.GITHUB_PERSONAL_TOKEN || !env.GITHUB_REPO_OWNER || !env.GITHUB_REPO_NAME) {
        console.log("GitHub credentials not set, skipping.");
        return false;
    }
    try {
        const githubPayload = {
            title: `🚨 TokenHunter Fallback Alert - ${new Date().toISOString()}`,
            body: message
        };

        const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${env.GITHUB_PERSONAL_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(githubPayload)
        });

        return response.ok;
    } catch (e) {
        console.error("Error creating GitHub issue:", e);
        return false;
    }
}