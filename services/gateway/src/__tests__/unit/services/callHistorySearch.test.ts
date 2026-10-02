/**
 * Le journal des appels se filtre par TYPE et se cherche par NOM côté serveur
 * (#8203) : une seule requête au lieu de toutes les pages des 90 jours.
 *
 * Le nom cherché est celui que la ligne AFFICHE — nom du pair, puis son
 * identifiant, puis le titre de la conversation — sans accents ni casse,
 * comme la recherche locale des clients qu'elle remplace.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

import { listCallHistory } from '../../../services/calls/callHistoryList';
import { journalConversationsMatching } from '../../../services/calls/callHistorySearch';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = '507f1f77bcf86cd799439022';
const VIEWER = { userId: USER_ID, role: 'USER' } as any;

const memberships = [
  { conversationId: 'c-eloi', conversation: { type: 'direct', title: null } },
  { conversationId: 'c-ada', conversation: { type: 'direct', title: null } },
  { conversationId: 'c-team', conversation: { type: 'group', title: 'Équipe produit' } },
  { conversationId: 'c-orphan', conversation: { type: 'direct', title: 'Ancien fil' } },
];
const peers = [
  { conversationId: 'c-eloi', user: { displayName: 'Éloi Bâ', username: 'eloi_b' } },
  { conversationId: 'c-ada', user: { displayName: null, username: 'ada' } },
];

const searchPrisma = () => {
  const participantFindMany = jest.fn<any>().mockImplementation(async (args: any) =>
    args.where.userId === USER_ID ? memberships : peers,
  );
  return { prisma: { participant: { findMany: participantFindMany } } as unknown as PrismaClient, participantFindMany };
};

describe('journalConversationsMatching', () => {
  it('trouve le pair sans accents ni casse : « ELOI » trouve « Éloi Bâ »', async () => {
    const { prisma } = searchPrisma();
    expect(await journalConversationsMatching(prisma, USER_ID, 'ELOI')).toEqual(['c-eloi']);
  });

  it('cherche aussi l’identifiant du pair, et le titre d’un groupe', async () => {
    const { prisma } = searchPrisma();
    expect(await journalConversationsMatching(prisma, USER_ID, 'ada')).toEqual(['c-ada']);
    expect(await journalConversationsMatching(prisma, USER_ID, 'equipe')).toEqual(['c-team']);
  });

  it('un fil direct sans pair se nomme par son titre, comme la ligne', async () => {
    const { prisma } = searchPrisma();
    expect(await journalConversationsMatching(prisma, USER_ID, 'ancien')).toEqual(['c-orphan']);
  });

  it('ne lit que les conversations dont le lecteur est membre actif', async () => {
    const { prisma, participantFindMany } = searchPrisma();
    await journalConversationsMatching(prisma, USER_ID, 'x');
    expect(participantFindMany.mock.calls[0][0].where).toEqual({ userId: USER_ID, isActive: true });
    expect(participantFindMany.mock.calls[1][0].where).toEqual({
      conversationId: { in: ['c-eloi', 'c-ada', 'c-orphan'] },
      userId: { not: USER_ID },
    });
  });
});

describe('listCallHistory — filtres serveur (#8203)', () => {
  const historyPrisma = () => {
    const findMany = jest.fn<any>().mockResolvedValue([]);
    const { prisma: search } = searchPrisma();
    return { prisma: { ...(search as any), callSession: { findMany } } as unknown as PrismaClient, findMany };
  };
  const journalRead = (findMany: jest.Mock<any>) => findMany.mock.calls[findMany.mock.calls.length - 1][0].where;

  it('« vidéo » ne rend que les appels vidéo', async () => {
    const { prisma, findMany } = historyPrisma();
    await listCallHistory(prisma, USER_ID, { limit: 30, filter: 'all', type: 'video', viewer: VIEWER });
    expect(journalRead(findMany).isVideo).toBe(true);
  });

  it('« audio » garde les appels sans type enregistré, jamais les vidéos', async () => {
    const { prisma, findMany } = historyPrisma();
    await listCallHistory(prisma, USER_ID, { limit: 30, filter: 'all', type: 'audio', viewer: VIEWER });
    const where = journalRead(findMany);
    expect(where.AND).toContainEqual({ OR: [{ isVideo: { isSet: false } }, { isVideo: null }, { isVideo: false }] });
    expect(where.NOT).toBeUndefined();
  });

  it('une recherche restreint le journal aux conversations qui portent ce nom', async () => {
    const { prisma, findMany } = historyPrisma();
    await listCallHistory(prisma, USER_ID, { limit: 30, filter: 'all', q: 'éloi', viewer: VIEWER });
    expect(journalRead(findMany).conversationId).toEqual({ in: ['c-eloi'] });
  });

  it('une recherche sans correspondance ne lit aucun appel', async () => {
    const { prisma, findMany } = historyPrisma();
    const result = await listCallHistory(prisma, USER_ID, { limit: 30, filter: 'all', q: 'zzz', viewer: VIEWER });
    expect(findMany).not.toHaveBeenCalled();
    expect(result).toEqual({ items: [], hasMore: false, nextCursor: undefined });
  });

  it('une recherche blanche est ignorée', async () => {
    const { prisma, findMany } = historyPrisma();
    await listCallHistory(prisma, USER_ID, { limit: 30, filter: 'all', q: '   ', viewer: VIEWER });
    expect(journalRead(findMany).conversationId).toBeUndefined();
  });
});
