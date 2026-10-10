import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import {
  BACKDROP_DARK_END,
  BACKDROP_DARK_START,
  BACKDROP_DARK_TINT,
  BACKDROP_LIGHT_BASE,
  BACKDROP_LIGHT_TINT_END,
  BACKDROP_LIGHT_TINT_START,
} from '@/lib/view/thread-backdrop';

import type { CSSProperties } from 'react';

/**
 * LE NOM D'AUTEUR TEINTÉ, STABLE PAR PERSONNE (#10004, note « look » de la
 * planche World Wide) — en groupe, chaque auteur garde SA couleur d'un message
 * à l'autre, d'un appareil à l'autre : la graine est la loi PARTAGÉE
 * `authorAccentColor` (`@meeshy/shared`, miroir iOS `colorForName(authorId)`),
 * l'identifiant primant sur le nom, jamais une seconde palette.
 *
 * UNE COULEUR VIVE N'EST PAS UNE ENCRE. La palette partagée est faite pour des
 * disques et des accents ; servie telle quelle sur une ligne d'identité de
 * 13 px, un bleu profond tombe sous 4,5:1 en sombre et un ambre sous 4,5:1 en
 * clair. Chaque schéma reçoit donc la teinte rapprochée de SON encre primaire
 * du plus petit pas qui tient l'AA sur TOUS les fonds que le fil peint sous
 * une ligne d'identité : une teinte déjà lisible reste exactement la sienne.
 * Le calcul vit ici, la feuille ne fait que choisir le schéma
 * (`.author-ink`, `styles/conversation-look.css`).
 */
export type AuthorInk = { readonly dark: string; readonly light: string };

type Rgb = readonly [number, number, number];

const rgbOf = (hex: string): Rgb => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as unknown as Rgb;
};

const hexOf = (rgb: Rgb): string => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** `color-mix(in srgb, a (1−t), b t)` — l'interpolation que la feuille applique. */
const mix = (a: string, b: string, t: number): string => {
  const [ra, ga, ba] = rgbOf(a);
  const [rb, gb, bb] = rgbOf(b);
  return hexOf([ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t]);
};

const luminance = (hex: string): number => {
  const linear = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

const contrast = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * LES FONDS QU'UNE LIGNE D'IDENTITÉ PEUT AVOIR SOUS ELLE — la surface et la
 * carte (`packages/design-tokens/ios.css`), CHAQUE arrêt du fond du fil
 * (`lib/view/thread-backdrop.ts`), seul puis sous
 * la LUEUR d'accent posée derrière l'en-tête (`.thread-backdrop`,
 * `styles/thread-scene.css`) prise au pire : un accent blanc en sombre, noir
 * en clair. Mesurer contre le pire accent possible rend la teinte
 * indépendante de la conversation où l'auteur écrit.
 *
 * L'intensité retenue est celle de la lueur à la PREMIÈRE ligne lisible, sous
 * l'en-tête (~120 px avec l'encoche) : la lueur décroît linéairement de son
 * plein (22 % sombre, 12 % clair) à zéro sur 260 px, et au-dessus de cette
 * ligne une rangée passe sous le verre de l'en-tête, qui la recouvre.
 */
const THREAD_GLOW_DARK = 0.12;
const THREAD_GLOW_LIGHT = 0.07;

export const AUTHOR_INK_SURFACES = {
  dark: { surface: '#09090b', card: '#13111c', ink: '#eef2ff' },
  light: { surface: '#ffffff', card: '#f8f7ff', ink: '#1e1b4b' },
} as const;

const WORST_ACCENT = { dark: '#ffffff', light: '#000000' } as const;
const hexToken = (token: string): string => `#${token.toLowerCase()}`;

/**
 * LES TROIS ARRÊTS DU FOND DU FIL, accent au pire, chacun SOUS la lueur : le
 * fond n'est pas un aplat — `thread-scene.css` teinte l'arrêt MÉDIAN (sombre)
 * ou les arrêts de BORD (clair) par l'accent, et la lueur haute s'y ajoute.
 * Ne mesurer que l'arrêt de fin laissait passer des teintes à 3,8:1 en clair.
 */
const BACKDROP_STOPS = {
  dark: [
    hexToken(BACKDROP_DARK_START),
    mix(hexToken(BACKDROP_DARK_START), WORST_ACCENT.dark, BACKDROP_DARK_TINT),
    hexToken(BACKDROP_DARK_END),
  ],
  light: [
    mix(hexToken(BACKDROP_LIGHT_BASE), WORST_ACCENT.light, BACKDROP_LIGHT_TINT_START),
    hexToken(BACKDROP_LIGHT_BASE),
    mix(hexToken(BACKDROP_LIGHT_BASE), WORST_ACCENT.light, BACKDROP_LIGHT_TINT_END),
  ],
} as const;

export const AUTHOR_INK_BACKGROUNDS: { readonly dark: readonly string[]; readonly light: readonly string[] } = {
  dark: [
    AUTHOR_INK_SURFACES.dark.surface,
    AUTHOR_INK_SURFACES.dark.card,
    ...BACKDROP_STOPS.dark,
    ...BACKDROP_STOPS.dark.map((stop) => mix(stop, WORST_ACCENT.dark, THREAD_GLOW_DARK)),
  ],
  light: [
    AUTHOR_INK_SURFACES.light.surface,
    AUTHOR_INK_SURFACES.light.card,
    ...BACKDROP_STOPS.light,
    ...BACKDROP_STOPS.light.map((stop) => mix(stop, WORST_ACCENT.light, THREAD_GLOW_LIGHT)),
  ],
};

const INK = { dark: AUTHOR_INK_SURFACES.dark.ink, light: AUTHOR_INK_SURFACES.light.ink } as const;
const AA = 4.5;
const STEP = 0.04;

const legibleOn = (backgrounds: readonly string[]) => (hex: string): boolean =>
  backgrounds.every((background) => contrast(hex, background) >= AA);

const inkFor = (tint: string, scheme: 'dark' | 'light'): string => {
  const legible = legibleOn(AUTHOR_INK_BACKGROUNDS[scheme]);
  const steps = Array.from({ length: Math.ceil(1 / STEP) + 1 }, (_, i) => Math.min(1, i * STEP));
  return steps.map((t) => mix(tint, INK[scheme], t)).find(legible) ?? INK[scheme];
};

export const authorInk = ({ authorId, name }: { readonly authorId: string | undefined | null; readonly name: string }): AuthorInk => {
  const tint = authorAccentColor(authorId, name).toLowerCase();
  return { dark: inkFor(tint, 'dark'), light: inkFor(tint, 'light') };
};

export const authorInkStyle = (author: { readonly authorId: string | undefined | null; readonly name: string }): CSSProperties => {
  const ink = authorInk(author);
  return { '--author-ink-dark': ink.dark, '--author-ink-light': ink.light } as CSSProperties;
};
