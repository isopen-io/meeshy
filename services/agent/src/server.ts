import 'dotenv/config';
import Fastify from 'fastify';
import Redis from 'ioredis';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { env } from './env';
import { createLlmProvider } from './llm/llm-factory';
import { buildAgentGraph, type TracerRef } from './graph/graph';
import { ZmqAgentListener } from './zmq/zmq-listener';
import { ZmqAgentPublisher } from './zmq/zmq-publisher';
import { RedisStateManager } from './memory/redis-state';
import { MongoPersistence } from './memory/mongo-persistence';
import { ConversationScanner } from './scheduler/conversation-scanner';
import { DeliveryQueue } from './delivery/delivery-queue';
import { ConfigCache } from './config/config-cache';
import { DailyBudgetManager } from './scheduler/daily-budget';
import type { AgentNewMessage } from './zmq/types';
import type { MessageEntry } from './graph/state';
import { ReactiveHandler } from './reactive/reactive-handler';
import { detectInterpellation } from './reactive/interpellation-detector';
import { configRoutes } from './routes/config';
import { rolesRoutes } from './routes/roles';
import { analyticsRoutes } from './routes/analytics';
import { deliveryRoutes } from './routes/delivery';
import { findEligibleConversations } from './scheduler/eligible-conversations';

const server = Fastify({ logger: true });
const prisma = new PrismaClient();
const redis = new Redis(env.REDIS_URL);

server.get('/health', { logLevel: 'warn' }, async () => ({
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

server.register((instance) => configRoutes(instance, prisma));
server.register((instance) => rolesRoutes(instance, prisma));

async function start() {
  const apiKey = env.LLM_PROVIDER === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(`Missing API key for LLM provider "${env.LLM_PROVIDER}". Set ${env.LLM_PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} env var.`);
  }
  const llm = createLlmProvider({
    provider: env.LLM_PROVIDER,
    apiKey,
    model: env.LLM_PROVIDER === 'openai' ? env.OPENAI_MODEL : env.ANTHROPIC_MODEL,
  });

  const tracerRef: TracerRef = { current: null };
  const graph = buildAgentGraph(llm, tracerRef);
  const stateManager = new RedisStateManager(redis);
  const persistence = new MongoPersistence(prisma);

  const zmqListener = new ZmqAgentListener(env.ZMQ_HOST, env.ZMQ_PULL_PORT);
  const zmqPublisher = new ZmqAgentPublisher(env.ZMQ_HOST, env.ZMQ_PUB_PORT);

  await zmqListener.initialize();
  await zmqPublisher.initialize();

  const configCache = new ConfigCache(redis, persistence);
  const budgetManager = new DailyBudgetManager(redis);
  await configCache.startListening();

  server.register((instance) => analyticsRoutes(instance, { stateManager, persistence }));

  const deliveryQueue = new DeliveryQueue(zmqPublisher, persistence, stateManager);
  server.register((instance) => deliveryRoutes(instance, deliveryQueue));
  const reactiveHandler = new ReactiveHandler(llm, persistence, stateManager, deliveryQueue);
  const scanner = new ConversationScanner(graph, persistence, stateManager, deliveryQueue, redis, configCache, budgetManager, tracerRef);

  zmqListener.onEvent(async (event) => {
    if (event.type !== 'agent:new-message') return;

    const msg = event as AgentNewMessage;

    // 1. Update sliding window (always)
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
    const config = await persistence.getAgentConfig(msg.conversationId);
    const windowSize = config?.useFullHistory ? 250 : (config?.contextWindowSize ?? env.AGENT_SLIDING_WINDOW_SIZE);
    const window = messages.slice(-windowSize);
    await stateManager.setMessages(msg.conversationId, window);

    // 2. Check for interpellation (reactive mode)
    const controlledUsers = await persistence.getControlledUsers(msg.conversationId);
    if (controlledUsers.length === 0) return;

    const controlledUserIds = new Set(controlledUsers.map((u) => u.userId));

    // Resolve replyToUserId from sliding window, fallback to DB
    let replyToUserId: string | undefined;
    if (msg.replyToId) {
      const repliedMessage = window.find((m) => m.id === msg.replyToId);
      if (repliedMessage && controlledUserIds.has(repliedMessage.senderId)) {
        replyToUserId = repliedMessage.senderId;
      } else if (!repliedMessage) {
        try {
          const dbMsg = await prisma.message.findUnique({
            where: { id: msg.replyToId },
            select: { senderId: true },
          });
          if (dbMsg?.senderId && controlledUserIds.has(dbMsg.senderId)) {
            replyToUserId = dbMsg.senderId;
          }
        } catch {
          // Non-blocking: if DB lookup fails, skip reply detection
        }
      }
    }

    const controlledUsernames = new Map(
      controlledUsers.map((u) => [u.username.toLowerCase(), u.userId]),
    );

    const interpellation = detectInterpellation({
      mentionedUserIds: msg.mentionedUserIds,
      replyToUserId,
      content: msg.content,
      controlledUserIds,
      controlledUsernames,
    });

    if (interpellation.detected) {
      // Route to reactive handler (2 LLM calls)
      server.log.info(`[Agent] Interpellation detected in conv=${msg.conversationId}: type=${interpellation.type} targets=${interpellation.targetUserIds.join(',')}`);
      reactiveHandler.handleInterpellation({
        conversationId: msg.conversationId,
        triggerMessage: newEntry,
        mentionedUserIds: msg.mentionedUserIds,
        replyToUserId,
        targetUserIds: interpellation.targetUserIds,
        interpellationType: interpellation.type,
      }).catch((err) => {
        server.log.error(`[Agent] Reactive handler error for conv=${msg.conversationId}:`, err);
      });
    }
    // If no interpellation: message is stored, periodic scanner will handle it
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

  // STARTUP SUMMARY LOGGING
  try {
    const globalConfig = await configCache.getGlobalConfig();
    const scanOptions = {
      eligibleTypes: globalConfig?.eligibleConversationTypes ?? ['group', 'channel', 'public', 'global'],
      freshnessHours: globalConfig?.messageFreshnessHours ?? 24,
    };
    const eligible = await findEligibleConversations(persistence, scanOptions);
    server.log.info(`[Startup] Monitoring ${eligible.length} eligible conversations`);
  } catch (err) {
    server.log.error({ err }, '[Startup] Failed to log monitoring summary');
  }

  await server.listen({ port: env.PORT, host: '0.0.0.0' });
  server.log.info(`Agent service running on port ${env.PORT} with ${llm.name} provider`);

  const shutdown = async () => {
    server.log.info('Shutting down agent service...');
    scanner.stop();
    deliveryQueue.clearAll();
    await configCache.stopListening();
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
