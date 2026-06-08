# Plan d'Implémentation — Optimisations 2026-06-08
**Référence analyse**: `docs/routine/analyses/2026-06-08-optimization-analysis.md`  
**Branche**: `claude/zen-albattani-oGeHv`

---

## Stratégie

4 phases ordonnées par rapport impact/effort. Chaque phase est cohérente et livrable indépendamment.

---

## Phase 1 — Quick Wins Infrastructure (effort: ~2h, impact: immédiat)

**Objectif**: Corrections sans risque, gains mesurables en production dès merge.

### 1.1 Index MongoDB composites
- `packages/shared/prisma/schema.prisma` : ajouter `@@index([conversationId, createdAt])` sur `Message`, `@@index([recipientId, isRead])` sur `Message`, `@@index([conversationId, userId, isActive])` sur `Participant`
- Impact : −30-40% latence queries messages

### 1.2 Activer SOCKET_LANG_FILTER
- `infrastructure/docker-compose.dev.yml` + `docker-compose.local.yml` : `SOCKET_LANG_FILTER=true`
- Impact : −90% payload pour utilisateurs monolingues (filtrage déjà implémenté)

### 1.3 Redis TTL + politique éviction
- Compose files : `REDIS_MAXMEMORY=256mb`, `REDIS_MAXMEMORY_POLICY=allkeys-lru`
- Gateway auth cache : TTL 5min sur Redis user cache
- Impact : stabilité mémoire Redis en prod

### 1.4 Fix fire-and-forget auth middleware
- `services/gateway/src/middleware/auth.ts:136, 214` : wrapper `userSession.update()` dans try/catch avec await
- Impact : éliminer rejections non gérées en prod

### 1.5 Fix JWT double-décodage
- `services/gateway/src/middleware/auth.ts:108-111` : réutiliser le résultat de `jwt.verify()` plutôt que rappeler `jwt.decode()`

### 1.6 Pagination AuthHandler._joinUserConversations
- `services/gateway/src/socketio/handlers/AuthHandler.ts:403-411` : fetchs par lots de 100 avec `skip`/`take`
- Impact : évite OOM pour users avec 1000+ conversations

---

## Phase 2 — Performance Web (effort: ~3h, impact: UX immédiat)

**Objectif**: Fluidité perçue sur la liste de messages et réduction bundle.

### 2.1 Virtual Scrolling messages (CRITIQUE)
- `apps/web/components/common/messages-display.tsx` : implémenter `useVirtualizer` de `@tanstack/react-virtual` (déjà installé)
- Garder l'ancrage en bas (scroll-to-bottom) + sentinelle de chargement en haut
- Impact : rendu fluide sur 10 000 messages

### 2.2 Fix fuite mémoire Socket.IO
- `apps/web/hooks/use-websocket.ts:113-115` : `useEffect` cleanup retournant `unsubscribeAll()`
- Impact : éliminer la croissance mémoire sur navigation longue

### 2.3 Dynamic imports large deps
- `apps/web/` : `recharts`, `pdfjs-dist`, `tone.js` en dynamic import avec `() => import(...)` uniquement sur les pages qui en ont besoin
- Impact : bundle initial −1MB (−43%)

### 2.4 Sélecteurs Zustand avec useShallow
- Tous les stores : remplacer les sélecteurs d'objet entier par `useShallow` + sélecteurs primitifs
- Impact : éliminer les re-renders en cascade sur auth/conversation updates

### 2.5 Prefetch conversations + Suspense boundaries
- `apps/web/hooks/use-conversation-messages.ts` : paralléliser avec `Promise.all()`
- Ajouter `<Suspense>` sur les routes messages/chat
- `prefetchQuery` au hover sur ConversationItem

### 2.6 next/image pour avatars
- Remplacer `<img>` raw par `<Image>` de `next/image` avec `loading="lazy"`, `sizes`, WebP automatique
- Impact : −60% sur les avatars en liste

---

## Phase 3 — Performance iOS (effort: ~4h, impact: fluidité scrolling)

**Objectif**: Zéro re-render inutile, mémoire stable, scrolling 60fps.

### 3.1 BubbleStandardLayout Equatable
- Extraire `BubbleStandardLayoutModel: Equatable` depuis `BubbleStandardLayout.swift`
- Appliquer `.equatable()` sur toutes les vues bubble dans la liste
- Impact : −60% re-renders sur liste de messages

