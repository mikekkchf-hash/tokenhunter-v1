// worker/recent_tx_do.js
export class RecentTxStore {
  constructor(state, env){
    this.state = state;
    this.env = env;
    // init marker
    this.state.blockConcurrencyWhile(async ()=>{
      const init = await this.state.storage.get('initialized');
      if(!init) await this.state.storage.put('initialized', true);
    });
  }

  async fetch(request){
    const url = new URL(request.url);
    const path = url.pathname;
    if(path === '/addTx' && request.method === 'POST') return this.addTx(request);
    if(path === '/countSmartBuys' && request.method === 'POST') return this.countSmartBuys(request);
    return new Response('ok', { status:200 });
  }

  async addTx(request){
    try{
      const tx = await request.json();
      const now = Date.now();
      const tokenAddress = (tx.tokenAddress || tx.to || '').toLowerCase();
      const from = (tx.from || '').toLowerCase();
      const ts = tx.timestamp ? new Date(tx.timestamp).getTime() : now;
      if(!tokenAddress) return new Response(JSON.stringify({ ok:false, reason:'no token' }), { status:400 });
      const key = `token:${tokenAddress}`;
      let arr = await this.state.storage.get(key) || [];
      // push and prune older than 1h (configurable)
      arr.push({ from, ts, txHash: tx.hash || null });
      const windowMs = (parseInt(this.env.WINDOW_MINUTES) || 10) * 60 * 1000;
      const cutoff = Date.now() - Math.max(windowMs*5, 60*60*1000); // keep up to 1h
      arr = arr.filter(x => x.ts >= cutoff);
      await this.state.storage.put(key, arr);
      // check consensus
      const recentCut = Date.now() - windowMs;
      const unique = new Set(arr.filter(x=>x.ts >= recentCut).map(x=>x.from));
      const required = parseInt(this.env.REQUIRED_WALLETS) || 3;
      if(unique.size >= required){
        // signal worker to run security checks
        try{
          // best-effort notify worker internal endpoint
          await fetch(`${this.env.WORKER_BASE_URL}/internal/security-checks`, { method:'POST', body: JSON.stringify({ tokenAddress }) });
        }catch(e){ /* ignore - best effort */ }
      }
      return new Response(JSON.stringify({ ok:true, stored: arr.length }), { status:200 });
    }catch(e){
      console.error('DO addTx error', e);
      return new Response(JSON.stringify({ ok:false, err: e.message }), { status:500 });
    }
  }

  async countSmartBuys(request){
    try{
      const body = await request.json();
      const tokenAddress = (body.tokenAddress || '').toLowerCase();
      const windowMinutes = parseInt(body.windowMinutes || this.env.WINDOW_MINUTES || 10);
      const windowMs = windowMinutes * 60 * 1000;
      const key = `token:${tokenAddress}`;
      const arr = await this.state.storage.get(key) || [];
      const cutoff = Date.now() - windowMs;
      const unique = new Set(arr.filter(x=>x.ts >= cutoff).map(x=>x.from));
      return new Response(JSON.stringify({ tokenAddress, count: unique.size }), { status:200 });
    }catch(e){
      console.error('countSmartBuys error', e);
      return new Response(JSON.stringify({ ok:false, err: e.message }), { status:500 });
    }
  }
}
