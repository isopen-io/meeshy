import { apiConfig } from './config';
import type { ImageVariant } from './types';

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
 * LA SIXIÈME FORME, MESURÉE LE 2026-09-13 (#6388) : l'ADRESSE HÉRITÉE QUI PORTE
 * UNE CLÉ SANS SA ROUTE — `https://gate.meeshy.me/2026/09/<id>/harbor_<uuid>.png`,
 * vue sur `staging.meeshy.me/notifications` (`net::ERR_FAILED`, puis
 * `workbox … no-response`). Voir `storageKeyOfLegacyUrl` plus bas : elle est
 * réparée contre la base CONFIGURÉE, l'hôte qu'elle porte étant justement faux.
 *
 * CE QU'IL NE TOUCHE PAS : une URL absolue qui ne porte PAS de clé de stockage
 * (un CDN, le magasin STATIQUE) et une URL D'OBJET LOCAL (`blob:`/`data:`,
 * l'aperçu optimiste d'une pièce pas encore envoyée — `attachmentPreviewOf`,
 * `send/attachments.ts`) traversent INCHANGÉES : les préfixer romprait la
 * vignette locale. Une chaîne VIDE (les fixtures sans image, `fixtures.ts`)
 * traverse INCHANGÉE aussi — c'est déjà le signal « pas d'image » que
 * `message-blocks.tsx` lit pour ne rendre aucune `<img>`.
 */
const LOCAL_OBJECT_URL_PATTERN = /^(blob:|data:)/i;
const ABSOLUTE_URL_PATTERN = /^https?:/i;

/** Le chemin de la route de flux, écrit UNE fois — `download.ts:273`. */
const ATTACHMENT_STREAM_PATH = '/api/v1/attachments/file';

/**
 * LA FORME D'UNE CLÉ DE STOCKAGE, telle que l'écrivent les DEUX producteurs de
 * la passerelle — `tus-handler.ts` (`path.join(year, month, userId, nom)`) et
 * `UploadProcessor.generateFilePath` : `YYYY/MM/…`. C'est la même forme que la
 * migration 013 reconnaît, et la même que le legacy emploie pour réparer une
 * adresse héritée (`apps/web/utils/attachment-url.ts`).
 */
const STORAGE_KEY_PATH_PATTERN = /^\/\d{4}\/\d{2}\//;

/** LA MÊME FORME, SANS SA BARRE INITIALE — telle qu'elle sort d'une route de flux. */
const STORAGE_KEY_PATTERN = /^\d{4}\/\d{2}\//;

/**
 * LES DEUX MONTAGES DE LA ROUTE DE FLUX, du plus spécifique au plus court —
 * l'ordre PORTE la correction : `/api/attachments/file/` est un préfixe de
 * rien, mais tester le court d'abord ne reconnaîtrait jamais le versionné.
 * Les deux existent réellement (`registerFileStreamRoute` est monté DEUX fois,
 * `routes/attachments/index.ts`) et les deux sont en base : 1600 lignes en v1,
 * 574 sous le montage legacy non versionné (mesuré le 2026-09-18).
 */
const STREAM_ROUTE_PREFIXES = ['/api/v1/attachments/file/', '/api/attachments/file/'] as const;

