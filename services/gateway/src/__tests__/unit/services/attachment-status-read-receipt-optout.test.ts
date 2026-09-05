/**
 * `GET /attachments/:attachmentId/status-details` — la réciprocité
 * `showReadReceipts` gouverne AUSSI la consommation audio/vidéo (#3907).
 *
 * Le lot d'origine (`read-exactness-design` § 5) a posé cette réciprocité sur
 * cinq sites de `MessageReadStatusService`, tous sur le chemin TEXTE. Celui-ci
 * construisait ses participants par une requête à lui et ne passait jamais par
 * la règle : position d'écoute, couverture des segments, indicateur
 * « terminé » et langues consultées d'un participant opt-out étaient servis
 * intégralement à tout autre participant.
 *
 * > Une préférence appliquée sur cinq portes et pas sur la sixième ne protège
 * > pas « presque » : elle protège ce que l'utilisateur voit le moins. Un
 * > accusé texte se lit d'un coup d'œil ; une position d'écoute et une
 * > couverture de segments disent combien de fois et jusqu'où.
 *
 * ## Pourquoi les témoins regardent le `where`, ici
 *
 * `total` vient d'un `count` SÉPARÉ sur le même `where`. Une exclusion faite
 * après coup, dans la boucle d'enrichissement, rétrécirait la page en laissant
 * le total entier — le compte dirait alors exactement ce que l'exclusion
 * cache. Le témoin porte donc sur la CLAUSE, parce que c'est elle qui gouverne
 * les deux requêtes ; et un témoin de sortie l'accompagne pour prouver que la
 * clause a bien l'effet qu'on lui prête.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockLoadPrivacyPreferencesCached = jest.fn();
jest.mock('../../../services/preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: (...args: any[]) => mockLoadPrivacyPreferencesCached(...args),
}));

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const LECTEUR = { participantId: 'p-lecteur', userId: 'u-lecteur' };
const DISCRET = { participantId: 'p-discret', userId: 'u-discret' };
const BAVARD = { participantId: 'p-bavard', userId: 'u-bavard' };

function entree(participantId: string) {
  return {
    participantId,
    viewedAt: new Date('2026-08-30T10:00:00Z'),
    downloadedAt: null,
    listenedAt: new Date('2026-08-30T10:01:00Z'),
    watchedAt: null,
    listenCount: 3,
    watchCount: 0,
    listenedComplete: true,
    watchedComplete: false,
    lastPlayPositionMs: 42_000,
    lastWatchPositionMs: null,
    listenSegments: null,
    watchSegments: null,
    viewCount: 1,
    viewedLanguages: ['fr'],
  };
}

function makePrisma() {
  const findMany = jest.fn<any>();
  const count = jest.fn<any>();
  return {
    findMany,
    count,
    prisma: {
      messageAttachment: {
        findUnique: jest.fn<any>().mockResolvedValue({
          message: {
            conversation: {
              participants: [
                { id: LECTEUR.participantId, userId: LECTEUR.userId },
                { id: DISCRET.participantId, userId: DISCRET.userId },
                { id: BAVARD.participantId, userId: BAVARD.userId },
              ],
            },
          },
        }),
      },
      attachmentStatusEntry: { findMany, count },
      participant: {
        findMany: jest.fn<any>().mockImplementation(async ({ where }: any) =>
          (where.id.in as string[]).map((id) => ({
            id,
            displayName: id,
            avatar: null,
            user: { avatar: null },
          }))
        ),
      },
    } as any,
  };
}

describe('getAttachmentStatusDetails — réciprocité showReadReceipts (#3907)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exclut de la CLAUSE le participant opt-out — donc de la page ET du total', async () => {
    const { prisma, findMany, count } = makePrisma();
    mockLoadPrivacyPreferencesCached.mockResolvedValue(
      new Map([[DISCRET.userId, { showReadReceipts: false }]])
    );
    findMany.mockResolvedValue([entree(BAVARD.participantId)]);
    count.mockResolvedValue(1);

    const service = new MessageReadStatusService(prisma);
    const res = await service.getAttachmentStatusDetails(PIECE, { viewerUserId: LECTEUR.userId });

    // La clause gouverne les DEUX requêtes — c'est ce qui rend `total` honnête.
    expect(count.mock.calls[0][0].where.participantId).toEqual({ notIn: [DISCRET.participantId] });
    expect(findMany.mock.calls[0][0].where.participantId).toEqual({ notIn: [DISCRET.participantId] });

    expect(res.statuses.map(s => s.participantId)).toEqual([BAVARD.participantId]);
    expect(res.pagination.total).toBe(1);
  });

  it('n\'exclut PAS le lecteur lui-même — sa propre ligne lui reste visible', async () => {
    const { prisma, findMany, count } = makePrisma();
    mockLoadPrivacyPreferencesCached.mockResolvedValue(
      new Map([[LECTEUR.userId, { showReadReceipts: false }]])
    );
    findMany.mockResolvedValue([entree(LECTEUR.participantId)]);
    count.mockResolvedValue(1);

    const service = new MessageReadStatusService(prisma);
    const res = await service.getAttachmentStatusDetails(PIECE, { viewerUserId: LECTEUR.userId });

    // Aucune exclusion : le seul opt-out EST le demandeur.
    expect(count.mock.calls[0][0].where.participantId).toBeUndefined();
    expect(res.statuses.map(s => s.participantId)).toEqual([LECTEUR.participantId]);
  });

  it('sans lecteur nommé, la porte est fail-closed — l\'opt-out disparaît quand même', async () => {
    const { prisma, findMany, count } = makePrisma();
    mockLoadPrivacyPreferencesCached.mockResolvedValue(
      new Map([[DISCRET.userId, { showReadReceipts: false }]])
    );
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    const service = new MessageReadStatusService(prisma);
    await service.getAttachmentStatusDetails(PIECE);

    // Une exception fabriquée serait pire que pas d'exception.
    expect(count.mock.calls[0][0].where.participantId).toEqual({ notIn: [DISCRET.participantId] });
  });

  it('ne contraint PAS la requête quand personne n\'a désactivé — non-régression', async () => {
    const { prisma, findMany, count } = makePrisma();
    mockLoadPrivacyPreferencesCached.mockResolvedValue(new Map());
    findMany.mockResolvedValue([entree(BAVARD.participantId), entree(DISCRET.participantId)]);
    count.mockResolvedValue(2);

    const service = new MessageReadStatusService(prisma);
    const res = await service.getAttachmentStatusDetails(PIECE, { viewerUserId: LECTEUR.userId });

    // Sans ce témoin, une garde qui exclurait TOUJOURS passerait les trois
    // précédents : ils n'exigent que des absences.
    expect(count.mock.calls[0][0].where.participantId).toBeUndefined();
    expect(res.statuses).toHaveLength(2);
    expect(res.pagination.total).toBe(2);
  });
});
