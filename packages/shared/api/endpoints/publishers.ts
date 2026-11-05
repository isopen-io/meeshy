/**
 * Les adresses du groupe `publishers` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as publishersEndpoints from '@meeshy/shared/api/endpoints/publishers';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/publishers/admin */
export const admin = '/api/v1/publishers/admin';

/** GET /api/v1/publishers/:slug */
export const bySlug = (slug: string): string => `/api/v1/publishers/${encodeURIComponent(slug)}`;

/** GET /api/v1/publishers/me */
export const me = '/api/v1/publishers/me';
