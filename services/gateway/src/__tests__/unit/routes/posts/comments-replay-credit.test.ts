/**
 * #9603 — un REJEU d'idempotence (même `X-Client-Mutation-Id`) d'un
 * commentaire ne crédite ni n'annonce une seconde fois. Décision porteur :
 * « bloquer cela ». Le crédit n'est accordé qu'à la PREMIÈRE exécution de la
 * mutation, et le rejeu resert le commentaire à l'identique.
 *
 * Bout en bout, rien de doublé sur le chemin du verdict : le VRAI
 * `withMutationLog`, le VRAI `MutationLogService` sur un journal en mémoire qui
 * tient son index unique, et le VRAI moteur d'engagement sur une base en
 * mémoire — c'est la ligne de cumul et l'événement qu'on compte, pas un appel.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const mockAddComment = jest.fn<any>();
const mockGetCommentAsCreated = jest.fn<any>();

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    addComment: (...args: any[]) => mockAddComment(...args),
    getCommentAsCreated: (...args: any[]) => mockGetCommentAsCreated(...args),
  })),
}));
jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translateComment: jest.fn<any>().mockResolvedValue(undefined) } },
}));
jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) } },
}));
jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
  })),
}));
jest.mock('../../../../middleware/rate-limiter', () => ({ createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}) }));
jest.mock('../../../../utils/sanitize.js', () => ({ SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) } }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn<any>().mockResolvedValue(undefined) }),
}));
jest.mock('../../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

import { registerCommentRoutes } from '../../../../routes/posts/comments';
import { registerClientMutationIdHook } from '../../../../middleware/clientMutationId';
import { setEngagementEmitIOProvider } from '../../../../services/engagement/engagement-emit-registry';
import { fakeGameDb, seedUser } from '../../../../services/game/__tests__/fakeGameDb';
import { inMemoryMutationLog } from '../../../helpers/inMemoryMutationLog';
import { dayKeyOf } from '../../../../services/game/gameClock';
import { nextMidnight } from '../../../../services/engagement/DailyGestureGate';

const COMMENTER = '68a000000000000000000031';
const AUTHOR = '68a000000000000000000032';
const POST_ID = '68c000000000000000000401';
const CMID = 'cmid_550e8400-e29b-41d4-a716-446655449603';
const OTHER_CMID = 'cmid_550e8400-e29b-41d4-a716-446655449604';

const created = (id: string) => ({
  id,
  content: 'Bravo',
  originalLanguage: 'fr',
  translations: null,
  likeCount: 0,
  replyCount: 0,
  effectFlags: 0,
  parentId: null,
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
  metadata: null,
  postId: POST_ID,
  author: { id: COMMENTER, username: 'ana', displayName: 'Ana', avatar: null },
  media: [],
});

type Emission = { readonly room: string | string[]; readonly event: string; readonly payload: unknown };

async function build() {
  const db = fakeGameDb();
  seedUser(db, { emailVerifiedAt: new Date('2026-01-01T00:00:00Z'), engagementScore: 0 }, COMMENTER);
  seedUser(db, {}, AUTHOR);
  const postRow = {
    id: POST_ID, authorId: AUTHOR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], expiresAt: null,
    isQuote: false, repostOfId: null, originalRepostOfId: null, commentsDisabled: false, deletedAt: null,
    commentCount: 1, createdAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  const prisma = {
    ...(db.prisma as unknown as Record<string, unknown>),
    post: {
      findFirst: jest.fn(async () => postRow),
      findUnique: jest.fn(async () => postRow),
    },
    postComment: {
      findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, postId: POST_ID, authorId: COMMENTER, content: 'Bravo' })),
      findFirst: jest.fn(async () => null),
    },
  };
  const emissions: Emission[] = [];
  setEngagementEmitIOProvider(() => ({
    to: (room: string | string[]) => ({ emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }) }),
  }) as never);

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  const broadcastCommentAdded = jest.fn<any>().mockResolvedValue(undefined);
  const createPostCommentNotification = jest.fn<any>().mockResolvedValue(undefined);
  app.decorate('socialEvents', { broadcastCommentAdded } as never);
  app.decorate('notificationService', {
    createPostCommentNotification,
    createStoryCommentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  } as never);
  registerClientMutationIdHook(app);
  const log = inMemoryMutationLog();
  app.decorate('mutationLogService', log.service as never);
  const auth = async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, isAnonymous: false, type: 'user', userId: COMMENTER, registeredUser: { id: COMMENTER, role: 'USER' } };
  };
  registerCommentRoutes(app, prisma as never, auth);
  await app.ready();
  return { app, db, emissions, broadcastCommentAdded, createPostCommentNotification };
}

const comment = (app: FastifyInstance, cmid: string) =>
  app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments`, headers: { 'x-client-mutation-id': cmid }, payload: { content: 'Bravo' } });

/** Le crédit part hors du chemin de la réponse : on attend qu'il ait fini d'écrire et d'annoncer. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 150));

const commentCredits = (db: ReturnType<typeof fakeGameDb>) =>
  db.engagementCounter.rows.filter((row) => row.userId === COMMENTER && row.axisKey === 'comment.text').reduce((sum, row) => sum + (row.count as number), 0);

const postUpdates = (emissions: readonly Emission[]) => emissions.filter((e) => e.event === SERVER_EVENTS.ENGAGEMENT_POST_UPDATED);

let commentSeq = 0;
beforeEach(() => {
  commentSeq = 0;
  mockAddComment.mockReset().mockImplementation(async () => {
    commentSeq += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return created(`68d00000000000000000${String(commentSeq).padStart(4, '0')}`);
  });
  mockGetCommentAsCreated.mockReset().mockImplementation(async (id: string) => created(id));
});

afterEach(() => setEngagementEmitIOProvider(undefined));

describe('POST /posts/:postId/comments — un rejeu ne crédite ni n’annonce une seconde fois (#9603)', () => {
  it('la première exécution crédite UNE fois : un crédit, une ligne de cumul, un événement, une diffusion', async () => {
    const { app, db, emissions, broadcastCommentAdded } = await build();

    const res = await comment(app, CMID);
    await settled();
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(commentCredits(db)).toBe(1);
    expect(db.engagementPostPoints.rows).toHaveLength(1);
    expect(postUpdates(emissions)).toHaveLength(1);
    expect(broadcastCommentAdded).toHaveBeenCalledTimes(1);
  });

  it('le rejeu resert le commentaire À L’IDENTIQUE, sans crédit, sans cumul de plus, sans événement, sans diffusion ni notification', async () => {
    const { app, db, emissions, broadcastCommentAdded, createPostCommentNotification } = await build();
    const first = await comment(app, CMID);
    await settled();
    const cumulAfterFirst = db.engagementPostPoints.rows.map((row) => row.totalPoints);

    const replay = await comment(app, CMID);
    await settled();
    await app.close();

    expect(replay.statusCode).toBe(201);
    expect(replay.json().data).toEqual(first.json().data);
    expect(mockAddComment).toHaveBeenCalledTimes(1);
    expect(commentCredits(db)).toBe(1);
    expect(db.engagementPostPoints.rows.map((row) => row.totalPoints)).toEqual(cumulAfterFirst);
    expect(postUpdates(emissions)).toHaveLength(1);
    expect(broadcastCommentAdded).toHaveBeenCalledTimes(1);
    expect(createPostCommentNotification).toHaveBeenCalledTimes(1);
  });

  it('deux envois CONCURRENTS du même cmid ne créditent qu’une fois — le second attend son tour (409) ou resert', async () => {
    const { app, db, emissions } = await build();

    const [a, b] = await Promise.all([comment(app, CMID), comment(app, CMID)]);
    await settled();
    await app.close();

    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(mockAddComment).toHaveBeenCalledTimes(1);
    expect(commentCredits(db)).toBe(1);
    expect(postUpdates(emissions)).toHaveLength(1);
  });

  it('deux rejeux concurrents, après la première exécution, ne créditent rien de plus', async () => {
    const { app, db, emissions } = await build();
    await comment(app, CMID);
    await settled();

    const replays = await Promise.all([comment(app, CMID), comment(app, CMID)]);
    await settled();
    await app.close();

    expect(replays.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(commentCredits(db)).toBe(1);
    expect(postUpdates(emissions)).toHaveLength(1);
  });

  it('deux cmid DIFFÉRENTS sont deux commentaires : deux crédits', async () => {
    const { app, db } = await build();

    await comment(app, CMID);
    await comment(app, OTHER_CMID);
    await settled();
    await app.close();

    expect(commentCredits(db)).toBe(2);
  });
});

/**
 * #9584 — la limite quotidienne de commentaires (50 sur des originaux par
 * défaut), sur le même chemin réel : la porte se prend DANS l'op du journal,
 * avant l'écriture. Au bord, le geste est refusé sans rien écrire ; un rejeu
 * ne prend pas de place ; un commentaire qui ne s'écrit pas rend la sienne.
 */
