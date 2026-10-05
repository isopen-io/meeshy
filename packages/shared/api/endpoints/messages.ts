/**
 * Les adresses du groupe `messages` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as messagesEndpoints from '@meeshy/shared/api/endpoints/messages';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** DELETE /api/v1/messages/bulk/delete-for-me */
export const bulkDeleteForMe = '/api/v1/messages/bulk/delete-for-me';

/** GET · PUT · PATCH · DELETE /api/v1/messages/:messageId */
export const byMessageId = (messageId: string): string => `/api/v1/messages/${encodeURIComponent(messageId)}`;

/** DELETE /api/v1/messages/:messageId/delete-for-me */
export const byMessageIdDeleteForMe = (messageId: string): string => `/api/v1/messages/${encodeURIComponent(messageId)}/delete-for-me`;

/** GET /api/v1/messages/:messageId/read-status */
export const byMessageIdReadStatus = (messageId: string): string => `/api/v1/messages/${encodeURIComponent(messageId)}/read-status`;

/** POST /api/v1/messages/:messageId/restore-for-me */
export const byMessageIdRestoreForMe = (messageId: string): string => `/api/v1/messages/${encodeURIComponent(messageId)}/restore-for-me`;

/** GET /api/v1/messages/:messageId/status-details */
export const byMessageIdStatusDetails = (messageId: string): string => `/api/v1/messages/${encodeURIComponent(messageId)}/status-details`;

/** GET /api/v1/messages/:messageId/translations */
export const byMessageIdTranslations = (messageId: string): string => `/api/v1/messages/${encodeURIComponent(messageId)}/translations`;
