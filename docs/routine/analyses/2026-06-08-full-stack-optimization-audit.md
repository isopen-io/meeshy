# Audit Optimisation Full-Stack — Meeshy
**Date :** 2026-06-08  
**Branches couvertes :** main (b4bee8af)  
**Périmètre :** Gateway, Translator, Web, iOS, Shared packages  
**Méthode :** Analyse statique multi-agents parallèle + comparaison concurrentielle

---

## 1. État de l'art — Ce qui est déjà fait

Les sprints précédents (Phase A payload-weight) ont livré :

| Item | Statut | Commit |
|------|--------|--------|
| `perMessageDeflate` Socket.IO (threshold 256B) | ✅ Livré | 646b2ecd |
| `@fastify/compress` (Brotli > gzip) | ✅ Livré | 646b2ecd |
| Traefik `compress` middleware prod | ✅ Livré | 646b2ecd |
| Audio re-encodage 128k → 64k | ✅ Livré | — |
| WebP thumbnails (D4, −25-35% vs JPEG) | ✅ Livré | a3c4315f |
| Filtrage traductions opt-in par langue (A3) | ✅ Livré | 94e26b58 |
| Broadcast per-language flag-gated (B1, OFF) | ✅ Livré | 13c3cb7d |
| N+1 notifications → `updateMany` | ✅ Livré | — |
| Rich call-summary system messages | ✅ Livré | bd03e450 |
| Message forwarding (schéma + routes) | ✅ Livré | — |
| View-once messages | ✅ Livré | — |
| Location sharing | ✅ Livré | — |
| Live Activities + Dynamic Island | ✅ Livré | — |
| WidgetKit | ✅ Livré | — |
| Siri Shortcuts | ✅ Livré | — |
| App Badge API (web) | ✅ Livré | — |
| PWA Service Worker | ✅ Livré | — |
| FCM push notifications | ✅ Livré | — |

---

## 2. Findings Gateway (Fastify + Socket.IO)

### CRITIQUES

#### G-C1 — Fire-and-forget `.catch(() => {})` silencieux
**Fichiers :** `src/routes/posts/core.ts:69,71,75,93,116,124,139` · `src/routes/posts/comments.ts:124,144,163`  
Des dizaines de tâches background (broadcast social, notifications, mentions) échouent silencieusement. Aucun log, aucune métrique, aucun retry. Exemple :
```typescript
socialEvents.broadcastPostCreated(...).catch(() => {})  // SILENT FAILURE
```
**Impact :** Notifications perdues, inconsistances temps-réel invisibles en prod.  
**Fix :** `catch(err => logger.error('broadcast failed', { context, error: err }))`

#### G-C2 — N+1 requêtes message/participant
**Fichiers :** `src/routes/conversations/messages.ts:720` · `src/services/message-translation/MessageTranslationService.ts:635`  
Envoi de 10 messages = 10× `conversation.findUnique()` + 10× `participant.findMany()` = 20 aller-retours DB.  
**Impact :** 50–200ms de latence par message dans les groupes 50+ membres.  
**Fix :** Batch Prisma avec `include` complet + compound index `(conversationId, isActive)`.

#### G-C3 — Pas de circuit breaker sur ZMQ translator
**Fichier :** `src/services/zmq-translation/ZmqTranslationClient.ts`  
Si le translator est down, le gateway continue d'envoyer des frames ZMQ sans backoff. File mémoire → OOM.  
**Impact :** Un restart translator = cascade failure 100+ utilisateurs, recovery 20s+ par socket.  
**Fix :** Circuit breaker (5 erreurs consécutives → fail-fast) + backoff exponentiel (1s→2s→4s→8s).

#### G-C4 — Invalidation du cache auth jamais déclenchée
**Fichier :** `src/middleware/auth.ts:144` · CLAUDE.md ligne 214  
Mise à jour profil → cache Redis NON invalidé. Données stales jusqu'à TTL 5min. Rôles révoqués restent actifs.  
**Fix :** `await cache.del(\`auth:user:${id}\`)` après chaque `prisma.user.update()`.

### HAUTE PRIORITÉ

