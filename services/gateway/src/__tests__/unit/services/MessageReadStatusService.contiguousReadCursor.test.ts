/**
 * #19299 — le BALAYAGE de contiguïté de LECTURE cesse de partir AU-DESSUS du
 * trou, et la fenêtre du gel `readAt` cesse de s'ancrer sur l'horloge murale.
 *
 * Jumelle exacte de `MessageReadStatusService.contiguousDeliveryCursor.test.ts`
 * (#18731) et de `…freezeWindowAnchor.test.ts` (#19261) : la chaîne de LECTURE
 * porte la même structure et les mêmes deux colonnes, et n'avait reçu aucun des
 * deux correctifs.
 *
 * ─── POURQUOI UN PRÉFIXE PARTIEL, ET PAS UN TROU EN TÊTE ────────────────────
 *
 * Un trou en TÊTE de fenêtre rend `null` sous l'ancre JUSTE (prefix vide) et
 * la cible la plus récente sous l'ancre FAUSSE. Le témoin tomberait — mais il
 * ne distinguerait pas « le balayage a vu le trou » de « le balayage n'a rien
 * vu du tout », les deux rendant un curseur immobile sur d'autres chemins.
 *
 * Le scénario ci-dessous est donc un préfixe PARTIEL : la cible juste est M2,
 * STRICTEMENT entre `null` et M4. Un témoin de borne qui s'écrit sur un préfixe
 * vide ou complet ne peut pas tomber (leçon 261 portée à une borne, mesurée au
 * cycle 174).
 *
 * ─── LE SCÉNARIO ────────────────────────────────────────────────────────────
 *
 * Curseur de lecture : POSITION M1 (10:00), HORLOGE 11:00 — l'état NORMAL du
 * mode exact, où `_advanceCursor` pose `lastReadAt = now` même quand le curseur
 * n'a franchi qu'un préfixe.
 *
 * | message | créé | lu ? |
 * |---|---|---|
 * | M2 | 10:05 | OUI |
 * | M3 | 10:10 | **non** — le trou |
 * | M4 | 11:30 | OUI, et c'est lui que le lecteur rapporte |
 *
 * - ancré sur l'HORLOGE (11:00) : la fenêtre ne contient que M4, lu ⇒ le
 *   curseur SAUTE à M4, franchissant M3 dont l'état n'a jamais été interrogé ;
 * - ancré sur la POSITION (10:00) : la fenêtre contient M2, M3, M4 ⇒ le préfixe
 *   contigu s'arrête à M2, et le curseur ne franchit pas le trou.
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
  notification: { updateMany: jest.fn() },
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const READER = '507f1f77bcf86cd799439011';
const CONVERSATION = '507f1f77bcf86cd799439012';

/** La position que le curseur de lecture porte déjà. */
const M1_AT = new Date('2026-10-01T10:00:00.000Z');
/** L'horloge murale du dernier accusé TRAITÉ — une heure et demie plus tard. */
const READ_CLOCK = new Date('2026-10-01T11:00:00.000Z');

const M2 = '507f1f77bcf86cd79943901b';
const M2_AT = new Date('2026-10-01T10:05:00.000Z');
/** Le TROU : jamais lu, et ANTÉRIEUR à l'horloge du curseur. */
const M3 = '507f1f77bcf86cd79943901c';
const M3_AT = new Date('2026-10-01T10:10:00.000Z');
const M4 = '507f1f77bcf86cd79943901d';
const M4_AT = new Date('2026-10-01T11:30:00.000Z');

const WINDOW = [
  { id: M2, createdAt: M2_AT },
  { id: M3, createdAt: M3_AT },
  { id: M4, createdAt: M4_AT },
];

/** La borne basse que le BALAYAGE a réellement reçue, telle que Prisma l'a vue. */
const scanLowerBound = (): unknown =>
  mockPrisma.message.findMany.mock.calls.find(
    ([args]: [any]) => args?.orderBy?.createdAt === 'asc'
  )?.[0]?.where?.createdAt?.gt;

/** La borne basse que le GEL `readAt` en mode FENÊTRE a reçue. */
const freezeWindowLowerBound = (): unknown =>
  mockPrisma.message.findMany.mock.calls.find(
    ([args]: [any]) =>
      args?.where?.createdAt?.lte !== undefined && args?.where?.id === undefined
  )?.[0]?.where?.createdAt?.gt;

/**
 * Ce que les écritures ont laissé sur le curseur de LECTURE — reconstruit
 * depuis les appels enregistrés, jamais depuis une attente. La cascade
 * « lu ⇒ remis » écrit sur la MÊME table dans le même appel : le filtre porte
 * donc sur la colonne, pas sur l'ordre des appels.
 */
const persistedReadCursor = (): { lastReadMessageId: string | null } => {
  let lastReadMessageId: string | null = null;
  for (const [args] of mockPrisma.conversationReadCursor.updateMany.mock.calls) {
    if (args?.data?.lastReadMessageId) lastReadMessageId = args.data.lastReadMessageId;
  }
  for (const [args] of mockPrisma.conversationReadCursor.create.mock.calls) {
    if (args?.data?.lastReadMessageId) lastReadMessageId = args.data.lastReadMessageId;
  }
  return { lastReadMessageId };
};

type Arrangement = {
  readonly window: ReadonlyArray<{ id: string; createdAt: Date }>;
  /** Les messages portant DÉJÀ un `readAt` figé. */
  readonly read?: readonly string[];
  readonly cursor?: {
    readonly lastReadAt: Date | null;
    readonly lastReadMessageCreatedAt?: Date | null;
  } | null;
};

