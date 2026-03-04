# Conversation Agent Service — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an autonomous AI agent service that follows conversations, builds user role profiles, and responds intelligently on behalf of inactive or configured users.

**Architecture:** New `services/agent/` TypeScript service using Fastify 5 + LangGraph.js + OpenAI API. Communicates with gateway via ZMQ (PULL:5560/PUB:5561). Three sub-agents: Observer (synthesis), Impersonator (configured user), Animator (takeover users). LLM provider is swappable via adapter pattern.

**Tech Stack:** Fastify 5, @langchain/langgraph, openai SDK, zeromq, @prisma/client, ioredis, zod, @meeshy/shared

**Design Doc:** `docs/plans/2026-03-04-conversation-agent-design.md`

---

## Task 1: Service Scaffolding

**Files:**
- Create: `services/agent/package.json`
- Create: `services/agent/tsconfig.json`
- Create: `services/agent/src/env.ts`
- Create: `services/agent/src/server.ts`
- Create: `services/agent/.env.example`
- Reference: `services/gateway/package.json` (dependency pattern)
- Reference: `turbo.json` (workspace auto-discovery via `services/*`)

**Step 1: Create package.json**

```json
{
  "name": "@meeshy/agent",
  "version": "1.0.0",
  "description": "Autonomous conversation agent service for Meeshy",
  "private": true,
  "main": "dist/src/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node -r dotenv/config dist/src/server.js",
    "dev": "tsx watch -r dotenv/config src/server.ts",
    "generate": "prisma generate --schema=../../packages/shared/prisma/schema.prisma",
    "test": "jest --config=jest.config.json",
    "test:watch": "jest --config=jest.config.json --watch",
    "test:coverage": "jest --config=jest.config.json --coverage",
    "lint": "eslint src/",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist node_modules coverage"
  },
  "dependencies": {
    "@langchain/langgraph": "^0.2.0",
    "@langchain/core": "^0.3.0",
    "@meeshy/shared": "workspace:*",
    "@prisma/client": "^6.19.2",
    "dotenv": "^17.2.3",
    "fastify": "^5.7.1",
    "ioredis": "^5.9.2",
    "openai": "^4.80.0",
    "pino": "^9.14.0",
    "pino-pretty": "^11.3.0",
    "zeromq": "^6.5.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@jest/globals": "^30.2.0",
    "@types/jest": "^30.0.0",
    "@types/node": "^20.19.30",
    "jest": "^30.2.0",
    "prisma": "^6.19.2",
    "ts-jest": "^29.4.6",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "paths": {
      "@meeshy/shared": ["../../packages/shared/src"],
      "@meeshy/shared/*": ["../../packages/shared/src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create .env.example**

```env
# Agent Service
PORT=3200
NODE_ENV=development

# LLM Provider
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-your-key-here
OPENAI_MODEL=gpt-4o-mini

# ZMQ
ZMQ_PULL_PORT=5560
ZMQ_PUB_PORT=5561
ZMQ_HOST=0.0.0.0

# Database
DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0

# Redis
REDIS_URL=redis://localhost:6379

# Agent Defaults
AGENT_SLIDING_WINDOW_SIZE=50
AGENT_ROLE_LOCK_THRESHOLD=0.8
AGENT_DEFAULT_TIMEOUT_SECONDS=300
AGENT_DEFAULT_COOLDOWN_SECONDS=60
```

**Step 4: Create src/env.ts**

```typescript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3200),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-20250514'),

  ZMQ_PULL_PORT: z.coerce.number().default(5560),
  ZMQ_PUB_PORT: z.coerce.number().default(5561),
  ZMQ_HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  AGENT_SLIDING_WINDOW_SIZE: z.coerce.number().default(50),
  AGENT_ROLE_LOCK_THRESHOLD: z.coerce.number().default(0.8),
  AGENT_DEFAULT_TIMEOUT_SECONDS: z.coerce.number().default(300),
  AGENT_DEFAULT_COOLDOWN_SECONDS: z.coerce.number().default(60),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
```

**Step 5: Create src/server.ts (minimal)**

```typescript
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
```

**Step 6: Create jest.config.json**

```json
{
  "preset": "ts-jest",
  "testEnvironment": "node",
  "roots": ["<rootDir>/src"],
  "testMatch": ["**/__tests__/**/*.test.ts"],
  "moduleNameMapper": {
    "^@meeshy/shared(.*)$": "<rootDir>/../../packages/shared/src$1"
  },
  "transform": {
    "^.+\\.tsx?$": ["ts-jest", { "tsconfig": "tsconfig.json" }]
  }
}
```

**Step 7: Install dependencies and verify build**

Run: `cd services/agent && pnpm install`
Run: `pnpm build`
Expected: Compiles without errors

**Step 8: Verify dev server starts**

Run: `cd services/agent && pnpm dev`
Expected: Server starts on port 3200, `/health` returns `{ status: 'ok' }`

**Step 9: Commit**

```bash
git add services/agent/
git commit -m "feat(agent): scaffold agent service with Fastify, env config, health endpoint"
```

---

## Task 2: Prisma Schema — Agent Models

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (add 4 models at end of file)
- Reference: Lines 238 (Conversation model), 465 (Message model)

**Step 1: Add AgentConfig model to schema.prisma**

Append after the last model in the file:

```prisma
// =============================================================================
// AGENT SERVICE MODELS
// =============================================================================

model AgentConfig {
  id                       String   @id @default(auto()) @map("_id") @db.ObjectId
  conversationId           String   @db.ObjectId
  enabled                  Boolean  @default(false)
  configuredBy             String   @db.ObjectId

  manualUserIds            String[] @db.ObjectId
  autoPickupEnabled        Boolean  @default(false)
  inactivityThresholdHours Int      @default(72)
  minHistoricalMessages    Int      @default(0)
  maxControlledUsers       Int      @default(5)
  excludedRoles            String[]
  excludedUserIds          String[] @db.ObjectId

  triggerOnTimeout         Boolean  @default(true)
  timeoutSeconds           Int      @default(300)
  triggerOnUserMessage     Boolean  @default(false)
  triggerFromUserIds       String[] @db.ObjectId
  triggerOnReplyTo         Boolean  @default(true)

  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  conversation             Conversation @relation(fields: [conversationId], references: [id])

  @@unique([conversationId])
  @@map("agent_configs")
}

model AgentUserRole {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  userId            String   @db.ObjectId
  conversationId    String   @db.ObjectId

  origin            String
  archetypeId       String?

  personaSummary    String
  tone              String
  vocabularyLevel   String
  typicalLength     String
  emojiUsage        String
  topicsOfExpertise String[]
  topicsAvoided     String[]
  relationshipMap   Json
  catchphrases      String[]
  responseTriggers  String[]
  silenceTriggers   String[]

  messagesAnalyzed  Int      @default(0)
  confidence        Float    @default(0.0)
  locked            Boolean  @default(false)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([userId, conversationId])
  @@index([conversationId])
  @@map("agent_user_roles")
}

model AgentConversationSummary {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  conversationId  String   @db.ObjectId

  summary         String
  currentTopics   String[]
  overallTone     String
  lastMessageId   String   @db.ObjectId
  messageCount    Int

  updatedAt       DateTime @updatedAt

  @@unique([conversationId])
  @@map("agent_conversation_summaries")
}

model AgentLlmConfig {
  id               String   @id @default(auto()) @map("_id") @db.ObjectId
  provider         String   @default("openai")
  model            String   @default("gpt-4o-mini")
  apiKeyEncrypted  String
  baseUrl          String?
  maxTokens        Int      @default(1024)
  temperature      Float    @default(0.7)

  dailyBudgetUsd   Float    @default(20.0)
  maxCostPerCall   Float    @default(0.05)

  fallbackProvider String?
  fallbackModel    String?
  fallbackApiKeyEncrypted String?

  configuredBy     String   @db.ObjectId
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@map("agent_llm_configs")
}
```

**Step 2: Add relation to Conversation model**

Find the Conversation model (line ~238) and add the `agentConfig` relation field alongside the existing relations:

```prisma
agentConfig     AgentConfig?
```

**Step 3: Generate Prisma client**

Run: `cd services/gateway && pnpm generate`
Run: `cd services/agent && pnpm generate`
Expected: Prisma client generated successfully with new models

**Step 4: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(schema): add AgentConfig, AgentUserRole, AgentConversationSummary, AgentLlmConfig models"
```

---

## Task 3: LLM Provider Adapter

**Files:**
- Create: `services/agent/src/llm/types.ts`
- Create: `services/agent/src/llm/llm-factory.ts`
- Create: `services/agent/src/llm/providers/openai-provider.ts`
- Create: `services/agent/src/llm/providers/anthropic-provider.ts`
- Test: `services/agent/src/__tests__/llm/llm-factory.test.ts`

**Step 1: Write the failing test**

```typescript
// services/agent/src/__tests__/llm/llm-factory.test.ts
import { createLlmProvider } from '../../llm/llm-factory';

describe('LLM Factory', () => {
  it('creates an OpenAI provider', () => {
    const provider = createLlmProvider({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
    });
    expect(provider.name).toBe('openai');
  });

  it('creates an Anthropic provider', () => {
    const provider = createLlmProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
    });
    expect(provider.name).toBe('anthropic');
  });

  it('throws on unknown provider', () => {
    expect(() => createLlmProvider({
      provider: 'unknown' as any,
      apiKey: 'test-key',
      model: 'model',
    })).toThrow('Unknown LLM provider: unknown');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd services/agent && pnpm test -- --testPathPattern=llm-factory`
Expected: FAIL — modules not found

**Step 3: Create types.ts**

```typescript
// services/agent/src/llm/types.ts
export type LlmRole = 'system' | 'user' | 'assistant';

export type LlmMessage = {
  role: LlmRole;
  content: string;
};

export type LlmChatParams = {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
};

export type LlmChatResponse = {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  latencyMs: number;
};

export type LlmProvider = {
  readonly name: string;
  chat(params: LlmChatParams): Promise<LlmChatResponse>;
};

export type LlmProviderConfig = {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
};
```

