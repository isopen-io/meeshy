/**
 * deviceLocale middleware — Plan B « Device Locale 4e priorité »
 *
 * Reads the optional `X-Device-Locale` request header sent by iOS / web
 * clients (e.g. `fr-FR`, `it`, `zh_Hant_HK`) and opportunistically persists
 * the normalised ISO 639-1 code into `User.deviceLocale` so the
 * translator can emit a 4th-priority translation per the Prisme
 * Linguistique extension (cf.
 * `docs/superpowers/specs/2026-05-26-device-locale-fourth-priority-design.md`).
 *
 * Lifecycle: registered as a global `preHandler` hook (NOT `onRequest`)
 * because authenticated routes attach `request.user` via `preValidation`
 * which fires after `onRequest`. By the time `preHandler` runs the auth
 * middleware has populated `request.user` on protected routes; on public
 * routes `request.user` stays undefined and we no-op.
 *
 * Contract:
 *   - Header absent / malformed         → no-op
 *   - User unauthenticated              → no-op
 *   - Normalised code matches stored    → no-op
 *   - Same user written within 5 min    → no-op (debounce)
 *   - Otherwise                         → `prisma.user.update` (best-effort)
 *
 * The hook NEVER throws upstream: a DB outage on `User.update` MUST NOT
 * fail an otherwise valid request — preference propagation is best-effort.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { logger } from '../utils/logger';

/** Minimum delay between two `User.deviceLocale` writes for the same user. */
const DEBOUNCE_MS = 5 * 60 * 1000;

/** Per-process map: userId → last successful write timestamp (ms). */
const lastUpdateByUserId = new Map<string, number>();

/**
 * Test-only seam: clear the in-process debounce cache between assertions.
 * Production code MUST NOT call this — it would defeat the debounce.
 */
export function _resetDeviceLocaleCache(): void {
  lastUpdateByUserId.clear();
}

/**
 * Test-only seam: pre-populate the debounce cache as if a write had
 * occurred at `timestamp` for `userId`. Lets tests exercise the
 * debounce-expired path without relying on real wall-clock time.
 */
export function _seedDeviceLocaleCache(userId: string, timestamp: number): void {
  lastUpdateByUserId.set(userId, timestamp);
}

/**
 * Shape we read from `request.user`. The auth layer attaches either
 *   { userId, username, isAnonymous }  (production legacy compat)
 * or unit tests inject
 *   { id, deviceLocale }               (spec test fixture).
 * Both shapes are accepted so the middleware can run unchanged in either
 * environment.
 */
type DeviceLocaleUser = {
  id?: string;
  userId?: string;
  isAnonymous?: boolean;
  deviceLocale?: string | null;
};

function extractUserId(user: DeviceLocaleUser): string | undefined {
  if (typeof user.id === 'string' && user.id.length > 0) return user.id;
  if (typeof user.userId === 'string' && user.userId.length > 0) return user.userId;
  return undefined;
}

/**
 * Build the Fastify `preHandler` hook. Accepting `prisma` as a parameter
 * mirrors `createUnifiedAuthMiddleware` and keeps the middleware unit-
 * testable (no module-level Prisma import to mock).
 */
export function createDeviceLocaleMiddleware(prisma: PrismaClient) {
  return async function deviceLocaleHook(
    req: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    await deviceLocaleMiddleware(req, _reply, prisma);
  };
}

/**
 * Inner implementation — exported separately so tests can pass a mock
 * Prisma without going through the factory.
 */
export async function deviceLocaleMiddleware(
  req: FastifyRequest,
  _reply: FastifyReply,
  prismaOverride?: PrismaClient
): Promise<void> {
  const header = req.headers['x-device-locale'];
  if (!header || typeof header !== 'string') return;

  const normalized = normalizeLanguageCode(header);
  if (!normalized) return;

  const user = (req as FastifyRequest & { user?: DeviceLocaleUser }).user;
  if (!user || user.isAnonymous === true) return;

  const userId = extractUserId(user);
  if (!userId) return;

  // If we know the current stored value AND it matches, skip the write
  // entirely. Note: in production `req.user` does not carry
  // `deviceLocale` yet (RegisteredUser type is minimal) so this branch
  // is mainly exercised by tests and any future caller that enriches
  // the auth context.
  if (typeof user.deviceLocale === 'string' && user.deviceLocale === normalized) {
    return;
  }

  const last = lastUpdateByUserId.get(userId);
  const now = Date.now();
  if (last !== undefined && now - last < DEBOUNCE_MS) return;

  const prisma =
    prismaOverride ??
    ((req as FastifyRequest & { server: { prisma?: PrismaClient } }).server.prisma);

  if (!prisma) {
    logger.warn('deviceLocaleMiddleware: prisma unavailable, skipping persist', { userId });
    return;
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { deviceLocale: normalized },
    });
    lastUpdateByUserId.set(userId, now);
  } catch (err) {
    // Best-effort: NEVER break a request because a preference write
    // failed. Common cause = user row not found (deleted between auth
    // resolution and this hook). Log at warn so production stays
    // observable without alerting.
    logger.warn('deviceLocaleMiddleware: persist failed', {
      userId,
      normalized,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
