/**
 * Unit tests for middleware/request-id.ts
 * Covers: requestIdPlugin — valid UUID reuse, invalid/absent header generates new UUID
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { requestIdPlugin } from '../../../middleware/request-id';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeFastify() {
  let capturedHook: ((req: any, reply: any, done: () => void) => void) | undefined;
  const fastify: any = {
    addHook: jest.fn<any>().mockImplementation((_event: string, handler: any) => {
      capturedHook = handler;
    }),
  };
  return { fastify, getHook: () => capturedHook! };
}

function makeRequest(xRequestId?: string) {
  return {
    headers: xRequestId ? { 'x-request-id': xRequestId } : {},
    id: undefined as string | undefined,
  };
}

function makeReply() {
  const headers: Record<string, string> = {};
  return {
    header: jest.fn<any>().mockImplementation((key: string, value: string) => {
      headers[key] = value;
    }),
    getHeaders: () => headers,
  };
}

describe('requestIdPlugin', () => {
  it('registers an onRequest hook', async () => {
    const { fastify } = makeFastify();
    await requestIdPlugin(fastify);
    expect(fastify.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
  });

  it('reuses a valid UUIDv4 from X-Request-ID header', async () => {
    const { fastify, getHook } = makeFastify();
    await requestIdPlugin(fastify);

    const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const req = makeRequest(validUUID);
    const reply = makeReply();
    const done = jest.fn();

    getHook()(req, reply, done);

    expect(req.id).toBe(validUUID);
    expect(reply.header).toHaveBeenCalledWith('X-Request-ID', validUUID);
    expect(done).toHaveBeenCalled();
  });

  it('generates a new UUID when X-Request-ID header is absent', async () => {
    const { fastify, getHook } = makeFastify();
    await requestIdPlugin(fastify);

    const req = makeRequest();
    const reply = makeReply();
    const done = jest.fn();

    getHook()(req, reply, done);

    expect(req.id).toBeDefined();
    expect(UUID_V4_RE.test(req.id!)).toBe(true);
    expect(reply.header).toHaveBeenCalledWith('X-Request-ID', req.id);
    expect(done).toHaveBeenCalled();
  });

  it('generates a new UUID when X-Request-ID is not a valid UUID', async () => {
    const { fastify, getHook } = makeFastify();
    await requestIdPlugin(fastify);

    const req = makeRequest('not-a-uuid');
    const reply = makeReply();
    const done = jest.fn();

    getHook()(req, reply, done);

    expect(req.id).toBeDefined();
    expect(UUID_V4_RE.test(req.id!)).toBe(true);
    expect(req.id).not.toBe('not-a-uuid');
    expect(done).toHaveBeenCalled();
  });

  it('generates a new UUID when X-Request-ID is a v3 UUID (not v4)', async () => {
    const { fastify, getHook } = makeFastify();
    await requestIdPlugin(fastify);

    // UUID v3 has '3' as the 13th char, not '4'
    const uuidV3 = 'f47ac10b-58cc-3372-a567-0e02b2c3d479';
    const req = makeRequest(uuidV3);
    const reply = makeReply();
    const done = jest.fn();

    getHook()(req, reply, done);

    // Should NOT reuse v3 UUID; generates a v4
    expect(req.id).not.toBe(uuidV3);
    expect(UUID_V4_RE.test(req.id!)).toBe(true);
    expect(done).toHaveBeenCalled();
  });
});
