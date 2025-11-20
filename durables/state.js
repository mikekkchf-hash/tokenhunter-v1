// durables/state.js
// Durable Object that holds short-lived system state (global flags, last-run timestamps, dedupe map for heavy ops)
export class StateDO {
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
    if (p === '/get') return this.get(req);
    if (p === '/set' && req.method === 'POST') return this.set(req);
    return new Response('ok', { status: 200 });
  }

  async get() {
    const all = await this.state.storage.get();
    return new Response(JSON.stringify(all), { status: 200 });
  }

  async set(req) {
    const body = await req.json().catch(()=>null);
    if (!body || !body.key) return new Response('bad', { status: 400 });
    await this.state.storage.put(body.key, body.value);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
}
