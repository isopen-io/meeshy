/**
 * Unit tests for the requestIdPlugin Fastify hook.
 * Covers: valid UUID v4 reuse, invalid header → fresh UUID, absent header → fresh UUID,
 * request.id assignment, X-Request-ID response header.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { requestIdPlugin } from '../../../middleware/request-id';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function setupHook() {
  let onRequest: ((req: any, reply: any, done: () => void) => void) | undefined;
  const fastify = {
    addHook: jest.fn<any>().mockImplementation((name: string, fn: any) => {
      if (name === 'onRequest') onRequest = fn;
    }),
  };

  requestIdPlugin(fastify as any);

  return {
    fastify,
    fire(requestHeaders: Record<string, string | undefined> = {}) {
      const request: any = { headers: requestHeaders, id: undefined };
      const reply: any = { header: jest.fn<any>() };
      const done = jest.fn<any>();
      onRequest!(request, reply, done);
      return { request, reply, done };
    },
  };
}

// ─── requestIdPlugin ──────────────────────────────────────────────────────────

describe('requestIdPlugin', () => {
  it('registers an onRequest hook', () => {
    const { fastify } = setupHook();
    expect(fastify.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
  });

  it('reuses a valid UUID v4 from the X-Request-ID header', () => {
    const { fire } = setupHook();
    const incoming = 'a1b2c3d4-e5f6-4789-89ab-cdef01234567';

    const { request, reply } = fire({ 'x-request-id': incoming });

    expect(request.id).toBe(incoming);
    expect(reply.header).toHaveBeenCalledWith('X-Request-ID', incoming);
  });

  it('generates a fresh UUID when no X-Request-ID header is present', () => {
    const { fire } = setupHook();

    const { request, reply } = fire({});

    expect(UUID_V4_RE.test(request.id)).toBe(true);
    expect(reply.header).toHaveBeenCalledWith('X-Request-ID', request.id);
  });

  it('generates a fresh UUID when X-Request-ID is not a valid UUID v4', () => {
    const { fire } = setupHook();

    const { request } = fire({ 'x-request-id': 'not-a-uuid' });

    expect(UUID_V4_RE.test(request.id)).toBe(true);
  });

  it('rejects a UUID v1 (not v4) and generates a fresh one', () => {
    const { fire } = setupHook();
    const uuidV1 = 'a1b2c3d4-e5f6-1789-89ab-cdef01234567'; // version digit = 1

    const { request } = fire({ 'x-request-id': uuidV1 });

    expect(request.id).not.toBe(uuidV1);
    expect(UUID_V4_RE.test(request.id)).toBe(true);
  });

  it('generates a unique ID on every request when no header is supplied', () => {
    const { fire } = setupHook();

    const { request: r1 } = fire({});
    const { request: r2 } = fire({});

    expect(r1.id).not.toBe(r2.id);
  });

  it('calls done() to advance the Fastify lifecycle', () => {
    const { fire } = setupHook();

    const { done } = fire({});

    expect(done).toHaveBeenCalledTimes(1);
  });

  it('handles an array X-Request-ID header by generating a fresh UUID', () => {
    const { fire } = setupHook();
    // Fastify can deliver headers as string[]; our guard requires typeof === 'string'.
    const { request } = fire({ 'x-request-id': ['id1', 'id2'] as any });

    expect(UUID_V4_RE.test(request.id)).toBe(true);
  });
});
