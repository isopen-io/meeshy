/**
 * LE DESSIN DE MEE ET MEO (#9034) — deux colibris « sticker », en chaînes SVG.
 *
 * Des CHAÎNES, pas des composants : le même dessin sert la feuille de
 * stickers (client Preact), la bulle de conversation, le PNG de repli rendu
 * dans un `<canvas>`, ET les pages institutionnelles préchauffées par bun hors
 * de Vite, où aucun composant de l'application ne se monte.
 *
 * Le personnage tient dans une boîte de 140 × 140, regard vers la DROITE. Les
 * parties qui bougent sont des `<g>` qui portent une classe de rôle (`b`,
 * `wl`, `wr`, `e`) suffixée du numéro du personnage : la chorégraphie
 * (`motion.ts`) les vise sans connaître le dessin. Le positionnement se pose
 * TOUJOURS sur un groupe parent : une transformation CSS remplace l'attribut
 * `transform` de l'élément qu'elle anime.
 */

export type MeeCharacter = 'mee' | 'meo';

export type MeeEyes =
  | 'open'
  | 'joy'
  | 'wink'
  | 'heart'
  | 'star'
  | 'sad'
  | 'angry'
  | 'dead'
  | 'dizzy'
  | 'closed'
  | 'wide'
  | 'smirk'
  | 'side'
  | 'teary'
  | 'cool'
  | 'coin';

export type MeeBeak = 'smile' | 'open' | 'kiss' | 'frown' | 'flat' | 'o' | 'grit' | 'tongue';

export type MeeAccessory =
  | 'party'
  | 'crown'
  | 'scarf'
  | 'beanie'
  | 'bow'
  | 'tie'
  | 'headphones'
  | 'bandage'
  | 'halo'
  | 'horns'
  | 'chef'
  | 'grad'
  | 'flower'
  | 'nightcap'
  | 'blush'
  | 'sweat'
  | 'veil'
  | 'tophat';

export type BirdPose = {
  readonly eyes?: MeeEyes;
  readonly beak?: MeeBeak;
  readonly acc?: readonly MeeAccessory[];
};

type Palette = {
  readonly a: string;
  readonly b: string;
  readonly line: string;
  readonly belly: string;
  readonly wing: string;
  readonly wing2: string;
  readonly tail: string;
  readonly heartA: string;
  readonly heartB: string;
  readonly crest: string;
  readonly cheek: string;
  readonly lashes: boolean;
  readonly flares: boolean;
};

export const MEE_PALETTES: Readonly<Record<MeeCharacter, Palette>> = {
  mee: {
    a: '#7ff0c8',
    b: '#14b8a6',
    line: '#0f766e',
    belly: '#f0fdfa',
    wing: '#e6fff7',
    wing2: '#7de8d2',
    tail: '#0f766e',
    heartA: '#fb7185',
    heartB: '#e11d48',
    crest: '#f43f5e',
    cheek: '#ff7a9a',
    lashes: true,
    flares: false,
  },
  meo: {
    a: '#5ee6a8',
    b: '#0d9b6c',
    line: '#065f46',
    belly: '#ecfdf5',
    wing: '#e3fcef',
    wing2: '#86efac',
    tail: '#d97706',
    heartA: '#a78bfa',
    heartB: '#6d28d9',
    crest: '#7c3aed',
    cheek: '#ff8fa8',
    lashes: false,
    flares: true,
  },
};

export const INK = '#1c1941';
const BEAK_LINE = '#b45309';

/** Échappe une valeur avant de l'écrire dans une chaîne SVG — texte comme attribut. */
export function escapeSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const heartPath = (x: number, y: number, s: number): string =>
  `M${x} ${y + s * 0.9} C${x - s * 1.7} ${y - s * 0.1} ${x - s * 0.9} ${y - s * 1.2} ${x} ${y - s * 0.35} C${x + s * 0.9} ${y - s * 1.2} ${x + s * 1.7} ${y - s * 0.1} ${x} ${y + s * 0.9} Z`;

const starPath = (x: number, y: number, r: number): string => {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    return `${(x + Math.cos(angle) * radius).toFixed(1)} ${(y + Math.sin(angle) * radius).toFixed(1)}`;
  });
  return `M${points.join(' L')} Z`;
};
export { starPath };

const EYE_X = [57, 83] as const;
const EYE_Y = 74;

