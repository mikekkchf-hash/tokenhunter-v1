// worker/utils/fallback.js
// PATCHED FOR RESILIENCE - DO NOT REMOVE - integrated by Qwen

import { isProviderHealthy, markProviderUnhealthy, getProviderBucket, PROVIDERS } from './providers.js';
import { getLogger } from './logger.js';
import { getConfig } from './config.js';

const MAX_RETRIES = 3;
const BASE_BACKOFF = 1000; // ms
const JITTER_FACTOR = 0.1; // 10%

export async function callWithFallback(spec, env) {
    const { type, chain = 'ethereum', params, timeout = 10000, endpoint } = spec;
    const config = await getConfig(env);

    let providersList = PROVIDERS[type];
    if (chain && PROVIDERS[type] && PROVIDERS[type][chain]) {
        providersList = PROVIDERS[type][chain];
    }

    if (!providersList) {
        throw new Error(`No providers defined for type: ${type}, chain: ${chain}`);
    }

    let lastError;
    for (const provider of providersList) {
        if (!await isProviderHealthy(provider.name, env)) {
            console.log(`Skipping unhealthy provider: ${provider.name}`);
            continue;
        }

        const bucket = getProviderBucket(env, provider);
        // تلاش برای گرفتن یک توکن از bucket
        const canConsume = await bucket.consume(1);
        if (!canConsume) {
            console.log(`Rate limit exceeded for ${provider.name}, skipping.`);
            continue; // سعی در ارائه‌دهنده بعدی
        }

        let attempt = 0;
        while (attempt < MAX_RETRIES) {
            try {
                console.log(`Trying ${provider.name} for ${type} on ${chain}, attempt ${attempt + 1}/${MAX_RETRIES}`);

                const url = buildProviderUrl(provider, spec);
                const headers = {};
                if (provider.key && env[provider.key]) {
                    // توجه: نحوه ارسال کلید ممکن است بسته به API متفاوت باشد (هدر، پارامتر URL و ...)
                    headers['X-API-Key'] = env[provider.key];
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                const response = await fetch(url, {
                    method: 'GET', // برای سادگی، فقط GET در نظر گرفته شده
                    headers,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    console.log(`Success with ${provider.name}`);
                    return { data, provider: provider.name, source: url };
                } else if (response.status === 429) {
                    console.warn(`${provider.name} returned 429. Marking as unhealthy.`);
                    await markProviderUnhealthy(provider.name, env, config.fallback.provider_cooldown_ms || 300000);
                    break; // از این ارائه‌دهنده خارج شو
                } else {
                    console.warn(`${provider.name} returned ${response.status}.`);
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (e) {
                lastError = e;
                console.error(`Attempt ${attempt + 1} failed with ${provider.name}:`, e.message);

                if (e.name === 'AbortError') {
                    console.warn(`${provider.name} request timed out.`);
                }

                attempt++;
                if (attempt < MAX_RETRIES) {
                    const backoff = BASE_BACKOFF * Math.pow(2, attempt - 1); // exponential
                    const jitter = backoff * JITTER_FACTOR * Math.random(); // jitter
                    const delay = backoff + jitter;
                    console.log(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        if (attempt === MAX_RETRIES) {
            console.warn(`${provider.name} failed after ${MAX_RETRIES} attempts. Marking as unhealthy.`);
            await markProviderUnhealthy(provider.name, env, config.fallback.provider_cooldown_ms || 300000);
        }
    }

    // اگر همه ارائه‌دهندگان شکست خوردند
    console.error(`All providers failed for ${type} on ${chain}. Last error:`, lastError);
    throw new Error(`All providers failed for ${type} on ${chain}. Last error: ${lastError.message}`);
}

function buildProviderUrl(provider, spec) {
    // بسته به نوع درخواست (price, tx, etc.) URL را بساز
    // این تابع نیاز به پیاده‌سازی کامل بر اساس هر API دارد
    // مثال ساده:
    if (provider.name === 'CoinGecko' && spec.type === 'price') {
        const ids = spec.params.ids || 'bitcoin,ethereum';
        const vs_currencies = spec.params.vs_currencies || 'usd';
        return `${provider.url}/simple/price?ids=${ids}&vs_currencies=${vs_currencies}`;
    }
    if (provider.name === 'Etherscan' && spec.type === 'tx') {
        const address = spec.params.address;
        const startBlock = spec.params.startBlock || 0;
        return `${provider.url}?module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=99999999&sort=asc&apikey=${spec.apiKey || ''}`;
    }
    // ... دیگر موارد
    // فرض کلی:
    return `${provider.url}${spec.endpoint || ''}?${new URLSearchParams(spec.params || {}).toString()}`;
}