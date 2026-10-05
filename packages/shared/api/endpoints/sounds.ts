/**
 * Les adresses du groupe `sounds` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as soundsEndpoints from '@meeshy/shared/api/endpoints/sounds';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET · PATCH /api/v1/sounds/:id */
export const byId = (id: string): string => `/api/v1/sounds/${encodeURIComponent(id)}`;

/** GET /api/v1/sounds/:id/posts */
export const byIdPosts = (id: string): string => `/api/v1/sounds/${encodeURIComponent(id)}/posts`;

/** GET /api/v1/sounds/mine */
export const mine = '/api/v1/sounds/mine';
