// worker/utils/fallback.js
// SOURCE_FOR: FALLBACK

import { PROVIDERS } from './providers';
import { API_CONFIG } from './config'; // فرض بر این است که config.js حاوی ALERT_CONFIG است

// State برای نگهداری زمان شکست هر Provider (در Cloudflare KV یا حافظه Worker)
const providerHealth = {}; // { 'DUNE_ANALYTICS': { cooldownUntil: 1678886400000 } }

/**
 * مدیریت تماس با APIها با زنجیره Failover و Exponential Backoff.
 * @param {string} providerName - نام Provider اصلی از PROVIDERS
 * @param {string} path - Endpoint مورد نظر
 * @param {object} params - پارامترهای Query/Body
 * @param {string} method - 'GET'/'POST'
 * @param {number} attempt - تعداد تلاش فعلی
 */
async function executeCall(providerName, path, params, method = 'GET') {
    const provider = PROVIDERS[providerName];
    if (!provider) throw new Error(`Provider not found: ${providerName}`);
    
    // Check Health
    const now = Date.now();
    if (providerHealth[providerName] && providerHealth[providerName].cooldownUntil > now) {
        console.warn(`Provider ${providerName} is on cooldown. Skipping.`);
        return { success: false, data: null, reason: 'COOLDOWN' };
    }

    const url = provider.baseUrl + path;
    const apiKey = env[`${providerName.toUpperCase().replace(/\s/g, '_')}_KEY`]; // فرض: کلید در env با نام استاندارد
    
    // NOTE: پیاده سازی GraphQL/REST/Websocket در اینجا بسیار پیچیده است.
    // ما فقط منطق Fallback را پیاده می‌کنیم و فرض می‌کنیم fetch کار می‌کند.
    
    try {
        const headers = { 
            'X-API-Key': apiKey || '',
            'Content-Type': provider.type === 'GRAPHQL' ? 'application/json' : 'application/json'
        };
        
        // **فراخوانی واقعی API**
        const response = await fetch(url, { 
            method, 
            headers,
            // ... body handling for POST/GRAPHQL
        });

        if (!response.ok) {
            // Rate Limit (429) یا خطای داخلی (5xx)
            if (response.status === 429 || response.status >= 500) {
                throw new Error(`API failed with status ${response.status}`);
            }
        }
        
        const data = await response.json();
        // Check for Zapper/Dune specific API errors (مثلا payload بدون دیتا)
        // ...
        
        return { success: true, data };

    } catch (error) {
        console.error(`Call to ${providerName} failed: ${error.message}`);
        
        // 1. Mark Provider as Unhealthy (Cooldown)
        const cooldownTime = now + (API_CONFIG.FALLBACK_COOLDOWN_SEC || 60) * 1000;
        providerHealth[providerName] = { cooldownUntil: cooldownTime, error: error.message };

        return { success: false, data: null, reason: error.message };
    }
}

/**
 * تابع اصلی برای تماس با APIها با مدیریت Fallback.
 * @param {object} spec - { provider: 'DUNE_ANALYTICS', path: '/query/results', ... }
 */
export async function callWithFallback(spec, env) {
    const primaryProvider = spec.provider;
    const providerChain = [primaryProvider];
    
    // 1. ساختن زنجیره Fallback
    if (PROVIDERS[primaryProvider] && PROVIDERS[primaryProvider].fallback) {
        providerChain.push(...PROVIDERS[primaryProvider].fallback);
    }
    
    let result = { success: false, data: null, provider: null, attempts: 0 };
    let attempt = 0;

    // 2. تلاش برای فراخوانی Providerها به ترتیب
    for (const providerName of providerChain) {
        attempt++;
        
        // 3. پیاده سازی Exponential Backoff (1s, 2s, 4s, ...) بین تلاش ها
        if (attempt > 1) {
            const backoffTime = 2 ** (attempt - 2) * 1000;
            console.log(`Waiting ${backoffTime / 1000}s before trying fallback ${providerName}`);
            // await new Promise(resolve => setTimeout(resolve, backoffTime)); // در Workerها باید از Durable Object برای Wait استفاده کرد
        }

        const callResult = await executeCall(providerName, spec.path, spec.params, spec.method || 'GET', env);
        
        if (callResult.success) {
            result = { success: true, data: callResult.data, provider: providerName, attempts: attempt };
            break; // موفقیت! خروج از حلقه
        }

        // اگر Provider اصلی شکست خورد، به Fallback بعدی می‌رویم.
    }

    // 4. بازگرداندن نتیجه نهایی
    if (!result.success) {
        console.error(`CRITICAL: All providers for ${primaryProvider} failed.`);
    }

    return result;
}