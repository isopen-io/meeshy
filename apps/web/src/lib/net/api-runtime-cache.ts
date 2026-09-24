/**
 * **CE QUE LE SERVICE WORKER A LE DROIT DE GARDER SUR LE DISQUE** (#6862,
 * revue-correction).
 *
 * Le `runtimeCaching` de la v2 met TOUTE réponse `/api/**` dans
 * `caches.open('api')` — NetworkFirst, `maxAgeSeconds: 7 jours`
 * (`vite.config.ts`). C'est ce qui rend le produit lisible hors ligne, et
 * c'est juste pour un fil, une liste de conversations, un profil.
 *
 * ## POURQUOI L'ADMINISTRATION EN SORT
 *
 * La lecture souveraine (#6862) met en place trois gardes pour qu'une
 * conversation privée lue par un administrateur ne SURVIVE PAS à la session :
 * `gcTime: 0` sur la requête, le préfixe `admin-souverain` exclu de la
 * déshydratation (`query-client.ts`), et le motif écrit consigné par
 * `AdminAuditLog`.
 *
 * Les trois portaient sur le cache de TanStack. **Le service worker écrivait la
 * MÊME charge, entière, dans un second seau** — la réponse HTTP brute, texte
 * des messages compris, sur le disque du poste, pendant sept jours. Une copie
 * qu'`AdminAuditLog` ne connaît pas, que `purgeReaderCaches` ne vide qu'à la
 * déconnexion, et que personne ne révoque.
 *
 * C'est la forme exacte du cycle 125 du `CLAUDE.md` : « une protection de
 * contenu se mesure sur tout ce que la charge TRANSPORTE, jamais sur sa seule
 * chaîne ». Ici, ce n'est même pas un champ voisin qui fuyait — c'est la même
 * charge, par un second chemin, que le doc-comment de `query-client.ts`
 * AVOUAIT en toutes lettres (« Ne couvre PAS le cache du service worker »).
 *
 * ## POURQUOI TOUT `/admin/`, ET PAS LES SEULES ROUTES SOUVERAINES
 *
 * Aucune surface d'administration n'a besoin de fonctionner hors ligne : elle
 * dit l'état VRAI de l'instance, et une réponse de trois jours y serait pire
 * qu'une erreur. Sortir le préfixe entier ne coûte donc rien au produit, et
 * ferme aussi ce qu'une route d'administration future servirait — un filtre
 * qui énumère se périme au premier ajout, en silence.
 */

/**
 * ## POURQUOI UNE EXPRESSION RÉGULIÈRE, ET PAS LE PRÉDICAT
 *
 * La première forme de ce lot donnait à `vite.config.ts` un PRÉDICAT importé.
 * Workbox ne compile pas ce fichier : il STRINGIFIE le `urlPattern` reçu et
 * pose ce texte dans `dist/sw.js`. Le service worker livré portait donc
 * `({url:s})=>apiResponseMayBeCached(s.pathname)` sans la moindre définition
 * de ce nom — la règle n'était pas appliquée, et le matcher jetait une
 * `ReferenceError` à chaque requête GET, ce qui désarmait aussi le seau `medias`
 * enregistré derrière lui.
 *
 * Une expression régulière, elle, se sérialise en LITTÉRAL : ce que le gate
 * `check-sw-api-cache.mjs` fait décider depuis `dist/sw.js` est exactement
 * cette valeur. Elle est donc la source de vérité, et le prédicat ci-dessous
 * n'en est qu'une PROJECTION — deux boucles jumelles se seraient séparées au
 * premier ajout de route.
 *
 * Ancrée sur l'origine : la v2 appelle une passerelle d'un AUTRE domaine
 * (`gate.meeshy.me`), et Workbox n'accepte une expression régulière sur une
 * URL d'origine étrangère que si la correspondance commence à l'indice 0.
 */
