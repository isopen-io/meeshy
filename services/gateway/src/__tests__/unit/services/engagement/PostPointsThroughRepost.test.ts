/**
 * Un geste fait depuis une REPUBLICATION SIMPLE est attribué aux DEUX posts
 * (#9584, décision porteur 2026-10-07) : l'original, où le geste atterrit
 * (`resolveInteractionTarget`), ET la republication par laquelle il est passé.
 *
 * Le CRÉDIT reste unique — un geste, un passage par les plafonds et les
 * quotas, un montant au score. Seule l'ATTRIBUTION par post est double : le
 * même montant s'inscrit sous les deux identifiants, et chacun s'annonce au
 * crédité seul.
 *
 * Même base en mémoire que `PostPoints.test.ts` : contraintes uniques comme
 * Mongo, valeurs attendues lues dans ce qui a RÉELLEMENT été crédité.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { loadViewerPostPoints } from '../../../../services/engagement/viewerPostPoints';
import { purgePostPoints } from '../../../../services/engagement/PostPointsRecorder';
import { throughRepost } from '../../../../services/posts/postEngagementCredits';
import { fakeGameDb, seedUser, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';

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

function setup() {
  const db = fakeGameDb();
  for (const id of [READER, AUTHOR, REPOSTER]) {
    seedUser(db, { emailVerifiedAt: new Date('2026-01-01T00:00:00Z') }, id);
  }
  const emissions: Emission[] = [];
  const io = {
    to: (room: string | string[]) => ({
      emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }),
    }),
  };
  const service = new EngagementService(db.prisma, {
    scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE },
    emitIO: () => io as never,
  });
  return { db, service, emissions };
}

const credited = (db: FakeGameDb, userId: string): number =>
  db.engagementCounter.rows.filter((row) => row.userId === userId).reduce((sum, row) => sum + (row.points as number), 0);

const actions = (db: FakeGameDb, userId: string): number =>
  db.engagementCounter.rows.filter((row) => row.userId === userId).reduce((sum, row) => sum + (row.count as number), 0);

const scoreOf = (db: FakeGameDb, userId: string): unknown => db.user.rows.find((row) => row.id === userId)?.engagementScore;

const pointsOf = async (db: FakeGameDb, viewerId: string, id: string): Promise<number | undefined> =>
  (await loadViewerPostPoints(db.prisma, viewerId, [{ id, authorId: AUTHOR }])).get(id);

const postUpdates = (emissions: readonly Emission[]) =>
  emissions.filter((emission) => emission.event === SERVER_EVENTS.ENGAGEMENT_POST_UPDATED);

/** Une réaction posée depuis la carte de la republication, redirigée vers son original. */
const throughTheRepost = (target: string = ORIGINAL) => ({
  postId: target,
  targetId: target,
  targetOwnerId: AUTHOR,
  ...throughRepost(REPOST, target),
});

describe('par où le geste est passé', () => {
  it('nomme la republication quand le geste a été redirigé vers son original', () => {
    expect(throughRepost(REPOST, ORIGINAL)).toEqual({ repostId: REPOST });
  });

  it('ne nomme rien quand le geste n’a pas été redirigé — un post ordinaire, une citation', () => {
    expect(throughRepost(ORIGINAL, ORIGINAL)).toEqual({});
  });
});

