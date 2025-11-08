// worker/utils/providers.js
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

import { TokenBucket } from './ratelimiter.js';

// تعریف لیست اولویت‌بندی شده APIها
export const PROVIDERS = {
    price: [
        { name: 'CoinGecko', url: 'https://api.coingecko.com/api/v3', ratePerSec: 0.5, key: 'CG_API_KEY' }, // ~30/min
        { name: 'CoinPaprika', url: 'https://api.coinpaprika.com/v1', ratePerSec: 1, key: null },
        { name: 'CoinCap', url: 'https://api.coincap.io/v2', ratePerSec: 1, key: null },
    ],
    tx: {
        ethereum: [
            { name: 'Etherscan', url: 'https://api.etherscan.io/api', ratePerSec: 5, key: 'ETHERSCAN_API_KEY' }, // 5/s
            { name: 'Covalent', url: 'https://api.covalenthq.com/v1', ratePerSec: 1, key: 'COVALENT_KEY' },
            { name: 'Moralis', url: 'https://deep-index.moralis.io/api/v2', ratePerSec: 1, key: 'MORALIS_KEY' },
        ],
        bsc: [
            { name: 'BscScan', url: 'https://api.bscscan.com/api', ratePerSec: 5, key: 'BSCSCAN_KEY' },
            { name: 'Covalent', url: 'https://api.covalenthq.com/v1', ratePerSec: 1, key: 'COVALENT_KEY' },
        ]
    },
    // ... سایر دسته‌ها می‌توانند اضافه شوند
};

// حالت سلامت هر ارائه‌دهنده (در KV ذخیره می‌شود)
const HEALTH_KEY_PREFIX = 'provider_health_';
const COOLDOWN_MS = 300000; // 5 min default

// تابع چک سلامت از KV
export async function isProviderHealthy(providerName, env) {
    const key = `${HEALTH_KEY_PREFIX}${providerName}`;
    const state = await env.MY_KV.get(key);
    if (!state) return true; // فرض سالم بودن تا زمانی که یک بار چک نشده

    const parsedState = JSON.parse(state);
    if (parsedState.healthy) return true;
    if (Date.now() > parsedState.nextCheck) {
        // زمان کول‌داون گذشته، دوباره بررسی می‌شود (حالت را پاک می‌کنیم)
        await env.MY_KV.delete(key);
        return true;
    }
    return false;
}

// تابع علامت‌گذاری ارائه‌دهنده ناسالم
export async function markProviderUnhealthy(providerName, env, cooldownMs = COOLDOWN_MS) {
    const key = `${HEALTH_KEY_PREFIX}${providerName}`;
    const state = {
        healthy: false,
        nextCheck: Date.now() + cooldownMs
    };
    await env.MY_KV.put(key, JSON.stringify(state), { expirationTtl: Math.ceil(cooldownMs / 1000) + 3600 }); // کمی بیشتر از کول‌داون
}

// تابع دریافت bucket مربوط به یک ارائه‌دهنده
export function getProviderBucket(env, provider) {
    // یک کلید یکتا برای bucket هر ارائه‌دهنده
    const bucketKey = `bucket_${provider.name}`;
    // در اینجا فقط یک نمونه از TokenBucket برمی‌گردانیم، مدیریت واقعی باید پیچیده‌تر باشد
    // برای سادگی، فرض می‌کنیم یک bucket مستقل برای هر ارائه‌دهنده در KV مدیریت می‌شود
    return new TokenBucket(env, bucketKey, provider.ratePerSec, provider.ratePerSec * 2); // burst = 2s
}