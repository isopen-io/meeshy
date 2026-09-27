/**
 * Les adresses du groupe `attachments` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as attachmentsEndpoints from '@meeshy/shared/api/endpoints/attachments';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** POST /api/v1/attachments/batch/analysis */
export const batchAnalysis = '/api/v1/attachments/batch/analysis';

/** GET · DELETE /api/v1/attachments/:attachmentId */
export const byAttachmentId = (attachmentId: string): string => `/api/v1/attachments/${encodeURIComponent(attachmentId)}`;

/** GET · POST /api/v1/attachments/:attachmentId/analysis */
export const byAttachmentIdAnalysis = (attachmentId: string): string => `/api/v1/attachments/${encodeURIComponent(attachmentId)}/analysis`;

/** GET /api/v1/attachments/:attachmentId/metadata */
export const byAttachmentIdMetadata = (attachmentId: string): string => `/api/v1/attachments/${encodeURIComponent(attachmentId)}/metadata`;

/** POST /api/v1/attachments/:attachmentId/status */
export const byAttachmentIdStatus = (attachmentId: string): string => `/api/v1/attachments/${encodeURIComponent(attachmentId)}/status`;

/** GET /api/v1/attachments/:attachmentId/status-details */
export const byAttachmentIdStatusDetails = (attachmentId: string): string => `/api/v1/attachments/${encodeURIComponent(attachmentId)}/status-details`;

/** GET /api/v1/attachments/:attachmentId/thumbnail */
export const byAttachmentIdThumbnail = (attachmentId: string): string => `/api/v1/attachments/${encodeURIComponent(attachmentId)}/thumbnail`;

/** POST /api/v1/attachments/:attachmentId/transcribe */
export const byAttachmentIdTranscribe = (attachmentId: string): string => `/api/v1/attachments/${encodeURIComponent(attachmentId)}/transcribe`;

/** POST /api/v1/attachments/:attachmentId/translate */
export const byAttachmentIdTranslate = (attachmentId: string): string => `/api/v1/attachments/${encodeURIComponent(attachmentId)}/translate`;

/** GET /api/v1/attachments/file/* */
export const fileByWildcard = (wildcard: string): string => `/api/v1/attachments/file/${wildcard.split('/').map(encodeURIComponent).join('/')}`;

/** GET /api/v1/attachments/search */
export const search = '/api/v1/attachments/search';

/** POST /api/v1/attachments/upload */
export const upload = '/api/v1/attachments/upload';

/** POST /api/v1/attachments/upload-text */
export const uploadText = '/api/v1/attachments/upload-text';
