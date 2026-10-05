/**
 * Les adresses du groupe `notifications` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as notificationsEndpoints from '@meeshy/shared/api/endpoints/notifications';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** DELETE /api/v1/notifications/admin/clear-all */
export const adminClearAll = '/api/v1/notifications/admin/clear-all';

/** DELETE /api/v1/notifications/:id */
export const byId = (id: string): string => `/api/v1/notifications/${encodeURIComponent(id)}`;

/** POST /api/v1/notifications/:id/read */
export const byIdRead = (id: string): string => `/api/v1/notifications/${encodeURIComponent(id)}/read`;

/** POST /api/v1/notifications/conversation/:conversationId/read */
export const conversationByConversationIdRead = (conversationId: string): string => `/api/v1/notifications/conversation/${encodeURIComponent(conversationId)}/read`;

/** GET /api/v1/notifications/counts */
export const counts = '/api/v1/notifications/counts';

/** POST /api/v1/notifications/post/:postId/read */
export const postByPostIdRead = (postId: string): string => `/api/v1/notifications/post/${encodeURIComponent(postId)}/read`;

/** DELETE /api/v1/notifications/read */
export const read = '/api/v1/notifications/read';

/** POST /api/v1/notifications/read-all */
export const readAll = '/api/v1/notifications/read-all';

/** POST /api/v1/notifications/read-by-types */
export const readByTypes = '/api/v1/notifications/read-by-types';

/** GET /api/v1/notifications */
export const root = '/api/v1/notifications';

/** GET /api/v1/notifications/unread-count */
export const unreadCount = '/api/v1/notifications/unread-count';