### 3.2 Fix unsafe concurrency timers
- `ConversationSocketHandler.swift:84-90` : supprimer `nonisolated(unsafe)`, migrer timers dans isolation `@MainActor`
- Impact : éliminer race conditions typing indicators

### 3.3 URLSession configuration APIClient
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift` : `timeoutIntervalForRequest = 15`, `multipathServiceType = .handover`, `waitsForConnectivity = true`, HTTP/2 hints
- Impact : résilience réseau cellulaire/WiFi, zéro timeout silencieux

### 3.4 Image lazy loading policy
- Centraliser dans `ImageDownsamplingConfig.swift` : thumbnail d'abord (100×100 WebP) → full-res en background
- Appliquer à tous les avatars de liste + MediaBubbleCell
- Impact : scroll fluide même sur réseau lent

### 3.5 Navigation debounce
- `Router.swift` : debounce 300ms sur NavigationStack push, flag `isNavigating`
- Impact : éliminer double-push sur tap rapide

### 3.6 Cache invalidation atomique ConversationViewModel
- Wrapper mutations `_messageIdIndex` + `_cachedLastReceivedIndex` dans un bloc `@MainActor` atomique

---

## Phase 4 — Translator + Headers HTTP (effort: ~3h, impact: throughput)

**Objectif**: Throughput traduction 5-8×, headers cache côté gateway.

### 4.1 Pré-chargement NLLB au startup
- `services/translator/main.py` : appel synchrone au startup pour peupler les pipelines thread-local avant la première requête ZMQ
- Impact : cold start 0s (vs 2-4s actuellement)

### 4.2 Request Batcher NLLB
- Nouveau fichier `services/translator/src/services/request_batcher.py`
- Fenêtre 100ms OU 32 requêtes → soumission batch unique au modèle
- Résultats redistribués par ID de requête
- Impact : 5-8× throughput sous charge concurrente

### 4.3 Cache-Control + ETag sur routes gateway
- `services/gateway/src/routes/conversations/messages.ts` + `users.ts` + `posts/feed.ts`
- `Cache-Control: private, max-age=60` sur GET messages
- ETag basé sur `updatedAt` du dernier message
- Impact : −70% requêtes répétées sur données stables

### 4.4 Fix accumulation listeners EventEmitter (gateway)
- `MeeshySocketIOManager.ts:510-521` : `.once()` pour événements one-shot, `removeAllListeners()` au socket disconnect

---

## Phase 5 — Features Gaps Concurrentiels (effort: ~2 jours)

**Objectif**: Combler les gaps vs concurrence directe.

### 5.1 Messages éphémères
- Schéma Prisma : `expiresAt: DateTime?` sur `Message` (pattern nullable timestamp = CLAUDE.md rules)
- Gateway : cron job Redis pour purge + event socket `message:expired`
- iOS + Web : affichage du timer dans la bulle, option dans la conversation settings

### 5.2 Recherche full-text (Meilisearch)
- Intégration Meilisearch dans docker-compose (image légère ~50MB)
- Gateway : hook `post-save` sur Message → indexation async
- API : route `GET /conversations/:id/search?q=`
- iOS + Web : UI search dans la conversation

### 5.3 Réactions animées
- iOS : `PhaseAnimator` (iOS 17+) sur les réactions emoji
- Web : CSS keyframe `scale + fade` sur réaction ajoutée/retirée

---

## Ordre d'exécution

```
Phase 1 (infra) → Phase 2 (web) → Phase 3 (iOS) → Phase 4 (translator+gateway) → Phase 5 (features)
```

Chaque phase donne un commit propre et testable. Phase 5 optionnelle selon priorité produit.

---

## Métriques de succès

| Métrique | Avant | Cible |
|----------|-------|-------|
| Payload message:new (monolingue) | 100% | −90% (B1 activé) |
| Bundle initial web | ~2.3MB | <1.3MB |
| Re-renders liste messages iOS | N par frappe | ~0 (Equatable) |
| Latence query messages | COLLSCAN | Index composite |
| Throughput traduction concurrent | 1× | 5-8× (batching) |
| Cold start traducteur | 2-4s/thread | 0s (pré-warm) |
| Mémoire socket web (session 1h) | croissance | stable |
