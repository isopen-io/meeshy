# Meeshy Android — Feature Parity Tracker

Master checklist for the **native Android rebuild** of the Meeshy iOS app
(`apps/ios` + `packages/MeeshySDK`, 673 Swift production files / ~185 700 LOC).

This file is the **anti-omission mechanism**: nothing ships as "done" until its
box is checked here **and** verified. It is rebuilt from the integral
file-by-file audit — every one of the 673 iOS files was read in full.

## Source of truth

- `tasks/audit/part-01.md` … `part-23.md` — integral file-by-file audit
  (purpose, public API, behaviours, dependencies, Android-port note per file).
- `ARCHITECTURE.md` — the target Android architecture (modules, layers, SWR,
  offline, performance, design system, security).
- `decisions.md` — architectural decision records.
- The old `inventory-screens.md` / `inventory-sdk.md` / `inventory-crosscutting.md`
  were the pre-full-read drafts; the `audit/` folder supersedes them.

## Tech mapping (iOS → Android)

| iOS | Android |
|-----|---------|
| SwiftUI | Jetpack Compose (Material 3) |
| MVVM + `@Published` / `ObservableObject` | `ViewModel` + `StateFlow<UiState>` (UDF) |
| MeeshySDK / MeeshyUI dual target | `:sdk-core` / `:sdk-ui` modules (`explicitApi()`) |
| App screens | `:feature:*` modules |
| Combine `PassthroughSubject` | Kotlin `SharedFlow` |
| `async/await`, `Task`, actors | Coroutines, `Flow`, dispatcher-confined classes |
| URLSession / app-layer `APIClient` | Retrofit + OkHttp (one client) |
| Socket.IO Swift (×2, long-polling) | `socket.io-client-java` (×2, long-polling) |
| GRDB + `CacheCoordinator` (dual store) | **single** Room DB (source of truth) |
| `CacheResult` / `CacheFirstLoader` | `CacheResult` sealed class + `cacheFirstFlow {}` |
| `OfflineQueue` / `OutboxFlusher` / `OutboxDispatcher` | Room `outbox` table + `WorkManager` |
| Keychain (per-user) | Android Keystore + `EncryptedSharedPreferences` |
| WhisperKit (on-device ASR) | translator service ASR (on-device later, optional) |
| WebRTC iOS + CallKit + PushKit | `stream-webrtc-android` + Telecom/`ConnectionService` + FCM data |
| AVFoundation / CoreImage / Metal / CALayer | Media3 (`Transformer`/`ExoPlayer`) + Compose Canvas + `RenderEffect` |
| PencilKit | custom point/stroke ink model (cross-platform JSON) |
| Firebase iOS | Firebase Android (FCM, Crashlytics, Performance) |
| `iPadRootView` two-column | `NavigableListDetailPaneScaffold` (WindowSizeClass) |

## Verification gates (no emulator in this environment)

- SDK bootstrap (fresh container): download `commandlinetools-linux`, then
  `sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"`
  into `$HOME/android-sdk` and write `sdk.dir` to `local.properties`.
- Compile gate: `./meeshy.sh build`
- JVM unit tests: `./meeshy.sh test` — ViewModels, repositories, SWR, state
  machines, pure logic (TDD: red → green → refactor).
- Charte graphique fidelity: Roborazzi screenshot tests (render Compose on JVM).
- Live integration vs gateway: `atabeth` test account.

---

## Phase 0 — Project setup `[done]`
- [x] Android SDK, Gradle multi-module (`:app`, `:sdk-core`, `:sdk-ui`), version catalog
- [x] Gradle wrapper, AGP, Kotlin 2.x, Compose, `meeshy.sh` build helper
- [x] App compiles to a debug APK
- [x] `minSdk 26`, `targetSdk 35`

## Phase 1 — Integral audit `[done]`
- [x] Full read of all 673 iOS files → `tasks/audit/part-01..23.md`
- [x] 696 portable capabilities catalogued (this file)
- [x] Architecture observations consolidated → `ARCHITECTURE.md`, `decisions.md`

## Phase 2 — Module + architecture setup `[next]`
- [x] `ARCHITECTURE.md` reviewed by a SOTA peer audit (`tasks/architecture-review.md`)
- [x] Module graph: `:core:{common,model,network,database,datastore,crypto,navigation}`,
      `:sdk-core`, `:sdk-ui`, `:feature:{auth,conversations}`, `:app` — build + tests green
- [x] Hilt DI graph (replaces manual `AppContainer`); `NetworkModule`, `DispatchersModule`
- [ ] `build-logic/` convention plugins + enforced dependency rules
- [ ] Remaining `:feature:*` modules created with their slices (Phase 5)
- [ ] Dispatcher injection wired into ViewModels; `Result`/error model
- [ ] Type-safe Navigation-Compose graph + `NavigableListDetailPaneScaffold`
- [ ] Observability bootstrap (Crashlytics, ANR, structured logging w/ redaction,
      remote config / feature flags) — ADR-022
- [ ] CI/CD bootstrap (lint/detekt, screenshot gate, macrobenchmark, baseline
      profile generation, Play tracks) — ADR-023

## Phase 3 — SDK foundation (`:sdk-core`)
- [x] Models: full iOS-model port — 31 `@Serializable` files (auth, conversation,
      message, community, feed, post, story, notification, friend, location,
      voice, presence, stats, links, transcription, preferences, participants…)
- [x] `LanguageResolver` — Prisme Linguistique resolution
- [x] `DynamicColorGenerator` — accent color (blend + hue shift + DJB2 palette)
- [x] Networking: `MeeshyConfig`, `EncryptedTokenStore`, `AuthInterceptor`, `apiCall`, Retrofit
- [x] Repositories: `AuthRepository`, `ConversationRepository`, `MessageRepository`
- [x] **SWR engine**: `CacheResult` (4-state incl. `Syncing`) + `CachePolicy` +
      `cacheFirstFlow {}` + `SwrCacheSource` — TDD, 5 tests green
- [x] **SWR backing**: Room DB + `sync_meta` + `ConversationCacheSource` /
      `StoryCacheSource` — conversation list **and** stories tray are genuinely
      cache-first (skeleton only on cold `Empty`)
- [x] **Outbox model**: `outbox` table + DAO, lanes, `OutboxCoalescer`
      (send+delete / edit-merge / reaction-toggle), device-scoped `cmid`/`cid`
- [x] **Outbox runtime**: `OutboxRepository` (enqueue+coalesce, boot recovery,
      outcome `SharedFlow`, ×5 limit) + `OutboxDrainer` (FIFO lane drain,
      `MutationSender`, transient/permanent classification)
- [x] `WorkManager` flush worker (Hilt-injected, network-constrained, exponential
      backoff, per-lane drain) scheduled on enqueue + FCM push
- [x] **Outbox dependency-gating** (`outbox-dependency-gating`): the drainer now
      honours the persisted `dependsOn` cmid via the pure `OutboxDependencies`
      verdict — a dependent **holds the lane** while its (cross-lane) prerequisite
      is `PENDING`/`INFLIGHT`, runs once it has succeeded (row gone), and is
      **cascade-exhausted** if the prerequisite gives up. The durable upload→publish
      chain primitive (added a `MEDIA` lane + `OutboxRepository.stateOf`).
- [x] **Outbox produced-id write-back** (`outbox-produced-id-writeback`): the second
      half of the chain. A prerequisite that delivers a `SendResult.SuccessWithId(realId)`
      grafts that id into every still-queued dependent's payload (placeholder = the
      prerequisite's own `cmid`) **before** the row is deleted, via the pure
      `PublishMediaWriteBack.graft` (decode→swap→`distinct`→re-encode, inert/`null`
      when undecodable/no-media/absent/identity) and the generic
      `OutboxRepository.rewriteDependents` (PENDING dependents only). So a media story
      queued **offline before its upload finished** publishes with the correct id.
      (Producer half landed in `media-upload-sender` — see below.)
- [x] **Durable media-blob store** (`media-blob-store`): the first brick of the producer
      half. The outbox payload is a `String`, so the raw bytes of a queued media upload
      live in a dedicated `MediaBlobEntity`/`MediaBlobDao` (Room, DB v5→v6) keyed by the
      upload row's `cmid`, fronted by the `MediaBlobStore` building block
      (`put`/`get`/`remove`, reusing `MediaUploadItem` as the single bytes shape). Lets a
      media attachment be enqueued **fully offline**, bytes surviving process death.
- [x] **Durable media-upload sender** (`media-upload-sender`): the rest of the producer
      half at the SDK layer. `OutboxKind.UPLOAD_MEDIA` + the pure `MediaUploadSender`
      (`send(item, upload)` → blob gone/empty → permanent, offline → transient, real id →
      `SuccessWithId`) + the `MediaUploadQueue.enqueue(item)` building block (writes the
      bytes then queues an `UPLOAD_MEDIA` row on the `MEDIA` lane, blob + row sharing one
      `cmid`) + the `OutboxFlushWorker` wiring (a `MEDIA`-lane sender drained **before**
      `STORY`, blob removed on delivery and on exhaustion). The durable offline
      upload→publish chain now works end-to-end at the SDK layer.
      (Composer wiring landed in `story-composer-offline-media` — see below.)
- [x] **Composer offline-media fallback** (`story-composer-offline-media`): the composer
      now reaches the durable chain from the UI. When a synchronous upload fails
      transiently (offline / 429 / 5xx — the pure app-side `MediaUploadRetryPolicy`), a
      **single** picked media is `MediaUploadQueue.enqueue`d + staged as a single
      `PendingMediaUpload` placeholder (its `cmid` rides in `draft.mediaIds`, counts toward
      the ≤10 cap, renders an "Offline" preview tile); `publish()` gates the story on it via
      the new `StoryRepository.enqueuePublish(request, dependsOn)`. Permanent failure / multi
      pick / second-while-pending surfaced the error at the time (single-pending kept the
      single-`dependsOn` chain correct). **Superseded** by `story-composer-multi-pending` (see below),
      which lifts the single-pending restriction: batches and second picks now stage too.
- [x] **Remove-pending cancels the durable upload** (`media-upload-cancel`): removing the
      offline placeholder now `MediaUploadQueue.cancel`s its `UPLOAD_MEDIA` row + blob (drops the
      outbox row first, then the bytes — unknown cmid inert), so no orphaned upload streams bytes
      to a media the story never references. UI clears optimistically; the durable cancel is
      best-effort (a stranded row otherwise exhausts harmlessly). Closes the orphan-leak gap left
      by `story-composer-offline-media`.
- [x] **Flush retries on a blocked dependency** (`outbox-flush-retry-on-blocked`): the
      `OutboxFlushWorker` previously rescheduled (WorkManager `Result.retry()`) only on a
      **transient** failure, ignoring a lane stopped on a **blocked dependency**. A dependent
      `BLOCKED` early in a pass whose prerequisite delivered *later in the same pass* therefore
      sat until an unrelated trigger fired. A pure `OutboxFlushPlan.outcome(reports)` building
      block now drives the outcome — `RETRY` on **any** transient-or-blocked stop — so the held
      lane is auto-retried; forward progress is guaranteed (a dependent is delivered, or
      cascade-exhausted once its prerequisite gives up). Closes the cross-pass `BLOCKED`-not-
      `anyTransient` retry gap.
- [x] **Multi-dependency outbox gate** (`outbox-multi-dependency`): the `dependsOn` gate now
      expresses a **set** of prerequisites, not one. A new pure `OutboxDependencyKey`
      (`encode`/`decode`/`likePattern`) round-trips the set through the single `dependsOn` column
      (wrapped-delimited `"|a|b|"`; `decode` tolerant of a bare legacy value; membership `LIKE` with
      `_`-escaping), `OutboxMutation.dependsOn` is a `Set<String>`, and `OutboxDependencies.verdictAll`
      gates a dependent on **all** prerequisites (any `EXHAUSTED` ⇒ cascade-exhaust; else any
      still-queued ⇒ hold). The drainer decodes + gates via `verdictAll`, `findDependents` is a
      membership query (a delivered producer grafts its id into a dependent waiting on several
      uploads), and `StoryRepository.enqueuePublish` takes a `List<String>`. The provably-correct SDK
      half of multi-pending offline uploads; the composer adopts the list contract but keeps the
      single-pending UI (the multi-pending UX is the next slice). No schema/migration change.
- [x] **Multi-pending offline uploads — composer UX** (`story-composer-multi-pending`):
      `StoryComposerUiState.pendingUpload?` → `pendingUploads: List<PendingMediaUpload>`; every
      transient-failed pick (and each item of an offline batch) is durably queued + appended, the
      single-pending guard dropped. `publish(dependsOn = pendingUploads.map { cmid })` gates the story
      on **all** placeholders; per-tile remove cancels only that durable row (others untouched);
      `queueDurably` stages one-at-a-time so a mid-batch enqueue failure keeps already-staged items;
      the preview renders N "Offline" tiles. Closes the durable offline upload→publish chain
      end-to-end from the UI. Surpasses iOS, which drops a pick on an offline upload.
- [ ] TUS resumable uploads in a **dedicated `WorkManager` chain** (foreground
      progress); message-send items `dependsOn` the upload (gating now in place)
- [x] `MessageStateMachine` (pure, monotonic 8-state delivery FSM) — 9 tests
- [x] `cmid`↔serverId reconciliation: optimistic Room row (`sendState`
      SENDING/FAILED) swapped atomically on REST ACK, plus `clientMessageId`
      echo-matching during list sync; FAILED bubbles retry via outbox revive
- [ ] **Message ordering**: per-conversation `seq` sort key + continuity gap
      detection + server-time offset (ADR-021)
- [ ] Transport spike: WebSocket vs long-polling on Android (ADR-015) →
      Socket.IO wrappers ×2 exposing sealed-class `SharedFlow`s
- [ ] Foreground-socket / background-FCM delivery doctrine
- [ ] `ConversationSyncEngine` — cache-first sync, atomic merge, `seq` gap-fill, bounded fan-out
- [ ] Dual `kotlinx.serialization` config (lenient DTOs / strict crypto+auth)
- [ ] FCM push (notify-then-fetch) + `NotificationCoordinator` authority model
- [ ] **E2EE** — gated behind ADR-018..020: threat model, libsignal pairwise +
      Sender Keys groups, multi-device, fail-closed, call media (DTLS-SRTP + SFrame)
- [ ] SQLCipher-encrypted Room + per-user namespacing + provably complete logout wipe
- [~] REST services: 13/37 ported as API + repository (auth, conversation,
      message, reaction, post, user, friend, notification, community, story,
      translation); ~24 remaining (attachment, block, account, session, stats,
      location, voice profile, etc.) — see `audit/part-17.md`

## Phase 4 — Design system (`:sdk-ui`) — **CHARTE GRAPHIQUE (locked, see ARCHITECTURE.md §Design System)**
- [x] `MeeshyPalette` Indigo scale + semantic colors
- [x] `MeeshyThemeTokens` light/dark + `MeeshyTheme`
- [ ] Typography + spacing + shape + motion tokens
- [~] Conversation `accentColor` Compose integration — `accentHex()`/`displayTitle()`
      in `:sdk-core` theme, list avatars + chat header dot + outgoing bubbles +
      pagination spinner tinted; full palette (secondary/accent) propagation pending
- [~] Reusable primitives: `MeeshyAvatar`, `BrandLogo`, `MeeshyPrimaryButton`,
      `MeeshySkeletonBox` done (Login + Conversations screens de-duplicated);
      identity bar, fields, toasts, swipeable rows, tag input, pickers,
      progressive image (Coil + ThumbHash) pending
- [~] Message Bubble: `BubbleContent` (`@Immutable`) + pure `BubbleContentBuilder`
      (Prisme-aware) + `MessageBubble` done; reactions/attachments/reply-preview/
      audio variants pending
- [ ] Roborazzi fidelity baseline for every primitive (light + dark)

## Phase 5 — Feature slices (`:feature:*`)
See the per-domain catalogue below. Build order: Auth → Conversations → Chat →
Feed → Stories → Calls → the rest.

Wired so far (login → conversations → chat, all on the SWR + Hilt foundation):
- [x] `:feature:auth` — login screen + `AuthViewModel`
- [x] `:feature:conversations` — cache-first conversation list, tap-through
- [x] `:feature:chat` — cache-first message list + `MessageBubble` + composer
- [x] Outbox-backed optimistic send: instant SENDING bubble, server-ACK swap,
      FAILED + tap-to-retry (EN/FR), WorkManager flush
- [x] Message pagination (before-cursor, scroll-top trigger, history-safe cache prune)
- [~] `:feature:feed` — cache-first feed (SWR), Prisme-resolved post content,
      optimistic like toggle (`isLikedByMe`), image collage, like/comment/repost stats,
      cursor-paginated infinite scroll (`PostRepository.loadMore` + `feedHasMore`,
      `loadMoreIfNeeded` 5-from-tail trigger, footer spinner, dedupe-append, history-safe
      freshness watermark — port of `FeedViewModel.loadMoreIfNeeded`)
- [ ] Pending: Stories / Calls slices, feed new-posts banner + post detail, reactions UI polish
      optimistic like toggle (`isLikedByMe`), image collage, like/comment/repost stats
- [~] `:feature:stories` — story **tray** end-to-end : `toStoryGroups` (sdk-core,
      port fidèle = filtre STORY, groupe par auteur, tri stories asc, tri groupes
      moi→non-vus→récent desc) + `hasUnviewed`/`latestStory`/`isExpired` (fallback
      21h)/`isFullyExpired` ; `StoryTrayBuilder` (self vs others, filtre groupes
      expirés, URL avatar résolue) ; `StoriesViewModel` ; `StoryTray` carrousel
      d'anneaux (anneau dégradé accent si non-vu, gris sinon, badge + sur sa story) ;
      **viewer minimal** `StoryViewerScreen` (barres de progression segmentées,
      tap-avance/recule/ferme, auto-advance 5s, texte Prisme, média de fond, mark
      viewed) câblé via route `story/{userId}` (+ deep link `meeshy://story/...`).
      **Tray SWR/Room backing** : `StoryEntity`/`StoryDao` (DB v5) + `StoryCacheSource`
      (port du pattern `ConversationCacheSource`) + `StoryRepository.storiesStream`
      → tray genuinely cache-first (peint depuis Room au démarrage chaud, skeleton
      cold-only sur cache `Empty`/`Syncing` sans données) via la pure `StoryTrayReducer`.
      **Comments overlay** : `StoryComment` (domaine + mapper Prisme) + `StoryRepository
      .comments` + pure `StoryCommentsReducer` (merge serveur dedupe/oldest-first +
      posting optimiste → ACK swap → Failed/retry + `received` socket dedupe) +
      `StoryCommentsViewModel` (Instant-App + optimiste + realtime `comment:added`) +
      `StoryCommentsSheet` (input accent, pending dimmé, tap-to-retry) câblé au viewer.
      Pending : count-dots, composer/publish, reactions UI polish, prefetch média.
