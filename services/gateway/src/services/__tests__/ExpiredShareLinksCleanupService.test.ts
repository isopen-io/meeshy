import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../utils/logger-enhanced', () => {
  const actual = jest.requireActual('../../utils/logger-enhanced') as {
    enhancedLogger: Record<string, unknown>;
  };
  const child: Record<string, unknown> = {};
  Object.assign(child, {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    child: () => child,
  });
  return {
    ...actual,
    enhancedLogger: { ...actual.enhancedLogger, child: () => child },
  };
});

const revokeShareLinkGuests = jest.fn<(...args: unknown[]) => Promise<string[]>>();
jest.mock('../../socketio/revokeShareLinkGuests', () => ({
  revokeShareLinkGuests: (...args: unknown[]) => revokeShareLinkGuests(...args),
}));

import { enhancedLogger } from '../../utils/logger-enhanced';
import { ExpiredShareLinksCleanupService } from '../ExpiredShareLinksCleanupService';

const sharedLog = enhancedLogger.child({ module: 'test-probe' }) as unknown as {
  warn: jest.Mock;
  info: jest.Mock;
};

/**
 * Un lien de partage qui EXPIRE ne retirait rien à ses invités : seule
 * `POST /anonymous/session/refresh` relisait `expiresAt`, donc l'accès
 * dépendait de si le client de l'invité appelait ce rafraîchissement. Ces
 * tests décrivent le balayage qui manquait — voir #4195 et l'en-tête du
 * service pour la raison de chaque choix.
 */

const NOW = new Date('2026-09-12T12:00:00.000Z');

interface LinkRow {
  id: string;
}

function linkRow(overrides: Partial<LinkRow> = {}): LinkRow {
  return { id: 'link-1', ...overrides };
}

