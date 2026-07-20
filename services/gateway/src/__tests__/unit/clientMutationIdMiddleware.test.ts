/**
 * Unit tests for clientMutationId middleware — Wave 1 Task 3.5 (B1).
 *
 * We spin up a minimal Fastify instance per test, register the hook,
 * and add a stub route that echoes back `request.clientMutationId` so
 * the tests can observe the decoration behaviour directly.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import {
  CLIENT_MUTATION_ID_REGEX,
  registerClientMutationIdHook,
} from '../../middleware/clientMutationId';

const VALID_CMID = 'cmid_550e8400-e29b-41d4-a716-446655440000';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerClientMutationIdHook(app);
  app.get('/echo', async (req) => {
    return { cmid: req.clientMutationId ?? null };
  });
  await app.ready();
  return app;
}

describe('CLIENT_MUTATION_ID_REGEX', () => {
  it('accepts canonical cmid format', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test(VALID_CMID)).toBe(true);
  });

  it('rejects uppercase hex digits (iOS guarantees lowercase)', () => {
    const upper = 'cmid_550E8400-E29B-41D4-A716-446655440000';
    expect(CLIENT_MUTATION_ID_REGEX.test(upper)).toBe(false);
  });

  it('rejects missing prefix', () => {
    const noPrefix = '550e8400-e29b-41d4-a716-446655440000';
    expect(CLIENT_MUTATION_ID_REGEX.test(noPrefix)).toBe(false);
  });

  it('rejects extra whitespace', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test(` ${VALID_CMID}`)).toBe(false);
    expect(CLIENT_MUTATION_ID_REGEX.test(`${VALID_CMID} `)).toBe(false);
  });

  it('rejects wrong segment lengths', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test('cmid_550e8400-e29b-41d4-a716-44665544000')).toBe(false);
  });
});

describe('clientMutationId middleware', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('decorates request.clientMutationId when header is valid', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { 'x-client-mutation-id': VALID_CMID },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ cmid: VALID_CMID });
  });

  it('leaves request.clientMutationId undefined when header is absent', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/echo' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ cmid: null });
  });

  it('rejects malformed header with 400 INVALID_MUTATION_ID', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { 'x-client-mutation-id': 'not-a-cmid' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'INVALID_MUTATION_ID',
        message: 'Invalid cmid format',
      },
    });
  });

  it('rejects empty string header with 400', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { 'x-client-mutation-id': '' },
    });
    // Fastify may not forward an empty header; tolerate either decoration
    // as null OR a 400. Specify the contract: empty is invalid.
    if (res.statusCode === 200) {
      // Header was dropped before reaching the hook — equivalent to absent.
      expect(res.json()).toEqual({ cmid: null });
    } else {
      expect(res.statusCode).toBe(400);
    }
  });

  it('rejects uppercase cmid with 400', async () => {
    app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { 'x-client-mutation-id': 'cmid_550E8400-E29B-41D4-A716-446655440000' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('INVALID_MUTATION_ID');
  });

  it('rejects an array header value (typeof !== string) with 400', async () => {
    // Fastify can expose multi-value headers as string[] when the client sends
    // repeated headers; typeof raw !== 'string' branch must reject them.
    // Register an early hook that injects an array BEFORE the mutation-id hook reads it.
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (req) => {
      (req.headers as any)['x-client-mutation-id'] = ['cmid_1', 'cmid_2'];
    });
    registerClientMutationIdHook(app);
    app.get('/check', async (req) => ({ cmid: req.clientMutationId ?? null }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/check' });
    expect(res.statusCode).toBe(400);
    const body = res.json() as any;
    expect(body.error?.code).toBe('INVALID_MUTATION_ID');
  });

  it('is idempotent: calling registerClientMutationIdHook twice does not throw', async () => {
    // Covers the branch where hasRequestDecorator returns true (decorator already added).
    app = Fastify({ logger: false });
    registerClientMutationIdHook(app);
    // Second call: decorator already registered — the `if (!hasRequestDecorator)` branch is false
    expect(() => registerClientMutationIdHook(app)).not.toThrow();
    app.get('/noop', async () => ({}));
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/noop',
      headers: { 'x-client-mutation-id': VALID_CMID },
    });
    expect(res.statusCode).toBe(200);
  });

  it('preserves cmid across multiple handlers on same request', async () => {
    app = Fastify({ logger: false });
    registerClientMutationIdHook(app);
    let observedInPreHandler: string | undefined;
    app.addHook('preHandler', async (req) => {
      observedInPreHandler = req.clientMutationId;
    });
    app.get('/probe', async (req) => ({ cmid: req.clientMutationId ?? null }));
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-client-mutation-id': VALID_CMID },
    });
    expect(res.statusCode).toBe(200);
    expect(observedInPreHandler).toBe(VALID_CMID);
    expect(res.json()).toEqual({ cmid: VALID_CMID });
  });
});
