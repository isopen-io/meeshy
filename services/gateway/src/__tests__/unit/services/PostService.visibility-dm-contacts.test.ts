/**
 * Tests — PostService.buildVisibilityFilter : l'audience FRIENDS/EXCEPT inclut
 * les contacts DM (pas seulement les amis stricts), alignée sur le feed.
 *
 * Régression : un contact DM (non-ami strict) pouvait VOIR la story de l'auteur
 * via son feed, mais son `POST /view` était rejeté par un filtre "amis stricts"
 * → aucun `PostView` créé, aucun `story:viewed` émis → l'auteur ne voyait jamais
 * cette vue (ni en temps réel ni après relance). Le fix aligne l'audience de
 * `PostService.buildVisibilityFilter` sur `PostFeedService` (friends ∪ DM).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));

import { PostService } from '../../../services/PostService';

type OrFilter = { OR: Array<Record<string, unknown>> };

const buildPrisma = () => ({
  participant: {
    findMany: jest.fn<(arg?: unknown) => Promise<unknown>>()
      // 1er appel : conversations directes du viewer
      .mockResolvedValueOnce([{ conversationId: 'conv-1' }])
      // 2e appel : autres membres actifs de ces conversations (le contact DM)
      .mockResolvedValueOnce([{ userId: 'dm-contact-1' }]),
  },
  friendRequest: {
    findMany: jest.fn<(arg?: unknown) => Promise<unknown>>()
      .mockResolvedValue([{ senderId: 'viewer-1', receiverId: 'friend-1' }]),
  },
  communityMember: {
    findMany: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue([]),
  },
});

const friendsClause = (filter: OrFilter) =>
  filter.OR.find((c) => c.visibility === 'FRIENDS') as
    | { authorId: { in: string[] } }
    | undefined;

describe('PostService.buildVisibilityFilter — audience friends ∪ contacts DM', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inclut le contact DM ET l’ami dans l’audience FRIENDS', async () => {
    const prisma = buildPrisma();
    const svc = new PostService(prisma as never);

    const filter = await (
      svc as unknown as { buildVisibilityFilter: (id: string) => Promise<OrFilter> }
    ).buildVisibilityFilter('viewer-1');

    const audience = friendsClause(filter)?.authorId.in ?? [];
    expect(audience).toContain('friend-1');
    expect(audience).toContain('dm-contact-1');
  });

  it('anonyme (viewer indéfini) → PUBLIC uniquement, aucune requête sociale', async () => {
    const prisma = buildPrisma();
    const svc = new PostService(prisma as never);

    const filter = await (
      svc as unknown as { buildVisibilityFilter: (id?: string) => Promise<Record<string, unknown>> }
    ).buildVisibilityFilter(undefined);

    expect(filter).toEqual({ visibility: 'PUBLIC' });
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });
});
