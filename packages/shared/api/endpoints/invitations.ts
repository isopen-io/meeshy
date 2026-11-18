/**
 * Les adresses du groupe `invitations` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as invitationsEndpoints from '@meeshy/shared/api/endpoints/invitations';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET · POST /api/v1/invitations/email */
export const email = '/api/v1/invitations/email';

/** POST /api/v1/invitations/email/:id/resend */
export const emailByIdResend = (id: string): string => `/api/v1/invitations/email/${encodeURIComponent(id)}/resend`;

/** POST /api/v1/invitations/email/opt-out */
export const emailOptOut = '/api/v1/invitations/email/opt-out';
