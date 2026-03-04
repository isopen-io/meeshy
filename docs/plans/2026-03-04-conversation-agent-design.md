# Conversation Agent Service — Design Document

**Date**: 2026-03-04
**Status**: Draft
**Auteur**: Claude + smpceo

## Vision

Un service agent autonome qui suit les conversations Meeshy en temps real, construit des profils de role pour chaque interlocuteur, et peut repondre intelligemment au nom d'utilisateurs inactifs ou configures. Les agents operent avec une autonomie reelle — les administrateurs configurent les regles d'engagement et les limites, pas les reponses individuelles.

## Principes fondamentaux

1. **Autonomie reelle** : L'agent decide seul quand, comment et au nom de qui repondre. Les admins definissent le cadre, pas les actions.
2. **Fidelite de role** : Chaque utilisateur controle a un role verrouille. L'agent ne devie JAMAIS de ce role.
3. **Coherence conversationnelle** : Les reponses s'integrent naturellement dans le fil de discussion.
4. **Transparence** : Les messages agent sont marques `messageSource: 'agent'` — le client peut afficher un badge IA.
5. **LLM-agnostique** : Le provider LLM est configurable par les admins (OpenAI, Anthropic, Mistral, etc.) via une couche d'abstraction.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        services/agent/                          │
│                   Fastify 5 + LangGraph.js                      │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ ZMQ Listener │  │ TriggerEngine│  │    LangGraph Graph    │ │
│  │ (PULL:5560)  │──│  (asyncio)   │──│                       │ │
│  └──────────────┘  │  - timeout   │  │  ┌─────────────────┐  │ │
│                    │  - user_msg  │  │  │ observe         │  │ │
│  ┌──────────────┐  │  - reply_to  │  │  └────────┬────────┘  │ │
│  │ ZMQ Publisher│  │  - admin_cfg │  │           ▼           │ │
│  │ (PUB:5561)  │  └──────────────┘  │  ┌─────────────────┐  │ │
│  └──────────────┘                    │  │ decide          │  │ │
│                                      │  └────────┬────────┘  │ │
│  ┌──────────────┐                    │     ┌─────┴─────┐     │ │
│  │ Redis State  │◄───────────────────│     ▼           ▼     │ │
│  │ (memoire)    │                    │  impersonate  animate  │ │
│  └──────────────┘                    │     └─────┬─────┘     │ │
│                                      │           ▼           │ │
│  ┌──────────────┐                    │  ┌─────────────────┐  │ │
│  │ MongoDB      │◄───────────────────│  │ quality_gate    │  │ │
│  │ (historique) │                    │  └─────────────────┘  │ │
│  └──────────────┘                    └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │ ZMQ PUB                              ▲ ZMQ PULL
         ▼                                      │
┌─────────────────────────────────────────────────────────────────┐
│                     services/gateway/                           │
│  ZmqAgentClient ◄──► MeeshySocketIOManager ◄──► Clients        │
│  (SUB:5561)          (messageSource: 'agent')    (Socket.IO)    │
└─────────────────────────────────────────────────────────────────┘
```

### Ports ZMQ
- `5560` : Gateway PUSH → Agent PULL (events de messages)
- `5561` : Agent PUB → Gateway SUB (reponses agent)

## Les 3 agents

### Observer
Suit et synthetise les conversations en temps reel.
- Met a jour un resume glissant cumule
- Construit et enrichit les `UserRole` de chaque interlocuteur
- Detecte le ton general, les sujets actifs, les dynamiques
- Tourne a chaque message recu

### Impersonator
Repond au nom d'un utilisateur specifique quand configure.
- Active quand un user configure explicitement l'agent pour repondre en son nom
- Utilise le `UserRole` du user comme contrainte dure
- Triggers : timeout, message d'un user specifique, reply-to

### Animator
Fait vivre la plateforme en prenant le controle d'utilisateurs inactifs.
- Acquisition de profils : assignation manuelle par admin OU pickup automatique (inactif depuis N jours/heures)
- **Decision autonome** : l'Animator decide lui-meme au nom de quel user repondre selon le fil de la discussion et le role de chaque user controle
- Scoring de pertinence par ControlledUser pour chaque message recu
- Respecte rigoureusement le role de chacun

## LangGraph StateGraph

```typescript
interface ConversationState {
  conversationId: string
  messages: Message[]                    // fenetre glissante (50-100 derniers)
  summary: string                        // resume cumule par Observer
  toneProfiles: Record<string, UserRole> // profil par userId
  controlledUsers: ControlledUser[]      // users sous controle agent
  triggerContext: TriggerContext          // quel trigger a declenche
  pendingResponse: AgentResponse | null
}

