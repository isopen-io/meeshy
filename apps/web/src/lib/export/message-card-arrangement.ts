import { MOSAIC_MAX_VISIBLE, mosaicAspectRatio, mosaicTiles, type TiledLayoutMode } from '@/lib/feed/mosaic-layout';

import type { CardMedia, CardVisualMedia } from './message-card-media';

/**
 * **OÙ ET COMMENT LES MÉDIAS SE POSENT SUR UNE CARTE** (#9236, jumelle web de
 * #9235 — `MessageCardDisposition.swift`).
 *
 * Deux questions SÉPARÉES. OÙ (`CardMediaLayout`) : au-dessus ou au-dessous de
 * la réponse, dans une colonne à sa gauche ou à sa droite, ou un visuel EN
 * FOND. COMMENT (`CardMediaArrangement`) : une seule image — celle qu'on
 * choisit —, la grille de deux par deux, ou les dispositions des POSTS (vague,
 * hero, zigzag), dessinées par la MÊME loi que le fil (`lib/feed/mosaic-layout.ts`) :
 * une seule géométrie pour le fil et la carte.
 *
 * `paintedVisualIndexes` est la seule réponse à « que montre la carte ? » : la
 * mise en page, les sorties offertes et le média qu'un export animé décode la
 * lisent toutes ici. Le visuel CHOISI (`featured`) est un état de l'atelier,
 * propre à un contenu : il ne s'enregistre pas avec le format.
 */

export const CARD_MEDIA_LAYOUTS = ['above', 'below', 'left', 'right', 'backdrop'] as const;
export type CardMediaLayout = (typeof CARD_MEDIA_LAYOUTS)[number];

export const CARD_MEDIA_ARRANGEMENTS = ['single', 'mosaic', 'wave', 'hero', 'sine'] as const;
export type CardMediaArrangement = (typeof CARD_MEDIA_ARRANGEMENTS)[number];

export const DEFAULT_MEDIA_LAYOUT: CardMediaLayout = 'above';
export const DEFAULT_MEDIA_ARRANGEMENT: CardMediaArrangement = 'mosaic';

/**
 * Les dispositions d'avant #9236 (`mediaStyle`) : la pleine largeur ne montrait
 * que la première pièce — une seule ; la bande, une rangée de vignettes égales —
 * la vague, la disposition de post qui pose aussi ses tuiles en une rangée.
 */
export const LEGACY_MEDIA_STYLES: Readonly<Record<string, CardMediaArrangement>> = { mosaique: 'mosaic', pleine: 'single', bande: 'wave' };

export type CardMediaDisposition = {
  readonly layout: CardMediaLayout;
  readonly arrangement: CardMediaArrangement;
  /** Le rang, dans les médias de la carte, du visuel que « une seule » et « en fond » montrent — `null` : le premier. */
  readonly featured: number | null;
};

export const isBeside = (layout: CardMediaLayout): layout is 'left' | 'right' => layout === 'left' || layout === 'right';

const isVisual = (media: CardMedia): media is CardVisualMedia => media.kind !== 'audio';

/** Les rangs des visuels PEINTS, dans l'ordre où la carte les pose. */
export function paintedVisualIndexes(media: readonly CardMedia[], disposition: CardMediaDisposition): readonly number[] {
  const visuals = media.flatMap((item, index) => (isVisual(item) ? [index] : []));
  const [first] = visuals;
  if (first === undefined || visuals.length === 1) return visuals;
  if (disposition.layout === 'backdrop' || disposition.arrangement === 'single') {
    const featured = disposition.featured;
    return [featured !== null && visuals.includes(featured) ? featured : first];
  }
  return visuals.slice(0, MOSAIC_MAX_VISIBLE);
}

/** Ce que la carte montre ET fait entendre : ses visuels peints, puis son premier son. */
export function paintedMediaIndexes(media: readonly CardMedia[], disposition: CardMediaDisposition): readonly number[] {
  const audio = media.findIndex((item) => item.kind === 'audio');
  return [...paintedVisualIndexes(media, disposition), ...(audio === -1 ? [] : [audio])];
}

/** La position qui s'applique vraiment : sans visuel, ni fond ni colonne — le son se pose au-dessus de la réponse. */
export function effectiveMediaLayout(layout: CardMediaLayout, hasVisuals: boolean): CardMediaLayout {
  if (hasVisuals) return layout;
  return layout === 'below' ? 'below' : 'above';
}

