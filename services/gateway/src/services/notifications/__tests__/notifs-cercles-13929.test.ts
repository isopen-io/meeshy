/**
 * #13929 — l'entourage prévenu suit les CERCLES, et chacun règle le sien.
 *
 * Mes publications (A) et l'activité des autres sur mes contenus (B) partent par
 * défaut à Proche et au-dessus ; mon activité ailleurs (C) à Sang. Chacun peut
 * régler chaque action de Personne à Public ; le niveau EFFECTIF borne toujours
 * le réglage, le blocage coupe tout, et l'admission de la publication (qui peut
 * la VOIR) s'applique après. La personne directement visée (l'auteur liké,
 * commenté) reste prévenue, hors de ce réglage.
 *
 * Les liens vivent dans un double EN MÉMOIRE de `userRelation` / `friendRequest`
 * (`relationStore`) : ces témoins lisent le niveau par la même loi que la
 * production, pas une clause recopiée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relationPairKey, type RelationLevel } from '@meeshy/shared/types/relation';
import type { RelationAudienceChoice, CircleNotifyKey } from '@meeshy/shared/utils/relation-levels';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { relationStore } from '../../../__tests__/helpers/user-relation-store';
import { matchesMongoWhere } from '../../../__tests__/helpers/mongo-where';
import { createFriendContentNotificationsBatch, type FriendContentFanoutParams } from '../fanout/friend-content';
import { createStoryCommentNotificationsBatch, type StoryCommentFanoutParams } from '../fanout/story-comment';
import { createPostCommentNotification, createPostLikeNotification } from '../builders/social-engagement';
import type { FanoutDependencies } from '../fanout/dependencies';
import type { NotificationBuilderDependencies } from '../builders/dependencies';

const AUTEUR = '6000000000000000000000a1';
const COMMENTATEUR = '6000000000000000000000a2';
const SANG = '6000000000000000000000b1';
const PROCHE = '6000000000000000000000b2';
const AMI = '6000000000000000000000b3';
const CONNAISSANCE = '6000000000000000000000b4';
const CO_MEMBRE = '6000000000000000000000b5';
const INCONNU = '6000000000000000000000b6';
const SANG_BLOQUE = '6000000000000000000000b7';
const SANG_DU_COMMENTATEUR = '6000000000000000000000c1';
const PROCHE_DU_COMMENTATEUR = '6000000000000000000000c2';
const POST = 'dddddddddddddddddddddddd';
const COMMENT = 'eeeeeeeeeeeeeeeeeeeeeeee';

type Link = readonly [string, string, RelationLevel];

const lien = ([a, b, level]: Link, index: number) => ({
  id: `aa${String(index).padStart(22, '0')}`,
  ...relationPairKey(a, b),
  grantedByLow: level,
  grantedByHigh: level,
  transitions: [],
  updatedAt: new Date(2026, 9, 1, 0, index),
});

const CERCLE_DE_L_AUTEUR: readonly Link[] = [
  [AUTEUR, SANG, 'BLOOD'],
  [AUTEUR, PROCHE, 'CLOSE'],
  [AUTEUR, AMI, 'FRIEND'],
  [AUTEUR, CONNAISSANCE, 'ACQUAINTANCE'],
  [AUTEUR, SANG_BLOQUE, 'BLOOD'],
];

const CERCLE_DU_COMMENTATEUR: readonly Link[] = [
  [COMMENTATEUR, SANG_DU_COMMENTATEUR, 'BLOOD'],
  [COMMENTATEUR, PROCHE_DU_COMMENTATEUR, 'CLOSE'],
];

type World = {
  readonly extraLinks?: readonly Link[];
  readonly preferencesDown?: boolean;
  readonly settings?: Readonly<Record<string, Partial<Record<CircleNotifyKey, RelationAudienceChoice>>>>;
  readonly blocks?: Readonly<Record<string, readonly string[]>>;
  readonly communities?: Readonly<Record<string, readonly string[]>>;
};

const COMMUNAUTE_PAR_DEFAUT = { 'c-1': [AUTEUR, CO_MEMBRE] };

function monde(world: World = {}) {
  const store = relationStore({
    relations: [...CERCLE_DE_L_AUTEUR, ...CERCLE_DU_COMMENTATEUR, ...(world.extraLinks ?? [])].map(lien),
    friendRequests: [],
  });
  const blocks = { [AUTEUR]: [SANG_BLOQUE], ...(world.blocks ?? {}) };
  const blockedOf = (id: string): readonly string[] => blocks[id] ?? [];
  const communities = world.communities ?? COMMUNAUTE_PAR_DEFAUT;
  const memberships = Object.entries(communities).flatMap(([communityId, members]) =>
    members.map((userId) => ({ communityId, userId, isActive: true }))
  );

  const prisma = {
    ...store.prisma,
    user: {
      findUnique: async (args: { where: { id: string } }) => ({
        id: args.where.id,
        username: args.where.id,
        displayName: args.where.id,
        avatar: null,
        blockedUserIds: [...blockedOf(args.where.id)],
      }),
      findMany: async (args: { where: { id: { in: string[] }; blockedUserIds: { has: string } } }) =>
        args.where.id.in.filter((id) => blockedOf(id).includes(args.where.blockedUserIds.has)).map((id) => ({ id })),
    },
    userPreferences: {
      findUnique: async (args: { where: { userId: string } }) => {
        if (world.preferencesDown) throw new Error('mongo down');
        const own = world.settings?.[args.where.userId];
        return own ? { notification: own } : null;
      },
    },
    communityMember: {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) => {
        const rows = memberships.filter((row) => matchesMongoWhere(row, args.where));
        return rows.slice(0, args.take);
      },
    },
    participant: { findMany: async () => [] },
    postMedia: { findFirst: async () => null },
    post: { findUnique: async () => null, findFirst: async () => null },
    postComment: { findMany: async () => [] },
    postReaction: { findMany: async () => [] },
  };

  const createNotification = jest.fn(async (_params: { userId: string; type: string }) => null);
  const deps = {
    prisma: prisma as unknown as PrismaClient,
    createNotification,
    resolveRecipientLangs: async () => new Map<string, string>(),
    shouldCreateMentionNotification: () => true,
    isConversationMutedFor: async () => false,
  } as unknown as FanoutDependencies;

  const notified = (type?: string): string[] =>
    createNotification.mock.calls
      .map(([params]) => params)
      .filter((params) => type === undefined || params.type === type)
      .map((params) => params.userId);

  return { deps, prisma, createNotification, notified };
}

const publier = async (world: World, over: Partial<FriendContentFanoutParams> = {}) => {
  const m = monde(world);
  await createFriendContentNotificationsBatch(m.deps, {
    postId: POST,
    authorId: AUTEUR,
    contentType: 'POST',
    visibility: 'PUBLIC',
    ...over,
  });
  return m.notified();
};

const commenter = async (world: World, over: Partial<StoryCommentFanoutParams> = {}) => {
  const m = monde(world);
  await createStoryCommentNotificationsBatch(m.deps, {
    postId: POST,
    commentId: COMMENT,
    storyAuthorId: AUTEUR,
    commenterId: COMMENTATEUR,
    commentExcerpt: 'bravo',
    postType: 'STORY',
    visibility: 'PUBLIC',
    ...over,
  });
  return m;
};

const reglage = (key: CircleNotifyKey, choice: RelationAudienceChoice, owner = AUTEUR): World => ({
  settings: { [owner]: { [key]: choice } },
});

describe('A — mes publications (friend_new_post / story / mood, reels compris)', () => {
  it.each(['POST', 'REEL', 'STORY', 'MOOD', 'STATUS'] as const)(
    'par défaut (%s) : Sang et Proche prévenus, un simple Ami ne l’est plus',
    async (contentType) => {
      const recipients = await publier({}, { contentType });
      expect(recipients.sort()).toEqual([PROCHE, SANG].sort());
    }
  );

  it('un bloqué n’est jamais prévenu, Sang compris', async () => {
    expect(await publier(reglage('circlePublicationPost', 'PUBLIC'))).not.toContain(SANG_BLOQUE);
  });

  it('réglage « Ami » ⇒ un Ami est prévenu, une Connaissance ne l’est pas', async () => {
    const recipients = await publier(reglage('circlePublicationPost', 'FRIEND'));
    expect(recipients).toEqual(expect.arrayContaining([SANG, PROCHE, AMI]));
    expect(recipients).not.toContain(CONNAISSANCE);
  });

  it('réglage « Connaissance » ⇒ une Connaissance est prévenue, un membre de la seule Communauté ne l’est jamais', async () => {
    const recipients = await publier(reglage('circlePublicationPost', 'ACQUAINTANCE'));
    expect(recipients).toContain(CONNAISSANCE);
    expect(recipients).not.toContain(CO_MEMBRE);
  });

  it('réglage « Communauté » ⇒ un co-membre est prévenu, un inconnu sans lien ne l’est pas', async () => {
    const recipients = await publier(reglage('circlePublicationPost', 'COMMUNITY'));
    expect(recipients).toEqual(expect.arrayContaining([CO_MEMBRE, CONNAISSANCE, AMI]));
    expect(recipients).not.toContain(INCONNU);
  });

  it('réglage « Public » ⇒ tous les liens, communauté comprise — jamais un inconnu sans lien, jamais un bloqué', async () => {
    const recipients = await publier(reglage('circlePublicationPost', 'PUBLIC'));
    expect(recipients.sort()).toEqual([SANG, PROCHE, AMI, CONNAISSANCE, CO_MEMBRE].sort());
  });

  it('réglage « Personne » ⇒ personne', async () => {
    expect(await publier(reglage('circlePublicationPost', 'NOBODY'))).toEqual([]);
  });

  it('chaque action a SON réglage : la story coupée ne coupe pas le post', async () => {
    expect(await publier(reglage('circlePublicationStory', 'NOBODY'), { contentType: 'STORY' })).toEqual([]);
    expect((await publier(reglage('circlePublicationStory', 'NOBODY'), { contentType: 'POST' })).sort()).toEqual(
      [PROCHE, SANG].sort()
    );
  });

  it('un repost suit le réglage « repost », pas celui du type écrit', async () => {
    const world = reglage('circlePublicationRepost', 'BLOOD');
    expect(await publier(world, { isRepost: true })).toEqual([SANG]);
    expect((await publier(world)).sort()).toEqual([PROCHE, SANG].sort());
  });

  it('le réglage ne contourne pas l’audience : une Connaissance ne voit pas un post FRIENDS, elle n’en est pas prévenue', async () => {
    const recipients = await publier(reglage('circlePublicationPost', 'ACQUAINTANCE'), { visibility: 'FRIENDS' });
    expect(recipients).not.toContain(CONNAISSANCE);
  });

  it('une valeur stockée hors des sept crans ferme (un « Personne » réécrit de travers ne rouvre jamais au défaut)', async () => {
    const world: World = { settings: { [AUTEUR]: { circlePublicationPost: 'nobody' as RelationAudienceChoice } } };
    expect(await publier(world)).toEqual([]);
  });

  it('un réglage illisible (base en panne) ferme', async () => {
    expect(await publier({ preferencesDown: true })).toEqual([]);
  });

  it('au cran Public, une foule de Connaissances récentes n’évince jamais un Sang ancien de la borne', async () => {
    const foule: Link[] = Array.from({ length: 520 }, (_, i) => [
      AUTEUR,
      `61${String(i).padStart(22, '0')}`,
      'ACQUAINTANCE',
    ]);
    const recipients = await publier({ ...reglage('circlePublicationPost', 'PUBLIC'), extraLinks: foule });
    expect(recipients).toHaveLength(499);
    expect(recipients).toEqual(expect.arrayContaining([SANG, PROCHE, AMI]));
    expect(recipients).not.toContain(SANG_BLOQUE);
  });

  it('PRIVATE ne prévient personne', async () => {
    expect(await publier(reglage('circlePublicationPost', 'PUBLIC'), { visibility: 'PRIVATE' })).toEqual([]);
  });
});

describe('B et C — le relais d’un commentaire (friend_story_comment)', () => {
  it('par défaut, l’entourage de l’AUTEUR à Proche et au-dessus : Proche prévenu, Ami non', async () => {
    const { notified } = await commenter({});
    const relayed = notified('friend_story_comment');
    expect(relayed).toEqual(expect.arrayContaining([SANG, PROCHE]));
    expect(relayed).not.toContain(AMI);
    expect(relayed).not.toContain(CONNAISSANCE);
  });

  it('par défaut, l’entourage du COMMENTATEUR à Sang SEUL : son Sang prévenu, son Proche non', async () => {
    const relayed = (await commenter({})).notified('friend_story_comment');
    expect(relayed).toContain(SANG_DU_COMMENTATEUR);
    expect(relayed).not.toContain(PROCHE_DU_COMMENTATEUR);
  });

  it('chaque moitié suit le réglage de SON propriétaire', async () => {
    const world: World = {
      settings: {
        [AUTEUR]: { circleOnMyContentComment: 'NOBODY' },
        [COMMENTATEUR]: { circleElsewhereComment: 'CLOSE' },
      },
    };
    const relayed = (await commenter(world)).notified('friend_story_comment');
    expect(relayed.sort()).toEqual([SANG_DU_COMMENTATEUR, PROCHE_DU_COMMENTATEUR].sort());
  });

  it('un bloqué avec l’auteur n’est jamais relayé', async () => {
    const relayed = (await commenter(reglage('circleOnMyContentComment', 'PUBLIC'))).notified('friend_story_comment');
    expect(relayed).not.toContain(SANG_BLOQUE);
  });

  it('un bloqué avec le commentateur ne reçoit pas son activité ailleurs', async () => {
    const world: World = { blocks: { [AUTEUR]: [SANG_BLOQUE], [COMMENTATEUR]: [SANG_DU_COMMENTATEUR] } };
    expect((await commenter(world)).notified('friend_story_comment')).not.toContain(SANG_DU_COMMENTATEUR);
  });

  it('l’auteur commenté reste prévenu (story_new_comment), même entourage fermé et sans aucun lien', async () => {
    const world: World = {
      settings: {
        [AUTEUR]: { circleOnMyContentComment: 'NOBODY' },
        [COMMENTATEUR]: { circleElsewhereComment: 'NOBODY' },
      },
    };
    const { notified } = await commenter(world);
    expect(notified('story_new_comment')).toEqual([AUTEUR]);
    expect(notified('friend_story_comment')).toEqual([]);
  });
});

describe('la personne directement visée est toujours prévenue — hors du réglage d’entourage', () => {
  const builderDeps = (world: World) => {
    const m = monde(world);
    const deps: NotificationBuilderDependencies = {
      prisma: m.prisma as unknown as PrismaClient,
      createNotification: m.createNotification as unknown as NotificationBuilderDependencies['createNotification'],
      resolveRecipientLang: async () => 'fr',
      resolveRecipientPrism: async () => ({ lang: 'fr', ordered: ['fr'] }),
      canNotifyAboutPost: async () => true,
      shouldCreateReactionNotification: () => true,
      truncateMessage: (message) => message,
      isConversationMutedFor: async () => false,
    };
    return { deps, notified: m.notified };
  };
  const ferme: World = {
    settings: {
      [AUTEUR]: Object.fromEntries(
        (['circleOnMyContentReaction', 'circleOnMyContentComment'] as const).map((key) => [key, 'NOBODY'])
      ),
    },
  };

  it('son post liké par un inconnu : post_like part à l’auteur', async () => {
    const { deps, notified } = builderDeps(ferme);
    await createPostLikeNotification(deps, { actorId: INCONNU, postId: POST, postAuthorId: AUTEUR, emoji: '❤️' });
    expect(notified('post_like')).toEqual([AUTEUR]);
  });

  it('son post commenté par un inconnu : post_comment part à l’auteur', async () => {
    const { deps, notified } = builderDeps(ferme);
    await createPostCommentNotification(deps, {
      actorId: INCONNU,
      postId: POST,
      postAuthorId: AUTEUR,
      commentId: COMMENT,
      commentPreview: 'bravo',
    });
    expect(notified('post_comment')).toEqual([AUTEUR]);
  });
});
