# Plan d'implémentation — Optimisations Full-Stack
**Date :** 2026-06-08  
**Basé sur :** `docs/routine/analyses/2026-06-08-full-stack-optimization-audit.md`  
**Branche :** `claude/zen-albattani-UEibr`

---

## Phase 1 — Corrections critiques & quick wins (aujourd'hui)

### 1.1 Gateway : Logging des fire-and-forget
**Fichiers :** `services/gateway/src/routes/posts/core.ts`, `comments.ts`  
**Action :** Remplacer tous les `.catch(() => {})` par `.catch(err => logger.error(...))`.  
**Test :** Grep `catch.*=>.*{}` dans routes/posts → zéro résultat.

### 1.2 Gateway : Invalidation cache auth sur update profil
**Fichiers :** `services/gateway/src/routes/users/profile.ts`, `src/middleware/auth.ts`  
**Action :** Après `prisma.user.update()` → `cache.del(`auth:user:${id}`)`.  
**Test :** Update profil → vérifier que le cache est invalidé immédiatement.

### 1.3 Web : Supprimer le polling friend-requests et notifications
**Fichiers :** `apps/web/hooks/v2/use-friend-requests-v2.ts` · `apps/web/hooks/queries/use-notifications-query.ts`  
**Action :** Supprimer `refetchInterval`, câbler `queryClient.invalidateQueries()` sur les events socket.  
**Test :** DevTools réseau → zéro requête REST polling sur ces endpoints.

### 1.4 Web : Tone.js dynamic import
**Fichiers :** `apps/web/hooks/use-audio-effects.ts` · `apps/web/utils/audio-effects.ts`  
**Action :** `const Tone = await import('tone')` inside function calls.  
**Test :** Bundle analyzer → Tone.js absent du chunk initial.

### 1.5 Web : Supprimer `refetchOnWindowFocus: 'always'` des stories
**Fichier :** `apps/web/hooks/social/use-stories.ts:28`  
**Action :** Changer en `refetchOnWindowFocus: false`.  
**Test :** Focus window → pas de requête stories inutile.

### 1.6 Shared : Ajouter index Prisma manquants
**Fichier :** `packages/shared/prisma/schema.prisma`  
**Action :** Ajouter `@@index([messageId, targetLanguage])` sur MessageTranslation, `@@index([conversationId, participantId])` sur Participant, `@@index([systemLanguage])` sur User.  
**Test :** `prisma db push` ou migration + `EXPLAIN` sur les queries concernées.

### 1.7 Shared : Types TranslationStatus et LanguageDetectionResult
**Fichier :** `packages/shared/types/` (nouveau fichier `translation-types.ts`)  
**Action :** Créer enum `TranslationStatus` + interface `LanguageDetectionResult`.  
**Test :** TypeScript strict → zéro `as string` sur les statuts de traduction.

---

## Phase 2 — Performance & stabilité (suite immédiate)

### 2.1 Gateway : Circuit breaker ZMQ translator
**Fichier :** `services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts`  
**Action :** Implémenter circuit breaker simple : compteur d'erreurs consécutives → fail-fast après 5 + backoff exponentiel sur reconnect (1s→2s→4s→8s max).  
**Test :** Couper le translator → circuit ouvert en <5 erreurs, recovery auto au retour.

### 2.2 Gateway : LRU pour les maps Socket.IO
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts`  
**Action :** Remplacer les 3 Maps par des LRU avec TTL 2h (package `lru-cache` déjà dans les deps).  
**Test :** Simuler 10k connections sans déconnexion → mémoire stable.

### 2.3 Gateway : Backpressure broadcast Socket.IO
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts`  
**Action :** Chunker les broadcasts en tranches de 50 avec `await new Promise(r => setImmediate(r))` entre chaque tranche.  
**Test :** Conversation 200 membres + 100 messages → pas de spike mémoire >200MB.

### 2.4 Gateway : Cache participant anonyme
**Fichier :** `services/gateway/src/middleware/auth.ts`  
**Action :** Cache Redis 60s sur `session:${sessionTokenHash}`. Ajouter compound index DB.  
**Test :** Benchmark auth anon → latence <10ms vs 30-50ms avant.

