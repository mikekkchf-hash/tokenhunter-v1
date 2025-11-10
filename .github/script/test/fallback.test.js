// github/scripts/tests/fallback.test.js
// SOURCE_FOR: TESTS
// تست واحد برای مکانیزم فعالیت اضطراری

const nock = require('nock');
const { callWithFallback, markProviderUnhealthy, isProviderHealthy } = require('../../../worker/utils/fallback');
const { getConfig } = require('../../../worker/utils/config');

// mock کردن getConfig
jest.mock('../../../worker/utils/config', () => ({
    getConfig: async () => ({
        fallback: {
            provider_cooldown_ms: 300000
        }
    })
}));

describe('Fallback Mechanism', () => {
    let env;
    
    beforeEach(() => {
        nock.cleanAll();
        env = {
            MY_KV: {
                get: jest.fn(),
                put: jest.fn(),
                delete: jest.fn()
            }
        };
    });

    test('should use primary provider first', async () => {
        nock('https://api.coingecko.com')
            .get('/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
            .reply(200, { bitcoin: { usd: 10000 } });

        const spec = {
            type: 'price',
            params: { ids: 'bitcoin', vs_currencies: 'usd' },
            timeout: 5000
        };
        
        const result = await callWithFallback(spec, env);
        expect(result.provider).toBe('CoinGecko');
        expect(result.data).toEqual({ bitcoin: { usd: 10000 } });
    });

    test('should use fallback on primary failure', async () => {
        nock('https://api.coingecko.com')
            .get('/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
            .reply(429);
        
        nock('https://api.coinpaprika.com')
            .get('/v1/tickers/btc-bitcoin')
            .reply(200, { quotes: { USD: { price: 10000 } } });

        const spec = {
            type: 'price',
            params: { ids: 'bitcoin', vs_currencies: 'usd' },
            timeout: 5000
        };
        
        const result = await callWithFallback(spec, env);
        expect(result.provider).toBe('CoinPaprika');
        expect(result.data).toBeDefined();
    });

    test('should mark provider unhealthy on 429', async () => {
        nock('https://api.coingecko.com')
            .get('/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
            .reply(429);

        const spec = {
            type: 'price',
            params: { ids: 'bitcoin', vs_currencies: 'usd' },
            timeout: 5000
        };
        
        await expect(callWithFallback(spec, env)).rejects.toThrow();
        
        // بررسی اینکه provider به عنوان ناسالم علامت گذاری شده است
        const isHealthy = await isProviderHealthy('CoinGecko', env);
        expect(isHealthy).toBe(false);
    });
});
