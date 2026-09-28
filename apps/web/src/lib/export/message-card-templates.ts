/**
 * **LES TEMPLATES D'UNE CARTE D'EXPORT** — des centaines de cartes, composées
 * de trois dimensions indépendantes plutôt que dessinées une à une :
 *
 *  - la PALETTE — le fond, ses encres, l'accent et le filigrane ;
 *  - la TYPOGRAPHIE — la police de la réponse et celle de la citation ;
 *  - la LIAISON — la façon dont la question mène à la réponse : l'orbite
 *    « ——— ○ ——— », un filet, de grands guillemets, une flèche de réponse,
 *    deux bulles de conversation, un fil qui descend, ou le seul silence.
 *
 * 14 palettes × 8 typographies × 7 liaisons = 784 templates, chacun nommé
 * par un identifiant STABLE `palette.typographie.liaison` : c'est lui que le
 * compteur d'usage (`message-card-usage.ts`) compte, et lui que le format par
 * défaut retient. Ajouter une palette ajoute 56 templates sans toucher aux
 * autres ; en renommer une casserait les compteurs — on n'en renomme pas.
 *
 * LES POLICES SONT CELLES DES STORIES (`story-fonts.ts`, OFL/Apache, latin),
 * écrites ici par leur nom : un import ferait de la table des polices un
 * morceau partagé compté dans le budget du lecteur de story. Le témoin
 * `message-card-templates.test.ts` tient chaque nom égal à la table.
 */

/** La pile native, écrite pour un `CanvasRenderingContext2D` : `var(--font-native)` n'a aucun sens hors CSS. */
export const CANVAS_NATIVE_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export type CardFont = {
  /** La famille du fichier embarqué, `null` pour la seule pile native. */
  readonly family: string | null;
  readonly weight: number;
  readonly style: 'normal' | 'italic';
};

export type CardPalette = {
  /** Un nom PROPRE, identique dans les sept langues (comme le nom d'une teinte de catalogue). */
  readonly name: string;
  readonly background: readonly (readonly [offset: number, color: string])[];
  readonly glow: string | null;
  readonly replyInk: string;
  readonly quoteInk: string;
  readonly authorInk: string;
  readonly accent: string;
  /** Le fond des bulles (liaison « bulles ») — la citation, puis la réponse. */
  readonly quotePanel: string;
  readonly replyPanel: string;
  readonly watermarkInk: string;
  readonly watermarkAlpha: number;
};

export type CardTypeface = {
  readonly replyFont: CardFont;
  readonly quoteFont: CardFont;
  /** Un corps plus petit pour les polices étroites ou très hautes : la même carte, lisible. */
  readonly replyScale: number;
};

const native = (weight: number, italic = false): CardFont => ({ family: null, weight, style: italic ? 'italic' : 'normal' });
const embedded = (family: string, weight: number): CardFont => ({ family, weight, style: 'normal' });

/** Les familles de `STORY_FONT_FAMILIES` employées, avec la graisse de LEUR fichier. */
export const CARD_STORY_FONTS = {
  bubble: embedded('Fredoka', 600),
  elegant: embedded('Prata', 400),
  brush: embedded('Caveat', 700),
  note: embedded('Patrick Hand', 400),
  poster: embedded('Anton', 400),
  futuristic: embedded('Saira Condensed', 800),
  retro: embedded('Cutive', 400),
  tag: embedded('Permanent Marker', 400),
} as const;

const dark = (
  name: string,
  stops: readonly (readonly [number, string])[],
  glow: string | null,
  accent: string,
  authorInk: string,
): CardPalette => ({
  name,
  background: stops,
  glow,
  replyInk: '#FFFFFF',
  quoteInk: 'rgba(255, 255, 255, 0.66)',
  authorInk,
  accent,
  quotePanel: 'rgba(255, 255, 255, 0.08)',
  replyPanel: 'rgba(255, 255, 255, 0.14)',
  watermarkInk: '#FFFFFF',
  watermarkAlpha: 0.05,
});

const light = (
  name: string,
  stops: readonly (readonly [number, string])[],
  glow: string | null,
  ink: string,
  quoteInk: string,
  accent: string,
  authorInk: string,
): CardPalette => ({
  name,
  background: stops,
  glow,
  replyInk: ink,
  quoteInk,
  authorInk,
  accent,
  quotePanel: 'rgba(255, 255, 255, 0.55)',
  replyPanel: 'rgba(255, 255, 255, 0.85)',
  watermarkInk: ink,
  watermarkAlpha: 0.05,
});

