// worker/utils/time.js
export function nowISO(){ return new Date().toISOString(); }
export function toUnixMs(d){ return (new Date(d)).getTime(); }
export function minutesToMs(m){ return Number(m) * 60 * 1000; }
