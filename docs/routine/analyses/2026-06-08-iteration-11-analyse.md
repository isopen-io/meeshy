# Analyse — Itération 11 (2026-06-08)

**Branche :** `claude/brave-archimedes-HGWPs-iter11`
**Base :** itération 10 mergée (3d13b424f)

---

## Contexte

Itérations 1-10 ont couvert : ZMQ timeouts, circuit-breaker, LRU cache, rate limiter par userId,
auth cache extension, CallEventsHandler N+1, présence snapshot, WebSocket backoff, message dedup,
notification dedup iOS, MessageHandler pass-object, Promise.all routes, index forwardedFromId,
AbortSignal React Query, participant short-circuit, typing throttle + cleanup, mention batch
Promise.all, index composites Reaction/Mention, ConversationStatsService/MessageReadStatusService
cleanup, MessageTranslationService threshold+periodic, migrations console→logger (tous les handlers),
PrivacyPreferencesService, SocialEventsHandler type, TusUploadManager deinit.

Cette itération cible : `setInterval` sans `.unref()`, casts `as any` inutiles dans
SocialEventsHandler, et taille non bornée du cache d'amis.

---

## Problème 1 — 6 services : `setInterval` sans `.unref()` (HAUTE)

**Fichiers :**
- `services/gateway/src/services/EncryptionService.ts:409`
- `services/gateway/src/services/MaintenanceService.ts:96,102`
- `services/gateway/src/services/CallCleanupService.ts:61`
- `services/gateway/src/services/ExpiredStoriesCleanupService.ts:42`
- `services/gateway/src/services/StatusService.ts:379`
- `services/gateway/src/services/TusCleanupService.ts:11`

Chaque service crée un `setInterval` pour des tâches de maintenance sans appeler `.unref()`.
En Node.js, un `setInterval` actif maintient le process loop en vie — sans `.unref()`, un shutdown
propre du serveur (SIGTERM) sera retardé jusqu'à l'expiration forcée du timer ou un `clearInterval`.
En production, cela retarde les rolling-deploys et peut causer des timeouts dans les orchestrateurs
(Docker, Kubernetes).

**Impact :** Shutdown retardé sur chaque déploiement. Sur K8s, un pod peut prendre jusqu'à
`terminationGracePeriodSeconds` (30s par défaut) au lieu de s'arrêter immédiatement.

---

## Problème 2 — SocialEventsHandler : casts `as any` inutiles (MOYEN)

**Fichier :** `services/gateway/src/socketio/handlers/SocialEventsHandler.ts`

9 occurrences de `(story as any).id`, `(story as any).visibility`,
`(story as any).visibilityUserIds`, `(post as any).id`, `(status as any).visibility`, etc.

Le type `Post` dans `packages/shared/types/post.ts` déclare déjà :
```typescript
readonly id: string;
readonly visibility: PostVisibility;
readonly visibilityUserIds?: readonly string[];
```

Les casts `as any` sont hérités d'une version antérieure du type et n'ont plus de raison d'être.
Ils bypassent le système de types et masquent toute régression future.

**Impact :** Perte de type-safety sur le hot-path du broadcast social (chaque story/status/post
créé). Un refactoring du type `Post` ne serait pas détecté à la compilation.

---

## Problème 3 — SocialEventsHandler : `friendsCache` non borné (MOYEN)

**Fichier :** `services/gateway/src/socketio/handlers/SocialEventsHandler.ts:45`

```typescript
private friendsCache: Map<string, { ids: string[]; expiresAt: number }> = new Map();
```

Le cache a un TTL de 30s mais aucune borne de taille. Sur une instance avec 50k+ utilisateurs
actifs, la Map peut accumuler des entrées expirées entre les appels (les entrées ne sont remplacées
que lors du prochain accès). Pas d'éviction proactive, pas de size cap.

Comparaison : `typingThrottleMap` (iter-7) et `presenceSnapshotCache` (iter-5) ont tous les deux
un mécanisme de nettoyage similaire à ce qui est proposé ici.

**Impact :** Fuite mémoire lente sur les instances à forte charge (beaucoup d'utilisateurs
distincts postant des stories/statuts).
