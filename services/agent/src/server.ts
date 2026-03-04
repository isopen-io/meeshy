import 'dotenv/config';
import Fastify from 'fastify';
import { env } from './env';

const server = Fastify({ logger: true });

server.get('/health', async () => ({ status: 'ok', service: 'agent', uptime: process.uptime() }));

async function start() {
  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    server.log.info(`Agent service running on port ${env.PORT}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

start();
