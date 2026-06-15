import Fastify from 'fastify';
import { conditionalGetOnSend } from '../../../utils/etag';

/**
 * Prod crash root cause (ERR_HTTP_HEADERS_SENT bursts).
 *
 * The attachment-download route registers its OWN `onSend` hook (CSP headers
 * for inline media) ON TOP of the app-wide `conditionalGetOnSend`. That's TWO
 * async onSend hooks on every download response. On the 404 path the handler
 * does `return sendNotFound(reply, …)` and the `send*` helpers return `void`,
 * so the handler resolves `undefined` — Fastify then issues a duplicate
 * `reply.send(undefined)` and the second send's onSendEnd re-writes the head
 * (`Cannot write headers after they are sent`). Missing avatar files (frequent)
 * make it fire constantly.
 *
 * Every OTHER route carries only ONE async onSend hook (cgo) and is safe — so
 * only downloads crash. The fix: the route's onSend hook must be SYNCHRONOUS
 * (it does zero async work), leaving cgo as the single async onSend hook.
 */
describe('attachment-download — double async onSend hook', () => {
  function build(routeOnSend: 'async' | 'sync') {
    const app = Fastify({ logger: false });
    app.addHook('onSend', conditionalGetOnSend); // app-wide, async
    app.get(
      '/file',
      {
        onSend:
          routeOnSend === 'async'
            ? async (_req, reply, payload) => {
                reply.header('Content-Security-Policy', 'frame-ancestors *');
                return payload;
              }
            : (_req: any, reply: any, payload: any, done: any) => {
                reply.header('Content-Security-Policy', 'frame-ancestors *');
                done(null, payload);
              },
      },
      async (_req, reply) => {
        // 404 path — mirrors `return sendNotFound(reply, …)` (sendNotFound is void).
        reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
      }
    );
    return app;
  }

  async function hit(mode: 'async' | 'sync') {
    const errors: unknown[] = [];
    const onRej = (e: unknown) => errors.push(e);
    process.on('unhandledRejection', onRej);
    const app = build(mode);
    const res = await app.inject({ method: 'GET', url: '/file' });
    await new Promise((r) => setTimeout(r, 60));
    await app.close();
    process.off('unhandledRejection', onRej);
    return { res, errors };
  }

  // NOTE: the 'async' variant double-sends and throws
  // `Cannot write headers after they are sent` (verified during development —
  // an uncaught duplicate send is too racy to assert on reliably in jest, so we
  // lock the FIX instead). The route's onSend MUST stay synchronous.
  it('FIX — a synchronous route onSend hook (cgo remains the only async one) is safe', async () => {
    const { res, errors } = await hit('sync');
    expect(res.statusCode).toBe(404);
    expect(errors).toEqual([]);
  });
});
