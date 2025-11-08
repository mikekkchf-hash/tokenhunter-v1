// worker/telegram_sender.js
// PATCHED FOR REGIME - DO NOT REMOVE - integrated by Qwen
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

import { TokenBucket } from './utils/ratelimiter.js';
import { getConfig } from './utils/config.js';
import { getLogger } from './utils/logger.js';

// تابع اصلی ارسال (همان قبلی، اما با اضافه کردن چک محدودیت)
export async function sendTelegramAlert(message, env) {
    const config = await getConfig(env);

    // 1. چک محدودیت تعداد پیام
    const rl = new TokenBucket(env, 'telegram_alerts_rate_limit', config.max_alerts_per_hour / 3600, config.max_alerts_per_hour);
    const canSend = await rl.consume(1);

    if (!canSend) {
        getLogger(env).log('WARN', 'Telegram alert rate limit exceeded. Skipping message.', { message });
        return false;
    }

    // 2. ارسال پیام اصلی
    const telegramUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: env.TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            }),
        });

        if (response.ok) {
            getLogger(env).log('INFO', 'Telegram alert sent successfully.', { message });
            return true;
        } else {
            const errorData = await response.json();
            getLogger(env).log('ERROR', 'Failed to send Telegram alert.', errorData);
            // اگر تلگرام شکست خورد، فعالیت اضطراری را فراخوانی کن
            await sendAlertWithFallback(message, env, 'telegram');
            return false;
        }
    } catch (e) {
        getLogger(env).log('ERROR', 'Exception while sending Telegram alert.', e);
        await sendAlertWithFallback(message, env, 'telegram');
        return false;
    }
}

// تابع جدید: ارسال فعالیت اضطراری
export async function sendAlertWithFallback(message, env, primaryChannel) {
    const config = await getConfig(env);
    const fallbackChain = config.alert.fallback_chain;

    if (!fallbackChain || !Array.isArray(fallbackChain)) {
        console.error("No fallback chain defined in config.");
        return;
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
            }
        } catch (e) {
            console.error(`Fallback via ${channel} failed:`, e);
            continue; // سعی در کانال بعدی
        }

        if (success) {
            console.log(`Fallback alert successful via ${channel}.`);
            getLogger(env).log('INFO', `Fallback alert sent via ${channel}`, { message });
            break; // اولین موفقیت کافی است
        }
    }
}

// تابع کمکی: ارسال به Discord
async function sendToDiscord(message, env) {
    if (!env.DISCORD_WEBHOOK_URL) {
        console.log("Discord webhook URL not set, skipping.");
        return false;
    }
    try {
        const response = await fetch(env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: `🚨 **TokenHunter Alert (Fallback from ${env.TELEGRAM_BOT_TOKEN ? 'Telegram' : 'Unknown'})**\n${message.replace(/<[^>]*>/g, '')}` // حذف تگ‌های HTML
            }),
        });
        return response.ok;
    } catch (e) {
        console.error("Error sending to Discord:", e);
        return false;
    }
}

// تابع کمکی: ایجاد Issue در GitHub
async function createGitHubIssue(message, env) {
    if (!env.GITHUB_PERSONAL_TOKEN || !env.GITHUB_REPO_OWNER || !env.GITHUB_REPO_NAME) {
        console.log("GitHub credentials not set, skipping.");
        return false;
    }
    try {
        const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${env.GITHUB_PERSONAL_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: `🚨 TokenHunter Fallback Alert - ${new Date().toISOString()}`,
                body: message
            }),
        });
        return response.ok;
    } catch (e) {
        console.error("Error creating GitHub issue:", e);
        return false;
    }
}