// Nodes
graph.addNode("observe", observerAgent)
graph.addNode("decide", decisionRouter)
graph.addNode("impersonate", impersonatorAgent)
graph.addNode("animate", animatorAgent)
graph.addNode("qualityGate", qualityCheck)

// Edges
graph.setEntryPoint("observe")
graph.addEdge("observe", "decide")
graph.addConditionalEdges("decide", routeDecision, {
  impersonate: "impersonate",
  animate: "animate",
  skip: END,
})
graph.addEdge("impersonate", "qualityGate")
graph.addEdge("animate", "qualityGate")
graph.addConditionalEdges("qualityGate", checkQuality, {
  send: END,
  regenerate: "impersonate", // ou animate selon le context
})
```

### Flow de decision de l'Animator

```
Nouveau message dans la conversation
            │
            ▼
    ┌───────────────┐
    │   OBSERVE     │ ← Met a jour contexte + profils
    └───────┬───────┘
            ▼
    ┌───────────────────────────────────┐
    │        ANIMATOR DECIDE            │
    │                                   │
    │  Pour chaque ControlledUser :     │
    │  1. Topics d'expertise match ?    │
    │  2. Sender dans relationship_map ?│
    │  3. Response trigger match ?      │
    │  4. Silence trigger match ? SKIP  │
    │  5. Scoring pertinence 0-1        │
    │                                   │
    │  → User avec score le plus eleve  │
    │  → Si aucun > seuil → SKIP       │
    └───────────────────────────────────┘
```

## Modele de donnees

### UserRole — Carte d'identite conversationnelle

```typescript
interface UserRole {
  userId: string
  conversationId: string

  // Source du role
  origin: 'observed' | 'archetype' | 'hybrid'
  archetypeId?: string // "curious", "skeptic", "enthusiast"...

  // Profil linguistique
  personaSummary: string          // "Le pragmatique du groupe, oriente solutions"
  tone: string                     // "direct", "chaleureux", "taquin"...
  vocabularyLevel: string          // "familier", "courant", "soutenu"
  typicalLength: string            // "telegraphique", "moyen", "developpe"
  emojiUsage: string               // "jamais", "occasionnel", "abondant"
  topicsOfExpertise: string[]      // sujets ou ce user intervient
  topicsAvoided: string[]          // sujets qu'il ignore
  relationshipMap: Record<string, string> // {userId: "ami proche"...}
  catchphrases: string[]           // expressions recurrentes
  responseTriggers: string[]       // types de messages qui le font reagir
  silenceTriggers: string[]        // types de messages qu'il ignore

  // Verrouillage
  messagesAnalyzed: number
  confidence: number               // 0-1
  locked: boolean                  // true quand confidence >= 0.8
}
```

### Construction du role

| Source | Confidence initiale | Methode |
|--------|-------------------|---------|
| Archetype pur (user sans messages) | 0.4 | Admin assigne un archetype du catalogue |
| Hybrid (archetype + metadata profil) | 0.5 | Archetype + enrichissement par bio, communities, etc. |
| Observed (messages reels) | 0.0 → 1.0 | Observer analyse les messages, affine progressivement |

Le role se verrouille (`locked: true`) quand `confidence >= 0.8` (~30-50 messages analyses).
Un role verrouille ne change plus sauf reset explicite par un admin.

### AgentConfig — Configuration admin

```typescript
interface AgentConfig {
  conversationId: string
  enabled: boolean
  configuredBy: string // admin userId

  // Assignments manuels
  manualUserIds: string[]

  // Regles de pickup automatique
  autoPickupEnabled: boolean
  inactivityThresholdHours: number // default: 72 (3 jours)
  minHistoricalMessages: number    // 0 = archetype autorise
  maxControlledUsers: number       // default: 5
  excludedRoles: string[]          // ["ADMIN", "MODERATOR"]
  excludedUserIds: string[]

