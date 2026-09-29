/**
 * LE SEAU `api` DU SERVICE WORKER RANGE CHAQUE RÉPONSE SOUS L'IDENTITÉ QUI
 * L'A DEMANDÉE (#8674).
 *
 * Workbox range une réponse sous son URL. Deux comptes qui lisent
 * la liste des conversations (`conversations.root`) sur le même appareil partageaient donc UNE
 * entrée : sur un réseau lent (`networkTimeoutSeconds: 3`) ou hors ligne, le
 * NetworkFirst resservait au compte B la liste du compte A. La purge au
 * changement d'identité ne fermait pas la course : une réponse d'A encore en
 * vol au moment de la bascule s'écrivait dans le seau APRÈS la purge.
 *
 * La clé de cache porte désormais une EMPREINTE de l'en-tête d'identité de la
 * requête (`Authorization` d'un compte, `X-Session-Token` d'un invité) —
 * SHA-256 tronqué, jamais le jeton lui-même : l'adresse d'une entrée est
 * écrite sur le disque. Une requête sans identité garde son URL nue. B ne
 * peut plus lire l'entrée d'A : la réponse d'A, même écrite après la bascule,
 * est rangée sous la clé d'A.
 *
 * **AUTONOME, et c'est une contrainte, pas un style** : Workbox STRINGIFIE ce
 * greffon dans `dist/sw.js`, où aucun import ne le suit (#6862). La fonction
 * ne cite donc que des globaux du service worker (`crypto`, `TextEncoder`,
 * `Uint8Array`, `Array`) ; `check-sw-api-cache.mjs` l'extrait de l'artefact
 * construit et la fait décider.
 */

/** Le paramètre qui porte l'empreinte — jamais envoyé au réseau : il ne vit
 * que dans la clé du Cache Storage. */
export const API_CACHE_IDENTITY_PARAM = '__meeshy_identity';

export type ApiCacheKeyRequest = {
  readonly url: string;
  readonly headers: { get(name: string): string | null };
};

export const apiCacheIdentityPlugin = {
  cacheKeyWillBeUsed: async ({ request }: { readonly request: ApiCacheKeyRequest }): Promise<string> => {
    const identity = request.headers.get('Authorization') ?? request.headers.get('X-Session-Token') ?? '';
    if (identity === '') return request.url;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
    const print = Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${request.url}${request.url.includes('?') ? '&' : '?'}__meeshy_identity=${print}`;
  },
};
