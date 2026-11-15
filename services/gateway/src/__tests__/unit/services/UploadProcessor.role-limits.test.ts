/**
 * #11266 — `UploadProcessor.validateFile` juge la taille pour le RÔLE de
 * l'appelant (plafonds de `@meeshy/shared/types/upload-limits`, anonymes ÷10),
 * et une vidéo déclarée se mérite par ses octets.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => ({})),
}));

import { UploadProcessor, type FileToUpload } from '../../../services/attachments/UploadProcessor';
import { JPEG_SIGNATURE_BYTES, MP4_VIDEO_SIGNATURE_BYTES, PDF_SIGNATURE_BYTES } from '../../../services/attachments/__tests__/signature-fixtures';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

const processor = () => new UploadProcessor({} as never, { mediaQueue: null });

const file = (overrides: Partial<FileToUpload>): FileToUpload => ({
  buffer: JPEG_SIGNATURE_BYTES,
  filename: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 1024,
  ...overrides,
});

describe('UploadProcessor.validateFile — la limite dépend du rôle (#11266)', () => {
  it('sans rôle, juge comme un inscrit : une image de 100 Mo passe', () => {
    expect(processor().validateFile(file({ size: 100 * MIB })).valid).toBe(true);
  });

  it('refuse à un inscrit une image au-delà de 100 Mo, avec le code stable', () => {
    const verdict = processor().validateFile(file({ size: 100 * MIB + 1 }), 'registered');
    expect(verdict).toMatchObject({ valid: false, code: 'FILE_TOO_LARGE' });
    expect(verdict.error).toContain('100 MB');
  });

  it('refuse à un anonyme une image au-delà de 10 Mo', () => {
    expect(processor().validateFile(file({ size: 10 * MIB + 1 }), 'anonymous')).toMatchObject({ valid: false, code: 'FILE_TOO_LARGE' });
    expect(processor().validateFile(file({ size: 10 * MIB }), 'anonymous').valid).toBe(true);
  });

  it('laisse une vidéo d’inscrit aller jusqu’à 4 Go', () => {
    const video = file({ buffer: MP4_VIDEO_SIGNATURE_BYTES, filename: 'clip.mp4', mimeType: 'video/mp4', size: 4 * GIB });
    expect(processor().validateFile(video, 'registered').valid).toBe(true);
  });

  it('refuse une « vidéo » dont les octets sont un PDF', () => {
    const fake = file({ buffer: PDF_SIGNATURE_BYTES, filename: 'clip.mp4', mimeType: 'video/mp4', size: PDF_SIGNATURE_BYTES.length });
    expect(processor().validateFile(fake, 'registered')).toMatchObject({ valid: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
  });
});
