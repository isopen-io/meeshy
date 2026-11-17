/**
 * #19261 — la fenêtre du GEL s'ancre sur la POSITION du curseur, jamais sur son
 * horloge murale.
 *
 * Troisième et dernière occurrence de la confusion horloge/position dans cette
 * chaîne. #18701 l'a retirée de ce que la livraison SERT ; #18731 de ce que le
 * CURSEUR écrit ; il reste la borne BASSE de la fenêtre du gel :
 *
 * ```ts
 * freezeMessageStatus({ since: prevDeliveredAt, … })   // lastDeliveredAt = `now`
 * //                           ^^^^^^^^^^^^^^^^ une HORLOGE, comparée à `createdAt`
 * ```
 *
 * ─── POURQUOI CE DÉFAUT N'EST PAS ATTEIGNABLE DEPUIS N'IMPORTE QUEL ÉTAT ────
 *
 * En mode FENÊTRE pur l'invariant TIENT : la borne haute d'un ack est `at`, qui
 * devient la borne basse du suivant. Aucun trou.
 *
 * Il se rompt là où un ack avance l'horloge SANS avoir figé toute la fenêtre
 * qu'elle recouvre — c'est-à-dire sur le seul chemin de périmètre EXACT, celui
 * du rejeu hors ligne. Après un préfixe PARTIEL (#18731 : cible M1, trou M2),
 * le curseur porte `{ position: 10:00, lastDeliveredAt: 11:00 }`. Le gel
 * FENÊTRE suivant part alors de 11:00 et **saute M2** (10:05), que plus rien ne
 * gravera.
 *
 * **Un témoin posé sur un curseur dont la position et l'horloge CONCORDENT ne
 * peut donc pas tomber** — les deux ancrages y rendent le même verdict. C'est
 * la leçon du cycle 174 appliquée avant d'écrire plutôt qu'après : la
 * divergence est la précondition du défaut, et chaque témoin ci-dessous la
 * construit explicitement.
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
  messageStatusEntry: { findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
  attachmentStatusEntry: { findMany: jest.fn() },
  messageAttachment: { findMany: jest.fn() },
  message: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  participant: { findMany: jest.fn(), findUnique: jest.fn() },
  userPreference: { findMany: jest.fn() },
  userPreferences: { findMany: jest.fn() },
  notification: { updateMany: jest.fn() },
};

jest.mock('@meeshy/shared/prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }));
jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    markConversationNotificationsAsRead: jest.fn().mockResolvedValue(0),
  })),
}));

const READER = '507f1f77bcf86cd799439011';
const CONVERSATION = '507f1f77bcf86cd799439012';

/** La POSITION du curseur : le dernier message dont la remise est prouvée. */
const POSITION = new Date('2026-10-01T10:00:00.000Z');
/** Le TROU, postérieur à la position et ANTÉRIEUR à l'horloge. */
const M2 = '507f1f77bcf86cd79943901b';
const M2_AT = new Date('2026-10-01T10:05:00.000Z');
/** L'HORLOGE du curseur : l'heure à laquelle le drain a été TRAITÉ. */
const HORLOGE = new Date('2026-10-01T11:00:00.000Z');

/** La borne basse que la PLAGE du gel a reçue — le cœur de ce lot. */
const bornesDuGel = (): Array<Date | undefined> =>
  mockPrisma.message.findMany.mock.calls
    .filter(([args]: [any]) => args?.where?.createdAt?.lte !== undefined)
    .map(([args]: [any]) => args.where.createdAt?.gt);

/**
 * Un curseur dont la POSITION et l'HORLOGE DIVERGENT — la précondition du
 * défaut, et la seule forme où les deux ancrages se distinguent.
 */
