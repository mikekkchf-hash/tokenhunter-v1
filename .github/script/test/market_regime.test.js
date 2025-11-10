// .github/scripts/tests/market_regime.test.js
// SOURCE_FOR: TESTS
// تست واحد برای تشخیص حالت بازار

const nock = require('nock');
const { detectMarketRegime } = require('../../../worker/market_regime');
const { getConfig } = require('../../../worker/utils/config');

// mock کردن getConfig
jest.mock('../../../worker/utils/config', () => ({
    getConfig: async () => ({
        regime: {
            bull_threshold: 0.05,
            bear_threshold: -0.05,
            hysteresis_days: 1,
            multipliers: {
                BULL: { risk: 1.2, opportunity: 0.8 },
                BEAR: { risk: 0.7, opportunity: 1.5 },
                NEUTRAL: { risk: 1.0, opportunity: 1.0 }
            }
        }
    })
}));

describe('Market Regime Detection', () => {
    beforeEach(() => {
        nock.cleanAll();
    });

    test('BULL regime detection', async () => {
        // mock کردن API
        nock('https://api.coingecko.com')
            .get('/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd')
            .reply(200, {
                bitcoin: { usd: 55000 },
                ethereum: { usd: 3400 }
            });

        const env = { MY_KV: { get: jest.fn() } };
        const result = await detectMarketRegime({ cfg: {}, env });

        expect(result.regime).toBe('BULL');
        expect(result.metrics.avg_7d_change).toBeGreaterThan(0);
        expect(result.multipliers.risk).toBe(1.2);
        expect(result.multipliers.opportunity).toBe(0.8);
    });

    test('BEAR regime detection', async () => {
        nock('https://api.coingecko.com')
            .get('/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd')
            .reply(200, {
                bitcoin: { usd: 45000 },
                ethereum: { usd: 2600 }
            });

        const env = { MY_KV: { get: jest.fn() } };
        const result = await detectMarketRegime({ cfg: {}, env });

        expect(result.regime).toBe('BEAR');
        expect(result.metrics.avg_7d_change).toBeLessThan(0);
        expect(result.multipliers.risk).toBe(0.7);
        expect(result.multipliers.opportunity).toBe(1.5);
    });

    test('NEUTRAL regime detection', async () => {
        nock('https://api.coingecko.com')
            .get('/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd')
            .reply(200, {
                bitcoin: { usd: 50000 },
                ethereum: { usd: 3000 }
            });

        const env = { MY_KV: { get: jest.fn() } };
        const result = await detectMarketRegime({ cfg: {}, env });

        expect(result.regime).toBe('NEUTRAL');
        expect(result.metrics.avg_7d_change).toBeCloseTo(0, 1);
        expect(result.multipliers.risk).toBe(1.0);
        expect(result.multipliers.opportunity).toBe(1.0);
    });

});
