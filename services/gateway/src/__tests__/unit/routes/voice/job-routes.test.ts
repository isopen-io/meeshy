/**
 * #19472 — suivre ou annuler un job vocal par la passerelle rend la vraie
 * réponse du traducteur et le statut HTTP que le schéma déclare.
 *
 * Les doubles reproduisent les formes RÉELLES du traducteur :
 * `voice_job_status` → `served_job_view(job)` (snake_case, sans `user_id` ni
 * `webhook_url`), `voice_job_cancel` → `{ success, message }`, job inconnu ou
 * d'autrui → erreur `NOT_FOUND` « Job not found ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { registerTranslationRoutes } from '../../../../routes/voice/translation';
import { AudioTranslateError } from '../../../../services/AudioTranslateService';
import type { AudioTranslateService } from '../../../../services/AudioTranslateService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439011';
const PREFIX = '/api/v1/voice';
const JOB_ID = 'mshy_3f2b9c1e8d4a4b7f9e6c2a1d5b8e7f40';

type JobService = {
  getJobStatus: jest.Mock<(userId: string, jobId: string) => Promise<unknown>>;
  cancelJob: jest.Mock<(userId: string, jobId: string) => Promise<unknown>>;
  translateSync?: jest.Mock<(userId: string, options: unknown) => Promise<unknown>>;
};

const servedTranslatorJob = (overrides: Record<string, unknown> = {}) => ({
  id: JOB_ID,
  status: 'processing',
  priority: 1,
  progress: 45,
  current_step: 'tts',
  steps_completed: ['transcription', 'translation'],
  result: null,
  error: null,
  error_code: null,
  created_at: '2026-11-18T10:00:00',
  started_at: '2026-11-18T10:00:01',
  completed_at: null,
  target_languages: ['en'],
  model_version: 'v1',
  embedding_type: 'speaker',
  ...overrides,
});

const notFound = () => new AudioTranslateError('Job not found', 'NOT_FOUND');

function makeJobService(overrides: Partial<JobService> = {}): JobService {
  return {
    getJobStatus: jest.fn<(userId: string, jobId: string) => Promise<unknown>>()
      .mockResolvedValue(servedTranslatorJob()),
    cancelJob: jest.fn<(userId: string, jobId: string) => Promise<unknown>>()
      .mockResolvedValue({ success: true, message: 'Job cancelled' }),
    ...overrides,
  };
}

async function buildApp(jobService: JobService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async () => undefined);
  app.addHook('preHandler', async (req) => {
    Object.assign(req, { user: { userId: USER_ID, role: 'user' } });
  });
  registerTranslationRoutes(
    app,
    jobService as unknown as AudioTranslateService,
    undefined,
    PREFIX,
    {} as PrismaClient
  );
  await app.ready();
  return app;
}

async function call(jobService: JobService, method: 'GET' | 'DELETE') {
  const app = await buildApp(jobService);
  const res = await app.inject({ method, url: `${PREFIX}/job/${JOB_ID}` });
  await app.close();
  return res;
}

describe('DELETE /api/v1/voice/job/:jobId (#19472)', () => {
  it('rend 200 et { jobId, status: cancelled } quand le traducteur annule', async () => {
    const service = makeJobService();
    const res = await call(service, 'DELETE');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { jobId: JOB_ID, status: 'cancelled' } });
    expect(service.cancelJob).toHaveBeenCalledWith(USER_ID, JOB_ID);
  });

  it('rend 400 quand le job n’est plus annulable (success: false)', async () => {
    const res = await call(makeJobService({
      cancelJob: jest.fn<(userId: string, jobId: string) => Promise<unknown>>()
        .mockResolvedValue({ success: false, message: 'Job is no longer pending' }),
    }), 'DELETE');

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
    expect(res.json().data).toBeUndefined();
  });

  it('rend 404, même réponse, pour un job inconnu ou appartenant à autrui', async () => {
    const unknown = await call(makeJobService({
      cancelJob: jest.fn<(userId: string, jobId: string) => Promise<unknown>>().mockRejectedValue(notFound()),
    }), 'DELETE');
    const foreign = await call(makeJobService({
      cancelJob: jest.fn<(userId: string, jobId: string) => Promise<unknown>>().mockRejectedValue(notFound()),
    }), 'DELETE');

    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().success).toBe(false);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.body).toBe(unknown.body);
  });

  it('rend 500 pour toute autre erreur du traducteur', async () => {
    const res = await call(makeJobService({
      cancelJob: jest.fn<(userId: string, jobId: string) => Promise<unknown>>()
        .mockRejectedValue(new AudioTranslateError('Job cancellation failed', 'INTERNAL_ERROR')),
    }), 'DELETE');

    expect(res.statusCode).toBe(500);
  });
});

describe('GET /api/v1/voice/job/:jobId (#19472)', () => {
  it('sert en camelCase les champs que le traducteur rend en snake_case', async () => {
    const res = await call(makeJobService(), 'GET');

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      jobId: JOB_ID,
      status: 'processing',
      progress: 45,
      currentStep: 'tts',
      createdAt: '2026-11-18T10:00:00',
      startedAt: '2026-11-18T10:00:01',
    });
  });

  it('sert le résultat, la fin et l’erreur d’un job terminé', async () => {
    const result = { translationId: 'tr-1', translations: [] };
    const res = await call(makeJobService({
      getJobStatus: jest.fn<(userId: string, jobId: string) => Promise<unknown>>().mockResolvedValue(
        servedTranslatorJob({ status: 'failed', progress: 100, completed_at: '2026-11-18T10:01:00', error: 'TTS failed', result })
      ),
    }), 'GET');

    const data = res.json().data;
    expect(data.status).toBe('failed');
    expect(data.completedAt).toBe('2026-11-18T10:01:00');
    expect(data.error).toBe('TTS failed');
    expect(data.result).toMatchObject({ translationId: 'tr-1' });
  });

  it('ne sert jamais l’identité du propriétaire', async () => {
    const res = await call(makeJobService({
      getJobStatus: jest.fn<(userId: string, jobId: string) => Promise<unknown>>().mockResolvedValue(
        servedTranslatorJob({ user_id: USER_ID, userId: USER_ID, webhook_url: 'https://hook.example' })
      ),
    }), 'GET');

    expect(res.body).not.toContain(USER_ID);
    expect(res.body).not.toContain('hook.example');
  });

  it('rend 404 quand le traducteur ne trouve pas le job (inconnu ou d’autrui)', async () => {
    const res = await call(makeJobService({
      getJobStatus: jest.fn<(userId: string, jobId: string) => Promise<unknown>>().mockRejectedValue(notFound()),
    }), 'GET');

    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });

  it('rend 500 pour toute autre erreur du traducteur', async () => {
    const res = await call(makeJobService({
      getJobStatus: jest.fn<(userId: string, jobId: string) => Promise<unknown>>()
        .mockRejectedValue(new AudioTranslateError('Job status unavailable', 'INTERNAL_ERROR')),
    }), 'GET');

    expect(res.statusCode).toBe(500);
  });
});

describe('Corps exacts servis par les routes de job (#19472, audit)', () => {
  it('un 404 ne nomme ni le job ni l’utilisateur, et porte le code du traducteur', async () => {
    const res = await call(makeJobService({
      cancelJob: jest.fn<(userId: string, jobId: string) => Promise<unknown>>().mockRejectedValue(notFound()),
    }), 'DELETE');

    expect(res.json()).toEqual({ success: false, error: 'NOT_FOUND', message: 'Job not found' });
    expect(res.body).not.toContain(JOB_ID);
    expect(res.body).not.toContain(USER_ID);
  });

  it('un 400 rend le code JOB_NOT_CANCELLABLE et la phrase du traducteur', async () => {
    const res = await call(makeJobService({
      cancelJob: jest.fn<(userId: string, jobId: string) => Promise<unknown>>()
        .mockResolvedValue({ success: false, message: 'Job is no longer pending' }),
    }), 'DELETE');

    expect(res.json()).toEqual({ success: false, error: 'JOB_NOT_CANCELLABLE', message: 'Job is no longer pending' });
  });

  it('une réponse du traducteur sans success: true n’annonce jamais une annulation', async () => {
    const res = await call(makeJobService({
      cancelJob: jest.fn<(userId: string, jobId: string) => Promise<unknown>>().mockResolvedValue({}),
    }), 'DELETE');

    expect(res.statusCode).toBe(400);
    expect(res.json().data).toBeUndefined();
  });
});

const translatorSegment = (overrides: Record<string, unknown> = {}) => ({
  text: 'Bonjour à tous',
  startMs: 0,
  endMs: 1200,
  speakerId: 's0',
  voiceSimilarityScore: null,
  confidence: 0.91,
  language: 'fr',
  ...overrides,
});

const translatorResult = () => ({
  translationId: JOB_ID,
  originalAudio: {
    transcription: 'Bonjour à tous',
    language: 'fr',
    durationMs: 1200,
    confidence: 0.91,
    segments: [translatorSegment(), translatorSegment({ text: 'merci', startMs: 1200, endMs: 1800, speakerId: null })],
  },
  translations: [
    {
      targetLanguage: 'en',
      translatedText: 'Hello everyone',
      audioUrl: null,
      audioBase64: null,
      durationMs: 0,
      voiceCloned: false,
      voiceQuality: 0,
      segments: [translatorSegment({ text: 'Hello everyone', language: 'en', confidence: null })],
    },
  ],
  voiceProfile: null,
  processingTimeMs: 840,
});

describe('Résultat d’un job vocal servi tel que le traducteur le rend (#19595)', () => {
  const completedJob = () => makeJobService({
    getJobStatus: jest.fn<(userId: string, jobId: string) => Promise<unknown>>().mockResolvedValue(
      servedTranslatorJob({ status: 'completed', progress: 100, completed_at: '2026-11-18T10:01:00', result: translatorResult() })
    ),
  });

  it('un audio absent reste null, jamais une chaîne vide qu’un client chargerait', async () => {
    const res = await call(completedJob(), 'GET');

    const [translation] = res.json().data.result.translations;
    expect(translation.audioUrl).toBeNull();
    expect(translation.audioBase64).toBeNull();
  });

  it('un profil vocal absent reste null, jamais un objet vide', async () => {
    const res = await call(completedJob(), 'GET');

    expect(res.json().data.result.voiceProfile).toBeNull();
  });

  it('sert les segments de l’original et de chaque traduction, null compris', async () => {
    const res = await call(completedJob(), 'GET');

    const { result } = res.json().data;
    expect(result.originalAudio.segments).toEqual(translatorResult().originalAudio.segments);
    expect(result.translations[0].segments).toEqual(translatorResult().translations[0].segments);
  });

  it('ne sert d’un segment que les clés déclarées', async () => {
    const res = await call(makeJobService({
      getJobStatus: jest.fn<(userId: string, jobId: string) => Promise<unknown>>().mockResolvedValue(
        servedTranslatorJob({
          status: 'completed',
          result: { ...translatorResult(), originalAudio: { ...translatorResult().originalAudio, segments: [translatorSegment({ fallback: true, audio_path: '/srv/tts/x.wav' })] } },
        })
      ),
    }), 'GET');

    expect(res.json().data.result.originalAudio.segments).toEqual([translatorSegment()]);
  });

  it('la traduction synchrone sert le même résultat fidèle', async () => {
    const translateSync = jest.fn<(userId: string, options: unknown) => Promise<unknown>>().mockResolvedValue(translatorResult());
    const app = await buildApp(makeJobService({ translateSync }));
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { audioBase64: 'UklGRg==', targetLanguages: ['en'], generateVoiceClone: false },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const { result } = res.json().data;
    expect(result.voiceProfile).toBeNull();
    expect(result.translations[0].audioUrl).toBeNull();
    expect(result.originalAudio.segments).toHaveLength(2);
  });

  it('les null du traducteur restent null — confiance, langue, segment non final, profil sans identifiant', async () => {
    const withNulls = {
      ...translatorResult(),
      originalAudio: {
        ...translatorResult().originalAudio,
        confidence: null,
        speakerCount: null,
        segments: [translatorSegment({ isFinal: null, translatedText: null, language: null })],
      },
      voiceProfile: { profileId: null, quality: 0.8, isNew: false },
    };
    const res = await call(makeJobService({
      getJobStatus: jest.fn<(userId: string, jobId: string) => Promise<unknown>>().mockResolvedValue(
        servedTranslatorJob({ status: 'completed', result: withNulls })
      ),
    }), 'GET');

    const { originalAudio, voiceProfile } = res.json().data.result;
    expect({
      confidence: originalAudio.confidence,
      speakerCount: originalAudio.speakerCount,
      isFinal: originalAudio.segments[0].isFinal,
      translatedText: originalAudio.segments[0].translatedText,
      language: originalAudio.segments[0].language,
      profileId: voiceProfile.profileId,
    }).toEqual({ confidence: null, speakerCount: null, isFinal: null, translatedText: null, language: null, profileId: null });
  });

  it('`translatedAudios` de la traduction synchrone ne porte ni chemin serveur ni clé interne', async () => {
    const leaky = {
      ...translatorResult(),
      translations: [{
        ...translatorResult().translations[0],
        audio_path: '/srv/tts/en.wav',
        segments: [translatorSegment({ text: 'Hello everyone', language: 'en', fallback: true, audio_path: '/srv/tts/seg.wav' })],
      }],
    };
    const translateSync = jest.fn<(userId: string, options: unknown) => Promise<unknown>>().mockResolvedValue(leaky);
    const app = await buildApp(makeJobService({ translateSync }));
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { audioBase64: 'UklGRg==', targetLanguages: ['en'], generateVoiceClone: false },
    });
    await app.close();

    const { translatedAudios } = res.json().data;
    expect(JSON.stringify(translatedAudios)).not.toMatch(/audio_path|fallback|\/srv\/tts/);
    expect(translatedAudios).toEqual([{
      ...translatorResult().translations[0],
      segments: [translatorSegment({ text: 'Hello everyone', language: 'en' })],
    }]);
  });
});
