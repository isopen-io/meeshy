# Real-Time Latency Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrumenter de bout en bout le pipeline d'envoi de message (REST + Socket.IO) et le pipeline de push notifications APN/FCM afin de mesurer précisément où se logent les latences perçues (icône horloge → coche côté iOS, délais APN variables).

**Architecture:** Réutiliser `enhancedLogger` (Pino) + `performanceLogger.start/end` déjà présents dans `services/gateway/src/utils/logger-enhanced.ts`. Propager un identifiant de corrélation (`clientMessageId` côté texte, `socketId+createdAt` fallback) à travers toutes les étapes bloquantes du sender ET à travers le pipeline push. Côté iOS, mesurer le delta `send tap → ACK reçu` via `os.Logger` unifié. Aucune optimisation à ce stade — uniquement mesures.

**Tech Stack:** TypeScript 5.9 strict-off (gateway), Pino 9 (logging), Swift 6 (iOS, `os.Logger` Apple unified logging), Jest (tests gateway), XCTest (tests iOS).

---

## Roadmap globale

Cette phase A est la première des quatre. Les phases B/C/D seront planifiées **après** avoir lu les mesures réelles.

| Phase | Objet | Statut |
|-------|-------|--------|
| **A. Instrumentation** | Mesurer où va le temps (gateway + APN + iOS) | **Détaillé ci-dessous** |
| B. Optimisation critical path | Réduire le travail bloquant avant ACK (extraire `triggerAllNotifications`, alléger `include` Prisma, broadcast plus tôt) | À planifier après mesures de A |
| C. Fiabilité APN | Logging timing + retry exponentiel + dedup `collapseId` + observabilité tokens | À planifier après mesures de A |
| D. UX optimistic iOS | Brancher `DeliveryStatus.invisible` / `.clock` / `.slow` (états déjà définis dans `CoreModels.swift:365-395` mais jamais assignés) | À planifier après mesures de A |

---

## Phase A — Instrumentation (cette session)

### Périmètre

Trois flots à instrumenter :

1. **REST `POST /conversations/:id/messages`** — chemin sender pour les messages texte
2. **Socket.IO `message:send-with-attachments`** — chemin sender pour les médias (audio inclus)
3. **`PushNotificationService.sendViaAPNS` / `sendViaFCM`** — chemin push APN/FCM

Plus :

4. **iOS** — chronomètre côté client `send tap → ACK reçu`

### Principes

- **Pas de nouveau format de log.** Réutiliser `enhancedLogger.child({ module })` et `performanceLogger.start(name).end({...})`.
- **Une seule clé de corrélation** : `clientMessageId` (déjà obligatoire dans `SendMessageBodySchema` et le payload Socket.IO selon `services/gateway/src/routes/conversations/messages.ts:38-40`). Tous les logs d'une même requête doivent inclure ce champ.
- **TDD pour la logique** (helper, propagation du correlationId, tests de non-régression).
- **Pas de TDD pour l'ajout de log lines individuelles** — on vérifie en bout de chaîne par un test d'intégration léger qui asserte la présence des étapes dans la sortie pino.
- **Pas d'optimisation** : on n'extrait pas, on ne déplace pas. On loggue.

### Fichiers concernés

| Fichier | Action |
|---|---|
| `services/gateway/src/utils/logger-enhanced.ts` | Modifier : étendre `performanceLogger` pour exposer `withTiming(name, fn, context)` |
| `services/gateway/src/__tests__/unit/logger-enhanced.test.ts` | Créer : tests du nouveau helper |
| `services/gateway/src/services/messaging/MessagingService.ts` | Modifier : breakdown timing dans `handleMessage` |
| `services/gateway/src/services/messaging/MessageProcessor.ts` | Modifier : breakdown timing dans `saveMessage` |
| `services/gateway/src/socketio/handlers/MessageHandler.ts` | Modifier : timing autour de `handleMessage` + `broadcastNewMessage` |
| `services/gateway/src/routes/conversations/messages.ts` | Modifier : timing autour du POST sender (lignes ~1197-1370) |
| `services/gateway/src/services/PushNotificationService.ts` | Modifier : timing autour de `sendViaAPNS` et `sendViaFCM` |
| `services/gateway/src/__tests__/integration/message-send-instrumentation.test.ts` | Créer : test de bout en bout qui asserte les step logs |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Modifier : log delta `sendStart → ack` |
| `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift` | Modifier (mineur) : log register-device-token round-trip |

### Format des logs

Toutes les nouvelles entrées suivent ce schéma (compatible avec le formatter Pino actuel) :

```jsonc
{
  "msg": "perf:message.saveMessage",          // step name normalisé
  "data": {
    "clientMessageId": "cid_a1b2c3d4-...",    // correlationId obligatoire
    "step": "message.saveMessage",            // dupliqué dans data pour grep facile
    "phase": "start" | "end",                 // start ou end
    "durationMs": 142,                        // présent uniquement sur phase=end
    "module": "MessageProcessor",
    "conversationId": "...",                  // optionnel
    "messageId": "..."                        // optionnel
  }
}
```

