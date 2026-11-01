/**
 * Types d'attachements supportés — feuille sans import, pour que
 * `attachment.ts` et `upload-limits.ts` la partagent sans cycle (#11266).
 */
export type AttachmentType = 'image' | 'document' | 'audio' | 'video' | 'text' | 'code';