const arrange = ({ window, read = [], cursor = null }: Arrangement) => {
  mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(cursor);
  mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.conversationReadCursor.create.mockResolvedValue({});
  mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
  mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

  mockPrisma.message.findFirst.mockImplementation(async () => {
    const newest = [...window].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return newest ? { id: newest.id, createdAt: newest.createdAt } : null;
  });
  mockPrisma.message.findUnique.mockImplementation(async ({ where }: any) => {
    const row = window.find((m) => m.id === where.id);
    return row ? { createdAt: row.createdAt, conversationId: CONVERSATION } : null;
  });

  // Un seul double pour quatre requêtes distinctes, routé par la FORME de la
  // requête — jamais par un ordre d'appel, qui dériverait au premier
  // réagencement du code de production.
  mockPrisma.message.findMany.mockImplementation(async (args: any) => {
    if (args?.where?.AND) return [];                       // décompte éphémère
    if (args?.where?.id?.in) {                              // gel en mode EXACT
      return window
        .filter((m) => args.where.id.in.includes(m.id))
        .map((m) => ({ id: m.id }));
    }
    if (args?.orderBy?.createdAt === 'asc') {               // BALAYAGE
      const since = args?.where?.createdAt?.gt as Date | undefined;
      return window
        .filter((m) => !since || m.createdAt.getTime() > since.getTime())
        .map((m) => ({ id: m.id }));
    }
    const lte = args?.where?.createdAt?.lte as Date | undefined;
    const gt = args?.where?.createdAt?.gt as Date | undefined;
    return window
      .filter(
        (m) =>
          (!lte || m.createdAt.getTime() <= lte.getTime()) &&
          (!gt || m.createdAt.getTime() > gt.getTime())
      )
      .map((m) => ({ id: m.id }));
  });

  mockPrisma.messageStatusEntry.findMany.mockImplementation(async (args: any) => {
    const ids: string[] = args?.where?.messageId?.in ?? [];
    // Le balayage de LECTURE ne demande que les entrées PORTEUSES d'un `readAt`.
    if (args?.where?.readAt) {
      return ids.filter((id) => read.includes(id)).map((messageId) => ({ messageId }));
    }
    return ids
      .filter((id) => read.includes(id))
      .map((messageId) => ({ messageId, readAt: M1_AT, deliveredAt: M1_AT, viewedLanguages: [] }));
  });
  mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.message.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.participant.findMany.mockResolvedValue([]);
  mockPrisma.participant.findUnique.mockResolvedValue(null);
  mockPrisma.userPreference.findMany.mockResolvedValue([]);
  mockPrisma.userPreferences.findMany.mockResolvedValue([]);
};

describe('Le curseur de LECTURE ne franchit plus un trou ANTÉRIEUR (#19299)', () => {
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

  it("s'arrête à M2 — le préfixe PARTIEL, strictement entre `null` et M4", async () => {
    arrange({
      window: WINDOW,
      read: [M2, M4],
      cursor: { lastReadAt: READ_CLOCK, lastReadMessageCreatedAt: M1_AT },
    });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsRead(READER, CONVERSATION, M4, { messageIds: [M4] });

    expect(persistedReadCursor().lastReadMessageId).toBe(M2);
  });

  it('ancre le BALAYAGE sur la POSITION du curseur, jamais sur son horloge', async () => {
    arrange({
      window: WINDOW,
      read: [M2, M4],
      cursor: { lastReadAt: READ_CLOCK, lastReadMessageCreatedAt: M1_AT },
    });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsRead(READER, CONVERSATION, M4, { messageIds: [M4] });

    expect(scanLowerBound()).toEqual(M1_AT);
  });

  it('ancre la FENÊTRE DU GEL `readAt` sur la POSITION, jamais sur son horloge', async () => {
    // Mode HÉRITÉ (aucun `messageIds`) : c'est le seul où `since` gouverne la
    // plage du gel, la liste nommée étant sinon la borne.
    arrange({
      window: WINDOW,
      read: [M2],
      cursor: { lastReadAt: READ_CLOCK, lastReadMessageCreatedAt: M1_AT },
    });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsRead(READER, CONVERSATION, M4);

    expect(freezeWindowLowerBound()).toEqual(M1_AT);
  });

  it("retombe sur l'HORLOGE quand la POSITION manque — non-régression", async () => {
    arrange({
      window: WINDOW,
      read: [M4],
      cursor: { lastReadAt: READ_CLOCK, lastReadMessageCreatedAt: null },
    });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsRead(READER, CONVERSATION, M4, { messageIds: [M4] });

    expect(scanLowerBound()).toEqual(READ_CLOCK);
  });

  it('demande la POSITION de lecture à la BASE — la moitié qu’aucun verdict ne voit', async () => {
    arrange({
      window: WINDOW,
      read: [M2, M4],
      cursor: { lastReadAt: READ_CLOCK, lastReadMessageCreatedAt: M1_AT },
    });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsRead(READER, CONVERSATION, M4, { messageIds: [M4] });

    const selects = mockPrisma.conversationReadCursor.findUnique.mock.calls
      .map(([args]: [any]) => args?.select)
      .filter((select: any) => select != null);
    expect(selects).toContainEqual(
      expect.objectContaining({ lastReadMessageCreatedAt: true })
    );
  });
});