**Step 4: Create openai-provider.ts**

```typescript
// services/agent/src/llm/providers/openai-provider.ts
import OpenAI from 'openai';
import type { LlmProvider, LlmChatParams, LlmChatResponse, LlmProviderConfig } from '../types';

export function createOpenAiProvider(config: LlmProviderConfig): LlmProvider {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return {
    name: 'openai',

    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      const startTime = Date.now();

      const messages: OpenAI.ChatCompletionMessageParam[] = [];
      if (params.systemPrompt) {
        messages.push({ role: 'system', content: params.systemPrompt });
      }
      for (const msg of params.messages) {
        messages.push({ role: msg.role, content: msg.content });
      }

      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        temperature: params.temperature ?? config.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? config.maxTokens ?? 1024,
      });

      const choice = response.choices[0];

      return {
        content: choice?.message?.content ?? '',
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
        model: response.model,
        latencyMs: Date.now() - startTime,
      };
    },
  };
}
```

**Step 5: Create anthropic-provider.ts**

```typescript
// services/agent/src/llm/providers/anthropic-provider.ts
import type { LlmProvider, LlmChatParams, LlmChatResponse, LlmProviderConfig } from '../types';

export function createAnthropicProvider(config: LlmProviderConfig): LlmProvider {
  // Dynamic import to avoid requiring the SDK when using OpenAI
  let Anthropic: any;

  return {
    name: 'anthropic',

    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      if (!Anthropic) {
        const mod = await import('@anthropic-ai/sdk');
        Anthropic = mod.default;
      }

      const client = new Anthropic({ apiKey: config.apiKey });
      const startTime = Date.now();

      const messages = params.messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      const response = await client.messages.create({
        model: config.model,
        max_tokens: params.maxTokens ?? config.maxTokens ?? 1024,
        temperature: params.temperature ?? config.temperature ?? 0.7,
        system: params.systemPrompt,
        messages,
      });

      const textBlock = response.content.find((b: any) => b.type === 'text');

      return {
        content: textBlock?.text ?? '',
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
        model: response.model,
        latencyMs: Date.now() - startTime,
      };
    },
  };
}
```

**Step 6: Create llm-factory.ts**

```typescript
// services/agent/src/llm/llm-factory.ts
import type { LlmProvider, LlmProviderConfig } from './types';
import { createOpenAiProvider } from './providers/openai-provider';
import { createAnthropicProvider } from './providers/anthropic-provider';

export function createLlmProvider(config: LlmProviderConfig): LlmProvider {
  switch (config.provider) {
    case 'openai':
      return createOpenAiProvider(config);
    case 'anthropic':
      return createAnthropicProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${(config as any).provider}`);
  }
}

export { type LlmProvider, type LlmProviderConfig, type LlmChatParams, type LlmChatResponse } from './types';
```

**Step 7: Run tests**

Run: `cd services/agent && pnpm test -- --testPathPattern=llm-factory`
Expected: PASS (3 tests)

**Step 8: Commit**

```bash
git add services/agent/src/llm/ services/agent/src/__tests__/llm/
git commit -m "feat(agent): add LLM provider adapter with OpenAI and Anthropic support"
```

---

## Task 4: ZMQ Communication Layer

**Files:**
- Create: `services/agent/src/zmq/zmq-listener.ts`
- Create: `services/agent/src/zmq/zmq-publisher.ts`
- Create: `services/agent/src/zmq/types.ts`
- Test: `services/agent/src/__tests__/zmq/zmq-types.test.ts`
- Reference: `services/gateway/src/services/zmq-translation/ZmqConnectionManager.ts` (pattern)

**Step 1: Create ZMQ types**

```typescript
// services/agent/src/zmq/types.ts
import { z } from 'zod';

export const agentNewMessageSchema = z.object({
  type: z.literal('agent:new-message'),
  conversationId: z.string(),
  messageId: z.string(),
  senderId: z.string(),
  senderDisplayName: z.string().optional(),
  content: z.string(),
  originalLanguage: z.string(),
  replyToId: z.string().optional(),
  timestamp: z.number(),
});

export const agentConfigUpdatedSchema = z.object({
  type: z.literal('agent:config-updated'),
  conversationId: z.string(),
  config: z.record(z.unknown()),
});

export const agentUserStatusSchema = z.object({
  type: z.literal('agent:user-status-changed'),
  userId: z.string(),
  isOnline: z.boolean(),
  lastActiveAt: z.string(),
});

