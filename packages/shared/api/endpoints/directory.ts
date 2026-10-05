/**
 * Les adresses du groupe `directory` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as directoryEndpoints from '@meeshy/shared/api/endpoints/directory';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/directory/availability */
export const availability = '/api/v1/directory/availability';

/** GET /api/v1/directory/blocks */
export const blocks = '/api/v1/directory/blocks';

/** PUT · DELETE /api/v1/directory/blocks/:userId */
export const blocksByUserId = (userId: string): string => `/api/v1/directory/blocks/${encodeURIComponent(userId)}`;

/** GET · PUT · PATCH /api/v1/directory/contacts */
export const contacts = '/api/v1/directory/contacts';

/** GET · POST /api/v1/directory/friend-requests */
export const friendRequests = '/api/v1/directory/friend-requests';

/** PATCH /api/v1/directory/friend-requests/:id */
export const friendRequestsById = (id: string): string => `/api/v1/directory/friend-requests/${encodeURIComponent(id)}`;

/** GET /api/v1/directory/people */
export const people = '/api/v1/directory/people';

/** GET /api/v1/directory/people/:handle */
export const peopleByHandle = (handle: string): string => `/api/v1/directory/people/${encodeURIComponent(handle)}`;

/** GET /api/v1/directory/presence */
export const presence = '/api/v1/directory/presence';
