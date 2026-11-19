/**
 * AUDIT ADVERSARIAL DE #19786, constat 2 — LE STATUT SERVI.
 *
 * #19786 a remplacé une pendaison par une erreur propagée. Le transport est
 * meilleur ; l'issue produit était PIRE, et personne ne pouvait le voir en
 * n'observant que la levée : l'erreur de base BRUTE ne passait aucun prédicat de
 * `MessagingService`, finissait dans sa branche terminale « erreur interne » et
 * se servait en **HTTP 400**, que `outcomeOf` (`apps/web/src/lib/api/outcome.ts`,
 * `RETRYABLE_CLIENT_STATUSES = {408, 425, 429}`) classe `permanent` — donc sans
 * aucun rejeu offert. La pendaison d'avant expirait, elle, en `TIMEOUT` après
 * 15 s, c'est-à-dire en transitoire RETRYABLE.
 *
 * Ce témoin traverse la chaîne ENTIÈRE jusqu'au statut HTTP, avec la VRAIE
 * `MessagingService`, le VRAI `EncryptionService` et le VRAI `ServerKeyVault` :
 * seule la base est doublée. Un témoin posé sur la levée, ou sur le code rendu
 * par le service, ne peut pas voir ce que l'appelant reçoit.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import type { MessageRequest } from '@meeshy/shared/types';

jest.mock('../../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({ handleNewMessage: jest.fn() }))
}));
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: jest.fn(async () => null),
    createTrackingLink: jest.fn(async () => ({ token: 'abc123' })),
    processExplicitLinksInContent: jest.fn(async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })),
    collectContentTrackingLinks: jest.fn(async () => [])
  }))
}));
jest.mock('../../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn().mockReturnValue([]),
    extractMentionsWithParticipants: jest.fn().mockReturnValue([]),
    resolveUsernames: jest.fn(async () => new Map()),
    validateMentionPermissions: jest.fn(async () => ({ isValid: true, validUserIds: [], invalidUsernames: [], errors: [] })),
    createMentions: jest.fn(async () => undefined)
  }))
}));

import { MessagingService } from '../../../../services/MessagingService';
import { registerSendMessageRoute } from '../../../../routes/conversations/messages-send';
import { resetParticipantLookupCache } from '../../../../utils/participant-lookup-cache';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CONV = '507f1f77bcf86cd799439012';
const SENDER = '507f1f77bcf86cd799439014';
const SENDER_USER = '507f1f77bcf86cd799439018';
const MASTER = Buffer.alloc(32, 7).toString('base64');
const savedMaster = process.env.ENCRYPTION_MASTER_KEY;

/**
 * Une conversation chiffrée AU REPOS dont la base refuse d'écrire la clé :
 * l'incident Mongo transitoire, vu du chemin d'envoi.
 */
const worldWhereKeyCreationFails = () => ({
  conversation: {
    findUnique: jest.fn(async () => ({
      id: CONV, type: 'direct', encryptionMode: 'server', encryptionEnabledAt: new Date('2026-01-01'),
      serverEncryptionKeyId: null, deletedAt: null
    })),
    findFirst: jest.fn(async () => ({ id: CONV, identifier: 'dm', type: 'direct' })),
    update: jest.fn(async () => ({ id: CONV }))
  },
  participant: {
    findUnique: jest.fn(async () => ({ id: SENDER, conversationId: CONV, isActive: true, userId: SENDER_USER })),
    findFirst: jest.fn(async () => ({ id: SENDER, conversationId: CONV, isActive: true, userId: SENDER_USER })),
    findMany: jest.fn(async () => [])
  },
  serverEncryptionKey: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async () => { throw new Error('mongo down'); }),
    update: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({ count: 0 }))
  },
  friendRequest: { findFirst: jest.fn(async () => null) },
  postMention: { findUnique: jest.fn(async () => null) },
  post: { findUnique: jest.fn(async () => null) },
  message: {
    create: jest.fn(), update: jest.fn(), updateMany: jest.fn(async () => ({ count: 0 })),
    findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null)
  },
  trackingLink: { updateMany: jest.fn() },
  messageAttachment: { findMany: jest.fn(async () => []) },
  user: { findUnique: jest.fn(), findMany: jest.fn(async () => []) }
});

async function fakeAuth(request: FastifyRequest): Promise<void> {
  (request as any).authContext = { isAuthenticated: true, isAnonymous: true, participantId: SENDER, userId: SENDER };
}

describe('#19786 (audit) — un échec de génération de clé est SERVI comme rejouable', () => {
  let prisma: ReturnType<typeof worldWhereKeyCreationFails>;
  let service: MessagingService;
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    resetParticipantLookupCache();
    prisma = worldWhereKeyCreationFails();
    service = new MessagingService(
      prisma as unknown as PrismaClient,
      { handleNewMessage: jest.fn() } as never,
      { createMentionNotification: jest.fn(), createMentionNotificationsBatch: jest.fn(async () => 0) } as never
    );
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (savedMaster === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
    else process.env.ENCRYPTION_MASTER_KEY = savedMaster;
  });

  const request: MessageRequest = { conversationId: CONV, content: 'Rendez-vous à 18h', originalLanguage: 'fr' };

  it('`MessagingService` rend le code STABLE et son délai, jamais une erreur interne muette', async () => {
    const response = await service.handleMessage(request, SENDER);

    expect(response.success).toBe(false);
    expect(response.code).toBe('MESSAGE_SEND_RETRYABLE');
    expect(response.retryAfter).toBeGreaterThan(0);
    // Rien n'a été écrit : c'est ce qui rend le rejeu légitime.
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('la route sert 503 et l’en-tête Retry-After — jamais le 400 que le client tient pour PERMANENT', async () => {
    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    registerSendMessageRoute(
      app as never,
      prisma as never,
      fakeAuth as never,
      () => ({ handleMessage: (req: MessageRequest, senderId: string) => service.handleMessage(req, senderId) }) as never,
      null as never
    );
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV}/messages`,
      payload: { content: 'Rendez-vous à 18h', originalLanguage: 'fr' }
    });

    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.json()).toMatchObject({ success: false, code: 'MESSAGE_SEND_RETRYABLE' });
  });
});