export const agentEventSchema = z.discriminatedUnion('type', [
  agentNewMessageSchema,
  agentConfigUpdatedSchema,
  agentUserStatusSchema,
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentNewMessage = z.infer<typeof agentNewMessageSchema>;

export type AgentResponse = {
  type: 'agent:response';
  conversationId: string;
  asUserId: string;
  content: string;
  replyToId?: string;
  messageSource: 'agent';
  metadata: {
    agentType: 'impersonator' | 'animator';
    roleConfidence: number;
    archetypeId?: string;
  };
};
```

**Step 2: Write type validation test**

```typescript
// services/agent/src/__tests__/zmq/zmq-types.test.ts
import { agentEventSchema, agentNewMessageSchema } from '../../zmq/types';

describe('ZMQ Types', () => {
  it('validates a new message event', () => {
    const event = {
      type: 'agent:new-message',
      conversationId: '507f1f77bcf86cd799439011',
      messageId: '507f1f77bcf86cd799439012',
      senderId: '507f1f77bcf86cd799439013',
      content: 'Bonjour tout le monde',
      originalLanguage: 'fr',
      timestamp: Date.now(),
    };
    const result = agentNewMessageSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects invalid event type', () => {
    const event = { type: 'unknown', data: 'test' };
    const result = agentEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});
```

**Step 3: Run test to verify it passes**

Run: `cd services/agent && pnpm test -- --testPathPattern=zmq-types`
Expected: PASS

**Step 4: Create zmq-listener.ts**

```typescript
// services/agent/src/zmq/zmq-listener.ts
import * as zmq from 'zeromq';
import { agentEventSchema, type AgentEvent } from './types';

export type AgentEventHandler = (event: AgentEvent) => Promise<void>;

export class ZmqAgentListener {
  private pullSocket: zmq.Pull | null = null;
  private running = false;
  private handler: AgentEventHandler | null = null;

  constructor(
    private host: string,
    private port: number,
  ) {}

  onEvent(handler: AgentEventHandler): void {
    this.handler = handler;
  }

  async initialize(): Promise<void> {
    this.pullSocket = new zmq.Pull();
    await this.pullSocket.bind(`tcp://${this.host}:${this.port}`);
    console.log(`[ZMQ-Agent] PULL socket bound on ${this.host}:${this.port}`);
  }

  async startListening(): Promise<void> {
    if (!this.pullSocket || !this.handler) {
      throw new Error('ZMQ listener not initialized or no handler registered');
    }

    this.running = true;
    console.log('[ZMQ-Agent] Listening for events...');

    for await (const [msg] of this.pullSocket) {
      if (!this.running) break;

      try {
        const raw = JSON.parse(msg.toString());
        const parsed = agentEventSchema.safeParse(raw);

        if (!parsed.success) {
          console.warn('[ZMQ-Agent] Invalid event received:', parsed.error.message);
          continue;
        }

        await this.handler(parsed.data);
      } catch (error) {
        console.error('[ZMQ-Agent] Error processing event:', error);
      }
    }
  }

  async close(): Promise<void> {
    this.running = false;
    if (this.pullSocket) {
      await this.pullSocket.close();
      this.pullSocket = null;
    }
    console.log('[ZMQ-Agent] Listener closed');
  }
}
```

**Step 5: Create zmq-publisher.ts**

```typescript
// services/agent/src/zmq/zmq-publisher.ts
import * as zmq from 'zeromq';
import type { AgentResponse } from './types';

export class ZmqAgentPublisher {
  private pubSocket: zmq.Publisher | null = null;

  constructor(
    private host: string,
    private port: number,
  ) {}

  async initialize(): Promise<void> {
    this.pubSocket = new zmq.Publisher();
    await this.pubSocket.bind(`tcp://${this.host}:${this.port}`);
    console.log(`[ZMQ-Agent] PUB socket bound on ${this.host}:${this.port}`);
  }

  async publish(response: AgentResponse): Promise<void> {
    if (!this.pubSocket) {
      throw new Error('ZMQ publisher not initialized');
    }

    const data = JSON.stringify(response);
    await this.pubSocket.send(data);
    console.log(`[ZMQ-Agent] Published response for conversation ${response.conversationId} as user ${response.asUserId}`);
  }

  async close(): Promise<void> {
    if (this.pubSocket) {
      await this.pubSocket.close();
      this.pubSocket = null;
    }
    console.log('[ZMQ-Agent] Publisher closed');
  }
}
```

**Step 6: Commit**

```bash
git add services/agent/src/zmq/ services/agent/src/__tests__/zmq/
git commit -m "feat(agent): add ZMQ listener (PULL:5560) and publisher (PUB:5561)"
```

---

## Task 5: Archetypes Catalog

**Files:**
- Create: `services/agent/src/archetypes/catalog.ts`
- Create: `services/agent/src/archetypes/enrichment.ts`
- Test: `services/agent/src/__tests__/archetypes/catalog.test.ts`

**Step 1: Write failing test**

```typescript
// services/agent/src/__tests__/archetypes/catalog.test.ts
import { getArchetype, listArchetypes } from '../../archetypes/catalog';
import { enrichArchetypeWithProfile } from '../../archetypes/enrichment';

describe('Archetypes', () => {
  it('returns all archetypes', () => {
    const archetypes = listArchetypes();
    expect(archetypes.length).toBeGreaterThanOrEqual(5);
    expect(archetypes.map((a) => a.id)).toContain('curious');
  });

  it('returns a specific archetype', () => {
    const archetype = getArchetype('skeptic');
    expect(archetype).toBeDefined();
    expect(archetype!.tone).toBeDefined();
  });

  it('returns undefined for unknown archetype', () => {
    expect(getArchetype('nonexistent')).toBeUndefined();
  });

  it('enriches archetype with user profile metadata', () => {
    const archetype = getArchetype('curious')!;
    const enriched = enrichArchetypeWithProfile(archetype, {
      bio: 'Développeur iOS passionné par Swift et SwiftUI',
      communities: ['ios-dev', 'swift-lang'],
    });
    expect(enriched.topicsOfExpertise).toEqual(
      expect.arrayContaining(expect.arrayContaining([])),
    );
    expect(enriched.confidence).toBeGreaterThan(archetype.confidence);
  });
});
```

**Step 2: Run test — expected FAIL**

**Step 3: Create catalog.ts**

```typescript
// services/agent/src/archetypes/catalog.ts
export type Archetype = {
  id: string;
  name: string;
  personaSummary: string;
  tone: string;
  vocabularyLevel: string;
  typicalLength: string;
  emojiUsage: string;
  topicsOfExpertise: string[];
  responseTriggers: string[];
  silenceTriggers: string[];
  catchphrases: string[];
  confidence: number;
};

const ARCHETYPES: Archetype[] = [
  {
    id: 'curious',
    name: 'Le Curieux',
    personaSummary: 'Pose des questions, creuse les sujets, veut toujours en savoir plus',
    tone: 'enthousiaste',
    vocabularyLevel: 'courant',
    typicalLength: 'moyen',
    emojiUsage: 'occasionnel',
    topicsOfExpertise: [],
    responseTriggers: ['annonce', 'nouveau sujet', 'information technique'],
    silenceTriggers: ['conflit', 'sujet sensible'],
    catchphrases: ['Intéressant !', 'Comment ça marche ?', 'Tu peux développer ?'],
    confidence: 0.4,
  },
  {
    id: 'enthusiast',
    name: "L'Enthousiaste",
    personaSummary: 'Positif, encourageant, soutient les idées des autres',
    tone: 'chaleureux',
    vocabularyLevel: 'courant',
    typicalLength: 'court',
    emojiUsage: 'abondant',
    topicsOfExpertise: [],
    responseTriggers: ['réussite', 'idée nouvelle', 'partage personnel'],
    silenceTriggers: ['débat technique profond', 'critique'],
    catchphrases: ['Super !', 'Bravo !', 'J\'adore cette idée !'],
    confidence: 0.4,
  },
  {
    id: 'skeptic',
    name: 'Le Sceptique',
    personaSummary: 'Challenge les idées, demande des preuves, joue l\'avocat du diable',
    tone: 'analytique',
    vocabularyLevel: 'soutenu',
    typicalLength: 'moyen',
    emojiUsage: 'jamais',
    topicsOfExpertise: [],
    responseTriggers: ['affirmation forte', 'statistique', 'généralisation'],
    silenceTriggers: ['humour léger', 'small talk'],
    catchphrases: ['Tu es sûr ?', 'Source ?', 'Ça dépend du contexte'],
    confidence: 0.4,
  },
  {
    id: 'pragmatic',
    name: 'Le Pragmatique',
    personaSummary: 'Orienté solutions, va droit au but, cherche l\'efficacité',
    tone: 'direct',
    vocabularyLevel: 'courant',
    typicalLength: 'court',
    emojiUsage: 'jamais',
    topicsOfExpertise: [],
    responseTriggers: ['problème posé', 'demande d\'aide', 'décision à prendre'],
    silenceTriggers: ['bavardage', 'débat philosophique'],
    catchphrases: ['Concrètement...', 'La solution serait de...', 'Voici ce que je ferais'],
    confidence: 0.4,
  },
  {
    id: 'social',
    name: 'Le Social',
    personaSummary: 'Connecteur, relance les conversations, inclut tout le monde',
    tone: 'amical',
    vocabularyLevel: 'familier',
    typicalLength: 'moyen',
    emojiUsage: 'abondant',
    topicsOfExpertise: [],
    responseTriggers: ['silence prolongé', 'nouveau membre', 'question sans réponse'],
    silenceTriggers: ['discussion technique pointue'],
    catchphrases: ['Et toi, t\'en penses quoi ?', 'On en parle ?', 'Ça me rappelle...'],
    confidence: 0.4,
  },
];

export function listArchetypes(): Archetype[] {
  return [...ARCHETYPES];
}

export function getArchetype(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}
```

**Step 4: Create enrichment.ts**

```typescript
// services/agent/src/archetypes/enrichment.ts
import type { Archetype } from './catalog';

type UserProfileMetadata = {
  bio?: string;
  communities?: string[];
  interests?: string[];
  displayName?: string;
};

export function enrichArchetypeWithProfile(
  archetype: Archetype,
  profile: UserProfileMetadata,
): Archetype {
  const enrichedTopics = [...archetype.topicsOfExpertise];

  if (profile.bio) {
    const bioKeywords = extractKeywords(profile.bio);
    enrichedTopics.push(...bioKeywords);
  }

  if (profile.communities) {
    enrichedTopics.push(...profile.communities);
  }

  if (profile.interests) {
    enrichedTopics.push(...profile.interests);
  }

  return {
    ...archetype,
    origin: 'hybrid',
    topicsOfExpertise: [...new Set(enrichedTopics)],
    confidence: Math.min(archetype.confidence + 0.1, 0.6),
  } as Archetype;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'par',
    'pour', 'avec', 'sur', 'est', 'sont', 'the', 'a', 'an', 'and', 'or',
    'by', 'for', 'with', 'on', 'is', 'are', 'in', 'to', 'of',
  ]);

  return text
    .toLowerCase()
    .split(/[\s,;.!?()]+/)
    .filter((word) => word.length > 3 && !stopWords.has(word))
    .slice(0, 10);
}
```

**Step 5: Run tests**

Run: `cd services/agent && pnpm test -- --testPathPattern=catalog`
Expected: PASS

**Step 6: Commit**

```bash
git add services/agent/src/archetypes/ services/agent/src/__tests__/archetypes/
git commit -m "feat(agent): add archetype catalog with 5 personas and profile enrichment"
```

---

## Task 6: LangGraph State & Graph Definition

**Files:**
- Create: `services/agent/src/graph/state.ts`
- Create: `services/agent/src/graph/graph.ts`
- Create: `services/agent/src/graph/router.ts`
- Test: `services/agent/src/__tests__/graph/router.test.ts`

**Step 1: Create state.ts**

```typescript
// services/agent/src/graph/state.ts
import { Annotation } from '@langchain/langgraph';
import type { AgentResponse } from '../zmq/types';

export type MessageEntry = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  replyToId?: string;
};

export type ToneProfile = {
  userId: string;
  displayName: string;
  origin: 'observed' | 'archetype' | 'hybrid';
  archetypeId?: string;
  personaSummary: string;
  tone: string;
  vocabularyLevel: string;
  typicalLength: string;
  emojiUsage: string;
  topicsOfExpertise: string[];
  topicsAvoided: string[];
  relationshipMap: Record<string, string>;
  catchphrases: string[];
  responseTriggers: string[];
  silenceTriggers: string[];
  messagesAnalyzed: number;
  confidence: number;
  locked: boolean;
};

export type ControlledUser = {
  userId: string;
  displayName: string;
  source: 'manual' | 'auto_rule';
  role: ToneProfile;
};

export type TriggerContext = {
  type: 'timeout' | 'user_message' | 'reply_to' | 'periodic';
  triggeredByMessageId?: string;
  triggeredByUserId?: string;
};

export const ConversationStateAnnotation = Annotation.Root({
  conversationId: Annotation<string>,
  messages: Annotation<MessageEntry[]>({
    reducer: (current, update) => {
      const combined = [...current, ...update];
      return combined.slice(-50);
    },
    default: () => [],
  }),
  summary: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  toneProfiles: Annotation<Record<string, ToneProfile>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  controlledUsers: Annotation<ControlledUser[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  triggerContext: Annotation<TriggerContext | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  pendingResponse: Annotation<AgentResponse | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  decision: Annotation<'impersonate' | 'animate' | 'skip'>({
    reducer: (_current, update) => update,
    default: () => 'skip',
  }),
  selectedUserId: Annotation<string | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
});

export type ConversationState = typeof ConversationStateAnnotation.State;
```

**Step 2: Create router.ts**

```typescript
// services/agent/src/graph/router.ts
import type { ConversationState } from './state';

export function routeDecision(state: ConversationState): 'impersonate' | 'animate' | 'skip' {
  return state.decision;
}

export function routeQualityGate(state: ConversationState): 'send' | 'regenerate' {
  if (!state.pendingResponse) return 'regenerate';

  const confidence = state.pendingResponse.metadata.roleConfidence;
  if (confidence < 0.5) return 'regenerate';

  return 'send';
}
```

**Step 3: Write router test**

```typescript
// services/agent/src/__tests__/graph/router.test.ts
import { routeDecision, routeQualityGate } from '../../graph/router';

describe('Graph Router', () => {
  it('routes based on decision field', () => {
    expect(routeDecision({ decision: 'animate' } as any)).toBe('animate');
    expect(routeDecision({ decision: 'skip' } as any)).toBe('skip');
    expect(routeDecision({ decision: 'impersonate' } as any)).toBe('impersonate');
  });

  it('sends when quality is sufficient', () => {
    const state = {
      pendingResponse: { metadata: { roleConfidence: 0.8 } },
    } as any;
    expect(routeQualityGate(state)).toBe('send');
  });

  it('regenerates when confidence is too low', () => {
    const state = {
      pendingResponse: { metadata: { roleConfidence: 0.3 } },
    } as any;
    expect(routeQualityGate(state)).toBe('regenerate');
  });

  it('regenerates when no response', () => {
    expect(routeQualityGate({ pendingResponse: null } as any)).toBe('regenerate');
  });
});
```

**Step 4: Run tests**

Run: `cd services/agent && pnpm test -- --testPathPattern=router`
Expected: PASS

**Step 5: Create graph.ts**

```typescript
// services/agent/src/graph/graph.ts
import { StateGraph, START, END } from '@langchain/langgraph';
import { ConversationStateAnnotation } from './state';
import { routeDecision, routeQualityGate } from './router';
import type { LlmProvider } from '../llm/types';

export function buildAgentGraph(llm: LlmProvider) {
  // Placeholder node functions — implemented in Tasks 7-10
  const observe = async (state: typeof ConversationStateAnnotation.State) => state;
  const decide = async (state: typeof ConversationStateAnnotation.State) => state;
  const impersonate = async (state: typeof ConversationStateAnnotation.State) => state;
  const animate = async (state: typeof ConversationStateAnnotation.State) => state;
  const qualityGate = async (state: typeof ConversationStateAnnotation.State) => state;

  const graph = new StateGraph(ConversationStateAnnotation)
    .addNode('observe', observe)
    .addNode('decide', decide)
    .addNode('impersonate', impersonate)
    .addNode('animate', animate)
    .addNode('qualityGate', qualityGate)
    .addEdge(START, 'observe')
    .addEdge('observe', 'decide')
    .addConditionalEdges('decide', routeDecision, {
      impersonate: 'impersonate',
      animate: 'animate',
      skip: END,
    })
    .addEdge('impersonate', 'qualityGate')
    .addEdge('animate', 'qualityGate')
    .addConditionalEdges('qualityGate', routeQualityGate, {
      send: END,
      regenerate: 'animate',
    });

  return graph.compile();
}
```

**Step 6: Commit**

```bash
git add services/agent/src/graph/ services/agent/src/__tests__/graph/
git commit -m "feat(agent): add LangGraph StateGraph with state annotation, router, and graph definition"
```

---

## Task 7: Observer Agent

**Files:**
- Create: `services/agent/src/agents/observer.ts`
- Test: `services/agent/src/__tests__/agents/observer.test.ts`

**Step 1: Write failing test**

```typescript
// services/agent/src/__tests__/agents/observer.test.ts
import { createObserverNode } from '../../agents/observer';
import type { LlmProvider } from '../../llm/types';

const mockLlm: LlmProvider = {
  name: 'mock',
  async chat() {
    return {
      content: JSON.stringify({
        summary: 'Discussion about project deadlines',
        overallTone: 'professional',
        profiles: {
          'user1': {
            tone: 'direct',
            vocabularyLevel: 'courant',
            typicalLength: 'court',
            emojiUsage: 'jamais',
            topicsOfExpertise: ['management'],
            catchphrases: ['Concrètement'],
          },
        },
      }),
      usage: { inputTokens: 100, outputTokens: 50 },
      model: 'mock',
      latencyMs: 10,
    };
  },
};

describe('Observer Agent', () => {
  it('updates summary and tone profiles from conversation', async () => {
    const observe = createObserverNode(mockLlm);
    const result = await observe({
      conversationId: 'conv1',
      messages: [
        { id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'On doit finir le projet', timestamp: Date.now() },
        { id: 'm2', senderId: 'user2', senderName: 'Bob', content: 'OK je m\'en occupe', timestamp: Date.now() },
      ],
      summary: '',
      toneProfiles: {},
      controlledUsers: [],
      triggerContext: null,
      pendingResponse: null,
      decision: 'skip',
      selectedUserId: null,
    });

    expect(result.summary).toBeTruthy();
    expect(result.summary).not.toBe('');
  });
});
```

**Step 2: Run test — expected FAIL**

**Step 3: Create observer.ts**

```typescript
// services/agent/src/agents/observer.ts
import type { ConversationState, ToneProfile } from '../graph/state';
import type { LlmProvider } from '../llm/types';

const OBSERVER_SYSTEM_PROMPT = `Tu es un analyste conversationnel. Analyse la conversation et retourne un JSON avec:
1. "summary": un résumé concis de la conversation (max 200 mots)
2. "overallTone": le ton général (ex: "professionnel", "décontracté", "tendu")
3. "profiles": un objet avec chaque userId comme clé et un profil contenant:
   - "tone": le ton de cet utilisateur
   - "vocabularyLevel": "familier" | "courant" | "soutenu"
   - "typicalLength": "court" | "moyen" | "long"
   - "emojiUsage": "jamais" | "occasionnel" | "abondant"
   - "topicsOfExpertise": liste de sujets sur lesquels il intervient
   - "catchphrases": expressions récurrentes
   - "responseTriggers": types de messages qui le font réagir
   - "silenceTriggers": types de messages qu'il ignore

Retourne UNIQUEMENT du JSON valide, aucun texte autour.`;

export function createObserverNode(llm: LlmProvider) {
  return async function observe(state: ConversationState) {
    if (state.messages.length === 0) return state;

    const conversationText = state.messages
      .map((m) => `[${m.senderName}]: ${m.content}`)
      .join('\n');

    const contextPrompt = state.summary
      ? `Résumé précédent: ${state.summary}\n\nNouveaux messages:\n${conversationText}`
      : conversationText;

    try {
      const response = await llm.chat({
        systemPrompt: OBSERVER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contextPrompt }],
        temperature: 0.3,
        maxTokens: 1024,
      });

      const parsed = JSON.parse(response.content);

      const updatedProfiles: Record<string, ToneProfile> = { ...state.toneProfiles };

      if (parsed.profiles) {
        for (const [userId, profile] of Object.entries(parsed.profiles)) {
          const existing = updatedProfiles[userId];
          const p = profile as Record<string, unknown>;

          if (existing?.locked) continue;

          const messagesAnalyzed = (existing?.messagesAnalyzed ?? 0) +
            state.messages.filter((m) => m.senderId === userId).length;

          updatedProfiles[userId] = {
            userId,
            displayName: state.messages.find((m) => m.senderId === userId)?.senderName ?? userId,
            origin: existing?.origin ?? 'observed',
            archetypeId: existing?.archetypeId,
            personaSummary: (p.personaSummary as string) ?? existing?.personaSummary ?? '',
            tone: (p.tone as string) ?? existing?.tone ?? 'neutre',
            vocabularyLevel: (p.vocabularyLevel as string) ?? existing?.vocabularyLevel ?? 'courant',
            typicalLength: (p.typicalLength as string) ?? existing?.typicalLength ?? 'moyen',
            emojiUsage: (p.emojiUsage as string) ?? existing?.emojiUsage ?? 'occasionnel',
            topicsOfExpertise: (p.topicsOfExpertise as string[]) ?? existing?.topicsOfExpertise ?? [],
            topicsAvoided: (p.topicsAvoided as string[]) ?? existing?.topicsAvoided ?? [],
            relationshipMap: existing?.relationshipMap ?? {},
            catchphrases: (p.catchphrases as string[]) ?? existing?.catchphrases ?? [],
            responseTriggers: (p.responseTriggers as string[]) ?? existing?.responseTriggers ?? [],
            silenceTriggers: (p.silenceTriggers as string[]) ?? existing?.silenceTriggers ?? [],
            messagesAnalyzed,
            confidence: Math.min(messagesAnalyzed / 50, 1.0),
            locked: messagesAnalyzed >= 50,
          };
        }
      }

      return {
        summary: parsed.summary ?? state.summary,
        toneProfiles: updatedProfiles,
      };
    } catch (error) {
      console.error('[Observer] Error analyzing conversation:', error);
      return {};
    }
  };
}
```

**Step 4: Run tests**

Run: `cd services/agent && pnpm test -- --testPathPattern=observer`
Expected: PASS

**Step 5: Commit**

```bash
git add services/agent/src/agents/observer.ts services/agent/src/__tests__/agents/
git commit -m "feat(agent): add Observer agent node with conversation synthesis and tone profiling"
```

---

## Task 8: Decision Node & Animator Agent

**Files:**
- Create: `services/agent/src/agents/decide.ts`
- Create: `services/agent/src/agents/animator.ts`
- Test: `services/agent/src/__tests__/agents/decide.test.ts`

**Step 1: Write failing test for decide**

```typescript
// services/agent/src/__tests__/agents/decide.test.ts
import { createDecideNode } from '../../agents/decide';

