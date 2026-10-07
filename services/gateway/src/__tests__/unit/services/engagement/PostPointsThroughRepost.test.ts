/**
 * Une réaction posée depuis une REPUBLICATION SIMPLE génère de VRAIS points sur
 * les DEUX posts (#9584, décision porteur 2026-10-07) : un crédit sur
 * l'original où elle atterrit, un autre sur la republication traversée —
 * chacun avec son barème, ses plafonds, ses quotas par cible et son auteur.
 *
 * La propriété que ces témoins tiennent : **la somme des marques affichées est
 * la hausse réelle du score**, toujours. Chaque carte porte ce que SON crédit a
 * rapporté ; un crédit refusé ne marque que la sienne.
 *
 * Bout en bout : `PostReactionService.addReaction` (le site unique du crédit
 * d'une réaction, REST et socket) sur le VRAI `EngagementService`, dont la base
 * en mémoire applique les contraintes uniques comme Mongo. Rien n'est recopié
 * du barème : les valeurs attendues se lisent dans ce qui a été crédité.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScale } from '@meeshy/shared/types/engagement-scale';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { PostReactionService } from '../../../../services/PostReactionService';
import { DailyGestureGate, DailyGestureLimitReached } from '../../../../services/engagement/DailyGestureGate';
import { loadViewerPostPoints } from '../../../../services/engagement/viewerPostPoints';
import { fakeGameDb, seedUser, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';
import type { RepostPassage } from '../../../../services/posts/postVisibility';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn<any>().mockResolvedValue(undefined) }),
}));
jest.mock('../../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const READER = '68a000000000000000000021';
const AUTHOR = '68a000000000000000000022';
const REPOSTER = '68a000000000000000000023';
const ORIGINAL = '68c000000000000000000201';
const REPOST = '68c000000000000000000202';
const elsewhere = (n: number) => `68c0000000000000000003${String(n).padStart(2, '0')}`;

type Emission = { readonly room: string | string[]; readonly event: string; readonly payload: unknown };

const REACTION = DEFAULT_ENGAGEMENT_SCALE.operations['tool.post_reaction'];

/** Des limites de réactions ramenées à deux et trois, pour atteindre le bord sans boucler cent fois. */
const SMALL_LIMITS: EngagementScale = {
  ...DEFAULT_ENGAGEMENT_SCALE,
  pathCaps: { comment: { original: 50, repost: 10 }, reaction: { original: 3, repost: 2 } },
};

function setup(scale: EngagementScale = DEFAULT_ENGAGEMENT_SCALE, options: { readonly counterDown?: boolean } = {}) {
  const db = fakeGameDb();
  for (const id of [READER, AUTHOR, REPOSTER]) {
    seedUser(db, { emailVerifiedAt: new Date('2026-01-01T00:00:00Z'), engagementScore: 0 }, id);
  }
  const emissions: Emission[] = [];
  const io = {
    to: (room: string | string[]) => ({
      emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }),
    }),
  };
  const engine = new EngagementService(db.prisma, {
    scale: { current: async () => scale },
    emitIO: () => io as never,
  });
  const inFlight: Promise<unknown>[] = [];
  const recorder = {
    recordActivity: (...args: Parameters<EngagementService['recordActivity']>) => {
      const credit = engine.recordActivity(...args);
      inFlight.push(credit);
      return credit;
    },
    reclaimContent: (...args: Parameters<EngagementService['reclaimContent']>) => engine.reclaimContent(...args),
    reclaimSource: (...args: Parameters<EngagementService['reclaimSource']>) => {
      const reclaim = engine.reclaimSource(...args);
      inFlight.push(reclaim);
      return reclaim;
    },
  };
  const reactions: Array<{ id: string; postId: string; userId: string; emoji: string; createdAt: Date }> = [];
  const authors: Record<string, string> = { [ORIGINAL]: AUTHOR, [REPOST]: REPOSTER };
  const posts = {
    post: {
      findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, deletedAt: null, authorId: authors[where.id] ?? AUTHOR }),
    },
    postReaction: {
      findFirst: async ({ where }: { where: { postId: string; userId: string; emoji: string } }) =>
        reactions.find((r) => r.postId === where.postId && r.userId === where.userId && r.emoji === where.emoji) ?? null,
      count: async ({ where }: { where: { postId: string; userId: string } }) =>
        reactions.filter((r) => r.postId === where.postId && r.userId === where.userId).length,
      create: async ({ data }: { data: { postId: string; userId: string; emoji: string } }) => {
        const created = { id: `reaction-${reactions.length + 1}`, ...data, createdAt: new Date() };
        reactions.push(created);
        return created;
      },
      findMany: async ({ where }: { where: { postId: string; userId: string; emoji: string } }) =>
        reactions.filter((r) => r.postId === where.postId && r.userId === where.userId && r.emoji === where.emoji).map(({ id }) => ({ id })),
      deleteMany: async ({ where }: { where: { postId: string; userId: string; emoji: string } }) => {
        const gone = reactions.filter((r) => r.postId === where.postId && r.userId === where.userId && r.emoji === where.emoji);
        gone.forEach((r) => reactions.splice(reactions.indexOf(r), 1));
        return { count: gone.length };
      },
    },
    engagementQuota: db.prisma.engagementQuota,
    user: db.prisma.user,
    $transaction: async () => undefined,
  };
  const gatePrisma = options.counterDown
    ? { ...db.prisma, engagementQuota: { updateMany: async () => { throw new Error('mongo down'); } } }
    : db.prisma;
  const gate = new DailyGestureGate(gatePrisma as never, { current: async () => scale });
  const service = new PostReactionService(posts as never, recorder, gate);
  const react = async (input: { readonly userId: string; readonly postId: string; readonly emoji?: string; readonly through?: RepostPassage }) => {
    await service.addReaction({ emoji: '❤️', ...input });
    await Promise.all(inFlight.splice(0));
  };
  const unreact = async (input: { readonly userId: string; readonly postId: string; readonly emoji?: string }) => {
    await service.removeReaction({ emoji: '❤️', ...input });
    await Promise.all(inFlight.splice(0));
  };
  return { db, emissions, react, unreact, reactions, engine };
}

