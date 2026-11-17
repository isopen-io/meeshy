/**
 * #19210 — sous « Masquer le nom de l'expéditeur » (`showSenderName:false`), le SOUS-TITRE de la bannière ne nomme
 * pas l'acteur : il porte l'action sociale, où l'auteur du contenu est fusionné, et l'écran verrouillé iOS l'affiche
 * sous le titre neutre « Meeshy ».
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
    sanitizeUsername: jest.fn((input: string) => input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''),
    sanitizeURL: jest.fn((input: string) => input || null),
    // Même contrat que la production : un chemin relatif ou une URL http(s) survit.
    sanitizeURLOrPath: jest.fn((input: string) => input || null),
    sanitizeJSON: jest.fn((input: unknown) => input),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(),
      updateMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(),
      createMany: jest.fn(),
    },
    notificationPreference: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(async (args: any) => (args?.where?.isActive === true ? (args.where.id?.in ?? []).map((id: string) => ({ id })) : [])),
    },
    conversation: { findUnique: jest.fn() },
    message: { findUnique: jest.fn() },
    userConversationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('firebase-admin/app', () => ({ getApps: jest.fn(() => []), initializeApp: jest.fn(), cert: jest.fn() }));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));
jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(false), readFileSync: jest.fn() }));
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
const AUTHOR_ID = '507f1f77bcf86cd799439012';
const POST_ID = '507f1f77bcf86cd799439015';

type PushPayload = { title: string; subtitle?: string; body: string; data?: Record<string, string> };

describe('#19210 — showSenderName:false et le sous-titre de la bannière', () => {
  let service: NotificationService;
  let prisma: any;
  let sendToUser: jest.Mock;
  const lastPushPayload = (): PushPayload => {
    const calls = sendToUser.mock.calls as Array<[{ payload: PushPayload }]>;
    return calls[calls.length - 1][0].payload;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new NotificationService(prisma as any);
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit: jest.fn() } as any, new Map());
    sendToUser = jest.fn().mockResolvedValue(undefined);
    service.setPushNotificationService({ sendToUser } as any);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);
    (prisma.notification.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
      id: 'notif-1', ...data, createdAt: new Date(),
    }));
    (prisma.notification.update as jest.Mock).mockResolvedValue({});
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ blockedUserIds: [] });
    (prisma.userPreferences.findUnique as jest.Mock).mockResolvedValue({ notification: { showSenderName: false } });
  });

  it("l'auteur d'une story répond dans son propre fil : le sous-titre poussé ne doit pas le nommer", async () => {
    await service.createNotification({
      userId: RECIPIENT_ID,
      type: 'story_thread_reply' as any,
      priority: 'low' as any,
      content: 'Merci à tous !',
      actor: { id: AUTHOR_ID, username: 'alice', displayName: 'Alice Martin', avatar: null } as any,
      context: { postId: POST_ID } as any,
      metadata: { action: 'view_post', postId: POST_ID, postType: 'STORY', contentAuthorName: 'Alice Martin' } as any,
      lang: 'fr',
    });
    await new Promise((r) => setImmediate(r));

    const banner = lastPushPayload();
    expect(banner.title).toBe('Meeshy');
    expect(banner.body).not.toContain('Alice Martin');
    expect(banner.subtitle ?? '').not.toContain('Alice Martin');
  });
});
