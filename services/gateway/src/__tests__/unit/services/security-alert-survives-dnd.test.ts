/**
 * Une alerte de sécurité survit à « Ne pas déranger » (#18910, serveur-notifications-2).
 *
 * Ne pas déranger est une promesse de SILENCE du téléphone, pas d'effacement :
 * il décide si l'appareil sonne, jamais si la victime d'une intrusion saura un
 * jour qu'on s'est connecté chez elle. Avant le correctif, `shouldCreateNotification`
 * arrêtait la création, donc la ligne in-app, l'événement socket ET l'e-mail
 * « nouvelle connexion » (avec son lien de révocation) disparaissaient pour
 * toujours quand l'intrusion tombait dans la fenêtre.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '',
  },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((input: string) => input?.replace(/<[^>]*>/g, '') || ''),
    sanitizeUsername: jest.fn((input: string) => input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''),
    sanitizeURL: jest.fn((input: string) => {
      if (!input) return null;
      try {
        const url = new URL(input);
        if (['http:', 'https:'].includes(url.protocol)) return input;
        return null;
      } catch {
        return null;
      }
    }),
    // #7157 — même règle que la production : un chemin relatif survit, un
    // protocole refusé tombe. Un double PARTIEL de `SecuritySanitizer` rend
    // `undefined` et fait échouer l'appel, pas l'assertion.
    sanitizeURLOrPath: jest.fn((input: string) => {
      if (!input) return null;
      try {
        const url = new URL(input);
        return ['http:', 'https:'].includes(url.protocol) ? input : null;
      } catch {
        return input.startsWith('/') && !input.startsWith('//') ? input : null;
      }
    }),
    sanitizeJSON: jest.fn((input: any) => {
      const sanitize = (obj: any): any => {
        if (typeof obj === 'string') return obj.replace(/<[^>]*>/g, '');
        if (Array.isArray(obj)) return obj.map(sanitize);
        if (typeof obj === 'object' && obj !== null) {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            if (!key.startsWith('$') && !key.startsWith('__')) {
              result[key] = sanitize(value);
            }
          }
          return result;
        }
        return obj;
      };
      return sanitize(input);
    }),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
    },
    participant: {
      count: jest.fn(),
    },
    userPreferences: {
      findUnique: jest.fn(),
    },
    // Les notifications d'appartenance passent par le mute par conversation
    // (cf. `mutedRecipients.ts`) : sans ce modèle, la lecture lève au lieu de
    // rendre « personne n'a coupé le son ».
    userConversationPreferences: {
      findMany: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
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

// In-memory setnx so the email-throttle branch is fully controllable: the first
// call for a given key returns true (lock acquired), subsequent calls false.
const mockSetnx = jest.fn();
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ setnx: mockSetnx }),
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const NOON_UTC = new Date('2024-01-15T12:00:00Z');
const ALL_DAY_DND = { dndEnabled: true, dndStartTime: '00:00', dndEndTime: '23:59' };

const createdRow = (type: string) => ({ id: `notif-${type}`, type, isRead: false, createdAt: NOON_UTC });

const makeWorld = () => {
  const prisma: any = new PrismaClient();
  prisma.userConversationPreferences.findMany.mockResolvedValue([]);
  prisma.participant.count.mockResolvedValue(0);
  prisma.userPreferences.findUnique.mockResolvedValue({ notification: ALL_DAY_DND });
  prisma.user.findUnique.mockResolvedValue({
    username: 'victim', displayName: 'Victim', avatar: null, email: 'victim@example.com', systemLanguage: 'fr',
  });
  prisma.notification.create.mockImplementation(async ({ data }: any) => createdRow(data.type));
  mockSetnx.mockResolvedValue(true);

  const email = {
    sendSecurityAlertEmail: jest.fn().mockResolvedValue({ success: true }),
    sendNotificationEmail: jest.fn().mockResolvedValue({ success: true }),
    sendLoginAlertEmail: jest.fn().mockResolvedValue({ success: true }),
  };
  const service = new NotificationService(prisma);
  service.setEmailService(email as any);
  return { prisma, service, email };
};

describe('une alerte de sécurité sous Ne pas déranger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOON_UTC);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('une connexion depuis un appareil inconnu est écrite et prévient par e-mail', async () => {
    const { prisma, service, email } = makeWorld();

    const result = await service.createLoginNewDeviceNotification({ recipientUserId: 'u1' });

    expect(result).not.toBeNull();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(email.sendLoginAlertEmail).toHaveBeenCalledTimes(1);
  });

  it('la 2FA désactivée est écrite et prévient par e-mail', async () => {
    const { prisma, service, email } = makeWorld();

    const result = await service.createTwoFactorNotification({ recipientUserId: 'u1', enabled: false });

    expect(result).not.toBeNull();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(email.sendSecurityAlertEmail).toHaveBeenCalledTimes(1);
  });

  it('un mot de passe changé est écrit et prévient par e-mail', async () => {
    const { prisma, service, email } = makeWorld();

    const result = await service.createPasswordChangedNotification({ recipientUserId: 'u1' });

    expect(result).not.toBeNull();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(email.sendSecurityAlertEmail).toHaveBeenCalledTimes(1);
  });

  it('un message ordinaire reste retenu par la même fenêtre', async () => {
    const { prisma, service } = makeWorld();

    const result = await service.createNotification({
      userId: 'u1',
      type: 'new_message',
      priority: 'normal',
      title: 'Alice',
      content: 'Salut',
      context: {},
      metadata: {},
    });

    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
