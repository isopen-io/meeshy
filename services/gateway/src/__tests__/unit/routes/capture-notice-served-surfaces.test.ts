/**
 * #9629 b — témoins de CÂBLAGE : la loi d'audience d'un avis de capture
 * (`captureNoticeVisibility`) est APPELÉE par chaque sortie qui sert le fil, et
 * chaque témoin rougit si l'appel disparaît.
 *
 * | sortie | témoin |
 * |---|---|
 * | page `GET /conversations/:id/messages` | la requête de page ET son compte écartent l'avis pour un lecteur arrivé après le message capturé, pas pour son auteur |
 * | recherche `GET /conversations/:id/messages/search` | idem sur les deux moitiés de la recherche |
 * | rattrapage `/sync` (reconnexion) | la ligne de l'avis n'est pas servie au lecteur arrivé après |
 * | aperçu de liste (`GET /conversations`) | le `where` imbriqué de l'aperçu écarte tout avis |
 * | aperçu de remplacement (`resolveVisibleLastMessages`) | idem |
 * | aperçu poussé (`conversation:updated` recalculé) | idem, sur `emitConversationPreviewUpdate` |
 * | diffusion temps réel (socket) | le gestionnaire reçoit `captureNoticeDelivery`, jamais `broadcastMessage` |
 *
 * Les compteurs ont leurs témoins dans `captureNoticeUnreadCounts.test.ts`,
 * la diffusion et son transport REST dans `captureNoticeDelivery.test.ts` et
 * `conversation-messages-capture.test.ts`, la recherche par titre de
 * conversation dans `conversations/search.test.ts`, l'horloge du fil dans
 * `messageRemovalEffects.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';

import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn<(...args: unknown[]) => Promise<string | null>>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn<(...args: unknown[]) => Promise<boolean>>();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: unknown[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/MentionService', () => ({ resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]) }));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({ MessageTranslationService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/messaging/MessagingService', () => ({ MessagingService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/TrackingLinkService', () => ({ TrackingLinkService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/attachments', () => ({ AttachmentService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/PrivacyPreferencesService', () => ({ PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

import { registerMessagesRoutes } from '../../../routes/conversations/messages';
import { conversationListQuerySelect } from '../../../routes/conversations/core-selects';
import { syncMessages } from '../../../routes/sync/messages';
import { resolveVisibleLastMessages } from '../../../services/resolveVisibleLastMessage';
import { emitConversationPreviewUpdate } from '../../../socketio/emitConversationPreviewUpdate';

const CONV = '507f1f77bcf86cd799439101';
const READER_USER = '507f1f77bcf86cd799439122';
const READER_P = '507f1f77bcf86cd799439133';
const AUTHOR_P = '507f1f77bcf86cd799439144';
const CAPTURER_P = '507f1f77bcf86cd799439155';
const CAPTURED_ID = '507f1f77bcf86cd799439201';
const NOTICE_ID = '507f1f77bcf86cd799439202';
const SENT_AT = new Date('2026-10-08T10:00:00.000Z');

const CAPTURED: MongoDocument = {
  id: CAPTURED_ID, conversationId: CONV, senderId: AUTHOR_P, createdAt: SENT_AT, deletedAt: null,
  messageSource: 'user', messageType: 'text', expiresAt: new Date('2026-10-15T10:00:00.000Z'), metadata: null,
};
const NOTICE: MongoDocument = {
  id: NOTICE_ID, conversationId: CONV, senderId: CAPTURER_P, createdAt: new Date('2026-10-08T10:05:00.000Z'),
  updatedAt: new Date('2026-10-08T10:05:00.000Z'), deletedAt: null, messageSource: 'system', messageType: 'system',
  expiresAt: new Date('2026-10-16T10:00:00.000Z'), metadata: { kind: 'content-capture', capturedMessageId: CAPTURED_ID },
  content: 'Alice a capturé l’éphémère du 08/10/2026 à 10:00 (UTC)', originalLanguage: 'fr',
};

/** Le lecteur : arrivé APRÈS le message capturé (plancher), ou bien son auteur. */
const readerRow = (as: 'late' | 'author') => ({
  id: as === 'late' ? READER_P : AUTHOR_P,
  userId: READER_USER,
  conversationId: CONV,
  role: 'member',
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  shareLinkId: null,
  historyVisibleFrom: as === 'late' ? new Date(SENT_AT.getTime() + 1) : null,
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
});

