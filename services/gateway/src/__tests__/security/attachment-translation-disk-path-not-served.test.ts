/**
 * @jest-environment node
 *
 * #19672 — le chemin DISQUE d'une piste traduite ne sort plus.
 *
 * `saveTranslatedTrack` grave `path: path.resolve(translatedDir, filename)` —
 * un chemin ABSOLU du conteneur — dans `MessageAttachment.translations.<lang>`.
 * La base peut le garder ; le fil, non. `messageAttachmentSchema` le DÉCLARAIT
 * (`translations.<lang>.path`, `translatedAudios[].path`), donc
 * `fast-json-stringify` le laissait passer sur toute route qui sert ce schéma :
 * listes de messages, synchro, liens, upload, métadonnées, traduction.
 *
 * Aucun client ne le lit (vérifié : `APIAttachmentTranslation` iOS,
 * `ApiAttachmentTranslation` Android, décodeurs web) — son retrait est donc
 * rétrocompatible.
 *
 * Le témoin passe la charge au sérialiseur RÉEL, avec le schéma RÉEL, comme
 * le fait Fastify : c'est la seule chose qui décide de ce qui part.
 */
import { describe, it, expect } from '@jest/globals';
import fastJson from 'fast-json-stringify';
import { messageSchema, messageAttachmentSchema } from '@meeshy/shared/types/api-schemas';

const DISK_PATH = '/app/uploads/translated/507f1f77bcf86cd799439012_en.mp3';

const serializeAttachment = fastJson(messageAttachmentSchema as never);

const serializeMessageEnvelope = fastJson({
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: messageSchema as Record<string, unknown>,
  },
} as never);

const translatedVoiceNote = () => ({
  id: '507f1f77bcf86cd799439012',
  messageId: '507f1f77bcf86cd799439011',
  fileName: 'note.m4a',
  originalName: 'note.m4a',
  mimeType: 'audio/mp4',
  fileSize: 1024,
  fileUrl: '/api/v1/attachments/file/note.m4a',
  createdAt: '2026-11-18T10:00:00.000Z',
  translations: {
    en: {
      type: 'audio',
      transcription: 'Hello there',
      path: DISK_PATH,
      url: '/api/v1/attachments/file/translated/507f1f77bcf86cd799439012_en.mp3',
      durationMs: 1200,
      format: 'mp3',
      cloned: true,
      createdAt: '2026-11-18T10:00:01.000Z',
    },
  },
  translatedAudios: [
    {
      id: '507f1f77bcf86cd799439012_en',
      type: 'audio',
      targetLanguage: 'en',
      translatedText: 'Hello there',
      url: '/api/v1/attachments/file/translated/507f1f77bcf86cd799439012_en.mp3',
      path: DISK_PATH,
      durationMs: 1200,
      format: 'mp3',
    },
  ],
});

describe('#19672 — une pièce jointe servie ne porte plus le chemin disque de ses pistes traduites', () => {
  it('messageAttachmentSchema retire translations.<lang>.path et translatedAudios[].path', () => {
    const served = JSON.parse(serializeAttachment(translatedVoiceNote()));

    expect(served.translations.en).not.toHaveProperty('path');
    expect(served.translatedAudios[0]).not.toHaveProperty('path');
    expect(JSON.stringify(served)).not.toContain('/app/uploads');
  });

  it('garde les autres champs de la piste traduite', () => {
    const served = JSON.parse(serializeAttachment(translatedVoiceNote()));

    expect(served.translations.en).toMatchObject({
      type: 'audio',
      transcription: 'Hello there',
      url: '/api/v1/attachments/file/translated/507f1f77bcf86cd799439012_en.mp3',
      durationMs: 1200,
      format: 'mp3',
      cloned: true,
    });
    expect(served.translatedAudios[0]).toMatchObject({
      targetLanguage: 'en',
      translatedText: 'Hello there',
      url: '/api/v1/attachments/file/translated/507f1f77bcf86cd799439012_en.mp3',
      durationMs: 1200,
      format: 'mp3',
    });
  });

  it('un message servi (listes de messages) ne porte pas le chemin disque de ses pièces', () => {
    const payload = serializeMessageEnvelope({
      success: true,
      data: {
        id: '507f1f77bcf86cd799439011',
        conversationId: '507f1f77bcf86cd799439013',
        content: '',
        originalLanguage: 'fr',
        messageType: 'audio',
        createdAt: '2026-11-18T10:00:00.000Z',
        attachments: [translatedVoiceNote()],
      },
    });

    expect(payload).toContain('Hello there');
    expect(payload).not.toContain('/app/uploads');
  });
});
