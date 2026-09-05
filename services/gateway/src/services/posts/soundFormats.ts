import path from 'path';
import { apiPath } from '@meeshy/shared/api/prefix';

/**
 * Source de vérité UNIQUE des formats audio de la bibliothèque de sons.
 *
 * Le lot A a livré deux listes divergentes : la capture acceptait tout
 * `audio/*`, la diffusion ne servait que six extensions. Un média `.webm` ou
 * `.opus` produisait donc un `Sound` dont le `fileUrl` renvoyait 400 POUR
 * TOUJOURS — une ligne de bibliothèque morte à la naissance, invisible en
 * capture et découverte seulement à la lecture.
 *
 * Règle : ce qui n'est pas servable n'est pas capturé.
 */

/** Extensions que `GET /static/:filename` accepte de servir. */
export const ALLOWED_AUDIO_EXT = new Set(['.mp3', '.mp4', '.wav', '.m4a', '.aac', '.ogg']);

/** MIME acceptés par l'upload manuel `POST /stories/audio`. */
export const ALLOWED_UPLOAD_MIME = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
]);

/** Extension → `Content-Type` renvoyé par la route de diffusion. */
export const EXT_TO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.wav': 'audio/wav',
  '.m4a': 'audio/x-m4a',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
};

/**
 * MIME → extension servable. Plus large qu'`ALLOWED_UPLOAD_MIME` : la capture
 * ne voit pas des fichiers choisis dans un sélecteur mais des `PostMedia`
 * produits par l'enregistreur iOS/Android, dont le MIME varie selon la
 * plateforme pour un même conteneur.
 */
export const MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/vnd.wave': '.wav',
  'audio/ogg': '.ogg',
};

/**
 * Extension sous laquelle la copie de bibliothèque doit être écrite, ou `null`
 * si ce média n'est pas diffusable — auquel cas il ne faut PAS le capturer.
 *
 * L'extension du fichier source prime quand elle est servable ; sinon on
 * retombe sur celle du MIME. Un `.opus` déclaré `audio/ogg` devient donc
 * `.ogg` : Opus vit dans un conteneur Ogg, le flux est intact.
 */
export function servableExtension(mimeType: string | null | undefined, filePath: string): string | null {
  const fromFile = path.extname(filePath).toLowerCase();
  if (ALLOWED_AUDIO_EXT.has(fromFile)) return fromFile;
  const fromMime = MIME_TO_EXT[(mimeType ?? '').toLowerCase()];
  return fromMime ?? null;
}

/**
 * Prédicat Prisma-Mongo « son non coupé », à composer dans un `AND`.
 *
 * `mutedAt: null` seul ne matche PAS un champ ABSENT (MongoDB distingue
 * null et « jamais posé », Prisma aussi) : or les DEUX chemins de création
 * (upload manuel, capture) ne posent jamais `mutedAt`. Chaque son
 * disparaissait donc de « Mes sons » et de la liste publique dès sa
 * naissance — constaté en production le 2026-08-02, aucun test unitaire ne
 * pouvait le voir (Prisma y est mocké, la sémantique Mongo n'y existe pas).
 */
export const NOT_MUTED_WHERE = {
  OR: [{ mutedAt: null }, { mutedAt: { isSet: false } }],
};

/**
 * Préfixe des URL servies par `GET /static/:filename`.
 *
 * Partagé pour que la recherche « ce fichier est-il coupé ? » soit une ÉGALITÉ
 * indexable et non un `endsWith` (scan de collection à chaque lecture audio).
 */
export const STATIC_URL_PREFIX = `${apiPath('/static')}/`;

export function staticFileUrl(filename: string): string {
  return `${STATIC_URL_PREFIX}${filename}`;
}
