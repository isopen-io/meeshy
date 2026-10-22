/**
 * Un signalement se traite en un geste (#10394) : l'action sur le contenu et la
 * clôture du signalement partent ensemble, dans la même requête.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../services/posts/retractCommentNotifications', () => ({
  retractCommentNotifications: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../services/reports/reportResolvedNotification', () => ({
  isNewlyResolvedReportTransition: (before: string, after: string) => before !== after && ['resolved', 'rejected', 'dismissed'].includes(after),
  notifyReportResolved: jest.fn<any>().mockResolvedValue(undefined),
}));

const notifier = { createNotification: jest.fn<any>().mockResolvedValue({ id: 'n1' }) };
jest.mock('../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => notifier,
  setSharedNotificationService: jest.fn(),
}));

import { adminModerationActRoutes } from '../moderation-acts';
import { notifyReportResolved } from '../../../services/reports/reportResolvedNotification';

const ACTOR = '507f1f77bcf86cd799439032';
const AUTHOR = '507f1f77bcf86cd799439031';
const REPORTER = '507f1f77bcf86cd799439033';
const REPORT = '507f1f77bcf86cd7994390a1';
const POST = '507f1f77bcf86cd799439011';
const COMMENT = '507f1f77bcf86cd7994390c1';
const NOW = new Date('2026-10-12T10:00:00.000Z');

const reportFindUnique = jest.fn<any>();
const reportUpdate = jest.fn<any>();
const postFindMany = jest.fn<any>();
const postUpdateMany = jest.fn<any>();
const postUpdate = jest.fn<any>();
const postFindUnique = jest.fn<any>();
const auditCreateMany = jest.fn<any>();
const auditCreate = jest.fn<any>();
const userFindMany = jest.fn<any>();
const commentFindFirst = jest.fn<any>();
const commentFindUnique = jest.fn<any>();
const commentFindMany = jest.fn<any>();
const commentUpdateMany = jest.fn<any>();
const commentUpdate = jest.fn<any>();
const transaction = jest.fn<any>((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

const prisma = {
  report: { findUnique: reportFindUnique, update: reportUpdate },
  post: { findMany: postFindMany, updateMany: postUpdateMany, update: postUpdate, findUnique: postFindUnique },
  postComment: { findFirst: commentFindFirst, findUnique: commentFindUnique, findMany: commentFindMany, updateMany: commentUpdateMany, update: commentUpdate },
  adminAuditLog: { createMany: auditCreateMany, create: auditCreate },
  user: { findMany: userFindMany, findUnique: jest.fn<any>().mockResolvedValue({ systemLanguage: 'fr' }) },
  notification: { findMany: jest.fn<any>().mockResolvedValue([]), deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  userEngagement: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  $transaction: transaction,
} as any;

const socialEvents = {
  broadcastPostDeleted: jest.fn<any>().mockResolvedValue(undefined),
  broadcastStoryDeleted: jest.fn<any>().mockResolvedValue(undefined),
  broadcastStatusDeleted: jest.fn<any>().mockResolvedValue(undefined),
  broadcastCommentDeleted: jest.fn<any>().mockResolvedValue(undefined),
};

async function buildApp(role: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('socialEvents', socialEvents as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, userId: ACTOR, registeredUser: { id: ACTOR, role } };
  });
  await app.register(adminModerationActRoutes, { prefix: '/admin' });
  await app.ready();
  return app;
}

const report = (over: Record<string, unknown> = {}) => ({
  id: REPORT,
  reportedType: 'post',
  reportedEntityId: POST,
  reporterId: REPORTER,
  reportType: 'spam',
  status: 'pending',
  actionTaken: null,
  moderatorId: null,
  ...over,
});

const postRow = (over: Record<string, unknown> = {}) => ({
  id: POST,
  authorId: AUTHOR,
  type: 'POST',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  moderationHiddenAt: null,
  moderationHiddenById: null,
  moderationPriorVisibility: null,
  repostOfId: null,
  originalRepostOfId: null,
  expiresAt: null,
  ...over,
});

const viewRow = (over: Record<string, unknown> = {}) => ({
  id: POST,
  visibility: 'PRIVATE',
  moderationHiddenAt: NOW,
  moderationPriorVisibility: 'PUBLIC',
  deletedAt: null,
  expiresAt: null,
  updatedAt: NOW,
  ...over,
});

const act = (app: FastifyInstance, payload: Record<string, unknown>) => app.inject({ method: 'POST', url: `/admin/reports/${REPORT}/act`, payload });

beforeEach(() => {
  jest.clearAllMocks();
  userFindMany.mockImplementation(async (args: any) => [{ id: AUTHOR, role: 'USER' }].filter((u) => args.where.id.in.includes(u.id)));
  postUpdateMany.mockResolvedValue({ count: 1 });
  auditCreateMany.mockResolvedValue({ count: 1 });
  auditCreate.mockResolvedValue({});
  reportUpdate.mockImplementation(async (args: any) => ({ ...report(), ...args.data }));
  postFindUnique.mockResolvedValue({ authorId: AUTHOR });
  commentFindUnique.mockResolvedValue({ authorId: AUTHOR });
  postFindMany.mockImplementation(async (args: any) => ('updatedAt' in (args.select ?? {}) ? [viewRow()] : [postRow()]));
});

describe('POST /admin/reports/:reportId/act — sur une publication', () => {
  it('met la publication hors ligne ET résout le signalement dans la même transaction, avec leurs deux journaux', async () => {
    reportFindUnique.mockResolvedValue(report());
    const app = await buildApp('ADMIN');

    const res = await act(app, { action: 'take-offline', reason: 'Spam avéré' });

    expect(res.statusCode).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect((postUpdateMany.mock.calls[0]?.[0] as any).data).toMatchObject({ visibility: 'PRIVATE', moderationHiddenById: ACTOR });
    const update = reportUpdate.mock.calls[0]?.[0] as any;
    expect(update.where).toEqual({ id: REPORT });
    expect(update.data).toMatchObject({ status: 'resolved', actionTaken: 'content_removed', moderatorId: ACTOR });
    expect(update.data.resolvedAt).toBeInstanceOf(Date);
    expect(JSON.parse((auditCreateMany.mock.calls[0]?.[0] as any).data[0].metadata)).toMatchObject({ gesture: 'take-offline', reportId: REPORT, reason: 'Spam avéré' });
    expect((auditCreate.mock.calls[0]?.[0] as any).data).toMatchObject({ action: 'ADMIN_REPORT_UPDATED', entity: 'Report', entityId: REPORT, adminId: ACTOR });
    expect(notifyReportResolved).toHaveBeenCalled();
    expect(res.json().data).toEqual({
      report: { id: REPORT, status: 'resolved' },
      target: { id: POST, state: 'offline', visibility: 'PRIVATE', moderationHiddenAt: NOW.toISOString(), moderationPriorVisibility: 'PUBLIC', updatedAt: NOW.toISOString() },
    });
    await app.close();
  });

  it('« mettre en privé » passe la publication en PRIVATE, audience retenue', async () => {
    reportFindUnique.mockResolvedValue(report({ reportedType: 'story' }));
    const app = await buildApp('BIGBOSS');
    const res = await act(app, { action: 'make-private' });
    expect(res.statusCode).toBe(200);
    expect((postUpdateMany.mock.calls[0]?.[0] as any).data).toMatchObject({ visibility: 'PRIVATE', moderationPriorVisibility: 'PUBLIC', moderationHiddenAt: null });
    await app.close();
  });

  it("refus sur la publication (rang supérieur) : rien n'est écrit, le signalement reste ouvert", async () => {
    reportFindUnique.mockResolvedValue(report());
    userFindMany.mockResolvedValue([{ id: AUTHOR, role: 'ADMIN' }]);
    const app = await buildApp('MODERATOR');
    const res = await act(app, { action: 'take-offline', reason: 'Spam avéré' });
    expect(res.statusCode).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
    expect(reportUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('une publication changée pendant le geste : 409, le signalement reste ouvert', async () => {
    reportFindUnique.mockResolvedValue(report());
    postUpdateMany.mockResolvedValue({ count: 0 });
    const app = await buildApp('BIGBOSS');
    const res = await act(app, { action: 'take-offline' });
    expect(res.statusCode).toBe(409);
    expect(reportUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse une action qui ne vaut pas pour le contenu signalé (hors ligne sur un commentaire)", async () => {
    reportFindUnique.mockResolvedValue(report({ reportedType: 'comment', reportedEntityId: COMMENT }));
    const app = await buildApp('BIGBOSS');
    const res = await act(app, { action: 'take-offline' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('ACTION_NOT_APPLICABLE');
    await app.close();
  });
});

describe('POST /admin/reports/:reportId/act — sur un commentaire', () => {
  it("retire le commentaire (sous-arbre compris), le dit aux clients, et résout le signalement", async () => {
    reportFindUnique.mockResolvedValue(report({ reportedType: 'comment', reportedEntityId: COMMENT }));
    commentFindFirst.mockResolvedValue({ id: COMMENT, authorId: AUTHOR, postId: POST, parentId: null });
    commentFindMany.mockResolvedValue([]);
    commentUpdateMany.mockResolvedValue({ count: 1 });
    postUpdate.mockResolvedValue({});
    postFindUnique.mockResolvedValue({ authorId: AUTHOR, commentCount: 0, visibility: 'PUBLIC', visibilityUserIds: [], isQuote: false, repostOfId: null });
    const app = await buildApp('ADMIN');

    const res = await act(app, { action: 'remove-comment', reason: 'Harcèlement' });

    expect(res.statusCode).toBe(200);
    expect(commentUpdateMany.mock.calls[0]?.[0]).toMatchObject({ where: { id: { in: [COMMENT] } } });
    expect(socialEvents.broadcastCommentDeleted).toHaveBeenCalled();
    expect(reportUpdate.mock.calls[0]?.[0]).toMatchObject({ data: { status: 'resolved', actionTaken: 'content_removed' } });
    const audits = auditCreate.mock.calls.map((call) => (call[0] as any).data.action);
    expect(audits).toEqual(['REMOVE_CONTENT', 'ADMIN_REPORT_UPDATED']);
    expect(res.json().data.target.commentId).toBe(COMMENT);
    await app.close();
  });

  it('refuse de retirer son propre commentaire', async () => {
    reportFindUnique.mockResolvedValue(report({ reportedType: 'comment', reportedEntityId: COMMENT }));
    commentFindFirst.mockResolvedValue({ id: COMMENT, authorId: ACTOR, postId: POST, parentId: null });
    const app = await buildApp('ADMIN');
    const res = await act(app, { action: 'remove-comment', reason: 'moi-même' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('SELF_MODERATION');
    expect(commentUpdateMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /admin/reports/:reportId/act — classer', () => {
  it('classe le signalement sans toucher au contenu', async () => {
    reportFindUnique.mockResolvedValue(report());
    const app = await buildApp('BIGBOSS');
    const res = await act(app, { action: 'dismiss' });
    expect(res.statusCode).toBe(200);
    expect(postUpdateMany).not.toHaveBeenCalled();
    expect(reportUpdate.mock.calls[0]?.[0]).toMatchObject({ data: { status: 'dismissed', actionTaken: 'none', moderatorId: ACTOR } });
    expect(res.json().data).toEqual({ report: { id: REPORT, status: 'dismissed' }, target: null });
    await app.close();
  });

  it("refuse de classer un signalement qui vise l'acteur", async () => {
    reportFindUnique.mockResolvedValue(report({ reportedType: 'user', reportedEntityId: ACTOR }));
    const app = await buildApp('ADMIN');
    const res = await act(app, { action: 'dismiss', reason: 'Non fondé' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('SELF_MODERATION');
    await app.close();
  });

  it.each([
    ['post', POST],
    ['story', POST],
  ])("refuse de classer le signalement de SA propre publication (%s) : 403 SELF_MODERATION, rien d'écrit, le refus journalisé (#10458)", async (reportedType, reportedEntityId) => {
    reportFindUnique.mockResolvedValue(report({ reportedType, reportedEntityId }));
    postFindUnique.mockResolvedValue({ authorId: ACTOR });
    const app = await buildApp('MODERATOR');
    const res = await act(app, { action: 'dismiss', reason: 'Non fondé' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('SELF_MODERATION');
    expect(reportUpdate).not.toHaveBeenCalled();
    expect(notifyReportResolved).not.toHaveBeenCalled();
    expect((auditCreate.mock.calls[0]?.[0] as any).data).toMatchObject({ action: 'ADMIN_REPORT_SELF_MODERATION_REFUSED', entity: 'Report', entityId: REPORT, adminId: ACTOR });
    expect(JSON.parse((auditCreate.mock.calls[0]?.[0] as any).data.metadata)).toEqual({ code: 'SELF_MODERATION', gesture: 'act', act: 'dismiss', reportedType });
    await app.close();
  });

  it('refuse de classer le signalement de SON propre commentaire, même retiré entre-temps', async () => {
    reportFindUnique.mockResolvedValue(report({ reportedType: 'comment', reportedEntityId: COMMENT }));
    commentFindUnique.mockResolvedValue({ authorId: ACTOR });
    const app = await buildApp('ADMIN');
    const res = await act(app, { action: 'dismiss', reason: 'Non fondé' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('SELF_MODERATION');
    expect(reportUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it("classe le signalement d'une publication disparue : plus d'auteur à protéger", async () => {
    reportFindUnique.mockResolvedValue(report());
    postFindUnique.mockResolvedValue(null);
    const app = await buildApp('ADMIN');
    expect((await act(app, { action: 'dismiss', reason: 'Non fondé' })).statusCode).toBe(200);
    await app.close();
  });

  it('404 sur un signalement inconnu ; 400 sans motif hors du rang souverain', async () => {
    reportFindUnique.mockResolvedValue(null);
    const app = await buildApp('ADMIN');
    expect((await act(app, { action: 'dismiss', reason: 'Non fondé' })).statusCode).toBe(404);
    expect((await act(app, { action: 'dismiss' })).statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /admin/comments/:commentId/remove', () => {
  it('retire un commentaire depuis la fiche de sa publication, journalisé REMOVE_CONTENT', async () => {
    commentFindFirst.mockResolvedValue({ id: COMMENT, authorId: AUTHOR, postId: POST, parentId: null });
    commentFindMany.mockResolvedValue([]);
    commentUpdateMany.mockResolvedValue({ count: 1 });
    postUpdate.mockResolvedValue({});
    postFindUnique.mockResolvedValue({ authorId: AUTHOR, commentCount: 0, visibility: 'PUBLIC', visibilityUserIds: [], isQuote: false, repostOfId: null });
    const app = await buildApp('BIGBOSS');
    const res = await app.inject({ method: 'POST', url: `/admin/comments/${COMMENT}/remove`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect((auditCreate.mock.calls[0]?.[0] as any).data).toMatchObject({ action: 'REMOVE_CONTENT', entity: 'Comment', entityId: COMMENT, userId: AUTHOR });
    expect(res.json().data).toMatchObject({ commentId: COMMENT });
    await app.close();
  });

  it('404 pour un commentaire déjà retiré', async () => {
    commentFindFirst.mockResolvedValue(null);
    const app = await buildApp('BIGBOSS');
    const res = await app.inject({ method: 'POST', url: `/admin/comments/${COMMENT}/remove`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("un retrait de la console prévient l'auteur (#11158)", () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const removedFor = () => notifier.createNotification.mock.calls.map(([call]) => call as { userId: string; type: string; title: string; content: string; metadata: Record<string, unknown> });
  const commentFixtures = () => {
    commentFindFirst.mockResolvedValue({ id: COMMENT, authorId: AUTHOR, postId: POST, parentId: null });
    commentFindMany.mockResolvedValue([]);
    commentUpdateMany.mockResolvedValue({ count: 1 });
    postUpdate.mockResolvedValue({});
    postFindUnique.mockResolvedValue({ authorId: AUTHOR, commentCount: 0, visibility: 'PUBLIC', visibilityUserIds: [], isQuote: false, repostOfId: null });
  };

  it('signalement traité par « hors ligne » : content_removed à l’auteur, avec le motif', async () => {
    reportFindUnique.mockResolvedValue(report());
    const app = await buildApp('ADMIN');
    expect((await act(app, { action: 'take-offline', reason: 'Spam avéré' })).statusCode).toBe(200);
    await flush();
    expect(removedFor()).toEqual([
      expect.objectContaining({ userId: AUTHOR, type: 'content_removed', content: 'Motif : Spam avéré', metadata: { contentType: 'post', contentId: POST, postId: POST, reason: 'Spam avéré' } }),
    ]);
    await app.close();
  });

  it('signalement traité par « retirer le commentaire » : content_removed à l’auteur du commentaire', async () => {
    reportFindUnique.mockResolvedValue(report({ reportedType: 'comment', reportedEntityId: COMMENT }));
    commentFixtures();
    const app = await buildApp('ADMIN');
    expect((await act(app, { action: 'remove-comment', reason: 'Harcèlement' })).statusCode).toBe(200);
    await flush();
    expect(removedFor().map((call) => [call.userId, call.metadata])).toEqual([[AUTHOR, { contentType: 'comment', contentId: COMMENT, postId: POST, reason: 'Harcèlement' }]]);
    await app.close();
  });

  it('retrait direct d’un commentaire par le rang souverain sans motif : la notification part sans ligne motif', async () => {
    commentFixtures();
    const app = await buildApp('BIGBOSS');
    expect((await app.inject({ method: 'POST', url: `/admin/comments/${COMMENT}/remove`, payload: {} })).statusCode).toBe(200);
    await flush();
    const [call] = removedFor();
    expect(call).toMatchObject({ userId: AUTHOR, type: 'content_removed', content: '' });
    expect(call?.metadata).toEqual({ contentType: 'comment', contentId: COMMENT, postId: POST });
    await app.close();
  });

  it('signalement traité par « mettre en privé » : l’auteur est prévenu que sa publication est privée', async () => {
    reportFindUnique.mockResolvedValue(report({ reportedType: 'story' }));
    postFindMany.mockImplementation(async (args: any) => ('updatedAt' in (args.select ?? {}) ? [viewRow({ moderationHiddenAt: null })] : [postRow({ type: 'STORY' })]));
    const app = await buildApp('BIGBOSS');
    expect((await act(app, { action: 'make-private' })).statusCode).toBe(200);
    await flush();
    expect(removedFor()).toEqual([
      expect.objectContaining({ userId: AUTHOR, title: 'Votre story a été rendue privée par un administrateur', content: '', metadata: { contentType: 'story', contentId: POST, postId: POST, madePrivate: true } }),
    ]);
    await app.close();
  });

  it('ni classer, ni un refus ne préviennent l’auteur', async () => {
    reportFindUnique.mockResolvedValue(report());
    const app = await buildApp('BIGBOSS');
    await act(app, { action: 'dismiss' });
    userFindMany.mockResolvedValue([{ id: AUTHOR, role: 'BIGBOSS' }]);
    await act(app, { action: 'take-offline' });
    await flush();
    expect(removedFor()).toEqual([]);
    await app.close();
  });
});
