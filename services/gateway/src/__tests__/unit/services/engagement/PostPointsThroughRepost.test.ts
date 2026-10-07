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
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { PostReactionService } from '../../../../services/PostReactionService';
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

function setup() {
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
    scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE },
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
    },
    $transaction: async () => undefined,
  };
  const service = new PostReactionService(posts as never, recorder);
  const react = async (input: { readonly userId: string; readonly postId: string; readonly emoji?: string; readonly through?: RepostPassage }) => {
    await service.addReaction({ emoji: '❤️', ...input });
    await Promise.all(inFlight.splice(0));
  };
  return { db, emissions, react, engine };
}

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
        { room: ROOMS.user(READER), event: 'engagement:post-updated', payload: { postId: ORIGINAL, viewerPoints: REACTION.points } },
        { room: ROOMS.user(READER), event: 'engagement:post-updated', payload: { postId: REPOST, viewerPoints: REACTION.points } },
      ]),
    );
    expect(postUpdates(emissions)).toHaveLength(2);
  });

  it('au bord du plafond du jour, un seul des deux passe : il marque sa carte, l’autre ne marque rien, la somme reste le score', async () => {
    const { db, react, emissions } = setup();
    const cap = REACTION.cap as number;
    for (let n = 0; n < cap - 1; n += 1) {
      await react({ userId: READER, postId: elsewhere(n) });
    }
    const before = scoreOf(db, READER);
    const announcedBefore = postUpdates(emissions).length;

    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });

    const gained = scoreOf(db, READER) - before;
    const cards = [await markOf(db, READER, ORIGINAL), await markOf(db, READER, REPOST)];
    expect(gained).toBe(REACTION.points);
    expect(cards.filter((points) => points > 0)).toEqual([REACTION.points]);
    expect(cards[0]! + cards[1]!).toBe(gained);
    expect(postUpdates(emissions).length - announcedBefore).toBe(1);
  });

  it('plafond atteint : aucun des deux ne passe, aucune carte ne marque, rien n’est annoncé', async () => {
    const { db, react, emissions } = setup();
    for (let n = 0; n < (REACTION.cap as number); n += 1) {
      await react({ userId: READER, postId: elsewhere(n) });
    }
    const before = scoreOf(db, READER);
    const announcedBefore = postUpdates(emissions).length;

    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });

    expect(scoreOf(db, READER)).toBe(before);
    expect(await marks(db, READER)).toBe(0);
    expect(postUpdates(emissions)).toHaveLength(announcedBefore);
  });

  it('une réaction déjà posée sur l’original ne recrédite ni l’un ni l’autre', async () => {
    const { db, react } = setup();
    await react({ userId: READER, postId: ORIGINAL, through: viaRepost });
    const after = scoreOf(db, READER);

    await react({ userId: READER, postId: ORIGINAL, through: { id: elsewhere(90), authorId: REPOSTER } });

    expect(scoreOf(db, READER)).toBe(after);
    expect(await markOf(db, READER, elsewhere(90))).toBe(0);
  });
});

/**
 * « Jamais sur son propre post » se lit SÉPARÉMENT sur chacun des deux crédits,
 * sur l'auteur de CHAQUE post. On ne se crédite donc jamais deux fois pour un
 * geste dont l'un des deux posts est le sien.
 */
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
