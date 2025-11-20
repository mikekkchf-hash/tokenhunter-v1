// worker/config.js
export default {
MIN_LIQUIDITY_USD: process.env.MIN_LIQUIDITY_USD || 30000,
ALERT_THRESHOLD: process.env.ALERT_THRESHOLD || 80,
REQUIRED_WALLETS: process.env.REQUIRED_WALLETS || 3,
WINDOW_MINUTES: process.env.WINDOW_MINUTES || 10,
};