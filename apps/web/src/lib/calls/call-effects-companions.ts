import type { CallCaption } from './call-captions';
import type { TileSize } from './call-self-tile';

/**
 * **EN MODE EFFETS, LES AUTRES RESTENT À L'ÉCRAN** (#8737) — la scène montre
 * MON image filtrée ; les autres participants l'accompagnent dans un bloc posé
 * en haut. Miroir de `CallEffectsCompanionRule`
 * (`apps/ios/Meeshy/Features/Main/Models/CallEffectsCompanions.swift`) : le duo
 * est le cas du groupe à un seul accompagnant — une règle, une vue.
 *
 * - qui : jamais moi, sauf quand une vignette distante est à la une ; les
 *   autres dans l'ordre d'arrivée, trois au plus, le reste en « +N » ; un
 *   orateur hors cadre prend la DERNIÈRE place quand aucun accompagnant
 *   visible ne parle — le bloc ne se réagence pas autrement ;
 * - combien : ce que la largeur tient, la place du « +N » réservée dès que
 *   tout le monde ne tient pas ;
 * - où : un des deux coins du HAUT (le bas est au carrousel et à sa barre),
 *   le plus proche de la dépose, en coordonnées physiques — de droite à
 *   gauche, le coin de tête est à droite.
 */

export const MAX_COMPANIONS = 3;

export const LOCAL_COMPANION_ID = 'local';

export const MIN_COMPANION_HEIGHT = 44;

const ASPECT_RATIO = 1.4;

/**
 * Les tailles d'une vignette : celles de MA vignette x2 et x1 (`call-self-tile.ts`,
 * gardées égales par le témoin), et celle de la bande de la grille. Recopiées
 * et non importées : la loi de ma vignette vit dans l'écran d'appel, que le
 * chunk du mode n'importe jamais.
 */
export const COMPANION_TILE = {
  duo: { width: 112, height: 160 },
  group: { width: 84, height: 112 },
  compact: { width: 80, height: 114 },
} as const satisfies Readonly<Record<string, TileSize>>;

export type CompanionTile = {
  readonly id: string;
  readonly isLocal: boolean;
  readonly isSpeaking: boolean;
};

export type CompanionLayout<T extends CompanionTile> = {
  readonly stageTileId: string;
  readonly companions: readonly T[];
  readonly overflow: number;
};

export type CompanionCorner = 'top-leading' | 'top-trailing';

function promotingHiddenSpeaker<T extends CompanionTile>(visible: readonly T[], candidates: readonly T[]): readonly T[] {
  if (visible.length === 0 || visible.some((tile) => tile.isSpeaking)) return visible;
  const speaker = candidates.slice(visible.length).find((tile) => tile.isSpeaking);
  return speaker === undefined ? visible : [...visible.slice(0, -1), speaker];
}

export function companionLayout<T extends CompanionTile>({ tiles, featuredId, capacity }: { readonly tiles: readonly T[]; readonly featuredId: string | null; readonly capacity: number }): CompanionLayout<T> {
  const localId = tiles.find((tile) => tile.isLocal)?.id ?? LOCAL_COMPANION_ID;
  const stageTileId = tiles.find((tile) => featuredId !== null && tile.id === featuredId)?.id ?? localId;
  const me = stageTileId === localId ? [] : tiles.filter((tile) => tile.isLocal);
  const candidates = [...me, ...tiles.filter((tile) => !tile.isLocal && tile.id !== stageTileId)];
  const slots = Math.max(0, Math.min(capacity, MAX_COMPANIONS));
  const companions = promotingHiddenSpeaker(candidates.slice(0, slots), candidates);
  return { stageTileId, companions, overflow: candidates.length - companions.length };
}

export function companionCapacity({ availableWidth, tileWidth, spacing, chipWidth, count }: { readonly availableWidth: number; readonly tileWidth: number; readonly spacing: number; readonly chipWidth: number; readonly count: number }): number {
  const bounded = Math.max(0, Math.min(count, MAX_COMPANIONS));
  const rowWidth = (n: number): number => (n === 0 ? 0 : n * tileWidth + (n - 1) * spacing);
  if (bounded === count && rowWidth(count) <= availableWidth) return count;
  const fits = Array.from({ length: bounded + 1 }, (_, index) => bounded - index).find((n) => rowWidth(n) + (n === 0 ? 0 : spacing) + chipWidth <= availableWidth);
  return fits ?? 0;
}

export function companionTileSize({ companionCount, freeHeight }: { readonly companionCount: number; readonly freeHeight: number }): TileSize | null {
  const preferred = companionCount <= 1 ? COMPANION_TILE.duo : COMPANION_TILE.group;
  if (preferred.height <= freeHeight) return preferred;
  if (COMPANION_TILE.compact.height <= freeHeight) return COMPANION_TILE.compact;
  if (freeHeight < MIN_COMPANION_HEIGHT) return null;
  return { width: Math.round(freeHeight / ASPECT_RATIO), height: freeHeight };
}

export function companionCorner({ dropX, containerWidth, rtl }: { readonly dropX: number; readonly containerWidth: number; readonly rtl: boolean }): CompanionCorner {
  const dropsLeft = dropX < containerWidth / 2;
  return dropsLeft !== rtl ? 'top-leading' : 'top-trailing';
}

export const otherCorner = (corner: CompanionCorner): CompanionCorner => (corner === 'top-leading' ? 'top-trailing' : 'top-leading');

/** Le bord gauche, en coordonnées physiques, du bloc au repos dans son coin. */
export function companionRestingLeft({ corner, blockWidth, containerWidth, margin, rtl }: { readonly corner: CompanionCorner; readonly blockWidth: number; readonly containerWidth: number; readonly margin: number; readonly rtl: boolean }): number {
  const sitsLeft = (corner === 'top-leading') !== rtl;
  return sitsLeft ? margin : containerWidth - margin - blockWidth;
}

/**
 * Qui parle, faute d'un niveau audio sur le web : un pair dont le DERNIER
 * segment de sous-titre est encore en cours. Sans sous-titres, personne.
 */
export function speakingPeers(captions: readonly CallCaption[]): ReadonlySet<string> {
  const latest = new Map(
    captions
      .filter((caption) => !caption.mine)
      .sort((a, b) => a.at - b.at)
      .map((caption) => [caption.speakerId, caption] as const),
  );
  return new Set([...latest.values()].filter((caption) => !caption.isFinal).map((caption) => caption.speakerId));
}
