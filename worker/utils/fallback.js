// worker/utils/fallback.js
// SOURCE_FOR: FALLBACK
// SOURCE_FOR: DEPLOY

import { PROVIDERS, HEALTH_KEY_PREFIX, HEALTH_COOLDOWN_MS } from './providers.js';
import { TokenBucket } from './ratelimiter.js';
// تغییر: تابع getLogger را مستقیم import نکنید، فقط کلاس Logger را import کنید
import { Logger } from './logger.js'; // تغییر نام از getLogger به Logger
import { getConfig } from './config.js';

const MAX_RETRIES = 3;
const BASE_BACKOFF = 1000; // ms
const JITTER_FACTOR = 0.1; // 10%

// تابع کمکی برای گرفتن نمونه Logger
function getLogger(env) {
    return new Logger(env); // فرض بر این است که کلاس Logger یک سازنده با env دارد
}

export async function isProviderHealthy(providerName, env) {
    const key = `${HEALTH_KEY_PREFIX}${providerName}`;
    const state = await env.MY_KV.get(key);
    if (!state) return true;
    
    const parsedState = JSON.parse(state);
    if (parsedState.healthy) return true;
    
    if (Date.now() > parsedState.nextCheck) {
        // زمان کول‌داون گذشته، دوباره بررسی می‌شود
        await env.MY_KV.delete(key);
        return true;
    }
    
    return false;
}

export async function markProviderUnhealthy(providerName, env, cooldownMs = HEALTH_COOLDOWN_MS) {
    const key = `${HEALTH_KEY_PREFIX}${providerName}`;
    const state = {
        healthy: false,
        nextCheck: Date.now() + cooldownMs
    };
    await env.MY_KV.put(key, JSON.stringify(state), { expirationTtl: Math.ceil(cooldownMs / 1000) + 3600 });
}

function getProviderBucket(env, provider) {
    const bucketKey = `bucket_${provider.name}`;
    return new TokenBucket(env, bucketKey, provider.ratePerSec, provider.ratePerSec * 2);
}

