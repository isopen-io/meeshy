import { DUO_TWINS } from './catalog-duo';
import { DUO_MORE } from './catalog-duo-2';
import { INSTANTS } from './catalog-instants';
import { MEE_SOLO } from './catalog-mee';
import { MEE_SOLO_MORE } from './catalog-mee-2';
import { MEO_SOLO } from './catalog-meo';
import { MEO_SOLO_MORE } from './catalog-meo-2';
import { MEE_TEMPLATE_PREFIX, isMeeTemplate } from './template';
import { MEE_CHARACTER_TABS } from './types';
import type { MeeSlots, MeeSticker, MeeTab } from './types';

/**
 * LE CATALOGUE DES STICKERS MEE (#9034) — l'unique registre, que lisent la
 * feuille de stickers, la bulle et les pages institutionnelles.
 */

export { MEE_TEMPLATE_PREFIX };

export const MEE_STICKERS: readonly MeeSticker[] = [
  ...MEE_SOLO,
  ...MEE_SOLO_MORE,
  ...MEO_SOLO,
  ...MEO_SOLO_MORE,
  ...DUO_TWINS,
  ...DUO_MORE,
  ...INSTANTS,
];

const BY_ID: ReadonlyMap<string, MeeSticker> = new Map(MEE_STICKERS.map((sticker) => [sticker.id, sticker]));

export function findMeeSticker(id: string): MeeSticker | undefined {
  return BY_ID.get(id);
}

export const meeTemplateId = (sticker: MeeSticker): string => `${MEE_TEMPLATE_PREFIX}${sticker.id}`;

/** Le sticker qu'un `templateId` de message désigne — `undefined` s'il ne vient pas de ce catalogue. */
export function meeStickerOfTemplate(templateId: string | undefined): MeeSticker | undefined {
  return isMeeTemplate(templateId) ? findMeeSticker(templateId.slice(MEE_TEMPLATE_PREFIX.length)) : undefined;
}

export const meeStickersOfTab = (tab: MeeTab): readonly MeeSticker[] => MEE_STICKERS.filter((sticker) => sticker.tab === tab);

/** L'onglet « Mee & Meo » (#9068) : tous les personnages, Mee puis Meo puis les duos — les sections les rangent ensuite par intention. */
export const MEE_CHARACTER_STICKERS: readonly MeeSticker[] = MEE_CHARACTER_TABS.flatMap(meeStickersOfTab);

/** Les seules valeurs qu'un sticker accepte : celles qu'il déclare, non vides. */
export function meeSlotsFor(sticker: MeeSticker, slots: MeeSlots): MeeSlots {
  return Object.fromEntries(sticker.slots.flatMap((key) => {
    const value = slots[key]?.trim();
    return value !== undefined && value !== '' ? [[key, value]] : [];
  }));
}
