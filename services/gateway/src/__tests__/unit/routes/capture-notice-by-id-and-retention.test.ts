/**
 * Audit adversarial du 2026-10-08 sur #9629 — les preuves rejouées, chacune en
 * témoin de ce qu'elle a montré :
 *
 *  1. l'identifiant d'un avis partait à toute la conversation (résumé de
 *     lecture), puis l'avis se LISAIT par son identifiant ;
 *  2. un avis survivait jusqu'à sept jours à ce qu'il nomme ;
 *  3. celui qui capture, modérateur, effaçait son avis en supprimant le
 *     message capturé ;
 *  5. un avis se déclarait lui-même capturé (« avis d'avis »).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: { type?: string }) => ctx?.type === 'user',
}));
jest.mock('../../../services/attachments/index', () => ({ AttachmentService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {}, attachmentFullSelect: {}, attachmentForwardPreviewSelect: {},
}));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/TrackingLinkService', () => ({ TrackingLinkService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));
jest.mock('../../../validation/messages-schemas', () => ({
  MessageParamsSchema: {}, AttachmentParamsSchema: {}, UpdateMessageBodySchema: {},
  MessageStatusBodySchema: {}, MessageStatusDetailsQuerySchema: {}, AttachmentStatusBodySchema: {},
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

import messageRoutes from '../../../routes/messages';
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { applyMessageRemovalEffects } from '../../../services/messaging/messageRemovalEffects';
import { CAPTURE_NOTICE_RETENTION_MS } from '../../../services/messaging/captureNoticeVisibility';

const CONV = '507f1f77bcf86cd799439101';
const READER_USER = '507f1f77bcf86cd799439122';
const AUTHOR_USER = '507f1f77bcf86cd799439123';
const READER_P = '507f1f77bcf86cd799439133';
const AUTHOR_P = '507f1f77bcf86cd799439144';
const CAPTURER_P = '507f1f77bcf86cd799439155';
const CAPTURED_ID = '507f1f77bcf86cd799439201';
const NOTICE_ID = '507f1f77bcf86cd799439202';
const SENT_AT = new Date('2026-10-08T10:00:00.000Z');
const READER_FLOOR = new Date('2026-10-08T10:02:00.000Z');

const CAPTURED: MongoDocument = {
  id: CAPTURED_ID, conversationId: CONV, senderId: AUTHOR_P, createdAt: SENT_AT, deletedAt: null,
  messageSource: 'user', messageType: 'text', expiresAt: new Date('2026-10-15T10:00:00.000Z'), metadata: null,
};
const NOTICE: MongoDocument = {
  id: NOTICE_ID, conversationId: CONV, senderId: CAPTURER_P, createdAt: new Date('2026-10-08T10:05:00.000Z'),
  updatedAt: new Date('2026-10-08T10:05:00.000Z'), deletedAt: null, messageSource: 'system', messageType: 'system',
  content: 'Alice a capturé l’éphémère du 08/10/2026 à 12:00',
  expiresAt: new Date('2026-10-16T10:00:00.000Z'),
  metadata: { kind: 'content-capture', capturedMessageId: CAPTURED_ID, sentAt: SENT_AT.toISOString() },
};

const participantRow = (as: 'late' | 'author') => ({
  id: as === 'late' ? READER_P : AUTHOR_P,
  userId: as === 'late' ? READER_USER : AUTHOR_USER,
  role: 'member',
  joinedAt: as === 'late' ? READER_FLOOR : new Date('2026-01-01T00:00:00.000Z'),
  shareLinkId: null,
  historyVisibleFrom: as === 'late' ? READER_FLOOR : null,
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
});

async function getNotice(as: 'late' | 'author') {
  const userId = as === 'late' ? READER_USER : AUTHOR_USER;
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId, hasFullAccess: true, registeredUser: { id: userId, role: 'USER' } };
  });
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const reader = participantRow(as);
  app.decorate('prisma', {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue({
        ...NOTICE,
        originalLanguage: 'fr', translations: null, attachments: [],
        sender: { id: CAPTURER_P, userId: null, displayName: 'Alice', avatar: null, isOnline: false, type: 'user', user: null },
        conversation: { participants: [reader] },
      }),
      findMany: jest.fn<any>(async ({ where }: { where: MongoDocument }) => [CAPTURED].filter((row) => matchesMongoWhere(row, where))),
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(reader), findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ isAnnouncementChannel: false }) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationReadCursor: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as never);
  await app.register(messageRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/messages/${NOTICE_ID}` });
  await app.close();
  return res;
}

describe('1 — un avis ne se lit pas par son identifiant hors de son audience', () => {
  it('GET /messages/:id rend 404 au lecteur arrivé après le message capturé, sans contenu ni métadonnée', async () => {
    const res = await getNotice('late');
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('capturé');
  });

  it('GET /messages/:id le sert à l’auteur du message capturé', async () => {
    const res = await getNotice('author');
    expect(res.statusCode).toBe(200);
    expect(res.json().data?.id).toBe(NOTICE_ID);
  });

  it('le résumé de lecture diffusé à toute la conversation porte sur le dernier VRAI message, jamais sur l’avis', async () => {
    const rows = [CAPTURED, NOTICE];
    const prisma: any = {
      message: {
        findFirst: jest.fn<any>(async (args: { where: MongoDocument }) => {
          const hits = rows.filter((r) => matchesMongoWhere(r, args.where));
          hits.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
          return hits[0] ? { id: hits[0].id, createdAt: hits[0].createdAt, senderId: hits[0].senderId } : null;
        }),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
      participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: READER_P, userId: READER_USER }]) },
      conversationReadCursor: { findMany: jest.fn<any>().mockResolvedValue([]) },
      messageStatusEntry: { findMany: jest.fn<any>().mockResolvedValue([]) },
      userPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
      userNotificationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
      userPrivacyPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
      user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    };
    const summary = await new MessageReadStatusService(prisma).getLatestMessageSummary(CONV);
    expect(summary.messageId).toBe(CAPTURED_ID);
  });
});

function removalTable(notices: MongoDocument[]) {
  const updates: Array<{ where: MongoDocument; data: MongoDocument }> = [];
  const prisma: any = {
    message: {
      findMany: async ({ where }: { where: MongoDocument }) => notices.filter((row) => matchesMongoWhere(row, where)),
      findFirst: async () => null,
      updateMany: async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
        updates.push({ where, data });
        return { count: notices.filter((row) => matchesMongoWhere(row, where)).length };
      },
    },
    conversation: { findUnique: async () => null, updateMany: async () => ({ count: 0 }) },
    trackingLink: { updateMany: async () => ({ count: 0 }) },
    notification: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
  };
  const deadlineOf = (id: string): Date | undefined => {
    const hits = updates.filter((u) => notices.some((n) => n.id === id && matchesMongoWhere(n, u.where)));
    return hits.length ? (hits[hits.length - 1].data.expiresAt as Date) : undefined;
  };
  return { prisma, deadlineOf };
}

const removed = { id: CAPTURED_ID, conversationId: CONV, senderId: AUTHOR_P, senderUserId: AUTHOR_USER, messageType: 'text', attachmentMimeTypes: [], content: 'x', metadata: null };

describe('2 — un avis ne survit pas plus de 24 h à la destruction de ce qu’il nomme', () => {
  it('destruction NATURELLE (échéance, consommation après lecture) : échéance ramenée à min(actuelle, maintenant + 24 h)', async () => {
    const { prisma, deadlineOf } = removalTable([NOTICE]);
    const before = Date.now();
    await applyMessageRemovalEffects(prisma, removed, undefined, { cause: 'expired' });
    const deadline = deadlineOf(NOTICE_ID);
    expect(deadline).toBeInstanceOf(Date);
    expect(deadline!.getTime()).toBeGreaterThanOrEqual(before + CAPTURE_NOTICE_RETENTION_MS);
    expect(deadline!.getTime()).toBeLessThanOrEqual(Date.now() + CAPTURE_NOTICE_RETENTION_MS);
  });

  it('ne repousse jamais une échéance plus proche', async () => {
    const soon = { ...NOTICE, expiresAt: new Date(Date.now() + 60_000) };
    const { prisma, deadlineOf } = removalTable([soon]);
    await applyMessageRemovalEffects(prisma, removed, undefined, { cause: 'expired' });
    expect(deadlineOf(NOTICE_ID)).toBeUndefined();
  });
});

describe('3 — celui qui capture ne raccourcit pas son propre avis en supprimant le message capturé', () => {
  it('supprimé par celui qui capture (modérateur) : son avis garde 24 h, au plus', async () => {
    const { prisma, deadlineOf } = removalTable([NOTICE]);
    const before = Date.now();
    await applyMessageRemovalEffects(prisma, { ...removed, removedByParticipantId: CAPTURER_P }, undefined);
    expect(deadlineOf(NOTICE_ID)!.getTime()).toBeGreaterThanOrEqual(before + CAPTURE_NOTICE_RETENTION_MS);
    expect(deadlineOf(NOTICE_ID)!.getTime()).toBeLessThanOrEqual(Date.now() + CAPTURE_NOTICE_RETENTION_MS);
  });

  it('supprimé par quelqu’un d’autre (l’auteur, un modérateur tiers) : l’avis meurt au prochain balayage', async () => {
    const { prisma, deadlineOf } = removalTable([NOTICE]);
    const after = Date.now() + 1000;
    await applyMessageRemovalEffects(prisma, { ...removed, removedByParticipantId: READER_P }, undefined);
    expect(deadlineOf(NOTICE_ID)!.getTime()).toBeLessThanOrEqual(after);
  });
});

