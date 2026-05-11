/**
 * clientMutationId middleware — Wave 1 Task 3.5 (Phase 3 Tier B)
 *
 * Reads the `X-Client-Mutation-Id` request header on every request and
 * attaches the value to `request.clientMutationId` after validating its
 * shape. Routes that opt into idempotency (write routes wrapped by
 * `MutationLogService.recordOrReturn`) consume this value to detect and
 * deduplicate replayed mutations from the iOS offline queue.
 *
 * Format contract (must match iOS `ClientMutationId`):
 *   `cmid_<uuid v4 lowercase>` — e.g.
 *   `cmid_550e8400-e29b-41d4-a716-446655440000`
 *
 * Behaviour :
 *   - Header absent          → `request.clientMutationId === undefined`,
 *                              request proceeds (routes opt in).
 *   - Header present + valid → `request.clientMutationId === '<cmid>'`.
 *   - Header present + invalid → 400 with `INVALID_MUTATION_ID` envelope.
 *
 * Registered globally from `server.ts` so EVERY route benefits.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/** Matches `cmid_<uuid v4 lowercase>` exactly (no surrounding whitespace). */
export const CLIENT_MUTATION_ID_REGEX =
  /^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Client-supplied idempotency key for write mutations.
     * Populated by `registerClientMutationIdHook` when the
     * `X-Client-Mutation-Id` header is present and well-formed.
     *
     * Routes that wrap their side-effect in
     * `MutationLogService.recordOrReturn` check this field; routes that
     * don't care simply ignore it (header is optional).
     */
    clientMutationId?: string;
  }
}

/**
 * Register the `clientMutationId` request decorator + the validating
 * `onRequest` hook on a Fastify instance. Idempotent at startup: the
 * decorator is only registered once.
 *
 * Call this BEFORE registering any route that reads `request.clientMutationId`.
 * In practice we register it right after the global rate limiter in
 * `server.ts` so every downstream route sees the decorated request.
 */
export function registerClientMutationIdHook(app: FastifyInstance): void {
  if (!app.hasRequestDecorator('clientMutationId')) {
    app.decorateRequest('clientMutationId', undefined);
  }

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const raw = req.headers['x-client-mutation-id'];
    if (raw === undefined) return;
    if (typeof raw !== 'string') {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_MUTATION_ID',
          message: 'Invalid cmid format',
        },
      });
    }
    if (!CLIENT_MUTATION_ID_REGEX.test(raw)) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_MUTATION_ID',
          message: 'Invalid cmid format',
        },
      });
    }
    (req as FastifyRequest & { clientMutationId?: string }).clientMutationId = raw;
  });
}
