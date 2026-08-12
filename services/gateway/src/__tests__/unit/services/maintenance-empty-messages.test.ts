/**
 * Le balayage des messages vides — quatrième écrivain de `deletedAt` sur un
 * `Message`, et le seul en LOT.
 *
 * Il n'avait aucun test. Le cycle précédent lui a donné le recalcul de
 * `lastMessageAt` (il retirait précisément les messages fantômes susceptibles
 * d'épingler l'ordre de la liste) ; celui-ci lui donne la réparation des
 * COMPTEURS, que ses retraits faisaient dériver sans qu'il puisse les
 * décrémenter : il ne tient de ses messages que leur id et leur conversation,
 * jamais l'auteur ni le contenu qu'un décrément demande.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockRecomputeIfTracked = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    recomputeIfTracked: (...a: any[]) => mockRecomputeIfTracked(...a),
  },
}));

import { MaintenanceService } from '../../../services/MaintenanceService';

const CONV_A = '507f1f77bcf86cd799439011';
const CONV_B = '507f1f77bcf86cd799439022';
const MSG_1 = '507f1f77bcf86cd799439031';
const MSG_2 = '507f1f77bcf86cd799439032';
const MSG_3 = '507f1f77bcf86cd799439033';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    message: {
      findRaw: jest.fn<any>().mockResolvedValue([]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    messageAttachment: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        lastMessageAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  } as any;
}

/** Le balayage est privé — c'est un travail de fond, sans route ni appelant public. */
function sweep(prisma: any): Promise<void> {
  const service = new MaintenanceService(prisma, {} as any);
  return (service as any).cleanupEmptyMessages();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRecomputeIfTracked.mockResolvedValue(undefined);
});

describe('cleanupEmptyMessages', () => {
  it('ne touche à rien quand aucun message vide ne traîne', async () => {
    const prisma = makePrisma();

    await sweep(prisma);

    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(mockRecomputeIfTracked).not.toHaveBeenCalled();
  });

  it('épargne un message vide qui porte une pièce jointe', async () => {
    // Le critère de sélection est « contenu blanc » ; c'est ce second filtre qui
    // distingue un message fantôme d'une photo sans légende.
    const prisma = makePrisma();
    prisma.message.findRaw.mockResolvedValue([
      { _id: { $oid: MSG_1 }, conversationId: { $oid: CONV_A } },
    ]);
    prisma.messageAttachment.findMany.mockResolvedValue([{ messageId: MSG_1 }]);

    await sweep(prisma);

    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(mockRecomputeIfTracked).not.toHaveBeenCalled();
  });

  it('retire les messages fantômes et répare les compteurs, une fois par conversation', async () => {
    const prisma = makePrisma();
    prisma.message.findRaw.mockResolvedValue([
      { _id: { $oid: MSG_1 }, conversationId: { $oid: CONV_A } },
      { _id: { $oid: MSG_2 }, conversationId: CONV_A },
      { _id: { $oid: MSG_3 }, conversationId: { $oid: CONV_B } },
    ]);
    prisma.message.updateMany.mockResolvedValue({ count: 3 });

    await sweep(prisma);

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [MSG_1, MSG_2, MSG_3] } },
      data: { deletedAt: expect.any(Date) },
    });
    // Deux conversations touchées, trois messages : le recalcul est le même
    // pour les deux messages de A.
    expect(mockRecomputeIfTracked).toHaveBeenCalledTimes(2);
    expect(mockRecomputeIfTracked.mock.calls.map((c: any[]) => c[1])).toEqual([CONV_A, CONV_B]);
  });

  it('répare les compteurs même si le recalcul de lastMessageAt jette', async () => {
    // Les deux effets sont indépendants : un balayage nocturne qui perd l'un
    // ne doit pas perdre l'autre.
    const prisma = makePrisma();
    prisma.message.findRaw.mockResolvedValue([
      { _id: { $oid: MSG_1 }, conversationId: { $oid: CONV_A } },
    ]);
    prisma.message.updateMany.mockResolvedValue({ count: 1 });
    prisma.conversation.findUnique.mockRejectedValue(new Error('mongo down'));

    await sweep(prisma);

    expect(mockRecomputeIfTracked).toHaveBeenCalledWith(prisma, CONV_A);
  });

  it('ne fait pas échouer le balayage quand la réparation des compteurs jette', async () => {
    const prisma = makePrisma();
    prisma.message.findRaw.mockResolvedValue([
      { _id: { $oid: MSG_1 }, conversationId: { $oid: CONV_A } },
      { _id: { $oid: MSG_3 }, conversationId: { $oid: CONV_B } },
    ]);
    prisma.message.updateMany.mockResolvedValue({ count: 2 });
    mockRecomputeIfTracked.mockRejectedValueOnce(new Error('counters down'));

    await expect(sweep(prisma)).resolves.toBeUndefined();
    // La conversation suivante est quand même réparée.
    expect(mockRecomputeIfTracked).toHaveBeenCalledTimes(2);
  });
});
