/**
 * Témoin de #4277 (critère 5) — `community-member-presence.ts` a déménagé de
 * `routes/` vers `services/` : ce module n'enregistre aucune route. Ce
 * fichier prouve DEUX choses : (1) l'implémentation RÉELLE, à sa nouvelle
 * adresse, résout bien la présence par viewer ; (2) l'ancienne adresse
 * (`routes/community-member-presence.ts`) reste utilisable — coquille de
 * ré-export — pour l'importeur hors territoire (`routes/communities/search.ts`)
 * qui n'a pas encore été repointé.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const mockResolveForTargets = jest.fn<any>();

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn(() => ({
    resolveForTargets: (...args: unknown[]) => mockResolveForTargets(...args),
  })),
}));

jest.mock('../../../routes/users/presence-gate', () => ({
  viewerFromRequest: jest.fn(() => ({ kind: 'anonymous' })),
}));

function fakeFastify(): FastifyInstance {
  return { prisma: {} } as unknown as FastifyInstance;
}

function fakeRequest(): FastifyRequest {
  return {} as FastifyRequest;
}

describe('services/community-member-presence.ts — nouvelle adresse (#4277)', () => {
  it('resolveCommunityMemberPresence agrège les ids de membres de TOUTES les communautés et délègue au viewer résolu', async () => {
    const { resolveCommunityMemberPresence } = await import('../../../services/community-member-presence');
    mockResolveForTargets.mockResolvedValueOnce(new Map([['u1', { showOnline: true }]]));

    const result = await resolveCommunityMemberPresence(fakeFastify(), fakeRequest(), [
      { id: 'c1', members: [{ user: { id: 'u1', isOnline: true } }, { user: null }] },
      { id: 'c2', members: [{ user: { id: 'u1', isOnline: true } }] }, // id dupliqué, dédupliqué par le Set
    ]);

    expect(mockResolveForTargets).toHaveBeenCalledWith({ kind: 'anonymous' }, ['u1']);
    expect(result.get('u1')).toEqual({ showOnline: true });
  });

  it('rend une Map vide sans appeler le service quand aucune communauté ne porte de membre identifiable', async () => {
    const { resolveCommunityMemberPresence } = await import('../../../services/community-member-presence');
    mockResolveForTargets.mockClear();

    const result = await resolveCommunityMemberPresence(fakeFastify(), fakeRequest(), [
      { id: 'c1', members: [] },
    ]);

    expect(result.size).toBe(0);
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });
});

describe('routes/community-member-presence.ts — coquille de ré-export (#4277)', () => {
  it("réexporte EXACTEMENT la même fonction que services/community-member-presence.ts", async () => {
    const fromRoutes = await import('../../../routes/community-member-presence');
    const fromServices = await import('../../../services/community-member-presence');

    expect(fromRoutes.resolveCommunityMemberPresence).toBe(fromServices.resolveCommunityMemberPresence);
  });
});