function eye(kind: MeeEyes, x: number, y: number, i: number): string {
  const brow = (inner: number) =>
    `<path d="M${x - 9} ${y - 12 + (i === 0 ? -inner : inner)} L${x + 9} ${y - 12 + (i === 0 ? inner : -inner)}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  switch (kind) {
    case 'open':
      return `<ellipse cx="${x}" cy="${y}" rx="9" ry="10.5" fill="${INK}"/><ellipse cx="${x}" cy="${y + 5}" rx="6" ry="4" fill="#4c4a8a" opacity=".55"/><circle cx="${x + 3}" cy="${y - 4}" r="3.8" fill="#fff"/><circle cx="${x - 3}" cy="${y + 3.8}" r="1.7" fill="#fff"/>`;
    case 'joy':
      return `<path d="M${x - 8} ${y + 2} q8 -11 16 0" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
    case 'wink':
      return i === 1 ? eye('joy', x, y, i) : eye('open', x, y, i);
    case 'heart':
      return `<path d="${heartPath(x, y, 7.5)}" fill="#e11d48"/><circle cx="${x - 3}" cy="${y - 3}" r="1.6" fill="#fff" opacity=".8"/>`;
    case 'star':
      return `<path d="${starPath(x, y, 9.5)}" fill="#fbbf24" stroke="#f59e0b" stroke-width="1"/>`;
    case 'sad':
      return `<ellipse cx="${x}" cy="${y + 2}" rx="7.5" ry="8.5" fill="${INK}"/><circle cx="${x + 2.5}" cy="${y - 1}" r="3" fill="#fff"/>${brow(-3)}`;
    case 'angry':
      return `<ellipse cx="${x}" cy="${y + 1}" rx="7.5" ry="8" fill="${INK}"/><circle cx="${x + 2}" cy="${y - 1}" r="2.2" fill="#fff"/>${brow(4)}`;
    case 'dead':
      return `<path d="M${x - 7} ${y - 7} L${x + 7} ${y + 7} M${x + 7} ${y - 7} L${x - 7} ${y + 7}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    case 'dizzy':
      return `<path d="M${x} ${y} m-1 0 a1.5 1.5 0 1 1 3 0 a4 4 0 1 1 -7 0 a6.5 6.5 0 1 1 12 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
    case 'closed':
      return `<path d="M${x - 8} ${y - 1} q8 8 16 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    case 'wide':
      return `<circle cx="${x}" cy="${y}" r="10.5" fill="#fff" stroke="${INK}" stroke-width="2.6"/><circle cx="${x}" cy="${y}" r="4.6" fill="${INK}"/>`;
    case 'smirk':
      return `<path d="M${x - 8.5} ${y - 1} a8.5 9 0 0 0 17 0 z" fill="${INK}"/><circle cx="${x + 3}" cy="${y + 2.5}" r="2.4" fill="#fff"/><path d="M${x - 10} ${y - 2} h20" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    case 'side':
      return `<ellipse cx="${x}" cy="${y}" rx="9" ry="9.5" fill="#fff" stroke="${INK}" stroke-width="2.4"/><circle cx="${x + 4}" cy="${y + 1}" r="4.6" fill="${INK}"/><path d="M${x - 10} ${y - 5} h20" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    case 'teary':
      return `<ellipse cx="${x}" cy="${y}" rx="9.5" ry="11" fill="${INK}"/><circle cx="${x + 3}" cy="${y - 4}" r="4.2" fill="#fff"/><circle cx="${x - 3}" cy="${y + 3}" r="2.2" fill="#fff"/><path d="M${x - 8} ${y + 6} q8 6 16 0" fill="none" stroke="#7dd3fc" stroke-width="2.4"/>`;
    case 'coin':
      return `<circle cx="${x}" cy="${y}" r="9.5" fill="#fcd34d" stroke="#b45309" stroke-width="1.6"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="800" fill="#7c2d12" font-family="system-ui,sans-serif">M</text>`;
    case 'cool':
      return '';
  }
}

function eyes(kind: MeeEyes): string {
  if (kind === 'cool') {
    return `<path d="M44 66 h52 v6 q-2 12 -12 12 h-4 q-9 0 -10 -10 q-1 10 -10 10 h-4 q-10 0 -12 -12 z" fill="${INK}"/><path d="M50 69 l6 0 -8 8 z" fill="#fff" opacity=".5"/>`;
  }
  return eye(kind, EYE_X[0], EYE_Y, 0) + eye(kind, EYE_X[1], EYE_Y, 1);
}

/**
 * LE BEC — court et arrondi, posé sous les yeux et tourné vers la droite : un
 * petit bec de poussin plutôt qu'une aiguille de colibri. Il ne dépasse pas
 * le visage, si bien que la bouche se lit d'un coup d'œil, même en vignette.
 */
const UPPER = 'M65.5 84.5 Q61 88.5 65 92 L87.5 90.6 Q90.5 89 86.5 88 Z';
const LOWER = 'M66 96.5 Q63.5 99.5 67 101.5 L82.5 98 Q85 96.5 81.5 96 Z';
const CLOSED = 'M65.5 85 Q60.5 91 65.5 97.5 L86.5 93 Q90.5 91.3 86.5 89.6 Z';

function beak(kind: MeeBeak, fill: string): string {
  const shape = (d: string) => `<path d="${d}" fill="${fill}" stroke="${BEAK_LINE}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const shine = '<path d="M68 86.8 Q75 86 81 88" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>';
  const seam = (d: string) => `<path d="${d}" fill="none" stroke="${BEAK_LINE}" stroke-width="1.5" stroke-linecap="round"/>`;
  const mouth = (inner: string) => `<path d="M64.5 91 L87 90.2 Q85 97 81.5 97.5 L66.5 100.5 Q63 96 64.5 91 Z" fill="#9f1239"/>${inner}${shape(UPPER)}${shape(LOWER)}${shine}`;
  switch (kind) {
    case 'smile':
      return `${shape(CLOSED)}${seam('M63.8 90.6 Q75 94 87 90.9')}${shine}`;
    case 'flat':
      return `${shape(CLOSED)}${seam('M64 91.5 L87.5 91.3')}${shine}`;
    case 'frown':
      return `${shape('M65.5 86 Q60.5 92 65.5 98 L85.5 96 Q89.5 94.5 85.5 92 Z')}${seam('M64 92.8 Q75 90.6 86.5 94')}${shine}`;
    case 'kiss':
      return `${shape('M66 86 Q61.5 91 66 96 L81 92.5 Q84 91.2 81 89.6 Z')}${seam('M64.5 91.2 L82 91.2')}<path d="${heartPath(89, 87, 3.4)}" fill="#fb7185"/>`;
    case 'o':
      return `<ellipse cx="73" cy="97.5" rx="5" ry="5.8" fill="#9f1239"/><ellipse cx="73" cy="99.5" rx="2.8" ry="2.2" fill="#fb7185"/>${shape(UPPER)}${shine}`;
    case 'open':
      return mouth('<ellipse cx="74" cy="97.5" rx="6" ry="2.6" fill="#fb7185"/>');
    case 'grit':
      return mouth('<path d="M65.5 92 L86.5 91.2 L84.5 95.2 L67 96.6 Z" fill="#fff"/><path d="M71 92 v4 M76.5 91.8 v3.8 M82 91.6 v3.4" stroke="#d1d5db" stroke-width="1.1"/>');
    case 'tongue':
      return mouth('<path d="M70 96 Q71 107 77 106 Q82 105 80 95.5 Z" fill="#fb7185" stroke="#e11d48" stroke-width="1.2"/><path d="M75 97.5 v5" stroke="#e11d48" stroke-width="1" stroke-linecap="round"/>');
  }
}

