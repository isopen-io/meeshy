# Analyse — Itération 9 (2026-06-08)

**Branche :** `claude/brave-archimedes-OnFYZ-iter9`
**Base :** itération 8 mergée (f254799a)

---

## Contexte

Itérations précédentes (1-8) ont couvert : ZMQ timeouts, circuit-breaker, LRU cache, rate limiter par
userId, invalidation presence cache, AuthHandler logger, message dedup TTL, typing timeout cleanup,
VoiceCharacteristics type strict. Cette itération cible les fuites mémoire résiduelles et les
`console.*` restants dans les handlers gateway.

---

## Problème 1 — ConversationStatsService : cache sans éviction proactive (fuite mémoire)

**Fichier :** `services/gateway/src/services/ConversationStatsService.ts` lignes 26-46

Le singleton maintient un `Map<string, CacheEntry>` avec TTL 1h. Les entrées expirées ne sont
jamais évincées proactivement — `getActiveConversationIds()` filtre au moment de l'appel mais laisse
les entrées mortes dans le Map. En production, toutes les conversations actives s'accumulent
définitivement.

**Impact :** Croissance mémoire linéaire avec le nombre de conversations accédées.

---

## Problème 2 — MessageReadStatusService : dedup cache sans cleanup automatique

**Fichier :** `services/gateway/src/services/MessageReadStatusService.ts` lignes 53-74

`cleanupDedupCache()` existe mais n'est jamais planifiée automatiquement. Elle n'est pas appelée
dans le hot path (serait trop coûteuse). Résultat : entrées expirées (TTL 2s) s'accumulent sans
être purgées pendant des heures.

**Impact :** Croissance mémoire statique pendant les pics d'activité.

---

## Problème 3 — MessageTranslationService : seuil de cleanup trop élevé (2000 entrées)

**Fichier :** `services/gateway/src/services/message-translation/MessageTranslationService.ts` ligne 750

Le cleanup du `processedTasks` Map se déclenche seulement quand la taille dépasse 2000 entrées
(TTL 1h par entrée). Cela permet l'accumulation de 2000 entrées mortes avant nettoyage.

**Impact :** Pic mémoire et itération lente du Map lors du cleanup tardif.

---

## Problème 4 — ReactionHandler : console.* (7 occurrences)

**Fichier :** `services/gateway/src/socketio/handlers/ReactionHandler.ts`

7 `console.error` sans logger — bypass la redaction PII, logs non indexables ELK, incohérence.

---

## Problème 5 — ConversationHandler : console.* (3 occurrences)

**Fichier :** `services/gateway/src/socketio/handlers/ConversationHandler.ts`

3 `console.error` sans logger.

---

## Problème 6 — MessageHandler : console.* résiduels + logs RT-DIAG (12 occurrences)

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts`

12 `console.error/warn/log` résiduels incluant des logs diagnostiques `[RT-DIAG]` laissés en place
après debugging. Ces `console.log` s'exécutent sur chaque message livré en production.

**Impact :** Performance I/O inutile sur chaque message + bypass PII redaction.

---

## Problème 7 — MessagingService (web) : markReceivedTimers sans borne max

**Fichier :** `apps/web/services/socketio/messaging.service.ts` lignes 52, 86-98

Le Map `markReceivedTimers` n'a pas de borne supérieure. Le timer de 500ms auto-purge l'entrée,
mais si des milliers de messages arrivent simultanément sur différentes conversations avant que les
timers ne s'exécutent, le Map peut atteindre des milliers d'entrées concurrentes.

**Impact :** Pic mémoire frontend sur reconnexion avec flood de messages.

---

## Résumé des impacts

| # | Fichier | Type | Sévérité |
|---|---------|------|----------|
| 1 | ConversationStatsService | Fuite mémoire | HAUTE |
| 2 | MessageReadStatusService | Fuite mémoire | MOYENNE |
| 3 | MessageTranslationService | Performance | MOYENNE |
| 4 | ReactionHandler | PII / Observabilité | MOYENNE |
| 5 | ConversationHandler | PII / Observabilité | MOYENNE |
| 6 | MessageHandler | Performance / PII | MOYENNE |
| 7 | MessagingService (web) | Pic mémoire frontend | FAIBLE |
