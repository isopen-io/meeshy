/**
 * #18731 — le curseur de livraison devient le PRÉFIXE CONTIGU de la remise.
 *
 * #18701 a corrigé ce qui est SERVI : le repli curseur ne confronte plus une
 * horloge MURALE à une POSITION, et passé `EXACT_READ_TRACKING_SINCE` il n'est
 * plus consenti du tout. Ce qui est ÉCRIT n'avait pas changé — et c'est le
 * trou que ce lot ferme.
 *
 * L'asymétrie est INTERNE à `markMessagesAsReceived`, entre deux écritures du
 * MÊME appel :
 *
 * | écriture | périmètre |
 * |---|---|
 * | `freezeMessageStatus({ messageIds })` | l'ensemble EXACT des messages remis (#18614) |
 * | `_advanceCursor({ messageId })` | le plus RÉCENT de l'accusé, sans regarder ce qu'il franchit |
 *
 * Scénario mesuré, qui n'exige AUCUNE panne (celui de l'issue) : M1 (10:00) est
 * évincé par le `LTRIM` à 500 de `RedisDeliveryQueue` — donc INVISIBLE au
 * drain — M2 (10:05) part, drain à 11:00. Le curseur portait la position de M2,
 * POSTÉRIEURE à M1 : le trou était SOUS la borne, quelle que soit la borne
 * choisie. Et il survit à la bascule, puisqu'il est antérieur au dernier livré.
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

/** M1 — évincé au plafond de la file : jamais remis, jamais gelé. */
const M1 = '507f1f77bcf86cd79943901a';
const M1_AT = new Date('2026-10-01T10:00:00.000Z');
/** M2 — réellement remis par le drain. */
const M2 = '507f1f77bcf86cd79943901b';
const M2_AT = new Date('2026-10-01T10:05:00.000Z');
/** M3 — remis par un drain ultérieur, APRÈS le trou laissé par M2. */
const M3 = '507f1f77bcf86cd79943901c';
const M3_AT = new Date('2026-10-01T10:10:00.000Z');

/** La position d'où part la fenêtre de balayage, telle que Prisma l'a reçue. */
const scanLowerBound = (): unknown => {
  const call = mockPrisma.message.findMany.mock.calls.find(
    ([args]: [any]) => args?.orderBy?.createdAt === 'asc'
  );
  return call?.[0]?.where?.createdAt?.gt;
};

const scanCall = () =>
  mockPrisma.message.findMany.mock.calls.find(
    ([args]: [any]) => args?.orderBy?.createdAt === 'asc'
  )?.[0];

/**
 * La requête qui lit la PREUVE — les entrées figées du balayage.
 *
 * On l'assert sur la REQUÊTE et pas sur le rendu : un double rend ce qu'on lui
 * dit quel que soit le `where`, si bien qu'un témoin de verdict reste VERT sur
 * un balayage qui aurait cessé d'exiger la preuve. C'est la règle du dépôt sur
 * les projections, portée ici à un filtre.
 */
const provenEntriesCall = () =>
  mockPrisma.messageStatusEntry.findMany.mock.calls.find(
    ([args]: [any]) => args?.where?.deliveredAt !== undefined
  )?.[0];

/**
 * Ce que les écritures de ce test ont laissé sur le curseur — reconstruit
 * depuis les appels enregistrés, jamais depuis une attente.
 *
 * C'est ce qui permet au témoin de l'issue de descendre jusqu'au statut SERVI
 * sans jouer la lecture sur un curseur ÉCRIT À LA MAIN : un curseur fabriqué
 * attesterait la lecture, pas le lot.
 */