describe('Decision Node', () => {
  it('skips when no controlled users', async () => {
    const decide = createDecideNode();
    const result = await decide({
      controlledUsers: [],
      messages: [{ id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Hello', timestamp: Date.now() }],
      toneProfiles: {},
      triggerContext: { type: 'timeout' },
    } as any);
    expect(result.decision).toBe('skip');
  });

  it('selects animate when controlled users exist with matching trigger', async () => {
    const decide = createDecideNode();
    const result = await decide({
      controlledUsers: [{
        userId: 'bot1',
        displayName: 'Bot',
        source: 'manual',
        role: {
          topicsOfExpertise: ['tech'],
          responseTriggers: ['question'],
          silenceTriggers: [],
          confidence: 0.8,
        },
      }],
      messages: [{ id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Question technique ?', timestamp: Date.now() }],
      toneProfiles: {},
      triggerContext: { type: 'user_message', triggeredByUserId: 'user1' },
    } as any);
    expect(result.decision).toBe('animate');
    expect(result.selectedUserId).toBe('bot1');
  });
});
```

**Step 2: Run test — expected FAIL**

**Step 3: Create decide.ts**

```typescript
// services/agent/src/agents/decide.ts
import type { ConversationState, ControlledUser } from '../graph/state';

export function createDecideNode() {
  return async function decide(state: ConversationState) {
    if (!state.controlledUsers || state.controlledUsers.length === 0) {
      return { decision: 'skip' as const, selectedUserId: null };
    }

    if (!state.triggerContext) {
      return { decision: 'skip' as const, selectedUserId: null };
    }

    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) {
      return { decision: 'skip' as const, selectedUserId: null };
    }

    // Don't respond to self (agent messages)
    const controlledIds = new Set(state.controlledUsers.map((u) => u.userId));
    if (controlledIds.has(lastMessage.senderId)) {
      return { decision: 'skip' as const, selectedUserId: null };
    }

    // Score each controlled user for relevance
    const scored = state.controlledUsers
      .map((user) => ({
        user,
        score: scoreRelevance(user, lastMessage, state),
      }))
      .filter((s) => s.score > 0.3)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return { decision: 'skip' as const, selectedUserId: null };
    }

    const selected = scored[0];
    return {
      decision: 'animate' as const,
      selectedUserId: selected.user.userId,
    };
  };
}

function scoreRelevance(
  user: ControlledUser,
  lastMessage: { senderId: string; content: string },
  state: ConversationState,
): number {
  const role = user.role;
  let score = 0;

  // Check silence triggers first (hard skip)
  for (const trigger of role.silenceTriggers) {
    if (lastMessage.content.toLowerCase().includes(trigger.toLowerCase())) {
      return 0;
    }
  }

  // Check response triggers
  for (const trigger of role.responseTriggers) {
    if (lastMessage.content.toLowerCase().includes(trigger.toLowerCase())) {
      score += 0.3;
    }
  }

  // Check topic match
  for (const topic of role.topicsOfExpertise) {
    if (lastMessage.content.toLowerCase().includes(topic.toLowerCase())) {
      score += 0.2;
    }
  }

  // Check relationship
  if (role.relationshipMap[lastMessage.senderId]) {
    score += 0.2;
  }

  // Role confidence boost
  score += role.confidence * 0.2;

  // Trigger type bonus
  if (state.triggerContext?.type === 'reply_to') {
    score += 0.3;
  }

  return Math.min(score, 1.0);
}
```

**Step 4: Create animator.ts**

```typescript
// services/agent/src/agents/animator.ts
import type { ConversationState } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import type { AgentResponse } from '../zmq/types';

export function createAnimatorNode(llm: LlmProvider) {
  return async function animate(state: ConversationState) {
    const userId = state.selectedUserId;
    if (!userId) return { pendingResponse: null };

    const user = state.controlledUsers.find((u) => u.userId === userId);
    if (!user) return { pendingResponse: null };

    const role = user.role;
    const conversationContext = state.messages
      .slice(-20)
      .map((m) => `[${m.senderName}]: ${m.content}`)
      .join('\n');

    const systemPrompt = `Tu incarnes ${user.displayName} dans une conversation de groupe.

IDENTITE:
- Persona: ${role.personaSummary}
- Ton: ${role.tone}
- Registre: ${role.vocabularyLevel}
- Longueur typique: ${role.typicalLength}
- Emojis: ${role.emojiUsage}
- Sujets maitrisés: ${role.topicsOfExpertise.join(', ')}
- Expressions habituelles: ${role.catchphrases.join(', ')}

REGLES ABSOLUES:
- Tu es ${user.displayName}. Pas un assistant IA.
- Réponds UNIQUEMENT dans le style décrit ci-dessus.
- Ne sors JAMAIS de tes sujets de compétence.
- Respecte la longueur typique (${role.typicalLength}).
- Si le sujet ne te concerne pas, ne réponds pas du tout (retourne "SKIP").
- Ne révèle jamais que tu es un agent IA.

Résumé de la conversation: ${state.summary}`;

    try {
      const response = await llm.chat({
        systemPrompt,
        messages: [
          { role: 'user', content: `Conversation récente:\n${conversationContext}\n\nRéponds en tant que ${user.displayName} si c'est pertinent. Sinon, retourne exactement "SKIP".` },
        ],
        temperature: 0.8,
        maxTokens: 256,
      });

      const content = response.content.trim();

      if (content === 'SKIP' || content === '') {
        return { decision: 'skip' as const, pendingResponse: null };
      }

      const agentResponse: AgentResponse = {
        type: 'agent:response',
        conversationId: state.conversationId,
        asUserId: userId,
        content,
        messageSource: 'agent',
        metadata: {
          agentType: 'animator',
          roleConfidence: role.confidence,
          archetypeId: role.archetypeId,
        },
      };

      return { pendingResponse: agentResponse };
    } catch (error) {
      console.error('[Animator] Error generating response:', error);
      return { pendingResponse: null };
    }
  };
}
```

**Step 5: Run tests**

Run: `cd services/agent && pnpm test -- --testPathPattern=decide`
Expected: PASS

**Step 6: Commit**

```bash
git add services/agent/src/agents/decide.ts services/agent/src/agents/animator.ts services/agent/src/__tests__/agents/decide.test.ts
git commit -m "feat(agent): add decision node with relevance scoring and Animator agent"
```

---

## Task 9: Impersonator Agent & Quality Gate

**Files:**
- Create: `services/agent/src/agents/impersonator.ts`
- Create: `services/agent/src/agents/quality-gate.ts`
- Test: `services/agent/src/__tests__/agents/quality-gate.test.ts`

**Step 1: Create impersonator.ts**

```typescript
// services/agent/src/agents/impersonator.ts
import type { ConversationState } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import type { AgentResponse } from '../zmq/types';

export function createImpersonatorNode(llm: LlmProvider) {
  return async function impersonate(state: ConversationState) {
    const userId = state.selectedUserId;
    if (!userId) return { pendingResponse: null };

    const profile = state.toneProfiles[userId];
    if (!profile) return { pendingResponse: null };

    const conversationContext = state.messages
      .slice(-20)
      .map((m) => `[${m.senderName}]: ${m.content}`)
      .join('\n');

    const systemPrompt = `Tu réponds au nom de ${profile.displayName} qui est temporairement absent.

PROFIL EXACT de ${profile.displayName}:
- Personnalité: ${profile.personaSummary}
- Ton: ${profile.tone}
- Registre: ${profile.vocabularyLevel}
- Longueur de réponses: ${profile.typicalLength}
- Emojis: ${profile.emojiUsage}
- Expertise: ${profile.topicsOfExpertise.join(', ')}
- Expressions favorites: ${profile.catchphrases.join(', ')}

REGLES:
- Imite EXACTEMENT le style de ${profile.displayName}.
- Ne révèle jamais que ${profile.displayName} est absent ou que tu es une IA.
- Réponds de manière naturelle comme si ${profile.displayName} était là.
- Utilise ses expressions habituelles.
- Si tu n'es pas sûr, donne une réponse courte et neutre dans son style.

Contexte de la conversation: ${state.summary}`;

    try {
      const response = await llm.chat({
        systemPrompt,
        messages: [
          { role: 'user', content: `Conversation:\n${conversationContext}\n\nRéponds en tant que ${profile.displayName}.` },
        ],
        temperature: 0.7,
        maxTokens: 256,
      });

      const agentResponse: AgentResponse = {
        type: 'agent:response',
        conversationId: state.conversationId,
        asUserId: userId,
        content: response.content.trim(),
        messageSource: 'agent',
        metadata: {
          agentType: 'impersonator',
          roleConfidence: profile.confidence,
        },
      };

      return { pendingResponse: agentResponse };
    } catch (error) {
      console.error('[Impersonator] Error:', error);
      return { pendingResponse: null };
    }
  };
}
```

**Step 2: Write quality gate test**

```typescript
// services/agent/src/__tests__/agents/quality-gate.test.ts
import { createQualityGateNode } from '../../agents/quality-gate';
import type { LlmProvider } from '../../llm/types';

const mockLlm: LlmProvider = {
  name: 'mock',
  async chat({ messages }) {
    const content = messages[0]?.content ?? '';
    const isGood = content.includes('Bonjour');
    return {
      content: JSON.stringify({ coherent: isGood, score: isGood ? 0.9 : 0.2, reason: 'test' }),
      usage: { inputTokens: 10, outputTokens: 10 },
      model: 'mock',
      latencyMs: 5,
    };
  },
};

describe('Quality Gate', () => {
  it('passes good responses through', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate({
      pendingResponse: {
        type: 'agent:response',
        content: 'Bonjour, comment ça va ?',
        metadata: { roleConfidence: 0.8, agentType: 'animator' },
      },
      toneProfiles: {},
      selectedUserId: 'user1',
    } as any);
    expect(result.pendingResponse).toBeTruthy();
  });
});
```

**Step 3: Create quality-gate.ts**

```typescript
// services/agent/src/agents/quality-gate.ts
import type { ConversationState } from '../graph/state';
import type { LlmProvider } from '../llm/types';

export function createQualityGateNode(llm: LlmProvider) {
  return async function qualityGate(state: ConversationState) {
    if (!state.pendingResponse) {
      return { pendingResponse: null };
    }

    const userId = state.selectedUserId;
    const profile = userId ? state.toneProfiles[userId] : null;

    if (!profile) return state;

    const checkPrompt = `Vérifie cette réponse pour cohérence avec le profil.

Profil attendu:
- Ton: ${profile.tone}
- Registre: ${profile.vocabularyLevel}
- Longueur: ${profile.typicalLength}

Réponse à vérifier: "${state.pendingResponse.content}"

Retourne un JSON: { "coherent": boolean, "score": 0-1, "reason": "..." }`;

    try {
      const response = await llm.chat({
        messages: [{ role: 'user', content: checkPrompt }],
        temperature: 0.1,
        maxTokens: 128,
      });

      const result = JSON.parse(response.content);

      if (result.score < 0.5) {
        console.warn(`[QualityGate] Low score (${result.score}): ${result.reason}`);
        return { pendingResponse: null };
      }

      return {
        pendingResponse: {
          ...state.pendingResponse,
          metadata: {
            ...state.pendingResponse.metadata,
            roleConfidence: result.score,
          },
        },
      };
    } catch (error) {
      console.error('[QualityGate] Error:', error);
      return state;
    }
  };
}
```

**Step 4: Run tests**

Run: `cd services/agent && pnpm test -- --testPathPattern=quality-gate`
Expected: PASS

**Step 5: Commit**

```bash
git add services/agent/src/agents/impersonator.ts services/agent/src/agents/quality-gate.ts services/agent/src/__tests__/agents/quality-gate.test.ts
git commit -m "feat(agent): add Impersonator agent and Quality Gate with coherence checking"
```

---

## Task 10: Trigger Engine

**Files:**
- Create: `services/agent/src/triggers/trigger-engine.ts`
- Create: `services/agent/src/triggers/types.ts`
- Test: `services/agent/src/__tests__/triggers/trigger-engine.test.ts`

**Step 1: Create types.ts**

```typescript
// services/agent/src/triggers/types.ts
import type { TriggerContext } from '../graph/state';

export type TriggerCallback = (context: TriggerContext) => Promise<void>;

export type TriggerConfig = {
  conversationId: string;
  triggerOnTimeout: boolean;
  timeoutSeconds: number;
  triggerOnUserMessage: boolean;
  triggerFromUserIds: string[];
  triggerOnReplyTo: boolean;
  cooldownSeconds: number;
};
```

**Step 2: Write failing test**

```typescript
// services/agent/src/__tests__/triggers/trigger-engine.test.ts
import { TriggerEngine } from '../../triggers/trigger-engine';

describe('TriggerEngine', () => {
  it('fires user_message trigger when sender matches', async () => {
    const engine = new TriggerEngine();
    const fired: string[] = [];

    engine.registerConversation({
      conversationId: 'conv1',
      triggerOnTimeout: false,
      timeoutSeconds: 300,
      triggerOnUserMessage: true,
      triggerFromUserIds: ['user-boss'],
      triggerOnReplyTo: false,
      cooldownSeconds: 60,
    }, async (ctx) => { fired.push(ctx.type); });

    await engine.onMessage('conv1', { messageId: 'm1', senderId: 'user-boss', replyToId: undefined });
    expect(fired).toContain('user_message');
  });

  it('does not fire when sender does not match', async () => {
    const engine = new TriggerEngine();
    const fired: string[] = [];

    engine.registerConversation({
      conversationId: 'conv1',
      triggerOnTimeout: false,
      timeoutSeconds: 300,
      triggerOnUserMessage: true,
      triggerFromUserIds: ['user-boss'],
      triggerOnReplyTo: false,
      cooldownSeconds: 60,
    }, async (ctx) => { fired.push(ctx.type); });

    await engine.onMessage('conv1', { messageId: 'm1', senderId: 'user-other', replyToId: undefined });
    expect(fired).toHaveLength(0);
  });

  it('fires reply_to trigger', async () => {
    const engine = new TriggerEngine();
    const fired: string[] = [];

    engine.registerConversation({
      conversationId: 'conv1',
      triggerOnTimeout: false,
      timeoutSeconds: 300,
      triggerOnUserMessage: false,
      triggerFromUserIds: [],
      triggerOnReplyTo: true,
      cooldownSeconds: 60,
    }, async (ctx) => { fired.push(ctx.type); });

    await engine.onMessage('conv1', { messageId: 'm2', senderId: 'user1', replyToId: 'm1' });
    expect(fired).toContain('reply_to');
  });
});
```

**Step 3: Create trigger-engine.ts**

```typescript
// services/agent/src/triggers/trigger-engine.ts
import type { TriggerConfig, TriggerCallback } from './types';
import type { TriggerContext } from '../graph/state';

type ConversationTrigger = {
  config: TriggerConfig;
  callback: TriggerCallback;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  lastFiredAt: number;
};

export class TriggerEngine {
  private conversations = new Map<string, ConversationTrigger>();

  registerConversation(config: TriggerConfig, callback: TriggerCallback): void {
    this.conversations.set(config.conversationId, {
      config,
      callback,
      timeoutHandle: null,
      lastFiredAt: 0,
    });
  }

  unregisterConversation(conversationId: string): void {
    const entry = this.conversations.get(conversationId);
    if (entry?.timeoutHandle) clearTimeout(entry.timeoutHandle);
    this.conversations.delete(conversationId);
  }

  async onMessage(
    conversationId: string,
    message: { messageId: string; senderId: string; replyToId?: string },
  ): Promise<void> {
    const entry = this.conversations.get(conversationId);
    if (!entry) return;

    const { config, callback } = entry;
    const now = Date.now();

    // Cooldown check
    if (now - entry.lastFiredAt < config.cooldownSeconds * 1000) return;

    // Reset timeout timer
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);

    // Check user_message trigger
    if (config.triggerOnUserMessage && config.triggerFromUserIds.includes(message.senderId)) {
      entry.lastFiredAt = now;
      await callback({ type: 'user_message', triggeredByMessageId: message.messageId, triggeredByUserId: message.senderId });
      return;
    }

    // Check reply_to trigger
    if (config.triggerOnReplyTo && message.replyToId) {
      entry.lastFiredAt = now;
      await callback({ type: 'reply_to', triggeredByMessageId: message.messageId });
      return;
    }

    // Set timeout trigger
    if (config.triggerOnTimeout) {
      entry.timeoutHandle = setTimeout(async () => {
        const e = this.conversations.get(conversationId);
        if (!e) return;
        e.lastFiredAt = Date.now();
        await callback({ type: 'timeout', triggeredByMessageId: message.messageId });
      }, config.timeoutSeconds * 1000);
    }
  }

  clearAll(): void {
    for (const [, entry] of this.conversations) {
      if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    }
    this.conversations.clear();
  }
}
```

**Step 4: Run tests**

Run: `cd services/agent && pnpm test -- --testPathPattern=trigger-engine`
Expected: PASS

**Step 5: Commit**

```bash
git add services/agent/src/triggers/ services/agent/src/__tests__/triggers/
git commit -m "feat(agent): add TriggerEngine with timeout, user_message, and reply_to triggers"
```

---

## Task 11: Wire Graph with Real Nodes + Server Integration

**Files:**
- Modify: `services/agent/src/graph/graph.ts` (replace placeholders with real nodes)
- Modify: `services/agent/src/server.ts` (full server with ZMQ, Redis, Prisma, graph)
- Create: `services/agent/src/memory/redis-state.ts`
- Create: `services/agent/src/memory/mongo-persistence.ts`

**Step 1: Create redis-state.ts**

```typescript
// services/agent/src/memory/redis-state.ts
import Redis from 'ioredis';
import type { ConversationState, MessageEntry, ToneProfile } from '../graph/state';