describe('un geste fait depuis une republication simple', () => {
  it('s’inscrit sous l’original ET sous la republication, du même montant', async () => {
    const { db, service } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', throughTheRepost());

    const points = credited(db, READER);
    expect(points).toBeGreaterThan(0);
    expect(await pointsOf(db, READER, ORIGINAL)).toBe(points);
    expect(await pointsOf(db, READER, REPOST)).toBe(points);
  });

  it('ne crédite qu’UNE fois : le score monte de N, pas de 2N, et une seule action est comptée', async () => {
    const { db, service } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', throughTheRepost());

    expect(actions(db, READER)).toBe(1);
    expect(scoreOf(db, READER)).toBe(credited(db, READER));
    expect(credited(db, READER)).toBe(DEFAULT_ENGAGEMENT_SCALE.operations['tool.post_reaction'].points);
  });

  it('s’annonce pour les deux identifiants, au crédité seul, en valeur absolue', async () => {
    const { db, service, emissions } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', throughTheRepost());

    const points = credited(db, READER);
    expect(postUpdates(emissions)).toEqual(
      expect.arrayContaining([
        { room: ROOMS.user(READER), event: 'engagement:post-updated', payload: { postId: ORIGINAL, viewerPoints: points } },
        { room: ROOMS.user(READER), event: 'engagement:post-updated', payload: { postId: REPOST, viewerPoints: points } },
      ]),
    );
    expect(postUpdates(emissions)).toHaveLength(2);
  });

  it('s’ajoute à ce que chacun des deux avait déjà rapporté, séparément', async () => {
    const { db, service } = setup();

    await service.recordActivity(READER, 'comment.text', { postId: ORIGINAL });
    const beforeOnOriginal = await pointsOf(db, READER, ORIGINAL);
    await service.recordActivity(READER, 'tool.post_reaction', throughTheRepost());

    const reaction = DEFAULT_ENGAGEMENT_SCALE.operations['tool.post_reaction'].points;
    expect(await pointsOf(db, READER, ORIGINAL)).toBe((beforeOnOriginal as number) + reaction);
    expect(await pointsOf(db, READER, REPOST)).toBe(reaction);
  });

  it('refusé par un plafond, n’inscrit rien sous AUCUN des deux identifiants et n’annonce rien', async () => {
    const { db, service, emissions } = setup();
    const cap = DEFAULT_ENGAGEMENT_SCALE.operations['tool.post_bookmark'].cap as number;
    for (let n = 0; n < cap; n += 1) {
      await service.recordActivity(READER, 'tool.post_bookmark', { postId: elsewhere(n), targetId: elsewhere(n), targetOwnerId: AUTHOR });
    }
    const atCap = credited(db, READER);
    const announcedAtCap = postUpdates(emissions).length;

    await service.recordActivity(READER, 'tool.post_bookmark', throughTheRepost());

    expect(credited(db, READER)).toBe(atCap);
    expect(await pointsOf(db, READER, ORIGINAL)).toBe(0);
    expect(await pointsOf(db, READER, REPOST)).toBe(0);
    expect(postUpdates(emissions)).toHaveLength(announcedAtCap);
  });

  it('fait sur son propre original, ne crédite rien et n’inscrit rien', async () => {
    const { db, service, emissions } = setup();

    await service.recordActivity(AUTHOR, 'tool.post_reaction', throughTheRepost());

    expect(db.engagementPostPoints.rows).toEqual([]);
    expect(postUpdates(emissions)).toEqual([]);
  });

  it('ne double pas une attribution qui nomme deux fois le même post', async () => {
    const { db, service, emissions } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', { postId: ORIGINAL, targetId: ORIGINAL, targetOwnerId: AUTHOR, repostId: ORIGINAL });

    expect(db.engagementPostPoints.rows).toHaveLength(1);
    expect(await pointsOf(db, READER, ORIGINAL)).toBe(credited(db, READER));
    expect(postUpdates(emissions)).toHaveLength(1);
  });

  it('les points d’un autre lecteur passé par la même republication restent les siens', async () => {
    const { db, service } = setup();

    await service.recordActivity(READER, 'tool.post_reaction', throughTheRepost());

    expect(await pointsOf(db, REPOSTER, REPOST)).toBe(0);
    expect(await pointsOf(db, REPOSTER, ORIGINAL)).toBe(0);
  });
});

describe('quand l’un des deux disparaît', () => {
  it('la republication retirée emporte ce qui passait par elle ; l’original le garde', async () => {
    const { db, service } = setup();
    await service.recordActivity(READER, 'tool.post_reaction', throughTheRepost());
    const points = credited(db, READER);

    await purgePostPoints(db.prisma, [REPOST]);

    expect(await pointsOf(db, READER, REPOST)).toBe(0);
    expect(await pointsOf(db, READER, ORIGINAL)).toBe(points);
  });

  it('l’original retiré emporte ses lignes ; la republication garde ce qui est passé par elle', async () => {
    const { db, service } = setup();
    await service.recordActivity(READER, 'tool.post_reaction', throughTheRepost());
    const points = credited(db, READER);

    await purgePostPoints(db.prisma, [ORIGINAL]);

    expect(await pointsOf(db, READER, ORIGINAL)).toBe(0);
    expect(await pointsOf(db, READER, REPOST)).toBe(points);
  });
});

describe('une attribution qui ne s’écrit pas', () => {
  it('sous la republication, ne défait ni le crédit ni l’attribution à l’original', async () => {
    const { db, service, emissions } = setup();
    const upsert = db.engagementPostPoints.upsert.bind(db.engagementPostPoints);
    db.engagementPostPoints.upsert = async (args: Parameters<typeof upsert>[0]) => {
      if ((args.create as { postId: string }).postId === REPOST) throw new Error('mongo down');
      return upsert(args);
    };

    await expect(service.recordActivity(READER, 'tool.post_reaction', throughTheRepost())).resolves.toBeUndefined();

    const points = credited(db, READER);
    expect(await pointsOf(db, READER, ORIGINAL)).toBe(points);
    expect(await pointsOf(db, READER, REPOST)).toBe(0);
    expect(postUpdates(emissions).map((emission) => (emission.payload as { postId: string }).postId)).toEqual([ORIGINAL]);
  });
});
