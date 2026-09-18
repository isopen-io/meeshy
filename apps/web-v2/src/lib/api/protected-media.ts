import { currentCredential } from './client';
import { credentialHeaders, type Credential } from './http';

/**
 * # LE MÉDIA QUE LA PASSERELLE NE SERT QU'À UNE IDENTITÉ (#7015)
 *
 * ## Le défaut, mesuré en production le 2026-09-18
 *
 *     GET https://gate.meeshy.me/api/v1/static/d0bf39b7-…m4a   ->  401
 *
 * **Ce n'est pas un 404** : le fichier existe (`/app/sounds`, 18 fichiers,
 * relevés dans le conteneur `meeshy-gateway`). La route porte
 * `preValidation: [requiredAuth]` (`services/gateway/src/routes/posts/audio.ts`)
 * et **une balise `<audio src>` n'envoie aucun en-tête `Authorization`** — pas
 * plus qu'une `<img>` ou une `<video>`. La requête part anonyme, se fait
 * refuser, et le son de fond d'une story ou d'un réel ne joue JAMAIS sur le
 * web. iOS joue ces mêmes pistes : son SDK passe par `APIClient`, qui pose
 * l'en-tête.
 *
 * Le refus n'est même pas la première barrière : la passerelle rend aussi
 * `Cross-Origin-Resource-Policy: same-origin` (mesuré), qui bloque un
 * chargement `no-cors` d'une AUTRE origine — d'où le `net::ERR_FAILED` du
 * journal, avant toute question d'authentification. Une requête `cors` en
 * revanche est servie : le préflight rend
 * `access-control-allow-origin: https://meeshy.me` et
 * `access-control-allow-headers: authorization` (mesuré le 2026-09-18).
 *
 * ## POURQUOI PAS LE CHEMIN PUBLIC — la question de sécurité, TRANCHÉE PAR LA MESURE
 *
 * L'issue #7015 lit le commentaire de `audio.ts` comme la preuve qu'« il
 * existe un chemin public prévu pour ces fichiers ». **Il dit l'inverse**, et
 * trois mesures le confirment :
 *
 *  1. `https://static.meeshy.me/<uuid>.m4a` rend **404** — le volume
 *     `gateway_sounds` n'est monté sur AUCUN nginx statique
 *     (`docker-compose.prod.yml` : `static-files` monte `frontend_uploads` et
 *     `gateway_uploads`, jamais `gateway_sounds`). Le chemin public n'existe
 *     pas ; il faudrait le CRÉER.
 *  2. Le commentaire de `audio.ts` explique pourquoi le volume est DÉDIÉ :
 *     « surtout PAS sous `UPLOAD_PATH` », précisément pour échapper au montage
 *     nginx en cache immutable d'un an. C'est une décision de confidentialité,
 *     pas une sortie à emprunter.
 *  3. Le contenu n'est pas public par nature : sur les 20 publications qui
 *     citent ces fichiers, **une est `PRIVATE`** (mesuré en base). Et les
 *     fichiers présents ont été écrits par l'ancienne route d'envoi manuel
 *     (`POST /stories/audio`, retirée par #4190), qui ne gatait sur AUCUNE
 *     visibilité.
 *
 * Servir `/app/sounds` en public, immutable un an, publierait donc au monde
 * entier des fichiers dont la seule protection actuelle est une
 * authentification. On garde la route authentifiée — et on lui donne le seul
 * transport du navigateur qui porte un en-tête : `fetch`, puis une URL
 * d'OBJET pour l'élément média. **Aucun jeton ne transite par une URL**
 * (journaux, référents, historique).
 *
 * ## Ce que ce module ne fait PAS
 *
 * Il ne touche à AUCUN autre média. `GET /attachments/file/*` est servie sans
 * authentification (`download.ts`) : y faire passer les images et les vidéos
 * du fil coûterait leur poids en mémoire pour rien, et perdrait le seau
 * `medias` du service worker (`lib/net/api-runtime-cache.ts`). Le test de
 * `isProtectedMediaSrc` porte donc sur UN chemin, pas sur « la passerelle ».
 */

/**
 * LE CHEMIN DE LA ROUTE PROTÉGÉE, écrit UNE fois — même motif que
 * `ATTACHMENT_STREAM_PATH` (`media-url.ts`). La passerelle n'en sert qu'un
 * seul montage : `GET /api/v1/static/:filename` (`route-manifest.json`), sans
 * alias racine ni jumeau non versionné.
 */
export const PROTECTED_MEDIA_PATH = '/api/v1/static/';

/**
 * CE QUE LA ROUTE SERT, ET RIEN D'AUTRE (revue-correction #7015).
 *
 * `GET /static/:filename` refuse toute extension hors `ALLOWED_AUDIO_EXT`
 * puis pose `Content-Type: EXT_TO_MIME[ext]`
 * (`services/gateway/src/services/posts/soundFormats.ts`) — six entrées,
 * toutes `audio/*`. Le repli `application/octet-stream` d'`audio.ts` est
 * INATTEIGNABLE : les six extensions admises sont exactement les six clés de
 * la carte. La garde est donc EXACTE, pas approximative — rien de légitime ne
 * tombe dedans.
 */
