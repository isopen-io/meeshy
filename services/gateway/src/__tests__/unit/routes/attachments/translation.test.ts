/**
 * Unit tests for attachment translation routes (translation.ts)
 * Tests POST /attachments/:id/translate, POST /attachments/:id/transcribe.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

const mockGetConsentStatus = jest.fn<any>().mockResolvedValue({
  canTranscribeAudio: true,
  canTranslateAudio: true,
  canUseVoiceCloning: true,
});

jest.mock('../../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    getConsentStatus: (...args: any[]) => mockGetConsentStatus(...args),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerTranslationRoutes, shouldReturnExistingTranscription } from '../../../../routes/attachments/translation';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = 'att-001';

// ─── shouldReturnExistingTranscription ───────────────────────────────────────

describe('shouldReturnExistingTranscription', () => {
  it('returns true when transcription exists and not forced', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: true, force: false })).toBe(true);
  });

  it('returns false when transcription exists but force is true', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: true, force: true })).toBe(false);
  });

  it('returns false when no transcription exists', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: false, force: false })).toBe(false);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    messageAttachment: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: ATTACHMENT_ID, mimeType: 'audio/mp3', uploadedBy: USER_ID }),
    },
    ...overrides,
  } as any;
}

function makeTranslateService(overrides: Record<string, any> = {}) {
  return {
    translate: jest.fn<any>().mockResolvedValue({
      success: true,
      data: { status: 'completed', translations: [] },
    }),
    ...overrides,
  } as any;
}

function makeTranslationService(overrides: Record<string, any> = {}) {
  return {
    getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({
      attachment: { id: ATTACHMENT_ID },
      transcription: null,
      translatedAudios: [],
    }),
    transcribeAttachment: jest.fn<any>().mockResolvedValue({
      taskId: 'task-1',
      attachment: { id: ATTACHMENT_ID },
    }),
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: any;
  translateService?: any;
  translationService?: any;
} = {}): Promise<{ app: FastifyInstance; prisma: any }> {
  const {
    auth = 'authenticated',
    prisma = makePrisma(),
    translateService = makeTranslateService(),
    translationService = makeTranslationService(),
  } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  if (translationService !== undefined) {
    app.decorate('translationService', translationService);
  }

  const authRequired = async (req: FastifyRequest) => {
    if (auth === 'authenticated') {
      (req as any).authContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID } };
    } else {
      (req as any).authContext = null;
    }
  };

  await registerTranslationRoutes(app, authRequired, prisma, translateService);
  await app.ready();
  return { app, prisma };
}

// ─── POST /attachments/:id/translate — service not available ─────────────────

describe('POST /attachments/:id/translate — service unavailable', () => {
  it('returns 503 when translateService is null', async () => {
    const { app } = await buildApp({ translateService: null });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ─── POST /attachments/:id/translate — auth ───────────────────────────────────

describe('POST /attachments/:id/translate — unauthenticated', () => {
  it('returns 401 when not authenticated', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ─── POST /attachments/:id/translate — attachment not found ──────────────────

describe('POST /attachments/:id/translate — attachment not found', () => {
  it('returns 404 when attachment does not exist', async () => {
    const prisma = makePrisma();
    prisma.messageAttachment.findUnique = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── POST /attachments/:id/translate — consent denied ────────────────────────

describe('POST /attachments/:id/translate — audio transcription consent required', () => {
  it('returns 403 when canTranscribeAudio is false', async () => {
    mockGetConsentStatus.mockResolvedValueOnce({
      canTranscribeAudio: false,
      canTranslateAudio: true,
      canUseVoiceCloning: true,
    });
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /attachments/:id/translate — audio translation consent required', () => {
  it('returns 403 when canTranslateAudio is false', async () => {
    mockGetConsentStatus.mockResolvedValueOnce({
      canTranscribeAudio: true,
      canTranslateAudio: false,
      canUseVoiceCloning: true,
    });
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /attachments/:id/translate — voice cloning consent required', () => {
  it('returns 403 when generateVoiceClone=true but consent missing', async () => {
    mockGetConsentStatus.mockResolvedValueOnce({
      canTranscribeAudio: true,
      canTranslateAudio: true,
      canUseVoiceCloning: false,
    });
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'], generateVoiceClone: true },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── POST /attachments/:id/translate — success ───────────────────────────────

describe('POST /attachments/:id/translate — success', () => {
  it('returns 200 with translation result', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr', 'en'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /attachments/:id/translate — translate service error', () => {
  it('returns 404 when service returns ATTACHMENT_NOT_FOUND error', async () => {
    const translateService = makeTranslateService();
    translateService.translate = jest.fn<any>().mockResolvedValue({
      success: false,
      errorCode: 'ATTACHMENT_NOT_FOUND',
      error: 'Not found',
    });
    const { app } = await buildApp({ translateService });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 500 when service throws', async () => {
    const translateService = makeTranslateService();
    translateService.translate = jest.fn<any>().mockRejectedValue(new Error('ZMQ down'));
    const { app } = await buildApp({ translateService });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /attachments/:id/transcribe — service not available ────────────────

describe('POST /attachments/:id/transcribe — translationService unavailable', () => {
  it('returns 503 when translationService is not decorated', async () => {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', makePrisma());
    const authRequired = async (req: FastifyRequest) => {
      (req as any).authContext = { isAuthenticated: true, userId: USER_ID };
    };
    await registerTranslationRoutes(app, authRequired, makePrisma(), makeTranslateService());
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

// ─── POST /attachments/:id/transcribe — not audio ────────────────────────────

describe('POST /attachments/:id/transcribe — not audio mime type', () => {
  it('returns 400 when attachment is not audio', async () => {
    const prisma = makePrisma();
    prisma.messageAttachment.findUnique = jest.fn<any>().mockResolvedValue({
      id: ATTACHMENT_ID, mimeType: 'image/png', uploadedBy: USER_ID,
    });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /attachments/:id/transcribe — consent denied ───────────────────────

describe('POST /attachments/:id/transcribe — consent denied', () => {
  it('returns 403 when canTranscribeAudio is false', async () => {
    mockGetConsentStatus.mockResolvedValueOnce({ canTranscribeAudio: false });
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── POST /attachments/:id/transcribe — returns cached transcription ─────────

describe('POST /attachments/:id/transcribe — existing transcription', () => {
  it('returns 200 with cached transcription when not forced', async () => {
    const translationService = makeTranslationService();
    translationService.getAttachmentWithTranscription = jest.fn<any>().mockResolvedValue({
      attachment: { id: ATTACHMENT_ID },
      transcription: { text: 'hello', language: 'en' },
      translatedAudios: [],
    });
    const { app } = await buildApp({ translationService });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /attachments/:id/transcribe — kicks off new transcription ───────────

describe('POST /attachments/:id/transcribe — starts transcription', () => {
  it('returns 200 with taskId when transcription starts', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /attachments/:id/transcribe — force re-transcription', () => {
  it('returns 200 with taskId when forced even with existing transcription', async () => {
    const translationService = makeTranslationService();
    translationService.getAttachmentWithTranscription = jest.fn<any>().mockResolvedValue({
      attachment: { id: ATTACHMENT_ID },
      transcription: { text: 'hello' },
      translatedAudios: [],
    });
    const { app } = await buildApp({ translationService });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: { force: true },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /attachments/:id/transcribe — unauthenticated (line 334) ───────────

describe('POST /attachments/:id/transcribe — unauthenticated', () => {
  it('returns 401 when auth context is not authenticated', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ─── POST /attachments/:id/transcribe — attachment not found (line 348) ──────

describe('POST /attachments/:id/transcribe — attachment not found', () => {
  it('returns 404 when messageAttachment.findUnique returns null', async () => {
    const prisma = makePrisma();
    prisma.messageAttachment.findUnique = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── POST /attachments/:id/transcribe — existingData null (line 366) ─────────

describe('POST /attachments/:id/transcribe — getAttachmentWithTranscription returns null', () => {
  it('returns 404 when translationService.getAttachmentWithTranscription returns null', async () => {
    const translationService = makeTranslationService();
    translationService.getAttachmentWithTranscription = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ translationService });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── POST /attachments/:id/transcribe — transcribeAttachment returns null (line 385) ─

describe('POST /attachments/:id/transcribe — transcribeAttachment returns null', () => {
  it('returns 500 when transcribeAttachment returns null', async () => {
    const translationService = makeTranslationService();
    translationService.transcribeAttachment = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ translationService });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /attachments/:id/transcribe — throws (lines 396-397) ───────────────

describe('POST /attachments/:id/transcribe — unexpected error', () => {
  it('returns 500 when transcribeAttachment throws', async () => {
    const translationService = makeTranslationService();
    translationService.transcribeAttachment = jest.fn<any>().mockRejectedValue(new Error('ZMQ failure'));
    const { app } = await buildApp({ translationService });
    const res = await app.inject({
      method: 'POST', url: `/attachments/${ATTACHMENT_ID}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