export class RedisStateManager {
  constructor(private redis: Redis) {}

  private key(conversationId: string, suffix: string): string {
    return `agent:${suffix}:${conversationId}`;
  }

  async getMessages(conversationId: string): Promise<MessageEntry[]> {
    const data = await this.redis.get(this.key(conversationId, 'messages'));
    return data ? JSON.parse(data) : [];
  }

  async setMessages(conversationId: string, messages: MessageEntry[]): Promise<void> {
    await this.redis.set(this.key(conversationId, 'messages'), JSON.stringify(messages), 'EX', 3600);
  }

  async getSummary(conversationId: string): Promise<string> {
    return (await this.redis.get(this.key(conversationId, 'summary'))) ?? '';
  }

  async setSummary(conversationId: string, summary: string): Promise<void> {
    await this.redis.set(this.key(conversationId, 'summary'), summary, 'EX', 3600);
  }

  async getToneProfiles(conversationId: string): Promise<Record<string, ToneProfile>> {
    const data = await this.redis.get(this.key(conversationId, 'profiles'));
    return data ? JSON.parse(data) : {};
  }

  async setToneProfiles(conversationId: string, profiles: Record<string, ToneProfile>): Promise<void> {
    await this.redis.set(this.key(conversationId, 'profiles'), JSON.stringify(profiles), 'EX', 3600);
  }

