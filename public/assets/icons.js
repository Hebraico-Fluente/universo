/** Ícones de traço fino (24×24) para cronograma e traje. Desenhados para o Universo; herdam a cor do texto. */
const P = {
  rings: '<circle cx="9" cy="14" r="5"/><circle cx="15" cy="14" r="5"/><path d="M10 5l2-2 2 2-2 2z"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  pizza: '<path d="M12 21L3.5 6.5a14 14 0 0117 0z"/><path d="M5 9a11 11 0 0114 0"/><circle cx="10" cy="11.5" r="1"/><circle cx="14" cy="13.5" r="1"/><circle cx="12" cy="16.5" r=".8"/>',
  glass: '<path d="M7 3h10l-1 6a4 4 0 01-8 0z"/><path d="M12 13v7M8.5 21h7"/>',
  sweet: '<circle cx="12" cy="12" r="4"/><path d="M8.5 10L4 7l1 5-1 5 4.5-3M15.5 10L20 7l-1 5 1 5-4.5-3"/>',
  snack: '<path d="M4 11h16a8 8 0 01-16 0z"/><path d="M4 11c0-3 3-5 8-5s8 2 8 5M9 6V4M15 6V4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>',
  shirt: '<path d="M8 3l4 3 4-3 4 4-3 3v11H7V10L4 7z"/>',
  shoe: '<path d="M3 17h18v2H3zM3 17c0-4 1-8 3-10l2 3c2 1 6 1 8 3s3 3 5 4"/>',
  palette: '<path d="M12 3a9 9 0 100 18c1.5 0 2-1 2-2 0-1.5-1-2 0-3s2.5 0 4-1 3-2 3-4a9 9 0 00-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  heart: '<path d="M12 20s-8-4.5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 9c0 6.5-8 11-8 11z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 13.2v4.6M9.7 15.5h4.6"/>',
  cat: '<path d="M5 20v-7.5L4 5l4.2 3.2a9 9 0 017.6 0L20 5l-1 7.5V20"/><path d="M5 20h14"/><circle cx="9.5" cy="13" r=".9"/><circle cx="14.5" cy="13" r=".9"/><path d="M11 16.2l1 .8 1-.8"/>',
  ticket: '<path d="M3.5 8.5V6h17v2.5a2.5 2.5 0 000 5V16h-17v-2.5a2.5 2.5 0 000-5z" transform="translate(0 1)"/><path d="M14 7.5v10" stroke-dasharray="1.6 1.8"/>',
  boat: '<path d="M3 15.5h18l-2.5 4h-13z"/><path d="M12 15.5V3.5l6 9H12"/><path d="M12 6.5L7.5 12.5H12"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11"/><path d="M12 9C10.5 5 6.5 5 7 7.5S12 9 12 9zM12 9c1.5-4 5.5-4 5-1.5S12 9 12 9z"/>',
  home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
};
export const icon = (name, cls = "ic") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.heart}</svg>`;
