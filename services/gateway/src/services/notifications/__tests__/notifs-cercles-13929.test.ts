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
import type { RelationAudienceChoice, CircleNotifyKey } from '@meeshy/shared/utils/relation-levels';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { createFriendContentNotificationsBatch, type FriendContentFanoutParams } from '../fanout/friend-content';
import { createStoryCommentNotificationsBatch, type StoryCommentFanoutParams } from '../fanout/story-comment';
import { createPostCommentNotification, createPostLikeNotification } from '../builders/social-engagement';
import type { NotificationBuilderDependencies } from '../builders/dependencies';

import {
  AUTEUR, COMMENTATEUR, SANG, PROCHE, AMI, CONNAISSANCE, CO_MEMBRE, INCONNU, SANG_BLOQUE,
  SANG_DU_COMMENTATEUR, POST, COMMENT, monde, type Link, type World,
} from '../../../__tests__/helpers/circle-world';

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

/**
 * #14080 — le plus restrictif gagne : un destinataire du relais passe le seuil B de
 * l'AUTEUR (mesuré depuis l'auteur) ET le seuil C du COMMENTATEUR (mesuré depuis
 * le commentateur). « Personne » chez l'un ⇒ aucun relais.
 */
const COMMUN_PROCHE = '6000000000000000000000d1';
const COMMUN_CONNAISSANCE_PROCHE = '6000000000000000000000d2';
const COMMUN_CONNAISSANCE_AMI = '6000000000000000000000d3';
const LIENS_COMMUNS: readonly Link[] = [
  [AUTEUR, COMMUN_PROCHE, 'CLOSE'],
  [COMMENTATEUR, COMMUN_PROCHE, 'BLOOD'],
  [AUTEUR, COMMUN_CONNAISSANCE_PROCHE, 'ACQUAINTANCE'],
  [COMMENTATEUR, COMMUN_CONNAISSANCE_PROCHE, 'CLOSE'],
  [AUTEUR, COMMUN_CONNAISSANCE_AMI, 'ACQUAINTANCE'],
  [COMMENTATEUR, COMMUN_CONNAISSANCE_AMI, 'FRIEND'],
];
const relais = async (settings: World['settings'] = {}, world: World = {}) =>
  (await commenter({ ...world, settings, extraLinks: LIENS_COMMUNS })).notified('friend_story_comment').sort();