const persistedDeliveryCursor = (): { lastDeliveredAt: Date | null; lastDeliveredMessageId: string | null } => {
  let lastDeliveredAt: Date | null = null;
  let lastDeliveredMessageId: string | null = null;
  for (const [args] of mockPrisma.conversationReadCursor.updateMany.mock.calls) {
    if (args?.data?.lastDeliveredAt) lastDeliveredAt = args.data.lastDeliveredAt;
    if (args?.data?.lastDeliveredMessageId) lastDeliveredMessageId = args.data.lastDeliveredMessageId;
  }
  for (const [args] of mockPrisma.conversationReadCursor.create.mock.calls) {
    if (args?.data?.lastDeliveredAt) lastDeliveredAt = args.data.lastDeliveredAt;
    if (args?.data?.lastDeliveredMessageId) lastDeliveredMessageId = args.data.lastDeliveredMessageId;
  }
  return { lastDeliveredAt, lastDeliveredMessageId };
};

type Arrangement = {
  /** La fenêtre, du plus ancien au plus récent — ce que le balayage doit voir. */
  readonly window: ReadonlyArray<{ id: string; createdAt: Date }>;
  /** Les messages portant DÉJÀ un `deliveredAt` figé. */
  readonly frozen?: readonly string[];
  /** La ligne de curseur lue avant l'écriture, ou `null`. */
  readonly cursor?: {
    readonly lastDeliveredAt: Date | null;
    readonly lastDeliveredMessageCreatedAt?: Date | null;
  } | null;
};

