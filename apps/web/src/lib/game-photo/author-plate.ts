import type { AchievementRarity } from '@meeshy/shared/utils/game/glory';

import { blasonDesign } from '@/lib/game/ranks';
import type { GamePaint } from '@/lib/game/materials';
import type { Viewer } from '@/lib/api/viewer';
import { translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import type { PhotoEmblem } from './moments';

/**
 * LA PLAQUE D'AUTEUR (#10816) — constat porteur : « le cadre du premier
 * achievement ne dit rien sur l'auteur ». Le cadre d'un succès, d'un rang ou
 * d'une fin de mission grave le PSEUDO de son auteur dans un cartouche : la
 * formule de la famille (« Succès de », « Rang atteint par », « Mission menée
 * par ») et `@pseudo`, à côté d'un médaillon (photo ou monogramme).
 *
 * Tout est une DONNÉE tirée de l'étape, jamais un dessin par cas :
 *  - un succès prend le métal de SA rareté VISIBLE (`visibleRarity`) et
 *    s'estampe à partir d'épique ; sans rareté servie, la plaque neutre ;
 *  - un rang estampe dans le métal de son blason (`blasonDesign`) ;
 *  - une mission accomplie se gratte, comme un ticket.
 *
 * Le PSEUDO, jamais le nom d'affichage (qui peut être un vrai nom) ; un invité,
 * sans pseudo public, n'a pas de plaque. Planche : `docs/product/cadres-de-gloire/planche-cadres-auteur.html`.
 * Miroir iOS à venir : la même table (voir le commentaire de clôture de #10816).
 */

export type PlateFamily = 'achievement' | 'rank' | 'mission';
export type PlateFinish = 'engrave' | 'emboss' | 'scratch';
export type PlateStyle = { readonly family: PlateFamily; readonly finish: PlateFinish; readonly metal: GamePaint };

/** L'auteur d'une photo : son pseudo public et, s'il en a une, sa photo de profil. */
export type PhotoAuthor = { readonly handle: string; readonly avatar?: string };

export type AuthorPlate = PlateStyle & {
  /** « Succès de » : la formule, au-dessus du pseudo. */
  readonly caption: string;
  /** « @atabeth », coupé et normalisé. */
  readonly name: string;
  readonly monogram: string;
  /** La phrase que lit un lecteur d'écran : « Succès de @atabeth ». */
  readonly label: string;
  readonly avatar?: string;
};

const RARITY_PLATE: Readonly<Record<AchievementRarity, Omit<PlateStyle, 'family'>>> = {
  common: { finish: 'engrave', metal: 'bronze' },
  rare: { finish: 'engrave', metal: 'silver' },
  epic: { finish: 'emboss', metal: 'platinum' },
  legendary: { finish: 'emboss', metal: 'gold' },
  mythic: { finish: 'emboss', metal: 'prism' },
};

const NEUTRAL_PLATE: Omit<PlateStyle, 'family'> = { finish: 'engrave', metal: 'indigo' };

export function plateStyleOf(emblem: PhotoEmblem): PlateStyle | null {
  switch (emblem.kind) {
    case 'achievement':
      return { family: 'achievement', ...(emblem.rarity === undefined ? NEUTRAL_PLATE : RARITY_PLATE[emblem.rarity]) };
    case 'rank':
      return { family: 'rank', finish: 'emboss', metal: blasonDesign(emblem.rank).material };
    case 'mission':
      return { family: 'mission', finish: 'scratch', metal: 'obsidian' };
    default:
      return null;
  }
}

/** Au-delà, le pseudo se coupe : la plaque garde une taille de lettre lisible plutôt que de rétrécir. */
export const MAX_HANDLE_GRAPHEMES = 16;

const SEGMENTER = new Intl.Segmenter('und', { granularity: 'grapheme' });
const graphemes = (text: string): string[] => Array.from(SEGMENTER.segment(text), (part) => part.segment);

const bareHandle = (handle: string): string => handle.trim().normalize('NFC').replace(/^@+/, '');

export function engravedHandle(handle: string): string {
  const parts = graphemes(bareHandle(handle));
  const kept = parts.length > MAX_HANDLE_GRAPHEMES ? `${parts.slice(0, MAX_HANDLE_GRAPHEMES - 1).join('')}…` : parts.join('');
  return `@${kept}`;
}

export function monogramOf(handle: string): string {
  return graphemes(bareHandle(handle))
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase();
}

export function authorPlateOf(emblem: PhotoEmblem, author: PhotoAuthor | null, language: InterfaceLanguage = currentInterfaceLanguage()): AuthorPlate | null {
  const style = plateStyleOf(emblem);
  if (style === null || author === null || bareHandle(author.handle) === '') return null;
  const name = engravedHandle(author.handle);
  return {
    ...style,
    caption: translateGame(language, `game.photo.author.caption.${style.family}`),
    name,
    monogram: monogramOf(author.handle),
    label: translateGame(language, `game.photo.author.label.${style.family}`, { name }),
    ...(author.avatar === undefined ? {} : { avatar: author.avatar }),
  };
}

/** L'auteur d'une photo, depuis le lecteur : un compte inscrit a un pseudo public ; un invité ou un visiteur, non. */
export const photoAuthorOf = (viewer: Viewer): PhotoAuthor | null =>
  viewer.isAnonymous || viewer.handle === null ? null : { handle: viewer.handle, ...(viewer.avatar === undefined ? {} : { avatar: viewer.avatar }) };