/**
 * ## POURQUOI LES MÉDIAS EN SORTENT (#6973)
 *
 * MESURÉ en rejouant le routeur de Workbox sur `dist/sw.js` du 2026-09-18 :
 *
 *     SEAU api   [image] …/api/v1/attachments/file/2026%2F09%2Fu%2Favatar.png
 *     SEAU api   [image] …/api/v1/attachments/file/2026%2F09%2Fu%2Fscene.jpg
 *     SEAU api   [video] …/api/v1/attachments/file/2026%2F09%2Fu%2Freel.mp4
 *     SEAU api   [audio] …/api/v1/attachments/file/2026%2F09%2Fu%2Fvoix.m4a
 *     SEAU api   [json ] …/api/v1/conversations?limit=30
 *
 * TOUTE URL de média passe par `/api/v1/attachments/…` (`lib/api/media-url.ts`,
 * site unique `streamSrc`), ce motif n'était ancré sur aucune ORIGINE, et le
 * routeur retient la PREMIÈRE route qui matche : les médias gagnaient la route
 * du JSON, enregistrée la première.
 *
 * **Le coût n'est pas « les images ne sont pas en CacheFirst ». C'est que le
 * plafond de 200 entrées était PARTAGÉ.** Un défilement de fil évinçait du
 * seau les réponses de conversations et de messages dont la lecture hors ligne
 * dépend — le cache que le lecteur a payé une fois, chassé par les images
 * qu'il vient de voir passer. Sorti de là, le plafond redevient RÉSERVÉ au
 * JSON, et c'était le vrai enjeu.
 *
 * Les DEUX montages de la passerelle sont exclus : `/api/v1/attachments/` et
 * le montage LEGACY non versionné `/api/attachments/`, qui sert encore des
 * `fileUrl` persistées depuis des années (`download.ts`,
 * § `registerFileStreamRoute`). Une garde posée d'un côté ne protège pas
 * l'autre — c'est ce que ce fichier de la passerelle dit de lui-même.
 *
 * ## LA TROISIÈME ROUTE DE MÉDIA (#7015) — `/api/v1/static/`
 *
 * L'énumération ci-dessus portait DEUX affirmations, et seule la première
 * était vérifiée : « ces montages sont exclus » (vrai) et « ce sont les
 * montages de média de la passerelle » (jamais mesuré). Il en existait un
 * troisième — `GET /api/v1/static/:filename`, les SONS DE FOND des stories et
 * des réels (`routes/posts/audio.ts`, volume `/app/sounds` : 18 fichiers en
 * production, jusqu'à 7 Mo pièce). Il n'est ni `admin` ni `attachments`, donc
 * le seau `api` le prenait, avec les deux conséquences que #6973 venait de
 * fermer sur les pièces jointes, plus une TROISIÈME qui lui est propre :
 * **cette route-là est AUTHENTIFIÉE**. Un chargement sans en-tête échoue, et
 * `NetworkFirst` sans cache traduit l'échec en `no-response` NON RATTRAPÉ —
 * « The FetchEvent … resulted in a network error response: the promise was
 * rejected », une erreur de console par lecture de story. Hors du seau, la
 * requête retombe sur le réseau natif, dont le rejet est rattrapé par son
 * appelant (`lib/api/protected-media.ts`).
 *
 * Elle reste hors du seau `medias` aussi, et par CONSTRUCTION : celui-ci
 * matche `request.destination === 'image'`, et ces octets voyagent en `fetch`
 * (destination vide). Une piste protégée n'a donc aucun seau — ce qui est la
 * bonne réponse pour une réponse `private, max-age=3600` : le cache HTTP du
 * navigateur la garde, et lui seul sait la reconjuguer avec l'identité qui
 * l'a demandée.
 */
