# Plan d'Implémentation — Optimisations Globales Meeshy
**Date :** 2026-06-07  
**Branche :** `claude/zen-albattani-BIRq9`  
**Référence analyse :** `docs/routine/analyses/2026-06-07-optimisation-globale.md`

---

## Principes

1. **Non-breaking** par défaut — chaque changement reste rétrocompatible
2. **Test-driven** — tout changement de logique a un test qui passe
3. **Impact d'abord** — ordonné par rapport bénéfice/risque
4. **Gateway first** — bénéficie à tous les clients sans redéploiement app

---

## Phase 1 — Gateway Performance (Hot-path) ✅ Implémentable immédiatement

### 1.1 Activer SOCKET_LANG_FILTER (B1)
- **Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts`
- **Action :** Enrichir `SocketUser.language` avec le Prisme complet (`resolveUserLanguage`) + activer le flag par défaut via env var avec fallback `false` mais documenter la marche à suivre
- **Test :** Existants (7 tests verts)

### 1.2 Corriger N+1 unread count (broadcast loop)
- **Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:~1543`
- **Action :** Remplacer la boucle séquentielle par `Promise.all()` sur tous les `getUnreadCount`
- **Test :** Unit test : mock `readStatusService.getUnreadCount`, vérifier que tous les appels sont parallèles

### 1.3 Cache Redis pour conversation IDs
- **Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:~119`
- **Action :** Remplacer `Map<string, string>` par appel Redis avec TTL 24h
- **Test :** Vérifier que le cache est utilisé sur double appel

### 1.4 Cache JWT dans middleware auth
- **Fichier :** `services/gateway/src/middleware/auth.ts:~108`
- **Action :** Cache Redis `jwt:{sha256(token)}` TTL 60s (avant expiry JWT)
- **Test :** Appels successifs ne recalculent pas HMAC

### 1.5 Borner le Set de déduplication MessageTranslationService
- **Fichier :** `services/gateway/src/services/message-translation/MessageTranslationService.ts:78`
- **Action :** Remplacer `Set<string>` par `Map<string, number>` (→ timestamp) avec GC TTL 1h
- **Test :** Vérifier que les entrées expirées sont retraitées

### 1.6 Indexes Prisma manquants
- **Fichier :** `packages/shared/prisma/schema.prisma`
- **Action :** Ajouter `@@index([conversationId, messageSource])` + `@@index([replyToId])` + index composites sur `MessageStatusEntry`
- **Migration :** `prisma migrate dev` / `prisma db push`

### 1.7 Borner RedisDeliveryQueue fallback mémoire
- **Fichier :** `services/gateway/src/services/RedisDeliveryQueue.ts`
- **Action :** Cap à 10 000 entrées total, eviction FIFO + warning log
- **Test :** Vérifier que la limite est respectée

---

## Phase 2 — Web Performance

### 2.1 Virtualisation liste messages
- **Fichier :** `apps/web/components/conversations/ConversationMessages.tsx` (ou équivalent)
- **Action :** Wirer le hook `useVirtualizedList` existant (déjà dans le projet)
- **Test :** DOM nodes ≤ 30 pour 500 messages

### 2.2 Zustand Map → Record (sérialisation)
- **Fichier :** `apps/web/store/conversation-ui-store.ts`
- **Action :** Remplacer `Map<string, Set<string>>` → `Record<string, string[]>`
- **Test :** Persistance localStorage survive session

### 2.3 Augmenter queue Socket.IO (web)
- **Fichier :** `apps/web/services/meeshy-socketio.service.ts` ou orchestrateur
- **Action :** `MAX_QUEUE_SIZE: 10 → 50`, `MESSAGE_QUEUE_TIMEOUT: 30s → 120s`
- **Test :** Simulation déconnexion 60s → aucun message perdu

### 2.4 LRU cache traductions (i18n + messages)
- **Fichier :** `apps/web/hooks/use-i18n.ts`, `apps/web/services/translation.service.ts`
- **Action :** Remplacer `new Map()` par `LRUCache(capacity)` avec limite
- **Test :** Vérifier éviction au-delà de la limite

### 2.5 Lazy-loading routes lourdes
- **Fichier :** `apps/web/app/` (layout/page files)
- **Action :** `dynamic()` import pour admin, /v2, video-calls
- **Test :** Bundle analysis avant/après

### 2.6 Cleanup Socket.IO sur unmount/logout
- **Fichier :** `apps/web/services/` orchestrateur
- **Action :** Appeler `cleanup()` sur logout + `beforeunload`
- **Test :** Chrome Memory tab → pas de nœuds détachés après logout

---

## Phase 3 — iOS SDK

### 3.1 Accept-Encoding: br, gzip (E1)
- **Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`
- **Action :** Ajouter `"Accept-Encoding": "br, gzip"` aux headers par défaut
- **Test :** Vérifier en-tête dans URLRequest