/** Décode UNE fois, sans jamais lever : une clé mal encodée reste servie telle quelle. */
function decodeOnce(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/**
 * LA SEPTIÈME FORME (#7022) — LA ROUTE DE FLUX QUI PORTE SA CLÉ, avec ou sans
 * hôte. C'est la forme MAJORITAIRE de la base : 1600 références sur 2912
 * (55 %) sont des `https://gate.meeshy.me/api/v1/attachments/file/<clé>`.
 *
 * Elle traversait INCHANGÉE — un test de FORME (« ça commence par https, c'est
 * donc déjà résolu ») là où il fallait un test de PROVENANCE (« cet hôte est-il
 * celui que ce déploiement doit interroger ? »). En production l'hôte gravé est
 * le bon, et le défaut y est donc invisible ; ailleurs — staging, local, les
 * deux coques Capacitor — la page allait chercher ses médias sur la passerelle
 * de PRODUCTION, quelle que soit sa base configurée.
 *
 * Rendre la CLÉ (et non l'adresse) est ce qui rend la réparation idempotente :
 * l'appelant la repose par `streamSrc`, donc une adresse déjà juste se
 * recompose à l'identique, et jamais une SECONDE route ne s'empile.
 *
 * Rend `null` quand ce que porte la route n'a pas la forme d'une clé de
 * stockage — au premier chef les pistes TRADUITES
 * (`/api/v1/attachments/file/translated/<nom>`, `MessageTranslationService`),
 * qui vivent hors de l'arborescence datée et qu'une re-base abîmerait.
 */
function storageKeyOfStreamRoute(pathname: string): string | null {
  const prefix = STREAM_ROUTE_PREFIXES.find((candidate) => pathname.startsWith(candidate));
  if (prefix === undefined) return null;
  const key = decodeOnce(pathname.slice(prefix.length));
  return STORAGE_KEY_PATTERN.test(key) ? key : null;
}

/**
 * LA SIXIÈME FORME (#6388) — UNE ADRESSE QUI PORTE UNE CLÉ, SANS SA ROUTE.
 *
 * `https://gate.meeshy.me/2026/09/<id>/harbor_<uuid>.png` : un hôte, puis la
 * clé NUE. La racine de la passerelle ne sert aucun fichier, donc le navigateur
 * rend `ERR_FAILED` et le service worker `no-response` — mesuré le 2026-09-13
 * sur `staging.meeshy.me/notifications`.
 *
 * La migration 013 ne réécrit que les valeurs portant `/attachments/file/` :
 * celle-ci lui échappe et reste en base. Le legacy la répare depuis toujours ;
 * le chantier la laissait passer parce qu'une chaîne `https://…` y valait
 * « déjà résolue » — un test de FORME (le schéma) là où il fallait un test de
 * CIBLE (la route existe-t-elle ?).
 *
 * Rend la clé, ou `null` quand l'adresse n'en porte pas : une URL externe
 * (`https://cdn.example.com/photo.png`) et le magasin STATIQUE
 * (`https://static.meeshy.me/u/i/2025/11/…`, #4625) ne se réécrivent JAMAIS —
 * leurs fichiers ne sont pas sur la passerelle.
 */
function storageKeyOfLegacyUrl(fileUrl: string): string | null {
  try {
    return storageKeyOfPath(new URL(fileUrl).pathname);
  } catch {
    return null;
  }
}

/**
 * LA MÊME FORME SANS SON HÔTE — `/2026/09/<id>/photo.png`. Une barre initiale
 * n'en fait pas une ROUTE : posée derrière la base, elle rend l'adresse que la
 * console de staging montrait. Le legacy la répare au même titre
 * (`apps/web/utils/attachment-url.ts`, § « chemin de date »).
 *
 * UN CHEMIN QUI PORTE DÉJÀ LA ROUTE DE FLUX rend sa CLÉ, pas `null` (#7022) —
 * c'est `storageKeyOfStreamRoute` qui la lui prend. Le risque que l'ancienne
 * rédaction voulait écarter (`…/attachments/file/api/v1/attachments/file/…`,
 * `media-ref.ts`) ne vient PAS de reconnaître la route : il vient de la
 * CONCATÉNER. En rendant la clé NUE — la route retirée — on la repose une
 * seule fois par `streamSrc`, donc empiler devient impossible plutôt que
 * simplement évité, et l'adresse se recompose à l'identique quand elle était
 * déjà juste.
 *
 * Rend `null` pour tout ce qui n'a la forme ni d'une clé ni d'une route qui en
 * porte une.
 */
function storageKeyOfPath(pathname: string): string | null {
  const routed = storageKeyOfStreamRoute(pathname);
  if (routed !== null) return routed;
  if (!STORAGE_KEY_PATH_PATTERN.test(pathname)) return null;
  return decodeOnce(pathname.slice(1));
}

/** PURE — prend la base en paramètre (même motif que `resolveApiConfig`,
 * `config.ts`) : testable sans dépendre de `import.meta.env`.
 *
 * **L'hôte que porte une adresse héritée ne sert à RIEN** : la clé identifie le
 * fichier, l'hôte est une décision de déploiement (#4324). La réparation vise
 * donc `base` — sans quoi une page de staging irait chercher ses médias sur la
 * passerelle de PRODUCTION, l'hôte qu'un dump restauré a laissé en base. */
export function resolveAttachmentSrc(fileUrl: string, base: string): string {
  if (fileUrl === '') return fileUrl;
  if (LOCAL_OBJECT_URL_PATTERN.test(fileUrl)) return fileUrl;
  if (ABSOLUTE_URL_PATTERN.test(fileUrl)) {
    const key = storageKeyOfLegacyUrl(fileUrl);
    return key === null ? fileUrl : streamSrc(key, base);
  }
  if (fileUrl.startsWith('/')) {
    const key = storageKeyOfPath(fileUrl);
    return key === null ? `${base}${fileUrl}` : streamSrc(key, base);
  }
  return streamSrc(fileUrl, base);
}

/** L'UNIQUE composition de la route de flux — clé encodée UNE fois. */
function streamSrc(key: string, base: string): string {
  return `${base}${ATTACHMENT_STREAM_PATH}/${encodeURIComponent(key)}`;
}

/** L'UNIQUE évaluation contre `apiConfig.base` — tout consommateur importe
 * cette fonction, personne ne recompose `apiConfig.base + attachment.fileUrl`
 * ailleurs. */
export function attachmentSrc(fileUrl: string): string {
  return resolveAttachmentSrc(fileUrl, apiConfig.base);
}

/**
 * `attachmentSrcSet` (#6221, D4 §1.4.4) — LA VARIANTE D'IMAGE ÉLUE PAR LA
 * LARGEUR D'AFFICHAGE, sous sa forme NATIVE navigateur : `imageVariants` est
 * SERVIE (`attachmentIncludes.ts:79`) et TYPÉE (`attachment.ts:194`) depuis
 * avant ce lot — il ne manquait que le pont vers `srcset`, où
 * `attachmentSrc` (ci-dessus) reste le SITE UNIQUE de résolution d'URL :
 * chaque variante traverse la MÊME règle que `fileUrl`, jamais une
 * concaténation seconde. `undefined` sans variante — l'appelant retombe
 * alors sur `src` seul (`fileUrl`), jamais sur un `srcset` vide.
 */
export function attachmentSrcSet(variants: readonly ImageVariant[] | undefined): string | undefined {
  if (variants === undefined || variants.length === 0) return undefined;
  return variants.map((variant) => `${attachmentSrc(variant.url)} ${variant.width}w`).join(', ');
}

/** `sizes` d'une tuile de largeur d'affichage fixe — la case ne redimensionne jamais selon le viewport. */
export function sizesFor(widthPx: number): string {
  return `${widthPx}px`;
}