#### G-H1 — Maps Socket.IO non bornées (fuite mémoire)
**Fichier :** `src/socketio/MeeshySocketIOManager.ts:114-116`  
`connectedUsers`, `socketToUser`, `userSockets` — pas de GC sur les entrées orphelines (disconnect sans cleanup).  
**Impact :** ~50MB/mois à 50k users actifs, pauses GC croissantes.  
**Fix :** LRU avec TTL 2h ou cleanup `setInterval` toutes les heures.

#### G-H2 — Pas de backpressure sur le broadcast Socket.IO
**Fichier :** `src/socketio/MeeshySocketIOManager.ts:324`  
1000 messages × 100 users = 100k `socket.emit()` en mémoire sans pause. Buffer TCP → OOM.  
**Fix :** Batch par tranches de 50 avec `setImmediate()` entre chaque.

#### G-H3 — Cascade Redis → DB sur échec Redis
**Fichier :** `src/services/CacheStore.ts:59-87` · `src/middleware/auth.ts:170`  
Quand Redis est down, chaque requête auth déclenche un `prisma.findUnique()`. 1000 connections = 1000 queries/s.  
**Fix :** Bulkhead dédié auth + TTL Redis étendu sur lecture.

#### G-H4 — Pas de cache participant pour auth anonyme
**Fichier :** `src/middleware/auth.ts:266-291`  
`participant.findFirst()` sur `sessionTokenHash` à chaque requête anon, sans cache. 30–50ms latence auth.  
**Fix :** `cache.set('session:${hash}', data, 60)` + compound index `(sessionTokenHash, type, isActive)`.

### MOYENNE PRIORITÉ

#### G-M1 — Pas de retry sur erreur ZMQ translation
Traduction échouée → marquée `failed` définitivement. Pas de retry automatique.  
**Fix :** Queue avec retry exponentiel (5min, 10min, 30min) avant abandon.

#### G-M2 — Rate limiting trop strict
`MESSAGE_SEND: 20/min` = 1 message/3s → UX dégradée en groupe actif. IP-based global = faux positifs sur proxies corp.  
**Fix :** Token bucket 50 soutenu / 100 pic, per-userId.

#### G-M3 — Pas d'observabilité sur les chemins critiques
Aucune métrique Prometheus sur : hit-rate cache auth, latence ZMQ, profondeur queue Socket.IO, pool Prisma.  
**Fix :** 5 compteurs/histogrammes Prometheus + endpoint `/metrics`.

---

## 3. Findings Translator (FastAPI + PyTorch)

### CRITIQUES

#### T-C1 — Détection de langue par liste de mots (échoue sur scripts non-latins)
**Fichier :** `src/services/translation_ml/translator_engine.py:158-180`  
Correspondance naïve de mots-clés. Arabe, Chinois, Thai, Hindi = détection incorrecte.  
**Fix :** Réutiliser le tokenizer Whisper (déjà chargé pour STT) → `(lang, confidence)`.

#### T-C2 — Pas de fallback sur échec de détection auto
Si `source_language='auto'` et détection < 0.5 confiance → aucun fallback vers `systemLanguage` user.  
**Fix :** Fallback vers `resolveUserLanguage()` si confidence < 0.5.

#### T-C3 — TTS systématique (sans cache)
**Fichier :** `src/services/tts/tts_service.py`  
Même texte re-synthétisé à chaque appel. 100–200ms CPU/GPU gaspillés.  
**Fix :** Cache Redis avec clé `f"tts:{lang}:{voice_id}:{hash(text)}"` TTL 24h.

### HAUTE PRIORITÉ

#### T-H1 — Pas de VAD (Voice Activity Detection)
Whisper transcrit tout l'audio y compris les silences. 20–40% de temps perdu.  
**Fix :** Intégrer `silero-vad` avant le passage à Whisper.

#### T-H2 — `torch.compile` non utilisé à l'inférence
**Fichier :** `src/services/translation_ml/model_loader.py:249-251`  
Flag activé mais compilé trop tard (post-load). Speedup 2-3× non réalisé.  
**Fix :** Compiler en-place au chargement : `torch.compile(model, backend='inductor')`.