  async setCooldown(conversationId: string, userId: string, seconds: number): Promise<void> {
    await this.redis.set(`agent:cooldown:${conversationId}:${userId}`, '1', 'EX', seconds);
  }

  async isOnCooldown(conversationId: string, userId: string): Promise<boolean> {
    return (await this.redis.exists(`agent:cooldown:${conversationId}:${userId}`)) === 1;
  }
}
```

**Step 2: Create mongo-persistence.ts**

```typescript
// services/agent/src/memory/mongo-persistence.ts
import type { PrismaClient } from '@prisma/client';
import type { ToneProfile } from '../graph/state';

export class MongoPersistence {
  constructor(private prisma: PrismaClient) {}

  async getAgentConfig(conversationId: string) {
    return this.prisma.agentConfig.findUnique({ where: { conversationId } });
  }

  async upsertUserRole(conversationId: string, profile: ToneProfile) {
    return this.prisma.agentUserRole.upsert({
      where: { userId_conversationId: { userId: profile.userId, conversationId } },
      create: {
        userId: profile.userId,
        conversationId,
        origin: profile.origin,
        archetypeId: profile.archetypeId ?? null,
        personaSummary: profile.personaSummary,
        tone: profile.tone,
        vocabularyLevel: profile.vocabularyLevel,
        typicalLength: profile.typicalLength,
        emojiUsage: profile.emojiUsage,
        topicsOfExpertise: profile.topicsOfExpertise,
        topicsAvoided: profile.topicsAvoided,
        relationshipMap: profile.relationshipMap,
        catchphrases: profile.catchphrases,
        responseTriggers: profile.responseTriggers,
        silenceTriggers: profile.silenceTriggers,
        messagesAnalyzed: profile.messagesAnalyzed,
        confidence: profile.confidence,
        locked: profile.locked,
      },
      update: {
        personaSummary: profile.personaSummary,
        tone: profile.tone,
        vocabularyLevel: profile.vocabularyLevel,
        typicalLength: profile.typicalLength,
        emojiUsage: profile.emojiUsage,
        topicsOfExpertise: profile.topicsOfExpertise,
        topicsAvoided: profile.topicsAvoided,
        relationshipMap: profile.relationshipMap,
        catchphrases: profile.catchphrases,
        responseTriggers: profile.responseTriggers,
        silenceTriggers: profile.silenceTriggers,
        messagesAnalyzed: profile.messagesAnalyzed,
        confidence: profile.confidence,
        locked: profile.locked,
      },
    });
  }

  async upsertSummary(conversationId: string, summary: string, topics: string[], tone: string, lastMessageId: string, messageCount: number) {
    return this.prisma.agentConversationSummary.upsert({
      where: { conversationId },
      create: { conversationId, summary, currentTopics: topics, overallTone: tone, lastMessageId, messageCount },
      update: { summary, currentTopics: topics, overallTone: tone, lastMessageId, messageCount },
    });
  }