### 3.2 Décodage traductions sélectif (E2)
- **Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`
- **Action :** Lors du décodage JSON, filtrer `translations` pour ne garder que les langues du Prisme (1-4)
- **Test :** Message avec 10 traductions → seules 2 en mémoire

### 3.3 Consommer `?languages=` (E3)
- **Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Services/MessageService.swift`
- **Action :** Ajouter paramètre `languages` aux requêtes `GET /messages` basé sur `preferredContentLanguages`
- **Test :** URL construite contient `?languages=fr,en`

### 3.4 Cache résolution de langue par message (iOS)
- **Fichier :** `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
- **Action :** `[messageId: TranslationResult]` dictionary invalidé uniquement sur `preferredLanguageRevision` bump
- **Test :** Scroll 1000 messages → 0 re-calculs (tous en cache)

---

## Phase 4 — Translator & Infrastructure

### 4.1 Limites mémoire/CPU Docker translator
- **Fichier :** `infrastructure/docker/compose/docker-compose.dev.yml` + variants
- **Action :** Ajouter `deploy.resources.limits.memory: 8g, cpus: '4'`
- **Test :** `docker stats` vérifie la limite

### 4.2 Cache Redis résultats TTS
- **Fichier :** `services/translator/src/services/tts/synthesizer.py`
- **Action :** Wrapper Redis avec key `sha256(text+lang+voice_id)`, TTL 30 jours
- **Test :** Même texte 2× → 1 seul appel au modèle

### 4.3 Cache traductions par contenu (translator)
- **Fichier :** `services/translator/src/services/translation_ml/translation_cache.py`
- **Action :** Key = `sha256(text+src+tgt)` au lieu de `messageId+lang`
- **Test :** "Bonjour" dans 2 conversations → 1 seule traduction

### 4.4 StatusService Redis-backed throttling
- **Fichier :** `services/gateway/src/services/StatusService.ts`
- **Action :** Remplacer `activityCache: Map` par Redis `SET status:{userId} TTL 10s`
- **Test :** 2 instances partagent le throttle

### 4.5 Auth user cache TTL réduit + invalidation
- **Fichier :** `services/gateway/src/middleware/auth.ts`
- **Action :** TTL 60s (vs 300s), + `DEL auth:user:{userId}` sur PATCH /users/profile
- **Test :** Changement langue visible dans la seconde

---

## Phase 5 — Payload Avancé (B4, B5, D2, D3)

### 5.1 B4 — Timestamps epoch ms
- **Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts`
- **Action :** Sérialiser `createdAt/updatedAt` en ms unix (`Date.getTime()`) dans les payloads socket
- **Versioning :** header `X-Payload-Version: 2` négocié au handshake

### 5.2 B5 — Delta présence snapshot
- **Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts`
- **Action :** Stocker dernier snapshot presence par userId en Redis ; n'émettre que les deltas

### 5.3 D2 — Supprimer base64 pipeline TTS interne
- **Fichier :** `services/translator/src/services/tts/synthesizer.py`
- **Action :** Retourner bytes bruts via ZMQ frame binaire (déjà supporté)

### 5.4 D3 — Embeddings float32 → float16
- **Fichier :** `services/translator/src/services/audio_pipeline/audio_message_pipeline.py`
- **Action :** `numpy.float32 → numpy.float16` avant sérialisation

---

## Phase 6 — Appels SOTA (Référence: tasks/calls-sota-plan-2026-06-05.md)

### Ordre strict (P0 = bloquant)

6.1 **P0-2** — Retirer `forcePolling(true)` × 3, ajuster pingTimeout/pingInterval  
6.2 **P0-3** — `emitWithAck` pour signaux call + grâce reconnexion gateway  
6.3 **P0-1 + P0-8** — Gate macOS (CallKit/PushKit), activation audio PRIMAIRE  
6.4 **P0-4** — `pc.restartIce()` réel  
6.5 **P0-8 complet** — AVAudioSession routeChange observer  
6.6 **P0-6 + P0-5** — CallService partagé injecté  
6.7 **P0-9** — Nettoyage dead code CALL-DIAG  

---

## Métriques de Succès

| Métrique | Avant | Objectif |
|----------|-------|----------|
| Broadcast message 100 participants | ~100 DB queries séquentielles | 1 `Promise.all` |
| Payload message 10 langues (socket) | 10 traductions/client | 1-2 traductions/client |
| REST message list (Brotli ON) | ✅ déjà compressé | Maintenir |
| iOS RAM traductions | toutes les langues | langues Prisme uniquement |
| DOM nodes liste 500 msg (web) | 500 nodes | ≤ 30 nodes |
| TTI page web | ~4.2s | ~2.5s |
| Startup translator | 8-10 min | 2-3 min (lazy loading) |
| OOM translator | Possible | Impossible (limits) |

---

## Ordre d'implémentation effectif

```
Phase 1 → Phase 4.1 → Phase 4.5 → Phase 2 → Phase 3 → Phase 4.2-4.4 → Phase 5 → Phase 6
```

Les phases 1-4 sont non-breaking et peuvent être livrées ensemble.  
Les phases 5-6 nécessitent coordination client/serveur (versioning).
