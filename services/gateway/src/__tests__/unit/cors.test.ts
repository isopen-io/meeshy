import Fastify from 'fastify';
import cors from '@fastify/cors';
import { CORS_METHODS } from '../../config/cors-methods';

describe('gateway CORS preflight', () => {
  async function buildApp() {
    const app = Fastify({ logger: false });
    await app.register(cors, { origin: true, credentials: true, methods: CORS_METHODS });
    app.delete('/conversations/:id/messages/:messageId', async () => ({ success: true }));
    return app;
  }

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])(
    'allows %s in Access-Control-Allow-Methods',
    async (method) => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/conversations/x/messages/y',
        headers: {
          origin: 'https://meeshy.me',
          'access-control-request-method': method
        }
      });
      expect(res.headers['access-control-allow-methods']).toContain(method);
      await app.close();
    }
  );
});
