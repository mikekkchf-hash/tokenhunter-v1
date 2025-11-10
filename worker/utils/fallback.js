// worker/utils/fallback.js
// SOURCE_FOR: FALLBACK
// SOURCE_FOR: DEPLOY

import { PROVIDERS, HEALTH_KEY_PREFIX, HEALTH_COOLDOWN_MS } from './providers.js';
import { TokenBucket } from './ratelimiter.js';
import { getLogger } from './logger.js';
import { getConfig } from './config.js';

const MAX_RETRIES = 3;
const BASE_BACKOFF = 1000; // ms
const JITTER_FACTOR = 0.1; // 10%

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
    const { type, chain = 'ethereum', params = {}, timeout = 10000 } = spec;
    
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
            getLogger.log('DEBUG', `Skipping unhealthy provider: ${provider.name}`);
            continue;
        }

        const bucket = getProviderBucket(env, provider);
        const canConsume = await bucket.consume(1);
        if (!canConsume) {
            getLogger.log('DEBUG', `Rate limit exceeded for ${provider.name}, skipping.`);
            continue;
        }

        let attempt = 0;
        while (attempt < MAX_RETRIES) {
            try {
                getLogger.log('DEBUG', `Trying ${provider.name} for ${type} on ${chain}, attempt ${attempt + 1}/${MAX_RETRIES}`);
                const url = buildProviderUrl(provider, spec, params);
                const headers = buildHeaders(provider, env);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const data = await response.json();
                    getLogger.log('DEBUG', `Success with ${provider.name}`);
                    return { data, provider: provider.name, source: url };
                } else if (response.status === 429) {
                    getLogger.log('WARN', `${provider.name} returned 429. Marking as unhealthy.`);
                    await markProviderUnhealthy(provider.name, env, config.fallback?.provider_cooldown_ms || HEALTH_COOLDOWN_MS);
                    break;
                } else {
                    getLogger.log('WARN', `${provider.name} returned ${response.status}.`);
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (e) {
                lastError = e;
                getLogger.log('ERROR', `Attempt ${attempt + 1} failed with ${provider.name}: ${e.message}`);

                if (e.name === 'AbortError') {
                    getLogger.log('WARN', `${provider.name} request timed out.`);
                }

                attempt++;
                if (attempt < MAX_RETRIES) {
                    const backoff = BASE_BACKOFF * Math.pow(2, attempt - 1);
                    const jitter = backoff * JITTER_FACTOR * Math.random();
                    const delay = backoff + jitter;
                    getLogger.log('DEBUG', `Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        if (attempt === MAX_RETRIES) {
            getLogger.log('WARN', `${provider.name} failed after ${MAX_RETRIES} attempts. Marking as unhealthy.`);
            await markProviderUnhealthy(provider.name, env, config.fallback?.provider_cooldown_ms || HEALTH_COOLDOWN_MS);
        }
    }

    getLogger.log('ERROR', `All providers failed for ${type} on ${chain}. Last error: ${lastError?.message || 'unknown'}`);
    throw new Error(`All providers failed for ${type} on ${chain}. Last error: ${lastError?.message || 'unknown'}`);
}

function buildProviderUrl(provider, spec, params) {
    // ساده‌سازی برای مثال؛ در عمل باید بر اساس نوع درخواست URL ساخته شود
    if (provider.name === 'CoinGecko' && spec.type === 'price') {
        const ids = params.ids || 'bitcoin,ethereum';
        const vs_currencies = params.vs_currencies || 'usd';
        return `${provider.url}/simple/price?ids=${ids}&vs_currencies=${vs_currencies}`;
    }
    
    if (provider.name === 'Etherscan' && spec.type === 'tx') {
        const address = params.address;
        const startBlock = params.startBlock || 0;
        return `${provider.url}?module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=99999999&sort=asc`;
    }
    
    return `${provider.url}${spec.endpoint || ''}?${new URLSearchParams(params).toString()}`;
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
        } else {
            headers['X-Cg-Demo-Api-Key'] = env[provider.params.key_env];
        }
    }
    
    return headers;
}