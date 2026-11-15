import { describe, expect, test } from 'bun:test';

import { requestAttachmentTranscription, requestAttachmentTranslation } from './attachment-processing';
import { MEDIA_ON_DEMAND, MEDIA_UNTRANSCRIBED_VOICE_WITNESS_ID } from './fixtures-media';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * #9256 — LE LECTEUR PLEIN ÉCRAN DEMANDE UNE TRANSCRIPTION ET UNE TRADUCTION,
 * par les routes qu'iOS appelle (`AttachmentService.requestTranscription` /
 * `.translate`) : `POST /attachments/:id/transcribe` et `/translate`.
 */

const recording = (answer: ApiResult<unknown>) => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      calls.push(request);
      return answer;
    },
  } as unknown as HttpTransport;
  return { calls, deps: { source: 'gateway' as const, transport } };
};

const UNTRANSCRIBED = `${MEDIA_UNTRANSCRIBED_VOICE_WITNESS_ID}-a1`;

describe('requestAttachmentTranscription (#9256)', () => {
  test('POST /attachments/:id/transcribe ; une transcription déjà faite revient aussitôt, dans la forme de la pièce', async () => {
    const { calls, deps } = recording({
      ok: true,
      data: { taskId: null, status: 'completed', transcription: { id: 't1', text: 'Bonjour à tous', language: 'fr', confidence: 0.9, source: 'whisper', segments: [] } },
    });

    const result = await requestAttachmentTranscription({ ...deps, attachmentId: 'a-1' });

    expect(calls).toEqual([{ method: 'POST', path: '/api/v1/attachments/a-1/transcribe', body: {} }]);
    expect(result).toEqual({
      ok: true,
      data: {
        status: 'completed',
        transcription: { type: 'audio', transcribedText: 'Bonjour à tous', language: 'fr', confidence: 0.9, source: 'whisper', segments: [] },
      },
    });
  });

  test('un travail mis en file rend « en cours », sans transcription — elle arrivera par le temps réel', async () => {
    const { deps } = recording({ ok: true, data: { taskId: 'task-1', status: 'processing', transcription: null } });

    const result = await requestAttachmentTranscription({ ...deps, attachmentId: 'a-1' });

    expect(result).toEqual({ ok: true, data: { status: 'processing', transcription: null } });
  });

  test('un refus de la passerelle remonte tel quel', async () => {
    const { deps } = recording({ ok: false, status: 403, error: 'AUDIO_TRANSCRIPTION_NOT_ENABLED' });

    const result = await requestAttachmentTranscription({ ...deps, attachmentId: 'a-1' });

    expect(result.ok).toBe(false);
  });

  test('sous fixtures, la transcription du corpus revient sans réseau', async () => {
    const result = await requestAttachmentTranscription({ source: 'fixtures', transport: {} as HttpTransport, attachmentId: UNTRANSCRIBED });

    expect(result).toEqual({ ok: true, data: { status: 'completed', transcription: MEDIA_ON_DEMAND[UNTRANSCRIBED]?.transcription ?? null } });
  });
});

describe('requestAttachmentTranslation (#9256)', () => {
  test('POST /attachments/:id/translate vers UNE langue ; la piste arrive par le temps réel', async () => {
    const { calls, deps } = recording({ ok: true, data: { status: 'processing', jobId: 'job-1' } });

    const result = await requestAttachmentTranslation({ ...deps, attachmentId: 'a-1', targetLanguage: 'es', sourceLanguage: 'fr' });

    expect(calls).toEqual([{ method: 'POST', path: '/api/v1/attachments/a-1/translate', body: { targetLanguages: ['es'], sourceLanguage: 'fr' } }]);
    expect(result).toEqual({ ok: true, data: { status: 'processing', translation: null } });
  });

  test('sans langue d’origine connue, la passerelle la détecte', async () => {
    const { calls, deps } = recording({ ok: true, data: { status: 'processing' } });

    await requestAttachmentTranslation({ ...deps, attachmentId: 'a-1', targetLanguage: 'en' });

    expect(calls[0]?.body).toEqual({ targetLanguages: ['en'] });
  });

  test('sous fixtures, la version traduite du corpus revient — texte ET piste', async () => {
    const result = await requestAttachmentTranslation({ source: 'fixtures', transport: {} as HttpTransport, attachmentId: UNTRANSCRIBED, targetLanguage: 'en' });

    expect(result).toEqual({ ok: true, data: { status: 'completed', translation: MEDIA_ON_DEMAND[UNTRANSCRIBED]?.translations.en ?? null } });
  });

  test('sous fixtures, une langue que le corpus ne porte pas reste « en cours »', async () => {
    const result = await requestAttachmentTranslation({ source: 'fixtures', transport: {} as HttpTransport, attachmentId: UNTRANSCRIBED, targetLanguage: 'sw' });

    expect(result).toEqual({ ok: true, data: { status: 'processing', translation: null } });
  });
});
