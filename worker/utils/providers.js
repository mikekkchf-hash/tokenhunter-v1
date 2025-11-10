// worker/utils/providers.js
// SOURCE_FOR: FALLBACK
// SOURCE_FOR: DEPLOY

export const PROVIDERS = {
    price: [
        {
            name: 'CoinGecko',
            url: 'https://api.coingecko.com/api/v3',
            ratePerSec: 0.5, // ~30/min
            params: { no_key: true }
        },
        {
            name: 'CoinPaprika',
            url: 'https://api.coinpaprika.com/v1',
            ratePerSec: 1,
            params: { no_key: true }
        },
        {
            name: 'CoinCap',
            url: 'https://api.coincap.io/v2',
            ratePerSec: 1,
            params: { no_key: true }
        }
    ],
    tx: {
        ethereum: [
            {
                name: 'Etherscan',
                url: 'https://api.etherscan.io/api',
                ratePerSec: 5,
                params: { key_env: 'ETHERSCAN_API_KEY' }
            },
            {
                name: 'Covalent',
                url: 'https://api.covalenthq.com/v1',
                ratePerSec: 2,
                params: { key_env: 'COVALENT_KEY' }
            },
            {
                name: 'Moralis',
                url: 'https://deep-index.moralis.io/api/v2',
                ratePerSec: 1,
                params: { key_env: 'MORALIS_KEY' }
            }
        ],
        bsc: [
            {
                name: 'BscScan',
                url: 'https://api.bscscan.com/api',
                ratePerSec: 5,
                params: { key_env: 'BSCSCAN_API_KEY' }
            },
            {
                name: 'Covalent',
                url: 'https://api.covalenthq.com/v1',
                ratePerSec: 2,
                params: { key_env: 'COVALENT_KEY' }
            }
        ],
        solana: [
            {
                name: 'Helius',
                url: 'https://api.helius.xyz',
                ratePerSec: 10,
                params: { key_env: 'HELIUS_KEY' }
            }
        ]
    },
    poolReserves: [
        {
            name: 'TheGraph-UniswapV2',
            url: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
            ratePerSec: 10,
            params: { no_key: true }
        },
        {
            name: 'Covalent-Pools',
            url: 'https://api.covalenthq.com/v1/1/pools/',
            ratePerSec: 2,
            params: { key_env: 'COVALENT_KEY' }
        }
    ],
    sentiment: [
        {
            name: 'CoinGecko-Social',
            url: 'https://api.coingecko.com/api/v3',
            ratePerSec: 0.2, // 12/min
            params: { no_key: true }
        }
    ]
};

export const HEALTH_KEY_PREFIX = 'provider_health_';
export const HEALTH_COOLDOWN_MS = 300000; // 5 minutes