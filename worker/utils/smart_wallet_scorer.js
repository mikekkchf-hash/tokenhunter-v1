// worker/utils/smart_wallet_scorer.js
import { findProfitableWallets } from './dune_adapter.js';
import { getWalletPortfolio, getWalletPositions } from './zapper_adapter.js';
import { PocketRPC } from './pocket_rpc.js';
import { logger } from './logger.js';

const pocketRPC = new PocketRPC();

export async function scoreSmartWallet(walletAddress) {
  logger.log('INFO', `Scoring wallet: ${walletAddress}`);
  
  // 1. گرفتن داده‌های Dune برای سوددهی تاریخی
  const duneData = await findProfitableWallets(90, 50);
  const duneScore = duneData.find(w => w.address.toLowerCase() === walletAddress.toLowerCase())?.pnl || 0;
  const duneNormalized = Math.min(100, (duneScore / 100000) * 100); // نرمال‌سازی
  
  // 2. گرفتن داده‌های Zapper برای تنوع پورتفولیو
  const positions = await getWalletPositions(walletAddress);
  const tokenCount = positions.length;
  const zapperScore = Math.min(100, (tokenCount / 20) * 100); // حداکثر 20 توکن معتبر است
  
  // 3. بررسی فعالیت اخیر از طریق Pocket RPC
  const currentBlock = await pocketRPC.getBlockNumber();
  const fromBlock = parseInt(currentBlock, 16) - 1000; // 1000 بلاک اخیر
  
  const filter = {
    address: walletAddress,
    fromBlock: fromBlock.toString(16),
    toBlock: 'latest'
  };
  
  const logs = await pocketRPC.getLogs(filter);
  const recentActivity = logs.length;
  const activityScore = Math.min(100, (recentActivity / 50) * 100); // حداکثر 50 تراکنش معتبر است
  
  // 4. محاسبه نمره نهایی
  const weights = {
    dune: 0.5,   // 50% وزن برای سوددهی تأییدشده
    zapper: 0.3, // 30% وزن برای تنوع پورتفولیو
    activity: 0.2 // 20% وزن برای فعالیت اخیر
  };
  
  const finalScore = (duneNormalized * weights.dune) +
                     (zapperScore * weights.zapper) +
                     (activityScore * weights.activity);
  
  // 5. ایجاد توضیحات برای شفافیت
  const explanation = `Dune Score: ${duneNormalized.toFixed(1)}/100 (PnL: $${duneScore.toLocaleString()}) | ` +
                       `Zapper Score: ${zapperScore.toFixed(1)}/100 (${tokenCount} tokens) | ` +
                       `Activity Score: ${activityScore.toFixed(1)}/100 (${recentActivity} txs)`;
  
  logger.log('INFO', `Wallet ${walletAddress} scored: ${finalScore.toFixed(1)}/100`);
  
  return {
    address: walletAddress,
    score: finalScore,
    details: {
      dune: duneNormalized,
      zapper: zapperScore,
      activity: activityScore,
      dunePnl: duneScore,
      tokenCount,
      recentActivity
    },
    explanation
  };
}
