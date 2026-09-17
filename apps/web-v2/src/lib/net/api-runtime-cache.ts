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
export const API_RESPONSE_CACHE_PATTERN = /^https?:\/\/[^/]+\/api\/(?!v1\/admin(?:[/?#]|$))/;

/** L'origine de MESURE du prédicat : jamais servie, seulement composée. */
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
