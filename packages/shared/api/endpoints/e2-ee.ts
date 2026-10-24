/**
 * Les adresses du groupe `e2Ee` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as e2EeEndpoints from '@meeshy/shared/api/endpoints/e2-ee';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/v1/e2ee/devices */
export const devices = '/api/v1/e2ee/devices';

/** DELETE /api/v1/e2ee/devices/:deviceId */
export const devicesByDeviceId = (deviceId: string): string => `/api/v1/e2ee/devices/${encodeURIComponent(deviceId)}`;

/** PUT /api/v1/e2ee/devices/:deviceId/keys */
export const devicesByDeviceIdKeys = (deviceId: string): string => `/api/v1/e2ee/devices/${encodeURIComponent(deviceId)}/keys`;

/** GET /api/v1/e2ee/devices/self/prekey-count */
export const devicesSelfPrekeyCount = '/api/v1/e2ee/devices/self/prekey-count';

/** GET /api/v1/e2ee/envelopes */
export const envelopes = '/api/v1/e2ee/envelopes';

/** POST /api/v1/e2ee/envelopes/ack */
export const envelopesAck = '/api/v1/e2ee/envelopes/ack';

/** GET /api/v1/e2ee/keys/:userId */
export const keysByUserId = (userId: string): string => `/api/v1/e2ee/keys/${encodeURIComponent(userId)}`;

/** GET /api/v1/e2ee/keys/:userId/devices */
export const keysByUserIdDevices = (userId: string): string => `/api/v1/e2ee/keys/${encodeURIComponent(userId)}/devices`;