function accessory(kind: MeeAccessory, p: Palette): string {
  switch (kind) {
    case 'party':
      return `<path d="M58 44 L74 8 L90 44 Z" fill="#f472b6"/><path d="M63 34 h22 M67 24 h14" stroke="#fde047" stroke-width="4"/><circle cx="74" cy="8" r="5" fill="#fde047"/>`;
    case 'crown':
      return `<path d="M50 46 L54 22 L64 36 L74 16 L84 36 L94 22 L98 46 Z" fill="#fcd34d" stroke="#b45309" stroke-width="2" stroke-linejoin="round"/><circle cx="74" cy="34" r="3" fill="#e11d48"/>`;
    case 'scarf':
      return `<path d="M36 100 q34 16 68 0 l2 10 q-36 18 -72 0 z" fill="#ef4444"/><path d="M88 108 l10 22 l8 -4 l-8 -20 z" fill="#dc2626"/>`;
    case 'beanie':
      return `<path d="M36 58 q34 -48 68 0 z" fill="#3b82f6"/><rect x="34" y="52" width="72" height="10" rx="5" fill="#1d4ed8"/><circle cx="70" cy="20" r="7" fill="#fff"/>`;
    case 'bow':
      return `<path d="M88 36 l14 -10 v20 z M88 36 l-14 -10 v20 z" fill="${p.heartA}"/><circle cx="88" cy="36" r="4" fill="${p.heartB}"/>`;
    case 'tie':
      return `<path d="M64 112 h12 l-6 6 z" fill="#1e3a8a"/><path d="M67 118 h6 l3 18 -6 6 -6 -6 z" fill="#2563eb"/>`;
    case 'headphones':
      return `<path d="M30 82 q0 -58 40 -58 q40 0 40 58" fill="none" stroke="#1f2937" stroke-width="6"/><rect x="22" y="72" width="14" height="22" rx="6" fill="#ef4444"/><rect x="104" y="72" width="14" height="22" rx="6" fill="#ef4444"/>`;
    case 'bandage':
      return `<rect x="56" y="44" width="30" height="10" rx="4" transform="rotate(-20 71 49)" fill="#fde68a"/><path d="M66 46 l2 6 M72 44 l2 6" stroke="#d97706" stroke-width="1.4"/>`;
    case 'halo':
      return `<ellipse cx="70" cy="28" rx="24" ry="6" fill="none" stroke="#fde047" stroke-width="5"/>`;
    case 'horns':
      return `<path d="M44 52 q-8 -22 4 -28 q0 14 10 20 z M96 52 q8 -22 -4 -28 q0 14 -10 20 z" fill="#dc2626"/>`;
    case 'chef':
      return `<path d="M46 50 q-12 -20 8 -24 q4 -14 16 -8 q12 -8 18 6 q18 2 6 26 z" fill="#fff" stroke="#e5e7eb" stroke-width="2"/><rect x="50" y="44" width="40" height="10" rx="3" fill="#f3f4f6"/>`;
    case 'grad':
      return `<path d="M30 36 L70 22 L110 36 L70 50 Z" fill="${INK}"/><rect x="54" y="40" width="32" height="10" fill="${INK}"/><path d="M106 37 v18" stroke="#fbbf24" stroke-width="3"/>`;
    case 'flower':
      return `<g transform="translate(98 44)"><circle r="5" cx="0" cy="-7" fill="#f9a8d4"/><circle r="5" cx="7" cy="0" fill="#f9a8d4"/><circle r="5" cx="0" cy="7" fill="#f9a8d4"/><circle r="5" cx="-7" cy="0" fill="#f9a8d4"/><circle r="4" fill="#fde047"/></g>`;
    case 'nightcap':
      return `<path d="M38 56 q20 -40 66 -28 q10 6 20 26 q-6 -14 -18 -14 q-30 -6 -68 16 z" fill="#6366f1"/><circle cx="124" cy="56" r="6" fill="#fff"/>`;
    case 'blush':
      return `<ellipse cx="44" cy="88" rx="9" ry="5.5" fill="#f43f5e" opacity=".7"/><ellipse cx="96" cy="88" rx="9" ry="5.5" fill="#f43f5e" opacity=".7"/>`;
    case 'sweat':
      return `<path d="M104 52 q-6 10 0 13 q6 -3 0 -13 z" fill="#7dd3fc" stroke="#38bdf8" stroke-width="1"/>`;
    case 'veil':
      return `<path d="M40 52 q30 -30 60 0 l14 60 q-44 10 -88 0 z" fill="#fff" opacity=".55"/><circle cx="70" cy="30" r="6" fill="#fda4af"/>`;
    case 'tophat':
      return `<rect x="50" y="10" width="40" height="34" rx="3" fill="${INK}"/><rect x="40" y="40" width="60" height="8" rx="4" fill="${INK}"/><rect x="50" y="34" width="40" height="5" fill="#e11d48"/>`;
  }
}

