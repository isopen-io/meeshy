import '@/styles/glory-fonts.css';

import type { GloryFrameFont, GloryFrameTextSlot } from '@meeshy/shared/types/glory-frame-format';

import { CANVAS_NATIVE_STACK } from '@/lib/export/message-card-templates';

/**
 * **LES POLICES DES CADRES DE GLOIRE** (#10158, L6, § 5.6 du prompt des Cadres
 * de gloire) — la liste FERMÉE `GLORY_FRAME_FONTS` du contrat, servie par six
 * fichiers latins pris tels que Google Fonts les publie (provenance et licences :
 * `styles/fonts/NOTICE.md`) ; Caveat 700 reprend le fichier des polices de
 * story, que le bundler ne sert qu'une fois.
 *
 * Rien ici n'est dans le premier affichage : la feuille `glory-fonts.css` n'est
 * importée que par ce module, que seul le peintre des cadres (chunk paresseux)
 * importe ; les fichiers ne sont jamais précachés (`globIgnores` couvre
 * `assets/*.woff2`) et `measure-weight.mjs` les compte à part (`glory_fonts`).
 * Un canevas peint avec une police absente la remplace pour toujours : le
 * peintre attend `loadGloryFonts` avant sa première peinture.
 *
 * Ces polices ne dessinent que le latin. Tout texte vivant dans une autre
 * écriture prend la pile système, choisie d'après ses PLAGES UNICODE, jamais
 * d'après la langue de l'interface (D10) ; l'arabe, en plus, sans interlettrage
 * ni capitales forcées.
 */

export type GloryFontFile = {
  readonly file: string;
  readonly bytes: number;
  /** La valeur `font-weight` de la face : une graisse, ou l'intervalle d'un fichier variable. */
  readonly weight: string;
  /** Le fichier appartient aux polices de story (Caveat) : servi une fois, compté par `story_fonts`. */
  readonly shared?: true;
};

export type GloryFontFamily = { readonly files: readonly GloryFontFile[]; readonly licence: 'OFL-1.1' };

export const GLORY_FONT_FACES: Readonly<Record<GloryFrameFont, GloryFontFamily>> = {
  Cinzel: { licence: 'OFL-1.1', files: [{ file: 'glory-cinzel-latin.woff2', bytes: 25888, weight: '400 900' }] },
  'Cinzel Decorative': {
    licence: 'OFL-1.1',
    files: [
      { file: 'glory-cinzel-decorative-700-latin.woff2', bytes: 15428, weight: '700' },
      { file: 'glory-cinzel-decorative-900-latin.woff2', bytes: 14540, weight: '900' },
    ],
  },
  'Cormorant Garamond': { licence: 'OFL-1.1', files: [{ file: 'glory-cormorant-garamond-latin.woff2', bytes: 37776, weight: '300 700' }] },
  Fraunces: { licence: 'OFL-1.1', files: [{ file: 'glory-fraunces-latin.woff2', bytes: 36560, weight: '100 900' }] },
  Manrope: { licence: 'OFL-1.1', files: [{ file: 'glory-manrope-latin.woff2', bytes: 24576, weight: '200 800' }] },
  Caveat: { licence: 'OFL-1.1', files: [{ file: 'caveat-700-latin.woff2', bytes: 51068, weight: '700', shared: true }] },
};

export type TextScript = 'latin' | 'arabic' | 'other';

/** Ce que le sous-ensemble `latin` de Google Fonts dessine (son `unicode-range`). */
const LATIN_SUBSET: readonly (readonly [number, number])[] = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0304, 0x0304],
  [0x0308, 0x0308],
  [0x0329, 0x0329],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

const ARABIC: readonly (readonly [number, number])[] = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x0870, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
];

const within = (ranges: readonly (readonly [number, number])[], code: number): boolean => ranges.some(([low, high]) => code >= low && code <= high);

/** L'écriture d'un texte : `latin` s'il tient tout entier dans le sous-ensemble servi ; `arabic` s'il porte de l'arabe et rien d'autre de non latin. */
export function textScript(text: string): TextScript {
  const codes = Array.from(text, (char) => char.codePointAt(0) ?? 0);
  const foreign = codes.filter((code) => !within(LATIN_SUBSET, code));
  if (foreign.length === 0) return 'latin';
  return foreign.every((code) => within(ARABIC, code)) ? 'arabic' : 'other';
}

export type GloryTextFace = {
  /** La chaîne `font` d'un contexte 2D. */
  readonly font: string;
  /** L'interlettrage à appliquer, en pixels de l'image. */
  readonly tracking: number;
  /** Le peintre peut-il forcer les capitales ? Jamais en arabe. */
  readonly uppercase: boolean;
  /** `true` : la pile système, le texte n'est pas latin. */
  readonly system: boolean;
};

type SlotFont = Pick<GloryFrameTextSlot['font'], 'family' | 'weight' | 'style' | 'tracking'>;

const sizeOf = (px: number): number => Math.max(1, Math.round(px * 10) / 10);

/** La face d'un emplacement de texte pour CE texte, à `px` pixels. */
export function gloryTextFace(slot: SlotFont, text: string, px: number): GloryTextFace {
  const script = textScript(text);
  const head = `${slot.style} ${slot.weight} ${sizeOf(px)}px`;
  if (script === 'latin') return { font: `${head} "${slot.family}", ${CANVAS_NATIVE_STACK}`, tracking: slot.tracking, uppercase: true, system: false };
  return { font: `${head} ${CANVAS_NATIVE_STACK}`, tracking: script === 'arabic' ? 0 : slot.tracking, uppercase: script !== 'arabic', system: true };
}

export type GloryFontRequest = Pick<GloryFrameTextSlot['font'], 'family' | 'weight' | 'style'>;

/**
 * Attend les fichiers des faces demandées avant la première peinture. Un
 * chargement qui échoue laisse la pile native, sans lever ; sans
 * `document.fonts` (témoins, vieux moteurs), rien à attendre.
 */
export async function loadGloryFonts(
  requests: readonly GloryFontRequest[],
  fonts: Pick<FontFaceSet, 'load'> | undefined = typeof document === 'undefined' ? undefined : document.fonts,
): Promise<void> {
  if (fonts === undefined) return;
  const unique = [...new Set(requests.map((request) => `${request.style} ${request.weight} 40px "${request.family}"`))];
  await Promise.all(unique.map((font) => fonts.load(font).catch(() => undefined)));
}
