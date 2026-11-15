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

/**
 * #13027 — le balayage jugeait un message « vide » sur son seul `content`.
 * Or `MessageProcessor` enregistre `content: ''` pour tout message chiffré par
 * le serveur (`server`, `hybrid`) : son texte vit dans `encryptedContent`. Un
 * tel message disparaissait en silence au bout d'un jour.
 *
 * Ces témoins font tourner le VRAI filtre que le balayage remet à Mongo sur une
 * petite base en mémoire, au lieu de simuler sa réponse : c'est le filtre qui
 * était faux, un `findRaw` simulé ne pouvait pas le voir.
 */
type StoredMessage = {
  readonly _id: { $oid: string };
  readonly conversationId: { $oid: string };
  readonly content: string;
  readonly createdAt: Date;
  readonly isEncrypted?: boolean;
  readonly encryptionMode?: string | null;
  readonly encryptedContent?: string | null;
  deletedAt: Date | null;
};

const asComparable = (value: unknown): unknown => {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && '$date' in value) {
    return new Date((value as { $date: string }).$date).getTime();
  }
  return value;
};

function fieldMatches(actual: unknown, condition: unknown): boolean {
  if (condition === null) return actual === null || actual === undefined;
  if (condition && typeof condition === 'object' && !('$date' in condition)) {
    return Object.entries(condition).every(([operator, operand]) => {
      if (operator === '$regex') return typeof actual === 'string' && new RegExp(operand as string).test(actual);
      if (operator === '$lt') return (asComparable(actual) as number) < (asComparable(operand) as number);
      if (operator === '$ne') return !fieldMatches(actual, operand);
      throw new Error(`opérateur non simulé : ${operator}`);
    });
  }
  return asComparable(actual) === asComparable(condition);
}

function documentMatches(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return (condition as Record<string, unknown>[]).some((f) => documentMatches(doc, f));
    if (key === '$and') return (condition as Record<string, unknown>[]).every((f) => documentMatches(doc, f));
    return fieldMatches(doc[key], condition);
  });
}

function prismaOver(store: StoredMessage[]) {
  const prisma = makePrisma();
  prisma.message.findRaw.mockImplementation(async ({ filter }: { filter: Record<string, unknown> }) =>
    store
      .filter((doc) => documentMatches(doc as unknown as Record<string, unknown>, filter))
      .map((doc) => ({ _id: doc._id, conversationId: doc.conversationId })));
  prisma.message.updateMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => {
    const hit = store.filter((doc) => where.id.in.includes(doc._id.$oid));
    hit.forEach((doc) => { doc.deletedAt = new Date(); });
    return { count: hit.length };
  });
  return prisma;
}

const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 3_600_000);

function storedMessage(id: string, fields: Partial<StoredMessage> = {}): StoredMessage {
  return {
    _id: { $oid: id },
    conversationId: { $oid: CONV_A },
    content: '',
    createdAt: hoursAgo(25),
    isEncrypted: false,
    encryptionMode: null,
    encryptedContent: null,
    deletedAt: null,
    ...fields,
  };
}

const sealedBy = (encryptionMode: 'server' | 'hybrid' | 'e2ee') => ({
  isEncrypted: true,
  encryptionMode,
  encryptedContent: 'c2NlbGzDqQ==',
});

describe('cleanupEmptyMessages — un message chiffré n’est jamais vide (#13027)', () => {
  it.each(['server', 'hybrid', 'e2ee'] as const)(
    'garde un message chiffré %s au content vide, vieux de 25 h',
    async (mode) => {
      const sealed = storedMessage(MSG_1, sealedBy(mode));
      const store = [sealed];

      await sweep(prismaOver(store));

      expect(sealed.deletedAt).toBeNull();
    }
  );

  it('garde un message dont seul encryptedContent dit qu’il est chiffré', async () => {
    const sealed = storedMessage(MSG_1, { encryptedContent: 'c2NlbGzDqQ==' });

    await sweep(prismaOver([sealed]));

    expect(sealed.deletedAt).toBeNull();
  });

  it('garde un message marqué isEncrypted même sans encryptedContent', async () => {
    const sealed = storedMessage(MSG_1, { isEncrypted: true, encryptionMode: 'server' });

    await sweep(prismaOver([sealed]));

    expect(sealed.deletedAt).toBeNull();
  });

  it('retire toujours le fantôme en clair voisin, et lui seul', async () => {
    const ghost = storedMessage(MSG_2, { content: '   ' });
    const sealed = storedMessage(MSG_1, sealedBy('server'));
    const young = storedMessage(MSG_3, { createdAt: hoursAgo(2) });

    await sweep(prismaOver([sealed, ghost, young]));

    expect(ghost.deletedAt).toBeInstanceOf(Date);
    expect(sealed.deletedAt).toBeNull();
    expect(young.deletedAt).toBeNull();
  });
});