function crest(c: MeeCharacter, p: Palette): string {
  return c === 'mee'
    ? `<path d="M66 44 C58 28 74 16 84 24 C91 30 84 40 77 35" fill="none" stroke="${p.line}" stroke-width="9.5" stroke-linecap="round"/><path d="M66 44 C58 28 74 16 84 24 C91 30 84 40 77 35" fill="none" stroke="${p.crest}" stroke-width="6" stroke-linecap="round"/><circle cx="72" cy="24" r="1.6" fill="#fff" opacity=".75"/>`
    : `<g fill="${p.crest}" stroke="${p.heartB}" stroke-width="2" stroke-linejoin="round"><path d="M62 45 C58 35 48 31 38 34 C46 37 51 41 53 48 Z"/><path d="M69 43 C68 29 58 20 45 21 C55 27 59 34 60 45 Z"/><path d="M76 43 C77 30 70 18 60 14 C66 23 68 32 67 44 Z"/></g>`;
}

/**
 * UN COLIBRI. `n` numérote le personnage dans la scène (1 ou 2) : il suffixe
 * les classes de rôle et les identifiants de dégradé, qui doivent rester
 * uniques dans le document (`uid` vient de l'hôte).
 *
 * Le dessin cherche le MIGNON : un corps rond cerné d'un trait doux de sa
 * propre teinte, un reflet sur le dessus de la tête, de grands yeux brillants,
 * des joues roses et un bec court. Le contour blanc de sticker n'est pas ici :
 * il découpe la scène ENTIÈRE (`render.ts`), accessoires compris.
 */
