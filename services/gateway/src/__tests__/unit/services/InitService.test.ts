/**
 * Unit tests for InitService.shouldInitialize.
 * Covers: production guard for FORCE_DB_RESET, force-reset flag, all entities
 * present (no init needed), any missing entity (init needed), DB error (init needed).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

// Mock AuthService (required by InitService constructor)
jest.mock('../../../services/AuthService', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    register: jest.fn<any>().mockResolvedValue({ user: { id: 'user-1', username: 'test', displayName: 'Test' } }),
  })),
}));

import { InitService } from '../../../services/InitService';

// ─── Factories ────────────────────────────────────────────────────────────────

const GLOBAL_CONV = { id: 'conv-global', identifier: 'meeshy' };
const MEESHY_USER = { id: 'user-meeshy', username: 'meeshy' };
const ADMIN_USER = { id: 'user-admin', username: 'admin' };
const ATABETH_USER = { id: 'user-atabeth', username: 'atabeth' };
const MEMBER_ENTRY = { id: 'part-1' };

function makePrisma(overrides: {
  globalConv?: any;
  meeshyUser?: any;
  adminUser?: any;
  atabethUser?: any;
  bigbossMember?: any;
  adminMember?: any;
} = {}) {
  const {
    globalConv = GLOBAL_CONV,
    meeshyUser = MEESHY_USER,
    adminUser = ADMIN_USER,
    atabethUser = ATABETH_USER,
    bigbossMember = MEMBER_ENTRY,
    adminMember = MEMBER_ENTRY,
  } = overrides;

  let findFirstCallCount = 0;
  // shouldInitialize calls conversation.findFirst and user.findFirst (3x) and participant.findFirst (2x)
  // We track by type — simplest: use separate mocks per model
  return {
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(globalConv),
      create: jest.fn<any>().mockResolvedValue(globalConv),
    },
    user: {
      findFirst: jest.fn<any>()
        .mockResolvedValueOnce(meeshyUser)
        .mockResolvedValueOnce(adminUser)
        .mockResolvedValueOnce(atabethUser)
        .mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
      create: jest.fn<any>().mockResolvedValue({}),
    },
    participant: {
      findFirst: jest.fn<any>()
        .mockResolvedValueOnce(bigbossMember)
        .mockResolvedValueOnce(adminMember)
        .mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({}),
      createMany: jest.fn<any>().mockResolvedValue({}),
    },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({}),
  };
}

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

// ─── shouldInitialize ─────────────────────────────────────────────────────────

describe('InitService.shouldInitialize', () => {
  it('returns false when FORCE_DB_RESET=true in production (safety guard)', async () => {
    process.env.FORCE_DB_RESET = 'true';
    process.env.NODE_ENV = 'production';
    const sut = new InitService(makePrisma() as any);

    const result = await sut.shouldInitialize();

    expect(result).toBe(false);
  });

  it('returns true immediately when FORCE_DB_RESET=true and not in production', async () => {
    process.env.FORCE_DB_RESET = 'true';
    process.env.NODE_ENV = 'development';
    const sut = new InitService(makePrisma() as any);

    const result = await sut.shouldInitialize();

    expect(result).toBe(true);
  });

  it('returns false when all required entities already exist', async () => {
    delete process.env.FORCE_DB_RESET;
    process.env.NODE_ENV = 'test';
    const sut = new InitService(makePrisma() as any);

    const result = await sut.shouldInitialize();

    expect(result).toBe(false);
  });

  it('returns true when the global conversation is missing', async () => {
    delete process.env.FORCE_DB_RESET;
    const sut = new InitService(makePrisma({ globalConv: null }) as any);

    const result = await sut.shouldInitialize();

    expect(result).toBe(true);
  });

  it('returns true when the meeshy (bigboss) user is missing', async () => {
    delete process.env.FORCE_DB_RESET;
    const sut = new InitService(makePrisma({ meeshyUser: null }) as any);

    const result = await sut.shouldInitialize();

    expect(result).toBe(true);
  });

  it('returns true when the admin user is missing', async () => {
    delete process.env.FORCE_DB_RESET;
    const sut = new InitService(makePrisma({ adminUser: null }) as any);

    const result = await sut.shouldInitialize();

    expect(result).toBe(true);
  });

  it('returns true when a user membership entry is missing', async () => {
    delete process.env.FORCE_DB_RESET;
    const sut = new InitService(makePrisma({ bigbossMember: null }) as any);

    const result = await sut.shouldInitialize();

    expect(result).toBe(true);
  });

  it('returns true when a DB error occurs during the check', async () => {
    delete process.env.FORCE_DB_RESET;
    const prisma = makePrisma();
    (prisma.conversation.findFirst as jest.Mock<any>).mockRejectedValue(new Error('DB down'));
    const sut = new InitService(prisma as any);

    const result = await sut.shouldInitialize();

    expect(result).toBe(true);
  });
});

// ─── ensurePostGeoIndex ───────────────────────────────────────────────────────
//
// L'index `2dsphere` de `Post.geoPoint` vivait dans `initializeDatabase()`,
// que `server.ts` ne lance que si `shouldInitialize()` est vrai — c'est-à-dire
// sur une base VIDE. Une base déjà peuplée ne le recevait donc jamais :
// `/posts/nearby` et `/posts/nearby/density` rendaient 500 en production
// (`$geoNear requires a 2d or 2dsphere index, but none were found`,
// 2026-08-25). L'index est un invariant de CHAQUE boot, pas du premier.

describe('InitService.ensurePostGeoIndex', () => {
  const GEO_INDEX_COMMAND = {
    createIndexes: 'Post',
    indexes: [{ key: { geoPoint: '2dsphere' }, name: 'Post_geoPoint_2dsphere' }],
  };

  it('creates the 2dsphere index on Post.geoPoint on an already-initialized database', async () => {
    delete process.env.FORCE_DB_RESET;
    const prisma = makePrisma();
    const sut = new InitService(prisma as any);
    expect(await sut.shouldInitialize()).toBe(false);

    await sut.ensurePostGeoIndex();

    expect(prisma.$runCommandRaw).toHaveBeenCalledWith(GEO_INDEX_COMMAND);
  });

  it('rethrows when MongoDB refuses the index — the boot must not continue on a silent miss', async () => {
    const prisma = makePrisma();
    (prisma.$runCommandRaw as jest.Mock<any>).mockRejectedValue(new Error('not authorized on meeshy'));
    const sut = new InitService(prisma as any);

    await expect(sut.ensurePostGeoIndex()).rejects.toThrow('not authorized on meeshy');
  });
});
