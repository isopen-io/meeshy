/**
 * Les adresses du groupe `affiliate` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as affiliateEndpoints from '@meeshy/shared/api/endpoints/affiliate';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/v1/affiliate/click/:token */
export const clickByToken = (token: string): string => `/api/v1/affiliate/click/${encodeURIComponent(token)}`;

/** POST /api/v1/affiliate/register */
export const register = '/api/v1/affiliate/register';

/** GET /api/v1/affiliate/stats */
export const stats = '/api/v1/affiliate/stats';

/** GET · POST /api/v1/affiliate/tokens */
export const tokens = '/api/v1/affiliate/tokens';

/** DELETE /api/v1/affiliate/tokens/:id */
export const tokensById = (id: string): string => `/api/v1/affiliate/tokens/${encodeURIComponent(id)}`;

/** POST /api/v1/affiliate/track-visit */
export const trackVisit = '/api/v1/affiliate/track-visit';

/** GET /api/v1/affiliate/validate/:token */
export const validateByToken = (token: string): string => `/api/v1/affiliate/validate/${encodeURIComponent(token)}`;