export function bird(c: MeeCharacter, pose: BirdPose, n: 1 | 2, uid: string): string {
  const p = MEE_PALETTES[c];
  const id = `${uid}${c}${n}`;
  const acc = pose.acc ?? [];
  const head = acc.filter((a) => a !== 'scarf' && a !== 'tie' && a !== 'blush' && a !== 'sweat').map((a) => accessory(a, p)).join('');
  const neck = acc.filter((a) => a === 'scarf' || a === 'tie').map((a) => accessory(a, p)).join('');
  const face = acc.filter((a) => a === 'blush' || a === 'sweat').map((a) => accessory(a, p)).join('');
  const eyeKind = pose.eyes ?? 'open';
  const lashes =
    p.lashes && (eyeKind === 'open' || eyeKind === 'sad' || eyeKind === 'teary' || eyeKind === 'wide')
      ? `<path d="M50.5 67 l-4.5 -3.5 M48.5 71 l-5 -1.2 M89.5 67 l4.5 -3.5 M91.5 71 l5 -1.2" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
      : '';
  const flares = p.flares
    ? `<path d="M61 107 Q50 110 42 117 Q53 115 62 112 Z" fill="${p.heartB}"/><path d="M79 107 Q90 110 98 117 Q87 115 78 112 Z" fill="${p.heartB}"/>`
    : '';
  const cheeks = `<ellipse cx="45" cy="88" rx="7.5" ry="4.8" fill="${p.cheek}" opacity=".85"/><ellipse cx="98" cy="86" rx="7" ry="4.6" fill="${p.cheek}" opacity=".85"/>`;
  const wing = (cx: number, rot: number, vein: string) =>
    `<ellipse cx="${cx}" cy="70" rx="13" ry="24" transform="rotate(${rot} ${cx} 70)" fill="url(#${id}w)" stroke="${p.line}" stroke-width="2.2" stroke-opacity=".55"/><path d="${vein}" stroke="${p.wing2}" stroke-width="2" stroke-linecap="round" fill="none"/>`;
  return `<defs><radialGradient id="${id}b" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></radialGradient><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.wing}"/><stop offset="1" stop-color="${p.wing2}"/></linearGradient><linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.heartA}"/><stop offset="1" stop-color="${p.heartB}"/></linearGradient><linearGradient id="${id}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><g class="wl${n}">${wing(26, -34, 'M21 60 q2 12 7 22')}</g><path d="M61 112 C50 116 45 124 47 131 C53 130 57 126 60 122 C62 128 66 132 72 133 C74 125 70 117 66 112 Z" fill="${p.tail}" stroke="${p.line}" stroke-width="1.8" stroke-linejoin="round"/>${crest(c, p)}<circle cx="70" cy="80" r="40" fill="url(#${id}b)" stroke="${p.line}" stroke-width="2.4"/><ellipse cx="55" cy="55" rx="13" ry="7.5" transform="rotate(-28 55 55)" fill="#fff" opacity=".38"/><circle cx="76" cy="47.5" r="2.6" fill="#fff" opacity=".55"/><ellipse cx="70" cy="103" rx="26" ry="16" fill="${p.belly}" opacity=".96"/>${flares}<path d="${heartPath(70, 110, 8)}" fill="url(#${id}h)"/><circle cx="66" cy="107" r="1.5" fill="#fff" opacity=".9"/>${neck}${cheeks}<g class="e${n}">${eyes(eyeKind)}${lashes}</g>${beak(pose.beak ?? 'smile', `url(#${id}k)`)}${face}${head}<g class="wr${n}">${wing(114, 34, 'M119 60 q-2 12 -7 22')}</g>`;
}

/** Position d'un personnage SEUL dans la scène de 200 × 200. */
export const SOLO_AT = 'translate(30 40)';
/** Positions des DEUX personnages : le second est retourné, il regarde le premier. */
export const DUO_LEFT_AT = 'translate(2 64) scale(.68)';
export const DUO_RIGHT_AT = 'translate(198 64) scale(-.68 .68)';

export function placed(at: string, inner: string, role: string): string {
  return `<g transform="${at}"><g class="${role}">${inner}</g></g>`;
}
