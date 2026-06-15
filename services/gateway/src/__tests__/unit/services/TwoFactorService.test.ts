/**
 * TwoFactorService Unit Tests
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';

// ─── Mock all external dependencies BEFORE importing the module under test ───

const mockUserFindUnique = jest.fn() as jest.Mock<any>;
const mockUserUpdate = jest.fn() as jest.Mock<any>;

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: {
      findUnique: mockUserFindUnique,
      update: mockUserUpdate,
    },
  })),
}));

const mockGenerateSecret = jest.fn() as jest.Mock<any>;
const mockTotpVerify = jest.fn() as jest.Mock<any>;

jest.mock('speakeasy', () => ({
  default: {
    generateSecret: (...args: unknown[]) => mockGenerateSecret(...args),
    totp: { verify: (...args: unknown[]) => mockTotpVerify(...args) },
  },
  generateSecret: (...args: unknown[]) => mockGenerateSecret(...args),
  totp: { verify: (...args: unknown[]) => mockTotpVerify(...args) },
}));

const mockToDataURL = jest.fn() as jest.Mock<any>;

jest.mock('qrcode', () => ({
  default: { toDataURL: (...args: unknown[]) => mockToDataURL(...args) },
  toDataURL: (...args: unknown[]) => mockToDataURL(...args),
}));

const mockBcryptCompare = jest.fn() as jest.Mock<any>;

jest.mock('bcryptjs', () => ({
  default: { compare: (...args: unknown[]) => mockBcryptCompare(...args) },
  compare: (...args: unknown[]) => mockBcryptCompare(...args),
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

// ─── Import module under test ────────────────────────────────────────────────

import { TwoFactorService } from '../../../services/TwoFactorService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

const createMockPrisma = () => ({
  user: {
    findUnique: mockUserFindUnique,
    update: mockUserUpdate,
  },
});

const createBaseUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  password: 'hashed-password',
  twoFactorEnabledAt: null,
  twoFactorSecret: null,
  twoFactorPendingSecret: null,
  twoFactorBackupCodes: [] as string[],
  ...overrides,
});

const createEnabledUser = (overrides: Record<string, unknown> = {}) =>
  createBaseUser({
    twoFactorEnabledAt: new Date('2024-01-01'),
    twoFactorSecret: 'BASE32SECRET',
    twoFactorBackupCodes: ['hashed-backup-1', 'hashed-backup-2'],
    ...overrides,
  });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TwoFactorService', () => {
  let service: TwoFactorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TwoFactorService(createMockPrisma() as any);

    mockGenerateSecret.mockReturnValue({
      base32: 'BASE32SECRET',
      otpauth_url: 'otpauth://totp/Meeshy:test@example.com?secret=BASE32SECRET',
    });
    mockToDataURL.mockResolvedValue('data:image/png;base64,abc123');
    mockTotpVerify.mockReturnValue(true);
    mockBcryptCompare.mockResolvedValue(true);
    mockUserFindUnique.mockResolvedValue(null);
    mockUserUpdate.mockResolvedValue({});
  });

  // ══════════════════════════════════════════════════════════════════════════
  // setup()
  // ══════════════════════════════════════════════════════════════════════════

  describe('setup()', () => {
    it('returns error when user is not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const result = await service.setup('unknown-user');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Utilisateur non trouvé');
    });

    it('returns error when 2FA is already enabled', async () => {
      mockUserFindUnique.mockResolvedValue(createEnabledUser());

      const result = await service.setup('user-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('2FA est déjà activé sur ce compte');
    });

    it('returns secret and QR code URL on success', async () => {
      mockUserFindUnique.mockResolvedValue(createBaseUser());

      const result = await service.setup('user-123');

      expect(result.success).toBe(true);
      expect(result.secret).toBe('BASE32SECRET');
      expect(result.qrCodeDataUrl).toBe('data:image/png;base64,abc123');
      expect(result.otpauthUrl).toContain('otpauth://');
    });

    it('stores pending secret in DB on success', async () => {
      mockUserFindUnique.mockResolvedValue(createBaseUser());

      await service.setup('user-123');

      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { twoFactorPendingSecret: 'BASE32SECRET' },
      });
    });

    it('passes email in secret name', async () => {
      const user = createBaseUser({ email: 'alice@example.com' });
      mockUserFindUnique.mockResolvedValue(user);

      await service.setup('user-123');

      expect(mockGenerateSecret).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Meeshy:alice@example.com' })
      );
    });

    it('returns error when DB findUnique throws', async () => {
      mockUserFindUnique.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.setup('user-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur lors de la configuration du 2FA');
    });

    it('returns error when QRCode.toDataURL throws', async () => {
      mockUserFindUnique.mockResolvedValue(createBaseUser());
      mockToDataURL.mockRejectedValue(new Error('QR generation failed'));

      const result = await service.setup('user-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur lors de la configuration du 2FA');
    });

    it('returns error when DB update throws', async () => {
      mockUserFindUnique.mockResolvedValue(createBaseUser());
      mockUserUpdate.mockRejectedValue(new Error('write failed'));

      const result = await service.setup('user-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur lors de la configuration du 2FA');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // enable()
  // ══════════════════════════════════════════════════════════════════════════

  describe('enable()', () => {
    it('returns error when user is not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const result = await service.enable('unknown', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Utilisateur non trouvé');
    });

    it('returns error when 2FA is already enabled', async () => {
      mockUserFindUnique.mockResolvedValue(
        createEnabledUser({ twoFactorPendingSecret: null })
      );

      const result = await service.enable('user-123', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('2FA est déjà activé sur ce compte');
    });

    it('returns error when no pending secret (setup not initiated)', async () => {
      mockUserFindUnique.mockResolvedValue(
        createBaseUser({ twoFactorPendingSecret: null })
      );

      const result = await service.enable('user-123', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toContain('configuration');
    });

    it('returns error when TOTP code is invalid', async () => {
      mockUserFindUnique.mockResolvedValue(
        createBaseUser({ twoFactorPendingSecret: 'BASE32SECRET' })
      );
      mockTotpVerify.mockReturnValue(false);

      const result = await service.enable('user-123', '000000');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Code invalide');
    });

    it('returns 10 backup codes on success', async () => {
      mockUserFindUnique.mockResolvedValue(
        createBaseUser({ twoFactorPendingSecret: 'BASE32SECRET' })
      );
      mockTotpVerify.mockReturnValue(true);

      const result = await service.enable('user-123', '123456');

      expect(result.success).toBe(true);
      expect(result.backupCodes).toHaveLength(10);
    });

    it('backup codes are formatted as XXXX-XXXX', async () => {
      mockUserFindUnique.mockResolvedValue(
        createBaseUser({ twoFactorPendingSecret: 'BASE32SECRET' })
      );
      mockTotpVerify.mockReturnValue(true);

      const result = await service.enable('user-123', '123456');

      for (const code of result.backupCodes!) {
        expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      }
    });

    it('activates 2FA and clears pending secret in DB', async () => {
      mockUserFindUnique.mockResolvedValue(
        createBaseUser({ twoFactorPendingSecret: 'BASE32SECRET' })
      );
      mockTotpVerify.mockReturnValue(true);

      await service.enable('user-123', '123456');

      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          twoFactorSecret: 'BASE32SECRET',
          twoFactorPendingSecret: null,
          twoFactorEnabledAt: expect.any(Date),
          twoFactorBackupCodes: expect.any(Array),
        }),
      });
    });

    it('returns error when DB update throws', async () => {
      mockUserFindUnique.mockResolvedValue(
        createBaseUser({ twoFactorPendingSecret: 'BASE32SECRET' })
      );
      mockTotpVerify.mockReturnValue(true);
      mockUserUpdate.mockRejectedValue(new Error('DB error'));

      const result = await service.enable('user-123', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toContain('activation');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // disable()
  // ══════════════════════════════════════════════════════════════════════════

  describe('disable()', () => {
    it('returns error when user is not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const result = await service.disable('unknown', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Utilisateur non trouvé');
    });

    it('returns error when 2FA not enabled (twoFactorEnabledAt is null)', async () => {
      mockUserFindUnique.mockResolvedValue(
        createBaseUser({ twoFactorEnabledAt: null, twoFactorSecret: 'SECRET' })
      );

      const result = await service.disable('user-123', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pas activé');
    });

    it('returns error when 2FA not enabled (twoFactorSecret is null)', async () => {
      mockUserFindUnique.mockResolvedValue(
        createBaseUser({ twoFactorEnabledAt: new Date(), twoFactorSecret: null })
      );

      const result = await service.disable('user-123', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pas activé');
    });

    it('returns error when password is wrong', async () => {
      mockUserFindUnique.mockResolvedValue(createEnabledUser());
      mockBcryptCompare.mockResolvedValue(false);

      const result = await service.disable('user-123', 'wrong-password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Mot de passe incorrect');
    });

    it('returns error when 2FA code is provided and invalid', async () => {
      mockUserFindUnique.mockResolvedValue(createEnabledUser());
      mockBcryptCompare.mockResolvedValue(true);
      mockTotpVerify.mockReturnValue(false);

      const result = await service.disable('user-123', 'correct-password', '000000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Code 2FA invalide');
    });

    it('succeeds without 2FA code when password is correct', async () => {
      mockUserFindUnique.mockResolvedValue(createEnabledUser());
      mockBcryptCompare.mockResolvedValue(true);

      const result = await service.disable('user-123', 'correct-password');

      expect(result.success).toBe(true);
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorBackupCodes: [],
          twoFactorEnabledAt: null,
        },
      });
    });

    it('succeeds with valid 2FA code provided', async () => {
      mockUserFindUnique.mockResolvedValue(createEnabledUser());
      mockBcryptCompare.mockResolvedValue(true);
      mockTotpVerify.mockReturnValue(true);

      const result = await service.disable('user-123', 'correct-password', '123456');

      expect(result.success).toBe(true);
    });

    it('returns error when DB update throws', async () => {
      mockUserFindUnique.mockResolvedValue(createEnabledUser());
      mockBcryptCompare.mockResolvedValue(true);
      mockUserUpdate.mockRejectedValue(new Error('DB error'));

      const result = await service.disable('user-123', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('désactivation');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // verify()
  // ══════════════════════════════════════════════════════════════════════════

  describe('verify()', () => {
    it('returns error when user is not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const result = await service.verify('unknown', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Utilisateur non trouvé');
    });

    it('returns error when 2FA not enabled (no enabledAt)', async () => {
      mockUserFindUnique.mockResolvedValue(createBaseUser());

      const result = await service.verify('user-123', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pas activé');
    });

    it('returns error when 2FA not enabled (no secret)', async () => {
      mockUserFindUnique.mockResolvedValue(
        createBaseUser({ twoFactorEnabledAt: new Date(), twoFactorSecret: null })
      );

      const result = await service.verify('user-123', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pas activé');
    });

    it('returns success for valid 6-digit TOTP code', async () => {
      mockUserFindUnique.mockResolvedValue(createEnabledUser());
      mockTotpVerify.mockReturnValue(true);

      const result = await service.verify('user-123', '123456');

      expect(result.success).toBe(true);
      expect(result.usedBackupCode).toBe(false);
    });

    it('returns failure for invalid 6-digit TOTP code', async () => {
      mockUserFindUnique.mockResolvedValue(createEnabledUser());
      mockTotpVerify.mockReturnValue(false);

      const result = await service.verify('user-123', '000000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Code invalide');
    });

    it('returns success for valid 8-char backup code (no dashes)', async () => {
      const plainCode = 'ABCDEFGH';
      const hashed = hashCode(plainCode);
      mockUserFindUnique.mockResolvedValue(
        createEnabledUser({ twoFactorBackupCodes: [hashed] })
      );
      mockTotpVerify.mockReturnValue(false);

      const result = await service.verify('user-123', plainCode);

      expect(result.success).toBe(true);
      expect(result.usedBackupCode).toBe(true);
    });

    it('removes used backup code from the list', async () => {
      const plainCode = 'ABCDEFGH';
      const hashed = hashCode(plainCode);
      const otherHash = hashCode('ZZZZZZZZ');
      mockUserFindUnique.mockResolvedValue(
        createEnabledUser({ twoFactorBackupCodes: [hashed, otherHash] })
      );
      mockTotpVerify.mockReturnValue(false);

      await service.verify('user-123', plainCode);

      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { twoFactorBackupCodes: [otherHash] },
      });
    });

    it('handles backup code with dashes (ABCD-EFGH → strips to ABCDEFGH)', async () => {
      const stripped = 'ABCDEFGH';
      const hashed = hashCode(stripped);
      mockUserFindUnique.mockResolvedValue(
        createEnabledUser({ twoFactorBackupCodes: [hashed] })
      );
      mockTotpVerify.mockReturnValue(false);

      const result = await service.verify('user-123', 'ABCD-EFGH');

      expect(result.success).toBe(true);
      expect(result.usedBackupCode).toBe(true);
    });

    it('returns failure for backup code not in list', async () => {
      mockUserFindUnique.mockResolvedValue(
        createEnabledUser({ twoFactorBackupCodes: [hashCode('ZZZZZZZZ')] })
      );
      mockTotpVerify.mockReturnValue(false);

      const result = await service.verify('user-123', 'ABCDEFGH');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Code invalide');
    });

    it('returns failure for 8-char code when backup list is empty', async () => {
      mockUserFindUnique.mockResolvedValue(
        createEnabledUser({ twoFactorBackupCodes: [] })
      );
      mockTotpVerify.mockReturnValue(false);

      const result = await service.verify('user-123', 'ABCDEFGH');

      expect(result.success).toBe(false);
    });

    it('returns failure for code that is neither 6-digit TOTP nor 8-char backup format', async () => {
      mockUserFindUnique.mockResolvedValue(createEnabledUser());
      mockTotpVerify.mockReturnValue(false);

      const result = await service.verify('user-123', 'bad');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Code invalide');
    });

    it('returns error when DB throws', async () => {
      mockUserFindUnique.mockRejectedValue(new Error('DB error'));

      const result = await service.verify('user-123', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toContain('vérification');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getStatus()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getStatus()', () => {
    it('returns disabled status with 0 codes when user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const result = await service.getStatus('unknown');

      expect(result.enabled).toBe(false);
      expect(result.enabledAt).toBeNull();
      expect(result.hasBackupCodes).toBe(false);
      expect(result.backupCodesCount).toBe(0);
    });

    it('returns disabled status when 2FA is not enabled', async () => {
      mockUserFindUnique.mockResolvedValue(
        createBaseUser({ twoFactorEnabledAt: null, twoFactorBackupCodes: [] })
      );

      const result = await service.getStatus('user-123');

      expect(result.enabled).toBe(false);
      expect(result.enabledAt).toBeNull();
      expect(result.hasBackupCodes).toBe(false);
      expect(result.backupCodesCount).toBe(0);
    });

    it('returns enabled status with correct backup code count', async () => {
      const enabledAt = new Date('2024-06-01');
      mockUserFindUnique.mockResolvedValue(
        createEnabledUser({
          twoFactorEnabledAt: enabledAt,
          twoFactorBackupCodes: ['h1', 'h2', 'h3'],
        })
      );

      const result = await service.getStatus('user-123');

      expect(result.enabled).toBe(true);
      expect(result.enabledAt).toEqual(enabledAt);
      expect(result.hasBackupCodes).toBe(true);
      expect(result.backupCodesCount).toBe(3);
    });

    it('handles null twoFactorBackupCodes gracefully', async () => {
      mockUserFindUnique.mockResolvedValue(
        createEnabledUser({ twoFactorBackupCodes: null })
      );

      const result = await service.getStatus('user-123');

      expect(result.backupCodesCount).toBe(0);
      expect(result.hasBackupCodes).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // regenerateBackupCodes()
  // ══════════════════════════════════════════════════════════════════════════

  describe('regenerateBackupCodes()', () => {
    it('returns error when verify fails (user not found)', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const result = await service.regenerateBackupCodes('unknown', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Utilisateur non trouvé');
    });

    it('returns error when verify fails (2FA not enabled)', async () => {
      mockUserFindUnique.mockResolvedValue(createBaseUser());

      const result = await service.regenerateBackupCodes('user-123', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pas activé');
    });

    it('returns error when backup code is used (not TOTP)', async () => {
      const plainCode = 'ABCDEFGH';
      const hashed = hashCode(plainCode);
      const user = createEnabledUser({ twoFactorBackupCodes: [hashed] });
      // verify() gets called once — backup code path
      mockUserFindUnique.mockResolvedValue(user);
      mockTotpVerify.mockReturnValue(false);
      mockUserUpdate.mockResolvedValue({});

      const result = await service.regenerateBackupCodes('user-123', plainCode);

      expect(result.success).toBe(false);
      expect(result.error).toContain('application');
    });

    it('regenerates 10 codes when TOTP code is valid', async () => {
      const user = createEnabledUser();
      mockUserFindUnique.mockResolvedValue(user);
      mockTotpVerify.mockReturnValue(true);

      const result = await service.regenerateBackupCodes('user-123', '123456');

      expect(result.success).toBe(true);
      expect(result.backupCodes).toHaveLength(10);
    });

    it('updates DB with hashed backup codes', async () => {
      const user = createEnabledUser();
      mockUserFindUnique.mockResolvedValue(user);
      mockTotpVerify.mockReturnValue(true);

      await service.regenerateBackupCodes('user-123', '123456');

      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            twoFactorBackupCodes: expect.any(Array),
          }),
        })
      );
    });

    it('returns error when DB update throws after verify succeeds', async () => {
      const user = createEnabledUser();
      mockUserFindUnique.mockResolvedValue(user);
      mockTotpVerify.mockReturnValue(true);
      mockUserUpdate.mockRejectedValue(new Error('DB error'));

      const result = await service.regenerateBackupCodes('user-123', '123456');

      expect(result.success).toBe(false);
      expect(result.error).toContain('régénération');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // cancelSetup()
  // ══════════════════════════════════════════════════════════════════════════

  describe('cancelSetup()', () => {
    it('clears the pending secret and returns success', async () => {
      mockUserUpdate.mockResolvedValue({});

      const result = await service.cancelSetup('user-123');

      expect(result.success).toBe(true);
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { twoFactorPendingSecret: null },
      });
    });

    it('returns error when DB update throws', async () => {
      mockUserUpdate.mockRejectedValue(new Error('DB error'));

      const result = await service.cancelSetup('user-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('annulation');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // isEnabled()
  // ══════════════════════════════════════════════════════════════════════════

  describe('isEnabled()', () => {
    it('returns false when user is not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const result = await service.isEnabled('unknown');

      expect(result).toBe(false);
    });

    it('returns true when twoFactorEnabledAt is set', async () => {
      mockUserFindUnique.mockResolvedValue({ twoFactorEnabledAt: new Date() });

      const result = await service.isEnabled('user-123');

      expect(result).toBe(true);
    });

    it('returns false when twoFactorEnabledAt is null', async () => {
      mockUserFindUnique.mockResolvedValue({ twoFactorEnabledAt: null });

      const result = await service.isEnabled('user-123');

      expect(result).toBe(false);
    });
  });
});
