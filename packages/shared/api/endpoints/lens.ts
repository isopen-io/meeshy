/**
 * Les adresses du groupe `lens` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as lensEndpoints from '@meeshy/shared/api/endpoints/lens';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/lens/credits */
export const credits = '/api/v1/lens/credits';

/** GET /api/v1/lens/partners/:userId/logo */
export const partnersByUserIdLogo = (userId: string): string => `/api/v1/lens/partners/${encodeURIComponent(userId)}/logo`;

/** POST /api/v1/lens/partners/:userId/revoke */
export const partnersByUserIdRevoke = (userId: string): string => `/api/v1/lens/partners/${encodeURIComponent(userId)}/revoke`;

/** POST /api/v1/lens/partners/:userId/verify */
export const partnersByUserIdVerify = (userId: string): string => `/api/v1/lens/partners/${encodeURIComponent(userId)}/verify`;

/** GET · PUT /api/v1/lens/partners/me */
export const partnersMe = '/api/v1/lens/partners/me';

/** GET /api/v1/lens/partners/pending */
export const partnersPending = '/api/v1/lens/partners/pending';

/** GET · POST /api/v1/lens/usage/:slug */
export const usageBySlug = (slug: string): string => `/api/v1/lens/usage/${encodeURIComponent(slug)}`;