function buildPrisma(rows: LinkRow[]) {
  const conversationShareLink = {
    findMany: jest.fn<(args: unknown) => Promise<LinkRow[]>>().mockResolvedValue(rows),
    update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };
  return {
    conversationShareLink,
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

const buildService = (rows: LinkRow[], options: { batchSize?: number } = {}) => {
  const prisma = buildPrisma(rows);
  const io = { marker: 'io' };
  const manager = { marker: 'manager' };
  const service = new ExpiredShareLinksCleanupService(prisma, {
    now: () => NOW,
    batchSize: options.batchSize,
    resolveIO: () => io as never,
    resolveManager: () => manager as never,
  });
  return { service, prisma, io, manager };
};

const findManyArgs = (prisma: unknown) =>
  ((prisma as { conversationShareLink: { findMany: jest.Mock } })
    .conversationShareLink.findMany.mock.calls[0][0]) as {
    where: Record<string, unknown>;
    orderBy?: unknown;
    take?: number;
  };

const updateCalls = (prisma: unknown) =>
  (prisma as { conversationShareLink: { update: jest.Mock } })
    .conversationShareLink.update.mock.calls as Array<[
    { where: { id: string }; data: Record<string, unknown> },
  ]>;

describe('ExpiredShareLinksCleanupService', () => {
  beforeEach(() => {
    revokeShareLinkGuests.mockReset();
    revokeShareLinkGuests.mockResolvedValue([]);
    sharedLog.warn.mockClear();
  });

  it('ne balaye que les liens actifs dont l’échéance est passée', async () => {
    const { service, prisma } = buildService([linkRow()]);

    await service.cleanup();

    expect(findManyArgs(prisma).where).toEqual({
      isActive: true,
      expiresAt: { not: null, lt: NOW },
    });
  });

  it('borne la fournée et draine les plus anciennes échéances d’abord', async () => {
    const { service, prisma } = buildService([linkRow()], { batchSize: 50 });

    await service.cleanup();

    const args = findManyArgs(prisma);
    expect(args.take).toBe(50);
    expect(args.orderBy).toEqual({ expiresAt: 'asc' });
  });

  it('révoque les invités du lien par l’unité partagée, jamais par une copie locale', async () => {
    const { service, prisma, io, manager } = buildService([linkRow({ id: 'link-1' })]);
    revokeShareLinkGuests.mockResolvedValue(['guest-1', 'guest-2']);

    const result = await service.cleanup();

    expect(revokeShareLinkGuests).toHaveBeenCalledWith({
      prisma,
      io,
      manager,
      shareLinkId: 'link-1',
      revokedAt: NOW,
    });
    expect(result).toEqual({ revokedLinks: 1, revokedGuests: 2 });
  });

  it('pose `isActive: false` — sinon le lien reste candidat à chaque passe, pour toujours', async () => {
    const { service, prisma } = buildService([linkRow({ id: 'link-1' })]);

    await service.cleanup();

    expect(updateCalls(prisma)).toEqual([
      [{ where: { id: 'link-1' }, data: { isActive: false } }],
    ]);
  });

  it('pose `isActive: false` APRÈS la révocation, jamais avant', async () => {
    const { service, prisma } = buildService([linkRow({ id: 'link-1' })]);

    await service.cleanup();

    const revokeOrder = revokeShareLinkGuests.mock.invocationCallOrder[0];
    const updateOrder = (prisma as unknown as { conversationShareLink: { update: jest.Mock } })
      .conversationShareLink.update.mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(updateOrder);
  });

  it('un lien dont la révocation échoue reste `isActive: true` — repris à la passe suivante', async () => {
    const { service, prisma } = buildService([
      linkRow({ id: 'link-echoue' }),
      linkRow({ id: 'link-ok' }),
    ]);
    revokeShareLinkGuests
      .mockRejectedValueOnce(new Error('mongo down'))
      .mockResolvedValueOnce([]);

    const result = await service.cleanup();

    expect(updateCalls(prisma)).toEqual([
      [{ where: { id: 'link-ok' }, data: { isActive: false } }],
    ]);
    expect(result).toEqual({ revokedLinks: 1, revokedGuests: 0 });
    expect(sharedLog.warn).toHaveBeenCalledWith(
      'expired share link revocation failed',
      expect.objectContaining({ shareLinkId: 'link-echoue' }),
    );
  });

  it('un lien dont la mise à jour échoue ne fait pas échouer la passe', async () => {
    const { service, prisma } = buildService([
      linkRow({ id: 'link-1' }),
      linkRow({ id: 'link-2' }),
    ]);
    (prisma as unknown as { conversationShareLink: { update: jest.Mock } })
      .conversationShareLink.update.mockRejectedValueOnce(new Error('write conflict'));

    const result = await service.cleanup();

    expect(result).toEqual({ revokedLinks: 1, revokedGuests: 0 });
    expect(revokeShareLinkGuests).toHaveBeenCalledTimes(2);
  });

  it('aucun lien expiré ⇒ ni requête de révocation, ni écriture', async () => {
    const { service } = buildService([]);

    const result = await service.cleanup();

    expect(revokeShareLinkGuests).not.toHaveBeenCalled();
    expect(result).toEqual({ revokedLinks: 0, revokedGuests: 0 });
  });

  it('une requête en échec rend une passe vide au lieu de propager', async () => {
    const { service, prisma } = buildService([linkRow()]);
    (prisma as unknown as { conversationShareLink: { findMany: jest.Mock } })
      .conversationShareLink.findMany.mockRejectedValueOnce(new Error('mongo down'));

    await expect(service.cleanup()).resolves.toEqual({ revokedLinks: 0, revokedGuests: 0 });
    expect(revokeShareLinkGuests).not.toHaveBeenCalled();
  });

  it('`start` balaye immédiatement puis à intervalle, `stop` désarme', async () => {
    jest.useFakeTimers();
    try {
      const { service, prisma } = buildService([linkRow()]);
      const findMany = (prisma as unknown as { conversationShareLink: { findMany: jest.Mock } })
        .conversationShareLink.findMany;

      service.start(60_000);
      expect(findMany).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(60_000);
      expect(findMany).toHaveBeenCalledTimes(2);

      service.stop();
      jest.advanceTimersByTime(180_000);
      expect(findMany).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('la période par défaut se compte en heures, pas en secondes', async () => {
    jest.useFakeTimers();
    try {
      const { service, prisma } = buildService([linkRow()]);
      const findMany = (prisma as unknown as { conversationShareLink: { findMany: jest.Mock } })
        .conversationShareLink.findMany;

      service.start();
      expect(findMany).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(60 * 60 * 1000 - 1);
      expect(findMany).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1);
      expect(findMany).toHaveBeenCalledTimes(2);

      service.stop();
    } finally {
      jest.useRealTimers();
    }
  });

});