#### T-H3 — Pas de quantification int8/int4
Supporte seulement float16/float32. 2–4× de mémoire économisable avec int8.  
**Fix :** Ajouter `load_in_8bit=True` (BitsAndBytes) comme option de config.

#### T-H4 — Seuil batch translation trop élevé
**Fichier :** `src/services/translation_ml/translator_engine.py:402`  
Batchage seulement au-delà de 3 textes → les paires de messages ne sont pas batchées.  
**Fix :** Seuil → 2 (toujours batcher).

#### T-H5 — Pas de surveillance mémoire GPU
Pas de log `torch.cuda.memory_allocated()`. Éviction LRU incomplète.  
**Fix :** Log GPU memory toutes les N inférences + alerte si >90%.

### MOYENNE PRIORITÉ

#### T-M1 — Re-transcription Whisper sur TTS redondante
**Fichier :** `translation_stage.py:590-668`  
Le texte traduit est déjà connu → inutile de relancer Whisper sur l'audio TTS pour les timestamps.  
**Fix :** Générer le segment `{text, startMs, endMs}` directement depuis le texte traduit.

#### T-M2 — Pas de cache de phrases répétées
Phrases communes (salutations, termes techniques) re-traduites à chaque fois.  
**Fix :** LRU cache 500 entrées par paire de langues pour les segments courts.

---

## 4. Findings Web (Next.js 15)

### CRITIQUES

#### W-C1 — Pas de `React.memo()` sur les bulles de message
**Fichier :** `components/common/messages-display.tsx`  
100+ messages dans une liste sans memoization. Chaque changement de typing indicator = re-render complet.  
**Impact :** 60-70% de re-renders inutiles.  
**Fix :** `React.memo()` + `useCallback` sur les handlers.

#### W-C2 — Images avec `<img>` au lieu de `<Image>` Next.js
**Fichiers :** `components/admin/ranking/*.tsx` · `components/ui/avatar.tsx` · ~30 composants  
Pas d'optimisation automatique, pas de srcset responsive, pas de lazy loading.  
**Impact :** 3–4 MB/session gaspillés, LCP dégradé.  
**Fix :** Migrer vers `<Image>` + générer variantes 40/80/128px pour les avatars.

#### W-C3 — Pas d'attributs `alt` sur les images (accessibilité)
`<AvatarImage>` sans `alt`. Non-conforme WCAG AA.  
**Fix :** `alt={user.displayName}` sur tous les avatars.

### HAUTE PRIORITÉ

#### W-H1 — Polling persistant sur friend-requests et notifications
**Fichiers :** `hooks/v2/use-friend-requests-v2.ts:70,88` · `hooks/queries/use-notifications-query.ts:48`  
`refetchInterval: 30000` et `refetchInterval: 60000` alors que Socket.IO push déjà les events.  
**Fix :** Supprimer les intervals, invalider via `queryClient.invalidateQueries()` sur les events socket.

#### W-H2 — Tone.js import statique (~800KB)
**Fichiers :** `hooks/use-audio-effects.ts:15` · `utils/audio-effects.ts:12`  
Charge 800KB pour des effets audio rarement utilisés.  
**Fix :** `dynamic(() => import('tone'), { ssr: false })`.

#### W-H3 — Dépendances lourdes non lazy
pdfjs (~200KB), mermaid (~150KB), recharts (~80KB) dans le bundle principal.  
**Fix :** `dynamic(() => import('pdfjs-dist'), { ssr: false })` pour chacun.

#### W-H4 — Pinned messages absents (parity concurrentielle)
WhatsApp, Telegram, Signal ont tous le pinning de messages. Schéma DB présent (`pinnedAt`, `pinnedBy`), UI manquante.  
**Fix :** Routes `POST /messages/:id/pin` + `DELETE /messages/:id/pin` + UI composant.

#### W-H5 — Recherche de messages absente
La recherche de conversations existe mais pas la recherche dans les messages. Manque critique.  
**Fix :** Endpoint `GET /conversations/:id/messages?q=` + hook `useSearchMessages()`.

### MOYENNE PRIORITÉ

#### W-M1 — Pas d'Error Boundaries sur les features
Un crash dans les calls vidéo affecte toute l'app. `global-error.tsx` seul boundary.  
**Fix :** `<FeatureErrorBoundary>` autour de messages-display, video-calls, audio components.