Convention de nommage `step` (toutes en `snake.dotted` pour grouping aisé) :

- `http.message.post` (route REST entry/exit)
- `ws.message.send-with-attachments` (socket entry/exit)
- `messaging.handleMessage`
- `messaging.validateRequest`
- `messaging.resolveConversationId`
- `messaging.participantLookup`
- `messaging.detectLanguage`
- `messaging.saveMessage` ← englobe tout `processor.saveMessage`
- `messaging.processLinks`
- `messaging.encryptionContext`
- `messaging.prismaMessageCreate`
- `messaging.handleAttachments`
- `messaging.refreshAttachments`
- `messaging.trackingLinks`
- `messaging.mentionsAndNotifications`
- `messaging.updateConversation`
- `messaging.markAsRead`
- `messaging.queueTranslation`
- `messaging.updateStats`
- `ws.broadcastNewMessage`
- `push.sendViaAPNS`
- `push.sendViaFCM`

---

### Task 1 : Helper `withTiming` dans `logger-enhanced.ts`

**Files:**
- Modify: `services/gateway/src/utils/logger-enhanced.ts` (extension du bloc `performanceLogger`, lignes 428-450)
- Create: `services/gateway/src/__tests__/unit/logger-enhanced.test.ts`

- [ ] **Step 1.1 : Lire le fichier cible**

Run : Read `services/gateway/src/utils/logger-enhanced.ts:428-460` pour confirmer le format de `performanceLogger.start(name).end(context)`.

- [ ] **Step 1.2 : Écrire le test qui échoue**

Créer `services/gateway/src/__tests__/unit/logger-enhanced.test.ts` :

```ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import pino from 'pino';

// Capture pino output by mocking the FormattedStream write target.
const stdoutWrites: string[] = [];
jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
  stdoutWrites.push(typeof chunk === 'string' ? chunk : chunk.toString());
  return true;
});

beforeEach(() => {
  stdoutWrites.length = 0;
});

import { performanceLogger } from '../../utils/logger-enhanced';

describe('performanceLogger.withTiming', () => {
  it('emits a start log, awaits the inner fn, emits an end log with durationMs and returns the inner value', async () => {
    const result = await performanceLogger.withTiming(
      'test.step',
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'inner-value';
      },
      { clientMessageId: 'cid_test' }
    );
    expect(result).toBe('inner-value');
    const startLog = stdoutWrites.find((l) => l.includes('"step":"test.step"') && l.includes('"phase":"start"'));
    const endLog = stdoutWrites.find((l) => l.includes('"step":"test.step"') && l.includes('"phase":"end"'));
    expect(startLog).toBeDefined();
    expect(endLog).toBeDefined();
    expect(endLog).toMatch(/"durationMs":\s*\d+/);
    expect(endLog).toContain('"clientMessageId":"cid_test"');
  });

  it('still emits an end log with error=true when the inner fn throws, and rethrows', async () => {
    await expect(
      performanceLogger.withTiming('test.step.fail', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    const endLog = stdoutWrites.find(
      (l) => l.includes('"step":"test.step.fail"') && l.includes('"phase":"end"')
    );
    expect(endLog).toBeDefined();
    expect(endLog).toContain('"error":true');
  });
});
```

- [ ] **Step 1.3 : Lancer le test, vérifier qu'il échoue**

Run : `cd services/gateway && pnpm jest src/__tests__/unit/logger-enhanced.test.ts --runInBand`
Expected : FAIL — `performanceLogger.withTiming is not a function`.

- [ ] **Step 1.4 : Implémenter `withTiming` minimal**

Dans `services/gateway/src/utils/logger-enhanced.ts`, remplacer le bloc `performanceLogger` (lignes 428-450) par :

```ts
export const performanceLogger = {
  start(operationName: string) {
    const startTime = Date.now();

    return {
      end: (context?: Record<string, any>) => {
        const duration = Date.now() - startTime;
        const level = duration > 1000 ? 'warn' : 'info';

        logger[level](
          {
            ...redactPII(context || {}),
            operation: operationName,
            durationMs: duration
          },
          `Operation completed: ${operationName}`
        );
      }
    };
  },

  /**
   * Phase A real-time instrumentation — wraps an async fn with a start/end
   * pair of structured logs carrying durationMs. The end log is emitted even
   * when the fn throws (with error:true) and the original error is rethrown.
   */
  async withTiming<T>(
    step: string,
    fn: () => Promise<T>,
    context: Record<string, any> = {}
  ): Promise<T> {
    const startTime = Date.now();
    const baseCtx = redactPII({ ...context, step, phase: 'start' });
    logger.info(baseCtx, `perf:${step}`);
    try {
      const result = await fn();
      const durationMs = Date.now() - startTime;
      logger.info(
        redactPII({ ...context, step, phase: 'end', durationMs }),
        `perf:${step}`
      );
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.warn(
        redactPII({
          ...context,
          step,
          phase: 'end',
          durationMs,
          error: true,
          errorMessage: err instanceof Error ? err.message : String(err)
        }),
        `perf:${step}`
      );
      throw err;
    }
  }
};
```