export async function callWithFallback(spec, env) {
    const config = await getConfig(env);
    // تغییر: اضافه کردن method و body به spec
    const { type, chain = 'ethereum', params = {}, timeout = 10000, method = 'GET', body = null } = spec;
    
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
            getLogger(env).log('DEBUG', `Skipping unhealthy provider: ${provider.name}`); // اصلاح
            continue;
        }

        const bucket = getProviderBucket(env, provider);
        const canConsume = await bucket.consume(1);
        if (!canConsume) {
            getLogger(env).log('DEBUG', `Rate limit exceeded for ${provider.name}, skipping.`); // اصلاح
            continue;
        }

        let attempt = 0;
        while (attempt < MAX_RETRIES) {
            try {
                getLogger(env).log('DEBUG', `Trying ${provider.name} for ${type} on ${chain}, attempt ${attempt + 1}/${MAX_RETRIES}`); // اصلاح
                // تغییر: ارسال method و body نیز به buildProviderUrl
                const { url, headers: extraHeaders } = buildProviderUrl(provider, spec, params, env); // اصلاح
                const headers = { ...buildHeaders(provider, env), ...extraHeaders }; // اصلاح
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                // تغییر: استفاده از method و body
                const response = await fetch(url, {
                    method: method,
                    headers,
                    signal: controller.signal,
                    body: body ? JSON.stringify(body) : undefined // فقط اگر body وجود داشت
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const data = await response.json();
                    getLogger(env).log('DEBUG', `Success with ${provider.name}`); // اصلاح
                    return { data, provider: provider.name, source: url };
                } else if (response.status === 429) {
                    getLogger(env).log('WARN', `${provider.name} returned 429. Marking as unhealthy.`); // اصلاح
                    await markProviderUnhealthy(provider.name, env, config.fallback?.provider_cooldown_ms || HEALTH_COOLDOWN_MS);
                    break;
                } else {
                    getLogger(env).log('WARN', `${provider.name} returned ${response.status}.`); // اصلاح
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (e) {
                lastError = e;
                getLogger(env).log('ERROR', `Attempt ${attempt + 1} failed with ${provider.name}: ${e.message}`); // اصلاح

                if (e.name === 'AbortError') {
                    getLogger(env).log('WARN', `${provider.name} request timed out.`); // اصلاح
                }

                attempt++;
                if (attempt < MAX_RETRIES) {
                    const backoff = BASE_BACKOFF * Math.pow(2, attempt - 1);
                    const jitter = backoff * JITTER_FACTOR * Math.random();
                    const delay = backoff + jitter;
                    getLogger(env).log('DEBUG', `Retrying in ${delay}ms...`); // اصلاح
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        if (attempt === MAX_RETRIES) {
            getLogger(env).log('WARN', `${provider.name} failed after ${MAX_RETRIES} attempts. Marking as unhealthy.`); // اصلاح
            await markProviderUnhealthy(provider.name, env, config.fallback?.provider_cooldown_ms || HEALTH_COOLDOWN_MS);
        }
    }

    getLogger(env).log('ERROR', `All providers failed for ${type} on ${chain}. Last error: ${lastError?.message || 'unknown'}`); // اصلاح
    throw new Error(`All providers failed for ${type} on ${chain}. Last error: ${lastError?.message || 'unknown'}`);
}

// اصلاح شده:
function buildProviderUrl(provider, spec, params, env) {
    // spec شامل type, chain, endpoint, url, method, body می‌شود
    // اگر spec.url وجود داشت، از آن استفاده کن (مثلاً برای Dune)
    if (spec.url) {
        // برای POSTها (مثل Dune execute) نیاز به headerهای اضافی ممکن است
        let extraHeaders = {};
        if (spec.method === 'POST' && spec.type === 'dune_query') {
            extraHeaders = { 'Content-Type': 'application/json' };
        }
        // spec.url قبلاً کامل ساخته شده است، فقط params را اضافه نکن
        // اگر spec.params یا body نیاز بود، قبلاً در spec تعریف شده‌اند
        return { url: spec.url, headers: extraHeaders };
    }

    // اگر spec.url نبود، از منطق قبلی استفاده کن
    if (provider.name === 'CoinGecko' && spec.type === 'price') {
        const ids = params.ids || 'bitcoin,ethereum';
        const vs_currencies = params.vs_currencies || 'usd';
        return { url: `${provider.url}/simple/price?ids=${ids}&vs_currencies=${vs_currencies}`, headers: {} };
    }
    
    if (provider.name === 'Etherscan' && spec.type === 'tx') {
        const address = params.address;
        const startBlock = params.startBlock || 0;
        return { url: `${provider.url}?module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=99999999&sort=asc`, headers: {} };
    }
    
    // پشتیبانی از endpoint عمومی
    const endpoint = spec.endpoint || '';
    const queryString = new URLSearchParams(params).toString();
    const separator = queryString ? '?' : '';
    const url = `${provider.url}${endpoint}${separator}${queryString}`;
    
    return { url, headers: {} };
}

function buildHeaders(provider, env) {
    const headers = {
        'User-Agent': 'TokenHunter/1.0'
    };
    
    if (provider.params.key_env && env[provider.params.key_env]) {
        if (provider.name.includes('Etherscan') || provider.name.includes('BscScan')) {
            headers['X-API-KEY'] = env[provider.params.key_env];
        } else if (provider.name === 'Helius') {
            headers['Authorization'] = `Bearer ${env[provider.params.key_env]}`;
        } else if (provider.name.includes('CoinGecko')) {
             // CoinGecko معمولاً نیاز به کلید ندارد، اما اگر داشت:
             // headers['X-Cg-Demo-Api-Key'] = env[provider.params.key_env];
             // یا برای APIهای دیگر که از این فرمت استفاده می‌کنند
             headers['X-Dune-API-Key'] = env[provider.params.key_env]; // مثال برای Dune
        } else {
            // برای سایر APIها که کلید را به صورت دیگری می‌خواهند
            headers['Authorization'] = `Bearer ${env[provider.params.key_env]}`;
        }
    }
    
    return headers;
}
