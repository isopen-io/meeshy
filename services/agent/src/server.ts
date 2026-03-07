import 'dotenv/config';
import Fastify from 'fastify';
import Redis from 'ioredis';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { env } from './env';
import { createLlmProvider } from './llm/llm-factory';
import { buildAgentGraph } from './graph/graph';
import { ZmqAgentListener } from './zmq/zmq-listener';
import { ZmqAgentPublisher } from './zmq/zmq-publisher';
import { RedisStateManager } from './memory/redis-state';
import { MongoPersistence } from './memory/mongo-persistence';
import { ConversationScanner } from './scheduler/conversation-scanner';
import { DeliveryQueue } from './delivery/delivery-queue';
import type { AgentNewMessage } from './zmq/types';
import type { MessageEntry } from './graph/state';
import { configRoutes } from './routes/config';
import { rolesRoutes } from './routes/roles';
import { analyticsRoutes } from './routes/analytics';

const server = Fastify({ logger: true });
const prisma = new PrismaClient();
const redis = new Redis(env.REDIS_URL);

server.get('/health', async () => ({
  status: 'ok',
  service: 'agent',
  uptime: process.uptime(),
  provider: env.LLM_PROVIDER,
}));

server.get('/debug/zmq-status', async () => ({
  zmqListenerAlive: true,
  uptime: process.uptime(),
  timestamp: Date.now(),
}));

server.register(configRoutes);
server.register(rolesRoutes);

async function start() {
  const llm = createLlmProvider({
    provider: env.LLM_PROVIDER,
    apiKey: env.LLM_PROVIDER === 'openai' ? env.OPENAI_API_KEY! : env.ANTHROPIC_API_KEY!,
    model: env.LLM_PROVIDER === 'openai' ? env.OPENAI_MODEL : env.ANTHROPIC_MODEL,
  });

  const graph = buildAgentGraph(llm);
  const stateManager = new RedisStateManager(redis);
  const persistence = new MongoPersistence(prisma);

  const zmqListener = new ZmqAgentListener(env.ZMQ_HOST, env.ZMQ_PULL_PORT);
  const zmqPublisher = new ZmqAgentPublisher(env.ZMQ_HOST, env.ZMQ_PUB_PORT);

  await zmqListener.initialize();
  await zmqPublisher.initialize();

  server.register((instance) => analyticsRoutes(instance, { stateManager, persistence }));

  const deliveryQueue = new DeliveryQueue(zmqPublisher, persistence);
  const scanner = new ConversationScanner(graph, persistence, stateManager, deliveryQueue, redis);

  zmqListener.onEvent(async (event) => {
    if (event.type !== 'agent:new-message') return;

    const msg = event as AgentNewMessage;
    let config = await persistence.getAgentConfig(msg.conversationId);

    if (!config) {
      // @ts-ignore - Minimal default config
      config = { enabled: true, contextWindowSize: 50, useFullHistory: false, agentType: 'animator' };
    }

    if (!config?.enabled) return;

    const messages = await stateManager.getMessages(msg.conversationId);
    const newEntry: MessageEntry = {
      id: msg.messageId,
      senderId: msg.senderId,
      senderName: msg.senderDisplayName ?? msg.senderUsername ?? msg.senderId,
      senderUsername: msg.senderUsername ?? msg.senderId,
      content: msg.content,
      timestamp: msg.timestamp,
      replyToId: msg.replyToId,
      originalLanguage: msg.originalLanguage,
    };
    messages.push(newEntry);
    const windowSize = config.useFullHistory ? 250 : (config.contextWindowSize ?? env.AGENT_SLIDING_WINDOW_SIZE);
    const window = messages.slice(-windowSize);
    await stateManager.setMessages(msg.conversationId, window);

    scanner.scanConversation(msg.conversationId).catch((err) => {
      server.log.error(`[Agent] Immediate scan error for conv=${msg.conversationId}:`, err);
    });
  });

  server.post('/debug/test-event', async (request) => {
    const body = request.body as any;
    const conversationId = body?.conversationId ?? 'test-conv';

    server.log.info(`[Debug] test-event received: conv=${conversationId}`);

    try {
      await scanner.scanConversation(conversationId);
      return { success: true, message: 'Scan executed' };
    } catch (error) {
      server.log.error(`[Debug] test-event error: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  server.get('/debug/scanner-status', async () => ({
    pendingDeliveries: deliveryQueue.pendingCount,
    uptime: process.uptime(),
  }));

  zmqListener.startListening().catch((error) => {
    server.log.error('ZMQ listener error:', error);
  });

  scanner.start();

  await server.listen({ port: env.PORT, host: '0.0.0.0' });
  server.log.info(`Agent service running on port ${env.PORT} with ${llm.name} provider`);

  const shutdown = async () => {
    server.log.info('Shutting down agent service...');
    scanner.stop();
    deliveryQueue.clearAll();
    await zmqListener.close();
    await zmqPublisher.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Failed to start agent service:', error);
  process.exit(1);
});
