/**
 * L'oubli des cercles de l'équipe (#16623, audit du 2026-11-08) : quand le rôle ou l'état
 * d'un compte change, ses propres cercles ET ceux de chaque compte de l'équipe sont
 * oubliés — le fil (`feed:friends:`, `feed:circles:`) et l'audience temps réel du social.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

const del = jest.fn(async (_key: string) => undefined);
jest.mock('../../../../services/CacheStore', () => ({ getCacheStore: () => ({ del, get: jest.fn(), set: jest.fn() }) }));

import { forgetTeamCircles } from '../../../../services/relations/relationCaches';

const fastifyWith = (findMany: (args: unknown) => Promise<unknown>) => {
  const invalidateFriendsCache = jest.fn();
  const fastify = {
    prisma: { user: { findMany: jest.fn(findMany) } },
    socialEvents: { invalidateFriendsCache },
    log: { error: jest.fn(), warn: jest.fn() },
  };
  return { fastify: fastify as never, invalidateFriendsCache, findMany: fastify.prisma.user.findMany };
};

describe('forgetTeamCircles', () => {
  it('oublie le compte et chaque compte de l\'équipe, dans le fil et dans le temps réel', async () => {
    del.mockClear();
    const { fastify, invalidateFriendsCache, findMany } = fastifyWith(async () => [{ id: 'mod-1' }, { id: 'admin-2' }]);
    await forgetTeamCircles(fastify, 'demoted');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { role: { in: ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST'] } } }));
    expect(invalidateFriendsCache.mock.calls.map(([id]) => id).sort()).toEqual(['admin-2', 'demoted', 'mod-1']);
    expect(del.mock.calls.map(([key]) => key).sort()).toEqual(
      ['admin-2', 'demoted', 'mod-1'].flatMap((id) => [`feed:circles:${id}`, `feed:friends:${id}`]).sort(),
    );
  });

  it('une lecture de l\'équipe qui échoue oublie au moins le compte lui-même, sans lever', async () => {
    const { fastify, invalidateFriendsCache } = fastifyWith(async () => {
      throw new Error('down');
    });
    await expect(forgetTeamCircles(fastify, 'demoted')).resolves.toBeUndefined();
    expect(invalidateFriendsCache).toHaveBeenCalledWith('demoted');
  });
});
