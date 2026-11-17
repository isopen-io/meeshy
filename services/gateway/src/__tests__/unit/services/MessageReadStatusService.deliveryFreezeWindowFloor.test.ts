/**
 * #19261 — la fenêtre du GEL de livraison s'ancre sur la POSITION du curseur,
 * et non sur son horloge murale.
 *
 * Troisième et dernière horloge murale de la chaîne de livraison. #18701 l'a
 * retirée de ce qui est SERVI ; #18731 de ce que le CURSEUR écrit ; elle
 * restait à la borne BASSE de la fenêtre du gel, que `freezeMessageStatus`
 * confronte à `Message.createdAt` :
 *
 * ```ts
 * freezeMessageStatus({ since: prevDeliveredAt, …, field: 'deliveredAt' })
 * //                           ^^^^^^^^^^^^^^^^ posé à `now` par `_advanceCursor`
 * ```
 *
 * Le scénario, celui de l'issue, et il n'exige AUCUNE panne : fenêtre
 * M1 (10:00) · M2 (10:05) · M3 (10:10) ; drain à 11:00 qui remet M1 et M3,
 * M2 ayant été évincé au plafond de `RedisDeliveryQueue`. La cible contiguë
 * de #18731 est M1 ⇒ curseur `{ position: 10:00, lastDeliveredAt: 11:00 }`.
 * Le lecteur revient à 12:00 : le gel FENÊTRE partait de **11:00** et sautait
 * M2 (10:05), qui n'était donc JAMAIS gravé remis — l'état exact que la coche
 * ✓✓ de l'expéditeur affiche, et que le repli curseur ne rattrape plus passé
 * `EXACT_READ_TRACKING_SINCE`.
 *
 * Ce que ces témoins exercent, et qu'aucun témoin de #18731 ne pouvait voir :
 * ce lot-là s'arrêtait à ce que le CURSEUR écrit ; celui-ci descend jusqu'à la
 * borne que le GEL reçoit, sur les TROIS sites qui la posent.
 *
 * @jest-environment node
 */

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

const mockPrisma: any = {
  conversationReadCursor: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  messageStatusEntry: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn(),
  },
  attachmentStatusEntry: { findMany: jest.fn() },
  messageAttachment: { findMany: jest.fn() },
  message: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  participant: { findMany: jest.fn(), findUnique: jest.fn() },
  userPreference: { findMany: jest.fn() },
  userPreferences: { findMany: jest.fn() },
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const READER = '507f1f77bcf86cd799439011';
const SENDER = '507f1f77bcf86cd799439019';
const CONVERSATION = '507f1f77bcf86cd799439012';

/** M1 — remis par le drain, et la cible contiguë que #18731 écrit. */
const M1 = '507f1f77bcf86cd79943901a';
const M1_AT = new Date('2026-10-01T10:00:00.000Z');
/** M2 — évincé au plafond de la file : le TROU, sous l'horloge et sur la position. */
const M2 = '507f1f77bcf86cd79943901b';
const M2_AT = new Date('2026-10-01T10:05:00.000Z');
/** M3 — remis par le même drain, APRÈS le trou. */
const M3 = '507f1f77bcf86cd79943901c';
const M3_AT = new Date('2026-10-01T10:10:00.000Z');

/** L'horloge MURALE que le drain de 11:00 a laissée sur le curseur. */
const DRAIN_CLOCK = new Date('2026-10-01T11:00:00.000Z');

const WINDOW = [
  { id: M1, createdAt: M1_AT },
  { id: M2, createdAt: M2_AT },
  { id: M3, createdAt: M3_AT },
];

/**
 * La borne BASSE que le GEL en mode FENÊTRE a reçue, telle que Prisma l'a vue.
 *
 * Assert sur la REQUÊTE, pas sur le rendu : un double rend ce qu'on lui dit
 * quel que soit son `where`, si bien qu'un témoin de verdict resterait VERT
 * sur un gel qui aurait cessé de descendre jusqu'à la position. C'est la règle
 * du dépôt sur les projections — « un témoin de `select` n'atteste pas la
 * réponse » — portée à un filtre.
 */
