/**
 * requireStrongSecret() / getJwtSecret() — garde de démarrage partagée (#3623).
 *
 * Reprend le patron de `TURNCredentialService.test.ts` (`withEnv()` +
 * `describe('… — production security guard')`) : c'est le modèle explicitement
 * cité par l'issue comme référence à copier.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { requireStrongSecret, getJwtSecret, JWT_SECRET_DEV_DEFAULT } from '../secrets';
import { logger } from '../logger';

type MockFn = jest.Mock<any>;
const warnMock = logger.warn as MockFn;

const ENV_KEYS = ['NODE_ENV', 'JWT_SECRET', 'SOME_SECRET'] as const;

const withEnv = <T>(overrides: Record<string, string | undefined>, run: () => T): T => {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
};

const STRONG_SECRET = 'a9f2c3e4b5d6a7f8c9e0b1d2a3f4c5e6';

describe('requireStrongSecret — production security guard', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.clearAllMocks());

  const resolve = () =>
    requireStrongSecret({ envVar: 'SOME_SECRET', insecureDefault: 'weak-default', minLength: 32 });

  it('throws when NODE_ENV=production and the secret is unset', () => {
    withEnv({ NODE_ENV: 'production', SOME_SECRET: undefined }, () => {
      expect(resolve).toThrow('[SECURITY]');
    });
  });

  it('throws when NODE_ENV=production and the secret equals the insecure default', () => {
    withEnv({ NODE_ENV: 'production', SOME_SECRET: 'weak-default' }, () => {
      expect(resolve).toThrow('[SECURITY]');
    });
  });

  it('throws when NODE_ENV=staging and the secret is shorter than minLength', () => {
    withEnv({ NODE_ENV: 'staging', SOME_SECRET: 'too-short' }, () => {
      expect(resolve).toThrow('32 characters');
    });
  });

  it('does NOT throw in production with a strong custom secret, and returns it', () => {
    withEnv({ NODE_ENV: 'production', SOME_SECRET: STRONG_SECRET }, () => {
      expect(resolve()).toBe(STRONG_SECRET);
    });
  });

  it('does NOT throw in dev when unset, and warns instead', () => {
    withEnv({ NODE_ENV: 'development', SOME_SECRET: undefined }, () => {
      expect(resolve()).toBe('weak-default');
    });
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('SOME_SECRET'));
  });

  it('does NOT throw in test environment when unset', () => {
    withEnv({ NODE_ENV: 'test', SOME_SECRET: undefined }, () => {
      expect(resolve()).toBe('weak-default');
    });
  });

  it('normalizes NODE_ENV case/whitespace before deciding (mixed-case "Production")', () => {
    withEnv({ NODE_ENV: 'Production', SOME_SECRET: undefined }, () => {
      expect(resolve).toThrow('[SECURITY]');
    });
  });

  it('normalizes NODE_ENV case/whitespace before deciding (" staging ")', () => {
    withEnv({ NODE_ENV: ' staging ', SOME_SECRET: undefined }, () => {
      expect(resolve).toThrow('[SECURITY]');
    });
  });
});

describe('getJwtSecret — single source of truth for JWT_SECRET (#3623)', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.clearAllMocks());

  it('throws in production without JWT_SECRET', () => {
    withEnv({ NODE_ENV: 'production', JWT_SECRET: undefined }, () => {
      expect(() => getJwtSecret()).toThrow('[SECURITY]');
    });
  });

  it('falls back to the SAME dev default every call — no divergent second default', () => {
    withEnv({ NODE_ENV: 'development', JWT_SECRET: undefined }, () => {
      expect(getJwtSecret()).toBe(JWT_SECRET_DEV_DEFAULT);
      expect(getJwtSecret()).toBe(JWT_SECRET_DEV_DEFAULT);
    });
  });

  it('returns a strong custom JWT_SECRET unchanged in production', () => {
    withEnv({ NODE_ENV: 'production', JWT_SECRET: STRONG_SECRET }, () => {
      expect(getJwtSecret()).toBe(STRONG_SECRET);
    });
  });
});
