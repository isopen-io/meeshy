```md
# Copilot Instructions for Meeshy

<!-- High-performance messaging with multi-language backend translation system -->
## Meeshy Project Overview
Meeshy is a high-performance real-time messaging system designed to handle 100k messages per second with multi-language support. It features a distributed architecture with a Fastify gateway, FastAPI translator service, and a shared PostgreSQL database using Prisma ORM. The system is optimized for real-time performance, type safety, and multi-language translation capabilities. Run frontend application with `cd frontend && frontend.sh`, translator service with `cd translator && ./translator.sh` and gateway service with `cd gateway && ./gateway.sh`.
It uses WebSocket for real-time communication and zmq/protobuf for efficient message translation requests. The architecture is designed to ensure that each message is translated into multiple target languages simultaneously, leveraging a robust caching system for performance.

## 🎯 Core Behavioral Rules (CRITICAL - Always Follow)

### 🔒 Encryption rule for anonymous users
Anonymous users do not have an encryption key: their data cannot be encrypted at rest.

1. **Performance First**: Always consider 100k messages/second throughput in design decisions
2. **Multi-language Aware**: Consider that each message gets translated to multiple target languages simultaneously
3. **Type Safety**: Verify type consistency across Fastify/FastAPI/Frontend stack with Prisma schema
4. **Think Before Code**: Consider implications on real-time performance before changes
5. **Ask for Help**: Stop and ask for clarification if stuck for 2-3 minutes
6. **Reference Precisely**: Always include line numbers and filenames when referencing code
7. **Production Tools**: Always choose tools and libraries that are production-ready and well-supported, otherwise, distinct development and production configurations
8. **Commande execution**: Always use production ready commands: `yarn dev` for development and `yarn start`, pnpm instead of npm, ALWAYS USE `cd` BEFORE EXECUTING COMMANDS to ensure correct directory context.

## 🏗️ System Architecture

**Meeshy**: High-performance real-time messaging with multi-language backend translation (100k msg/sec)

### Distributed Architecture
```
Frontend (Next.js) 
    ↓ WebSocket/HTTP
Gateway (Fastify + WebSocket)
    ↓ gRPC/ZMQ/RabbitMQ + Protobuf
Translator (FastAPI + Transformers)
    ↓ Shared Database (PostgreSQL + Prisma)
Cache Layer (Redis) + Database
```

### Service Responsibilities

#### Gateway Service (Fastify)
- **Read**: Messages (create, update, delete, read but can only read MessageTranslations)
- **CRUD**: Users, conversations, groups, preferences, presence
- **Real-time**: WebSocket connections, message routing
- **Language Filtering**: Send only messages in user's configured language
- **Database**: Uses Prisma Client for all operations except message creation

#### Translator Service (FastAPI)  
- **CRUD**: Messages and **MessageTranslations** (create, update, delete, read)
- **Read**: Conversations, user preferences via Prisma
- **Translation**: NLLB via Transformers - translates to ALL required languages
- **Cache**: Robust translation caching system per language pair
- **Database**: Uses Prisma Client with full message management rights

### Communication Patterns
- **Synchronous**: gRPC with Protobuf (real-time message flow)
- **Asynchronous**: ZMQ or RabbitMQ with Protobuf (batch operations)
- **Database**: Shared PostgreSQL with Prisma ORM

## 🌐 Multi-Language Translation Flow

### Translation Request/Response Schema
```protobuf
message TranslationRequest {
  string message_id = 1; // Unique identifier for the message si le message existe déjà sinon vide!
  string text = 2;
  string source_language = 3;
  string target_language = 4;  // Can be "ALL" for all supported languages
  int64 timestamp = 5;
  string sender_id = 6;
  string conversation_id = 7;
}

