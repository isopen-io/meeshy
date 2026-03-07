import 'dotenv/config';
import Fastify from 'fastify';
import Redis from 'ioredis';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { env } from './env';
import { createLlmProvider } from './llm/llm-factory';
import { buildAgentGraph } from './graph/graph';
import { ZmqAgentListener } from './zmq/zmq-listener';
import { ZmqAgentPublisher } from './zmq/zmq-publisher';
import { TriggerEngine } from './triggers/trigger-engine';
import { RedisStateManager } from './memory/redis-state';
import { MongoPersistence } from './memory/mongo-persistence';
import type { AgentNewMessage } from './zmq/types';
import type { MessageEntry } from './graph/state';
import { configRoutes } from './routes/config';
import { rolesRoutes } from './routes/roles';

const server = Fastify({ logger: true });
const prisma = new PrismaClient();
const redis = new Redis(env.REDIS_URL);

server.get('/health', async () => ({
  status: 'ok',
  service: 'agent',
  uptime: process.uptime(),
  provider: env.LLM_PROVIDER,
}));

// Debug: ZMQ status
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
  const triggerEngine = new TriggerEngine();

  const zmqListener = new ZmqAgentListener(env.ZMQ_HOST, env.ZMQ_PULL_PORT);
  const zmqPublisher = new ZmqAgentPublisher(env.ZMQ_HOST, env.ZMQ_PUB_PORT);

  await zmqListener.initialize();
  await zmqPublisher.initialize();

  zmqListener.onEvent(async (event) => {
    if (event.type !== 'agent:new-message') return;

    const msg = event as AgentNewMessage;
    let config = await persistence.getAgentConfig(msg.conversationId);

    // Default config if none exists (Animator active by default)
    if (!config) {
      // @ts-ignore - Minimal default config
      config = { enabled: true, contextWindowSize: 50, useFullHistory: false, agentType: 'animator' };
    }

    if (!config?.enabled) return;

    const messages = await stateManager.getMessages(msg.conversationId);
    const newEntry: MessageEntry = {
      id: msg.messageId,
      senderId: msg.senderId,
      senderName: msg.senderDisplayName ?? msg.senderId,
      content: msg.content,
      timestamp: msg.timestamp,
      replyToId: msg.replyToId,
    };
    messages.push(newEntry);
    const windowSize = config.useFullHistory ? 250 : (config.contextWindowSize ?? env.AGENT_SLIDING_WINDOW_SIZE);
    const window = messages.slice(-windowSize);
    await stateManager.setMessages(msg.conversationId, window);

    // Run graph immediately — TriggerEngine registration happens separately via config
    await runGraph(msg.conversationId, {
      type: 'user_message',
      triggeredByMessageId: msg.messageId,
      triggeredByUserId: msg.senderId,
    });
  });

  const runGraph = async (conversationId: string, triggerContext: { type: string; triggeredByMessageId?: string; triggeredByUserId?: string }) => {
    const [messages, summary, toneProfiles, controlledUsers] = await Promise.all([
      stateManager.getMessages(conversationId),
      stateManager.getSummary(conversationId),
      stateManager.getToneProfiles(conversationId),
      persistence.getControlledUsers(conversationId),
    ]);
    let config = await persistence.getAgentConfig(conversationId);

    if (!config) {
      // @ts-ignore
      config = { enabled: true, contextWindowSize: 50, useFullHistory: false, agentType: 'animator' };
    }

    server.log.info(`[Agent] runGraph conv=${conversationId} trigger=${triggerContext.type} controlledUsers=${controlledUsers.length} messages=${messages.length}`);

    const result = await graph.invoke({
      conversationId,
      messages,
      summary,
      toneProfiles,
      controlledUsers,
      triggerContext: triggerContext as any,
      pendingResponse: null,
      decision: 'skip',
      selectedUserId: null,
      contextWindowSize: config?.contextWindowSize ?? 50,
      agentType: config?.agentType ?? 'personal',
      useFullHistory: config?.useFullHistory ?? false,
    });

    if (result.summary) await stateManager.setSummary(conversationId, result.summary);
    if (result.toneProfiles) await stateManager.setToneProfiles(conversationId, result.toneProfiles);

    if (result.pendingResponse) {
      await zmqPublisher.publish(result.pendingResponse);
    }
  };

  // Debug: test event via HTTP (bypasses ZMQ)
  server.post('/debug/test-event', async (request) => {
    const body = request.body as any;
    const conversationId = body?.conversationId ?? 'test-conv';
    const content = body?.content ?? 'Test message from debug endpoint';
    const senderId = body?.senderId ?? 'debug-user';

    server.log.info(`[Debug] test-event received: conv=${conversationId} content="${content}"`);

    try {
      await runGraph(conversationId, {
        type: 'user_message',
        triggeredByMessageId: `debug-${Date.now()}`,
        triggeredByUserId: senderId,
      });
      return { success: true, message: 'Graph executed' };
    } catch (error) {
      server.log.error(`[Debug] test-event error: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  zmqListener.startListening().catch((error) => {
    server.log.error('ZMQ listener error:', error);
  });

  await server.listen({ port: env.PORT, host: '0.0.0.0' });
  server.log.info(`Agent service running on port ${env.PORT} with ${llm.name} provider`);

  const shutdown = async () => {
    server.log.info('Shutting down agent service...');
    triggerEngine.clearAll();
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