const arrange = ({ window, frozen = [], cursor = null }: Arrangement) => {
  mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(cursor);
  mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.conversationReadCursor.create.mockResolvedValue({});

  mockPrisma.message.findUnique.mockImplementation(async ({ where }: any) => {
    const row = window.find((m) => m.id === where.id);
    return row ? { createdAt: row.createdAt } : null;
  });

  // Un seul double pour TROIS requêtes distinctes, routé par la FORME de la
  // requête — jamais par un ordre d'appel, qui dériverait au premier
  // réagencement du code de production.
  mockPrisma.message.findMany.mockImplementation(async (args: any) => {
    // (c) le décompte éphémère — reconnaissable à son `AND` sur
    //     `ephemeralDuration`. Aucun message éphémère dans ce lot.
    if (args?.where?.AND) return [];
    // (b) le GEL en mode exact — borné par la liste nommée.
    if (args?.where?.id?.in) {
      return window
        .filter((m) => args.where.id.in.includes(m.id))
        .map((m) => ({ id: m.id }));
    }
    // (a) le BALAYAGE de contiguïté — ordonné, borné, sélectif.
    if (args?.orderBy?.createdAt === 'asc') {
      const since = args?.where?.createdAt?.gt as Date | undefined;
      return window
        .filter((m) => !since || m.createdAt.getTime() > since.getTime())
        .map((m) => ({ id: m.id }));
    }
    // (d) le GEL en mode fenêtre — plage `createdAt`.
    const lte = args?.where?.createdAt?.lte as Date | undefined;
    const gt = args?.where?.createdAt?.gt as Date | undefined;
    return window
      .filter((m) => (!lte || m.createdAt.getTime() <= lte.getTime()) && (!gt || m.createdAt.getTime() > gt.getTime()))
      .map((m) => ({ id: m.id }));
  });

  mockPrisma.messageStatusEntry.findMany.mockImplementation(async (args: any) => {
    const ids: string[] = args?.where?.messageId?.in ?? [];
    // Le balayage ne demande que les entrées PORTEUSES d'un `deliveredAt`.
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
};

/** Les ids que le GEL a réellement gravés. */
const frozenByCall = (): readonly string[] => {
  const call = mockPrisma.messageStatusEntry.createMany.mock.calls[0];
  return (call?.[0]?.data ?? []).map((row: any) => row.messageId);
};

describe('Le curseur de livraison ne franchit plus un trou ANTÉRIEUR (#18731)', () => {
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

  it("n'avance pas le curseur jusqu'à M2 quand M1, plus ancien, n'a jamais été remis", async () => {
    arrange({ window: [{ id: M1, createdAt: M1_AT }, { id: M2, createdAt: M2_AT }], frozen: [] });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M2, { messageIds: [M2] });

    expect(persistedDeliveryCursor().lastDeliveredMessageId).toBeNull();
  });

  it('fige quand même M2 — le gel est l’autorité, le curseur n’en est que l’index', async () => {
    arrange({ window: [{ id: M1, createdAt: M1_AT }, { id: M2, createdAt: M2_AT }], frozen: [] });
    const service = new MessageReadStatusService(mockPrisma as any);

    const frozenCount = await service.markMessagesAsReceived(READER, CONVERSATION, M2, { messageIds: [M2] });

    expect(frozenByCall()).toEqual([M2]);
    expect(frozenCount).toBe(1);
  });

  it('fige ce qui a été livré même quand le curseur juge l’accusé PÉRIMÉ', async () => {
    // Le curseur refuse d'avancer (`count: 0` sur une ligne qui EXISTE). Avant
    // ce lot, `if (!advanced) return 0` sautait le gel : un message réellement
    // remis, rapporté par un accusé que la garde de fraîcheur écarte, n'était
    // jamais gravé — et la coche de son auteur dépendait alors du seul repli
    // curseur, celui que #18701 vient de fermer.
    arrange({
      window: [{ id: M2, createdAt: M2_AT }],
      frozen: [],
      cursor: { lastDeliveredAt: new Date('2026-10-01T12:00:00.000Z'), lastDeliveredMessageCreatedAt: M2_AT },
    });
    mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 0 });
    const service = new MessageReadStatusService(mockPrisma as any);

    const frozenCount = await service.markMessagesAsReceived(READER, CONVERSATION, M2, { messageIds: [M2] });

    expect(frozenByCall()).toEqual([M2]);
    expect(frozenCount).toBe(1);
  });

  it('avance jusqu’au bout quand la remise est CONTIGUË — le lot ne gèle pas le curseur', async () => {
    arrange({
      window: [{ id: M1, createdAt: M1_AT }, { id: M2, createdAt: M2_AT }],
      frozen: [M1, M2],
    });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M2, { messageIds: [M1, M2] });

    expect(persistedDeliveryCursor().lastDeliveredMessageId).toBe(M2);
  });

  it('ancre la fenêtre sur la POSITION du curseur, jamais sur son horloge murale', async () => {
    // La mutation que ce témoin attrape est la plus plausible du lot : ancrer
    // sur `lastDeliveredAt` (11:00) exclurait M1 (10:00) de la fenêtre et
    // ROUVRIRAIT exactement le trou qu'on ferme.
    arrange({
      window: [{ id: M1, createdAt: M1_AT }, { id: M2, createdAt: M2_AT }],
      frozen: [],
      cursor: {
        lastDeliveredAt: new Date('2026-10-01T11:00:00.000Z'),
        lastDeliveredMessageCreatedAt: new Date('2026-10-01T09:00:00.000Z'),
      },
    });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M2, { messageIds: [M2] });

    expect(scanLowerBound()).toEqual(new Date('2026-10-01T09:00:00.000Z'));
    expect(persistedDeliveryCursor().lastDeliveredMessageId).toBeNull();
  });

  it('avance jusqu’au DERNIER message CONTIGU, jamais jusqu’au plus récent rapporté', async () => {
    // Le cas qu'une mutation a découvert : avec un préfixe VIDE, `if (target)`
    // porte à lui seul tout le verdict, et `messageId: target` pouvait être
    // remplacé par `messageId` sans qu'un témoin tombe. Ici le préfixe est
    // PARTIEL — M1 prouvé, M2 non, M3 rapporté — et c'est la seule forme où la
    // CIBLE se distingue du plus récent.
    arrange({
      window: [
        { id: M1, createdAt: M1_AT },
        { id: M2, createdAt: M2_AT },
        { id: M3, createdAt: M3_AT },
      ],
      frozen: [M1, M3],
    });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M3, { messageIds: [M3] });

    expect(persistedDeliveryCursor().lastDeliveredMessageId).toBe(M1);
  });

  it('borne le balayage, en exclut les messages du lecteur, et EXIGE la preuve figée', async () => {
    arrange({ window: [{ id: M2, createdAt: M2_AT }], frozen: [M2] });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M2, { messageIds: [M2] });

    const call = scanCall();
    expect(call.take).toBe(500);
    expect(call.where.senderId).toEqual({ not: READER });
    expect(call.where.deletedAt).toBeNull();
    expect(call.where.conversationId).toBe(CONVERSATION);

    // La PREUVE est la date figée, et rien d'autre : sans ce filtre, une entrée
    // créée par la moitié LECTURE du gel (`deliveredAt: null` explicite)
    // compterait comme une livraison, et le curseur franchirait le trou par la
    // porte même qu'on vient de fermer.
    const proof = provenEntriesCall();
    expect(proof.where.deliveredAt).toEqual({ not: null });
    expect(proof.where.participantId).toBe(READER);
    expect(proof.where.messageId.in).toEqual([M2]);
  });

  it('un balayage ILLISIBLE laisse le curseur en place sans faire échouer le gel', async () => {
    // `frozen: []` — M2 n'a pas encore d'entrée, donc le gel en grave bien UNE.
    // Avec `frozen: [M2]` le gel serait write-once et rendrait 0, et le témoin
    // attesterait la fixture au lieu du fail-closed qu'il vise.
    arrange({ window: [{ id: M2, createdAt: M2_AT }], frozen: [] });
    const service = new MessageReadStatusService(mockPrisma as any);
    mockPrisma.message.findMany.mockImplementation(async (args: any) => {
      if (args?.orderBy?.createdAt === 'asc') throw new Error('scan down');
      if (args?.where?.AND) return [];
      return [{ id: M2 }];
    });

    const frozenCount = await service.markMessagesAsReceived(READER, CONVERSATION, M2, { messageIds: [M2] });

    expect(frozenCount).toBe(1);
    expect(persistedDeliveryCursor().lastDeliveredMessageId).toBeNull();
  });

  it('les appelants EN LIGNE gardent la fenêtre : aucun balayage, curseur jusqu’au message rapporté', async () => {
    arrange({ window: [{ id: M1, createdAt: M1_AT }, { id: M2, createdAt: M2_AT }], frozen: [] });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M2);

    expect(scanCall()).toBeUndefined();
    expect(persistedDeliveryCursor().lastDeliveredMessageId).toBe(M2);
  });

  it('LE TÉMOIN DE L’ISSUE : le statut SERVI de M1 reste négatif, bascule NON armée', async () => {
    // Ce que l'issue exige, et qu'aucun témoin de #18701 ne couvre : #18701
    // s'en remet à la bascule, donc ses témoins l'arment. Ici elle est ABSENTE
    // — l'état de la production — et le verdict doit tenir quand même, parce
    // qu'il vient désormais de ce que le curseur n'ÉCRIT pas.
    arrange({ window: [{ id: M1, createdAt: M1_AT }, { id: M2, createdAt: M2_AT }], frozen: [] });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M2, { messageIds: [M2] });
    const cursor = persistedDeliveryCursor();

    // Phase 2 — la LECTURE, jouée sur le curseur que la phase 1 a réellement
    // laissé, jamais sur un curseur fabriqué.
    jest.clearAllMocks();
    mockPrisma.message.findFirst.mockResolvedValue({ id: M1, createdAt: M1_AT, senderId: SENDER });
    mockPrisma.participant.findMany.mockResolvedValue([
      { id: READER, userId: null, displayName: 'R', avatar: null, user: null },
    ]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
      { participantId: READER, lastDeliveredAt: cursor.lastDeliveredAt, lastReadAt: null },
    ]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.messageAttachment.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([{ id: M1, createdAt: M1_AT, senderId: SENDER }]);

    const summary = await service.getLatestMessageSummary(CONVERSATION);

    expect(summary.deliveredCount).toBe(0);
    expect(summary.totalMembers).toBe(1);
  });
});