message Translation {
  string tgt_lang = 1;
  string translated_text = 2;
  bool from_cache = 3;
  int32 processing_time_ms = 4;
  int32 confidence_score = 5;  // Optional, for ML models
  string translation_model = 6; // "basic", "medium", "premium"
  string cache_key = 7;        // Unique cache identifier
  string message_id = 8;       // Reference to original message
  string source_language = 9;  // Source language of the original text
  string original_text = 10;   // Original text before translation
  string translation_id = 11;  // Unique identifier for this translation
  string translation_status = 12; // "pending", "completed", "failed"
  string error_message = 13;   // Optional, for failed translations
  int64 created_at = 14;       // Timestamp of translation creation
  int64 updated_at = 15;       // Timestamp of last update
}

message TranslationResponse {
  string message_id = 1;
  repeated Translation translations = 2;  // Multiple language translations
  string src_lang = 3;
  string original_text = 4;
}
```

### User Language Configuration (Based on Prisma Schema)
```typescript
interface UserLanguageConfig {
  systemLanguage: string;              // Default: "fr"
  regionalLanguage: string;            // Default: "fr" 
  customDestinationLanguage?: string;  // Optional custom language
  autoTranslateEnabled: boolean;       // Default: true
  translateToSystemLanguage: boolean;  // Default: true
  translateToRegionalLanguage: boolean; // Default: false
  useCustomDestination: boolean;       // Default: false
}
```

### Multi-Language Processing Logic
```
1. Gateway receives message from User A (French)
2. Gateway determines conversation participants and their language preferences
3. Gateway → Translator: TranslationRequest with target_language="ALL"
4. Translator processes:
   - Determines required languages from conversation members
   - Checks MessageTranslation table for existing translations
   - Translates missing languages using NLLB 600M for basic/medium, NLLB 1.3B for premium
   - Creates MessageTranslation records with cacheKey
5. Translator → Gateway: TranslationResponse with all translations
6. Gateway broadcasts to users based on their language configuration:
   - User B (systemLanguage: "en") → receives English translation
   - User C (regionalLanguage: "es") → receives Spanish translation  
   - User D (systemLanguage: "fr") → receives original French text
```

## 🔧 Tech Stack Details

### Frontend
- **Framework**: Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui
- **Real-time**: WebSocket client with reconnection logic
- **State**: React hooks with SWR for data fetching
- **Language**: Receives messages only in user's configured language

### Gateway (Fastify)
- **Framework**: Fastify (high-performance Node.js)
- **ORM**: Prisma Client (read messages, CRUD everything else)
- **WebSocket**: Real-time message routing with language filtering
- **Protocols**: gRPC client, ZMQ/RabbitMQ publisher/consumer
- **Logic**: Filter and send messages based on user language preferences

### Translator (FastAPI)
- **Framework**: FastAPI (high-performance Python)
- **ML**: Transformers library (NLLB)
- **ORM**: Prisma Client (full CRUD on messages and translations)
- **Cache**: Redis + MessageTranslation table with cacheKey
- **Protocols**: gRPC server, ZMQ/RabbitMQ consumer/publisher
- **Logic**: Translate single message to multiple target languages

### Database Layer
- **Database**: PostgreSQL (production) / SQLite (development)
- **ORM**: Prisma with shared schema
- **Cache**: Redis for hot translations + MessageTranslation table
- **Schema**: Normalized with separate MessageTranslation table

## 📊 Enhanced Data Flow Patterns

### Real-time Multi-Language Message Flow
```
1. User A sends "Bonjour" (French) → Gateway (WebSocket) 
3. Gateway determines conversation participants and their languages
4. Gateway → Translator (gRPC+Protobuf): 
   TranslationRequest {
     message_id: "msg_123",
     text: "Bonjour",
     source_language: "fr",
     timestamp: 1700000000,
   }
5. Translator creates MessageTranslation records
6. Translator processes message (Transformers, Redis cache, Prisma CRUD):
   - Checks MessageTranslation table for existing fr→en, fr→es, fr→de
   - ML inference for missing translations
   - Creates MessageTranslation records:
     * {messageId: "msg_123", targetLanguage: "en", translatedContent: "Hello", 
        translationModel: "basic", cacheKey: "hash_fr_en_bonjour"}
     * {messageId: "msg_123", targetLanguage: "es", translatedContent: "Hola", 
        translationModel: "basic", cacheKey: "hash_fr_es_bonjour"}
