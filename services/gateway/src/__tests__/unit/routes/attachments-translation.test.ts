/**
 * Route tests — POST /attachments/:attachmentId/translate
 *                POST /attachments/:attachmentId/transcribe
 *
 * Coverage target: >85% of src/routes/attachments/translation.ts
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Top-level mock variables (must be declared before jest.mock) ─────────────

const mockGetConsentStatus = jest.fn<any>();

// ─── jest.mock calls (hoisted by Jest) ───────────────────────────────────────

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

jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    getConsentStatus: (...args: any[]) => mockGetConsentStatus(...args),
  })),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  messageAttachmentSchema: {
    type: 'object',
    properties: {},
    additionalProperties: true,
  },
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
}));

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

// ─── Default stubs ────────────────────────────────────────────────────────────

const DEFAULT_CONSENT = {
  canTranscribeAudio: true,
  canTranslateAudio: true,
  canUseVoiceCloning: true,
  canTranslateText: true,
  canGenerateTranslatedAudio: true,
};

const DEFAULT_ATTACHMENT = {
  id: ATTACHMENT_ID,
  mimeType: 'audio/mp4',
  uploadedBy: USER_ID,
};

const DEFAULT_ATTACHMENT_TRANSLATE = {
  mimeType: 'audio/mp4',
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

type PrismaOpts = {
  attachment?: typeof DEFAULT_ATTACHMENT | typeof DEFAULT_ATTACHMENT_TRANSLATE | null | Error;
};

function makePrisma(opts: PrismaOpts = {}) {
  const attachmentValue = opts.attachment === undefined ? DEFAULT_ATTACHMENT : opts.attachment;
  return {
    messageAttachment: {
      findUnique:
        attachmentValue instanceof Error
          ? jest.fn<any>().mockRejectedValue(attachmentValue)
          : jest.fn<any>().mockResolvedValue(attachmentValue),
    },
  };
}

// ─── Service factories ────────────────────────────────────────────────────────

function makeTranslateService(overrides: Partial<{ translate: any }> = {}) {
  return {
    translate:
      overrides.translate ??
      jest.fn<any>().mockResolvedValue({
        success: true,
        data: { status: 'completed', translations: [] },
      }),
  };
}

function makeTranslationService(overrides: Partial<{ getAttachmentWithTranscription: any; transcribeAttachment: any }> = {}) {
  return {
    getAttachmentWithTranscription:
      overrides.getAttachmentWithTranscription ??
      jest.fn<any>().mockResolvedValue({
        attachment: { id: ATTACHMENT_ID, messageId: 'msg1', fileName: 'test.mp4', fileUrl: '/f', mimeType: 'audio/mp4', duration: 5 },
        transcription: null,
        translatedAudios: [],
      }),
    transcribeAttachment:
      overrides.transcribeAttachment ??
      jest.fn<any>().mockResolvedValue({
        taskId: 'task-123',
        attachment: { id: ATTACHMENT_ID, messageId: 'msg1', fileName: 'test.mp4', fileUrl: '/f', mimeType: 'audio/mp4', duration: 5 },
      }),
  };
}

// ─── App builder ──────────────────────────────────────────────────────────────

type AppOpts = {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
  translateService?: ReturnType<typeof makeTranslateService> | null;
  translationService?: ReturnType<typeof makeTranslationService> | null | undefined;
};

async function buildApp(opts: AppOpts = {}): Promise<FastifyInstance> {
  const {
    auth = 'authenticated',
    prisma = makePrisma(),
    translateService = makeTranslateService(),
    translationService = makeTranslationService(),
  } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', prisma as unknown);

  // Only decorate translationService when it is not explicitly `undefined`
  // (passing `null` means "decorate with null" = service unavailable)
  if (translationService !== undefined) {
    app.decorate('translationService', translationService as unknown);
  }

  const authRequired = async (req: any) => {
    if (auth === 'authenticated') {
      req.authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: { id: USER_ID },
      };
    } else {
      req.authContext = null;
    }
  };

  const { registerTranslationRoutes } = await import('../../../routes/attachments/translation');
  await registerTranslationRoutes(app, authRequired, prisma as any, translateService as any);
  await app.ready();
  return app;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function translateBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    targetLanguages: ['en', 'fr'],
    ...overrides,
  });
}

function transcribeBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify(overrides);
}

async function injectTranslate(app: FastifyInstance, body?: string) {
  return app.inject({
    method: 'POST',
    url: `/attachments/${ATTACHMENT_ID}/translate`,
    headers: { 'content-type': 'application/json' },
    body: body ?? translateBody(),
  });
}

async function injectTranscribe(app: FastifyInstance, body?: string) {
  return app.inject({
    method: 'POST',
    url: `/attachments/${ATTACHMENT_ID}/transcribe`,
    headers: { 'content-type': 'application/json' },
    body: body ?? transcribeBody(),
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConsentStatus.mockResolvedValue({ ...DEFAULT_CONSENT });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /attachments/:attachmentId/translate
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /attachments/:attachmentId/translate', () => {
  it('returns 503 when translateService is null', async () => {
    const app = await buildApp({ translateService: null });
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('SERVICE_UNAVAILABLE');
    await app.close();
  });

  it('returns 401 when not authenticated', async () => {
    const app = await buildApp({ auth: 'unauthenticated' });
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 404 when attachment not found', async () => {
    const app = await buildApp({
      prisma: makePrisma({ attachment: null }),
    });
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });

  it('returns 403 when canTranscribeAudio is false for audio attachment', async () => {
    mockGetConsentStatus.mockResolvedValue({ ...DEFAULT_CONSENT, canTranscribeAudio: false });
    const app = await buildApp();
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('AUDIO_TRANSCRIPTION_NOT_ENABLED');
    await app.close();
  });

  it('returns 403 when canTranslateAudio is false for audio attachment', async () => {
    mockGetConsentStatus.mockResolvedValue({ ...DEFAULT_CONSENT, canTranslateAudio: false });
    const app = await buildApp();
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('AUDIO_TRANSLATION_NOT_ENABLED');
    await app.close();
  });

  it('returns 403 when generateVoiceClone requested but canUseVoiceCloning is false', async () => {
    mockGetConsentStatus.mockResolvedValue({ ...DEFAULT_CONSENT, canUseVoiceCloning: false });
    const app = await buildApp();
    const res = await injectTranslate(app, translateBody({ generateVoiceClone: true }));
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('VOICE_CLONING_NOT_ENABLED');
    await app.close();
  });

  it('returns 200 on successful translation', async () => {
    const app = await buildApp();
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    await app.close();
  });

  it('does NOT check voice cloning consent when generateVoiceClone is false', async () => {
    mockGetConsentStatus.mockResolvedValue({ ...DEFAULT_CONSENT, canUseVoiceCloning: false });
    const app = await buildApp();
    const res = await injectTranslate(app, translateBody({ generateVoiceClone: false }));
    // Should NOT return 403 for voice cloning — may proceed to translate
    expect(res.statusCode).not.toBe(403);
    await app.close();
  });

  it('skips audio consent checks for non-audio attachments', async () => {
    // Non-audio mime type: consent checks for audio should be skipped entirely
    mockGetConsentStatus.mockResolvedValue({ ...DEFAULT_CONSENT, canTranscribeAudio: false, canTranslateAudio: false });
    const app = await buildApp({
      prisma: makePrisma({ attachment: { mimeType: 'image/jpeg' } }),
    });
    const res = await injectTranslate(app);
    // Should not get 403 for audio consent; service returns 200 or service-specific response
    expect([200, 400, 404, 501]).toContain(res.statusCode);
    await app.close();
  });

  it('maps ATTACHMENT_NOT_FOUND errorCode from service to 404', async () => {
    const app = await buildApp({
      translateService: makeTranslateService({
        translate: jest.fn<any>().mockResolvedValue({
          success: false,
          error: 'Attachment not found',
          errorCode: 'ATTACHMENT_NOT_FOUND',
        }),
      }),
    });
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('maps ACCESS_DENIED errorCode from service to 403', async () => {
    const app = await buildApp({
      translateService: makeTranslateService({
        translate: jest.fn<any>().mockResolvedValue({
          success: false,
          error: 'Access denied',
          errorCode: 'ACCESS_DENIED',
        }),
      }),
    });
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('maps NOT_IMPLEMENTED errorCode from service to 501', async () => {
    const app = await buildApp({
      translateService: makeTranslateService({
        translate: jest.fn<any>().mockResolvedValue({
          success: false,
          error: 'Not implemented',
          errorCode: 'NOT_IMPLEMENTED',
        }),
      }),
    });
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(501);
    await app.close();
  });

  it('maps unknown errorCode from service to 400', async () => {
    const app = await buildApp({
      translateService: makeTranslateService({
        translate: jest.fn<any>().mockResolvedValue({
          success: false,
          error: 'Something went wrong',
          errorCode: 'UNKNOWN_ERROR',
        }),
      }),
    });
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 500 when translateService.translate throws', async () => {
    const app = await buildApp({
      translateService: makeTranslateService({
        translate: jest.fn<any>().mockRejectedValue(new Error('Unexpected crash')),
      }),
    });
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });

  it('returns 500 with error message when service throws with message', async () => {
    const app = await buildApp({
      translateService: makeTranslateService({
        translate: jest.fn<any>().mockRejectedValue(new Error('crash message')),
      }),
    });
    const res = await injectTranslate(app);
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /attachments/:attachmentId/transcribe
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /attachments/:attachmentId/transcribe', () => {
  it('returns 503 when translationService is not decorated on fastify', async () => {
    // Build app without decorating translationService at all
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    const prisma = makePrisma();
    const translateService = makeTranslateService();
    app.decorate('prisma', prisma as unknown);
    const authRequired = async (req: any) => {
      req.authContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID } };
    };
    const { registerTranslationRoutes } = await import('../../../routes/attachments/translation');
    await registerTranslationRoutes(app, authRequired, prisma as any, translateService as any);
    await app.ready();

    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error).toBe('SERVICE_UNAVAILABLE');
    await app.close();
  });

  it('returns 503 when translationService is null', async () => {
    const app = await buildApp({ translationService: null });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error).toBe('SERVICE_UNAVAILABLE');
    await app.close();
  });

  it('returns 401 when not authenticated', async () => {
    const app = await buildApp({ auth: 'unauthenticated' });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 404 when attachment not found in prisma', async () => {
    const app = await buildApp({
      prisma: makePrisma({ attachment: null }),
    });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });

  it('returns 400 for non-audio mime type', async () => {
    const app = await buildApp({
      prisma: makePrisma({ attachment: { id: ATTACHMENT_ID, mimeType: 'image/jpeg', uploadedBy: USER_ID } }),
    });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });

  it('returns 400 for document mime type', async () => {
    const app = await buildApp({
      prisma: makePrisma({ attachment: { id: ATTACHMENT_ID, mimeType: 'application/pdf', uploadedBy: USER_ID } }),
    });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when mimeType is null/undefined', async () => {
    const app = await buildApp({
      prisma: makePrisma({ attachment: { id: ATTACHMENT_ID, mimeType: null as any, uploadedBy: USER_ID } }),
    });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 403 when canTranscribeAudio is false', async () => {
    mockGetConsentStatus.mockResolvedValue({ ...DEFAULT_CONSENT, canTranscribeAudio: false });
    const app = await buildApp();
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('AUDIO_TRANSCRIPTION_NOT_ENABLED');
    await app.close();
  });

  it('returns 200 with existing transcription when one exists and force is not set', async () => {
    const existingTranscription = {
      id: 'trans-1',
      text: 'Hello world',
      language: 'en',
      confidence: 0.95,
      source: 'whisper',
      segments: [],
      durationMs: 5000,
    };
    const app = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({
          attachment: { id: ATTACHMENT_ID, messageId: 'msg1', fileName: 'test.mp4', fileUrl: '/f', mimeType: 'audio/mp4', duration: 5 },
          transcription: existingTranscription,
          translatedAudios: [],
        }),
      }),
    });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
    expect(body.data.taskId).toBeNull();
    expect(body.data.transcription).toEqual(existingTranscription);
    await app.close();
  });

  it('starts a new transcription when none exists', async () => {
    const app = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({
          attachment: { id: ATTACHMENT_ID, messageId: 'msg1', fileName: 'test.mp4', fileUrl: '/f', mimeType: 'audio/mp4', duration: 5 },
          transcription: null,
          translatedAudios: [],
        }),
        transcribeAttachment: jest.fn<any>().mockResolvedValue({
          taskId: 'task-xyz',
          attachment: { id: ATTACHMENT_ID, messageId: 'msg1', fileName: 'test.mp4', fileUrl: '/f', mimeType: 'audio/mp4', duration: 5 },
        }),
      }),
    });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('processing');
    expect(body.data.taskId).toBe('task-xyz');
    expect(body.data.transcription).toBeNull();
    await app.close();
  });

  it('force re-transcribes even when existing transcription present', async () => {
    const existingTranscription = { id: 'trans-1', text: 'Old text', language: 'en', confidence: 0.9, source: 'whisper', segments: [], durationMs: 3000 };
    const transcribeAttachment = jest.fn<any>().mockResolvedValue({
      taskId: 'task-forced',
      attachment: { id: ATTACHMENT_ID, messageId: 'msg1', fileName: 'test.mp4', fileUrl: '/f', mimeType: 'audio/mp4', duration: 5 },
    });
    const app = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({
          attachment: { id: ATTACHMENT_ID, messageId: 'msg1', fileName: 'test.mp4', fileUrl: '/f', mimeType: 'audio/mp4', duration: 5 },
          transcription: existingTranscription,
          translatedAudios: [],
        }),
        transcribeAttachment,
      }),
    });
    const res = await injectTranscribe(app, transcribeBody({ force: true }));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('processing');
    expect(body.data.taskId).toBe('task-forced');
    expect(transcribeAttachment).toHaveBeenCalledWith(ATTACHMENT_ID);
    await app.close();
  });

  it('returns 404 when getAttachmentWithTranscription returns null', async () => {
    const app = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue(null),
      }),
    });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });

  it('returns 500 when transcribeAttachment returns null', async () => {
    const app = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({
          attachment: { id: ATTACHMENT_ID, messageId: 'msg1', fileName: 'test.mp4', fileUrl: '/f', mimeType: 'audio/mp4', duration: 5 },
          transcription: null,
          translatedAudios: [],
        }),
        transcribeAttachment: jest.fn<any>().mockResolvedValue(null),
      }),
    });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });

  it('returns 500 when an unexpected error is thrown', async () => {
    const app = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockRejectedValue(new Error('DB failure')),
      }),
    });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.success).toBe(false);
    await app.close();
  });

  it('returns 500 with error message when service throws with message', async () => {
    const app = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockRejectedValue(new Error('network error')),
      }),
    });
    const res = await injectTranscribe(app);
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('handles missing body gracefully (defaults force to false)', async () => {
    const existingTranscription = { id: 'trans-1', text: 'Hello', language: 'en', confidence: 0.9, source: 'whisper', segments: [], durationMs: 2000 };
    const app = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({
          attachment: { id: ATTACHMENT_ID, messageId: 'msg1', fileName: 'test.mp4', fileUrl: '/f', mimeType: 'audio/mp4', duration: 5 },
          transcription: existingTranscription,
          translatedAudios: [],
        }),
      }),
    });
    // Empty body (no force field) — should default force=false
    const res = await app.inject({
      method: 'POST',
      url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    // Should return existing transcription (force=false, transcription exists)
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('completed');
    await app.close();
  });
});