  // Triggers
  triggerOnTimeout: boolean
  timeoutSeconds: number           // default: 300 (5 min)
  triggerOnUserMessage: boolean
  triggerFromUserIds: string[]
  triggerOnReplyTo: boolean
}
```

### Archetype — Catalogue de personas predefinies

```typescript
interface Archetype {
  id: string                       // "curious", "skeptic", "enthusiast"...
  name: string                     // "Le Curieux"
  personaSummary: string
  defaultTone: string
  defaultVocabularyLevel: string
  defaultTypicalLength: string
  defaultEmojiUsage: string
  defaultTopicsOfExpertise: string[]
  defaultResponseTriggers: string[]
  defaultSilenceTriggers: string[]
}
```

Archetypes MVP : "curious" (pose des questions), "enthusiast" (positif, encourageant), "skeptic" (challenge les idees), "pragmatic" (oriente solutions), "social" (connecteur, relances).

## Prisma Schema (ajouts)

```prisma
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
}
```

## Integration ZMQ

### Gateway → Agent (PUSH:5560)

```typescript
type AgentEvent =
  | { type: 'agent:new-message'; conversationId: string; messageId: string;
      senderId: string; content: string; originalLanguage: string;
      replyToId?: string; timestamp: number }
  | { type: 'agent:config-updated'; conversationId: string; config: AgentConfig }
  | { type: 'agent:user-status-changed'; userId: string; isOnline: boolean;
      lastActiveAt: string }
```

### Agent → Gateway (PUB:5561)

```typescript
type AgentResponse = {
  type: 'agent:response'
  conversationId: string
  asUserId: string                // le user au nom duquel l'agent repond
  content: string
  replyToId?: string
  messageSource: 'agent'
  metadata: {
    agentType: 'impersonator' | 'animator'
    roleConfidence: number
    archetypeId?: string
  }
}
```

Le gateway recoit la reponse, cree un `Message` en DB avec `senderId: asUserId` et `messageSource: 'agent'`, puis broadcast via Socket.IO.

## Cles Redis

```
agent:state:{conversationId}              → ConversationState (fenetre glissante)
agent:role:{conversationId}:{userId}      → UserRole cache (TTL 1h)
agent:trigger:{conversationId}            → Timers timeout en attente
agent:cooldown:{conversationId}:{userId}  → Anti-spam (TTL configurable)
agent:summary:{conversationId}            → Resume cumule cache
```

## Stack technique MVP

| Composant | Technologie |
|-----------|-------------|
| Runtime | Fastify 5 + Node.js |
| Agent Framework | `@langchain/langgraph` |
| LLM | Multi-provider via LLM Adapter (voir ci-dessous) |
| Communication | `zeromq` (PULL/PUB) |
| State court terme | Redis 8 |
| State long terme | MongoDB 8 (Prisma) |
| Types partages | `@meeshy/shared` |
| Validation | Zod |
| Scheduler | `node-cron` / `setTimeout` |

## LLM Provider Adapter — Architecture multi-provider

Le service agent utilise une couche d'abstraction LLM qui permet aux administrateurs
de changer de provider sans toucher au code.

### Interface commune

```typescript
interface LlmProvider {
  readonly name: string
  chat(params: LlmChatParams): Promise<LlmChatResponse>
  estimateCost(params: LlmChatParams): number
}

