/**
 * #14068 — une réaction à un contenu est relayée à l'entourage, selon le réglage
 * de chacun : l'entourage B de l'AUTEUR (`circleOnMyContentReaction`, défaut
 * Proche) ET l'entourage C du RÉACTEUR (`circleElsewhereReaction`, défaut Sang)
 * — le plus restrictif gagne (#14080). L'auteur garde sa propre notification
 * (`post_like`), hors de ce réglage. Bloqué : jamais.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { relayActivityToEntourage } from '../fanout/activity-relay';
import { createPostLikeNotification } from '../builders/social-engagement';
import type { NotificationBuilderDependencies } from '../builders/dependencies';
import {
  AUTEUR, COMMENTATEUR as REACTEUR, SANG, PROCHE, AMI, SANG_BLOQUE, SANG_DU_COMMENTATEUR, POST, monde, type Link, type World,
} from '../../../__tests__/helpers/circle-world';

const COMMUN_PROCHE = '6000000000000000000000d1';
const COMMUN_AMI = '6000000000000000000000d3';
const LIENS_COMMUNS: readonly Link[] = [
  [AUTEUR, COMMUN_PROCHE, 'CLOSE'],
  [REACTEUR, COMMUN_PROCHE, 'BLOOD'],
  [AUTEUR, COMMUN_AMI, 'FRIEND'],
  [REACTEUR, COMMUN_AMI, 'BLOOD'],
];

const reagir = async (world: World = {}, post: Record<string, unknown> = {}) => {
  const m = monde({ ...world, extraLinks: [...LIENS_COMMUNS, ...(world.extraLinks ?? [])], post: { authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: 'bonjour', ...post } });
  await relayActivityToEntourage(m.deps, { activity: 'reaction', postId: POST, actorId: REACTEUR, emoji: '❤️' });
  return { relayed: m.notified('friend_content_reaction').sort(), m };
};

describe('relais d’une réaction (friend_content_reaction, #14068)', () => {
  it('défaut appliqué sans réglage : seul qui est Proche+ de l’auteur ET Sang du réacteur', async () => {
    expect((await reagir()).relayed).toEqual([COMMUN_PROCHE]);
  });

  it('un Ami de l’auteur n’est pas prévenu au défaut, même Sang du réacteur', async () => {
    expect((await reagir()).relayed).not.toContain(COMMUN_AMI);
  });

  it('auteur réglé « Ami » ⇒ l’Ami commun est prévenu', async () => {
    const { relayed } = await reagir({ settings: { [AUTEUR]: { circleOnMyContentReaction: 'FRIEND' } } });
    expect(relayed).toEqual([COMMUN_PROCHE, COMMUN_AMI].sort());
  });

  it('le Sang de l’auteur seul, ou le Sang du réacteur seul, n’est pas relayé', async () => {
    const { relayed } = await reagir();
    expect(relayed).not.toContain(SANG);
    expect(relayed).not.toContain(PROCHE);
    expect(relayed).not.toContain(SANG_DU_COMMENTATEUR);
  });

  it('réglage « Personne » chez l’auteur ou chez le réacteur ⇒ personne', async () => {
    expect((await reagir({ settings: { [AUTEUR]: { circleOnMyContentReaction: 'NOBODY' } } })).relayed).toEqual([]);
    expect((await reagir({ settings: { [REACTEUR]: { circleElsewhereReaction: 'NOBODY' } } })).relayed).toEqual([]);
  });

  it('un bloqué, avec l’auteur ou avec le réacteur, n’est jamais prévenu', async () => {
    expect((await reagir({ blocks: { [AUTEUR]: [SANG_BLOQUE, COMMUN_PROCHE] } })).relayed).toEqual([]);
    expect((await reagir({ blocks: { [AUTEUR]: [SANG_BLOQUE], [COMMUN_PROCHE]: [REACTEUR] } })).relayed).toEqual([]);
  });

  it('un contenu que le destinataire ne peut pas voir ne lui est pas relayé (ONLY sans lui, PRIVATE)', async () => {
    expect((await reagir({}, { visibility: 'ONLY', visibilityUserIds: [AMI] })).relayed).toEqual([]);
    expect((await reagir({}, { visibility: 'PRIVATE' })).relayed).toEqual([]);
  });

  it('une réaction à son propre contenu n’est pas relayée', async () => {
    const m = monde({ extraLinks: LIENS_COMMUNS, post: { authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '' } });
    await relayActivityToEntourage(m.deps, { activity: 'reaction', postId: POST, actorId: AUTEUR, emoji: '❤️' });
    expect(m.notified('friend_content_reaction')).toEqual([]);
  });

  it('réagir encore (autre emoji, retrait puis remise) au même contenu ne relaie pas une seconde fois', async () => {
    const m = monde({ extraLinks: LIENS_COMMUNS, post: { authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '' } });
    await relayActivityToEntourage(m.deps, { activity: 'reaction', postId: POST, actorId: REACTEUR, emoji: '❤️' });
    await relayActivityToEntourage(m.deps, { activity: 'reaction', postId: POST, actorId: REACTEUR, emoji: '😂' });
    expect(m.notified('friend_content_reaction')).toEqual([COMMUN_PROCHE]);
  });

  it('un post vivant tel que Mongo le stocke (sans clé deletedAt) est relayé ; un post supprimé, non', async () => {
    expect((await reagir()).relayed).toEqual([COMMUN_PROCHE]);
    expect((await reagir({}, { deletedAt: new Date() })).relayed).toEqual([]);
  });

  it('une story expirée n’est pas relayée', async () => {
    expect((await reagir({}, { type: 'STORY', expiresAt: new Date(Date.now() - 1000) })).relayed).toEqual([]);
    expect((await reagir({}, { type: 'STORY', expiresAt: new Date(Date.now() + 3600_000) })).relayed).toEqual([COMMUN_PROCHE]);
  });

  it('une réaction déjà relayée ne relit ni entourage ni admission', async () => {
    const m = monde({ extraLinks: LIENS_COMMUNS, post: { authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '' } });
    await relayActivityToEntourage(m.deps, { activity: 'reaction', postId: POST, actorId: REACTEUR, emoji: '❤️' });
    expect(m.notified('friend_content_reaction')).toEqual([COMMUN_PROCHE]);
    const lectures = jest.spyOn(m.prisma.userPreferences, 'findUnique');
    await relayActivityToEntourage(m.deps, { activity: 'reaction', postId: POST, actorId: REACTEUR, emoji: '😂' });
    expect(lectures).not.toHaveBeenCalled();
  });

  it('la charge dit l’activité, l’auteur du contenu et le type, pour le titre composé par la passerelle', async () => {
    const { m } = await reagir({}, { type: 'STORY' });
    const [params] = m.createNotification.mock.calls[0] as unknown as [Record<string, Record<string, unknown>>];
    expect(params.metadata).toMatchObject({ activity: 'reaction', postId: POST, postType: 'STORY', emoji: '❤️', contentAuthorName: AUTEUR });
  });
});

describe('l’auteur réagi reste prévenu et la réaction est relayée (#14068)', () => {
  it('post_like part à l’auteur, et le relais à l’entourage commun', async () => {
    const m = monde({ extraLinks: LIENS_COMMUNS, post: { authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '' } });
    const deps: NotificationBuilderDependencies = {
      prisma: m.prisma as unknown as PrismaClient,
      createNotification: m.createNotification as unknown as NotificationBuilderDependencies['createNotification'],
      resolveRecipientLang: async () => 'fr',
      resolveRecipientPrism: async () => ({ lang: 'fr', ordered: ['fr'] }),
      canNotifyAboutPost: async () => true,
      shouldCreateReactionNotification: () => true,
      truncateMessage: (message) => message,
      isConversationMutedFor: async () => false,
      relayThrottle: { get: async () => null, setnx: async () => true },
    };
    await createPostLikeNotification(deps, { actorId: REACTEUR, postId: POST, postAuthorId: AUTEUR, emoji: '❤️' });
    expect(m.notified('post_like')).toEqual([AUTEUR]);
    expect(m.notified('friend_content_reaction')).toEqual([COMMUN_PROCHE]);
  });
});
