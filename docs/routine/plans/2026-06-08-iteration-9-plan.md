# Plan d'Implémentation — Itération 9 (2026-06-08)

**Référence :** `docs/routine/analyses/2026-06-08-iteration-9-analyse.md`
**Branche :** `claude/brave-archimedes-OnFYZ-iter9`

---

## Phase A — ConversationStatsService : cleanup périodique

**Fichier :** `services/gateway/src/services/ConversationStatsService.ts`

Ajouter champ `private cleanupInterval` et méthode `private startPeriodicCleanup()` appelée dans
le constructeur. Le setInterval (15min) parcourt le Map et supprime les entrées expirées.

```typescript
private cleanupInterval: ReturnType<typeof setInterval> | null = null;

private constructor(ttlMs: number = 60 * 60 * 1000) {
  this.ttlMs = ttlMs;
  this.startPeriodicCleanup();
}

private startPeriodicCleanup(): void {
  this.cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) this.cache.delete(key);
    }
  }, 15 * 60 * 1000);
  this.cleanupInterval.unref?.();
}
```

**Impact :** Plafonne la mémoire du cache à ~15min × débit de conversations.

---

## Phase B — MessageReadStatusService : cleanup automatique

**Fichier :** `services/gateway/src/services/MessageReadStatusService.ts`

Ajouter un `setInterval` statique (30s) qui appelle `cleanupDedupCache()`.

```typescript
// Juste après la définition de la classe (module-level)
setInterval(() => MessageReadStatusService['cleanupDedupCache'](), 30_000).unref?.();
```

**Impact :** Élimine les entrées expirées (TTL 2s) toutes les 30s.

---

## Phase C — MessageTranslationService : threshold 2000 → 500

**Fichier :** `services/gateway/src/services/message-translation/MessageTranslationService.ts`

Changer ligne 750 :
```typescript
// AVANT
if (this.processedTasks.size > 2000) {
// APRÈS
if (this.processedTasks.size > 500) {
```

**Impact :** Cleanup déclenché 4× plus tôt, pic mémoire réduit de 75%.

---

## Phase D — ReactionHandler : console.* → logger

**Fichier :** `services/gateway/src/socketio/handlers/ReactionHandler.ts`

1. Ajouter import : `import { enhancedLogger } from '../../utils/logger-enhanced.js';`
2. Créer instance : `const logger = enhancedLogger.child({ module: 'ReactionHandler' });`
3. Remplacer les 7 `console.error` → `logger.error`

---

## Phase E — ConversationHandler : console.* → logger

**Fichier :** `services/gateway/src/socketio/handlers/ConversationHandler.ts`

1. Ajouter import logger
2. Créer instance
3. Remplacer les 3 `console.error` → `logger.error`

---

## Phase F — MessageHandler : console.* résiduels → logger

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts`

Remplacer les 12 occurrences :
- `console.error(...)` → `handlerLogger.error(...)`
- `console.warn(...)` → `handlerLogger.warn(...)`
- `console.log('[RT-DIAG]...')` → `handlerLogger.debug(...)` (downgrade, pas de suppression)

---

## Phase G — MessagingService (web) : markReceivedTimers size cap

**Fichier :** `apps/web/services/socketio/messaging.service.ts`

Dans `markAsReceivedDebounced`, ajouter guard avant l'enregistrement du timer :

```typescript
private markAsReceivedDebounced(conversationId: string): void {
  if (this.markReceivedTimers.has(conversationId)) return;
  if (this.markReceivedTimers.size >= 100) return; // cap : max 100 timers simultanés
  // ... rest unchanged
}
```

**Impact :** Borne à 100 timers simultanés max (chaque timer se purge après 500ms).

---

## Statut

- [x] A — ConversationStatsService cleanup périodique
- [x] B — MessageReadStatusService cleanup automatique
- [x] C — MessageTranslationService threshold 2000→500
- [x] D — ReactionHandler console.* → logger
- [x] E — ConversationHandler console.* → logger
- [x] F — MessageHandler console.* → logger
- [x] G — MessagingService markReceivedTimers size cap