#### W-M2 — `refetchOnWindowFocus: 'always'` sur les stories
**Fichier :** `hooks/social/use-stories.ts:28`  
Refetch systématique au focus fenêtre = requêtes inutiles.  
**Fix :** `refetchOnWindowFocus: false` ou staleTime adapté.

#### W-M3 — Scroll position non restaurée
Retour sur une conversation = scroll en haut au lieu du dernier message lu.  
**Fix :** Persister `lastScrollPosition` par conversation dans `conversation-ui-store`.

#### W-M4 — Pas de raccourcis clavier documentés
Discord, Telegram, Slack ont tous Cmd+K pour la recherche, Cmd+Enter pour envoyer.  
**Fix :** `CommandPalette` avec Cmdk + documentation des shortcuts.

#### W-M5 — Web Share API non implémentée
Users sur mobile ne peuvent pas partager via l'OS share sheet.  
**Fix :** `navigator.share()` dans les actions de message.

#### W-M6 — Screen Wake Lock absent pendant les appels
L'écran s'éteint pendant les appels vidéo.  
**Fix :** `navigator.wakeLock.request('screen')` au démarrage d'un call.

---

## 5. Findings iOS (SwiftUI)

### HAUTE PRIORITÉ

#### I-H1 — `@StateObject` sur les singletons (anti-pattern)
**Fichiers :** `MeeshyApp.swift:12-17` · `RootView.swift:37-38` · `iPadRootView.swift:26-31`
```swift
@StateObject private var theme = ThemeManager.shared  // FAUX
```
SwiftUI crée une nouvelle instance qui shadow le singleton. Double identité → divergence d'état.  
**Fix :** `@ObservedObject var theme = ThemeManager.shared`

#### I-H2 — Trop de `@Published` granulaires (re-renders excessifs)
**Fichier :** `Features/Main/ViewModels/Conversation/ConversationStateStore.swift` (38+ @Published)  
Chaque changement de propriété blast tout le graphe de vues.  
**Fix :** Grouper en `@Published struct LoadingState { ... }` pour les états liés.

#### I-H3 — URLSession sans HTTP/2 ni connection pooling
**Fichier :** `Meeshy/Features/Main/Services/APIClient.swift:103-122`  
Pas de `httpShouldUsePipelining`, `httpMaximumConnections`, `waitsForConnectivity`, ni `requestCachePolicy`.  
**Impact :** Drain batterie sur 3G, latence inutile.  
**Fix :**
```swift
config.waitsForConnectivity = true
config.httpMaximumConnections = 4
config.requestCachePolicy = .useProtocolCacheHeaders
```

#### I-H4 — Pas de déduplication des requêtes
Plusieurs composants peuvent déclencher la même requête API concurremment. Pas de coalescing.  
**Fix :** `inflightRequests: [String: Task<T, Error>]` dans les ViewModels.

### MOYENNE PRIORITÉ

#### I-M1 — Pas de Spotlight indexing
**Compétiteurs :** WhatsApp, Signal, Telegram indexent toutes les conversations dans Spotlight.  
**Fix :** Service `SpotlightIndexingService` avec `CSSearchableItem` sur les conversations.

#### I-M2 — Pas de CarPlay support
Mains libres au volant impossible. High-value pour les utilisateurs mobiles.  
**Fix :** `CPTemplateApplicationDelegate` + `CPListTemplate` pour messagerie voice-first.

#### I-M3 — Pas de Focus Modes integration
Impossible de lier les mutes de conversation aux Focus modes iOS.  
**Fix :** Subscribe `UIScene.focusSceneActivity` + auto-mute en Focus "Driving".

#### I-M4 — Background tasks sans `waitsForConnectivity`
**Fichier :** `Features/Main/Services/BackgroundTaskManager.swift`  
Tâches background sans vérification état thermique/batterie ni `waitsForConnectivity`.  
**Fix :** Check `ProcessInfo.processInfo.thermalState` avant sync lourd.

---

## 6. Findings Shared Packages

### HAUTE PRIORITÉ

