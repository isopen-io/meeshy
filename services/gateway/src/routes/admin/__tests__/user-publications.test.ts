/**
 * Les publications d'un membre, vues et modérées depuis sa fiche (#10315).
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

const notifier = { createNotification: jest.fn<any>().mockResolvedValue({ id: 'n1' }) };
jest.mock('../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => notifier,
  setSharedNotificationService: jest.fn(),
}));

import { registerUserPublicationRoutes } from '../user-publications';

const AUTHOR = '507f1f77bcf86cd799439031';
const ACTOR = '507f1f77bcf86cd799439032';
const P1 = '507f1f77bcf86cd799439011';
const P2 = '507f1f77bcf86cd799439012';
const FOREIGN = '507f1f77bcf86cd799439013';

const postFindMany = jest.fn<any>();
const postCount = jest.fn<any>();
const postUpdateMany = jest.fn<any>();
const auditCreateMany = jest.fn<any>();
const userFindUnique = jest.fn<any>();
const userFindMany = jest.fn<any>();
const notificationFindMany = jest.fn<any>().mockResolvedValue([]);
const transaction = jest.fn<any>((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

const prisma = {
  post: { findMany: postFindMany, count: postCount, updateMany: postUpdateMany },
  adminAuditLog: { createMany: auditCreateMany },
  user: { findUnique: userFindUnique, findMany: userFindMany },
  notification: { findMany: notificationFindMany, deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  $transaction: transaction,
} as any;

const socialEvents = {
  broadcastPostDeleted: jest.fn<any>().mockResolvedValue(undefined),
  broadcastStoryDeleted: jest.fn<any>().mockResolvedValue(undefined),
  broadcastStatusDeleted: jest.fn<any>().mockResolvedValue(undefined),
};

async function buildApp(role: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('socialEvents', socialEvents as any);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, userId: ACTOR, registeredUser: { id: ACTOR, role } };
  });
  registerUserPublicationRoutes(app);
  await app.ready();
  return app;
}

const row = (over: Record<string, unknown> = {}) => ({
  id: P1,
  authorId: AUTHOR,
  type: 'POST',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  moderationHiddenAt: null,
  moderationHiddenById: null,
  moderationPriorVisibility: null,
  repostOfId: null,
  originalRepostOfId: null,
  ...over,
});

const moderate = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/admin/users/${AUTHOR}/publications/moderation`, payload });

beforeEach(() => {
  jest.clearAllMocks();
  userFindUnique.mockResolvedValue({ role: 'USER' });
  userFindMany.mockResolvedValue([]);
  postUpdateMany.mockResolvedValue({ count: 1 });
  auditCreateMany.mockResolvedValue({ count: 1 });
});

describe('GET /admin/users/:userId/publications', () => {
  it("sert ses publications avec vignette, type, audience et état — de l'auteur seulement", async () => {
    postFindMany.mockResolvedValue([
      {
        id: P1,
        type: 'REEL',
        visibility: 'PRIVATE',
        content: 'Bonjour',
        createdAt: new Date('2026-10-10T10:00:00Z'),
        expiresAt: null,
        deletedAt: null,
        moderationHiddenAt: new Date('2026-10-11T10:00:00Z'),
        moderationPriorVisibility: 'PUBLIC',
        media: [{ mimeType: 'video/mp4', fileUrl: '/f/v.mp4', thumbnailUrl: '/f/v.jpg' }],
        _count: { media: 2 },
      },
    ]);
    postCount.mockResolvedValue(1);
    const app = await buildApp('MODERATOR');

    const res = await app.inject({ method: 'GET', url: `/admin/users/${AUTHOR}/publications?limit=10` });

    expect(res.statusCode).toBe(200);
    expect(postFindMany.mock.calls[0]?.[0]).toMatchObject({ where: { authorId: AUTHOR }, take: 10, orderBy: { createdAt: 'desc' } });
    const body = res.json();
    expect(body.data).toEqual([
      {
        id: P1,
        type: 'REEL',
        visibility: 'PRIVATE',
        state: 'offline',
        contentPreview: 'Bonjour',
        createdAt: '2026-10-10T10:00:00.000Z',
        expiresAt: null,
        deletedAt: null,
        moderationHiddenAt: '2026-10-11T10:00:00.000Z',
        moderationPriorVisibility: 'PUBLIC',
        mediaCount: 2,
        thumbnail: { url: '/f/v.jpg', mimeType: 'video/mp4' },
      },
    ]);
    expect(body.pagination).toEqual({ total: 1, limit: 10, offset: 0, hasMore: false });
    await app.close();
  });

  it("refuse un rang sans droit de modération (AUDIT)", async () => {
    const app = await buildApp('AUDIT');
    const res = await app.inject({ method: 'GET', url: `/admin/users/${AUTHOR}/publications` });
    expect(res.statusCode).toBe(403);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /admin/users/:userId/publications/moderation', () => {
  it("met hors ligne : audience forcée en PRIVATE, retrait daté, audience retenue, journal par publication avec l'état d'avant", async () => {
    postFindMany.mockResolvedValue([row({ id: P1, visibility: 'FRIENDS' }), row({ id: P2, type: 'STORY', visibility: 'PRIVATE' })]);
    const app = await buildApp('ADMIN');

    const res = await moderate(app, { action: 'take-offline', postIds: [P1, P2, FOREIGN], reason: 'Contenu signalé' });

    expect(res.statusCode).toBe(200);
    expect(postFindMany.mock.calls[0]?.[0]).toMatchObject({ where: { id: { in: [P1, P2, FOREIGN] }, authorId: AUTHOR } });
    const writes = postUpdateMany.mock.calls.map((call) => call[0] as any);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ where: { id: P1, authorId: AUTHOR, visibility: 'FRIENDS' }, data: { visibility: 'PRIVATE', moderationPriorVisibility: 'FRIENDS', moderationHiddenById: ACTOR } });
    expect(writes[0].data.moderationHiddenAt).toBeInstanceOf(Date);
    expect(writes[1].data).toMatchObject({ visibility: 'PRIVATE', moderationPriorVisibility: null });

    const audit = (auditCreateMany.mock.calls[0]?.[0] as any).data;
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ userId: AUTHOR, adminId: ACTOR, action: 'MODERATE_POST', entity: 'Post', entityId: P1 });
    expect(JSON.parse(audit[0].changes).visibility).toEqual({ before: 'FRIENDS', after: 'PRIVATE' });
    expect(JSON.parse(audit[0].metadata)).toMatchObject({ action: 'take-offline', reason: 'Contenu signalé' });
    expect(transaction).toHaveBeenCalledTimes(1);

    expect(socialEvents.broadcastPostDeleted).toHaveBeenCalledWith(P1, AUTHOR);
    expect(socialEvents.broadcastStoryDeleted).not.toHaveBeenCalled();

    expect(res.json().data).toMatchObject({ action: 'take-offline', updated: 2, unchanged: 0, skipped: 1 });
    expect(res.json().data.results[2]).toEqual({ postId: FOREIGN, outcome: 'skipped', visibility: null, moderationHiddenAt: null });
    await app.close();
  });

  it("remet en ligne avec l'audience que l'auteur avait choisie, sans rien annoncer comme retiré", async () => {
    postFindMany.mockResolvedValue([row({ visibility: 'PRIVATE', moderationHiddenAt: new Date('2026-10-11T00:00:00Z'), moderationHiddenById: ACTOR, moderationPriorVisibility: 'COMMUNITY' })]);
    const app = await buildApp('ADMIN');

    const res = await moderate(app, { action: 'restore', postIds: [P1], reason: 'Erreur de modération' });

    expect(res.statusCode).toBe(200);
    expect((postUpdateMany.mock.calls[0]?.[0] as any).data).toEqual({ visibility: 'COMMUNITY', moderationHiddenAt: null, moderationHiddenById: null, moderationPriorVisibility: null });
    expect(socialEvents.broadcastPostDeleted).not.toHaveBeenCalled();
    expect(res.json().data.results[0]).toEqual({ postId: P1, outcome: 'updated', visibility: 'COMMUNITY', moderationHiddenAt: null });
    await app.close();
  });

  it("n'écrit ni ne journalise rien quand le geste est déjà fait", async () => {
    postFindMany.mockResolvedValue([row({ visibility: 'PRIVATE' })]);
    const app = await buildApp('ADMIN');

    const res = await moderate(app, { action: 'make-private', postIds: [P1], reason: 'Doublon' });

    expect(res.statusCode).toBe(200);
    expect(transaction).not.toHaveBeenCalled();
    expect(res.json().data).toMatchObject({ updated: 0, unchanged: 1, skipped: 0 });
    await app.close();
  });

  it('exige un motif hors du rang souverain', async () => {
    const app = await buildApp('ADMIN');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1] });
    expect(res.statusCode).toBe(400);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('laisse le rang souverain agir sans motif', async () => {
    postFindMany.mockResolvedValue([row()]);
    const app = await buildApp('BIGBOSS');
    const res = await moderate(app, { action: 'make-private', postIds: [P1] });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse((auditCreateMany.mock.calls[0]?.[0] as any).data[0].metadata).reason).toBeNull();
    await app.close();
  });

  it('borne le lot', async () => {
    const app = await buildApp('ADMIN');
    const ids = Array.from({ length: 51 }, (_, i) => `507f1f77bcf86cd7994${String(i).padStart(5, '0')}`);
    const res = await moderate(app, { action: 'make-private', postIds: ids, reason: 'Spam massif' });
    expect(res.statusCode).toBe(400);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse un modérateur sur les publications d'un rang supérieur — sans rien écrire", async () => {
    userFindUnique.mockResolvedValue({ role: 'ADMIN' });
    const app = await buildApp('MODERATOR');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(res.statusCode).toBe(403);
    expect(postFindMany).not.toHaveBeenCalled();
    expect(postUpdateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('admet un modérateur sur un membre ordinaire', async () => {
    postFindMany.mockResolvedValue([row()]);
    const app = await buildApp('MODERATOR');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("refuse un rang sans droit de modération, même sur un membre ordinaire", async () => {
    const app = await buildApp('ANALYST');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(res.statusCode).toBe(403);
    expect(postUpdateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse de modérer ses propres publications — on ne lève pas le retrait que son supérieur a posé sur soi", async () => {
    const app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'POST', url: `/admin/users/${ACTOR}/publications/moderation`, payload: { action: 'restore', postIds: [P1], reason: 'moi' } });
    expect(res.statusCode).toBe(403);
    expect(postUpdateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("ne lève pas le retrait posé par un rang supérieur : la publication se dit `outranked`, le reste du lot passe", async () => {
    const BOSS = '507f1f77bcf86cd799439040';
    const OWN_HOLD = new Date('2026-10-11T00:00:00Z');
    postFindMany.mockResolvedValue([
      row({ id: P1, visibility: 'PRIVATE', moderationHiddenAt: OWN_HOLD, moderationHiddenById: BOSS, moderationPriorVisibility: 'PUBLIC' }),
      row({ id: P2, visibility: 'PRIVATE', moderationHiddenAt: OWN_HOLD, moderationHiddenById: ACTOR, moderationPriorVisibility: 'FRIENDS' }),
    ]);
    userFindMany.mockResolvedValue([{ id: BOSS, role: 'BIGBOSS' }]);
    const app = await buildApp('MODERATOR');

    const res = await moderate(app, { action: 'restore', postIds: [P1, P2], reason: 'Erreur de modération' });

    expect(res.statusCode).toBe(200);
    expect(postUpdateMany.mock.calls.map((call) => (call[0] as any).where.id)).toEqual([P2]);
    expect(res.json().data.results.map((r: any) => r.outcome)).toEqual(['outranked', 'updated']);
    await app.close();
  });

  it("un retrait au signataire introuvable ou inconnu ne se lève que du rang souverain — fail-closed", async () => {
    const held = [
      row({ id: P1, visibility: 'PRIVATE', moderationHiddenAt: new Date('2026-10-11T00:00:00Z'), moderationHiddenById: '507f1f77bcf86cd799439041' }),
      row({ id: P2, visibility: 'PRIVATE', moderationHiddenAt: new Date('2026-10-11T00:00:00Z'), moderationHiddenById: null }),
    ];
    postFindMany.mockResolvedValue(held);
    const admin = await buildApp('ADMIN');
    const refused = await moderate(admin, { action: 'restore', postIds: [P1, P2], reason: 'Erreur de modération' });
    expect(refused.json().data.results.map((r: any) => r.outcome)).toEqual(['outranked', 'outranked']);
    expect(postUpdateMany).not.toHaveBeenCalled();
    await admin.close();

    postFindMany.mockResolvedValue(held);
    const boss = await buildApp('BIGBOSS');
    const lifted = await moderate(boss, { action: 'restore', postIds: [P1, P2] });
    expect(lifted.json().data.results.map((r: any) => r.outcome)).toEqual(['updated', 'updated']);
    await boss.close();
  });

  it("un conflit d'écriture qui avorte la transaction se dit `conflict`, sans 500", async () => {
    postFindMany.mockResolvedValue([row()]);
    transaction.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Write conflict'), { code: 'P2034' });
    });
    const app = await buildApp('ADMIN');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.results[0].outcome).toBe('conflict');
    await app.close();
  });

  it("met hors ligne, avec une story, ses COPIES republiées par d'autres — datées et signées comme elle, journalisées chez leur auteur", async () => {
    const REPOSTER = '507f1f77bcf86cd799439050';
    const COPY = '507f1f77bcf86cd799439051';
    postFindMany
      .mockResolvedValueOnce([row({ id: P1, type: 'STORY', visibility: 'FRIENDS' })])
      .mockResolvedValueOnce([row({ id: COPY, authorId: REPOSTER, type: 'STORY', visibility: 'PUBLIC', repostOfId: P1 })]);
    userFindMany.mockResolvedValue([{ id: REPOSTER, role: 'USER' }]);
    const app = await buildApp('ADMIN');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(res.statusCode).toBe(200);
    const writes = postUpdateMany.mock.calls.map((call) => call[0] as any);
    expect(writes.map((w) => w.where.id)).toEqual([P1, COPY]);
    expect(writes[1].data.moderationHiddenAt).toEqual(writes[0].data.moderationHiddenAt);
    expect(writes[1].data).toMatchObject({ visibility: 'PRIVATE', moderationHiddenById: ACTOR, moderationPriorVisibility: 'PUBLIC' });
    const audit = (auditCreateMany.mock.calls[0]?.[0] as any).data;
    expect(audit[1]).toMatchObject({ userId: REPOSTER, entityId: COPY });
    expect(JSON.parse(audit[1].metadata).copyOf).toBe(P1);
    expect(res.json().data.results).toHaveLength(1);
    await app.close();
  });

  it("ne remet en ligne que les copies que CE retrait avait emportées", async () => {
    const at = new Date('2026-10-11T00:00:00Z');
    const held = { visibility: 'PRIVATE', moderationHiddenAt: at, moderationHiddenById: ACTOR };
    postFindMany
      .mockResolvedValueOnce([row({ id: P1, type: 'STORY', ...held, moderationPriorVisibility: 'FRIENDS' })])
      .mockResolvedValueOnce([
        row({ id: '507f1f77bcf86cd799439052', authorId: '507f1f77bcf86cd799439050', repostOfId: P1, ...held, moderationPriorVisibility: 'PUBLIC' }),
        row({ id: '507f1f77bcf86cd799439053', authorId: '507f1f77bcf86cd799439050', repostOfId: P1, ...held, moderationHiddenAt: new Date('2026-10-09T00:00:00Z') }),
      ]);
    userFindMany.mockResolvedValue([{ id: '507f1f77bcf86cd799439050', role: 'USER' }]);
    const app = await buildApp('ADMIN');
    await moderate(app, { action: 'restore', postIds: [P1], reason: 'Erreur de modération' });
    expect(postUpdateMany.mock.calls.map((call) => (call[0] as any).where.id)).toEqual([P1, '507f1f77bcf86cd799439052']);
    await app.close();
  });

  it("n'écrase pas une publication changée entre la lecture et l'écriture, et ne la journalise pas", async () => {
    postFindMany.mockResolvedValue([row()]);
    postUpdateMany.mockResolvedValue({ count: 0 });
    const app = await buildApp('ADMIN');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(res.json().data.results[0].outcome).toBe('conflict');
    expect(auditCreateMany).not.toHaveBeenCalled();
    expect(socialEvents.broadcastPostDeleted).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET — la hiérarchie vaut aussi pour la lecture', () => {
  it("refuse à un modérateur la liste des publications d'un administrateur", async () => {
    userFindUnique.mockResolvedValue({ role: 'ADMIN' });
    const app = await buildApp('MODERATOR');
    const res = await app.inject({ method: 'GET', url: `/admin/users/${AUTHOR}/publications` });
    expect(res.statusCode).toBe(403);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('troisième passe — hiérarchie des COPIES et signataire au rang inconnu', () => {
  const BOSS = '507f1f77bcf86cd799439060';
  const PEER = '507f1f77bcf86cd799439061';
  const LOW = '507f1f77bcf86cd799439062';
  const COPY_BOSS = '507f1f77bcf86cd799439071';
  const COPY_PEER = '507f1f77bcf86cd799439072';
  const COPY_LOW = '507f1f77bcf86cd799439073';

  it("un modérateur n'emporte pas la copie d'un rang égal ou supérieur : elle reste intacte et se compte à part", async () => {
    postFindMany
      .mockResolvedValueOnce([row({ id: P1, type: 'STORY', visibility: 'FRIENDS' })])
      .mockResolvedValueOnce([
        row({ id: COPY_BOSS, authorId: BOSS, type: 'STORY', visibility: 'PUBLIC', repostOfId: P1 }),
        row({ id: COPY_PEER, authorId: PEER, type: 'STORY', visibility: 'PUBLIC', repostOfId: P1 }),
        row({ id: COPY_LOW, authorId: LOW, type: 'STORY', visibility: 'PUBLIC', repostOfId: P1 }),
      ]);
    userFindMany.mockImplementation(async (args: any) =>
      [
        { id: BOSS, role: 'BIGBOSS' },
        { id: PEER, role: 'MODERATOR' },
        { id: LOW, role: 'USER' },
      ].filter((u) => args.where.id.in.includes(u.id)),
    );
    const app = await buildApp('MODERATOR');

    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });

    expect(res.statusCode).toBe(200);
    expect(postUpdateMany.mock.calls.map((call) => (call[0] as any).where.id)).toEqual([P1, COPY_LOW]);
    expect(res.json().data.outrankedCopies).toBe(2);
    await app.close();
  });

  it("une copie dont l'auteur est introuvable ou au rang inconnu n'est pas touchée — fail-closed", async () => {
    postFindMany
      .mockResolvedValueOnce([row({ id: P1, type: 'STORY', visibility: 'FRIENDS' })])
      .mockResolvedValueOnce([
        row({ id: COPY_BOSS, authorId: BOSS, type: 'STORY', visibility: 'PUBLIC', repostOfId: P1 }),
        row({ id: COPY_PEER, authorId: PEER, type: 'STORY', visibility: 'PUBLIC', repostOfId: P1 }),
      ]);
    userFindMany.mockImplementation(async (args: any) => [{ id: PEER, role: 'WHATEVER' }].filter((u) => args.where.id.in.includes(u.id)));
    const app = await buildApp('ADMIN');
    const res = await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(postUpdateMany.mock.calls.map((call) => (call[0] as any).where.id)).toEqual([P1]);
    expect(res.json().data.outrankedCopies).toBe(2);
    await app.close();
  });

  it("un retrait signé par un compte au rang INCONNU (hors matrice) ne se lève que du rang souverain", async () => {
    const STRANGE = '507f1f77bcf86cd799439063';
    const held = () => [row({ id: P1, visibility: 'PRIVATE', moderationHiddenAt: new Date('2026-10-11T00:00:00Z'), moderationHiddenById: STRANGE, moderationPriorVisibility: 'PUBLIC' })];
    userFindMany.mockResolvedValue([{ id: STRANGE, role: 'AGENT' }]);
    postFindMany.mockResolvedValue(held());
    const moderator = await buildApp('MODERATOR');
    const refused = await moderate(moderator, { action: 'restore', postIds: [P1], reason: 'Erreur de modération' });
    expect(refused.json().data.results[0].outcome).toBe('outranked');
    expect(postUpdateMany).not.toHaveBeenCalled();
    await moderator.close();
  });
});

describe('troisième passe — les bornes échouent FERMÉES', () => {
  it.each(['0', '-1', '1.5', 'abc', '51', '999999', ''])("refuse limit=%p sans interroger la base", async (limit) => {
    const app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: `/admin/users/${AUTHOR}/publications?limit=${limit}` });
    expect(res.statusCode).toBe(400);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuse un limit répété (tableau) et un offset négatif", async () => {
    const app = await buildApp('ADMIN');
    const repeated = await app.inject({ method: 'GET', url: `/admin/users/${AUTHOR}/publications?limit=10&limit=5000` });
    const negative = await app.inject({ method: 'GET', url: `/admin/users/${AUTHOR}/publications?offset=-5` });
    expect([repeated.statusCode, negative.statusCode]).toEqual([400, 400]);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("sans limit, la page est bornée par défaut (24), jamais illimitée", async () => {
    postFindMany.mockResolvedValue([]);
    postCount.mockResolvedValue(0);
    const app = await buildApp('ADMIN');
    await app.inject({ method: 'GET', url: `/admin/users/${AUTHOR}/publications` });
    expect((postFindMany.mock.calls[0]?.[0] as any).take).toBe(24);
    await app.close();
  });

  it.each([
    ['absent', {}],
    ['vide', { postIds: [] }],
    ['non tableau', { postIds: P1 }],
    ['51 doublons', { postIds: Array.from({ length: 51 }, () => P1) }],
  ])("refuse un lot %s", async (_label, extra) => {
    const app = await buildApp('ADMIN');
    const res = await moderate(app, { action: 'make-private', reason: 'Spam massif', ...extra });
    expect(res.statusCode).toBe(400);
    expect(postFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("50 doublons ne lisent qu'une publication, et la lecture reste bornée à 50", async () => {
    postFindMany.mockResolvedValue([row()]);
    const app = await buildApp('ADMIN');
    await moderate(app, { action: 'make-private', reason: 'Spam massif', postIds: Array.from({ length: 50 }, () => P1) });
    expect(postFindMany.mock.calls[0]?.[0]).toMatchObject({ where: { id: { in: [P1] } }, take: 50 });
    await app.close();
  });
});

describe('troisième passe — la salle temps réel du post se vide au retrait', () => {
  it("met hors ligne : les sockets restées sur la salle du post en sont sorties, la remise en ligne n'y touche pas", async () => {
    const socketsLeave = jest.fn();
    const inRoom = jest.fn((_room: string) => ({ socketsLeave }));
    const io = { in: inRoom, to: jest.fn(() => ({ emit: jest.fn(), except: jest.fn(() => ({ emit: jest.fn() })) })) };
    const app = Fastify({ logger: false });
    app.decorate('prisma', prisma);
    app.decorate('socialEvents', socialEvents as any);
    app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) } as any);
    app.decorate('authenticate', async (request: any) => {
      request.authContext = { isAuthenticated: true, userId: ACTOR, registeredUser: { id: ACTOR, role: 'ADMIN' } };
    });
    registerUserPublicationRoutes(app);
    await app.ready();

    postFindMany.mockResolvedValue([row({ id: P1, visibility: 'PUBLIC' })]);
    await moderate(app, { action: 'take-offline', postIds: [P1], reason: 'Contenu signalé' });
    expect(inRoom).toHaveBeenCalledWith(`post:${P1}`);
    expect(socketsLeave).toHaveBeenCalledWith(`post:${P1}`);

    inRoom.mockClear();
    postFindMany.mockResolvedValue([row({ id: P1, visibility: 'PRIVATE', moderationHiddenAt: new Date('2026-10-11T00:00:00Z'), moderationHiddenById: ACTOR, moderationPriorVisibility: 'PUBLIC' })]);
    await moderate(app, { action: 'restore', postIds: [P1], reason: 'Erreur de modération' });
    expect(inRoom).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("une mise hors ligne depuis la fiche d'un membre le prévient (#11158)", () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const notified = () => notifier.createNotification.mock.calls.map(([call]) => (call as { userId: string; metadata: Record<string, unknown> }));

  it('hors ligne : une notification content_removed par publication retirée, à leur auteur', async () => {
    postFindMany.mockResolvedValue([row({ id: P1 }), row({ id: P2, type: 'STORY' })]);
    const app = await buildApp('ADMIN');
    expect((await moderate(app, { action: 'take-offline', postIds: [P1, P2], reason: 'Contenu signalé' })).statusCode).toBe(200);
    await flush();
    expect(notified().map((call) => [call.userId, call.metadata])).toEqual([
      [AUTHOR, { contentType: 'post', contentId: P1, postId: P1, reason: 'Contenu signalé' }],
      [AUTHOR, { contentType: 'story', contentId: P2, postId: P2, reason: 'Contenu signalé' }],
    ]);
    await app.close();
  });

  it('mettre en privé ou remettre en ligne ne prévient personne', async () => {
    const app = await buildApp('ADMIN');
    postFindMany.mockResolvedValue([row()]);
    await moderate(app, { action: 'make-private', postIds: [P1], reason: 'Resserrer' });
    postFindMany.mockResolvedValue([row({ visibility: 'PRIVATE', moderationHiddenAt: new Date('2026-10-11T00:00:00Z'), moderationHiddenById: ACTOR, moderationPriorVisibility: 'PUBLIC' })]);
    await moderate(app, { action: 'restore', postIds: [P1], reason: 'Erreur de modération' });
    await flush();
    expect(postUpdateMany).toHaveBeenCalledTimes(2);
    expect(notified()).toEqual([]);
    await app.close();
  });
});
