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
 * CE QU'IL NE TOUCHE PAS : une URL déjà ABSOLUE (`https://…`, servie par une
 * passerelle future ou un CDN) et une URL D'OBJET LOCAL (`blob:`/`data:`,
 * l'aperçu optimiste d'une pièce pas encore envoyée — `attachmentPreviewOf`,
 * `send/attachments.ts`) traversent INCHANGÉES : les préfixer romprait la
 * vignette locale. Une chaîne VIDE (les fixtures sans image, `fixtures.ts`)
 * traverse INCHANGÉE aussi — c'est déjà le signal « pas d'image » que
 * `message-blocks.tsx` lit pour ne rendre aucune `<img>`.
 */
const ABSOLUTE_OR_LOCAL_OBJECT_URL_PATTERN = /^(https?:|blob:|data:)/i;

/** PURE — prend la base en paramètre (même motif que `resolveApiConfig`,
 * `config.ts`) : testable sans dépendre de `import.meta.env`. */
export function resolveAttachmentSrc(fileUrl: string, base: string): string {
  if (fileUrl === '') return fileUrl;
  if (ABSOLUTE_OR_LOCAL_OBJECT_URL_PATTERN.test(fileUrl)) return fileUrl;
  if (fileUrl.startsWith('/')) return `${base}${fileUrl}`;
  return fileUrl;
}

/** L'UNIQUE évaluation contre `apiConfig.base` — tout consommateur importe
 * cette fonction, personne ne recompose `apiConfig.base + attachment.fileUrl`
 * ailleurs. */
export function attachmentSrc(fileUrl: string): string {
  return resolveAttachmentSrc(fileUrl, apiConfig.base);
}
