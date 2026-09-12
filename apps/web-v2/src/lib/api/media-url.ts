import { apiConfig } from './config';

/**
 * L'URL D'UNE PIÈCE JOINTE, RÉSOLUE CONTRE LA BONNE ORIGINE (défaut 2, revue
 * #5668) — SITE UNIQUE pour tout consommateur de `Attachment.fileUrl`
 * (image aujourd'hui, `Voice` demain quand elle lira un fichier réel plutôt
 * qu'une forme d'onde dérivée : le motif se pose ICI avant qu'il ne soit
 * copié par le premier écran qui en a besoin, directive porteur 2026-09-07
 * soir § 7).
 *
 * LE DÉFAUT QU'IL FERME : la passerelle sert `Attachment.fileUrl` en chemin
 * RELATIF — `/api/v1/attachments/file/…` (mesuré en direct sur
 * `gate.staging.meeshy.me`, compte `cible-web-trois`,
 * `fileUrl: "/api/v1/attachments/file/2026%2F09%2F…"`). Posé tel quel comme
 * `src` d'une `<img>`, le navigateur le résout contre l'origine du DOCUMENT
 * — jamais contre `apiConfig.base`. En DEV, le proxy de `vite.config.ts`
 * (§ `server.proxy`) relaie `/api/v1` et masque le défaut ; en PWA déployée
 * (`staging.meeshy.me`) et dans les DEUX coques (`capacitor://localhost`),
 * rien ne le relaie : l'image ne charge jamais, `onError` la masque, la
 * bulle reste un rectangle gris. Même classe que #5872, rejouée sur les
 * médias plutôt que sur les appels `fetch`.
 *
 * LA SECONDE FORME, TROUVÉE EN REVUE #5805 : la CLÉ DE STOCKAGE NUE,
 * `2026/09/<id>/photo.png`, SANS barre initiale. #5668 n'avait mesuré qu'un
 * compte et n'y avait vu que la forme résolue ; la passerelle sert LES DEUX,
 * et la nue est la MAJORITAIRE (relevé le 2026-09-12 sur
 * `gate.staging.meeshy.me` : quatre pièces nues sur cinq). Rendue telle
 * quelle, le navigateur la résolvait contre le CHEMIN du document
 * (`https://staging.meeshy.me/c/<id>/2026/09/…png`) où le SPA répond
 * `200 text/html` — son propre `index.html`. L'`<img>` recevait du HTML,
 * échouait à le décoder, `onError` la masquait : un échec de RÉSOLUTION
 * déguisé en fichier corrompu, indiscernable à l'écran d'une pièce réellement
 * abîmée. Sa cible est MESURÉE, jamais devinée : `GET /attachments/file/*`
 * (`services/gateway/src/routes/attachments/download.ts:266-273`) rend
 * `200 image/png` sur la clé nue — la MÊME route, avec le MÊME encodage, que
 * la passerelle sérialise déjà pour l'autre moitié de ses lignes.
 *
 * CE QU'IL NE TOUCHE PAS : une URL déjà ABSOLUE (`https://…`, servie par une
 * passerelle future ou un CDN) et une URL D'OBJET LOCAL (`blob:`/`data:`,
 * l'aperçu optimiste d'une pièce pas encore envoyée — `attachmentPreviewOf`,
 * `send/attachments.ts`) traversent INCHANGÉES : les préfixer romprait la
 * vignette locale. Une chaîne VIDE (les fixtures sans image, `fixtures.ts`)
 * traverse INCHANGÉE aussi — c'est déjà le signal « pas d'image » que
 * `message-blocks.tsx` lit pour ne rendre aucune `<img>`.
 */
const ABSOLUTE_OR_LOCAL_OBJECT_URL_PATTERN = /^(https?:|blob:|data:)/i;

/** Le chemin de la route de flux, écrit UNE fois — `download.ts:273`. */
const ATTACHMENT_STREAM_PATH = '/api/v1/attachments/file';

/** PURE — prend la base en paramètre (même motif que `resolveApiConfig`,
 * `config.ts`) : testable sans dépendre de `import.meta.env`. */
export function resolveAttachmentSrc(fileUrl: string, base: string): string {
  if (fileUrl === '') return fileUrl;
  if (ABSOLUTE_OR_LOCAL_OBJECT_URL_PATTERN.test(fileUrl)) return fileUrl;
  if (fileUrl.startsWith('/')) return `${base}${fileUrl}`;
  return `${base}${ATTACHMENT_STREAM_PATH}/${encodeURIComponent(fileUrl)}`;
}

/** L'UNIQUE évaluation contre `apiConfig.base` — tout consommateur importe
 * cette fonction, personne ne recompose `apiConfig.base + attachment.fileUrl`
 * ailleurs. */
export function attachmentSrc(fileUrl: string): string {
  return resolveAttachmentSrc(fileUrl, apiConfig.base);
}
