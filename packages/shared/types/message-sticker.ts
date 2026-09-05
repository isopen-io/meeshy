/**
 * Sticker porté par un message de conversation (#4823).
 *
 * Un sticker est une DÉCORATION du composer de story (gabarit `templateId` +
 * `slots` + `animation`) ou un simple `emoji`. Le client l'envoie sous DEUX
 * formes à la fois : l'image PNG rendue, comme pièce jointe image ordinaire
 * (ce que lisent le web, Android et tout client de repli), et ce descripteur
 * dédié, pour qu'iOS rende la décoration nativement — donc ANIMÉE.
 *
 * Il voyage dans un champ `sticker` DÉDIÉ, jamais dans un `metadata` brut : la
 * passerelle seule le valide (`services/stickers/messageSticker.ts`) et l'écrit
 * dans `Message.metadata.sticker`, puis le ressert hissé au niveau racine sur
 * toutes les projections de message — même doctrine que `location`.
 *
 * `MESSAGE_STICKER_ANIMATIONS` est le MIROIR de l'énumération Swift
 * `StickerAnimation` (`packages/MeeshySDK/.../Models/Story/StickerAnimation.swift`)
 * : les deux listes doivent rester identiques, cas pour cas — une valeur admise
 * ici qu'iOS ne connaît pas ferait tomber son décodage du message entier.
 *
 * @see schema.prisma — `Message.metadata Json?`
 */
export const MESSAGE_STICKER_ANIMATIONS = [
  'pulse',
  'heartbeat',
  'wobble',
  'bounce',
  'float',
  'spin',
  'blink',
  'shake',
  'swing',
  'pop',
  'tada',
] as const;

export type MessageStickerAnimation = (typeof MESSAGE_STICKER_ANIMATIONS)[number];

export type MessageSticker = {
  readonly templateId?: string;
  readonly slots?: Readonly<Record<string, string>>;
  readonly animation?: MessageStickerAnimation;
  readonly emoji?: string;
};
