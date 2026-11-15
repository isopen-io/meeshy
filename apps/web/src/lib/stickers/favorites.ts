import { safeLocalStorage } from '@/lib/storage';
import type { SafeStorage } from '@/lib/storage';

/**
 * LES FAVORIS DE LA FEUILLE DE STICKERS (#9070) — la jumelle web de
 * `StickerUsageStore` (iOS, `packages/MeeshySDK/.../StickerUsageStore.swift`).
 *
 * Un favori est un RENVOI : sa nature et son identifiant, jamais l'image.
 * Un sticker retiré de la bibliothèque ou du catalogue laisse une entrée sans
 * cible, simplement ignorée à l'affichage — la purger effacerait un favori
 * qu'une version suivante pourrait rendre. Le plus récemment épinglé est en
 * tête : un raccourci ne réordonne pas ce que l'auteur a construit.
 *
 * Stockés sur l'appareil (`localStorage`), comme iOS les garde dans ses
 * réglages locaux.
 */

export type StickerFavorite = {
  /** `library` : un sticker de « Mes stickers » ; `mee` : un Mee ou un Meo du catalogue. */
  readonly kind: 'library' | 'mee';
  readonly value: string;
};

export const STICKER_FAVORITES_KEY = 'meeshy.sticker.favorites';

const KINDS: ReadonlySet<string> = new Set(['library', 'mee']);

const isEntry = (candidate: unknown): candidate is StickerFavorite =>
  typeof candidate === 'object' &&
  candidate !== null &&
  KINDS.has(String(Reflect.get(candidate, 'kind'))) &&
  typeof Reflect.get(candidate, 'value') === 'string' &&
  Reflect.get(candidate, 'value') !== '';

const same = (a: StickerFavorite, b: StickerFavorite): boolean => a.kind === b.kind && a.value === b.value;

export function parseFavorites(raw: string | null): readonly StickerFavorite[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry).map((entry) => ({ kind: entry.kind, value: entry.value })) : [];
  } catch {
    return [];
  }
}

export const isFavorite = (list: readonly StickerFavorite[], entry: StickerFavorite): boolean => list.some((item) => same(item, entry));

/** Épingler place en tête ; ré-épingler retire. */
export const toggleFavorite = (list: readonly StickerFavorite[], entry: StickerFavorite): readonly StickerFavorite[] =>
  isFavorite(list, entry) ? list.filter((item) => !same(item, entry)) : [entry, ...list];

export const readFavorites = (storage: SafeStorage = safeLocalStorage()): readonly StickerFavorite[] =>
  parseFavorites(storage.getItem(STICKER_FAVORITES_KEY));

export function writeFavorites(list: readonly StickerFavorite[], storage: SafeStorage = safeLocalStorage()): void {
  storage.setItem(STICKER_FAVORITES_KEY, JSON.stringify(list));
}
