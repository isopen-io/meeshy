/**
 * **LA COPIE DU SEAU `api` NE SERT QUE LE VRAI HORS-LIGNE** (#18919, WEB-10).
 *
 * Le seau `api` du service worker est en `NetworkFirst`, sans délai (#9637) :
 * un `fetch` qui LÈVE rend la réponse rangée (`workbox-strategies`,
 * `NetworkFirst._handle` → `cacheMatch`). En ligne, cela arrivait dès que la
 * passerelle était injoignable une seconde — un 502 de Traefik sans en-tête
 * CORS, un portail captif, un changement de réseau — et la copie d'il y a une
 * heure, ou d'il y a sept jours, revenait à TanStack comme une réponse
 * fraîche : elle écrasait l'état temps réel affiché, et une copie de `GET /me`
 * pouvait faire reculer la session (réserve C8 de #19081).
 *
 * En ligne, le greffon REFUSE la copie : l'échec remonte à la page, qui garde
 * ce qu'elle affiche et retentera. Hors ligne — un démarrage à froid sans
 * réseau —, la copie est servie comme avant. Aucun en-tête ni erreur typée
 * côté `http.ts` : la règle tient tout entière dans le seau.
 *
 * **AUTONOME, et c'est une contrainte** : Workbox STRINGIFIE ce greffon dans
 * `dist/sw.js`, où aucun import ne le suit (#6862). La fonction ne cite que
 * `self`, le global du service worker ; `check-sw-api-cache.mjs` l'extrait de
 * l'artefact construit et la fait décider, en ligne et hors ligne.
 */
export const apiCacheOfflineOnlyPlugin = {
  cachedResponseWillBeUsed: async ({ cachedResponse }: { readonly cachedResponse?: Response | null }): Promise<Response | null> =>
    self.navigator.onLine ? null : (cachedResponse ?? null),
};