const placesTaken = (db: FakeGameDb, userId: string, path: 'original' | 'repost'): number =>
  db.engagementQuota.rows
    .filter((row) => row.userId === userId && row.operationKey === 'gesture:reaction' && String(row.bucket).startsWith(`${path}:day:`))
    .reduce((sum, row) => sum + (row.count as number), 0);

const scoreOf = (db: FakeGameDb, userId: string): number =>
  (db.user.rows.find((row) => row.id === userId)?.engagementScore as number | undefined) ?? 0;

const markOf = async (db: FakeGameDb, viewerId: string, id: string): Promise<number> =>
  (await loadViewerPostPoints(db.prisma, viewerId, [{ id }])).get(id) ?? 0;

const marks = async (db: FakeGameDb, viewerId: string): Promise<number> =>
  (await markOf(db, viewerId, ORIGINAL)) + (await markOf(db, viewerId, REPOST));

const postUpdates = (emissions: readonly Emission[]) =>
  emissions.filter((emission) => emission.event === SERVER_EVENTS.ENGAGEMENT_POST_UPDATED);

const viaRepost: RepostPassage = { id: REPOST, authorId: REPOSTER };

describe('une réaction posée depuis une republication simple', () => {
  it('crédite les DEUX posts pour de vrai : le score monte de deux crédits', async () => {
    const { db, react } = setup();

    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });

    expect(scoreOf(db, READER)).toBe(2 * REACTION.points);
    expect(db.engagementCounter.rows.find((row) => row.userId === READER)?.count).toBe(2);
  });

  it('chaque carte porte ce que SON crédit a rapporté — la somme des deux marques est la hausse réelle du score', async () => {
    const { db, react } = setup();

    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });

    expect(await markOf(db, READER, ORIGINAL)).toBe(REACTION.points);
    expect(await markOf(db, READER, REPOST)).toBe(REACTION.points);
    expect(await marks(db, READER)).toBe(scoreOf(db, READER));
  });

  it('s’annonce pour chacun des deux identifiants crédités, au crédité seul, en valeur absolue', async () => {
    const { emissions, react } = setup();

    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });

    expect(postUpdates(emissions)).toEqual(
      expect.arrayContaining([
        { room: ROOMS.user(READER), event: 'engagement:post-updated', payload: { postId: ORIGINAL, viewerPoints: REACTION.points, at: expect.any(Number) } },
        { room: ROOMS.user(READER), event: 'engagement:post-updated', payload: { postId: REPOST, viewerPoints: REACTION.points, at: expect.any(Number) } },
      ]),
    );
    expect(postUpdates(emissions)).toHaveLength(2);
  });

  it('une réaction déjà posée, reconfirmée par une AUTRE republication, ne recrédite pas l’original : la nouvelle republication reçoit son crédit, une fois', async () => {
    const { db, react } = setup();
    const other: RepostPassage = { id: elsewhere(90), authorId: REPOSTER };
    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });
    const after = scoreOf(db, READER);

    await react({ userId: READER, postId: ORIGINAL, through: other });
    await react({ userId: READER, postId: ORIGINAL, through: other });

    expect(scoreOf(db, READER)).toBe(after + REACTION.points);
    expect(await markOf(db, READER, ORIGINAL)).toBe(REACTION.points);
    expect(await markOf(db, READER, REPOST)).toBe(REACTION.points);
    expect(await markOf(db, READER, other.id)).toBe(REACTION.points);
  });

  it('retirer la réaction reprend ses crédits sur les DEUX posts, une seule fois — une reprise rejouée ne reprend rien', async () => {
    const { db, react, unreact, reactions, engine } = setup();
    await react({ userId: READER, postId: elsewhere(5) });
    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });
    const removed = reactions.find((r) => r.postId === ORIGINAL)!.id;

    await unreact({ userId: READER, postId: ORIGINAL });
    await engine.reclaimSource(READER, `post-reaction:${removed}`);

    expect(scoreOf(db, READER)).toBe(REACTION.points);
    expect(await marks(db, READER)).toBe(0);
    expect(await markOf(db, READER, elsewhere(5))).toBe(REACTION.points);
  });
});