const SERVED_AUDIO_TYPE = /^audio\//i;

/** L'origine de MESURE des chemins relatifs : jamais appelée, seulement composée. */
const ORIGINE_DE_MESURE = 'https://meeshy.invalid';

export type ProtectedMediaDeps = {
  readonly credential: () => Credential | null;
  readonly fetchImpl: typeof fetch;
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
};

/**
 * Les dépendances de PRODUCTION — une CONSTANTE de module, donc d'identité
 * stable : `useProtectedMediaSrc` la place dans un tableau de dépendances
 * d'effet, où un objet recomposé à chaque rendu relancerait la requête sans
 * fin (leçon `preferredLanguages`, `CLAUDE.md` § Prisme).
 */
export const protectedMediaDeps: ProtectedMediaDeps = {
  credential: currentCredential,
  fetchImpl: (input, init) => fetch(input, init),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => {
    URL.revokeObjectURL(url);
  },
};

/** Le CHEMIN d'une source, ou `null` quand elle n'en porte pas (`blob:`, `data:`). */
function pathnameOf(src: string): string | null {
  if (src === '' || src.startsWith('blob:') || src.startsWith('data:')) return null;
  try {
    return new URL(src, ORIGINE_DE_MESURE).pathname;
  } catch {
    return null;
  }
}

/**
 * `true` si cette source ne peut être obtenue qu'en présentant une identité.
 *
 * Lit le PRÉFIXE du chemin, jamais la chaîne entière : `/api/v1/posts/api/v1/static/x`
 * n'est pas cette route, et `/api/v1/statics/x` non plus.
 */
export function isProtectedMediaSrc(src: string): boolean {
  const path = pathnameOf(src);
  return path !== null && path.startsWith(PROTECTED_MEDIA_PATH);
}

/**
 * **UN `200` N'EST PAS UNE PISTE.**
 *
 * Le statut et la taille ne disent RIEN de ce que le corps contient.
 * `apiConfig.base` vaut `''` par défaut (`config.ts`), une valeur qui n'est
 * juste que DERRIÈRE UN PROXY : hors proxy — les deux coques Capacitor, une
 * PWA servie sans relais — la requête part vers l'origine WEB et reçoit
 * `200 text/html`, l'`index.html` du SPA. Le corps n'est pas vide, le statut
 * est `ok`, et `createObjectURL` rendait une URL d'objet **de HTML** posée en
 * `<audio src>` : `readyState` reste 0, aucun son, aucune erreur — et surtout
 * **pas de `null`**, donc la balise est montée et la dégradation dessinée ne
 * se déclenche jamais. Un échec de RÉSOLUTION déguisé en piste muette,
 * exactement ce que `media-url.ts` § « LA SECONDE FORME » décrit des images.
 *
 * Le blob porte le type que le serveur a ANNONCÉ, et c'est lui que l'URL
 * d'objet servira à l'élément : le lire ici, c'est mesurer ce qui sera
 * réellement posé, pas ce qu'on espérait recevoir.
 */
function isServedAudio(blob: Blob): boolean {
  return SERVED_AUDIO_TYPE.test(blob.type);
}

/**
 * Les octets du média, derrière une URL d'objet — ou `null`.
 *
 * **NE REJETTE JAMAIS.** `null` dit « pas de son », et c'est tout ce que
 * l'appelant a besoin de savoir : un refus (401), un fichier absent (404), un
 * son coupé par la modération (410, `mutedAt`), un réseau tombé et un rendu
 * hors navigateur rendent la MÊME valeur. C'est la seconde moitié de #7015 —
 * une indisponibilité doit dégrader proprement, sans une seule promesse
 * rejetée non rattrapée dans la console.
 *
 * `mode: 'cors'` est EXPLICITE : c'est ce qui distingue cette requête du
 * chargement `no-cors` d'une balise, que `Cross-Origin-Resource-Policy:
 * same-origin` bloque à l'entrée.
 */
export async function fetchProtectedObjectUrl(
  src: string,
  deps: ProtectedMediaDeps = protectedMediaDeps,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!isProtectedMediaSrc(src)) return null;
  const credential = deps.credential();
  // La route refuse un appelant sans identité : la requête serait un 401 de
  // plus au journal, jamais un son. On se tait.
  if (credential === null) return null;
  try {
    const response = await deps.fetchImpl(src, {
      mode: 'cors',
      headers: credentialHeaders(credential),
      ...(signal !== undefined ? { signal } : {}),
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size === 0) return null;
    // Avant `createObjectURL`, jamais après : publier l'URL d'un corps qu'on
    // s'apprête à refuser laisserait ses octets en mémoire pour toute la vie
    // du document — personne n'ayant reçu l'URL pour la révoquer.
    if (!isServedAudio(blob)) return null;
    return deps.createObjectURL(blob);
  } catch {
    return null;
  }
}
