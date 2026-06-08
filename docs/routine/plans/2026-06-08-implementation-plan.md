# Plan d'Implémentation — Optimisations 2026-06-08

**Référence :** `docs/routine/analyses/2026-06-08-comprehensive-optimization-analysis.md`  
**Objectif :** Implémenter les optimisations en 3 phases, du plus rapide au plus structurel.

---

## Phase 1 — Quick Wins (faible risque, impact immédiat)

### P1.1 Auth User Cache (Redis, 5 min TTL)
- **Fichier :** `services/gateway/src/middleware/auth.ts`
- **Action :** Wraper le `prisma.user.findFirst()` avec un `cacheStore.get/set` TTL 5 min
- **Invalidation :** Écouter `user:profile-updated` Socket.IO event → purger la clé
- **Impact :** ~500ms → ~20ms par request authentifiée

### P1.2 Supprimer polling friend requests → Socket events
- **Fichier :** `apps/web/hooks/v2/use-friend-requests-v2.ts`
- **Action :** Retirer `refetchInterval: 30000` × 2. Invalider via `friend:request-received` et `friend:request-accepted` Socket.IO events dans `use-socket-cache-sync.ts`
- **Impact :** 6 MB/h/user actif économisés

### P1.3 Supprimer polling notifications → Socket events
- **Fichier :** `apps/web/hooks/queries/use-notifications-query.ts`
- **Action :** Retirer `refetchInterval: 60*1000`. Invalider via `notification:new` event
- **Impact :** 2 MB/h/user économisés

### P1.4 Tone.js → dynamic import
- **Fichier :** `apps/web/utils/audio-effects.ts`
- **Action :** `await import('tone')` lazy au premier appel, pas en import statique
- **Impact :** −800 KB bundle dans le chemin critique

### P1.5 Ringtone WAV → Opus
- **Fichier :** `apps/web/public/sounds/ringtone.wav`
- **Action :** Convertir avec `ffmpeg -i ringtone.wav -c:a libopus -b:a 32k ringtone.ogg` + mise à jour des références
- **Impact :** 330 KB → ~30 KB

### P1.6 MongoDB indexes manquants (Prisma schema)
- **Fichier :** `packages/shared/prisma/schema.prisma`
- **Actions à ajouter :**
  ```prisma
  // User — language resolution queries
  @@index([systemLanguage])
  @@index([deviceLocale])  // sparse = OK, null users ignorés
  
  // Reaction — messageId lookup
  @@index([messageId])
  
  // Attachment — messageId lookup  
  @@index([messageId])
  
  // ConversationShare — pinned sort
  @@index([communityId, isPinned, pinOrder])
  ```
- **Impact :** Évite full-collection scans sur les requêtes de traduction et feed

### P1.7 Socket.IO error callbacks aux clients
- **Fichiers :** `services/gateway/src/socketio/handlers/*.ts` (11 handlers)
- **Action :** Ajouter un wrapper `withSocketErrorHandler` qui garantit que `callback?.({ success: false, error: msg })` est toujours appelé en cas d'erreur
- **Impact :** Clients maintenant notifiés des échecs, retry possible

### P1.8 Memory cache bounded dans translator
- **Fichier :** `services/translator/src/services/redis_service.py`
- **Action :** Ajouter `MAX_MEMORY_CACHE_SIZE = 500` + éviction LRU quand atteint
- **Impact :** Évite OOM si Redis down + trafic élevé

### P1.9 Activer B1 flag per-language broadcast
- **Fichier :** `services/gateway/src/services/message-translation/MessageTranslationService.ts`
- **Action :** Identifier le feature flag B1, l'activer en production (flag-gated, actuellement OFF)
- **Impact :** Réduit le payload message:new aux destinataires qui n'ont besoin que d'une langue

