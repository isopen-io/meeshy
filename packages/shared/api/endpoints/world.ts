/**
 * Les adresses du groupe `world` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as worldEndpoints from '@meeshy/shared/api/endpoints/world';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/world/participants/:participantId */
export const participantsByParticipantId = (participantId: string): string => `/api/v1/world/participants/${encodeURIComponent(participantId)}`;

/** GET /api/v1/world */
export const root = '/api/v1/world';
