import path from 'path';
import { storageKeyFromMediaUrl } from './mediaStorageKey';

/**
 * LES FICHIERS QU'UNE PIÈCE JOINTE A FAIT NAÎTRE À CÔTÉ DE SES OCTETS (#9315).
 *
 * Deux producteurs écrivent sur le disque sans colonne dédiée, et seule la
 * ligne sait où :
 * - les pistes TTS de `MessageTranslationService`, rangées dans
 *   `translations[langue]` avec `path` (absolu, au moment de l'écriture) et
 *   `url` (`/api/v1/attachments/file/translated/<id>_<langue>.<ext>`) ;
 * - les variantes WebP de `MetadataManager.generateImageVariants`, rangées dans
 *   `imageVariants[].url` sous leur clé de stockage.
 *
 * Les deux colonnes sont du JSON que la base n'a jamais validé : tout ce qui
 * n'a pas la forme attendue est ignoré, jamais deviné. Ce module ne lit que la
 * ligne ; le disque et la décision d'effacer restent à `AttachmentService`.
 */
export function derivedFileCandidates(row: {
  readonly translations?: unknown;
  readonly imageVariants?: unknown;
}): readonly string[] {
  return [...translationTrackCandidates(row.translations), ...variantCandidates(row.imageVariants)];
}

/**
 * Le chemin absolu d'un candidat, seulement s'il désigne un fichier SOUS la
 * racine des dépôts. Une valeur venue d'une colonne JSON est une donnée, pas un
 * chemin de confiance : `..`, un absolu étranger ou un dossier voisin au nom
 * préfixé (`/srv/uploads-old`) rendent `null`.
 */
export function resolveInsideUploadRoot(uploadRoot: string, candidate: string): string | null {
  const root = path.resolve(uploadRoot);
  const resolved = path.resolve(root, candidate);
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

function translationTrackCandidates(translations: unknown): readonly string[] {
  if (!isRecord(translations)) return [];
  return Object.values(translations).flatMap((track) => {
    if (!isRecord(track)) return [];
    const fromUrl = typeof track.url === 'string' ? storageKeyFromMediaUrl(track.url) : null;
    const fromPath = typeof track.path === 'string' && track.path.length > 0 ? track.path : null;
    return [fromUrl, fromPath].filter((value): value is string => value !== null);
  });
}

function variantCandidates(imageVariants: unknown): readonly string[] {
  if (!Array.isArray(imageVariants)) return [];
  return imageVariants.flatMap((variant) => {
    if (!isRecord(variant) || typeof variant.url !== 'string') return [];
    const key = storageKeyFromMediaUrl(variant.url);
    return key === null ? [] : [key];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
