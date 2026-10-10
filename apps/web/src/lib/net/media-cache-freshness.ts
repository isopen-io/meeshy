/**
 * LE SEAU `medias` RESPECTE LA FRAÎCHEUR QUE LA PASSERELLE DÉCLARE (#9478).
 *
 * La passerelle sert une vue unique en `private, no-store` et un éphémère
 * vivant en `private, no-cache` (#9315, `fileRouteVerdict.ts`) ; un fichier
 * rappelé, expiré ou consommé rend 404. `CacheFirst` ne lisait aucun de ces
 * en-têtes : la première lecture écrivait les octets dans le seau pour trente
 * jours, et chaque lecture suivante les resservait SANS réseau — une vue unique
 * se relisait depuis le disque du poste longtemps après sa fin de vie.
 *
 * Deux crochets, une règle :
 *  - `cacheWillUpdate` : une réponse `no-store` ou `no-cache` n'entre pas dans
 *    le seau. L'éphémère reste servi par le cache HTTP du navigateur, qui
 *    honore `no-cache` en revalidant par ETag (304 bon marché, 404 à
 *    l'échéance) ; la vue unique n'est gardée nulle part ;
 *  - `cachedResponseWillBeUsed` : une entrée qui porte l'une de ces directives
 *    — écrite par une version antérieure du worker — n'est pas resservie, et
 *    la requête part au réseau.
 *
 * Un média ORDINAIRE (`private, max-age=31536000`) ne passe par aucune des
 * deux branches : il reste servi depuis le seau, instantanément (Cache-First).
 * Une réponse OPAQUE ne laisse lire aucun en-tête et garde son régime — les
 * images de la passerelle sont demandées en `cors` (`mediaImageCrossOrigin`),
 * donc lisibles.
 *
 * **AUTONOME, et c'est une contrainte, pas un style** : Workbox STRINGIFIE ce
 * greffon dans `dist/sw.js`, où aucun import ne le suit (#6862). Chaque
 * fonction porte donc sa propre expression — `check-sw-api-cache.mjs`
 * l'extrait de l'artefact construit et la fait décider.
 */

export type MediaCacheWrite = { readonly request?: Request; readonly response: Response };
export type MediaCacheRead = { readonly request?: Request; readonly cachedResponse?: Response | null | undefined };

export const mediaCacheFreshnessPlugin = {
  cacheWillUpdate: async ({ response }: MediaCacheWrite): Promise<Response | null> =>
    /(?:^|,)\s*no-(?:store|cache)\s*(?:[,=]|$)/i.test(response.headers.get('Cache-Control') ?? '') ? null : response,
  cachedResponseWillBeUsed: async ({ cachedResponse }: MediaCacheRead): Promise<Response | null> =>
    !cachedResponse || /(?:^|,)\s*no-(?:store|cache)\s*(?:[,=]|$)/i.test(cachedResponse.headers.get('Cache-Control') ?? '')
      ? null
      : cachedResponse,
};
