// telegram/formatter.js
// escape MarkdownV2 safely and build small blocks
export function escapeMdV2(s='') {
  return s.toString().replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
export function buildShortSignal(obj) {
  // obj: { title, body }
  return `*${escapeMdV2(obj.title || '')}*\n\n${escapeMdV2(obj.body||'')}`;
}