- [ ] Pending: Stories composer + viewer richness, Calls slice, feed pagination +
      post detail, reactions UI polish
- [ ] Pending: Stories / Calls slices, feed pagination + post detail
- [x] Reactions UI: usage-ordered quick-strip (`EmojiQuickStrip`) + full categorised picker
      (`EmojiFullPicker`) wired into chat long-press sheet

## Phase 6 — Integration & final audit
- [ ] Navigation graph + deep links (`meeshy://`, `https://meeshy.me`)
- [ ] Adaptive tablet/foldable layouts verified (list-detail two-pane)
- [ ] Live integration test vs gateway (`atabeth`)
- [ ] Final diff audit: this checklist vs shipped Android — zero unchecked gaps

---

# Feature catalogue (696 capabilities, by domain)

> Each box maps to one or more entries in `tasks/audit/part-*.md`. Check a box
> only when the feature is implemented **and** verified.

## A. Auth & Onboarding
- [ ] Username/password login with saved-account picker (multi-account, one-tap switch)
- [ ] Server environment selector (dev/staging/prod/custom host)
- [ ] Passwordless magic-link login (email + countdown + resend) via deep link
- [ ] 8-step gamified registration wizard (username/email/phone live availability + suggestions)
- [ ] Interactive step progress bar with jump-back to completed steps
- [ ] Phone entry with searchable country-code picker (skippable)
- [ ] First/last name capture; password strength meter + requirements checklist
- [ ] System + regional language selection with live translation preview
- [ ] Profile photo / banner / bio optional step; registration recap + terms acceptance
- [ ] Email verification by 6-digit code (OTP autofill, resend, success animation)
- [ ] Country auto-detection + region→language inference at signup
- [ ] Password recovery via email link
- [ ] Password recovery via phone (lookup → masked-info challenge → SMS code → reset)
- [ ] First-run onboarding carousel with live feature demo + animated step backgrounds
- [ ] Persistent session restore with proactive token refresh
- [ ] Transparent token refresh on 401 with one retry
- [ ] Anonymous (shared-link) sessions with restricted send permissions
- [ ] Login/logout teardown wiping E2EE keys and per-user caches
- [ ] Splash screen with brand animation + minimum display duration

## B. Conversations list
- [~] Cache-first instant load done ; pull-to-refresh done (`PullToRefreshBox`,
      spinner gated sur le geste utilisateur — les revalidations SWR de fond
      restent silencieuses) ; cursor-based infinite scroll / branding pending
- [~] Sectioned list with collapsible user categories + pinned section + drag-to-category —
      **pinned section done** (slice `conversations-section-model`, 2026-07-08): the pinned/others
      split, previously scattered `filter`/`filterNot` glue inside `ConversationListScreen`, is now
      the pure `:feature:conversations` `ConversationSections.of(conversations)` SSOT
      (Pinned first → All), each `ConversationSection` preserving the incoming (draft/filter) order.
      An **empty section is omitted**, so an all-pinned account no longer shows a phantom empty
      "Mes conversations" header. Rendered via the existing `CollapsibleSection` (collapse state is
      its own saved UI state). +9 tests. **Reste**: collapsible *user categories* (needs category
      metadata) + drag-to-category.
- [x] Filtering (all/unread/personal/private/open/global/channels/favorites/archived) + search overlay
      — `ConversationFilter` enum (couleurs iOS) + `ConversationFilters.apply` pur
      (port fidèle de `filterConversations` : soft-delete masqué partout, archivés
      masqués sauf onglet Archives, recherche insensible à la casse sur titre /
      nom personnalisé / participants) ; barre de chips `LazyRow` + champ de
      recherche dans l'app bar ; 22 tests verts (11 modèle + 11 VM)
- [ ] Communities carousel + category filter chips
- [~] Pinned / muted / archived states done (optimistic toggle + row indicators
      📌/🔕 + filter integration) ; locked / favorited (emoji) pending
- [~] Swipe actions done (leading = pin/unpin, trailing = archive/unarchive ;
      `SwipeToDismissBox` non-destructif qui snap-back, le résultat visible est
      la re-dérivation du filtre) ; mute/lock/mark-unread/block/hide pending
- [~] Context menu done (long-press → `DropdownMenu` : pin/unpin, mute/unmute,
      mark-read si non lu, archive/unarchive) ; details/invite/favorite/move/
      lock/block/delete pending
- [ ] Hard-press conversation preview popover
- [~] Conversation row: rich last-message preview done (labels type média
      📷/🎬/🎵/📎/📍 port iOS, caption prioritaire, préfixe expéditeur en groupe,
      « Vous » pour soi) + unread badge + **draft preview** done (slice
      `conversations-draft-aware-ordering`, 2026-07-07 : `draftPreview` accent-teinté
      « Brouillon : … » prime sur le last-message quand un brouillon utile existe ;
      reply-only → préfixe + « … ») ; **discard-draft** done (slice
      `conversations-draft-discard`, 2026-07-08 : action contextuelle « Supprimer le
      brouillon » offerte seulement sur une ligne portant un brouillon *utile* — pure
      `DraftDiscard.isDiscardable`/`afterDiscard` `:feature:conversations` + effacement
      optimiste `ConversationListViewModel.discardDraft` (retrait immédiat de l'état,
      `draftStore.clear`, rollback si échec) ; la ligne perd son aperçu et redescend
      sous le groupe flottant) ; ephemeral/expired/hidden/view-once/
      typing, activity-heat, tags, presence/story-ring/mood pending
- [◐] Draft-aware ordering (drafts float to top); bump-to-top on send/receive —
      **drafts-float-to-top done** (slice `conversations-draft-aware-ordering`,
      2026-07-07) : pure `:feature:conversations` `DraftAwareOrdering.apply(convos,
      draftsById)` fait flotter en tête toute conversation portant un brouillon
      *utile* (`ConversationDraft.isMeaningful` SSOT `:core:model` — texte non vide
      **ou** reply armé), triées par `updatedAt` desc (null en dernier du groupe,
      tri stable) ; le reste garde son ordre en dessous. `ConversationDraftStore`
      gagne `observeAll()` (`:sdk-core`, InMemory StateFlow + DataStore préfixe-scan,
      entrée corrompue omise) ; `ConversationListViewModel` collecte les brouillons
      et les applique dans `withVisible` après le filtre. La split épinglés-en-tête
      de l'écran reste au-dessus (Épingles > brouillons > reste). +23 tests.
      **Reste** : bump-to-top on send/receive (déjà couvert par refresh backend).
- [x] Cold-start skeletons + error-with-retry empty state — the skeleton + error+retry
      renders existed but the *decision* lived as an untestable scattered `when` inside
      `ConversationListScreen` (with a redundant `conversations.isEmpty() &&` guard). Slice
      `conversations-empty-state-content` (2026-07-08) lifts it into the pure
      `:feature:conversations` `ConversationListContent.of(state)` SSOT (sealed
      Populated | Skeleton | Error(message) | FilteredEmpty | ColdEmpty). Cache-first
      (ARCHITECTURE.md §4): a populated list wins over a stale skeleton flag **or** a
      background sync error, so on-screen data is never hidden; only an empty list falls
      through to skeleton → error(+retry) → filtered-empty → cold-empty in precedence
      order. The screen renders straight from the reducer. +11 tests
      (`ConversationListContentTest`, every branch + the two cache-first overrides + the
      skeleton-over-error / error-over-filter precedence + blank-search-is-cold boundary).
      **Card upgrade** (slice `conversations-cold-start-error-card`, 2026-07-08): the three
      empty arms (Error / FilteredEmpty / ColdEmpty) rendered as a bare secondary label +
      plain retry button; iOS shows an iconified card (glyph + title + subtitle + Réessayer).
      New pure `:feature:conversations` `EmptyStateVisual.of(content)` SSOT maps each non-list
      arm → `{glyph, title, subtitle, cta?}` (enum-keyed copy so the choice is JVM-testable,
      free of `R` ids; the server error travels as a trimmed `Literal`, blank/empty → generic
      `Resource(ErrorSubtitle)`, still retryable; Populated/Skeleton → null). Rendered on a
      `MeeshyGlassSurface` card — error glyph tints `MeeshyPalette.Error`, the others accent
      Indigo — with the retry wired to `refresh`. +8 tests (`EmptyStateVisualTest`: error
      literal / trim / blank-fallback / empty-fallback / filtered / cold / populated-null /
      skeleton-null).
- [x] Connection-health banner — `SocketManager.connectionState` (StateFlow
      DISCONNECTED/CONNECTING/CONNECTED) → mapping pur `bannerFor` (la reconnexion
      prime sur le sync) → strip animée sous l'app bar (Hors ligne / Reconnexion… /
      Synchronisation…)
- [x] Real-time conversation removal + star hygiene (slice `conversations-purge-on-removed`,
      2026-07-09): the `MessageSocketManager.conversationDeleted` / `participantLeft` streams
      existed but had **zero consumers** — a conversation deleted for everyone, or left by the
      current user, lingered in the Android list until some other refresh trigger, and its
      bookmarked messages dangled forever. Now the pure `:feature:conversations` `ConversationPurge`
      SSOT decides which removal an event owns: `onConversationDeleted` → the id (blank id inert);
      `onParticipantLeft(event, currentUserId)` → the id **only when the current user is the leaver**
      (another participant, an unknown/blank current user, or a blank id is inert — a departing
      third party never drops my row). `ConversationListViewModel` collects both streams and
      `purge()`s: `StarredMessagesStore.removeConversation` runs first and synchronously (local-only,
      so a bookmark can never outlive its conversation even if the follow-up fails) then
      `repository.refresh()` drops the vanished row; a failed background refresh stays silent (SWR
      keeps the last good cache), cancellation rethrown. +12 tests (7 `ConversationPurgeTest`:
      deleted-id / blank-delete-inert / self-left / other-left-inert / null-user-inert /
      blank-user-inert / self-left-blank-conv-inert; 5 VM: deleted-sheds-stars+refresh /
      blank-delete-touches-nothing / self-left-sheds+refresh / other-left-untouched /
      cleanup-survives-failing-refresh-silently).
- [ ] Conversation category create + expand/collapse; client-side tag aggregation for autocomplete
- [x] Create direct/group conversation via user search; add participants —
      FAB sur la liste → `NewConversationScreen` : recherche debouncée (300 ms,
      `UserRepository.searchUsers`), multi-sélection avec chips persistants
      (survit aux changements de requête), règle pure `NewConversationLogic`
      (1 sélection → direct sans titre ; ≥2 → groupe avec titre saisi) →
      `ConversationRepository.create` → navigation vers le chat créé
      (popUpTo conversations). 14 tests verts (6 logique + 8 VM)
- [ ] Story tray + per-conversation story rings
- [ ] In-app dashboard ("Tableau de bord"): unread count, recent conversations, link stats, quick actions