### P1.10 Nettoyage dead code (Phase A du code review 2026-05-22)
- **Action :** Supprimer les fichiers orphelins identifiés :
  - `services/gateway/src/services/message-translation/MessageTranslationService.ts.before_restore`
  - `services/gateway/src/services/AttachmentService.ts.old`
  - `services/gateway/src/routes/communities.ts.backup`
  - `services/gateway/src/routes/auth.ts.backup`
  - `services/gateway/src/routes/user-features.ts.old`
  - `services/gateway/src/routes/users.ts.backup`
  - `services/gateway/src/routes/admin.ts.backup`
  - `services/gateway/src/routes/affiliate-old.ts`
  - `services/gateway/src/routes/notifications-secured.ts`
  - `services/gateway/src/routes/health.ts`
  - `services/translator/services/translation_ml_service_ORIGINAL_BACKUP.py`
  - `services/translator/services/quantized_ml_service.py`
  - `apps/ios/Meeshy/Features/Main/Services/WebRTC/DarkFrameDetector.swift`

---

## Phase 2 — Optimisations Structurelles (effort moyen, grand impact)

### P2.1 Explicit worker pool configuration (translator)
- **Fichier :** `services/translator/src/services/zmq_server_core.py`
- **Action :** Remplacer le calcul dynamique par des constantes de configuration explicites :
  ```python
  POOL_CONFIG = {
    'text': {'workers': 20, 'timeout': 30},
    'transcription': {'workers': 5, 'timeout': 60},
    'tts': {'workers': 10, 'timeout': 45},
  }
  ```
- **Impact :** Prédictibilité de la charge, timeout per-worker

### P2.2 N+1 queries fix sur messages endpoint
- **Fichier :** `services/gateway/src/routes/conversations/messages.ts`
- **Action :** Consolidation des queries avec `include` Prisma pour réactions, attachments, sender — créer `messageDetailSelect` dans `packages/shared/`
- **Impact :** 8–12 queries → 2–3 par page

### P2.3 Audio processing parallèle dans ZMQ handler
- **Fichier :** `services/gateway/src/services/message-translation/MessageTranslationService.ts`
- **Action :** Remplacer le `for await` sur les attachments par `Promise.all()`
- **Impact :** Latence linéaire → latence du plus lent des N attachments

### P2.4 ZMQ circuit breaker basique
- **Fichier :** `services/gateway/src/services/ZmqTranslationClient.ts`
- **Action :** Ajouter un circuit breaker avec état `OPEN/CLOSED/HALF_OPEN`. Sur OPEN : retourner message sans traduction après timeout 30s
- **Impact :** Résilience si translator hors ligne

### P2.5 Language-to-TTS backend routing (translator)
- **Fichier :** `services/translator/src/services/tts/tts_service.py`
- **Action :** Créer `LanguageRouter` mappant langues → backend (Chatterbox pour eu/fr/en, MMS Africa pour langues africaines, XTTS fallback)
- **Impact :** Qualité TTS améliorée pour les langues africaines