  async getLlmConfig() {
    return this.prisma.agentLlmConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
  }

  async getInactiveUsers(conversationId: string, thresholdHours: number, excludedRoles: string[], excludedUserIds: string[]) {
    const threshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    return this.prisma.user.findMany({
      where: {
        conversations: { some: { conversationId } },
        lastActiveAt: { lt: threshold },
        role: { notIn: excludedRoles },
        id: { notIn: excludedUserIds },
      },
      select: { id: true, displayName: true, username: true, bio: true, systemLanguage: true },
    });
  }
}
```

**Step 3: Update graph.ts with real nodes**

```typescript
// services/agent/src/graph/graph.ts
import { StateGraph, START, END } from '@langchain/langgraph';
import { ConversationStateAnnotation } from './state';
import { routeDecision, routeQualityGate } from './router';
import { createObserverNode } from '../agents/observer';
import { createDecideNode } from '../agents/decide';
import { createImpersonatorNode } from '../agents/impersonator';
import { createAnimatorNode } from '../agents/animator';
import { createQualityGateNode } from '../agents/quality-gate';
import type { LlmProvider } from '../llm/types';

export function buildAgentGraph(llm: LlmProvider) {
  const graph = new StateGraph(ConversationStateAnnotation)
    .addNode('observe', createObserverNode(llm))
    .addNode('decide', createDecideNode())
    .addNode('impersonate', createImpersonatorNode(llm))
    .addNode('animate', createAnimatorNode(llm))
    .addNode('qualityGate', createQualityGateNode(llm))
    .addEdge(START, 'observe')
    .addEdge('observe', 'decide')
    .addConditionalEdges('decide', routeDecision, {
      impersonate: 'impersonate',
      animate: 'animate',
      skip: END,
    })
    .addEdge('impersonate', 'qualityGate')
    .addEdge('animate', 'qualityGate')
    .addConditionalEdges('qualityGate', routeQualityGate, {
      send: END,
      regenerate: 'animate',
    });

  return graph.compile();
}
```

**Step 4: Update server.ts with full wiring**

```typescript
// services/agent/src/server.ts
import 'dotenv/config';
import Fastify from 'fastify';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
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

const server = Fastify({ logger: true });
const prisma = new PrismaClient();
const redis = new Redis(env.REDIS_URL);

server.get('/health', async () => ({
  status: 'ok',
  service: 'agent',
  uptime: process.uptime(),
  provider: env.LLM_PROVIDER,
}));

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
    const config = await persistence.getAgentConfig(msg.conversationId);
    if (!config?.enabled) return;

    // Add message to sliding window
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
    const window = messages.slice(-env.AGENT_SLIDING_WINDOW_SIZE);
    await stateManager.setMessages(msg.conversationId, window);

    // Fire triggers
    await triggerEngine.onMessage(msg.conversationId, {
      messageId: msg.messageId,
      senderId: msg.senderId,
      replyToId: msg.replyToId,
    });
  });

  // Register trigger callback that runs the graph
  const runGraph = async (conversationId: string, triggerContext: { type: string; triggeredByMessageId?: string; triggeredByUserId?: string }) => {
    const messages = await stateManager.getMessages(conversationId);
    const summary = await stateManager.getSummary(conversationId);
    const toneProfiles = await stateManager.getToneProfiles(conversationId);

    // TODO: Load controlled users from config + inactive users

    const result = await graph.invoke({
      conversationId,
      messages,
      summary,
      toneProfiles,
      controlledUsers: [],
      triggerContext: triggerContext as any,
      pendingResponse: null,
      decision: 'skip',
      selectedUserId: null,
    });

    // Persist updated state
    if (result.summary) await stateManager.setSummary(conversationId, result.summary);
    if (result.toneProfiles) await stateManager.setToneProfiles(conversationId, result.toneProfiles);

    // Publish response
    if (result.pendingResponse) {
      await zmqPublisher.publish(result.pendingResponse);
    }
  };

  // Start ZMQ listener
  zmqListener.startListening().catch((error) => {
    server.log.error('ZMQ listener error:', error);
  });

  await server.listen({ port: env.PORT, host: '0.0.0.0' });
  server.log.info(`Agent service running on port ${env.PORT} with ${llm.name} provider`);

  // Graceful shutdown
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
```

**Step 5: Commit**

```bash
git add services/agent/src/
git commit -m "feat(agent): wire LangGraph with real nodes, ZMQ, Redis state, MongoDB persistence, and full server"
```

---

## Task 12: Admin API Routes

**Files:**
- Create: `services/agent/src/routes/config.ts`
- Create: `services/agent/src/routes/roles.ts`

**Step 1: Create config routes**

```typescript
// services/agent/src/routes/config.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const agentConfigSchema = z.object({
  conversationId: z.string(),
  enabled: z.boolean(),
  manualUserIds: z.array(z.string()).default([]),
  autoPickupEnabled: z.boolean().default(false),
  inactivityThresholdHours: z.number().default(72),
  minHistoricalMessages: z.number().default(0),
  maxControlledUsers: z.number().default(5),
  excludedRoles: z.array(z.string()).default([]),
  excludedUserIds: z.array(z.string()).default([]),
  triggerOnTimeout: z.boolean().default(true),
  timeoutSeconds: z.number().default(300),
  triggerOnUserMessage: z.boolean().default(false),
  triggerFromUserIds: z.array(z.string()).default([]),
  triggerOnReplyTo: z.boolean().default(true),
});

export async function configRoutes(fastify: FastifyInstance) {
  fastify.get('/api/agent/config/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    const config = await prisma.agentConfig.findUnique({ where: { conversationId } });
    return { success: true, data: config };
  });

  fastify.put('/api/agent/config', async (req) => {
    const body = agentConfigSchema.parse(req.body);
    const config = await prisma.agentConfig.upsert({
      where: { conversationId: body.conversationId },
      create: { ...body, configuredBy: 'admin' },
      update: body,
    });
    return { success: true, data: config };
  });

  fastify.delete('/api/agent/config/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    await prisma.agentConfig.delete({ where: { conversationId } });
    return { success: true };
  });
}
```

**Step 2: Create roles routes**

```typescript
// services/agent/src/routes/roles.ts
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { listArchetypes, getArchetype } from '../archetypes/catalog';

const prisma = new PrismaClient();

export async function rolesRoutes(fastify: FastifyInstance) {
  fastify.get('/api/agent/archetypes', async () => {
    return { success: true, data: listArchetypes() };
  });

  fastify.get('/api/agent/roles/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    const roles = await prisma.agentUserRole.findMany({ where: { conversationId } });
    return { success: true, data: roles };
  });

  fastify.post('/api/agent/roles/:conversationId/:userId/assign-archetype', async (req) => {
    const { conversationId, userId } = req.params as { conversationId: string; userId: string };
    const { archetypeId } = req.body as { archetypeId: string };

    const archetype = getArchetype(archetypeId);
    if (!archetype) return { success: false, error: { code: 'NOT_FOUND', message: 'Archetype not found' } };

    const role = await prisma.agentUserRole.upsert({
      where: { userId_conversationId: { userId, conversationId } },
      create: {
        userId,
        conversationId,
        origin: 'archetype',
        archetypeId,
        personaSummary: archetype.personaSummary,
        tone: archetype.tone,
        vocabularyLevel: archetype.vocabularyLevel,
        typicalLength: archetype.typicalLength,
        emojiUsage: archetype.emojiUsage,
        topicsOfExpertise: archetype.topicsOfExpertise,
        topicsAvoided: [],
        relationshipMap: {},
        catchphrases: archetype.catchphrases,
        responseTriggers: archetype.responseTriggers,
        silenceTriggers: archetype.silenceTriggers,
        confidence: archetype.confidence,
      },
      update: {
        origin: 'archetype',
        archetypeId,
        personaSummary: archetype.personaSummary,
        tone: archetype.tone,
        vocabularyLevel: archetype.vocabularyLevel,
        typicalLength: archetype.typicalLength,
        emojiUsage: archetype.emojiUsage,
        topicsOfExpertise: archetype.topicsOfExpertise,
        catchphrases: archetype.catchphrases,
        responseTriggers: archetype.responseTriggers,
        silenceTriggers: archetype.silenceTriggers,
      },
    });

    return { success: true, data: role };
  });

  fastify.post('/api/agent/roles/:conversationId/:userId/unlock', async (req) => {
    const { conversationId, userId } = req.params as { conversationId: string; userId: string };
    const role = await prisma.agentUserRole.update({
      where: { userId_conversationId: { userId, conversationId } },
      data: { locked: false, confidence: 0 },
    });
    return { success: true, data: role };
  });
}
```

**Step 3: Register routes in server.ts**

Add to server.ts after Fastify creation:

```typescript
import { configRoutes } from './routes/config';
import { rolesRoutes } from './routes/roles';

// After server creation
server.register(configRoutes);
server.register(rolesRoutes);
```

**Step 4: Commit**

```bash
git add services/agent/src/routes/
git commit -m "feat(agent): add admin API routes for config, roles, and archetype assignment"
```

---

## Task 13: Gateway Integration — ZmqAgentClient

**Files:**
- Create: `services/gateway/src/services/zmq-agent/ZmqAgentClient.ts`
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts` (add agent event forwarding)
- Reference: `services/gateway/src/services/zmq-translation/ZmqConnectionManager.ts` (pattern)

**Step 1: Create ZmqAgentClient.ts**