export const API_RESPONSE_CACHE_PATTERN =
  /^https?:\/\/[^/]+\/api\/(?!v1\/admin(?:[/?#]|$))(?!(?:v1\/)?attachments\/)(?!(?:v1\/)?static\/)/;

/**
 * LA ROUTE DE FLUX DES MÉDIAS — le COMPLÉMENT du motif ci-dessus sur `/api/`.
 *
 * Elle n'est PAS passée à Workbox : le seau `medias` matche sur
 * `request.destination === 'image'`, une valeur que seul le navigateur connaît
 * et qu'aucune URL ne porte. C'est précisément ce qui rend la décision
 * « audio et vidéo restent HORS cache » vraie par CONSTRUCTION plutôt que par
 * énumération d'extensions — un filtre qui énumère se périme au premier ajout,
 * en silence.
 *
 * Ce motif sert donc deux lecteurs, et l'origine y est OPTIONNELLE parce que
 * les deux voient des formes différentes : le gate de l'artefact, qui vérifie
 * que les deux seaux sont DISJOINTS, et `mediaImageCrossOrigin` ci-dessous,
 * qui voit le `src` tel que la page le pose — absolu en production
 * (`gate.meeshy.me`), relatif en développement (le proxy de `vite.config.ts`).
 */
export const MEDIA_RESPONSE_CACHE_PATTERN = /^(?:https?:\/\/[^/]+)?\/api\/(?:v1\/)?attachments\//;

/** L'origine de MESURE des prédicats : jamais servie, seulement composée. */
const ORIGINE_DE_MESURE = 'https://meeshy.invalid';

/**
 * `true` si le service worker peut garder cette réponse dans le seau `api`.
 *
 * Prend le PATHNAME (avec sa requête éventuelle) — un `?offset=30`
 * d'administration ne doit pas plus être gardé que la première page.
 */
export function apiResponseMayBeCached(pathname: string): boolean {
  return API_RESPONSE_CACHE_PATTERN.test(new URL(pathname, ORIGINE_DE_MESURE).href);
}

/** `true` si cette adresse est la route de flux d'un média de la passerelle. */
export function mediaResponseMayBeCached(src: string): boolean {
  return MEDIA_RESPONSE_CACHE_PATTERN.test(src);
}

/**
 * **CE QUE L'`<img>` DOIT DEMANDER AU RÉSEAU** — la SECONDE moitié de #6973,
 * indissociable de la première.
 *
 * La passerelle rend déjà `Access-Control-Allow-Origin: *` et
 * `Cross-Origin-Resource-Policy: cross-origin` sur la route de flux
 * (`services/gateway/src/routes/attachments/download.ts`,
 * `crossOriginMediaHeaders`). **Un en-tête CORS est INERTE tant que l'`<img>`
 * ne demande pas le mode `cors`** : sans `crossOrigin`, la requête part en
 * `no-cors`, la réponse est OPAQUE (status 0), et le seau la garde sans
 * pouvoir distinguer une image d'une page d'erreur 404 — trente jours durant.
 *
 * MAIS LA POSER PARTOUT CASSE CE QU'ELLE PRÉTEND RÉPARER. Un hôte qui ne rend
 * pas `Access-Control-Allow-Origin` fait ÉCHOUER l'image dès que la requête
 * passe en mode `cors`, et `attachmentSrc` laisse passer INCHANGÉES les
 * adresses externes (un CDN, le magasin statique `static.meeshy.me`, #4625) et
 * les aperçus locaux (`blob:`) — par décision (`media-url.ts`, § « CE QU'IL NE
 * TOUCHE PAS »). L'avatar serait retombé sur ses initiales, silencieusement,
 * pour tous ces hôtes.
 *
 * `crossOrigin` est donc une AFFIRMATION SUR LE SERVEUR : on ne la pose que là
 * où on connaît sa réponse. Elle vit ici, à côté de ce que le seau garde,
 * parce que c'est la MÊME question — deux sites en auraient fait deux
 * réponses.
 *
 * Sur une adresse de MÊME ORIGINE (le proxy de développement), le mode `cors`
 * est inoffensif : la vérification CORS ne s'applique pas à une réponse
 * same-origin, qui reste `basic` et non opaque.
 */
export function mediaImageCrossOrigin(src: string | undefined): 'anonymous' | undefined {
  return src !== undefined && mediaResponseMayBeCached(src) ? 'anonymous' : undefined;
}
