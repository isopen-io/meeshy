import Fastify, { FastifyInstance } from 'fastify';
import { editMessageBodyJsonSchema } from '../../../routes/conversations/messages-advanced';

/**
 * Regression guard for the REST `PUT /conversations/:id/messages/:messageId`
 * edit body schema.
 *
 * Fastify runs AJV `schema.body` validation BEFORE `preHandler`/handler, so a
 * `minLength: 1` on `content` rejected an empty-content caption-removal edit at
 * the schema boundary and the handler's attachment-aware `hasAttachments` gate
 * never ran — silently killing caption removal over REST. The existing
 * direct-handler unit tests bypass AJV (they invoke the handler function
 * directly), so they could not catch this. This suite exercises the REAL schema
 * object through a real Fastify `inject()` so the AJV layer is actually applied.
 */
describe('editMessageBodyJsonSchema (REST edit body — AJV boundary)', () => {
  async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.put(
      '/edit',
      { schema: { body: editMessageBodyJsonSchema } },
      async (request, reply) => reply.send({ ok: true, content: (request.body as { content: string }).content })
    );
    await app.ready();
    return app;
  }

  it('accepts empty content (attachment caption removal) instead of rejecting at AJV', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/edit', payload: { content: '' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, content: '' });
    await app.close();
  });

  it('accepts normal content', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/edit', payload: { content: 'hello' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('rejects content over the 10 000-char cap at the AJV boundary', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/edit', payload: { content: 'x'.repeat(10_001) } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('accepts content exactly at the 10 000-char cap', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/edit', payload: { content: 'x'.repeat(10_000) } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('still requires the content key to be present', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/edit', payload: { originalLanguage: 'fr' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
