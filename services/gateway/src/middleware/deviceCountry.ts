/**
 * deviceCountry middleware — Guideline 5 (MIIT) CallKit-in-China compliance
 *
 * Reads the optional `X-Meeshy-Country` request header sent by iOS clients
 * on every request (`ClientInfoProvider.buildHeaders()`, derived from
 * `Locale.current.region`) and opportunistically persists the normalised
 * ISO 3166-1 alpha-2 code into `User.deviceCountry`. This is the only
 * continuously-refreshed "where is this device right now" signal available
 * server-side (`User.registrationCountry` is captured once at signup and
 * never updated). `CallEventsHandler` reads `User.deviceCountry` to decide
 * whether an incoming-call push must avoid the `voip` (PushKit/CallKit)
 * token type for China-region devices.
 *
 * Mirrors `deviceLocale.ts` exactly (debounce, no-op contract, test seams).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';

/** Minimum delay between two `User.deviceCountry` writes for the same user. */
const DEBOUNCE_MS = 5 * 60 * 1000;

/**
 * Hard ceiling on the number of tracked users. Beyond it the debounce map is
 * swept (see {@link pruneStaleDebounceEntries}) before the next insert so the
 * per-process footprint stays bounded no matter how many distinct users the
 * gateway serves over its lifetime.
 */
const MAX_TRACKED_USERS = 10_000;

/** Per-process map: userId → last successful write timestamp (ms). */
const lastUpdateByUserId = new Map<string, number>();

/** ISO 3166-1 alpha-2 country codes only — anything else is malformed. */
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;

function normalizeCountryCode(header: string): string | undefined {
  const trimmed = header.trim();
  if (!COUNTRY_CODE_PATTERN.test(trimmed)) return undefined;
  return trimmed.toUpperCase();
}

/**
 * Evict debounce entries that have aged past the window, then hard-cap the map.
 *
 * An entry older than {@link DEBOUNCE_MS} can never suppress a write — the
 * debounce check (`now - last < DEBOUNCE_MS`) always fails for it — so it is
 * dead weight and dropping it is strictly behaviour-preserving. Without this
 * sweep the map grew one entry per distinct authenticated user for the entire
 * process lifetime (an unbounded slow leak on a 100k+ user platform).
 *
 * The sweep runs only when the map crosses {@link MAX_TRACKED_USERS}, so its
 * O(n) cost is amortised across ≥`MAX_TRACKED_USERS` writes. In the
 * pathological case where more than `MAX_TRACKED_USERS` distinct users all
 * wrote inside the window (every entry still fresh), memory is bounded hard by
 * dropping oldest-inserted entries; the only consequence is that an evicted
 * user may incur one extra (idempotent) `User.update` on its next request.
 */
function pruneStaleDebounceEntries(now: number): void {
  for (const [id, ts] of lastUpdateByUserId) {
    if (now - ts >= DEBOUNCE_MS) lastUpdateByUserId.delete(id);
  }
  while (lastUpdateByUserId.size >= MAX_TRACKED_USERS) {
    const oldest = lastUpdateByUserId.keys().next().value;
    if (oldest === undefined) break;
    lastUpdateByUserId.delete(oldest);
  }
}

/**
 * Test-only seam: clear the in-process debounce cache between assertions.
 * Production code MUST NOT call this — it would defeat the debounce.
 */
export function _resetDeviceCountryCache(): void {
  lastUpdateByUserId.clear();
}

/**
 * Test-only seam: pre-populate the debounce cache as if a write had
 * occurred at `timestamp` for `userId`.
 */
export function _seedDeviceCountryCache(userId: string, timestamp: number): void {
  lastUpdateByUserId.set(userId, timestamp);
}

/**
 * Test-only seam: current number of tracked users in the debounce cache. Lets
 * tests assert the bounded-growth / eviction behaviour without exposing the
 * internal map.
 */
export function _deviceCountryCacheSize(): number {
  return lastUpdateByUserId.size;
}

/** Test-only seam: the hard cap used by the eviction sweep. */
export const _DEVICE_COUNTRY_MAX_TRACKED_USERS = MAX_TRACKED_USERS;

type DeviceCountryUser = {
  id?: string;
  userId?: string;
  isAnonymous?: boolean;
  deviceCountry?: string | null;
};

function extractUserId(user: DeviceCountryUser): string | undefined {
  if (typeof user.id === 'string' && user.id.length > 0) return user.id;
  if (typeof user.userId === 'string' && user.userId.length > 0) return user.userId;
  return undefined;
}

/**
 * Build the Fastify `preHandler` hook. Accepting `prisma` as a parameter
 * mirrors `createDeviceLocaleMiddleware` and keeps the middleware unit-
 * testable (no module-level Prisma import to mock).
 */
export function createDeviceCountryMiddleware(prisma: PrismaClient) {
  return async function deviceCountryHook(
    req: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    await deviceCountryMiddleware(req, _reply, prisma);
  };
}

/**
 * Inner implementation — exported separately so tests can pass a mock
 * Prisma without going through the factory.
 */
export async function deviceCountryMiddleware(
  req: FastifyRequest,
  _reply: FastifyReply,
  prismaOverride?: PrismaClient
): Promise<void> {
  const header = req.headers['x-meeshy-country'];
  if (!header || typeof header !== 'string') return;

  const normalized = normalizeCountryCode(header);
  if (!normalized) return;

  const user = (req as FastifyRequest & { user?: DeviceCountryUser }).user;
  if (!user || user.isAnonymous === true) return;

  const userId = extractUserId(user);
  if (!userId) return;

  if (typeof user.deviceCountry === 'string' && user.deviceCountry === normalized) {
    return;
  }

  const last = lastUpdateByUserId.get(userId);
  const now = Date.now();
  if (last !== undefined && now - last < DEBOUNCE_MS) return;

  const prisma =
    prismaOverride ??
    ((req as FastifyRequest & { server: { prisma?: PrismaClient } }).server.prisma);

  if (!prisma) {
    logger.warn('deviceCountryMiddleware: prisma unavailable, skipping persist', { userId });
    return;
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { deviceCountry: normalized },
    });
    if (!lastUpdateByUserId.has(userId) && lastUpdateByUserId.size >= MAX_TRACKED_USERS) {
      pruneStaleDebounceEntries(now);
    }
    lastUpdateByUserId.set(userId, now);
  } catch (err) {
    // Best-effort: NEVER break a request because a preference write
    // failed. Common cause = user row not found (deleted between auth
    // resolution and this hook). Log at warn so production stays
    // observable without alerting.
    logger.warn('deviceCountryMiddleware: persist failed', {
      userId,
      normalized,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
