/**
 * Les adresses du groupe `calls` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as callsEndpoints from '@meeshy/shared/api/endpoints/calls';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/calls/active */
export const active = '/api/v1/calls/active';

/** GET · DELETE /api/v1/calls/:callId */
export const byCallId = (callId: string): string => `/api/v1/calls/${encodeURIComponent(callId)}`;

/** POST /api/v1/calls/:callId/participants */
export const byCallIdParticipants = (callId: string): string => `/api/v1/calls/${encodeURIComponent(callId)}/participants`;

/** DELETE /api/v1/calls/:callId/participants/:participantId */
export const byCallIdParticipantsByParticipantId = (callId: string, participantId: string): string => `/api/v1/calls/${encodeURIComponent(callId)}/participants/${encodeURIComponent(participantId)}`;

/** GET /api/v1/calls/:callId/transcript */
export const byCallIdTranscript = (callId: string): string => `/api/v1/calls/${encodeURIComponent(callId)}/transcript`;

/** GET · DELETE /api/v1/calls/history */
export const history = '/api/v1/calls/history';

/** DELETE /api/v1/calls/history/:callId */
export const historyByCallId = (callId: string): string => `/api/v1/calls/history/${encodeURIComponent(callId)}`;

/** POST /api/v1/calls */
export const root = '/api/v1/calls';
