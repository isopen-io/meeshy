/**
 * Les adresses du groupe `friendRequests` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as friendRequestsEndpoints from '@meeshy/shared/api/endpoints/friend-requests';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** PATCH · DELETE /api/v1/friend-requests/:id */
export const byId = (id: string): string => `/api/v1/friend-requests/${encodeURIComponent(id)}`;

/** GET /api/v1/friend-requests/received */
export const received = '/api/v1/friend-requests/received';

/** POST /api/v1/friend-requests */
export const root = '/api/v1/friend-requests';

/** GET /api/v1/friend-requests/sent */
export const sent = '/api/v1/friend-requests/sent';