/**
 * Les limites quotidiennes de GESTES (#9584, porteur 2026-10-07) : par jour civil
 * du compte, sous les republications et sur les originaux, chacune la sienne. Au
 * bord, le geste est REFUSÉ avant d'être écrit — il ne consomme rien, ne
 * rapporte rien, n'annonce rien —, et le retirer ne rend pas sa place.
 */
describe('la limite quotidienne de réactions', () => {
  it('sous les republications : au-delà de la limite, la réaction est refusée avant d’être écrite', async () => {
    const { db, react, reactions, emissions } = setup(SMALL_LIMITS);
    await react({ userId: READER, postId: elsewhere(1), through: { id: elsewhere(51), authorId: REPOSTER } });
    await react({ userId: READER, postId: elsewhere(2), through: { id: elsewhere(52), authorId: REPOSTER } });
    const score = scoreOf(db, READER);
    const announced = postUpdates(emissions).length;

    const refused = react({ userId: READER, postId: ORIGINAL, through: viaRepost });

    await expect(refused).rejects.toBeInstanceOf(DailyGestureLimitReached);
    await expect(refused).rejects.toMatchObject({ code: 'DAILY_REACTION_LIMIT', family: 'reaction', path: 'repost', limit: 2 });
    expect(reactions.filter((r) => r.postId === ORIGINAL)).toHaveLength(0);
    expect(scoreOf(db, READER)).toBe(score);
    expect(await marks(db, READER)).toBe(0);
    expect(postUpdates(emissions)).toHaveLength(announced);
  });

  it('un geste refusé ne consomme rien : le compteur du jour reste à la limite', async () => {
    const { db, react } = setup(SMALL_LIMITS);
    await react({ userId: READER, postId: elsewhere(1), through: { id: elsewhere(51), authorId: REPOSTER } });
    await react({ userId: READER, postId: elsewhere(2), through: { id: elsewhere(52), authorId: REPOSTER } });

    await expect(react({ userId: READER, postId: ORIGINAL, through: viaRepost })).rejects.toBeInstanceOf(DailyGestureLimitReached);
    await expect(react({ userId: READER, postId: ORIGINAL, through: viaRepost })).rejects.toBeInstanceOf(DailyGestureLimitReached);

    expect(placesTaken(db, READER, 'repost')).toBe(2);
  });

  it('la limite des originaux est la sienne : atteinte sous les republications, une réaction sur un original passe', async () => {
    const { db, react } = setup(SMALL_LIMITS);
    await react({ userId: READER, postId: elsewhere(1), through: { id: elsewhere(51), authorId: REPOSTER } });
    await react({ userId: READER, postId: elsewhere(2), through: { id: elsewhere(52), authorId: REPOSTER } });

    await react({ userId: READER, postId: ORIGINAL });

    expect(await markOf(db, READER, ORIGINAL)).toBe(REACTION.points);
    expect(placesTaken(db, READER, 'original')).toBe(1);
  });

  it('chaque réaction admise rapporte : gestes et points ne divergent pas, même au-delà de l’ancien plafond de 30', async () => {
    const { db, react } = setup();
    for (let n = 0; n < 31; n += 1) {
      await react({ userId: READER, postId: elsewhere(n) });
    }

    expect(scoreOf(db, READER)).toBe(31 * REACTION.points);
    expect(placesTaken(db, READER, 'original')).toBe(31);
  });

  it('retirer une réaction ne rend pas sa place du jour', async () => {
    const { db, react, unreact } = setup(SMALL_LIMITS);
    await react({ userId: READER, postId: elsewhere(1), through: { id: elsewhere(51), authorId: REPOSTER } });
    await react({ userId: READER, postId: elsewhere(2), through: { id: elsewhere(52), authorId: REPOSTER } });

    await unreact({ userId: READER, postId: elsewhere(2) });

    expect(placesTaken(db, READER, 'repost')).toBe(2);
    await expect(react({ userId: READER, postId: elsewhere(2), through: { id: elsewhere(52), authorId: REPOSTER } })).rejects.toBeInstanceOf(DailyGestureLimitReached);
  });

  it('reconfirmer par une autre republication est un geste sous les republications, qui prend sa place', async () => {
    const { db, react } = setup(SMALL_LIMITS);
    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });

    await react({ userId: READER, postId: ORIGINAL, through: { id: elsewhere(90), authorId: REPOSTER } });

    expect(placesTaken(db, READER, 'repost')).toBe(2);
    await expect(react({ userId: READER, postId: ORIGINAL, through: { id: elsewhere(91), authorId: REPOSTER } })).rejects.toBeInstanceOf(DailyGestureLimitReached);
  });

  it('reconfirmer sans rien de neuf à créditer n’est pas un geste : aucune place prise', async () => {
    const { db, react } = setup(SMALL_LIMITS);
    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });

    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });
    await react({ userId: READER, postId: ORIGINAL });

    expect(placesTaken(db, READER, 'repost')).toBe(1);
    expect(placesTaken(db, READER, 'original')).toBe(0);
  });
});

