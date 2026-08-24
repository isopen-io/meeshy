/**
 * Cycle 124 — la langue de CADRAGE, dans le service qui en porte la règle.
 *
 * `NotificationService.resolveRecipientPrism` EST la SSOT du cadrage, et son
 * doc-comment l'énonce : « le rang le plus haut RENSEIGNÉ, ce que rend
 * `resolveUserLanguage` ». Elle sert les éventails de messages.
 *
 * Quatre sites du MÊME fichier ne l'appelaient pas et lisaient
 * `user.systemLanguage` en direct — les trois e-mails immédiats des
 * notifications prioritaires (alerte de connexion, alerte de sécurité,
 * notification sociale) et le titre in-app de `login_new_device`.
 *
 * Le quatrième porte en plus un défaut que la langue seule ne décrit pas :
 *
 *     const locale = user?.systemLanguage === 'en' ? 'en-US' : 'fr-FR';
 *
 * Un binaire codé en dur. Un lecteur allemand recevait un titre allemand
 * (`notificationString` normalise, lui) daté à la française. La leçon 267 dit
 * qu'un contenu RÉSOLU n'est pas un contenu SERVI ; ici l'horodatage n'était
 * même pas résolu.
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
    sanitizeUsername: jest.fn((input: string) =>
      input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''
    ),
    sanitizeURL: jest.fn((input: string) => input || null),
    sanitizeJSON: jest.fn((input: unknown) => input),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(),
      update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
      count: jest.fn(), groupBy: jest.fn(), createMany: jest.fn(),
    },
    notificationPreference: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    conversation: { findUnique: jest.fn() },
    message: { findUnique: jest.fn() },
    postMedia: { findFirst: jest.fn() },
    userConversationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
    PostVisibility: {
      PUBLIC: 'PUBLIC', PRIVATE: 'PRIVATE', FRIENDS: 'FRIENDS',
      ONLY: 'ONLY', EXCEPT: 'EXCEPT', COMMUNITY: 'COMMUNITY',
    },
  };
});

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []), initializeApp: jest.fn(), cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));
jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(false), readFileSync: jest.fn() }));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({
    setnx: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn(), logAttempt: jest.fn(), logSuccess: jest.fn() },
}));

jest.mock('../../../services/SessionService', () => ({
  getUserSessions: jest.fn(async () => []),
}));

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const RECIPIENT_ID = '507f1f77bcf86cd799439011';

const PRISM_COLUMNS = [
  'systemLanguage', 'regionalLanguage', 'customDestinationLanguage', 'deviceLocale',
] as const;

const RANK_2_ONLY = {
  systemLanguage: null, regionalLanguage: 'es',
  customDestinationLanguage: null, deviceLocale: null,
};
const RANK_4_ONLY = {
  systemLanguage: null, regionalLanguage: null,
  customDestinationLanguage: null, deviceLocale: 'de-DE',
};
const NO_PREFERENCE_AT_ALL = {
  systemLanguage: null, regionalLanguage: null,
  customDestinationLanguage: null, deviceLocale: null,
};

function makeNotif() {
  return {
    id: 'notif-124', userId: RECIPIENT_ID, type: 'password_changed',
    isRead: false, createdAt: new Date(), content: '', priority: 'high',
    actor: null, context: {}, metadata: {}, delivery: { emailSent: false, pushSent: false },
  };
}

describe('NotificationService — les canaux NOMMÉS descendent le Prisme de cadrage', () => {
  let service: NotificationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let sendSecurityAlertEmail: jest.Mock;
  let sendLoginAlertEmail: jest.Mock;
  let sendNotificationEmail: jest.Mock;

  /** Hors ligne : `fetchSockets` vide est ce qui autorise l'e-mail immédiat. */
  function installOfflineSocketIO() {
    service.setSocketIO({
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) }),
    } as never, new Map());
  }

  function givenReader(prefs: Record<string, unknown>) {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      username: 'lector', displayName: 'Lector', avatar: null,
      email: 'lector@example.test', ...prefs,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = new PrismaClient();
    service = new NotificationService(prisma as never);
    service.setPushNotificationService({ sendToUser: jest.fn().mockResolvedValue(undefined) } as never);

    sendSecurityAlertEmail = jest.fn<any>().mockResolvedValue(undefined);
    sendLoginAlertEmail = jest.fn<any>().mockResolvedValue(undefined);
    sendNotificationEmail = jest.fn<any>().mockResolvedValue(undefined);
    service.setEmailService({
      sendSecurityAlertEmail, sendLoginAlertEmail, sendNotificationEmail,
    } as never);

    (prisma.userPreferences.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);
    (prisma.notification.create as jest.Mock).mockResolvedValue(makeNotif());
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue({ delivery: {} });
    givenReader(RANK_2_ONLY);
    installOfflineSocketIO();
  });

  // ---- e-mail d'alerte de SÉCURITÉ ----

  it('alerte de sécurité — rang 2 servi quand le rang 1 est vide', async () => {
    await service.createPasswordChangedNotification({ recipientUserId: RECIPIENT_ID });

    expect(sendSecurityAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'es' })
    );
  });

  it('alerte de sécurité — rang 4 servi quand seule la locale appareil est connue', async () => {
    givenReader(RANK_4_ONLY);

    await service.createPasswordChangedNotification({ recipientUserId: RECIPIENT_ID });

    expect(sendSecurityAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'de' })
    );
  });

  it('alerte de sécurité — repli du SITE préservé quand aucun rang n\'est renseigné', async () => {
    givenReader(NO_PREFERENCE_AT_ALL);

    await service.createPasswordChangedNotification({ recipientUserId: RECIPIENT_ID });

    expect(sendSecurityAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'fr' })
    );
  });

  it('alerte de sécurité — la préférence est normalisée (« pt-BR » → « pt »)', async () => {
    givenReader({ ...NO_PREFERENCE_AT_ALL, systemLanguage: 'pt-BR' });

    await service.createPasswordChangedNotification({ recipientUserId: RECIPIENT_ID });

    expect(sendSecurityAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'pt' })
    );
  });

  it('la requête de l\'e-mail immédiat ramène les quatre colonnes du Prisme', async () => {
    await service.createPasswordChangedNotification({ recipientUserId: RECIPIENT_ID });

    const emailQuery = (prisma.user.findUnique as jest.Mock).mock.calls
      .map(call => (call[0] as { select?: Record<string, unknown> })?.select)
      .find(select => select?.email === true);

    for (const column of PRISM_COLUMNS) {
      expect(emailQuery?.[column]).toBe(true);
    }
  });

  // ---- notification sociale (e-mail neutre) ----

  it('notification sociale — rang 2 servi quand le rang 1 est vide', async () => {
    (prisma.notification.create as jest.Mock).mockResolvedValue({
      ...makeNotif(), type: 'mention',
    });

    await (service as any).createNotification({
      userId: RECIPIENT_ID, type: 'mention', priority: 'high',
      content: 'Lector, regarde ça', context: {}, metadata: {},
    });

    expect(sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'es' })
    );
  });

  // ---- titre in-app + horodatage de login_new_device ----

  describe('login_new_device — le titre ET l\'horodatage suivent le lecteur', () => {
    const loginParams = {
      recipientUserId: RECIPIENT_ID,
      deviceInfo: { vendor: 'Apple', model: 'iPhone', os: 'iOS', osVersion: '19.0' },
      ipAddress: '203.0.113.7',
      geoData: { city: 'Berlin', countryName: 'Deutschland', timezone: 'Europe/Berlin' },
    };

    it('le titre est rendu au rang 2 quand le rang 1 est vide', async () => {
      await service.createLoginNewDeviceNotification(loginParams);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'Nuevo inicio de sesión detectado' }),
        })
      );
    });

    it('l\'horodatage est formaté dans la langue SERVIE, pas dans un binaire en/fr', async () => {
      givenReader(RANK_4_ONLY);

      await service.createLoginNewDeviceNotification(loginParams);

      const created = (prisma.notification.create as jest.Mock).mock.calls.at(-1)?.[0] as
        { data: { title: string; content: string } };

      expect(created.data.title).toBe('Neue Anmeldung erkannt');
      // L'ÉNONCÉ, pas une graphie (leçon 272) : l'allemand sépare sa date par
      // des POINTS, le français par des barres obliques. Épingler le millésime
      // ou le nombre de chiffres n'ajouterait rien à la règle et casserait au
      // premier changement de CLDR — `dateStyle: 'short'` rend « 24.08.26 » en
      // allemand et « 24/08/2026 » en français.
      expect(created.data.content).toMatch(/\d{1,2}\.\d{1,2}\./);
      expect(created.data.content).not.toMatch(/\d{1,2}\/\d{1,2}\//);
    });

    it('la requête de langue ramène les quatre colonnes du Prisme', async () => {
      await service.createLoginNewDeviceNotification(loginParams);

      const langQuery = (prisma.user.findUnique as jest.Mock).mock.calls
        .map(call => (call[0] as { select?: Record<string, unknown> })?.select)
        .find(select => select?.systemLanguage === true);

      for (const column of PRISM_COLUMNS) {
        expect(langQuery?.[column]).toBe(true);
      }
    });
  });
});
