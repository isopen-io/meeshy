/**
 * Route tests — /auth/2fa/* endpoints
 *
 * Covers all 7 routes: GET /status, POST /setup, POST /enable,
 * POST /disable, POST /verify, POST /backup-codes, POST /cancel
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mock all dependencies BEFORE importing the route file ───────────────────

const mockSetup = jest.fn() as jest.Mock<any>;
const mockEnable = jest.fn() as jest.Mock<any>;
const mockDisable = jest.fn() as jest.Mock<any>;
const mockVerify = jest.fn() as jest.Mock<any>;
const mockGetStatus = jest.fn() as jest.Mock<any>;
const mockRegenerateBackupCodes = jest.fn() as jest.Mock<any>;
const mockCancelSetup = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/TwoFactorService', () => ({
  TwoFactorService: jest.fn().mockImplementation(() => ({
    setup: (...args: unknown[]) => mockSetup(...args),
    enable: (...args: unknown[]) => mockEnable(...args),
    disable: (...args: unknown[]) => mockDisable(...args),
    verify: (...args: unknown[]) => mockVerify(...args),
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    regenerateBackupCodes: (...args: unknown[]) => mockRegenerateBackupCodes(...args),
    cancelSetup: (...args: unknown[]) => mockCancelSetup(...args),
  })),
}));

// Fastify 5 preHandlers must be async with NO done argument
jest.mock('../../../validation/helpers.js', () => ({
  validateBody: () => async (_req: unknown, _rep: unknown) => { /* no-op */ },
}));

