# ZMQ Translation Client - Architecture Modulaire

Client ZMQ haute performance pour communication avec le service de traduction Python.

## Architecture

### Modules

```
zmq-translation/
├── ZmqTranslationClient.ts    # 680 lignes - Client principal, orchestration
├── ZmqConnectionPool.ts       # 227 lignes - Pool de connexions ZMQ
├── ZmqRetryHandler.ts         # 282 lignes - Retry et circuit breaker
├── types.ts                   # 416 lignes - Définitions de types
└── index.ts                   #  69 lignes - Exports publics
```

### Séparation des Responsabilités

#### 1. **ZmqConnectionPool** - Gestion des Connexions
- Création et gestion des sockets ZMQ (PUSH/SUB)
- Polling non-bloquant pour réception de messages
- Envoi de messages simples et multipart
- Health checks et statistiques de connexion
- Cycle de vie propre (connect/disconnect)

#### 2. **ZmqRetryHandler** - Résilience
- Stratégie de retry avec backoff exponentiel
- Circuit breaker (CLOSED/OPEN/HALF_OPEN)
- Tracking des requêtes en cours
- Statistiques de retry et échecs
- Cleanup automatique des requêtes stale

#### 3. **ZmqTranslationClient** - Orchestration
- API publique pour toutes les opérations
- Routing des événements vers les handlers appropriés
- Gestion de la déduplication
- Enrichissement des messages multipart (binaires audio)
- Composition forte des modules internes

## Utilisation

### Import

```typescript
import {
  ZmqTranslationClient,
  type TranslationRequest,
  type AudioProcessRequest
} from '@/services/zmq-translation';
```

### Initialisation

```typescript
const client = new ZmqTranslationClient({
  host: 'localhost',
  pushPort: 5555,
  subPort: 5558,
  retryConfig: {
    maxRetries: 3,
    initialDelayMs: 1000,
    circuitBreakerThreshold: 5
  }
});

await client.initialize();
```

### Envoi de Requêtes

```typescript
// Translation simple
const taskId = await client.sendTranslationRequest({
  messageId: 'msg-123',
  text: 'Hello world',
  sourceLanguage: 'en',
  targetLanguages: ['fr', 'es'],
  conversationId: 'conv-456',
  modelType: 'basic'
});

// Audio processing avec multipart binaire
const audioTaskId = await client.sendAudioProcessRequest({
  messageId: 'msg-789',
  attachmentId: 'att-123',
  conversationId: 'conv-456',
  senderId: 'user-1',
  audioPath: '/path/to/audio.wav',
  audioDurationMs: 5000,
  targetLanguages: ['fr', 'es'],
  generateVoiceClone: true,
  modelType: 'premium'
});
```

### Écoute des Événements

```typescript
// Translation completed
client.on('translationCompleted', (event) => {
  console.log(`Translation done: ${event.result.translatedText}`);
});

// Translation error
client.on('translationError', (event) => {
  console.error(`Translation failed: ${event.error}`);
});

// Audio process completed (avec binaires)
client.on('audioProcessCompleted', (event) => {
  event.translatedAudios.forEach(audio => {
    // audio._audioBinary contient le Buffer brut
    saveAudioFile(audio._audioBinary, audio.targetLanguage);
  });
});

// Circuit breaker events
client.on('circuitBreakerOpen', () => {
  console.warn('Circuit breaker OPEN - requests blocked');
});
```

### Monitoring

```typescript
// Statistiques client
const stats = client.getStats();
console.log({
  requestsSent: stats.requests_sent,
  resultsReceived: stats.results_received,
  errorsReceived: stats.errors_received,
  uptimeSeconds: stats.uptime_seconds
});

// État du circuit breaker
const circuitState = client.getCircuitBreakerState();
console.log(`Circuit breaker: ${circuitState}`);

// Requêtes en attente
const pendingCount = client.getPendingRequestsCount();
console.log(`Pending requests: ${pendingCount}`);

// Health check
const healthy = await client.healthCheck();
console.log(`Health: ${healthy ? 'OK' : 'FAILED'}`);
```

## Protocole ZMQ Multipart

### Format des Messages Binaires

Pour optimiser les transferts (éviter base64), utilise ZMQ multipart:

```
Frame 0: JSON metadata avec binaryFrames
Frame 1+: Données binaires (audio, embeddings)
```

### Exemple: Audio Process

```typescript
// Gateway → Translator (PUSH)
Frame 0: {
  type: 'audio_process',
  messageId: 'msg-123',
  binaryFrames: {
    audio: 1,           // Frame index 1
    audioMimeType: 'audio/wav',
    audioSize: 1048576
  }
}
Frame 1: <Buffer audio raw binary>

// Translator → Gateway (PUB)
Frame 0: {
  type: 'audio_process_completed',
  binaryFrames: {
    audio_fr: { index: 1, size: 524288, mimeType: 'audio/wav' },
    audio_es: { index: 2, size: 532480, mimeType: 'audio/wav' },
    embedding: { index: 3, size: 4096 }
  }
}
Frame 1: <Buffer audio français>
Frame 2: <Buffer audio espagnol>
Frame 3: <Buffer embedding binaire>
```

## Circuit Breaker

### États

- **CLOSED**: Fonctionnement normal
- **OPEN**: Requêtes bloquées après trop d'échecs
- **HALF_OPEN**: Test de rétablissement après timeout

### Configuration

```typescript
{
  circuitBreakerThreshold: 5,        // Échecs avant ouverture
  circuitBreakerResetTimeMs: 60000   // Timeout avant HALF_OPEN
}
```

## Retry Strategy

### Backoff Exponentiel

```typescript
delay = min(
  initialDelayMs * (backoffMultiplier ^ retryCount),
  maxDelayMs
) + jitter
```

### Configuration

```typescript
{
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
}
```

## Types d'Événements

### Translation
- `translationCompleted` - Traduction réussie
- `translationError` - Erreur de traduction

### Audio
- `audioProcessCompleted` - Audio traité (avec binaires)
- `audioProcessError` - Erreur de traitement audio

### Transcription
- `transcriptionCompleted` - Transcription réussie
- `transcriptionError` - Erreur de transcription

### Voice API
- `voiceAPISuccess` - Opération voice réussie
- `voiceAPIError` - Erreur voice API
- `voiceJobProgress` - Progression d'un job

### Voice Profile
- `voiceProfileAnalyzeResult` - Analyse de profil vocal
- `voiceProfileVerifyResult` - Vérification de profil
- `voiceProfileCompareResult` - Comparaison de profils
- `voiceProfileError` - Erreur de profil vocal

### Circuit Breaker
- `circuitBreakerOpen` - Circuit ouvert
- `circuitBreakerHalfOpen` - Circuit en test
- `circuitBreakerClosed` - Circuit fermé

## Shutdown Propre

```typescript
// Cleanup avant arrêt
await client.close();
```

## Avantages de l'Architecture

1. **Modularité**: Chaque module < 300 lignes, responsabilité unique
2. **Composition**: Client compose ConnectionPool + RetryHandler
3. **Testabilité**: Modules isolés faciles à tester
4. **Maintenabilité**: Séparation claire des préoccupations
5. **Extensibilité**: Facile d'ajouter de nouveaux handlers
6. **Résilience**: Circuit breaker + retry intégrés
7. **Performance**: Multipart binaire, polling non-bloquant
8. **Type Safety**: Types TypeScript stricts et complets
