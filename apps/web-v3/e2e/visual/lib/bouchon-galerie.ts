import type { ServerResponse } from 'node:http';

/**
 * LES ROUTES DE LA GALERIE, côté passerelle de bouchon — le SEUL appel réseau
 * que l'état `?media=` de `/chats/:cle/medias` fait : télécharger l'octet d'un
 * média (issue #4525, § 4 étape 7 de la spécification).
 *
 * ÉMETTEUR COPIÉ : `GET /attachments/file/*` — `services/gateway/src/routes/
 * attachments/download.ts:330-351` (`registerFileStreamRoute`). AUCUN hook
 * d'authentification sur cette route (les `onRequest: authenticate` du fichier
 * sont sur d'AUTRES routes, `:142-145` et `:243-246` — pas sur celle-ci) ; 403
 * `Forbidden` sur une traversée de chemin (`..`, `:419`) ; 404 `File not
 * found` sinon ; `content-type` par extension ; `content-length` ; `etag`
 * (faible, `:465`) ; `cache-control: public, max-age=31536000` (`:469-471`,
 * chemin non-avatar) ; `content-disposition: inline` (`:524`) ; `accept-ranges:
 * bytes` UNIQUEMENT pour l'audio et la vidéo (`isMediaFile`, `:479-480` — PAS
 * pour une image, que la route réelle ne l'annonce jamais). Le `Range`
 * (206/416, `:494-508`) N'EST PAS copié — aucun témoin de ce lot ne l'exerce,
 * la surimpression ne charge jamais qu'une image en une seule requête et
 * laisse vidéo/audio en `preload="none"` (§ 9 Q5). Le jour où un témoin joue un
 * média en entier, copier ces deux codes ici, à cette ligne.
 *
 * `cache-control` et `etag`, COPIÉS DE LA LOI, PAS AJOUTÉS POUR LE CONFORT :
 * sans eux, le SCANNER DE PRÉCHARGEMENT de Chromium (qui découvre `<img src>`
 * en tête de flux, avant que l'élément DOM n'existe) et le CHARGEMENT RÉEL de
 * l'élément ne partagent plus la même entrée de cache-préchargement — mesuré :
 * DEUX requêtes physiques pour UNE image, la seconde aux en-têtes minimaux
 * (`sec-fetch-dest: empty`, sans `accept`), invisible au domaine Network de
 * DevTools (qui ne voit qu'UNE requête logique). Les poser, comme la vraie
 * route les pose, restaure la coalescence.
 *
 * SÉPARÉ de `bouchon-fil.ts` : celui-ci sert `/attachments/file/<id>/…` pour
 * les pièces TÉLÉVERSÉES par un spec (`etat.pieces`) et rend 404 pour tout
 * autre chemin (`:515-525`) — la galerie doit donc être branchée AVANT lui
 * (`serveurs.ts`), sans quoi ses requêtes ne l'atteignent jamais.
 *
 * LES FIXTURES DE `bouchon-monde.ts` (`messagesRiches`) portent des chemins
 * ABSOLUS (`/api/v1/attachments/file/2026/…`) — pas des clés de stockage — et
 * ne passent donc jamais par `bouchon-fil.ts` (qui, lui, sert les pièces
 * TÉLÉVERSÉES pendant un spec, sous `/attachments/file/<id>/…`). C'est ce
 * fichier qui les sert.
 */

/** Un corps DÉTERMINISTE, de taille CONNUE — le témoin compte des octets, il ne regarde pas des pixels. */
const corpsDeTaille = (octets: number, marqueurs: readonly [number, number]): Buffer => {
  const tampon = Buffer.alloc(octets, 0x20);
  tampon[0] = marqueurs[0];
  tampon[octets - 1] = marqueurs[1];
  return tampon;
};

/** JFIF minimal repérable : SOI (`FF D8`) … EOI (`FF D9`) — un octet de chaque à ses deux bouts. */
const IMAGE = corpsDeTaille(4_096, [0xff, 0xd9]);
const VIDEO = corpsDeTaille(65_536, [0x00, 0x00]);
const VOCAL = corpsDeTaille(8_192, [0x00, 0x00]);
const VOCAL_TRADUIT = corpsDeTaille(8_192, [0x00, 0x00]);

/** Ce que chaque fixture RÉELLEMENT servie pèse — jamais un chiffre recopié dans un spec : on lit cette table. */
export const OCTETS_DE_LA_FIXTURE: Readonly<Record<string, number>> = {
  '/api/v1/attachments/file/2026/tableau.jpg': IMAGE.length,
  '/api/v1/attachments/file/2026/revue.mp4': VIDEO.length,
  '/api/v1/attachments/file/2026/vocal.m4a': VOCAL.length,
  '/api/v1/attachments/file/2026/vocal-fr.m4a': VOCAL_TRADUIT.length,
};

const CORPS_PAR_CHEMIN: Readonly<Record<string, Buffer>> = {
  '/api/v1/attachments/file/2026/tableau.jpg': IMAGE,
  '/api/v1/attachments/file/2026/revue.mp4': VIDEO,
  '/api/v1/attachments/file/2026/vocal.m4a': VOCAL,
  '/api/v1/attachments/file/2026/vocal-fr.m4a': VOCAL_TRADUIT,
};

const TYPE_PAR_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  mp4: 'video/mp4',
  m4a: 'audio/mp4',
};

const typeDe = (chemin: string): string => TYPE_PAR_EXTENSION[chemin.split('.').pop() ?? ''] ?? 'application/octet-stream';

/** `isMediaFile` de la route réelle (`download.ts:479`) — l'audio et la vidéo SEULS annoncent `accept-ranges`. */
const estUnMedia = (type: string): boolean => type.startsWith('audio/') || type.startsWith('video/');

export const routesDeLaGalerie =
  () =>
  ({ requete, url, reponse }: { readonly requete: { readonly method?: string }; readonly url: URL; readonly reponse: ServerResponse }): boolean => {
    if ((requete.method ?? 'GET') !== 'GET') return false;
    const corps = CORPS_PAR_CHEMIN[url.pathname];
    if (corps === undefined) return false;
    const type = typeDe(url.pathname);

    reponse.writeHead(200, {
      'content-type': type,
      'content-length': String(corps.length),
      etag: `W/"${corps.length}-fixture"`,
      'cache-control': 'public, max-age=31536000',
      'content-disposition': 'inline',
      ...(estUnMedia(type) ? { 'accept-ranges': 'bytes' } : {}),
    });
    reponse.end(corps);
    return true;
  };
