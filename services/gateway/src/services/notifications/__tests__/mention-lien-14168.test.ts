/**
 * #14168 — une mention ne pousse plus de notification à un INCONNU.
 *
 * Même règle de lien que les choisis d'un post `ONLY` (#14105) : la personne
 * nommée n'est prévenue (`user_mentioned`) que si elle est liée à celui qui la
 * nomme — niveau effectif Connaissance ou plus, ou conversation directe où ELLE a
 * écrit. Sans lien, la mention reste (elle ouvre le post), rien ne part. Le
 * blocage, dans un sens ou dans l'autre, coupe toujours. Dans un commentaire,
 * l'auteur du post et l'auteur du commentaire parent sont déjà prévenus de ce
 * commentaire : les nommer n'est pas un relais vers un inconnu.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { createPostMentionNotificationsBatch, type PostMentionFanoutParams } from '../fanout/post-mention';
import { createCommentMentionNotificationsBatch, type CommentMentionFanoutParams } from '../fanout/comment-mention';
import { createStoryCommentNotificationsBatch } from '../fanout/story-comment';
import { createFriendContentNotificationsBatch } from '../fanout/friend-content';
import {
  AUTEUR, COMMENTATEUR, SANG, PROCHE, CONNAISSANCE, CO_MEMBRE, INCONNU, SANG_BLOQUE,
  SANG_DU_COMMENTATEUR, POST, COMMENT, monde, type World,
} from '../../../__tests__/helpers/circle-world';

const CORRESPONDANT = '6000000000000000000000e1';
const PARENT = '6000000000000000000000e2';

const nommerDansUnPost = async (mentioned: string[], world: World = {}, over: Partial<PostMentionFanoutParams> = {}) => {
  const m = monde(world);
  await createPostMentionNotificationsBatch(m.deps, {
    postId: POST,
    posterId: AUTEUR,
    mentionedUserIds: mentioned,
    postExcerpt: 'regardez',
    visibility: 'PUBLIC',
    ...over,
  });
  return m.notified('user_mentioned').sort();
};

const nommerDansUnCommentaire = async (
  mentioned: string[],
  world: World = {},
  over: Partial<CommentMentionFanoutParams> = {}
) => {
  const m = monde(world);
  await createCommentMentionNotificationsBatch(m.deps, {
    commentId: COMMENT,
    postId: POST,
    commenterId: COMMENTATEUR,
    mentionedUserIds: mentioned,
    commentExcerpt: 'regarde',
    postAuthorId: AUTEUR,
    visibility: 'PUBLIC',
    ...over,
  });
  return m.notified('user_mentioned').sort();
};

describe('mention dans un post (#14168)', () => {
  it('un inconnu nommé n’est pas prévenu ; un lien (Connaissance et plus) l’est', async () => {
    expect(await nommerDansUnPost([INCONNU, CONNAISSANCE, SANG])).toEqual([CONNAISSANCE, SANG].sort());
  });

  it('un membre de la seule communauté n’est pas un lien', async () => {
    expect(await nommerDansUnPost([CO_MEMBRE])).toEqual([]);
  });

  it('une conversation directe où la personne a écrit est un lien ; où elle n’a jamais écrit, non', async () => {
    const directe: World = { directs: [[AUTEUR, CORRESPONDANT]] };
    expect(await nommerDansUnPost([CORRESPONDANT], directe)).toEqual([CORRESPONDANT]);
    expect(await nommerDansUnPost([CORRESPONDANT], { ...directe, silent: [CORRESPONDANT] })).toEqual([]);
  });

  it('un lien bloqué, dans un sens ou dans l’autre, n’est jamais prévenu', async () => {
    const world: World = { blocks: { [AUTEUR]: [SANG_BLOQUE], [PROCHE]: [AUTEUR] } };
    expect(await nommerDansUnPost([SANG_BLOQUE, PROCHE, SANG], world)).toEqual([SANG]);
  });

  it('une lecture de lien en panne ne prévient personne', async () => {
    expect(await nommerDansUnPost([CONNAISSANCE], { directsDown: true })).toEqual([]);
  });

  it('cent inconnus nommés ne coûtent aucune notification', async () => {
    const foule = Array.from({ length: 100 }, (_, i) => `62${String(i).padStart(22, '0')}`);
    expect(await nommerDansUnPost(foule)).toEqual([]);
  });
});

describe('mention dans un commentaire (#14168)', () => {
  it('un inconnu du commentateur n’est pas prévenu, même sur un post PUBLIC ; un lien du commentateur l’est', async () => {
    expect(await nommerDansUnCommentaire([INCONNU, SANG_DU_COMMENTATEUR])).toEqual([SANG_DU_COMMENTATEUR]);
  });

  it('le lien se mesure depuis le COMMENTATEUR, pas depuis l’auteur du post', async () => {
    expect(await nommerDansUnCommentaire([CONNAISSANCE])).toEqual([]);
  });

  it('ceux que le commentaire prévient déjà (auteur du post, du commentaire parent) le restent par la mention', async () => {
    expect(await nommerDansUnCommentaire([AUTEUR, PARENT, INCONNU], {}, { directlyAddressedUserIds: [AUTEUR, PARENT] })).toEqual(
      [AUTEUR, PARENT].sort()
    );
  });

  it('l’auteur du post n’est exempté du lien que si l’appelant le dit prévenu (une réponse ne le prévient pas)', async () => {
    expect(await nommerDansUnCommentaire([AUTEUR], {}, { directlyAddressedUserIds: [PARENT] })).toEqual([]);
  });

  it('l’auteur du post bloqué par le commentateur n’est pas prévenu par la mention', async () => {
    const world: World = { blocks: { [AUTEUR]: [SANG_BLOQUE, COMMENTATEUR] } };
    expect(await nommerDansUnCommentaire([AUTEUR], world, { directlyAddressedUserIds: [AUTEUR] })).toEqual([]);
  });
});

describe('un nommé que la mention ne prévient pas garde sa notification d’éventail (#14168, audit B1)', () => {
  const ANCIEN = '6000000000000000000000e3';

  it('un ancien commentateur nommé par un inconnu reçoit story_thread_reply', async () => {
    const m = monde({ previousCommenters: [ANCIEN] });
    await createStoryCommentNotificationsBatch(m.deps, {
      postId: POST, commentId: COMMENT, storyAuthorId: AUTEUR, commenterId: COMMENTATEUR,
      commentExcerpt: '@ancien', postType: 'STORY', visibility: 'PUBLIC', mentionedUserIds: [ANCIEN],
    });
    expect(m.notified('story_thread_reply')).toEqual([ANCIEN]);
  });

  it('un ancien commentateur LIÉ au commentateur, nommé, ne reçoit que la mention', async () => {
    const m = monde({ previousCommenters: [SANG_DU_COMMENTATEUR] });
    await createStoryCommentNotificationsBatch(m.deps, {
      postId: POST, commentId: COMMENT, storyAuthorId: AUTEUR, commenterId: COMMENTATEUR,
      commentExcerpt: '@sang', postType: 'STORY', visibility: 'PUBLIC', mentionedUserIds: [SANG_DU_COMMENTATEUR],
    });
    expect(m.notified('story_thread_reply')).toEqual([]);
  });

  it('un co-membre nommé (sans lien), relais COMMUNITY de l’auteur, reçoit friend_new_post', async () => {
    const m = monde({ settings: { [AUTEUR]: { circlePublicationPost: 'COMMUNITY' } } });
    await createFriendContentNotificationsBatch(m.deps, {
      postId: POST, authorId: AUTEUR, contentType: 'POST', visibility: 'PUBLIC', mentionedUserIds: [CO_MEMBRE, PROCHE],
    });
    expect(m.notified('friend_new_post')).toContain(CO_MEMBRE);
    expect(m.notified('friend_new_post')).not.toContain(PROCHE);
  });
});
