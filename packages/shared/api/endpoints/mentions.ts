/**
 * Les adresses du groupe `mentions` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as mentionsEndpoints from '@meeshy/shared/api/endpoints/mentions';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/mentions/me */
export const me = '/api/v1/mentions/me';

/** GET /api/v1/mentions/messages/:messageId */
export const messagesByMessageId = (messageId: string): string => `/api/v1/mentions/messages/${encodeURIComponent(messageId)}`;

/** GET /api/v1/mentions/suggestions */
export const suggestions = '/api/v1/mentions/suggestions';
