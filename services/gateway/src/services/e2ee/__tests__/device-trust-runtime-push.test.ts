/** @jest-environment node */
/**
 * La fermeture de PRODUCTION du push d'annonce (#19156) : une annonce n'est pas un appel, elle ne
 * vise jamais un jeton VoIP (qui, sur iOS, doit ouvrir CallKit). Témoin rapporté de l'audit de la
 * PR #19170 : celui des annonces s'arrêtait à `deps.push`.
 */
import { DEVICE_TRUST_CAPABILITY } from '@meeshy/shared/types/e2ee-device-trust';

const sendToUser = jest.fn(async (_options: unknown) => []);
jest.mock('../../PushNotificationService', () => ({ getPushNotificationService: () => ({ sendToUser }) }));
jest.mock('../../CacheStore', () => ({ getCacheStore: () => ({ getNativeClient: () => null }) }));

import { deviceTrustRuntime } from '../device-trust-runtime';

const ALICE = '6745a1b2c3d4e5f601234567';

it('le push d’annonce d’un enrôlement part vers APNs et FCM, jamais vers un jeton VoIP', async () => {
  const prisma = {
    e2EEDevice: {
      findFirst: async () => ({ platform: 'ios', label: 'x', createdAt: new Date(), capabilities: [DEVICE_TRUST_CAPABILITY] }),
      findMany: async () => [],
    },
    user: { findUnique: async () => ({ systemLanguage: 'fr' }) },
  };

  await deviceTrustRuntime(prisma as never).announcements.enrolled({ userId: ALICE, deviceId: 2, registrationId: 7, returning: false });
  await new Promise((resolve) => setImmediate(resolve));

  expect(sendToUser).toHaveBeenCalledTimes(1);
  expect(sendToUser.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ userId: ALICE, types: ['apns', 'fcm'] }));
});
