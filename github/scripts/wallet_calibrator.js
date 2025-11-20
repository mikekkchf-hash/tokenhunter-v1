// github/scripts/wallet_calibrator.js
const fetch = require('node-fetch');
const { computeSmartScore } = require('../smartscore');

const ETHERSCAN = 'https://api.etherscan.io/api';
const COINGECKO_PRICE = (contract, fromTs, toTs) => `https://api.coingecko.com/api/v3/coins/ethereum/contract/${contract}/market_chart/range?vs_currency=usd&from=${Math.floor(fromTs/1000)}&to=${Math.floor(toTs/1000)}`;

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const WALLET_LIST = (process.env.WALLET_LIST || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);

if(!ETHERSCAN_API_KEY){ console.error('ETHERSCAN_API_KEY missing'); process.exit(1); }

async function getTokenTxsForWallet(wallet){
  const url = `${ETHERSCAN}?module=account&action=tokentx&address=${wallet}&startblock=0&endblock=99999999&page=1&offset=1000&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
  const r = await fetch(url);
  const j = await r.json();
  return j.result || [];
}

async function getCoinGeckoPrices(contract, fromTs, toTs){
  try{
    const url = COINGECKO_PRICE(contract, fromTs, toTs);
    const r = await fetch(url);
    const j = await r.json();
    return j.prices || [];
  }catch(e){ return []; }
}

async function computePnLForWallet(wallet){
  const txs = await getTokenTxsForWallet(wallet);
  const buys = [], sells = [];
  for(const t of txs){
    const contract = (t.contractAddress||'').toLowerCase();
    const time = parseInt(t.timeStamp)*1000;
    if(t.to && t.to.toLowerCase() === wallet) buys.push({contract, value: parseFloat(t.value), time});
    if(t.from && t.from.toLowerCase() === wallet) sells.push({contract, value: parseFloat(t.value), time});
  }
  const results = [];
  const contracts = new Set([...buys.map(b=>b.contract), ...sells.map(s=>s.contract)]);
  for(const c of contracts){
    const bList = buys.filter(x=>x.contract===c);
    const sList = sells.filter(x=>x.contract===c);
    if(bList.length===0) continue;
    const fromTs = Math.min(...bList.map(x=>x.time)) - 3600*1000;
    const toTs = Math.max(...(sList.map(x=>x.time).concat([Date.now()])));
    const prices = await getCoinGeckoPrices(c, fromTs, toTs);
    function priceAt(ts){
      if(!prices || prices.length===0) return null;
      let nearest = prices.reduce((a,b)=> Math.abs(a[0]-ts) < Math.abs(b[0]-ts) ? a : b);
      return nearest[1];
    }
    const buyPrices = bList.map(b=>priceAt(b.time)).filter(Boolean);
    const sellPrices = sList.map(s=>priceAt(s.time)).filter(Boolean);
    const avgBuy = buyPrices.length ? buyPrices.reduce((a,b)=>a+b,0)/buyPrices.length : null;
    const avgSell = sellPrices.length ? sellPrices.reduce((a,b)=>a+b,0)/sellPrices.length : null;
    const pnl = (avgSell && avgBuy) ? ((avgSell - avgBuy)/avgBuy)*100 : null;
    results.push({ contract: c, avgBuy, avgSell, pnl, buys: bList.length, sells: sList.length });
  }
  const avgPnl = results.filter(r=>r.pnl!=null).length ? results.filter(r=>r.pnl!=null).reduce((a,b)=>a+b.pnl,0)/results.filter(r=>r.pnl!=null).length : null;
  return { wallet, trades_count: (buys.length + sells.length), uniqueTokens: results.length, avgPnl, details: results };
}

async function pushToCloudflareKV(key, value){
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  const r = await fetch(url, { method:'PUT', headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/octet-stream' }, body: JSON.stringify(value) });
  const j = await r.json();
  return j;
}

(async ()=>{
  for(const w of WALLET_LIST){
    try{
      console.log('processing wallet', w);
      const res = await computePnLForWallet(w);
      console.log('result', res);
      await pushToCloudflareKV(`wallet:${w}`, res);
      await new Promise(resv => setTimeout(resv, 500));
    }catch(e){ console.error('wallet error', e); }
  }
  console.log('done');
})();
