/**
 * UNE RÉFÉRENCE D'IMAGE DE PROFIL — ce qu'une photo ou une bannière peut
 * désigner (#8217) :
 *
 * - une adresse `http(s)://` ;
 * - un chemin d'API (`/api/…`) ;
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

export function isProfileImageReference(value: string): boolean {
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  if (value.startsWith('/api/')) return true;
  return STORAGE_PATH.test(value) && !value.split('/').includes('..');
}