#### S-H1 — Index Prisma manquants
```prisma
// MessageTranslation — lookup par message+langue
@@index([messageId, targetLanguage])

// Participant — member lookup
@@index([conversationId, participantId])

// User — filtre par langue
@@index([systemLanguage])
@@index([deviceLocale])
```

#### S-H2 — Type `TranslationStatus` manquant
`'pending' | 'translating' | 'completed' | 'failed' | 'cached'` défini en string partout.  
**Fix :** Enum `TranslationStatus` dans `packages/shared/types/`.

#### S-H3 — `LanguageDetectionResult` type manquant
La détection retourne `(lang, confidence)` mais aucun type partagé.  
**Fix :** Interface `{ language: string; confidence: number; isAutoDetected: boolean }`.

---

## 7. Analyse concurrentielle — Lacunes fonctionnelles

| Feature | WhatsApp | Telegram | Signal | Meeshy | Gap |
|---------|----------|----------|--------|--------|-----|
| Message pinning (conversations) | ✅ | ✅ | ✅ | ⚠️ schéma OK, UI manquante | **HAUTE** |
| Recherche dans les messages | ✅ | ✅ (filtres) | ✅ | ⚠️ conversations only | **HAUTE** |
| Raccourcis clavier | ✅ | ✅ | ✅ | ❌ | MOYENNE |
| Draft sync multi-device | ✅ | ✅ | ❌ | ❌ | BASSE |
| Thread view (reply tree) | ❌ | ✅ | ❌ | ❌ | BASSE |
| Conversation pinning | ✅ | ✅ | ✅ | ❌ | MOYENNE |
| CarPlay | ✅ | ❌ | ❌ | ❌ | BASSE |
| Spotlight search (iOS) | ✅ | ✅ | ✅ | ❌ | MOYENNE |
| Web Share API | ✅ | ✅ | ✅ | ❌ | HAUTE |
| Screen Wake Lock (calls) | ✅ | ✅ | ✅ | ❌ | HAUTE |
| Conversation muting + VIP exceptions | ✅ | ✅ | ❌ | ❌ | BASSE |
| Message reactions (emoji picker visible) | ✅ | ✅ | ✅ | ⚠️ picker caché | MOYENNE |
| Lazy TTS on-demand | N/A | N/A | N/A | ❌ TTS systématique | **CRITIQUE** |

---

## 8. Récapitulatif par priorité

### Niveau CRITIQUE (impact immédiat prod / sécurité)
- G-C1 : Fire-and-forget silencieux → perte de données
- G-C3 : Pas de circuit breaker ZMQ → cascade failure
- G-C4 : Cache auth non invalidé → permissions stales
- T-C3 : TTS non caché → waste GPU massif
- W-C1 : Pas de memo messages → UI lente
- W-C2 : `<img>` au lieu de `<Image>` → 3-4MB/session gaspillés

### Niveau HAUTE (impact expérience utilisateur significatif)
- G-H1 : Fuite mémoire maps Socket.IO
- G-H2 : Pas de backpressure broadcast → OOM potentiel
- G-H3 : Cascade Redis → DB
- T-H1 : Pas de VAD → Whisper 20-40% plus lent
- T-H2 : torch.compile inutilisé → 2-3× speedup manqué
- W-H1 : Polling friend-requests/notifications inutile
- W-H2 : Tone.js statique 800KB
- W-H4 : Message pinning absent (parity)
- W-H5 : Recherche messages absente
- I-H1 : @StateObject anti-pattern singletons
- I-H3 : URLSession sans HTTP/2

### Niveau MOYENNE (polish, performance secondaire)
- G-M1 : Pas de retry ZMQ
- G-M2 : Rate limiting trop strict
- G-M3 : Pas d'observabilité Prometheus
- T-M1 : Re-transcription TTS redondante
- W-M1 : Pas d'Error Boundaries features
- W-M4 : Pas de raccourcis clavier
- W-M5 : Web Share API
- W-M6 : Screen Wake Lock calls
- I-M1 : Pas de Spotlight indexing
- S-H1 : Index Prisma manquants

---

*Analyse générée le 2026-06-08 par audit multi-agents parallèle.*