interface LlmChatParams {
  messages: LlmMessage[]
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

interface LlmChatResponse {
  content: string
  usage: { inputTokens: number; outputTokens: number }
  model: string
  latencyMs: number
}
```

### Providers implementes (MVP)

```typescript
// services/agent/src/llm/providers/
openai-provider.ts      // OpenAI GPT-4o / GPT-4o-mini (via openai SDK)
anthropic-provider.ts   // Claude Sonnet / Haiku (via @anthropic-ai/sdk)
```

### Providers futurs (post-MVP)

```typescript
mistral-provider.ts     // Mistral Large / Medium
ollama-provider.ts      // Modeles locaux via Ollama (LLaMA, Gemma...)
```

### Configuration admin (Prisma)

```prisma
model AgentLlmConfig {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  provider        String   @default("openai")    // "openai" | "anthropic" | "mistral" | "ollama"
  model           String   @default("gpt-4o-mini") // modele specifique
  apiKey          String                           // chiffre en DB (AES-256)
  baseUrl         String?                          // custom endpoint (ex: Ollama localhost)
  maxTokens       Int      @default(1024)
  temperature     Float    @default(0.7)

  // Limites de cout
  dailyBudgetUsd  Float    @default(20.0)
  maxCostPerCall  Float    @default(0.05)

  // Fallback si le provider principal echoue
  fallbackProvider String?
  fallbackModel    String?
  fallbackApiKey   String?

  configuredBy    String   @db.ObjectId
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Factory pattern

```typescript
function createLlmProvider(config: AgentLlmConfig): LlmProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAiProvider({ apiKey: decrypt(config.apiKey), model: config.model })
    case 'anthropic':
      return new AnthropicProvider({ apiKey: decrypt(config.apiKey), model: config.model })
    case 'mistral':
      return new MistralProvider({ apiKey: decrypt(config.apiKey), model: config.model })
    case 'ollama':
      return new OllamaProvider({ baseUrl: config.baseUrl, model: config.model })
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`)
  }
}
```

Les clés API sont stockées chiffrées en DB (AES-256) et jamais exposées dans les logs ou les réponses API.

## Structure du service

```
services/agent/
├── src/
│   ├── main.ts                    # Fastify app + ZMQ init
│   ├── graph/
│   │   ├── state.ts               # ConversationState type
│   │   ├── graph.ts               # StateGraph definition
│   │   └── router.ts              # Decision routing logic
│   ├── agents/
│   │   ├── observer.ts            # Synthese + profiling
│   │   ├── impersonator.ts        # Reponse au nom d'un user configure
│   │   ├── animator.ts            # Reponse pour animer la plateforme
│   │   └── quality-gate.ts        # Verification de coherence
│   ├── triggers/
│   │   ├── trigger-engine.ts      # Orchestrateur de triggers
│   │   ├── timeout-trigger.ts
│   │   ├── user-message-trigger.ts
│   │   └── reply-to-trigger.ts
│   ├── memory/
│   │   ├── redis-state.ts         # Fenetre glissante, cache roles
│   │   └── mongo-persistence.ts   # Roles verrouilles, configs, summaries
│   ├── archetypes/
│   │   ├── catalog.ts             # Catalogue de personas predefinies
│   │   └── enrichment.ts          # Enrichissement par metadata profil
│   ├── llm/
│   │   ├── llm-provider.ts        # Interface LlmProvider
│   │   ├── llm-factory.ts         # Factory createLlmProvider()
│   │   └── providers/
│   │       ├── openai-provider.ts
│   │       └── anthropic-provider.ts
│   ├── zmq/
│   │   ├── zmq-listener.ts        # PULL socket (events gateway)
│   │   └── zmq-publisher.ts       # PUB socket (reponses)
│   └── routes/
│       ├── config.ts              # CRUD admin config
│       ├── roles.ts               # Gestion des roles
│       └── health.ts              # Healthcheck
├── package.json
├── tsconfig.json
└── Dockerfile
```

## Estimation de complexite

| Phase | Duree | Contenu |
|-------|-------|---------|
| 1. Infrastructure | 3-4 jours | Service Fastify, ZMQ, Prisma, Turborepo |
| 2. Observer | 3-4 jours | Synthese, ToneProfile, archetypes |
| 3. Impersonator | 3-4 jours | Reponse user configure, prompts, quality gate |
| 4. Animator | 4-5 jours | Scoring pertinence, selection role, generation |
| 5. TriggerEngine | 2-3 jours | Timeout, user_message, reply_to, cooldown |
| 6. Admin API | 2-3 jours | CRUD config, assignation, regles pickup |
| 7. Tests + integration | 3-4 jours | TDD, E2E gateway-agent, edge cases |
| **Total MVP** | **~3-4 semaines** | |

## Couts LLM estimes

- Observer : ~$0.001-0.003 par message (resume incremental)
- Impersonator/Animator : ~$0.005-0.01 par reponse generee
- Quality gate : ~$0.001 par verification
- A 1000 messages/jour : ~$5-15/jour
