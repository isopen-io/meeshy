/**
 * MutationLogService — Wave 1 Task 3.4 (Phase 3 Tier B)
 *
 * Generalises the `Message.clientMessageId` dedup pattern to every
 * non-message write mutation persisted in the iOS outbox (friend
 * request, profile update, block, post like, comment, etc.).
 *
 * Pattern :
 *   1. Client sends a write request with `X-Client-Mutation-Id: cmid_<uuid>`
 *      (validated upstream by `clientMutationId` middleware).
 *   2. Route handler wraps its side-effect in `recordOrReturn(...)`.
 *   3. `recordOrReturn` checks the `MutationLog` table for an existing
 *      row keyed by `(userId, clientMutationId)`.
 *      - If found, throws `MutationLogDuplicate` carrying the prior
 *        `resultId`. The route catches it and refetches the resource so
 *        the client observes the same response as the first call.
 *      - If not found, executes the op, persists the `MutationLog` row
 *        with `resultId = op().id`, and returns the fresh result.
 *
 * Why an exception for the duplicate path :
 *   - The op signature is unconstrained (`Promise<T & { id: string }>`)
 *     so we can't return a discriminated `{ kind: 'duplicate', ... }` in
 *     the same return slot without poisoning the caller's type.
 *   - Routes only need to handle the duplicate case occasionally;
 *     try/catch keeps the happy path linear.
 *
 * Cleanup :
 *   See `cron/mutationLogCleanup.ts` (deletes rows older than 30 days
 *   nightly at 03:00).
 *
 * Schema reference : `packages/shared/prisma/schema.prisma → model MutationLog`.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

export interface RecordOrReturnArgs<T> {
  readonly userId: string;
  readonly clientMutationId: string;
  /** Free-form string matching an iOS `OutboxKind` raw value. */
  readonly kind: string;
  /**
   * Side-effect to execute exactly once. MUST resolve with an object
   * carrying an `id` field that uniquely identifies the result so we
   * can refetch it on replay.
   */
  readonly op: () => Promise<T & { id: string }>;
}

/**
 * Thrown by `recordOrReturn` when the `(userId, clientMutationId)` key
 * already exists in the `MutationLog` table. Carries the prior
 * `resultId` so the caller can refetch the resource and return it as
 * if it had just been created.
 *
 * Routes typically pattern-match on this with `instanceof` and emit
 * the same envelope they would for a fresh insert.
 */
export class MutationLogDuplicate extends Error {
  public readonly resultId: string | null;
  public readonly kind: string;

  constructor(resultId: string | null, kind: string) {
    super(
      `Mutation already applied (kind=${kind}, resultId=${resultId ?? 'null'})`
    );
    this.name = 'MutationLogDuplicate';
    this.resultId = resultId;
    this.kind = kind;
  }
}

export class MutationLogService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Idempotent wrapper around a write side-effect.
   *
   * @throws MutationLogDuplicate when the cmid was already applied.
   * @throws Whatever the wrapped `op` throws on a fresh execution.
   *
   * Note : we do NOT swallow `op` errors — if the underlying mutation
   * fails, we deliberately do NOT persist a `MutationLog` row, so a
   * client retry with the same cmid will re-attempt the operation.
   */
  async recordOrReturn<T extends Record<string, unknown>>(
    args: RecordOrReturnArgs<T>
  ): Promise<T & { id: string }> {
    const { userId, clientMutationId, kind, op } = args;

    const existing = await this.prisma.mutationLog.findUnique({
      where: {
        userId_clientMutationId: { userId, clientMutationId },
      },
      select: { resultId: true, kind: true },
    });

    if (existing) {
      throw new MutationLogDuplicate(existing.resultId, existing.kind);
    }

    const result = await op();

    // Persist AFTER the op succeeds. We use upsert (rather than create)
    // to defend against a race where two concurrent requests with the
    // same cmid both passed the findUnique guard above. The unique
    // index on (userId, clientMutationId) lets the second writer
    // converge to the first writer's resultId via the update branch.
    await this.prisma.mutationLog.upsert({
      where: {
        userId_clientMutationId: { userId, clientMutationId },
      },
      create: {
        userId,
        clientMutationId,
        kind,
        resultId: result.id,
      },
      update: {
        // Don't clobber `resultId` if a concurrent winner already
        // wrote one — keep their resultId so the client sees a
        // consistent view across the two racing replies.
        kind,
      },
    });

    return result;
  }
}
