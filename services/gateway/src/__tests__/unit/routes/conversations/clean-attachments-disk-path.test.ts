/**
 * @jest-environment node
 *
 * #19672 — `cleanAttachmentsForApi`, la projection REST des pièces d'une liste
 * de messages, retire elle-même `translations.<lang>.path`. Le schéma partagé
 * ne le déclare plus, mais la projection ne s'en remet pas à lui : ce témoin
 * l'appelle DIRECTEMENT, sans sérialiseur, et tombe si l'appel à
 * `servedAttachmentTranslations` y est retiré.
 */
import { describe, it, expect } from '@jest/globals';
import { cleanAttachmentsForApi } from '../../../../routes/conversations/messages-list-query';
import { servedAttachmentTranslations } from '../../../../services/attachments/servedAttachmentTranslations';

const DISK_PATH = '/app/uploads/translated/507f1f77bcf86cd799439012_en.mp3';

const voiceNote = () => ({
  id: '507f1f77bcf86cd799439012',
  mimeType: 'audio/mp4',
  fileUrl: '/api/v1/attachments/file/note.m4a',
  reactions: [],
  translations: {
    en: {
      type: 'audio',
      transcription: 'Hello there',
      path: DISK_PATH,
      url: '/api/v1/attachments/file/translated/507f1f77bcf86cd799439012_en.mp3',
      durationMs: 1200,
      format: 'mp3',
      segments: [{ text: 'Hello', startMs: 0, endMs: 400, voiceSimilarityScore: false }],
    },
  },
});

describe('#19672 — cleanAttachmentsForApi ne projette pas le chemin disque', () => {
  it('retire translations.<lang>.path et garde le reste de la piste', () => {
    const [cleaned] = cleanAttachmentsForApi([voiceNote()]) ?? [];

    expect(cleaned?.translations?.en).not.toHaveProperty('path');
    expect(cleaned?.translations?.en).toMatchObject({
      transcription: 'Hello there',
      url: '/api/v1/attachments/file/translated/507f1f77bcf86cd799439012_en.mp3',
      durationMs: 1200,
      format: 'mp3',
      segments: [{ text: 'Hello', startMs: 0, endMs: 400, voiceSimilarityScore: null }],
    });
    expect(JSON.stringify(cleaned)).not.toContain('/app/uploads');
  });
});

describe('#19672 — servedAttachmentTranslations annonce ce qu’il sert', () => {
  it('la valeur servie n’a plus de `path` (le TYPE est tenu par `ServedTranslationEntryRatchet`, lu par tsc)', () => {
    const served = servedAttachmentTranslations({ en: { path: DISK_PATH, url: '/u' } });

    expect(served.en).toEqual({ url: '/u' });
  });

  it('laisse passer null, undefined et un tableau tels quels', () => {
    const list = [{ path: DISK_PATH }];
    expect(servedAttachmentTranslations(null)).toBeNull();
    expect(servedAttachmentTranslations(undefined)).toBeUndefined();
    expect(servedAttachmentTranslations(list as unknown)).toBe(list);
  });
});
