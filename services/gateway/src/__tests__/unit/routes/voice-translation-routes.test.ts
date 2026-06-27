/**
 * voice-translation-routes.test.ts
 *
 * Unit tests for src/routes/voice/translation.ts
 * Covers:
 *   - POST /voice/translate        (sync audio or attachment)
 *   - POST /voice/translate/async  (async job)
 *   - GET  /voice/job/:jobId       (job status)
 *   - DELETE /voice/job/:jobId     (cancel job)
 *   - POST /voice/transcribe       (JSON path: audioBase64 and attachmentId)
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

const mockGetUserId = jest.fn<any>();

jest.mock('../../../routes/voice/types', () => ({
  getUserId:                   (...args: any[]) => mockGetUserId(...args),
  voiceTranslationResultSchema: { type: 'object', additionalProperties: true },
  translationJobSchema:         { type: 'object', additionalProperties: true },
  errorResponseSchema:          { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

class MockAudioTranslateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AudioTranslateError';
  }
}

jest.mock('../../../services/AudioTranslateService', () => ({
  AudioTranslateError: MockAudioTranslateError,
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerTranslationRoutes } from '../../../routes/voice/translation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID       = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = '507f1f77bcf86cd799439099';
const JOB_ID        = 'job-abc-123';
const PREFIX        = '/voice';

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockTranslateSync     = jest.fn<any>();
const mockTranslateAsync    = jest.fn<any>();
const mockGetJobStatus      = jest.fn<any>();
const mockCancelJob         = jest.fn<any>();
const mockTranscribeOnly    = jest.fn<any>();

const mockAudioService: any = {
  translateSync:  (...args: any[]) => mockTranslateSync(...args),
  translateAsync: (...args: any[]) => mockTranslateAsync(...args),
  getJobStatus:   (...args: any[]) => mockGetJobStatus(...args),
  cancelJob:      (...args: any[]) => mockCancelJob(...args),
  transcribeOnly: (...args: any[]) => mockTranscribeOnly(...args),
};

const mockGetAttachment    = jest.fn<any>();
const mockTranslateAttach  = jest.fn<any>();
const mockTranscribeAttach = jest.fn<any>();

const mockTranslationService: any = {
  getAttachmentWithTranscription: (...args: any[]) => mockGetAttachment(...args),
  translateAttachment:            (...args: any[]) => mockTranslateAttach(...args),
  transcribeAttachment:           (...args: any[]) => mockTranscribeAttach(...args),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(withTranslationService = true): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  registerTranslationRoutes(
    app,
    mockAudioService,
    withTranslationService ? mockTranslationService : undefined,
    PREFIX
  );
  return app;
}

function makeSyncResult(overrides: any = {}) {
  return {
    originalAudio: {
      transcription: 'Hello world',
      language: 'en',
      confidence: 0.95,
      durationMs: 3000,
    },
    translations: [
      { language: 'fr', audioBase64: 'base64data', duration: 3000 },
    ],
    ...overrides,
  };
}

function makeJobResult(overrides: any = {}) {
  return {
    jobId: JOB_ID,
    status: 'pending',
    ...overrides,
  };
}

function makeAttachmentData(overrides: any = {}) {
  return {
    attachment: { id: ATTACHMENT_ID, fileName: 'audio.ogg', fileUrl: 'http://example.com/audio.ogg' },
    transcription: null,
    translatedAudios: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /voice/translate
// ---------------------------------------------------------------------------

describe('POST /voice/translate', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTranslateSync.mockReset();
    mockGetAttachment.mockReset();
    mockTranslateAttach.mockReset();
    app = buildApp();
    mockGetUserId.mockReturnValue(USER_ID);
  });

  afterEach(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    mockGetUserId.mockReturnValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'abc', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when neither audioBase64 nor attachmentId provided', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when targetLanguages is missing', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when targetLanguages is empty array', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'abc', targetLanguages: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 with completed status when audioBase64 provided', async () => {
    mockTranslateSync.mockResolvedValue(makeSyncResult());
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'abc123', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
    expect(body.data.taskId).toBeNull();
  });

  it('includes transcription in response when originalAudio present', async () => {
    mockTranslateSync.mockResolvedValue(makeSyncResult());
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'abc123', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.transcription).not.toBeNull();
  });

  it('calls translateSync with userId and all params', async () => {
    mockTranslateSync.mockResolvedValue(makeSyncResult());
    await app.ready();
    await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'myaudio', targetLanguages: ['es', 'de'], sourceLanguage: 'en' },
    });
    expect(mockTranslateSync).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      audioBase64: 'myaudio',
      targetLanguages: ['es', 'de'],
      sourceLanguage: 'en',
    }));
  });

  it('returns 500 when attachmentId used but translationService is undefined', async () => {
    const appWithout = buildApp(false);
    await appWithout.ready();
    const res = await appWithout.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { attachmentId: ATTACHMENT_ID, targetLanguages: ['fr'] },
    });
    await appWithout.close();
    expect(res.statusCode).toBe(500);
  });

  it('returns 404 when attachment not found', async () => {
    mockGetAttachment.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { attachmentId: ATTACHMENT_ID, targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with completed status when attachment already has translations', async () => {
    mockGetAttachment.mockResolvedValue(makeAttachmentData({
      translatedAudios: [{ language: 'fr', url: 'http://example.com/fr.ogg' }],
    }));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { attachmentId: ATTACHMENT_ID, targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('completed');
    expect(body.data.taskId).toBeNull();
  });

  it('returns 200 with processing status when translation started', async () => {
    mockGetAttachment.mockResolvedValue(makeAttachmentData());
    mockTranslateAttach.mockResolvedValue({ taskId: 'task-1', attachment: { id: ATTACHMENT_ID } });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { attachmentId: ATTACHMENT_ID, targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('processing');
    expect(body.data.taskId).toBe('task-1');
  });

  it('returns 500 when translateAttachment returns null', async () => {
    mockGetAttachment.mockResolvedValue(makeAttachmentData());
    mockTranslateAttach.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { attachmentId: ATTACHMENT_ID, targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 on unexpected error from translateSync', async () => {
    mockTranslateSync.mockRejectedValue(new Error('ZMQ timeout'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'abc', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /voice/translate/async
// ---------------------------------------------------------------------------

describe('POST /voice/translate/async', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTranslateAsync.mockReset();
    mockTranslateAttach.mockReset();
    app = buildApp();
    mockGetUserId.mockReturnValue(USER_ID);
  });

  afterEach(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    mockGetUserId.mockReturnValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'abc', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when neither input provided', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when targetLanguages missing', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 202 with jobId when audioBase64 provided', async () => {
    mockTranslateAsync.mockResolvedValue(makeJobResult({ status: 'pending' }));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'abc', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe(JOB_ID);
    expect(body.data.taskId).toBe(JOB_ID);
  });

  it('calls translateAsync with userId and all options', async () => {
    mockTranslateAsync.mockResolvedValue(makeJobResult());
    await app.ready();
    await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: {
        audioBase64: 'myaudio',
        targetLanguages: ['fr'],
        priority: 5,
        webhookUrl: 'https://example.com/cb',
        callbackMetadata: { ref: 'abc' },
      },
    });
    expect(mockTranslateAsync).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      audioBase64: 'myaudio',
      targetLanguages: ['fr'],
      priority: 5,
      webhookUrl: 'https://example.com/cb',
      callbackMetadata: { ref: 'abc' },
    }));
  });

  it('returns 500 when attachmentId used and translationService is undefined', async () => {
    const appWithout = buildApp(false);
    await appWithout.ready();
    const res = await appWithout.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { attachmentId: ATTACHMENT_ID, targetLanguages: ['fr'] },
    });
    await appWithout.close();
    expect(res.statusCode).toBe(500);
  });

  it('returns 202 with taskId when attachmentId provided and translation started', async () => {
    mockTranslateAttach.mockResolvedValue({ taskId: 'task-async-1', attachment: { id: ATTACHMENT_ID } });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { attachmentId: ATTACHMENT_ID, targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.data.jobId).toBe('task-async-1');
    expect(body.data.status).toBe('processing');
  });

  it('returns 500 when translateAttachment returns null', async () => {
    mockTranslateAttach.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { attachmentId: ATTACHMENT_ID, targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 on unexpected error', async () => {
    mockTranslateAsync.mockRejectedValue(new Error('Service down'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'abc', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /voice/job/:jobId
// ---------------------------------------------------------------------------

describe('GET /voice/job/:jobId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetJobStatus.mockReset();
    app = buildApp();
    mockGetUserId.mockReturnValue(USER_ID);
    mockGetJobStatus.mockResolvedValue({ jobId: JOB_ID, status: 'processing' });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with job status', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe(JOB_ID);
    expect(body.data.status).toBe('processing');
  });

  it('calls getJobStatus with userId and jobId', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: `${PREFIX}/job/${JOB_ID}` });
    expect(mockGetJobStatus).toHaveBeenCalledWith(USER_ID, JOB_ID);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUserId.mockReturnValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetJobStatus.mockReset();
    mockGetJobStatus.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /voice/job/:jobId
// ---------------------------------------------------------------------------

describe('DELETE /voice/job/:jobId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCancelJob.mockReset();
    app = buildApp();
    mockGetUserId.mockReturnValue(USER_ID);
    mockCancelJob.mockResolvedValue({ jobId: JOB_ID, status: 'cancelled' });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with cancelled status', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBe(JOB_ID);
    expect(body.data.status).toBe('cancelled');
  });

  it('calls cancelJob with userId and jobId', async () => {
    await app.ready();
    await app.inject({ method: 'DELETE', url: `${PREFIX}/job/${JOB_ID}` });
    expect(mockCancelJob).toHaveBeenCalledWith(USER_ID, JOB_ID);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUserId.mockReturnValue(null);
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockCancelJob.mockReset();
    mockCancelJob.mockRejectedValue(new Error('Cannot cancel'));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /voice/transcribe (JSON path only)
// ---------------------------------------------------------------------------

describe('POST /voice/transcribe', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTranscribeOnly.mockReset();
    mockGetAttachment.mockReset();
    mockTranscribeAttach.mockReset();
    app = buildApp();
    mockGetUserId.mockReturnValue(USER_ID);
  });

  afterEach(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    mockGetUserId.mockReturnValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'abc', audioFormat: 'webm' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when neither audioBase64 nor attachmentId provided', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when audioBase64 provided without audioFormat', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'abc123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 with completed transcription when audioBase64 and audioFormat provided', async () => {
    mockTranscribeOnly.mockResolvedValue({
      text: 'Hello world', language: 'en', confidence: 0.95,
      source: 'whisper', segments: [], durationMs: 2000,
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'abc123', audioFormat: 'webm' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
    expect(body.data.taskId).toBeNull();
    expect(body.data.transcription.text).toBe('Hello world');
  });

  it('calls transcribeOnly with userId and all params', async () => {
    mockTranscribeOnly.mockResolvedValue({
      text: 'Bonjour', language: 'fr', confidence: 0.9,
      source: 'whisper', segments: [], durationMs: 1500,
    });
    await app.ready();
    await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'xyz', audioFormat: 'mp3', language: 'fr' },
    });
    expect(mockTranscribeOnly).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      audioBase64: 'xyz',
      audioFormat: 'mp3',
      language: 'fr',
      saveToDatabase: false,
    }));
  });

  it('returns 500 when attachmentId provided and translationService is undefined', async () => {
    const appWithout = buildApp(false);
    await appWithout.ready();
    const res = await appWithout.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { attachmentId: ATTACHMENT_ID },
    });
    await appWithout.close();
    expect(res.statusCode).toBe(500);
  });

  it('returns 404 when attachment not found', async () => {
    mockGetAttachment.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { attachmentId: ATTACHMENT_ID },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with existing transcription when already transcribed', async () => {
    mockGetAttachment.mockResolvedValue(makeAttachmentData({
      transcription: { text: 'Existing text', language: 'en', confidence: 0.9, source: 'whisper', segments: [] },
    }));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { attachmentId: ATTACHMENT_ID },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('completed');
    expect(body.data.transcription.text).toBe('Existing text');
  });

  it('returns 200 with processing status when transcription started', async () => {
    mockGetAttachment.mockResolvedValue(makeAttachmentData());
    mockTranscribeAttach.mockResolvedValue({ taskId: 'task-t-1', attachment: { id: ATTACHMENT_ID } });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { attachmentId: ATTACHMENT_ID },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('processing');
    expect(body.data.taskId).toBe('task-t-1');
  });

  it('returns 500 when transcribeAttachment returns null', async () => {
    mockGetAttachment.mockResolvedValue(makeAttachmentData());
    mockTranscribeAttach.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { attachmentId: ATTACHMENT_ID },
    });
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 on unexpected error', async () => {
    mockTranscribeOnly.mockRejectedValue(new Error('Whisper timeout'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'abc', audioFormat: 'mp3' },
    });
    expect(res.statusCode).toBe(500);
  });
});
