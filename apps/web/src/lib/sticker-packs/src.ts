import type { PackAssetRef } from '@meeshy/shared/types/content-pack';

import { apiOrigin } from '@/lib/api/api-origin';
import { attachmentSrc } from '@/lib/api/media-url';
import { packAssetUrl } from '@/lib/packs/pack-asset-url';

/**
 * **L'ADRESSE D'UN FICHIER DE PACK DE STICKERS DE TIERS** (#10188) — le
 * magasin adressé par contenu (`packAssets.byFile`, un fichier `<sha16>.<ext>` :
 * public, immuable, ETag = empreinte) quand la passerelle sert la référence (`asset`
 * d'un sticker, `cover` d'un pack) ; l'ancien chemin (`/attachments/file/*`,
 * par `attachmentSrc`) sinon — un ancien serveur, ou un fichier proposé avant
 * #10188 et pas encore rattrapé. Une origine illisible garde l'ancien chemin :
 * jamais une adresse fausse.
 */

type Resolution = {
  /** L'origine de la passerelle (`apiOrigin`) ; vide ⇒ l'ancien chemin. */
  readonly origin: string;
  /** L'ancien chemin d'un `fileUrl` (`attachmentSrc`). */
  readonly legacy: (fileUrl: string) => string;
};

const LIVE: () => Resolution = () => ({ origin: apiOrigin(), legacy: attachmentSrc });

const addressed = (asset: PackAssetRef | undefined, origin: string): string | null =>
  asset === undefined || origin === '' ? null : packAssetUrl(asset.src, origin);

export const resolveStickerPackFileSrc = (file: { readonly asset?: PackAssetRef; readonly fileUrl: string }, resolution: Resolution): string =>
  addressed(file.asset, resolution.origin) ?? resolution.legacy(file.fileUrl);

export const resolveStickerPackCoverSrc = (pack: { readonly cover?: PackAssetRef; readonly coverUrl: string | null }, resolution: Resolution): string | null =>
  addressed(pack.cover, resolution.origin) ?? (pack.coverUrl === null ? null : resolution.legacy(pack.coverUrl));

export const stickerPackFileSrc = (file: { readonly asset?: PackAssetRef; readonly fileUrl: string }): string => resolveStickerPackFileSrc(file, LIVE());

export const stickerPackCoverSrc = (pack: { readonly cover?: PackAssetRef; readonly coverUrl: string | null }): string | null => resolveStickerPackCoverSrc(pack, LIVE());
