/**
 * Unit tests for the deviceCountry middleware.
 *
 * Mirrors deviceLocale.test.ts: persists a continuously-refreshed
 * `User.deviceCountry` from the `X-Meeshy-Country` header (sent by iOS
 * on every request via ClientInfoProvider.buildHeaders()), so the gateway
 * can route CallKit-incompatible push types away from China devices
 * (Guideline 5 / MIIT compliance — see CallEventsHandler.ts).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  deviceCountryMiddleware,
  createDeviceCountryMiddleware,
  _resetDeviceCountryCache,
  _seedDeviceCountryCache,
} from '../../../middleware/deviceCountry';

type MockUser = {
  id?: string;
  userId?: string;
  isAnonymous?: boolean;
  deviceCountry?: string | null;
};

function makeRequest(
  headers: Record<string, string | undefined>,
  user?: MockUser
): FastifyRequest {
  return {
    headers,
    user,
  } as unknown as FastifyRequest;
}

function makeReply(): FastifyReply {
  return {} as FastifyReply;
}

type UpdateArgs = { where: { id: string }; data: { deviceCountry: string } };

function makePrismaMock() {
  const update = jest.fn(async (_args: UpdateArgs) => ({} as unknown));
  return {
    update,
    prisma: { user: { update } } as unknown as Parameters<typeof deviceCountryMiddleware>[2],
  };
}

describe('deviceCountryMiddleware', () => {
  beforeEach(() => {
    _resetDeviceCountryCache();
  });

  it('is a no-op when the X-Meeshy-Country header is absent', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceCountryMiddleware(
      makeRequest({}, { id: 'u1', deviceCountry: null }),
      makeReply(),
      prisma
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('is a no-op for unauthenticated requests (no req.user)', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceCountryMiddleware(
      makeRequest({ 'x-meeshy-country': 'FR' }, undefined),
      makeReply(),
      prisma
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('persists the normalised deviceCountry on the first authenticated call', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceCountryMiddleware(
      makeRequest({ 'x-meeshy-country': 'fr' }, { id: 'u1', deviceCountry: null }),
      makeReply(),
      prisma
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { deviceCountry: 'FR' },
    });
  });

  it('is a no-op when the normalised value already matches user.deviceCountry', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceCountryMiddleware(
      makeRequest({ 'x-meeshy-country': 'fr' }, { id: 'u1', deviceCountry: 'FR' }),
      makeReply(),
      prisma
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('debounces subsequent writes for the same user within 5 minutes', async () => {
    const { prisma, update } = makePrismaMock();

    // First call → writes
    await deviceCountryMiddleware(
      makeRequest({ 'x-meeshy-country': 'FR' }, { id: 'u1', deviceCountry: null }),
      makeReply(),
      prisma
    );
    expect(update).toHaveBeenCalledTimes(1);

    // Second call within the debounce window with a NEW value → skipped.
    await deviceCountryMiddleware(
      makeRequest({ 'x-meeshy-country': 'CN' }, { id: 'u1', deviceCountry: 'FR' }),
      makeReply(),
      prisma
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('fires the write again once the 5-minute debounce window has expired', async () => {
    const { prisma, update } = makePrismaMock();

    // Seed the cache as if a write happened just over 5 minutes ago.
    const sixMinutesAgo = Date.now() - (6 * 60 * 1000);
    _seedDeviceCountryCache('u1', sixMinutesAgo);

    // Production-shaped req.user (no deviceCountry field) so the no-op
    // fast-path is skipped and we rely solely on the debounce timing.
    await deviceCountryMiddleware(
      makeRequest({ 'x-meeshy-country': 'CN' }, { userId: 'u1', isAnonymous: false }),
      makeReply(),
      prisma
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { deviceCountry: 'CN' },
    });
  });

  it('ignores malformed header payloads without writing or throwing', async () => {
    const { prisma, update } = makePrismaMock();

    for (const malformed of ['@@@', '1', 'USA', 'fra', '', '  ']) {
      await expect(
        deviceCountryMiddleware(
          makeRequest({ 'x-meeshy-country': malformed }, { id: 'u1', deviceCountry: null }),
          makeReply(),
          prisma
        )
      ).resolves.toBeUndefined();
    }

    expect(update).not.toHaveBeenCalled();
  });

  it('swallows DB write failures (best-effort persistence)', async () => {
    const update = jest.fn(async (_args: UpdateArgs) => {
      throw new Error('connection reset');
    });
    const prisma = { user: { update } } as unknown as Parameters<
      typeof deviceCountryMiddleware
    >[2];

    await expect(
      deviceCountryMiddleware(
        makeRequest({ 'x-meeshy-country': 'CN' }, { id: 'u1', deviceCountry: null }),
        makeReply(),
        prisma
      )
    ).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('accepts the legacy { userId } shape attached by createUnifiedAuthMiddleware', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceCountryMiddleware(
      makeRequest(
        { 'x-meeshy-country': 'it' },
        { userId: 'u2', isAnonymous: false }
      ),
      makeReply(),
      prisma
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { deviceCountry: 'IT' },
    });
  });

  it('is a no-op for anonymous users', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceCountryMiddleware(
      makeRequest(
        { 'x-meeshy-country': 'CN' },
        { userId: 'anon-1', isAnonymous: true }
      ),
      makeReply(),
      prisma
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('is a no-op when user has neither id nor userId (extractUserId returns undefined)', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceCountryMiddleware(
      makeRequest(
        { 'x-meeshy-country': 'FR' },
        { isAnonymous: false } // no id, no userId
      ),
      makeReply(),
      prisma
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('is a no-op when prisma is unavailable (no override, no server.prisma)', async () => {
    const req = {
      headers: { 'x-meeshy-country': 'FR' },
      user: { id: 'u3', deviceCountry: null },
      server: { prisma: undefined },
    } as unknown as import('fastify').FastifyRequest;

    await expect(
      deviceCountryMiddleware(req, makeReply(), undefined)
    ).resolves.toBeUndefined();
  });

  describe('createDeviceCountryMiddleware factory', () => {
    it('returns a hook function that delegates to deviceCountryMiddleware', async () => {
      const { prisma, update } = makePrismaMock();
      const hook = createDeviceCountryMiddleware(prisma as any);

      await hook(
        makeRequest({ 'x-meeshy-country': 'de' }, { id: 'u4', deviceCountry: null }),
        makeReply()
      );

      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({
        where: { id: 'u4' },
        data: { deviceCountry: 'DE' },
      });
    });

    it('factory hook is a no-op when header is absent', async () => {
      const { prisma, update } = makePrismaMock();
      const hook = createDeviceCountryMiddleware(prisma as any);

      await hook(
        makeRequest({}, { id: 'u5', deviceCountry: null }),
        makeReply()
      );

      expect(update).not.toHaveBeenCalled();
    });
  });
});
