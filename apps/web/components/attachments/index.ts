/**
 * Point d'entrée pour les composants d'attachments
 */

export { MessageAttachments } from './MessageAttachments';
export { ImageAttachment } from './ImageAttachment';
export { VideoAttachment } from './VideoAttachment';
export { AudioAttachment } from './AudioAttachment';
export { DocumentAttachment } from './DocumentAttachment';
export { FileAttachment } from './FileAttachment';
export { AttachmentGridLayout } from './AttachmentGridLayout';
export { AttachmentDeleteDialog } from './AttachmentDeleteDialog';
export { AttachmentLightboxes } from './AttachmentLightboxes';

export { useAttachmentLightbox } from './hooks/useAttachmentLightbox';
export { useAttachmentDeletion } from './hooks/useAttachmentDeletion';
export { useResponsiveDetection } from './hooks/useResponsiveDetection';

export { separateAttachmentsByType } from './utils/attachmentFilters';
export type { AttachmentsByType } from './utils/attachmentFilters';
