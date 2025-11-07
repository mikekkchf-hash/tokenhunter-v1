// worker/telegram_sender.js

import { TokenBucket } from './utils/ratelimiter.js';

export async function sendTelegramAlert(message, env) {
    const logger = new (await import('./utils/logger.js')).Logger(env);
    const config = await (await import('./utils/config.js')).getConfig(env);

    // 1. چک محدودیت تعداد پیام
    const rl = new TokenBucket(env, 'telegram_alerts_rate_limit', config.max_alerts_per_hour / 3600, config.max_alerts_per_hour);
    const canSend = await rl.consume(1);

    if (!canSend) {
        logger.log('WARN', 'Telegram alert rate limit exceeded. Skipping message.', { message });
        return false;
    }

    // 2. ارسال پیام
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
            logger.log('INFO', 'Telegram alert sent successfully.', { message });
            return true;
        } else {
            const errorData = await response.json();
            logger.log('ERROR', 'Failed to send Telegram alert.', errorData);
            return false;
        }
    } catch (e) {
        logger.log('ERROR', 'Exception while sending Telegram alert.', e);
        return false;
    }
}