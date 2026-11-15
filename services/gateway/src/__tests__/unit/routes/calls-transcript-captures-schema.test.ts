import { describe, it, expect } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';
import type { FastifyInstance } from 'fastify';
import { registerCallsConsultationRoutes } from '../../../routes/calls-consultation';
import type { CallRouteDeps } from '../../../routes/calls-shared';

/**
 * #16665 — Fastify retire tout champ que le schéma de réponse ne déclare pas :
 * sans déclaration, `captures` n'atteindrait jamais un client. Fichier à part :
 * `calls-routes.test.ts` est une dette héritée qui ne grandit plus.
 */

type Registered = { path: string; opts: { schema: { response: Record<number, object> } } };

const transcriptRoute = (): Registered | undefined => {
  const routes: Registered[] = [];
  const record = (path: string, opts: Registered['opts']) => {
    routes.push({ path, opts });
  };
  const fastify = { get: record, post: record, delete: record, put: record, patch: record } as unknown as FastifyInstance;
  registerCallsConsultationRoutes(fastify, { prisma: {}, callService: {}, requiredAuth: async () => undefined } as unknown as CallRouteDeps);
  return routes.find((route) => route.path === '/calls/:callId/transcript');
};

describe('GET /calls/:callId/transcript — les captures voyagent (#16665)', () => {
  it('déclare captures dans le schéma de réponse, auteur nul compris', () => {
    const route = transcriptRoute();
    const serialize = fastJsonStringify(route?.opts.schema.response[200] ?? {});
    const captures = [
      { id: 'cap-1', participantId: 'p-karim', userId: 'u-karim', displayName: 'Karim', kind: 'screenshot', offsetMs: 760_000, at: '2026-11-07T10:12:40.000Z' },
      { id: 'cap-2', participantId: null, userId: null, displayName: null, kind: 'call-recording-stopped', offsetMs: 800_000, at: '2026-11-07T10:13:20.000Z' },
    ];
    const transcript = { callId: '507f1f77bcf86cd799439011', conversationId: '507f1f77bcf86cd799439022', callStartedAt: '2026-11-07T10:00:00.000Z', segments: [], total: 0, hasMore: false };

    const body = JSON.parse(serialize({ success: true, data: { ...transcript, captures } }));

    expect(body.data.captures).toEqual(captures);
  });
});
