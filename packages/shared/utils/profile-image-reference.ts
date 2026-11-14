/**
 * UNE RÉFÉRENCE D'IMAGE DE PROFIL — ce qu'une photo ou une bannière peut
 * désigner (#8217) :
 *
 * - une adresse `http(s)://` ;
 * - la route de FLUX des pièces jointes (`/api/v1/attachments/file/<clé>` ou
 *   son montage legacy `/api/attachments/file/<clé>`), et elle seule : la clé,
 *   souvent percent-encodée (`apiPath('/attachments/file/<encodeURIComponent>')`
 *   l'a gravée ainsi jusqu'au 2026-09-16), suit, DÉCODÉE, la loi du chemin de
 *   stockage. Toute autre route `/api/…` est refusée (#16810) — la branche
 *   court-circuitait la règle, et `/api/../../x` passait comme avatar ;
 * - le chemin de stockage RELATIF qu'un téléversement rend
 *   (`2026/09/<id>/avatar_….png`, `UploadProcessor.getAttachmentPath`) — que
 *   le web pose tel quel après `POST /attachments/upload`.
 *
 * Jamais une donnée `data:` (le base64 n'est pas une adresse), ni un autre
 * schéma, ni un chemin protocole-relatif (`//hôte/…`), ni une remontée de
 * dossier.
 *
 * **UN SEUL SITE, lu des DEUX côtés du fil (#8881).** La passerelle l'applique
 * au corps de `PATCH /users/me/avatar|banner` (`updateAvatarSchema`,
 * `updateBannerSchema`) ; le web l'applique AVANT d'envoyer
 * (`apps/web/src/lib/api/profile.ts#patchMyImage`). #8217 avait élargi la
 * règle du serveur à la clé de stockage sans toucher à sa jumelle du client,
 * restée à `https://` / `/api/` : chaque photo et chaque bannière du web était
 * refusée localement, sans jamais partir. Module sans dépendance, pour que le
 * client la lise sans embarquer `validation.ts` et son `zod` complet.
 */
const STORAGE_PATH = /^[A-Za-z0-9][A-Za-z0-9._~\-/]*$/;
const ATTACHMENT_FILE_ROUTE = /^\/api\/(?:v1\/)?attachments\/file\/(.+)$/;

function isStoragePath(value: string): boolean {
  return STORAGE_PATH.test(value) && !value.split('/').includes('..');
}

function decodedStorageKey(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function attachmentRouteKey(path: string): string | null {
  const encoded = ATTACHMENT_FILE_ROUTE.exec(path)?.[1];
  if (encoded === undefined) return null;
  const key = decodedStorageKey(encoded);
  return key !== null && isStoragePath(key) ? key : null;
}

function isAttachmentFileRoute(value: string): boolean {
  return attachmentRouteKey(value) !== null;
}

function absoluteUrlPath(value: string): string | null {
  try {
    return new URL(value).pathname;
  } catch {
    return null;
  }
}

export function isProfileImageReference(value: string): boolean {
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  if (value.startsWith('/api/')) return isAttachmentFileRoute(value);
  return isStoragePath(value);
}

/**
 * LE FICHIER DU VOLUME qu'une référence d'image désigne (#16811) — la clé de
 * stockage, quelle que soit la forme sous laquelle elle voyage : le chemin
 * relatif lui-même, la route de flux (`/api/(v1/)attachments/file/<clé>`), ou
 * une adresse ABSOLUE dont le chemin est cette route (`publicMediaUrl`
 * l'écrit ainsi). `null` quand la référence ne désigne aucun fichier du volume
 * (un hôte tiers — l'affaire de #16809 — ou une forme refusée).
 *
 * C'est la question que pose la passerelle avant d'accepter une image
 * d'identité : ce fichier, l'appelant l'a-t-il téléversé ? `/attachments/file/*`
 * sert par chemin, donc une image reçue en privé, une fois posée en avatar,
 * serait affichée à tous.
 */
export function profileImageStorageKey(value: string): string | null {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    const path = absoluteUrlPath(value);
    return path === null ? null : attachmentRouteKey(path);
  }
  if (value.startsWith('/api/')) return attachmentRouteKey(value);
  return isStoragePath(value) ? value : null;
}