const freezeWindowCall = () =>
  mockPrisma.message.findMany.mock.calls.find(
    ([args]: [any]) =>
      args?.where?.createdAt?.lte !== undefined && args?.where?.senderId?.not === READER
  )?.[0];

/** Les ids que le GEL a réellement gravés. */
const frozenByCall = (): readonly string[] =>
  mockPrisma.messageStatusEntry.createMany.mock.calls.flatMap(
    ([args]: [any]) => (args?.data ?? []).map((row: any) => row.messageId)
  );

type Arrangement = {
  readonly frozen?: readonly string[];
  readonly cursor?: {
    readonly lastReadAt?: Date | null;
    readonly lastDeliveredAt: Date | null;
    readonly lastDeliveredMessageCreatedAt?: Date | null;
  } | null;
};

const arrange = ({ frozen = [], cursor = null }: Arrangement) => {
  mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(cursor);
  mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.conversationReadCursor.create.mockResolvedValue({});

  mockPrisma.message.findFirst.mockResolvedValue({ id: M3, createdAt: M3_AT });
  mockPrisma.message.findUnique.mockImplementation(async ({ where }: any) => {
    const row = WINDOW.find((m) => m.id === where.id);
    return row ? { createdAt: row.createdAt, conversationId: CONVERSATION } : null;
  });

  // Un seul double pour quatre requêtes, routé par la FORME de la requête —
  // jamais par un ordre d'appel, qui dériverait au premier réagencement.
  mockPrisma.message.findMany.mockImplementation(async (args: any) => {
    if (args?.where?.AND) return [];
    if (args?.where?.id?.in) {
      return WINDOW.filter((m) => args.where.id.in.includes(m.id)).map((m) => ({ id: m.id }));
    }
    if (args?.orderBy?.createdAt === 'asc') {
      const since = args?.where?.createdAt?.gt as Date | undefined;
      return WINDOW.filter((m) => !since || m.createdAt.getTime() > since.getTime()).map((m) => ({
        id: m.id,
      }));
    }
    const lte = args?.where?.createdAt?.lte as Date | undefined;
    const gt = args?.where?.createdAt?.gt as Date | undefined;
    return WINDOW.filter(
      (m) =>
        (!lte || m.createdAt.getTime() <= lte.getTime()) &&
        (!gt || m.createdAt.getTime() > gt.getTime())
    ).map((m) => ({ id: m.id }));
  });

  mockPrisma.messageStatusEntry.findMany.mockImplementation(async (args: any) => {
    const ids: string[] = args?.where?.messageId?.in ?? [];
    if (args?.where?.deliveredAt) {
      return ids.filter((id) => frozen.includes(id)).map((messageId) => ({ messageId }));
    }
    return ids
      .filter((id) => frozen.includes(id))
      .map((messageId) => ({ messageId, deliveredAt: M1_AT, readAt: null, viewedLanguages: [] }));
  });
  mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.message.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.participant.findMany.mockResolvedValue([]);
  mockPrisma.participant.findUnique.mockResolvedValue(null);
};

