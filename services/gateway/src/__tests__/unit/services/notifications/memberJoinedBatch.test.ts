/**
 * Une arrivée est UN événement, pas N — et elle doit se lire une seule fois.
 *
 * Prévenir les membres déjà présents qu'un nouveau les rejoint se faisait par
 * `createMemberJoinedNotification` appelée en boucle, une fois par
 * destinataire. Or les trois lectures que cette méthode fait — le profil du
 * nouveau membre, le titre de la conversation, l'effectif — ne dépendent PAS du
 * destinataire : elles sont rigoureusement identiques d'un tour de boucle à
 * l'autre. Un ajout dans un groupe de 200 personnes coûtait donc 600 requêtes
 * pour trois résultats distincts, et le coût croissait avec la taille du groupe
 * — c'est-à-dire exactement là où il fait mal.
 *
 * Le second appelant (jointure par lien, `routes/conversations/sharing.ts`)
 * aggravait le tableau en `await`ant chaque destinataire À LA SUITE, à
 * l'intérieur de la requête HTTP : la réponse « vous avez rejoint » attendait
 * que le dernier administrateur ait reçu sa notification.
 *
 * Ce que ces tests exigent du lot : une lecture partagée, une requête de mute
 * pour toute l'audience, et un décompte de ce qui a réellement été créé.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s: string) => s ?? ''),
    sanitizeUsername: jest.fn((s: string) => s ?? ''),
    sanitizeURL: jest.fn((s: string) => s ?? null),
    sanitizeJSON: jest.fn((x: unknown) => x),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    conversation: { findUnique: jest.fn() },
    participant: { count: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    userConversationPreferences: { findMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../../../services/notifications/NotificationService';

const CONV_ID = '507f1f77bcf86cd799439011';
const NEW_MEMBER_ID = '507f1f77bcf86cd799439022';
const MEMBER_A = '507f1f77bcf86cd799439033';
const MEMBER_B = '507f1f77bcf86cd799439044';
const MEMBER_C = '507f1f77bcf86cd799439055';

const COMMON = {
  newMemberUserId: NEW_MEMBER_ID,
  conversationId: CONV_ID,
  joinMethod: 'invited' as const,
};

describe('createMemberJoinedNotificationsBatch', () => {
  let service: NotificationService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();

    prisma.notification.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `n-${data.userId}`, ...data, delivery: { emailSent: false, pushSent: false } })
    );
    prisma.user.findUnique.mockResolvedValue({ username: 'newbie', displayName: 'Newbie', avatar: null });
    prisma.conversation.findUnique.mockResolvedValue({ title: 'Le groupe', type: 'group' });
    prisma.participant.count.mockResolvedValue(42);
    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);

    service = new NotificationService(prisma);
  });

  it('reads the shared snapshot ONCE however many recipients there are', async () => {
    const created = await service.createMemberJoinedNotificationsBatch([MEMBER_A, MEMBER_B, MEMBER_C], COMMON);

    expect(created).toBe(3);
    expect(prisma.notification.create).toHaveBeenCalledTimes(3);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.participant.count).toHaveBeenCalledTimes(1);
  });

  it('produces the same notification as the single-recipient method', async () => {
    await service.createMemberJoinedNotificationsBatch([MEMBER_A], COMMON);
    const batched = prisma.notification.create.mock.calls[0][0].data;

    jest.clearAllMocks();
    prisma.notification.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'n', ...data, delivery: { emailSent: false, pushSent: false } })
    );
    prisma.user.findUnique.mockResolvedValue({ username: 'newbie', displayName: 'Newbie', avatar: null });
    prisma.conversation.findUnique.mockResolvedValue({ title: 'Le groupe', type: 'group' });
    prisma.participant.count.mockResolvedValue(42);
    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);

    await service.createMemberJoinedNotification({ recipientUserId: MEMBER_A, ...COMMON });
    const single = prisma.notification.create.mock.calls[0][0].data;

    expect(batched.type).toBe('member_joined');
    expect(batched.userId).toEqual(single.userId);
    expect(batched.actor).toEqual(single.actor);
    expect(batched.context).toEqual(single.context);
    expect(batched.metadata).toEqual(single.metadata);
    expect(batched.priority).toEqual(single.priority);
  });

  it('asks about the mute ONCE, for the whole audience, and drops those who muted', async () => {
    prisma.userConversationPreferences.findMany.mockResolvedValue([{ userId: MEMBER_B }]);

    const created = await service.createMemberJoinedNotificationsBatch([MEMBER_A, MEMBER_B, MEMBER_C], COMMON);

    expect(created).toBe(2);
    expect(prisma.userConversationPreferences.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.userConversationPreferences.findMany).toHaveBeenCalledWith({
      where: { conversationId: CONV_ID, userId: { in: [MEMBER_A, MEMBER_B, MEMBER_C] }, isMuted: true },
      select: { userId: true },
    });
    const notified = prisma.notification.create.mock.calls.map((call: any[]) => call[0].data.userId);
    expect(notified).toEqual([MEMBER_A, MEMBER_C]);
  });

  it('loads nothing at all when every recipient muted the conversation', async () => {
    prisma.userConversationPreferences.findMany.mockResolvedValue([{ userId: MEMBER_A }, { userId: MEMBER_B }]);

    const created = await service.createMemberJoinedNotificationsBatch([MEMBER_A, MEMBER_B], COMMON);

    expect(created).toBe(0);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    expect(prisma.participant.count).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('touches the database not at all for an empty audience', async () => {
    const created = await service.createMemberJoinedNotificationsBatch([], COMMON);

    expect(created).toBe(0);
    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('notifies a repeated recipient exactly once', async () => {
    // Les deux appelants construisent leur audience par requête Prisma, où un
    // doublon ne devrait pas apparaître — mais le prix d'un doublon ici est une
    // notification en double sur l'appareil, pas une ligne en trop dans un log.
    const created = await service.createMemberJoinedNotificationsBatch([MEMBER_A, MEMBER_A], COMMON);

    expect(created).toBe(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('creates nothing when the new member cannot be read', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const created = await service.createMemberJoinedNotificationsBatch([MEMBER_A, MEMBER_B], COMMON);

    expect(created).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('counts only the notifications actually created', async () => {
    // `createNotification` rend `null` sans lever quand la préférence de type
    // du destinataire l'interdit. Le décompte rendu à l'appelant doit refléter
    // ce qui est parti, pas la taille de l'audience visée.
    prisma.userPreferences.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.userId === MEMBER_B ? { notification: { memberJoinedEnabled: false } } : null)
    );

    const created = await service.createMemberJoinedNotificationsBatch([MEMBER_A, MEMBER_B], COMMON);

    expect(created).toBe(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create.mock.calls[0][0].data.userId).toBe(MEMBER_A);
  });
});