export const CARD_PALETTES = {
  aurore: dark('Aurore', [[0, '#1B1340'], [0.55, '#2A1B5C'], [1, '#0E0A24']], 'rgba(236, 72, 153, 0.28)', '#A78BFA', '#F9A8D4'),
  minuit: dark('Minuit', [[0, '#0B1020'], [1, '#111827']], 'rgba(59, 130, 246, 0.22)', '#60A5FA', '#93C5FD'),
  lagon: dark('Lagon', [[0, '#042F2E'], [1, '#0F766E']], 'rgba(45, 212, 191, 0.25)', '#5EEAD4', '#99F6E4'),
  braise: dark('Braise', [[0, '#1C0A05'], [0.6, '#431407'], [1, '#7C2D12']], 'rgba(251, 146, 60, 0.3)', '#FB923C', '#FDBA74'),
  foret: dark('Forêt', [[0, '#052E16'], [1, '#14532D']], 'rgba(132, 204, 22, 0.2)', '#A3E635', '#BEF264'),
  velours: dark('Velours', [[0, '#3B0764'], [1, '#701A75']], 'rgba(244, 114, 182, 0.3)', '#F0ABFC', '#F5D0FE'),
  ardoise: dark('Ardoise', [[0, '#18181B'], [1, '#27272A']], null, '#E4E4E7', '#A1A1AA'),
  editorial: light('Éditorial', [[0, '#FBF8F1'], [1, '#F1EADB']], null, '#1C1917', '#78716C', '#1C1917', '#9A3412'),
  manuscrit: light('Manuscrit', [[0, '#FFF4E0'], [1, '#FDE2C3']], 'rgba(251, 146, 60, 0.22)', '#3B2314', '#8A6A55', '#EA580C', '#C2410C'),
  /* Un fond déjà blanc : ses bulles se teintent d'encre plutôt que de blanc. */
  neige: { ...light('Neige', [[0, '#FFFFFF'], [1, '#F1F5F9']], null, '#0F172A', '#64748B', '#6366F1', '#4F46E5'), quotePanel: 'rgba(15, 23, 42, 0.05)', replyPanel: 'rgba(99, 102, 241, 0.08)' },
  peche: light('Pêche', [[0, '#FFE4E6'], [1, '#FECDD3']], 'rgba(255, 255, 255, 0.5)', '#4C0519', '#9F1239', '#E11D48', '#BE123C'),
  menthe: light('Menthe', [[0, '#ECFDF5'], [1, '#D1FAE5']], null, '#064E3B', '#047857', '#10B981', '#047857'),
  citron: light('Citron', [[0, '#FEFCE8'], [1, '#FEF08A']], null, '#422006', '#854D0E', '#CA8A04', '#A16207'),
  lavande: light('Lavande', [[0, '#F5F3FF'], [1, '#DDD6FE']], 'rgba(255, 255, 255, 0.45)', '#2E1065', '#6D28D9', '#7C3AED', '#6D28D9'),
} as const satisfies Readonly<Record<string, CardPalette>>;

export const CARD_TYPEFACES = {
  rond: { replyFont: CARD_STORY_FONTS.bubble, quoteFont: native(400, true), replyScale: 1 },
  didone: { replyFont: CARD_STORY_FONTS.elegant, quoteFont: CARD_STORY_FONTS.elegant, replyScale: 1 },
  plume: { replyFont: CARD_STORY_FONTS.brush, quoteFont: CARD_STORY_FONTS.note, replyScale: 1.08 },
  affiche: { replyFont: CARD_STORY_FONTS.poster, quoteFont: native(500), replyScale: 1 },
  futur: { replyFont: CARD_STORY_FONTS.futuristic, quoteFont: native(400), replyScale: 1.04 },
  machine: { replyFont: CARD_STORY_FONTS.retro, quoteFont: CARD_STORY_FONTS.retro, replyScale: 0.92 },
  marqueur: { replyFont: CARD_STORY_FONTS.tag, quoteFont: CARD_STORY_FONTS.note, replyScale: 0.9 },
  systeme: { replyFont: native(700), quoteFont: native(400, true), replyScale: 1 },
} as const satisfies Readonly<Record<string, CardTypeface>>;

export const CARD_LINKS = ['orbite', 'filet', 'guillemets', 'fleche', 'bulles', 'fil', 'silence'] as const;

export type CardPaletteId = keyof typeof CARD_PALETTES;
export type CardTypefaceId = keyof typeof CARD_TYPEFACES;
export type CardLinkId = (typeof CARD_LINKS)[number];

