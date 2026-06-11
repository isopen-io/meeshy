import Fastify from 'fastify';
import { conditionalGetOnSend } from '../../../utils/etag';

/**
 * Incident 2026-06-11 — empty bodies in production.
 *
 * Almost every gateway handler follows the pattern
 * `async (req, reply) => { sendSuccess(reply, …) }`, whose promise resolves
 * `undefined` AFTER `reply.send()` was called. A global onSend hook that
 * replaces the payload with a stream (@fastify/compress) leaves the reply
 * "in flight" when that promise resolves; Fastify then issues a second
 * `reply.send(undefined)` and the client receives an empty body with
 * `content-encoding` set, plus ERR_HTTP_HEADERS_SENT unhandled rejections.
 *
 * These tests lock the contract we rely on instead: the app-wide
 * `conditionalGetOnSend` hook (the only global payload-touching onSend hook
 * the gateway keeps — HTTP compression moved to Traefik `compress@file`)
 * must deliver full bodies under that exact handler pattern.
 */
describe('async handler + reply.send under the app-wide onSend hook', () => {
  const bigPayload = { success: true, data: { blob: 'x'.repeat(2000) } };

  function buildApp() {
    const app = Fastify({ logger: false });
    app.addHook('onSend', conditionalGetOnSend);
    app.get('/read', async (_req, reply) => {
      reply.status(200).send(bigPayload);
    });
    app.post('/write', async (_req, reply) => {
      reply.status(200).send(bigPayload);
    });
    return app;
  }

  afterEach(async () => {
    // each test builds and closes its own instance
  });

  it('delivers the full body on a GET whose async handler resolves undefined', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/read' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(bigPayload);
    expect(Number(res.headers['content-length'])).toBeGreaterThan(1024);
    await app.close();
  });

  it('delivers the full body on a POST whose async handler resolves undefined', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/write' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(bigPayload);
    expect(Number(res.headers['content-length'])).toBeGreaterThan(1024);
    await app.close();
  });

  it('still short-circuits an unchanged GET to a body-less 304', async () => {
    const app = buildApp();
    const first = await app.inject({ method: 'GET', url: '/read' });
    const etag = first.headers.etag as string;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);

    const second = await app.inject({
      method: 'GET',
      url: '/read',
      headers: { 'if-none-match': etag },
    });
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    await app.close();
  });
});