### 2.5 iOS : Fix @StateObject → @ObservedObject sur singletons
**Fichiers :** `apps/ios/Meeshy/MeeshyApp.swift` · `RootView.swift` · `iPadRootView.swift`  
**Action :** `@StateObject var x = X.shared` → `@ObservedObject var x = X.shared`.  
**Test :** Memory graph → pas de double instance des singletons.

### 2.6 iOS : URLSession config HTTP/2 + waitsForConnectivity
**Fichier :** `apps/ios/Meeshy/Features/Main/Services/APIClient.swift`  
**Action :** Ajouter `waitsForConnectivity = true`, `httpMaximumConnections = 4`, `requestCachePolicy = .useProtocolCacheHeaders`.  
**Test :** Network profiler Xcode → réduction des requêtes dupliquées.

### 2.7 Translator : Cache TTS Redis
**Fichier :** `services/translator/src/services/tts/tts_service.py`  
**Action :** Avant synthèse, chercher `f"tts:{lang}:{voice_id}:{hash(text[:200])}"` dans Redis. Si présent, retourner directement. Sinon synthétiser + stocker (TTL 24h).  
**Test :** Même texte synthétisé 2× → 2ème hit Redis, latence <5ms.

### 2.8 Web : Message pinning (parity concurrentielle)
**Fichiers :** `services/gateway/src/routes/conversations/messages.ts` · `apps/web/components/` (nouveau composant PinnedMessageBanner)  
**Action :** Routes `POST /conversations/:id/messages/:msgId/pin` + `DELETE ...` (schéma DB déjà en place : `pinnedAt`, `pinnedBy`). Socket.IO event `message:pinned`. UI : bandeau "Message épinglé" dans la conversation.  
**Test :** Pin → bannière apparaît pour tous les membres en temps réel.

---

## Phase 3 — Features & optimisations ML (prioritaires)

### 3.1 Translator : VAD avant Whisper
**Fichier :** `services/translator/src/services/audio_pipeline/transcription_stage.py`  
**Action :** Intégrer `silero-vad` pour détecter les segments de parole. Ne passer à Whisper que les segments actifs.  
**Test :** Audio 60s avec 30s de silence → temps Whisper divisé par 2.

### 3.2 Translator : torch.compile au chargement
**Fichier :** `services/translator/src/services/translation_ml/model_loader.py`  
**Action :** Après `model = AutoModelForSeq2SeqLM.from_pretrained(...)`, appliquer `torch.compile(model, backend='inductor', mode='default')` si `perf_config.enable_torch_compile`.  
**Test :** Benchmark NLLB avant/après → speedup >1.5× après warm-up.

### 3.3 Translator : Détection de langue ML (réutiliser Whisper)
**Fichier :** `services/translator/src/services/translation_ml/translator_engine.py`  
**Action :** Remplacer le dictionnaire de mots-clés par une détection via le tokenizer Whisper (déjà chargé). Retourner `(lang_code, confidence)`.  
**Test :** Texte arabe/chinois/hindi → détection correcte avec confidence >0.8.

### 3.4 Web : Recherche dans les messages
**Fichiers :** `services/gateway/src/routes/conversations/messages.ts` · `apps/web/hooks/queries/` (nouveau `use-message-search.ts`) · `apps/web/components/conversations/` (SearchBar)  
**Action :** Endpoint `GET /conversations/:id/messages?q=&limit=20` avec MongoDB `$text` index ou regex. Hook React Query avec debounce 300ms. UI : barre de recherche dans le header conversation.  
**Test :** Rechercher "hello" → résultats en <200ms.

### 3.5 Web : Error Boundaries sur les features
**Fichiers :** `apps/web/components/common/messages-display.tsx` · `video-calls/` · `audio/`  
**Action :** Créer `<FeatureErrorBoundary fallback={<ErrorFallback />}>` et wrapper chaque feature area.  
**Test :** Throw intentionnel dans un composant → UI de fallback affichée, reste de l'app fonctionnel.

### 3.6 Web : Screen Wake Lock pendant les appels
**Fichier :** `apps/web/components/video-call/VideoCallInterface.tsx`  
**Action :** `wakeLock = await navigator.wakeLock.request('screen')` au démarrage d'un call, `wakeLock.release()` à la fin.  
**Test :** Call 10min sur mobile → écran ne s'éteint pas.