6. Translator → Gateway: TranslationResponse with all translations
7. Gateway broadcasts to recipients based on their language config:
   - User B (systemLanguage: "en") receives: "Hello"
   - User C (regionalLanguage: "es") receives: "Hola"  
   - User D (systemLanguage: "fr") receives: "Bonjour" (original)
```

### Language Resolution Logic
```typescript
function resolveUserLanguage(user: User): string {
  if (user.useCustomDestination && user.customDestinationLanguage) {
    return user.customDestinationLanguage;
  }
  
  if (user.translateToSystemLanguage) {
    return user.systemLanguage;
  }
  
  if (user.translateToRegionalLanguage) {
    return user.regionalLanguage;
  }
  
  return user.systemLanguage; // fallback
}
```

## 🏗️ Project Structure

```
frontend/
├── src/
│   ├── app/           # Next.js App Router
│   ├── components/    # React components
│   ├── hooks/         # WebSocket, SWR hooks
│   └── types/         # Shared TypeScript types (match Prisma)

gateway/               # Fastify service
├── src/
│   ├── routes/        # HTTP endpoints
│   ├── websocket/     # WebSocket handlers with language filtering
│   ├── grpc/          # gRPC client for translation requests
│   ├── queue/         # ZMQ/RabbitMQ client
│   ├── services/      # Language preference management
│   ├── prisma/        # Prisma client instance (read messages, CRUD rest)
│   └── types/         # TypeScript types matching Prisma schema

translator/            # FastAPI service  
├── src/
│   ├── api/           # HTTP endpoints
│   ├── grpc/          # gRPC server for multi-language translation
│   ├── queue/         # ZMQ/RabbitMQ consumer
│   ├── models/        # ML model loading (NLLB)
│   ├── cache/         # Translation cache logic
│   ├── services/      # Language detection and translation logic
│   ├── prisma/        # Prisma client (CRUD messages & translations)
│   └── database/      # Database utilities

shared/
├── proto/             # Protocol Buffer definitions
├── prisma/            # Shared Prisma schema
│   └── schema.prisma  # Single source of truth for database schema
├── types/             # Generated Prisma types + custom types
└── config/            # Environment configuration
```

## ⚡ Development Priorities

### Priority 1: Prisma Schema Consistency
- **Type Generation**: Use `prisma generate` for consistent types
- **Database Operations**: Respect service boundaries (Gateway vs Translator)
- **Migrations**: Coordinate schema changes across services
- **Performance**: Optimize Prisma queries for 10k msg/sec

### Priority 2: Multi-Language Performance
- **Translation Cache**: Leverage MessageTranslation table + Redis
- **Language Detection**: Automatic source language identification
- **Model Management**: Efficient loading of NLLB models
- **Batch Processing**: Group translation operations

### Priority 3: Real-time Language Filtering
- **User Preferences**: Fast lookup using Prisma with proper indexing
- **Message Routing**: Language-aware WebSocket message distribution
- **Translation Strategy**: Smart caching with cacheKey optimization
- **Error Handling**: Graceful fallbacks for translation failures

## 🛡️ Production Configuration

### Database Configuration
```env
# Production Database
DATABASE_URL=postgresql://meeshy:MeeshyP@ssword@postgres:5432/meeshy

# Development Database  
DATABASE_URL=file:./dev.db

# Prisma Configuration
PRISMA_GENERATE_CLIENT=true
DATABASE_POOL_SIZE=20
```

### Performance Tuning
```env
# Gateway (Fastify)
FASTIFY_PORT=3000
WS_MAX_CONNECTIONS=100000
PRISMA_POOL_SIZE=10
GRPC_MAX_CONNECTIONS=100

# Translator (FastAPI)  
FASTAPI_PORT=8000
ML_BATCH_SIZE=32
PRISMA_POOL_SIZE=15
TRANSLATION_CACHE_TTL=3600
WORKERS=4
GPU_MEMORY_FRACTION=0.8

