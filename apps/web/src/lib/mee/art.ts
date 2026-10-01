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
  readonly belly: string;
  readonly wing: string;
  readonly wing2: string;
  readonly tail: string;
  readonly heartA: string;
  readonly heartB: string;
  readonly crest: string;
  readonly cheek: string | null;
  readonly lashes: boolean;
  readonly flares: boolean;
};

export const MEE_PALETTES: Readonly<Record<MeeCharacter, Palette>> = {
  mee: {
    a: '#6ee7b7',
    b: '#0d9488',
    belly: '#f0fdfa',
    wing: '#ccfbf1',
    wing2: '#5eead4',
    tail: '#115e59',
    heartA: '#fb7185',
    heartB: '#be123c',
    crest: '#e11d48',
    cheek: '#fb7185',
    lashes: true,
    flares: false,
  },
  meo: {
    a: '#34d399',
    b: '#065f46',
    belly: '#ecfdf5',
    wing: '#d1fae5',
    wing2: '#6ee7b7',
    tail: '#b45309',
    heartA: '#a78bfa',
    heartB: '#5b21b6',
    crest: '#6d28d9',
    cheek: null,
    lashes: false,
    flares: true,
  },
};

export const INK = '#1c1941';
const BEAK = '#312e81';

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
      return `<ellipse cx="${x}" cy="${y}" rx="8.5" ry="10" fill="${INK}"/><circle cx="${x + 3}" cy="${y - 4}" r="3.4" fill="#fff"/><circle cx="${x - 2.5}" cy="${y + 3.5}" r="1.4" fill="#fff"/>`;
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

function beak(kind: MeeBeak): string {
  switch (kind) {
    case 'smile':
      return `<path d="M72 84 L130 99 L72 92 Z" fill="${BEAK}"/><path d="M66 95 q5 6 11 3" fill="none" stroke="${BEAK}" stroke-width="2.5" stroke-linecap="round"/>`;
    case 'open':
      return `<path d="M72 82 L128 92 L74 88 Z" fill="${BEAK}"/><path d="M74 91 L122 104 L72 97 Z" fill="${BEAK}"/><path d="M74 89 L94 95 L74 94 Z" fill="#fb7185"/>`;
    case 'kiss':
      return `<path d="M72 84 L108 90 L72 93 Z" fill="${BEAK}"/><circle cx="110" cy="90" r="3" fill="#fb7185"/>`;
    case 'frown':
      return `<path d="M72 85 L126 101 L72 92 Z" fill="${BEAK}"/><path d="M64 100 q6 -6 12 -1" fill="none" stroke="${BEAK}" stroke-width="2.5" stroke-linecap="round"/>`;
    case 'flat':
      return `<path d="M72 84 L128 97 L72 92 Z" fill="${BEAK}"/><path d="M64 97 h12" stroke="${BEAK}" stroke-width="2.5" stroke-linecap="round"/>`;
    case 'o':
      return `<path d="M72 83 L112 90 L72 91 Z" fill="${BEAK}"/><ellipse cx="70" cy="98" rx="4" ry="5" fill="${BEAK}"/>`;
    case 'grit':
      return `<path d="M72 82 L126 92 L74 88 Z" fill="${BEAK}"/><path d="M74 92 L120 103 L72 97 Z" fill="${BEAK}"/><path d="M78 91 l4 3 4 -2 4 3 4 -2 4 3 4 -2" fill="none" stroke="#fff" stroke-width="1.6"/>`;
    case 'tongue':
      return `<path d="M72 82 L126 91 L74 88 Z" fill="${BEAK}"/><path d="M74 91 L116 101 L72 97 Z" fill="${BEAK}"/><path d="M90 96 q6 12 12 4 q-2 -6 -12 -4 z" fill="#fb7185"/>`;
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
    ? `<path d="M66 43 C58 28 74 16 84 24 C91 30 84 40 77 35" fill="none" stroke="${p.crest}" stroke-width="6" stroke-linecap="round"/>`
    : `<path d="M64 44 C60 32 48 30 36 34 C46 36 52 40 54 47 Z" fill="${p.crest}"/><path d="M70 42 C68 26 56 18 42 20 C53 26 58 34 60 44 Z" fill="${p.crest}"/><path d="M77 42 C77 28 69 16 58 13 C66 22 68 32 68 43 Z" fill="${p.crest}"/>`;
}

/**
 * UN COLIBRI. `n` numérote le personnage dans la scène (1 ou 2) : il suffixe
 * les classes de rôle et les identifiants de dégradé, qui doivent rester
 * uniques dans le document (`uid` vient de l'hôte).
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
      ? `<path d="M51 66 l-4 -4 M48.5 69.5 l-5 -2 M89 66 l4 -4 M91.5 69.5 l5 -2" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
      : '';
  const flares = p.flares
    ? `<path d="M61 106 Q49 109 40 117 Q52 114 62 112 Z" fill="${p.heartB}"/><path d="M79 106 Q91 109 100 117 Q88 114 78 112 Z" fill="${p.heartB}"/>`
    : '';
  const cheeks = p.cheek
    ? `<ellipse cx="44" cy="88" rx="7" ry="4.5" fill="${p.cheek}" opacity=".55"/><ellipse cx="96" cy="88" rx="7" ry="4.5" fill="${p.cheek}" opacity=".55"/>`
    : '';
  return `<defs><linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></linearGradient><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.wing}"/><stop offset="1" stop-color="${p.wing2}"/></linearGradient><linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.heartA}"/><stop offset="1" stop-color="${p.heartB}"/></linearGradient></defs><g class="wl${n}"><ellipse cx="26" cy="70" rx="13" ry="24" transform="rotate(-34 26 70)" fill="url(#${id}w)"/><path d="M20 58 q2 14 8 26" stroke="${p.wing2}" stroke-width="2" fill="none"/></g><path d="M60 112 l-10 17 11 -5 7 9 5 -21 z" fill="${p.tail}"/>${crest(c, p)}<circle cx="70" cy="80" r="40" fill="url(#${id}b)"/><ellipse cx="70" cy="104" rx="25" ry="14" fill="${p.belly}" opacity=".95"/>${flares}<path d="${heartPath(70, 109, 9)}" fill="url(#${id}h)"/><circle cx="65" cy="106" r="1.6" fill="#fff" opacity=".9"/>${neck}${cheeks}<g class="e${n}">${eyes(eyeKind)}${lashes}</g>${beak(pose.beak ?? 'smile')}${face}${head}<g class="wr${n}"><ellipse cx="114" cy="70" rx="13" ry="24" transform="rotate(34 114 70)" fill="url(#${id}w)"/><path d="M120 58 q-2 14 -8 26" stroke="${p.wing2}" stroke-width="2" fill="none"/></g>`;
}

/** Position d'un personnage SEUL dans la scène de 200 × 200. */
export const SOLO_AT = 'translate(30 40)';
/** Positions des DEUX personnages : le second est retourné, il regarde le premier. */
export const DUO_LEFT_AT = 'translate(2 64) scale(.68)';
export const DUO_RIGHT_AT = 'translate(198 64) scale(-.68 .68)';

export function placed(at: string, inner: string, role: string): string {
  return `<g transform="${at}"><g class="${role}">${inner}</g></g>`;
}
