/**
 * #17178 — ce qui PART d'une publication `COMMUNITY` posée dans une communauté
 * (`Post.communityId`) ne part qu'à qui peut la LIRE (#16892) : les membres actifs
 * de CETTE communauté et son créateur, communauté vivante. Trois portes
 * d'émission : l'admission des éventails de notification (`filterPostConsumers`),
 * le temps réel (`SocialEventsHandler`) et les traductions de texte de story
 * (`StoryTextObjectTranslationService`). La règle « co-membre de n'importe quelle
 * communauté de l'auteur » ne vaut plus que pour une publication sans communauté.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

import { filterPostConsumers } from '../postAudience';
import { communityPostAudienceIds } from '../communityVisibility';
import { SocialEventsHandler } from '../../../socketio/handlers/SocialEventsHandler';
import { StoryTextObjectTranslationService } from '../StoryTextObjectTranslationService';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const AUTEUR = '7000000000000000000000a1';
const MEMBRE_X = '7000000000000000000000b1';
const MEMBRE_Y = '7000000000000000000000b2';
const PARTI_X = '7000000000000000000000b3';
const CREATEUR_X = '7000000000000000000000b4';
const INCONNU = '7000000000000000000000b5';
const BLOQUE_X = '7000000000000000000000b6';
const COMMUNITY_X = '64b000000000000000000001';
const COMMUNITY_Y = '64b000000000000000000002';
const COMMUNITY_MORTE = '64b000000000000000000003';
const POST_X = '507f191e810c19729de860e1';
const POST_LIBRE = '507f191e810c19729de860e2';
const POST_MORT = '507f191e810c19729de860e3';
const POST_ABSENT = '507f191e810c19729de860ff';

type World = { readonly down?: boolean; readonly blocked?: readonly string[] };

function world(options: World = {}) {
  const communities: MongoDocument[] = [
    { id: COMMUNITY_X, createdBy: CREATEUR_X, isActive: true },
    { id: COMMUNITY_Y, createdBy: AUTEUR, isActive: true },
    { id: COMMUNITY_MORTE, createdBy: AUTEUR, isActive: false },
  ];
  const members: MongoDocument[] = [
    { communityId: COMMUNITY_X, userId: AUTEUR, isActive: true },
    { communityId: COMMUNITY_X, userId: MEMBRE_X, isActive: true },
    { communityId: COMMUNITY_X, userId: BLOQUE_X, isActive: true },
    { communityId: COMMUNITY_X, userId: PARTI_X, isActive: false },
    { communityId: COMMUNITY_Y, userId: AUTEUR, isActive: true },
    { communityId: COMMUNITY_Y, userId: MEMBRE_Y, isActive: true },
    { communityId: COMMUNITY_MORTE, userId: AUTEUR, isActive: true },
    { communityId: COMMUNITY_MORTE, userId: MEMBRE_Y, isActive: true },
  ];
  const posts: MongoDocument[] = [
    { id: POST_X, authorId: AUTEUR, visibility: 'COMMUNITY', visibilityUserIds: [], communityId: COMMUNITY_X, storyEffects: { textObjects: [{ id: 't1', text: 'Hello' }] } },
    { id: POST_LIBRE, authorId: AUTEUR, visibility: 'COMMUNITY', visibilityUserIds: [], communityId: null },
    { id: POST_MORT, authorId: AUTEUR, visibility: 'COMMUNITY', visibilityUserIds: [], communityId: COMMUNITY_MORTE, storyEffects: { textObjects: [{ id: 't1', text: 'Hello' }] } },
  ];
  const guard = () => {
    if (options.down) throw new Error('mongo down');
  };
  const pick = (row: MongoDocument, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : row;
  const findMany = (rows: MongoDocument[]) => async (args: { where?: MongoDocument; select?: Record<string, boolean>; take?: number }) => {
    guard();
    return rows.filter((row) => matchesMongoWhere(row, args.where)).slice(0, args.take).map((row) => pick(row, args.select));
  };
  const findFirst = (rows: MongoDocument[]) => async (args: { where?: MongoDocument; select?: Record<string, boolean> }) => {
    guard();
    const found = rows.find((row) => matchesMongoWhere(row, args.where));
    return found ? pick(found, args.select) : null;
  };
  const prisma = {
    community: { findFirst: findFirst(communities), findMany: findMany(communities) },
    communityMember: { findMany: findMany(members), findFirst: findFirst(members) },
    post: { findUnique: findFirst(posts), findFirst: findFirst(posts) },
    friendRequest: { findMany: async () => [] },
    participant: { findMany: async () => [] },
    userRelation: { findMany: async () => [] },
    user: {
      findUnique: async () => ({ blockedUserIds: [...(options.blocked ?? [])] }),
      findMany: async () => [],
    },
  };
  return prisma as unknown as PrismaClient;
}

describe('#17178 — l’admission des éventails (filterPostConsumers)', () => {
  const admettre = (communityId: string | null, candidates: string[], options: World = {}) =>
    filterPostConsumers({
      prisma: world(options),
      authorId: AUTEUR,
      visibility: 'COMMUNITY',
      communityId,
      candidateUserIds: candidates,
    });

  it('n’admet que les membres actifs et le créateur de CETTE communauté ; l’auteur toujours', async () => {
    expect(await admettre(COMMUNITY_X, [MEMBRE_X, MEMBRE_Y, PARTI_X, CREATEUR_X, INCONNU, AUTEUR])).toEqual([
      MEMBRE_X,
      CREATEUR_X,
      AUTEUR,
    ]);
  });

  it('une communauté désactivée, absente ou un identifiant malformé n’admettent personne d’autre que l’auteur', async () => {
    expect(await admettre(COMMUNITY_MORTE, [MEMBRE_Y, AUTEUR])).toEqual([AUTEUR]);
    expect(await admettre('64b0000000000000000000ff', [MEMBRE_X, AUTEUR])).toEqual([AUTEUR]);
    expect(await admettre('pas-un-id', [MEMBRE_X, AUTEUR])).toEqual([AUTEUR]);
  });

  it('une lecture en panne n’admet que l’auteur', async () => {
    expect(await admettre(COMMUNITY_X, [MEMBRE_X, AUTEUR], { down: true })).toEqual([AUTEUR]);
  });

  it('sans communauté, la règle du co-membre est inchangée', async () => {
    expect(await admettre(null, [MEMBRE_X, MEMBRE_Y, INCONNU])).toEqual([MEMBRE_X, MEMBRE_Y]);
  });
});

describe('#17178 — l’énumération des diffusions (communityPostAudienceIds)', () => {
  it('rend les membres actifs et le créateur de la communauté, sans l’auteur', async () => {
    const ids = await communityPostAudienceIds(world(), { authorId: AUTEUR, communityId: COMMUNITY_X });
    expect([...ids].sort()).toEqual([BLOQUE_X, CREATEUR_X, MEMBRE_X].sort());
  });

  it('communauté désactivée, absente, malformée ou panne : personne', async () => {
    expect(await communityPostAudienceIds(world(), { authorId: AUTEUR, communityId: COMMUNITY_MORTE })).toEqual([]);
    expect(await communityPostAudienceIds(world(), { authorId: AUTEUR, communityId: 'pas-un-id' })).toEqual([]);
    expect(await communityPostAudienceIds(world({ down: true }), { authorId: AUTEUR, communityId: COMMUNITY_X })).toEqual([]);
  });

  it('sans communauté, les co-membres de l’auteur comme avant', async () => {
    const ids = await communityPostAudienceIds(world(), { authorId: AUTEUR, communityId: null });
    expect([...ids].sort()).toEqual([BLOQUE_X, MEMBRE_X, MEMBRE_Y].sort());
  });
});

describe('#17178 — le temps réel (SocialEventsHandler)', () => {
  function harness(options: World = {}) {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit, except: () => ({ emit }) }));
    const handler = new SocialEventsHandler({ io: { to } as never, prisma: world(options) });
    const rooms = (): string[] =>
      (to.mock.calls as unknown as Array<[string | string[]]>).flatMap(([room]) => (Array.isArray(room) ? room : [room]));
    return { handler, rooms };
  }

  const postX = { id: POST_X, authorId: AUTEUR, visibility: 'COMMUNITY', visibilityUserIds: [], communityId: COMMUNITY_X } as never;

  it('post:created atteint les membres de la communauté et son créateur, jamais un co-membre d’une autre ni un ancien membre', async () => {
    const { handler, rooms } = harness({ blocked: [BLOQUE_X] });

    await handler.broadcastPostCreated(postX, AUTEUR);

    expect(rooms()).toEqual(expect.arrayContaining([`feed:${MEMBRE_X}`, `feed:${CREATEUR_X}`]));
    expect(rooms()).not.toContain(`feed:${MEMBRE_Y}`);
    expect(rooms()).not.toContain(`feed:${PARTI_X}`);
    expect(rooms()).not.toContain(`feed:${BLOQUE_X}`);
  });

  it('une diffusion qui ne connaît que l’identifiant du post relit sa communauté (commentaire, j’aime, traduction)', async () => {
    const { handler, rooms } = harness();

    await handler.broadcastCommentAdded({ postId: POST_X } as never, AUTEUR, 'COMMUNITY', []);
    await handler.broadcastPostLiked({ postId: POST_X, userId: MEMBRE_X } as never, AUTEUR, 'COMMUNITY', []);
    await handler.broadcastPostTranslationUpdated({ postId: POST_X } as never, AUTEUR, 'COMMUNITY', []);

    expect(rooms()).toContain(`feed:${MEMBRE_X}`);
    expect(rooms()).not.toContain(`feed:${MEMBRE_Y}`);
  });

  it('un post introuvable ou une panne ne diffuse à aucun fil sauf celui de l’auteur', async () => {
    const { handler, rooms } = harness({ down: true });

    await handler.broadcastCommentAdded({ postId: POST_X } as never, AUTEUR, 'COMMUNITY', []);

    expect(rooms().filter((room) => room.startsWith('feed:') && room !== `feed:${AUTEUR}`)).toEqual([]);
  });

  it('un post introuvable, un identifiant malformé ou une communauté désactivée ne diffusent à aucun autre fil — jamais aux co-membres', async () => {
    const { handler, rooms } = harness();

    await handler.broadcastCommentAdded({ postId: POST_ABSENT } as never, AUTEUR, 'COMMUNITY', []);
    await handler.broadcastCommentAdded({ postId: 'pas-un-id' } as never, AUTEUR, 'COMMUNITY', []);
    await handler.broadcastCommentAdded({ postId: POST_MORT } as never, AUTEUR, 'COMMUNITY', []);

    expect(rooms().filter((room) => room.startsWith('feed:') && room !== `feed:${AUTEUR}`)).toEqual([]);
  });

  it('une publication COMMUNITY sans communauté garde les co-membres de l’auteur', async () => {
    const { handler, rooms } = harness();

    await handler.broadcastCommentAdded({ postId: POST_LIBRE } as never, AUTEUR, 'COMMUNITY', []);

    expect(rooms()).toEqual(expect.arrayContaining([`feed:${MEMBRE_X}`, `feed:${MEMBRE_Y}`]));
  });
});

describe('#17178 — les traductions de texte de story (StoryTextObjectTranslationService)', () => {
  it('ne partent qu’aux fils des lecteurs de la communauté de la story', async () => {
    const prisma = Object.assign(world(), { $runCommandRaw: async () => ({ ok: 1 }) });
    const to = jest.fn(() => ({ emit: jest.fn() }));
    // @ts-expect-error accès au singleton privé
    StoryTextObjectTranslationService._shared = null;
    const service = StoryTextObjectTranslationService.init(prisma as never, { to } as never);

    await service.handleTranslationCompleted({ postId: POST_X, textObjectIndex: 0, translations: { fr: 'Bonjour' } });

    const rooms = (to.mock.calls as unknown as Array<[string]>).map(([room]) => room);
    expect(rooms).toEqual(expect.arrayContaining([`feed:${AUTEUR}`, `feed:${MEMBRE_X}`, `feed:${CREATEUR_X}`]));
    expect(rooms).not.toContain(`feed:${MEMBRE_Y}`);
    expect(rooms).not.toContain(`feed:${PARTI_X}`);
  });

  it('une communauté désactivée ou une panne ne traduisent en direct que pour l’auteur', async () => {
    for (const [postId, options] of [[POST_MORT, {}], [POST_X, { down: true }]] as const) {
      const prisma = Object.assign(world(options), { $runCommandRaw: async () => ({ ok: 1 }) });
      const to = jest.fn(() => ({ emit: jest.fn() }));
      // @ts-expect-error accès au singleton privé
      StoryTextObjectTranslationService._shared = null;
      const service = StoryTextObjectTranslationService.init(prisma as never, { to } as never);

      await service.handleTranslationCompleted({ postId, textObjectIndex: 0, translations: { fr: 'Bonjour' } });

      const rooms = (to.mock.calls as unknown as Array<[string]>).map(([room]) => room);
      expect(rooms.filter((room) => room !== `feed:${AUTEUR}`)).toEqual([]);
    }
  });
});