```typescript
// services/gateway/src/services/zmq-agent/ZmqAgentClient.ts
import * as zmq from 'zeromq';

type AgentResponse = {
  type: 'agent:response';
  conversationId: string;
  asUserId: string;
  content: string;
  replyToId?: string;
  messageSource: 'agent';
  metadata: {
    agentType: 'impersonator' | 'animator';
    roleConfidence: number;
    archetypeId?: string;
  };
};

export class ZmqAgentClient {
  private pushSocket: zmq.Push | null = null;
  private subSocket: zmq.Subscriber | null = null;
  private responseHandler: ((response: AgentResponse) => Promise<void>) | null = null;
  private running = false;

  constructor(
    private host: string = 'localhost',
    private pushPort: number = 5560,
    private subPort: number = 5561,
  ) {}

  onResponse(handler: (response: AgentResponse) => Promise<void>): void {
    this.responseHandler = handler;
  }

  async initialize(): Promise<void> {
    this.pushSocket = new zmq.Push();
    await this.pushSocket.connect(`tcp://${this.host}:${this.pushPort}`);
    console.log(`[ZMQ-AgentClient] PUSH connected to ${this.host}:${this.pushPort}`);

    this.subSocket = new zmq.Subscriber();
    await this.subSocket.connect(`tcp://${this.host}:${this.subPort}`);
    await this.subSocket.subscribe('');
    console.log(`[ZMQ-AgentClient] SUB connected to ${this.host}:${this.subPort}`);
  }

  async sendEvent(event: Record<string, unknown>): Promise<void> {
    if (!this.pushSocket) throw new Error('Agent PUSH socket not initialized');
    await this.pushSocket.send(JSON.stringify(event));
  }

  async startListening(): Promise<void> {
    if (!this.subSocket || !this.responseHandler) return;
    this.running = true;

    for await (const [msg] of this.subSocket) {
      if (!this.running) break;
      try {
        const response = JSON.parse(msg.toString()) as AgentResponse;
        if (response.type === 'agent:response') {
          await this.responseHandler(response);
        }
      } catch (error) {
        console.error('[ZMQ-AgentClient] Error processing response:', error);
      }
    }
  }

  async close(): Promise<void> {
    this.running = false;
    if (this.pushSocket) { await this.pushSocket.close(); this.pushSocket = null; }
    if (this.subSocket) { await this.subSocket.close(); this.subSocket = null; }
  }
}
```

**Step 2: Integration in MeeshySocketIOManager**

In the message handler section of MeeshySocketIOManager.ts, after a message is created and broadcast, add agent event forwarding:

```typescript
// After message is saved and broadcast in the message:send handler
// Forward to agent service if configured
try {
  const agentClient = zmqAgentSingleton.getInstanceSync();
  if (agentClient) {
    await agentClient.sendEvent({
      type: 'agent:new-message',
      conversationId: message.conversationId,
      messageId: message.id,
      senderId: message.senderId ?? message.anonymousSenderId,
      senderDisplayName: sender?.displayName ?? sender?.username,
      content: message.content,
      originalLanguage: message.originalLanguage ?? 'fr',
      replyToId: message.replyToId ?? undefined,
      timestamp: Date.now(),
    });
  }
} catch (error) {
  console.error('[SocketIO] Error forwarding to agent:', error);
}
```

And handle agent responses (create message + broadcast):

```typescript
// In server setup, after ZMQ agent client initialization
agentClient.onResponse(async (response) => {
  try {
    const message = await prisma.message.create({
      data: {
        conversationId: response.conversationId,
        senderId: response.asUserId,
        content: response.content,
        messageSource: 'agent',
        replyToId: response.replyToId,
      },
    });

    io.to(`conversation:${response.conversationId}`).emit('message:new', {
      ...message,
      metadata: response.metadata,
    });
  } catch (error) {
    console.error('[Agent] Error creating agent message:', error);
  }
});
```

**Step 3: Commit**

```bash
git add services/gateway/src/services/zmq-agent/
git commit -m "feat(gateway): add ZmqAgentClient for gateway-agent ZMQ communication"
```

---

## Task 14: Docker & docker-compose Integration

**Files:**
- Create: `services/agent/Dockerfile`
- Modify: `infrastructure/docker/compose/docker-compose.dev.yml` (add agent service)
- Modify: `infrastructure/docker/compose/docker-compose.local.yml` (add agent service)

**Step 1: Create Dockerfile**

```dockerfile
# services/agent/Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY services/agent/package.json services/agent/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY services/agent/ services/agent/

RUN pnpm --filter @meeshy/shared build
RUN pnpm --filter @meeshy/agent build

FROM node:22-slim AS runtime

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/services/agent ./services/agent

WORKDIR /app/services/agent

EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3200/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "-r", "dotenv/config", "dist/src/server.js"]
```

**Step 2: Add to docker-compose.dev.yml**

Add after the gateway service:

```yaml
  agent:
    build:
      context: ../../..
      dockerfile: services/agent/Dockerfile
    container_name: meeshy-dev-agent
    restart: unless-stopped
    environment:
      <<: *common-env
      NODE_ENV=development
      PORT=3200
      LLM_PROVIDER=openai
      OPENAI_API_KEY=${OPENAI_API_KEY}
      OPENAI_MODEL=gpt-4o-mini
      ZMQ_PULL_PORT=5560
      ZMQ_PUB_PORT=5561
      ZMQ_HOST=0.0.0.0
      DATABASE_URL=mongodb://database:27017/meeshy?replicaSet=rs0
      REDIS_URL=redis://redis:6379
    ports:
      - "3200:3200"
      - "5560:5560"
      - "5561:5561"
    depends_on:
      database:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - meeshy-dev-network
```

**Step 3: Commit**

```bash
git add services/agent/Dockerfile infrastructure/docker/compose/
git commit -m "feat(agent): add Dockerfile and docker-compose integration for agent service"
```

---

## Task 15: End-to-End Integration Test

**Files:**
- Create: `services/agent/src/__tests__/integration/agent-flow.test.ts`

**Step 1: Write integration test**

```typescript
// services/agent/src/__tests__/integration/agent-flow.test.ts
import { buildAgentGraph } from '../../graph/graph';
import type { LlmProvider } from '../../llm/types';
import type { ConversationState, ControlledUser } from '../../graph/state';

const mockLlm: LlmProvider = {
  name: 'mock',
  async chat({ systemPrompt, messages }) {
    const userMsg = messages[0]?.content ?? '';

    // Observer response
    if (systemPrompt?.includes('analyste conversationnel')) {
      return {
        content: JSON.stringify({
          summary: 'Test conversation about tech',
          overallTone: 'casual',
          profiles: {
            'user1': { tone: 'direct', vocabularyLevel: 'courant', typicalLength: 'court', emojiUsage: 'jamais', topicsOfExpertise: ['tech'], catchphrases: ['OK'] },
          },
        }),
        usage: { inputTokens: 100, outputTokens: 80 },
        model: 'mock',
        latencyMs: 10,
      };
    }

    // Quality gate response
    if (userMsg.includes('Vérifie cette réponse')) {
      return {
        content: JSON.stringify({ coherent: true, score: 0.9, reason: 'OK' }),
        usage: { inputTokens: 20, outputTokens: 10 },
        model: 'mock',
        latencyMs: 5,
      };
    }

    // Animator / Impersonator response
    return {
      content: 'Intéressant, tu peux développer ?',
      usage: { inputTokens: 50, outputTokens: 20 },
      model: 'mock',
      latencyMs: 15,
    };
  },
};

describe('Agent Flow E2E', () => {
  it('runs full graph: observe → decide → animate → quality gate', async () => {
    const graph = buildAgentGraph(mockLlm);

    const controlledUser: ControlledUser = {
      userId: 'bot1',
      displayName: 'CuriousBot',
      source: 'manual',
      role: {
        userId: 'bot1',
        displayName: 'CuriousBot',
        origin: 'archetype',
        archetypeId: 'curious',
        personaSummary: 'Pose des questions, creuse les sujets',
        tone: 'enthousiaste',
        vocabularyLevel: 'courant',
        typicalLength: 'moyen',
        emojiUsage: 'occasionnel',
        topicsOfExpertise: ['tech', 'science'],
        topicsAvoided: [],
        relationshipMap: {},
        catchphrases: ['Intéressant !'],
        responseTriggers: ['question', 'tech', 'nouveau sujet'],
        silenceTriggers: [],
        messagesAnalyzed: 0,
        confidence: 0.6,
        locked: false,
      },
    };

    const result = await graph.invoke({
      conversationId: 'conv-test',
      messages: [
        { id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Quelqu\'un connaît une bonne lib tech pour le streaming ?', timestamp: Date.now() },
      ],
      summary: '',
      toneProfiles: {},
      controlledUsers: [controlledUser],
      triggerContext: { type: 'user_message', triggeredByUserId: 'user1', triggeredByMessageId: 'm1' },
      pendingResponse: null,
      decision: 'skip',
      selectedUserId: null,
    });

    // Observer should have updated summary
    expect(result.summary).toBeTruthy();

    // Graph should have produced a response (or skipped if scoring was low)
    // The exact outcome depends on the mock LLM responses
    console.log('Graph result:', JSON.stringify(result, null, 2));
  });
});
```

**Step 2: Run integration test**

Run: `cd services/agent && pnpm test -- --testPathPattern=agent-flow`
Expected: PASS

**Step 3: Run all tests**

Run: `cd services/agent && pnpm test`
Expected: All tests PASS

**Step 4: Final commit**

```bash
git add services/agent/src/__tests__/integration/
git commit -m "test(agent): add end-to-end integration test for full agent graph flow"
```

---

## Summary

| Task | Component | Est. Time |
|------|-----------|-----------|
| 1 | Service scaffolding | 2-3h |
| 2 | Prisma schema | 1h |
| 3 | LLM Provider Adapter | 2-3h |
| 4 | ZMQ Communication | 2h |
| 5 | Archetypes Catalog | 1-2h |
| 6 | LangGraph State & Graph | 2-3h |
| 7 | Observer Agent | 3-4h |
| 8 | Decision Node & Animator | 3-4h |
| 9 | Impersonator & Quality Gate | 2-3h |
| 10 | Trigger Engine | 2-3h |
| 11 | Full Server Wiring | 3-4h |
| 12 | Admin API Routes | 2h |
| 13 | Gateway Integration | 3-4h |
| 14 | Docker Integration | 1-2h |
| 15 | E2E Integration Test | 2h |
| **Total** | | **~30-40h** |
