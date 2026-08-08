/**
 * `filterPostAudience` — le test d'ADMISSION d'un post, l'inverse des
 * énumérateurs d'audience.
 *
 * Tout le domaine social possède déjà des énumérateurs (auteur → destinataires) :
 * `SocialEventsHandler.getVisibilityFilteredRecipients`,
 * `createFriendContentNotificationsBatch`, `createStoryCommentNotificationsBatch`.
 * Ils répondent à « à qui pousser ? » à partir du graphe de l'auteur.
 *
 * Une mention pose la question INVERSE : l'ensemble des nommés est ARBITRAIRE
 * (n'importe quel handle du texte), et il faut décider, pour chacun, « celui-là
 * a-t-il le droit de voir ce post ? ». Les énumérateurs ne répondent pas à
 * celle-là — et leur réponse pour `PUBLIC`/`FRIENDS` (`friendIds`) est un choix
 * de CIBLAGE, pas une règle d'admission : un post public se lit par n'importe
 * qui, ami ou non.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { filterPostAudience } from '../../../../services/posts/postAudience';

const AUTHOR = 'u-author';

/**
 * Le double n'expose que ce que la fonction touche. `friendRequest.findMany`
 * rend les liens d'amitié acceptés ; le filtre est censé n'interroger que
 * l'intersection avec les candidats, jamais le graphe entier.
 */
function makePrisma(friends: string[] = [], overrides: Record<string, any> = {}) {
  return {
    friendRequest: {
      findMany: jest.fn<any>().mockResolvedValue(
        friends.map((id) => ({ senderId: AUTHOR, receiverId: id }))
      ),
    },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    ...overrides,
  } as any;
}

describe('filterPostAudience — un post PUBLIC se lit par n’importe qui', () => {
  it('admet un candidat qui n’est PAS ami de l’auteur', async () => {
    const prisma = makePrisma([]);

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'PUBLIC',
      candidateUserIds: ['u-stranger'],
    });

    expect(admitted).toEqual(['u-stranger']);
  });

  it('ne coûte AUCUNE requête — l’admission publique ne dépend d’aucun graphe', async () => {
    const prisma = makePrisma([]);

    await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'PUBLIC',
      candidateUserIds: ['u-a', 'u-b'],
    });

    expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.findMany).not.toHaveBeenCalled();
  });
});

describe('filterPostAudience — FRIENDS n’admet que les amis', () => {
  it('retient l’ami et écarte l’inconnu', async () => {
    const prisma = makePrisma(['u-friend']);

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: ['u-friend', 'u-stranger'],
    });

    expect(admitted).toEqual(['u-friend']);
  });

  it('reconnaît l’amitié dans les DEUX sens (l’auteur peut être le destinataire de la demande)', async () => {
    const prisma = makePrisma([], {
      friendRequest: {
        findMany: jest.fn<any>().mockResolvedValue([
          { senderId: 'u-friend', receiverId: AUTHOR },
        ]),
      },
    });

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: ['u-friend'],
    });

    expect(admitted).toEqual(['u-friend']);
  });

  it('n’interroge que l’intersection avec les candidats, jamais le graphe entier', async () => {
    const prisma = makePrisma(['u-friend']);

    await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: ['u-friend', 'u-stranger'],
    });

    const where = prisma.friendRequest.findMany.mock.calls[0][0].where;
    const serialized = JSON.stringify(where);
    expect(serialized).toContain('u-friend');
    expect(serialized).toContain('u-stranger');
    expect(where.status).toBe('accepted');
  });
});

describe('filterPostAudience — ONLY est une liste blanche', () => {
  it('n’admet que les ids listés', async () => {
    const prisma = makePrisma(['u-friend']);

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'ONLY',
      visibilityUserIds: ['u-chosen'],
      candidateUserIds: ['u-chosen', 'u-friend', 'u-stranger'],
    });

    expect(admitted).toEqual(['u-chosen']);
  });
});

describe('filterPostAudience — EXCEPT est le graphe ami MOINS les exclus', () => {
  it('écarte l’exclu ET l’inconnu, retient l’ami restant', async () => {
    const prisma = makePrisma(['u-friend', 'u-banned']);

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'EXCEPT',
      visibilityUserIds: ['u-banned'],
      candidateUserIds: ['u-friend', 'u-banned', 'u-stranger'],
    });

    expect(admitted).toEqual(['u-friend']);
  });
});

describe('filterPostAudience — PRIVATE n’a pas d’audience', () => {
  it('n’admet personne, pas même un ami', async () => {
    const prisma = makePrisma(['u-friend']);

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'PRIVATE',
      candidateUserIds: ['u-friend', 'u-stranger'],
    });

    expect(admitted).toEqual([]);
  });
});

describe('filterPostAudience — COMMUNITY n’admet que les co-membres', () => {
  it('retient le co-membre et écarte l’ami hors communauté', async () => {
    const prisma = makePrisma(['u-friend'], {
      communityMember: {
        findMany: jest.fn<any>()
          .mockResolvedValueOnce([{ communityId: 'c-1' }])
          .mockResolvedValueOnce([{ userId: 'u-comember' }]),
      },
    });

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'COMMUNITY',
      candidateUserIds: ['u-comember', 'u-friend'],
    });

    expect(admitted).toEqual(['u-comember']);
  });
});

describe('filterPostAudience — en panne, on REFUSE', () => {
  it('n’admet personne quand le graphe ami est illisible', async () => {
    const prisma = makePrisma([], {
      friendRequest: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
      },
    });

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: ['u-friend'],
    });

    expect(admitted).toEqual([]);
  });

  it('traite une visibilité INCONNUE comme FRIENDS, jamais comme publique', async () => {
    const prisma = makePrisma(['u-friend']);

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'SOMETHING_NEW',
      candidateUserIds: ['u-friend', 'u-stranger'],
    });

    expect(admitted).toEqual(['u-friend']);
  });
});

describe('filterPostAudience — l’auteur voit toujours son propre post', () => {
  it('n’interroge pas le graphe quand l’auteur est le SEUL candidat', async () => {
    const prisma = makePrisma(['u-friend']);

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: [AUTHOR],
    });

    expect(admitted).toEqual([AUTHOR]);
    expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
  });

  it('admet l’auteur même sur un post PRIVATE', async () => {
    const prisma = makePrisma([]);

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'PRIVATE',
      candidateUserIds: [AUTHOR],
    });

    expect(admitted).toEqual([AUTHOR]);
  });
});

describe('filterPostAudience — court-circuit', () => {
  it('rend une liste vide sans requête quand il n’y a aucun candidat', async () => {
    const prisma = makePrisma(['u-friend']);

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: [],
    });

    expect(admitted).toEqual([]);
    expect(prisma.friendRequest.findMany).not.toHaveBeenCalled();
  });

  it('préserve l’ordre des candidats fournis', async () => {
    const prisma = makePrisma(['u-b', 'u-a']);

    const admitted = await filterPostAudience({
      prisma,
      authorId: AUTHOR,
      visibility: 'FRIENDS',
      candidateUserIds: ['u-a', 'u-b'],
    });

    expect(admitted).toEqual(['u-a', 'u-b']);
  });
});