jest.mock('../../../validation/two-factor-schemas.js', () => ({
  EnableBodySchema: {},
  DisableBodySchema: {},
  VerifyBodySchema: {},
  BackupCodesBodySchema: {},
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

// ─── Import route under test ──────────────────────────────────────────────────

import { twoFactorRoutes } from '../../../routes/two-factor';

// ─── Fastify app factory ──────────────────────────────────────────────────────

const mockNotificationService: any = {
  createTwoFactorNotification: jest.fn<() => Promise<void>>().mockResolvedValue(),
};

async function buildApp(withNotification = false): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  (app as any).decorate('prisma', {});
  (app as any).decorate('authenticate', async (req: any) => {
    req.user = { userId: 'user-123' };
  });
  (app as any).decorate(
    'notificationService',
    withNotification ? mockNotificationService : null
  );

  await app.register(twoFactorRoutes, { prefix: '' });
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TwoFactor Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationService.createTwoFactorNotification.mockResolvedValue(undefined as any);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /status
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /status', () => {
    it('returns 200 with 2FA status on success', async () => {
      mockGetStatus.mockResolvedValue({
        enabled: true,
        enabledAt: new Date('2024-01-01'),
        hasBackupCodes: true,
        backupCodesCount: 5,
      });

      const response = await app.inject({ method: 'GET', url: '/status' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.enabled).toBe(true);
      expect(body.data.backupCodesCount).toBe(5);
    });

    it('returns 500 when getStatus throws', async () => {
      mockGetStatus.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({ method: 'GET', url: '/status' });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.success).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /setup
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /setup', () => {
    it('returns 200 with secret and QR code on success', async () => {
      mockSetup.mockResolvedValue({
        success: true,
        secret: 'BASE32SECRET',
        qrCodeDataUrl: 'data:image/png;base64,abc',
        otpauthUrl: 'otpauth://totp/Meeshy:test@example.com',
      });

      const response = await app.inject({ method: 'POST', url: '/setup' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.secret).toBe('BASE32SECRET');
      expect(body.data.qrCodeDataUrl).toBeDefined();
      expect(body.data.otpauthUrl).toBeDefined();
    });

    it('returns 400 when setup fails (e.g. already enabled)', async () => {
      mockSetup.mockResolvedValue({
        success: false,
        error: '2FA est déjà activé sur ce compte',
      });

      const response = await app.inject({ method: 'POST', url: '/setup' });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
    });

    it('returns 500 when setup throws', async () => {
      mockSetup.mockRejectedValue(new Error('Unexpected error'));

      const response = await app.inject({ method: 'POST', url: '/setup' });

      expect(response.statusCode).toBe(500);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /enable
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /enable', () => {
    it('returns 200 with backup codes on success', async () => {
      mockEnable.mockResolvedValue({
        success: true,
        backupCodes: ['AAAA-BBBB', 'CCCC-DDDD'],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/enable',
        payload: { code: '123456' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.backupCodes).toHaveLength(2);
      expect(body.data.message).toBeDefined();
    });

    it('returns 400 when enable fails (invalid code)', async () => {
      mockEnable.mockResolvedValue({
        success: false,
        error: 'Code invalide. Veuillez réessayer.',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/enable',
        payload: { code: '000000' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when enable throws', async () => {
      mockEnable.mockRejectedValue(new Error('Unexpected'));

      const response = await app.inject({
        method: 'POST',
        url: '/enable',
        payload: { code: '123456' },
      });

      expect(response.statusCode).toBe(500);
    });

    it('fires notification when notificationService is present', async () => {
      const appWithNotif = await buildApp(true);
      mockEnable.mockResolvedValue({
        success: true,
        backupCodes: ['AAAA-BBBB'],
      });

      const response = await appWithNotif.inject({
        method: 'POST',
        url: '/enable',
        payload: { code: '123456' },
      });

      expect(response.statusCode).toBe(200);
      await new Promise(r => setImmediate(r));
      expect(mockNotificationService.createTwoFactorNotification).toHaveBeenCalledWith({
        recipientUserId: 'user-123',
        enabled: true,
      });
      await appWithNotif.close();
    });

    it('does not throw when notification rejects (fire-and-forget catch path)', async () => {
      const appWithNotif = await buildApp(true);
      mockEnable.mockResolvedValue({
        success: true,
        backupCodes: ['AAAA-BBBB'],
      });
      mockNotificationService.createTwoFactorNotification.mockRejectedValue(
        new Error('notification failed') as any
      );

      const response = await appWithNotif.inject({
        method: 'POST',
        url: '/enable',
        payload: { code: '123456' },
      });

      // Response must still be 200 — the .catch() swallows the error
      expect(response.statusCode).toBe(200);
      // Wait for the rejected promise's .catch to run
      await new Promise(r => setImmediate(r));
      await appWithNotif.close();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /disable
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /disable', () => {
    it('returns 200 on success', async () => {
      mockDisable.mockResolvedValue({ success: true });

      const response = await app.inject({
        method: 'POST',
        url: '/disable',
        payload: { password: 'correct-password' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toBeDefined();
    });

    it('returns 400 when disable fails (wrong password)', async () => {
      mockDisable.mockResolvedValue({
        success: false,
        error: 'Mot de passe incorrect',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/disable',
        payload: { password: 'wrong' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when disable throws', async () => {
      mockDisable.mockRejectedValue(new Error('Unexpected'));

      const response = await app.inject({
        method: 'POST',
        url: '/disable',
        payload: { password: 'anything' },
      });

      expect(response.statusCode).toBe(500);
    });

    it('fires disable notification when notificationService is present', async () => {
      const appWithNotif = await buildApp(true);
      mockDisable.mockResolvedValue({ success: true });

      const response = await appWithNotif.inject({
        method: 'POST',
        url: '/disable',
        payload: { password: 'correct-password' },
      });

      expect(response.statusCode).toBe(200);
      await new Promise(r => setImmediate(r));
      expect(mockNotificationService.createTwoFactorNotification).toHaveBeenCalledWith({
        recipientUserId: 'user-123',
        enabled: false,
      });
      await appWithNotif.close();
    });

    it('does not throw when disable notification rejects (fire-and-forget catch path)', async () => {
      const appWithNotif = await buildApp(true);
      mockDisable.mockResolvedValue({ success: true });
      mockNotificationService.createTwoFactorNotification.mockRejectedValue(
        new Error('notification failed') as any
      );

      const response = await appWithNotif.inject({
        method: 'POST',
        url: '/disable',
        payload: { password: 'correct-password' },
      });

      expect(response.statusCode).toBe(200);
      await new Promise(r => setImmediate(r));
      await appWithNotif.close();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /verify
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /verify', () => {
    it('returns 200 with valid:true on success (TOTP)', async () => {
      mockVerify.mockResolvedValue({ success: true, usedBackupCode: false });

      const response = await app.inject({
        method: 'POST',
        url: '/verify',
        payload: { code: '123456' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.valid).toBe(true);
      expect(body.data.usedBackupCode).toBe(false);
    });

    it('returns 200 with usedBackupCode:true when backup code used', async () => {
      mockVerify.mockResolvedValue({ success: true, usedBackupCode: true });

      const response = await app.inject({
        method: 'POST',
        url: '/verify',
        payload: { code: 'ABCD-EFGH' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.usedBackupCode).toBe(true);
    });

    it('returns 400 when verify fails (invalid code)', async () => {
      mockVerify.mockResolvedValue({ success: false, error: 'Code invalide' });

      const response = await app.inject({
        method: 'POST',
        url: '/verify',
        payload: { code: '000000' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when verify throws', async () => {
      mockVerify.mockRejectedValue(new Error('Unexpected'));

      const response = await app.inject({
        method: 'POST',
        url: '/verify',
        payload: { code: '123456' },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /backup-codes
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /backup-codes', () => {
    it('returns 200 with new backup codes on success', async () => {
      mockRegenerateBackupCodes.mockResolvedValue({
        success: true,
        backupCodes: ['AAAA-BBBB', 'CCCC-DDDD'],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/backup-codes',
        payload: { code: '123456' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.backupCodes).toHaveLength(2);
      expect(body.data.message).toBeDefined();
    });

    it('returns 400 when regeneration fails', async () => {
      mockRegenerateBackupCodes.mockResolvedValue({
        success: false,
        error: "Veuillez utiliser votre application d'authentification",
      });

      const response = await app.inject({
        method: 'POST',
        url: '/backup-codes',
        payload: { code: 'ABCDEFGH' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when regenerateBackupCodes throws', async () => {
      mockRegenerateBackupCodes.mockRejectedValue(new Error('Unexpected'));

      const response = await app.inject({
        method: 'POST',
        url: '/backup-codes',
        payload: { code: '123456' },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /cancel
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /cancel', () => {
    it('returns 200 with success message', async () => {
      mockCancelSetup.mockResolvedValue({ success: true });

      const response = await app.inject({ method: 'POST', url: '/cancel' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toBeDefined();
    });

    it('returns 400 when cancelSetup returns failure', async () => {
      mockCancelSetup.mockResolvedValue({
        success: false,
        error: "Erreur lors de l'annulation",
      });

      const response = await app.inject({ method: 'POST', url: '/cancel' });

      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when cancelSetup throws', async () => {
      mockCancelSetup.mockRejectedValue(new Error('Unexpected'));

      const response = await app.inject({ method: 'POST', url: '/cancel' });

      expect(response.statusCode).toBe(500);
    });
  });
});
