/**
 * #14234 — un compte supprimé ou désactivé n'apparaît dans aucun entourage, et
 * le propriétaire d'un entourage (auteur, acteur) doit être vivant pour en avoir
 * un. « Vivant » = ce que le schéma déclare : `User.isActive` vrai et
 * `User.deletedAt` absent ou nul. Un compte jamais supprimé n'a PAS de clé
 * `deletedAt` (leçon 318) : il reste prévenu.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { createFriendContentNotificationsBatch } from '../fanout/friend-content';
import { relayActivityToEntourage, relayRepostToEntourage } from '../fanout/activity-relay';
import { resolveEntourage, resolveLinkedAudience } from '../fanout/entourage';
import {
  AUTEUR, COMMENTATEUR as ACTEUR, SANG, PROCHE, AMI, CONNAISSANCE, CO_MEMBRE, POST, monde, type Link, type World,
} from '../../../__tests__/helpers/circle-world';

const PUBLIC_A = { settings: { [AUTEUR]: { circlePublicationPost: 'PUBLIC' } } } as const;

const publier = async (world: World) => {
  const m = monde(world);
  await createFriendContentNotificationsBatch(m.deps, { postId: POST, authorId: AUTEUR, contentType: 'POST', visibility: 'PUBLIC' });
  return m.notified().sort();
};

const COMMUN = '6000000000000000000000d1';
const LIENS_COMMUNS: readonly Link[] = [
  [AUTEUR, COMMUN, 'CLOSE'],
  [ACTEUR, COMMUN, 'BLOOD'],
];

const reagir = async (world: World) => {
  const m = monde({ ...world, extraLinks: LIENS_COMMUNS, post: { authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: 'bonjour' } });
  await relayActivityToEntourage(m.deps, { activity: 'reaction', postId: POST, actorId: ACTEUR, emoji: '❤️' });
  return m.notified('friend_content_reaction');
};

const REPOST = 'ffffffffffffffffffffffff';
const republier = async (world: World) => {
  const original = { id: POST, authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '' };
  const repost = { id: REPOST, authorId: ACTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '', isQuote: false, repostOfId: POST };
  const m = monde({ ...world, extraLinks: LIENS_COMMUNS, post: original });
  const findFirst = m.prisma.post.findFirst;
  m.prisma.post.findFirst = (async (args?: { where?: { id?: string } }) => (args?.where?.id === REPOST ? repost : findFirst(args))) as typeof findFirst;
  await relayRepostToEntourage(m.deps, { originalPostId: POST, repostId: REPOST, actorId: ACTEUR, reposterEntourageNotified: false });
  return m.notified('friend_content_repost');
};

describe('l’entourage ne compte que des comptes vivants (#14234)', () => {
  it('une republication (entourage B seul) : un republieur supprimé ou désactivé ne relaie rien', async () => {
    expect(await republier({})).toContain(COMMUN);
    expect(await republier({ deleted: [ACTEUR] })).toEqual([]);
    expect(await republier({ inactive: [ACTEUR] })).toEqual([]);
  });

  it('témoin : un lien SUPPRIMÉ et un lien DÉSACTIVÉ ne sont ni l’un ni l’autre prévenus', async () => {
    expect(await publier({ ...PUBLIC_A, deleted: [PROCHE], inactive: [AMI] })).toEqual([SANG, CONNAISSANCE, CO_MEMBRE].sort());
  });

  it('un compte jamais supprimé (clé `deletedAt` absente) reste prévenu', async () => {
    expect(await publier(PUBLIC_A)).toEqual(expect.arrayContaining([SANG, PROCHE, AMI, CONNAISSANCE]));
  });

  it('un auteur supprimé ou désactivé n’a plus d’entourage', async () => {
    expect(await publier({ ...PUBLIC_A, deleted: [AUTEUR] })).toEqual([]);
    expect(await publier({ ...PUBLIC_A, inactive: [AUTEUR] })).toEqual([]);
  });

  it('le relais d’un tiers : un destinataire commun désactivé n’est pas prévenu', async () => {
    expect(await reagir({})).toEqual([COMMUN]);
    expect(await reagir({ inactive: [COMMUN] })).toEqual([]);
  });

  it('le relais d’un tiers : un acteur supprimé ne relaie rien', async () => {
    expect(await reagir({ deleted: [ACTEUR] })).toEqual([]);
  });

  it('une seule lecture bornée des comptes vivants, jamais une par destinataire', async () => {
    const m = monde(PUBLIC_A);
    const findMany = jest.spyOn(m.prisma.user, 'findMany');
    await resolveEntourage(m.prisma as unknown as PrismaClient, { ownerId: AUTEUR, key: 'circlePublicationPost' });
    const livenessReads = findMany.mock.calls.filter(([args]) => (args.where as { isActive?: boolean }).isActive === true);
    expect(livenessReads).toHaveLength(1);
  });

  it('les personnes nommées : un lien jamais supprimé est prévenu, un lien supprimé ne l’est pas', async () => {
    const m = monde({ deleted: [AMI] });
    const linked = await resolveLinkedAudience(m.prisma as unknown as PrismaClient, { ownerId: AUTEUR, candidateUserIds: [PROCHE, AMI] });
    expect(linked).toEqual([PROCHE]);
  });

  it('les personnes nommées : un auteur désactivé ne prévient personne', async () => {
    const m = monde({ inactive: [AUTEUR] });
    expect(await resolveLinkedAudience(m.prisma as unknown as PrismaClient, { ownerId: AUTEUR, candidateUserIds: [PROCHE] })).toEqual([]);
  });
});
