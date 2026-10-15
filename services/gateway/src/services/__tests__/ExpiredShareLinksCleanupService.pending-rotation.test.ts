/**
 * #10492 — la reprise des révocations différées était triée par date et
 * bornée à une fournée : une fournée entière de liens en échec permanent
 * affamait tous les plus récents. Elle tourne désormais : une fournée saturée
 * laisse son curseur, la passe suivante repart après lui.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

type PendingRun = { readonly shareLinkId: string; readonly pendingSince: Date };
const runPendingGuestRevocation = jest.fn<(params: PendingRun) => Promise<boolean>>();
jest.mock('../../socketio/closeShareLinkRevokingGuests', () => ({
  runPendingGuestRevocation: (params: PendingRun) => runPendingGuestRevocation(params),
}));

import { ExpiredShareLinksCleanupService } from '../ExpiredShareLinksCleanupService';

const MARK = new Date('2026-10-13T09:30:00Z');
const linkId = (n: number) => `507f1f77bcf86cd7994390${String(n).padStart(2, '0')}`;

type PendingWhere = {
  readonly guestRevocationPendingAt?: unknown;
  readonly expiresAt?: unknown;
  readonly id?: { readonly gt?: string; readonly lte?: string };
};
type PendingQuery = { readonly where: PendingWhere; readonly take?: number };

function buildService(pendingIds: string[], batchSize: number) {
  const marked = new Set(pendingIds);
  const findMany = jest.fn(async (args: PendingQuery) => {
    if (!('guestRevocationPendingAt' in args.where)) return [];
    const { gt, lte } = args.where.id ?? {};
    return [...marked]
      .sort()
      .filter((id) => (gt === undefined || id > gt) && (lte === undefined || id <= lte))
      .slice(0, args.take)
      .map((id) => ({ id, guestRevocationPendingAt: MARK }));
  });
  const prisma = {
    conversationShareLink: { findMany },
    participant: { groupBy: jest.fn(async (_args: unknown) => []) },
  } as unknown as PrismaClient;
  return { service: new ExpiredShareLinksCleanupService(prisma, { batchSize }), marked };
}

const attempted = () => runPendingGuestRevocation.mock.calls.map(([params]) => params.shareLinkId);

describe('la reprise des révocations différées ne laisse aucun lien affamé (#10492)', () => {
  beforeEach(() => {
    runPendingGuestRevocation.mockReset();
  });

  it('deux liens en échec permanent n’empêchent pas le troisième d’être repris à la passe suivante', async () => {
    const { service } = buildService([linkId(1), linkId(2), linkId(3)], 2);
    runPendingGuestRevocation.mockResolvedValue(false);

    await service.cleanup();
    expect(attempted()).toEqual([linkId(1), linkId(2)]);

    await service.cleanup();
    expect(attempted().slice(2)).toEqual([linkId(3), linkId(1)]);
  });

  it('chaque lien marqué est tenté en trois passes au plus, quel que soit le nombre d’échecs', async () => {
    const ids = [1, 2, 3, 4, 5].map(linkId);
    const { service } = buildService(ids, 2);
    runPendingGuestRevocation.mockResolvedValue(false);

    await service.cleanup();
    await service.cleanup();
    await service.cleanup();

    expect(new Set(attempted())).toEqual(new Set(ids));
  });

  it('une fournée non saturée reprend tout, à chaque passe', async () => {
    const { service } = buildService([linkId(1), linkId(2)], 5);
    runPendingGuestRevocation.mockResolvedValue(false);

    await service.cleanup();
    await service.cleanup();

    expect(attempted()).toEqual([linkId(1), linkId(2), linkId(1), linkId(2)]);
  });

  it('remet à chaque révocation la marque lue sur sa ligne', async () => {
    const { service } = buildService([linkId(1)], 5);
    runPendingGuestRevocation.mockResolvedValue(true);

    await service.cleanup();

    expect(runPendingGuestRevocation).toHaveBeenCalledWith(expect.objectContaining({ shareLinkId: linkId(1), pendingSince: MARK }));
  });
});