### P2.6 Image download semaphore iOS
- **Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift` (ou le composant CachedAsyncImage)
- **Action :** Ajouter `AsyncSemaphore(value: 4)` pour limiter les téléchargements concurrents
- **Impact :** Évite 100 connexions simultanées sur le scroll

### P2.7 SearchText debounce iOS
- **Fichier :** `apps/ios/Meeshy/Features/Conversations/List/ConversationListViewModel.swift`
- **Action :** Debounce 300ms sur la propriété `searchText` avant de re-filtrer
- **Impact :** Supprime les re-calculs O(N) à chaque keystroke

### P2.8 Skeleton loading web (conversation list)
- **Fichiers :** `apps/web/app/conversations/` (ou équivalent)
- **Action :** Ajouter des composants `ConversationSkeleton` avec animations Tailwind CSS pulse
- **Impact :** UX perçue comme plus rapide

### P2.9 Virtual list pour conversation list web
- **Fichier :** composant liste conversations web
- **Action :** Utiliser `@tanstack/react-virtual` (déjà dans deps) sur la liste principale
- **Impact :** 100+ conversations = DOM virtualisé, 60 FPS garanti

### P2.10 Message forwarding UI (iOS)
- **Fichier :** `apps/ios/Meeshy/Features/Messages/BubbleLongPressOverlay` ou équivalent
- **Action :** Ajouter bouton "Forward" dans le menu long-press, utiliser `message.forwardedFromId` déjà dans le schema
- **Impact :** Feature manquante vs WhatsApp/Telegram

### P2.11 Message pinning (activer les events Socket.IO)
- **Fichiers :** `services/gateway/src/socketio/handlers/MessageHandler.ts`
- **Action :** Implémenter l'émission des events `MESSAGE_PINNED`/`MESSAGE_UNPINNED` depuis la route `PATCH /messages/:id/pin` (schema a `pinnedAt`, route existe)
- **Impact :** Feature manquante vs WhatsApp/Telegram

---

## Phase 3 — Refonte Structurelle (effort élevé, impact long terme)

### P3.1 TTS à la demande (lazy)
- Actuellement : TTS systématique pour toutes les langues, tous les participants
- Cible : Pipeline texte+traduction uniquement → endpoint `POST /attachments/:id/tts?lang=fr` au premier clic
- **Impact :** Plusieurs GB/h GPU économisés

### P3.2 WebSocket iOS natif (remplacer forcePolling)
- Diagnostiquer le bug de transport iOS si encore présent
- Passer à `URLSessionWebSocketTask` ou corriger le timeout Starscream
- **Impact :** Trafic socket iOS ÷3–5

### P3.3 CDN/S3 pour médias
- `MediaStorage` expose `S3CompatibleMediaStorage` prêt
- Configurer Cloudflare R2 + URLs présignées
- **Impact :** 60–80% bande sortante audio/images

### P3.4 ConversationViewModel iOS split
- Découper les 3561 LoC en 4 ViewModels dédiés
- **Impact :** Testabilité, compilation plus rapide, separation of concerns

### P3.5 E2EE Signal Protocol iOS
- Les modèles existent, le crypto n'est pas câblé
- High complexity, high security value
- **Impact :** Parité Signal/WhatsApp

### P3.6 Voice message 2x speed (iOS + web)
- Ajouter control de vitesse sur `AVPlayer` iOS (0.5×, 1×, 1.5×, 2×)
- Ajouter contrôle vitesse sur `<audio>` web
- **Impact :** Feature demandée, parity WhatsApp/Telegram

### P3.7 View-once photos câblage complet
- `isViewOnce` existe dans le schema et les modèles
- Câbler la logique de suppression après visualisation (iOS + web)
- **Impact :** Parity WhatsApp

### P3.8 Distributed Rate Limiter (Redis-based)
- Passer `@fastify/rate-limit` au `Redis store`
- **Impact :** Sécurité multi-instance

---

## Ordre d'Exécution Recommandé

```
Session 1 (aujourd'hui) :
  P1.1 → P1.2 → P1.3 → P1.4 → P1.5 → P1.6 → P1.7 → P1.8 → P1.10
  P2.2 → P2.3 → P2.7 → P2.8

Session 2 :
  P1.9 → P2.1 → P2.4 → P2.5 → P2.6 → P2.9 → P2.10 → P2.11

Session 3 :
  P3.1 → P3.2 → P3.6 → P3.7

Session 4+ :
  P3.3 → P3.4 → P3.5 → P3.8
```

---

## Métriques de Succès

Valider après chaque phase :
- `socket event size bytes{event=message:new}` < 1500 B
- Bundle JS initial < 380 KB gzippé (Phase 1)
- Auth middleware latency < 20ms p99 (Phase 1)
- MongoDB queries / message < 5 (Phase 2)
- TTS requests / message < 0.2 (Phase 3)
