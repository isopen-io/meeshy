import type { PaginationMeta } from '@meeshy/shared/types/api-responses';

/**
 * **LA PAGINATION QUE CERTAINES ROUTES SERVENT VRAIMENT** — `{ total, page,
 * limit, hasMore }`, là où `PaginationMeta` (partagé) décrit la forme par
 * OFFSET : `{ total, offset, limit, hasMore }`.
 *
 * ## Pourquoi cette fonction existe, et pourquoi elle CASTE
 *
 * `ApiSuccess.pagination` est typé `PaginationMeta` (`lib/api/http.ts`), mais
 * le transport ne le VÉRIFIE pas : il pose `envelope.pagination as
 * PaginationMeta` (`http.ts:361`). Le type est donc une PROMESSE, pas une
 * garantie — et pour les routes paginées par PAGE (`/admin/agent/configs`,
 * `/admin/agent/scan-logs`, `sendPaginatedSuccess` avec `{ total, page, limit,
 * hasMore }`), cette promesse est fausse : l'objet qui arrive n'a pas
 * d'`offset` et porte un `page` que le type ignore.
 *
 * Un témoin qui construirait ici un `PaginationMeta` conforme mesurerait donc
 * une charge que le serveur **n'envoie pas** — et le décodeur qu'il prétend
 * garder pourrait lire `offset` sans que rien ne rougisse, jusqu'en
 * production. Cette fonction reproduit la conversion EXACTE que fait le
 * transport, au même endroit du chemin, pour que les témoins mesurent la forme
 * réelle du fil.
 *
 * **Le cast est ici, une fois, avec son motif** — plutôt qu'essaimé dans chaque
 * fichier de témoins, où il perdrait sa justification au premier copier-coller.
 *
 * ## Ce que cette fonction NE corrige pas
 *
 * Le désaccord de fond — un type unique pour deux conventions de pagination —
 * vit dans `packages/shared`. Le resserrer depuis un dossier de témoins serait
 * réparer la mesure au lieu de la chose mesurée.
 */
/**
 * **CE QUE LE TRANSPORT REMET VRAIMENT** (#6862, revue-correction) — la
 * conversion `enveloppe → ApiResult` que `createHttpTransport` fait
 * (`http.ts:355-366`), reproduite ici pour les témoins de port.
 *
 * Un double qui rend `{ ok: true, data: enveloppe }` remet l'enveloppe ENTIÈRE
 * dans `data` : un décodeur qui lirait `data.pagination` y trouve la
 * pagination, et le témoin verdit. En production, le transport a DÉJÀ
 * dépaqueté — `data` est le tableau, `pagination` est un SIBLING de `ok` — et
 * le même décodeur ne trouve plus rien : `total` retombe sur la longueur de la
 * page et `hasMore` est faux pour toujours. Le bouton « Suivants » est alors
 * éteint en production, VERT sous témoin.
 *
 * C'est le défaut qu'a payé ce chantier sur quatre décodeurs d'administration
 * à la fois. Tout témoin de port passe donc par ici plutôt que de fabriquer
 * son `ApiResult` à la main.
 */
export function resultatServi(enveloppe: unknown): {
  readonly ok: true;
  readonly data: unknown;
  readonly status: number;
  readonly pagination?: PaginationMeta;
} {
  const charge = typeof enveloppe === 'object' && enveloppe !== null ? (enveloppe as Record<string, unknown>) : {};
  const aUneEnveloppe = !Array.isArray(enveloppe) && 'data' in charge;
  const pagination = charge.pagination;

  return {
    ok: true,
    data: aUneEnveloppe ? charge.data : enveloppe,
    status: 200,
    ...(pagination === undefined ? {} : { pagination: pagination as PaginationMeta }),
  };
}

export type ServedPagePagination = {
  readonly total: number;
  readonly page?: number;
  readonly limit?: number;
  readonly hasMore?: boolean;
};

export const servedPagination = (meta: ServedPagePagination): PaginationMeta =>
  meta as unknown as PaginationMeta;
