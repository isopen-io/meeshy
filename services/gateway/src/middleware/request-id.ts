import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';

/**
 * Attaches a unique X-Request-ID to every inbound request and echoes it in
 * the response.  If the client already supplies a valid UUID v4 we reuse it,
 * otherwise we generate a fresh one.  This lets distributed traces be
 * correlated across gateway → translator → client logs without an external
 * tracing sidecar.
 *
 * Usage: register BEFORE all plugins so every route benefits.
 *   server.register(requestIdPlugin);
 */
export async function requestIdPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', (request, reply, done) => {
    const incoming = request.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && UUID_RE.test(incoming)
        ? incoming
        : randomUUID();

    // Fastify exposes request.id; override it for logging correlation.
    (request as unknown as { id: string }).id = requestId;
    reply.header('X-Request-ID', requestId);
    done();
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
