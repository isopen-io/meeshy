/**
 * LA MESURE DE L'ANCIEN CHEMIN DES FICHIERS DE PACKS DE STICKERS (#10188).
 *
 * Depuis #10188, un client récent lit le fichier d'un pack de tiers dans le
 * magasin adressé (`/api/v1/pack-assets/<sha16>.<ext>`) ; les clients publiés
 * lisent toujours `fileUrl`, servi par `GET /attachments/file/sticker-packs/…`.
 * Cet ancien chemin ne se retire qu'à zéro usage MESURÉ (#9223) : chaque
 * fichier qu'il sert laisse UNE ligne de journal, {@link STICKER_PACK_LEGACY_FILE_EVENT},
 * sans identité — la route montée, une plateforme et une version normalisées
 * comme celles du compteur d'accès (#4275). Jamais la clé de stockage, jamais
 * l'adresse, jamais l'IP. Même forme que la mesure des adresses nues (#9600,
 * `readerFileGate.ts`).
 */
import { normaliserPlateforme, normaliserVersion } from '../route-usage.service';

/** Le nom STABLE de la ligne de journal que le retrait de l'ancien chemin comptera. */
export const STICKER_PACK_LEGACY_FILE_EVENT = 'sticker-pack-file:legacy-path';

const STICKER_PACK_FOLDER = 'sticker-packs/';

export type LegacyPathRequestFacts = {
  readonly route: string | undefined;
  readonly platformHeader: string | undefined;
  readonly versionHeader: string | undefined;
  readonly userAgent: string | undefined;
};

export type StickerPackLegacyFileFacts = { readonly route: string; readonly platform: string; readonly version: string };

/** Les faits à journaliser quand la route de fichiers sert un fichier de pack de stickers, `null` pour tout autre fichier. */
export function stickerPackLegacyFileFacts(storageKey: string, request: LegacyPathRequestFacts): StickerPackLegacyFileFacts | null {
  if (!storageKey.startsWith(STICKER_PACK_FOLDER)) return null;
  return {
    route: request.route ?? 'unknown',
    platform: normaliserPlateforme(request.platformHeader, request.userAgent),
    version: normaliserVersion(request.versionHeader),
  };
}
