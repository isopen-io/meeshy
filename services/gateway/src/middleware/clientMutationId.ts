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
 *   - Header present + invalid → 400 servi par `sendError`, `error ===
 *     'INVALID_MUTATION_ID'` (une CHAÎNE — voir le corps du hook, #4434).
 *
 * Registered globally from `server.ts` so EVERY route benefits.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { sendError } from '../utils/response';

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
    /**
     * Le refus passe par `sendError` — la source UNIQUE de l'enveloppe — et
     * non par une charge écrite à la main (#4434).
     *
     * L'enveloppe déclare `error` en CHAÎNE (`utils/response.ts`,
     * `errorResponseSchema`). Ce hook y posait un OBJET `{ code, message }`,
     * et fast-json-stringify COERCE une clé du mauvais type au lieu de la
     * supprimer : mesuré sur staging, le client recevait
     * `{"success":false,"error":"[object Object]"}`. `INVALID_MUTATION_ID`,
     * que le contrat de ce module promet dix lignes plus haut, n'atteignait
     * donc AUCUN client — ni la file hors ligne iOS, dont c'est pourtant le
     * mécanisme de déduplication, ni un rapport d'incident.
     *
     * Les témoins voisins ne pouvaient pas le voir : ils exercent le hook
     * contre un DOUBLE de `reply`, où rien ne sérialise. La garde qui le
     * tient est `clientMutationId-served-envelope.test.ts`, qui monte une
     * vraie app avec le schéma d'erreur de production.
     */
    const refuser = (): FastifyReply => {
      sendError(reply, 400, 'INVALID_MUTATION_ID', { message: 'Invalid cmid format' });
      return reply;
    };
    if (typeof raw !== 'string') return refuser();
    if (!CLIENT_MUTATION_ID_REGEX.test(raw)) return refuser();
    (req as FastifyRequest & { clientMutationId?: string }).clientMutationId = raw;
  });
}