export const CARD_PALETTE_IDS = Object.keys(CARD_PALETTES) as readonly CardPaletteId[];
export const CARD_TYPEFACE_IDS = Object.keys(CARD_TYPEFACES) as readonly CardTypefaceId[];

export type MessageCardTemplateId = `${CardPaletteId}.${CardTypefaceId}.${CardLinkId}`;

export type MessageCardTemplate = {
  readonly id: MessageCardTemplateId;
  readonly palette: CardPalette;
  readonly paletteId: CardPaletteId;
  readonly typeface: CardTypeface;
  readonly typefaceId: CardTypefaceId;
  readonly link: CardLinkId;
};

export const templateIdOf = (parts: { readonly palette: CardPaletteId; readonly typeface: CardTypefaceId; readonly link: CardLinkId }): MessageCardTemplateId =>
  `${parts.palette}.${parts.typeface}.${parts.link}`;

const isPalette = (value: string): value is CardPaletteId => Object.hasOwn(CARD_PALETTES, value);
const isTypeface = (value: string): value is CardTypefaceId => Object.hasOwn(CARD_TYPEFACES, value);
const isLink = (value: string): value is CardLinkId => (CARD_LINKS as readonly string[]).includes(value);

/** Lit un identifiant venu du stockage : `null` s'il ne nomme aucun template (renommé, abîmé). */
export function parseTemplateId(value: unknown): MessageCardTemplateId | null {
  if (typeof value !== 'string') return null;
  const [palette = '', typeface = '', link = '', ...rest] = value.split('.');
  if (rest.length > 0 || !isPalette(palette) || !isTypeface(typeface) || !isLink(link)) return null;
  return templateIdOf({ palette, typeface, link });
}

export function templateOf(id: MessageCardTemplateId): MessageCardTemplate {
  const [palette, typeface, link] = id.split('.') as [CardPaletteId, CardTypefaceId, CardLinkId];
  return { id, palette: CARD_PALETTES[palette], paletteId: palette, typeface: CARD_TYPEFACES[typeface], typefaceId: typeface, link };
}

export const ALL_TEMPLATE_IDS: readonly MessageCardTemplateId[] = CARD_PALETTE_IDS.flatMap((palette) =>
  CARD_TYPEFACE_IDS.flatMap((typeface) => CARD_LINKS.map((link) => templateIdOf({ palette, typeface, link }))),
);

/** La vitrine d'un appareil qui n'a encore rien exporté : un template par caractère. */
export const FEATURED_TEMPLATE_IDS: readonly MessageCardTemplateId[] = [
  'aurore.rond.orbite',
  'editorial.didone.guillemets',
  'manuscrit.plume.fil',
  'minuit.affiche.fleche',
  'neige.systeme.bulles',
  'lagon.futur.filet',
];

export const DEFAULT_TEMPLATE_ID: MessageCardTemplateId = 'aurore.rond.orbite';

/** Un template tiré au hasard — `random` injecté pour que le témoin le fixe. */
export function randomTemplateId(random: () => number = Math.random): MessageCardTemplateId {
  const index = Math.min(ALL_TEMPLATE_IDS.length - 1, Math.floor(random() * ALL_TEMPLATE_IDS.length));
  return ALL_TEMPLATE_IDS[index] ?? DEFAULT_TEMPLATE_ID;
}

/** La chaîne `font` d'un contexte 2D — la famille embarquée puis la pile native, jamais un générique. */
export function canvasFont(font: CardFont, sizePx: number): string {
  const family = font.family === null ? CANVAS_NATIVE_STACK : `"${font.family}", ${CANVAS_NATIVE_STACK}`;
  return `${font.style === 'italic' ? 'italic ' : ''}${font.weight} ${Math.round(sizePx)}px ${family}`;
}

/** La police des grands guillemets de la liaison « guillemets » — une didone, quelle que soit la typographie. */
export const GUILLEMET_FONT: CardFont = CARD_STORY_FONTS.elegant;

/** Les polices qu'un template PEINT — celles que la peinture doit attendre avant de figer l'image. */
export function templateFonts(template: MessageCardTemplate): readonly CardFont[] {
  const fonts = [template.typeface.replyFont, template.typeface.quoteFont, ...(template.link === 'guillemets' ? [GUILLEMET_FONT] : [])];
  return fonts.filter((font, i) => font.family !== null && fonts.findIndex((other) => other.family === font.family && other.weight === font.weight) === i);
}
