/**
 * La DÉFINITION d'un sticker de bibliothèque — « Mes stickers » (#7938).
 *
 * Deux choses portent le mot « sticker » dans le dépôt, et elles ne se
 * confondent pas :
 * - `MessageSticker` (`message-sticker.ts`) est la RECETTE d'une décoration
 *   posée dans un message : gabarit iOS + textes, ou un emoji ;
 * - `StickerDefinition` (ici) est un OBJET que l'utilisateur POSSÈDE : une
 *   image qu'il a créée depuis un fichier, un collage, un détourage ou un
 *   sticker reçu, rangée dans sa bibliothèque et réutilisable d'un appareil à
 *   l'autre. Un message qui l'envoie porte `MessageSticker.stickerId`.
 *
 * Les bornes vivent ICI, une fois, parce que trois sites les appliquent : le
 * client qui normalise avant d'envoyer, la passerelle qui refuse ce qui
 * dépasse, et iOS qui mirera la même table. Un sticker est une image
 * TRANSPARENTE de petite taille : le JPEG n'en est pas un (pas de canal alpha),
 * la vidéo non plus.
 *
 * @see schema.prisma — `UserSticker`
 */

export const STICKER_MIME_TYPES = ['image/png', 'image/webp', 'image/gif'] as const;
export type StickerMimeType = (typeof STICKER_MIME_TYPES)[number];

/**
 * Ce qu'on ACCEPTE pour créer un sticker est plus large que ce qu'on GARDE :
 * une photo JPEG collée d'ailleurs devient un sticker — l'utilisateur n'a pas
 * à savoir qu'un JPEG n'a pas de transparence (dimension 12). Elle est
 * convertie en WebP à la normalisation (`stickerStoredMime`).
 */
export type StickerSourceMimeType = StickerMimeType | 'image/jpeg';

/** D'où vient le sticker — l'origine ne change pas le rendu, elle dit à
 * l'utilisateur (et à l'analyse d'usage) quel geste l'a créé. */
export const STICKER_ORIGINS = ['upload', 'paste', 'lift', 'received'] as const;
export type StickerOrigin = (typeof STICKER_ORIGINS)[number];

export const STICKER_LIMITS = {
  /** Côté le plus long, en pixels — la taille d'un sticker WhatsApp/Telegram. */
  maxEdge: 512,
  /** Poids du sticker GARDÉ, après normalisation : un GIF animé pèse plus qu'un PNG fixe. */
  maxBytes: 2 * 1024 * 1024,
  /** Poids de l'image SOURCE admise avant normalisation (une capture d'écran pleine taille). */
  maxSourceBytes: 12 * 1024 * 1024,
  /** Par personne : une bibliothèque, pas un second album photo. */
  maxCount: 200,
  maxNameLength: 40,
} as const;

export type StickerDefinition = {
  readonly id: string;
  readonly name: string | null;
  readonly origin: StickerOrigin;
  readonly mimeType: StickerMimeType;
  /** Chemin servi par `GET /attachments/file/*`, comme une pièce jointe. */
  readonly fileUrl: string;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
  readonly animated: boolean;
  readonly createdAt: string;
  readonly lastUsedAt: string;
};

const startsWith = (data: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  data.length >= offset + signature.length && signature.every((byte, i) => data[offset + i] === byte);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const GIF87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;

/**
 * Le type RÉEL des octets — jamais le type déclaré par le fichier ni par le
 * presse-papier, qui peuvent mentir. `null` ⇒ rien dont on puisse faire un
 * sticker.
 */
export function stickerMimeFromSignature(data: Uint8Array): StickerSourceMimeType | null {
  if (startsWith(data, PNG)) return 'image/png';
  if (startsWith(data, JPEG)) return 'image/jpeg';
  if (startsWith(data, GIF87) || startsWith(data, GIF89)) return 'image/gif';
  if (startsWith(data, RIFF) && startsWith(data, WEBP, 8)) return 'image/webp';
  return null;
}

/**
 * Un GIF est animé s'il porte plus d'un bloc de contrôle graphique
 * (`21 F9 04`). Heuristique volontairement simple : elle ne décode rien, elle
 * compte — un faux positif rend un GIF fixe « animé », ce qui ne change que
 * le badge.
 */
export function isStickerAnimatedGif(data: Uint8Array): boolean {
  if (stickerMimeFromSignature(data) !== 'image/gif') return false;
  let blocks = 0;
  for (let i = 0; i + 2 < data.length; i += 1) {
    if (data[i] === 0x21 && data[i + 1] === 0xf9 && data[i + 2] === 0x04) {
      blocks += 1;
      if (blocks > 1) return true;
    }
  }
  return false;
}

/** Le format sous lequel un sticker est GARDÉ : le JPEG devient WebP, le reste ne change pas. */
export function stickerStoredMime(source: StickerSourceMimeType): StickerMimeType {
  return source === 'image/jpeg' ? 'image/webp' : source;
}

/** Les dimensions d'une image ramenée dans le carré du sticker, ratio gardé. */
export function stickerFitWithin(size: { readonly width: number; readonly height: number }): {
  readonly width: number;
  readonly height: number;
} {
  const longest = Math.max(size.width, size.height);
  if (longest <= STICKER_LIMITS.maxEdge) return { width: size.width, height: size.height };
  const scale = STICKER_LIMITS.maxEdge / longest;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}
