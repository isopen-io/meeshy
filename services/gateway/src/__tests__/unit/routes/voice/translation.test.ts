/**
 * Unit tests for voice translation routes (translation.ts)
 * Tests POST /translate, POST /translate/async, GET /job/:jobId,
 * DELETE /job/:jobId, POST /transcribe.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerTranslationRoutes } from '../../../../routes/voice/translation';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const PREFIX = '/api/v1/voice';
const JOB_ID = 'job-abc-123';

// ─── Mock services ────────────────────────────────────────────────────────────

function makeAudioTranslateService(overrides: Record<string, any> = {}) {
  return {
    translateSync: jest.fn<any>().mockResolvedValue({
      originalAudio: { transcription: 'hello', language: 'en', confidence: 0.99, durationMs: 1000 },
      translations: [{ language: 'fr', audioBase64: 'abc==' }],
    }),
    translateAsync: jest.fn<any>().mockResolvedValue({ jobId: JOB_ID, status: 'pending' }),
    getJobStatus: jest.fn<any>().mockResolvedValue({ jobId: JOB_ID, status: 'completed' }),
    cancelJob: jest.fn<any>().mockResolvedValue({ jobId: JOB_ID, status: 'cancelled' }),
    transcribeOnly: jest.fn<any>().mockResolvedValue({
      text: 'hello', language: 'en', confidence: 0.99, source: 'whisper', segments: [], durationMs: 1000,
    }),
    ...overrides,
  } as any;
}

function makeTranslationService(overrides: Record<string, any> = {}) {
  return {
    getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue(null),
    translateAttachment: jest.fn<any>().mockResolvedValue({ taskId: JOB_ID, attachment: { id: 'att-1' } }),
    transcribeAttachment: jest.fn<any>().mockResolvedValue({ taskId: JOB_ID, attachment: { id: 'att-1' } }),
    ...overrides,
  } as any;
}

// ─── Helper ────────────────────────────────────────────────────────────────────

async function buildApp(opts: {
  authenticated?: boolean;
  audioService?: ReturnType<typeof makeAudioTranslateService>;
  translationService?: ReturnType<typeof makeTranslationService> | null;
} = {}): Promise<{
  app: FastifyInstance;
  audioService: ReturnType<typeof makeAudioTranslateService>;
  translationService: ReturnType<typeof makeTranslationService> | null;
}> {
  const {
    authenticated = true,
    audioService = makeAudioTranslateService(),
    translationService = makeTranslationService(),
  } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  // Chaque route voice exige désormais `fastify.authenticate` en `preHandler`
  // (voir routes/voice/translation.ts). Ce double reproduit le comportement
  // réel de `createUnifiedAuthMiddleware({ requireAuth: true })` : 401
  // immédiat si aucune identité vérifiée n'a été posée sur `request.user`.
  // Le hook global ci-dessous, qui pose `request.user`, s'exécute AVANT le
  // `preHandler` de la route (les hooks globaux précèdent toujours les hooks
  // déclarés au niveau route).
  app.decorate('authenticate', async (req: any, reply: any) => {
    if (!req.user?.userId) {
      reply.status(401).send({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' });
    }
  });

  app.addHook('preHandler', async (req) => {
    if (authenticated) {
      (req as any).user = { userId: USER_ID, role: 'user' };
    }
  });

  registerTranslationRoutes(app, audioService, translationService ?? undefined, PREFIX);
  await app.ready();
  return { app, audioService, translationService };
}

// ─── POST /translate — auth ───────────────────────────────────────────────────

describe('POST /api/v1/voice/translate — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['en'] },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ─── POST /translate — audioBase64 path ──────────────────────────────────────

describe('POST /api/v1/voice/translate — missing inputs', () => {
  it('returns 400 when neither audioBase64 nor attachmentId provided', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { targetLanguages: ['en'] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when targetLanguages is missing', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'dGVzdA==' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when targetLanguages is empty array', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /api/v1/voice/translate — success with audioBase64', () => {
  it('returns 200 with translation result', async () => {
    const { app, audioService } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(audioService.translateSync).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      audioBase64: 'dGVzdA==', targetLanguages: ['fr'],
    }));
    await app.close();
  });
});

describe('POST /api/v1/voice/translate — audioBase64 service error', () => {
  it('returns 500 when service throws', async () => {
    const audioService = makeAudioTranslateService();
    audioService.translateSync = jest.fn<any>().mockRejectedValue(new Error('service down'));
    const { app } = await buildApp({ audioService });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /translate — attachmentId path ─────────────────────────────────────

describe('POST /api/v1/voice/translate — attachmentId not found', () => {
  it('returns 404 when attachment does not exist', async () => {
    const translationService = makeTranslationService();
    translationService.getAttachmentWithTranscription = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ translationService });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-1', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/v1/voice/translate — attachmentId with existing translations', () => {
  it('returns 200 with cached translations', async () => {
    const translationService = makeTranslationService();
    translationService.getAttachmentWithTranscription = jest.fn<any>().mockResolvedValue({
      attachment: { id: 'att-1' },
      transcription: { text: 'hello' },
      translatedAudios: [{ language: 'fr' }],
    });
    const { app } = await buildApp({ translationService });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-1', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /api/v1/voice/translate — attachmentId kicks off translation', () => {
  it('returns 200 with taskId when translation starts', async () => {
    const translationService = makeTranslationService();
    translationService.getAttachmentWithTranscription = jest.fn<any>().mockResolvedValue({
      attachment: { id: 'att-1' },
      transcription: null,
      translatedAudios: [],
    });
    const { app } = await buildApp({ translationService });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-1', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /api/v1/voice/translate — no translationService with attachmentId', () => {
  it('returns 500 when translationService is not available', async () => {
    const { app } = await buildApp({ translationService: null });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-1', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /translate/async ────────────────────────────────────────────────────

describe('POST /api/v1/voice/translate/async — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /api/v1/voice/translate/async — missing inputs', () => {
  it('returns 400 when neither audioBase64 nor attachmentId provided', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when targetLanguages is empty', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /api/v1/voice/translate/async — success with audioBase64', () => {
  it('returns 202 with jobId', async () => {
    const { app, audioService } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().success).toBe(true);
    expect(res.json().data.jobId).toBe(JOB_ID);
    expect(audioService.translateAsync).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      audioBase64: 'dGVzdA==', targetLanguages: ['fr'],
    }));
    await app.close();
  });
});

describe('POST /api/v1/voice/translate/async — service error', () => {
  it('returns 500 when service throws', async () => {
    const audioService = makeAudioTranslateService();
    audioService.translateAsync = jest.fn<any>().mockRejectedValue(new Error('queue full'));
    const { app } = await buildApp({ audioService });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/translate/async`,
      payload: { audioBase64: 'dGVzdA==', targetLanguages: ['fr'] },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /job/:jobId ──────────────────────────────────────────────────────────

describe('GET /api/v1/voice/job/:jobId — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /api/v1/voice/job/:jobId — success', () => {
  it('returns 200 with job status', async () => {
    const { app, audioService } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(audioService.getJobStatus).toHaveBeenCalledWith(USER_ID, JOB_ID);
    await app.close();
  });
});

describe('GET /api/v1/voice/job/:jobId — service error', () => {
  it('returns 500 when service throws', async () => {
    const audioService = makeAudioTranslateService();
    audioService.getJobStatus = jest.fn<any>().mockRejectedValue(new Error('not found'));
    const { app } = await buildApp({ audioService });
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── DELETE /job/:jobId ───────────────────────────────────────────────────────

describe('DELETE /api/v1/voice/job/:jobId — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'DELETE', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /api/v1/voice/job/:jobId — success', () => {
  it('returns 200 with cancelled status', async () => {
    const { app, audioService } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('cancelled');
    expect(audioService.cancelJob).toHaveBeenCalledWith(USER_ID, JOB_ID);
    await app.close();
  });
});

describe('DELETE /api/v1/voice/job/:jobId — service error', () => {
  it('returns 500 when service throws', async () => {
    const audioService = makeAudioTranslateService();
    audioService.cancelJob = jest.fn<any>().mockRejectedValue(new Error('already done'));
    const { app } = await buildApp({ audioService });
    const res = await app.inject({ method: 'DELETE', url: `${PREFIX}/job/${JOB_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /transcribe ─────────────────────────────────────────────────────────

describe('POST /api/v1/voice/transcribe — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'dGVzdA==', audioFormat: 'wav' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /api/v1/voice/transcribe — missing inputs', () => {
  it('returns 400 when neither audioBase64 nor attachmentId provided', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when audioBase64 provided without audioFormat', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'dGVzdA==' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /api/v1/voice/transcribe — success with audioBase64', () => {
  it('returns 200 with transcription result', async () => {
    const { app, audioService } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'dGVzdA==', audioFormat: 'wav' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(audioService.transcribeOnly).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      audioBase64: 'dGVzdA==', audioFormat: 'wav',
    }));
    await app.close();
  });
});

describe('POST /api/v1/voice/transcribe — audioBase64 service error', () => {
  it('returns 500 when transcription fails', async () => {
    const audioService = makeAudioTranslateService();
    audioService.transcribeOnly = jest.fn<any>().mockRejectedValue(new Error('whisper down'));
    const { app } = await buildApp({ audioService });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { audioBase64: 'dGVzdA==', audioFormat: 'mp3' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('POST /api/v1/voice/transcribe — attachmentId not found', () => {
  it('returns 404 when attachment does not exist', async () => {
    const translationService = makeTranslationService();
    translationService.getAttachmentWithTranscription = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ translationService });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { attachmentId: 'att-1' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/v1/voice/transcribe — attachmentId with cached transcription', () => {
  it('returns 200 with existing transcription', async () => {
    const translationService = makeTranslationService();
    translationService.getAttachmentWithTranscription = jest.fn<any>().mockResolvedValue({
      attachment: { id: 'att-1' },
      transcription: { text: 'hello', language: 'en' },
      translatedAudios: [],
    });
    const { app } = await buildApp({ translationService });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { attachmentId: 'att-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /api/v1/voice/transcribe — no translationService with attachmentId', () => {
  it('returns 500 when translationService is not available', async () => {
    const { app } = await buildApp({ translationService: null });
    const res = await app.inject({
      method: 'POST', url: `${PREFIX}/transcribe`,
      payload: { attachmentId: 'att-1' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── Le sérialiseur sert enfin l'attachement et la transcription (cycle 91) ───

/**
 * Trois charges utiles de ce fichier déclaraient `attachment` /
 * `transcription` en `{ type: 'object', nullable: true }` — sans `properties`,
 * donc `{}` (fast-json-stringify applique `additionalProperties: false`).
 *
 * Et la quatrième, celle de `POST /transcribe`, portait la forme « juste » que
 * les trois autres auraient dû copier : elle TRONQUAIT quand même. Mesuré au
 * compilateur sur le schéma tel qu'il était :
 *
 *   attachment    → perd originalName, fileSize, bitrate, sampleRate, codec,
 *                   channels, createdAt
 *   transcription → perd id, createdAt
 *   translatedAudios → clé NON déclarée, donc supprimée entièrement
 *
 * Les deux producteurs sont dans le même service et se rangent en superset :
 * `translateAttachment` rend 6 champs, `getAttachmentWithTranscription` en rend
 * 13. Déclarer le superset ne tronque ni l'un ni l'autre — une clé déclarée
 * qu'un objet ne porte pas n'est pas fabriquée.
 */
