/**
 * Les adresses du groupe `apiLegacyMessages` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as apiLegacyMessagesEndpoints from '@meeshy/shared/api/endpoints/api-legacy-messages';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** DELETE /api/messages/bulk/delete-for-me */
export const bulkDeleteForMe = '/api/messages/bulk/delete-for-me';

/** DELETE /api/messages/:messageId/delete-for-me */
export const byMessageIdDeleteForMe = (messageId: string): string => `/api/messages/${encodeURIComponent(messageId)}/delete-for-me`;

/** POST /api/messages/:messageId/restore-for-me */
export const byMessageIdRestoreForMe = (messageId: string): string => `/api/messages/${encodeURIComponent(messageId)}/restore-for-me`;
