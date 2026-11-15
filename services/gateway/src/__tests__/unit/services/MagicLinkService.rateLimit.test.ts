/**
 * MagicLinkService — rate limit IP (#5331)
 *
 * `checkRateLimit` prenait `ipAddress` sans jamais le lire : un appelant
 * unique pouvait épuiser la voie magic-link en tournant sur des adresses
 * e-mail distinctes, chacune sous son propre quota jamais touché.
 * `PasswordResetService.checkRateLimit` applique déjà les deux bornes
 * (email + IP) ; ce fichier prouve que la jumelle en manquait une, et
 * qu'elle est désormais posée.
 *
 * Extrait de `MagicLinkService.test.ts` (déjà à son plafond de lignes
 * hérité, `gateway-test-file-size-budget.test.ts`) plutôt qu'ajouté dessus.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('jsonwebtoken', () => ({
  sign: () => 'mock-jwt-token',
}));

jest.mock('../../../services/SessionService', () => ({
  initSessionService: () => undefined,
  createSession: () => Promise.resolve({}),
  generateSessionToken: () => 'mock-session-token',
}));

import { MagicLinkService, MagicLinkRequest } from '../../../services/MagicLinkService';

const mockPrisma = {
  user: {
    findFirst: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
  },
  magicLinkToken: {
    findUnique: jest.fn() as jest.Mock<any>,
    create: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
    updateMany: jest.fn() as jest.Mock<any>,
  },
  securityEvent: {
    create: jest.fn() as jest.Mock<any>,
  },
} as any;

const mockRedis = {
  get: jest.fn() as jest.Mock<any>,
  set: jest.fn() as jest.Mock<any>,
  del: jest.fn() as jest.Mock<any>,
  keys: jest.fn() as jest.Mock<any>,
  setnx: jest.fn() as jest.Mock<any>,
  expire: jest.fn() as jest.Mock<any>,
  publish: jest.fn() as jest.Mock<any>,
  info: jest.fn() as jest.Mock<any>,
  isAvailable: jest.fn() as jest.Mock<any>,
  close: jest.fn() as jest.Mock<any>,
  getNativeClient: jest.fn() as jest.Mock<any>,
};

const mockEmailService = {
  sendMagicLinkEmail: jest.fn() as jest.Mock<any>,
};

const mockGeoIPService = {
  lookup: jest.fn() as jest.Mock<any>,
};

const validMagicLinkRequest: MagicLinkRequest = {
  email: 'test@example.com',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0 Test Browser',
  deviceFingerprint: 'device-123',
  rememberDevice: false,
};

describe('MagicLinkService — rate limit IP (#5331)', () => {
  let service: MagicLinkService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.set.mockResolvedValue(undefined);
    mockGeoIPService.lookup.mockResolvedValue(null);
    mockEmailService.sendMagicLinkEmail.mockResolvedValue(undefined);
    mockPrisma.securityEvent.create.mockResolvedValue({ id: 'event-1' });

    service = new MagicLinkService(
      mockPrisma,
      mockRedis as any,
      mockEmailService as any,
      mockGeoIPService as any
    );
  });

  it('rate-limits by IP even when the email quota is untouched', async () => {
    mockRedis.get.mockImplementation(((key: string) =>
      Promise.resolve(String(key).includes(':ip:') ? '9999' : '0')) as any);
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const result = await service.requestMagicLink(validMagicLinkRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe('RATE_LIMITED');
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('increments the IP rate limit counter alongside the email counter', async () => {
    mockRedis.get.mockResolvedValue('0');
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await service.requestMagicLink(validMagicLinkRequest);

    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('ratelimit:magic-link:ip:'),
      '1',
      3600
    );
  });
});