describe('POST /posts/:postId/comments — la limite quotidienne de commentaires (#9584)', () => {
  const today = () => dayKeyOf(new Date(), 'UTC');
  const places = (db: ReturnType<typeof fakeGameDb>) =>
    (db.engagementQuota.rows.find((row) => row.userId === COMMENTER && row.operationKey === 'gesture:comment' && row.bucket === `original:day:${today()}`)
      ?.count as number | undefined) ?? 0;
  const seedPlaces = (db: ReturnType<typeof fakeGameDb>, count: number) =>
    db.engagementQuota.rows.push({
      id: '68e000000000000000000001', userId: COMMENTER, operationKey: 'gesture:comment', bucket: `original:day:${today()}`,
      count, points: 0, createdAt: new Date(), updatedAt: new Date(),
    });

  it('au bord, 429 DAILY_COMMENT_LIMIT AVANT toute écriture — aucun commentaire, aucun crédit, aucune diffusion — avec sa remise à zéro', async () => {
    const { app, db, emissions, broadcastCommentAdded } = await build();
    seedPlaces(db, 50);

    const res = await comment(app, CMID);
    await settled();
    await app.close();

    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      success: false,
      code: 'DAILY_COMMENT_LIMIT',
      resetAt: nextMidnight(today(), 'UTC').toISOString(),
      limit: 50,
      path: 'original',
    });
    expect(Number(res.headers['retry-after'])).toBe(res.json().retryAfter);
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(commentCredits(db)).toBe(0);
    expect(postUpdates(emissions)).toHaveLength(0);
    expect(broadcastCommentAdded).not.toHaveBeenCalled();
    expect(places(db)).toBe(50);
  });

  it('le cmid refusé reste libre : renvoyé quand une place existe, il s’écrit', async () => {
    const { app, db } = await build();
    seedPlaces(db, 50);
    await comment(app, CMID);
    db.engagementQuota.rows[0]!.count = 49;

    const retried = await comment(app, CMID);
    await settled();
    await app.close();

    expect(retried.statusCode).toBe(201);
    expect(mockAddComment).toHaveBeenCalledTimes(1);
    expect(places(db)).toBe(50);
  });

  it('un rejeu ne prend pas de place', async () => {
    const { app, db } = await build();

    await comment(app, CMID);
    await comment(app, CMID);
    await settled();
    await app.close();

    expect(places(db)).toBe(1);
  });

  it('un commentaire qui ne s’écrit pas rend sa place', async () => {
    const { app, db } = await build();
    mockAddComment.mockRejectedValueOnce(new Error('MEDIA_NOT_AVAILABLE'));

    const res = await comment(app, CMID);
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(places(db)).toBe(0);
  });
});