# Language Support
SUPPORTED_LANGUAGES=fr,en,es,de,pt,zh,ja,ar
DEFAULT_LANGUAGE=fr
AUTO_DETECT_LANGUAGE=true
```

## 🔄 Database Schema Insights (Prisma-based)

### Key Models
```typescript
// From Prisma schema - User language configuration
model User {
  systemLanguage: string              // Default: "fr"
  regionalLanguage: string            // Default: "fr"
  customDestinationLanguage?: string  // Optional
  autoTranslateEnabled: boolean       // Default: true
  translateToSystemLanguage: boolean  // Default: true
  translateToRegionalLanguage: boolean // Default: false
  useCustomDestination: boolean       // Default: false
}

// Message with original content
model Message {
  id: string
  content: string
  originalLanguage: string            // Source language
  translations: MessageTranslation[]  // Related translations
}

// Normalized translation storage
model MessageTranslation {
  messageId: string
  sourceLanguage: string
  targetLanguage: string
  translatedContent: string
  translationModel: "basic" | "medium" | "premium"
  cacheKey: string          // Unique cache identifier
}
```

### Service Database Permissions
```typescript
// Gateway Service (Fastify) - Prisma Operations
interface GatewayDBOperations {
  Messages: {
    read: true,
    create: false,  // Only Translator creates messages
    update: false,
    delete: false
  },
  Users: { read: true, create: true, update: true, delete: true },
  Conversations: { read: true, create: true, update: true, delete: true },
  MessageTranslations: { read: true, create: false, update: false, delete: false }
}

// Translator Service (FastAPI) - Prisma Operations
interface TranslatorDBOperations {
  Messages: { read: true, create: true, update: true, delete: true },
  MessageTranslations: { read: true, create: true, update: true, delete: true },
  Users: { read: true, create: false, update: false, delete: false },
  Conversations: { read: true, create: false, update: false, delete: false }
}
```

## 📋 Quick Decision Matrix

**Database Provider**: PostgreSQL (production), SQLite (development)
**ORM**: Prisma Client in both Gateway and Translator services
**Message Creation**: Only Translator service creates Message records
**Translation Storage**: MessageTranslation table + Redis cache
**Language Resolution**: Based on user's language configuration flags
**Cache Key Format**: `hash(sourceText + sourceLanguage + targetLanguage)`
**Type Safety**: Use Prisma generated types throughout the application

## 🎯 Success Metrics

- **Database Performance**: <10ms average Prisma query time
- **Multi-language Throughput**: 10k messages/second with translations
- **Translation Cache Hit**: >80% using MessageTranslation table + Redis
- **Language Accuracy**: Correct language delivery based on user preferences
- **Schema Consistency**: Zero type mismatches between services
- **Real-time Performance**: <50ms end-to-end message delivery with translation

## 🔧 Critical Implementation Notes

### Prisma Client Usage
```typescript
// Gateway Service - Read-only messages
const messages = await prisma.message.findMany({
  where: { conversationId },
  include: { 
    translations: {
      where: { targetLanguage: userLanguage }
    }
  }
});

// Translator Service - Full message management
const message = await prisma.message.create({
  data: {
    content: originalText,
    originalLanguage: sourceLanguage,
    senderId,
    conversationId
  }
});

const translation = await prisma.messageTranslation.create({
  data: {
    messageId: message.id,
    sourceLanguage,
    targetLanguage,
    translatedContent,
    translationModel: "basic",
    cacheKey: generateCacheKey(originalText, sourceLanguage, targetLanguage)
  }
});
```

### Language Configuration Logic
```typescript
function getRequiredLanguages(conversationMembers: User[]): string[] {
  const languages = new Set<string>();
  
  conversationMembers.forEach(user => {
    if (user.useCustomDestination && user.customDestinationLanguage) {
      languages.add(user.customDestinationLanguage);
    } else if (user.translateToSystemLanguage) {
      languages.add(user.systemLanguage);
    } else if (user.translateToRegionalLanguage) {
      languages.add(user.regionalLanguage);
    }
  });
  
  return Array.from(languages);
}
```

---

*Remember: Always use Prisma-generated types and respect service database boundaries. Each message gets translated to multiple languages simultaneously, stored in MessageTranslation table, but users only receive messages in their configured language preference.*
```