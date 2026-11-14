/**
 * #18104 — le balayage horaire est la reprise durable d'une fermeture de liens
 * perdue (#16712) : il retrouve le salon vivant d'une communauté privée dont le
 * créateur est sorti sans héritier inscrit, ferme et marque ses liens, puis la
 * reprise des révocations différées fait sortir ses invités — dans la même passe.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

type PendingRun = { readonly shareLinkId: string; readonly pendingSince: Date };
const runPendingGuestRevocation = jest.fn<(params: PendingRun) => Promise<boolean>>(async () => true);
jest.mock('../../socketio/closeShareLinkRevokingGuests', () => ({
  runPendingGuestRevocation: (params: PendingRun) => runPendingGuestRevocation(params),
}));

import { ExpiredShareLinksCleanupService } from '../ExpiredShareLinksCleanupService';

const NOW = new Date('2026-11-14T02:00:00Z');
const COMMUNITY = '507f1f77bcf86cd799439044';
const SALON = '507f1f77bcf86cd7994390a1';
const LINK = '507f1f77bcf86cd7994390c1';

type Link = { id: string; conversationId: string; isActive: boolean; guestRevocationPendingAt: Date | null };

function buildService(creatorStillThere: boolean) {
  const links: Link[] = [{ id: LINK, conversationId: SALON, isActive: true, guestRevocationPendingAt: null }];
  const creators = [
    { conversationId: SALON, role: 'creator', isActive: false, userId: 'u-parti' },
    ...(creatorStillThere ? [{ conversationId: SALON, role: 'creator', isActive: true, userId: 'u-heritier' }] : []),
  ];
  const prisma = {
    community: { findMany: jest.fn(async () => [{ id: COMMUNITY }]) },
    conversation: { findMany: jest.fn(async () => [{ id: SALON }]) },
    participant: {
      findMany: jest.fn(async () => creators),
      groupBy: jest.fn(async () => []),
    },
    conversationShareLink: {
      findMany: jest.fn(async (args: { where: Record<string, unknown> }) => {
        if ('guestRevocationPendingAt' in args.where) {
          return links.filter((l) => l.guestRevocationPendingAt).map((l) => ({ id: l.id, guestRevocationPendingAt: l.guestRevocationPendingAt }));
        }
        if ('expiresAt' in args.where) return [];
        return links.filter((l) => l.isActive || !('isActive' in args.where)).map((l) => ({ id: l.id, conversationId: l.conversationId }));
      }),
      updateMany: jest.fn(async (args: { data: { isActive: boolean; guestRevocationPendingAt: Date } }) => {
        links.forEach((l) => { l.isActive = args.data.isActive; l.guestRevocationPendingAt = args.data.guestRevocationPendingAt; });
        return { count: links.length };
      }),
    },
  } as unknown as PrismaClient;
  return { service: new ExpiredShareLinksCleanupService(prisma, { now: () => NOW }), links };
}

describe('le balayage horaire reprend un salon privé resté sans créateur (#18104)', () => {
  it('ferme et marque ses liens, puis révoque leurs invités dans la même passe', async () => {
    runPendingGuestRevocation.mockClear();
    const { service, links } = buildService(false);

    await service.cleanup();

    expect(links[0]).toEqual(expect.objectContaining({ isActive: false, guestRevocationPendingAt: NOW }));
    expect(runPendingGuestRevocation).toHaveBeenCalledWith(expect.objectContaining({ shareLinkId: LINK, pendingSince: NOW }));
  });

  it('ne touche pas un salon qu’un héritier inscrit gouverne', async () => {
    runPendingGuestRevocation.mockClear();
    const { service, links } = buildService(true);

    await service.cleanup();

    expect(links[0].isActive).toBe(true);
    expect(runPendingGuestRevocation).not.toHaveBeenCalled();
  });
});
