/**
 * LES FICHIERS DES PACKS DE STICKERS DE TIERS DANS LE MAGASIN ADRESSÉ (#10188).
 *
 * Un fichier de pack de tiers se nomme par son contenu, comme ceux des packs
 * officiels (`GET /api/v1/pack-assets/<sha16>.<ext>`, L5 #10157) : les 16
 * premiers caractères de son SHA-256, puis l'extension de son type. La
 * passerelle grave l'empreinte à la proposition et sert, à côté de l'ancien
 * `fileUrl` (`/attachments/file/*`, gardé pour les clients publiés, #9223),
 * une référence `asset` que les clients récents préfèrent.
 *
 * Les types sont ceux que produit la porte des octets des stickers
 * (`normalizeStickerImage`) : PNG, WebP et GIF — un GIF animé reste animé.
 * Ils ne rejoignent PAS `PACK_ASSET_EXTENSIONS`, qui borne les registres des
 * packs OFFICIELS : un registre n'a pas à admettre un GIF.
 *
 * @see schema.prisma — `StickerPackItem.sha256`
 */
import type { PackAssetRef } from './content-pack.js';

export const STICKER_PACK_ASSET_TYPES = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as const;

type StickerPackAssetMime = keyof typeof STICKER_PACK_ASSET_TYPES;

const CONTENT_TYPE_OF_EXTENSION: Readonly<Record<string, StickerPackAssetMime>> = Object.fromEntries(
  Object.entries(STICKER_PACK_ASSET_TYPES).map(([mime, extension]) => [extension, mime as StickerPackAssetMime]),
);

/** `<sha16>.png|webp|gif`, en minuscules — toute autre forme n'est pas une adresse de fichier de pack de tiers. */
export const STICKER_PACK_ASSET_SRC = /^[0-9a-f]{16}\.(?:png|webp|gif)$/;

const SHA256 = /^[0-9a-f]{64}$/;

const isAssetMime = (mimeType: string): mimeType is StickerPackAssetMime => Object.prototype.hasOwnProperty.call(STICKER_PACK_ASSET_TYPES, mimeType);

export type StickerPackStoredFile = {
  /** L'empreinte des octets gardés ; absente sur un fichier proposé avant #10188 et pas encore rattrapé. */
  readonly sha256: string | null | undefined;
  readonly mimeType: string;
  readonly sizeBytes: number;
};

/** L'adresse d'un fichier gardé, ou `null` : sans empreinte (ou d'un type inconnu), il reste servi par son seul `fileUrl`. */
export function stickerPackAssetRef(file: StickerPackStoredFile): PackAssetRef | null {
  if (typeof file.sha256 !== 'string' || !SHA256.test(file.sha256)) return null;
  if (!isAssetMime(file.mimeType) || !Number.isInteger(file.sizeBytes) || file.sizeBytes < 0) return null;
  return { src: `${file.sha256.slice(0, 16)}.${STICKER_PACK_ASSET_TYPES[file.mimeType]}`, sha256: file.sha256, bytes: file.sizeBytes };
}

/** Ce qu'un client accepte du fil : une adresse bien formée, qui commence par l'empreinte qu'elle annonce. */
export function isStickerPackAssetRef(value: unknown): value is PackAssetRef {
  if (typeof value !== 'object' || value === null) return false;
  const { src, sha256, bytes } = value as Record<string, unknown>;
  if (typeof src !== 'string' || typeof sha256 !== 'string' || typeof bytes !== 'number') return false;
  return STICKER_PACK_ASSET_SRC.test(src) && SHA256.test(sha256) && src.startsWith(sha256.slice(0, 16)) && Number.isInteger(bytes) && bytes >= 0;
}

/** Le type servi pour une adresse, ou `null` hors de la forme. */
export function stickerPackAssetContentType(src: string): StickerPackAssetMime | null {
  if (!STICKER_PACK_ASSET_SRC.test(src)) return null;
  return CONTENT_TYPE_OF_EXTENSION[src.slice(src.lastIndexOf('.') + 1)] ?? null;
}
