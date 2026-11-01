/**
 * Les adresses du groupe `relations` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as relationsEndpoints from '@meeshy/shared/api/endpoints/relations';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/relations/:userId */
export const byUserId = (userId: string): string => `/api/v1/relations/${encodeURIComponent(userId)}`;

/** POST /api/v1/relations/:userId/level */
export const byUserIdLevel = (userId: string): string => `/api/v1/relations/${encodeURIComponent(userId)}/level`;

/** POST /api/v1/relations/:userId/ritual */
export const byUserIdRitual = (userId: string): string => `/api/v1/relations/${encodeURIComponent(userId)}/ritual`;

/** GET /api/v1/relations/config */
export const config = '/api/v1/relations/config';

/** GET /api/v1/relations */
export const root = '/api/v1/relations';
