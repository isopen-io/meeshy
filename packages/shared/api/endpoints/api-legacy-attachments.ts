/**
 * Les adresses du groupe `apiLegacyAttachments` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as apiLegacyAttachmentsEndpoints from '@meeshy/shared/api/endpoints/api-legacy-attachments';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/attachments/file/* */
export const fileByWildcard = (wildcard: string): string => `/api/attachments/file/${wildcard.split('/').map(encodeURIComponent).join('/')}`;
