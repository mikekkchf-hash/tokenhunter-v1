// durables/wallets.js
// Durable Object for storing calibrated wallet pool and profiles
export class WalletsDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async ()=>{
      const init = await this.state.storage.get('__init');
      if (!init) await this.state.storage.put('__init', { created: Date.now() });
    });
  }

  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === '/list') return this.list();
    if (p === '/get' && req.method === 'POST') return this.get(req);
    if (p === '/upsert' && req.method === 'POST') return this.upsert(req);
    return new Response('ok', { status: 200 });
  }

  async list() {
    const keys = await this.state.storage.list();
    // list returns { keys: [] } in some implementations; here we read all keys naive but small
    const all = {};
    for await (const entry of this.state.storage.list()) {
      const val = await this.state.storage.get(entry);
      all[entry] = val;
    }
    return new Response(JSON.stringify(all), { status: 200 });
  }

  async get(req) {
    const body = await req.json().catch(()=>null);
    if (!body?.wallet) return new Response('wallet required', { status: 400 });
    const val = await this.state.storage.get(`w:${body.wallet.toLowerCase()}`);
    return new Response(JSON.stringify({ wallet: body.wallet, profile: val }), { status: 200 });
  }

  async upsert(req) {
    const body = await req.json().catch(()=>null);
    if (!body?.wallet || !body.profile) return new Response('bad', { status: 400 });
    const key = `w:${body.wallet.toLowerCase()}`;
    await this.state.storage.put(key, body.profile);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
}
