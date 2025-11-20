// telegram/commands.js
export function parseCommand(text='') {
  const parts = (text||'').trim().split(/\s+/);
  return { cmd: parts[0] || '', args: parts.slice(1) };
}
