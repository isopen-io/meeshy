/**
 * #17012 — rejuger la séance d'une paire depuis une route ne fait jamais échouer le geste
 * (blocage, baisse, retrait) : une panne du cache est rapportée, sans charge.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: () => Promise.reject(new Error('redis down')), set: jest.fn(), del: jest.fn() }),
}));

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { rejudgeTogetherAfter } from '../../../../services/together/togetherDeps';

describe('rejudgeTogetherAfter', () => {
  it('une panne du cache est rapportée, et le geste continue', async () => {
    const report = jest.fn();
    await expect(
      rejudgeTogetherAfter({ prisma: {} as PrismaClient, io: undefined, report }, { userA: 'a', userB: 'b' }),
    ).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'redis down' }));
  });
});