- [ ] **Step 1.5 : Relancer le test, vérifier qu'il passe**

Run : `cd services/gateway && pnpm jest src/__tests__/unit/logger-enhanced.test.ts --runInBand`
Expected : PASS (2 tests).

- [ ] **Step 1.6 : Commit**

```bash
git add services/gateway/src/utils/logger-enhanced.ts services/gateway/src/__tests__/unit/logger-enhanced.test.ts
git commit -m "feat(gateway/logger): add performanceLogger.withTiming for step instrumentation"
```

---

### Task 2 : Instrumenter `MessagingService.handleMessage`

**Files:**
- Modify: `services/gateway/src/services/messaging/MessagingService.ts:40-174`

- [ ] **Step 2.1 : Lire la méthode `handleMessage` (lignes 40-174)**

Run : Read le fichier pour vérifier que rien n'a changé depuis la rédaction du plan.

- [ ] **Step 2.2 : Ajouter l'import du logger en tête de fichier**

Sous les imports existants (après ligne 17) :

```ts
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'MessagingService' });
```

- [ ] **Step 2.3 : Wrapper chaque étape de `handleMessage` avec `withTiming`**

Remplacer le corps de `handleMessage` (lignes 47-173) par cette version instrumentée. Le pattern : on définit `corr` une seule fois et on le passe à chaque `withTiming`.

```ts
const corr = {
  clientMessageId: request.clientMessageId,
  conversationId: request.conversationId,
  participantId,
  requestId
};
logger.info('perf:messaging.handleMessage', { ...corr, step: 'messaging.handleMessage', phase: 'start' });

try {
  const validationResult = await performanceLogger.withTiming(
    'messaging.validateRequest',
    () => this.validator.validateRequest(request),
    corr
  );
  if (!validationResult.isValid) {
    return this.createErrorResponse(validationResult.errors[0].message, requestId);
  }

  const conversationId = await performanceLogger.withTiming(
    'messaging.resolveConversationId',
    () => this.validator.resolveConversationId(request.conversationId),
    corr
  );
  if (!conversationId) {
    return this.createErrorResponse('Conversation non trouvée', requestId);
  }

  let participant = await performanceLogger.withTiming(
    'messaging.participantLookup',
    async () => {
      let p = await this.prisma.participant.findUnique({
        where: { id: participantId },
        select: { id: true, conversationId: true, isActive: true }
      });
      if (!p || p.conversationId !== conversationId) {
        console.error('[MessagingService] DEPRECATED: userId passed as participantId...', { participantId, conversationId });
        p = await this.prisma.participant.findFirst({
          where: { userId: participantId, conversationId, isActive: true },
          select: { id: true, conversationId: true, isActive: true }
        });
      }
      if (!p) {
        p = await this.ensureParticipantFromMember(participantId, conversationId);
      }
      return p;
    },
    { ...corr, conversationId }
  );

  if (!participant || !participant.isActive) {
    return this.createErrorResponse('Permissions insuffisantes pour envoyer des messages', requestId);
  }

  const detectedLanguage = request.content
    ? await performanceLogger.withTiming(
        'messaging.detectLanguage',
        () => this.validator.detectLanguage(request.content!),
        corr
      )
    : 'fr';
  const originalLanguage = request.originalLanguage && request.originalLanguage === detectedLanguage
    ? request.originalLanguage
    : detectedLanguage;

  const message = await performanceLogger.withTiming(
    'messaging.saveMessage',
    () => this.processor.saveMessage({
      ...request,
      originalLanguage,
      conversationId,
      senderId: participant!.id,
      mentionedUserIds: request.mentionedUserIds,
      encryptedContent: request.encryptedPayload?.ciphertext,
      encryptionMetadata: request.encryptedPayload ? {
        mode: 'e2ee',
        ...request.encryptedPayload
      } as unknown as import('@meeshy/shared/prisma/client').Prisma.InputJsonValue : undefined,
      clientMessageId: request.clientMessageId
    }),
    { ...corr, conversationId }
  );

  const isDuplicate = Boolean((message as { isDuplicate?: boolean }).isDuplicate);

  if (isDuplicate) {
    const translations = (message as { translations?: unknown }).translations;
    const needsRetranslate = this.isTranslationsEmpty(translations);
    const translationStatus = await this.queueTranslation(message, originalLanguage, { skip: !needsRetranslate });
    const response = await this.createSuccessResponse(message, requestId, startTime, undefined, translationStatus);
    logger.info('perf:messaging.handleMessage', {
      ...corr, step: 'messaging.handleMessage', phase: 'end',
      durationMs: Date.now() - startTime, dedupHit: true
    });
    return response;
  }

  await performanceLogger.withTiming(
    'messaging.updateConversation',
    () => this.updateConversation(conversationId),
    corr
  );

  await performanceLogger.withTiming(
    'messaging.markAsRead',
    () => this.readStatusService.markMessagesAsRead(participant!.id, conversationId, message.id),
    { ...corr, messageId: message.id }
  );

  const translationStatus = await performanceLogger.withTiming(
    'messaging.queueTranslation',
    () => this.queueTranslation(message, originalLanguage),
    { ...corr, messageId: message.id }
  );

  const stats = await performanceLogger.withTiming(
    'messaging.updateStats',
    () => this.updateStats(conversationId, originalLanguage),
    { ...corr, messageId: message.id }
  );

  const response = await this.createSuccessResponse(message, requestId, startTime, stats, translationStatus);

  logger.info('perf:messaging.handleMessage', {
    ...corr, step: 'messaging.handleMessage', phase: 'end',
    durationMs: Date.now() - startTime, messageId: message.id
  });

  return response;
} catch (error) {
  logger.error('perf:messaging.handleMessage', error, {
    ...corr, step: 'messaging.handleMessage', phase: 'end',
    durationMs: Date.now() - startTime, errored: true
  });
  console.error('[MessagingService] Error handling message:', error);
  return this.createErrorResponse('Erreur interne lors de l\'envoi du message', requestId);
}
```

