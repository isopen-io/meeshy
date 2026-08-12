/**
 * Unit tests for the deviceLocale middleware (Plan B Task 4).
 *
 * Covers the 6 cases enumerated in
 * `docs/superpowers/plans/2026-05-26-device-locale-fourth-priority-plan.md`
 * §Phase 2 Task 4 Step 2.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  deviceLocaleMiddleware,
  createDeviceLocaleMiddleware,
  _resetDeviceLocaleCache,
  _seedDeviceLocaleCache,
  _deviceLocaleCacheSize,
  _DEVICE_LOCALE_MAX_TRACKED_USERS,
} from '../../../middleware/deviceLocale';

/** Mirror of the production DEBOUNCE_MS (5 min) — kept local to the test. */
const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000;

type MockUser = {
  id?: string;
  userId?: string;
  isAnonymous?: boolean;
  deviceLocale?: string | null;
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

type UpdateArgs = { where: { id: string }; data: { deviceLocale: string } };

function makePrismaMock() {
  const update = jest.fn(async (_args: UpdateArgs) => ({} as unknown));
  return {
    update,
    prisma: { user: { update } } as unknown as Parameters<typeof deviceLocaleMiddleware>[2],
  };
}

describe('deviceLocaleMiddleware', () => {
  beforeEach(() => {
    _resetDeviceLocaleCache();
  });

  it('is a no-op when the X-Device-Locale header is absent', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceLocaleMiddleware(
      makeRequest({}, { id: 'u1', deviceLocale: null }),
      makeReply(),
      prisma
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('is a no-op for unauthenticated requests (no req.user)', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceLocaleMiddleware(
      makeRequest({ 'x-device-locale': 'fr-FR' }, undefined),
      makeReply(),
      prisma
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('persists the normalised deviceLocale on the first authenticated call', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceLocaleMiddleware(
      makeRequest({ 'x-device-locale': 'fr-FR' }, { id: 'u1', deviceLocale: null }),
      makeReply(),
      prisma
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { deviceLocale: 'fr' },
    });
  });

  it('is a no-op when the normalised value already matches user.deviceLocale', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceLocaleMiddleware(
      makeRequest({ 'x-device-locale': 'fr-FR' }, { id: 'u1', deviceLocale: 'fr' }),
      makeReply(),
      prisma
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('debounces subsequent writes for the same user within 5 minutes', async () => {
    const { prisma, update } = makePrismaMock();

    // First call → writes
    await deviceLocaleMiddleware(
      makeRequest({ 'x-device-locale': 'fr-FR' }, { id: 'u1', deviceLocale: null }),
      makeReply(),
      prisma
    );
    expect(update).toHaveBeenCalledTimes(1);

    // Second call within the debounce window with a NEW value → skipped.
    // (`deviceLocale: 'fr'` on req.user reflects the freshly-persisted value
    // from call #1; the new header `es-ES` would otherwise trigger a write
    // but the debounce keeps the gateway from hammering the DB.)
    await deviceLocaleMiddleware(
      makeRequest({ 'x-device-locale': 'es-ES' }, { id: 'u1', deviceLocale: 'fr' }),
      makeReply(),
      prisma
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('fires the write again once the 5-minute debounce window has expired', async () => {
    const { prisma, update } = makePrismaMock();

    // Seed the cache as if a write happened just over 5 minutes ago.
    // We use Date.now() as the reference to avoid coupling to wall-clock
    // assumptions inside the middleware.
    const sixMinutesAgo = Date.now() - (6 * 60 * 1000);
    _seedDeviceLocaleCache('u1', sixMinutesAgo);

    // Production-shaped req.user (no deviceLocale field) so the no-op
    // fast-path is skipped and we rely solely on the debounce timing.
    await deviceLocaleMiddleware(
      makeRequest({ 'x-device-locale': 'fr-FR' }, { userId: 'u1', isAnonymous: false }),
      makeReply(),
      prisma
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { deviceLocale: 'fr' },
    });
  });

  it('ignores malformed header payloads (e.g. "@@@") without writing or throwing', async () => {
    const { prisma, update } = makePrismaMock();

    await expect(
      deviceLocaleMiddleware(
        makeRequest({ 'x-device-locale': '@@@' }, { id: 'u1', deviceLocale: null }),
        makeReply(),
        prisma
      )
    ).resolves.toBeUndefined();

    expect(update).not.toHaveBeenCalled();
  });

  it('swallows DB write failures (best-effort persistence)', async () => {
    const update = jest.fn(async (_args: UpdateArgs) => {
      throw new Error('connection reset');
    });
    const prisma = { user: { update } } as unknown as Parameters<
      typeof deviceLocaleMiddleware
    >[2];

    await expect(
      deviceLocaleMiddleware(
        makeRequest({ 'x-device-locale': 'fr-FR' }, { id: 'u1', deviceLocale: null }),
        makeReply(),
        prisma
      )
    ).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('accepts the legacy { userId } shape attached by createUnifiedAuthMiddleware', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceLocaleMiddleware(
      makeRequest(
        { 'x-device-locale': 'it-IT' },
        { userId: 'u2', isAnonymous: false }
      ),
      makeReply(),
      prisma
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { deviceLocale: 'it' },
    });
  });

  it('is a no-op for anonymous users', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceLocaleMiddleware(
      makeRequest(
        { 'x-device-locale': 'fr-FR' },
        { userId: 'anon-1', isAnonymous: true }
      ),
      makeReply(),
      prisma
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('is a no-op when user has neither id nor userId (extractUserId returns undefined)', async () => {
    const { prisma, update } = makePrismaMock();

    await deviceLocaleMiddleware(
      makeRequest(
        { 'x-device-locale': 'fr-FR' },
        { isAnonymous: false } // no id, no userId
      ),
      makeReply(),
      prisma
    );

    expect(update).not.toHaveBeenCalled();
  });

  it('is a no-op when prisma is unavailable (no override, no server.prisma)', async () => {
    // req.server.prisma is undefined — the middleware should warn and skip
    const req = {
      headers: { 'x-device-locale': 'fr-FR' },
      user: { id: 'u3', deviceLocale: null },
      server: { prisma: undefined },
    } as unknown as import('fastify').FastifyRequest;

    await expect(
      deviceLocaleMiddleware(req, makeReply(), undefined)
    ).resolves.toBeUndefined();
  });

  describe('bounded debounce cache (memory-leak guard)', () => {
    it('evicts entries aged past the debounce window once the cap is crossed', async () => {
      const { prisma } = makePrismaMock();

      // Fill the cache to the cap with entries that are already expired
      // (seeded well before the debounce window).
      const longAgo = Date.now() - (DEBOUNCE_WINDOW_MS + 60_000);
      for (let i = 0; i < _DEVICE_LOCALE_MAX_TRACKED_USERS; i++) {
        _seedDeviceLocaleCache(`stale-${i}`, longAgo);
      }
      expect(_deviceLocaleCacheSize()).toBe(_DEVICE_LOCALE_MAX_TRACKED_USERS);

      // A fresh write for a brand-new user crosses the cap and triggers the
      // sweep: every stale entry is dropped, leaving only the new user.
      await deviceLocaleMiddleware(
        makeRequest({ 'x-device-locale': 'fr-FR' }, { userId: 'fresh', isAnonymous: false }),
        makeReply(),
        prisma
      );

      expect(_deviceLocaleCacheSize()).toBe(1);
    });

    it('never grows past the hard cap even when every entry is still fresh', async () => {
      const { prisma } = makePrismaMock();

      // Fill the cache to the cap with entries written "just now" (fresh).
      const now = Date.now();
      for (let i = 0; i < _DEVICE_LOCALE_MAX_TRACKED_USERS; i++) {
        _seedDeviceLocaleCache(`fresh-${i}`, now);
      }

      // A write for a new user crosses the cap; no entry is expired, so the
      // hard-cap fallback drops the oldest-inserted entry to make room.
      await deviceLocaleMiddleware(
        makeRequest({ 'x-device-locale': 'fr-FR' }, { userId: 'newcomer', isAnonymous: false }),
        makeReply(),
        prisma
      );

      expect(_deviceLocaleCacheSize()).toBeLessThanOrEqual(_DEVICE_LOCALE_MAX_TRACKED_USERS);
    });

    it('does not prune while the cache stays under the cap', async () => {
      const { prisma } = makePrismaMock();

      const longAgo = Date.now() - (DEBOUNCE_WINDOW_MS + 60_000);
      _seedDeviceLocaleCache('old-but-under-cap', longAgo);

      await deviceLocaleMiddleware(
        makeRequest({ 'x-device-locale': 'fr-FR' }, { userId: 'another', isAnonymous: false }),
        makeReply(),
        prisma
      );

      // The stale entry is retained (no sweep below the cap) alongside the new
      // one — pruning is amortised, not eager.
      expect(_deviceLocaleCacheSize()).toBe(2);
    });
  });

  describe('createDeviceLocaleMiddleware factory', () => {
    it('returns a hook function that delegates to deviceLocaleMiddleware', async () => {
      const { prisma, update } = makePrismaMock();
      const hook = createDeviceLocaleMiddleware(prisma as any);

      await hook(
        makeRequest({ 'x-device-locale': 'de-DE' }, { id: 'u4', deviceLocale: null }),
        makeReply()
      );

      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({
        where: { id: 'u4' },
        data: { deviceLocale: 'de' },
      });
    });

    it('factory hook is a no-op when header is absent', async () => {
      const { prisma, update } = makePrismaMock();
      const hook = createDeviceLocaleMiddleware(prisma as any);

      await hook(
        makeRequest({}, { id: 'u5', deviceLocale: null }),
        makeReply()
      );

      expect(update).not.toHaveBeenCalled();
    });
  });
});
