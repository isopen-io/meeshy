/**
 * `tool.translation_request` (#8959) sur les portes REST : une traduction ou
 * une transcription demandée et ACCEPTÉE rapporte ; un refus, une validation
 * échouée, un anonyme ou un ENVOI déguisé (cas 2 de `/translate`) jamais.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const mockRecordActivity = jest.fn<any>();
jest.mock('../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({ recordActivity: mockRecordActivity })),
}));

const mockGetConsentStatus = jest.fn<any>();
jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({ getConsentStatus: mockGetConsentStatus })),
}));

import {
  creditAcceptedTranslationRequest,
  creditTranslationRequest,
  lazyTranslationRequestEngagement,
} from '../../../services/messaging/translationRequestCredit';

const USER_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd7994390aa';
const MESSAGE_ID = '507f1f77bcf86cd7994390bb';
const ATTACHMENT_ID = '507f1f77bcf86cd7994390cc';

const REGISTERED = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID };
const ANONYMOUS = { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'p-anon', participantId: 'p-anon' };

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

const credits = () => mockRecordActivity.mock.calls.filter((call) => call[1] === 'tool.translation_request');

function authenticateAs(authContext: Record<string, unknown>) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = authContext;
    (request as unknown as Record<string, unknown>).user = { userId: authContext.userId, isAnonymous: authContext.isAnonymous };
  };
}

beforeEach(() => {
  mockRecordActivity.mockReset();
  mockRecordActivity.mockResolvedValue(undefined);
  mockGetConsentStatus.mockResolvedValue({ canTranscribeAudio: true, canTranslateAudio: true, canUseVoiceCloning: true });
});

describe('creditTranslationRequest — la règle', () => {
  const engagement = { recordActivity: mockRecordActivity };

  it('crédite un compte inscrit, avec la conversation quand elle est connue', async () => {
    creditTranslationRequest({ engagement, requester: REGISTERED, conversationId: CONV_ID, onError: jest.fn() });
    creditTranslationRequest({ engagement, requester: REGISTERED, onError: jest.fn() });
    await flush();

    expect(credits()).toEqual([
      [USER_ID, 'tool.translation_request', { conversationId: CONV_ID }],
      [USER_ID, 'tool.translation_request', {}],
    ]);
  });

  it('ne crédite ni un anonyme ni un appelant sans identité', async () => {
    creditTranslationRequest({ engagement, requester: ANONYMOUS, onError: jest.fn() });
    creditTranslationRequest({ engagement, requester: undefined, onError: jest.fn() });
    await flush();

    expect(credits()).toEqual([]);
  });

  it('remet une panne du moteur à `onError`, sans la lever', async () => {
    mockRecordActivity.mockRejectedValue(new Error('down'));
    const onError = jest.fn();
    creditTranslationRequest({ engagement, requester: REGISTERED, onError });
    await flush();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('construit le moteur au premier crédit seulement', async () => {
    const prismaOf = jest.fn(() => ({}) as PrismaClient);
    const lazy = lazyTranslationRequestEngagement(prismaOf);
    expect(prismaOf).not.toHaveBeenCalled();
    await lazy.recordActivity(USER_ID, 'tool.translation_request', {});
    await lazy.recordActivity(USER_ID, 'tool.translation_request', {});
    expect(prismaOf).toHaveBeenCalledTimes(1);
  });
});

describe('creditAcceptedTranslationRequest — le crochet de réponse', () => {
  async function appWithStatus(status: number): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.post(
      '/x',
      {
        onRequest: authenticateAs(REGISTERED),
        onResponse: creditAcceptedTranslationRequest({
          engagement: { recordActivity: mockRecordActivity },
          requesterOf: (request) => (request as unknown as { authContext: typeof REGISTERED }).authContext,
          onError: jest.fn(),
        }),
      },
      async (_request, reply) => reply.status(status).send({ success: status < 300 }),
    );
    await app.ready();
    return app;
  }

  it('crédite une réponse 2xx', async () => {
    const app = await appWithStatus(200);
    await app.inject({ method: 'POST', url: '/x' });
    await flush();
    expect(credits()).toHaveLength(1);
    await app.close();
  });

  it.each([400, 403, 404, 500])('ne crédite pas une réponse %i', async (status) => {
    const app = await appWithStatus(status);
    await app.inject({ method: 'POST', url: '/x' });
    await flush();
    expect(credits()).toEqual([]);
    await app.close();
  });
});

describe('POST /translate (non bloquante)', () => {
  async function buildApp(authContext: Record<string, unknown>, member = true): Promise<FastifyInstance> {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', {
      message: {
        findUnique: jest.fn<any>().mockResolvedValue({
          id: MESSAGE_ID,
          conversationId: CONV_ID,
          content: 'hello',
          originalLanguage: 'en',
          conversation: { participants: [] },
        }),
      },
      participant: { findFirst: jest.fn<any>().mockResolvedValue(member ? { id: 'p-1' } : null) },
      conversation: { findFirst: jest.fn<any>().mockResolvedValue({ id: CONV_ID }) },
    } as unknown as PrismaClient);
    app.decorate('translationService', { handleNewMessage: jest.fn<any>().mockResolvedValue({}) } as any);
    app.decorate('messagingService', { handleMessage: jest.fn<any>().mockResolvedValue({ success: true }) } as any);
    app.decorate('authenticate', authenticateAs(authContext));
    const { translationRoutes } = await import('../../../routes/translation-non-blocking');
    await app.register(translationRoutes);
    await app.ready();
    return app;
  }

  it('crédite la retraduction d\'un message, dans sa conversation', async () => {
    const app = await buildApp(REGISTERED);
    const res = await app.inject({ method: 'POST', url: '/translate', payload: { message_id: MESSAGE_ID, target_language: 'fr' } });
    await flush();
    expect(res.statusCode).toBe(200);
    expect(credits()).toEqual([[USER_ID, 'tool.translation_request', { conversationId: CONV_ID }]]);
    await app.close();
  });

  it('ne crédite pas un envoi de nouveau message (cas 2) — il est crédité comme message', async () => {
    const app = await buildApp(REGISTERED);
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: { text: 'hello', target_language: 'fr', conversation_id: CONV_ID },
    });
    await flush();
    expect(res.statusCode).toBe(200);
    expect(credits()).toEqual([]);
    await app.close();
  });

  it('ne crédite pas une retraduction refusée à un non-membre', async () => {
    const app = await buildApp(REGISTERED, false);
    const res = await app.inject({ method: 'POST', url: '/translate', payload: { message_id: MESSAGE_ID, target_language: 'fr' } });
    await flush();
    expect(res.statusCode).toBe(403);
    expect(credits()).toEqual([]);
    await app.close();
  });

  it('ne crédite pas un anonyme', async () => {
    const app = await buildApp(ANONYMOUS);
    await app.inject({ method: 'POST', url: '/translate', payload: { message_id: MESSAGE_ID, target_language: 'fr' } });
    await flush();
    expect(credits()).toEqual([]);
    await app.close();
  });
});

describe('POST /translate-blocking', () => {
  async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', {} as PrismaClient);
    app.decorate('translationService', {
      translateTextDirectly: jest.fn<any>().mockResolvedValue({
        translatedText: 'bonjour',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        confidenceScore: 0.9,
        modelType: 'basic',
      }),
    } as any);
    app.decorate('authenticate', authenticateAs(REGISTERED));
    const { translationRoutes } = await import('../../../routes/translation');
    await app.register(translationRoutes);
    await app.ready();
    return app;
  }

  it('crédite une traduction de texte libre servie', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/translate-blocking',
      payload: { text: 'hello', source_language: 'en', target_language: 'fr' },
    });
    await flush();
    expect(res.statusCode).toBe(200);
    expect(credits()).toEqual([[USER_ID, 'tool.translation_request', {}]]);
    await app.close();
  });

  it('ne crédite pas une requête invalide', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/translate-blocking', payload: { target_language: 'fr' } });
    await flush();
    expect(res.statusCode).toBe(400);
    expect(credits()).toEqual([]);
    await app.close();
  });
});

describe('POST /attachments/:attachmentId/translate', () => {
  async function buildApp(authContext: Record<string, unknown>, translateOk = true): Promise<FastifyInstance> {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    const prisma = {
      messageAttachment: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: ATTACHMENT_ID, mimeType: 'audio/mp4', messageId: MESSAGE_ID }),
      },
    } as unknown as PrismaClient;
    const translateService = {
      translate: jest.fn<any>().mockResolvedValue(
        translateOk
          ? { success: true, data: { attachmentId: ATTACHMENT_ID, status: 'processing' } }
          : { success: false, errorCode: 'ACCESS_DENIED', error: 'denied' },
      ),
    };
    const { registerTranslationRoutes } = await import('../../../routes/attachments/translation');
    await registerTranslationRoutes(app, authenticateAs(authContext), prisma, translateService as any);
    await app.ready();
    return app;
  }

  it('crédite une traduction acceptée', async () => {
    const app = await buildApp(REGISTERED);
    const res = await app.inject({
      method: 'POST',
      url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    await flush();
    expect(res.statusCode).toBe(200);
    expect(credits()).toEqual([[USER_ID, 'tool.translation_request', {}]]);
    await app.close();
  });

  it('ne crédite pas une traduction refusée par le service', async () => {
    const app = await buildApp(REGISTERED, false);
    const res = await app.inject({
      method: 'POST',
      url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    await flush();
    expect(res.statusCode).toBe(403);
    expect(credits()).toEqual([]);
    await app.close();
  });

  it('ne crédite pas un consentement manquant', async () => {
    mockGetConsentStatus.mockResolvedValue({ canTranscribeAudio: false, canTranslateAudio: false, canUseVoiceCloning: false });
    const app = await buildApp(REGISTERED);
    const res = await app.inject({
      method: 'POST',
      url: `/attachments/${ATTACHMENT_ID}/translate`,
      payload: { targetLanguages: ['fr'] },
    });
    await flush();
    expect(res.statusCode).toBe(403);
    expect(credits()).toEqual([]);
    await app.close();
  });
});

describe('POST /voice/translate', () => {
  async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('authenticate', authenticateAs(REGISTERED));
    const audioService = {
      translateSync: jest.fn<any>().mockResolvedValue({
        originalAudio: { transcription: 'hello', language: 'en', confidence: 0.9, durationMs: 1000 },
        translations: [],
      }),
    };
    const { registerTranslationRoutes } = await import('../../../routes/voice/translation');
    registerTranslationRoutes(app, audioService as any, undefined, '/voice', {} as PrismaClient);
    await app.ready();
    return app;
  }

  it('crédite une traduction vocale servie', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/voice/translate',
      payload: { audioBase64: 'AAAA', targetLanguages: ['fr'] },
    });
    await flush();
    expect(res.statusCode).toBe(200);
    expect(credits()).toEqual([[USER_ID, 'tool.translation_request', {}]]);
    await app.close();
  });

  it('ne crédite pas une demande sans langue cible', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/voice/translate', payload: { audioBase64: 'AAAA' } });
    await flush();
    expect(res.statusCode).toBe(400);
    expect(credits()).toEqual([]);
    await app.close();
  });
});
