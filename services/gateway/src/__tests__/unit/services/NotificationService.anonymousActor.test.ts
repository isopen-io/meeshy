/**
 * Un expéditeur ANONYME peut notifier.
 *
 * Les trois créateurs de notification de message rechargeaient l'expéditeur par
 * `user.findUnique({ id: senderId })` et rendaient `null` quand rien ne
 * revenait. Un participant anonyme n'a pas de ligne `User` (`userId: null` dans
 * `schema.prisma`), donc la lecture rendait toujours `null` : personne n'était
 * jamais notifié d'un message envoyé par un anonyme — ni par lien de partage,
 * ni par le chemin socket nominal.
 *
 * `senderProfile` porte l'identité DÉJÀ résolue par l'appelant. Elle sert deux
 * choses à la fois : nommer un acteur qui n'existe pas dans `User`, et éviter
 * une lecture `User` PAR DESTINATAIRE sur le chemin le plus chaud du service.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '' },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((input: string) => input?.replace(/<[^>]*>/g, '') || ''),
    sanitizeUsername: jest.fn((input: string) => input?.replace(/[^a-zA-Z0-9_.\- ]/g, '').substring(0, 50) || ''),
    sanitizeURL: jest.fn((input: string) => input || null),
    sanitizeJSON: jest.fn((input: unknown) => input),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    notificationPreference: { findUnique: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    userConversationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn() },
    conversation: { findUnique: jest.fn() },
    message: { findUnique: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn(), logAttempt: jest.fn(), logSuccess: jest.fn() },
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const RECIPIENT_ID = '507f1f77bcf86cd799439011';
const ANON_PARTICIPANT_ID = '507f1f77bcf86cd799439012';
const CONVERSATION_ID = '507f1f77bcf86cd799439013';
const MESSAGE_ID = '507f1f77bcf86cd799439014';

const ANON_PROFILE = { username: 'Invite curieux', displayName: 'Invite curieux', avatar: null };

describe('NotificationService — un acteur sans ligne User', () => {
  let service: NotificationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  function createdNotification() {
    return prisma.notification.create.mock.calls[0]?.[0]?.data;
  }

  /**
   * `user.findUnique` sert AUSSI à résoudre la langue du DESTINATAIRE
   * (`resolveRecipientLang`). Seule la lecture de l'EXPÉDITEUR doit disparaître.
   */
  function senderLookups() {
    return prisma.user.findUnique.mock.calls.filter(
      (call: any[]) => call[0]?.where?.id === ANON_PARTICIPANT_ID
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = new PrismaClient();
    service = new NotificationService(prisma as any);
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit: jest.fn() } as any, new Map());
    service.setPushNotificationService({ sendToUser: jest.fn().mockResolvedValue(undefined) } as any);

    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({
      id: 'notif-1',
      userId: RECIPIENT_ID,
      isRead: false,
      createdAt: new Date(),
      actor: null,
      context: {},
      metadata: {},
      title: null,
      subtitle: null,
      priority: 'normal',
    });
    prisma.message.findUnique.mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
    });
    // Le point du cycle : AUCUN utilisateur derrière cet id.
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.conversation.findUnique.mockResolvedValue({ title: 'Salon public', type: 'group' });
  });

  it('createMessageNotification notifie avec le profil fourni, sans lire User', async () => {
    const result = await service.createMessageNotification({
      recipientUserId: RECIPIENT_ID,
      senderId: ANON_PARTICIPANT_ID,
      senderProfile: ANON_PROFILE,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: 'bonjour depuis un lien',
    });

    expect(result).not.toBeNull();
    expect(senderLookups()).toHaveLength(0);
    expect(createdNotification()?.actor).toEqual(
      expect.objectContaining({ id: ANON_PARTICIPANT_ID, displayName: 'Invite curieux' })
    );
  });

  it('createReplyNotification notifie avec le profil fourni, sans lire User', async () => {
    const result = await service.createReplyNotification({
      recipientUserId: RECIPIENT_ID,
      replierUserId: ANON_PARTICIPANT_ID,
      senderProfile: ANON_PROFILE,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: 'ma reponse',
    });

    expect(result).not.toBeNull();
    expect(senderLookups()).toHaveLength(0);
  });

  it('createMentionNotification notifie avec le profil fourni, sans lire User', async () => {
    const result = await service.createMentionNotification({
      mentionedUserId: RECIPIENT_ID,
      mentionerUserId: ANON_PARTICIPANT_ID,
      senderProfile: ANON_PROFILE,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: '@bob regarde',
    });

    expect(result).not.toBeNull();
    expect(senderLookups()).toHaveLength(0);
  });

  it('le lot de mentions transmet le profil à chaque mention', async () => {
    const count = await service.createMentionNotificationsBatch(
      [RECIPIENT_ID],
      {
        senderId: ANON_PARTICIPANT_ID,
        senderProfile: ANON_PROFILE,
        messageContent: '@bob regarde',
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      },
      [RECIPIENT_ID]
    );

    expect(count).toBe(1);
    expect(senderLookups()).toHaveLength(0);
  });

  it('sans profil, le comportement historique tient : pas d’utilisateur → pas de notification', async () => {
    const result = await service.createMessageNotification({
      recipientUserId: RECIPIENT_ID,
      senderId: ANON_PARTICIPANT_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: 'bonjour',
    });

    expect(result).toBeNull();
    expect(senderLookups()).toHaveLength(1);
  });
});
