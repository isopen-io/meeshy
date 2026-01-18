# Architecture Modulaire - Message Translation Service

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│         MessageTranslationService (Orchestrateur)           │
│                                                             │
│  API Publique:                                             │
│  • handleNewMessage()                                      │
│  • getTranslation()                                        │
│  • processAudioAttachment()                                │
│  • transcribeAttachment()                                  │
│  • getStats()                                              │
└─────────────────────────────────────────────────────────────┘
         │          │          │            │
         │          │          │            │
    ┌────▼───┐  ┌──▼────┐  ┌──▼──────┐  ┌─▼────────────┐
    │Translation│LanguageTranslation│  │ Encryption   │
    │  Cache   │  Cache │   Stats   │  │   Helper     │
    └──────────┘  └───────┘  └─────────┘  └──────────────┘
```

## Flux de Données

### 1. Nouveau Message
```
Client Request
    │
    ▼
handleNewMessage()
    │
    ├─> E2EE? ──YES──> Skip Translation
    │                        │
    NO                       ▼
    │                   Return (e2ee_skipped)
    ▼
_saveMessageToDatabase()
    │
    ├─> translationStats.incrementMessagesSaved()
    │
    ▼
setImmediate() ────────> _processTranslationsAsync()
    │                            │
    │                            ├─> languageCache.get(conversationId)
    │                            │        │
    │                            │    MISS │ HIT
    │                            │        ▼   │
    │                            │   Extract  │
    │                            │   from DB  │
    │                            │        │   │
    │                            ├────────┴───┘
    │                            │
    │                            ├─> Filter languages (skip source == target)
    │                            │
    │                            ├─> zmqClient.sendTranslationRequest()
    │                            │
    │                            └─> translationStats.incrementRequestsSent()
    │
    ▼
Return { messageId, status: 'message_saved' }
```

### 2. Traduction Reçue
```
ZMQ Response
    │
    ▼
_handleTranslationCompleted()
    │
    ├─> Check duplicate (processedTasks)
    │
    ├─> encryptionHelper.shouldEncryptTranslation()
    │        │
    │    YES │ NO
    │        ▼   │
    │   encryptionHelper.encryptTranslation()
    │        │   │
    ├────────┴───┘
    │
    ├─> _saveTranslationToDatabase()
    │        │
    │        └─> UPSERT with encryption metadata
    │
    ├─> translationCache.set(key, result)
    │
    ├─> translationStats.incrementTranslationsReceived()
    │
    └─> emit('translationReady', data)
```

### 3. Récupération Traduction
```
getTranslation(messageId, targetLang)
    │
    ├─> TranslationCache.generateKey(messageId, targetLang, sourceLang)
    │
    ├─> translationCache.get(key)
    │        │
    │    HIT │ MISS
    │        ▼   │
    │   Return   │
    │        result
    │            ▼
    │      Prisma Query (encrypted?)
    │            │
    │        YES │ NO
    │            ▼   │
    │   encryptionHelper.decryptTranslation()
    │            │   │
    ├────────────┴───┘
    │
    ├─> translationCache.set(key, result)
    │
    └─> Return result
```

## Responsabilités des Modules

### TranslationCache
- **Entrée**: `(key: string, result: TranslationResult)`
- **Sortie**: `TranslationResult | null`
- **État**: `Map<string, TranslationResult>`
- **Algorithme**: LRU (Least Recently Used)
- **Capacité**: 1000 entrées

### LanguageCache
- **Entrée**: `(conversationId: string, languages: string[])`
- **Sortie**: `string[] | null`
- **État**: `Map<string, { languages, timestamp }>`
- **Algorithme**: TTL (Time To Live)
- **TTL**: 5 minutes
- **Capacité**: 100 conversations

### TranslationStats
- **Entrée**: Increment methods (void)
- **Sortie**: `TranslationServiceStats`
- **État**: Compteurs + timestamp de démarrage
- **Métriques**:
  - messages_saved
  - translation_requests_sent
  - translations_received
  - errors
  - pool_full_rejections
  - avg_processing_time
  - uptime_seconds
  - memory_usage_mb

### EncryptionHelper
- **Entrée**:
  - Plaintext + conversationId
  - Ciphertext + keyId + iv + authTag
- **Sortie**:
  - Encrypted data + metadata
  - Decrypted plaintext
- **Algorithme**: AES-256-GCM
- **Modes**:
  - `e2ee`: Skip translation (client-side only)
  - `server`: Encrypt translations
  - `hybrid`: Encrypt translations
  - `null`: No encryption

## Patterns Utilisés

### 1. Composition over Inheritance
```typescript
class MessageTranslationService {
  constructor(prisma: PrismaClient) {
    // Inject dependencies
    this.translationCache = new TranslationCache(1000);
    this.languageCache = new LanguageCache(5 * 60 * 1000, 100);
    this.translationStats = new TranslationStats();
    this.encryptionHelper = new EncryptionHelper(prisma);
  }
}
```

### 2. Strategy Pattern (Encryption)
```typescript
// Stratégie basée sur encryptionMode
if (encryptionMode === 'e2ee') {
  // Skip translation
}
if (encryptionMode === 'server' || encryptionMode === 'hybrid') {
  // Encrypt translation
}
```

### 3. Cache-Aside Pattern
```typescript
// Try cache first
const cached = cache.get(key);
if (cached) return cached;