### 3.7 Web : Web Share API
**Fichier :** `apps/web/components/common/MessageActions.tsx`  
**Action :** Ajouter bouton "Partager" dans le menu contextuel des messages qui appelle `navigator.share()`.  
**Test :** Clic partager sur mobile → OS share sheet ouvert.

### 3.8 iOS : Spotlight indexing
**Action :** Nouveau service `SpotlightIndexingService` avec `CSSearchableItem`. Indexer les conversations lors du chargement de la liste. Ajouter `CoreSpotlight` framework.  
**Test :** Chercher le nom d'une conversation dans Spotlight iOS → résultat apparaît.

---

## Phase 4 — Observabilité, polish & long terme

### 4.1 Gateway : Métriques Prometheus
**Fichier :** `services/gateway/src/server.ts`  
**Action :** Ajouter `prom-client`. Exposer `/metrics`. Compteurs : `auth_cache_hits_total`, `auth_db_hits_total`, histogramme `zmq_request_duration_ms`, gauge `socketio_connected_users`.  
**Test :** `curl /metrics` → métriques lisibles par Grafana.

### 4.2 Web : React.memo + virtualisation messages
**Fichier :** `apps/web/components/common/messages-display.tsx`  
**Action :** Wrapper `MessageBubble` avec `React.memo()`. Implémenter `@tanstack/react-virtual` (déjà en deps) pour les listes >50 messages.  
**Test :** DevTools Profiler → re-renders réduits de 70%.

### 4.3 Web : Migration `<Image>` Next.js (avatars prioritaires)
**Fichiers :** `apps/web/components/ui/avatar.tsx` + 30 composants admin  
**Action :** Remplacer `<img>` par `<Image>` avec `width`/`height` explicites. Avatars : 3 tailles (40/80/128px).  
**Test :** Lighthouse → LCP <2.5s, pas de layout shift.

### 4.4 iOS : @Published groupés + déduplication requêtes
**Fichier :** `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationStateStore.swift`  
**Action :** Grouper les @Published loading states en struct. Ajouter `inflightRequests: [String: Task<T, Error>]`.  
**Test :** Instruments Time Profiler → nombre de re-renders réduit de 40%.

### 4.5 Web : Raccourcis clavier (Command Palette)
**Action :** Installer `cmdk` (déjà populaire dans le stack shadcn). Créer `CommandPalette.tsx` accessible via `Cmd+K`. Shortcuts : `Cmd+Enter` send, `Esc` close modal, `/` search.  
**Test :** `Cmd+K` → palette ouverte avec navigation clavier.

### 4.6 Gateway : Retry automatique traductions échouées
**Fichier :** `services/gateway/src/services/message-translation/MessageTranslationService.ts`  
**Action :** Job `RetryTranslationJob` qui scanne les traductions `status='failed'` datant de <2h et les re-soumet avec backoff (5min, 15min, 30min).  
**Test :** Kill translator pendant 2min → messages en échec re-traduits automatiquement au retour.

### 4.7 iOS : Focus Modes integration
**Action :** Subscribe `UIScene.focusSceneActivity`. Auto-mute notifications en Focus "Driving". Exposer dans les réglages.  
**Test :** Activer Focus "Driving" → notifications silencieuses (sauf appels entrants).

---

## Matrice de priorité

| Phase | Items | Effort total estimé | Impact utilisateur |
|-------|-------|--------------------|--------------------|
| Phase 1 | 1.1→1.7 | ~4h | Stabilité prod, −30% requêtes inutiles |
| Phase 2 | 2.1→2.8 | ~12h | Résilience, parity features, −50ms latence |
| Phase 3 | 3.1→3.8 | ~20h | Features manquantes, ML +30% throughput |
| Phase 4 | 4.1→4.7 | ~16h | Observabilité, polish, UX avancée |

---

## Règles transverses (à respecter partout)

1. **Jamais de `.catch(() => {})` silencieux** — toujours logguer avec contexte.
2. **Pas de `refetchInterval` si un event Socket.IO couvre le cas** — invalider via event.
3. **Tout `prisma.user.update()` → invalidation cache** `auth:user:${id}`.
4. **Images** → `<Image>` Next.js ou `UIImage` avec cache côté iOS, jamais `<img>` dans les listes.
5. **Test de comportement avant toute feature** — TDD obligatoire (RED → GREEN → REFACTOR).

---

*Plan généré le 2026-06-08, basé sur l'analyse full-stack multi-agents.*