/**
 * « Jamais sur son propre post » se lit SÉPARÉMENT sur chacun des deux crédits,
 * sur l'auteur de CHAQUE post. On ne se crédite donc jamais deux fois pour un
 * geste dont l'un des deux posts est le sien.
 */
describe('le compteur du jour muet, le blocage', () => {
  it('compteur illisible : la réaction est posée, mais ne rapporte RIEN, sur aucun des deux posts', async () => {
    const { db, react, reactions } = setup(DEFAULT_ENGAGEMENT_SCALE, { counterDown: true });

    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });

    expect(reactions.filter((r) => r.postId === ORIGINAL)).toHaveLength(1);
    expect(scoreOf(db, READER)).toBe(0);
    expect(await marks(db, READER)).toBe(0);
  });

  it.each([
    ['l’auteur de l’original vous a bloqué', AUTHOR, READER],
    ['vous avez bloqué l’auteur de l’original', READER, AUTHOR],
    ['l’auteur de la republication traversée vous a bloqué', REPOSTER, READER],
  ])('%s : la réaction est refusée comme un post introuvable, sans écriture, sans place, sans point', async (_label, blocker, blocked) => {
    const { db, react, reactions } = setup();
    (db.user.rows.find((row) => row.id === blocker)!.blockedUserIds as string[]).push(blocked);

    await expect(react({ userId: READER, postId: ORIGINAL, through: viaRepost })).rejects.toThrow('Post not found');

    expect(reactions).toHaveLength(0);
    expect(scoreOf(db, READER)).toBe(0);
    expect(placesTaken(db, READER, 'repost')).toBe(0);
  });
});

describe('quand l’un des deux posts est le sien', () => {
  it('le republieur qui réagit par SA republication : l’original le crédite, sa republication non', async () => {
    const { db, react } = setup();

    await react({ userId: REPOSTER, postId: ORIGINAL, through: viaRepost });

    expect(scoreOf(db, REPOSTER)).toBe(REACTION.points);
    expect(await markOf(db, REPOSTER, ORIGINAL)).toBe(REACTION.points);
    expect(await markOf(db, REPOSTER, REPOST)).toBe(0);
  });

  it('l’auteur de l’original qui réagit par la republication d’un autre : la republication le crédite, son original non', async () => {
    const { db, react } = setup();

    await react({ userId: AUTHOR, postId: ORIGINAL, through: viaRepost });

    expect(scoreOf(db, AUTHOR)).toBe(REACTION.points);
    expect(await markOf(db, AUTHOR, ORIGINAL)).toBe(0);
    expect(await markOf(db, AUTHOR, REPOST)).toBe(REACTION.points);
  });
});

describe('ce que la réaction ne fait pas', () => {
  it('ne crédite pas l’auteur d’un post qui reçoit la réaction — le barème ne le fait pour aucun post, ni l’original ni la republication', async () => {
    const { db, react } = setup();

    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });

    expect(scoreOf(db, AUTHOR)).toBe(0);
    expect(scoreOf(db, REPOSTER)).toBe(0);
  });

  it('sans republication traversée, un seul crédit — rien ne change pour un post ordinaire', async () => {
    const { db, react, emissions } = setup();

    await react({ userId: READER, postId: ORIGINAL });

    expect(scoreOf(db, READER)).toBe(REACTION.points);
    expect(await marks(db, READER)).toBe(REACTION.points);
    expect(postUpdates(emissions)).toHaveLength(1);
  });
});
