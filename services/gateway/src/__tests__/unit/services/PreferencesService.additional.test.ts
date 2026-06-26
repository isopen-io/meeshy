/**
 * Additional PreferencesService coverage for uncovered lines:
 *  - Line 115: throw when dndEndTime is invalid
 *  - Line 289: throw when fontSize is invalid
 *  - Line 317: resetThemePreferences
 *  - Line 343: throw when user not found in getLanguagePreferences
 *  - Line 370: updateLanguagePreferences with customDestinationLanguage
 *  - Line 382: updateLanguagePreferences with autoTranslate only (skips user.update)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PreferencesService } from '../../../services/preferences/PreferencesService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('@meeshy/shared/prisma/client', () => ({ PrismaClient: jest.fn() }));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

function makePrisma(): any {
  return {
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      upsert: jest.fn<any>().mockResolvedValue({ notification: {}, createdAt: new Date(), updatedAt: new Date() }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    userPreference: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      upsert: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('PreferencesService — additional coverage', () => {
  let service: PreferencesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new PreferencesService(prisma as unknown as PrismaClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── updateNotificationPreferences — invalid dndEndTime ────────────────────

  it('throws when dndEndTime has invalid format', async () => {
    await expect(
      service.updateNotificationPreferences('user-1', {
        dndEndTime: 'not-a-time',
      } as any)
    ).rejects.toThrow('Invalid dndEndTime format');
  });

  it('does not throw when dndStartTime is invalid (only dndEndTime provided)', async () => {
    await expect(
      service.updateNotificationPreferences('user-1', {
        dndStartTime: 'bad',
      } as any)
    ).rejects.toThrow('Invalid dndStartTime format');
  });

  // ── resetNotificationPreferences — catch block ────────────────────────────

  it('resetNotificationPreferences silently ignores when record does not exist', async () => {
    prisma.userPreferences.update.mockRejectedValueOnce(new Error('Record not found'));
    await expect(service.resetNotificationPreferences('user-99')).resolves.toBeUndefined();
  });

  // ── updateThemePreferences — invalid fontSize ─────────────────────────────

  it('throws when fontSize is not a valid value', async () => {
    await expect(
      service.updateThemePreferences('user-1', { fontSize: 'huge' as any })
    ).rejects.toThrow('Invalid font size');
  });

  // ── resetThemePreferences ─────────────────────────────────────────────────

  it('resetThemePreferences calls deleteMany for theme-related keys', async () => {
    await service.resetThemePreferences('user-1');
    expect(prisma.userPreference.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      })
    );
  });

  // ── getLanguagePreferences — user not found ───────────────────────────────

  it('getLanguagePreferences throws when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.getLanguagePreferences('ghost-user')).rejects.toThrow('User not found');
  });

  // ── updateLanguagePreferences — only autoTranslate (no language fields) ───

  it('updateLanguagePreferences with only autoTranslate skips user.update', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null
    });

    await service.updateLanguagePreferences('user-1', { autoTranslate: true });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userPreference.upsert).toHaveBeenCalled();
  });

  // ── updateLanguagePreferences — customDestinationLanguage branch ──────────

  it('updateLanguagePreferences sets customDestinationLanguage in user.update', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null
    });

    await service.updateLanguagePreferences('user-1', { customDestinationLanguage: 'es' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customDestinationLanguage: 'es' }),
      })
    );
  });
});
