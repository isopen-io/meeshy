import { INK, escapeSvg, heartPath, starPath } from './art';

/**
 * LES ACCESSOIRES DES STICKERS (#9034) — cœurs, larmes, nuages, cadeaux,
 * pierres tombales… chacun DESSINÉ autour de (0, 0), puis posé par `at`.
 *
 * `at` sépare toujours la POSITION (groupe extérieur, attribut `transform`)
 * du MOUVEMENT (groupe intérieur, classe de rôle) : la transformation CSS
 * d'une chorégraphie remplacerait l'attribut de l'élément qu'elle anime.
 */

export type At = {
  readonly role?: string;
  readonly s?: number;
  readonly rot?: number;
  /** Décalage de boucle propre à cette pièce (variable `--d`, en secondes). */
  readonly d?: number;
  /** Variables de trajectoire d'un éclat (`burst`). */
  readonly dx?: number;
  readonly dy?: number;
  readonly r?: number;
};

export function at(x: number, y: number, inner: string, o: At = {}): string {
  const transform = `translate(${x} ${y})${o.s !== undefined ? ` scale(${o.s})` : ''}${o.rot !== undefined ? ` rotate(${o.rot})` : ''}`;
  const vars = [
    o.d !== undefined ? `--d:${o.d}s` : '',
    o.dx !== undefined ? `--dx:${o.dx}px` : '',
    o.dy !== undefined ? `--dy:${o.dy}px` : '',
    o.r !== undefined ? `--r:${o.r}deg` : '',
  ]
    .filter(Boolean)
    .join(';');
  const cls = o.role !== undefined ? ` class="${o.role}"` : '';
  const style = vars !== '' ? ` style="${vars}"` : '';
  return `<g transform="${transform}"><g${cls}${style}>${inner}</g></g>`;
}

