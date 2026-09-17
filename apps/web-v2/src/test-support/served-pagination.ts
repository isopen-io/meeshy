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
export type ServedPagePagination = {
  readonly total: number;
  readonly page?: number;
  readonly limit?: number;
  readonly hasMore?: boolean;
};

export const servedPagination = (meta: ServedPagePagination): PaginationMeta =>
  meta as unknown as PaginationMeta;
