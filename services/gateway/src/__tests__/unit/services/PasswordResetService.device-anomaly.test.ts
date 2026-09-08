/**
 * PasswordResetService — détection d'anomalie par APPAREIL (#5355).
 *
 * Décision produit tranchée sur l'issue : un appareil différent de celui
 * enregistré (`User.lastLoginDevice`) déclenche l'alerte de sécurité SEUL,
 * sans exiger de changement de pays — c'est le cas nominal d'un vol
 * d'identifiants. Une IP différente SEULE, à l'inverse, n'est délibérément
 * PAS comparée (VPN, itinérance mobile, renouvellement DHCP du FAI en
 * changent une pour un utilisateur légitime bien plus souvent que pour un
 * attaquant).
 *
 * Fichier séparé plutôt qu'ajout à `PasswordResetService.test.ts` : ce
 * dernier est gelé au cliquet de taille (#4531/#4615, 1823 lignes) — un
 * fichier de la dette héritée ne grossit pas, on extrait.
 *
 * Run with: npm test -- PasswordResetService.device-anomaly.test.ts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockBcryptHash = jest.fn() as jest.Mock<any>;
const mockBcryptCompare = jest.fn() as jest.Mock<any>;

jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: (password: string) => mockBcryptHash(password),
  verifyPassword: (password: string, hash: string) => mockBcryptCompare(password, hash)
}));

const mockZxcvbn = jest.fn() as jest.Mock<any>;
jest.mock('zxcvbn', () => (password: string) => mockZxcvbn(password));

import { PasswordResetService, PasswordResetCompletion } from '../../../services/PasswordResetService';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  passwordResetToken: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  passwordHistory: {
    findMany: jest.fn(),
    create: jest.fn()
  },
  userSession: {
    updateMany: jest.fn()
  },
  securityEvent: {
    create: jest.fn()
  },
  $transaction: jest.fn((callback: Function) => callback(mockPrisma))
} as any;

const mockRedis = {
  get: jest.fn() as jest.Mock<any>,
  set: jest.fn() as jest.Mock<any>,
  setnx: jest.fn() as jest.Mock<any>,
  expire: jest.fn() as jest.Mock<any>,
  del: jest.fn() as jest.Mock<any>,
  keys: jest.fn() as jest.Mock<any>,
  publish: jest.fn() as jest.Mock<any>,
  info: jest.fn() as jest.Mock<any>,
  isAvailable: jest.fn() as jest.Mock<any>,
  close: jest.fn() as jest.Mock<any>,
  getNativeClient: jest.fn() as jest.Mock<any>
};

const mockEmailService = {
  sendPasswordResetEmail: jest.fn() as jest.Mock<any>,
  sendPasswordChangedEmail: jest.fn() as jest.Mock<any>,
  sendSecurityAlertEmail: jest.fn() as jest.Mock<any>
};

const mockGeoIPService = {
  lookup: jest.fn() as jest.Mock<any>
};

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  emailVerifiedAt: new Date(),
  lockedUntil: null,
  passwordResetAttempts: 0,
  lastPasswordResetAttempt: null,
  firstName: 'Test',
  lastName: 'User',
  password: '$2b$12$hashedpassword',
  twoFactorEnabledAt: null,
  twoFactorSecret: null,
  lastLoginDevice: null,
  lastLoginIp: null,
  lastLoginLocation: null,
  lastActiveAt: new Date(),
  systemLanguage: 'en'
};

const mockGeoData = {
  ip: '192.168.1.1',
  city: 'New York',
  region: 'NY',
  country: 'United States',
  countryCode: 'US',
  location: 'New York, United States',
  latitude: 40.7128,
  longitude: -74.006,
  timezone: 'America/New_York'
};

const validResetCompletion: PasswordResetCompletion = {
  token: 'valid-reset-token',
  newPassword: 'NewSecureP@ssw0rd123!',
  confirmPassword: 'NewSecureP@ssw0rd123!',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0 Test Browser',
  deviceFingerprint: 'device-123'
};

function suspiciousResetCall(): any {
  return mockPrisma.securityEvent.create.mock.calls.find(
    (call: any) => call[0]?.data?.eventType === 'SUSPICIOUS_PASSWORD_RESET'
  );
}

describe('PasswordResetService — anomalie par appareil (#5355)', () => {
  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue(undefined);
    mockRedis.setnx.mockResolvedValue(true);
    mockRedis.expire.mockResolvedValue(true);
    mockRedis.del.mockResolvedValue(undefined);

    mockGeoIPService.lookup.mockResolvedValue(mockGeoData);

    mockZxcvbn.mockReturnValue({ score: 4, feedback: { warning: '', suggestions: [] } });

    mockBcryptHash.mockResolvedValue('$2b$12$newhashedpassword');
    mockBcryptCompare.mockResolvedValue(false);

    mockEmailService.sendPasswordChangedEmail.mockResolvedValue(undefined);
    mockEmailService.sendSecurityAlertEmail.mockResolvedValue(undefined);

    mockPrisma.securityEvent.create.mockResolvedValue({ id: 'event-1' });
    mockPrisma.passwordHistory.findMany.mockResolvedValue([]);

    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: mockUser.id,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 900000),
      usedAt: null,
      isRevoked: false,
      user: mockUser
    });

    service = new PasswordResetService(
      mockPrisma,
      mockRedis as any,
      mockEmailService as any,
      mockGeoIPService as any,
      'test-captcha-secret'
    );
  });

  // #5355 — décision produit : un appareil différent de celui enregistré
  // déclenche l'alerte SEUL, sans exiger de changement de pays. C'est le
  // cas nominal d'un vol d'identifiants (même pays, autre appareil).
  it('should flag an unrecognized device even without a country change', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ lockedUntil: null })
      .mockResolvedValueOnce({
        lastLoginDevice: 'old-device-999',
        lastLoginLocation: null,
        lastActiveAt: new Date()
      });

    const result = await service.completePasswordReset(validResetCompletion);

    expect(result.success).toBe(true);
    expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'SUSPICIOUS_PASSWORD_RESET',
          severity: 'CRITICAL'
        })
      })
    );
    expect(mockEmailService.sendSecurityAlertEmail).toHaveBeenCalled();
  });

  it('should not flag the SAME device as an anomaly', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ lockedUntil: null })
      .mockResolvedValueOnce({
        lastLoginDevice: validResetCompletion.deviceFingerprint,
        lastLoginLocation: null,
        lastActiveAt: new Date()
      });

    await service.completePasswordReset(validResetCompletion);

    expect(suspiciousResetCall()).toBeUndefined();
  });

  it('should not flag a FIRST-time reset (no device on record yet) as an anomaly', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ lockedUntil: null })
      .mockResolvedValueOnce({
        lastLoginDevice: null,
        lastLoginLocation: null,
        lastActiveAt: new Date()
      });

    await service.completePasswordReset(validResetCompletion);

    expect(suspiciousResetCall()).toBeUndefined();
  });

  // #5355 — décision produit : une IP différente SEULE est du bruit garanti
  // (VPN, itinérance mobile, renouvellement DHCP du FAI) — elle n'est
  // délibérément PAS comparée, même quand l'appareil est identique.
  it('should NOT flag a different IP alone (same device) as an anomaly — deliberate noise exclusion', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ lockedUntil: null })
      .mockResolvedValueOnce({
        lastLoginDevice: validResetCompletion.deviceFingerprint,
        lastLoginIp: '10.0.0.99', // différente de validResetCompletion.ipAddress
        lastLoginLocation: null,
        lastActiveAt: new Date()
      });

    await service.completePasswordReset(validResetCompletion);

    expect(suspiciousResetCall()).toBeUndefined();
  });
});
