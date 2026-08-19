/**
 * Lire n'a jamais dépensé un droit — vérifié sur l'ouverture elle-même.
 *
 * La garde existait déjà sur `resolveReferenceAccess`, l'unité que toute lecture
 * traverse. Elle est doublée ICI, sur `getPostById`, parce que c'est CETTE
 * surface que trois chemins rejouent sans qu'un humain regarde : la NSE
 * préfetche le post à la réception de la notification, la revalidation
 * cache-first relit derrière, le pull-to-refresh relit encore. Une consommation
 * greffée ici éteindrait le droit pendant que le téléphone est dans une poche —
 * et aucun test sur l'unité en dessous ne le dirait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../../services/posts/communityVisibility', () => ({
  getCommunityCoMemberIds: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstanceSync: jest.fn<any>().mockReturnValue(null) },
}));

import { PostService } from '../../../../services/PostService';

const BOB = 'u-bob';

const EXPIRED_STORY = {
  id: 'p-1',
  authorId: 'u-author',
  type: 'STORY',
  visibility: 'FRIENDS',
  isQuote: false,
  repostOfId: null,
  originalRepostOfId: null,
  repostOf: null,
  expiresAt: new Date(Date.now() - 3 * 3600_000),
  postMentions: [],
};

describe('PostService.getPostById — une lecture ne dépense rien', () => {
  it('trois ouvertures d\'un contenu expiré n\'écrivent aucun expiredViewAt', async () => {
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 0 });
    const prisma = {
      post: {
        findFirst: jest.fn<any>().mockResolvedValue(EXPIRED_STORY),
        count: jest.fn<any>().mockResolvedValue(0),
      },
      postReaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
      postBookmark: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
      communityMember: { findMany: jest.fn<any>().mockResolvedValue([]) },
      postMention: {
        findUnique: jest.fn<any>().mockResolvedValue({ expiredViewAt: null }),
        updateMany,
      },
    } as any;
    const service = new PostService(prisma);

    await service.getPostById('p-1', BOB);
    await service.getPostById('p-1', BOB);
    await service.getPostById('p-1', BOB);

    expect(updateMany).not.toHaveBeenCalled();
  });
});
