/**
 * withMutationLog helper — Wave 1 Task 3.5
 *
 * Convenience wrapper that ties together the three moving parts of the
 * dedup pattern :
 *   1. The optional `request.clientMutationId` decorated by the
 *      `clientMutationId` middleware.
 *   2. The `MutationLogService.recordOrReturn` exception-based contract.
 *   3. The route's own refetch logic (provided as `onDuplicate`).
 *
 * When the request carries no cmid, this helper just runs `op()` once
 * and returns its result — routes still behave the same for legacy
 * (non-iOS) clients that haven't been migrated to the outbox yet.
 *
 * Usage :
 *
 * ```ts
 * const friendRequest = await withMutationLog({
 *   request,
 *   fastify,
 *   userId,
 *   kind: 'sendFriendRequest',
 *   op: () => createFriendRequest(...),
 *   onDuplicate: (resultId) =>
 *     fastify.prisma.friendRequest.findUnique({ where: { id: resultId }, include: {...} })
 *       .then(fr => fr ?? throw new Error('Stale mutation log row')),
 * });
 * ```
 *
 * If `onDuplicate` returns `null`/`undefined` (e.g. the original record
 * was deleted between the two calls), the helper re-runs `op()` once
 * to recover. This is intentionally lenient — the alternative would be
 * surfacing a 404 to a client that successfully completed the mutation
 * the first time, which is worse UX than a duplicate-but-idempotent
 * re-execution.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  MutationLogService,
  MutationLogDuplicate,
} from '../services/MutationLogService';

export interface WithMutationLogArgs<T> {
  readonly request: FastifyRequest;
  readonly fastify: FastifyInstance;
  readonly userId: string;
  readonly kind: string;
  readonly op: () => Promise<T & { id: string }>;
  /**
   * Refetch the original mutation result by id. Called with the
   * `resultId` stored on the prior `MutationLog` row.
   *
   * Return `null`/`undefined` to fall back to re-running `op()` (e.g.
   * the original record was soft-deleted). Returning the original
   * record gives the client a byte-stable replay.
   */
  readonly onDuplicate: (resultId: string) => Promise<(T & { id: string }) | null | undefined>;
}

export async function withMutationLog<T extends Record<string, unknown>>(
  args: WithMutationLogArgs<T>
): Promise<T & { id: string }> {
  const { request, fastify, userId, kind, op, onDuplicate } = args;
  const cmid = request.clientMutationId;

  if (!cmid) {
    return op();
  }

  const svc: MutationLogService = fastify.mutationLogService;

  try {
    return await svc.recordOrReturn({
      userId,
      clientMutationId: cmid,
      kind,
      op,
    });
  } catch (err) {
    if (err instanceof MutationLogDuplicate) {
      if (err.resultId) {
        const replayed = await onDuplicate(err.resultId);
        if (replayed) return replayed;
      }
      // Either no resultId on the prior log row (mutations like
      // unblock that don't yield an id) OR the original record is
      // gone — re-run the op so the client at least gets a valid
      // envelope. The op is expected to be naturally idempotent at
      // the storage layer (e.g. block on a userId set is a no-op
      // when the id is already present).
      return op();
    }
    throw err;
  }
}
