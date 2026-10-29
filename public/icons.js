// Line icons instead of emojis, everywhere in the dashboard: the pages are written with emojis (short and readable in
// the code), and this file swaps each one for an SVG icon in the same style as the menu (stroke, current colour)
// when it appears on screen. Typed text is never touched (inputs, text areas, code), simple marks (✓ ✗ ↻) stay.
/* global $$ */
(() => {
const I = (d) => d;   // the inside of a 24×24 stroke icon
const ICONS = {
  sparkles: I('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15v4M17 17h4M5 3v3M3.5 4.5h3"/>'),
  hourglass: I('<path d="M6 2h12M6 22h12M7 2c0 5 10 5 10 10S7 17 7 22M17 2c0 5-10 5-10 10s10 5 10 10"/>'),
  check: I('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
  x: I('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'),
  file: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  coin: I('<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2A3 3 0 0 0 12 8c-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2a3 3 0 0 1-2.8-1.2M12 6v2M12 16v2"/>'),
  github: I('<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'),
  note: I('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  pen: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  warn: I('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  link: I('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  party: I('<path d="M5.8 11.3 2 22l10.7-3.8"/><path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.2.7a3 3 0 0 0-2 3.2v0a3 3 0 0 1-2 3.2L15 9.5M8.6 8.6 15.4 15.4a1 1 0 0 1-.4 1.6L5.8 11.3l5-2.7z"/>'),
  flame: I('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.4 1.2 1.4 2.8 2.5 2.8z"/>'),
  trophy: I('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  dice: I('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/>'),
  gift: I('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>'),
  handshake: I('<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5.8 5.8 0 0 1 7.1-.9l.5.3a4 4 0 0 0 2.6.6H21M3 4h1.6a4 4 0 0 1 2.6.9l.4.4M3 15h2l5.5 5.5a1 1 0 1 0 3-3"/>'),
  grad: I('<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5M22 8v6"/>'),
  puzzle: I('<path d="M19.4 14.5a2.4 2.4 0 1 0 0-4.6H18V6a2 2 0 0 0-2-2h-3.9v1.4a2.4 2.4 0 1 1-4.6 0V4H4a2 2 0 0 0-2 2v3.9h1.4a2.4 2.4 0 1 1 0 4.6H2V18a2 2 0 0 0 2 2h3.5v-1.4a2.4 2.4 0 1 1 4.6 0V20H16a2 2 0 0 0 2-2v-3.5z"/>'),
  help: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>'),
  mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  swords: I('<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 21 18v3h-3l-3.5-3.5"/>'),
  timer: I('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
  bug: I('<rect x="7" y="7" width="10" height="14" rx="5"/><path d="M12 11v10M9 3l1.5 2M15 3l-1.5 2M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M4 19l3-2M20 19l-3-2"/>'),
  thumb: I('<path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.5l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  ban: I('<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>'),
  box: I('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
  phone: I('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'),
  bot: I('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13v2M15 13v2M2 14h2M20 14h2"/><circle cx="12" cy="3" r="1"/>'),
  brain: I('<path d="M9.5 3A2.5 2.5 0 0 0 7 5.5v.3A3 3 0 0 0 4.5 9a3 3 0 0 0 .5 5.7V15a3 3 0 0 0 3 3h.5a2.5 2.5 0 0 0 4.5 1.5V5a2 2 0 0 0-3.5-2z"/><path d="M14.5 3A2.5 2.5 0 0 1 17 5.5v.3A3 3 0 0 1 19.5 9a3 3 0 0 1-.5 5.7V15a3 3 0 0 1-3 3h-.5A2.5 2.5 0 0 1 11 19.5"/>'),
  users: I('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M16 4.5a4 4 0 0 1 0 7M22 21c0-3-1.8-5.6-4.5-6.6"/>'),
  dot: I('<circle cx="12" cy="12" r="5" fill="currentColor"/>'),
  hand: I('<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.3 16.8a2 2 0 0 1 2.8-2.8L8 16"/>'),
  medal: I('<circle cx="12" cy="15" r="6"/><path d="M8.2 10.3 5 3h4l3 6M15.8 10.3 19 3h-4l-3 6"/><path d="M12 13v4"/>'),
  target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  laptop: I('<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 20h20"/>'),
  zap: I('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  chat: I('<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-5.7A8 8 0 1 1 21 12z"/>'),
  gamepad: I('<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 14h.01"/>'),
  cart: I('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>'),
  wrench: I('<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8M9.3 17.7 4 23M14.7 6.3 13 4.6a4 4 0 0 0-5.7 5.6l1.7 1.7"/>'),
  chart: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  fish: I('<path d="M6.5 12c3.5-4.5 8-5 11.5-3l3 3-3 3c-3.5 2-8 1.5-11.5-3zM6.5 12 2 8v8z"/><path d="M16 11h.01"/>'),
  tv: I('<rect x="2" y="6" width="20" height="13" rx="2"/><path d="m8 2 4 4 4-4"/>'),
  code: I('<path d="m8 9-4 3 4 3M16 9l4 3-4 3M13 5l-2 14"/>'),
  plus: I('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  pause: I('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  rocket: I('<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="M12 15 9 12a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'),
  blocks: I('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><path d="M13 7h8M17 3v8"/>'),
  megaphone: I('<path d="m3 11 18-5v12L3 14z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'),
  shield: I('<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  bulb: I('<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>'),
  clipboard: I('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h4"/>'),
  book: I('<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>'),
  up: I('<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>'),
  down: I('<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>'),
  sprout: I('<path d="M7 20h10M12 20v-8M12 12C12 8 9 6 4 6c0 4 3 6 8 6zM12 10c0-3 2-5 7-5 0 3-2 5-7 5"/>'),
  lock: I('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  bell: I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  calendar: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  wallet: I('<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>'),
  flag: I('<path d="M4 22V4M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1"/>'),
  run: I('<circle cx="14" cy="4" r="2"/><path d="m7 21 3-6 3 2v5M5 12l3-3 4-1 3 3 3 1M10 15l2-6"/>'),
  star: I('<path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z"/>'),
  ext: I('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  receipt: I('<path d="M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-3-2-2 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  dna: I('<path d="M4 2c0 6 16 6 16 12s-16 6-16 8M20 2c0 6-16 6-16 12s16 6 16 8M7 5h10M7 19h10M9 9h6M9 15h6"/>'),
  inbox: I('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>'),
  moon: I('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>'),
  thread: I('<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-5.7A8 8 0 1 1 21 12z"/><path d="M8 10h8M8 14h5"/>'),
  flask: I('<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10"/>'),
  swap: I('<path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>'),
  db: I('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  atom: I('<circle cx="12" cy="12" r="1"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>'),
  meh: I('<circle cx="12" cy="12" r="9"/><path d="M8 15h8M9 9h.01M15 9h.01"/>'),
  compass: I('<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>'),
  heart: I('<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>'),
  eye: I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  tag: I('<path d="M12 2H2v10l9.3 9.3a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><path d="M7 7h.01"/>'),
  calc: I('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"/>'),
  pin: I('<path d="M12 17v5M9 10.8V4h6v6.8l2 2.2v2H7v-2z"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'),
  dumbbell: I('<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>'),
  globe: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  ghost: I('<path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/>'),
  bag: I('<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M8 14h8"/>'),
  id: I('<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4M5 16c.5-1.2 1.6-2 3-2s2.5.8 3 2"/>'),
  scale: I('<path d="M12 3v18M7 21h10M4 7h16M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>'),
  headphones: I('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>'),
  chair: I('<path d="M7 18v3M17 18v3M5 11h14v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM7 11V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6"/>'),
  alarm: I('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/>'),
  coffee: I('<path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v2M10 2v2M14 2v2"/>'),
  key: I('<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>'),
  layers: I('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'),
  play: I('<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>'),
  stop: I('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
  crown: I('<path d="m2 18 2-11 5 5 3-7 3 7 5-5 2 11z"/><path d="M4 21h16"/>'),
  eyeoff: I('<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  folder: I('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>'),
  image: I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
  mail: I('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
  refresh: I('<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>'),
  trash: I('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  home: I('<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>'),
  arrow: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  type: I('<path d="M4 7V5h16v2M9 19h6M12 5v14"/>'),
  network: I('<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4M12 11l-6 6M12 11l6 6M7 19h10"/>'),
  plug: I('<path d="M12 22v-5M9 8V2M15 8V2M18 8v4a6 6 0 0 1-12 0V8z"/>'),
  mouse: I('<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>'),
  sort: I('<path d="M3 6h7M3 12h11M3 18h15M19 4v14M16 15l3 3 3-3"/>'),
  snow: I('<path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9M9 4l3 3 3-3M9 20l3-3 3 3"/>'),
  palette: I('<circle cx="13.5" cy="6.5" r=".8"/><circle cx="17.5" cy="10.5" r=".8"/><circle cx="8.5" cy="7.5" r=".8"/><circle cx="6.5" cy="12.5" r=".8"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.7-.7 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.6-1.7H16a6 6 0 0 0 6-6c0-4.9-4.5-8.4-10-8.4z"/>'),
};

// emoji → [icon, colour class] (several emojis can share an icon; the class colours the important ones)
const EMOJI = {
  "✨": ["sparkles", "violet"], "⏳": ["hourglass"], "⌛": ["hourglass"], "✅": ["check", "ok"], "☑": ["check", "ok"], "✔": ["check", "ok"], "❌": ["x", "ko"], "❎": ["x", "ko"],
  "📄": ["file"], "📃": ["file"], "📑": ["file"], "🗒": ["note"], "📝": ["note"], "🪙": ["coin", "gold"], "💰": ["wallet", "gold"], "💵": ["wallet", "gold"], "💸": ["wallet", "gold"],
  "🐙": ["github"], "✍": ["pen"], "✏": ["pen"], "🖊": ["pen"], "🖋": ["pen"], "⚠": ["warn", "warn"], "🚨": ["warn", "ko"], "🔗": ["link"], "🎉": ["party", "violet"], "🎊": ["party", "violet"],
  "🔥": ["flame", "fire"], "🏆": ["trophy", "gold"], "🎲": ["dice"], "🎁": ["gift", "violet"], "🤝": ["handshake"], "🎓": ["grad"], "🧩": ["puzzle"], "❓": ["help"], "❔": ["help"], "🙋": ["hand"],
  "🎤": ["mic"], "🎙": ["mic"], "⚔": ["swords"], "🗡": ["swords"], "⏱": ["timer"], "⏲": ["timer"], "⏰": ["alarm"], "🐞": ["bug", "ko"], "🐛": ["bug", "ko"], "👍": ["thumb", "ok"], "👌": ["thumb", "ok"],
  "🔍": ["search"], "🔎": ["search"], "⛔": ["ban", "ko"], "🚫": ["ban", "ko"], "📦": ["box"], "📱": ["phone"], "🤖": ["bot"], "🧠": ["brain"], "👥": ["users"], "👯": ["users"], "🧑": ["user"], "👤": ["user"],
  "🟢": ["dot", "ok"], "🟡": ["dot", "warn"], "🟨": ["dot", "warn"], "🔴": ["dot", "ko"], "🟠": ["dot", "warn"], "🔵": ["dot", "blue"], "⚪": ["dot", "muted"], "✋": ["hand"], "🖐": ["hand"],
  "🥇": ["medal", "gold"], "🥈": ["medal", "silver"], "🥉": ["medal", "bronze"], "🏅": ["medal", "gold"], "🎖": ["medal", "gold"], "🎯": ["target"], "💻": ["laptop"], "🖥": ["laptop"], "⚡": ["zap", "gold"],
  "💬": ["chat"], "🗨": ["chat"], "🎮": ["gamepad"], "🕹": ["gamepad"], "🛒": ["cart"], "🛍": ["cart"], "🛠": ["wrench"], "🔧": ["wrench"], "🔨": ["wrench"], "📊": ["chart"], "📈": ["up", "ok"], "📉": ["down", "ko"],
  "🦈": ["fish"], "🐟": ["fish"], "📺": ["tv"], "🐍": ["code"], "🐘": ["code"], "☕": ["coffee"], "⚛": ["atom"], "🧱": ["blocks"], "➕": ["plus"], "⏸": ["pause"], "⏹": ["stop"], "▶": ["play"],
  "🚀": ["rocket", "violet"], "📣": ["megaphone"], "📢": ["megaphone"], "🛡": ["shield"], "💡": ["bulb", "gold"], "📋": ["clipboard"], "📖": ["book"], "📚": ["book"], "📘": ["book"], "📕": ["book"], "📗": ["clipboard"],
  "🌱": ["sprout", "ok"], "🔒": ["lock"], "🔐": ["lock"], "🔑": ["key"], "⚙": ["gear"], "🔔": ["bell"], "🔕": ["bell"], "🗓": ["calendar"], "📅": ["calendar"], "📆": ["calendar"],
  "⚑": ["flag"], "🚩": ["flag", "ko"], "🏁": ["flag"], "🏃": ["run"], "⭐": ["star", "gold"], "🌟": ["star", "gold"], "🧾": ["receipt"], "🧬": ["dna"], "📥": ["inbox"], "📤": ["inbox"],
  "💤": ["moon"], "😴": ["moon"], "🧵": ["thread"], "🧪": ["flask"], "⇄": null, "🗄": ["db"], "💾": ["db"], "😶": ["meh"], "😐": ["meh"], "🙂": ["thumb", "ok"], "😀": ["thumb", "ok"],
  "🧭": ["compass"], "🩸": ["heart", "ko"], "❤": ["heart", "ko"], "🦉": ["eye"], "👀": ["eye"], "👁": ["eye"], "🏷": ["tag"], "🧮": ["calc"], "🩺": ["shield"], "📌": ["pin"], "📍": ["pin"],
  "💪": ["dumbbell"], "🌍": ["globe"], "🌐": ["globe"], "👹": ["ghost", "ko"], "👾": ["ghost"], "💀": ["ghost"], "🎒": ["bag"], "🪪": ["id"], "⚖": ["scale"], "🎧": ["headphones"], "🪑": ["chair"],
  "🍬": ["gift"], "🔮": ["sparkles", "violet"], "🕳": ["ghost"], "💥": ["zap", "ko"], "👏": ["party", "violet"], "🧰": ["wrench"], "🗂": ["folder"], "📁": ["folder"], "📂": ["folder"], "🖼": ["image"],
  "📧": ["mail"], "✉": ["mail"], "📨": ["mail"], "🕐": ["clock"], "🕒": ["clock"], "🔄": ["refresh"], "🔁": ["refresh"], "🗑": ["trash"], "🏠": ["home"], "🏫": ["home"], "🎨": ["palette"],
  "👑": ["crown", "gold"], "🙈": ["eyeoff"], "📲": ["phone"], "🎵": ["headphones"], "🤔": ["help"], "💯": ["check", "ok"], "🆕": ["sparkles"], "♻": ["refresh"], "🔀": ["swap"], "📜": ["file"],
  "🌿": ["sprout", "ok"], "🍃": ["sprout", "ok"], "🍰": ["layers"], "🥞": ["layers"], "🪆": ["refresh"], "🔤": ["type"], "🔡": ["type"], "📶": ["sort"], "🔢": ["calc"], "🕸": ["network"],
  "👉": ["arrow"], "➡": ["arrow"], "🏗": ["blocks"], "🏛": ["blocks"], "🔌": ["plug"], "🖱": ["mouse"], "🚏": ["pin"], "🟥": ["dot", "ko"], "🟩": ["dot", "ok"], "🟦": ["dot", "blue"], "🧺": ["bag"],
  "🎟": ["tag"], "🎫": ["tag"], "🧊": ["snow"], "❄": ["snow"], "🎭": ["users"], "🎬": ["play"], "🛎": ["bell"], "🧹": ["trash"], "🪜": ["up"], "🧗": ["up"], "🥷": ["user"], "🕵": ["search"],
  "↕": ["sort"], "🌅": ["palette"], "🌊": ["palette"], "🌌": ["palette"], "🌲": ["sprout", "ok"], "🌹": ["heart", "ko"], "🔲": ["blocks"],
  "🌙": ["moon"], "☀": ["sparkles"], "🧲": ["target"], "🧷": ["pin"], "🪄": ["sparkles", "violet"], "🤓": ["book"], "😎": ["star", "gold"], "🙏": ["handshake"], "💎": ["star", "violet"], "🏋": ["dumbbell"],
};
// the rest (rare): a neutral dot rather than an emoji
const EMOJI_RX = /(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])(?:️|‍(?:\p{Extended_Pictographic})️?|[\u{1F3FB}-\u{1F3FF}])*/gu;
const KEEP = new Set(["✓", "✗", "✕", "↻", "★", "☆", "↗", "⇄", "©", "®", "™", "↑", "↓", "→", "←", "↔", "•", "·", "‼", "ℹ", "⌘"]);
const SKIP_TAGS = new Set(["TEXTAREA", "INPUT", "SCRIPT", "STYLE", "CODE", "PRE", "SVG", "svg", "TITLE", "OPTION", "SELECT"]);

/** One icon as HTML (for code that wants an icon directly): window.lineIcon("github"). */
function lineIcon(name, cls = "") {
  return ICONS[name] ? `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>` : "";
}
function iconFor(emoji) {
  const base = emoji.replace(/[️‍]|[\u{1F3FB}-\u{1F3FF}]/gu, "");
  const first = [...base][0] ?? "";
  if (KEEP.has(first)) return null;
  const m = EMOJI[base] || EMOJI[first];
  if (m === null) return null;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", `ic ic-emo ${m?.[1] ?? ""}`.trim());
  svg.innerHTML = ICONS[m?.[0] ?? "dot"] ?? ICONS.dot;
  if (!m) svg.classList.add("muted");
  return svg;
}
function iconizeText(node) {
  const text = node.nodeValue;
  EMOJI_RX.lastIndex = 0;
  if (!EMOJI_RX.test(text)) return;
  const p = node.parentNode;
  if (!p || SKIP_TAGS.has(p.nodeName) || (p.closest && p.closest("textarea, pre, code, [contenteditable], [data-emoji], option, select, title"))) {
    // a menu option can't hold an icon: the emoji is just removed
    if (p && (p.nodeName === "OPTION" || (p.closest && p.closest("option")))) node.nodeValue = text.replace(EMOJI_RX, (e) => (KEEP.has([...e][0]) ? e : "")).replace(/^\s+/, "");
    return;
  }
  const frag = document.createDocumentFragment();
  let last = 0;
  EMOJI_RX.lastIndex = 0;
  for (const m of text.matchAll(EMOJI_RX)) {
    const svg = iconFor(m[0]);
    if (!svg) continue;
    frag.append(text.slice(last, m.index), svg);
    last = m.index + m[0].length;
  }
  if (!last) return;
  frag.append(text.slice(last));
  p.replaceChild(frag, node);
}
function iconize(root) {
  if (!root) return;
  if (root.nodeType === 3) { iconizeText(root); return; }
  if (root.nodeType !== 1 || SKIP_TAGS.has(root.nodeName)) {
    if (root.nodeName === "SELECT" || root.nodeName === "OPTION") $$("option", root.nodeName === "OPTION" ? root.parentNode : root).forEach((o) => o.firstChild && iconizeText(o.firstChild));
    return;
  }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const list = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) list.push(n);
  list.forEach(iconizeText);
  // the menus' options lose their emoji
  if (root.querySelectorAll) root.querySelectorAll("option").forEach((o) => o.firstChild && iconizeText(o.firstChild));
}
// the placeholders and titles (tooltips) of the controls: emoji removed
function cleanAttrs(root) {
  if (!root || !root.querySelectorAll) return;
  for (const el of [root, ...root.querySelectorAll("[title], [placeholder], [aria-label]")]) {
    for (const a of ["title", "placeholder", "aria-label"]) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && (EMOJI_RX.lastIndex = 0, EMOJI_RX.test(v))) el.setAttribute(a, v.replace(EMOJI_RX, (e) => (KEEP.has([...e][0]) ? e : "")).replace(/\s{2,}/g, " ").trim());
    }
  }
}

(() => {
  let pending = new Set(), scheduled = false;
  const flush = () => {
    scheduled = false;
    const nodes = [...pending]; pending = new Set();
    for (const n of nodes) if (n.isConnected) { iconize(n); if (n.nodeType === 1) cleanAttrs(n); }
  };
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") pending.add(m.target);
      else m.addedNodes.forEach((n) => { if (!(n.nodeType === 1 && n.classList && n.classList.contains("ic"))) pending.add(n); });
    }
    if (!scheduled && pending.size) { scheduled = true; queueMicrotask(flush); }
  });
  const start = () => { iconize(document.body); cleanAttrs(document.body); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  // tab title stays clean too
  document.title = document.title.replace(EMOJI_RX, "").trim();
})();

window.lineIcon = lineIcon;
})();