// Fallback to database
const dbResult = await prisma.query();

// Store in cache
cache.set(key, dbResult);
return dbResult;
```

### 4. Event-Driven Architecture
```typescript
// Service émet des événements
this.emit('translationReady', data);
this.emit('audioTranslationReady', data);

// Clients écoutent
service.on('translationReady', (data) => {
  // Notify via Socket.IO
});
```

## Métriques de Performance

### Cache Hit Rate Attendu
- **TranslationCache**: 60-70% (messages fréquemment consultés)
- **LanguageCache**: 90-95% (participants stables dans conversations)

### Réduction Requêtes DB
- **Avant**: 1 requête / getTranslation()
- **Après**: ~0.35 requêtes / getTranslation() (65% hit rate)

### Temps de Réponse
- **Cache hit**: < 1ms
- **Cache miss**: ~10-50ms (Prisma query)
- **Cache miss + decryption**: ~15-60ms

## Sécurité

### Encryption at Rest
```
Message (plaintext)
    │
    ▼
Translation Service
    │
    ├─> Encrypt with conversation key (AES-256-GCM)
    │
    ▼
Database (encrypted)
    │
    ▼
getTranslation()
    │
    ├─> Decrypt with conversation key
    │
    ▼
Client (plaintext)
```

### Key Management
```
Master Key (env: ENCRYPTION_MASTER_KEY)
    │
    └─> Encrypts conversation keys
            │
            └─> Stored in ServerEncryptionKey table
                    │
                    └─> Decrypt on demand for translation
```

## Extensions Futures

### Module TranslationProcessor (Phase 2)
```typescript
export class TranslationProcessor {
  constructor(
    private prisma: PrismaClient,
    private languageCache: LanguageCache,
    private zmqClient: ZMQTranslationClient
  ) {}

  async processTranslations(message: Message, targetLang?: string): Promise<void>
  async processRetranslation(messageId: string, data: MessageData): Promise<void>
  async extractConversationLanguages(conversationId: string): Promise<string[]>
}
```

### Module AudioHandler (Phase 2)
```typescript
export class AudioHandler {
  constructor(
    private prisma: PrismaClient,
    private stats: TranslationStats
  ) {}

  async handleAudioProcessCompleted(data: AudioProcessData): Promise<void>
  async handleAudioProcessError(data: AudioErrorData): Promise<void>
  async handleTranscriptionCompleted(data: TranscriptionData): Promise<void>
}
```

## Testabilité

Chaque module peut être testé indépendamment:

```typescript
// TranslationCache.test.ts
describe('TranslationCache', () => {
  test('should implement LRU eviction', () => {
    const cache = new TranslationCache(2);
    cache.set('key1', result1);
    cache.set('key2', result2);
    cache.set('key3', result3); // evicts key1
    expect(cache.has('key1')).toBe(false);
  });
});

// EncryptionHelper.test.ts
describe('EncryptionHelper', () => {
  test('should encrypt and decrypt translation', async () => {
    const helper = new EncryptionHelper(prismaMock);
    const encrypted = await helper.encryptTranslation('Hello', 'conv-123');
    const decrypted = await helper.decryptTranslation(
      encrypted.encryptedContent,
      encrypted.encryptionKeyId!,
      encrypted.encryptionIv!,
      encrypted.encryptionAuthTag!
    );
    expect(decrypted).toBe('Hello');
  });
});
```