describe('La fenêtre du gel de livraison part de la POSITION du curseur (#19261)', () => {
  const previousCutover = process.env.EXACT_READ_TRACKING_SINCE;

  beforeEach(() => {
    jest.clearAllMocks();
    (MessageReadStatusService as any).recentActionCache.clear();
    clearPrivacyPreferencesCache();
    delete process.env.EXACT_READ_TRACKING_SINCE;
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterAll(() => {
    if (previousCutover === undefined) delete process.env.EXACT_READ_TRACKING_SINCE;
    else process.env.EXACT_READ_TRACKING_SINCE = previousCutover;
  });

  describe('markMessagesAsReceived, mode FENÊTRE — le lecteur EN LIGNE', () => {
    it('grave M2, le trou laissé SOUS l’horloge du drain par un préfixe PARTIEL', async () => {
      // Le cas EXACT de l'issue : la position (10:00) et l'horloge (11:00)
      // divergent, et M2 (10:05) vit entre les deux. C'est la seule forme où
      // les deux bornes rendent des verdicts DIFFÉRENTS — au préfixe VIDE
      // comme au préfixe COMPLET, elles coïncident, et un témoin posé là ne
      // pourrait pas tomber (leçon 261, portée à une borne).
      arrange({
        frozen: [M1, M3],
        cursor: { lastDeliveredAt: DRAIN_CLOCK, lastDeliveredMessageCreatedAt: M1_AT },
      });
      const service = new MessageReadStatusService(mockPrisma as any);

      await service.markMessagesAsReceived(READER, CONVERSATION, M3);

      expect(frozenByCall()).toContain(M2);
    });

    it('passe la POSITION, et non l’horloge, en borne basse du gel', async () => {
      arrange({
        frozen: [M1, M3],
        cursor: { lastDeliveredAt: DRAIN_CLOCK, lastDeliveredMessageCreatedAt: M1_AT },
      });
      const service = new MessageReadStatusService(mockPrisma as any);

      await service.markMessagesAsReceived(READER, CONVERSATION, M3);

      expect(freezeWindowCall()?.where?.createdAt?.gt).toEqual(M1_AT);
    });

    it('retombe sur l’horloge quand la colonne de position manque (lignes anciennes)', async () => {
      // Repli, pas élargissement : la fenêtre démarre alors trop TARD, et on ne
      // re-litige pas un passé dont le repli curseur rend déjà compte.
      arrange({ frozen: [M1, M3], cursor: { lastDeliveredAt: DRAIN_CLOCK } });
      const service = new MessageReadStatusService(mockPrisma as any);

      await service.markMessagesAsReceived(READER, CONVERSATION, M3);

      expect(freezeWindowCall()?.where?.createdAt?.gt).toEqual(DRAIN_CLOCK);
    });

    it('balaie depuis l’origine quand il n’y a aucun curseur', async () => {
      arrange({ frozen: [], cursor: null });
      const service = new MessageReadStatusService(mockPrisma as any);

      await service.markMessagesAsReceived(READER, CONVERSATION, M3);

      expect(freezeWindowCall()?.where?.createdAt?.gt).toBeUndefined();
      expect(frozenByCall()).toEqual([M1, M2, M3]);
    });
  });

  describe('markMessagesAsRead, cascade « lu ⇒ remis »', () => {
    it('charge la colonne de POSITION de livraison — sans elle aucune descente n’est possible', async () => {
      // La projection AVANT l'appel. C'est le seul des trois sites dont le
      // `select` ne demandait pas `lastDeliveredMessageCreatedAt` du tout :
      // un correctif qui se contente de changer la variable passée y est un
      // no-op MUET, et aucun témoin de verdict ne le dirait (leçon 276).
      arrange({
        frozen: [M1, M3],
        cursor: {
          lastReadAt: null,
          lastDeliveredAt: DRAIN_CLOCK,
          lastDeliveredMessageCreatedAt: M1_AT,
        },
      });
      const service = new MessageReadStatusService(mockPrisma as any);

      await service.markMessagesAsRead(READER, CONVERSATION, M3);

      const select = mockPrisma.conversationReadCursor.findUnique.mock.calls[0]?.[0]?.select;
      expect(select?.lastDeliveredMessageCreatedAt).toBe(true);
    });

    it('ancre la cascade de livraison sur la POSITION, jamais sur l’horloge', async () => {
      arrange({
        frozen: [M1, M3],
        cursor: {
          lastReadAt: null,
          lastDeliveredAt: DRAIN_CLOCK,
          lastDeliveredMessageCreatedAt: M1_AT,
        },
      });
      const service = new MessageReadStatusService(mockPrisma as any);

      await service.markMessagesAsRead(READER, CONVERSATION, M3);

      const deliveryFreeze = mockPrisma.message.findMany.mock.calls
        .map(([args]: [any]) => args)
        .filter((args: any) => args?.where?.createdAt?.lte !== undefined);
      expect(deliveryFreeze.some((args: any) => args?.where?.createdAt?.gt === M1_AT)).toBe(true);
    });
  });
});
