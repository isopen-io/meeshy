/**
 * Unit tests for Voice Translation Routes
 *
 * Tests all routes registered by registerTranslationRoutes():
 *   POST   /api/v1/voice/translate        – sync translation
 *   POST   /api/v1/voice/translate/async  – async translation
 *   GET    /api/v1/voice/job/:jobId       – get job status
 *   DELETE /api/v1/voice/job/:jobId       – cancel job
 *   POST   /api/v1/voice/transcribe       – transcription
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Module mocks (must be declared before imports) ──────────────────────────

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

// Mock the voice/types module to avoid complex schema deps that pull in shared types
jest.mock('../../../routes/voice/types', () => ({
  getUserId: jest.fn((request: any) => {
    if (request.user?.userId) return request.user.userId;
    const headerUserId = request.headers?.['x-user-id'];
    if (typeof headerUserId === 'string') return headerUserId;
    return null;
  }),
  voiceTranslationResultSchema: {
    type: 'object',
    properties: {
      translationId: { type: 'string' },
      originalAudio: { type: 'object' },
      translations: { type: 'array' },
    },
  },
  translationJobSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'string' },
      status: { type: 'string' },
      progress: { type: 'number' },
    },
  },
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

// ─── Imports under test ───────────────────────────────────────────────────────

import { registerTranslationRoutes } from '../../../routes/voice/translation';
import { AudioTranslateError } from '../../../services/AudioTranslateService';

// ─── Constants ────────────────────────────────────────────────────────────────

const PREFIX = '/api/v1/voice';

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeAudioService(overrides: Record<string, any> = {}) {
  return {
    translateSync: jest.fn<any>().mockResolvedValue({
      originalAudio: {
        transcription: 'hello',
        language: 'en',
        confidence: 0.99,
        durationMs: 1000,
      },
      translations: [],
    }),
    translateAsync: jest.fn<any>().mockResolvedValue({
      jobId: 'job-123',
      status: 'pending',
    }),
    getJobStatus: jest.fn<any>().mockResolvedValue({
      jobId: 'job-123',
      status: 'completed',
    }),
    cancelJob: jest.fn<any>().mockResolvedValue({
      jobId: 'job-123',
      status: 'cancelled',
    }),
    transcribeOnly: jest.fn<any>().mockResolvedValue({
      text: 'hello',
      language: 'en',
      confidence: 0.99,
      source: 'whisper',
      segments: [],
      durationMs: 1000,
    }),
    ...overrides,
  };
}

function makeTranslationService(overrides: Record<string, any> = {}) {
  return {
    getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({
      attachment: { id: 'att-1' },
      transcription: null,
      translatedAudios: [],
    }),
    translateAttachment: jest.fn<any>().mockResolvedValue({
      taskId: 'task-1',
      attachment: { id: 'att-1' },
    }),
    transcribeAttachment: jest.fn<any>().mockResolvedValue({
      taskId: 'task-1',
      attachment: { id: 'att-1' },
    }),
    ...overrides,
  };
}

type AppOptions = {
  audioService?: ReturnType<typeof makeAudioService>;
  translationService?: ReturnType<typeof makeTranslationService> | null;
};

async function buildApp(opts: AppOptions = {}) {
  const audioService = opts.audioService ?? makeAudioService();
  // Use null as sentinel for "no translation service" to avoid default param override
  const translationService = Object.prototype.hasOwnProperty.call(opts, 'translationService')
    ? opts.translationService
    : makeTranslationService();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  // Inject a user so getUserId() returns a value
  app.addHook('preHandler', async (req) => {
    (req as any).user = { userId: 'user-1', role: 'user' };
  });
  registerTranslationRoutes(app, audioService as any, translationService as any, PREFIX);
  await app.ready();
  return app;
}

async function buildAppNoAuth(opts: AppOptions = {}) {
  const audioService = opts.audioService ?? makeAudioService();
  const translationService = Object.prototype.hasOwnProperty.call(opts, 'translationService')
    ? opts.translationService
    : makeTranslationService();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  // No user injected → getUserId() returns null
  registerTranslationRoutes(app, audioService as any, translationService as any, PREFIX);
  await app.ready();
  return app;
}

// ─── POST /translate ──────────────────────────────────────────────────────────

describe('POST /api/v1/voice/translate', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 with audioBase64 → calls translateSync', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: {
        audioBase64: 'dGVzdA==',
        targetLanguages: ['fr'],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
    expect(body.data.taskId).toBeNull();
    expect(body.data.translatedAudios).toEqual([]);
  });

  it('returns 400 when neither audioBase64 nor attachmentId provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { targetLanguages: ['fr'] },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when targetLanguages is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: [] },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when targetLanguages is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { audioBase64: 'dGVzdA==' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 500 with error.code when AudioTranslateError thrown', async () => {
    const audioSvc = makeAudioService({
      translateSync: jest.fn<any>().mockRejectedValue(
        new AudioTranslateError('Voice clone failed', 'VOICE_CLONE_FAILED')
      ),
    });
    const errApp = await buildApp({ audioService: audioSvc });

    const res = await errApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['fr'] },
    });

    await errApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('VOICE_CLONE_FAILED');
  });

  it('returns 500 with INTERNAL_ERROR when generic Error thrown', async () => {
    const audioSvc = makeAudioService({
      translateSync: jest.fn<any>().mockRejectedValue(new Error('unexpected')),
    });
    const errApp = await buildApp({ audioService: audioSvc });

    const res = await errApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['fr'] },
    });

    await errApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('returns 500 when attachmentId used but translationService is undefined', async () => {
    const noSvcApp = await buildApp({ translationService: null });

    const res = await noSvcApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-abc', targetLanguages: ['fr'] },
    });

    await noSvcApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when getAttachmentWithTranscription returns null', async () => {
    const translSvc = makeTranslationService({
      getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue(null),
    });
    const nullApp = await buildApp({ translationService: translSvc });

    const res = await nullApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-missing', targetLanguages: ['fr'] },
    });

    await nullApp.close();
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 200 with cached translatedAudios when they already exist', async () => {
    const translSvc = makeTranslationService({
      getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({
        attachment: { id: 'att-1' },
        transcription: { text: 'bonjour', language: 'fr' },
        translatedAudios: [{ language: 'en', audioUrl: 'http://example.com/audio.mp3' }],
      }),
    });
    const cachedApp = await buildApp({ translationService: translSvc });

    const res = await cachedApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-1', targetLanguages: ['en'] },
    });

    await cachedApp.close();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
  });

  it('returns 200 and starts translation when no translatedAudios cached', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-1', targetLanguages: ['en'] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('processing');
    expect(body.data.taskId).toBe('task-1');
  });

  it('returns 500 when translateAttachment returns null', async () => {
    const translSvc = makeTranslationService({
      translateAttachment: jest.fn<any>().mockResolvedValue(null),
    });
    const nullResultApp = await buildApp({ translationService: translSvc });

    const res = await nullResultApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-1', targetLanguages: ['fr'] },
    });

    await nullResultApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
  });
});

// ─── POST /translate (unauthorized) ──────────────────────────────────────────

describe('POST /api/v1/voice/translate — unauthorized', () => {
  it('returns 401 when no user is present', async () => {
    const noAuthApp = await buildAppNoAuth();

    const res = await noAuthApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['fr'] },
    });

    await noAuthApp.close();
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
  });
});

// ─── POST /translate/async ────────────────────────────────────────────────────

describe('POST /api/v1/voice/translate/async', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 202 with audioBase64 → calls translateAsync', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate/async`,
      payload: {
        audioBase64: 'dGVzdA==',
        targetLanguages: ['fr'],
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe('job-123');
    expect(body.data.status).toBe('pending');
    expect(body.data.attachment).toBeNull();
  });

  it('returns 400 when neither audioBase64 nor attachmentId provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate/async`,
      payload: { targetLanguages: ['fr'] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when targetLanguages is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when attachmentId used but translationService is undefined', async () => {
    const noSvcApp = await buildApp({ translationService: null });

    const res = await noSvcApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate/async`,
      payload: { attachmentId: 'att-abc', targetLanguages: ['fr'] },
    });

    await noSvcApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 202 with attachmentId when translationService is available', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate/async`,
      payload: { attachmentId: 'att-1', targetLanguages: ['en'] },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.taskId).toBe('task-1');
    expect(body.data.status).toBe('processing');
  });

  it('returns 500 when translateAttachment returns null for async', async () => {
    const translSvc = makeTranslationService({
      translateAttachment: jest.fn<any>().mockResolvedValue(null),
    });
    const nullResultApp = await buildApp({ translationService: translSvc });

    const res = await nullResultApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate/async`,
      payload: { attachmentId: 'att-1', targetLanguages: ['fr'] },
    });

    await nullResultApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when no user is present', async () => {
    const noAuthApp = await buildAppNoAuth();

    const res = await noAuthApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['fr'] },
    });

    await noAuthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 with error.code when AudioTranslateError thrown in async', async () => {
    const audioSvc = makeAudioService({
      translateAsync: jest.fn<any>().mockRejectedValue(
        new AudioTranslateError('Async failed', 'ASYNC_FAILED')
      ),
    });
    const errApp = await buildApp({ audioService: audioSvc });

    const res = await errApp.inject({
      method: 'POST',
      url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['fr'] },
    });

    await errApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe('ASYNC_FAILED');
  });
});

// ─── GET /job/:jobId ──────────────────────────────────────────────────────────

describe('GET /api/v1/voice/job/:jobId', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 with job status on success', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${PREFIX}/job/job-123`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe('job-123');
    expect(body.data.status).toBe('completed');
  });

  it('returns 500 when getJobStatus throws', async () => {
    const audioSvc = makeAudioService({
      getJobStatus: jest.fn<any>().mockRejectedValue(new Error('DB error')),
    });
    const errApp = await buildApp({ audioService: audioSvc });

    const res = await errApp.inject({
      method: 'GET',
      url: `${PREFIX}/job/job-bad`,
    });

    await errApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 500 with error.code when AudioTranslateError thrown', async () => {
    const audioSvc = makeAudioService({
      getJobStatus: jest.fn<any>().mockRejectedValue(
        new AudioTranslateError('Job not found', 'JOB_NOT_FOUND')
      ),
    });
    const errApp = await buildApp({ audioService: audioSvc });

    const res = await errApp.inject({
      method: 'GET',
      url: `${PREFIX}/job/job-bad`,
    });

    await errApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe('JOB_NOT_FOUND');
  });

  it('returns 401 when no user is present', async () => {
    const noAuthApp = await buildAppNoAuth();

    const res = await noAuthApp.inject({
      method: 'GET',
      url: `${PREFIX}/job/job-123`,
    });

    await noAuthApp.close();
    expect(res.statusCode).toBe(401);
  });
});

// ─── DELETE /job/:jobId ───────────────────────────────────────────────────────

describe('DELETE /api/v1/voice/job/:jobId', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 when job successfully cancelled', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `${PREFIX}/job/job-123`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe('job-123');
    expect(body.data.status).toBe('cancelled');
  });

  it('returns 500 when cancelJob throws', async () => {
    const audioSvc = makeAudioService({
      cancelJob: jest.fn<any>().mockRejectedValue(new Error('cancel failed')),
    });
    const errApp = await buildApp({ audioService: audioSvc });

    const res = await errApp.inject({
      method: 'DELETE',
      url: `${PREFIX}/job/job-bad`,
    });

    await errApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('returns 500 with error.code when AudioTranslateError thrown during cancel', async () => {
    const audioSvc = makeAudioService({
      cancelJob: jest.fn<any>().mockRejectedValue(
        new AudioTranslateError('Cannot cancel completed job', 'CANNOT_CANCEL')
      ),
    });
    const errApp = await buildApp({ audioService: audioSvc });

    const res = await errApp.inject({
      method: 'DELETE',
      url: `${PREFIX}/job/job-done`,
    });

    await errApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe('CANNOT_CANCEL');
  });

  it('returns 401 when no user is present', async () => {
    const noAuthApp = await buildAppNoAuth();

    const res = await noAuthApp.inject({
      method: 'DELETE',
      url: `${PREFIX}/job/job-123`,
    });

    await noAuthApp.close();
    expect(res.statusCode).toBe(401);
  });
});

// ─── POST /transcribe ─────────────────────────────────────────────────────────

describe('POST /api/v1/voice/transcribe — audioBase64', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());

  it('returns 200 with audioBase64 + audioFormat → calls transcribeOnly', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: {
        audioBase64: 'dGVzdA==',
        audioFormat: 'wav',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
    expect(body.data.taskId).toBeNull();
    expect(body.data.transcription.text).toBe('hello');
    expect(body.data.transcription.language).toBe('en');
  });

  it('returns 400 when audioBase64 is provided without audioFormat', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: {
        audioBase64: 'dGVzdA==',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when neither audioBase64, file, nor attachmentId is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 500 with AudioTranslateError code when transcribeOnly throws', async () => {
    const audioSvc = makeAudioService({
      transcribeOnly: jest.fn<any>().mockRejectedValue(
        new AudioTranslateError('Transcription failed', 'TRANSCRIPTION_ERROR')
      ),
    });
    const errApp = await buildApp({ audioService: audioSvc });

    const res = await errApp.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'dGVzdA==', audioFormat: 'wav' },
    });

    await errApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe('TRANSCRIPTION_ERROR');
  });

  it('returns 500 with INTERNAL_ERROR when generic Error thrown in transcribeOnly', async () => {
    const audioSvc = makeAudioService({
      transcribeOnly: jest.fn<any>().mockRejectedValue(new Error('whisper crash')),
    });
    const errApp = await buildApp({ audioService: audioSvc });

    const res = await errApp.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'dGVzdA==', audioFormat: 'mp3' },
    });

    await errApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('returns 401 when no user is present', async () => {
    const noAuthApp = await buildAppNoAuth();

    const res = await noAuthApp.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'dGVzdA==', audioFormat: 'wav' },
    });

    await noAuthApp.close();
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/voice/transcribe — attachmentId', () => {
  it('returns 500 when attachmentId used but translationService is undefined', async () => {
    const noSvcApp = await buildApp({ translationService: null });

    const res = await noSvcApp.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: { attachmentId: 'att-abc' },
    });

    await noSvcApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when getAttachmentWithTranscription returns null', async () => {
    const translSvc = makeTranslationService({
      getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue(null),
    });
    const nullApp = await buildApp({ translationService: translSvc });

    const res = await nullApp.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: { attachmentId: 'att-missing' },
    });

    await nullApp.close();
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
  });

  it('returns 200 with cached transcription when it already exists', async () => {
    const translSvc = makeTranslationService({
      getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({
        attachment: { id: 'att-1' },
        transcription: {
          text: 'bonjour',
          language: 'fr',
          confidence: 0.95,
          source: 'whisper',
          segments: [],
          durationMs: 2000,
        },
        translatedAudios: [],
      }),
    });
    const cachedApp = await buildApp({ translationService: translSvc });

    const res = await cachedApp.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: { attachmentId: 'att-1' },
    });

    await cachedApp.close();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
    expect(body.data.transcription.text).toBe('bonjour');
  });

  it('returns 200 with status=processing when transcription starts', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: { attachmentId: 'att-1' },
    });

    await app.close();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('processing');
    expect(body.data.taskId).toBe('task-1');
  });

  it('returns 500 when transcribeAttachment returns null', async () => {
    const translSvc = makeTranslationService({
      transcribeAttachment: jest.fn<any>().mockResolvedValue(null),
    });
    const nullResultApp = await buildApp({ translationService: translSvc });

    const res = await nullResultApp.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: { attachmentId: 'att-1' },
    });

    await nullResultApp.close();
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
  });
});
