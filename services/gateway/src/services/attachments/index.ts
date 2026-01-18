/**
 * Point d'entrée du module attachments
 * Exports sélectifs pour usage externe
 */

export { AttachmentService } from './AttachmentService';
export { UploadProcessor } from './UploadProcessor';
export { MetadataManager } from './MetadataManager';

// Types exports
export type {
  FileToUpload,
  UploadResult,
  EncryptedUploadResult,
} from './UploadProcessor';

export type {
  AudioMetadata,
  VideoMetadata,
  ImageMetadata,
  PdfMetadata,
  TextMetadata,
} from './MetadataManager';