## C. Chat / Messaging
- [x] Real-time 1:1 / group chat: send, edit, delete (for-me / for-everyone, 2h window), reply, forward
      **Edit 2-hour window now enforced** via pure `:core:model` `MessageEditability.canEdit(isOwn,
      createdAtMillis, nowMillis, windowMillis=2h)` SSOT (port of iOS's `Date().timeIntervalSince(createdAt)
      < 2h` gate): an own message is editable only while <2h elapsed; a future-dated createdAt (clock skew)
      is treated as just-created (still editable); an unknown createdAt cannot be windowed → stays editable
      (refusing to edit merely because the wire omitted a timestamp is a worse gap). `ChatViewModel` injects
      `CacheClock` and gates `startEdit` (own + within window); `ChatScreen` hides the Edit sheet action once
      the window has passed (Delete stays available) (slice `chat-edit-time-window`, 2026-07-07, +13 tests).
      **Delete for-me vs for-everyone split now shipped** (slice `chat-delete-for-me-vs-everyone`, 2026-07-07,
      +23 tests): pure `:core:model` `MessageDeletability.canDeleteForEveryone(isOwn, createdAtMillis, nowMillis,
      windowMillis=2h)` SSOT (port of iOS `ConversationCommandHandler.canDeleteForEveryone`, **inclusive `<=`**
      window unlike the exclusive edit window) + pure `:sdk-core` `LocallyHiddenMessages` value object
      (`hide`/`isHidden`/`visible`, idempotent, same-instance-on-no-op) backed by the durable
      `SharedPrefsLocallyHiddenMessagesStore` (port of iOS `LocallyHiddenMessagesStore` UserDefaults set).
      `ChatViewModel.deleteForEveryone` keeps the server round-trip; `deleteForMe` hides locally (no network),
      the hidden set threads into the message-stream combine so the bubble disappears at once; `ChatScreen`
      offers "Delete for everyone" (own + within window) and "Delete for me" (any delivered message).
      **Forward now shipped** (slice `chat-forward-message`, 2026-07-08, +21 tests): pure `:feature:chat`
      `ForwardTargets.of(conversations, sourceConversationId, query, currentUserId) → List<ForwardTarget>`
      SSOT (port of iOS `ForwardPickerSheet.filteredConversations`: source excluded, blank query keeps all,
      non-blank query trimmed + matched case-insensitively against the resolved `displayTitle`, order
      preserved, deterministic `accentHex` + blank-avatar→null projection). `SendMessageRequest`/`ApiMessage`
      gained nullable `forwardedFromId`/`forwardedFromConversationId` (`:core:model`, no DB migration —
      JSON payload); `MessageRepository.sendOptimistic` threads them (retry rebuilds from the cached refs so a
      forward survives an exhaust). `ChatViewModel.openForward`/`onForwardQueryChange`/`forwardTo`/`closeForward`
      drive a cache-first `ForwardPickerSheet` (long-press → "Forward" action): one in-flight forward at a
      time, per-target sent checkmark, only a server-acked source is forwardable (an unsent bubble is refused).
      EN/FR/ES/PT strings.
- [x] Optimistic send with in-place server-ACK upgrade (no flicker) + `clientMessageId` reconciliation
- [~] Date section headers done — `ChatListItem.DayHeader` interleavé +
      `MessageDayLabel` (port iOS : Aujourd'hui/Hier/Avant-hier, jour de semaine
      ≤6j, date complète + année si différente, label recalculé au rendu pour
      le passage de minuit) ; inverted list / joined banner / unread separator /
      E2EE disclaimer pending
- [~] Pagination of older messages — before-cursor done (`MessageRepository.loadOlder`,
      windowed prune keeps paginated history, scroll-top trigger + spinner); around-anchor pending
- [~] Reactions: quick-strip **usage-ordered** done (`EmojiUsageRanker.topEmojis` port of
      `EmojiUsageTracker`, `EmojiUsageStore` SharedPrefs backing, strip re-ranks on send) +
      full categorised picker done (`EmojiCatalog` 6 cats + `EmojiFullPicker` sheet) +
      add/remove optimistic done ; **reaction detail breakdown (who-reacted sheet) done**
      (slice `chat-reaction-who-reacted-sheet`, 2026-07-08): long-press a reaction chip opens a
      bottom sheet listing who reacted, driven by the pure `:feature:chat` `ReactionBreakdown.of(
      response, currentUserId)` SSOT — emoji tabs ordered by count desc (stable ties), a leading
      "All" tab when ≥2 emojis (reactor lists concatenated in tab order), the current user floated
      to the top of each list (once per emoji) and flagged "Vous", blank username→userId,
      blank avatar→null, dup reactors collapsed, truncated-reactor groups keep an honest count.
      `ReactionDetailsUiState` (loading/breakdown/selectedTab, inert out-of-range select). Wired:
      cache-first sheet (appears loading, fills from `fetchDetails`; failed fetch → empty non-loading),
      `MessageBubble` gains an `onReactionLongPress` combinedClickable. +24 tests. reaction-count is
      shown per tab
- [x] Pin/unpin message; starred/bookmarked messages list with navigate-to-conversation —
      **pinned banner done** (slice `chat-pinned-banner`, 2026-07-08): the wire carries `pinnedAt`/
      `pinnedBy` (`ApiMessage` + `BubbleContent.pinnedAtIso`, blank/deleted → null), the socket
      `message:pinned`/`message:unpinned` events (`MessagePinnedEvent`/`MessageUnpinnedEvent` +
      `MessageSocketManager` streams) refresh the open conversation so a pin from any client appears
      live, and the pure `:feature:chat` `PinnedMessages.of(messages) → PinnedBanner?` SSOT features the
      **newest** live pin (parsed `pinnedAtIso`; equal-instant/unparseable ties keep the earliest in
      list order), carries the total pinned `count` and a `PinnedSnippet` preview (trimmed text, else
      Image>File>Empty key). `ChatScreen` renders an accent-tinted, tappable `PinnedBannerStrip` above
      the list → `ChatViewModel.onPinnedBannerTap` scrolls to the newest pin (reuses `scrollToMessageId`).
      +28 tests. **Pin/unpin action done** (slice `chat-pin-toggle`, 2026-07-08): the pure `:core:model`
      `MessagePinToggle.resolve(isDeleted, pinnedAtIso) → PinAction` SSOT (Pin | Unpin | Unavailable; pinned =
      non-blank `pinnedAt`, same rule as the banner; not owner/window-gated — parity with the gateway which
      only checks conversation access — only a deleted tombstone is Unavailable) drives a long-press
      "Épingler"/"Retirer" sheet action → `ChatViewModel.togglePin` → `MessageRepository.setPinnedOptimistic`
      (flips the cached `pinnedAt` instantly so the banner reacts at once, refuses an unsent bubble) + a durable
      `PIN_MESSAGE`/`UNPIN_MESSAGE` outbox row on the shared `pin` lane (a pin+unpin of the same message
      annihilates, a repeat supersedes — reuses the block/unblock `terminalToggle` coalescer), a
      `MessageApi.pin`/`unpin` (PUT/DELETE) worker sender, and an `onExhausted` conversation refresh that
      reconciles a dead flip with server truth. +31 tests. **Pinned-messages list sheet done** (slice
      `chat-pinned-messages-sheet`, 2026-07-08): the pure `:feature:chat` `PinnedMessagesList.of(messages) →
      List<PinnedMessageRow>` SSOT lists every currently-pinned message newest-pin first (same pin predicate
      / snippet / sender projection as the banner — `PinnedMessages.of` now derives the banner from
      `list.first()` + `list.size`, so banner and sheet can never disagree; stable ties keep list order, an
      unparseable instant sinks to the end). `ChatUiState.pinnedMessages` + `isPinnedSheetOpen`;
      `ChatViewModel.openPinnedSheet` (inert when nothing pinned), `closePinnedSheet`, `onPinnedMessageTap`
      (scroll-to + close; an id not among the pins is inert). The banner grows a trailing affordance (shown
      only when count > 1) that opens a `ModalBottomSheet` list — each row taps to jump to that pin. +20
      tests. **Star/unstar action + persistence done** (slice `chat-star-toggle`, 2026-07-09): starring is
      **local-only** at exact iOS parity (the gateway has no message-star endpoint, mirrors iOS
      `StarredMessagesStore` which is UserDefaults-backed). Pure `:core:model` `StarredMessages` SSOT (a
      `List<StarredMessage>` snapshot set with `star`/`unstar`/`toggle`/`isStarred`/`removeConversation` +
      `sortedByStarredAtDesc`; every mutator returns the **same instance** when unchanged so the store skips
      redundant writes; blank-id star inert, idempotent star keeps the first snapshot). Durable `:sdk-core`
      `StarredMessagesStore` (SharedPrefs JSON list under one key, synchronous hydrated `StateFlow` so the
      bubble re-renders instantly — cache-first; corrupt blob → empty set). `ChatViewModel.toggleStar` snapshots
      the bubble (conversationId/name/accent, sender, text preview, `StarredAttachmentKind` image>file, clock
      `starredAtMillis`, `sentAtIso`) and delegates to the store (no network/outbox — mirrors `deleteForMe`);
      inert on a deleted/unknown bubble (only the sheet closes). The starred set is combined into the message
      stream so each `BubbleContent.isStarred` is set live; `MessageBubble` renders a subtle accent bookmark
      glyph in the meta row of a starred bubble; the long-press sheet gains a "Star"/"Unstar" row (filled vs
      outline bookmark) gated on an actionable bubble. EN/FR/ES/PT strings. +31 tests. **Starred-messages
      list screen done** (slice `chat-starred-messages-list`, 2026-07-09): a dedicated screen reachable from
      Settings (new "Chats" section → "Starred messages" row → `Routes.STARRED`) lists every bookmarked
      message **newest-star first**, ordering delegated to the pure `StarredMessages.sortedByStarredAtDesc`
      SSOT so the list and the bubble indicator can never disagree. The pure `:feature:chat`
      `StarredMessagesUiState.of(StarredMessages)` projects each snapshot into a row carrying the shared
      `PinnedSnippet` preview (reuses `messageSnippetOf`, so a media-only star reads Photo/Attachment
      identically to the pinned list). `StarredMessagesViewModel` is cache-first (initial value hydrated
      synchronously from the store, re-derives on every star change anywhere) and exposes `unstar` (delegates
      to the durable store, no network). Each row taps back into `Routes.chat(conversationId)` (the snapshot
      carries conversation id/name/accent so no re-fetch); the trailing star removes the bookmark in place;
      an empty set shows an iconified empty state. Accent-coherent avatar tint (snapshot accent → name-hash
      fallback). EN/FR/ES/PT strings. +12 tests. Chat §C complete.
- [~] Reply: long-press → Répondre, bannière composer (accent, annulable),
      replyToId optimiste + aperçu cité dans la bulle + **tap-aperçu → scroll vers l'original**
      (`ReplyJumpResolver`, inerte si original paginé hors écran) + **swipe-to-reply**
      (`SwipeToReply` : incoming→droite / own→gauche, rubber-band + seuil de commit + haptique,
      révèle un glyphe reply, commit → `startReply`) ; forward pending
- [x] Reply-count pills + reply thread overlay — **pills done** (slice `chat-reply-count-pills`,
      2026-07-08): pure `:feature:chat` `ReplyThreads.of(messages) → threadFor(id)` SSOT groups the
      loaded messages by their (trimmed, non-self, non-deleted) `replyToId` into
      `ReplyThread(parentId, count, firstReplyId=earliest live reply)`; a parent whose every reply is
      deleted/absent has no thread. `ChatScreen` renders an accent-tinted, bubble-side-aligned pill under
      any message with a thread; tapping it (`ChatViewModel.onReplyCountTap`) scrolls to the earliest
      reply (reuses `scrollToMessageId`; a no-reply message is inert). +16 tests. **Overlay done**
      (slice `chat-reply-thread-overlay`, 2026-07-09, +25 tests): **long-pressing** the reply-count pill
      (the tap still scrolls) opens a focused `ModalBottomSheet` via pure `:feature:chat`
      `ReplyThreadOverlay.of(parentId, messages) → ReplyThreadOverlayModel?` SSOT — the parent row plus
      every live reply quoting it, earliest-first. Reply membership is **identical to `ReplyThreads`**
      (not-deleted, trimmed `replyToId == parentId`, no self-reference) so the pill count and the overlay
      never disagree; a paged-out parent or a thread with no live reply yields `null` (inert open, no empty
      sheet). A deleted parent still heads the overlay with its live replies (mirrors `ReplyThreads`
      counting replies to a deleted parent). Snippet projection shared with the pinned banner/sheet via the
      new SSOT `messageSnippetOf(text, hasImage, hasFile) → PinnedSnippet`. `ChatUiState.replyThreadOverlay`
      derives live from the loaded messages (a new reply appears in an open overlay); a standing invariant
      auto-closes it when the thread drains while open. Tapping a reply row scrolls to it and closes
      (`onReplyThreadReplyTap`, unknown id inert). EN/FR/ES/PT strings.
- [~] Message bubbles: text done ; pièces jointes image (grille 1–4 + overlay « +N »,
      URL relative résolue contre l'origine gateway, `ApiMessage.attachments` persisté
      via le payload Room) + repli fichier générique (nom + taille) done ;
      emoji-only oversized done (`EmojiDetector` port iOS 90/60/45, free-floating
      sans bulle, dans la bulle centré si reply) ;
      carousel / audio / location / contact pending
- [◐] Rich text rendering (markdown, mentions, `m+` links, URLs, search highlight) — core done
      (`chat-rich-text-segments` 2026-07-06): pure `:core:model` `MessageTextParser` SSOT (port of iOS
      `MessageTextRenderer`) — one earliest-match-wins pass over markdown **bold**/*italic*/~~strike~~/
      `__underline__` (recursive nesting), `@username` (+ display-name resolution), `m+TOKEN`, `http(s)`
      URLs; plus `highlightRanges` (case-insensitive/non-overlapping), `extractUrls` (meeshy→mention→http),
      `resolvedLinkUrl` (tracked-link redirect). Rendered via `:sdk-ui` `RichMessageText` (`AnnotatedString`
      + `LinkAnnotation.Url`/`withLink` real taps, highlight over rendered plain text) wired into the bubble;
      `mentionDisplayNames`/`highlightTerm`/`trackedLinks` params ready for `ChatScreen` to feed. +34 tests.
      **Search-highlight half now wired** (`chat-search-highlight-wiring` 2026-07-06): `ChatViewModel` supplies
      the live `highlightTerm` end-to-end (see the in-conversation search row below). **Member-roster →
      `mentionDisplayNames` now wired** (`chat-mention-autocomplete` 2026-07-06): `ChatViewModel` builds the
      roster from the conversation participants via `MentionRoster` and threads `mentionDisplayNames` into every
      `MessageBubble`, so `@username` resolves to the display name in-bubble. **Pending:** in-app browser / OG cards.
- [~] Quoted-reply previews incl. story-reply previews (counts, thumbnails) —
      **media quoted-reply preview done** (slice `chat-reply-preview-media`, 2026-07-09): the wire now
      carries `attachments` on `ApiMessageReplyPreview` (matching iOS `APIMessageReplyTo.attachments`;
      the dead duplicate `ApiMessageReplyTo` was removed), and `BubbleContentBuilder` derives a
      `ReplyMediaKind` (None | Image | File — first image wins, else any attachment → File) plus a
      resolved `replyToThumbnailUrl` (image `thumbnailUrl` ?: `fileUrl`, run through the shared
      `resolveMediaUrl`; a deleted reply target suppresses both). `MessageBubble`'s reply-preview strip
      now shows a 32dp accent-clipped thumbnail when available, else a media icon + a localized
      "Photo"/"Attachment" placeholder when the quoted message is media-only (blank content). So a reply
      to a photo/file no longer renders a blank quote. EN/FR/ES/PT strings. +9 tests. **Pending:**
      story-reply previews (counts/thumbnails via `APIPostReplyTarget`).
- [~] Delivery status checkmarks + offline-pending hourglass + failed-message retry —
      ✓/✓✓/✓✓-read tier + Pending/Failed done ; **group all-or-nothing semantics done**
      (`chat-delivery-status-group-semantics` 2026-07-06): pure `:core:model` `DeliveryStatusResolver`
      (port of iOS `DeliveryStatusResolver`) — in a group the delivered/read tier lights up only once
      EVERY recipient has received/read (never on the first peer), trusting `readByAllAt`/`deliveredToAllAt`
      markers ahead of the counters ; `BubbleContentBuilder` consumes it with a reactive `recipientCount`
      (distinct other members) threaded from `ChatViewModel`. **Pending:** the finer 8-state
      send-lifecycle glyphs (clock/slow/invisible), offline hourglass, tap-checks → read-status sheet
- [~] Edited / pinned / forwarded indicators; edit-history viewer
      **Edited ✅** (`bubble_edited` badge), **pinned ✅** (`chat-pinned-banner`), **forwarded ✅**
      (slice `chat-forwarded-indicator`, 2026-07-08, +5 tests): `BubbleContent.isForwarded` derived in
      `BubbleContentBuilder` (`!isDeleted && !forwardedFromId.isNullOrBlank()` — a deleted tombstone
      shows no metadata, mirroring the `pinnedAtIso` suppress rule; a blank/whitespace id or a
      conversation-id-only forward is not flagged). `MessageBubble` renders a subtle top-of-bubble
      italic "Transféré/Forwarded" chip with the same accent-coherent forward glyph as the forward
      action (`Icons.AutoMirrored.Filled.Send`). **Pending:** edit-history viewer (needs the gateway
      edit-history endpoint surfaced on Android).
- [ ] Ephemeral (self-destruct) messages with duration picker + countdown badges
- [ ] Blurred ("tap to reveal") + view-once messages with fog effect
- [ ] Message visual effects (shake/zoom/explode/waoo/confetti/fireworks/glow/pulse/rainbow/sparkle)
      — picker sheet + cross-platform bitfield encoding
- [ ] Long-press overlay menu (preview bubble, quick reactions, action grid, drag-to-detail panel)
- [ ] In-overlay interactive audio/video preview (play/pause, scrub, ±5s, 0.5–2.0×)
- [ ] Universal composer: text, attachments, voice, location, emoji, camera
- [ ] Voice recording UI (iMessage-style pill: cancel, live waveform, timer, min-duration gating)
- [ ] Attachment ladder (emoji, file, location, camera, photo library, voice)
- [ ] Large-paste detection → clipboard-content attachment
- [ ] In-app camera: photo capture + video recording (flash, front/back toggle)
- [ ] Live sentiment + language detection ("smart context zone") with language pill/picker override
- [◐] @-mention autocomplete (debounced API + local merge) — local roster done
      (`chat-mention-autocomplete` 2026-07-06): pure `:feature:chat` `ChatMention` SSOT (port of iOS
      `MentionComposerController` pure logic) — `extractQuery` (trailing `@fragment`, bare `@` → full roster,
      space → inactive), `filterCandidates` (trimmed case-insensitive over username **or** display name, blank →
      all), `insertMention` (rewrite trailing fragment → `@username `, inert without an active fragment); plus a
      pure reducer over `MentionAutocompleteState(activeQuery, suggestions, draftMentions)` — `onTextChange`,
      `cleared` (idempotent, keeps draft mentions), `select` (rewrite + record + dismiss), `reset`. `MentionRoster`
      builds candidates from participants (excludes self, drops blank handles, degrades display name→username).
      `ChatViewModel` recomputes on `onDraftChange`, exposes `onMentionSelected`, resets on send; `ChatScreen`
      renders a neutral accent-avatar suggestion strip above the composer. +40 tests. **Pending:** debounced
      backend `/mentions` API merge over the local roster (online enrichment).
- [◐] Draft auto-save/restore (text + reply + language + effects + blur + ephemeral) — **text + reply-ref done**
      (slice `chat-draft-autosave`, 2026-07-07): pure `:feature:chat` `DraftAutosave` SSOT (blank composer
      purges, non-blank saves raw, unchanged writes nothing → `Save`/`Clear`/`None`; restore seeds an idle empty
      composer only, never clobbering an in-flight edit or already-typed text) + durable `:sdk-core`
      `ConversationDraftStore` (DataStore-backed, per-conversation key, corrupt→miss; port of iOS
      `ConversationDraftManager`). `ChatViewModel` restores on open, auto-saves on `onDraftChange` (guarded off
      during edit, coalesced last-write-wins), purges on send. +32 tests. **Reply-ref persistence done**
      (slice `chat-draft-reply-ref`, 2026-07-07): `ConversationDraft` gained a `replyToId`; `DraftAutosave.resolve`
      now treats a draft as *meaningful* when it holds text **or** an armed reply (a reply armed on an empty
      composer persists and survives navigation; cancelling it on an empty composer purges), normalising the
      reference (trim/blank→null); `DraftAutosave.restore` returns a `DraftRestore(text, replyToId)` snapshot that
      re-arms a reply-only or half-typed reply draft. `ChatViewModel` persists on `startReply`/`cancelReply`/
      `onDraftChange` and re-arms `replyingToMessageId` on open; the durable store round-trips the reference. +16
      tests. **Pending:** the language/effects/blur/ephemeral fields (those composer features are not yet built on
      Android — no state to persist).
- [ ] Send with attachments (TUS resumable; audio over socket, others over REST) + upload progress
- [◐] In-conversation message search (translation-match aware) + jump-to-result — core+wiring done
      (`chat-search-highlight-wiring` 2026-07-06): pure `:feature:chat` `ChatSearch` SSOT over the opaque
      `SearchableMessage` — `matchIds` (trimmed/case-insensitive `contains` across **every** text of a message,
      so the displayed translation *and* the stored original both match → translation-aware) + a pure reducer
      (`activated`/`deactivated`/`withQuery`/`reconciled`/`movedToNext`/`movedToPrev`) over `ChatSearchState`
      (matches, wraparound next/prev, one-based `currentPosition`, `highlightTerm`). `ChatViewModel` intents
      (`openSearch`/`onSearchQueryChange`/`nextSearchMatch`/`previousSearchMatch`/`closeSearch`) recompute on
      each keystroke and **reconcile against the live message stream keeping the user's focused hit** (deleted /
      body-less bubbles excluded); `ChatScreen` renders a search TopAppBar (accent cursor, `x / y` counter,
      up/down nav) and jumps the list to the active hit via `animateScrollToItem`; `highlightTerm` threads into
      every `MessageBubble` (reusing the tested `MessageTextParser.highlightRanges`). Local match is instant — no
      debounce needed (surpasses iOS's debounced-but-online search). +29 tests (24 pure-core, 5 VM). **Pending:**
      server-side/remote search over uncached history.
- [~] Scroll-to-bottom control with rich unread/typing/offline/search states —
      **unread badge + preview done** (`chat-scroll-to-bottom-control` 2026-07-07): pure
      `:feature:chat` `ScrollAffordance.next(previous, messages, isNearBottom) → ScrollAffordanceState`
      (port of iOS `ConversationScrollControlsView` book-keeping) computes the control's visibility,
      an unread badge that grows only on incoming (non-own, undeleted) messages arriving while the
      reader is scrolled away, and a compact preview (sender + text + kind icon) of the newest such
      message; scrolling back to bottom clears the badge; top-pruned history never resurrects as unread
      and a lost anchor re-baselines to the newest. `ChatScreen` renders a `BadgedBox` FAB + preview pill,
      tap acknowledges + jumps. +19 tests (`ScrollAffordanceTest` 14 reducer branches,
      `AffordanceMessageMappingTest` 5 mapping). Typing-in-control now live: pure `ScrollControlContent.of`
      (Hidden/Typing/Unread/Plain) folds the typing roster into the control with **typing taking priority
      over the unread count** (iOS `ConversationScrollControlsView` rule), rendered as a `TypingPill`
      (slice `chat-typing-in-control`, 2026-07-07, +10 tests). **Pending:** offline
      indicator (needs a `NetworkMonitor` flow — iOS hard-codes `false`), slow-scroll search state.
- [~] Typing indicators (header + inline) — inline indicator live via pure `:feature:chat` `TypingParticipants`
      keyed roster SSOT (userId-keyed dedup so two same-named typists stay distinct + refresh-to-tail +
      self-exclusion + blank-name→userId fallback) + `TypingLabel` presentation (None/One/Two/Many), driven
      by `ChatViewModel.typingParticipants` and rendered by `ChatScreen.TypingIndicator` (slice
      `chat-typing-participants-core`, 2026-07-07, +21 tests). Typing roster also folded into the
      scroll-to-bottom control via `ScrollControlContent` (slice `chat-typing-in-control`, 2026-07-07).
      **Header-level indicator now live** via pure `:feature:chat` `ChatHeaderSubtitle.of(memberCount,
      isGroup, typing) → None | Members(count) | Typing(label)` SSOT — while a peer composes the header
      subtitle shows who is typing (reusing `TypingLabel`), otherwise a group shows its member count and a
      direct chat shows nothing; **typing supersedes the member count** (iOS `ConversationHeaderState`
      typing-dot parity), and a non-positive count never renders "0 members". `ChatViewModel` now exposes
      `memberCount`/`isGroup`; `ChatScreen` renders the subtitle under the title (typing in `accentColor`,
      members in `textSecondary`) (slice `chat-typing-header`, 2026-07-07, +11 tests). **Header avatar chips
      now live** — pure `:feature:chat` `TypingAvatarStack.of(participants, maxVisible=3) → visible chips +
      overflow count` SSOT (roster-order, cap-truncation, `+N` overflow, negative/zero cap → all overflow),
      with `TypingParticipant` extended to carry a roster-resolved `avatarUrl` (blank→null); `ChatViewModel`
      builds an `avatarByUserId` map from the conversation participants and resolves each `typing:start`'s
      avatar (the socket payload carries none), and `ChatScreen` renders overlapping accent-tinted avatar
      chips beside the subtitle (slice `chat-typing-header-avatars`, 2026-07-07, +20 tests). Closes iOS parity
      (avatars, not just the name).
- [ ] Static location pin + live location sharing (timed sessions) + fullscreen map / directions
- [ ] OpenGraph link-preview cards + in-app browser; tracker-param stripping
- [ ] Report message (typed reasons + detail); per-conversation animated themed background
- [ ] Conversation info sheet: hero/direct headers; members / media / stats / options tabs
- [ ] Paginated member list (infinite scroll + search); shared-media grid; pinned-messages list
- [ ] Member moderation: promote/demote, expel, ban, add member
- [ ] Conversation moderation: write-role, announcement mode, slow mode, auto-translate
- [ ] Per-conversation preferences: custom name, reaction emoji, pin, category, tags, mute, mentions-only
- [ ] Conversation lock: master PIN setup/change/remove + per-conversation 4-digit lock + unlock-all
- [ ] Leave / archive / delete-for-me / delete-for-all conversation
- [ ] Anonymous-session conversation mode; guest join-via-share-link flow
- [ ] AI conversation analysis (health score, summary, topics, tone, emotions)
- [ ] Conversation stats rings + activity-over-time chart + content-type / sentiment breakdown
- [ ] AI participant persona profiles + per-participant activity breakdown + trait bars

## D. Translation — Prisme Linguistique
- [ ] Automatic per-user translation display (resolution: system → regional → custom → original)
- [~] Original exploration: long-press → « Voir l'original / la traduction »
      (toggle par message, builder Prisme-aware) ; flag strip / panel secondaire pending
- [ ] Message detail: per-language translation explorer + on-demand translate / retranslate
- [ ] Per-post and per-story translation (flag strip, inline secondary, request missing languages)
- [ ] Persisted translations / transcriptions / audio translations (offline Prisme)
- [ ] Real-time progressive translation/transcription socket updates
- [ ] Ad-hoc blocking text translation
- [ ] Source-language stamping from in-app prefs (NEVER device locale)
- [ ] Per-language flag / native name / colour metadata (~40 languages)

## E. Stories
- [~] Story tray carousel : carrousel d'anneaux + bouton « ma story » (badge +) +
      ring non-vu (dégradé accent) / vu (gris) done ; **cache-first SWR/Room backing**
      (`StoryEntity`/`StoryDao` v5 + `StoryCacheSource` + `storiesStream`, skeleton
      cold-only) done ; **segmented unviewed-count dots** done (pure `StoryCountDots`
      — surpasses iOS group-level all-or-nothing dimming by activating the precise
      trailing unseen dots, cap 5 + overflow "+", hidden for single-story rings,
      accent active / muted inactive, `StoryRing.unviewedCount`) ;
      progression d'upload + retry/cancel pending (`:feature:stories` `StoryTray`)
- [~] **Text story composer + publish** done (`StoryComposerDraft` pure publish-gate +
      `toCreateStoryRequest` mapping, `StoryComposerViewModel` optimistic publish, accent
      `StoryComposerScreen` reached from the tray's add affordance via route `story_composer`).
      Publishes through the **shared durable outbox** (`OutboxKind.PUBLISH_STORY` on its own
      `story` lane → `OutboxFlushWorker` → `POST /posts`), surpassing iOS's dedicated queue:
      survives process death / offline, auto-retries, no head-of-line block on messages.
      **Optimistic tray** done: a queued publish appears instantly as a `pending_*` self-ring,
      derived from the live outbox (`StoryRepository.pendingPublishes` building block +
      `StoryOptimisticTray` product rule) so it survives process death and **rolls back**
      automatically if the publish exhausts; on delivery the ring hands off to the real story
      (`StoriesViewModel` refreshes when a publish vanishes from the queue). Surpasses iOS's
      in-memory optimism. **Failed-publish recovery** done: a publish that exhausts its outbox
      retries no longer vanishes silently — it surfaces as a "Couldn't post your story" strip
      above the tray (`StoryRepository.failedPublishes` building block + `StoryPublishFailures`
      product rule) with explicit **Retry** (`retryPublish` → revive + kick the drain worker) and
      **Discard** (`discardPublish` → drop the row); the reconciler now tells a *failed* publish
      apart from a *delivered* one (no spurious hand-off refresh). Surpasses iOS, whose optimistic
      story evaporates on failure with no signal/recovery. Pending: multi-slide canvas / media /
      text styling below.
- [~] Multi-slide composer (≤10 slides; add/remove/duplicate/reorder; slide mini-preview strip)
      **Pure deck foundation done** (`story-slide-deck`): `StorySlide` (id/text/mediaIds) +
      `StorySlideDeck` reducer in `:feature:stories` — structural CRUD (`addSlide`/`duplicate`/
      `removeSlide`/`move`/`select`) with the iOS **≤10 cap** (`MAX_SLIDES`/`canAddSlide`/`isFull`)
      and the **always-≥1-slide** invariant (`canRemoveSlide`; removal reselects the slide taking the
      removed one's place). Total functions — every inapplicable op (cap reached, last slide, unknown
      id, no-op move) returns the same instance; ids are caller-supplied so the reducer stays pure.
      **ViewModel wiring + strip done** (`story-composer-slide-deck`): `StoryComposerUiState` now
      carries `deck: StorySlideDeck` (default a single empty slide); the VM mints slide ids
      (`UUID`, at the impure edge — reducer stays pure) and exposes `onAddSlide`/
      `onDuplicateSelectedSlide`/`onRemoveSlide`/`onMoveSlide`/`onSelectSlide`, each re-syncing the
      editor buffer to the (possibly new) selected slide's text so `draft.text == selectedSlide.text`
      holds. Per-slide text via pure `StorySlideDeck.updateSelectedText`; `onTextChange` writes the
      selected slide. **Lossless publish across slides**: `publishRequests` emits **one story per
      non-blank slide** in deck order (pure `publishableSlides`), the first carrying the whole-story
      media + offline `dependsOn` prerequisites; a media-only deck still emits one media-bearing story
      (single-slide behaviour byte-identical to before). `canPublish` now gates on the **whole deck**
      (`hasText`/`isWithinTextLimit` — an off-screen over-long slide blocks publish), not just the
      active slide. `StoryComposerScreen` renders a `SlideStrip` mini-preview (numbered selectable
      chips; selected chip carries Duplicate/Remove, Remove hidden on the last slide; trailing "+"
      add chip disabled at the cap). **Drag-reorder gesture done** (`slide-drag-reorder`): a
      horizontal drag on a chip reorders it — the pure `SlideReorderResolver.targetIndex`
      (`:feature:stories`) converts accumulated drag px + measured slot width into the whole-slot
      crossings, rounds a sub-half-slot drift to zero, clamps to the deck bounds, and degrades to
      the origin on a non-positive slot width; `SlideStrip` binds `detectHorizontalDragGestures` on
      each chip and hands the resolved target to the already-tested `onMoveSlide`. **Per-slide media
      done** (`story-slide-media`): media now belongs to the **slide it was added to**, not the whole
      story. The deck is the single source of truth (`StorySlideDeck.addMediaToSelected`/`removeMedia`/
      `hasMedia`/`isWithinMediaLimit`/`selectedRemainingMediaSlots`, ≤10 media **per slide**); `draft`
      mirrors the selected slide for media exactly as it already does for text. `onMediaPicked`
      attaches to the selected slide (online ids or offline placeholders), the preview shows only the
      **selected slide's** media (`selectedSlideAttachments`/`selectedSlidePending`), publish emits one
      story **per publishable slide** (text **or** media — a media-only middle slide now publishes its
      own media) carrying that slide's media and `dependsOn` only that slide's offline uploads, and
      removing a slide reclaims its media (drops the preview entries + cancels its durable rows).
      Surpasses iOS, where offline media drops on an upload failure. Pending: the 9:16 canvas + text
      styling below.
- [~] 9:16 canvas with pinch-zoom + drag-pan; FAB + bottom-band toolbar (Contenu/Effets).
      **Pinch-zoom + drag-pan done** (`story-canvas-transform`): a pure per-slide
      `StoryCanvasTransform` (`scale` clamped 1–4×, `offsetX/Y` clamped to the scaled-content
      overflow) owns the gesture math — `apply(panX,panY,zoom,canvasW,canvasH)` multiplies the
      scale by the gesture zoom then clamps the translation to the bounds of the **new** scale
      (a pinch-in widens the pan range, a pinch-out tightens it and re-clamps a now-out-of-range
      offset toward centre); a not-yet-measured (0px) canvas collapses the range without dividing
      by zero, and `clampedTo(w,h)` re-clamps on resize. The transform is part of the slide's
      identity (`StorySlide.transform`, carried by `duplicate`), persisted via
      `StorySlideDeck.updateSelectedTransform` and driven by `StoryComposerViewModel.onCanvasTransform`.
      `StoryCanvasSurface` renders the selected slide's first media as a 9:16 background under a
      `graphicsLayer` + `detectTransformGestures` (glue only; the math is unit-tested in one place).
      **FAB + bottom-band toolbar done** (`story-composer-band`): the flat add-text / add-media /
      visibility buttons are replaced by a two-FAB (Contenu / Effets) bottom band — the pure value-type
      port of iOS `BandStateMachine`. `ComposerBandState` (`Hidden` | `Tiles(BandCategory)`) +
      `BandCategory.swapped` + `ComposerContentTile` own the navigation: `tapFab(category)` opens /
      switches / toggle-closes the drawer, `swipeDown()` dismisses, `swipeHorizontal()` swaps category
      (inert while hidden); `activeCategory`/`isVisible` derive the render. The drawer shows the Contenu
      tiles (Texte → `onAddTextElement`, Médias → system picker) or the Effets visibility chips, with
      natural swipe-to-dismiss / swipe-to-swap gestures (glue). All decisions live in one unit-tested
      place; the VM holds `band` and applies the pure transitions (`onBandFabTap`/`onBandDismiss`/
      `onBandSwapCategory`). +18 tests (11 state machine, 7 VM). Pending: Effets tiles (filters / drawing
      / timeline), on-canvas sticker/drawing elements.
- [~] Text elements (≤5/slide): style (bold/italic/handwriting/typewriter/neon/retro), colour,
      size, alignment, background (none/solid/glass), outline/stroke, RTL, fade timing.
      **Model + add/move/remove + publish done** (`story-text-elements`): a pure `StoryTextElement`
      (id, text, `StoryTextStyle` bold/neon/typewriter/handwriting/classic, hex colour, `StoryTextAlign`
      left/center/right, normalised `x`/`y`) with the clamp living in one place — `normalised()` /
      `nudged(dx,dy)` keep the element inside the canvas `0f..1f`, and `toTextObject(lang)` maps to the
      gateway `StoryTextObject` wire strings. The deck mirrors the media reducer per-slide
      (`StorySlideDeck.addTextElementToSelected`/`removeTextElement`/`updateTextElement`/`moveTextElement`,
      `MAX_TEXT_ELEMENTS_PER_SLIDE=5`, `selectedRemainingTextSlots`, `isWithinTextElementLimit`); a
      slide carrying only a publishable element now publishes and `publishableSlides` counts it.
      `StoryComposerDraft.toCreateStoryRequest` serialises publishable elements into
      `storyEffects.textObjects` (blanks dropped, `storyEffects` null when empty). The VM adds
      `onAddTextElement` (mints id, selects it for immediate typing, inert-with-warning at the cap),
      routes `onTextChange` to the selected element **or** the slide caption (one field, two roles via
      `editorText`/`isEditingTextElement`), `onSelectTextElement`/`onDeselectTextElement`,
      `onTextElementMoved` (drag, clamped), `onRemoveTextElement`; switching/removing a slide ends
      element editing (`mirrorDraftToSelection` drops a dangling selection). `StoryCanvasSurface`
      renders each element centred at its normalised point, draggable / tappable / removable, with a
      background tap to deselect (glue; px↔fraction division only, clamp is in the model). Surpasses
      iOS (durable-outbox publish path).
      **Style picker + per-style rendering done** (`story-text-element-styling`): the *look* of each face
      lives in one pure, Compose-agnostic place — `StoryTextStyle.typography()` → `StoryTextTypography`
      (`fontWeight`/`italic`/`family`/`letterSpacingEm`/`glow`) over the `StoryTextFontFamily` token enum
      (SANS/SERIF/MONOSPACE/CURSIVE), unit-tested per branch. The VM gains
      `onTextElementStyle`/`onTextElementColor`/`onTextElementAlign` (one-line `updateTextElement`
      wrappers, inert on unknown id, selection untouched). `TextElementLayer` renders
      weight/slant/family/tracking + a neon glow `Shadow`; a `TextStyleToolbar` (style chips +
      L/C/R `AlignToggle` + `ColorSwatch` palette) appears while editing an element. Pending:
      size/background/outline/RTL/fade.
- [~] In-place floating text editor with tool bubbles + keyboard-aware canvas shift
      **Floating style toolbar + keyboard-aware shift done** (`story-floating-toolbar`): while a text
      element is edited the `TextStyleToolbar` no longer sits in a fixed bottom band — it floats
      in-place over the canvas, anchored just clear of the element. The vertical anchor is decided by
      the pure, unit-tested `StoryToolbarPlacement.resolve(elementCenterY, elementHalfHeight,
      toolbarHeight, canvasHeight, gap)` → `ToolbarPlacement(topPx, ToolbarSide.ABOVE|BELOW)`: BELOW
      when the toolbar fits beneath the element, otherwise ABOVE, clamped into the canvas so it never
      spills off the top or past the bottom (boundary-exact, degenerate-canvas safe). The composer
      applies `imePadding`, so the canvas measurement already excludes the soft keyboard — the
      keyboard-aware shift — and the resolver keeps the toolbar inside the keyboard-free band.
      `StoryCanvasSurface` measures the selected element's half-height + the toolbar's height and offsets
      it (glue). Surpasses iOS's fixed bottom style bar. Pending: floating tool *bubbles* per element
      handle (delete chip exists; rotate/scale now via direct gesture — see below).
- [x] Per-element pinch-scale + rotate (`story-text-element-transform`): `StoryTextElement` carries a
      `scale` (clamped `[0.3, 4]`) and `rotationDeg` (wrapped to the canonical `(-180, 180]` turn); the
      pure `transformed(scaleBy, rotateByDeg)` applies an incremental pinch/rotate gesture with the
      clamp/wrap rules in one unit-tested place (a non-finite/non-positive factor collapses to the
      neutral value, never a broken element), `normalised()` re-pulls both fields into range, and
      `toTextObject` carries `scale`/`rotation` onto the gateway wire. The deck's
      `transformTextElement(id, scaleBy, rotateByDeg)` and the VM's `onTextElementTransform` mirror the
      move/style reducers (inert on unknown id, selection/editing untouched). `TextElementLayer` binds a
      single `detectTransformGestures` so one two-finger gesture pans **and** pinch-scales **and** rotates
      the element, rendered via `graphicsLayer` (glue). A natural direct-manipulation gesture rather than
      discrete handle chips. +21 tests (14 element, 4 deck, 3 VM).
- [~] Media elements (≤10/slide): photo/video import, crop/edit, aspect-ratio preservation.
      **Upload foundation done** (`media-upload-api`): `MediaApi` multipart `POST /attachments/upload`
      (`files` parts) + `MediaRepository.upload()` → domain `UploadedMedia` (id = `mediaId`, url,
      mime, size, dims, durationMs, thumbnail); pure `MediaUpload` part-builder + wire→domain mapper
      that drops unusable rows. **Picker + publish wiring done** (`story-composer-media`): the
      composer's `OutlinedButton` launches the system photo/video picker
      (`ActivityResultContracts.PickVisualMedia`, ImageAndVideo); the chosen file is read off-main
      into a `MediaUploadItem` and `StoryComposerViewModel.onMediaPicked` uploads it, **appends** the
      returned media to the draft (`StoryComposerUiState.attachments` preview row + `draft.mediaIds`),
      and `publish()` carries `mediaIds` into the same durable-outbox flow. A media-only story (no
      caption) is publishable (`StoryComposerDraft.canPublish` admits text **or** media; `content`
      sent null when blank). `onRemoveMedia` drops a wrongly-picked attachment; uploads are
      re-entrancy-guarded and gate `canPublish` while in flight; a failure / thrown error / all-rows-
      unusable result surfaces a message and leaves the draft intact. **≤10 media cap enforced**
      (`story-composer-media-cap`): pure `StoryComposerDraft.MAX_MEDIA`/`isWithinMediaLimit`/
      `remainingMediaSlots`/`isMediaFull` (the cap also gates `canPublish`); `onMediaPicked`
      truncates a pick to the free slots and is inert-with-a-warning once full; the Add button
      disables + shows an `n/10` count at the cap. **Multi-pick done** (`story-composer-multipick`):
      a pure `StoryMediaPicker.modeFor(remainingSlots)` routes the Add button to the single- vs
      multi-item picker (`PickMultipleVisualMedia(MAX_MEDIA)`), falling back to single when one slot
      is left so the multi-picker's `maxItems > 1` requirement never throws and launching nothing
      when full; the screen reads every picked uri off-main and the VM's existing free-slot
      truncation still caps the batch. Pending: on-canvas crop/edit, durable
      upload-then-publish outbox chain (SOTA follow-up).
- [ ] Audio elements (≤5/slide): voice recording (60s), audio file import, on-canvas player widget
- [ ] Freehand drawing layer (pen/marker/eraser, colour, width, undo/redo/clear)
- [x] Emoji sticker picker — **categorised + searchable** (`story-sticker-picker-search`): a pure
      `StickerCatalog` (8 iOS-parity categories — smileys/animals/food/activities/travel/objects/
      symbols/flags, ~16 keyworded emojis each, every glyph in exactly one category) owns the emoji
      data + a pure `search(query, category?)` (trim+lowercase substring over keywords or the glyph
      itself; blank query ⇒ whole scope; result preserves catalogue order, duplicate-free). A pure
      `StickerPickerState(category, query)` reducer encodes the product rule — a non-blank query
      searches **across every category** (iOS parity) and hides the tab row, otherwise the active tab
      shows; `withCategory`/`withQuery` are inert on no-op. The picker dialog becomes glue: a search
      field + `FilterChip` tab row + filtered grid + empty-state. +22 tests. Replaces the old flat
      `STORY_STICKER_EMOJIS` palette.
- [x] Emoji sticker picker — **on-canvas sticker elements done** (`story-sticker-elements`): a pure
      `StoryStickerElement` (id/emoji/normalised x,y/scale/rotation) reusing [StoryTextElement]'s
      canvas-geometry clamps (the single source of truth) + a `toSticker()` gateway-wire mapper
      (`StoryEffects.stickerObjects`). The deck mirrors the text-element reducer per-slide
      (`addStickerToSelected`/`removeSticker`/`updateSticker`/`moveSticker`/`transformSticker`,
      `MAX_STICKERS_PER_SLIDE=30`, `selectedRemainingStickerSlots`, `isWithinStickerLimit`,
      `hasStickers`); a sticker-only slide now publishes. `StoryComposerDraft.toCreateStoryRequest`
      serialises publishable stickers into `storyEffects.stickerObjects` (blanks dropped). The VM adds
      add/select/deselect/move/transform/remove intents with selection mutually exclusive vs the
      text-element edit; a "Sticker" tile in the Contenu drawer opens an emoji-grid picker, and each
      on-canvas sticker is draggable / pinch-rotatable / removable (glue mirroring `TextElementLayer`).
      +50 tests (15 model, 21 deck, 5 draft, ~12 VM). Categorised + searchable picker shipped above
      (`story-sticker-picker-search`).
- [ ] Backgrounds: random pastel, colour/gradient palette, image, looping/non-looping video
- [x] 8 photo filters (vintage/bw/warm/cool/dramatic/vivid/fade/chrome) with intensity
      (`story-photo-filters`): the look of each preset lives in **one** pure, Compose-agnostic place —
      `StoryFilterMatrix.baseMatrix(StoryFilter)` → a `StoryColorMatrix` (4×5 `List<Float>`, value
      equality so it unit-tests on the JVM); `effectiveMatrix(filter, intensity)` blends the base toward
      the neutral `IDENTITY` by a clamped/guarded strength (0 → no effect, 1 → full, non-finite → full),
      and `StoryFilter.wireValue()` is the single enum→token mapping kept beside the matrices. Per-slide
      state: `StorySlide.filter`/`filterIntensity` + the deck reducers `setSelectedFilter`/
      `setSelectedFilterIntensity` (clamp in one place); the VM exposes `onSelectFilter`/
      `onFilterIntensityChange` and the derived `selectedSlideFilterMatrix`. The Effets drawer gains a
      None + 8-chip filter row and a strength `Slider` (shown only while a filter is active); the canvas
      `AsyncImage` renders `ColorFilter.colorMatrix(...)` live; publish carries the look on
      `storyEffects.filter`/`filterIntensity` (a filter-only slide still emits a `storyEffects` payload).
      +31 tests (21 matrix, 10 deck) + 7 VM + 5 draft; +11 strings × 4 locales. Mirrors iOS's per-slide
      photo filter with an adjustable strength.
- [~] Frosted-glass text backdrops; safe-zone overlay; snap-to-guide + out-of-bounds warning
      **Snap-to-guide + out-of-bounds warning done** (`story-canvas-snap-guides`): a pure
      `StorySnapResolver.resolve(x, y, …)` → `SnapResult(x, y, verticalGuide, horizontalGuide,
      withinSafeZone)` is the single source of truth for where a dragged element settles. Each axis
      **independently** locks onto the nearest in-range alignment guide (rule-of-thirds + centre)
      within `SNAP_THRESHOLD`; outside it the axis stays at its clamped candidate; a non-finite
      candidate collapses to the canvas centre and out-of-canvas values clamp into `0f..1f`.
      `withinSafeZone` flags a centre that drifts inside the `SAFE_ZONE_INSET` edge margin. The
      existing `onTextElementMoved` drag now routes its resulting centre through the resolver and
      moves the element by the **snap-adjusted** delta (reusing `StorySlideDeck.moveTextElement`,
      no new reducer), exposing the live guides + safe-zone verdict as transient
      `StoryComposerUiState.snapFeedback` (cleared by `onTextElementDragEnd` on lift). The canvas
      draws the active guide line(s) (accent `primary`) and an `error`-coloured warning border when
      out of bounds; the drag-end signal is a non-consuming `Final`-pass `awaitEachGesture` that
      runs alongside the transform detector (glue). A natural magnetic-alignment gesture — surpasses
      iOS, whose snapping has no per-axis guide overlay here. +25 tests (18 resolver, 7 VM). Pending:
      frosted-glass text backdrops, persistent safe-zone overlay grid.
- [x] Z-order management (front/back, forward/backward) persisted for WYSIWYG playback
      (`story-text-element-zorder`): the slide's `elements` list order *is* the paint order (index 0 =
      back, last = front), so a pure `StorySlideDeck.reorderTextElement(id, StoryZOrder)` restacks the
      element within its holding slide — `TO_BACK`/`TO_FRONT` jump to either end, `BACKWARD`/`FORWARD`
      step one place (target index `coerceIn`-clamped to the list bounds). Inert (same instance) on an
      unknown id, an already-at-the-extreme move, or a single-element slide; only the holding slide is
      restacked and the selection is preserved. `StoryComposerViewModel.onReorderTextElement` wraps it
      and keeps the same state instance on an inert move (no recomposition churn). The floating
      `TextStyleToolbar` gains a 4-button z-order row (send-to-back / backward / forward / bring-to-front)
      whose order rides into publish via the existing element serialisation. +16 tests (13 reducer, 3 VM);
      +4 strings × 4 locales. Mirrors iOS's front/back + forward/backward layering controls.
- [~] Multi-element context menu (edit, duplicate, reorder, delete) — **edit** (tap-to-select +
      caption/element routing), **delete** (per-element remove handle), **duplicate**
      (`story-text-element-duplicate`), and **reorder** (`story-text-element-zorder`, z-order row in the
      floating toolbar) done. Duplicate: pure `StorySlideDeck.duplicateTextElement`
      clones every styled field as a fresh id right after the source on its slide, nudged by a small
      normalised offset (clamped into the canvas) so the copy is visible, inert when the source id is
      unknown / the new id collides / the slide is at the ≤5 cap; `StoryComposerViewModel.onDuplicateTextElement`
      mints the id, selects the copy, and warns-without-adding at the cap; a duplicate `ContentCopy`
      handle sits in the floating `TextStyleToolbar`. Pending: a single unified long-press context menu
      consolidating these per-element actions.
- [ ] Per-element + per-slide duration; background designation toggle (1 visual + 1 audio/slide)
- [ ] Repost flow: clone source story + locked attribution badge
- [ ] Draft save/restore with media persistence + lost-media detection / re-capture prompt
- [~] Offline publish queue done (durable outbox `PUBLISH_STORY` lane, auto-retry on
      reconnect via `OutboxFlushWorker`); **failed-publish recovery** done (exhausted publishes
      surface a Retry/Discard strip above the tray — no silent loss); preview-before-publish and
      RAW background publish-all still pending.
- [x] Visibility selection (Public / Friends / Community / Private) — accent `FilterChip` row
      in the composer; wire value carried on `StoryVisibility.wire` → `CreateStoryRequest.visibility`.
- [ ] thumbHash blur-placeholder generation per slide
- [ ] **V2 timeline editor**: multi-track, Quick + Pro modes, size-class adaptive, zoomable
- [ ] Clip add / move / trim / split / delete with full undo/redo (command stack, FIFO 50, persisted)
- [ ] Keyframe animation (position/scale/opacity, easing) per clip/element
- [ ] Clip transitions (crossfade / dissolve, adjustable duration); slide opening animations
- [ ] Per-clip inspector (volume, fade in/out, loop, background, delete)
- [ ] Timeline transport: play/pause, scrub, zoom 0.25×–4×, mute; snap-to-grid with guides
- [ ] Multi-track playback with sample-accurate audio mixing (foreground+background, fades, ducking)
- [ ] Story media audio-focus arbitration (claim app audio, restore on dismiss)
- [~] **Story viewer**: tap-advance + swipe (horizontal=group, vertical=dismiss), segmented
      progress bars, cross-dissolve transitions, per-story opening/closing effects
      — done: pure cross-group **`StoryPlayback`** engine (tap-advance rolls between
      authors, rolls back to the previous group's last slide, dismisses past the
      last slide of the last group; `jumpToNext/PreviousGroup` ready for swipes),
      wired into `StoryViewerViewModel`/`StoryViewerScreen` with segmented progress
      + timed auto-advance; **swipe gestures wired** (pure `StorySwipeResolver`
      maps a drag → `NextGroup`/`PreviousGroup`/`Dismiss`/`None` on the dominant
      axis, dispatched through `StoryViewerViewModel.onSwipe` into the engine's
      `jumpToNext/PreviousGroup` + new `StoryPlayback.dismissed()`). Pending:
      cross-dissolve transitions, per-story opening/closing effects.
- [x] Timed auto-advance gated on media-load readiness; adjacent-slide prefetch (sliding window).
      **Adjacent-slide prefetch**: pure `StoryPrefetchPlanner.plan(playback, lookahead=2)`
      returns the next N distinct image URLs ahead of the current slide in viewing order,
      continuing across author-group boundaries and skipping text-only slides; exposed as
      `StoryViewerUiState.prefetchUrls`, enqueued through the shared Coil `ImageLoader` in
      `StoryViewerScreen` so the next slide paints from cache (Instant-App — surpasses iOS's
      single-next preload). **Media-load gate** (closes the loop): pure
      `StoryAutoAdvanceGate.shouldCountdown(slide, resolvedImageUrls)` — text-only slides count
      down at once, an image slide waits until its URL has resolved (load *or* error → never
      hangs). `StoryViewerViewModel` tracks resolved URLs from `AsyncImage` `onSuccess`/`onError`
      and exposes `canAutoAdvance`; the screen's countdown `LaunchedEffect` holds at empty until
      the gate opens. Surpasses iOS, which starts its 5s timer on appearance regardless of paint.
- [ ] Story content rendering: text/positioning/background/filters/media overlays
- [~] Story reactions: emoji quick-strip + full picker, big floating animation, heart bounce, count
      — done: pure **`StoryReactionState`** reducer (optimistic local tap + idempotent
      reconciliation with realtime `story:reacted`/`unreacted` deltas, count clamped ≥0,
      `mine` set = iOS `currentUserReactions`); `StoryViewerViewModel.react()` does an
      **optimistic** bump with rollback-on-failure (better than iOS fire-and-forget),
      per-slide state; `ReactionStrip` quick-emoji row (`EmojiCatalog.defaultQuickReactions`)
      + live total-count badge in `StoryViewerScreen`; **realtime socket-delta wiring done**
      — `SocialSocketManager.storyReacted`/`storyUnreacted` flows decoded from
      `story:reacted`/`story:unreacted`, `StoryViewerViewModel` collects both and folds
      them through `applyDelta` (own-echo de-duped vs the optimistic bump, unknown/non-current
      slides handled). Pending: full categorised picker, big floating animation,
      heart bounce, server-side `currentUserReactions` seeding, social-socket `attach()`
      lifecycle wiring (app-wide, separate slice).
- [ ] Story comments overlay: live-chat panel, 1-level threading, composer with effects/blur,
      per-comment language switcher, optimistic posting + reaction likes
- [ ] Story actions: reply privately (DM with context), forward/send, reshare-as-story,
      repost-as-post (direct + edit), mute/unmute, translate, report
- [~] Story viewers sheet (who-viewed list with reaction/reshare indicators)
      — done: `StoryRepository.viewers()` (`GET posts/{id}/interactions` → wire
      `StoryViewersResponse` mapped to domain `StoryViewer` via pure
      `toStoryViewer()`, displayName/avatar/reaction blank-collapse > iOS nil-only
      check); pure `StoryViewersPresentation.order()` (most-recent-first, null
      timestamps last, defensive dedup-by-id > iOS raw order); `StoryViewersViewModel`
      (cold-only skeleton, refresh keeps the list & swallows refresh failures,
      error only on cold, re-entrancy-guarded) + `StoryViewersSheet` (ModalBottomSheet,
      accent-coherent, avatar rows, empty/error/loading states) reachable via an
      author-only "Views" button in `StoryViewerScreen` (timer pauses while open).
      Pending: reaction/reshare indicators richness, realtime `story:viewed` append
      (socket payload lacks viewer name/avatar to render a row — needs API or a
      user lookup), reshare indicator.
- [ ] Reader Prisme: text overlays in viewer's preferred language; composer shows source language
- [ ] **Author-only Story → MP4 export** (bit-exact render, language picker, system share, never uploaded)
- [ ] Single shared renderer feeds composer canvas + reader canvas + export compositor (WYSIWYG)
- [ ] Accessibility for canvas elements (labels, custom delete/duplicate/reorder actions)

## F. Feed & Posts
- [~] Social feed: cache-first SWR list + pull-to-refresh + cursor-paginated infinite
      scroll done (`PostRepository.feedStream`/`loadMore`/`feedHasMore`, skeleton on cold
      cache, silent background revalidation, 5-from-tail prefetch + footer spinner,
      dedupe-append, history pages do not bump the freshness watermark) ; new-posts banner
      + realtime-head merge pending
- [x] Post reactions (heart like) — **optimistic** toggle via `PostRepository.toggleLike`
      (flips `isLikedByMe` + count instantly, rolls back on failure). Fixes the prior
      bug where any post liked by *others* rendered as liked-by-me (`likeCount > 0`
      proxy removed). UI like state now reads the viewer's own `isLikedByMe`.
- [x] Adaptive multi-image collage layouts (1–4 + overlay « +N ») in the feed card
      (single full-width with aspect ratio, 2-col grid otherwise) — `FeedPostBuilder`
      resolves + orders image media and resolves relative URLs against the gateway origin
- [~] Prisme Linguistique on the feed: post content rendered in the viewer's preferred
      language with a discreet « Traduit » indicator (`ApiPost.displayContent`/`isTranslated`
      port of the message Prisme rules — Map-keyed translations, Rule 1 honoured) ;
      per-post flag strip / request-missing-languages pending
- [x] Feed card stats row: like (filled when own) + comment count + repost count,
      mood emoji on the author line, pure `FeedPostPresentation` builder (8 builder
      tests + 1 model Prisme test + 3 repository optimistic/rollback tests, all green)
- [~] Social feed: cursor-paginated post list + infinite scroll done (see above) ;
      new-posts banner pending
- [ ] Feed overlay shell with draggable floating buttons + radial menu ladder
- [ ] Create post (text, photos/videos, camera, files, location, audio+transcription, visibility, language)
- [ ] Unified post composer (Post / Status / Story tabs)
- [ ] Quote / repost posts (incl. reposts of stories) with canvas reprojection + "items repositioned" banner
- [ ] Post reactions (heart like) — optimistic + live socket sync; bookmark / un-bookmark
- [ ] Adaptive multi-image collage layouts (1–5+ media) + fullscreen gallery
- [ ] Threaded comments: auto-preview replies, expand threads ("view N more"), comment likes,
      mentions, effects/blur, per-comment language switcher
- [ ] Post / comment pin-unpin; repost / quote-repost / share; report
- [ ] Post view + dwell-time tracking; batched impression tracking
- [ ] Feed post detail with text/media/repost, translation flags, threaded comments
- [ ] User-profile posts feed + community posts feed
- [ ] Bookmarked posts feed (saved posts) with infinite scroll
- [ ] Post-detail room real-time subscriptions
- [ ] Story repost-embed cell in the feed

## G. Statuses / Moods
- [ ] Statuses/moods bar: emoji pills, popover details, infinite scroll
- [ ] Status composer / republish: emoji grid, 122-char text, visibility (public/friends/except/only)
- [ ] Mood status create, react, delete; 21h expiry + viewer tracking
- [ ] Status thought-bubble popover on avatar tap with republish action
- [ ] Friends / Discover status feeds

## H. Calls (audio / video)
- [ ] 1:1 audio & video calls (WebRTC P2P, ICE/STUN, hardware H.264)
- [~] System call UI (Telecom/ConnectionService) + ringback tone —
      **call-audio decision core landed** (slice `call-sound-policy`): the pure
      `core:model` `CallSoundPolicy` is the SSOT mapping call lifecycle → sound,
      the Android analogue of the iOS `RingbackTonePlayer` call sites collected
      into one total function. `loopFor(state)` (`CallSound.None/Ringback/Ringtone`)
      plays the caller **ringback** through the whole pre-answer wait
      (`Ringing(outgoing)` + `Offering`) and stops it the instant the answer lands
      (`Connecting`) — tighter than iOS, which drags it to `.connected` — and the
      callee **ringtone** while `Ringing(incoming)`; `cueFor(prev, next)` fires the
      one-shot `CallCue.Connected` on every entry into `Connected` (first connect
      **and** a successful reconnect) and `CallCue.Ended` only when a *live* call
      ends (`prev.isActive`, mirroring iOS `if wasActive`), so a phantom `Idle→Ended`
      or idempotent `Ended→Ended` stays silent; `plan(prev, next)` bundles both per
      edge. The `:feature:calls` `CallToneController` seam (thin `ToneGenerator`/
      `RingtoneManager` glue behind an interface, `@Binds` `AndroidCallToneController`)
      is folded into `CallViewModel.dispatch`: each FSM edge drives the loop (switched
      only on a genuine change — an inert event never restarts the ringback) + fires
      the cue, released on `onCleared`. +28 tests (19 policy, 9 VM-fold via a recording
      fake). **Telecom-connection decision core landed** (slice `call-telecom-state-plan`):
      the pure `core:model` `TelecomCallPolicy` is the SSOT mapping call lifecycle → the OS
      telecom reports a self-managed `ConnectionService` must make — the Android analogue of
      the `CXProvider.reportCall(...)`/`report(_:endedAt:)` calls the iOS `CallManager` makes
      to CallKit. `connectionStateFor(state)` keys purely on `CallState` (outgoing ring/
      `Offering` → `Dialing`, incoming ring → `Ringing`, answered = `Active` for
      `Connecting`/`Connected`/`Reconnecting` so an ICE restart never tears the system call
      down, `Ended` → `Disconnected`, `Idle` → none); `disconnectCauseFor(reason)` maps every
      `CallEndReason` (lost/failed → `Error`); `plan(prev,next)` reports only on a genuine
      transition (dedupes already-active edges, phantom `Idle→Ended`, idempotent `Ended→Ended`
      and settle `Ended→Idle` to `null`). The `:feature:calls` `TelecomCallReporter` seam
      (thin `LogTelecomCallReporter` interim glue behind an interface, `@Binds` into a Hilt
      module) is folded into `CallViewModel.dispatch` (report each genuine edge; released on
      `onCleared`). +35 tests (28 policy, 7 VM-fold via a recording fake). **Pending:** the
      real self-managed `ConnectionService`/`PhoneAccount` registration + full-screen call UI +
      foreground service (swaps the `LogTelecomCallReporter` `@Binds`), then the WebRTC media
      transport.
- [~] Incoming-call delivery via FCM data push when backgrounded/killed (full-screen intent) —
      **pure decision core landed** (slice `incoming-call-push-decision`): `core:model`
      `me.meeshy.sdk.model.call` gains `IncomingCallPush` (typed FCM `data`-map / VoIP payload at
      parity with the gateway `CallEventsHandler` push `type:"call"` and `PushNotificationService`
      `type:"voip_call"` — `callId`/`conversationId`/`callerUserId`/`callerName`/`isVideo` string flag/
      `iceServers` JSON) + blank-skipping `displayName`; the total, side-effect-free
      `IncomingCallPushParser.parse(Map<String,String>) → IncomingCallPush?` (call iff `type ∈
      {call,voip_call}` AND non-blank `callId`; leniently decodes `iceServers`, degrading a
      missing/malformed value to `[]` rather than dropping the push); the immutable `SeenCallRing`
      (pure port of the iOS `VoIPDedupRing`, capacity 24 / ttl 30s — `contains`/`insert`/`remove`,
      expiry-pruning + capacity-trimming, every mutation returns a new ring); and the pure
      `IncomingCallDecider.decide(push, context) → IncomingCallDecision` (`Ring` | `Ignore(reason)`)
      faithful to the iOS `VoIPPushManager`/`CallManager.reportIncomingVoIPCall` ordering: self-fanout →
      duplicate (active-or-seen) → busy (different call active) → ring. The SSOT the FCM service +
      Telecom/`ConnectionService` full-screen-intent wiring will consume. +39 behavioural tests.
      **FCM routing landed** (slice `fcm-call-push-route`): the pure `IncomingCallPushRouter.route(data,
      context) → IncomingCallPushRoute` (`NotACallPush` | `Ring(push, updatedSeen)` | `Suppress(reason)`)
      folds parser + decider + ring-insert into the single total decision the service delegates to
      (ring advanced only on a `Ring`, so a retried push is deduped while a suppressed one never
      poisons the ring); the app-layer `@Singleton IncomingCallRingStore` owns the live `SeenCallRing`
      (synchronized `route`/`forget`, self-user id threaded from `SessionRepository`); and
      `MeeshyFcmService.onMessageReceived` now routes a call push → a full-screen, CATEGORY_CALL /
      `PRIORITY_MAX` notification on the new `meeshy_calls` channel (`setFullScreenIntent` → `MainActivity`
      with `callId`/`conversationId`/`callerName`/`isVideo` extras), suppresses duplicates silently, and
      hands every non-call push to the existing message path. +19 behavioural tests (11 router, 8 store).
      **Deep-link wired** (slice `incoming-call-deeplink`): the pure `me.meeshy.app.navigation.LaunchRouter`
      decodes the launch/full-screen intent extras (`LaunchExtras`) into a nav route — a non-blank
      `callId` → `CallRoute.incoming(...)` (call push wins, deep-links into the incoming-call screen with
      `isOutgoing=false` carrying the server id so the ring is answerable), else a non-blank
      `conversationId` → `Routes.chat(...)` (the shared message-notification tap path), else `null`.
      `CallRoute` was refactored to a **static `call` path + all-optional query args** so a blank room /
      peer name can never collapse the route or crash `navigate()`. `MainActivity` extracts the extras +
      hands them to `LaunchRouter` (in `onCreate` and `onNewIntent`); `MeeshyApp` navigates once the graph
      is live and the user is authenticated, then marks the route consumed. +14 behavioural tests (8
      router, 6 route). **Pending:** a full `ConnectionService`/Telecom integration + ringtone, then the
      WebRTC media transport.
- [ ] Call reconnection on network change (ICE restart)
- [~] Call states: ringing/connecting/connected/ended; PiP / floating call pill —
      **pure call-lifecycle FSM landed** (`core:model` `me.meeshy.sdk.model.call`):
      `CallState` (Idle/Ringing(isOutgoing)/Offering/Connecting/Connected/Reconnecting(attempt)/
      Ended(reason)) + `CallEndReason` (Local/Remote/Rejected/Missed/ConnectionLost/Failed(msg)) +
      `CallEvent` + total side-effect-free `CallStateMachine.reduce(state, event)` faithfully
      mirroring iOS `CallManager`/`WebRTCTypes` transitions (incl. the 3-attempt reconnect budget →
      `ConnectionLost`). SSOT the `:feature:calls` wiring will drive — surpasses iOS, where the FSM
      validator is only a P1 todo. 31 behavioural tests. PiP/call-pill UI + the WebRTC plumbing pending.
      **`:feature:calls` now consumes the FSM** (slice `calls-viewmodel-screen`): a UDF `CallViewModel`
      (`StateFlow<CallUiState>`) folds accept/decline/hang-up/mute/camera intents + signalling events
      through `CallStateMachine.reduce`, with a pure `CallPresenter` projecting `CallState × CallConfig ×
      CallMedia → CallUiState` (status/answer/hang-up/media-toggle affordances, end-reason label,
      reconnect attempt). A minimal accent-coherent Compose call screen renders ringing/connecting/
      connected/ended and is reachable from **audio/video call buttons in the chat header** (iOS parity);
      dismissal returns to chat. +34 behavioural tests. WebRTC/signalling plumbing still pending.
      **Live in-call duration timer landed** (slice `call-duration-timer`): a pure `CallDuration.clock(
      seconds)` in `:core:model` is now the SSOT for call-length formatting (`M:SS` / `H:MM:SS`, `"0:00"`
      at zero), reused by `CallRecord.durationLabel`; `CallViewModel` runs a 1-Hz timer (injected
      `CallSecondsTicker` flow seam) exactly while connected/reconnecting, and `CallPresenter` derives a
      `CallUiState.durationLabel` — `"0:00"` the instant media connects, ticking up through a reconnect,
      frozen at the final length on the ended screen, and `null` for a call that never connected. The
      connected screen renders the running clock; the ended screen appends the final length. +18
      behavioural tests (6 formatter, 5 presenter, 7 VM).
- [ ] Live in-call transcription overlay (on-device speech-to-text, leader/follower)
- [ ] In-call translation data channel (dual-stream clean audio)
- [ ] In-call video filters (colour presets, low-light boost, background blur, skin smoothing)
- [ ] In-call audio effects (voice changer, baby/demon voice, looping background sound)
- [ ] Camera-covered ("dark frame") detection during video calls
- [~] Thermal-aware quality degradation (fps/resolution caps, video disable) — **policy layer landed**
      (slice `call-sender-cap-plan`): pure `ThermalCeiling`/`VideoSenderCapPlan` in `core:model` (port of
      iOS `VideoThermalProfile`) composes a device thermal tier onto the network sender cap. Pending: the
      app-side `PowerManager.THERMAL_STATUS_*` → `ThermalState` mapping + the live RTP-sender actuator.
- [~] Adaptive call quality (bitrate ladder, auto video-disable on critical link) —
      **quality-tier SSOT landed** (slice `call-quality-level`): pure `core:model`
      `VideoQualityLevel` (5-tier `CRITICAL<POOR<FAIR<GOOD<EXCELLENT`, port of iOS
      `VideoQualityLevel`) with `CallQualityThresholds` (the iOS `QualityThresholds`
      constants) + two classifiers `from(rttMs, packetLoss)` (worse-of-two-axes,
      strict `>` boundaries) and `from(availableOutgoingBitrateBps)`, plus each
      tier's sender caps (`targetResolutionHeight`/`targetFps`/`targetVideoBitrateBps`)
      the future adaptive-bitrate ladder will apply. **Time-hysteresis auto-video-disable
      policy landed** (slice `call-video-survival-policy`): the pure `core:model`
      `VideoSurvivalPolicy` (port of iOS `VideoSurvivalPolicy`) — `reduce(state, level,
      nowSeconds, userWantsVideo) → (state, VideoSurvivalAction)` drops outbound video to
      audio-only after a sustained `POOR`/`CRITICAL` streak (`Suspend`, 6 s) and resumes
      after a sustained `EXCELLENT`/`GOOD` streak (`Resume`, 10 s), with `FAIR` holding the
      recovery timer and a monotonic-seconds `VideoSurvivalState` (fixed-size, O(1) over a
      marathon call). Duration-based hysteresis (cadence-independent); user camera-off resets
      to `INITIAL`. +19 tests. **Adaptive sender-cap plan landed** (slice `call-sender-cap-plan`,
      2026-07-03): the pure `core:model` `VideoSenderCapPlan` maps a `VideoQualityLevel` (+ a
      framework-agnostic `ThermalState`) to the concrete RTP sender parameters
      (`maxBitrateBps`/`maxFramerate`/`scaleResolutionDownBy`) — `forLevel` reads each axis off the
      tier and floors CRITICAL to 360p15 @ 100 kbps (never a zero encoder / never an upscale);
      `forConditions` composes it with a `ThermalCeiling` (port of iOS `VideoThermalProfile`,
      `NOMINAL` a no-op) taking the more conservative value per axis. Closes the
      "Thermal-aware quality degradation" line at the policy layer. +17 tests. **Pending:** the real
      WebRTC actuator seam (map `PowerManager.THERMAL_STATUS_*` → `ThermalState`, apply the cap to the
      live RTP video sender, debounce re-apply) + consuming `Suspend`/`Resume`.
- [~] Connection-quality indicator; call-waiting banner (second incoming call) —
      **connection-quality indicator landed** (slice `call-quality-level`): the pure
      four-tier `ConnectionQuality` (`VideoQualityLevel` collapsed `CRITICAL→POOR`,
      parity with iOS `CallManager.connectionQualityLabel`) with `bars`(1–4)/`isWeak`;
      a `CallQualitySampler` stats seam (interim `NoopCallQualitySampler`) folded into
      `CallViewModel` exactly while media flows (connected/reconnecting), projected by
      `CallPresenter` into `CallUiState.connectionQuality` and rendered as an
      accent-coherent 4-bar signal indicator on the call screen (error hue on a weak
      link, VoiceOver tier label). +37 tests. The **call-waiting banner** landed
      (slice `call-waiting-banner`, 2026-07-03): pure `core:model` `WaitingCall` +
      `CallWaitingReducer` (Offered/Rejected/Accepted/RemotelyEnded), a
      `CallSignalManager.incomingOffers` identity stream, a `CallViewModel` fold that
      raises the banner for a *second* offer while active, a 15s auto-dismiss-as-reject
      `CallWaitingTimer` seam, `rejectWaiting()`/`acceptWaitingSwap()` (end-and-answer,
      parity with iOS `endCurrentAndAnswerPending`), and an accent-coherent top banner in
      `CallScreen`. +35 tests. The **`RemotelyEnded` socket driver** landed (slice
      `call-ended-signal-identity`, 2026-07-03): pure `CallSignalMapper.endedCallId` decode
      of a `call:ended`/`call:missed` frame's `callId`, a `CallSignalManager.endedCalls`
      identity stream (parallel to `incomingOffers`), and a `CallViewModel.onRemoteEnded`
      fold that auto-dismisses the banner + cancels its timer (no `emitEnd`) only for the
      *pending* call's id. +15 tests. The **identity-aware active-call teardown** landed (slice
      `call-ended-identity-teardown`, 2026-07-03): `call:ended`/`call:missed` are now `null` in
      `CallSignalMapper.map` (off the identity-less `events`); the single pure `endedSignal →
      CallEndedSignal(callId, event)` decode on `endedCalls: SharedFlow<CallEndedSignal>` is the
      sole teardown path, and `onRemoteEnded` gates on identity — active id reduces the FSM,
      waiting id only dismisses the banner, neither is inert — so a waiting call's fanned-out
      teardown no longer tears down the active call. **Pending:** the WebRTC stats source that
      feeds real quality samples.
- [ ] Front-camera mirroring; extensible call media pipeline hook bus
- [~] Voice/video call signaling events (initiate, answer, ICE, end, missed, media toggle) —
      **inbound event models + pure frame→`CallEvent` mapper landed** (slice `call-signalling-events`):
      `core:model` `me.meeshy.sdk.model.call` gains `@Serializable` payload types at parity with the iOS
      `MessageSocketManager` listen table (`CallInitiatedPayload`/`CallSignalEnvelope`+`CallSignalPayload`/
      `CallParticipantPayload`/`CallEndedPayload`/`CallMissedPayload`/`CallMediaTogglePayload`/
      `CallErrorPayload`/`CallAlreadyAnsweredPayload`) plus a total, side-effect-free `CallSignalMapper.map(
      eventName, rawJson)` routing each `call:*` frame into the FSM vocabulary: `call:initiated`→
      `ReceiveIncoming`, `call:participant-joined`→`ParticipantJoined`, `call:signal` type=`answer`→
      `RemoteAnswer` (offer/ice-candidate inert), `call:ended` reason=`missed`→`RingTimeout` else
      `RemoteHangUp`, `call:missed`→`RingTimeout`, `call:error`→`ConnectionFailed(msg)`,
      `call:already-answered`→`RemoteHangUp`; `call:media-toggled` + malformed/unknown frames → `null`
      (inert, never crashes). +22 behavioural tests. **Socket subscription + outbound emit table landed**
      (slice `call-signal-manager`): `:sdk-core` `CallSignalManager` (mirrors `SocialSocketManager`/
      `MessageSocketManager`) — `attach()` listens to all 8 inbound `call:*` frames, routes each through
      `CallSignalMapper`, and republishes the mapped `CallEvent` on a hot `SharedFlow<CallEvent> events`
      the `CallViewModel` will fold; a non-JSONObject arg / malformed / inert frame emits nothing.
      Outbound fire-and-forget emit table at iOS-exact payload keys: `emitJoin`/`emitLeave`/`emitEnd`
      (`{callId}`), `emitToggleAudio`/`emitToggleVideo` (`{callId, enabled}`), `emitSignal`
      (`{callId, signal}`). +18 behavioural tests. **ACK-based `call:initiate` landed** (slice
      `call-initiate-ack`): `core:model` gains the pure `SocketIceServer` (with
      `IceServerUrlsSerializer` normalising the gateway's single-string-or-array `urls` to a `List`),
      `CallInitiateAck` (`callId`/`mode`/`iceServers`/`ttlSeconds`), the sealed `CallInitiateResult`
      (`Success`/`ServerError`/`Malformed`/`Timeout`), and the total `CallInitiateAckParser.parse(rawJson)`
      — parity with the iOS `emitCallInitiate` guard (`success:true` + non-blank `data.callId` → `Success`;
      else the gateway error from `error.message` → bare-string `error` → `"unknown error"`; undecodable
      body → `Malformed`). `:sdk-core` `CallSignalManager.emitInitiate(conversationId, isVideo)` is the
      suspend transport: emits `call:initiate` with `{conversationId, type}`, awaits the ACK within a 10s
      budget (iOS parity), delegates the body to the parser, and maps a missing/non-object ACK to
      `Timeout`. +26 behavioural tests (21 parser: success incl. minimal/unknown-keys, single vs array
      urls, TURN creds, every ServerError fallback incl. non-string error, Malformed bad-JSON/bad-shape,
      robust urls dropping; 5 manager: payload keys, video/audio, ServerError, no-ACK Timeout,
      non-JSONObject Timeout). **VM-fold landed** (slice `call-viewmodel-signal-fold`): the
      `:feature:calls` `CallViewModel` now folds `CallSignalManager.events` in `viewModelScope` (each
      mapped `CallEvent` reduced through the FSM, so a peer answer / remote hang-up / stall drives the
      screen with no manual wiring); an **outgoing** `start` mints the real `callId` via `emitInitiate`
      (optimistic ring first, then `Ended(Failed)` on a rejected/timed-out/malformed ACK — the gateway
      message surfaced on `ServerError`); and accept/decline/hang-up/mute/camera fan out to
      `emitJoin`/`emitEnd`/`emitToggleAudio`/`emitToggleVideo`, each **keyed by the known `callId`** and
      inert until one is known (outgoing minted, incoming from `CallConfig.callId`). +14 behavioural tests.
      **App-level socket-lifecycle caller landed** (slice `realtime-session-coordinator`): the whole
      realtime layer was dead — nothing called `SocketManager.connect()` and no `*.attach()` ran, so
      `CallSignalManager.events` (and every `message:*`/social frame) never flowed. `:sdk-core`
      `RealtimeSessionCoordinator.onAuthenticatedChanged(isAuthenticated)` is the auth→socket bridge:
      sign-in `connect()`s **then** attaches message/social/call, sign-out `disconnect()`s, edge-only (no
      double-connect). Ordering (connect-before-attach) + edge invariants live in the pure
      `RealtimeLifecyclePlan`; **attach is paired with every connect** so a logout→login re-attaches on
      the new socket. Driven by `AuthViewModel` at init (restored token) / login / logout. +16 behavioural
      tests. **Outgoing-call room threading landed** (slice `call-nav-conversation-thread`): the `:app`
      CALL route previously dropped the `conversationId`, so `CallViewModel.start` → `emitInitiate("", …)`
      fired into an empty room (every outgoing call dead-on-arrival). A pure
      `me.meeshy.app.navigation.CallRoute` (`PATTERN`/`path`/`config(conversationId?, peerName?, isVideo?)
      → CallConfig`) now owns the route as the SSOT; the CHAT composable threads its own `conversationId`
      nav-arg into `Routes.call(...)` and the CALL composable decodes the args through `CallRoute.config`.
      Outgoing calls now initiate into the real room. +8 behavioural tests (first `:app` test source set).
      **WebRTC-plumbing emits landed** (slice `call-webrtc-plumbing-emits`): `CallSignalManager` gains the
      five remaining outbound frames at iOS payload-key parity — `emitRequestIceServers(callId)`
      (`call:request-ice-servers`, TURN-credential refresh), `emitHeartbeat(callId)` (`call:heartbeat`,
      dead-peer liveness), `emitQualityReport(callId, report)` (`call:quality-report`, `{callId, stats}`),
      `emitReconnecting(callId, participantId, attempt)` and `emitReconnected(callId, participantId)`
      (ICE-restart bookkeeping). The `stats` shape is decided once by the pure `core:model`
      `CallQualityReport.statsFields()` — base five metrics always present, `availableOutgoingBitrateBps`
      and `jitterMs` appended only when strictly positive (iOS parity); `ConnectionQuality.wireValue`
      (`excellent|good|fair|poor`) is the SSOT for the `level` token. Byte counters modelled as `Long`
      (iOS `Int`) so a long call's cumulative totals never overflow the 32-bit range. +16 tests (10 report,
      6 manager). **Pending:** the app-side driver seams (heartbeat/quality-report timers, ICE-restart
      controller) that call these emits — land with the WebRTC media transport.
- [x] Call history / journal (recent + missed calls list, direction, duration, data usage) —
      **pure call-journal model landed** (slice `call-history-model`): `core:model`
      `me.meeshy.sdk.model.call` gains `CallDirection` (incoming/outgoing/missed, `fromRaw` degrades
      unknown → incoming, parity with iOS `CallDirection(raw:)`), `CallMediaType` (audioOnly/audioVideo,
      port of `WebRTCTypes.swift`), the `@Serializable` `CallHistoryPeer`, and `@Serializable` `CallRecord`
      mirroring the gateway `CallHistoryItem` REST contract (`GET /api/v1/calls/history`) field-for-field
      (timestamps kept as ISO-8601 strings → `:core:model` stays date-dependency-free). Pure display
      accessors are the single tested SSOT a future list renders: `directionKind`/`isMissed`, `mediaType`,
      four-tier `displayName` (peer display → peer username → conversation title → "Inconnu", blank-skipping,
      surpasses iOS's empty-only skip), `avatarUrl` (peer → conversation fallback), `durationLabel`
      (`M:SS`/`H:MM:SS`, empty at zero), `dataLabel` (deterministic locale-independent byte ladder, null
      when no counters / zero total). +22 behavioural tests (every direction arm incl. unknown, name/avatar
      fallbacks, hour boundary, byte-ladder + guards, gateway-shaped JSON decode with/without peer). The
      call-history repository landed (slice `call-history-repository`): `:core:network`
      `CallHistoryApi` (`GET calls/history?cursor&limit&filter`), `:core:database` `CallHistoryEntity`/
      `CallHistoryDao` (DB v6→v7, destructive fallback), and `:sdk-core` `CallHistoryRepository` — a
      cache-first SWR stream (`historyStream()` via `CallHistoryCacheSource`, port of the `StoryCacheSource`
      pattern, `CachePolicy.CallHistory` fresh 60s / keep the 3-month window) plus a cursor-paginated raw
      `fetchPage(cursor, limit, missedOnly) → CallHistoryPage(records, nextCursor, hasMore)` the list UI
      will drive for older pages. +17 behavioural tests (DAO order/upsert/deleteNotIn/clear; cold-cache
      Empty, refresh persist + prune + sync-meta, Fresh-after-refresh, sync-exception, fetchPage
      pagination/no-pagination/all+missed filter forwarding/failed-envelope/network-exception). The
      recent/missed-calls **list UI landed** (slice `call-history-list`): a UDF `CallHistoryViewModel`
      (`StateFlow<CallHistoryUiState>` over `historyStream()`) with cache-first SWR flags (skeleton only
      on cold empty), a client-side missed-only filter, cursor-paged infinite scroll via `fetchPage`
      (de-dup, cursor advance, `hasMore`/re-entrancy/failure gating), and pull-to-refresh that resets
      paging — backed by pure `CallHistoryList` (combine+filter) and `CallTimeLabel` (ISO → relative
      label), rendered by an accent-coherent `CallHistoryScreen` (avatar rows, direction icon with
      missed=error colour, relative time, All/Missed filter chips, skeleton/empty states). +30
      behavioural tests. The dedicated Calls **tab landed** (slice `calls-tab-nav`): `Routes.CALLS`
      (`Call` icon, order Messages · Feed · **Calls** · Activity · Profile) mounts `CallHistoryScreen`
      in the `NavHost`; tapping a journal row re-dials via the pure `CallRoute.redial(record)` (threads
      the record's conversation, resolved `displayName` and media into the outgoing-call route, identical
      to a chat-header call). +4 behavioural tests. (The outgoing-call `conversationId` threading + folding
      `CallSignalManager.events` into `CallViewModel` both landed — see the signalling row above.)

## I. Communities
- [ ] Community creation (name, `mshy_` identifier, description, emoji, privacy, initial members)
- [ ] Community detail (banner, stats, channels list, role-based actions)
- [ ] Add existing conversation as a channel (incl. move from another community)
- [ ] Member invite (user search + invited tracking); member management (roles, promote/demote, remove)
- [ ] Community settings (avatar/banner upload, colour/emoji, privacy, delete/leave)
- [ ] Role-based community permissions
- [ ] Community invite links: list, stats, detail, copy/share

## J. Contacts & Friends
- [x] Contacts hub: 4 tabs (Contacts / Requests / Discover / Blocked) with badges —
      `:feature:contacts` hub reachable from the conversations top bar (People icon),
      4-tab `TabRow` with a live count badge on the **Requests** tab ; **all four tabs
      are now live** (Contacts / Requests / Discover / Blocked) — no placeholder remains
      (slice `contacts-blocked-list`, 2026-07-04). **Pending:** per-tab count badges beyond
      Requests (Blocked/Discover counts).
- [~] Contacts list (online/offline filters + counts, search, presence + mood-emoji) —
      **filters + search + presence + per-filter counts shipped**. Filters/search/presence landed in
      `contacts-list-friends`: the Contacts tab renders the online-first friend list with an
      All/Online/Offline `FilterChip` row, a search field (matches username or resolved name), and a
      per-row presence dot. **Per-filter counts shipped** (slice `contacts-filter-counts`,
      2026-07-04): the pure `:core:model` `ContactList.counts(friends, query) → ContactFilterCounts`
      (all/online/offline sizes under the active search; online+offline partition all by construction)
      is the SSOT, exposed on `ContactsListUiState.filterCounts` and rendered as a count badge on each
      chip. Surpasses iOS, whose counts ignore the search field. **Three-state presence dot shipped**
      (slice `presence-away-indicator`, 2026-07-04): the previously-dead `:core:model` `UserPresence.state(now)`
      is now the pure SSOT (port of iOS `UserPresence.state` — offline → no dot, online → green,
      online-but-idle > 5min → amber away), reached via the `FriendRequestUser.presenceState(now)` adapter,
      and the friend row renders green/amber/none accordingly. **Pending:** mood-emoji presence.
- [x] Cache-first friends list with cross-screen reconciliation; online-first sorting —
      **shipped** (slices `friendship-relationship-resolver` + `contacts-list-friends`). The store
      landed first: `:sdk-core` `@Singleton FriendshipCache` (port of iOS `FriendshipCache`) is the
      in-memory SSOT for the friend graph. The **list** now landed: the pure `:core:model` `ContactList`
      folds accepted received+sent requests into the online-first (then most-recently-active) friend
      list (port of iOS `ContactsListViewModel.fetchFriendsFromNetwork`), `ContactsListViewModel`
      hydrates the cache and reconciles the shown list against it on every cross-screen mutation
      (removals apply locally via `ContactList.reconcile`, additions trigger a single silent refetch —
      port of iOS `reconcileWithCache`), and `ContactList.visible` is the pure filter+search SSOT.
      `FriendshipCache.currentFriendIds` exposes the defensive friend-id snapshot the reconcile reads.
      **Cold-start paint shipped** (slice `contacts-friends-room-cache`, 2026-07-04): a persistent Room
      `friends` cache (iOS `CacheCoordinator.friends`) — `:core:database` `FriendEntity`/`FriendDao`
      (DB v7→8; `sortIndex` preserves `ContactList`'s assembled order verbatim, so the ordering SSOT
      stays in `ContactList`), `:sdk-core` `FriendListRepository` (`cachedSnapshot` distinguishing cold
      from synced-empty via `sync_meta`, `persist` write-through), and `ContactsListViewModel` rewired
      cache-first: it paints the last-persisted roster instantly (skeleton only on a cold cache), writes
      the assembled roster back through on every load, and prune-writes-through on a cross-screen
      unfriend (no refetch). +14 tests. +52 tests total for the Contacts list
      (25 `ContactList`, +2 `FriendshipCache`, 17 `ContactsListViewModel`, 8 `FriendListRepository`).
- [x] Friendship status resolution (friend / pending sent / pending received / blocked) —
      **shipped** (slice `friendship-relationship-resolver`): the pure `:core:model`
      `UserRelationshipRules.resolve(target, currentUserId, isBlocked, friendship)` is the total
      precedence SSOT (blank→None, current wins over block wins over friendship, port of iOS
      `UserRelationshipResolver`), with `FriendshipStatus` + `UserRelationshipState` (`isPending`)
      pure models. The `:sdk-core` `UserRelationshipResolver` supplies the live inputs (the
      `FriendshipCache` status + a `BlockStatusProvider` fun-interface seam + a current-user
      provider). **The block seam is now bound** (slice `contacts-blocked-list`): the `:sdk-core`
      `@Singleton BlockCache` (blocklist SSOT, hydrated by `BlockRepository`) backs the
      `BlockStatusProvider` in `DiscoverViewModel`, so a blocked user resolves live to `Blocked`
      everywhere. +31 behavioural tests (10 rules, 13 cache, 8 resolver).
- [x] Send / accept / decline / cancel friend request — **Requests tab** lists received +
      sent requests (avatars tinted by deterministic `DynamicColorGenerator.colorForName`),
      with optimistic accept / decline (`respond`) + cancel (`deleteRequest`), in-flight
      guard (`pendingActionIds`) and snapshot rollback on failure (9 ViewModel tests, EN/FR/ES/PT).
      **Durable send now shipped** (slice `friend-request-outbox-idempotency`, 2026-07-04): the
      Discover connect flips the shared `FriendshipCache` optimistically + instantly (even offline),
      keyed by the outbox `cmid` as a placeholder request id, and queues a `SEND_FRIEND_REQUEST`
      row on the new `OutboxLanes.FRIEND` lane. The `OutboxCoalescer` dedups a repeated send to the
      same receiver (idempotent — only one request can exist, latest greeting wins); the
      `OutboxFlushWorker` sender delivers via `FriendRepository.sendFriendRequest`, classifies the
      outcome through the pure `FriendRequestSend.classify` (409/blank-id → idempotent already-exists,
      other 4xx → permanent reject + rollback, 5xx/offline → retry), and grafts the real request id
      back over the placeholder on delivery; a hard exhaust rolls the pending back. **Also fixed a
      latent bug**: `OutboxLanes.BLOCK` (and now `FRIEND`) were never in the worker's drain list, so
      block/unblock rows never delivered — both lanes are now drained. *(Hardened structurally
      2026-07-05 `outbox-lane-map-ssot`: the worker now derives its drain list from the
      `OutboxLaneMap` kind→lane SSOT, so a sender can never again be stranded off an undrained lane.)*
      Surpasses iOS (online-only
      send). +26 tests (9 `FriendRequestSend`, 3 `OutboxCoalescer`, 5 `FriendRepository`, 4 net
      `DiscoverViewModel`). Remaining: send **compose-new** UI (user-search entry point → connect)
- [ ] Invite by email; invite by SMS; import phone contacts
- [x] Discover suggestions (cache-first) + live user search with inline connect —
      **live search + inline connect shipped** (slice `discover-user-search`): the Discover tab
      (was `ComingSoon()`) now runs a debounced-by-threshold user search (pure `:core:model`
      `DiscoverSearch.action` — trim + ≥2-char gate, port of iOS `performSearch` guard) via
      `UserRepository.searchUsers`, and renders each result with an inline connect control whose
      state is the shared `UserRelationshipResolver` (pure `:core:model` `ConnectAction.from`,
      port of iOS `ConnectionActionView`): Connect / Pending / Accept / Contact / Blocked / Hidden.
      `connect` sends a request (row flips to Pending once the gateway mints the id), `acceptReceived`
      accepts an inbound one optimistically with rollback; a cross-screen friendship change re-derives
      every visible row via the `FriendshipCache.version` stream, so Discover stays in lock-step with
      the Requests tab. **The empty-query cache-first suggestions list now landed too** (slice
      `discover-suggestions-cache-first`, 2026-07-04): a `:sdk-core` `@Singleton SuggestionsRepository`
      (in-memory `SwrCacheSource` over `searchUsers("")`, reusing the shared `cacheFirstFlow` +
      `CachePolicy.Suggestions`) feeds a pure `DiscoverSuggestions.snapshot(CacheResult) →
      SuggestionsSnapshot` projection (skeleton only on cold empty; any cached data paints without a
      spinner; a revalidated-empty list is a quiet empty state). `DiscoverViewModel.loadSuggestions()`
      (called on tab appear, iOS `.task`) streams it into the same `rows`/connect-control surface, so
      suggestions get live relationship badges and cross-screen re-derivation for free; a search cancels
      it and switches surfaces, `retry` re-runs it. Surpasses iOS's `.task`-reload with an in-memory
      singleton cache that paints instantly on a return visit. +23 tests (6 `DiscoverSuggestions`, 5
      `SuggestionsRepository`, 12 `DiscoverViewModel`). **The suggestions cache is now durable too**
      (slice `discover-suggestions-room-cache`, 2026-07-04): the in-memory `SwrCacheSource` was replaced
      by a Room-backed `RoomSuggestionsSource` — `:core:database` `SuggestionEntity`/`SuggestionDao`
      (DB v8→9, `discover_suggestions` table, `sortIndex` preserves the gateway ranking), persisting the
      last empty-query fetch so the Discover tab paints suggestions **on a cold launch**, before any
      network call, surviving process death (iOS `CacheCoordinator.userSearch` parity). Cold (`null`) vs
      synced-empty is distinguished via `sync_meta`; a failed revalidation keeps the last good list. The
      `SuggestionsRepository`/`DiscoverViewModel` public surface is unchanged, so no consumer moved. This
      closes the **last in-memory-only cache gap** (mirroring `FriendEntity`/`CallHistoryEntity`). 11
      tests (Robolectric + in-memory Room; replaced the 5 in-memory-source tests).
- [x] Blocked-users list with confirm-to-unblock; optimistic unblock with rollback —
      **shipped** (slice `contacts-blocked-list`, 2026-07-04): the Blocked tab (was placeholder)
      renders the blocklist from `BlockRepository.listBlocked()` (which hydrates the shared
      `:sdk-core` `BlockCache` SSOT), skeleton only on cold empty, error+retry, empty state.
      Unblock pops an `AlertDialog` confirm, then removes the row optimistically (VM restores the
      snapshot + surfaces the error on network failure), guarded against double-taps via
      `pendingIds`. Pure `:core:model` `BlockedUser` + `resolvedName`; `:core:network` `BlockApi`
      (`GET users/me/blocked-users`, `POST/DELETE users/{id}/block`, iOS `BlockService` parity).
      +29 tests (4 `BlockedUser`, 9 `BlockCache`, 6 `BlockRepository`, 9 `BlockedListViewModel`,
      +1 `DiscoverViewModel` seam). **Durable offline unblock now shipped** (slice
      `block-outbox-durable`, 2026-07-04): the write path moved off online-first REST onto the
      shared durable outbox. Two new `OutboxKind`s (`BLOCK_USER`/`UNBLOCK_USER`) on a dedicated
      `OutboxLanes.BLOCK` lane, an `OutboxCoalescer.blockToggle` rule (block+unblock of the same
      user annihilate — the toggle returns to the last-synced server state, exactly like a reaction
      toggle; a repeated block/unblock is superseded — idempotent terminal state), two
      `OutboxFlushWorker` senders (`blockApi.block`/`unblock` → Success/TransientFailure) and an
      `onExhausted` rollback that flips the `BlockCache` SSOT back so the next `listBlocked` re-hydrates
      truthfully. `BlockRepository.setBlockedDurably(userId, blocked)` flips the cache optimistically +
      enqueues (blank id inert; returns the cmid, or `null` when the enqueue annihilated a pending
      opposite); `BlockedListViewModel.unblock` calls it, wakes the flush worker only on a real cmid,
      and rolls the row back in place on a local enqueue failure. Survives offline + process death,
      surpassing iOS's online-only block/unblock. +12 tests (6 coalescer, +4 net `BlockRepository`,
      +2 net `BlockedListViewModel`). **Pending:** durable offline-queued *block* from a future
      profile/report surface (the `setBlockedDurably(.., true)` half is ready, awaiting its UI).

## K. Profile & Account
- [~] View profile (by id / username / public handle / email / phone) — `:feature:profile`
      `ProfileScreen`/`ProfileViewModel` load own (session) or other (`getProfile(id)`) profiles.
      **Header enrichment shipped** (slice `profile-header-presentation`, 2026-07-05): the pure
      `ProfileHeaderBuilder.build(user, now) → ProfileHeaderPresentation` (`:feature:profile`, precedent
      `FeedPostBuilder`) is the tested SSOT for the read-only header — display-name ladder (reuses
      `MeeshyUser.effectiveDisplayName`), `@handle`, blank→null optional fields, presence (reuses
      `UserPresence.state`), completion % clamped `0..100`, E2EE flag (`signalIdentityKeyPublic`
      present), and member-since epoch (reuses `isoToEpochMillisOrNull`). **Pending:** resolve by
      public handle / email / phone; banner.
- [~] Full profile sheet: banner, identity, Profile / Conversations / Stats tabs, achievements —
      **identity block advanced** (slice `profile-header-presentation`): the read-only `ProfileScreen`
      now renders the presence dot (green/amber, semantic, bordered) overlaid on the avatar, the
      accent-coloured completion ring around it, an E2EE lock badge, and a localized "member since"
      line (EN/FR/ES/PT). **Secondary identity rows shipped** (slice `profile-details-rows`, 2026-07-05):
      the pure `ProfileDetailRows.build(header) → List<ProfileDetailRow>` projects the primary/secondary
      language (flag + name via the `LanguageData` SSOT, unknown code → uppercased raw), the country
      (ISO alpha-2 → regional-indicator flag + uppercased code, non-code → plain text), and the timezone
      into an ordered, tested list the sheet renders as label↔flag+value rows; a regional language equal
      to the system one (case-insensitively) is collapsed. `timezone` added to the header presentation.
      +14 `ProfileDetailRowsTest` cases. **Pending:** banner, tabs (Profile/Conversations/Stats), achievements.
- [~] Edit profile (avatar + banner upload, display name, bio, content languages) — optimistic + offline save
      **Text + content-language editing shipped optimistic + offline** (slice `edit-profile-optimistic`,
      2026-07-05): the already-declared `OutboxKind.UPDATE_PROFILE` (lane `PROFILE`, drained but senderless)
      is now wired end-to-end. Pure cores: `:core:model` `ProfileEditApply.apply(user, request)` — the
      edit-merge SSOT with `PATCH /users/me` omit-null parity (a null field is absent → unchanged, non-null
      overwrites) so the optimistic paint matches the server exactly; `:feature:profile`
      `ProfileEditRequestBuilder.build(...)` — trims the editor buffers and degrades blank→null (a blank edit
      is a server-side no-op, never an accidental clear); and the `OutboxCoalescer` `UPDATE_PROFILE` rule
      (latest full-snapshot wins, keyed by the own user id). Wiring: `SessionRepository.applyProfileEdit`
      (optimistic republish of the merged identity, inert with no session), `UserRepository.enqueueProfileEdit`
      (optimistic flip + durable enqueue on the profile lane, `null`/blank session inert — mirrors
      `setBlockedDurably`), an `OutboxFlushWorker` `UPDATE_PROFILE` sender (decode → `updateProfile` →
      `adopt(server user)`) with an `onExhausted` `refresh()` rollback to server truth. `ProfileViewModel`
      now carries the three content-language buffers, saves through the optimistic/offline path (editor
      closes instantly, worker woken only on a real `cmid`, local-enqueue failure reopens the editor), and
      guards the editor buffers from being clobbered by a background session emission mid-edit. `ProfileScreen`
      renders three `LanguageData`-backed content-language dropdowns (flag + name) in the edit form (EN/FR/ES/PT).
      +31 tests (ProfileEditApply 7, ProfileEditRequestBuilder 6, OutboxCoalescer +3, SessionRepository +2,
      UserRepository 4, ProfileViewModelEdit 9). Surpasses iOS, whose profile edit is online-only.
      **First/last-name fields shipped** (slice `edit-profile-name-fields`, 2026-07-06): the `firstName`/
      `lastName` legs of the already-name-aware `ProfileEditApply`/`UpdateProfileRequest` are now reachable
      from the editor. `ProfileEditRequestBuilder.build` gained `firstName`/`lastName` buffers (same trim +
      blank→null degrade — a blank name is a server no-op, never an accidental clear); `ProfileViewModel`
      seeds/reads them via two new `StateFlow` buffers + `onFirstNameChange`/`onLastNameChange` intents and
      `withBuffersFrom` (a user with no names → blank buffers, not "null"); `ProfileScreen` renders First name /
      Last name `OutlinedTextField`s above Display name (Words capitalization, EN/FR/ES/PT). +6 tests
      (ProfileEditRequestBuilder +3, ProfileViewModelEdit +3; existing save/cancel cases hardened to assert the
      name legs too). Reuses the whole optimistic/offline machinery — no new store, no new outbox kind.
      **Pending:** avatar + banner upload (media pipeline).
- [~] User stats dashboard: stat cards, 30-day activity timeline chart, achievement badges —
      **stats projection SSOT + read-only dashboard shipped** (slice `profile-stats-presentation`,
      2026-07-05): the pure `UserStatsBuilder.build(stats) → UserStatsPresentation` (`:feature:profile`,
      precedent `ProfileHeaderBuilder`) projects the six counter tiles (fixed order, negative counts
      floored, compact boundary-safe `formatCompactCount` K/M/B labels that never render `1000.0K`) and
      the achievement badges — every server value reconciled defensively (progress clamped `0..100`,
      `isUnlocked` recomputed from `current >= threshold`, negative current/threshold floored) then ranked
      unlocked-first → progress desc → current desc → id. `ProfileViewModel` fetches
      `getUserStats(id)` once per resolved user (own = session id, other = `getProfile` id) and projects
      into `ProfileUiState.stats`; a stats failure/throw never clobbers the profile or surfaces an error.
      `ProfileScreen` renders a counter-tile grid + an "N of M unlocked" achievements list (EN/FR/ES/PT).
      +35 tests (`UserStatsBuilderTest` 24, `ProfileViewModelStatsTest` 5, +existing). **30-day activity
      timeline shipped** (slice `profile-stats-timeline`, 2026-07-05): `UserApi.getUserStatsTimeline(days)`
      + `UserRepository.getUserStatsTimeline(days=30)` (me-only `/users/me/stats/timeline`, `days` clamped
      to the gateway `7..90` window) feed the pure `StatsTimelineBuilder.build(points) →
      StatsTimelinePresentation?` (`:feature:profile`, precedent `UserStatsBuilder`): empty → `null`
      (nothing to chart), non-empty all-zero → a flat presentation with `hasActivity=false`, negative
      counts floored, each bar peak-normalized `0f..1f` (no divide-by-zero), input order preserved
      (oldest→newest), `DD/MM` axis labels ported from iOS `shortDate` (malformed date → raw), plus
      total / rounded per-day average / active-day count. `ProfileViewModel` fetches it once for the
      **own** profile only (me-only endpoint — never for a viewed id), failure-inert like stats;
      `ProfileScreen` renders an accent-coherent line+area sparkline (Canvas) with an empty-state label
      (EN/FR/ES/PT). +17 tests (`StatsTimelineBuilderTest` 11, `ProfileViewModelTimelineTest` 6).
      **Durable Room cache shipped** (slice `profile-stats-room-cache`, 2026-07-05): `:core:database`
      `ProfileStatsCacheEntity`/`ProfileStatsCacheDao` (`profile_stats_cache` keyed JSON store, DB v9→v10) +
      `:sdk-core` `ProfileStatsCacheRepository` (per-user stats key + me-only timeline key; cold-vs-synced-empty
      by row presence — absent → `null`, present `[]` → `emptyList`; undecodable payload → cache miss).
      `ProfileViewModel` rewired cache-first for both surfaces (paint cached projection → revalidate →
      write-through on success; network overwrites cache, a failed fetch keeps the cached paint). This is the
      Android analogue of iOS `CacheCoordinator.stats`/`.timeline` and closes the §K cache gap. +20 tests
      (`ProfileStatsCacheRepositoryTest` 11 Robolectric, `ProfileViewModelCacheTest` 6, +3 existing hardened).
      **Pending:** the dedicated full-screen dashboard.
- [x] Profile completion ring — **shipped** (slice `profile-header-presentation`, 2026-07-05): the
      accent-coloured `ProfileCompletionRing` Canvas arc around the avatar, driven by the pure
      `ProfileHeaderPresentation.completionPercent` (clamped `0..100` so a malformed server value never
      over/under-fills the ring), plus a "Profile N% complete" label. 22 `ProfileHeaderBuilderTest` cases.
- [ ] Profile QR code display + save/share; share profile via message/email/copy link
- [ ] Block / unblock users; report a user (reason + details)
- [ ] Change email / phone (two-step verification)
- [ ] Two-factor auth: QR enrollment, code verification, backup codes (view + regenerate), disable
- [ ] Active device sessions: list, revoke one, revoke all others
- [ ] Voice-cloning onboarding wizard (consent → 18+ age gate → record ≥3 samples → process)
- [ ] Voice-profile management (status, cloning toggle, sample add/list/delete, GDPR delete-all)

## L. Settings & Privacy
- [ ] Settings hub: profile card, appearance/theme + interface language, notifications,
      transcription, voice profile, data, tools, support, about, logout
- [x] Light/dark/system theme with persisted preference — pure `AppThemeMode`
      codec/resolver/cycle (`:core:model`, `resolveDarkMode`/`storageValue`/`next`/
      `appThemeModeFromStorage`), durable DataStore-backed `ThemeStore` (`:sdk-core`,
      hydrates on cold start, corrupt value → AUTO), `SettingsViewModel` pick/cycle
      intents + segmented picker, `MainActivity` re-themes live via `ThemeViewModel`
      (`settings-theme-mode`, 2026-07-05). +23 tests.
- [x] Interface (UI chrome) language with persisted preference — pure `AppLanguage`
      supported-set/codec/resolver (`:core:model`, `supportedCodes` from
      `LanguageData.interfaceLanguages`, `fromStorage`/`storageValue`/`resolveInterfaceLocaleTag`;
      corrupt/legacy/unsupported → System `null`), durable DataStore-backed
      `InterfaceLanguageStore` (`:sdk-core`, hydrates on cold start), `SettingsViewModel`
      pick intent + display-language dialog picker (System + fr/en/es/ar), `MainActivity`
      re-localises the whole Compose tree live via `LanguageViewModel` +
      `createConfigurationContext` (minSdk-26 safe, no AppCompat) (`settings-interface-language`,
      2026-07-05). +32 tests. NB: **display** language only; the **regional** language row is a
      Prisme *content*-preference (backend profile), not the app UI locale — shipped separately below.
- [x] Regional (secondary content) language preference — the last Settings language row, now live
      (`settings-regional-content-language`, 2026-07-06). Distinct from the interface language: it is a
      Prisme *content* preference resolved via `LanguageResolver`, so it is stored on the backend profile
      (`User.regionalLanguage`) — NOT the device-local `InterfaceLanguageStore`. Pure `:feature:settings`
      `RegionalLanguageSelection.build(regionalCode, systemCode, query) → RegionalLanguagePresentation`
      SSOT: options are the full content-language set (`LanguageData.allLanguages`, not the 4 interface
      languages), the current choice is marked (trimmed/case-insensitive; blank/absent/unknown → no
      label, no crash), the **primary (system) language is hidden** so a user can never pick their primary
      as their secondary (unless it *is* the stored choice — a data-inconsistency never hides the active
      selection), and a trimmed case-insensitive search spans English name / native name / code. Wired
      through the existing optimistic + offline-queued profile-edit path: `SettingsViewModel`
      `setRegionalLanguage(code)` → `UserRepository.enqueueProfileEdit(UpdateProfileRequest(regionalLanguage=…))`
      (session repaints instantly, durable `UPDATE_PROFILE` row, worker woken only on a real `cmid`; a
      sessionless/superseded enqueue is inert) — reusing the `edit-profile-optimistic` machinery, **no new
      store**; `SettingsScreen` renders the searchable flag+native-name dialog (mirrors the notification-type
      search) with the current value as the row detail. +24 tests (18 pure-core, 6 VM). Surpasses iOS, whose
      regional-language write is online-only. (EN/FR/ES/PT strings.)
- [~] Notification preferences (push/email/sound/vibration, per-event types, DND schedule) —
      **durable master toggles landed** (`settings-notification-prefs`, 2026-07-05): pure
      `:core:model` JSON codec for the whole `UserNotificationPreferences` block
      (`storageValue`/`notificationPreferencesFromStorage` — blank/absent/corrupt/partial/unknown-key
      → safe defaults, never crashes), durable DataStore-backed `NotificationPreferencesStore`
      (`:sdk-core`, hydrates on cold start, corrupt stored value → defaults), `SettingsViewModel`
      per-toggle intents (push/new-message/sound/vibration) that persist the whole block without
      clobbering the other fields, `SettingsScreen` state-driven `Switch` rows (push is the master —
      the three sub-toggles disable when push is off). +25 tests. **DND schedule editor landed**
      (`settings-dnd-schedule`, 2026-07-05): pure `:core:model` `DndWindow` SSOT (port of iOS
      `isInDoNotDisturbWindow`) — `isActive(prefs, weekday, minuteOfDay)`/`isActive(prefs, LocalDateTime)`
      (enable gate · midnight-wrap · per-day gating · corrupt-`HH:mm` → never-active),
      `parseMinuteOfDay`/`formatTimeOfDay` (range-clamped) codec, `toggleDay` (canonical Mon→Sun,
      dedup), `DndDay`↔ISO-`DayOfWeek` mapping; `SettingsViewModel` `setDndEnabled`/`setDndStart`/
      `setDndEnd`/`toggleDndDay` intents persisting the whole block; `SettingsScreen` DND rows
      (master toggle + Material3 24h `TimePicker` from/until rows + Mon→Sun `FilterChip` day selector +
      a **live "quiet hours active now" status** computed from `DndWindow.isActive`). +32 tests
      (EN/FR/ES/PT strings). Surpasses iOS which has no live-status readout in its editor.
      **Per-event notification type toggles landed** (`settings-notification-type-toggles`, 2026-07-06):
      pure `:core:model` `NotificationTypeCatalog` SSOT — 17 `NotificationType`s each with a `get`/`set`
      lens over its `UserNotificationPreferences` boolean (`toggle`/`isEnabled` edit exactly one, never
      clobber), grouped by 5 ordered `NotificationCategory`s (Messages · Calls · Social · Groups · System)
      via `sections(prefs, query, label)` with a locale-aware injected-label case-insensitive/trimmed search
      that omits empty categories; `SettingsViewModel` `setNotificationTypeEnabled`/`setNotificationTypeQuery`;
      `SettingsScreen` search field + accent category headers + push-gated per-type switches + empty-state.
      +14 tests (22 new strings ×EN/FR/ES/PT). Surpasses iOS which lists the same toggles without an in-section
      search filter. **Offline-queued backend sync landed** (`settings-notification-prefs-sync`, 2026-07-06):
      the previously-dead `OutboxKind.UPDATE_SETTINGS`/`OutboxLanes.SETTINGS` declarations are now wired
      end-to-end — pure `:core:model` `NotificationPreferenceSyncBody.from(prefs)` projects the block into the
      gateway `PATCH /me/preferences/notification` wire contract (all 30 fields, `extras` dropped, `dndDays` as
      lowercase tokens); `core/network` `PreferencesApi`; `:sdk-core` `NotificationPreferencesSyncRepository`
      (session-gated durable enqueue keyed by own user id; inert with no session) + an `OutboxCoalescer`
      latest-snapshot rule (an offline toggle burst collapses to one PATCH) + an `OutboxFlushWorker`
      `UPDATE_SETTINGS` sender. `SettingsViewModel.updateNotifications` now persists to the device-local store
      instantly (UI SSOT) **then** enqueues the sync + wakes the worker on a real `cmid`. The PATCH is idempotent,
      so a delivery retry is harmless (no rollback needed). +15 tests. Surpasses iOS, whose preference write is
      online-only. **Still open:** the email channel toggle wiring (the field syncs, the UI row is pending).
- [ ] Privacy settings (visibility, contacts, media/data, encryption preference)
- [ ] Auto-download settings for media by type and connection (Wi-Fi/cellular)
- [ ] Local-first user preferences (7 categories) — instant UI + debounced offline-queued sync
- [ ] Change password with strength meter + validation
- [ ] GDPR data export (JSON/CSV, selectable scope, share/save file)
- [ ] Account deletion (typed-phrase confirmation + email-confirmation flow)
- [ ] Media cache management (clear cached images/audio/video/thumbnails)
- [ ] Crash-report diagnostics viewer with share
- [ ] Static screens: Help & Support, Terms of Service (FR/EN), Privacy Policy (FR/EN),
      open-source licenses (auto-generated), About

## M. Notifications
- [ ] Notification center with category filters (messages, reactions, mentions, social,
      contacts, groups, calls, translations, system)
- [ ] Notification list — stale-while-revalidate cache + real-time socket updates, paginated, unread-only filter
- [~] Mark read: ouverture du chat + message entrant → optimistic badge zero +
      READ_RECEIPT outbox (coalescé) ; swipe actions / mark-all pending
- [ ] In-app real-time notification toast
- [ ] FCM push: permission request, tap-to-navigate, foreground/silent activity signal, badge sync
- [ ] Rich push: decryption, message-media attachments, sender-avatar style, category quick
      actions (reply / mark-read / accept-friend / call), conversation threading, per-push badge
- [ ] Offline delivery-receipt acknowledgement (✓→✓✓ for offline recipients)
- [ ] Push message prefetch + pre-persist into Room for instant cold-launch
- [ ] `NotificationCoordinator` authority model (socket authoritative; cache only seeds)
- [ ] Comprehensive notification system (~80 types)

## N. Search
- [ ] Global search (messages, conversations, users) with recent searches + query highlighting
- [ ] Local full-text search (FTS, accent-folded, BM25-ranked) + network merge
- [ ] User search (paginated)

## O. Links
- [ ] Links hub (share / tracking / community / affiliate) with quick-create
- [ ] Share/invite links: create (guest rules, anonymous permissions, max-uses, expiration,
      custom slug), list + stats, detail (copy/share/activate/delete)
- [ ] Anonymous join-via-share-link (preview → form → success); share-link preview screen
- [ ] UTM tracking links: create, list, toggle, delete; aggregate + per-link click stats
      (geo/device/browser breakdown, click timeline), QR generation
- [ ] Affiliate / referral links: create, copy, share, delete, dashboard stats
- [ ] Generic in-app share picker / Android Share-Sheet receiver (text/url/image/message/story → conversation)

## P. Media (viewers & editors)
- [ ] Inline video playback (thumbnail → play, auto-hiding controls); fullscreen immersive
      player (seek bar, ±10s, speed 1.0–2.0×, swipe-to-dismiss); Picture-in-Picture
- [ ] Single-active-player coordination across audio + video; save video to gallery
- [ ] Video watch-progress reporting; synchronized karaoke-style transcription (tap-to-seek)
- [ ] Audio message player (waveform, speed control, seek); disk-cache-first instant replay
- [ ] Voice-message autoplay-next chaining; full-screen swipeable audio viewer (reels-style)
- [ ] Universal audio recorder (live waveform, duration/min-duration limits, presets)
- [ ] Full-screen audio editor (waveform, trim/crop, word-level transcription, language picker)
- [ ] On-device speech-to-text transcription of recordings
- [ ] Full-screen image editor (crop + ratio presets, 12 filters, brightness/contrast/saturation/
      sharpness/vignette, 6 effects, rotate)
- [ ] Image/video preview screens per context (story/post/message/avatar/banner) with Edit + Use
- [~] Image viewer — `MeeshyImageViewer` plein écran (pager multi-images, pinch-zoom
      borné 1–4×, pan clampé, double-tap 2.5×, tap-to-dismiss, compteur i/n),
      ouvert au tap sur la grille d'images d'une bulle ; drag-to-dismiss +
      save-to-gallery pending
- [ ] Code attachment viewer (~16 languages, syntax highlight, GitHub light/dark, copy)
- [ ] Document viewer (PDF/presentation/spreadsheet) with share
- [ ] Image/video compression before upload (context-aware quality); save media to "Meeshy" album
- [ ] ThumbHash blur placeholders for all media; audio spectrogram visualization

## Q. Cross-cutting infrastructure
- [ ] Cache-first / SWR data layer (`CacheResult`, `cacheFirstFlow`, Room as single SoT)
- [ ] Offline outbox (one Room table, FIFO flush, backoff ×5, coalescing, `cmid` idempotency, rollback)
- [ ] Optimistic updates with snapshot rollback + in-flight guards + self/others socket-echo split
- [ ] `MessageStateMachine` + localId↔serverId reconciliation (no duplicate bubbles)
- [ ] Cold-start full conversation sync (bounded parallel paging, retries, completeness guards)
- [ ] Foreground / reconnect delta sync (`updatedSince` checkpoint, burst cooldown, gap-fill)
- [ ] Real-time socket→Room relay (messages, reactions, read status, translations, lifecycle)
- [ ] Two Socket.IO connections (message + social), long-polling transport, robust reconnect + room re-join
- [ ] Crash-safe boot recovery for in-flight queue items + orphaned audio files
- [ ] Resumable (TUS) uploads surviving app kill; daily message-retention cleanup; DB maintenance
- [ ] Background conversation sync + message prefetch (backoff + jitter)
- [ ] Encrypted local storage (AES-GCM Room / EncryptedSharedPreferences) + per-user namespacing + logout wipe
- [ ] E2EE message encryption/decryption (libsignal, batched, fail-closed)
- [ ] Deep links: profile, conversation, join/chat link, magic link, share, user links
      (`meeshy://` + `https://meeshy.me`)
- [ ] Universal Link / push / socket notification routing into the correct screen
- [ ] Home-screen widgets (recent conversations, unread count, favorite contacts, quick reply, mark-read)
- [ ] Ongoing-call / translation-progress foreground-service notification (iOS Live Activity equivalent)
- [ ] App Actions / dynamic shortcuts (send message, call, recent conversation) — Siri/Shortcuts equivalent
- [ ] Crash / hang / ANR diagnostics with on-device persistence + remote report
- [ ] Privacy-gated analytics (screen tracking); client telemetry headers; network reachability awareness
- [ ] Adaptive iPad/tablet/foldable two-column layout (feed + conversation list/detail, resizable splitter)
- [ ] Deterministic conversation/post accent colour + name-hash palette + theme-adaptive readability
- [ ] Scroll-collapsing navigation header; animated brand logo; branded pull-to-refresh