/**
 * `message.findMany` reconnaît les deux lectures de la loi (les avis vivants,
 * puis les messages qu'ils nomment) et enregistre toutes les autres : ce sont
 * elles qui servent le fil.
 */
function messageStore() {
  const servingWheres: MongoDocument[] = [];
  const findMany = jest.fn<any>(async ({ where }: { where: MongoDocument }) => {
    const text = JSON.stringify(where);
    if (text.includes('"messageSource":"system"') && text.includes('"isSet":true')) {
      return [NOTICE].filter((row) => matchesMongoWhere(row, where));
    }
    const ids = (where.id as { in?: string[] } | undefined)?.in;
    if (ids && ids.includes(CAPTURED_ID) && !text.includes('"conversationId"')) return [CAPTURED];
    servingWheres.push(where);
    return [];
  });
  const count = jest.fn<any>(async ({ where }: { where: MongoDocument }) => {
    servingWheres.push(where);
    return 0;
  });
  return { findMany, count, servingWheres };
}

function buildApp(as: 'late' | 'author') {
  const store = messageStore();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;
  const prisma: any = {
    participant: { findFirst: jest.fn<any>().mockResolvedValue(readerRow(as)), findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: store.findMany, count: store.count },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ isAnnouncementChannel: false }) },
    conversationShareLink: { findFirst: jest.fn<any>().mockResolvedValue(null), findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    user: { findFirst: jest.fn<any>().mockResolvedValue({ systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null }) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    attachmentStatusEntry: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
  const auth = async (req: any) => {
    req.authContext = { type: 'registered', isAuthenticated: true, isAnonymous: false, userId: READER_USER, registeredUser: { id: READER_USER, role: 'USER' } };
  };
  registerMessagesRoutes(app, prisma, {} as any, auth, auth);
  return { app, store };
}

const servesNotice = (wheres: MongoDocument[]) => wheres.some((where) => matchesMongoWhere(NOTICE, where));

beforeEach(() => {
  mockResolveConversationId.mockResolvedValue(CONV);
  mockCanAccessConversation.mockResolvedValue(true);
});

describe('page — GET /conversations/:id/messages', () => {
  it('ni la page ni son compte ne servent l’avis au lecteur arrivé après le message capturé', async () => {
    const { app, store } = buildApp('late');
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV}/messages?limit=20` });
    expect(res.statusCode).toBe(200);
    expect(store.servingWheres.length).toBeGreaterThanOrEqual(2);
    expect(servesNotice(store.servingWheres)).toBe(false);
    await app.close();
  });

  it('la sert à l’auteur du message capturé', async () => {
    const { app, store } = buildApp('author');
    await app.inject({ method: 'GET', url: `/conversations/${CONV}/messages?limit=20` });
    expect(servesNotice(store.servingWheres)).toBe(true);
    await app.close();
  });
});

describe('recherche — GET /conversations/:id/messages/search', () => {
  it('ne trouve pas l’avis par son texte chez le lecteur arrivé après, le trouve chez l’auteur', async () => {
    const late = buildApp('late');
    await late.app.inject({ method: 'GET', url: `/conversations/${CONV}/messages/search?q=captur` });
    const lateWheres = late.store.servingWheres.filter((w) => JSON.stringify(w).includes('captur'));
    expect(lateWheres.length).toBeGreaterThan(0);
    expect(lateWheres.some((w) => JSON.stringify(w).includes(NOTICE_ID))).toBe(true);
    await late.app.close();

    const author = buildApp('author');
    await author.app.inject({ method: 'GET', url: `/conversations/${CONV}/messages/search?q=captur` });
    const authorWheres = author.store.servingWheres.filter((w) => JSON.stringify(w).includes('captur'));
    expect(authorWheres.some((w) => JSON.stringify(w).includes(NOTICE_ID))).toBe(false);
    await author.app.close();
  });
});

describe('rattrapage — /sync (reconnexion)', () => {
  const syncPrisma = (as: 'late' | 'author') => ({
    participant: { findMany: jest.fn<any>().mockResolvedValue([readerRow(as)]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([{ id: CONV, isAnnouncementChannel: false }]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    attachmentReaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: {
      findMany: jest.fn<any>(async ({ where }: { where: MongoDocument }) => {
        const ids = (where.id as { in?: string[] } | undefined)?.in;
        if (ids?.includes(NOTICE_ID)) return [NOTICE].filter((row) => matchesMongoWhere(row, where));
        if (ids?.includes(CAPTURED_ID)) return [CAPTURED];
        if ('updatedAt' in where || 'OR' in where) return [{ ...NOTICE, sender: null, attachments: [], translations: null }];
        return [];
      }),
    },
  });

  const servedIds = async (as: 'late' | 'author') => {
    const result = await syncMessages({
      prisma: syncPrisma(as) as never,
      identity: { kind: 'user', userId: READER_USER },
      sinceDate: new Date('2026-10-01T00:00:00.000Z'),
      cap: 50,
    });
    return [...result.added, ...result.modified].map((row) => row.id);
  };

  it('ne rejoue pas l’avis au lecteur arrivé après, le rejoue à l’auteur', async () => {
    expect(await servedIds('late')).toEqual([]);
    expect(await servedIds('author')).toEqual([NOTICE_ID]);
  });
});

describe('aperçus — l’avis n’est jamais la dernière ligne d’une conversation (#9630)', () => {
  const plain = { ...CAPTURED, id: 'plain', expiresAt: undefined };

  it('liste : le `where` imbriqué de l’aperçu écarte l’avis et garde le reste', () => {
    const where = conversationListQuerySelect(READER_USER).messages.where as MongoDocument;
    const { expiresAt: _absent, ...withoutDeadline } = plain;
    expect(matchesMongoWhere(NOTICE, where)).toBe(false);
    expect(matchesMongoWhere(withoutDeadline, where)).toBe(true);
    expect(matchesMongoWhere(CAPTURED, where)).toBe(true);
  });

  it('aperçu de remplacement : la reprise ne retombe pas sur un avis', async () => {
    const findFirst = jest.fn<any>().mockResolvedValue(null);
    const prisma: any = {
      message: { findFirst },
      userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
      userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    };
    await resolveVisibleLastMessages(prisma, {
      userId: null,
      candidates: [{ conversationId: CONV, message: { id: CAPTURED_ID, createdAt: SENT_AT } }],
      query: { select: { id: true } },
      historyFloors: new Map([[CONV, new Date(SENT_AT.getTime() + 1)]]),
    });
    const where = findFirst.mock.calls[0][0].where as MongoDocument;
    expect(matchesMongoWhere({ ...NOTICE, createdAt: new Date('2026-10-09T00:00:00.000Z') }, where)).toBe(false);
  });

  it('aperçu poussé : `conversation:updated` recalculé ne se pose pas sur un avis', async () => {
    const findFirst = jest.fn<any>().mockResolvedValue(null);
    const prisma: any = {
      participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      message: { findFirst },
    };
    const io: any = { to: () => ({ emit: () => true }) };
    await emitConversationPreviewUpdate(prisma, io, CONV, READER_USER);
    const where = findFirst.mock.calls[0][0].where as MongoDocument;
    expect(matchesMongoWhere(NOTICE, where)).toBe(false);
    expect(matchesMongoWhere(CAPTURED, where)).toBe(true);
  });
});

describe('diffusion temps réel — le gestionnaire socket reçoit la remise à l’audience', () => {
  it('`listenContentCapture` est câblé sur `captureNoticeDelivery`, jamais sur `broadcastMessage`', () => {
    const source = readFileSync(join(__dirname, '../../../socketio/MeeshySocketIOManager.ts'), 'utf8');
    const call = source.split('\n').find((line) => line.includes('listenContentCapture(socket'));
    expect(call).toBeDefined();
    expect(call).toContain('deliver: captureNoticeDelivery(');
    expect(call).not.toContain('broadcastMessage');
  });
});