/** Une pièce posée dans son bloc — `index` est son rang dans les médias de la carte. */
export type CardMediaSlot = {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Les visuels non montrés, comptés sur la DERNIÈRE tuile — « +n ». */
  readonly overflow: number;
};

const GAP = 12;
/** Le rapport hauteur / largeur minimal d'une disposition de post dans une colonne : en portrait, ses tuiles ne s'écrasent pas. */
const COLUMN_POST_RATIO = 1.4;

const ratioOf = (media: CardVisualMedia): number => {
  const ratio = media.width > 0 && media.height > 0 ? media.height / media.width : 1;
  return Math.min(1.25, Math.max(0.5, ratio));
};

const slot = (index: number, x: number, y: number, width: number, height: number, overflow = 0): CardMediaSlot => ({ index, x, y, width, height, overflow });

type Arranged = { readonly slots: readonly CardMediaSlot[]; readonly height: number };

/** Une, deux, trois ou quatre images : une pleine largeur, deux côte à côte, une puis deux en colonne, ou deux par deux. */
function mosaic(painted: readonly number[], width: number, cap: number, overflow: number): Arranged {
  const half = Math.floor((width - GAP) / 2);
  const cells = (() => {
    if (painted.length === 2) {
      const height = Math.min(cap, half);
      return { boxes: [slot(0, 0, 0, half, height), slot(1, half + GAP, 0, half, height)], height };
    }
    const height = Math.min(cap, Math.round(width * 0.75));
    const row = Math.floor((height - GAP) / 2);
    const rest = height - row - GAP;
    if (painted.length === 3) {
      return { boxes: [slot(0, 0, 0, half, height), slot(1, half + GAP, 0, half, row), slot(2, half + GAP, row + GAP, half, rest)], height };
    }
    return { boxes: [slot(0, 0, 0, half, row), slot(1, half + GAP, 0, half, row), slot(2, 0, row + GAP, half, rest), slot(3, half + GAP, row + GAP, half, rest)], height };
  })();
  const last = cells.boxes.length - 1;
  return {
    slots: cells.boxes.flatMap((box, i) => {
      const index = painted[box.index];
      return index === undefined ? [] : [{ ...box, index, overflow: i === last ? overflow : 0 }];
    }),
    height: cells.height,
  };
}

/** Les dispositions des POSTS : les cadres du fil, posés dans une boîte au rapport du mode, bornée par `cap`. */
function post(painted: readonly number[], total: number, mode: TiledLayoutMode, width: number, cap: number, column: boolean): Arranged {
  const ratio = mosaicAspectRatio(mode);
  const height = Math.min(cap, Math.round(width * (column ? Math.max(ratio, COLUMN_POST_RATIO) : ratio)));
  const slots = mosaicTiles(Math.max(total, painted.length), mode).flatMap((tile) => {
    const index = painted[tile.index];
    return index === undefined
      ? []
      : [slot(index, Math.round(tile.x * width), Math.round(tile.y * height), Math.round(tile.width * width), Math.round(tile.height * height), tile.overflow)];
  });
  return { slots, height };
}

/**
 * LES VISUELS PEINTS, AGENCÉS dans `width` (au plus `cap` de haut) — `total`
 * compte tous les visuels de la carte, pour le « +n ». `column` : le bloc est
 * une colonne à côté de la réponse.
 */
export function arrangeVisuals(params: {
  readonly media: readonly CardMedia[];
  readonly painted: readonly number[];
  readonly total: number;
  readonly arrangement: CardMediaArrangement;
  readonly width: number;
  readonly cap: number;
  readonly column: boolean;
}): Arranged {
  const { media, painted, width, cap } = params;
  const [first] = painted;
  const firstMedia = first === undefined ? undefined : media[first];
  if (first === undefined || firstMedia === undefined || firstMedia.kind === 'audio' || cap <= 0) return { slots: [], height: 0 };
  if (painted.length === 1) {
    const height = Math.min(cap, Math.round(width * ratioOf(firstMedia)));
    return { slots: [slot(first, 0, 0, width, height)], height };
  }
  const { arrangement } = params;
  if (arrangement === 'wave' || arrangement === 'hero' || arrangement === 'sine') return post(painted, params.total, arrangement, width, cap, params.column);
  return mosaic(painted, width, cap, Math.max(0, params.total - painted.length));
}
