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

/** Le préfixe des routes d'administration, tel que les ports le composent. */
const PREFIXE_ADMINISTRATION = '/api/v1/admin/';

/**
 * `true` si le service worker peut garder cette réponse dans le seau `api`.
 *
 * Prend le PATHNAME seul — Workbox donne l'`URL` complète, et la décision ne
 * dépend d'aucun paramètre de requête : un `?offset=30` d'administration ne
 * doit pas plus être gardé que la première page.
 */
export function apiResponseMayBeCached(pathname: string): boolean {
  return pathname.startsWith('/api/') && !pathname.startsWith(PREFIXE_ADMINISTRATION);
}