export const P = {
  heart: (c = '#e11d48', s = 12) =>
    `<path d="${heartPath(0, 0, s)}" fill="${c}" stroke="#fff" stroke-width="1.6"/><circle cx="${-s * 0.45}" cy="${-s * 0.3}" r="${s * 0.16}" fill="#fff" opacity=".75"/>`,
  heartHalfL: (c = '#e11d48') => `<path d="M0 10.8 C-20.4 -1.2 -10.8 -14.4 0 -4.2 L-3 2 L2 5 Z" fill="${c}" stroke="#fff" stroke-width="1.4"/>`,
  heartHalfR: (c = '#e11d48') => `<path d="M0 10.8 C20.4 -1.2 10.8 -14.4 0 -4.2 L-3 2 L2 5 Z" fill="${c}" stroke="#fff" stroke-width="1.4"/>`,
  tear: () => `<path d="M0 -7 q-6 9 0 12 q6 -3 0 -12 z" fill="#60a5fa" stroke="#3b82f6" stroke-width=".8"/>`,
  drop: () => `<path d="M0 -6 q-4 7 0 9 q4 -2 0 -9 z" fill="#38bdf8"/>`,
  cloud: (c = '#e5e7eb') =>
    `<path d="M-26 8 q-12 0 -12 -10 q0 -10 12 -10 q2 -14 18 -14 q12 0 16 10 q16 -2 18 12 q10 2 10 10 q0 8 -10 8 h-52 z" fill="${c}" stroke="#cbd5e1" stroke-width="1.4"/>`,
  darkCloud: () =>
    `<path d="M-26 8 q-12 0 -12 -10 q0 -10 12 -10 q2 -14 18 -14 q12 0 16 10 q16 -2 18 12 q10 2 10 10 q0 8 -10 8 h-52 z" fill="#64748b" stroke="#475569" stroke-width="1.4"/>`,
  snowflake: () =>
    `<path d="M0 -8 V8 M-7 -4 L7 4 M-7 4 L7 -4" stroke="#bae6fd" stroke-width="2.4" stroke-linecap="round"/><circle r="1.6" fill="#fff"/>`,
  sunCore: () => `<circle r="16" fill="#fcd34d" stroke="#f59e0b" stroke-width="2"/>`,
  sunRays: () =>
    Array.from({ length: 8 }, (_, i) => `<rect x="-2.5" y="-30" width="5" height="10" rx="2.5" fill="#fbbf24" transform="rotate(${i * 45})"/>`).join(''),
  moon: () => `<path d="M6 -16 a17 17 0 1 0 10 28 a13 13 0 1 1 -10 -28 z" fill="#fde68a" stroke="#f59e0b" stroke-width="1.4"/>`,
  bolt: () => `<path d="M4 -18 L-8 2 H0 L-4 18 L10 -4 H2 Z" fill="#facc15" stroke="#ca8a04" stroke-width="1.4" stroke-linejoin="round"/>`,
  zzz: () => `<text font-size="16" font-weight="800" fill="${INK}" font-family="system-ui,sans-serif">z</text>`,
  note: (c = '#8b5cf6') => `<path d="M2 -12 V6 a5 4 0 1 1 -3 -3.6 V-12 l12 -3 v4 z" fill="${c}"/>`,
  star: (c = '#fbbf24', r = 9) => `<path d="${starPath(0, 0, r)}" fill="${c}" stroke="#fff" stroke-width="1.2"/>`,
  sparkle: (c = '#fde047', s = 8) => `<path d="M0 ${-s} Q${s * 0.2} ${-s * 0.2} ${s} 0 Q${s * 0.2} ${s * 0.2} 0 ${s} Q${-s * 0.2} ${s * 0.2} ${-s} 0 Q${-s * 0.2} ${-s * 0.2} 0 ${-s} Z" fill="${c}"/>`,
  confetti: (c: string) => `<rect x="-3" y="-5" width="6" height="10" rx="1.5" fill="${c}"/>`,
  balloon: (c = '#f43f5e') =>
    `<ellipse cx="0" cy="-16" rx="13" ry="16" fill="${c}"/><path d="M-2 0 h4 l-2 4 z" fill="${c}"/><path d="M0 4 q6 14 -2 30" fill="none" stroke="#94a3b8" stroke-width="1.4"/><ellipse cx="-5" cy="-22" rx="3" ry="5" fill="#fff" opacity=".5"/>`,
  giftBox: () => `<rect x="-16" y="-8" width="32" height="24" rx="3" fill="#8b5cf6"/><rect x="-3" y="-8" width="6" height="24" fill="#fde047"/>`,
  giftLid: () =>
    `<rect x="-19" y="-16" width="38" height="9" rx="3" fill="#a78bfa"/><rect x="-3" y="-16" width="6" height="9" fill="#fde047"/><path d="M0 -16 q-12 -12 -10 -2 z M0 -16 q12 -12 10 -2 z" fill="#facc15"/>`,
  cake: () =>
    `<rect x="-22" y="-6" width="44" height="22" rx="4" fill="#fbcfe8"/><path d="M-22 0 q5 6 11 0 q5 6 11 0 q5 6 11 0 q5 6 11 0" fill="none" stroke="#f472b6" stroke-width="3"/><rect x="-26" y="14" width="52" height="5" rx="2.5" fill="#e5e7eb"/><rect x="-2" y="-18" width="4" height="12" fill="#60a5fa"/>`,
  flame: () => `<path d="M0 -10 q6 6 0 10 q-6 -4 0 -10 z" fill="#fb923c"/><path d="M0 -6 q3 3 0 5 q-3 -2 0 -5 z" fill="#fde047"/>`,
  cup: () =>
    `<path d="M-12 -10 h24 l-3 22 h-18 z" fill="#fff" stroke="${INK}" stroke-width="2"/><path d="M12 -5 q9 0 7 8 q-2 5 -9 5" fill="none" stroke="${INK}" stroke-width="2"/><rect x="-10" y="-8" width="20" height="5" fill="#92400e"/>`,
  steamPuff: () => `<path d="M0 0 q-5 -6 0 -12 q5 -6 0 -12" fill="none" stroke="#cbd5e1" stroke-width="2.6" stroke-linecap="round"/>`,
  angerPuff: () => `<path d="M0 0 q-6 -4 -2 -10 q2 -8 10 -6 q8 -4 10 4 q6 4 0 10 z" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.4"/>`,
  pizza: () =>
    `<path d="M0 -20 L18 16 Q0 22 -18 16 Z" fill="#fcd34d" stroke="#d97706" stroke-width="2"/><path d="M-18 16 Q0 22 18 16 L16 12 Q0 18 -16 12 Z" fill="#b45309"/><circle cx="-4" cy="2" r="3.5" fill="#dc2626"/><circle cx="5" cy="9" r="3" fill="#dc2626"/><circle cx="1" cy="-8" r="2.6" fill="#dc2626"/>`,
  rose: () =>
    `<path d="M0 0 V36" stroke="#16a34a" stroke-width="3"/><path d="M0 18 q-12 -4 -14 6 q10 2 14 -6" fill="#22c55e"/><circle r="9" fill="#e11d48"/><path d="M-5 -2 q5 -6 10 0 q-5 6 -10 0 z" fill="#be123c"/>`,
  bouquet: () =>
    `<path d="M-12 30 L0 2 L12 30 Z" fill="#fde68a" stroke="#f59e0b" stroke-width="1.4"/>${[[-8, -2, '#f43f5e'], [6, -4, '#f9a8d4'], [0, -12, '#e11d48'], [-12, -14, '#fb7185'], [11, -14, '#f472b6']]
      .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="7" fill="${c}"/>`)
      .join('')}`,
  envelope: (c = '#fff') =>
    `<rect x="-18" y="-12" width="36" height="24" rx="3" fill="${c}" stroke="${INK}" stroke-width="2"/><path d="M-18 -11 L0 3 L18 -11" fill="none" stroke="${INK}" stroke-width="2"/><path d="${heartPath(0, 4, 4)}" fill="#e11d48"/>`,
  phone: () =>
    `<rect x="-10" y="-17" width="20" height="34" rx="4" fill="${INK}"/><rect x="-7.5" y="-13" width="15" height="24" rx="2" fill="#a5f3fc"/><circle cy="14" r="1.6" fill="#94a3b8"/>`,
  plane: () => `<path d="M-14 0 L16 -10 L4 12 L0 3 Z" fill="#fff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 3 L16 -10" stroke="${INK}" stroke-width="1.2"/>`,
  arrow: () =>
    `<path d="M-20 0 H14" stroke="#92400e" stroke-width="2.6"/><path d="M14 -5 L22 0 L14 5 Z" fill="#e11d48"/><path d="M-20 0 l-6 -5 M-20 0 l-6 5 M-15 0 l-6 -5 M-15 0 l-6 5" stroke="#f472b6" stroke-width="2"/>`,
  bow: () => `<path d="M0 -22 Q-16 0 0 22" fill="none" stroke="#92400e" stroke-width="3.4"/>`,
  bowString: () => `<path d="M0 -22 L0 22" stroke="#cbd5e1" stroke-width="1.2"/>`,
  umbrella: (c = '#f43f5e') =>
    `<path d="M-30 0 Q-30 -28 0 -28 Q30 -28 30 0 Q22 -6 15 0 Q7 -6 0 0 Q-7 -6 -15 0 Q-22 -6 -30 0 Z" fill="${c}"/><path d="M0 0 V26 q0 6 -6 6" fill="none" stroke="${INK}" stroke-width="2.4"/>`,
  trophy: () =>
    `<path d="M-14 -18 h28 v10 q0 16 -14 18 q-14 -2 -14 -18 z" fill="#fcd34d" stroke="#b45309" stroke-width="1.6"/><path d="M-14 -14 q-10 0 -8 8 q2 6 10 6 M14 -14 q10 0 8 8 q-2 6 -10 6" fill="none" stroke="#b45309" stroke-width="2"/><rect x="-3" y="10" width="6" height="8" fill="#b45309"/><rect x="-12" y="18" width="24" height="6" rx="2" fill="#92400e"/>`,
  medal: () =>
    `<path d="M-8 -22 L0 -6 L8 -22" fill="none" stroke="#3b82f6" stroke-width="5"/><circle cy="4" r="11" fill="#fcd34d" stroke="#b45309" stroke-width="2"/><path d="${starPath(0, 4, 5)}" fill="#fff"/>`,
  fire: () =>
    `<path d="M0 -24 q16 14 12 28 q-4 10 -12 10 q-10 0 -13 -10 q-3 -12 7 -18 q-2 8 3 10 q-2 -12 3 -20 z" fill="#f97316"/><path d="M0 -6 q8 8 4 16 q-2 4 -4 4 q-6 0 -6 -6 q0 -6 6 -14 z" fill="#fde047"/>`,
  iceCube: () => `<rect x="-14" y="-14" width="28" height="28" rx="5" fill="#bae6fd" opacity=".85" stroke="#7dd3fc" stroke-width="2"/><path d="M-8 -8 l6 0" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  skull: () =>
    `<path d="M-14 0 q0 -18 14 -18 q14 0 14 18 q0 6 -5 8 v6 h-18 v-6 q-5 -2 -5 -8 z" fill="#f8fafc" stroke="${INK}" stroke-width="2"/><circle cx="-6" cy="-2" r="4" fill="${INK}"/><circle cx="6" cy="-2" r="4" fill="${INK}"/><path d="M-4 14 v-3 M0 14 v-3 M4 14 v-3" stroke="${INK}" stroke-width="1.6"/>`,
  tombstone: (label = 'RIP') =>
    `<path d="M-22 26 V-10 q0 -18 22 -18 q22 0 22 18 V26 Z" fill="#94a3b8" stroke="#475569" stroke-width="2"/><text y="-2" text-anchor="middle" font-size="12" font-weight="800" fill="#334155" font-family="system-ui,sans-serif">${escapeSvg(label)}</text><path d="M-30 26 h60" stroke="#65a30d" stroke-width="5" stroke-linecap="round"/>`,
  ghost: () =>
    `<path d="M-14 16 V-4 q0 -16 14 -16 q14 0 14 16 V16 l-5 -5 -4 5 -5 -5 -5 5 -4 -5 z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.6"/><circle cx="-5" cy="-4" r="2.6" fill="${INK}"/><circle cx="5" cy="-4" r="2.6" fill="${INK}"/><ellipse cx="0" cy="4" rx="3" ry="3.6" fill="${INK}"/>`,
  shovel: () => `<path d="M0 -30 V12" stroke="#92400e" stroke-width="3.4"/><path d="M-8 10 h16 l-2 14 q-6 6 -12 0 z" fill="#94a3b8" stroke="#475569" stroke-width="1.4"/>`,
  bandaid: () => `<rect x="-16" y="-6" width="32" height="12" rx="6" fill="#fcd34d" transform="rotate(-30)"/><rect x="-5" y="-5" width="10" height="10" rx="2" fill="#fef3c7" transform="rotate(-30)"/>`,
  ringBox: () =>
    `<rect x="-14" y="0" width="28" height="16" rx="3" fill="#be123c"/><path d="M-14 0 q14 -14 28 0 z" fill="#9f1239"/><circle cy="-6" r="6" fill="none" stroke="#fcd34d" stroke-width="2.6"/><path d="M0 -15 l3 3 -3 3 -3 -3 z" fill="#a5f3fc"/>`,
  bottle: () =>
    `<rect x="-6" y="-26" width="12" height="10" rx="2" fill="#16a34a"/><path d="M-6 -16 q-6 6 -6 14 V22 h24 V-2 q0 -8 -6 -14 z" fill="#15803d"/><rect x="-10" y="2" width="20" height="10" fill="#fde68a"/><rect x="-7" y="-30" width="14" height="5" rx="2" fill="#facc15"/>`,
  glass: () => `<path d="M-8 -16 h16 l-2 14 q-6 4 -12 0 z" fill="#fef9c3" stroke="${INK}" stroke-width="1.6"/><path d="M0 0 v12 M-6 12 h12" stroke="${INK}" stroke-width="1.6"/><circle cx="-2" cy="-8" r="1.4" fill="#fff"/><circle cx="3" cy="-11" r="1" fill="#fff"/>`,
  door: () => `<rect x="0" y="-34" width="34" height="68" rx="2" fill="#a16207" stroke="#713f12" stroke-width="2"/><circle cx="27" cy="2" r="3" fill="#fcd34d"/>`,
  doorFrame: () => `<rect x="-2" y="-36" width="38" height="72" fill="none" stroke="#713f12" stroke-width="4"/>`,
  book: () => `<path d="M-20 -14 q10 -4 20 2 q10 -6 20 -2 v28 q-10 -4 -20 2 q-10 -6 -20 -2 z" fill="#fff" stroke="${INK}" stroke-width="2"/><path d="M0 -12 V16" stroke="${INK}" stroke-width="1.6"/>`,
  dumbbell: () => `<rect x="-16" y="-2" width="32" height="4" fill="#475569"/><rect x="-22" y="-9" width="7" height="18" rx="2" fill="${INK}"/><rect x="15" y="-9" width="7" height="18" rx="2" fill="${INK}"/>`,
  megaphone: () => `<path d="M-14 -6 L10 -16 V16 L-14 6 Z" fill="#f97316"/><rect x="-20" y="-6" width="7" height="12" rx="2" fill="${INK}"/>`,
  pin: (c = '#e11d48') => `<path d="M0 18 C-12 2 -14 -4 -14 -8 a14 14 0 0 1 28 0 c0 4 -2 10 -14 26 z" fill="${c}" stroke="#fff" stroke-width="2"/><circle cy="-8" r="5" fill="#fff"/>`,
  clockFace: () => `<circle r="16" fill="#fff" stroke="${INK}" stroke-width="2.4"/><path d="M0 0 V-9" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  clockHand: () => `<path d="M0 0 V-12" stroke="#e11d48" stroke-width="2" stroke-linecap="round"/>`,
  rainbow: () =>
    ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6']
      .map((c, i) => `<path d="M${-44 + i * 6} 0 a${44 - i * 6} ${44 - i * 6} 0 0 1 ${(44 - i * 6) * 2} 0" fill="none" stroke="${c}" stroke-width="6"/>`)
      .join(''),
  wind: () => `<path d="M-24 -6 h30 q8 0 8 -6 q0 -6 -6 -6 M-24 4 h40 q8 0 8 6 q0 6 -6 6 M-18 14 h16" fill="none" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>`,
  fog: () => `<path d="M-40 -8 h80 M-30 2 h70 M-44 12 h76" stroke="#cbd5e1" stroke-width="5" stroke-linecap="round" opacity=".85"/>`,
  thermo: (hot = true) =>
    `<rect x="-5" y="-26" width="10" height="38" rx="5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cy="16" r="8" fill="${hot ? '#ef4444' : '#3b82f6'}" stroke="${INK}" stroke-width="2"/><rect x="-2" y="${hot ? -20 : 2}" width="4" height="${hot ? 32 : 10}" fill="${hot ? '#ef4444' : '#3b82f6'}"/>`,
  suitcase: () => `<rect x="-18" y="-12" width="36" height="26" rx="4" fill="#f59e0b"/><path d="M-6 -12 v-5 h12 v5" fill="none" stroke="${INK}" stroke-width="2.4"/><path d="M-18 0 h36" stroke="#b45309" stroke-width="2"/>`,
  jet: () =>
    `<path d="M-30 0 q0 -5 8 -5 h40 q12 0 14 5 q-2 5 -14 5 h-40 q-8 0 -8 -5 z" fill="#f8fafc" stroke="#64748b" stroke-width="1.6"/><path d="M-4 -4 L-14 -18 h6 l14 14 z M-4 4 L-14 18 h6 l14 -14 z M-26 -4 l-6 -10 h5 l7 10 z" fill="#3b82f6"/>`,
  car: () =>
    `<path d="M-26 6 v-8 q0 -4 4 -4 h6 l8 -10 h18 l10 10 h6 q4 0 4 4 v8 z" fill="#ef4444"/><path d="M-6 -14 h8 v8 h-14 z M6 -14 h6 l8 8 h-14 z" fill="#bae6fd"/><circle cx="-14" cy="7" r="6" fill="${INK}"/><circle cx="14" cy="7" r="6" fill="${INK}"/>`,
  train: () => `<rect x="-28" y="-16" width="56" height="28" rx="8" fill="#6366f1"/><rect x="-22" y="-10" width="14" height="10" rx="2" fill="#e0e7ff"/><rect x="-4" y="-10" width="14" height="10" rx="2" fill="#e0e7ff"/><circle cx="-16" cy="14" r="4" fill="${INK}"/><circle cx="16" cy="14" r="4" fill="${INK}"/>`,
  house: () => `<path d="M-24 -2 L0 -24 L24 -2 Z" fill="#ef4444"/><rect x="-18" y="-4" width="36" height="28" fill="#fde68a"/><rect x="-5" y="8" width="10" height="16" fill="#92400e"/><rect x="7" y="2" width="8" height="8" fill="#bae6fd"/>`,
  office: () => `<rect x="-18" y="-30" width="36" height="56" fill="#94a3b8"/>${Array.from({ length: 4 }, (_, r) => `<rect x="-12" y="${-24 + r * 12}" width="8" height="7" fill="#e0f2fe"/><rect x="4" y="${-24 + r * 12}" width="8" height="7" fill="#e0f2fe"/>`).join('')}`,
  mountain: () => `<path d="M-40 24 L-10 -22 L6 0 L18 -12 L44 24 Z" fill="#64748b"/><path d="M-10 -22 L-18 -10 L-10 -12 L-4 -8 Z" fill="#fff"/>`,
  palm: () => `<path d="M0 30 q-4 -26 4 -42" fill="none" stroke="#92400e" stroke-width="5"/><path d="M4 -12 q-20 -12 -30 4 q14 -6 30 -4 q-10 -20 -2 -26 q6 14 2 26 q16 -14 28 -6 q-14 2 -28 6 z" fill="#16a34a"/>`,
  wave: () => `<path d="M-50 8 q12 -12 25 0 q12 12 25 0 q12 -12 25 0 q12 12 25 0 V22 H-50 Z" fill="#38bdf8" opacity=".9"/>`,
  tree: () => `<rect x="-3" y="4" width="6" height="18" fill="#92400e"/><circle cy="-8" r="16" fill="#22c55e"/><circle cx="-10" cy="0" r="10" fill="#16a34a"/><circle cx="10" cy="0" r="10" fill="#16a34a"/>`,
  cutlery: () => `<path d="M-8 -20 V20 M-12 -20 V-8 q4 4 8 0 V-20" fill="none" stroke="#94a3b8" stroke-width="2.4"/><path d="M8 20 V-20 q8 8 0 20" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>`,
  bed: () => `<rect x="-34" y="0" width="68" height="14" rx="3" fill="#a5b4fc"/><rect x="-34" y="-12" width="22" height="12" rx="5" fill="#fff"/><path d="M-36 -16 V22 M36 4 V22" stroke="#6366f1" stroke-width="4"/>`,
  alarm: () => `<circle r="15" fill="#f87171" stroke="${INK}" stroke-width="2"/><circle r="10" fill="#fff"/><path d="M0 0 V-7 M0 0 h5" stroke="${INK}" stroke-width="2"/><circle cx="-12" cy="-13" r="5" fill="#fcd34d" stroke="${INK}" stroke-width="1.6"/><circle cx="12" cy="-13" r="5" fill="#fcd34d" stroke="${INK}" stroke-width="1.6"/>`,
  laptop: () => `<rect x="-20" y="-16" width="40" height="26" rx="3" fill="${INK}"/><rect x="-16" y="-12" width="32" height="18" fill="#a5f3fc"/><path d="M-26 12 h52 l-4 6 h-44 z" fill="#94a3b8"/>`,
  hourglassTop: () => `<path d="M-10 -16 h20 l-10 14 z" fill="#fcd34d"/>`,
  hourglass: () => `<path d="M-12 -20 h24 M-12 20 h24 M-10 -20 q0 14 10 20 q-10 6 -10 20 M10 -20 q0 14 -10 20 q10 6 10 20" fill="none" stroke="${INK}" stroke-width="2.4"/><path d="M-8 18 h16 l-8 -8 z" fill="#fcd34d"/>`,
  kite: () => `<path d="M0 -22 L14 0 L0 16 L-14 0 Z" fill="#f43f5e"/><path d="M0 -22 V16 M-14 0 H14" stroke="#fff" stroke-width="1.6"/><path d="M0 16 q8 10 -2 18 q-8 8 2 14" fill="none" stroke="#94a3b8" stroke-width="1.4"/>`,
  flag: (c = '#22c55e') => `<path d="M0 22 V-22" stroke="${INK}" stroke-width="2.4"/><path d="M0 -22 h24 l-6 8 6 8 h-24 z" fill="${c}"/>`,
  anger: () => `<path d="M-8 -2 q4 0 4 -6 M2 -8 q0 4 6 4 M8 2 q-4 0 -4 6 M-2 8 q0 -4 -6 -4" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>`,
  question: () => `<text text-anchor="middle" font-size="26" font-weight="900" fill="#8b5cf6" font-family="system-ui,sans-serif">?</text>`,
  exclaim: () => `<text text-anchor="middle" font-size="28" font-weight="900" fill="#ef4444" font-family="system-ui,sans-serif">!</text>`,
  dust: () => `<circle cx="-10" r="7" fill="#e2e8f0"/><circle cx="0" cy="-4" r="9" fill="#e2e8f0"/><circle cx="11" r="7" fill="#e2e8f0"/>`,
  speedLines: () => `<path d="M-20 -8 h-14 M-16 0 h-20 M-20 8 h-12" stroke="#94a3b8" stroke-width="2.4" stroke-linecap="round"/>`,
  coin: () => `<circle r="12" fill="#fcd34d" stroke="#b45309" stroke-width="2"/><text y="5" text-anchor="middle" font-size="14" font-weight="800" fill="#7c2d12" font-family="system-ui,sans-serif">M</text>`,
  brokenGlass: () => `<path d="M-14 -14 L14 14 M14 -14 L-4 4 M-14 6 L0 0" stroke="#94a3b8" stroke-width="1.6"/>`,
  candle: () => `<rect x="-4" y="-6" width="8" height="24" rx="2" fill="#fef3c7" stroke="#d6d3d1"/>`,
  boxing: () => `<path d="M-10 -12 q16 -6 18 8 q2 12 -10 14 h-8 z" fill="#ef4444" stroke="#991b1b" stroke-width="1.6"/><rect x="-14" y="6" width="10" height="8" rx="2" fill="#fff"/>`,
  ball: () => `<circle r="11" fill="#fff" stroke="${INK}" stroke-width="2"/><path d="M0 -5 l5 3.5 -2 6 h-6 l-2 -6 z" fill="${INK}"/>`,
  guitar: () => `<path d="M-10 14 a10 10 0 1 1 12 -14 l14 -16 4 4 -16 14 a10 10 0 1 1 -14 12 z" fill="#d97706" stroke="#92400e" stroke-width="1.6"/><circle cx="-4" cy="6" r="3" fill="#78350f"/>`,
  bubble: () => `<circle r="7" fill="#e0f2fe" opacity=".75" stroke="#7dd3fc" stroke-width="1.2"/><circle cx="-2" cy="-2" r="1.6" fill="#fff"/>`,
  snowman: () => `<circle cy="10" r="14" fill="#fff" stroke="#cbd5e1" stroke-width="1.6"/><circle cy="-12" r="10" fill="#fff" stroke="#cbd5e1" stroke-width="1.6"/><path d="M0 -12 l9 2 -9 2 z" fill="#f97316"/><circle cx="-3" cy="-15" r="1.4" fill="${INK}"/><circle cx="3" cy="-15" r="1.4" fill="${INK}"/>`,
  check: () => `<circle r="15" fill="#22c55e" stroke="#15803d" stroke-width="2"/><path d="M-7 0 L-2 6 L8 -6" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  spider: () =>
    `<path d="M0 -60 V-8" stroke="#94a3b8" stroke-width="1.4"/><path d="M-6 -2 l-9 -6 M-6 2 l-10 2 M-6 5 l-8 8 M6 -2 l9 -6 M6 2 l10 2 M6 5 l8 8" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><circle cy="2" r="8" fill="${INK}"/><circle cx="-3" cy="0" r="2.2" fill="#fff"/><circle cx="3" cy="0" r="2.2" fill="#fff"/><circle cx="-3" cy="0.6" r="1" fill="${INK}"/><circle cx="3" cy="0.6" r="1" fill="${INK}"/>`,
  battery: () => `<rect x="-12" y="-18" width="24" height="38" rx="4" fill="#fff" stroke="${INK}" stroke-width="2.4"/><rect x="-5" y="-23" width="10" height="5" rx="1.5" fill="${INK}"/>`,
  batteryLevel: () => `<rect x="-8" y="-14" width="16" height="30" rx="2" fill="#ef4444"/>`,
  bowl: () =>
    `<path d="M-22 -4 h44 q-2 20 -22 22 q-20 -2 -22 -22 z" fill="#fde68a" stroke="#b45309" stroke-width="2"/><ellipse cy="-4" rx="22" ry="4" fill="#fb923c" stroke="#b45309" stroke-width="1.6"/><path d="M8 -6 L22 -24" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>`,
  clover: () =>
    [0, 90, 180, 270].map((r) => `<path d="${heartPath(0, -7, 7)}" transform="rotate(${r})" fill="#22c55e" stroke="#fff" stroke-width="1.2"/>`).join('') +
    `<path d="M0 0 q4 10 10 14" fill="none" stroke="#15803d" stroke-width="2.4" stroke-linecap="round"/>`,
  thought: () =>
    `<circle cx="-22" cy="22" r="3.5" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="-14" cy="13" r="5" fill="#fff" stroke="${INK}" stroke-width="1.6"/><ellipse rx="22" ry="16" fill="#fff" stroke="${INK}" stroke-width="2"/>`,
  sunglassesProp: () => `<path d="M-20 -4 h40 v4 q-2 9 -9 9 h-3 q-7 0 -8 -8 q-1 8 -8 8 h-3 q-7 0 -9 -9 z" fill="${INK}"/>`,
};

/** Une PANCARTE ou une bulle qui porte un texte — dynamique ou fixe, toujours échappé. */
export function sign(text: string, o: { readonly w?: number; readonly fill?: string; readonly ink?: string; readonly size?: number } = {}): string {
  const w = o.w ?? 120;
  const size = o.size ?? (text.length > 18 ? 11 : 14);
  return `<rect x="${-w / 2}" y="-16" width="${w}" height="32" rx="10" fill="${o.fill ?? '#fff'}" stroke="${INK}" stroke-width="2"/><text y="${size / 3}" text-anchor="middle" font-size="${size}" font-weight="800" fill="${o.ink ?? INK}" font-family="system-ui,sans-serif">${escapeSvg(text)}</text>`;
}

export function speech(text: string, o: { readonly w?: number; readonly tail?: 'l' | 'r' } = {}): string {
  const w = o.w ?? 110;
  const size = text.length > 16 ? 11 : 13;
  const tail = o.tail === 'r' ? `<path d="M${w / 2 - 22} 14 l10 14 l2 -14 z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` : `<path d="M${-w / 2 + 18} 14 l-8 14 l14 -14 z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
  return `${tail}<rect x="${-w / 2}" y="-16" width="${w}" height="32" rx="16" fill="#fff" stroke="${INK}" stroke-width="2"/><rect x="${-w / 2 + 6}" y="10" width="40" height="6" fill="#fff"/><text y="${size / 3}" text-anchor="middle" font-size="${size}" font-weight="800" fill="${INK}" font-family="system-ui,sans-serif">${escapeSvg(text)}</text>`;
}

/** Un ÉCLAT de confettis : `n` pièces qui partent de (x, y) dans toutes les directions. */
export function confettiBurst(x: number, y: number, role: string, n = 10, delay = 0): string {
  const colors = ['#f43f5e', '#fbbf24', '#22d3ee', '#a78bfa', '#34d399'];
  return Array.from({ length: n }, (_, i) => {
    const angle = (Math.PI * 2 * i) / n + 0.3;
    return at(x, y, P.confetti(colors[i % colors.length] ?? '#f43f5e'), {
      role,
      dx: Math.round(Math.cos(angle) * 60),
      dy: Math.round(Math.sin(angle) * 50 - 20),
      r: 180 + i * 37,
      d: delay,
    });
  }).join('');
}
