/**
 * Les adresses du groupe `rootLegacyAttachments` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as rootLegacyAttachmentsEndpoints from '@meeshy/shared/api/endpoints/root-legacy-attachments';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /attachments/batch/analysis */
export const batchAnalysis = '/attachments/batch/analysis';

/** GET · POST /attachments/:attachmentId/analysis */
export const byAttachmentIdAnalysis = (attachmentId: string): string => `/attachments/${encodeURIComponent(attachmentId)}/analysis`;
