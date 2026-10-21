/**
 * @jest-environment node
 *
 * #10483 — une OUVERTURE est UNE vue, même quand le client en envoie deux.
 *
 * Le web et iOS envoient une vue sans durée à l'ouverture, puis une vue AVEC
 * durée à la sortie. Comptées toutes deux, une ouverture montait `viewCount`
 * de 2. La passerelle reconnaît la sortie : une vue avec durée qui suit une
 * ouverture non refermée du même lecteur sur le même post ne fait que porter
 * la durée. Un émetteur qui n'envoie QU'UNE vue avec durée reste compté.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { reachHarness, sendReach, visitorHeader, viewEvent } from '../../../helpers/reach-harness';
import { makeReachPrisma } from '../../../helpers/reach-prisma';
import { creditPostView } from '../../../../services/posts/postViewCredit';
import { cacheViewOpenLedger, type ViewOpenLedger } from '../../../../services/posts/viewOpenLedger';
import { RedisCacheStore, type CacheStore } from '../../../../services/CacheStore';

jest.mock('../../../../services/PostService', () => ({ PostService: jest.fn() }));
jest.mock('../../../../services/MediaService', () => ({ MediaService: jest.fn() }));

const POST = '507f1f77bcf86cd799439021';
const ROOT = '507f1f77bcf86cd799439023';
const REPOST = '507f1f77bcf86cd799439024';
const READER = '507f1f77bcf86cd7994390fa';
const OTHER_READER = '507f1f77bcf86cd7994390fb';
const account = (id = READER) => ({ authorization: `Bearer ${id}` });

const memoryStore = (): (() => CacheStore) => {
  const store = new RedisCacheStore('');
  return () => store;
};

const opened = (postId: string) => viewEvent(postId);
const left = (postId: string, durationMs: number) => viewEvent(postId, { durationMs });

describe('Un compte — ouverture puis sortie', () => {
  it('ouverture puis sortie avec durée ⇒ viewCount +1, la durée est gardée', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [opened(POST)], account());
    await sendReach(h.app, [left(POST, 7000)], account());

    expect(h.store.read(POST)).toMatchObject({ viewCount: 1, uniqueViewCount: 1 });
    expect(h.postViews).toEqual([expect.objectContaining({ postId: POST, userId: READER, duration: 7000 })]);
    await h.app.close();
  });

  it('ouverture et sortie dans le même lot ⇒ +1', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [opened(POST), left(POST, 3000)], account());

    expect(h.store.read(POST)?.viewCount).toBe(1);
    await h.app.close();
  });

  it('deux ouvertures complètes ⇒ +2, un seul unique', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [opened(POST)], account());
    await sendReach(h.app, [left(POST, 2000)], account());
    await sendReach(h.app, [opened(POST)], account());
    await sendReach(h.app, [left(POST, 4000)], account());

    expect(h.store.read(POST)).toMatchObject({ viewCount: 2, uniqueViewCount: 1 });
    await h.app.close();
  });

  it('un émetteur qui n’envoie qu’une vue avec durée ⇒ +1 par ouverture', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [left(POST, 5000)], account());
    await sendReach(h.app, [left(POST, 6000)], account());

    expect(h.store.read(POST)).toMatchObject({ viewCount: 2, uniqueViewCount: 1 });
    await h.app.close();
  });

  it('la sortie d’un AUTRE lecteur ne referme pas mon ouverture', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [opened(POST)], account(READER));
    await sendReach(h.app, [left(POST, 5000)], account(OTHER_READER));

    expect(h.store.read(POST)).toMatchObject({ viewCount: 2, uniqueViewCount: 2 });
    await h.app.close();
  });
});

describe('Un anonyme — ouverture puis sortie', () => {
  it('ouverture puis sortie avec durée ⇒ viewCount, anonymousViewCount et postOpenCount +1', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [opened(POST)], visitorHeader(1));
    await sendReach(h.app, [left(POST, 7000)], visitorHeader(1));

    expect(h.store.read(POST)).toMatchObject({
      viewCount: 1, anonymousViewCount: 1, postOpenCount: 1, uniqueViewCount: 1, anonymousUniqueViewCount: 1,
    });
    expect(h.opens).toEqual([expect.objectContaining({ postId: POST, durationMs: 7000 })]);
    await h.app.close();
  });

  it('deux ouvertures complètes ⇒ +2', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [opened(POST), left(POST, 2000)], visitorHeader(1));
    await sendReach(h.app, [opened(POST), left(POST, 3000)], visitorHeader(1));

    expect(h.store.read(POST)).toMatchObject({ viewCount: 2, anonymousViewCount: 2, postOpenCount: 2, uniqueViewCount: 1 });
    await h.app.close();
  });

  it('une vue unique avec durée ⇒ +1', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [left(POST, 5000)], visitorHeader(1));

    expect(h.store.read(POST)).toMatchObject({ viewCount: 1, anonymousViewCount: 1, postOpenCount: 1 });
    await h.app.close();
  });

  it('la racine d’un repost reçoit une vue par ouverture, pas deux', async () => {
    const h = await reachHarness([{ id: ROOT }, { id: REPOST, repostOfId: ROOT, originalRepostOfId: ROOT }]);
    await sendReach(h.app, [opened(REPOST)], visitorHeader(1));
    await sendReach(h.app, [left(REPOST, 5000)], visitorHeader(1));

    expect(h.store.read(REPOST)?.viewCount).toBe(1);
    expect(h.store.read(ROOT)).toMatchObject({ viewCount: 1, anonymousViewCount: 1 });
    await h.app.close();
  });

  it('la sortie d’un autre visiteur ne referme pas mon ouverture', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [opened(POST)], visitorHeader(1));
    await sendReach(h.app, [left(POST, 5000)], visitorHeader(2));

    expect(h.store.read(POST)).toMatchObject({ viewCount: 2, anonymousUniqueViewCount: 2 });
    await h.app.close();
  });
});

describe('Le registre des ouvertures', () => {
  const broken: ViewOpenLedger = {
    noteOpen: async () => { throw new Error('redis down'); },
    closeOpen: async () => { throw new Error('redis down'); },
  };

  it('injoignable ⇒ aucune vue perdue : ouverture et sortie comptent toutes deux', async () => {
    const fake = makeReachPrisma([{ id: POST }]);
    await creditPostView(fake.prisma as never, { postId: POST, userId: READER, ledger: broken });
    await creditPostView(fake.prisma as never, { postId: POST, userId: READER, durationMs: 4000, ledger: broken });

    expect(fake.store.read(POST)?.viewCount).toBe(2);
  });

  it('deux ouvertures puis deux sorties ⇒ deux vues', async () => {
    const fake = makeReachPrisma([{ id: POST }]);
    const ledger = cacheViewOpenLedger(memoryStore());
    const credit = (durationMs?: number) => creditPostView(fake.prisma as never, { postId: POST, userId: READER, durationMs, ledger });
    await credit();
    await credit();
    await credit(1000);
    await credit(2000);

    expect(fake.store.read(POST)?.viewCount).toBe(2);
  });

  it('un crédit d’engagement (réaction) n’ouvre rien : la vue avec durée qui suit compte', async () => {
    const fake = makeReachPrisma([{ id: POST }]);
    const ledger = cacheViewOpenLedger(memoryStore());
    await creditPostView(fake.prisma as never, { postId: POST, userId: READER, repeat: false, ledger });
    await creditPostView(fake.prisma as never, { postId: POST, userId: READER, durationMs: 3000, ledger });

    expect(fake.store.read(POST)?.viewCount).toBe(2);
  });
});
