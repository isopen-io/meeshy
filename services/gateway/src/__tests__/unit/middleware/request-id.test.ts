/**
 * request-id.ts — unit tests
 *
 * Covers: requestIdPlugin behaviour:
 * - Reuses a valid UUID v4 from X-Request-ID header
 * - Generates a fresh UUID when header is absent
 * - Generates a fresh UUID when header is invalid
 * - Echoes the ID in the X-Request-ID response header
 * - Sets request.id
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { requestIdPlugin } from '../../../middleware/request-id';

const VALID_UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Call directly (not via register) so the hook applies to the root scope
  await requestIdPlugin(app);
  app.get('/probe', async (req) => {
    return { id: (req as any).id };
  });
  await app.ready();
  return app;
}

describe('requestIdPlugin', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('reuses a valid UUID v4 supplied by the client', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-request-id': VALID_UUID_V4 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(VALID_UUID_V4);
    expect(res.headers['x-request-id']).toBe(VALID_UUID_V4);
  });

  it('generates a fresh UUID v4 when no X-Request-ID header is present', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/probe' });
    expect(res.statusCode).toBe(200);
    const id = res.json().id as string;
    expect(UUID_V4_RE.test(id)).toBe(true);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('generates a fresh UUID v4 when the supplied ID is not a valid UUID', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-request-id': 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(200);
    const id = res.json().id as string;
    expect(UUID_V4_RE.test(id)).toBe(true);
    expect(id).not.toBe('not-a-uuid');
  });

  it('generates a fresh UUID when X-Request-ID is an invalid non-v4 UUID', async () => {
    app = await buildApp();
    // This is a valid v1 UUID (version nibble is 1, not 4) — should be rejected
    const v1uuid = '550e8400-e29b-11d4-a716-446655440000';
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-request-id': v1uuid },
    });
    const id = res.json().id as string;
    expect(id).not.toBe(v1uuid);
    expect(UUID_V4_RE.test(id)).toBe(true);
  });

  it('echoes the request ID in the X-Request-ID response header', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-request-id': VALID_UUID_V4 },
    });
    expect(res.headers['x-request-id']).toBe(VALID_UUID_V4);
  });

  it('sets request.id to the resolved ID', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-request-id': VALID_UUID_V4 },
    });
    expect(res.json().id).toBe(VALID_UUID_V4);
  });

  it('generates unique IDs for different requests when no header provided', async () => {
    app = await buildApp();
    const [res1, res2] = await Promise.all([
      app.inject({ method: 'GET', url: '/probe' }),
      app.inject({ method: 'GET', url: '/probe' }),
    ]);
    const id1 = res1.json().id as string;
    const id2 = res2.json().id as string;
    expect(id1).not.toBe(id2);
  });
});