const arrangeCurseurDivergent = () => {
  mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
    lastDeliveredAt: HORLOGE,
    lastDeliveredMessageCreatedAt: POSITION,
    lastReadAt: null,
    lastReadMessageCreatedAt: null,
  });
  mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.conversationReadCursor.create.mockResolvedValue({});

  mockPrisma.message.findFirst.mockResolvedValue({ id: M2, createdAt: M2_AT });
  mockPrisma.message.findUnique.mockResolvedValue({ createdAt: M2_AT });

  mockPrisma.message.findMany.mockImplementation(async (args: any) => {
    // Le décompte éphémère.
    if (args?.where?.AND) return [];
    // Le balayage de contiguïté de #18731 (ordonné) — hors sujet ici.
    if (args?.orderBy?.createdAt === 'asc') return [];
    // La PLAGE du gel : elle ne rend M2 que si sa borne basse le laisse entrer.
    const gt = args?.where?.createdAt?.gt as Date | undefined;
    const lte = args?.where?.createdAt?.lte as Date | undefined;
    const dedans =
      (!gt || M2_AT.getTime() > gt.getTime()) && (!lte || M2_AT.getTime() <= lte.getTime());
    return dedans ? [{ id: M2 }] : [];
  });

  mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
  mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.message.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.participant.findMany.mockResolvedValue([]);
  mockPrisma.participant.findUnique.mockResolvedValue({ id: READER, userId: null });
  mockPrisma.userPreference.findMany.mockResolvedValue([]);
  mockPrisma.userPreferences.findMany.mockResolvedValue([]);
  mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
};

/** Les ids que le gel a réellement gravés. */
const graves = (): readonly string[] =>
  (mockPrisma.messageStatusEntry.createMany.mock.calls[0]?.[0]?.data ?? []).map(
    (r: any) => r.messageId
  );

describe('la fenêtre du gel s’ancre sur la POSITION, jamais sur l’horloge (#19261)', () => {
  const precedent = process.env.EXACT_READ_TRACKING_SINCE;

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
    if (precedent === undefined) delete process.env.EXACT_READ_TRACKING_SINCE;
    else process.env.EXACT_READ_TRACKING_SINCE = precedent;
  });

  it('mode FENÊTRE : la plage part de la position (10:00), pas de l’horloge (11:00)', async () => {
    arrangeCurseurDivergent();
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M2);

    expect(bornesDuGel()).toEqual([POSITION]);
  });

  it('mode FENÊTRE : M2, laissé dans le trou par un préfixe partiel, est enfin gravé', async () => {
    arrangeCurseurDivergent();
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M2);

    expect(graves()).toEqual([M2]);
  });

  it('cascade « lu ⇒ remis » : la plage part aussi de la position', async () => {
    arrangeCurseurDivergent();
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsRead(READER, CONVERSATION, M2);

    // Les deux gels de cette méthode (`readAt` puis `deliveredAt`) passent par
    // la plage ; celui de la LIVRAISON doit partir de la position.
    expect(bornesDuGel()).toContainEqual(POSITION);
    expect(bornesDuGel()).not.toContainEqual(HORLOGE);
  });

  it('un curseur SANS position connue retombe sur l’horloge — comportement hérité intact', async () => {
    arrangeCurseurDivergent();
    // Une ligne écrite avant l'introduction de la colonne de position.
    mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
      lastDeliveredAt: HORLOGE,
      lastDeliveredMessageCreatedAt: null,
      lastReadAt: null,
      lastReadMessageCreatedAt: null,
    });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M2);

    // Le repli ne re-litige PAS un passé dont le repli curseur rend déjà compte.
    expect(bornesDuGel()).toEqual([HORLOGE]);
  });

  it('cascade, curseur SANS position : elle retombe aussi sur l’horloge', async () => {
    // Le repli de la CASCADE a sa propre portée, donc son propre témoin : une
    // mutation qui le retirait laissait la suite VERTE, le témoin du repli
    // ci-dessus n'exerçant que `markMessagesAsReceived`. Une mutation verte
    // accuse le témoin avant d'absoudre le code (leçon du cycle 174).
    arrangeCurseurDivergent();
    mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
      lastDeliveredAt: HORLOGE,
      lastDeliveredMessageCreatedAt: null,
      lastReadAt: null,
      lastReadMessageCreatedAt: null,
    });
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsRead(READER, CONVERSATION, M2);

    expect(bornesDuGel()).toContainEqual(HORLOGE);
  });

  it('un curseur ABSENT ne borne rien — la fenêtre monte jusqu’à `at`', async () => {
    arrangeCurseurDivergent();
    mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
    const service = new MessageReadStatusService(mockPrisma as any);

    await service.markMessagesAsReceived(READER, CONVERSATION, M2);

    expect(bornesDuGel()).toEqual([undefined]);
  });
});
