/**
 * Les adresses du groupe `signal` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as signalEndpoints from '@meeshy/shared/api/endpoints/signal';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/v1/signal/keys */
export const keys = '/api/v1/signal/keys';

/** GET /api/v1/signal/keys/:userId */
export const keysByUserId = (userId: string): string => `/api/v1/signal/keys/${encodeURIComponent(userId)}`;

/** POST /api/v1/signal/session/establish */
export const sessionEstablish = '/api/v1/signal/session/establish';