- [ ] **Step 2.4 : Vérifier que la suite de tests existante passe toujours**

Run : `cd services/gateway && pnpm jest src/__tests__/unit/services/MessagingService.test.ts --runInBand`
Expected : PASS (aucun changement comportemental, seulement logs ajoutés).

- [ ] **Step 2.5 : Commit**

```bash
git add services/gateway/src/services/messaging/MessagingService.ts
git commit -m "feat(gateway/messaging): instrument handleMessage with per-step withTiming logs"
```

---

### Task 3 : Instrumenter `MessageProcessor.saveMessage`

**Files:**
- Modify: `services/gateway/src/services/messaging/MessageProcessor.ts:298-547`

- [ ] **Step 3.1 : Ajouter l'import (en tête de fichier)**

Vérifier que `enhancedLogger` est déjà importé (ligne ~485 le référence comme `logger`). Si oui, ajouter à côté :

```ts
import { performanceLogger } from '../../utils/logger-enhanced';
```

- [ ] **Step 3.2 : Wrapper chaque sous-étape de `saveMessage`**

Dans `saveMessage`, remplacer les `await` directs par des `await performanceLogger.withTiming(...)`. Le corrélateur :

```ts
const corr = {
  clientMessageId: data.clientMessageId,
  conversationId: data.conversationId,
  senderId: data.senderId
};
```

Étapes à wrapper :

- `processLinksInContent` → step `messaging.processLinks`
- `getEncryptionContext` (uniquement quand pas chiffré côté client) → step `messaging.encryptionContext`
- `prisma.message.create` (le bloc try) → step `messaging.prismaMessageCreate`
- `handleAttachments` → step `messaging.handleAttachments`
- `prisma.messageAttachment.findMany` (refresh) → step `messaging.refreshAttachments`
- `updateTrackingLinksWithMessageId` → step `messaging.trackingLinks`
- `handleMentionsAndNotifications` → step `messaging.mentionsAndNotifications`

Exemple pour le bloc `prisma.message.create` :

```ts
let message: Message;
let isDuplicate = false;
try {
  message = await performanceLogger.withTiming(
    'messaging.prismaMessageCreate',
    () => this.prisma.message.create({
      data: messageData,
      include: { /* idem qu'avant */ }
    }),
    corr
  );
} catch (e) {
  // catch P2002 existant inchangé, mais wrapper le findFirst de fallback :
  const isP2002 = typeof e === 'object' && e !== null
    && 'code' in e && (e as { code?: unknown }).code === 'P2002';
  if (!isP2002 || !data.clientMessageId) throw e;

  const existing = await performanceLogger.withTiming(
    'messaging.prismaMessageCreate.dedupFindFirst',
    () => this.prisma.message.findFirst({
      where: { conversationId: data.conversationId, clientMessageId: data.clientMessageId },
      include: { /* idem qu'avant */ }
    }),
    corr
  );
  // ... reste inchangé
}
```

- [ ] **Step 3.3 : Vérifier que les tests existants passent**

Run : `cd services/gateway && pnpm jest src/__tests__/unit/services/messaging --runInBand`
Expected : PASS.

- [ ] **Step 3.4 : Commit**

```bash
git add services/gateway/src/services/messaging/MessageProcessor.ts
git commit -m "feat(gateway/messaging): instrument saveMessage sub-steps with withTiming"
```

---

### Task 4 : Instrumenter le handler Socket.IO + broadcast

**Files:**
- Modify: `services/gateway/src/socketio/handlers/MessageHandler.ts:255-402` (handler) et la méthode `broadcastNewMessage` (ligne 407+)

- [ ] **Step 4.1 : Ajouter l'import en tête de fichier**

```ts
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';
```