describe('les charges utiles `attachment` / `transcription` traversent le sérialiseur', () => {
  const FULL_ATTACHMENT = {
    id: 'att-1',
    messageId: 'msg-1',
    fileName: 'f.wav',
    originalName: 'voix.wav',
    fileUrl: '/uploads/f.wav',
    mimeType: 'audio/wav',
    fileSize: 12345,
    duration: 8000,
    bitrate: 128,
    sampleRate: 22050,
    codec: 'pcm',
    channels: 1,
    createdAt: '2026-08-22T09:00:00.000Z',
  };

  const FULL_TRANSCRIPTION = {
    id: 'att-1',
    text: 'bonjour',
    language: 'fr',
    confidence: 0.91,
    source: 'server',
    segments: [],
    durationMs: 8000,
    createdAt: '2026-08-22T09:00:00.000Z',
  };

  const EXISTING = {
    attachment: FULL_ATTACHMENT,
    transcription: FULL_TRANSCRIPTION,
    translatedAudios: [{ id: 'att-1_en', targetLanguage: 'en', translatedText: 'hello' }],
  };

  it('POST /translate sert l’attachement ENTIER quand la traduction existe déjà', async () => {
    const { app } = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue(EXISTING),
      }),
    });

    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-1', targetLanguages: ['en'] },
    });

    expect(res.json().data.attachment).toEqual(FULL_ATTACHMENT);
    await app.close();
  });

  it('POST /translate sert la transcription ENTIÈRE, `id` et `createdAt` compris', async () => {
    const { app } = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue(EXISTING),
      }),
    });

    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-1', targetLanguages: ['en'] },
    });

    expect(res.json().data.transcription).toEqual(FULL_TRANSCRIPTION);
    await app.close();
  });

  it('POST /translate sert la transcription COURTE du chemin base64 sans la déformer', async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { audioBase64: 'AAA', targetLanguages: ['fr'] },
    });

    // Le chemin base64 construit quatre champs seulement : le superset les sert
    // tels quels, et ne FABRIQUE pas les quatre autres.
    expect(res.json().data.transcription).toEqual({
      text: 'hello',
      language: 'en',
      confidence: 0.99,
      durationMs: 1000,
    });
    await app.close();
  });

  it('POST /translate sert l’attachement du chemin « processing »', async () => {
    const { app } = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue({
          attachment: FULL_ATTACHMENT,
          transcription: null,
          translatedAudios: [],
        }),
        translateAttachment: jest.fn<any>().mockResolvedValue({
          taskId: JOB_ID,
          attachment: {
            id: 'att-1',
            messageId: 'msg-1',
            fileName: 'f.wav',
            fileUrl: '/uploads/f.wav',
            duration: 8000,
            mimeType: 'audio/wav',
          },
        }),
      }),
    });

    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/translate`,
      payload: { attachmentId: 'att-1', targetLanguages: ['en'] },
    });

    const body = res.json().data;
    expect(body.status).toBe('processing');
    expect(body.attachment.fileName).toBe('f.wav');
    expect(body.attachment.mimeType).toBe('audio/wav');
    await app.close();
  });

  it('POST /transcribe ne TRONQUE plus l’attachement — les sept champs perdus reviennent', async () => {
    const { app } = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue(EXISTING),
      }),
    });

    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: { attachmentId: 'att-1' },
    });

    const { attachment } = res.json().data;
    expect(attachment.originalName).toBe('voix.wav');
    expect(attachment.fileSize).toBe(12345);
    expect(attachment.bitrate).toBe(128);
    expect(attachment.sampleRate).toBe(22050);
    expect(attachment.codec).toBe('pcm');
    expect(attachment.channels).toBe(1);
    expect(attachment.createdAt).toBe('2026-08-22T09:00:00.000Z');
    await app.close();
  });

  it('POST /transcribe sert `translatedAudios`, que son schéma ne déclarait pas du tout', async () => {
    const { app } = await buildApp({
      translationService: makeTranslationService({
        getAttachmentWithTranscription: jest.fn<any>().mockResolvedValue(EXISTING),
      }),
    });

    const res = await app.inject({
      method: 'POST',
      url: `${PREFIX}/transcribe`,
      payload: { attachmentId: 'att-1' },
    });

    expect(res.json().data.translatedAudios).toEqual([
      { id: 'att-1_en', targetLanguage: 'en', translatedText: 'hello' },
    ]);
    await app.close();
  });
});