describe('B ∩ C — le relais d’un commentaire passe les DEUX seuils (friend_story_comment, #14080)', () => {
  it('par défaut (auteur Proche, commentateur Sang) : seul qui est Proche+ de l’auteur ET Sang du commentateur', async () => {
    expect(await relais()).toEqual([COMMUN_PROCHE]);
  });

  it('le Sang de l’auteur seul, ou le Sang du commentateur seul, n’est plus relayé', async () => {
    const relayed = await relais();
    expect(relayed).not.toContain(SANG);
    expect(relayed).not.toContain(SANG_DU_COMMENTATEUR);
  });

  it('commentateur sur « Personne » ⇒ aucun relais, même si l’auteur a « Public »', async () => {
    const settings = {
      [AUTEUR]: { circleOnMyContentComment: 'PUBLIC' as const },
      [COMMENTATEUR]: { circleElsewhereComment: 'NOBODY' as const },
    };
    expect(await relais(settings)).toEqual([]);
  });

  it('auteur sur « Personne » ⇒ aucun relais, même si le commentateur a « Public »', async () => {
    const settings = {
      [AUTEUR]: { circleOnMyContentComment: 'NOBODY' as const },
      [COMMENTATEUR]: { circleElsewhereComment: 'PUBLIC' as const },
    };
    expect(await relais(settings)).toEqual([]);
  });

  it('auteur « Public », commentateur « Proche » : la Connaissance de l’auteur qui est Proche du commentateur oui, son Ami non', async () => {
    const settings = {
      [AUTEUR]: { circleOnMyContentComment: 'PUBLIC' as const },
      [COMMENTATEUR]: { circleElsewhereComment: 'CLOSE' as const },
    };
    expect(await relais(settings)).toEqual([COMMUN_PROCHE, COMMUN_CONNAISSANCE_PROCHE].sort());
  });

  it('un commentaire sur son propre contenu ne relève que du seuil B de l’auteur', async () => {
    const m = await commenter({ extraLinks: LIENS_COMMUNS }, { commenterId: AUTEUR });
    expect(m.notified('friend_story_comment').sort()).toEqual([COMMUN_PROCHE, PROCHE, SANG].sort());
  });

  it('un bloqué avec l’auteur n’est jamais relayé', async () => {
    const settings = {
      [AUTEUR]: { circleOnMyContentComment: 'PUBLIC' as const },
      [COMMENTATEUR]: { circleElsewhereComment: 'PUBLIC' as const },
    };
    expect(await relais(settings, { blocks: { [AUTEUR]: [SANG_BLOQUE, COMMUN_PROCHE] } })).not.toContain(COMMUN_PROCHE);
  });

  it('un bloqué avec le commentateur n’est jamais relayé', async () => {
    expect(await relais({}, { blocks: { [AUTEUR]: [SANG_BLOQUE], [COMMENTATEUR]: [COMMUN_PROCHE] } })).toEqual([]);
  });

  it('l’auteur commenté reste prévenu (story_new_comment), même entourages fermés et sans aucun lien', async () => {
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

const CORRESPONDANT = '6000000000000000000000e1';

describe('ONLY — les personnes choisies LIÉES à l’auteur sont toujours prévenues (#14080, #14105)', () => {
  const choisis = (ids: string[]) => ({ visibility: 'ONLY', visibilityUserIds: ids });
  const conversationDirecte: World = { directs: [[AUTEUR, CORRESPONDANT]] };

  it('un choisi lié (Connaissance et plus) est prévenu même si l’auteur a réglé « Personne »', async () => {
    expect(await publier(reglage('circlePublicationPost', 'NOBODY'), choisis([CONNAISSANCE]))).toEqual([CONNAISSANCE]);
  });

  it('un choisi qui partage une conversation directe avec l’auteur est prévenu', async () => {
    expect(await publier({ ...conversationDirecte, ...reglage('circlePublicationPost', 'NOBODY') }, choisis([CORRESPONDANT]))).toEqual([CORRESPONDANT]);
  });

  it('une conversation directe où le choisi n’a JAMAIS écrit n’est pas un lien', async () => {
    const world = { ...conversationDirecte, silent: [CORRESPONDANT], ...reglage('circlePublicationPost', 'NOBODY') };
    expect(await publier(world, choisis([CORRESPONDANT]))).toEqual([]);
  });

  it('un choisi sans AUCUN lien n’est pas prévenu (il voit le post, rien ne le lui pousse)', async () => {
    expect(await publier(reglage('circlePublicationPost', 'NOBODY'), choisis([INCONNU]))).toEqual([]);
    expect((await publier({}, choisis([INCONNU, PROCHE, CONNAISSANCE]))).sort()).toEqual([CONNAISSANCE, PROCHE].sort());
  });

  it('un membre de la seule communauté n’est pas un lien', async () => {
    expect(await publier(reglage('circlePublicationPost', 'NOBODY'), choisis([CO_MEMBRE]))).toEqual([]);
  });

  it('un choisi lié mais bloqué, dans un sens ou dans l’autre, ne l’est jamais', async () => {
    const world: World = { blocks: { [AUTEUR]: [SANG_BLOQUE], [CONNAISSANCE]: [AUTEUR] } };
    expect(await publier(world, choisis([SANG_BLOQUE, CONNAISSANCE, AMI]))).toEqual([AMI]);
  });

  it('un compte supprimé ou inactif, même choisi et lié, n’est jamais prévenu', async () => {
    expect(await publier({ deleted: [CONNAISSANCE] }, choisis([CONNAISSANCE, AMI]))).toEqual([AMI]);
  });

  it('une lecture de lien en panne ne prévient aucun choisi', async () => {
    expect(await publier({ ...reglage('circlePublicationPost', 'NOBODY'), directsDown: true }, choisis([CONNAISSANCE]))).toEqual([]);
  });

  it('une republication ONLY n’hérite pas des choisis de la source : elle suit le réglage du republieur', async () => {
    const repost = { ...choisis([CONNAISSANCE, PROCHE]), isRepost: true };
    expect(await publier(reglage('circlePublicationRepost', 'NOBODY'), repost)).toEqual([]);
    expect(await publier({}, repost)).toEqual([PROCHE]);
  });

  it('un choisi et mentionné ne reçoit que la mention', async () => {
    expect(await publier({}, { ...choisis([CONNAISSANCE]), excludeUserIds: [CONNAISSANCE] })).toEqual([]);
  });

  it('les membres d’une communauté (post COMMUNITY) suivent le réglage de l’auteur', async () => {
    const communities = { 'c-1': [AUTEUR, CO_MEMBRE] };
    const post = { visibility: 'COMMUNITY', visibilityUserIds: ['c-1'] };
    expect(await publier({ communities }, post)).not.toContain(CO_MEMBRE);
    expect(await publier({ communities, ...reglage('circlePublicationPost', 'COMMUNITY') }, post)).toContain(CO_MEMBRE);
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