(Si déjà présent, ne pas dupliquer.)

- [ ] **Step 4.2 : Encapsuler `handleMessageSendWithAttachments`**

Au tout début du `try` (après `validateSocketEvent` et `_getUserContext`, donc une fois qu'on a `validated.clientMessageId` et `userContext`), définir le corrélateur et émettre un log d'entrée :

```ts
const corr = {
  clientMessageId: validated.clientMessageId,
  conversationId: validated.conversationId,
  socketId: socket.id,
  participantId: userContext.participantId,
  isAnonymous: userContext.isAnonymous
};
const handlerStart = Date.now();
enhancedLogger.info('perf:ws.message.send-with-attachments', {
  ...corr, step: 'ws.message.send-with-attachments', phase: 'start'
});
```

Puis envelopper `this.messagingService.handleMessage(...)` (ligne 346) :

```ts
const response: MessageResponse = await performanceLogger.withTiming(
  'ws.message.send-with-attachments.handle',
  () => this.messagingService.handleMessage(messageRequest, resolvedParticipantId),
  corr
);
```

Et envelopper `this.broadcastNewMessage(message, message.conversationId, socket)` (ligne 361) :

```ts
await performanceLogger.withTiming(
  'ws.broadcastNewMessage',
  () => this.broadcastNewMessage(message, message.conversationId, socket),
  { ...corr, messageId: message.id }
);
```

À la fin du `try` (juste avant le `stats_update.catch`), ajouter un log de sortie :

```ts
enhancedLogger.info('perf:ws.message.send-with-attachments', {
  ...corr, step: 'ws.message.send-with-attachments', phase: 'end',
  durationMs: Date.now() - handlerStart,
  messageId: response.success ? response.data?.id : undefined
});
```

- [ ] **Step 4.3 : Faire la même chose pour `handleMessageSend` (l'autre handler, lignes ~160-250)**

Lecture préalable du bloc ligne 160-250 pour confirmer la structure, puis appliquer le même pattern : log d'entrée + wrapper `handleMessage` + wrapper `broadcastNewMessage` + log de sortie. **Réutiliser `validated.clientMessageId`** qui est obligatoire dans le schéma Socket.IO comme dans le REST.

- [ ] **Step 4.4 : Vérifier que les tests handlers passent**

Run : `cd services/gateway && pnpm jest src/__tests__/unit/handlers/MessageHandler --runInBand`
Expected : PASS.

- [ ] **Step 4.5 : Commit**

```bash
git add services/gateway/src/socketio/handlers/MessageHandler.ts
git commit -m "feat(gateway/socket): instrument message handlers entry/exit and broadcast"
```

---

### Task 5 : Instrumenter la route REST POST messages

**Files:**
- Modify: `services/gateway/src/routes/conversations/messages.ts` (handler POST autour des lignes 1197-1370)

- [ ] **Step 5.1 : Lire le handler POST en entier (lignes 1197-1373)**

Run : Read `services/gateway/src/routes/conversations/messages.ts:1197-1373` pour cadrer.

- [ ] **Step 5.2 : Ajouter `performanceLogger` à l'import existant**

Ligne 26 actuelle :
```ts
import { enhancedLogger } from '../../utils/logger-enhanced';
```
Devient :
```ts
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';
```

- [ ] **Step 5.3 : Ajouter logs entry/exit et wrapper `handleMessage`**

Juste après l'extraction du body et l'auth (typiquement après que `participantId` et `body.clientMessageId` sont disponibles), insérer :

```ts
const corr = {
  clientMessageId: body.clientMessageId,
  conversationId: id,
  participantId,
  route: 'POST /conversations/:id/messages'
};
const routeStart = Date.now();
logger.info('perf:http.message.post', {
  ...corr, step: 'http.message.post', phase: 'start'
});
```

Puis remplacer ligne 1349 (`const result = await messagingService.handleMessage(messageRequest, participantId);`) par :

```ts
const result = await performanceLogger.withTiming(
  'http.message.post.handle',
  () => messagingService.handleMessage(messageRequest, participantId),
  corr
);
```

Avant le `return reply.send(...)` final du handler, ajouter :

```ts
logger.info('perf:http.message.post', {
  ...corr, step: 'http.message.post', phase: 'end',
  durationMs: Date.now() - routeStart,
  success: result.success
});
```

Dans le `catch (error)`, ajouter le même log avec `phase: 'end', errored: true`.

- [ ] **Step 5.4 : Vérifier le typecheck**

Run : `cd services/gateway && pnpm tsc --noEmit`
Expected : 0 erreurs nouvelles.

- [ ] **Step 5.5 : Commit**

```bash
git add services/gateway/src/routes/conversations/messages.ts
git commit -m "feat(gateway/routes): instrument REST POST messages with timing"
```

---

### Task 6 : Instrumenter `PushNotificationService.sendViaAPNS` et `sendViaFCM`

**Files:**
- Modify: `services/gateway/src/services/PushNotificationService.ts:355-547`

- [ ] **Step 6.1 : Vérifier les imports en tête de fichier**

Confirmer que `enhancedLogger`/`performanceLogger` sont importés. Sinon ajouter :

```ts
import { performanceLogger, enhancedLogger } from '../utils/logger-enhanced';
```

- [ ] **Step 6.2 : Wrapper `sendViaAPNS` (ligne 456)**

Remplacer le corps du `try { ... }` qui contient `const result = await client.send(notification, tokenRecord.token);` par :

```ts
const corr = {
  tokenId: tokenRecord.id,
  apnsEnv: env,
  topic: notification.topic,
  isVoIP,
  bundleId: tokenRecord.bundleId ?? undefined,
  collapseId: payload.collapseId ?? undefined
};
const result = await performanceLogger.withTiming(
  'push.sendViaAPNS',
  () => client.send(notification, tokenRecord.token),
  corr
);
```

Et après le `if (result.failed.length > 0)`, ajouter un log structuré du résultat :

```ts
if (result.failed.length > 0) {
  const failure = result.failed[0];
  enhancedLogger.warn('push.sendViaAPNS.failure', {
    ...corr,
    reason: failure.response?.reason || 'APNS delivery failed',
    statusCode: failure.status
  });
  return { success: false, tokenId: tokenRecord.id, error: failure.response?.reason || 'APNS delivery failed' };
}

enhancedLogger.info('push.sendViaAPNS.success', { ...corr });
return { success: true, tokenId: tokenRecord.id };
```

- [ ] **Step 6.3 : Wrapper `sendViaFCM` (ligne 355)**

Pattern identique. Remplacer `await this.firebaseAdmin.messaging().send(message);` par :

```ts
const corr = {
  tokenId: tokenRecord.id,
  platform: tokenRecord.platform,
  collapseId: payload.collapseId ?? undefined
};
await performanceLogger.withTiming(
  'push.sendViaFCM',
  () => this.firebaseAdmin!.messaging().send(message),
  corr
);
enhancedLogger.info('push.sendViaFCM.success', { ...corr });
return { success: true, tokenId: tokenRecord.id };
```

Et dans le `catch (error)`, logger explicitement le `errorCode` :

```ts
} catch (error: any) {
  const errorCode = error?.code || error?.errorInfo?.code;
  enhancedLogger.warn('push.sendViaFCM.failure', {
    tokenId: tokenRecord.id,
    platform: tokenRecord.platform,
    errorCode,
    errorMessage: error?.message
  });
  if (errorCode === 'messaging/registration-token-not-registered'
    || errorCode === 'messaging/invalid-registration-token') {
    return { success: false, tokenId: tokenRecord.id, error: 'TOKEN_INVALID' };
  }
  return { success: false, tokenId: tokenRecord.id, error: error.message || 'FCM error' };
}
```

- [ ] **Step 6.4 : Wrapper aussi `handleFailedToken` pour tracer la désactivation**

Dans `handleFailedToken` (ligne 552), remplacer le `console.log` final par un appel structuré :

```ts
if (shouldDeactivate) {
  enhancedLogger.warn('push.token.deactivated', {
    tokenId,
    failedAttempts: newFailedAttempts,
    reason: error
  });
}
```

- [ ] **Step 6.5 : Vérifier que les tests passent**

Run : `cd services/gateway && pnpm jest src/__tests__/unit/services/PushNotificationService.test.ts --runInBand`
Expected : PASS.

- [ ] **Step 6.6 : Commit**

```bash
git add services/gateway/src/services/PushNotificationService.ts
git commit -m "feat(gateway/push): instrument APNS+FCM send paths and token deactivation"
```

---

### Task 7 : Test d'intégration end-to-end

**Files:**
- Create: `services/gateway/src/__tests__/integration/message-send-instrumentation.test.ts`

Cible : démontrer que, pour un envoi de message standard, **tous les step logs attendus** apparaissent dans l'ordre attendu et qu'ils partagent le même `clientMessageId`.

- [ ] **Step 7.1 : Écrire le test**

```ts
import { describe, it, expect, beforeAll, jest } from '@jest/globals';
// Le test instancie MessagingService + MessageProcessor avec un Prisma mocké
// pour vérifier l'ordre des logs sans dépendre de MongoDB.

const captured: any[] = [];
jest.mock('../../utils/logger-enhanced', () => {
  const actual = jest.requireActual('../../utils/logger-enhanced');
  const tap = (level: string, message: string, ctx: any) =>
    captured.push({ level, message, ctx });
  return {
    ...actual,
    enhancedLogger: {
      ...actual.enhancedLogger,
      info: (m: string, c: any) => tap('info', m, c),
      warn: (m: string, c: any) => tap('warn', m, c),
      error: (m: string, e: any, c: any) => tap('error', m, { ...c, err: String(e) }),
      child: () => ({
        info: (m: string, c: any) => tap('info', m, c),
        warn: (m: string, c: any) => tap('warn', m, c),
        error: (m: string, e: any, c: any) => tap('error', m, { ...c, err: String(e) })
      })
    },
    performanceLogger: {
      ...actual.performanceLogger,
      withTiming: async (step: string, fn: any, ctx: any = {}) => {
        tap('info', `perf:${step}`, { ...ctx, step, phase: 'start' });
        const result = await fn();
        tap('info', `perf:${step}`, { ...ctx, step, phase: 'end', durationMs: 0 });
        return result;
      }
    }
  };
});

import { MessagingService } from '../../services/messaging/MessagingService';

describe('message-send instrumentation (integration)', () => {
  it('emits expected step logs in order with the same clientMessageId', async () => {
    const cid = 'cid_11111111-2222-4333-8444-555555555555';
    const prisma: any = {
      participant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', conversationId: 'c1', isActive: true }),
        findFirst: jest.fn(),
        create: jest.fn()
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
      message: { create: jest.fn().mockResolvedValue({ id: 'm1', conversationId: 'c1', senderId: 'p1', content: 'hi', createdAt: new Date(), originalLanguage: 'fr', messageType: 'text' }) },
      messageAttachment: { findMany: jest.fn().mockResolvedValue([]) }
    };
    const translationService: any = { handleNewMessage: jest.fn().mockResolvedValue(undefined) };
    const svc = new MessagingService(prisma, translationService);
    await svc.handleMessage(
      { conversationId: 'c1', content: 'hi', clientMessageId: cid, originalLanguage: 'fr' } as any,
      'p1'
    );

    const steps = captured
      .filter((e) => typeof e.ctx?.step === 'string' && e.ctx.phase === 'start')
      .map((e) => e.ctx.step);
    expect(steps).toEqual(expect.arrayContaining([
      'messaging.validateRequest',
      'messaging.resolveConversationId',
      'messaging.participantLookup',
      'messaging.saveMessage',
      'messaging.updateConversation',
      'messaging.markAsRead',
      'messaging.queueTranslation',
      'messaging.updateStats'
    ]));
    const cids = new Set(captured.map((e) => e.ctx?.clientMessageId).filter(Boolean));
    expect(cids.has(cid)).toBe(true);
  });
});
```

- [ ] **Step 7.2 : Lancer le test**

Run : `cd services/gateway && pnpm jest src/__tests__/integration/message-send-instrumentation.test.ts --runInBand`
Expected : PASS.

Si FAIL : c'est probablement un step nom mal orthographié dans Tasks 2/3 — corriger là-bas, pas dans le test.

- [ ] **Step 7.3 : Commit**

```bash
git add services/gateway/src/__tests__/integration/message-send-instrumentation.test.ts
git commit -m "test(gateway): integration test asserting message send step logs and correlationId"
```

---

### Task 8 : Instrumentation côté iOS (delta send → ACK)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (méthode `sendMessage`, autour des lignes 1571-1590 d'après l'audit)

- [ ] **Step 8.1 : Lire la méthode `sendMessage` en entier**

Run : Read pour confirmer la signature et l'endroit où l'ACK est traité (`applyEvent(.serverAck(...))`).

- [ ] **Step 8.2 : Ajouter un Logger dédié en haut du fichier**

Sous les imports :

```swift
import OSLog

private let perfLogger = Logger(subsystem: "me.meeshy.app", category: "perf.message-send")
```

- [ ] **Step 8.3 : Capturer le timestamp au début de `sendMessage`**

Au tout début de la fonction, après l'extraction du `clientMessageId` (ou sa génération via le helper `cmid()` mentionné dans le commit récent `725f7ea8`) :

```swift
let sendStartedAt = Date()
let cmid = tempId // ou la valeur du clientMessageId utilisée pour le POST
perfLogger.info("perf:ios.send.start clientMessageId=\(cmid, privacy: .public)")
```

- [ ] **Step 8.4 : Mesurer à la réception de l'ACK**

Juste avant ou après le `applyEvent(localId: tempId, event: .serverAck(serverId:, at:))` dans le success path du POST :

```swift
let ackElapsedMs = Int(Date().timeIntervalSince(sendStartedAt) * 1000)
perfLogger.info("perf:ios.send.ack clientMessageId=\(cmid, privacy: .public) durationMs=\(ackElapsedMs, privacy: .public)")
```

Et dans le path d'erreur (catch ou failure callback) :

```swift
let failElapsedMs = Int(Date().timeIntervalSince(sendStartedAt) * 1000)
perfLogger.warn("perf:ios.send.fail clientMessageId=\(cmid, privacy: .public) durationMs=\(failElapsedMs, privacy: .public)")
```

- [ ] **Step 8.5 : Vérifier que la build iOS passe**

Run : `./apps/ios/meeshy.sh build`
Expected : PASS, 0 warnings nouveaux.

- [ ] **Step 8.6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "feat(ios/conversation): log send-tap to ACK round-trip duration"
```

---

### Task 9 : Vérification de bout en bout (manuelle, non automatisée)

- [ ] **Step 9.1 : Démarrer la gateway en local**

Run : `cd services/gateway && pnpm dev` (ou via tmux session `meeshy` window 1).
Expected : démarrage propre, port 3000.

- [ ] **Step 9.2 : Lancer l'app iOS via `meeshy.sh run`**

Run : `./apps/ios/meeshy.sh run`
Expected : app lancée, simulateur iPhone 16 Pro, logs streamés.

- [ ] **Step 9.3 : Envoyer un message texte vers atabeth**

Action manuelle dans le simulateur : ouvrir une conversation, envoyer "test instrumentation 1".

- [ ] **Step 9.4 : Vérifier la chaîne de logs côté gateway**

Inspecter la sortie stdout gateway. Doit contenir, pour le même `clientMessageId`, dans cet ordre :

```
perf:http.message.post           phase=start
perf:http.message.post.handle    phase=start
perf:messaging.validateRequest   phase=start
perf:messaging.validateRequest   phase=end durationMs=...
perf:messaging.resolveConversationId  phase=start ... end
perf:messaging.participantLookup phase=start ... end
perf:messaging.detectLanguage    phase=start ... end
perf:messaging.saveMessage       phase=start
  perf:messaging.processLinks    phase=start ... end
  perf:messaging.encryptionContext  start ... end
  perf:messaging.prismaMessageCreate  start ... end
  perf:messaging.trackingLinks   start ... end
  perf:messaging.mentionsAndNotifications  start ... end
perf:messaging.saveMessage       phase=end durationMs=...
perf:messaging.updateConversation  start ... end
perf:messaging.markAsRead        start ... end
perf:messaging.queueTranslation  start ... end
perf:messaging.updateStats       start ... end
perf:http.message.post.handle    phase=end durationMs=TOTAL
perf:http.message.post           phase=end durationMs=TOTAL
```

Et pour le push :

```
perf:push.sendViaAPNS   phase=start ... end durationMs=...
push.sendViaAPNS.success | push.sendViaAPNS.failure
```

- [ ] **Step 9.5 : Vérifier la chaîne côté iOS**

Dans la console Xcode (filtre `category:perf.message-send`) :

```
perf:ios.send.start clientMessageId=cid_...
perf:ios.send.ack clientMessageId=cid_... durationMs=...
```

- [ ] **Step 9.6 : Documenter les premières mesures dans `tasks/realtime-baseline.md`**

Créer ce fichier avec les durations observées pour chaque step, sur un message texte simple, sur un message avec attachment audio, et sur un message vers un destinataire hors-ligne (pour observer le push).

Format attendu :

```markdown
# Real-time baseline — 2026-05-11

## Texte simple (WiFi local, gateway dev, simulateur)
- http.message.post (total) : XXX ms
  - messaging.handleMessage : XXX ms
    - messaging.participantLookup : XXX ms
    - messaging.detectLanguage : XXX ms
    - messaging.saveMessage : XXX ms
      - messaging.prismaMessageCreate : XXX ms
      - messaging.mentionsAndNotifications : XXX ms
    - messaging.markAsRead : XXX ms
    - messaging.queueTranslation : XXX ms
    - messaging.updateStats : XXX ms
- iOS round-trip (send tap → ACK) : XXX ms

## Audio (WS)
- ws.message.send-with-attachments.handle : XXX ms
- ws.broadcastNewMessage : XXX ms (post-ACK donc n'impacte pas la coche)

## Push
- push.sendViaAPNS : XXX ms
- push.sendViaFCM : XXX ms
```

- [ ] **Step 9.7 : Commit la baseline**

```bash
git add tasks/realtime-baseline.md
git commit -m "docs(realtime): capture instrumentation baseline measurements"
```

---

### Critères de complétion Phase A

- ✅ `performanceLogger.withTiming` existe, est testé, et émet start/end avec durationMs.
- ✅ Tous les `step` listés dans la section "Format des logs" apparaissent en pratique pour un envoi standard.
- ✅ `clientMessageId` est présent dans 100 % des logs `perf:*` de la chaîne (gateway + iOS).
- ✅ La baseline numérique est enregistrée dans `tasks/realtime-baseline.md`.
- ✅ Aucune régression : tests gateway existants verts, build iOS verte.

À partir de cette baseline, on planifiera Phase B (optimisation) en ciblant les steps les plus coûteux, **sans deviner**.

---

## Self-Review

- **Coverage du spec** : chaque flot mentionné (REST, Socket.IO, APN/FCM, iOS) a une tâche dédiée. ✅
- **Placeholders** : tous les `step` sont nommés explicitement, tout le code des wrappers est fourni inline. ✅
- **Cohérence des types** : `withTiming<T>` retourne `Promise<T>`, signature stable sur toutes les Tasks. ✅
- **Risque oublié** : `MessagingService` est instancié à chaque request REST (`new MessagingService(...)` ligne ~1318 de `routes/conversations/messages.ts`). C'est suspect pour les perfs mais **hors scope Phase A** (instrumentation only). À noter pour Phase B.
