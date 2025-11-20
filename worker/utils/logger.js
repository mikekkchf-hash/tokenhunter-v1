// worker/utils/logger.js
// ساده، structured logging که در Cloudflare Console خوانا باشد.
// level: debug|info|warn|error
export function logger(level='info', message='', meta = {}) {
  try {
    const out = { ts: new Date().toISOString(), level, message, ...meta };
    // Cloudflare logs show console.log; keep structured
    if (level === 'error') console.error(JSON.stringify(out));
    else if (level === 'warn') console.warn(JSON.stringify(out));
    else console.log(JSON.stringify(out));
  } catch (e) {
    // swallow
    console.log('logger fail', e);
  }
}
