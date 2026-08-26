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
- [~] **Message ordering**: per-conversation `seq` sort key + continuity gap
      detection + server-time offset (ADR-021). **Ordering half shipped**
      (`chat-message-ordering`): pure `MessageOrdering.order` SSOT — stable
      ascending timeline by `createdAtMillis` (null → newest/bottom), `seq`
      tiebreak (null → newest, trails acked siblings), server order preserved on
      a full tie via stable sort. Wired into `ChatViewModel.toBubbles` so an
      out-of-order socket arrival / merged page can never render jumbled, and
      `MessageGrouping`/day-labels now cluster a provably-ascending list. 16 tests.
      **Still open:** continuity gap detection + server-time offset (need a `seq`
      source from the sync engine — deferred, no dead-end code shipped for them).
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
- [x] `:feature:feed` — cache-first feed (SWR), Prisme-resolved post content,
      optimistic like toggle (`isLikedByMe`), image collage, like/comment/repost stats,
      cursor-paginated infinite scroll (`PostRepository.loadMore` + `feedHasMore`,
      `loadMoreIfNeeded` 5-from-tail trigger, footer spinner, dedupe-append, history-safe
      freshness watermark — port of `FeedViewModel.loadMoreIfNeeded`), new-posts banner
      (`NewPostsBanner` in `FeedScreen.kt`), post detail (`PostDetailViewModel`, wired).
      Re-verified 2026-08-15 — was carried as `[~]` with a "Pending: new-posts banner +
      post detail" note; both exist and are wired, upgraded to done.
- [x] `:feature:stories` — story **tray** end-to-end : `toStoryGroups` (sdk-core,
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
      **Composer/publish** : `StoryComposerScreen` (câblé dans `MeeshyApp.kt`) +
      `StoryComposerViewModel`/`StoryComposerDraft`/`ComposerBandState` + publish
      outbox-backed (`StoryRepository.enqueuePublish`, `StoryPublishFailures` retry/discard).
      **Count-dots** : `StoryCountDots` (+ test). **Prefetch média** : `StoryPrefetchPlanner`
      (+ test) câblé dans `StoryViewerScreen`/`StoryViewerViewModel`. **Reactions** :
      `StoryReactionState` + `StoryViewerViewModel.react()`. Re-verified 2026-08-15 — this
      bullet carried a "Pending : count-dots, composer/publish, reactions UI polish, prefetch
      média" note; all four exist and are wired, upgraded from `[~]` to done.
- [x] Reactions UI: usage-ordered quick-strip (`EmojiQuickStrip`) + full categorised picker
      (`EmojiFullPicker`) wired into chat long-press sheet
- [x] `:feature:calls` — WebRTC calling (`WebRtcCallCoordinator`), Telecom integration
      (`TelecomCallReporter`), incoming/active call UI (`IncomingCallViewModel`, `CallScreen`,
      `CallPill`, ringtone/quality/reconnect timers), call history (`CallHistoryScreen`),
      wired into `MeeshyApp.kt` navigation + FCM push (`MeeshyFcmService`,
      `DeclineCallReceiver`). Re-verified 2026-08-15 — three duplicate "Pending: ... Calls
      slice ..." bullets this section carried (stale, some malformed/duplicated text) removed;
      the slice exists and is wired.

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
- [x] Username/password login with saved-account picker (multi-account, one-tap switch) —
      **saved-account list core shipped** (slice `auth-saved-account-picker-core`, 2026-07-21).
      Pure `:core:model` `SavedAccount` + `SavedAccounts` (faithful port of iOS `AuthManager`'s
      saved-account logic, `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`, +
      `SavedAccount`, `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`, + `LoginView`'s
      picker, `apps/ios/Meeshy/Features/Main/Views/LoginView.swift`). `SavedAccount` (id/username/
      displayName?/avatarUrl?/lastActiveAtMillis) exposes `shortName` (iOS `displayName ?? username`,
      **hardened** so a blank display name also falls back to the username — a row never renders empty).
      `SavedAccounts` is a pure SSOT of immutable list→list transforms iOS scatters as mutating methods
      on the stateful singleton: `sorted` (the D4 sort — `lastActiveAt` desc, `id` asc tie-break, pinned
      by iOS `SavedAccountsSortStabilityTests` so identical-timestamp accounts keep a deterministic order
      across cold starts); `upsert` (replace in place by id else prepend at front, iOS `upsertSavedAccount`);
      `remove` (drop by id, idempotent for unknown id, iOS `removeFromSavedAccounts`); `find` (one-tap
      select → username prefill); `showPicker(accounts, showNormalLogin)` (iOS `LoginView.showPicker`,
      `!isEmpty && !showNormalLogin`). **SOTA note:** iOS mutates `@Published savedAccounts` on the
      `AuthManager` singleton; Android lifts every transform into a framework-free pure SSOT so each branch
      is JVM-testable and the app-side store owns only persistence (DataStore/Keystore) + the observable
      `StateFlow`. +25 behavioural tests (`SavedAccountsTest` — 3 shortName incl. blank fallback; 6 sorted
      incl. empty/single/idempotent/tie-break; 5 upsert incl. into-empty/in-place/prepend/no-mutate;
      4 remove incl. unknown-id no-op/empty/no-mutate; 3 find; 4 showPicker truth table). Expectations are
      hand-written literals (not tautological). Mutation (RED proof): dropping the `.thenBy { it.id }`
      tie-break fails **exactly** `sorted_identicalTimestamps_secondaryKeyOnIdAscending` +
      `sorted_mixedTimestamps_secondaryKeyOnlyForTies` + `sorted_idempotent_inputOrderIrrelevant`
      (25 run, 3 failed, no collateral). `:core:model:testDebugUnitTest` green (whole module) +
      `assembleDebug` compiled every module. (Full-repo `testDebugUnitTest` tripped two pre-existing
      unrelated reds this diff never touches: the documented `:sdk-core` DataStore parallel-load flake —
      green in isolation — and a **newly-noted deterministic** `:feature:profile` `ProfileHeaderBuilderTest`
      failure that reproduces on clean `origin/main`; see the ⚠ follow-up below.) Diff = `apps/android`
      only. **Follow-up shipped** (slice `auth-saved-account-picker-ui`, 2026-08-10): the app-side
      `LoginScreen` picker UI + a SharedPreferences-backed `SavedAccountsStore` (`:sdk-core`, mirrors
      `StarredMessagesStore` — JSON-encoded list under one key, always exposes an already-
      `SavedAccounts.sorted` list, never a password/token). `AuthViewModel` seeds `AuthUiState.
      savedAccounts` synchronously from the store's `StateFlow.value` at construction (cache-first, no
      spinner) then collects it for live updates; `showPicker` is a pure derivation
      (`SavedAccounts.showPicker(savedAccounts, showNormalLogin)`). New transitions: `selectAccount`
      (tap a row → prefill username, clear password, iOS `selectedAccount`/one-tap-select),
      `deselectAccount` (back arrow → return to the list), `useAnotherAccount` (→ the plain form, iOS
      `showNormalLogin = true`), `backToSavedAccounts`, `removeAccount` (→ `store.remove`).
      `login()` on success now also `store.upsert`s the freshly-authenticated user
      (id/username/displayName/avatar + `CacheClock.nowMillis()` — iOS stamps `Date()` at
      `upsertSavedAccount`, not the server's `lastActiveAt`) so it appears in the picker on the next
      cold start; a failed login never upserts. `logout()` re-seeds `savedAccounts` from the store
      after resetting the rest of the state — the list is cross-account and deliberately **not**
      wiped by `SessionTeardown` (same rule as iOS: `AuthManager.logout()` never touches
      `savedAccounts`), so a picker with 2 remembered accounts survives a logout. **Deliberate
      Android-idiomatic divergence:** iOS surfaces row removal via a `.contextMenu` (long-press);
      Compose has no first-class context-menu primitive, so `LoginScreen`'s `SavedAccountRow` uses a
      visible trailing close-icon button instead — same capability, platform-native discovery, called
      out rather than silently diverging. **+10 new `AuthViewModelTest`** (initial state seeded from
      the store + `showPicker` both ways; select prefills + clears; deselect returns to the picker;
      "other account" toggle; back-to-picker; remove drops from state; login success upserts with the
      injected clock's value; login failure upserts nothing; logout preserves the list) **+7 new
      `SharedPrefsSavedAccountsStoreTest`** (empty on fresh install, upsert prepends/re-sorts,
      survives a fresh store construction, remove drops/is inert on an unknown id, a corrupt blob
      degrades to empty — mirrors `SharedPrefsStarredMessagesStoreTest`). Mutation (RED proof):
      commenting out the `store.upsert(...)` call inside `login()`'s success branch fails **exactly**
      `login_success_upsertsTheAccountIntoTheSavedAccountsStore` (19 run, 1 failed, no collateral).
      **Gate:** `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` (full `assembleDebug` +
      all-module `testDebugUnitTest`, 970 tasks). Reviewer **PASS** (diff `apps/android` only —
      `core/model` [`SavedAccount` gains `@Serializable`, no shape change], `sdk-core`
      [new `auth/SavedAccountsStore.kt` + 1 `SdkModule` binding], `feature/auth`
      [`AuthViewModel` +4 transitions +1 constructor dep, `LoginScreen.kt` decomposed into
      `SavedAccountsPicker`/`SavedAccountRow`/`SelectedAccountForm`/`NormalLoginForm`, ×3 strings ×4
      locales]; SDK purity — `SavedAccountsStore` is a stateless durability seam at the same grain as
      `StarredMessagesStore`, no product rule; the product decisions (when to show the picker, upsert
      on login, remove on tap) stay in the `:feature:auth` ViewModel; SSOT — reuses `SavedAccounts`'
      pure transforms, `MeeshyAvatar`, `CacheClock`, `login_password_label` untouched; instant-app —
      cache-first synchronous seed, no spinner; UDF — unchanged `AuthViewModel` shape, immutable
      `StateFlow<AuthUiState>`; no dead end; no tautological tests; no coverage floor lowered).
- ⚠ **Pre-existing red on main (needs a dedicated repair slice):** `:feature:profile`
      `ProfileHeaderBuilderTest` fails deterministically on clean `origin/main` — `presence is away when
      disconnected and idle past the window` + `last seen carries the parsed instant for an away user`
      both expect `AWAY` for a disconnected user idle 10 min, but `:core:model` `Presence.getPresenceStatus`
      classifies `elapsed > AWAY_WINDOW_MS` (180_000 ms = 3 min) as `OFFLINE`. The test's window
      expectation and the resolver's `AWAY_WINDOW_MS` diverged. Reconcile against the CLAUDE.md presence
      spec (online/recent → green, away → orange, offline > 30 min → no dot) in its own slice
      (`profile-presence-window-reconcile`). Out of scope for the pure saved-account core.
- [x] Server environment selector (dev/staging/prod/custom host) — **enum + URL-derivation
      core shipped** (slice `auth-server-environment-selector`, 2026-07-21). Pure `:core:model`
      `ServerEnvironment` (enum: `PRODUCTION`/`STAGING`/`LOCALHOST`/`CUSTOM` with `id`/`label`/`origin`
      + `fromId` production-fallback) + `ServerEnvironmentResolver` (faithful port of iOS `MeeshyConfig`,
      `packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift`: the `ServerEnvironment`
      cases, `selectedEnvironment`'s `?? .production` fallback, and the `apiBaseURL` / `serverOrigin` /
      `webOrigin` / `applyEnvironment` derivations, plus `LoginView`'s custom-host apply gate).
      `normalizeCustomHost` prepends `https://` unless the host already carries a scheme (iOS
      `host.hasPrefix("http") ? host : "https://\(host)"`, whitespace-trimmed like `applyCustomHost`);
      `canApplyCustomHost` mirrors the apply button's `.disabled(trimmed.isEmpty)`; `apiBaseUrl` appends
      `/api/v1`; `serverOrigin` parses scheme+host(+port) out of the base URL and returns it verbatim on
      a parse miss; `webOrigin` strips the leading `gate.` API subdomain (`gate.meeshy.me` → `meeshy.me`,
      `gate.staging.meeshy.me` → `staging.meeshy.me`) and remaps the localhost dev port (`:3000` →
      `:3100`). **SOTA note:** iOS keeps these as computed props on a stateful `UserDefaults`-backed
      singleton; Android lifts the pure string derivations into a framework-free object so every branch
      is JVM-testable and the app-side config store only owns persistence + the mutable selection. +35
      behavioural tests (`ServerEnvironmentTest` — every `id`/`label`/`origin` case, entry order,
      `fromId` known/unknown/null/empty, `normalizeCustomHost` bare/https/http/trim, `canApplyCustomHost`
      non-empty/empty/whitespace, `apiBaseUrl` all five origins, `serverOrigin` https/port/malformed/
      no-scheme, `webOrigin` gate-strip/staging/localhost/loopback/non-gate/malformed, and two full
      derivation-chain compositions). Expectations are hand-written literals (not tautological). Mutation
      (RED proof): dropping the `gate.` strip from `webOrigin` (`if startsWith("gate.") removePrefix else
      host` → `host`) fails **exactly** `webOrigin_productionGateHost_stripsGatePrefix` +
      `webOrigin_stagingGateHost_stripsOnlyLeadingGate` + `composition_productionChain_apiToServerToWebOrigin`
      (35 run, 3 failed, no collateral). `:core:model:testDebugUnitTest` green (35/35); `assembleDebug`
      compiled every module (full-repo `testDebugUnitTest` only tripped the pre-existing unrelated
      `:sdk-core` `InterfaceLanguageStoreTest` DataStore parallel-load flake, green in isolation). Diff =
      `apps/android` only. **App-side wiring shipped** (slice `auth-server-environment-wiring`,
      2026-08-10): `:core:network` `ServerEnvironmentStore` (interface + `InMemoryServerEnvironmentStore`
      + `SharedPrefsServerEnvironmentStore`, plain SharedPreferences — non-sensitive dev/QA config,
      unlike `TokenStore`'s encrypted storage) persists the selected environment + custom host next to
      `MeeshyConfig`/`NetworkModule` (same module, since `NetworkModule.providesMeeshyConfig()` is the
      one caller that needs it at Hilt-graph-construction time — the Android equivalent of iOS
      `restoreEnvironment()` "at app launch": `providesMeeshyConfig(store)` now derives `apiBaseUrl`/
      `socketUrl` from `ServerEnvironmentResolver.apiBaseUrl`/`.serverOrigin` fed by the store instead of
      a hardcoded literal. `AuthViewModel` gains a 5th/6th constructor dep (`MeeshyConfig` — reused, not
      new; `ServerEnvironmentStore`), seeds `AuthUiState.selectedEnvironment`/`customHostInput`
      synchronously from the store at construction (cache-first, matches the SharedPrefs read being
      synchronous), and 3 new transitions: `selectEnvironment` (non-custom pill → persists immediately,
      mirrors iOS `if env != .custom { applyEnvironment(env) }`; `.CUSTOM` only reveals the host field
      locally, matching iOS leaving `selectedEnvironment` untouched until the checkmark), `onCustomHostChange`
      (pure text binding), `applyCustomHost` (persists host + selects CUSTOM in one step — iOS
      `applyEnvironment(.custom, customHost:)` — inert on a blank/whitespace host, mirroring the disabled
      apply button). `logout()` now explicitly re-seeds the environment fields from the store (same
      cross-account-survives-logout treatment as `savedAccounts` — `SessionTeardown.wipe()` doesn't touch
      either). `LoginScreen.kt` gains an `EnvironmentSelector` composable (Material3 `FilterChip` row +
      conditional custom-host field + "Connected to: %@" label) gated on `state.showEnvironmentSelector`.
      **Deliberate simplifications over iOS, called out:** (1) gates on `config.enableLogging`
      (`BuildConfig.DEBUG`, reused not duplicated) instead of iOS's `Self.isSimulator` — Android has no
      reliable simulator-vs-device signal, and "developer/QA build" is the intent either way; (2) a
      selection persists to `ServerEnvironmentStore` but only takes effect on the **next app launch**, not
      mid-session — iOS's `APIClient` re-reads `MeeshyConfig.shared.apiBaseURL` per request from a mutable
      singleton, while Android's `MeeshyApi` bakes `apiBaseUrl` into a `Retrofit.Builder` at Hilt-graph
      construction; hot-swapping that live would be new architecture, not this slice's scope. +3 new
      `NetworkModuleTest`, +9 new `ServerEnvironmentStoreTest` (InMemory + SharedPrefs, including
      persistence-survives-reconstruction and unknown-persisted-id-falls-back-to-production), +10 new
      `AuthViewModelTest` (seed from store, selector visibility both ways, select non-custom persists,
      select custom does not, host text binding, apply valid/blank host, origin-label derivation, logout
      preserves the selection). Mutation (RED proof): making `select()` also overwrite `customHost` fails
      **exactly** `inMemory_select_neverTouchesTheCustomHost` (9 run, 1 failed, no collateral); dropping the
      environment-preserving fields from `logout()`'s reset fails **exactly**
      `logout_preservesTheServerEnvironmentSelection` (29 run, 1 failed, no collateral). **Gate:**
      `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL in 21s`** (full `assembleDebug` + all-module
      `testDebugUnitTest`, 970 tasks). Reviewer **PASS** (diff `apps/android` only — `core/network`
      [new `ServerEnvironmentStore.kt`, `NetworkModule.kt` rewired, +1 test dep], `feature/auth`
      [`AuthViewModel` +2 constructor deps +3 transitions, `LoginScreen.kt` +`EnvironmentSelector`, ×3
      strings ×4 locales]; SDK purity — the store is a stateless persistence seam at `TokenStore`'s grain,
      no product rule; the product decisions (when to persist, selector visibility, "connected to" label)
      stay in `:feature:auth`; SSOT — reuses `ServerEnvironment`/`ServerEnvironmentResolver`/
      `config.enableLogging` untouched, no re-implementation; instant-app — N/A, synchronous SharedPrefs
      read, no network/spinner; UDF — unchanged `AuthViewModel` shape, immutable `StateFlow<AuthUiState>`;
      no dead end; no tautological tests; no coverage floor lowered).
- [~] Passwordless magic-link login (email + countdown + resend) via deep link —
      **countdown state-machine + strict email gate core shipped** (slice
      `auth-magic-link-countdown`, 2026-07-21). Pure `:core:model` `MagicLinkCountdown`
      (immutable value + pure `start`/`tick` transitions) + `MagicLinkEmail` (faithful
      port of iOS `MagicLinkView`, `apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift`:
      the `isValidEmail` regex, the `startCountdown` per-second loop that flips `linkExpired`
      at zero, `formattedCountdown` `"m:ss"`, and the resend `.disabled(countdownRemaining > 0
      || isLoading)` gate). `MagicLinkCountdown.start(expiresInSeconds)` seeds a fresh
      (non-expired, clamped ≥0) countdown — also the resend transition, which clears a stale
      expired warning; `tick()` decrements a second and expires exactly on reaching zero
      (idempotent at zero); `formatted`/`showCountdown`/`showExpiredWarning`/`canResend(isLoading)`
      are the display+gate derivations. `MagicLinkEmail.isValid` matches the whole RFC-lite shape
      (local part, domain, ≥2-char TLD) — deliberately **stricter** than the signup wizard's loose
      `@`+`.` gate and kept a distinct SSOT (the address is the sole login identifier). **SOTA
      note:** iOS drives a stateful `Task` mutating `@State` in the View; Android lifts the whole
      transition into a pure immutable value so every branch is JVM-testable and a Compose screen
      re-derives the display each second off a plain 1 s clock. +26 behavioural tests
      (`MagicLinkCountdownTest` — 12 email cases: rich local/subdomain, uppercase, hyphen-domain,
      missing `@`/dot, 1-char TLD, empty-local, multi-`@`, interior/edge whitespace, empty; 14
      countdown cases: start seed/zero/negative-clamp, tick decrement/expire-at-one/idempotent-at-zero/
      folded-to-zero, resend-clears-expired, `formatted` five values, `showCountdown`/`showExpiredWarning`
      flags, `canResend` counting/exhausted/loading). Expectations are hand-written literals
      (not tautological). Mutation (RED proof): flipping the expiry transition (`expired = next == 0`
      → `false`) fails **exactly** `tick_atOneReachesExpiry` + `tick_foldedToZeroReachesExpiry`
      (26 run, 2 failed, no collateral). `:core:model:testDebugUnitTest` green + full
      `:app:assembleDebug` → BUILD SUCCESSFUL. Diff = `apps/android` only. **Follow-up:** the
      app-side `MagicLinkView` composable (email field → `AuthService.requestMagicLink` → waiting
      step driving `MagicLinkCountdown` off a 1 s `Flow`) + the `meeshy://` deep-link handler.
- [x] 8-step gamified registration wizard (username/email/phone live availability + suggestions) —
      **local-validation gate + availability-debounce policy core shipped** (slice
      `auth-signup-availability-local-gate`, 2026-07-21). Pure `:core:model` `SignupFieldValidation` +
      `SignupAvailabilityPolicy` + `AvailabilityIntent` (faithful port of iOS `RegistrationViewModel`:
      `isUsernameValidLocally` / `isEmailValidLocally` / the phone `digits.count >= 8` guard, the three
      `.debounce(1s).removeDuplicates().sink { guard localValid }` chains, and the `.pseudo`/`.phone`/
      `.email` arms of `canProceed`,
      `packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`). `SignupFieldValidation`
      exposes the local gates (username trimmed 2..16 chars ⊆ alnum ∪ `_-`; email contains `@` **and** `.`;
      phone ≥ 8 digits) + normalizers (`normalizedUsername` trim, `normalizedEmail` trim+lowercase,
      `phoneDigits`). `SignupAvailabilityPolicy.{username,email,phone}Intent(current, previous)` folds a
      debounced value into an `AvailabilityIntent` — `Unchanged` (dedup: raw value == last emission,
      checked **first** so a still-valid duplicate never re-probes), `Clear` (locally invalid → wipe
      availability, no network), or `Check(query)` (locally valid → probe the normalized query). The
      `{username,email,phone}StepCanProceed(...)` gates answer the wizard's advance decision (local gate
      **AND** server `available == true`; phone honours `skipPhone`). **SOTA note:** iOS keeps these as
      `private func`s inside the stateful view model; Android lifts them into a pure framework-free SSOT so
      every branch is JVM-testable and reusable by any onboarding surface. +43 behavioural tests
      (`SignupAvailabilityTest` — every username length/charset boundary, email `@`/`.` cases, phone
      digit-strip + threshold, dedup-wins-when-valid, first-emission-no-previous, Clear/Check per field,
      and each step gate incl. null/false availability + skipPhone). Mutation (RED proof): the username
      step gate `== true` → `!= false` fails **exactly** `usernameStep_blockedWhenAvailabilityNull`
      (43 run, 1 failed, no collateral). `:core:model:testDebugUnitTest` green + full `:app:assembleDebug`
      → BUILD SUCCESSFUL. Diff = `apps/android` only. **Follow-up (network probe now DONE — slice
      `signup-availability-probe`, 2026-07-25):** `AuthApi.checkAvailability` + `AuthRepository.checkAvailability`
      + the three debounced probe pipelines in `RegistrationViewModel` now drive these cores off the 1 s
      debounce, feeding the `on…Availability` seam. **Both remaining follow-ups now DONE**: the 8 wizard
      step composables shipped across `auth-onboarding-shell` through `auth-profile-step-fields`
      (2026-08-09, see the bullets below); **the username-suggestion strip shipped** (slice
      `auth-username-suggestion-strip`, 2026-08-10) — closing the last open gap, box flips to `[x]`.
      Re-proven before picking: grepped `usernameSuggestions`/`selectUsernameSuggestion` across
      `apps/android` — zero production hits, confirming this specific follow-up (unlike the composables,
      already done) was still open. **Added (production, all `apps/android`):**
      `RegistrationFields.usernameSuggestions: List<String>` (`:core:model`, alongside
      `usernameAvailable`, mirrors iOS `RegistrationViewModel.usernameSuggestions` sourced from
      `AvailabilityResult.suggestions`); `RegistrationViewModel.onUsernameSuggestions` (background-verdict
      setter via `updateFields`, same errorMessage-preserving rationale as `onUsernameAvailability`) +
      `selectUsernameSuggestion` (iOS `selectSuggestion` port — adopts the handle, optimistically marks it
      available since the server already confirmed it when offering it, clears the list); the username
      probe pipeline in `init{}` now applies both the verdict and its suggestions from the one
      `checkAvailability` round-trip (a side effect inside the `launchProbe` closure — the shared
      generic plumbing only carries one value back to `apply`, mirrors iOS `checkUsernameAvailability`
      setting both `@Published` properties from the same response); `onUsernameChange` now also clears
      `usernameSuggestions` (extends the existing "invalidate stale verdict on edit" SOTA convention to
      suggestions, stronger than iOS which only clears them inside the debounced sink's locally-invalid
      guard). `RegistrationScreen.kt`'s new `UsernameSuggestionStrip` (`FlowRow` of Material3
      `SuggestionChip`s, warning-tinted card + lightbulb icon — parity target iOS `StepPseudoView.
      suggestionsCard`) renders under `PseudoStepBody`'s availability indicator whenever the list is
      non-empty, dispatching taps to `selectUsernameSuggestion`. **+7 behavioural tests**
      (`RegistrationViewModelTest`: direct setter, edit-invalidates, select-suggestion marks
      available+clears list+unlocks `canProceed`, re-editing after a select re-invalidates, taken-username
      probe applies suggestions, available-username probe leaves them empty, failed probe leaves them
      empty). **Mutation (RED proof):** reverting `selectUsernameSuggestion`'s optimistic
      `usernameAvailable = true` to `null` fails **exactly** `selectUsernameSuggestion_
      setsUsernameAndMarksAvailable` (71 run, 1 failed, no collateral); RED was also proven first by the
      suite failing to **compile** against the absent production members. `./apps/android/meeshy.sh check`
      → `BUILD SUCCESSFUL` (full `assembleDebug` + all-module `testDebugUnitTest`, 970 tasks). Reviewer
      **PASS** (diff `apps/android` only — `core/model` [`RegistrationFields` +1 field, no new files],
      `feature/auth` [`RegistrationViewModel` +2 setters + probe wiring, `RegistrationScreen.kt` +1
      composable, ×4 locale strings ×4 locales]; SDK purity — `usernameSuggestions` is inert data on an
      existing `:core:model` type, the "select a suggestion" decision is ordinary ViewModel plumbing (same
      grain as the sibling `on…Change` setters), the Compose strip is UI glue; SSOT — reuses
      `AvailabilityResult.suggestions` untouched, no re-implementation; instant-app — no spinner
      introduced; UDF — unchanged `RegistrationViewModel` + immutable `StateFlow`; no dead end — the strip
      is purely additive under the existing field; no tautological tests; no coverage floor lowered, no
      existing test weakened). **Bookkeeping correction (not new work this slice):** re-verifying this
      area found the three sibling bullets below (progress bar, bottom-bar nav, ViewModel wiring) were
      still marked `[~]` despite their own text already documenting completion — `auth-onboarding-shell`
      (2026-08-09) shipped the composables/wiring those bullets describe, but nobody flipped the checkbox
      afterwards. Corrected alongside this slice's own change since it was directly re-verified in the
      course of this run's research, not left to accumulate further staleness.
- [x] Interactive step progress bar with jump-back to completed steps —
      **step-set + progress-bar decision core shipped** (slice `registration-progress-bar-core`,
      2026-07-22). Pure `:core:model` `RegistrationStep` (8-step ordinal enum: `PSEUDO`..`RECAP`
      by `index`, + `ordered`/`total`/`fromIndex`) + `RegistrationProgressBar` (fill partition +
      jump gate) — faithful port of iOS `InteractiveProgressBar`
      (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift` `stepColor(for:)` +
      the `.disabled(step.rawValue > current)` gate) and the `onStepTapped` closure in
      `OnboardingFlowView` (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift`,
      `if step.rawValue <= currentStep.rawValue { currentStep = step }`). `StepFill{COMPLETED,
      CURRENT,UPCOMING}` = iOS's three `stepColor` arms; `canJumpTo(step,current)` = the tap gate
      (`step.index <= current.index`, inverse of `.disabled`); `jumpTarget(tapped,current)` resolves
      a tap to a target step **or null** so the bar can only jump *back* to a completed step (or
      re-select current), never forward. **SOTA note:** iOS spreads these `rawValue` comparisons
      across a SwiftUI `View` body and a tap closure; Android lifts the whole completed/current/
      upcoming partition + jump-back gate into one framework-free object so every branch is
      JVM-testable. Per-step display metadata iOS hangs off the enum (`funHeader`/`funSubtitle`/
      `iconName`/`accentColor`) is deliberately left to the UI layer (i18n copy + design-system
      colour), keeping `:core:model` pure. +22 behavioural tests (`RegistrationProgressBarTest` —
      enum order/total/`fromIndex` incl. negative + at-or-beyond-count null; `fill` 3 arms +
      first/last-step sweeps; `canJumpTo` completed/current/upcoming/next + first/last sweeps;
      `jumpTarget` completed/current/upcoming/next). Expectations are hand-written literals (not
      tautological). Mutation (RED proof): `fill` boundary `<`→`<=` fails **exactly** the 3
      current-step fill tests; `canJumpTo` boundary `<=`→`<` fails **exactly** the 4 current-step
      reachability tests (`canJumpTo_theCurrentStep_isTrue` + first/last sweeps +
      `jumpTarget_forTheCurrentStep`), no collateral. RED was also proven first by the suite failing
      to compile against the absent production types. `:core:model:testDebugUnitTest` green (22/22)
      + `:app:assembleDebug` → BUILD SUCCESSFUL (every module compiled). Diff = `apps/android` only.
      **Follow-up:** the app-side `InteractiveProgressBar` composable (an accent-coloured tappable
      bar row wired to `RegistrationProgressBar.fill`/`jumpTarget` → `currentStep`) + the
      `nextStep`/`previousStep`/`skipCurrentStep` bottom-bar navigation core (a separate box).
- [x] Bottom-bar step navigation (next / previous / skip) — **step-transition decision core shipped**
      (slice `registration-step-navigation-core`, 2026-07-22). Pure `:core:model`
      `RegistrationStepNavigator` + `SkipOutcome` — faithful port of iOS `RegistrationViewModel`
      (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`): `nextStep()` (gated on
      `canProceed`), `previousStep()`, `skipCurrentStep()` (phone-clear + forced advance) and the
      private `nextStepForced()`. `isFirst`/`isLast` = the iOS `idx > 0` / `idx < count-1` boundaries;
      `next(current)`/`previous(current)` = the ordinal successor/predecessor (null at the last/first
      step, via `RegistrationStep.fromIndex` so the bound is a single source of truth, not an
      open-coded `idx < count-1` in every method); `advance(current, canProceed)` = `nextStep`'s gated
      move (null when blocked *or* at the last step); `skip(current)` = `SkipOutcome(target = next,
      clearPhone = current == PHONE)` — the forced advance paired with the phone-clear *decision* (the
      pure core surfaces the decision; the app-side ViewModel performs the `skipPhone = true;
      phoneNumber = ""` field mutation). **SOTA note:** iOS recomputes `allSteps.firstIndex(of:)` inline
      in four separate methods and folds the gate/bounds/side-effect into each mutation; Android lifts
      every branch into one framework-free SSOT returning the target step (or null for an inert
      transition), leaving the ViewModel a thin caller. **The per-step `canProceed` field-validation
      (username availability, phone digits, email, password match, …) stays app-side** — it reads live
      wizard field state — and is passed to `advance` as a boolean, keeping `:core:model` pure. +18
      behavioural tests (`RegistrationStepNavigatorTest` — `isFirst`/`isLast` sweeps; `next`/`previous`
      first/interior/last + full index-walk sweeps; `advance` proceed/blocked/last-step/first-blocked;
      `skip` phone/non-phone/first/last-no-op). Expectations are hand-written literals (not
      tautological). Mutation (RED proof): dropping `advance`'s `canProceed` guard fails **exactly**
      `advance_whenBlocked_staysPut` + `advance_atTheFirstStepWhenBlocked`; forcing `skip`'s
      `clearPhone = false` fails **exactly** `skip_onThePhoneStep` (3 failed together, no collateral).
      RED was also proven first by the suite failing to compile against the absent production types.
      `:core:model:testDebugUnitTest` green (18/18 new, whole module green) + `:app:assembleDebug` →
      BUILD SUCCESSFUL (every module compiled). Diff = `apps/android` only. **Follow-up:** the app-side
      bottom-bar composable (Back / Skip / Next-or-Register buttons) + the `RegistrationViewModel`
      wiring `advance`/`previous`/`skip` to `currentStep`, computing `canProceed` from the shipped
      field-validation cores. **Chrome-projection core shipped** (slice `registration-nav-chrome`,
      2026-07-26): pure `:core:model` `RegistrationNav.model(current, canProceed, isSubmitting)` →
      `RegistrationNavModel` — the whole top-bar + bottom-bar decision layer the Compose wizard renders,
      a faithful port of iOS `OnboardingFlowView`'s `topBar` / `bottomBar` / `buttonTitle` / `buttonIcon`:
      leading control (`CLOSE` on the first step, `BACK` otherwise), primary `primaryLabel`
      (`CREATE_ACCOUNT` on RECAP, `CONTINUE` on PROFILE, `NEXT` otherwise) / `primaryIcon` (`SPARKLES` on
      RECAP, `FORWARD` otherwise) / `primaryAction` (`REGISTER` on RECAP, `ADVANCE` otherwise) /
      `primaryEnabled` (`canProceed && !isSubmitting`, iOS `canProceed && !isLoading`), profile-only
      `showSkip`, and the 1-based `positionLabel` (`"n/8"`). Labels/icons are **semantic enums** — the UI
      resolves i18n copy + glyph, keeping `:core:model` framework-free. Wired as a derived
      `RegistrationUiState.nav` (same seam as `summary` / `canProceed` / `fill`). **+22 behavioural tests**
      (16 `RegistrationNavTest` full step sweeps + 6 `RegistrationViewModelTest` derivation checks incl.
      the submitting-disables-primary path). Mutation (RED proof): `showSkip = false` fails **exactly**
      `showSkip_isTrueOnlyOnTheProfileStep` (1 failed, no collateral). `./apps/android/meeshy.sh check` →
      BUILD SUCCESSFUL (full `assembleDebug` + all module tests; `RegistrationNavTest` 16/16,
      `RegistrationViewModelTest` 45/45). Diff = `apps/android` only.
- [x] **App-side registration wizard ViewModel wiring** — **UDF `RegistrationViewModel` shipped**
      (slice `registration-wizard-viewmodel`, 2026-07-25). The first app-side wiring that turns the
      shipped registration cores from orphan logic into a real observable wizard. New
      `:feature:auth/RegistrationViewModel` (`@HiltViewModel`) + immutable `RegistrationUiState`
      (`currentStep` + `RegistrationFields` + submit flags). Every *decision* defers to a pure core,
      re-implementing none: `canProceed`/`isFirstStep`/`isLastStep`/`fill(step)` derive from
      `RegistrationStepGate`/`RegistrationStepNavigator`/`RegistrationProgressBar`; `next()` =
      `advance(currentStep, canProceed)`, `previous()`/`skip()`/`jumpTo()` apply the navigator/progress
      outcomes (skip performs the `skipPhone=true; phoneNumber=""` field mutation the core signalled via
      `SkipOutcome.clearPhone`); `register()` fires only from a passing RECAP gate, single-flight
      (`isSubmitting` guard), maps `RegistrationFields.toRegisterRequest` (normalized username/email,
      blank→null optional names via `SignupFieldValidation`) through `AuthRepository.register`, binds
      `RealtimeSessionCoordinator` on success (mirrors the shipped `AuthViewModel.login` seam). The
      availability network probe (1 s debounce → `checkAvailability`) is a separate follow-up; the VM
      exposes `onUsernameAvailability`/`onEmailAvailability`/`onPhoneAvailability` as the seam. **SOTA
      over iOS:** editing an already-probed username/email/phone **invalidates the stale availability
      answer** (`…Available=null`) so the proceed gate can never pass on a server verdict that belongs
      to a since-changed value — iOS keeps the old `Bool?` until the debounced probe returns. +23
      behavioural tests (`RegistrationViewModelTest` — initial state; field-edit + availability
      invalidation ×3; `next` blocked/passes; `previous` first-noop/back; `skip` phone-clear/non-phone/
      last-noop; `jumpTo` back/current/upcoming-ignored; `fill` partition; `register`
      before-recap-noop / blocked-recap-noop / success-binds-realtime+payload / failure-error+no-realtime
      / while-submitting-noop / blank-names→null). Expectations are hand-written literals (not
      tautological). Mutation (RED proof): dropping `onUsernameChange`'s `usernameAvailable=null` reset
      fails **exactly** `editingUsername_invalidatesStaleAvailability` (23 run, 1 failed, no collateral).
      RED was also proven first by the suite failing to compile against the absent VM.
      `:feature:auth:testDebugUnitTest` green (23/23 new) + `:app:assembleDebug` → BUILD SUCCESSFUL
      (every module compiled). Diff = `apps/android` only. **Follow-up:** the paged `OnboardingFlowView`
      Compose screen (per-step field composables + `InteractiveProgressBar` bar row + bottom-bar
      Back/Skip/Next-or-Register) binding this VM. *(The availability-debounce network layer feeding the
      `on…Availability` seam is now **DONE** — see the next entry.)* **Scope note (2026-08-09):** this
      "paged `OnboardingFlowView` Compose scaffold" has been the recurring "Next slice" recommendation
      across 15+ runs since 2026-07-25 without ever being picked — evaluated again this run and it is
      genuinely too large for one slice, not merely under-prioritized: `feature/auth` today has only
      `LoginScreen`/`GuestJoinScreen`, zero registration-wizard UI, and all 8 `RegistrationStep` arms
      (PSEUDO/PHONE/EMAIL/IDENTITY/PASSWORD/LANGUAGE/PROFILE/RECAP) need distinct field UI — PROFILE
      alone needs a photo/banner picker + compression pipeline. Every decision core is done and tested
      (`RegistrationStepGate`/`RegistrationStepNavigator`/`RegistrationProgressBar`/`RegistrationNav`/
      `RegistrationSummary` + this VM) — remaining work is Compose wiring only (exempt from the JVM
      coverage gate per `TDD-COVERAGE.md`), but "wiring only" still spans 8 screens. **Recommendation
      for whichever run finally takes this on:** split into named sub-slices the same way
      `category-picker-create` was carved out of a similarly-vague bundle — e.g. `auth-onboarding-shell`
      (the pager/progress-bar/nav-chrome container wired to the existing VM, PSEUDO step only, reachable
      from a new "Sign up" link on `LoginScreen` so it's never orphaned) as slice 1, then one slice per
      remaining step. Do **not** keep re-listing "the OnboardingFlowView Compose scaffold" as a single
      bullet in future "Next slice" notes — it has proven itself unpickable at that grain.
      **Slice 1 shipped** (`auth-onboarding-shell`, 2026-08-09): the pager/progress-bar/nav-chrome
      container is live — `feature/auth/RegistrationScreen.kt`, a dumb renderer wired to the already-
      tested `RegistrationViewModel`. Top bar (Close on PSEUDO / Back otherwise + `n/8` position pill),
      an 8-segment tappable progress row (`RegistrationProgressBar.fill`/`state::fill`, jump-back only —
      `Box.clickable(enabled = role != UPCOMING)`), bottom bar (`MeeshyPrimaryButton` driven by
      `RegistrationNavModel.primaryLabel/primaryEnabled`, dispatching `register()` on RECAP else
      `next()`; skip button on PROFILE only). `LoginScreen` gains a "Sign up" link (`onSignUp`,
      default `{}` — source-compatible) navigating to the new `Routes.REGISTRATION` (`MeeshyApp.kt`).
      **PSEUDO is the only step with real field UI** (username field + available/taken hint from
      `RegistrationFields.usernameAvailable`); every other step renders an inert "coming soon"
      placeholder — **new pure SSOT `:core:model/auth/RegistrationStepContent.isImplemented(step)`**
      gates real-content vs. placeholder, so a future per-step slice adds one entry to its `implemented`
      set + one `when` arm here, in lockstep. No dead end: a placeholder step's Next stays correctly
      disabled (its field-less `RegistrationFields` never satisfies `RegistrationStepGate.canProceed`)
      but Back is always reachable off the first step, all the way out via Close. +2 behavioural tests
      (`RegistrationStepContentTest` — pseudo implemented=true, every other of the 7 steps
      implemented=false). Mutation (RED proof): widening `implemented` to all 8 steps fails **exactly**
      `isImplemented_everyStepOtherThanPseudo_isFalse` (2 run, 1 failed, no collateral); RED first
      proven by the suite failing to compile against the absent `RegistrationStepContent`. The rest of
      the slice is Compose wiring only (exempt from the JVM gate per `TDD-COVERAGE.md`) — verified by
      the full, unmodified `RegistrationViewModelTest` suite staying green (45/45) alongside it, proving
      no regression to the decision layer the new screen reads. `./apps/android/meeshy.sh check` →
      BUILD SUCCESSFUL (full `assembleDebug` + all-module `testDebugUnitTest`, 943 tasks). Diff =
      `apps/android` only (`core/model` [+1 core, +1 test], `feature/auth` [+1 screen, `LoginScreen`
      link, ×4 locale strings], `app` [+1 route]). **Slice 2 shipped** (`auth-phone-step-fields`,
      2026-08-09) — the PHONE step's field UI (country picker + phone field + skip); see the phone-entry
      bullet above for the full writeup. **Follow-up:** EMAIL/IDENTITY/PASSWORD/LANGUAGE/PROFILE/RECAP in
      turn — each adds its step to `RegistrationStepContent.implemented` + a `when` arm in
      `RegistrationScreen`.
- [x] **App-side availability-debounce network probe** — **shipped** (slice `signup-availability-probe`,
      2026-07-25). Closes the last orphan seam of the registration wizard: the three
      `onUsernameAvailability`/`onEmailAvailability`/`onPhoneAvailability` setters are now driven by real
      debounced network probes instead of tests only. New `AvailabilityResult` (`:core:model`, parity with
      the gateway `GET /auth/check-availability` response: `usernameAvailable`/`suggestions`/
      `emailAvailable`/`phoneNumberAvailable`/`phoneNumberValid`, all nullable — the gateway echoes only the
      probed field); `AuthApi.checkAvailability(username?, email?, phoneNumber?)` (`:core:network`, Retrofit
      omits null `@Query`s so a single-field probe hits `?username=…` alone); `AuthRepository.checkAvailability`
      (`:sdk-core`, folds transport/HTTP errors into `NetworkResult.Failure`). `RegistrationViewModel` gains
      three per-field `MutableStateFlow<String>` inputs (fed by the `on…Change` handlers + reset by `skip`'s
      phone-clear) and three `launchProbe` pipelines: `debounce(1s) → distinctUntilChanged → SignupAvailabilityPolicy.{username,email,phone}Intent → Check ? checkAvailability : clear`.
      A failed/unknown probe yields `null` (gate stays blocked on "unknown", never a stale answer). **SOTA
      over iOS:** availability updates go through a background `updateFields` that **preserves** a surfaced
      `errorMessage` (only a user field-edit clears it), so a late verdict can't wipe a registration error;
      the debounce/dedup is the conflated StateFlow itself (no hand-rolled `removeDuplicates` state). +9
      behavioural tests (`AuthRepositoryTest` +2: single-field forwarded + result mapped / failure→Failure;
      `RegistrationViewModelTest` +7: valid→probe+verdict, invalid→no-probe+unknown, rapid-edits→single
      probe on last value, distinct values→probe-each, probe-failure→unknown, email probe, phone probe with
      digits-only normalization). Mutation (RED proof): dropping the `Check` guard (always probe) fails
      **7** tests incl. `invalidUsername_afterDebounce_neverProbesAndStaysUnknown` (30 run) — the
      local-validity gate is load-bearing. `:feature:auth:testDebugUnitTest` 30/30 +
      `:sdk-core:testDebugUnitTest` + `:core:model:testDebugUnitTest` green in isolation +
      `:app:assembleDebug` → BUILD SUCCESSFUL (whole graph). Diff = `apps/android` only. **Follow-up:** the
      username-suggestion strip (surface `AvailabilityResult.suggestions`), and the Compose onboarding screen.
- [x] Phone entry with searchable country-code picker (skippable) — **catalogue core shipped**
      (slice `auth-country-catalog`, 2026-07-20): pure `:core:model` `CountryCatalog` + `Country`
      (faithful port of iOS `CountryPicker`,
      `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/CountryPicker.swift`). Holds the verbatim
      E.164 `dialCodes` table (241 ISO→dial entries) + the `priority` head ordering, and the pure
      resolvers: `flag(iso)` (Unicode regional-indicator emoji, `🌐` globe fallback for non-ASCII-letter
      input), `flagForCountryCode`, `dialCode`, `isoForPhoneNumber` (longest-matching dial code,
      priority country preferred on a tie — `+44`→`GB`, `+1`→`US`, `+7`→`RU` — then a **deterministic**
      ISO-alphabetical tie-break where iOS falls back to a locale-dependent name sort; handles `00`→`+`
      normalisation, rejects non-international / unmatched numbers), `flagForPhoneNumber`,
      `build(displayName)` (full list priority-first then localized name, name resolver injected so the
      core stays `Locale`-free / JVM-testable), `country(forPhoneNumber, displayName)`,
      `search(query, countries)` (case-insensitive over name / dial / ISO, empty query = passthrough),
      and `accessibilityLabel`. Real consumers today: the correct country flag for a stored
      `MeeshyUser.phoneNumber` / `registrationCountry`. +29 behavioural tests (`CountryCatalogTest`,
      every branch of every resolver). Mutation (RED proof): dropping the priority rank from the
      `isoForPhoneNumber` tie-break (`minWith(compareBy(rank, iso))` → `minOrNull()`) fails **exactly**
      `isoForPhoneNumber_prefersPriorityCountryOnSharedDialCode` (29 run, 1 failed, no collateral).
      `:core:model:testDebugUnitTest` green + full `:app:assembleDebug` → BUILD SUCCESSFUL. Diff =
      `apps/android` only. **App-side UI shipped** (slice `auth-phone-step-fields`, 2026-08-09 — slice 2
      of the onboarding wizard's per-step Compose UI, see the `auth-onboarding-shell` scope note below):
      `RegistrationScreen`'s new `PhoneStepBody` (`RegistrationStep.PHONE` now in
      `RegistrationStepContent.implemented` alongside `PSEUDO`) — a country chip (flag + dial code)
      opening `CountryPickerSheet` (a `ModalBottomSheet` list driven by `CountryCatalog.build`/`.search`,
      name resolver = `java.util.Locale("", iso).displayCountry`, closing the display-name follow-up),
      the phone-digits field, the available/taken indicator (mirrors `PseudoStepBody`), and an in-content
      Skip button (`RegistrationNavModel.showSkip` is deliberately `false` for PHONE — the step carries
      its own affordance, matching iOS `StepPhoneView`'s inline "Passer cette étape", not the PROFILE-only
      bottom-bar skip). **New `RegistrationFields.countryIso`** (`:core:model`, default
      `CountryCatalog.priority.first()` = `"FR"`, mirrors iOS `selectedCountry`) feeds three sites: (1)
      the debounced availability probe now sends the E.164 dial-code-prefixed number
      (`CountryCatalog.dialCode(countryIso) + digits`, was digits-only — a real parity bug fix, since the
      gateway's `/auth/check-availability` documents E.164 input and previously inferred the country from
      geo-IP alone); (2) `toRegisterRequest()` now sends `RegisterRequest.phoneNumber`/`phoneCountryCode`
      (both new nullable wire fields, `null` when skipped/empty, faithful port of iOS `register()`'s
      `fullPhone`); (3) the recap's `RegistrationSummaryInput.phoneDialCode` (a field the pure core
      already supported, unwired until now). **SOTA over iOS:** `onCountryChange` invalidates a
      stale `phoneAvailable` (iOS's `selectedCountry` never does, so switching country after an
      already-confirmed probe can silently proceed under the wrong country there) — no auto re-probe
      fires (mirrors iOS; editing the phone field again re-triggers the debounced pipeline). Phone
      ownership/recovery-hint (iOS's `phoneOwnership`/`phoneRecoverySuggested`, shown on a taken number)
      is a distinct, larger capability with no Android decision core yet — deliberately out of scope.
      **+7 behavioural tests** (`RegistrationViewModelTest`: default-country init, `onCountryChange`
      updates the field + invalidates a stale probe, the debounced probe sends the selected country's
      dial code (default FR and a picked US case), `register()` sends the dial-code-prefixed number +
      ISO on a filled step and `null`/`null` when the PHONE step was skipped, the recap's phone value
      carries the dial-code prefix) + 1 `RegistrationStepContentTest` (`PHONE` now implemented). One
      existing probe test adapted (not weakened) to the new contract — a country picker means the phone
      field only ever holds national digits, so a test that typed the dial code straight into the field
      no longer represents a realistic input; the assertion itself grew stricter (asserts the E.164
      `+`-prefixed wire value, not a digits-only string). Mutation (RED proof): reverting the probe to
      digits-only fails **exactly** the two dial-code probe tests (52 run, 2 failed, no collateral).
      `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (full `assembleDebug` + all-module
      `testDebugUnitTest`, 943 tasks). Diff = `apps/android` only (`core/model` [+2 fields on existing
      types, no new files], `feature/auth` [+2 composables, ViewModel wiring, ×4 locale strings]).
      **Follow-up:** phone-ownership/recovery-hint (needs a new decision core), then EMAIL/IDENTITY/
      PASSWORD/LANGUAGE/PROFILE/RECAP field UI in turn per the `auth-onboarding-shell` decomposition.
      **Slice 3 shipped** (`auth-email-step-fields`, 2026-08-09) — the EMAIL step's field UI. Re-proven
      before picking: `RegistrationStepContent.implemented` held only `PSEUDO`/`PHONE`, and every decision
      the step needed was **already shipped and tested** — `RegistrationFields.email`/`emailAvailable`,
      `SignupAvailabilityPolicy.emailStepCanProceed`/`emailIntent`, `RegistrationStepGate`'s EMAIL arm, the
      `RegistrationViewModel.onEmailChange`/`onEmailAvailability` setters, and the `emailInput` debounced
      probe pipeline (all wired since `signup-availability-probe`, 2026-07-25) — this slice is the first
      real UI consumer, exactly the `auth-phone-step-fields` shape one level simpler (single field, no
      picker, no skip). New `feature/auth/RegistrationScreen.kt` `EmailStepBody` — header/subtitle, an
      `OutlinedTextField` (`KeyboardType.Email`) bound to `state.fields.email`/`viewModel::onEmailChange`,
      and the available/taken indicator mirroring `PseudoStepBody`'s pattern verbatim. **No skip
      affordance** — iOS `StepEmailView` has none either (`RegistrationNavModel.showSkip` is PROFILE-only,
      and `SignupAvailabilityPolicy.emailStepCanProceed` always requires a confirmed-available address, no
      `skipEmail` escape hatch unlike PHONE's `skipPhone`) — verified by reading both the gate and the iOS
      view before assuming a skip button belonged here. `RegistrationStepContent.implemented` gains
      `EMAIL`, `RegistrationScreen`'s `when` gains its arm. **+1 core test**
      (`RegistrationStepContentTest.isImplemented_email_isTrue`; the "every other step" sweep renamed/
      updated to exclude PSEUDO+PHONE+EMAIL). Mutation (RED proof): the new test failed **exactly**
      against the pre-slice `implemented` set (4 run, 1 failed, no collateral) before the one-line core
      change; RGB confirmed green after. **Zero new ViewModel tests needed** — `RegistrationViewModelTest`
      already covered every EMAIL branch (`editingEmail_invalidatesStaleAvailability`,
      `validEmail_afterDebounce_probesAndAppliesVerdict`, the recap/register wire-field assertions) since
      the availability-probe slice; re-ran unmodified, stayed green (52/52), the regression proof for this
      Compose-wiring-only slice per `TDD-COVERAGE.md`'s exemption. `./apps/android/meeshy.sh check` →
      BUILD SUCCESSFUL (full `assembleDebug` + all-module `testDebugUnitTest`, 943 tasks). Diff =
      `apps/android` only (`core/model` [1-line `implemented` set change, no new files], `feature/auth`
      [+1 composable in `RegistrationScreen.kt`, the `when` arm, ×4 locale strings], zero ViewModel/network
      changes). **Follow-up:** IDENTITY/PASSWORD/LANGUAGE/PROFILE/RECAP field UI in turn per the
      `auth-onboarding-shell` decomposition — IDENTITY next (first/last name, no new core needed, same
      "wiring-only" shape as this slice); PROFILE needs a photo/banner picker + compression pipeline, the
      one step genuinely larger than the rest. **Slice 4 shipped** (`auth-identity-step-fields`,
      2026-08-09) — the IDENTITY step's field UI (first/last name, no availability probe, no skip); see
      the "First/last-name capture shipped" bullet above for the full writeup. **Follow-up:**
      PASSWORD/LANGUAGE/PROFILE/RECAP in turn — each adds its step to `RegistrationStepContent.implemented`
      + a `when` arm in `RegistrationScreen`.
- [x] First/last name capture; password strength meter + requirements checklist —
      **requirements-checklist + confirm-gate cores shipped** (slice `auth-password-requirements`,
      2026-07-21). The strength *meter* score (`PasswordStrength`, 0..5 bands) already existed; this
      slice adds the two remaining pure Step-5 cores from iOS `StepPasswordView` +
      `RegistrationViewModel.canProceed`. **(1)** `:core:model` `PasswordRequirements.evaluate` → a
      `PasswordRequirementsState` of the four itemised `requirementsCard` rows (length ≥ 8, an
      uppercase, a lowercase, a digit), each an independent boolean, `met` in card-render order +
      `allMet` for the shield-header tint. Distinct from the score meter (no special-char band, no
      12-char gate) — the discrete "have you satisfied this rule" checklist. **(2)** `:core:model`
      `PasswordEntry.evaluate(password, confirm)` → the pure confirm-interaction state: `showConfirmField`
      (`password.length ≥ 8`, verbatim iOS reveal gate), `match` (`UNDETERMINED` until a non-empty
      confirm on a visible field, then `MATCHED`/`MISMATCHED` — the inline card verdict), and
      `canProceed` (`password.length ≥ 8 && password == confirm`, verbatim `RegistrationViewModel`
      gate). +19 behavioural tests (10 `PasswordRequirementsTest` every row + boundary + `allMet` +
      symbol-is-not-a-row; 9 `PasswordEntryTest` reveal boundary / match verdicts / gate incl.
      matching-but-too-short). Mutation (RED proof): dropping the length gate from `canProceed`
      (`showConfirmField && password == confirm` → `password == confirm`) fails **exactly**
      `evaluate_bothEmpty` + `evaluate_matchingButTooShort` (9 run, 2 failed, no collateral).
      `:core:model:testDebugUnitTest` green + full `assembleDebug` → BUILD SUCCESSFUL. Diff =
      `apps/android` only. **Follow-up:** first/last-name capture (Step 3) + the app-side `StepPasswordView`
      composable (needs the registration wizard scaffold) rendering the checklist card + strength bar
      + match card driven by these cores.
      **First/last-name capture shipped** (slice `auth-identity-step-fields`, 2026-08-09) — the IDENTITY
      step's field UI, slice 4 of the `OnboardingFlowView` Compose decomposition. Re-proven before
      picking: `RegistrationStepContent.implemented` held only `PSEUDO`/`PHONE`/`EMAIL`, and every
      decision the step needed was already shipped — `RegistrationFields.firstName`/`lastName`,
      `RegistrationStepGate`'s IDENTITY arm (both non-blank), and
      `RegistrationViewModel.onFirstNameChange`/`onLastNameChange` (wired since `registration-step-gate-
      core`/`registration-wizard-viewmodel`, already exercised by `fillAllValid()` + the
      `register_blankOptionalNames_sendsNullNotBlank` wire-mapping test) — this slice is the first real
      UI consumer, same "wiring-only" shape as EMAIL one level up (two plain fields, no availability
      probe, no skip — `RegistrationStepGate`'s IDENTITY arm is purely local and
      `RegistrationNavModel.showSkip` is PROFILE-only). New `feature/auth/RegistrationScreen.kt`
      `IdentityStepBody` — header/subtitle + two `OutlinedTextField`s (first name, last name) bound to
      `state.fields.firstName`/`lastName` via the existing setters, no available/taken indicator (parity
      with iOS `StepIdentityView`, which has no server check either). `RegistrationStepContent.implemented`
      gains `IDENTITY`, `RegistrationScreen`'s `when` gains its arm. **+1 core test**
      (`RegistrationStepContentTest.isImplemented_identity_isTrue`; the "every other step" sweep updated
      to exclude PSEUDO+PHONE+EMAIL+IDENTITY). Mutation (RED proof): the new test failed **exactly**
      against the pre-slice `implemented` set (5 run, 1 failed, no collateral) before the one-line core
      change landed. **Zero new ViewModel tests needed** — `RegistrationStepGateTest` already covers
      every IDENTITY gate branch (both/first-blank/last-blank/both-blank/whitespace-only) and
      `RegistrationViewModelTest` already exercises `onFirstNameChange`/`onLastNameChange` end-to-end via
      `fillAllValid()` and the blank-names→null register mapping; re-ran unmodified and stayed green
      (52/52), the regression proof for this Compose-wiring-only slice per `TDD-COVERAGE.md`'s exemption.
      `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (full `assembleDebug` + all-module
      `testDebugUnitTest`, 943 tasks). Diff = `apps/android` only (`core/model` [1-line `implemented` set
      change, no new files], `feature/auth` [+1 composable in `RegistrationScreen.kt`, the `when` arm,
      ×4 locale strings], zero ViewModel/network changes).
      **Password strength/requirements/match UI shipped** (slice `auth-password-step-fields`,
      2026-08-09) — Step 5's field UI, slice 5 of the `OnboardingFlowView` Compose decomposition.
      Re-proven before picking: `RegistrationStepContent.implemented` held only
      `PSEUDO`/`PHONE`/`EMAIL`/`IDENTITY`, `RegistrationFields.password`/`confirmPassword` and
      `RegistrationViewModel.onPasswordChange`/`onConfirmPasswordChange` already existed and were
      already exercised end-to-end by `RegistrationViewModelTest.fillAllValid()` (wiring-only shape,
      same as EMAIL/IDENTITY) — the only missing piece was the Compose body. New
      `feature/auth/RegistrationScreen.kt` `PasswordStepBody` composes the three already-shipped pure
      cores verbatim, no re-implementation: `PasswordEntry.evaluate` (confirm-field reveal at
      `password.length >= 8`, match verdict once confirm is non-empty), `PasswordRequirements.evaluate`
      (the four-row checklist card), and `PasswordStrength.evaluate` (the 6-band meter — reuses the
      exact core already shipped and tested for `ChangePasswordScreen`, `:feature:settings`, rather than
      porting iOS onboarding's own file-local 4-band `PasswordStrength` enum; both share the identical
      6-boolean-factor raw score, so this is a richer presentation of the same signal, not a
      re-implementation with different math — read both iOS types before choosing, they are genuinely
      different enums with the same underlying arithmetic). A local `PasswordField` composable adds the
      show/hide toggle every OutlinedTextField in this step needs (`PasswordVisualTransformation`,
      mirrors `ChangePasswordScreen`'s private `PasswordField`, duplicated rather than extracted to a
      shared module — `:feature:auth` and `:feature:settings` don't share a UI component today and
      Compose glue is exempt from the coverage gate, so extracting a cross-module component is a
      separate, deliberate refactor, not part of this slice). No skip affordance
      (`RegistrationNavModel.showSkip` is PROFILE-only, matches iOS `StepPasswordView` having none
      either). **+1 core test** (`RegistrationStepContentTest.isImplemented_password_isTrue`; the
      "every other step" sweep renamed to exclude PSEUDO+PHONE+EMAIL+IDENTITY+PASSWORD). **Mutation
      (RED proof):** the new test against the pre-slice `implemented` set failed **exactly**
      `isImplemented_password_isTrue` (6 run, 1 failed, no collateral) before the one-line core change
      landed. **Zero new ViewModel tests needed** — `RegistrationViewModelTest` already exercises
      `onPasswordChange`/`onConfirmPasswordChange` via `fillAllValid()`; re-ran unmodified and stayed
      green (52/52), the regression proof for this Compose-wiring-only slice per `TDD-COVERAGE.md`'s
      exemption. `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (full `assembleDebug` + all-module
      `testDebugUnitTest`, 943 tasks). Diff = `apps/android` only (`core/model` [1-line `implemented`
      set change, no new files], `feature/auth` [+7 composables in `RegistrationScreen.kt`, the `when`
      arm, ×19 locale strings ×4 locales], zero ViewModel/network changes). Box flips to `[x]` — every
      field-UI element `feature-parity.md` names for this bullet (strength meter, requirements
      checklist, match card, first/last-name capture) is now wired. **Follow-up:**
      LANGUAGE/PROFILE/RECAP field UI in turn per the `auth-onboarding-shell` decomposition; LANGUAGE
      next (picker + live-translation preview, core shipped per `auth-language-step-selection-core`).
- [x] System + regional language selection with live translation preview — **picker + preview
      decision core shipped** (slice `auth-language-step-selection-core`, 2026-07-22). Pure
      `:core:model/auth/LanguageStepSelection.kt` (`LanguageSlot` enum + `LanguageSelectionState`
      data class + `LanguageStepSelection` object), a faithful port of iOS `StepLanguageView`
      (`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`) over
      `RegistrationViewModel.systemLanguage`/`.regionalLanguage`. Decisions: `pickerLanguages`
      (= `LanguageData.allLanguagesCommonFirst`, reusing the catalogue SSOT — mirrors iOS
      `LanguageSelector.defaultLanguages`, no drift); `filter(query)` (empty query → whole list,
      else case-insensitive `nativeName`/`code` contains — faithful to iOS `filteredLanguages`,
      untrimmed `isEmpty` guard); `summaryLabel(code)` (`"<flag> <nativeName>"` or raw-code fallback);
      `selectedLanguageName(code)` (nativeName or raw-code fallback, the preview description);
      `translationPreview(systemLanguage)` (verbatim port of iOS `translatedExample` — 11 explicit
      arms + French default for every other language incl. English); `isSelected(slot, code, state)`
      (slot-aware highlight, reads only the edited slot); `select(slot, code, state)` (slot-aware
      immutable write, other slot untouched). **SOTA note:** iOS scatters the filter, summary-label
      fallback, slot-aware write, and preview switch across a SwiftUI `View` body + `@State
      editingTarget`; Android lifts every decision into one framework-free SSOT reusing `LanguageData`,
      so the picker composable is a thin caller and every branch is JVM-testable. **+32 behavioural
      tests** (`LanguageStepSelectionTest`): 2 pickerLanguages / 5 filter (empty / by-name / by-code /
      no-match / no-dup) / 3 summaryLabel (known / unknown / blank) / 2 selectedLanguageName /
      13 translationPreview (11 arms + unknown→fr + english→fr default) / 3 isSelected (system /
      regional / slot-isolation) / 4 select (system / regional / inert reselect / input-unmutated).
      Expectations are hand-written literals (not tautological). **Mutation check (RED proof):**
      flipping `summaryLabel`'s raw-code fallback to `""` fails **exactly**
      `summaryLabel_unknownCode_fallsBackToRawCode` (32 run, 1 failed, no collateral); RED was also
      proven first by the suite failing to compile against the absent `LanguageStepSelection`/
      `LanguageSlot`/`LanguageSelectionState` types. **Gate (system Gradle 8.14.3, `LANG=C.UTF-8`,
      `$HOME/android-sdk`):** `:core:model:testDebugUnitTest` green (whole module) + `:app:assembleDebug`
      → BUILD SUCCESSFUL (every module compiled). Diff = `apps/android` only (1 new source file +
      1 test + tracking docs). **Follow-up:** the app-side `StepLanguageView` composable (system/regional
      tab, searchable grid driven by `filter`, summary cards via `summaryLabel`, the live-preview
      example card via `translationPreview`/`selectedLanguageName`) wired into the `RegistrationViewModel`
      + the `RegistrationStepGate` LANGUAGE arm (`systemLanguage.isNotEmpty()`).
      **Wizard now collects the regional slot** (slice `registration-regional-language`, 2026-07-26):
      `RegistrationFields` gains `regionalLanguage: String = ""`; `RegistrationViewModel` exposes
      `onRegionalLanguageChange(value)` and a derived `RegistrationUiState.languageSelection:
      LanguageSelectionState` (= `system`/`regional` fields, the read-model the picker's
      `LanguageStepSelection.isSelected`/`select` consume for slot highlighting). The regional code now
      flows into the RECAP summary (`RegistrationSummary` input's `regionalLanguage`, so the LANGUAGES row
      renders `system / regional` when distinct, collapses to `system` alone when blank/equal) and into
      `RegisterRequest.regionalLanguage` (**trimmed → null when blank**, matching iOS's optional secondary
      language). **+7 behavioural VM tests** (setter updates field; `languageSelection` mirrors both slots;
      register sends the chosen code / null when blank / null when whitespace / trimmed value; summary
      shows the distinct regional label). **Mutation (RED proof):** replacing the `toRegisterRequest`
      regional line with `null` fails **exactly** `register_sendsChosenRegionalLanguage` +
      `register_trimsRegionalLanguageValue`, no collateral.
      **App-side `LanguageStepBody` composable shipped** (slice `auth-language-step-fields`,
      2026-08-09) — the wizard's Step 6 field UI, closing the two follow-ups above and flipping
      this box to `[x]`. Re-proven before picking: `RegistrationStepContent.implemented` held
      only PSEUDO/PHONE/EMAIL/IDENTITY/PASSWORD — LANGUAGE still rendered the inert placeholder.
      Every decision the step needed was already shipped: `LanguageStepSelection` (picker list,
      search filter, summary/preview labels, slot-aware highlight + write, since
      `auth-language-step-selection-core`) and `RegistrationViewModel.onSystemLanguageChange`/
      `onRegionalLanguageChange`/`languageSelection` (since `registration-regional-language`).
      `RegistrationScreen.kt` gains `LanguageStepBody` — two tappable slot cards (label + current
      `summaryLabel`, tap both shows the slot's value and activates it for editing — a deliberate
      merge of iOS's separate always-visible summary cards + tab-button row into one control),
      a search field driving `LanguageStepSelection.filter`, a non-lazy 2-column picker grid over
      the (already small, 79-entry) filtered list highlighting the active slot's current choice
      (`LanguageStepSelection.isSelected`), and a translation-preview card
      (`LanguageStepSelection.translationPreview`). **Deliberately non-lazy grid:** the step body
      already sits inside the wizard's outer `verticalScroll` `Column` (`RegistrationScreen`) — a
      `LazyVerticalGrid`/`LazyColumn` nested there without a bounded height crashes Compose
      ("infinity maximum height constraints"), same pitfall `CountryPickerSheet` sidesteps with a
      `heightIn(max = …)` inside its own `ModalBottomSheet`; a plain `chunked(2)` grid composed
      directly into the parent scroll avoids the nesting hazard entirely and is simple enough for
      79 rows. **Deliberately out of scope:** wiring `SignupRegionInference`/`SignupLanguages`
      (shipped `auth-region-language-inference`, 2026-07-21) to pre-select from the device locale
      — a distinct follow-up the bullet above already called out separately from the field-UI
      slice, same "wiring-only" shape as PHONE shipping with a static default country rather than
      device-locale inference. **+1 core test**
      (`RegistrationStepContentTest.isImplemented_language_isTrue`; the "every other step" sweep
      renamed to exclude PSEUDO+PHONE+EMAIL+IDENTITY+PASSWORD+LANGUAGE). **Mutation (RED proof):**
      the new test against the pre-slice `implemented` set failed **exactly**
      `isImplemented_language_isTrue` (7 run, 1 failed, no collateral) before the one-line core
      change landed. **Zero new ViewModel tests needed** — `RegistrationViewModelTest` already
      exercises `onSystemLanguageChange`/`onRegionalLanguageChange`/`languageSelection` (since
      `registration-regional-language`); re-ran unmodified and stayed green (52/52) — the
      regression proof for this Compose-wiring-only slice, per `TDD-COVERAGE.md`'s exemption for
      `@Composable` glue. **Gate:** `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL in 39s`
      (full `assembleDebug` + all-module `testDebugUnitTest`, 943 tasks). Reviewer **PASS** (diff
      `apps/android` only — `core/model` [1-line `implemented` set change, no new files],
      `feature/auth` [+9 composables in `RegistrationScreen.kt`, the `when` arm, ×6 locale
      strings ×4 locales]; SDK purity — `LanguageStepBody` is ordinary UI glue over the stateless
      `LanguageStepSelection` core + ViewModel state, no shared-singleton-plus-product-rule combo;
      SSOT — reuses `LanguageStepSelection`/`LanguageData`/`RegistrationViewModel`'s existing
      language wiring untouched, re-implements no rule; instant-app — no spinner introduced; UDF —
      unchanged `RegistrationViewModel` + immutable `StateFlow`; no dead end — Back stays
      reachable, Next stays disabled until a system language is chosen; no tautological tests; no
      coverage floor lowered, no existing test weakened). **Follow-up (deliberately deferred, not
      part of this slice):** wiring `SignupRegionInference` for a device-locale default (noted
      above).
- [x] Profile photo / banner / bio optional step; registration recap + terms acceptance —
      **unified per-step proceed-gate core shipped** (slice `registration-step-gate-core`, 2026-07-22).
      Pure `:core:model/auth/RegistrationStepGate.kt` — the SSOT capstone that answers the wizard's
      advance decision for **all 8 steps**, a faithful port of iOS `RegistrationViewModel.canProceed`
      (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`, the computed
      `switch currentStep` var gating the bottom bar's Next/Register button). `RegistrationStepGate.
      canProceed(step, fields)` over an immutable **`RegistrationFields`** snapshot (the exact
      `@Published` inputs iOS reads; tri-state `Boolean?` availability = not-probed vs confirmed-taken).
      **Composes the already-shipped per-field cores** rather than re-implementing them: PSEUDO/PHONE/EMAIL
      → `SignupAvailabilityPolicy.{username,phone,email}StepCanProceed` (local validity AND server
      availability, phone honouring `skipPhone`); PASSWORD → `PasswordEntry.evaluate(...).canProceed`
      (≥8 AND confirm match). The four arms with no prior core are encoded verbatim from iOS: IDENTITY →
      first & last name both non-blank (iOS trims both → `isNotBlank`); LANGUAGE → `systemLanguage.
      isNotEmpty()` (iOS `!systemLanguage.isEmpty`, a picker-sourced code); PROFILE → always `true` (the
      optional photo/bio step); RECAP → `acceptTerms`. **SOTA note:** iOS spreads the eight-arm decision
      inside a stateful ViewModel computed var re-inlining the username/email/phone/password rules; Android
      lifts the whole decision into one framework-free SSOT reusing the shipped cores, so the ViewModel is a
      thin caller feeding this boolean straight into `RegistrationStepNavigator.advance`. **+26 behavioural
      tests** (`RegistrationStepGateTest` — 4 pseudo (valid+available / invalid / null / false); 4 phone
      (skipped-short / valid+available / too-short / null); 3 email; 5 identity (both / first-blank /
      last-blank / both-blank / whitespace-only); 3 password; 2 language; 1 profile-always; 2 recap; plus 2
      whole-wizard compositions — every step green for a fully-valid snapshot, only PROFILE green for an
      empty one). Expectations are hand-written literals (not tautological). **Mutation check (RED proof):**
      flipping the RECAP arm to a constant `true` fails **exactly** `recap_termsNotAccepted_blocks` +
      `onlyProfileProceeds_forAnEmptySnapshot` (26 run, 2 failed, no collateral); RED was also proven first
      by the suite failing to compile against the absent `RegistrationFields`/`RegistrationStepGate` types.
      **Gate (system Gradle 8.14.3, `LANG=C.UTF-8`, `$HOME/android-sdk`):** `:core:model:testDebugUnitTest`
      green (whole module, new suite 26/26) + `:app:assembleDebug` → BUILD SUCCESSFUL (every module
      compiled). Diff = `apps/android` only (1 new source file + 1 test + tracking docs). **Follow-up:** the
      app-side profile photo/banner/bio step composables + the recap screen (terms checkbox → `acceptTerms`)
      + the `RegistrationViewModel` wiring `RegistrationStepGate.canProceed(currentStep, fields)` into
      `RegistrationStepNavigator.advance`, and the still-`[ ]` System+regional language selection step above.
      **Recap summary core shipped** (slice `registration-recap-summary`, 2026-07-26). Pure
      `:core:model/auth/RegistrationSummary.kt` — the SSOT for the recap card's rows, a faithful port of
      iOS `RegistrationViewModel.summaryItems`
      (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`, the computed
      `[(icon, label, value)]` the recap renders). `RegistrationSummary.rows(RegistrationSummaryInput)` →
      an ordered `List<RegistrationSummaryRow>` keyed by a semantic `SummaryField`
      (USERNAME/EMAIL/NAME/PHONE/LANGUAGES/BIO): USERNAME/EMAIL/NAME/LANGUAGES always present, PHONE and
      BIO appended only when populated — mirroring iOS's `if !phoneNumber.isEmpty` / `if !bio.isEmpty`
      appends. **SOTA over iOS:** iOS returns UI tuples with the SF Symbol name + the untranslated French
      label baked in; Android surfaces only *which rows appear and each resolved value* keyed by the
      semantic field, leaving icon + localized label to the recap composable, and hardens three edges iOS's
      raw interpolation lacks — values trimmed (username/email via the `SignupFieldValidation` normalizers),
      a **skipped** phone never resurfaces a stale number, and the language value **collapses to the system
      label alone** when no distinct regional language was chosen (vs iOS's always `"system / regional"`).
      Reuses `LanguageStepSelection.summaryLabel` for the flag+native-name labels (no drift from the
      `LanguageData` catalogue). **Wiring:** `RegistrationUiState.summary` derives the rows from the fields
      already collected (dial code / regional language / bio not yet gathered by the wizard stay collapsed
      until those steps land — the core supports them the moment they are), exposed the same way as
      `canProceed` / `fill`. **+20 behavioural tests** (18 `RegistrationSummaryTest` — order full/minimal,
      username/email trimming, name both/first-only/last-only/both-blank/inner-whitespace, phone
      present/blank/skipped/no-dial-code, languages distinct/equal/blank-regional, bio non-blank/whitespace;
      +2 `RegistrationViewModelTest` — summary reflects collected fields in recap order, phone omitted after
      the phone step is skipped). Expectations are hand-written literals / SSOT-referenced (not tautological).
      **Mutation check (RED proof):** dropping the `skipPhone` guard fails **exactly**
      `phone_skipped_isOmittedEvenWhenNumberLingers` (18 run, 1 failed, no collateral). **Gate:**
      `./apps/android/meeshy.sh check` (`assembleDebug testDebugUnitTest`) → **BUILD SUCCESSFUL in 9m38s**
      (every module; `RegistrationViewModelTest` 32/32, `RegistrationSummaryTest` 18/18). Diff =
      `apps/android` only (1 new source + 1 new test + edits to the wizard VM/its test + tracking docs).
      **RECAP step field UI shipped** (slice `auth-recap-step-fields`, 2026-08-09) — slice 7 of the
      `OnboardingFlowView` Compose decomposition, closing the "registration recap + terms acceptance"
      half of this checklist item (the "profile photo / banner / bio" half — PROFILE — is still `[ ]`,
      the one step genuinely large enough it needs its own photo/banner picker + compression pipeline).
      New `feature/auth/RegistrationScreen.kt` `RecapStepBody` — header/subtitle, a `RecapSummaryCard`
      rendering `RegistrationUiState.summary`'s rows (icon + localized label per
      `SummaryField`, faithful port of iOS `summaryItems`'s SF Symbols: `at`→`AlternateEmail`,
      `envelope.fill`→`Email`, `person.fill`→`Person`, `phone.fill`→`Phone`, `globe`→`Language`), and a
      `RecapTermsCheckbox` (`Modifier.toggleable(role = Role.Checkbox)` for correct a11y semantics,
      mirrors iOS's `.accessibilityAddTraits(.isSelected)` intent) bound verbatim to the already-shipped
      `RegistrationViewModel.onAcceptTermsChange` — no new ViewModel/core code needed, the RECAP gate
      (`RegistrationStepGate.canProceed`'s `fields.acceptTerms` arm) and the register-button wiring
      (`RegistrationNavModel.primaryAction == REGISTER` → `viewModel.register()`) were already correct
      and already tested, the same "wiring-only" shape as every step since `auth-identity-step-fields`.
      A "Read the terms" link opens a `RecapTermsSheet` (`ModalBottomSheet`, same established pattern as
      `CountryPickerSheet`) with the terms body text ported from iOS's `termsSheet`. **Deliberately no
      password row**: iOS's recap appends a `••••••••` row (`String(repeating: "•", count:
      min(password.count, 10))`) outside `summaryItems`; Android's `RegistrationSummaryRow`/
      `SummaryField` (shipped `registration-recap-summary`, 2026-07-26) has no `PASSWORD` case — a
      decision made and tested two slices before this one, re-verified here (not silently overridden)
      rather than re-opening the core to add a field only this step would ever read. Never re-surfacing
      the password, even as masked dots whose *length* leaks a weak signal, is treated as a legitimate
      simplification over iOS. **SSOT reuse:** the terms sheet's close button reuses the existing
      `registration_close` string (already used by the top bar's leading-Close icon) rather than adding
      a near-duplicate "Fermer"/"Close" string. **No skip affordance** (`RegistrationNavModel.showSkip`
      is PROFILE-only, matches iOS `StepRecapView` having none). Loading/error states are NOT
      re-implemented inside the step body (unlike iOS, which branches internally) — the wizard's shared
      `state.errorMessage` banner (above every step body since `auth-onboarding-shell`) and the bottom
      bar's `loading` param already cover both, so RECAP stays as thin as every other field-UI step.
      **+2 core tests** (`RegistrationStepContentTest.isImplemented_recap_isTrue`; the "every other
      step" sweep renamed to exclude PSEUDO+PHONE+EMAIL+IDENTITY+PASSWORD+LANGUAGE+RECAP). **Mutation
      (RED proof):** the new test against the pre-slice `implemented` set (still only `{PSEUDO, PHONE,
      EMAIL, IDENTITY, PASSWORD, LANGUAGE}`) failed **exactly** `isImplemented_recap_isTrue` (8 run, 1
      failed, no collateral) before the one-line core change landed. **Zero new ViewModel tests
      needed** — `RegistrationViewModelTest` already exercises `onAcceptTermsChange`/`register()`/
      `summary` end-to-end; re-ran unmodified and stayed green (52/52) — the regression proof for this
      Compose-wiring-only slice, per `TDD-COVERAGE.md`'s exemption for `@Composable` glue. **Gate:**
      `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 23s** (full `assembleDebug` + all-module
      `testDebugUnitTest`, 970 tasks). Reviewer **PASS** (diff `apps/android` only — `core/model`
      [1-line `implemented` set change, no new files], `feature/auth` [+9 composables/helpers in
      `RegistrationScreen.kt`, the `when` arm, ×13 locale strings ×4 locales], `tasks/feature-parity.md`;
      SDK purity — `RegistrationStepContent` stays a stateless `:core:model` lookup, every new Composable
      is ordinary UI glue over the already-shipped `RegistrationSummary`/`RegistrationStepGate`/
      `RegistrationViewModel` cores, no shared-singleton-plus-product-rule combo; SSOT — reuses every
      existing recap/terms/register wiring untouched, re-implements no rule, reuses `registration_close`
      instead of duplicating it; instant-app — no spinner introduced; UDF — unchanged
      `RegistrationViewModel` + immutable `StateFlow`; no dead end — Back stays reachable, the terms
      sheet dismisses via its close button/scrim/swipe; no tautological tests; no coverage floor
      lowered, no existing test weakened). **PROFILE step field UI + post-registration upload shipped**
      (slice `auth-profile-step-fields`, 2026-08-09) — slice 8/8, closing the `OnboardingFlowView`
      Compose decomposition entirely. **RE-PROVEN, not re-scoped:** every prior run since
      `auth-password-step-fields` flagged PROFILE as "the one step genuinely large enough it needs its
      own photo/banner picker + compression pipeline" — re-reading the actual remaining surface (not the
      note) before committing this run found the opposite: `feature/profile/AvatarBannerUploadViewModel`
      already ships a fully tested pick → validate (`ImageUploadValidator`) → upload (`MediaRepository`)
      → confirm (`UserRepository.updateAvatar`/`updateBanner`) pipeline for the Settings/Profile avatar
      editor, and `RegistrationSummaryInput.bio` already existed unused since `registration-recap-summary`
      — so the actual gap was two afternoons of wiring, not a new subsystem. No compression pipeline
      exists anywhere in `apps/android` today (grepped `Bitmap.CompressFormat`/`BitmapFactory` — zero
      production hits); the existing avatar/banner flow uploads raw picked bytes capped by
      `ImageUploadTarget.{AVATAR,BANNER}.maxBytes` (8 MB / 12 MB) instead, which this slice reuses
      as-is rather than inventing byte-shrinking Android never had. **Also re-verified against iOS
      itself, not just its `RegistrationViewModel.@Published` fields:** `StepProfileView` never sends
      `profileImage`/`bannerImage`/`bio` through `POST /auth/register` at all — `RegisterRequest` has no
      such fields. iOS uploads them **after** authentication succeeds, via a separate
      `OnboardingFlowView.uploadProfileCompletionAssets()` → `ProfileCompletionUploader`, best-effort and
      independent per asset. Android mirrors this exactly rather than trying to smuggle the assets into
      `RegisterRequest`. **Added (production, all `apps/android`):** `RegistrationFields.bio` (the one
      genuinely core-relevant addition — feeds `RegistrationUiState.summary` via
      `RegistrationSummaryInput(bio = fields.bio)`, wiring the already-shipped but previously-unused
      `SummaryField.BIO` row for the first time); `RegistrationUiState.profileImage`/`bannerImage:
      MediaUploadItem?` (kept OUTSIDE `fields` — unlike bio, nothing in `RegistrationStepGate` or
      `RegistrationSummary` ever reads them, they only feed the post-registration upload); ViewModel
      setters `onBioChange`/`onProfileImagePicked`/`onBannerImagePicked`; `RegistrationScreen.kt`
      `ProfileStepBody` (optional-note banner, `ProfilePreviewCard` with two `PickVisualMedia` pickers +
      `AsyncImage` previews off the picked bytes directly — Coil 2.7's built-in `ByteArrayMapper`, no
      Uri persistence needed across step navigation — a bio `OutlinedTextField` with a 150-char soft
      counter, matching iOS's display-only ceiling) + `RecapSummaryCard` **reused verbatim** for the
      profile preview (iOS reuses the same `summaryItems` for both `StepProfileView` and
      `StepRecapView` — same card, no near-duplicate string/composable). **Deliberate simplification
      over iOS:** the avatar does not overlap the banner (iOS offsets it -30pt over the banner's bottom
      edge) — a plain stacked layout sidesteps Compose's offset/clip interaction inside a rounded,
      clipped container for a purely cosmetic flourish with zero functional value. **Post-registration
      upload wiring** (`RegistrationViewModel.register()` → new `uploadProfileCompletionAssets`): fires
      only after `authRepository.register()` returns `NetworkResult.Success` (by which point
      `AuthRepository.storeSession` has already adopted the session, so the calls below are
      authenticated) and before the final `isRegistered = true` flip. Avatar/banner go through the exact
      same `ImageUploadValidator.validate` → `MediaRepository.upload` → `AvatarBannerUpload.
      firstUploadedUrl` → `UserRepository.updateAvatar`/`updateBanner` sequence
      `AvatarBannerUploadViewModel` already ships (not called directly — that ViewModel is scoped to the
      profile screen's own uploading/error UI state, which this fire-and-forget call has no use for).
      Bio goes through `UserRepository.enqueueProfileEdit` + waking `OutboxFlushWorker` on a non-null
      `cmid` — the exact established optimistic + offline-durable path `SettingsViewModel`/
      `ProfileViewModel` already use for profile edits (SOTA over iOS's online-only bio save), not a new
      one invented for this slice. Every step wrapped in `try/catch` (rethrowing `CancellationException`)
      so a failed upload never blocks `isRegistered` — proven by a dedicated test that throws inside
      `mediaRepository.upload` and asserts `isRegistered` still flips true. **Deliberate divergence from
      iOS's shape:** iOS fires this upload via a detached `Task` (survives the view's dismissal); Android
      awaits it inline inside the same `viewModelScope.launch` before flipping `isRegistered`, because
      `RegistrationScreen`'s `LaunchedEffect(state.isRegistered)` navigates away immediately on that flip,
      which would cancel a sibling `launch` racing it — awaiting first trades iOS's marginally earlier UI
      handoff for a guarantee the picked photo is never silently dropped. **+15 new/changed tests**
      (`RegistrationStepContentTest.isImplemented_profile_isTrue` + the "every other step" sweep, now
      permanently vacuous since all 8 steps are implemented; `RegistrationViewModelTest`:
      `onBioChange`/`onProfileImagePicked`/`onBannerImagePicked`, bio summary include/omit, avatar upload
      + confirm, banner upload + confirm, bio enqueue + wake-worker, no-assets skips every call, an
      `ImageUploadValidator`-rejected empty pick skips upload, an explicit `NetworkResult.Failure` from
      the upload call skips the confirm PATCH, and the exception-safety-net test). **Mutation (RED
      proof):** the PROFILE-implemented test against the pre-slice `implemented` set failed **exactly**
      `isImplemented_profile_isTrue` (10 run, 1 failed, no collateral); the full `RegistrationViewModel`
      test file failed to *compile* against the pre-slice 2-arg constructor before the 3 new deps landed
      — a stronger RED than a runtime failure. **Gate:** `./apps/android/meeshy.sh check` → **BUILD
      SUCCESSFUL in 36s** (full `assembleDebug` + all-module `testDebugUnitTest`, 970 tasks). Reviewer
      **PASS** (diff `apps/android` only — `core/model` [`RegistrationFields.bio`,
      `RegistrationStepContent.implemented`], `feature/auth` [`RegistrationViewModel` +3 constructor
      deps + upload orchestration, `RegistrationScreen.kt` +3 composables + 2 private extensions, +8
      locale strings ×4 locales, `build.gradle.kts` +2 deps: `work-runtime`, `coil-compose`],
      `tasks/feature-parity.md`; SDK purity — the ViewModel orchestrates existing `:sdk-core`
      repositories, no product rule added to `:sdk-core`/`:sdk-ui`; SSOT — reuses
      `ImageUploadValidator`/`AvatarBannerUpload`/`MediaRepository`/`UserRepository.enqueueProfileEdit`/
      `RecapSummaryCard` untouched, invents nothing; instant-app — no new blocking spinner, the existing
      `isSubmitting` spinner just covers a little more work; UDF — unchanged `RegistrationViewModel` +
      immutable `StateFlow`; no dead end — Back/skip unchanged; no tautological tests; no coverage floor
      lowered, no existing test weakened). The **`OnboardingFlowView` Compose decomposition is now
      complete (8/8 steps)** — every `RegistrationStep` has real field UI.
- [~] Email verification by 6-digit code (OTP autofill, resend, success animation) —
      **field sanitiser + completeness gate + verify/resend/edit gates core shipped** (slice
      `auth-otp-verification-core`, 2026-07-21). Pure `:core:model` `OtpCodeField` +
      `OtpVerificationGate` (faithful port of iOS `EmailVerificationView`,
      `apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift`, over
      `EmailVerificationViewModel`). `OtpCodeField.sanitize(raw)` is the whole `codeField`
      `onChange` transform — keep ASCII `0-9` only (deliberately **not** `Char.isDigit`, which
      is Unicode-decimal-aware: a pasted fullwidth/Arabic-Indic digit is stripped, not silently
      accepted) then `prefix(6)` — and `isComplete(code)` is the `code.count == 6` gate hardened
      with an all-digit guard. `OtpVerificationGate` folds the four view-model flags (`isVerifying`,
      `isResending`, `resendConfirmed` = iOS `resendSuccess`, `verified` = iOS `verificationSuccess`)
      into the button/field derivations that iOS buries as inline `.disabled(...)`:
      `canVerify(code)` (inverse of `!isCodeComplete || isVerifying || verificationSuccess`),
      `isCodeEditable` (inverse of `isVerifying || verificationSuccess`), `canResend` (inverse of
      `isResending || resendSuccess`), and `showResendConfirmation`. **SOTA note:** iOS scatters the
      sanitiser + three disabled gates across the View body; Android lifts them into one SSOT so a
      Compose `onValueChange` filters through one function and every combined gate is JVM-testable.
      +26 behavioural tests (`OtpVerificationTest` — 9 sanitize: clean/strip letters+symbols/strip
      spaces/truncate/truncate-after-strip/edge-whitespace/empty/all-non-digit/drop-non-ASCII-digit;
      5 isComplete: 6-digit / 5 / 7 / empty / 6-non-digit-guard; 4 canVerify; 3 isCodeEditable;
      3 canResend; 2 showResendConfirmation). Expectations are hand-written literals (not tautological).
      Mutation (RED proof): dropping the `take(LENGTH)` truncation fails **exactly**
      `sanitize_truncatesToSixDigits` + `sanitize_truncatesAfterStrippingNonDigits` (26 run, 2 failed,
      no collateral). `:core:model:testDebugUnitTest` green (26/26) + full `assembleDebug` +
      all-module `testDebugUnitTest` → BUILD SUCCESSFUL. Diff = `apps/android` only. **Follow-up:**
      the app-side `EmailVerificationView` composable (code field driving `OtpCodeField.sanitize` →
      `AuthService.verifyEmailWithCode`, resend → `resendVerificationEmail` with the 3 s confirmation
      window off a `Flow`, success overlay) + `oneTimeCode` autofill.
- [x] Country auto-detection + region→language inference at signup — **inference core shipped**
      (slice `auth-region-language-inference`, 2026-07-21). Pure `:core:model`
      `SignupRegionInference` + `SignupLanguages` (faithful port of iOS
      `RegistrationViewModel.detectLanguages()` + `detectCountry()`,
      `packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`). Holds the verbatim
      50-entry `regionLanguageMap` (ISO 3166-1 alpha-2 → default regional language) and the pure
      resolvers: `inferLanguages(deviceLanguage, deviceRegion, supportedLanguageCodes)` → the
      `system`/`regional` pair (system = supported device language else `fr`; regional = the mapped
      region language when supported AND distinct from system, else `en`, but `fr` when that `en`
      fallback would duplicate an English system — both slots always distinct); and
      `inferCountryIso(deviceRegion, knownCountryCodes)` → the region ISO uppercased when it is a known
      country (app passes `CountryCatalog.dialCodes.keys`). `Locale`-free / JVM-testable — the app
      injects `Locale.getDefault().language` / `.country` + the `LanguageData` code set. +22 behavioural
      tests (`SignupRegionInferenceTest`: every system/regional branch, casing, null/blank inputs,
      equal-to-system + unsupported-region + unknown-region fallbacks, en-system duplicate avoidance,
      the 50-entry map, and the country resolver incl. the real catalogue set). Mutation (RED proof):
      dropping the `it != system` guard from the regional gate fails **exactly**
      `dropsRegionalLanguageEqualToSystem` + `regionMappingEqualToEnglishSystemFallsBackToFrench` +
      `regionMappingEqualToNonEnglishSystemFallsBackToEnglish` (22 run, 3 failed, no collateral).
      `:core:model:testDebugUnitTest` green + full `:app:assembleDebug` → BUILD SUCCESSFUL. Diff =
      `apps/android` only. **Follow-up shipped** (slice `auth-signup-region-inference-wiring`,
      2026-08-10): wired into the app-side registration-wizard scaffold — see §Auth's own wiring
      note under the routine's `PROGRESS.md` for the full writeup. `RegistrationViewModel.init` now
      calls a new `applyDeviceLocaleDefaults()` (new `:sdk-core` seam
      `me.meeshy.sdk.locale.DeviceLocaleProvider`/`SystemDeviceLocaleProvider`, same shape as
      `CacheClock`/`SystemCacheClock`, wrapping `Locale.getDefault()` behind a fake-able interface
      for tests) that feeds `SignupRegionInference.inferLanguages`/`.inferCountryIso` and applies the
      result to `RegistrationFields.systemLanguage`/`.regionalLanguage`/`.countryIso` before the user
      touches anything — pre-selecting the LANGUAGE step and the PHONE step's country picker exactly
      like iOS `RegistrationViewModel.init()` → `detectCountry()` + `detectLanguages()`.
- [~] Password recovery via email link — **pure flow core shipped** (slice `auth-email-recovery-core`,
      2026-07-21). Faithful port of iOS `MeeshyForgotPasswordView.emailFlow`
      (`packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyForgotPasswordView.swift`): the `@State email` /
      `@State emailSent` pair driven by `authManager.requestPasswordReset(email:)`. Pure
      `:core:model/auth/EmailRecovery.kt` — **`EmailRecoveryStep{INPUT,SENT}`** + **`EmailRecoveryState`**
      (`step`/`submittedEmail`), a two-state machine whose single transition `onSent(email)` is **guarded**
      on the current step (a late/duplicate success can neither reopen nor overwrite a confirmed flow —
      iOS flips `emailSent=true` unconditionally) and **snapshots the submitted address verbatim** into
      `submittedEmail` so the "Si un compte existe avec {email}…" confirmation is immune to later field
      edits (iOS interpolates the *live* field). **`EmailRecoveryInput.canSend`** — a local email-validity
      gate iOS lacks (it gates the Send button on `isLoading` only), delegating to the existing
      `SignupFieldValidation.isEmailValidLocally` SSOT (loose `@`+`.`) so no rule is re-implemented.
      **+9 behavioural tests** (`EmailRecoveryTest`). **Mutation check (RED proof):** dropping the
      `onSent` step guard fails **exactly** `onSent_fromSent_isInert_andDoesNotOverwriteTheCapturedEmail`
      + `onSent_fromSent_returnsAnEquivalentStateUnchanged` (9 run, 2 failed, no collateral) — behavioural,
      not tautological; RED was also proven first by the suite failing to compile against the absent types.
      **Gate (system Gradle 8.14.3, `LANG=C.UTF-8`, `$HOME/android-sdk`):** `:core:model:testDebugUnitTest`
      green (whole module, new suite 9/9) + `:app:assembleDebug` → BUILD SUCCESSFUL. Diff = `apps/android`
      only (1 new source file + 1 test). **Follow-up:** the app-side `ForgotPasswordView` composable +
      `RecoveryMode` (email/phone) segmented picker + `EmailRecoveryViewModel` wiring `requestPasswordReset`
      to the machine, unifying this core with the sibling phone-recovery core below.
- [~] Password recovery via phone (lookup → masked-info challenge → SMS code → reset) —
      **pure flow core shipped** (slice `auth-phone-recovery-challenge`, 2026-07-21). Faithful port of
      the flow iOS scatters as `@State` across `MeeshyForgotPasswordView`
      (`packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyForgotPasswordView.swift`): `PhoneStep`
      (`lookup`/`verifyIdentity`/`verifyCode`) + the reset sheet + success screen, driven by
      `phoneLookup` (POST `/auth/forgot-password/phone/lookup` → `tokenId` + `maskedUserInfo`),
      `phoneVerifyIdentity` (POST `.../verify-identity` → `codeSent`), `phoneVerifyCode` (POST
      `.../verify-code` → `resetToken`), `doResetPassword` (POST `/auth/reset-password`). Two pure
      `:core:model/auth/` types. **`PhoneRecoveryState`** (`step`/`maskedInfo`/`resetToken`, +
      `MaskedUserInfo` + `PhoneRecoveryStep{LOOKUP,VERIFY_IDENTITY,VERIFY_CODE,RESET,SUCCESS}`) —
      an immutable step machine whose four transitions (`onLookupSuccess`/`onIdentityVerified`/
      `onCodeVerified`/`onResetSuccess`) are **guarded on the current step**: a stale/out-of-order
      response can neither skip nor rewind a step (iOS advances `phoneStep` unconditionally inside each
      async handler), and an off-step verify-code never leaks a `resetToken` onto an earlier step.
      **`PhoneRecoveryInput`** — per-step local-validity gates iOS lacks (it disables buttons on
      `isLoading` only), each delegating to an existing SSOT: `canLookup` → `SignupFieldValidation.
      isPhoneValidLocally` (≥8 digits), `canVerifyIdentity` → non-blank username + `isEmailValidLocally`
      (`@`+`.`), `canSubmitCode` → `OtpCodeField.isComplete` (6 digits), `canReset` → `PasswordEntry.
      evaluate(...).canProceed` (≥8 + match), `showMismatch` (verbatim iOS inline red-text rule,
      ungated on length). **SOTA note:** every gate reuses the auth SSOTs already shipped so no rule is
      re-implemented or drifts. **+33 behavioural tests** (`PhoneRecoveryTest`). **Mutation check
      (RED proof):** dropping the `onCodeVerified` step guard fails **exactly**
      `onCodeVerified_fromVerifyIdentity_isIgnored_andDoesNotLeakToken` (29 run, 1 failed, no
      collateral) — behavioural, not tautological; RED was also proven first by the suite failing to
      compile against the absent types. **Gate (system Gradle 8.14.3, `LANG=C.UTF-8`, `$HOME/android-sdk`):**
      `:core:model:testDebugUnitTest` green (whole module) + `assembleDebug` → BUILD SUCCESSFUL. Diff =
      `apps/android` only (2 new files). **Follow-up:** the app-side `ForgotPasswordView` composable +
      `PhoneRecoveryViewModel` wiring the network calls (`AuthService.forgotPasswordPhone{Lookup,
      VerifyIdentity,VerifyCode}` + `resetPassword`) to the state machine, the `CountryPicker` dial-code
      prefix on the phone field, and the email-link recovery mode (the sibling `[ ]` above).
- [ ] First-run onboarding carousel with live feature demo + animated step backgrounds
- [~] Persistent session restore with proactive token refresh — pure "is the token
      expired / should we refresh" core landed (slice `auth-jwt-expiry-core`). `JwtExpiry`
      (`:core:model/auth/JwtExpiry.kt`) faithfully ports iOS `AuthManager.isTokenExpired(_:now:)`:
      decodes the base64url JWT payload, reads the `exp` claim as a JSON **number only**, and
      treats every malformed input (null/blank, ≠3 segments, un-decodable payload, non-object /
      non-JSON, absent or stringified `exp`) as expired — the safe default that forces a refresh.
      Margin is a **parameter** (iOS hard-codes 30s inline) defaulting to 30s; boundary is strict
      `<` (`exp - margin < now`), so the threshold instant is still valid. `TokenRefreshPolicy.
      shouldRefresh(force, token, now)` carries `refreshSession(force:)`'s guard (`force ||
      isExpired`). +24 behavioural tests (`JwtExpiryTest`); tokens really base64url-encoded so the
      decoder runs for real; RED proven by mutation (drop `isString` guard → the string-`exp` test
      fails; `<`→`<=` → the two threshold tests fail; 3 failures, no collateral). Gate: whole
      `:core:model` module green + `:app:assembleDebug` BUILD SUCCESSFUL. **Follow-up:** the app-side
      wiring — `AuthInterceptor`/`AuthRepository` consulting `TokenRefreshPolicy` before a request
      and on app-start restore, plus the DataStore/EncryptedTokenStore session rehydration.
- [~] Transparent token refresh on 401 with one retry — the `JwtExpiry`/`TokenRefreshPolicy` core
      above is the shared primitive. Decision layer complete (slice
      `auth-token-refresh-policy-core`, 2026-07-22): `TokenRefreshPolicy` now carries the endpoint
      **eligibility gate** (`isRefreshEligible` = iOS `!isRefreshOrAuth` for `/auth/refresh`,
      `/auth/login*`, `/auth/register*`, `/auth/magic-link*`), the **proactive** call-site gate
      (`shouldRefreshBeforeSend` = iOS `if let token, shouldAttemptRefresh && isTokenExpired`), the
      **401 credential-vs-session mapping** (`mapUnauthorized` → `InvalidCredentials`/`SessionExpired`,
      iOS `mapUnauthorized`, blank-message fallback improving on iOS's nil-only coalesce), the
      **reactive 401 decision** (`decideOn401` → `InvalidCredentials`/`RefreshAndRetry`/`Teardown`,
      refresh-once via `hasRefreshedOn401`), and the **replay classification**
      (`classifyRetryStatus` → `Success`/`Teardown`/`ServerError`). +29 behavioural tests, mutation-proven.
      **Wiring landed** (slice `auth-token-refresh-authenticator`, 2026-07-24): the concrete OkHttp
      `RefreshAuthenticator` in `:core:network` now feeds `decideOn401` on every real 401 — refresh
      once (via an injected synchronous `TokenRefresher`) then replay with the renewed bearer,
      teardown on a dead/already-retried session, and pass invalid-credentials through **without**
      clearing an existing session. It uses `Response.priorResponse` as the retry-once loop guard,
      normalises the `/api/v1/…` path to the policy's `/auth/…` form, and treats a null **or blank**
      refreshed token as a teardown (SOTA graceful guard over a naive non-null check). Wired into
      `MeeshyApi.create` with a lateinit-bound refresher (`AuthApi.refresh` in `runBlocking`) that
      cannot recurse because `/auth/refresh` is policy-ineligible. +11 behavioural tests
      (`RefreshAuthenticatorTest`), all branches of `authenticate` + `endpointOf` covered.
- [~] Anonymous (shared-link) sessions with restricted send permissions — the
      **permission-hardening decision core** landed (slice `anonymous-session-permissions-core`,
      2026-07-22): `ParticipantPermissions.defaultUser`/`.defaultAnonymous` (port of iOS
      `ParticipantModels.swift`), the `ParticipantPermissions.anonymous(messages, files, images)`
      SSOT that **force-denies videos/audios/locations/links** regardless of the server payload,
      and `AnonymousJoinResponse.toSessionContext()` → `AnonymousSessionContext?` (port of iOS
      `AnonymousSessionContext.swift`, returning `null` for a malformed response — missing
      participant/conversation or blank session token — instead of iOS's force-unwrap crash).
      +12 behavioural tests, mutation-proven. The **join/restore/leave use-case + persistence**
      landed next (slice `anonymous-session-store`, 2026-07-25): `ShareLinkApi`
      (`anonymous/link/{id}`, `anonymous/join/{linkId}`, `anonymous/leave` — the no-JWT endpoints,
      port of iOS `ShareLinkService`), the single-value `AnonymousSessionStore`
      (`InMemory` + durable `DataStore`, persisting the **whole hardened context**, corrupt→null),
      and `AnonymousSessionRepository.join/restore/leave` feeding `toSessionContext()` and installing
      the `X-Session-Token` on the `TokenStore`. SOTA over iOS: a malformed 2xx join persists nothing,
      and `leave()` always clears local state + token even on a server failure (mutation-proven).
      +21 behavioural tests. `AnonymousSessionContext` is now `@Serializable` for persistence.
      The **composer now consumes those hardened `permissions`** (slice `composer-attachment-affordances`,
      2026-07-25 — see §C): the pure `ComposerAttachmentPolicy` gates the attach/mic/read-only affordances,
      wired into `ChatViewModel`/`ChatScreen` off the persisted anonymous session. The **guest-join
      screen** (link-preview → form → success) landed next (slice `sharelink-guest-join-form`,
      2026-07-25): the pure `:core:model` `GuestJoinForm` SSOT (faithful port of the web
      `AnonymousForm.isFormValid` — first/last name always required, nickname/email/birthday required
      only when the link demands them — plus a deterministic `suggestedUsername` port of the web
      `generateUsername`, randomness injected at the edge; SOTA: a `requireAccount` link can't be joined
      anonymously so `canSubmit` stays false, and `toRequest()` trims + null-omits every empty optional),
      `AnonymousSessionRepository.preview(identifier)` (the no-auth `anonymous/link/{id}` read, touches
      no token/session), and the `GuestJoinViewModel` + `GuestJoinScreen` (`:feature:auth`, reached via a
      `meeshy://join/{identifier}` deep link) orchestrating preview → form → join with retry, an
      account-required sign-in steer, and a failed join that keeps every edit. +30 tests, mutation-proven.
- [x] Login/logout teardown wiping E2EE keys and per-user caches — **shipped** (slice
      `session-logout-teardown`, 2026-08-09). None of Meeshy's on-device stores are namespaced by
      userId (Room DB, category/draft DataStores), so a second account signing in on a shared device
      would otherwise inherit the previous account's conversations, messages, stories, call history,
      friends, categories and unsent draft text — a real cross-account privacy leak, parity with iOS
      `RootView`'s logout branch (`CacheCoordinator.reset()` + friendship-cache clear,
      `apps/ios/Meeshy/App/MeeshyApp.swift`, part-13 audit: "wiping is mandatory to prevent
      cross-account leaks"). **Added (production, all `apps/android`):** (1)
      `:sdk-core/session/SessionTeardown.wipe()` — the single account-teardown seam: clears every Room
      table (`MeeshyDatabase.clearAllTables()`, dispatched off-main since it's a blocking Room call) +
      the category-catalogue snapshot (`CategorySnapshotStore.clearAll()`, new) + every conversation
      draft (`ConversationDraftStore.clearAll()`, new) — idempotent, safe to call twice. (2)
      `AuthRepository.logout()` is now `suspend`, awaits `sessionTeardown.wipe()` after clearing
      tokens/session, so the caller may treat the device as clean the instant the call returns; wired
      into DI (`SdkModule.providesSessionTeardown`). (3) `AuthViewModel.logout()` wraps the call in
      `viewModelScope.launch` (kept a synchronous public signature — no navigation call-site changes in
      `MeeshyApp.kt`). **E2EE note:** Android carries no client-side Signal/identity-key store yet
      (unlike iOS's Keychain-backed one) — `wipe()` is the seam where that clear will land once one
      exists; nothing to wipe today, so this box is closed on the caches half, tracked-open on the key
      half until E2EE key material lands client-side. **Deliberately out of scope:** the theme/language/
      notification/media-download/privacy DataStores were audited and left un-wiped — device-level UX
      preferences, several server-synced, not per-account content (mirrors iOS: `UserPreferencesManager`
      values aren't part of `CacheCoordinator.reset()` either); re-scope if that judgment call changes.
      **+9 behavioural tests:** `CategorySnapshotStoreTest` +2 (in-memory + DataStore `clearAll` resets
      to a cold cache), `ConversationDraftStoreTest` +2 (in-memory + DataStore `clearAll` empties every
      draft), `SessionTeardownTest` +4 (new file, Robolectric + in-memory Room: wipes a seeded outbox
      row / resets the category snapshot / empties every draft / idempotent on a second call),
      `AuthRepositoryTest` +1 (`logout` invokes the teardown exactly once), `AuthViewModelTest` +1
      (`logout` wipes before the authenticated state clears, end-to-end through the live coroutine).
      **Mutation (RED proof):** dropping the category/draft clears from `wipe()` (keeping only the Room
      clear) fails **exactly** the 2 tests asserting those two stores post-wipe (3 run, 2 failed), the
      Room-wipe and idempotency tests staying green; restored after. **Gate:** `./apps/android/meeshy.sh
      check` → `BUILD SUCCESSFUL` (full `assembleDebug` + all-module `testDebugUnitTest`, 943 tasks).
      Reviewer **PASS** (diff `apps/android` only — 1 new core + 1 new test file + 2 store `clearAll`
      methods + 2 store tests + `AuthRepository`/`AuthViewModel` wiring + 3 adapted test call sites +
      DI provider + tracking docs; SDK purity — `SessionTeardown` is `:sdk-core` repository-adjacent
      plumbing alongside `OutboxRepository`/`CategoryRepository`, no product "when" decision, it always
      wipes on logout; SSOT — one teardown seam, reuses the existing stores' own persistence, no
      reimplementation; no tautological tests — the recording/mock fakes assert call counts and
      resulting store state, not literals the test itself set; no coverage floor lowered, no existing
      test weakened — the two adapted tests keep their original assertions, only their execution
      mechanics catch up with the new suspend/async signature).
- [x] Splash screen with brand animation + minimum display duration — **shipped** (slice
      `splash-screen`, 2026-08-10). System pre-Compose splash (`androidx.core:core-splashscreen`,
      `Theme.Meeshy.Starting` → `postSplashScreenTheme` → `Theme.Meeshy`) bridges the truly-first
      frame down to minSdk 26 (previously zero dependency, bare `Theme.Meeshy`, blank flash on
      cold start pre-API 31). Branded, ANIMATED Compose splash (`MeeshySplashScreen`, `:sdk-ui`)
      takes over once Compose paints: reuses `MeeshyBackground` (gradient + ambient orbs, the
      same root treatment as every top-level screen — zero new gradient/orb code) + a new
      animated "stacked-dashes" logo (`SplashLogo`/`SplashLogoGeometry`, staggered bar reveal,
      same source geometry as the launcher icon's `ic_launcher_foreground.xml` so the two brand
      surfaces never drift) + gradient "Meeshy" wordmark + tagline (en/fr/es/pt, iOS's exact
      copy) + a footer `BrandSignature` (version line "Meeshy {versionName} · {versionCode}",
      "Services CEO" credit, small static brand mark tinted `MeeshyPalette.Error` — port of iOS
      `BrandSignature.swift`, reusing the same `StackedDashesMark` draw call the animated logo
      uses at `progress = 1f`, so the two brand-mark renders can never drift). `MeeshyApp.kt`
      shows it for a 1200ms floor (parity iOS `minSplashDuration`) via a plain `Box` overlay on
      top of the already-composing Scaffold/NavHost — no gating of `startDestination`, since
      `AuthViewModel.isAuthenticated` already resolves synchronously.
      **Deliberately scoped simpler than iOS, documented not silent:** no pulsing ambient-orb
      animation (the static orbs already shipped in `MeeshyBackground` are reused as-is); the
      floor is a pure minimum-display-duration timer, not a readiness gate combining boot work
      the way iOS's `.task` block does (cache hydration + socket handshake) — Android has no
      equivalent async boot phase yet to additionally gate on, tracked as a future follow-up
      once one exists. +21 tests: `SplashLogoGeometryTest`
      (11, bar geometry invariants + stagger-progress math, mutation-proven — dropping the
      stagger offset fails exactly the one discriminating test), `SplashThemeGuardTest` (7,
      manifest/theme/resource/gradle-catalog/`MainActivity`/version-string/wiring source guards,
      mirror of `LauncherIconManifestGuardTest`, mutation-proven twice — reverting the manifest
      theme attribute fails exactly the expected test; hardcoding `versionLabel` instead of
      sourcing `BuildConfig` fails exactly the expected test). **Verified visually on-device**
      (not just compiled): installed on `meeshy_pixel8` (API 35), captured the OS-level system
      splash (flat Indigo950 + white glyph) and, further into the same cold start, the Compose
      splash in its real 1200ms window (gradient background, ambient glow, fully-revealed
      stacked-dashes logo, gradient "Meeshy" wordmark, "Break the language barrier" tagline,
      AND the footer signature "Meeshy 0.1.0 · 1" / "Services CEO" / small red brand mark) —
      confirmed via pixel sampling (corner colors match `MeeshyGradients.mainBackground(dark=
      true)` exactly, not the flat system-splash color) and direct visual read of the rendered
      footer text. Two methodological notes: (1) an early single-shot capture landed at
      literally `progress≈0` of the logo's own 600ms entrance (cold-start jitter on a
      resource-contended dev box, not a product bug) — isolated with a temporary debug fill
      (reverted before commit) proving both sizing and draw calls were correct; (2) the footer
      signature was caught missing from the FIRST verification pass — a user correction mid-run
      ("Il manque la signature avec les details de version!") against this same slice's own
      documented "no footer brand signature" scope cut, added before merge rather than deferred
      to a follow-up, since the component (iOS `BrandSignature.swift`) and its exact copy
      ("Services CEO", version/build format) were already fully specified and cheap to port
      once flagged.

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
      its own saved UI state). +9 tests.
      **User-category grouping done** (slice `conversation-category-sections`, 2026-07-26):
      `ConversationSections.of(conversations, categories)` now emits **Pinned → each user category
      (catalogue order) → Autres** — a faithful port of iOS
      `ConversationListViewModel.groupConversations`. A pinned-*uncategorized* row floats to Épingles
      (`isPinned && categoryId == null`); a pinned row **with** a category stays inside its category
      section (iOS parity); uncategorized rows and rows whose category is orphaned (absent from the
      catalogue, e.g. a deleted category) fall into the `ALL` catch-all. Empty sections omitted;
      incoming order preserved per section (no second sort — SOTA over iOS, which re-sorts). Each
      `CATEGORY` `ConversationSection` carries `categoryId` + `title`; `ConversationListScreen` renders
      them via `CollapsibleSection` (folder glyph, per-category key, category-name header). The catalogue
      reaches the screen through `ConversationListUiState.categories` (iOS `userCategories`), the seam
      the corpus-hydration slice fills next. +9 tests (17 total in `ConversationSectionsTest`), the
      pinned-with-category guard mutation-proven (drop `&& categoryId == null` → exactly 1 failure).
      **Category-catalogue reducer done** (slice `conversation-category-catalog`, 2026-07-26): pure
      `:core:model/UserCategoryCatalog` — the framework-free lift of iOS `UserCategoryStore`'s
      `sortedSnapshot()` ordering (order asc, `null` last, case-insensitive name tie-break) and its
      `create`/`update`/`delete`/`reorder`/`applyRemote` mutations into one immutable value type. `of` /
      `EMPTY` / `upsert` / `remove` / `reorder(id→order)` / `apply(CategoryEvent)`; its `sorted` snapshot
      is exactly the `categories` list `ConversationSections.of` consumes, so it is the building block the
      hydration slice and the category socket handler both drive. SOTA over iOS: `.created`/`.updated`
      collapse into one `Upserted` event; every branch JVM-covered vs iOS's actor coupling mutation to a
      Combine publish. +20 tests (`UserCategoryCatalogTest`), null-last ordering mutation-proven
      (`Int.MAX_VALUE`→`Int.MIN_VALUE` → exactly 1 failure).
      **Category-catalogue hydration done** (slice `conversation-category-hydration`, 2026-07-26): the
      `ConversationListUiState.categories` seam is now filled cache-first — the section splitter finally
      renders real user categories. New `:core:model/ApiCategory` wire DTO + `toOption()`/`toOptions()`
      narrowing (keeps id/name/order, drops render-only color/icon/isExpanded, preserves `null` order so
      the catalogue's null-last ordering stays faithful); `PreferencesApi.getCategories()` →
      `GET /me/preferences/categories`; a durable `CategorySnapshotStore` (DataStore blob + in-memory
      variant) that distinguishes a **cold** cache (`null`) from a **synced-but-empty** catalogue (`[]`)
      and degrades a corrupt blob to empty-not-cold; `CategoryCacheSource` (`SwrCacheSource`) +
      `CategoryRepository.categoriesStream()` cache-first over `cacheFirstFlow` (clock threaded through so
      SWR age is deterministic in tests). `ConversationListViewModel` observes it into `state.categories`.
      Parity: iOS `PreferenceService.getCategories` + `UserCategoryStore.hydrate`/`hydrateFromSnapshot`.
      +5 (`ApiCategoryTest`) +8 (`CategoryRepositoryTest`) +6 (`CategorySnapshotStoreTest`) +2 (VM
      wiring) tests; `toOption` order-preservation mutation-proven (`order = order`→`null` → exactly 3
      failures).
      **Category socket real-time sync done** (slice `conversation-category-socket-sync`, 2026-07-26):
      the catalogue now re-buckets live when another device edits the corpus. New `:core:model`
      `CategorySocketPayloads` — `@Serializable` wire DTOs (`CategoryUpsertedSocketData` for
      `category:created`+`category:updated`, `CategoryDeletedSocketData`, `CategoriesReorderedSocketData`
      / `CategoryOrderUpdate`) + pure `toEvent()` mappers → `CategoryEvent` (upsert narrows via
      `toOption()`, reorder folds to an id→order map last-writer-wins). New `:sdk-core/socket`
      `CategorySocketManager` decodes the four broadcasts and fans them into one
      `SharedFlow<CategoryEvent>`; wired into `RealtimeSessionCoordinator.attachAll()`.
      `ConversationListViewModel` now holds a live `UserCategoryCatalog` — hydration re-seeds it
      (`of`), socket events fold on top (`apply`), both publishing `catalog.sorted` into
      `state.categories`. Parity: iOS `ConversationStoreSocketBridge` → `UserCategoryStore.applyRemote`.
      SOTA over iOS: iOS keeps 4 Combine subjects re-fanned into `applyRemote`; Android collapses the
      fan-in in the manager and the reducer stays a pure value type. +8 (`CategorySocketPayloadsTest`)
      +5 (`CategorySocketManagerTest`) +4 (VM socket-fold) +1 (coordinator attach) tests; VM socket-fold
      mutation-proven (`catalog.apply(event)`→`catalog` → exactly 4 failures, no collateral).
      **Category (re)assignment done** (slice `conversation-drag-to-category`, 2026-07-27): a conversation
      can now be moved into / between user categories from the long-press context menu (the faithful iOS
      `ConversationOptionsViewModel.setCategory` path — the options-sheet, not a bespoke drag gesture). New
      pure `:feature:conversations/ConversationCategoryReassignment.resolve(current, target)` SSOT gates the
      write: dropping a row on the category it already sits in is inert (no optimistic write, no outbox row,
      no flush), every other target reassigns. Wired through the existing optimistic-prefs pipeline:
      `ConversationRepository.setCategoryOptimistic(id, categoryId)` mutates the cached `categoryId`
      instantly (the row re-buckets into that category's section via `ConversationSections.of`) and enqueues
      an `UPDATE_CONVERSATION_PREFS` snapshot; `ConversationPrefsPayload` + `ConversationPreferencesUpdate`
      now carry `categoryId`, so the flush `PUT /user-preferences/conversations/:id` persists it (the gateway
      already accepts `categoryId`, `null` = uncategorize, and broadcasts `USER_PREFERENCES_UPDATED`). The
      context menu lists each user category (current one checked). +7 tests (3 core, 2 repo, 2 VM), the
      idempotency guard mutation-proven (always-`AssignTo` → exactly the 2 no-op tests fail, no collateral).
      **Reste**: **drag** gesture polish (long-press-drag onto a section header) as a UX enhancement over the
      menu; and **uncategorize** (drag/menu → "Mes conversations", `categoryId = null`) — deferred because the
      shared `explicitNulls = false` JSON omits a null field, so persisting an uncategorize needs an
      explicit-null `PUT` path (tracked follow-up), and the reassignment SSOT deliberately models assignment
      only to avoid exposing a decision the wiring cannot yet honour.
- [x] Filtering (all/unread/personal/private/open/global/channels/favorites/archived) + search overlay
      — `ConversationFilter` enum (couleurs iOS) + `ConversationFilters.apply` pur
      (port fidèle de `filterConversations` : soft-delete masqué partout, archivés
      masqués sauf onglet Archives, recherche insensible à la casse sur titre /
      nom personnalisé / participants) ; barre de chips `LazyRow` + champ de
      recherche dans l'app bar ; 22 tests verts (11 modèle + 11 VM)
- [ ] Communities carousel + category filter chips
- [~] Pinned / muted / archived states done (optimistic toggle + row indicators
      📌/🔕 + filter integration) ; favorited (emoji) done ; **locked done** (slice
      `conversation-lock-menu`, 2026-08-19): context-menu Lock/Unlock opens a PIN sheet
      whose logic lives in the pure `LockPinReducer` (parity iOS `ConversationLockSheet`,
      but extracted from the view per TDD-COVERAGE) — first-time master-PIN setup chains
      straight into the 4-digit code (iOS dead-ends on a "set a PIN in Settings" alert),
      wrong PIN keeps its own step, row shows a 🔒 badge from the live
      `ConversationLockStore` flow. **Open-gate on tap done** (slice
      `conversation-lock-open-gate`, 2026-08-20): tapping a locked row no longer navigates
      straight through — it opens a `LockPinMode.OPEN_CONVERSATION` sheet that verifies the
      4-digit code then navigates via a one-shot `openConversation` event, leaving the lock
      in place (parity iOS `ConversationLockSheet.Mode.openConversation`; a new
      `LockPinEffect.OpenConversation` distinct from `RemoveLock`). **Unlock-all done** (slice
      `conversation-lock-unlock-all`, 2026-08-21): a global "unlock everything" affordance —
      pure `LockPinMode.UNLOCK_ALL` reducer arm (verify the 6-digit master PIN once → new
      `LockPinEffect.RemoveAllLocks`, else `MASTER_PIN_INCORRECT`; master PIN left in place,
      parity iOS `ConversationLockSheet.Mode.unlockAll` which calls `removeAllLocks()` only) →
      `ConversationListViewModel.onUnlockAll` (inert unless a lock exists, guarded on the
      authoritative store) drops every per-conversation lock at once via the already-present
      `ConversationLockStore.removeAllLocks()`. Surfaced as a top-bar `LockOpen` action that
      appears ONLY while `ConversationListUiState.canUnlockAll` (≥1 locked conversation) — iOS
      buries it in Settings, Android surfaces it contextually and hides it when irrelevant.
      +4 reducer + 4 VM-flow tests, mutation-proven (flipping the master-PIN guard fails exactly
      the wrong-PIN arm). EN/FR/ES/PT strings. Remaining lock sub-gaps (Settings master-PIN
      change/remove, swipe-to-lock) tracked below.
- [~] Swipe actions done (leading = pin/unpin, trailing = archive/unarchive ;
      `SwipeToDismissBox` non-destructif qui snap-back, le résultat visible est
      la re-dérivation du filtre) ; mute/lock/mark-unread/block/hide pending
      **as swipe gestures specifically** — mute/mark-unread already reachable via
      the context menu (see below), swipe stays capped at its 2 directions; this
      list is genuinely swipe-only follow-up, not a full-feature gap.
- [~] Context menu done (long-press → `DropdownMenu` : pin/unpin, mute/unmute,
      mark-read si non lu, archive/unarchive) ; **mark-read/mark-unread toggle
      done** (slice `conversation-mark-unread`, 2026-08-10): the menu previously
      only ever offered "Mark as read" (`hasUnread`-gated) — the reverse action
      was entirely absent (confirmed via a zero-hit grep for `markUnread`/
      `mark-unread` across `apps/android` before starting), even though the
      gateway route (`POST conversations/{id}/mark-unread`) and iOS's own
      `ConversationContextMenuView` toggle already existed. New
      `ConversationApi.markUnread` + `ConversationRepository.markUnreadOptimistic`
      (hints `unreadCount = 1` locally, server stays authoritative on the exact
      count; no-op when already unread) + `OutboxKind.MARK_UNREAD` sharing the
      `READ_RECEIPT` lane + `ConversationListViewModel.markUnread`, wired as a
      second `DropdownMenuItem` shown only when `!hasUnread` (symmetric to the
      existing `hasUnread`-gated "Mark as read" item — an `if/else`, not two
      independent `if`s, since exactly one of the pair is always offered).
      `MARK_UNREAD` coalesces against a pending `READ_RECEIPT` as opposite
      terminal states (`OutboxCoalescer.terminalToggle`, same shape as
      block/unblock and pin/unpin) rather than iOS's simpler always-replace
      shared coalescing key — **SOTA over iOS**: a quick read-then-unread undo
      cancels both mutations locally instead of firing a redundant round-trip
      the gateway would just no-op anyway. +3 `ConversationRepositoryTest`, +2
      `ConversationListViewModelTest`, +5 `OutboxCoalescerTest`, +1
      `OutboxLaneMapTest`. Mutation-proven: dropping the already-unread no-op
      guard fails **exactly**
      `markUnreadOptimistic is a no-op when the conversation is already unread`
      (18 run, 1 failed, no collateral). ; details/invite/favorite/move/
      lock/block/delete pending
- [x] Hard-press conversation preview popover — port of iOS `ConversationPreviewView` (header +
      up to 5 recent cached messages, Prisme-resolved) rendered as the first child of the
      long-press context menu (slice `conversation-hardpress-preview`, 2026-08-11)
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
      sous le groupe flottant) ; **typing preview done** (slice
      `conversation-row-typing-indicator`, 2026-08-20 : port iOS `ThemedConversationRow`
      priorité **typing → draft → last-message** ; pur `:feature:conversations`
      `ConversationTypingRoster` (SSOT multi-conversation, self-exclu, stop par-user, sélection
      déterministe) + `conversationRowPreview`/`typingPreview` ; `ConversationListViewModel`
      collecte `typing:start`/`typing:stop` avec timeout de sûreté 15 s par typer ; la ligne
      « … écrit » teintée accent prime sur le brouillon) ; **tag chips done** (slice
      `conversation-row-tag-chips`, 2026-08-20 : port iOS `ThemedConversationRow.tagsRow` —
      pur `:feature:conversations` `ConversationTagRow.fit`/`estimatedWidth` calcule les tags
      visibles + badge « +N » selon la largeur dispo, réservant la place du badge sauf pour le
      dernier tag et forçant au moins un tag ; le rendu `BoxWithConstraints` fournit la vraie
      largeur — mieux que le 200pt codé en dur d'iOS — et colore chaque chip via
      `DynamicColorGenerator.colorForName` SSOT) ; **activity-heat done** (slice
      `conversation-row-activity-heat`, 2026-08-20 : port iOS `ThemedConversationRow.conversationHeat`
      + `heatBackground` — pur `:feature:conversations` `ConversationActivityHeat.heat(...)`
      calcule `0.40·recency + 0.35·unread + 0.15·members + 0.10·pinned` (muted → 0.05 floor
      avec early return au sommet, unread saturé à 10, members saturé à 50, quatre buckets de
      récence `<300s / <1h / <1j / <1sem / else` aux edges exclusifs `<`) + `gradient(heat,
      isDark)` renvoie `HeatGradient(topOpacity, bottomOpacity=top·¼)` avec floor 0.03→0.13 en
      dark et 0.02→0.10 en light ; `of(conversation, now)` lit les signaux via `resolvedPreferences`
      + `ConversationRowTime.epochMillis` SSOT ; nouveau `ApiConversation.accentColorPalette()`
      SSOT dans `:sdk-core/theme` expose la `ColorPalette` complète (primary+secondary+accent) —
      `accentHex()` en devient le shortcut `primary` — et la ligne mémorise la palette une fois
      via `remember(conversation)`, alimentant le brush `primary → secondary` de fond avec les
      alphas calculés + l'`accent` de l'avatar + les deux labels teintés) ; **message-summary-kind
      done** (slice `conversation-row-message-summary-kind`, 2026-08-20 : port iOS
      `LastMessageSummaryKind` — pur `:feature:conversations` `MessageSummaryKind.of(message,
      nowMillis)` classifie 5 kinds `{ STANDARD, HIDDEN, VIEW_ONCE, EPHEMERAL_ACTIVE, EXPIRED }`
      dans l'ordre iOS EXACT — expired `<=` inclusif au bord > blurred > view-once > future
      expiresAt > standard ; `messageSummaryLine` compose la ligne kind-aware avec le préfixe
      sender pour HIDDEN/VIEW_ONCE mais label seul pour EXPIRED (parité iOS `.expired` arm) ;
      `ApiConversationLastMessage` widen additif `isBlurred`/`isViewOnce`/`expiresAt` — le
      gateway les répandait déjà via `...msgRest` (`services/gateway/src/routes/conversations/
      core.ts:971`) donc pas de contrat wire à renégocier ; `RowPreview.kind` défaulté et
      overload `conversationRowPreview(SummaryLine)` propage le kind au Compose ;
      `ConversationRowPreviewLine` composable pique (icône, teinte, italic) par kind —
      HourglassEmpty/textMuted/italic pour EXPIRED, VisibilityOff/textSecondary/italic pour
      HIDDEN, LocalFireDepartment/accent/italic pour VIEW_ONCE, Timer/standardColor pour
      EPHEMERAL_ACTIVE ; 7 strings × 4 locales portées de `Localizable.xcstrings` iOS —
      partial-locale fallback via labels defaultés à `""` retombant sur le body standard) ;
      **story-ring done** (slice `conversation-row-story-ring`, 2026-08-20 : port iOS
      `StoryViewModel.storyRingState(forUserId:)` + `ConversationListView.storyRingState(for:)`
      — pur `:feature:conversations` `ConversationStoryRing.ringFor(userId, groups, now)`
      applique 3 arms first-match : (1) userId absent OU groupe absent OU
      `StoryGroup.isFullyExpired(now)` → `StoryRingState.None`, (2) `StoryGroup.hasUnviewed()`
      → `Unread`, (3) sinon → `Read` ; overload `ringFor(conversation, currentUserId, groups,
      now)` ajoute le direct-only gate via `otherParticipantUserId` (groupe/communauté/channel/bot
      → jamais d'anneau) ; `ConversationListUiState.storyGroups` observe le cache-first
      `StoryRepository.storiesStream()` via `toStoryGroups` — un sync-error laisse les groupes
      précédents en place, jamais un wipe ; `storyRingFor(conversation, now)` délègue au pur
      résolveur ; la ligne `MeeshyAvatar(..., storyRing = state.storyRingFor(...))` remplace le
      `StoryRingState.None` codé en dur, le peer d'un DM affiche maintenant l'anneau non-vu/vu
      exactement comme sur iOS) ; **mood done** (slice `conversation-row-mood`, 2026-08-20 :
      port iOS `ConversationListView.conversationMoodStatus(for:)` +
      `statusViewModel.statusForUser(userId:)?.moodEmoji` — pur `:feature:conversations`
      `ConversationMoodStatus.moodEmojiFor(conversation, currentUserId, statuses)` : direct-only
      gate via `otherParticipantUserId` (groupe/communauté/channel/bot → jamais de badge), lookup
      `statusForUser(peerId)` SSOT, `moodEmoji.takeIf { isNotBlank() }` (jamais un badge vide, jamais
      soi) ; `ConversationListUiState.moodStatuses` peint une fois depuis le `StatusBarCache` FRIENDS
      partagé (`valueOrNull`, best-effort décoratif, aucun fetch propre — miroir EXACT de
      `ContactsListViewModel.paintMoodStatusesFromCache`) ; `moodEmojiFor(conversation)` délègue au pur
      résolveur ; la ligne `MeeshyAvatar(..., moodEmoji = state.moodEmojiFor(...))` remplace le `null`
      codé en dur — le badge emoji du peer d'un DM remplace la pastille de présence comme sur iOS) ;
      **presence done** (vérifié 2026-08-21 : le dot de présence était déjà câblé — `ConversationListScreen.kt`
      passe `presence = state.presenceStateFor(conversation, System.currentTimeMillis())` jusqu'au
      `MeeshyAvatar(..., presence = …)` de la rangée, aux côtés de `storyRing` et `moodEmoji` ; les trois
      affordances d'avatar coexistent comme sur iOS, un badge mood supprimant le dot quand les deux sont
      présents). La ligne rangée « rich last-message preview » est désormais complète.
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
- [~] Conversation category create + expand/collapse; client-side tag aggregation for autocomplete —
      **tag-autocomplete decision core shipped** (slice `conversation-tag-autocomplete`, 2026-07-26).
      Pure `:core:model/ConversationTagAutocomplete.kt` (`TagAutocompleteState` + object), a faithful
      port of the logic embedded in iOS `TagInputField`
      (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputField.swift`): `resolve(knownTags,
      selectedTags, query)` returns the panel state — `suggestions` (the corpus minus already-selected,
      case-insensitive substring filter on the trimmed query, `prefix(8)` via `MAX_SUGGESTIONS`),
      `canCreate` (trimmed non-blank ∧ matches neither a selected nor a known tag case-insensitively),
      `submitTag` (Enter's resolution — first suggestion else the creatable query else `null`); plus
      `append(selectedTags, name)` (iOS `addTag`'s trim + exact-dedup immutable append, `null` = no-op).
      **SOTA over iOS:** iOS recomputes each as a computed property inside a SwiftUI `View`, untestable
      without a UI host; Android folds the whole panel into one framework-free SSOT so the Compose field
      is a dumb renderer and every branch is JVM-covered. **+25 behavioural tests**
      (`ConversationTagAutocompleteTest`): empty-query pool / selected-exclusion / whitespace / cap;
      filtered substring / no-match / selected-exclusion / cap / trim; canCreate new / known-match /
      selected-match / blank; submit first-suggestion / create-query / inert / empty-pool /
      non-empty-pool; append trim / blank / exact-dup / order / case-distinct. **Mutation (RED proof):**
      dropping the suggestion-first arm from `submitTag` fails **exactly** the two "submit picks the
      first suggestion" tests (23 run, 2 failed, no collateral), restored after.
      **Category-picker decision core shipped** (slice `conversation-category-picker`, 2026-07-26). Pure
      `:core:model/ConversationCategoryPicker.kt` (`CategoryOption` + `CategoryPickerState` +
      `CategorySubmit`), a faithful port of the single-select logic embedded in iOS `CategoryPickerField`
      (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerField.swift`): `resolve(categories,
      selectedId, query)` returns `displayed` (catalogue minus the selected id, sorted by `order ?? 0`,
      CI-substring-filtered on a non-blank trimmed query — iOS `displayedCategories`), `canCreate` (trimmed
      non-blank ∧ no CI catalogue-name match — iOS `canCreate`), and `submit` (a `CategorySubmit` sealed
      result: `Select(id)` on the first CI exact name match / `Create(trimmedName)` when none / `None` on
      blank — iOS `submit()`). **SOTA over iOS:** the select-vs-create outcome is a semantic sealed type,
      not a `View`-mutating closure, so the Compose field is a dumb renderer and every branch is JVM-covered.
      **+22 behavioural tests** (`ConversationCategoryPickerTest`): empty-query order-sort / selected-exclusion
      / null-order-as-zero / equal-order-stable / unknown-selected-id / empty-catalogue / whitespace; filtered
      substring-CI / no-match / selected-exclusion / trim; canCreate new / known / selected / blank; submit
      exact-select / first-of-colliding / create-trimmed / blank-None / re-select-selected / create-no-match.
      **Mutation (RED proof):** forcing the exact-match lookup to `null` fails **exactly** the 3 `Select`
      tests (21 run, 3 failed, no collateral), restored after.
      **Category picker + create wired end-to-end** (slice `category-picker-create`, 2026-08-08). The
      "move to category" long-press action (context-menu, already reading `state.categories` cache-first
      via `CategoryRepository.categoriesStream()`) is now a real search-and-create picker instead of a
      flat list: a `TextField` drives `ConversationCategoryPicker.resolve(categories, currentCategoryId,
      query)` (the pure core shipped above), rendering the filtered `displayed` rows plus a "Create …" row
      when `canCreate`. New write path: `PreferencesApi.createCategory` (`POST
      me/preferences/categories`, mirrors iOS `PreferenceService.createCategory`) → `CategoryRepository
      .create(name): NetworkResult<CategoryOption>` (posts, then appends the created option straight into
      the snapshot store with a fresh sync stamp so it's selectable immediately, no round-trip through a
      full revalidate) → `ConversationListViewModel.createCategoryAndAssign(id, name)` (blank-name inert;
      on success reuses `reassignCategory`'s idempotency guard to assign; on failure surfaces
      `errorMessage`, never assigns). **+6 behavioural tests:** `CategoryRepositoryTest` +3 (create posts
      + appends to a warm cache; create on a cold cache; API failure leaves the snapshot untouched),
      `ConversationListViewModelTest` +3 (create-then-assign; failure surfaces the error and never
      assigns; blank name is inert). **Mutation (RED proof):** dropping the blank-name guard fails
      **exactly** the blank-name test (36 run, 1 failed, no collateral), restored after. **Remaining
      follow-up:** the `TagInputField` composable + `allTags` corpus hydration + a dedicated tags write
      path (no wire field for conversation tags yet — `ApiConversation` doesn't carry `tags`).
      **Correction (2026-08-09):** the previous note above claiming "the expand/collapse *toggle*
      affordance itself is still unbuilt" was stale/never re-proven against the actual code —
      `CollapsibleSection` (`:sdk-ui`, commit `560dce4e9`, phase-4 design system) has shipped a working
      `clickable { expanded = !expanded }` header + chevron-rotate + `AnimatedVisibility` body since its
      very first commit, and `ConversationListScreen` already wraps every section — PINNED, every
      CATEGORY, and the ALL catch-all alike — in one. Tapping any section header already
      collapses/expands it; state survives recomposition via `rememberSaveable`. **No further work
      needed here** — re-verified by reading the component + its single git history entry before
      touching anything, not by trusting the note. Lesson for the routine file: a "Next slice" note is a
      hypothesis, not a fact — grep/read the actual component before spending a run on it.
- [x] Create direct/group conversation via user search; add participants —
      FAB sur la liste → `NewConversationScreen` : recherche debouncée (300 ms,
      `UserRepository.searchUsers`), multi-sélection avec chips persistants
      (survit aux changements de requête), règle pure `NewConversationLogic`
      (1 sélection → direct sans titre ; ≥2 → groupe avec titre saisi) →
      `ConversationRepository.create` → navigation vers le chat créé
      (popUpTo conversations). 14 tests verts (6 logique + 8 VM)
- [x] Live presence dot on a direct conversation's row/header (parity iOS `ConversationListView`'s
      `presenceManager.presenceState(for: conversation.participantUserId)`) — **data plumbing done
      (2026-08-12, slice `conversation-list-live-presence`)**; **row dot shipped 2026-08-17** (slice
      `conversation-list-presence-dot`). Confirmed a real, categorical gap: `ApiConversation.participants`
      carries no `isOnline`/`lastActiveAt` fields at all (unlike the Contacts roster, which at least had
      stale REST data to overlay onto — cf. `presence-live-contacts-overlay`), so conversation rows/the
      chat header had ZERO presence indication, not even a frozen one. New `ApiConversation.
      otherParticipantUserId(currentUserId)` (`:sdk-core/theme`, refactored out of the existing
      `otherParticipantName` alongside a shared private `otherParticipant` lookup — a behavior-
      preserving refactor, `displayTitle`'s own pre-existing tests re-ran green unchanged) resolves
      the presence-lookup key. `ConversationListViewModel.observePresence()` (mirrors
      `ContactsListViewModel`'s identical pattern verbatim) collects the SAME corrected
      `MessageSocketManager.userStatus`/`.presenceSnapshot` flows into
      `ConversationListUiState.presenceByUserId`, exposing `presenceStateFor(conversation,
      nowEpochMillis): PresenceState?` (already gated to direct-only via `otherParticipantUserId`
      returning `null` for group/community/channel/bot). **Row dot wiring** threads `presence:
      PresenceState?` through `ConversationRow` → `ConversationRowContent` into the existing
      `MeeshyAvatar`'s own `presence` parameter — `MeeshyAvatar` (`:sdk-ui`) already RENDERS the dot
      overlay when given a non-null `PresenceState` (shipped with the avatar atom itself, just never
      fed a live value from the conversation list, exactly the same "missing wire, not missing UI atom"
      shape as the earlier `contacts-mood-emoji-presence` slice). Pure Compose glue — no new logic to
      test (`TDD-COVERAGE.md`'s documented exemption: `@Composable` param threading is out of the JVM
      gate; the testable decision, `presenceStateFor`, already has its 5 dedicated `ConversationListViewModelTest`
      cases from the foundation slice). +9 tests carried over unchanged from the foundation slice (4
      `ConversationAccentTest`, 5 `ConversationListViewModelTest`), mutation-proven on the direct-type
      gate and the snapshot merge. **Chat header dot shipped 2026-08-17** (slice
      `chat-header-presence-dot`) — port of iOS `ConversationView.headerPresenceState`; unlike iOS,
      Android's chat header has no avatar to dot (`ChatScreen`'s existing 10dp circle next to the
      title is an unconditional conversation-accent identity marker, not a presence indicator), so a
      new small 8dp dot is added ADJACENT to it — additive, never replacing the accent dot — shown
      only for a direct conversation and only while `meeshyPresenceDotColor` returns non-null (offline
      = no dot, same rule everywhere else). `ChatUiState` gains `directPeerUserId` (computed via the
      same `otherParticipantUserId(currentUserId)` reused verbatim) + `presenceByUserId` +
      `headerPresence(nowEpochMillis): PresenceState?`, mirroring `ConversationListUiState
      .presenceStateFor` exactly. `ChatViewModel.observePresence()` is a byte-for-byte mirror of
      `ConversationListViewModel`'s identically-named function, called from `init`. +3
      `ChatViewModelTest` (live presence resolves in a direct conversation, null for a group even
      with live data, null before any presence data arrives).
- [x] Story tray + per-conversation story rings — `StoryTray` (ring gradient si non-vu, gris sinon,
      badge sur sa propre story) wired as the conversation list's `header` (`MeeshyApp.kt`).
      Re-verified 2026-08-15 — already fully documented under the `:feature:stories` bullet above
      (Phase 5), this was a duplicate stale entry, not a separate deliverable.
- [x] In-app dashboard ("Tableau de bord") — `DashboardScreen.kt` (292 lines, wired in
      `MeeshyApp.kt`): unread total (`totalUnreadCount()` SSOT), `DASHBOARD_RECENT_COUNT` recent
      conversations, `QuickActionRow`, share-link stats surfaced. Re-verified 2026-08-15 — stale,
      upgraded to done.

## C. Chat / Messaging
- [x] **Composer affordances gated by the viewer's send permissions** (slice
      `composer-attachment-affordances`, 2026-07-25 — **SOTA over iOS**, whose composer never consults
      `ParticipantPermissions`). Pure `:sdk-core` `ComposerAttachmentPolicy` maps a `ParticipantPermissions?`
      → immutable `ComposerAffordances` (per-kind flags + `showsAttachmentLadder` [links excluded — inline
      in text] + `isReadOnly` = `!canSendText`); null = registered-user full posture. `ChatViewModel` folds
      the persisted anonymous session's hardened `permissions` into `ChatUiState.composerPermissions` (store
      failure → full posture, never a crash); `ChatScreen` hides the attach-file button unless the ladder is
      offerable, hides the mic unless `canSendAudios`, and shows a muted lock-row `ComposerReadOnlyNotice`
      (i18n EN/FR/ES/PT) for a muted guest. +11 tests (8 policy + 3 VM), mutation-proven.
- [x] **All send paths enforce one gate (read-only + per-kind capability + slow-mode)** (slice
      `composer-send-gate`, 2026-07-25 — **SOTA over iOS**, whose attachment handlers bypass both the
      permission set and the slow-mode interval). Pure `:sdk-core` `ComposerSendGate.evaluate(kind,
      affordances, slowMode)` folds `ComposerAffordances` + `SlowModeState` into one `SendDecision`; a hard
      capability denial (read-only text / denied attachment kind) outranks the cooldown (no residual timer
      leaks), only a permitted kind is throttled; `ComposerSendKind.fromMessageType()` classifies the pick.
      `ChatViewModel.send()` gates `TEXT` (read-only defense added to its slow-mode check); `sendFileAttachment()`
      gates the resolved kind and records `lastSelfSentAtMillis` on a delivered attachment so file↔text share
      one cooldown. Closes the bypass where a picked file skipped both gates and never started the cooldown.
      +20 tests (15 gate + 5 VM), mutation-proven (neutralizing the file gate fails exactly the 3 file-gate tests).
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
- [x] Consecutive-sender message grouping (WhatsApp/iMessage-style runs) — **surpasses iOS**, which
      hardcodes `isLastInGroup: true` + always shows the avatar. Pure `:feature:chat` `MessageGrouping`
      SSOT clusters the ascending list into same-author runs (outgoing = one "self" identity; incoming =
      equal non-null `senderId`; a null incoming sender never groups; a pair breaks across a
      `DEFAULT_GAP_MILLIS`=5min window compared on the absolute delta; a missing timestamp rides with the
      previous same-author message) → `MessageGroupPosition(isFirstInGroup, isLastInGroup, isStandalone)`.
      `ChatViewModel.toBubbles` derives `showSenderName` from `isFirstInGroup` (name shown once per run,
      no longer on every incoming) and threads first/last onto `BubbleContent`; `MessageBubble` stacks a run
      tightly (top gap only on first, bottom gap only on last) while distinct messages keep 4dp breathing
      room (slice `chat-message-grouping`, +15 tests). Header and visual run share one SSOT so they can't drift.
- [~] Date section headers done — `ChatListItem.DayHeader` interleavé +
      `MessageDayLabel` (port iOS : Aujourd'hui/Hier/Avant-hier, jour de semaine
      ≤6j, date complète + année si différente, label recalculé au rendu pour
      le passage de minuit) ; **unread separator done** (slice `chat-unread-separator`,
      2026-07-27) : la barre « Messages non lus » se pose juste au-dessus du premier
      message non lu — SSOT pur `:feature:chat/UnreadMarker.firstUnreadId(bubbles,
      unreadCount)` (port du calcul iOS `unreadStartIndex = messages.count -
      initialUnreadCount`, gardé par `!candidate.isMe` : borne à `size-unreadCount`,
      `null` si rien de non-lu / fenêtre vide / count > fenêtre / borne sur un
      message sortant). `buildChatListItems` insère un unique `ChatListItem.UnreadSeparator`
      juste avant ce message (sous son en-tête de jour) ; `ChatViewModel` capture
      le `unreadCount` du cache AVANT le mark-read (qui le remet à zéro) puis latch
      la borne une seule fois (une arrivée de message ne la déplace jamais) ;
      `ChatScreen` rend un `UnreadSeparatorRow` accent-cohérent (règle accent +
      pilule centrée, EN/FR/ES/PT). +17 tests, mutation-prouvé. **SOTA over iOS** :
      la borne est un value type pur entièrement couvert, la capture pré-mark-read
      supprime la course iOS où l'ouverture peut zéroer le compteur avant la dérivation.
      **Open-scroll done** (slice `chat-open-scroll-to-unread`, 2026-07-27) : à l'ouverture la
      liste se pose sur la barre « Messages non lus » si elle existe, sinon sur le dernier
      message (bas) — SSOT pur `:feature:chat/InitialScrollTarget.of(items)` (index de la
      ligne `UnreadSeparator` sinon `lastIndex` sinon `null` fenêtre vide) ; `ChatViewModel`
      expose `unreadBoundaryResolved` (flip une fois la borne résolue, avec ou sans id) et
      `ChatScreen` déclenche un scroll one-shot verrouillé qui attend cette résolution (jamais
      contre une fenêtre vide/non-résolue). +9 tests, 2 mutations prouvées. **SOTA over iOS** :
      cible pure entièrement couverte + gate sur le flag de résolution qui supprime le double
      saut bas→séparateur de l'ouverture iOS.
      **E2EE disclaimer done** (slice `chat-encryption-disclaimer`, 2026-07-27) : la notice
      « messages chiffrés de bout en bout » se pose en haut de l'historique d'une conversation
      chiffrée — port fidèle de iOS `ConversationView.encryptionDisclaimer`
      (`conv.encryptionMode != nil && !hasOlderMessages && !isLoadingInitial`). SSOT pur
      `:feature:chat/EncryptionDisclaimer.shouldShow(encryptionMode, hasOlderMessages,
      isLoadingInitial)` (mappé sur `hasMoreOlder`/`showSkeleton` de `ChatUiState`) ;
      `buildChatListItems(showEncryptionNotice)` prépend un unique `ChatListItem.EncryptionNotice`
      au-dessus du premier en-tête de jour ; `ChatScreen` rend un `EncryptionNoticeRow`
      accent-cohérent (disque teinté + cadenas + copie centrée, EN/FR/ES/PT). `ApiConversation`
      gagne `encryptionMode` (round-trip JSON via le blob de cache, aucun changement Room).
      +13 tests, mutation-prouvé (dropper les deux gardes casse exactement les 4 tests de garde).
      **SOTA over iOS** : la décision est un value type pur entièrement couvert (iOS l'inline dans
      la View) ; un mode vide (artefact de sérialisation) ne déclenche jamais la notice, là où le
      `!= nil` de iOS l'afficherait.
      **Floating day label done** (slice `chat-pinned-day-header`, 2026-07-27) : une pastille de
      date flottante (style WhatsApp) survole le haut de la liste et nomme le jour du contenu le
      plus haut visible. SSOT pur `:feature:chat/PinnedDayHeader.governingDayMillis(items,
      firstVisibleIndex) → Long?` : scanne vers le haut jusqu'au `DayHeader` gouvernant ; `null`
      pour liste vide, index négatif, ligne au-dessus du premier en-tête (ex. la notice E2EE), ou
      quand la ligne la plus haute **est** l'en-tête de jour (l'en-tête inline est déjà à l'écran →
      pas de doublon flottant) ; index au-delà de la fin → clamp sur la dernière ligne. `ChatScreen`
      rend un `PinnedDayHeaderPill` (même label `MessageDayLabel` + traitement pastille que
      `DaySeparator`, avec une ombre douce), via un `derivedStateOf` sur
      `listState.firstVisibleItemIndex`. +8 tests, mutation-prouvé (dropper la garde
      « en-tête en haut → null » casse exactement 1 test). **SOTA over iOS** : la décision est un
      value type pur entièrement couvert (iOS n'a pas de pastille flottante).
      **Inverted-list sub-slice 1 done** (slice `chat-scroll-geometry`, 2026-08-10) : préparation pure,
      zéro changement de comportement visible — `:feature:chat/ChatScrollGeometry` (+
      `ChatListOrientation.TopDown|BottomUp`) factorise l'arithmétique d'index jusque-là ad hoc dans
      `ChatScreen` (`bottomIndex`, `isNearBottom`, `isNearOldEnd`) derrière une SSOT paramétrée par
      orientation ; `ChatScreen` est rebranché sur `TopDown` (sortie identique bit à bit, `LOAD_OLDER_
      THRESHOLD`/`BOTTOM_TOLERANCE_ITEMS` déplacées dans l'objet, l'extension privée `isNearBottom`
      remplacée par `lastVisibleItemIndex()`), et la branche `BottomUp` est prouvée correcte en
      isolation (17 tests, mutation-prouvée — casser le seuil `LOAD_OLDER_THRESHOLD` de `<=` à `<`
      casse exactement 1 test). `PinnedDayHeader.governingDayMillis` reste volontairement inchangé (déjà
      sa propre SSOT pure et testée ; migrer son scan vers `ChatScrollGeometry` est laissé à la sous-
      tranche 2, quand `BottomUp` a un appelant réel). Reste : sous-tranche 2 (le flip visible —
      `reverseLayout = true` + liste inversée + rebrancher les 4 sites restants sur `BottomUp`) et
      sous-tranche 3 (vérification IME on-device) — décomposition complète dans PROGRESS.md.
      **Inverted-list sub-slice 2 (the visible flip) done** (slice `chat-inverted-list-flip`,
      2026-08-10) : `ChatScreen`'s `LazyColumn` gagne `reverseLayout = true` + `listItems.asReversed()`
      (`renderedItems`, une vue paresseuse — les deux renversements s'annulent, l'ordre de lecture
      visuel reste identique) ; les 7 comportements dépendants de la direction (scroll initial,
      auto-scroll sur nouveau message, jump recherche, jump réponse citée, `isNearBottom`, le pilier
      `PinnedDayHeader`, le déclencheur load-older) sont tous rebranchés sur `ChatListOrientation.
      BottomUp`. Deux nouvelles fonctions pures dans `ChatScrollGeometry` (`bottomEdgeIndex`/
      `topEdgeIndex`) traduisent la paire `firstVisibleItemIndex`/`lastVisibleItemIndex()` Compose en
      bord bas/bord ancien sémantique — le seul endroit qui connaît le sens du flip, mutation-prouvées
      (inverser une branche casse exactement les 2 tests discriminants pour chacune).
      `PinnedDayHeader.governingDayMillis` gagne un overload orienté : le renversement d'ordre inverse
      aussi chaque bloc `[DayHeader, messages...]` en `[messages..., DayHeader]`, donc le scan `BottomUp`
      remonte (`top..lastIndex`) au lieu de descendre (`top downTo 0`) — mutation-prouvé (inverser les
      deux branches du `when` casse exactement les 6 tests discriminants, TopDown et BottomUp). Le
      spinner « chargement d'historique » est déplacé de AVANT à APRÈS `items(renderedItems)` dans le
      scope du `LazyColumn` (le plus haut index Compose rend en haut visuel sous `reverseLayout`).
      +14 tests (`ChatScrollGeometryTest`/`PinnedDayHeaderTest`/`InitialScrollTargetTest`), tous
      mutation-prouvés. **Vérifié on-device** (émulateur `meeshy_pixel8`, conversation réelle avec
      ~40+ messages historiques) : atterrissage initial sur le message le plus récent, `load-older`
      déclenché en remontant (Today → Saturday 4 July en 5 swipes, aucun crash), pastille de jour
      flottante affichant le bon jour pendant le défilement, FAB « scroll to bottom » apparaît/
      disparaît correctement selon `isNearBottom`, jump de recherche (`REPRO-B-1638`, 1/1, surbrillance
      exacte), et auto-scroll vers le bas à l'envoi d'un message propre. Zéro crash sur toute la passe
      (logcat vérifié). **Inverted-list sub-slice 3 (vérification IME on-device) done — confirmée
      gratuite, aucun code nécessaire** (2026-08-10) : sur le même émulateur/conversation, ouvrir le
      clavier logiciel (tap sur le champ `Message`) redimensionne la liste sans aucune logique
      dédiée — le bord bas de la liste inversée (index 0, le plus récent) reste naturellement ancré
      juste au-dessus du composer/clavier, exactement le bénéfice attendu d'une liste inversée. Envoi
      d'un message texte (`ime-verify-flip-c3`) **clavier toujours ouvert** : auto-scroll vers le bas
      correct, le nouveau message apparaît immédiatement au-dessus du composer, aucun glitch visuel.
      Fermeture du clavier (`KEYCODE_BACK`) : la liste reprend sa hauteur pleine proprement, le
      dernier message reste ancré en bas. Zéro crash (logcat vérifié, aucun `FATAL EXCEPTION`).
      **§C inverted-list rewrite complet (3/3 sous-tranches)**.
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
      location done (`chat-bubble-location` 2026-07-09 : port iOS `BubbleAttachmentView.location` —
      un attachment mime `application/x-location` devient un `BubbleLocation` pur (lat/lon nullable,
      `placeName` ← `originalName`, `geoUri` locale-safe) rendu en carte pin tappable → `geo:` URI
      ouvert dans Plans/Maps via `LocalUriHandler`, jamais fondu dans le bucket fichier générique) ;
      audio done (`chat-bubble-audio` 2026-07-09 : port iOS `AudioPlayerView` message-bubble, SURPASSE le
      Prisme — un attachment mime `audio/…` devient un `BubbleAudio` pur (url résolue, `durationSeconds`
      explicite → repli `transcription.durationMs/1000`, `sizeBytes`, transcription résolue Prisme rule 1 :
      langue préférée traduite sinon transcription originale, `formattedDuration` `m:ss`) rendu en player
      compact (glyphe play/download + durée-ou-taille + ligne de transcription) tappable → URL au host ;
      iOS affiche `orig` par défaut + sélecteur manuel, Android affiche la langue préférée d'emblée) ;
      **galerie média plein écran conversation-wide done** (`chat-conversation-media-gallery` 2026-07-13 :
      port iOS `ConversationMediaGalleryView` — taper une image n'ouvre plus un visionneur limité au
      message tapé mais une galerie qui balaie TOUTES les images de la conversation, dans l'ordre, en
      démarrant sur l'image tapée. Pur `:feature:chat` `ConversationMediaGallery.of(messages, messageId,
      imageIndex)` → `ConversationGallery(imageUrls, startIndex)` : aplatit chaque bulle non-supprimée en
      ordre de conversation, résout `startIndex` = compteur d'images avant le message tapé + `imageIndex`
      clampé aux bornes du message ; message inconnu/supprimé/sans image → repli sur le début ; consommé
      par `MeeshyImageViewer` (bloc `:sdk-ui` réutilisé, pinch-zoom + compteur `n/total` déjà présents).
      +14 tests. **Légende par page done** (`chat-gallery-page-caption` 2026-07-13 : port de
      `ConversationMediaGalleryView.captionMap` — chaque page porte le texte de son message
      (`GalleryPage(url, caption)`, `caption = message.text.trim().ifBlank { null }`, chaque image d'un
      message multi-image partage l'unique légende du message ; supprimé exclu) ; `ConversationGallery`
      expose `imageUrls`/`captions` dérivés ; `MeeshyImageViewer` prend un `captions: List<String?>` opaque
      (bloc agnostique) et rend la légende de la page courante en overlay bas (scrim 0.45, masqué en zoom).
      +10 tests. **En-tête auteur/date par page done** (`chat-gallery-page-header` 2026-07-14 : port du
      chrome bas d'`ConversationMediaGalleryView` qui affiche l'auteur (nom + `sentAt`) au-dessus de la
      légende — `GalleryPage` porte `senderName`/`createdAtIso` (trim, null si vide) résolus du message
      propriétaire, chaque image d'un message multi-image partageant l'auteur/date ; supprimé exclu ;
      `ConversationGallery` expose `senderNames`/`createdAtIsos` dérivés ; `MeeshyImageViewer` gagne
      `authors`/`timestamps: List<String?>` opaques et rend une ligne d'en-tête « auteur · date » au-dessus
      de la légende dans le même overlay bas (masqué en zoom) ; `ChatScreen` formate le `createdAtIso` en
      libellé relatif via `RelativeTimeFormat.short` + `rememberRelativeTimeStrings`. +13 tests.
      **Prefetch ±2 done** (`chat-gallery-neighbor-prefetch` 2026-07-14 : port du look-ahead ±2 de la galerie
      iOS — pur `:sdk-ui` `ImageViewerPrefetch.neighbors(currentIndex, total, radius=2)` retourne les index
      voisins à préchauffer, nearest-first biaisé avant (le prochain avant le précédent à chaque pas), jamais
      hors bornes ni enroulé, jamais l'index courant, vide si <2 pages ou radius ≤ 0, index courant coercé
      dans les bornes ; `MeeshyImageViewer` gagne un `LaunchedEffect(currentPage, imageUrls)` qui mappe ces
      index sur des `ImageRequest` enfilés dans le `context.imageLoader` Coil partagé — même motif que le
      `StoryPrefetchPlanner` du viewer story. +13 tests.
      **Save-to-gallery done** (`chat-gallery-save-to-gallery` 2026-07-14 : pendant Android du pur iOS
      `MediaSaveDestination` — `:core:model` `GallerySaveTargetResolver.resolve(url, mimeHint?)` dérive le
      `GallerySaveTarget` (displayName sanitisé + vraie extension, MIME résolu, album `Pictures/Meeshy` image /
      `Movies/Meeshy` vidéo) : strip query+fragment, extension→MIME (jpg/png/gif/webp/heic/…/mp4/mov/…), hint
      connu prioritaire sur l'extension, hint paramétré normalisé (`;charset` retiré), extension inconnue → nom
      gardé + MIME défaut `image/jpeg`, noms illégaux assainis, nom par défaut `meeshy-image.<ext>` si vide.
      +25 tests (mutation-proof : forcer `IMAGE_DIR` casse exactement les 4 tests vidéo). Écriture MediaStore
      exempte `:sdk-ui` `GalleryImageSaver.save` (scoped-storage Q+, `IS_PENDING`, aucune permission ; annule
      proprement l'insert sur échec ; cancellation-safe — rethrow `CancellationException`) ; `MeeshyImageViewer`
      gagne un bouton Save (icône FileDownload, TopEnd, opt-in via `onImageSaved`, masqué < Android 10) ;
      `ChatScreen` affiche un Toast succès/échec. Reste : contact card) ; contact pending
- [~] Message-bubble VoiceOver/TalkBack composed label — **pure composer done** (slice
      `chat-bubble-a11y-label`, 2026-08-21 : port iOS `MessageAccessibilityLabelComposer.compose`
      (`apps/ios/Meeshy/Features/Main/Focal/Preferences/MessageAccessibilityLabelComposer.swift`).
      Pur `:sdk-ui` `MessageBubbleAccessibilityLabel.compose(content, strings, locale, timeText?)` :
      un unique libellé parlé dans l'ordre gelé iOS — sender → reply → text → images → audios →
      location/files → time → delivery → edited → pinned → ephemeral → reactions — joint par `, `.
      Chaînes injectées via `BubbleAccessibilityStrings` (motif `RelativeTimeFormat`, zéro dépendance
      Android, JVM-testable). Court-circuit supprimé (sender + « message supprimé »). Écarts assumés
      vs iOS documentés : pas de distinction image/vidéo (un seul compteur « images »), pas de « vous »
      pour l'auteur de la réponse (modèle Android sans `isMe`), pas d'horloge dans la meta-row (⇒
      `timeText` fourni seulement là où une heure est visible). **+20 tests** mutation-prouvés (casser
      le court-circuit supprimé → 1 échec exact ; effondrer l'arm excerpt de réponse → 2 échecs exacts).
      **Câblage sûr, non destructif** : `MessageBubble` gagne un param opt-in `accessibilityLabel:
      String? = null` appliqué via `clearAndSetSemantics` — branché UNIQUEMENT au héros de l'overlay
      long-press (`MessageOverlayPreviewHero`, non-interactif « never intercepts input »), où
      effondrer l'arbre sémantique est prouvablement sûr. La bulle interactive de la liste garde
      `null` → ses cibles tactiles par-élément (réactions, images, long-press) intactes. Le libellé
      composé de la liste attend un test instrumenté TalkBack (hors du gate JVM). Strings EN/FR/ES/PT.
      **Reste** : câbler le libellé composé sur la bulle de liste derrière une vérif TalkBack instrumentée.
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
- [x] Quoted-reply previews incl. story-reply previews (counts, thumbnails) —
      **media quoted-reply preview done** (slice `chat-reply-preview-media`, 2026-07-09): the wire now
      carries `attachments` on `ApiMessageReplyPreview` (matching iOS `APIMessageReplyTo.attachments`;
      the dead duplicate `ApiMessageReplyTo` was removed), and `BubbleContentBuilder` derives a
      `ReplyMediaKind` (None | Image | File — first image wins, else any attachment → File) plus a
      resolved `replyToThumbnailUrl` (image `thumbnailUrl` ?: `fileUrl`, run through the shared
      `resolveMediaUrl`; a deleted reply target suppresses both). `MessageBubble`'s reply-preview strip
      now shows a 32dp accent-clipped thumbnail when available, else a media icon + a localized
      "Photo"/"Attachment" placeholder when the quoted message is media-only (blank content). So a reply
      to a photo/file no longer renders a blank quote. EN/FR/ES/PT strings. +9 tests. **Story-reply
      previews done** (slice `chat-story-reply-preview`, 2026-07-09): the wire now carries the frozen
      post snapshot on `ApiMessage` — new `ApiPostReplyTarget` DTO (`:core:model`, port of
      `APIPostReplyTarget`: id/type/reaction·comment·shareCount/createdAt/thumbnailUrl/previewText/
      moodEmoji) decoded from `postReplyTo` (legacy `storyReplyTo` via `@JsonNames`), plus a bare
      `storyReplyToId`. `BubbleContentBuilder` projects a `BubbleStoryReply` (`:sdk-ui`): a non-blank
      `moodEmoji` → mood preview (emoji + previewText, no metrics/thumbnail); otherwise a story preview
      (reaction/comment/share counts + resolved `thumbnailUrl` via the shared `resolveMediaUrl`, blank
      thumbnail dropped); a bare `storyReplyToId` → metadata-less story preview. A message reply
      (`replyTo`) takes precedence and a deleted tombstone carries no story metadata (mirrors the
      `pinnedAtIso`/`isForwarded` suppress rules). `MessageBubble`'s new `StoryReplyPreview` renders the
      mood (emoji + text) or story (camera glyph + "Story" label + 32dp accent-clipped thumbnail +
      ❤/💬/↗ metric chips shown only when > 0). EN/FR/ES/PT strings. +11 tests. **§C quoted-reply
      previews complete.**
- [~] Delivery status checkmarks + offline-pending hourglass + failed-message retry —
      ✓/✓✓/✓✓-read tier + Pending/Failed done ; **group all-or-nothing semantics done**
      (`chat-delivery-status-group-semantics` 2026-07-06): pure `:core:model` `DeliveryStatusResolver`
      (port of iOS `DeliveryStatusResolver`) — in a group the delivered/read tier lights up only once
      EVERY recipient has received/read (never on the first peer), trusting `readByAllAt`/`deliveredToAllAt`
      markers ahead of the counters ; `BubbleContentBuilder` consumes it with a reactive `recipientCount`
      (distinct other members) threaded from `ChatViewModel`. **Read-receipt reciprocity done**
      (`chat-read-receipt-reciprocity` 2026-07-27): port of the iOS `DeliveryStatusResolver.degradeRead`
      rule — a viewer who has turned OFF their own read receipts (`PrivacyPreferences.showReadReceipts`,
      the §L `SHOW_READ_RECEIPTS` toggle) sees no one else's: a resolved `DeliveryTier.Read` degrades to
      `Delivered` on their own outgoing bubbles (Delivered/Sent untouched, marker-driven Read degrades too).
      `DeliveryStatusResolver.resolve` gains `showReadReceipts: Boolean = true` — the default keeps every
      persistence-path caller (only the DISPLAY site passes the preference, so stored state is never
      degraded). `BubbleContentBuilder.build` threads it; `ChatViewModel` folds the durable
      `PrivacyPreferencesStore.preferences.showReadReceipts` into the message-stream combine so toggling
      the setting re-paints live. +6 resolver tests + 1 VM wiring test, mutation-proven (dropping the
      degrade fails exactly the 3 Read-degrade tests, the Delivered/Sent-untouched + default-true tests
      stay green). **SOTA over iOS**: the degrade is a pure, fully-covered arm on the same SSOT resolver,
      reactive to a live preference toggle. **Offline-pending hourglass done**
      (`chat-offline-pending-hourglass` 2026-07-27): port of the iOS `BubbleDeliveryBadge` rule — a still-
      pending outgoing bubble shows a live **clock** while online (send in flight) but a queue **hourglass**
      once the device is offline (parked in the outbox until reconnect). New pure `:core:model`
      `SendLifecycleResolver.resolve(isPending, isFailed, isOffline) → {Failed, QueuedOffline, InFlight,
      Settled}` (failure-wins precedence; a *settled* message never regresses to the hourglass when the link
      later drops); `DeliveryStatus.QueuedOffline` + `BubbleContentBuilder.build(isOffline)` routes the
      outgoing send-side glyph through it; `MessageBubble` renders `Icons.Filled.HourglassEmpty` +
      `bubble_status_queued` (EN/FR/ES/PT). `ChatViewModel` injects `NetworkConditionMonitor` and folds
      `condition == OFFLINE` (distinct) into the message-stream combine so going offline re-paints the glyph
      live. +7 resolver + 5 builder + 1 VM tests, mutation-proven. **Sub-200ms clock debounce done**
      (`chat-send-clock-reveal-debounce` 2026-08-21): port of iOS
      `BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately` (`revealDelay = 0.2`) — a send that
      round-trips under 200ms never flashes the online in-flight clock the user has no time to perceive.
      New pure `SendLifecycleResolver.shouldRevealSendingGlyph(sendStartedAtMillis, nowMillis)` +
      `SENDING_REVEAL_DELAY_MILLIS = 200L` (null start → reveal now; `>=` inclusive boundary; negative
      elapsed from clock skew stays hidden). Compose glue `rememberSendingGlyphRevealed` (`produceState` +
      one-shot `delay`, same shape as `rememberBubbleRenderKind`) gates ONLY the `DeliveryStatus.Pending`
      clock at the `MessageBubble` render site off `content.createdAtIso`; the offline hourglass and every
      settled tier render immediately. +8 resolver tests, mutation-proven (`>=`→`>` fails exactly the
      exactly-200ms boundary test). **Pending:** the finer `slow`/retry glyph tier, tap-checks → read-status sheet
- [~] Edited / pinned / forwarded indicators; edit-history viewer
      **Edited ✅** (`bubble_edited` badge), **pinned ✅** (`chat-pinned-banner`), **forwarded ✅**
      (slice `chat-forwarded-indicator`, 2026-07-08, +5 tests): `BubbleContent.isForwarded` derived in
      `BubbleContentBuilder` (`!isDeleted && !forwardedFromId.isNullOrBlank()` — a deleted tombstone
      shows no metadata, mirroring the `pinnedAtIso` suppress rule; a blank/whitespace id or a
      conversation-id-only forward is not flagged). `MessageBubble` renders a subtle top-of-bubble
      italic "Transféré/Forwarded" chip with the same accent-coherent forward glyph as the forward
      action (`Icons.AutoMirrored.Filled.Send`). **Forwarded-source name ✅** (slice
      `chat-forwarded-badge-source-name`, 2026-08-20, +18 tests): the chip now **names the SOURCE
      conversation** for a group forward — pure `ForwardBadgePolicy.conversationName(ref)` (`:core:model`,
      twin rule with `apps/ios/.../ForwardBadgePolicy.swift` + `apps/web/lib/forward-badge.ts`) hides the
      name for `direct`/`bot`, shows it for `group`/`public`/`global`/`community`/`channel`/`broadcast`,
      keeps the status quo for an unknown type, and treats a blank name as absent. Android `ApiMessage`
      now decodes the gateway's hoisted `forwardedFromConversation` (`{id,title,identifier,type,avatar}`);
      `ForwardReference` gains the faithful `conversationType`; `BubbleContentBuilder` folds it to
      `BubbleContent.forwardedFromName` (`title ?? identifier`, deleted tombstone → null); `MessageBubble`
      renders `bubble_forwarded_from` ("Transféré de {name}") EN/FR/ES/PT, falling back to the generic
      chip when unnamed. **Pending:** edit-history viewer (needs the gateway edit-history endpoint
      surfaced on Android).
- [◐] Ephemeral (self-destruct) messages with duration picker + countdown badges
      — **countdown badge done** (`chat-ephemeral-countdown` 2026-07-14 : la logique pure
      `EphemeralLifecycle` (`:core:model`) porte EXACTEMENT `BubbleEphemeralLifecycle`
      (`BubbleEphemeralLifecycle.swift`) — `evaluate(expiresAt, now)` → `State.None`
      (pas d'expiry) / `State.Expired` (`remaining <= 0`, borne incluse) / `State.Running(
      remainingSeconds)` (fractionnel, miroir de `TimeInterval`) ; `format(remaining)` rend
      le shape compact `7s` / `45s` / `1m 05s` / `2h 03m` (sub-10s = secondes brutes,
      troncature vers zéro, négatif clampé à `0s` ; bande minute `Xm YYs` ; bande heure
      `Xh YYm`, secondes droppées). +20 tests, preuve RED par mutation (`<= 0.0` → `< 0.0`
      casse exactement `evaluate_deadlineExactlyNow_isExpired`). Câblé pour de vrai :
      `BubbleContent` gagne `expiresAtIso: String?` (peuplé par `BubbleContentBuilder`
      depuis `ApiMessage.expiresAt`, suppress-si-supprimé comme `pinnedAtIso`), et le
      composable `EphemeralCountdownBadge` (`:sdk-ui`) tick chaque seconde et rend une
      capsule flamme + timer monospace en `MeeshyPalette.Error` (parité `BubbleEphemeralBadge`)
      dans la meta-row de la bulle, masquée quand None/Expired. **burned/expired transition done**
      (`chat-ephemeral-burned-transition` 2026-07-14 : la logique pure `BubbleRenderKind.resolve(
      isDeleted, ephemeral)` (`:core:model`) porte le dispatch `content.kind` de iOS
      `ThemedMessageBubble.body` — `isDeleted` ⇒ `Deleted` en premier (autorité serveur, un
      message supprimé-et-périmé garde son tombstone), sinon `State.Expired` ⇒ `EphemeralExpired`
      (la bulle collapse, iOS rend `EmptyView`), sinon `Standard` ; `Kind.isEphemeralExpired`
      = le seul arm qui masque. +8 tests, preuve RED par mutation (retirer l'arm `EphemeralExpired`
      casse exactement `resolve_liveMessageExpired_isEphemeralExpired`, les 7 autres verts). Câblé
      pour de vrai : `MessageBubble` (`:sdk-ui`) calcule le `Kind` via le glue horloge
      `rememberBubbleRenderKind` (même parsing SSOT `isoToEpochMillisOrNull` + `EphemeralLifecycle`
      que le badge, en lock-step), et enveloppe la bulle dans un `AnimatedVisibility` qui la fait
      disparaître avec un fade + `scaleOut(0.8)` + `shrinkVertically` quand le timer expire
      (parité burn-away iOS `opacity 0` + `scaleEffect 0.8`) ; défaut → jamais expiré → zéro
      changement pour tout appelant existant. **Duration picker done** (`chat-composer-effects-picker`
      2026-07-15 : le row de durées éphémères fait maintenant partie de l'`EffectsPickerSheet` câblée —
      chaque chip sélectionne via `MessageEffectsEditor.withEphemeralDuration`, visible seulement quand le
      chip EPHEMERAL est armé, cf. la ligne « Message visual effects » ci-dessous).
- [◐] Blurred ("tap to reveal") + view-once messages with fog effect
      — **conceal + reveal lifecycle done** (`chat-blur-reveal-lifecycle` 2026-07-14 : la logique pure
      `BlurRevealLifecycle` (`:core:model`) porte EXACTEMENT iOS `BubbleBlurRevealLifecycle`
      (`BubbleBlurRevealLifecycle.swift`) — les durées de phase `FogIn(0.4)`/`BlurApply(0.4)`/`FogOut(0.5)`,
      `defaultRevealDurationSeconds = 5.0`, et `RevealRequest.requiresConsume == isViewOnce`. **Mieux que
      l'iOS** : la séquence reveal→fog-in→re-blur→fog-out, enterrée dans un `Task` imperatif côté iOS
      (`scheduleReveal()`, intestable), devient la fonction pure `revealTimeline(visibilitySeconds)` — une
      liste de keyframes `Step(atMillis, isRevealed, fogOpacity, animationDurationMillis)` avec le timing
      exact d'iOS (les chevauchements `- 0.05` / `+ 0.05`), fenêtre négative clampée à 0. +14 tests,
      preuve RED par mutation (retirer le clamp `maxOf(0.0, …)` casse exactement `negativeVisibility_clampsToZero`
      + `offsets_areMonotonicNonDecreasing`, les 12 autres verts). Câblé pour de vrai : `BubbleContent` gagne
      `blurReveal: BubbleBlurRevealSpec?` peuplé par `BubbleContentBuilder.buildBlurReveal(effects)` quand
      `effects.has(BLURRED) || effects.has(VIEW_ONCE)` et non-supprimé (parité gate iOS
      `effects.isBlurred || effects.isViewOnce`) ; +7 tests builder. Le composable `:sdk-ui` `BubbleBlurReveal`
      (glue exempte) voile le corps de bulle derrière un scrim quasi-opaque indigo950 (masque même <API 31 où
      `Modifier.blur` est no-op) + blur réel API 31+, rejoue la timeline au tap, affiche un hint distinct
      « Toucher pour révéler » (flou) vs « Vue unique » (flamme, via `RevealRequest.requiresConsume`). Strings
      en/fr/es/pt. **burned tombstone done** (`chat-viewonce-burned-tombstone` 2026-07-14 : la logique pure
      `BubbleRenderKind.resolve` gagne l'arm `Kind.Burned` gardé sur `isViewOnce && viewOnceCount > 0` (parité
      iOS `BubbleContentBuilder` `.burned` = `message.isViewOnce && message.viewOnceCount > 0`), précédence
      `Deleted > Burned > EphemeralExpired > Standard` — un view-once épuisé montre le tombstone persistant au
      lieu de collapser, mais `Deleted` (autorité serveur) gagne toujours ; un `viewOnceCount > 0` sur un
      message non-view-once ne brûle JAMAIS. +8 tests, preuve RED par mutation (retirer l'arm `Burned` casse
      exactement les 4 tests burned, les autres verts). Câblé pour de vrai : `ApiMessage` gagne `viewOnceCount:
      Int = 0` (wire), `BubbleContent` gagne `isViewOnce`/`viewOnceCount` peuplés par `BubbleContentBuilder`
      (zéro quand supprimé), `rememberBubbleRenderKind` résout `Burned` immédiatement (autorité serveur, sans
      lire l'horloge) avant le tick ephemeral, `MessageBubble` rend `BubbleBurnedView` (glue exempte : flamme
      `MeeshyPalette.Warning` + « Vu et effacé » italique muté dans une capsule warning 8 %, alignée côté
      expéditeur) au lieu du corps. Strings `bubble_burned`/`bubble_burned_a11y` en/fr/es/pt. **Pending:** le
      consume view-once serveur (endpoint `requiresConsume` → gateway view-count, non câblé) qui déclenchera
      ce tombstone en temps réel.
- [✅] Message visual effects (shake/zoom/explode/waoo/confetti/fireworks/glow/pulse/rainbow/sparkle)
      — picker sheet + cross-platform bitfield encoding. **Wire contract + resolver done**
      (`chat-message-effects-resolver` 2026-07-14 : la source de vérité `MessageEffectFlags`
      (bits 0-19, partagée avec `packages/shared/types/message-effect-flags.ts` + iOS
      `MessageEffects.swift`) gagne les prédicats d'axe purs `hasAny`/`hasLifecycle`/`hasAppearance`/
      `hasPersistent`/`has(flags, effect)` (port de `hasLifecycleEffect`… iOS) ; `MessageEffects`
      expose les accesseurs miroirs ; `MessageEffectsResolver.resolve(effectFlags, isBlurred,
      isViewOnce, hasExpiry)` porte EXACTEMENT la règle iOS `APIMessage.toMessage` (effectFlags > 0
      autoritatif sinon dérivation lifecycle depuis les booléens/expiry) ; `ApiMessage` décode enfin
      les champs wire `effectFlags`/`isBlurred`/`isViewOnce`/`expiresAt` (auparavant silencieusement
      droppés) et expose `effects: MessageEffects` calculé. +20 tests. **Send-side editor done**
      (`chat-message-effects-editor` 2026-07-14 : `MessageEffectsEditor` porte la logique
      d'interaction pure de l'iOS `EffectsPickerView` — `toggle(effects, flag)` (insert/remove
      d'un bit chip, autres bits + params intacts), `withEphemeralDuration(effects, duration)`
      (écrit le paramètre seconds, laisse le flag à `toggle`), `cleared()` (= iOS `.none`),
      `activeCount` (popcount = `nonzeroBitCount`) ; l'enum wire `EphemeralDuration`
      (30/60/300/3600/86400 s, `fromSeconds` = `EphemeralDuration(rawValue:)`, labels UI laissés
      aux string resources) porte `CoreModels.swift`. +19 tests, mutation-checked. **Send-path
      encoding done** (`chat-message-effects-send-encoding` 2026-07-14 : `MessageEffectsEncoder.
      encode(effects, now): MessageEffectsWire` porte la résolution send de l'iOS
      `ConversationViewModel` — pas d'effet ⇒ tous les champs wire `null` (iOS `effectFlags: nil`) ;
      un effet ⇒ le bitfield complet part en `effectFlags` (= `flags.rawValue`), les bits lifecycle
      se projettent en booléens legacy `isBlurred`/`isViewOnce` (à `true` seul, jamais `false`,
      = iOS `? true : nil`), `EPHEMERAL` + durée ⇒ `ephemeralDuration` seconds + `expiresAt = now +
      durée` ISO (= iOS `EphemeralDuration.expiresAt`, flag autoritatif donc une durée périmée sans
      le chip est ignorée), `VIEW_ONCE` ⇒ `maxViewOnceCount`. La seule valeur `MessageEffects` est
      la SSOT (chaque champ dérivé d'elle, pas de toggles éparpillés — mieux que l'iOS). Câblé pour
      de vrai : `SendMessageRequest` gagne les 6 champs wire ; `MessageRepository.sendOptimistic`
      accepte `effects` et encode dans la requête outbox + la bulle optimiste ; `retrySend` préserve
      les effets depuis la bulle cachée. +19 tests encoder (round-trip encode↔resolve inclus,
      mutation-checked) + 4 tests repo. **Render-plan + persistent treatment layer done**
      (`chat-message-effects-render-plan` 2026-07-14 : `MessageEffectRenderPlanner.plan(effects,
      hasPlayedAppearance): MessageEffectRenderPlan` porte l'orchestration render de l'iOS
      `View.messageEffects(_:hasPlayedAppearance:)` — les effets appearance (shake/zoom/explode/
      waoo/confetti/fireworks) sont one-shot et n'apparaissent dans le plan que si
      `hasPlayedAppearance == false` (iOS gate `&& !hasPlayedAppearance`) ; les effets persistants
      (glow/pulse/rainbow/sparkle) sont continus et jamais gatés ; `glowIntensity` résout
      `effects.glowIntensity ?? 0.5` (iOS) ; les bits lifecycle ne sont pas des effets render → jamais
      dans le plan. Enums `AppearanceEffect`/`PersistentEffect` adossés aux masques `APPEARANCE_MASK`/
      `PERSISTENT_MASK`. +14 tests planner (mutation-checked : retirer le gate hasPlayed casse
      exactement les 2 tests one-shot). Câblé pour de vrai : `:sdk-ui` `Modifier.messageEffects(effects,
      hasPlayedAppearance, shape)` applique les traitements PERSISTANTS (glow = shadow indigo qui
      respire radius 4↔12 + alpha `intensity*0.3`↔`intensity` ; pulse = scale 1.0↔1.02 ;
      rainbow = bordure sweep-gradient) via `rememberInfiniteTransition` ; `MessageBubble` gagne
      les params optionnels `effects`/`hasPlayedAppearance` (défaut `null`/`false` → zéro changement
      pour les appelants existants). **Picker sheet + composer wiring done** (`chat-composer-effects-picker`
      2026-07-15 : la SSOT pure `MessageEffectsPickerPresenter.build(effects)` (`:core:model`) dérive tout
      l'état de rendu que l'iOS `EffectsPickerView` recompute inline — les 3 sections d'options
      (`MessageEffectOption` : flag + `iconKey`/`labelKey` stables, ordre iOS Comportement/Entrée/Permanent)
      avec `isActive` par chip, le row de durées avec `isSelected` par durée, `showEphemeralDuration =
      has(EPHEMERAL)` (autorité flag, une durée périmée chip-off ne surface pas le row), `activeCount =
      popcount` (un bit inconnu sans chip compte quand même) + `showSummary = hasAnyEffect`. **Mieux que
      l'iOS** : la sheet entière devient une valeur testable. +16 tests presenter, preuve RED par mutation
      (forcer `showEphemeralDuration = true` casse exactement 3 tests, les 13 autres verts). Câblé pour de
      vrai : `ChatUiState` gagne `pendingEffects`/`isEffectsPickerOpen`/`hasPendingEffects` ; le ViewModel
      expose `openEffectsPicker`/`dismissEffectsPicker` (garde la sélection au dismiss) +
      `toggleEffect`/`selectEphemeralDuration`/`clearEffects` (délégués purs à `MessageEffectsEditor`) ;
      `send()` stampe `pendingEffects` sur `sendOptimistic(effects=…)` (déjà plumbé jusqu'au wire outbox) puis
      désarme le composer ; `ChatComposer` gagne un bouton `AutoAwesome` accent-teinté quand des effets sont
      armés, ouvrant la `EffectsPickerSheet` (glue exempte : chips capsule accent, FlowRow, strings en/fr/es/pt).
      +7 tests ViewModel (toggle/duration/clear/open-dismiss/send-stamp+reset/plain-send). **Received-message
      render effects done** (`chat-bubble-effects-render` 2026-07-15 : le SSOT pur
      `MessageEffectRenderPlanner.renderEffects(effects, isDeleted): MessageEffects` — les effets visuels
      (appearance + persistants) qu'une bulle porte dans `Modifier.messageEffects`, bits lifecycle strippés
      (ephemeral/blurred/view-once pilotent le countdown / la concealment / le tombstone burned, jamais le
      modifier de traitement visuel), tout effacé sur un tombstone supprimé (jamais de glow sur « Message
      supprimé ») ; les paramètres — `glowIntensity`… — sont préservés. +8 tests planner, preuve RED par
      mutation (ne plus stripper les bits lifecycle casse exactement `renderEffects_stripsLifecycleBits` +
      `renderEffects_glowPlusViewOnce_keepsGlowDropsLifecycle`, les 6 autres verts). Câblé pour de vrai :
      `BubbleContent` gagne `effects: MessageEffects` peuplé par `BubbleContentBuilder` (défaut vide → zéro
      changement pour les appelants existants) ; `MessageBubble` alimente enfin `Modifier.messageEffects`
      depuis `content.effects` (le param `effects` reste un override preview/test) — un message reçu portant
      un bit glow/pulse/rainbow **rend enfin** son traitement, ce qui n'arrivait jamais avant (le call-site
      `ChatScreen` ne passait aucun `effects`). +4 tests builder (plain → aucun effet, glow → glow, view-once →
      aucun effet visuel, supprimé+glow → aucun effet). **One-shot appearance particles done**
      (`chat-appearance-particle-field` 2026-07-15 : les SSOT purs `ConfettiFieldGenerator`/
      `FireworksFieldGenerator.generate(count, width, height, seed): ParticleField` (`:core:model`) portent
      la géométrie des overlays iOS `ConfettiOverlay`/`FireworksOverlay` — confetti = 30 rectangles qui pleuvent
      de `y=-10` à `y=height+20` avec dérive ±30, fireworks = 20 étincelles en burst radial depuis le centre,
      angle `i·360/count`, distance 40..80. **Mieux que l'iOS** : *seedé* — l'iOS re-tire `CGFloat.random` à
      chaque `onAppear` (le confetti saute entre apparitions), le seed rend le burst reproductible et testable.
      `Particle.xAt/yAt(progress)` interpole start→end (clamp 0..1) ; `AppearanceParticleFields.forEffect`
      mappe l'effet→field (transforms shake/zoom/explode/waoo → `null`). +28 tests, preuve RED par mutation
      (swap cos/sin dans fireworks casse exactement `fireworksBurstFliesEastSouthWestNorthForFourSparks`, les
      26 autres verts). Câblé pour de vrai : `Modifier.messageEffects` gagne un layer `appearanceParticles`
      (glue Compose exempte : anime un progress one-shot `0→1`, peint le field via `drawWithContent`, fade en
      queue) gaté par `plan.appearance` (donc par `hasPlayedAppearance`) ; `MessageBubble` passe un
      `appearanceSeed = messageId.hashCode()` stable. **One-shot appearance transforms done**
      (`chat-appearance-transforms` 2026-07-15 : le SSOT pur `AppearanceTransforms.forEffect(effect, progress):
      AppearanceTransformSpec?` (`:core:model`) porte la géométrie par-progrès des `ViewModifier` iOS
      `ShakeEffect`/`ZoomEffect`/`ExplodeEffect`/`WaooEffect` — shake = oscillation sinusoïdale `sin(p·π·4)·8`
      qui part et revient au repos, zoom = grow mono `0.3→1`, explode = pop deux-temps `0.1→1.15→1` en
      fondu-entrant `α 0→1`, waoo = bounce deux-temps `0.5→1.1→1` avec glow `0→0.6→0`. `resolve(effects, progress)`
      folde plusieurs effets (offsets additionnés, scales multipliés, opacités multipliées, glow au plus fort) ;
      `transformEffects` est dérivé de `forEffect` (SSOT) et **partitionne** exactement les 6 effets appearance
      avec `AppearanceParticleFields.particleEffects` (disjoints + exhaustifs, testé). +24 tests, preuve RED par
      mutation (négation de l'oscillation shake casse exactement les 2 tests de swing, les 22 autres verts).
      Câblé pour de vrai : `Modifier.messageEffects` gagne un layer `appearanceTransforms` (glue Compose exempte :
      anime un progress one-shot `0→1` sur 700 ms, applique le spec via `graphicsLayer` en phase layer +
      dessine le glow waoo via `drawBehind` en phase draw → zéro recomposition par frame), gaté par
      `plan.appearance`/`hasPlayedAppearance`. **Sparkle canvas done — effects stack COMPLETE**
      (`chat-sparkle-canvas` 2026-07-15 : le SSOT pur `SparkleFields.sparkleAt(index, time, width,
      height): Sparkle` + `field(time, width, height)` (`:core:model`) porte la géométrie twinkle de
      l'iOS `SparkleEffect` — 8 sparks blancs pilotés purement par `time` (secondes) : position
      `x = (sin(phase·1.3+i)·0.4+0.5)·w`, `y = (cos(phase·0.9+i·0.7)·0.4+0.5)·h` avec `phase = time+0.5i`
      (le facteur `0.4` garde chaque spark dans la bande centrale `0.1..0.9`, jamais de clip au bord) ;
      taille ET alpha lisent le MÊME twinkle `sin(phase·2+i)` (`size∈[2,8]`, `alpha∈[0.1,0.7]`) donc un
      spark grossit et s'éclaircit ensemble (parité iOS `sparkleSize`/`sparkleOpacity`). **Mieux que
      l'iOS** : tout le twinkle sort de la closure `Canvas` intestable vers une fonction JVM couverte ;
      dims négatives clampées à zéro. +10 tests, preuve RED par mutation (swap sin→cos sur x casse
      exactement `referenceSparkleAtOriginTimeHasCleanValues`, les 9 autres verts). Câblé pour de vrai :
      `Modifier.messageEffects` gagne un layer `sparkleCanvas` (glue Compose exempte : avance un `time`
      via `rememberInfiniteTransition` sur une période `20π` s — longueur à cycle entier pour une boucle
      sans couture — et peint les 8 sparks blancs via `drawWithContent` en phase draw, zéro recomposition
      par frame) gaté par `PersistentEffect.SPARKLE in plan.persistent`. Les 10 effets rendent désormais.
- [x] Long-press overlay menu (preview bubble, quick reactions, action grid, drag-to-detail panel)
      — **overlay menu now COMPLETE** (all four parts landed). **quick reactions done** (EmojiQuickStrip in the long-press sheet) + **action grid done** (slice
      `chat-overlay-action-menu`, 2026-07-15, +22 tests): pure `:feature:chat` `MessageActionMenu` SSOT
      (port of iOS `MessageActionResolver.primaryActions` + `MessageMenuContext`) composes the ordered,
      context-filtered `List<MessageAction>` (reply/forward/show-original|translation/explore/copy/pin|unpin/
      star|unstar/edit/delete-for-everyone/delete-for-me) from a UI-free `MessageActionContext` with a
      derived `isActionable = !isDeleted && !isPending && !isFailed`. Surpasses iOS by folding the two-tier
      primary/"More…" split into one flat contextual list. `MessageActionsSheet` is now a dumb `when`
      renderer over `actions(ctx)` — the scattered inline `if` blocks + inline `isActionable` are gone.
      Mutation-proven (swap show-original/show-translation → exactly 3 red). **drag-to-detail gesture law done**
      (slice `chat-overlay-drag-law`, 2026-07-15, +22 tests): pure `:feature:chat` `MessageOverlayDragLaw` SSOT
      (faithful port of iOS `MessageOverlayDragLaw`) — `MessageOverlayDragOutcome` (OpenMore/Dismiss/SnapBack),
      `outcome(translation, predicted)` (position-authoritative with velocity only counting in the drag direction;
      the up-arm checked first so a both-armed input resolves OpenMore; crossed "drag up past threshold then fling
      down" falls back to OpenMore), the damped-rubber-band `displayOffset(translation)` (1:1 inside the ∓80px
      thresholds, 0.3 overshoot damping beyond), and `isArmed(translation)`. Wired for real into `MessageActionsSheet`
      (exempt glue): a custom `OverlayDragHandle` grabber runs the law — swipe-up-strong expands the compact action
      sheet into the language explorer (`onExploreLanguages`, which clears `actionMessageId` → a clean compact→expanded
      transition, no stacking), swipe-down-strong dismisses, else the lifted content springs back; the pill widens and
      takes the accent colour once `isArmed` crosses. Mutation-proven (flip the up-velocity direction guard → exactly 3
      red). **preview bubble done** (slice `chat-overlay-preview-bubble`, 2026-07-15, +17 tests): pure `:feature:chat`
      `MessageOverlayLayout` SSOT (faithful port of the iOS `MessageOverlayMenu` "native-lean" geometry) —
      `compute(bubble, screen, safe insets, menu size, isOutgoing)` stacks `[emoji bar]·gap·[preview hero]·gap·[menu]`
      into one `MessageOverlayCluster`: the uniform preview scale (full → height-capped at 320 with a 0.55 floor →
      squeezed-to-fit with a 0.4 floor), the trailing/leading hero anchor (unclamped so it tracks its source bubble),
      the safe-area vertical clamp, and the independent emoji/menu X clamps. Wired for real into `ChatScreen` (exempt
      glue): each message row's window frame is captured via `onGloballyPositioned`, and on long-press a
      `MessageOverlayPreviewHero` Popup lifts a scaled copy of the tapped bubble above the action sheet, positioned by
      the law. Mutation-proven (swap the leading/trailing anchor branches → exactly 3 red; caught + fixed a symmetric
      full-size anchor blind spot in the first test draft — the anchor is only testable on a *scaled* preview).
- [~] In-overlay interactive audio/video preview (play/pause, scrub, ±5s, 0.5–2.0×) —
      **interactive audio preview done** (slice `chat-overlay-media-transport`, 2026-07-15, +32 tests). Pure
      `:feature:chat` `OverlayMediaTransport` — an immutable transport state machine faithfully porting iOS
      `OverlayAudioPlayer` (the `@StateObject` behind `PreviewAudioPlayer` / `PreviewVideoPlayer` in
      `MessageOverlayMenu.swift`): `toggle` (play→pause / different-url→reload-from-zero keeping rate / same-paused→resume),
      `ready`/`failed`, `stop`, `seek(fraction)` (clamped `0…1`, inert until a duration is known), `skip(±5s)` (clamped
      `0…duration`), `setRate` + a **`cycleRate`** grid walk (`0.5→0.75→1.0→1.25→1.5→2.0→wrap`, iOS's `[0.5…2.0]`),
      `tick(current,duration)` (records duration + clamps the reported position into `[0,duration]` — surpasses iOS,
      whose observer can momentarily overshoot the scrubber), and `onEnded` (rewind+stop). Derived read surface:
      `percentInt`, `hasDuration`, `timeLabel(totalDurationSeconds)` (`current / total`, each `m:ss`, prefers the
      observed duration then falls back to the attachment's declared length; `NaN`/negative → `0:00`). **Surpasses
      iOS** on testability (the whole transport is one pure JVM-covered value type vs iOS's scattered `@Published`
      fields), on scrubber robustness (position clamp), and on UX (a single-tap speed **chip** replaces iOS's context
      menu). Mutation-proven (wrap fallback `RATES.first()` → `RATES.last()` → exactly the 2 wrap tests red; the other
      30 stayed green — behavioural). Wired for real into `ChatScreen`'s `MessageActionsSheet` (exempt glue): a new
      `OverlayMediaPreview` composable mirrors the transport onto a real `android.media.MediaPlayer` (play/pause circle,
      accent scrubber `Slider`, `Replay5`/`Forward5` ±5s buttons, tap-to-cycle speed chip, monospace time+percent) and
      renders above the action grid for any message carrying a playable audio attachment. **Follow-up:** real video
      interactive preview — `BubbleContent` does not yet carry a playable video attachment, so there is nothing to drive
      there yet (audio/voice-note is the dominant overlay case and is now interactive).
- [ ] Universal composer: text, attachments, voice, location, emoji, camera
- [x] Voice recording UI (iMessage-style pill: cancel, live waveform, timer, min-duration gating) —
      **logic + pill UI done** (slice `chat-voice-recording-pill`, 2026-07-15, +29 tests). Pure
      `:feature:chat` `VoiceRecordingSession` SSOT: `Idle`/`Recording` phases, `start`/`tick`/`meter`/
      `cancel`/`stop` transitions, `canSend` min-duration gate (`>= 0.5s`, iOS `minimumSendableDuration`
      parity), `formattedElapsed` (`m:ss`, iOS `formatDuration`), `recordingDotOpacity(reduceMotion)`
      blink (iOS `dotOpacity`), and a `VoiceRecordingStop(session, outcome)` result
      (`Completed(duration, levels)` / `TooShort` / `Inactive`). Composes the existing `:core:model`
      waveform blocks (`AudioLevelNormalizer` + `WaveformLevelWindow`) — no bespoke buffer.
      **Real `MediaRecorder` capture + send pipeline done** (slice `chat-voice-recording-capture`,
      2026-08-10): the `Mic` tap now requests `RECORD_AUDIO` (mirrors `feature:calls`'
      `CallPermissions`/`withMediaPermissions` pattern) and starts a real `MediaRecorder`
      (`MPEG_4`/`AAC`, `voice_<millis>.m4a` via the new pure `VoiceRecordingFile` builder,
      mirrors `:feature:feed`'s `CameraCaptureFile`) writing into `cacheDir/voice`. The 100 ms
      `LaunchedEffect` tick loop now also polls `MediaRecorder.maxAmplitude` and feeds it through
      a new pure `:core:model` `MicAmplitudeDecibels.toDecibels` (linear PCM → dB, Android has no
      direct dB-metering API unlike iOS `AVAudioRecorder.averagePower`) into
      `VoiceRecordingSession.meter()` — the waveform strip (`VoiceRecordingPill`'s
      `RecordingWaveform`) now renders `session.levels` directly (`animateFloatAsState` per bar)
      instead of the old synthetic `rememberInfiniteTransition` placeholder. Stop and Send both
      finalise the take (no staging tray exists anywhere in this composer — every other
      attachment kind sends immediately on pick too) and, when `canSend` (`Completed` outcome),
      hand the real file bytes to the **existing, unmodified** `onPickFile`/
      `ChatViewModel.sendFileAttachment` chain — zero VM/pipeline changes, since
      `AttachmentMessageType.forMime("audio/mp4")` already resolves to `"audio"` and
      `ComposerSendGate` already gates it on `canSendAudios`, exactly the Mic button's own
      visibility gate. +10 tests (`MicAmplitudeDecibelsTest`: silence floor, defensive negative
      amplitude, full/half-scale dB, monotonicity, above-reference-amplitude safety;
      `VoiceRecordingFileTest`: naming determinism/uniqueness, mirrors `CameraCaptureFileTest`).
      **Mutation-proven**: hardcoding `toDecibels` to always return `FLOOR_DB` fails **exactly**
      the 4 discriminating tests (monotonicity, full-scale, half-scale, above-reference) — the 2
      silence-floor tests (already expecting `FLOOR_DB`) correctly stay green; reverted via a
      scratch `cp`-backed edit (never `git checkout --`), re-confirmed green. **Gate**:
      `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks). Reviewer **PASS**
      (diff `apps/android` only — 2 new files [`MicAmplitudeDecibels.kt`, `VoiceRecordingFile.kt`]
      + 2 new test files, `VoiceRecordingPill.kt`/`ChatScreen.kt` edited; SDK purity — the dB
      conversion is a stateless `:core:model` transform reusable by any future recorder, the
      "when to request permission / how to wire the mic" product decision stays app-side in
      `:feature:chat`; SSOT — `AttachmentMessageType`/`ComposerSendGate`/`MimeTypeResolver` all
      reused verbatim, zero new classification logic; no coverage floor lowered; no tautological
      tests). **Verified end-to-end on-device against the live gateway** (`meeshy_pixel8`,
      already-authenticated session): tapped the real Mic button (`uiautomator dump` exact
      bounds, not estimated screenshot coordinates), confirmed Android's system mic-in-use
      indicator appeared (genuine hardware capture, not simulated), recorded ~24s, confirmed via
      `run-as` a real, growing `voice_<millis>.m4a` file in `cacheDir/voice` (67 KB mid-recording).
      Tapped Send: `adb logcat` confirmed a real `POST /api/v1/attachments/upload` (multipart,
      `Content-Type: audio/mp4`, 89706-byte body) returning 200 with the gateway's own
      **independent server-side audio probe** of the uploaded file —
      `duration:22427,bitrate:16932,sampleRate:8000,codec:"MPEG-4/AAC",channels:2` — definitive
      proof the recorded bytes are genuine playable AAC audio, not silence-shaped garbage.
      **Investigation dead-end, NOT a bug in this diff**: the resulting message stayed
      locally-pending (clock icon, never reached the server) after the attachment upload
      succeeded — traced to the **pre-existing** two-stage `OutboxFlushWorker` dependency chain
      (`SEND_MESSAGE`'s `dependsOn` the upload's cmid; `messageLanes` — computed once at the
      START of `doWork()` — files require a SEPARATE later flush pass once the media graft lands,
      not a re-check within the same pass) — confirmed pre-existing and unrelated to this diff
      because **other, older test messages already sitting in this exact conversation's local
      outbox from unrelated prior verification sessions** (`flip-test-verify`,
      `ime-verify-flip-c3`, plain text, no attachment dependency at all) show the **identical**
      stuck-pending symptom; a fresh text message sent in the same conversation during this
      verification also stuck pending. This diff never touches `OutboxFlushWorker`/
      `MessageRepository`/the outbox drain code — the capture-to-pipeline handoff this slice owns
      is proven correct by the server's own independent audio probe; the outbox's
      wake-only-once-per-mutation reliability gap (same family as the iOS
      `reference_persistent_queue_must_not_wake_only_on_a_network_edge` finding) is a separate,
      pre-existing, cross-cutting issue affecting every chat attachment send, not scoped to this
      slice — flagged below as a new backlog candidate rather than fixed here. Test artifacts
      (the recorded file, the two verification-only messages) left as-is since they never reached
      the server (nothing to delete server-side).
      **Follow-up (2026-08-11, slice `outbox-message-lane-discovery`) — RE-PROUVEN, and the real
      root cause was more severe than the "same-run redrain" framing above assumed.** Reading
      `OutboxFlushWorker.doWork()` closely: `messageLanes` was discovered via
      `outboxRepository.deliverable(OutboxLanes.forMessage(""))` — an **exact-match** query
      (`OutboxDao.deliverableForLane`: `WHERE lane = :lane`) against the literal lane string
      `"message:"` (empty conversation id). No real row is ever enqueued with a blank
      conversation id, so this call **always returned an empty list** — the entire "drain
      per-conversation message lanes" loop was **dead code in production**, for every build that
      has ever shipped this discovery mechanism. `SEND_MESSAGE`/`EDIT_MESSAGE`/`DELETE_MESSAGE`
      were never attempted at all (not "delayed one pass" — never even reaching `drainLane`),
      which is the exact, complete explanation for `flip-test-verify`/`ime-verify-flip-c3`
      staying pending forever with zero dependency at all. **Proven empirically, not just by
      static reading**: a new Robolectric test (`OutboxRepositoryTest`, real in-memory Room DB)
      enqueues a `SEND_MESSAGE` on `OutboxLanes.forMessage("c1")` and asserts
      `deliverable(OutboxLanes.forMessage(""))` returns empty — RED against the old call
      pattern's intent, pinned as a permanent regression guard. **Fix**: new
      `OutboxDao.activeMessageLanes()` (`SELECT lane ... WHERE lane LIKE 'message:%' AND state !=
      'EXHAUSTED' GROUP BY lane ORDER BY MIN(createdAt) ASC`, `core:database`) +
      `OutboxRepository.activeMessageLanes()` wrapper (`sdk-core`) — a real distinct-lane
      discovery query — replaces the broken call in `OutboxFlushWorker.doWork()`. 4 new tests
      (discovers a lane with a pending send; discovers every distinct lane without duplicating a
      lane holding 2 rows, oldest-lane-first; omits a lane whose only row is `EXHAUSTED`; empty
      when the queue holds only shared-lane rows) plus the regression-pin test. **The
      already-existing "same-run" retry design was correct and needed no separate fix once
      discovery works**: `OutboxFlushPlan.outcome` already returns `FlushOutcome.RETRY` (→
      `Result.retry()` → WorkManager's own `EXPONENTIAL, 10s` backoff) whenever a lane stops on a
      still-blocked dependency — the doc comment on that file already describes exactly this
      "prerequisite delivered later in the same pass, next pass picks it up" design. It simply
      never fired for message lanes because they were never visited. **Verified**:
      `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` (970 tasks, zero failures). **On-device
      against the live gateway** (`meeshy_pixel8`, already-authenticated session): sent a fresh
      plain-text message in the SAME polluted conversation from the investigation above —
      `adb logcat` now shows `OutboxFlush lane=message:68f3808baf186ffd9583b0fa ...` for the
      **first time ever** (this log line structurally could not have appeared before the fix);
      `flip-test-verify` (previously an inert clock icon for weeks) was actually attempted for the
      first time and transitioned to `Not sent — tap to retry` (a stale-schema payload decode
      failure now correctly surfaced instead of silently rotting); a fresh message in a second,
      clean conversation triggered a real `POST https://gate.meeshy.me/api/v1/conversations/
      6a712c3acd1fb95d11b8fc6d/messages` (confirmed via OkHttp request/response logging). **New,
      separate, out-of-lane finding — NOT fixed here (gateway code, violates diff purity)**: that
      POST (and the equivalent one for the first conversation) currently returns `400
      {"error":"Internal Server Error"}` in production; reproduced with a bare `curl` using the
      same bearer token (ruling out any Android-side request-shape cause) while a `GET` on the
      same conversation's messages returns `200` normally — i.e. **creating a new message via the
      REST API currently appears broken in production**, independent of platform. Flagged for a
      dedicated gateway-side investigation; not a regression from this diff (this diff contains no
      gateway changes and the failure reproduces identically via `curl`).
- [◐] Attachment ladder (emoji, file, location, camera, photo library, voice) — **file + photo-library picker done**
      (slice `chat-attachment-file-picker`, 2026-07-16): the composer now carries an attach button
      (`Icons.Filled.AttachFile`) launching the system document/photo picker (`GetContent("*/*")`); the pick is
      read into memory (`readPickedAttachment` — ContentResolver byte read + `OpenableColumns.DISPLAY_NAME`
      query + declared content-type, `null`-safe on a revoked grant), its MIME resolved via the new pure
      `MimeTypeResolver` SSOT (iOS `MimeTypeResolver.swift` port — declared type first, filename extension as
      fallback), typed via pure `AttachmentMessageType.forMime` (reusing `MediaKindClassifier`), and sent through
      the **same** durable upload→graft→send chain the clipboard path uses (`ChatViewModel.sendFileAttachment`).
      Any composer text rides along as the body and clears. **Ladder tray grouping done** (slice
      `chat-composer-attachment-ladder`, 2026-08-20): the lone `AttachFile` button becomes an "Add" toggle
      opening a horizontal `ComposerAttachmentTray` (circular gradient discs + labels) above the composer Row.
      Pure `:feature:chat` `ComposerAttachmentLadder.tiles(...)` ports iOS `UniversalComposerBar+Attachments`'s
      `carouselTiles` — the fixed order Photo → Camera → File → Location → Voice → Emoji, each gated on the
      participant's `ComposerAffordances` (permission) AND a host-capability `show*` flag (product policy; iOS
      gates via `on* != nil`). Photo/Camera ride the *capture* capability (`canSendImages || canSendVideos`);
      Photo suppressed under a recent-media strip (iOS `onRecentMediaSelected == nil`, Android has none yet →
      defaulted off, branch kept). Each tile carries its iOS gradient hex. Live handlers today: Photo →
      `filePicker.launch("image/*")`, File → `*/*`, Voice → `requestVoiceRecording()`; Camera/Location/Emoji
      host flags off (no handler yet → never a dead-end tile). +14 tests (capture-OR arms, per-kind permission
      and host gates, recent-strip suppression, read-only keeps attachments, fully-denied empty, order
      preservation, live posture, colour parity). Strings ×7 EN/FR/ES/PT. **Pending:** in-app camera capture,
      a send-location action, an emoji-into-text handler (each flips its host flag on), and per-pick
      upload-progress. **Location** ships separately (see live-location rows).
- [x] Large-paste detection → clipboard-content attachment — **detection + preview + send done**
      (slice `chat-clipboard-content-send`, 2026-07-16): the captured paste is now delivered as a real
      `text/plain` attachment through the durable upload→graft→send chain (see "Send with attachments"
      below). `ChatViewModel.send` folds a captured `ClipboardContent` into a `MediaUploadItem`
      (`clipboard-content.txt`, bytes = the full paste), enqueues it via `MediaUploadQueue`, and calls
      `sendOptimistic(messageType="file", attachmentUploadCmids=[uploadCmid], attachments=[…])`; the
      `SEND_MESSAGE` row gates on the upload and carries its cmid as a placeholder `attachmentId` until
      `MessageMediaWriteBack` grafts the real gateway id in. `canSend` is true with a blank draft when a
      clip is captured, and the composer shows Send (not the voice Mic) in that state. **Surpasses iOS**,
      which previews the clipboard chip but never sends it. +9 tests (VM 4, plus repository/graft — see
      below). **Detection + preview** shipped earlier (slice `chat-large-paste-detection`): pure
      `:feature:chat` `LargePasteDetector`
      (port of iOS `UniversalComposerBar.handleClipboardCheck` — fires when the composer text grows
      past `MIN_TOTAL_LENGTH=2000` **and** jumps by more than `MIN_GROWTH=250` chars in one edit;
      surpasses iOS by replacing its obfuscated `delta = 2·growth` formula with the readable growth
      threshold) + pure clock-injected `ClipboardContent` value type (`of(text, nowMillis)` →
      id/charCount/200-char `truncatedPreview`; surpasses iOS by injecting the clock instead of two
      `Date()` reads and using full structural equality instead of id-only `==`). `ChatViewModel`:
      `onDraftChange` folds a captured paste into `ChatUiState.clipboardContent` + clears the draft
      (so the huge paste is never persisted as a draft nor emits typing), `removeClipboardContent`
      discards it; `ChatComposer` shows an accent-tinted `ClipboardContentPreview` chip (doc glyph,
      truncated body, char count, remove button — parité iOS `clipboardContentPreview`), en/fr/es/pt.
      +24 tests (detector 13, model 8, ViewModel 3), mutation-checked (growth boundary `>`→`>=` fails
      exactly the boundary test). **Pending:** sending the captured content as a real clipboard_content
      attachment (gated on the not-yet-built attachment send pipeline).
- [ ] In-app camera: photo capture + video recording (flash, front/back toggle)
- [x] Live sentiment + language detection ("smart context zone") with language pill/picker override —
      **live sentiment done** (slice `composer-live-sentiment`, 2026-08-20): the composer shows a live
      mood emoji derived from the draft as you type. Pure `:core:model` `SentimentAnalyzer.score(text)`
      (faithful port of iOS `TextAnalyzer.computeSentiment` — the dictionary FR/EN/ES/DE scorer, NOT the
      message-detail sheet's `NLTagger` ML scorer, which has no portable Android equivalent) +
      `SentimentLevel.from(score)` (7 buckets, iOS thresholds, glyphs). `ChatUiState.composerSentiment`
      derives it (null on a blank draft; `NEUTRAL` for wordless-sentiment text) and the composer renders
      it as the input field's trailing glyph. +20 core tests (`SentimentTest`) +5 VM tests
      (`ChatViewModelTest`).
      **Language pill/picker + ≥10-word lock done** (slice `composer-language-pill`, 2026-08-20): the
      composer's leading pill shows the flag of the live source language and opens a picker to override
      it. Pure `:core:model` `ComposerLanguageState` (detected + manualOverride + isLocked) drives it —
      `onDraftChanged` re-detects each keystroke via the already-shipped `ComposeLanguageDetector` (port
      of iOS `TextAnalyzer`'s language tracking + `ComposerLanguageResolver`), locks at
      `WORD_LOCK_THRESHOLD`=10 words, and releases the lock when the composer empties (unless a manual
      pick holds). `display(fallback)` resolves `override ?? detected ?? fallback` (iOS `displayLanguage`).
      A `NO_DETECTION` sentinel ("" — a code the detector never returns) keeps an undetectable draft from
      pinning the pill to a stale fallback: `detected` stays null and the pill follows the live fallback.
      Wired into `ChatViewModel` (`onDraftChange` folds the state; `onComposerLanguagePicked` overrides;
      `composerLanguageSeed` = the viewer's `resolveUserLanguage`), and the pill is now **authoritative
      for the stamped `originalLanguage`** on both the text and file send paths (a manual pick wins over
      detection), replacing the previous per-send re-detection. Reset to seed on send. +18 core tests
      (`ComposerLanguageStateTest`) +5 VM tests (`ChatViewModelTest`). Note: iOS's `NLLanguageRecognizer`
      86%-confidence gate has no portable Android analog; the heuristic detector's own weak-signal→fallback
      contract is the confidence proxy.
- [✅] @-mention autocomplete (debounced API + local merge) — **local roster + remote merge done**
      (remote merge `chat-mention-remote-merge` 2026-07-16): the local roster's `ChatMention` SSOT gained the two
      remaining pure pieces from iOS `MentionComposerController` — `shouldQueryRemote` (only fire once the trimmed
      `@fragment` reaches 2 significant chars; a bare `@`/single letter is served entirely from the roster) and
      `mergeSuggestions` (port of `mergeAPISuggestions`: locals keep order and win every collision; a remote row
      is appended only when its handle — trimmed, case-insensitive — is neither blank, already local, nor a
      duplicate of an earlier remote row) — plus a staleness-guarded `MentionAutocompleteState.applyRemote(query,
      remote)` reducer that folds the results in **only** while `query == activeQuery` (a slow response for a stale
      fragment is dropped, returning the same instance — the pure equivalent of iOS's `Task.isCancelled`).
      Protocol-injected `MentionSearch` (iOS `MentionServiceProviding` parity) with a `DirectoryMentionSearch`
      impl over `UserRepository.searchUsers` (failure → empty, roster still serves). `ChatViewModel` fires a
      300 ms-debounced lookup on `onDraftChange` (each keystroke cancels the previous in-flight `Job`), excludes
      the signed-in user, and applies via `applyRemote`; cancelled on paste-capture and on select. +20 tests
      (5 gate, 8 merge, 3 applyRemote, 4 VM: merge-below-roster, single-char-no-fetch, self-excluded, fresh-query-
      supersedes). Mutation (drop the dedup/blank guard) failed exactly the 6 dedup/blank/merge tests.
      (local roster `chat-mention-autocomplete` 2026-07-06): pure `:feature:chat` `ChatMention` SSOT (port of iOS
      `MentionComposerController` pure logic) — `extractQuery` (trailing `@fragment`, bare `@` → full roster,
      space → inactive), `filterCandidates` (trimmed case-insensitive over username **or** display name, blank →
      all), `insertMention` (rewrite trailing fragment → `@username `, inert without an active fragment); plus a
      pure reducer over `MentionAutocompleteState(activeQuery, suggestions, draftMentions)` — `onTextChange`,
      `cleared` (idempotent, keeps draft mentions), `select` (rewrite + record + dismiss), `reset`. `MentionRoster`
      builds candidates from participants (excludes self, drops blank handles, degrades display name→username).
      `ChatViewModel` recomputes on `onDraftChange`, exposes `onMentionSelected`, resets on send; `ChatScreen`
      renders a neutral accent-avatar suggestion strip above the composer. +40 tests. **Pending:** debounced
      backend `/mentions` API merge over the local roster (online enrichment).
- [x] Draft auto-save/restore (text + reply + language + effects + blur + ephemeral) — **text + reply-ref done**
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
      tests. **Effects/blur/ephemeral persistence done** (slice `chat-draft-effects-persistence`, 2026-08-21):
      `ConversationDraft` gained an `effects: MessageEffects` field (defaulted → legacy blobs decode to an empty
      selection) folding iOS `MessageDraft.effectFlags`/`isBlurEnabled`/`ephemeralDurationRawValue` into the single
      `MessageEffects` SSOT. A NEW `ConversationDraft.isWorthPersisting` (`isMeaningful || effects.hasAnyEffect`)
      mirrors iOS's split between the text-only list rule (`hasDraftText`) and the persistence rule
      (`isEffectivelyEmpty`, which weighs effects): `DraftAutosave` switched to it (an effect armed on an empty
      composer persists and survives navigation; clearing the last effect on an empty composer purges), while the
      four conversation-list surfaces keep the text/reply-only `isMeaningful` — so an effects-only draft never
      floats or badges a row, exactly like iOS. `DraftAutosave.resolve` gained an `effects` param (armed effects →
      `Save`; a change in effects alone → `Save`; identical text+reply+effects → `None`); `DraftRestore` carries the
      effects; `ChatViewModel.persistDraft` reads `pendingEffects` from state and `toggleEffect`/`selectEphemeralDuration`/
      `clearEffects` now persist, restore re-arms `pendingEffects` on open. +19 tests (7 `ConversationDraftTest`
      incl. back-compat decode, 8 `DraftAutosaveTest`, 4 VM round-trip), mutation-proven ×3 (drop the
      `isWorthPersisting` effects clause → 1 fail; drop the resolve idempotence effects clause → 1 fail; drop the
      empty-guard `!effects.hasAnyEffect` → 1 fail). **Manual composer-language persistence done** (slice
      `chat-draft-language-persistence`, 2026-08-21): `ConversationDraft` gained `selectedLanguage: String?`
      (defaulted → legacy blobs decode to no language) porting iOS `MessageDraft.selectedLanguage`. Per iOS
      `isEffectivelyEmpty`/`hasDraftText` (both ignore `selectedLanguage`), a language pick is **not content**:
      `isMeaningful` and `isWorthPersisting` are BOTH left unchanged, so a language-only composer neither floats/
      badges a row nor is persisted — the language rides along an otherwise worth-persisting draft. Only the
      deliberate **manual** override (`ComposerLanguageState.manualOverride`) is persisted; live detection is not
      (it re-derives from the restored text). `DraftAutosave.resolve` gained a `selectedLanguage` param
      (normalised trim/blank→null; a change to it on a worth-persisting draft → `Save`; identical text+lang →
      `None`; language alone on an empty composer → `None`); `DraftRestore` carries `selectedLanguage`; `restore`
      re-applies it via `withManualPick` (a restored pick wins over detection of the restored text and freezes
      analysis). `ChatViewModel.persistDraft` reads `manualOverride` from state and `onComposerLanguagePicked`
      now persists (iOS `.adaptiveOnChange(of: selectedLanguage)` parity); open-time restore applies the pick.
      +17 tests (4 `ConversationDraftTest` incl. back-compat decode + not-content proofs, 10 `DraftAutosaveTest`
      = 7 resolve + 3 restore, 3 VM round-trip), mutation-proven (drop the resolve `selectedLanguage` idempotence
      clause → exactly the `only_the_language_pick_changing` test fails, `identical_text_and_language` stays green).
- [◐] Send with attachments (TUS resumable; audio over socket, others over REST) + upload progress —
      **REST attachment chain + first real path (clipboard content) done** (slice `chat-clipboard-content-send`,
      2026-07-16). The durable upload→send chain now carries message attachments, mirroring the proven story
      publish chain: `MessageRepository.sendOptimistic` gained `messageType` / `attachmentUploadCmids` /
      `attachments` params (defaulted → text-only sends byte-identical), threading placeholder ids into
      `SendMessageRequest.attachmentIds` + the optimistic `ApiMessage.attachments` and gating the `SEND_MESSAGE`
      outbox row on the uploads via `dependsOn`. New pure `:sdk-core` `MessageMediaWriteBack.graft` (exact analog
      of `PublishMediaWriteBack`, over `attachmentIds`) + a pure `OutboxPayloadGrafts.firstOf` combinator wire both
      write-backs into the `OutboxDrainer`, so a delivered upload's real gateway id reaches a queued chat send
      **or** a story publish (each graft owns one payload shape, declines the other). First live producer: the
      captured clipboard content (REST, `text/plain`, `messageType="file"`). **Pending:** audio over socket
      (`message:send-with-attachments` — the audio pipeline is socket-only per gateway), a file/photo/camera picker
      to source other attachment types, real TUS-resumable uploads (today: plain multipart `POST /attachments/upload`),
      and an upload-progress indicator. +36 tests (graft 10, combinator 4, repository 4, VM 4 + existing send/story
      chains regression-green), mutation-checked (dropping the identity guard fails exactly the identical-swap test).
      **File/photo picker source done** (slice `chat-attachment-file-picker`, 2026-07-16): a system
      document/photo picker now sources image/video/document attachments over this same REST chain — the picked
      bytes are read from the content Uri, the MIME resolved via the new pure `MimeTypeResolver` SSOT and typed
      via `AttachmentMessageType.forMime`, then delivered through `ChatViewModel.sendFileAttachment` (mirror of
      the clipboard path). +34 tests (MimeTypeResolver 20, AttachmentMessageType 8 — 28 pure — plus 6 VM
      behavioural), mutation-checked (dropping the octet-stream guard in `resolve` fails exactly the 2
      octet-stream deferral tests). **Still pending:** audio over socket, in-app camera, TUS-resumable, progress.
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
      (slice `chat-typing-in-control`, 2026-07-07, +10 tests). **Offline indicator shipped
      2026-08-17** (slice `chat-scroll-offline-indicator`): `ChatViewModel` already computed
      `isOffline` from `NetworkConditionMonitor`, but only fed it to `toBubbles` (the per-message
      hourglass) — never exposed at the top level or passed to `ScrollControlContent.of`. New
      `ScrollControlContent.Offline` variant, priority confirmed by reading iOS
      `ConversationScrollControlsView.swift` directly (not a paraphrase): `isSearchingQuotedMessage
      > hasUnreadContent (unread OR typing) > isOffline > plain chevron` — Android has no
      quoted-message-search state, so the relevant tier is Typing/Unread > Offline > Plain,
      consistent with the already-shipped Typing-over-Unread rule. `ChatUiState.isOffline` fed from
      the SAME collector that already computes it for the hourglass. New `OfflinePill` (mirrors
      `TypingPill`, `Icons.Filled.WifiOff`, neutral `textSecondary` tint rather than accent — signals
      connectivity, not conversation identity). **Surpasses iOS**: the SDK's `ConversationScrollControlsView`
      fully supports `isOffline`, but its one call site (`ConversationView+ScrollIndicators.swift`)
      hardcodes `false` — the indicator never actually shows in the live iOS app today; Android wires
      it to a real `NetworkConditionMonitor` reading. +5 `ScrollControlContentTest` + 2
      `ChatViewModelTest`. Strings ×4 EN/FR/ES/PT. **Still open:** slow-scroll search state (a
      separate, unrelated sub-gap — the search TopAppBar's own local-vs-remote posture, not
      attempted this run).
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
- [~] Static location pin (done — `chat-bubble-location` 2026-07-09, see Message bubbles above) +
      live location sharing (timed sessions) core+UI done (`chat-live-location-sessions` 2026-07-16 :
      port iOS `ActiveLiveLocation`/`LiveLocationDuration`/`LiveLocationBadge` — the pure timed-session
      layer in `:core:model` (`LiveLocationDuration` 15m–8h with `durationMillis`/`fromMinutes`;
      `ActiveLiveLocation` keyed by userId with clock-injected `isExpired`/`remainingMillis` + `startingAt`
      window→deadline factory guarding a non-positive window; `LiveLocationCountdown.of` — port of the badge's
      `formattedRemaining` returning a structured hours/minutes/seconds + `Tier` + iOS-shaped `clockLabel`, i18n
      word deferred app-side; `LiveLocationSessions` — the immutable reducer that ports what iOS scatters across
      `ConversationSocketManager.activeLiveLocations`: `start`/`update`(no-op on unknown user)/`stop`/`active`/
      `pruneExpired`, surpassing iOS by pruning lapsed sessions the moment the clock passes their deadline) +
      the `:sdk-ui` `LiveLocationBadge` (pulsing green dot, accent glyph, name, live self-terminating countdown,
      optional Stop) and `LiveLocationDurationPicker` capsule chips, both accent-coherent, EN/FR/ES/PT strings,
      +42 tests. Socket start/update/stop wiring **done** (`chat-live-location-socket-fold` 2026-07-16):
      the pure `:core:model` `LiveLocationEventFold` folds the `location:live-started/updated/stopped`
      wire events (already-modelled `Location.kt` DTOs) into the `LiveLocationSessions` reducer — resolving
      each ISO date through the shared `isoToEpochMillisOrNull` and applying iOS's exact fallbacks
      (`expiresAt ?? now + durationMinutes·60`, `startedAt ?? now`, `timestamp ?? now`, non-positive window →
      `now`) — a faithful port of the three `ConversationSocketHandler` sinks, with the reducer's inert/no-op
      contracts preserved. `MessageSocketManager` gains the three `liveLocation*` `SharedFlow`s + `listen`
      registrations; `ChatViewModel` collects them (conversation-scoped) into `ChatUiState.liveLocations` and
      exposes `liveLocationBadges`; `ChatScreen` renders a self-terminating accent-coherent `LiveLocationBadge`
      above the message list per active session. +17 tests (fold 13 incl. now-vs-startedAt boundary mutation-checked,
      VM 4). **Still pending:** fullscreen map / directions (needs a Maps SDK dependency).
- [x] OpenGraph link-preview cards + in-app browser; tracker-param stripping
    - [x] **Pure link-preview core + tracker stripping** (`:sdk-core` `me.meeshy.sdk.link`): `LinkPreviewParser`
      (`firstUrl` http/https/`www.` detection with trailing-punctuation + balanced-paren trimming and scheme
      lowercasing; `canonicalize` strips utm_*/fbclid/gclid case-insensitively + drops empty query/fragment;
      `parse` OpenGraph/Twitter-card/`<title>`/host-fallback extraction with relative/protocol-relative image
      resolution; `decodeHtmlEntities` named + decimal + hex), the immutable `LinkMetadata`
      (`host`/`hasAnyVisibleField`), and the pure `LinkPreview.stateFor` machine (`None`/`Loading`/`Card`/
      `BareLink`). Wired real (`:feature:chat`): `LinkPreviewCard` renders a tappable accent link chip below any
      message bubble carrying a URL (the iOS "raw link" graceful fallback), opening it via the URI handler.
      Slice `chat-link-preview-core` (2026-07-15, +59 tests). SSOT for link detection/OG parsing that iOS
      spreads across `LinkPreviewFetcher`.
    - [x] **Async OpenGraph fetch + dedupe/negative-cache/logout-purge** (slice `chat-link-preview-cache`,
      2026-07-16, +42 tests): the immutable `LinkPreviewCache` SSOT (`:sdk-core`) — `lookup`/`outcomeFor`
      (Cached/RecentlyFailed/InFlight/ShouldFetch → `LinkPreviewOutcome`), `startFetch`, `resolve` (success
      caches + clears the prior failure, empty records a 30-min negative window, both clear the in-flight
      marker), `evictStale` (7-day positive TTL + prunes expired negatives — surpasses iOS which only evicts
      positives at load), `cleared` (logout purge); the pure `LinkPreviewFetching.outcomeFrom` HTTP→outcome gate
      (status/content-type/visible-field) + `OkHttpLinkPreviewFetcher` IO glue; the app-side `LinkPreviewStore`
      (`:feature:chat`) orchestrating *when* to fetch — dedupe, negative window, canonical-key sharing of
      campaign-tagged variants, cancellation-safe. Wired real: `ChatScreen` requests per bubble and projects the
      collected cache into `LinkPreview.stateFor`, so a link now progresses `Loading`→`Card`/`BareLink`. Mirrors
      iOS `LinkPreviewStore.requestMetadata`; SSOT that iOS scatters across `cache`/`negativeCache`/`pendingKeys`.
    - [x] **In-app browser routing + rich-card image band** (slice `chat-in-app-browser-routing`,
      2026-07-16, +30 tests): the pure `LinkOpenPolicy.targetFor` (`:sdk-core`) — one decision mapping a
      raw URL to `LinkOpenTarget.InAppBrowser` (http/https, host-validated, scheme-lowercased),
      `External` (well-formed non-web schemes — mailto/tel/geo/`meeshy://` deep links/reverse-dns — handed
      to the OS), or `Unsupported` (blank, hostless-web, or a **blocked** dangerous scheme
      javascript/data/file/about/blob/vbscript/content). **Surpasses** iOS's `SFSafariViewController`
      (which silently no-ops on non-http and would run a `javascript:`/`data:` payload): dangerous schemes
      are refused, non-web schemes reach their real handler, and a scheme-less bare host is promoted to
      https. Plus the pure `LinkMetadata.renderableImageUrl` (og:image only when http/https) reused by the
      card. Wired real (exempt glue): `openChatLink` maps each arm to a Chrome **Custom Tab** (accent-tinted
      toolbar) / `ACTION_VIEW` / no-op, each `runCatching`-guarded; `ChatScreen.onOpenUrl` routes through it;
      `RichLinkCard` gained a Coil `AsyncImage` hero band gated by `renderableImageUrl`. +30 tests
      (LinkOpenPolicy 26, LinkMetadata 4); mutation-checked (dropping the blocked-scheme guard killed
      exactly the 3 dangerous-scheme tests). SSOT for URL-open routing that iOS leaves implicit in
      `URL(string:)` + `SafariView`.
- [~] Report message (typed reasons + detail) **shipped** (slice `chat-report-message`, 2026-07-16,
      +36 tests); per-conversation animated themed background still open.
    - [x] **Report a message** — long-press → **Report** (offered *only* on an incoming, still-present
      message: a genuine improvement over iOS, which appends `.report` unconditionally, even on your
      own message). The pure `ReportReason` SSOT (`:core:model`) gained the two message-only reasons
      `VIOLENCE`/`HATE_SPEECH` + a `messageOrdered` list (parity with iOS `ReportMessageSheet.ReportType`:
      spam, inappropriate, harassment, violence, hate_speech, impersonation, other), while the narrower
      user-report `ordered` list stays untouched. `ReportRequestBuilder.forMessage` + `ReportRepository.
      reportMessage` mirror the user path (session-gated, inert `null` off-session). The submit lifecycle
      is a pure `ReportMessageForm` reducer modelling one `ReportSubmitStatus` enum (Idle/Submitting/
      Submitted/Error) — cleaner than iOS's three `@State` booleans — with a double-submit guard and an
      "editing clears a prior error" rule. Wired real (exempt glue): `MessageActionMenu.Report`,
      `ChatViewModel.openReport/selectReportReason/onReportDetailsChange/submitReport/dismissReport`, a
      `ReportMessageSheet` bottom sheet (accent-tinted radio reasons + capped details field + toast on
      success) in en/fr/es/pt. +36 tests (ReportReason 3, ReportRequestBuilder 4, ReportRepository 4,
      MessageActionMenu 5, ReportMessageForm 11, ChatViewModel 7, plus the updated basic-menu order);
      mutation-checked (dropping the `!isOutgoing` gate killed exactly the 3 outgoing-message tests).
- [ ] Conversation info sheet: hero/direct headers; members / media / stats / options tabs
- [~] Paginated member list (infinite scroll + search); shared-media grid; pinned-messages list —
      **member list shipped 2026-08-16** (slice `conversation-members-roster`, port of iOS
      `ParticipantsView`): a group-only header action opens a members bottom sheet with cursor
      pagination, server-side search (`?search=` filters `displayName` case-insensitively) and
      role badges. Pure `MemberRoster` (`:core:model`) accumulates pages, **deduplicates ids
      repeated across pages** (cursor pagination over a roster mutating underneath legitimately
      repeats a row) and normalises `hasMore && nextCursor != null` — a server answering
      `hasMore: true, nextCursor: null` would otherwise re-request page one forever; **both holes
      are open in the iOS reference**. `PaginatedParticipant.displayLabel` ports iOS's
      `name` fallback chain. Shared-media grid and pinned-messages list are already live
      (`ConversationMediaGallery`, `PinnedMessagesSheet`) — box stays `[~]` only because this line
      bundles three surfaces and all three should be re-verified together before checking it.
- [~] Member moderation: promote/demote, expel, ban, add member — **promote/demote/expel shipped
      2026-08-16** (slice `conversation-members-roster`) via a per-row overflow menu inside the
      members sheet. Pure `MemberModeration` (`:core:model`) is the SSOT for which affordance a
      viewer may see: `canRemove` (never self, never the creator, admin+ removes anyone,
      moderator removes plain members only) and `roleActions` (creator moves anyone between
      member/moderator/admin; a conversation admin does the same except on a peer admin;
      moderators and members get nothing) — a faithful port of `ParticipantsView.
      canRemoveParticipant` + `contextMenuItems`, mirroring the gateway's own checks in
      `routes/conversations/participants.ts` so no control is offered that would come back 403.
      Both actions are **optimistic with rollback** on refusal (iOS applies only after the server
      answers). Real-time: `participant:role-updated` / `conversation:participant-left` /
      `conversation:participant-banned` were listened for in `MessageSocketManager` but had **no
      consumer** before this slice — the sheet is now that consumer, so a moderation action taken
      on another device or by another moderator lands without a refetch. **Add member shipped
      2026-08-16** (slice `add-participant-sheet`) — a nested `AddParticipantSheet` (Android port
      of iOS's own `AddParticipantSheet`), opened from a new "+" icon in the members sheet header,
      gated on `viewerRole.hasMinimumRole(MODERATOR)` (mirror of iOS `canManageMembers = isAdmin
      || isModerator`, itself matching the gateway's own `['creator','admin','moderator']` check
      in `routes/conversations/participants.ts`). New `POST /conversations/{id}/participants`
      wired (`ConversationApi.addParticipant`/`ConversationRepository.addParticipant`) — the
      client only gates the affordance, the server remains the authority. `AddParticipantViewModel`
      reuses the exact debounced-search shape already established by `NewConversationViewModel`
      (300 ms, 2-char floor, `UserRepository.searchUsers`) but adds no multi-select: each row's
      "Add" button fires immediately, tracked per-user (`isAdding`/`isMember`) so a repeat tap
      mid-flight is a no-op and a refusal rolls the row back to offering the button again with the
      server's error surfaced. `existingMemberIds` passed in from the already-loaded roster so a
      current member never gets an enabled "Add" button; `onAdded` refreshes the roster sheet
      behind it, mirroring iOS's own callback. +8 tests (`ConversationRepositoryTest` ×2 for the
      new endpoint, `AddParticipantViewModelTest` ×6 for debounce/floor/member-flagging/add/
      refusal-rollback/in-flight-dedup). **Ban shipped 2026-08-16** (slice
      `conversation-member-ban`) — re-proved before assuming "iOS does not wire it": `ban` IS
      wired, just not in `ParticipantsView` (the screen `ConversationMembersSheet` otherwise
      mirrors) — it lives in a SECOND, parallel iOS member-management surface,
      `MemberManagementSection` (embedded in the conversation-settings sheet, reached via
      `ConversationInfoSheet` → "Conversation info sheet" §C, itself still open below), calling
      `ConversationSettingsViewModel.banParticipant` (`packages/MeeshySDK`). Android already
      unified both iOS screens into one `ConversationMembersSheet`, so ban was added there as a
      fourth row action alongside promote/demote/remove rather than waiting on the larger,
      still-open settings-sheet port. New `MemberModeration.canBan` — **stricter than
      `canRemove`**, ported from iOS's own guard (`currentUserRole > targetRole &&
      currentUserRole.hasMinimumRole(.admin)`): an admin may remove ANY non-creator member but
      may only BAN a strictly lower-ranked one — an admin cannot ban a peer admin, unlike
      removal. New `PATCH /conversations/{id}/participants/{userId}/ban` wired
      (`ConversationApi.banParticipant`/`ConversationRepository.banParticipant`, no body — mirror
      of iOS `ConversationService.banParticipant`). `ConversationMembersViewModel.banMember`
      reuses the exact optimistic-with-rollback shape as `removeMember` (banning drops the row
      from the active roster immediately, same visible effect), with its own confirmation dialog
      (Android's `removeMember` already confirms before firing — iOS's `MemberManagementSection`
      does NOT show a confirmation for either expel or ban, an iOS gap not worth reproducing over
      the already-safer Android convention). +6 tests (`MemberModerationTest` ×5 for the stricter
      rank gate, `ConversationMembersViewModelTest` ×3 for optimistic drop/rollback/role gating).
      **Still open: unban** — the SDK method (`ConversationService.unbanParticipant`) exists and
      is fully wired, but has genuinely ZERO iOS UI anywhere (no banned-members list screen at
      all) — confirmed by exhaustive grep, not assumed. Not a "port iOS→Android" candidate until
      iOS itself grows a reference UI; noted here rather than silently dropped. Box stays
      unchecked until it lands.
- [x] Conversation moderation: write-role, announcement mode, slow mode, auto-translate — **admin
      settings editor** landed (slice `conversation-settings-form`), completing the item on top of the
      earlier **slow-mode composer enforcement** (`chat-slow-mode-cooldown`) and **attachment gating**
      (`composer-send-gate`). Pure `ConversationSettingsForm` (`:core:model`) is an immutable reducer
      seeded from the loaded `ApiConversation` — `withWriteRole/withAnnouncement/withSlowMode/withAutoTranslate`
      → derived `isDirty`/`canSave` → `toUpdate()` emitting a **minimal patch of only changed fields**
      (`UpdateConversationSettingsRequest`, null-omit), then `rebaselined()` after a server-accepted save.
      New `SlowModeOptions` (`:core:model`) is the SSOT for the offered intervals `{0,10,30,60,300}` with
      `nearest()` snapping any off-menu server value onto a picker choice; `MemberRole.wireValue` is the new
      SSOT for encoding a role onto the wire. New `PUT conversations/{id}` endpoint
      (`ConversationApi.updateSettings` → `UpdateConversationResponse`, the previously-orphaned response
      model) + `ConversationRepository.updateSettings`. Wired real: `ConversationSettingsViewModel` (load →
      edit → save lifecycle, `Idle/Saving/Saved/Error`, double-submit guard, edits preserved on failure,
      editing clears a prior error) + `ConversationSettingsSheet` (accent-coherent bottom sheet: write-role
      radios / announcement switch / slow-mode picker / auto-translate switch / Save), reachable from the
      **moderator+-gated** `Tune` action in the `ChatScreen` header. **SOTA over iOS**, whose editor mutates
      three `@State` fields and always PUTs the full object — Android computes a dirty-diff so a no-op save
      is impossible and an unchanged field is never overwritten. **+37 tests** (SlowModeOptions 7,
      ConversationSettingsForm 10, MemberRole 5, ConversationRepository +2, ConversationSettingsViewModel 7);
      mutation-checked (neutralising the diff killed exactly the 5 partial-patch/dirty tests).
- [x] Per-conversation preferences: custom name, reaction emoji, pin, category, tags, mute, mentions-only
      — pin/category/mute/**mentions-only** wired (slice `conversation-mentions-only-preference`,
      2026-08-15, PR #3054: `setMentionsOnlyOptimistic`/`toggleMentionsOnly` + a context-menu toggle,
      shown only while not muted). **Custom name wired 2026-08-16** (slice `conversation-custom-name`):
      `ConversationRepository.setCustomNameOptimistic` (stores `name.trim()` verbatim, including an
      explicit empty string on clear — the pre-existing `explicitNulls = false` JSON config only drops
      Kotlin `null`, never `""`) + `ConversationPrefsPayload.customName`/`OutboxFlushWorker` threading
      through to `ConversationPreferencesUpdate` + a "Rename conversation" context-menu action/dialog.
      **Reaction emoji wired 2026-08-16** (slice `conversation-favorite-reaction`): iOS's real UI is
      `ConversationListView+Overlays`'s "Favori" submenu (fixed 8-emoji set ⭐️❤️🔥💎🎯✨🏆💡ﾠ+ "Retirer le
      favori"; `ConversationPreferencesTab`'s "Reaction" row is a second entry point to the SAME
      field). Also fixed a confirmed Android dead end: `ConversationFilter.FAVORITES` already existed
      as a filter chip gated on `prefs?.reaction != null`, but nothing ever wrote it — the tab was
      permanently empty. `ConversationRepository.setReactionOptimistic` mirrors `setCustomNameOptimistic`'s
      explicit-empty-string-on-clear trick; `ConversationFilters.FAVORITES` fixed to `isNullOrBlank()`.
      **Tags wired 2026-08-16** (slice `conversation-tags-preference`) — neither model field existed
      on Android before this slice (`ApiConversationPreferences.tags`/`ConversationPreferencesUpdate.tags`
      both newly added; the gateway already supported `tags` on the write side). No null-vs-empty-string
      sentinel needed here (unlike `customName`/`reaction`): `[]` is a real non-null JSON array the
      shared `explicitNulls = false` encoder never drops. New "Tags" context-menu dialog: a text field
      + `Icons.AutoMirrored.Filled.Label`-tagged add button + a `FlowRow` of removable `InputChip`s,
      backed by the pure `ConversationTagsEditor.add`/`.remove` SSOT. **Deferred, not core**: iOS's
      `TagInputField` also autocompletes against `allTags` (every tag the user has ever used across all
      conversations, aggregated client-side from `GET /user-preferences/conversations` — no dedicated
      gateway endpoint) — Android's first cut has no autocomplete corpus; a real, documented follow-up,
      not a silently-dropped feature. Every sub-item of this line is now wired on both platforms — box
      checked.
- [x] Conversation lock: master PIN setup/change/remove + per-conversation 4-digit lock + unlock-all.
      **Storage foundation shipped 2026-08-15** (`sdk-core`'s `ConversationLockStore`/
      `EncryptedConversationLockStore`, slice `conversation-lock-store-foundation`, PR #3045) — PIN
      hashing/storage only. **Logout hook wired 2026-08-15** (slice `conversation-lock-logout-wiring`,
      PR #3048) — `DefaultSessionTeardown.wipe()` clears the master PIN and every conversation lock.
      **PIN-entry UI + setup/lock/unlock/open/unlock-all flows shipped** (pure `LockPinReducer` +
      `ConversationLockPinSheet` + `ConversationListViewModel` wiring): the row-tap gate opens locked
      conversations via `OPEN_CONVERSATION` (SOTA over iOS — the row stays visible and reveals on tap,
      WhatsApp-style, rather than being hidden from the list), and unlock-all sits in the top bar.
      **Master PIN change + remove shipped 2026-08-22** (slice `conversation-lock-master-pin`) — the
      last named arm: `LockPinReducer` gains `CHANGE_MASTER_PIN` (verify current → new → confirm →
      commit) and `REMOVE_MASTER_PIN` (verify → clear), a `RemoveMasterPin` effect, and change/remove
      copy; `ConversationListViewModel` gains `onChangeMasterPin`/`onRemoveMasterPin` + a mirrored
      `hasMasterPin` and the `canChangeMasterPin`/`canRemoveMasterPin` gates; a `LockSecurityMenu`
      overflow in the top bar surfaces both once a PIN exists. SOTA over iOS: remove is offered ONLY
      while nothing is locked and is applied through the store's *guarded* `removeMasterPin`, so a lock
      can never be orphaned behind a PIN the user can no longer produce (iOS force-removes
      unconditionally). +17 tests (reducer ×9, ViewModel ×8), 2 mutation RED proofs. Box now `[x]`.
- [x] Leave / archive / delete-for-me / delete-for-all conversation — all four verified shipped: leave/delete-for-me/archive already live (earlier slices), delete-for-all closes the gap (`conversation-delete-for-all`, 2026-08-16)
      — leave, archive, and delete-for-me are wired (`conversation-leave` PR #3055 +
      `conversation-delete-for-me` PR #3057, 2026-08-16: two context-menu items, each behind its
      own confirmation dialog, both reusing the existing `ConversationPurge` socket-driven removal
      path — `conversation:participant-left`/`conversation:deleted`). delete-for-all still
      unwired — the gateway's admin/creator-only "delete for everyone" semantics differ
      meaningfully (not assumed to be a quick follow-up). Box stays unchecked until it lands.
- [x] Anonymous-session conversation mode; guest join-via-share-link flow — the
      **entry-decision brain landed** (slice `sharelink-entry-policy`, 2026-08-22): pure
      `ShareLinkEntryPolicy.intent(ShareLinkEntryFacts) → ShareLinkEntryIntent` (`:core:model`,
      faithful port of iOS `ShareLinkEntryPolicy.swift`) — five facts in (conversationId,
      isAuthenticated, isAlreadyMember, linkRequiresAccount, hasStoredGuestSession), one of six
      intents out (`OpenConversation` / `JoinWithAccount` / `JoinAnonymously` / `ResumeGuestSession`
      / `ChooseIdentity` / `RequiresAccount`). Encodes the two load-bearing precedence rules:
      unauthenticated → a stored guest session on THIS link beats the link's account requirement
      (re-asking would erase the only identity the visitor has here); authenticated → already-a-member
      beats the account requirement (nothing to decide when already named in the room). This closes
      the gap where Android's deep-link handler (`MeeshyApp.kt`) routed EVERY share-link straight to
      the anonymous guest form, wrongly forcing an authenticated user / an existing member / a
      returning guest into it. +11 behavioural tests, 2 mutation RED proofs (both precedence orders).
      **`joinAuthenticated` endpoint shipped** (slice `sharelink-join-authenticated`, 2026-08-22):
      `ConversationApi.joinViaShareLink(linkId)` (`@POST conversations/join/{linkId}`, empty body — the
      gateway derives the joiner from the JWT, idempotent server-side) + a stateless `:sdk-core`
      `ShareLinkJoinRepository.joinAuthenticated(linkId): NetworkResult<String>` returning the canonical
      conversationId. SOTA over iOS: a blank linkId is inert (no doomed network call) and a success
      envelope carrying a blank conversationId folds to Failure, so a caller never navigates to an empty
      id. +6 behavioural tests, 2 mutation RED proofs (blank-linkId guard, blank-conversationId guard).
      **Fact-assembly resolver shipped** (slice `sharelink-entry-resolver`, 2026-08-22): app-side
      `ShareLinkEntryResolver` (`:feature:auth`, NOT `:sdk-core` — it does I/O + consults device state,
      so by the grain test it is product orchestration; faithful port of iOS's app-side
      `ShareLinkEntryResolver.swift`, which lives in `apps/ios/.../Navigation/`, not the SDK). Injects a
      `ShareLinkPreviewProviding` seam + `AnonymousSessionStore`; `resolve(identifier, isAuthenticated,
      knownConversationIds) → ShareLinkEntryResolution(intent, conversationTitle)?`. Assembles the five
      `ShareLinkEntryFacts` and delegates the decision to the pure `ShareLinkEntryPolicy`. SOTA over iOS:
      a blank identifier is inert (no doomed empty preview), and a preview with no conversation / a blank
      conversation id resolves to `null` (graceful fallback, not iOS's force-unwrap crash). Android's
      single-value guest store means "stored session for THIS link" = `store.load()?.linkId == identifier`
      — a session opened on a different link never resumes here. +15 behavioural tests, 2 mutation RED
      proofs (linkId-equality guard, identifier-trim-before-preview).
      **Deep-link route rewired — box now `[x]`** (slice `guest-join-entry-navigation`, 2026-08-22):
      `ShareLinkEntryViewModel` (`:feature:auth`) is the app-side brain the route now consults before
      presenting anything. On entry it reads the auth flag (seam over `AuthRepository`), gathers known
      conversation ids only when authenticated (seam over `ConversationRepository.cachedConversations`),
      runs the `ShareLinkEntryResolver`, and reduces the resulting `ShareLinkEntryIntent` to one
      `ShareLinkEntryUiState`: `OpenConversation` (already a member / joined-with-account / resumed guest)
      / `ChooseIdentity` (account vs anonymous, flagging a resumable guest session) / `RequiresAccount`
      (steer to sign-in) / `GuestForm` (the existing anonymous form) / `Failed` (a join failure, with
      retry) / `Resolving`. Two intents drive a network join the VM performs itself (`JoinWithAccount`,
      and the fallback when an authenticated link cannot be resolved at all) via an
      `AuthenticatedShareLinkJoining` seam over `ShareLinkJoinRepository.joinAuthenticated`. The
      `ChooseIdentity` prompt is actionable (no dead end): `chooseAccount()` joins + opens,
      `chooseAnonymous()` resumes the stored guest session or opens the form. `MeeshyApp.kt`'s
      `GUEST_JOIN` route now hosts `ShareLinkEntryScreen` (Compose glue) instead of jumping straight to
      the guest form. SOTA over iOS, which routes authenticated vs unauthenticated entry through two
      separate views: Android unifies both behind one VM, and a blank stored `conversationId` degrades to
      the form instead of navigating to an empty id. +19 behavioural tests (real resolver over faked leaf
      seams), 1 mutation RED proof (resume blank-conversationId guard). Local gate
      `assembleDebug testDebugUnitTest` green (973 tasks).
- [x] AI conversation analysis (health score, summary, topics, tone, emotions) —
      **AI-summary card shipped 2026-08-22** (slice `conversation-analysis-summary`). The
      `ConversationAnalysis` model shipped orphaned (no repository, no consumer); this slice turns
      the **summary arm** real. Pure `ConversationAnalysisProjection` (`:core:model`, SSOT) ports
      iOS's `heroHealthCard` derivations: `healthTier` (>70 good / >40 fair / else poor, parity
      `healthScoreColor`), `conflictTier` (case-insensitive high/medium keyword match, parity
      `conflictLevelColor`), `cleanLabels` (trim / drop-blank / case-insensitive dedupe for topics +
      emotions — SOTA over iOS's raw list), and `summary()` → a render-ready `AnalysisSummaryView`
      or null (the Empty state) when nothing renders. The health score is **clamped 0..100** before
      the tier is derived (SOTA — iOS trusts the raw server value). `ConversationAnalysisRepository`
      (`:sdk-core`) fetches `GET /conversations/{id}/analysis`; `ConversationAnalysisViewModel` +
      `ConversationAnalysisSheet` (`:feature:chat`) render it behind a new header `AutoAwesome`
      action (any member): health badge, engagement/conflict chips, tone, topics + emotions chip
      rows, summary narrative, dynamic. Strings en/fr/es/pt. **Persona profiles + trait bars landed
      2026-08-22** (slice `conversation-analysis-personas`) — same endpoint/ViewModel, rendered under
      the summary in the same sheet (no third header button): see the persona box below.
- [x] Conversation stats rings + activity-over-time chart + content-type / sentiment breakdown —
      **stats dashboard shipped 2026-08-21** (slice `conversation-stats-core`). The
      `ConversationMessageStatsResponse` model shipped orphaned (no consumer); this slice turns it
      real. Pure `ConversationStatsProjection` (`:core:model`, SSOT) derives the content-type
      breakdown from the server `ContentTypeCounts` (SOTA over iOS's client-side message re-count),
      the trailing-window activity series (`today` injected — deterministic, unlike iOS's
      wall-clock view getter), per-participant + per-language shares, and a 24-slot hourly
      histogram. `ConversationStatsRepository` (`:sdk-core`) fetches `GET /conversations/{id}/stats`;
      `ConversationStatsViewModel` + `ConversationStatsSheet` (`:feature:chat`) render it behind a
      new header `Insights` action (any member; period picker re-derives locally, no refetch).
      **AI-summary arm landed 2026-08-22** (slice `conversation-analysis-summary`, the
      `AI conversation analysis` box above — `GET /conversations/{id}/analysis` → health / tone /
      topics / emotions). **Sentiment three-way bar landed 2026-08-22** (slice
      `conversation-stats-sentiment-bar`) — the last open arm of this box. Pure `:core:model`
      `SentimentBreakdownProjection` (SSOT) scores the loaded message texts **on-device via the
      existing `SentimentAnalyzer`** (the composer's dictionary scorer, reused — no `NLTagger`
      equivalent needed) and collapses the seven-bucket `SentimentLevel` SSOT into positive /
      neutral / negative; SOTA over iOS on the sampling (deterministic even stride vs
      `shuffled().prefix(200)`) and the dominant tie-break (explicit positive ≥ neutral ≥ negative).
      `ConversationStatsViewModel` scores client-side at load (independent of the `/stats` fetch, so
      it survives a fetch failure); `ConversationStatsSheet` renders the three emoji/percent columns
      + a segmented success/warning/error bar. Strings en/fr/es/pt. Box now `[x]`. (The `AI
      participant persona` box below, same `/analysis` endpoint, shipped separately 2026-08-22.)
- [x] AI participant persona profiles + trait bars — **shipped 2026-08-22** (slice
      `conversation-analysis-personas`). The `ParticipantProfile`/`ParticipantTraits` model tree shipped
      orphaned (grep-confirmed zero consumers); this slice turns it real. Pure
      `ParticipantProfileProjection` (`:core:model`, SSOT) mirrors iOS's `agentParticipantProfilesSection`
      + `traitBarsView` + `traitScoreColor`: per-persona name (displayName › username › userId — a single
      seed for label AND colour, SOTA over iOS's `"?"`-vs-userId fork), a clamped-0..1 confidence percent
      (SOTA — iOS renders `Int(confidence*100)` raw), trimmed persona/tone/vocabulary, the four trait axes
      (communication/personality/interpersonal/emotional) each extracted by **explicit field access, not
      reflection** (SOTA over iOS's `Mirror`), clamped 0..100, **stably** sorted desc, top 4, with a
      GOOD≥70 / MID≥40 / LOW tier; deduped topics (top 3) / catchphrases (top 3) / emojis (top 6). Rendered
      **inside the existing `ConversationAnalysisSheet`** below the summary (the `ConversationAnalysisViewModel`
      now projects both halves of `/analysis`; Empty only when summary AND personas are both empty) — no
      extra header action, matching iOS's single dashboard. Strings en/fr/es/pt. +25 tests (projection ×22,
      ViewModel ×3), 2 mutation RED proofs. (The per-participant *activity* breakdown — message-count bars —
      is the stats sheet's busiest-participant list, shipped with `conversation-stats-core`.)
      **The stats dashboard's sentiment three-way bar shipped 2026-08-22** (slice
      `conversation-stats-sentiment-bar`); the conversation-analysis dashboard is now at full parity.

## D. Translation — Prisme Linguistique
- [~] Automatic per-user translation display (resolution: system → regional → custom → original) —
      **resolution SSOT extended to the Prisme étendu (2026-05-26) + BCP-47 normalisation**
      (slice `prisme-device-locale-priority`, 2026-07-20): the pure `:core:model` `LanguageResolver`
      already drove content-language resolution everywhere (bubbles, feed, stories, compose stamping)
      but encoded the **old** rule ("device locale must NEVER influence content language") and matched
      in-app codes only case-insensitively — so a BCP-47 pref (`"pt-BR"`) or an OS locale never resolved.
      This slice brings it to full parity with the shared TS SSOT (`resolveUserLanguage` in
      `packages/shared/utils/conversation-helpers.ts`) + the iOS mirror
      (`MeeshyUser.preferredContentLanguages`). New pure `:core:model` `LanguageCodeNormalizer` (faithful
      port of `normalizeLanguageCode` / `iso639ReductionMap`): reduces a raw locale identifier to the
      canonical translation-key code — supported 2-/3-letter codes preserved **verbatim** (`"bas"`→`"bas"`,
      never truncated to Bashkir `"ba"`), BCP-47 region/script stripped (`"fr-FR"`→`"fr"`, `"zh-Hant-HK"`→`"zh"`),
      ISO 639-2/639-3 reduced via an **explicit** table (`"eng"`→`"en"`, `"swe"`→`"sv"` **not** Swahili `"sw"`;
      639-2/B variants `ger`/`fre`/`chi` covered) with the target **re-validated** against the catalogue
      (`"orm"`→`"om"` dropped since `om` is not shipped), `"fil"`/`"tgl"` rejected (never `"fi"`), invalid
      input → `null`. `supportedCodeSet` derived from `LanguageData.allLanguages` (mirror of iOS
      `LanguageData.supportedCodeSet`). `LanguageResolver.ContentLanguagePreferences` gains
      `deviceLocale: String? get() = null` (all existing implementers unaffected); `resolveUserLanguage` +
      `preferredContentLanguages` fold the **normalised** deviceLocale in at **4th priority** — after every
      in-app pref, before the `"fr"` fallback, deduped case-insensitively — exactly like iOS (which normalises
      only the device locale, keeping in-app codes verbatim). `MeeshyUser` gains a decoded `deviceLocale`
      field (gateway persists `User.deviceLocale`), so the arm is live off the `/auth/me` contract.
      `preferredTranslation` inherits the 4th-priority arm for free. +25 behavioural tests
      (14 `LanguageCodeNormalizerTest` — every branch: verbatim 2-/3-letter, BCP-47 strip, 639-2/T + /B
      reduction, re-validation drop, `fil`-reject, unknown-2-letter preserve, all invalid-input rejections;
      +11 `LanguageResolverTest` — deviceLocale as 4th priority / normalised / beaten by each in-app tier /
      beats the `fr` fallback / unusable → `fr`, appended-last + case-insensitive dedup + omit-unusable in the
      ordered list, `preferredTranslation` matches through it, and a real `MeeshyUser.deviceLocale` drives it).
      Mutation (RED proof): dropping the reduction-target re-validation (`… && reduced in supportedCodeSet` →
      `… reduced`) fails **exactly** `normalize_rejectsReductionWhoseTargetIsNotSupported` (14 run, 1 failed,
      no collateral). `:core:model` + `:sdk-ui` + all feature-module `testDebugUnitTest` green; full
      `:app:assembleDebug` → BUILD SUCCESSFUL. **Follow-up:** app-side device-locale sourcing — inject
      `Locale.getDefault()` into the resolution context + send the `X-Device-Locale` header (iOS parity) so
      the gateway persists it; the pure resolution + API-decoded field are complete.
- [~] Original exploration: long-press → « Voir l'original / la traduction »
      (toggle par message, builder Prisme-aware) ; flag strip read-only shipped
      (slice `chat-translation-language-strip`, 2026-07-10) ; **tap-to-switch active language shipped**
      (slice `chat-language-flag-tap-switch`, 2026-07-10 — tap a flag to switch the bubble's primary
      displayed language, tap the active flag to revert; Android switches the single primary rather than
      iOS's stacked secondary panel) ; **on-demand translate of an absent language shipped**
      (slice `chat-on-demand-translate`, 2026-07-10 — a configured language with no content yet shows a
      dimmed "＋ translate" chip; tapping it blocking-translates and switches the bubble to it)
- [x] Message detail: per-language translation explorer + on-demand translate / retranslate —
      **strip projection done** (slice `chat-translation-language-strip`, 2026-07-10): pure `:sdk-ui`
      `MessageLanguageStrip.build(originalLanguage, translations, preferences, showingOriginal) →
      List<LanguageChip>` (port of iOS `BubbleContentBuilder.buildAvailableFlags`, enriched — each entry
      is a full `LanguageChip` carrying `LanguageData.info` metadata + `isOriginal`/`isActive`, and the
      active language is kept in the strip so the UI highlights it rather than hiding it as iOS does).
      Surfaces only the viewer's own languages (original + system/regional/custom that have content),
      never every language the message carries; returns **empty** when the message is not translated for
      the viewer (nothing to explore → no strip), when a preferred language has blank content, and on a
      deleted tombstone. Wired into `BubbleContent.languageStrip` via `BubbleContentBuilder.build`, and
      rendered as a discrete read-only flag strip under the bubble in `MessageBubble` (active chip shows
      its native name in the language accent colour via `LanguageData.colorHex` → `hexColor`). +16 tests
      (13 `MessageLanguageStripTest`, 4 `BubbleContentBuilderTest`). Full `assembleDebug` + all-module
      `testDebugUnitTest` → BUILD SUCCESSFUL. **tap-to-switch done** (slice `chat-language-flag-tap-switch`,
      2026-07-10): pure `:feature:chat` `LanguageFlagTapResolver.resolve` (port of iOS
      `BubbleLanguageFlagController.handleTap`) maps a tapped flag → Activate/Revert/RequestTranslation/None;
      `ChatViewModel.onFlagTap` applies it to a per-message `activeLanguageOverride` map; `BubbleContentBuilder`
      + `MessageLanguageStrip` gained an `activeLanguageCode`/`activeCodeOverride` param projecting the chosen
      language's text + active chip (falls back to the read-only default when unset). Tappable chips wired in
      `MessageBubble`/`ChatScreen`. +23 tests (10 `LanguageFlagTapResolverTest`, +3 `MessageLanguageStripTest`,
      +4 `BubbleContentBuilderTest`, +6 `ChatViewModelTest`). **on-demand translate done** (slice
      `chat-on-demand-translate`, 2026-07-10): `MessageRepository.requestTranslation` translate-and-merge +
      `ChatViewModel.requestOnDemandTranslation`. **detail explorer sheet done** (slice
      `chat-message-detail-explorer`, 2026-07-10): pure `:sdk-ui` `MessageDetailExplorer.build(...) →
      MessageLanguageExplorer` (Android's take on iOS `MessageLanguageDetailView` — surfaces the viewer's
      **configured** languages first, then the remaining candidates, rather than iOS's fixed 18-entry list).
      Each `LanguageExplorerRow` carries a truncated preview, `hasContent`/`isTranslating`/`isSelected` and a
      `canRetranslate` flag (content ∧ not-in-flight). `ChatViewModel` projects it reactively into
      `ChatUiState.languageExplorer` (rebuilds off the same cache stream + the in-flight `translatingLanguages`
      set now surfaced in state), reuses `onFlagTap` for select/translate and adds `onExplorerRetranslate`
      (forces a fresh translate even when content exists — a differing result re-renders live, an identical one
      is an inert repo no-op). Entry point: message-actions sheet → "Explore languages" opens
      `MessageLanguageExplorerSheet` (accent-coherent, natural single-sheet gesture). +31 tests (21
      `MessageDetailExplorerTest`, +10 `ChatViewModelTest`). Full `assembleDebug` + all-module
      `testDebugUnitTest` → BUILD SUCCESSFUL. **Follow-up:** audio-transcription banner (voice messages, needs
      attachment-transcription plumbing) and per-post/per-story explorer parity.
- [~] Per-post and per-story translation (flag strip, inline secondary, request missing languages) —
      **read-only flag strip shipped** (slice `feed-post-language-strip`, 2026-07-10): pure `:sdk-ui`
      `PostLanguageStrip.build(originalLanguage, translations, preferences, showingOriginal,
      activeCodeOverride, includeTranslatable) → List<LanguageChip>`, the post sibling of
      `MessageLanguageStrip`. Posts store translations as a language-keyed `Map<code, entry>` (vs. the
      message list form), so this adapts the map into `LanguageResolver.TranslationLike` rows and
      **delegates to `MessageLanguageStrip`** — one strip algorithm, no re-implementation (SSOT). The
      read-only default surfaces the post's original + each configured content language that actually
      has content; **empty** when the post is not translated for the viewer (Prisme rule 1: show the
      original, nothing to explore) — the same predicate that drives `ApiPost.isTranslated`, so the
      strip and the translated flag never disagree. Wired into `FeedPostBuilder`/`FeedPostPresentation`
      (`languageStrip` field, pure/testable) and rendered in `FeedScreen` as an accent-coherent chip
      strip (flag + active native name in the language accent colour) replacing the old binary
      "Translated" label. +15 tests (13 `PostLanguageStripTest`, +2 `FeedPostBuilderTest`). Full
      `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL.
      **Interactive language switch shipped** (slice `feed-post-language-switch`, 2026-07-11): the strip
      chips are now **tappable** — tap a chip to switch the post's displayed language, tap the active chip
      to revert to the default Prisme resolution (mirrors the chat bubble's single-primary switch, keyed
      per post). SSOT: the pure `LanguageFlagTapResolver` was **relocated `:feature:chat` → `:sdk-ui`**
      (`me.meeshy.ui.component.bubble`) so chat + feed share one flag-tap rule; `FeedPostBuilder` gained an
      override-aware `build(..., activeLanguageCode)` + `resolveActiveCode(post, prefs, override)` (both
      pure, unit-tested) driving content + strip highlight; `FeedViewModel` holds a per-post
      `activeLanguageOverride` StateFlow (kept outside the cache stream so the choice survives every
      refresh/re-emit — instant-app) + `onPostFlagTap`. +19 tests (+8 `FeedPostBuilderTest`, +5
      `FeedViewModelTest`, 10 relocated `LanguageFlagTapResolverTest` still green). `:sdk-ui` + `:feature:feed`
      + `:feature:chat` `testDebugUnitTest` + `:app:assembleDebug` → BUILD SUCCESSFUL.
      **On-demand request arm shipped** (slice `feed-post-translation-request`, 2026-08-21): the feed strip
      now passes `includeTranslatable = true`, so a configured-but-absent content language surfaces as a
      translatable chip (only when the post already carries a preferred translation — `MessageLanguageStrip`
      returns empty for an untranslated post regardless). Tapping it drives `FeedViewModel.onPostFlagTap`'s
      `LanguageFlagTapResolver.Result.RequestTranslation` arm (was a dead `Unit`) →
      `PostRepository.requestOnDemandTranslation(postId, target): Boolean` — the map-keyed sibling of
      `MessageRepository.requestTranslation`: blocking-translates the post's original text via `TranslationApi`
      and upserts the result into the in-memory feed cache through the new pure `PostTranslationMerge`
      (`:core:model`), so the card switches live off the cache stream + the `activeLanguageOverride` activates
      it. A failed/blank/idempotent translation leaves the chip in place to retry; a second tap while in
      flight is ignored (`FeedUiState.translatingLanguages`, keyed `postId|lang`, mirrors chat). +20 tests
      (+8 `PostTranslationMergeTest`, +8 `PostRepositoryTest`, +3 `FeedViewModelTest`, +1 `FeedPostBuilderTest`;
      mutation-proved ×2). Full `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL.
      **Post-detail request arm shipped** (slice `feed-post-detail-translation-request`, 2026-08-21):
      the full-screen post opened from the feed reused `FeedPostBuilder.build` (so its strip already passed
      `includeTranslatable = true`), but `PostDetailViewModel.onFlagTap` carried the dead `RequestTranslation
      -> Unit` arm — a translatable chip surfaced yet did nothing. That arm now calls a per-post
      `requestOnDemandTranslation` (in-flight guard via new `PostDetailUiState.translatingLanguages` /
      `PostDetailStatus.translating`): it blocking-translates through the new stateless
      `PostRepository.translatePost(post, target): ApiPost?` and — because the detail VM owns its post in
      `rawPost` outside the feed cache — swaps the freshly-merged post into `rawPost` + points `activeCode` at
      the new language, so the strip's translatable chip becomes a live content chip and the reader lands on
      it. `translatePost` and the cache-mutating `requestOnDemandTranslation` now share the single
      translate-then-`PostTranslationMerge` law (`translateAndMerge`); a failed/blank/idempotent translation
      leaves the strip untouched to retry; a second in-flight tap is ignored. +10 tests (+7 `PostRepositoryTest`
      for `translatePost`, +3 `PostDetailViewModelTest`; mutation-proved ×2 — in-flight guard, active-language
      switch). Full `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL (local, SDK 37 bootstrapped).
      **Comments request arm shipped** (slice `feed-comment-translation-request`, 2026-08-21): the comment
      strip now passes `includeTranslatable = true` (`CommentProjection.build` — it previously surfaced no
      request chip), and `PostCommentsViewModel.onCommentFlagTap`'s dead `RequestTranslation -> Unit` arm now
      calls a per-comment `requestCommentTranslation` (in-flight guard via new
      `PostCommentsUiState.translatingLanguages`, keyed `commentId|lang`, folded through the projection). It
      blocking-translates through the new stateless `PostRepository.translateComment(comment, target):
      ApiPostComment?` (the comment-keyed sibling of `translatePost` — both now share one `translateSource`
      network law + a `PostTranslationMerge.mergeTranslation(comment, …)` overload sharing the upsert law with
      the post one) and folds only the merged translations onto the live row via new
      `CommentThreadState.retranslated` / `CommentRepliesState.retranslated` (translations-only, so a concurrent
      realtime `replyCount` bump is never clobbered) — covering both top-level comments and loaded replies —
      then points `activeLanguages[commentId]` at the new language. Failed/blank/idempotent leaves the strip to
      retry; a second in-flight tap is ignored. +21 tests (+6 `PostTranslationMergeTest`, +7 `PostRepositoryTest`,
      +3 `CommentThreadStateTest`/`CommentRepliesStateTest`, +1 `CommentProjectionTest`, +4 `PostCommentsViewModelTest`;
      1 obsolete dead-arm test rewritten to the new contract; mutation-proved ×2 — in-flight guard, active-language
      switch). Full `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL (local, SDK 37 bootstrapped).
      **Comment realtime push merge shipped** (slice `comment-translation-updated-realtime-merge`, 2026-08-24 — the
      comment-keyed sibling of the `post-translation-updated-realtime-merge` slice, one rung over). Android had **no**
      handler for `comment:translation-updated`; the gateway translates a comment server-side and broadcasts the
      finished entry (`{ postId, commentId, language, translation:{text,translationModel?,confidenceScore?,createdAt?} }`),
      iOS folds it into the open thread via `PostDetailViewModel`/`FeedViewModel.applyCommentTranslation`, Android
      dropped it on the floor. New `SocketCommentTranslationUpdatedData` (reuses `ApiPostTranslationEntry` as its
      `translation` shape) + `SocialSocketManager.commentTranslationUpdated` flow wired to
      `listen("comment:translation-updated", …)`. New entry-preserving `PostTranslationMerge.mergeTranslation(comment,
      lang, entry): ApiPostComment?` overload (the comment sibling of the post entry overload, reusing the private entry
      upsert; the comment STRING overload dropped the model/confidence the push carries; metadata-only change is NOT a
      no-op). `PostCommentsViewModel.onCommentTranslationUpdated` subscribes, filters by `postId`, finds the comment
      (top-level or a loaded reply), merges the entry, and folds via the existing `thread.retranslated` /
      `replies.retranslated` reducers — **no `activeLanguages` override forced** (the reader did not tap; their own
      Prisme chain decides, parity with iOS and the post slice). +13 tests (7 pure comment-entry merge, 2 socket decode,
      4 vm: es-reader repaint of a top-level comment AND a loaded reply with no tap + inert for another post + inert for
      an unknown comment); RED-proof isolated ×3: neutering the comment entry merge reddened exactly the 4 transformation
      tests (3 no-op green), commenting the socket `listen` reddened the 2 socket tests, neutering the VM fold reddened
      exactly the 2 repaint tests (2 inert green). Full `meeshy.sh check` → BUILD SUCCESSFUL (local, SDK 37). No
      production logic outside `apps/android`.
      **Comment EDIT realtime merge shipped** (slice `comment-updated-realtime-merge`, 2026-08-24 — the edit sibling of
      the `comment:added`/`comment:deleted`/`comment:translation-updated` folds). Android had **no** handler for
      `comment:updated`; the gateway broadcasts the COMPLETE edited comment (`{ postId, comment: PostComment }`), iOS
      replaces the row in place via `FeedCommentsSheet.applyCommentEdit`, Android dropped it on the floor — an edited
      comment stayed stale until a full refetch. New `SocketCommentUpdatedData(postId, comment)` (mirror of iOS, nests
      the full `ApiPostComment`) + `SocialSocketManager.commentUpdated` flow wired to `listen("comment:updated", …)`. New
      `CommentThreadState.replaced(comment)` / `CommentRepliesState.replacedReply(reply)` reducers swap the whole row in
      place by id (adopt every field — content/effects/translations/counts — because the payload is complete; unlike
      `retranslated` which touches only `translations`). The heart lives in a separate `CommentLikeState` keyed by id, so
      a full-row swap never disturbs the viewer's like. `PostCommentsViewModel.onCommentUpdated` subscribes, filters by
      `postId`, and applies both reducers (each inert for the collection that doesn't hold the id). +9 tests (3
      `CommentThreadStateTest`, 3 `CommentRepliesStateTest`, 1 socket decode, 2 vm: repaint a top-level comment AND a
      loaded reply in place with no refetch + inert for another post + inert for an unknown comment); RED-proof isolated:
      neutering both reducers to `return this` reddened exactly the 5 transformation tests (193 completed, 5 failed), all
      inert/ignored tests green. Full `meeshy.sh check` → BUILD SUCCESSFUL (local, SDK 37). No production logic outside
      `apps/android`.
      **Story request arm shipped** (slice `story-viewer-translation-request`, 2026-08-21): the story viewer's
      language quick bar (`StoryViewerViewModel.availableLanguagesFor`) previously listed only present
      `StoryItem.translations`, so a configured-but-absent language was never requestable. It now appends each
      configured content language (`LanguageResolver.preferredContentLanguages`) absent from the present set as a
      translatable chip — gated on the story already carrying ≥1 translation (a pure-original story never dumps
      every preferred language) and on a real logged-in viewer. `StoryLanguageOption`/`LanguageQuickOption` gain
      `isTranslatable`/`isTranslating` (dimmed flag + "+" affordance, "…" in flight); `StoryViewerScreen` routes a
      translatable tap to the new `requestStoryTranslation(code)` (in-flight guard via `translatingLanguages` keyed
      `storyId|lang`), which blocking-translates through the new stateless `StoryRepository.translateStory(item,
      target): StoryItem?` (story-shaped sibling of `translatePost`; `TranslationApi` now injected) and folds via
      the new `:core:model` `StoryTranslationMerge` (list-keyed sibling of `PostTranslationMerge` — upsert into
      `List<StoryTranslation>`, blank/idempotent guards, in-place-or-append), then switches the Exploration
      `languageOverride` to the target so the slide re-renders even when a higher-priority language is already
      present. Failed/blank/idempotent leaves the strip to retry; a second in-flight tap is ignored. +21 tests
      (+8 `StoryTranslationMergeTest`, +7 `StoryRepositoryTest`, +6 `StoryViewerViewModelTest`; mutation-proved ×2 —
      in-flight guard, override switch). Full `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL
      (local, SDK 37 bootstrapped). **The `request-missing-languages` follow-up is now COMPLETE on every surface
      (feed card / post-detail / comments / story).**
- [ ] Persisted translations / transcriptions / audio translations (offline Prisme)
- [~] Real-time progressive translation/transcription socket updates — **text translations + transcription done**
      (slice `chat-live-translation-merge`, 2026-07-10): the dead `MessageSocketManager.translationCompleted`
      /`translationInProgress` flows (`message:translated`/`message:translation`) are now wired end-to-end.
      A message reaches the client in its original language; when the translator finishes, the gateway pushes
      the translation and Android upserts it **in place** into the cached message so the open bubble re-renders
      in the viewer's preferred language instantly — no refetch, no reload. Pure `:core:model`
      `MessageTranslationMerge.mergeTranslation(message, targetLanguage, translatedContent) → ApiMessage?` SSOT:
      upsert by language (case-insensitive, order preserved), append when absent; **no-op (→ null)** on a blank
      language/content (Prisme never stores an empty translation — mirrors `LanguageResolver`), a deleted
      tombstone (never resurrect a wiped translation), or an identical translation already present (idempotent).
      `:sdk-core` `MessageRepository.applyTranslation` applies it via `updateCachedMessage` (no outbox — inbound
      server truth) with a new `===`-guard that skips the redundant Room write on a no-op. `ChatViewModel`
      collects both flows, conversation-scoped. Both in-progress and completed events funnel through the same
      merge, so partial translations stream in progressively and the final one converges.
      +23 tests (15 `MessageTranslationMergeTest`, 4 repo, 3 VM, 1 elsewhere-ignored). Diff = `apps/android` only.
      **Transcription** done too (slice `chat-live-transcription-merge`, 2026-07-10): the dead
      `MessageSocketManager.transcriptionReady` flow (`transcription:ready`) is now wired the same way. A voice
      note reaches the client before Whisper finishes; when the transcription lands the gateway pushes it and
      Android upserts it onto the matching cached audio attachment — the open audio bubble shows its transcription
      instantly (`BubbleContentBuilder.resolveTranscription` already reads `attachment.transcription`, so no UI
      change). Pure `:core:model` `AttachmentTranscriptionMerge.mergeTranscription(message, attachmentId?, text,
      language?, confidence?, durationMs?) → ApiMessage?` SSOT: target = the attachment with `attachmentId`, or
      (blank id) the first audio attachment (single-voice-note case); replace its `transcription` in place,
      order preserved. **No-op (→ null)** on a blank text (Prisme never stores an empty transcription), a deleted
      tombstone, no matching/audio target, or an identical transcription already present (idempotent, language
      matched case-insensitively). +23 tests (17 `AttachmentTranscriptionMergeTest`, 4 repo, 2 VM).
      **Audio-voice translation** done too (slice `chat-live-audio-translation`, 2026-07-10): the dead
      `MessageSocketManager.audioTranslationReady` flow (`audio:translation-ready`) is now wired end-to-end —
      it never even decoded before, because the Android `AudioTranslationEvent` was **flat**
      (`targetLanguage`/`audioUrl`) while the gateway nests the payload under `translatedAudio` with the target
      language at the top-level `language` (every frame threw `MissingFieldException` and was dropped). Reshaped
      the event to the real `AudioTranslationEventData` shape (lenient blank defaults so a malformed frame is
      dropped by the merge no-op, not a decode throw). Pure `:core:model`
      `AttachmentAudioTranslationMerge.mergeAudioTranslation(message, attachmentId?, language, url, transcription,
      durationMs?, format?, cloned, quality?, voiceModelId?, ttsModel?) → ApiMessage?` SSOT (sibling of
      `AttachmentTranscriptionMerge`): upserts the cloned-voice `ApiAttachmentTranslation` into the target audio
      attachment's `translations` map (case-insensitive key, order preserved). **No-op (→ null)** on a deleted
      tombstone, a blank language, a **blank url** (never store an unplayable audio translation), no matching/audio
      target, or an identical entry already present (idempotent). `:sdk-ui`
      `BubbleContentBuilder.resolveTranslatedAudio` + `BubbleAudio.isAudioTranslated`/`audioLanguage` project the
      preferred-language cloned voice as the played `url` (the original voice wins when it is the top preference),
      mirroring `resolveTranscription` so the played voice and the surfaced transcription line resolve to the same
      language — Android plays the viewer's-language voice by default (iOS defaults to the original + manual pick).
      `:sdk-core` `MessageRepository.applyAudioTranslation` applies it via `updateCachedMessage` (no outbox —
      inbound server truth); `ChatViewModel` collects the flow, conversation-scoped. +37 tests
      (18 `AttachmentAudioTranslationMergeTest`, 2 `AudioTranslationEventTest` decode-contract, 8
      `BubbleContentBuilderTest`, 4 repo, 2 VM, +3 wiring). Diff = `apps/android` only.
- [x] Ad-hoc blocking text translation — **stale checkbox, RE-PROUVEN 2026-08-11**: already fully
      shipped. iOS's own `/translate-blocking` on-demand mechanism (`MessageLanguageDetailView.
      translateTo`, `TranslationService.shared.translate(messageId:)` — passing `messageId` routes
      the gateway into its "retranslation" branch, which persists AND broadcasts via
      `message:translation`) has a direct Android counterpart:
      `ChatViewModel.onExplorerRetranslate(messageId, code)` → `requestOnDemandTranslation` →
      `MessageRepository.requestTranslation(messageId, targetLanguage)` — a real, synchronous
      (`suspend fun`) REST call (`translationApi.translate(...)`) that persists the result,
      exactly mirroring the "blocking" semantics. Wired from `MessageDetailExplorer`'s per-language
      retranslate affordance in the same long-press → "Explore languages" sheet root `CLAUDE.md`
      documents as the sole translation-exploration entry point. Fully tested: 7
      `MessageRepositoryTest` cases (success, translator failure, unknown/deleted message, blank
      target, blank result ignored, idempotent-on-match) + ~10 `ChatViewModelTest` cases (success,
      failure, in-flight double-tap guard, unknown-message no-op, blank-target no-op). No code
      change needed this run — just the checkbox.
- [x] Source-language stamping from in-app prefs (NEVER device locale) — **done**
      (slice `chat-compose-language-detection`, 2026-07-10): `ChatViewModel.send()` stamped
      `originalLanguage = user.systemLanguage ?: "fr"` — doubly wrong: it ignored the Prisme
      resolution chain (a regional/custom-only user's outgoing text was mis-stamped `fr`) and never
      looked at what the user actually typed. New pure `:core:model`
      `ComposeLanguageDetector.detect(text, fallback) → String` — a faithful port of the shared web
      heuristic (`apps/web/utils/language-detection.ts` `detectLanguage` script/stopword scoring,
      wrapped by `detectComposeLanguage`'s guards: strip URLs, require ≥4 Unicode letters, pick the
      highest-scoring language, else fall back). `send()` now stamps
      `detect(text, fallback = LanguageResolver.resolveUserLanguage(user))`, so the language is
      **detected from the composed text** with the sender's resolved content language
      (system → regional → custom → `fr`, NEVER device locale) as the fallback. The result is always
      a `LanguageData`-supported code or the fallback. iOS uses `NLLanguageRecognizer` and web uses
      `tinyld`; neither is a pure JVM dependency, so Android ports the documented hand-rolled
      heuristic. The forward path (preserving the *source* message's language) is untouched. +19 tests
      (17 `ComposeLanguageDetectorTest` covering fr/es/de/it/pt/ru/ar/zh/ja/ko detection + blank /
      below-min-alpha / URL-only / unrecognized-Latin / case-insensitive / higher-score-wins /
      supported-invariant, +2 `ChatViewModelTest` for detected-stamp and regional-fallback). Full
      `assembleDebug` + all-module `testDebugUnitTest` green. Diff = `apps/android` only.
- [x] Per-language flag / native name / colour metadata (~80 languages) — **done**
      (slice `translation-language-catalog`, 2026-07-10): `LanguageData` (`:core:model`) is now the
      full iOS-parity SSOT. Added the missing **Catalan** (`ca`) entry, derived `interfaceLanguages`
      from `interfaceLanguageCodes` over the base table (no hand-copied flag/colour drift), added the
      `commonLanguageCodes` + `allLanguagesCommonFirst` common-first ordering (a permutation — nothing
      dropped/duplicated), and made `info(code)` **trim + case-insensitive + alias-aware** (`fil` → `tl`)
      returning `null` on blank/unknown. Converged the consumers off their local workarounds:
      `ProfileDetailRows` drops its `info(code.lowercase())` hack, `RegionalLanguageSelection` sources
      options from `allLanguagesCommonFirst` and resolves the selected label via the robust `info` (its
      re-implemented `equiv` label lookup removed), and the `ProfileScreen` content-language picker leads
      with the common set. +14 pure `LanguageDataTest` cases (uniqueness/lowercase, non-blank metadata,
      Catalan present, exact/case-insensitive/trimmed/alias/unknown/blank lookup, derived-interface-no-drift,
      common-first permutation + leading order + membership) and +2 `RegionalLanguageSelectionTest`
      (common-first order, alias label). RED verified by stubbing (identity ordering + empty aliases →
      the two behavioural cases fail; restore → green). Diff = `apps/android` only.

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
      size/outline/RTL/fade.
      **Background (none/solid/glass) done** (`story-text-element-background`): a pure sealed
      `StoryTextBackground` (`None` / `Solid(hex)` / `Glass(radius)`) with the tagged-union wire mapping in
      one unit-tested place — `toStyleWire()` → gateway `StoryTextBackgroundStyle` `{type,hex?,radius?}`, with
      `None`→absent (minimal payload, gateway reads null as none) mirroring iOS's `textBg` purge.
      `StoryTextBackgroundPresets.all` mirrors the iOS preset order/values (None, Glass(24), then the 10
      solids) as the single ordered source both the picker chips and the pure `next()` tap-cycle read.
      `StoryTextElement.background` (defaulted `None`) rides through `toTextObject.backgroundStyle`; the VM's
      `onTextElementBackground` (inert on unknown id, selection untouched) mirrors the style/color/align
      wrappers. `TextElementLayer` paints the backing behind the glyphs (solid fill / frosted glass scrim /
      none), and a `BackgroundSwatch` chip row joins the `TextStyleToolbar`. +14 tests (8 model+presets+wire,
      4 element defaults+wire, 2 VM).
      **Outline/stroke done** (`story-text-element-outline`): a pure `StoryTextOutline` `(width, color?)` pair
      (flat, not sealed — iOS keeps the chosen colour across a zero width so re-thickening never re-asks) plus a
      `StoryTextOutlineCycle.advance` that mirrors iOS `StoryTextAttributeCycle.advance(.border)` exactly: the
      discrete thicknesses `[2,4,8,12]` thin→thick, one tap advances to the next HIGHER step (a between-steps
      width jumps up, never thins), wraps past the thickest back to no-stroke, and posts the default white the
      first time a stroke leaves zero uncoloured. `StoryTextElement.outline` (defaulted no-stroke) rides through
      `toTextObject` → `borderColor`/`borderWidth` (both omitted while width is 0, so a retained colour never
      leaks onto the wire without a width). The VM's `onTextElementCycleOutline` (inert on unknown id, selection
      untouched) advances one tap; a `BorderColor` toolbar button (tinted when a stroke is visible) drives it,
      and the canvas paints a stroked underlay of the same glyphs beneath the fill. +17 tests (10
      model+cycle, 4 element defaults+wire, 3 VM); mutation-RED-proven (nulling the wire / dropping the
      white-post fails exactly the 3 positive tests). Pending: RTL/fade.
      **Size done** (`story-text-element-font-size`): a pure `StoryTextSize` enum ladder
      (`SMALL 64` / `MEDIUM 96` / `LARGE 140` / `XLARGE 200` design units, 1080-referential) with the
      default at the **iOS-parity birth size 96** — Android text previously leaked the wire default
      `64.0` because `toTextObject` never set `fontSize`, so a caption rendered ~⅓ smaller than iOS
      (fresh iOS text is 96). `StoryTextSizeCycle.next` wraps largest→smallest (no "off" step — text
      always has a size), the single ordered SSOT the tap and any future picker share.
      `StoryTextElement.size` (defaulted `MEDIUM`) rides through `toTextObject.fontSize`; the effective
      on-screen size is `designSize × scale`, mirroring iOS's `fontSize × scale` (Android keeps the pinch
      on the separate `scale` multiplier). The VM's `onTextElementCycleSize` (inert on unknown id,
      selection untouched) advances one tap; a `FormatSize` toolbar button (tinted when non-default)
      drives it, and the canvas previews the size in sp. +11 tests (5 size model+ladder+cycle, 3 element
      defaults+wire, 3 VM); mutation-RED-proven (dropping the wire `fontSize` fails exactly the 2 fontSize
      tests; a no-advance cycle fails exactly the 4 cycle tests). Pending: RTL.
      **Fade timing done** (`story-text-element-fade-timing`): a pure `StoryTextFade` `(inSeconds, outSeconds)`
      flat pair (the two ends are independent, exactly as iOS binds `fadeIn`/`fadeOut` to two separate
      `StoryTextEditorView` controls) plus `StoryTextFadeCycle.advance` — a tap-friendly form of the iOS
      `0…5 s` slider: discrete durations `[0.5,1,2,3,5]` short→long, one tap advances to the next HIGHER step
      (a between-steps value jumps up, never shortens), wraps past the longest back to no-fade; every step stays
      within the iOS-accepted `0…5 s` range. `StoryTextElement.fade` (defaulted no-fade) rides through
      `toTextObject` → `fadeIn`/`fadeOut`, each omitted while its end is 0 (the value iOS folds to `nil`). The
      VM's `onTextElementCycleFadeIn`/`onTextElementCycleFadeOut` (inert on unknown id, selection untouched, each
      advancing only its own end) drive it; two toolbar buttons (Login/Logout icons, tinted when that end fades)
      sit in a now-horizontally-scrollable style row. +20 tests (10 model+cycle, 5 element defaults+wire, 5 VM);
      mutation-RED-proven (nulling the wire `fadeIn` / a no-op `advance` fail exactly the projection & cycle
      tests, 10 total).
      **RTL / writing direction done** (`story-text-element-rtl-direction`): the last named text-element
      attribute. iOS derives a text object's direction from its content at render time — the wire
      `StoryTextObject` has NO direction field (confirmed: `textAlign` is the only alignment-ish field), so
      every client re-derives it and it never rides the wire. Android now matches: a pure `StoryTextBidi`
      `resolveBaseDirection(text) -> StoryTextDirection` (LTR/RTL) implementing the **Unicode Bidi Algorithm
      P2/P3 "first strong character" rule** — scan for the first strong character (skipping neutrals,
      whitespace, digits, punctuation, and the whole content of any directional isolate LRI/RLI/FSI…PDI) and
      take RTL iff it is R or AL; no strong character defaults LTR. `Character.getDirectionality` (the JDK's
      UBA table) is the classification SSOT, so Arabic/Hebrew/Adlam (incl. supplementary-plane, surrogate
      pairs) and the strong marks LRM/RLM/ALM all resolve correctly. `StoryTextElement.baseDirection` is a
      DERIVED property (no stored field, `toTextObject` untouched — honest parity, no dead wire field), and
      the canvas glue sets `TextStyle.textDirection` from it on both the stroked underlay and the fill, so an
      Arabic caption lays its paragraph out right-to-left instead of the previous forced LTR. No VM intent —
      direction follows the text automatically, exactly as iOS derives it (no false manual override that
      couldn't persist). +20 tests (17 `StoryTextDirectionTest`, 3 element `baseDirection`);
      mutation-RED-proven twice (RTL branch→LTR fails exactly the 9 RTL-detection tests; removing the
      isolate-skip guard fails exactly the 2 isolate tests). **§E text-element attribute parity now complete**
      (style, colour, size, alignment, background, outline/stroke, fade, RTL).
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
      truncation still caps the batch. **Wire-format bug fixed** (slice `story-media-tus-upload`,
      2026-08-10): the upload foundation above sent every picked media through `MediaApi`/
      `MediaRepository` (`POST /attachments/upload`), which server-side ALWAYS creates a
      `MessageAttachment` row (`services/gateway/src/services/attachments/UploadProcessor.ts`) —
      never a `PostMedia` row. But `CreateStoryRequest.mediaIds` is claimed **exclusively** against
      `PostMedia` (`prisma.postMedia.updateMany`, `services/gateway/src/services/PostService.ts` +
      `mediaOwnership.ts`'s `claimableMediaWhere`), a structurally different collection/id-space —
      only the gateway's TUS handler (`POST /api/v1/uploads`, `uploadcontext` metadata one of
      `post`/`story`/`status`/`comment`) ever creates one. So every published story with a
      picked photo/video silently published **without its media**: the upload itself succeeded,
      the story published successfully, but the server-side claim matched zero rows (logged as a
      shortfall, never thrown) — a real, user-visible production defect, not a missing feature.
      New `TusApi`/`TusUploadRepository` (`:core:network`/`:sdk-core`) implement a **single-shot**
      (no chunking/resume/checkpoint — sufficient for compressed images; large-video chunked upload
      remains the tracked TUS follow-up two lines below and at §Q) port of iOS `TusUploadManager`'s
      two-call exchange (`POST` create session reading the `Location` header via the new
      `:core:network` `headerCall` helper, then one `PATCH` of the whole body at `Upload-Offset: 0`).
      `StoryMediaUploader` (`:feature:stories`, binds the generic repository to
      `TusUploadContext.STORY` — the SDK-purity "which context" product decision) replaces
      `StoryComposerViewModel`'s eager `mediaRepository.upload` call; the **durable offline-retry
      path** ( `MediaUploadQueue.enqueue`'s new optional `context` param, persisted via
      `MediaUploadPayload` on the `UPLOAD_MEDIA` outbox row and read back by
      `OutboxFlushWorker`'s sender) is fixed too, so a queued-while-offline story upload retried
      later also produces a real `PostMedia` row — not just the common online path. Chat
      attachments are untouched (still `MediaRepository`/`MessageAttachment`, correctly — messages
      legitimately want that collection); a legacy/blank outbox payload (any row enqueued before
      this fix) still decodes as "no context" and keeps using the old path, so nothing already
      queued on a user's device breaks on upgrade. +30 tests across the chain (6
      `TusUploadMetadataTest`, 2 `TusUploadContextTest`, 4 new `headerCall` tests in
      `ApiCallTest`, 13 `TusUploadRepositoryTest`, 2 `StoryMediaUploaderTest`, 2 new
      `MediaUploadQueueTest`, +1 precise `StoryComposerViewModelTest` proving the durable path is
      tagged `TusUploadContext.STORY` and not just `any()`); the other ~130 pre-existing
      `StoryComposerViewModelTest` cases needed only a mechanical mock-type rename
      (`MediaRepository` → `StoryMediaUploader`, same `upload(items)` shape) since
      `StoryMediaUploader.upload` preserves the exact `NetworkResult<List<UploadedMedia>>`
      contract the ViewModel's existing (unchanged) decision logic already expected. Mutation-proven:
      reverting `queueDurably`'s explicit `context = TusUploadContext.STORY` argument fails
      **exactly** the one new precise test, the other 130 stay green; making `TusUploadRepository.
      uploadAll` swallow a mid-batch failure instead of stopping fails **exactly** the one test
      built to catch it, the other 12 stay green. **Gate:** `./apps/android/meeshy.sh check` →
      `BUILD SUCCESSFUL` (970 tasks, full `assembleDebug` + all-module `testDebugUnitTest`).
      **Still open** (unchanged from before this fix, now correctly scoped as follow-ups rather
      than assumed-simple): chunked/resumable large-video TUS upload (see §Q and the two `[ ]`
      TUS lines above/below this one), on-canvas crop/edit, and — the original "attachments
      fast-follow" this fix was discovered while scoping — wiring a photo/camera picker into the
      still-text-only Feed post composer (`feed-post-composer-text`, 2026-08-10) now correctly
      depends on this same `TusUploadRepository`/`TusUploadContext.POST` building block rather
      than the `MediaRepository` pipeline the routine had assumed reusable.
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
- [~] Backgrounds: random pastel, colour/gradient palette, image, looping/non-looping video
      **Reader-side colour/gradient done** (`story-slide-background-value`): the viewer honoured a
      slide's background MEDIA (image/video) but IGNORED `StoryEffects.background` — the serialised
      colour backdrop — so a text-only iOS/backend story published with a solid colour or a
      `gradient:RRGGBB:RRGGBB` two-colour gradient rendered on Android as the generic accent→black
      fallback, silently dropping the author's chosen backdrop (a real, user-visible parity gap). A pure
      `StoryBackgroundValue` (`:core:model`, sealed `Hex(hex)` / `Gradient(start,end)`) ports the iOS
      SSOT `StoryBackgroundValue.parse` (`packages/MeeshySDK/.../Models/StoryBackgroundValue.swift`)
      exactly: `gradient:` prefix + exactly two six-digit hex colours → `Gradient`, everything else decays
      TOLERANTLY to `Hex(rawWhole)` so the renderer keeps its solid-colour path (iOS's historical
      invalid-value behaviour). Interior empty colour runs are dropped to match Swift
      `split(separator:)` (`omittingEmptySubsequences`) — Kotlin's `split` keeps them, so the port
      filters, and that filter is mutation-proven load-bearing. `StoryViewerViewModel.toSlideView`
      projects `StorySlideView.background` once (null when the slide carries no/blank background string,
      preserving the accent→black fallback); the viewer's no-media branch paints a solid colour or a
      top-leading→bottom-trailing `linearGradient` (iOS `storyBackgroundStyle` convention), reusing the
      `hexColor` SSOT and falling back gracefully when a degraded hex cannot resolve (never blank). +18
      tests (14 `StoryBackgroundValueTest` covering every parse branch + serialise round-trips, 4 VM
      projection: gradient/solid/absent/blank). Mutation-RED-proven twice (neutering the gradient branch
      reddens exactly the 4 gradient tests; dropping the empty-filter reddens exactly the parity test;
      neutering the projection reddens exactly the 2 positive VM tests). **Composer AUTHORING of a
      colour/gradient/random-pastel backdrop done** (`story-composer-slide-background`): a pure
      `StoryBackgroundPalette` (`:core:model`) ports the iOS SSOT
      (`packages/MeeshySDK/.../MeeshyUI/Story/StoryComposerSupportTypes.swift`) — the 17 preset solids, the
      6 gradient pairs, and `randomPastelHex(Random)` (injectable RNG, pure HSB→hex, low-saturation
      high-brightness pastel that never collides with a preset). `StorySlide`/`StoryComposerDraft` carry a
      `StoryBackgroundValue?`; `StorySlideDeck.setSelectedBackground` writes it per-slide (inert on equal,
      clears on null); the draft serialises it to `effects.background` via `StoryBackgroundValue.serialized`;
      the Effets band renders a swatch picker (presets + random pastel + None) reusing the reader's
      `hexColor` SSOT so swatch = publish. +23 tests (10 palette incl. primary-hue/grey-ramp conversion +
      pastel brightness/saturation bands + preset-avoidance; 7 deck set/clear/inert/selection; 4 draft
      serialise incl. gradient wire form + effects-materialisation; 3 VM intent/publish). Mutation-RED-proven
      (neutering `hsbToHex` reddens exactly the 4 conversion tests; neutering the inert guard reddens exactly
      the 2 inert tests). **Looping/non-looping background VIDEO designation done**
      (`story-composer-background-video-loop`): before this the composer hard-coded `loop = true` on every
      designated background — the author could not publish a background video that plays ONCE. Ports iOS's
      `ClipInspector.supportsLoop` semantics (looping is a VIDEO/audio-background affordance, never an image's).
      `StoryBackgroundMedia.loop` (default true) is honoured only for a video — `toMediaObject()` emits
      `loop = if (isVideo) loop else true` so a stale `loop = false` never rides onto an image object (the
      reader's image branch is unconditionally looping, its video branch reads `backgroundObject?.loop ?: true`).
      `StorySlide.backgroundLoop`; `StorySlideDeck.setSelectedBackgroundLoop` (inert with no designated
      background or on equal value) + `selectedSlideBackgroundLoop`; a FRESH designation
      (`toggleSelectedBackgroundMedia`) and a background-clearing `removeMedia` both RESET loop to the default,
      so no stale off-state leaks to a new background. VM `onSetSlideBackgroundLoop` + derived
      `selectedSlideBackgroundIsVideo`/`selectedSlideBackgroundLoop`; the resolver carries the slide's loop onto
      publish. A `Loop` toggle badge appears on the designated-background thumbnail **only when it is a video**
      (the control is never a no-op), localised en/fr/es/pt. +13 tests (7 deck default/set/inert×2/only-selected/
      reset-on-redesignate/reset-on-remove; 2 draft video-loop-false + image-always-loops; 4 VM
      intent/publish-loop-false/is-video-derivation). Mutation-RED-proven (forcing `loop = true` in
      `toMediaObject` reddened EXACTLY the 2 loop-false tests while image-always-loops stayed green).
      **Reader honours a background IMAGE's framing transform done** (`story-viewer-background-media-transform`):
      the viewer previously drew any background image as a plain `ContentScale.Crop` fill, silently dropping the
      pan/zoom framing an iOS/web/backend author put on the background `StoryMediaObject` (`x`/`y`/`scale`/
      `rotation`) — a real cross-client parity gap (a story framed on iOS rendered un-framed on Android). A pure
      `StoryBackgroundObjectTransform.from(StoryMediaObject)` (`:feature:stories`) ports iOS's render conversion
      exactly (`StoryCanvasUIView+Rendering.swift`): aspect-fill base, then `scale` + a pixel offset FROM CENTRE
      `((x-0.5), (y-0.5))` kept as canvas FRACTIONS (resolution-independent) + `rotation`, ignoring `anchor`/
      `aspectRatio` (background-only, unlike a foreground object). Decays TOLERANTLY — a non-finite/non-positive
      `scale` → neutral 1×, a non-finite position/rotation → its neutral component — so a malformed object never
      blanks or inverts the slide. `StoryViewerViewModel.resolveBackgroundMedia` projects it onto
      `StorySlideView.backgroundTransform` for an IMAGE background only (the transform rides only on a modern
      `isBackground` object whose own URL is what renders; a legacy/flat fallback keeps IDENTITY); the viewer's
      image branch applies it via `graphicsLayer` (offset fractions × measured `size`, clipped by the frame,
      mirroring iOS's "zoom inside the background"). +14 tests (10 `StoryBackgroundObjectTransformTest` pure
      conversion incl. every decay branch; 4 VM projection: framed image / default-framed image / video / no-bg).
      Mutation-RED-proven twice (dropping the `-0.5` centre offset reddened EXACTLY the 4 offset tests while
      scale/rotation stayed green; forcing the VM projection to IDENTITY reddened EXACTLY the framed-image test).
      **Composer AUTHORING of a background IMAGE's framing done** (`story-composer-background-image-transform`):
      closes the author→reader loop the reader slice opened. The composer already persisted the background's
      pan/zoom as a per-slide `StoryCanvasTransform` (viewport **pixels**: scale + offsetX/Y px) but published the
      background object with the bare `x`/`y`/`scale` defaults — a story framed by an Android author rendered
      un-framed on every client (including Android's own reader). A pure `StoryBackgroundFraming` value + the
      conversion `StoryCanvasTransform.toBackgroundFraming(w,h)` project the pixel offset onto the wire's
      **normalised** coordinates (`x = 0.5 + offsetX / canvasWidth`), the exact inverse of the reader's
      `StoryBackgroundObjectTransform.from` — proven by a round-trip test. Total on a degenerate input (a
      not-yet-measured/non-finite canvas → centred axis; non-finite offset → centre; non-finite/non-positive
      scale → 1×). The wrinkle NOTES flagged — the canvas width isn't retained in the VM — is closed by capturing
      the measured size in `onCanvasTransform` (the sole producer of a non-identity transform, so the size that
      made the offset is always the size that inverts it); it rides on `StoryComposerUiState.canvasWidthPx/HeightPx`.
      `StoryBackgroundMedia.framing` is honoured **only for an image** (a video keeps IDENTITY — the reader's video
      render path is still the scoped-out follow-up); and only when the designated background IS the media the canvas
      frames (its first resolved attachment), so a pan applied to one image never mis-frames a differently-designated
      background. +14 tests (11 `StoryBackgroundFramingTest` pure conversion incl. every degrade branch + isIdentity
      + reader round-trip; 3 draft image-framed/image-default/video-ignores; 4 VM publish framed/unframed/
      designated≠framed/video). Mutation-RED-proven ×3 (forcing `x=0.5` reddened exactly the offset+round-trip tests;
      dropping the image-only guard reddened exactly the 2 video tests; neutering the designated-vs-framed guard
      reddened exactly that 1 test). **Reader honours a background VIDEO's framing transform done**
      (`story-viewer-background-video-transform`): closes the scoped-out follow-up the two prior slices named — the
      last cross-client parity gap in §E backgrounds. Before this the viewer drew any background video through a
      plain fill, silently dropping the pan/zoom/rotation an iOS/web/backend author placed on a background VIDEO
      `StoryMediaObject` (a video framed on iOS rendered un-framed on Android). `StoryViewerViewModel.resolveBackgroundMedia`'s
      video branch now projects the same pure `StoryBackgroundObjectTransform.from` onto `StorySlideView.backgroundTransform`,
      gated on the object's OWN `mediaURL` producing the resolved url (a legacy/flat fallback video keeps IDENTITY —
      the framing never steals an unrelated fallback item's pixels); the viewer's video branch applies it to the
      `ReelVideoSurface` via `graphicsLayer` (offset fractions × measured `size`, `rotationZ`, clipped by the 9:16
      frame), the exact mirror of the image branch. The pure conversion is reused unchanged (already fully covered).
      +4 tests (video framed → x=0.3/scale=2.0; video default → IDENTITY; legacy video-only → IDENTITY; background
      video object with null own-url + fallback video → IDENTITY, guard). Mutation-RED-proven (forcing the video
      branch back to IDENTITY reddened EXACTLY the one framed-video test while the three IDENTITY-expecting tests
      stayed green). **Composer AUTHORING of a background VIDEO's framing done**
      (`story-composer-background-video-transform`): closes the last open piece of §E "Backgrounds" — the WRITE half
      the reader-video slice above opened. The VM's `resolveBackgroundFraming` already projected the canvas pan/zoom
      onto ANY designated background (type-agnostic); the only remaining gap was `StoryBackgroundMedia.toMediaObject`,
      which still forced IDENTITY for a video (the framing was a wire value no reader honoured while the reader video
      path kept IDENTITY). Now that the reader honours a background video's `x`/`y`/`scale`, `toMediaObject` emits the
      author's `framing` for a video exactly as for an image; `loop`/`intrinsicDuration`/`duration` stay video-only and
      ride alongside the framing unclobbered. +3 tests replacing/adding around the old `video ignores framing` cases
      (draft: video carries framing incl. loop+duration regression, unframed video → centred defaults; VM: publish a
      panned+zoomed video background carries `x=0.5+200/1080`, `y=0.5+100/1920`, `scale=2.0`, loop=true). Mutation-RED-
      proven (re-introducing the `if (isVideo) IDENTITY` guard reddened EXACTLY the two framed-video tests while the
      unframed-video test and every other suite stayed green). §E Backgrounds is now closed author→reader on both
      image and video.
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
      iOS, whose snapping has no per-axis guide overlay here. +25 tests (18 resolver, 7 VM).
      **Frosted-glass / solid text backdrops READER done** (`story-viewer-text-backdrop`): the composer
      already AUTHORED a text element's backing (`StoryTextElement.background` → `toTextObject` writes the
      `backgroundStyle` tagged union) and painted it live on the composer canvas, but the VIEWER dropped it
      entirely — `StoryTextObjectProjection.project` never resolved `backgroundStyle`/`textBg`, so an
      iOS/web/backend-authored `.solid(hex)` or `.glass(radius)` text backdrop rendered on Android as plain
      floating glyphs (a real cross-client parity gap). A pure `StoryTextBackground.resolve(backgroundStyle,
      textBg)` ports iOS `StoryTextObject.resolvedBackgroundStyle` exactly (priority: modern `backgroundStyle`
      > legacy `textBg`→Solid > None — the modern style wins even when it resolves to None, suppressing a
      stale legacy hex), decoding TOLERANTLY (a Solid with no usable hex / an unknown `type` / a blank legacy
      hex → None; a Glass with an absent/non-finite/non-positive radius keeps the glass intent and clamps the
      sigma to `DEFAULT_GLASS_RADIUS`). `project()` resolves it once onto `StoryTextObjectView.background`;
      the viewer's `StoryTextObjectLayer` paints the backing behind the glyphs (rounded solid fill honouring
      an 8-digit alpha hex, translucent frosted scrim for glass), mirroring the composer's own `storyTextBacking`
      so author and reader agree on the look. +19 tests (14 `StoryTextBackgroundTest.resolve` covering every
      priority + tolerant-decay branch + a toStyleWire round-trip; 4 projection: none/glass/solid/legacy;
      +1 net accounting). Mutation-RED-proven twice (dropping the projection's resolution reddened EXACTLY the
      3 non-None projection tests while the None test stayed green; dropping the glass radius guard reddened
      EXACTLY the 2 non-positive/non-finite tests while the missing-radius test stayed green). Pending on this
      line: persistent safe-zone overlay grid.
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
- [~] Per-element + per-slide duration; background designation toggle (1 visual + 1 audio/slide) —
      **per-slide duration RESOLUTION done** (slice `story-viewer-slide-duration`, 2026-08-25): the
      viewer honours the author-pinned/content-derived slide duration via the pure `StorySlideDuration`
      SSOT (see the auto-advance item below). **Per-slide duration AUTHORING done** (slice
      `story-composer-slide-duration-pin`, 2026-08-25): the composer's Effets band carries a "Slide
      duration" slider that pins the selected slide's duration; the pure `StoryDurationPin.clamp`
      (`[2, 600]`s, iOS `currentSlideDuration` parity) bounds it, `StorySlideDeck.setSelectedDuration`
      writes the per-slide pin, and it serialises to `effects.timelineDuration` on publish — the very
      field the viewer SSOT already honours over content. The slider's live value falls back to the
      content-derived `StorySlideDuration` when unpinned. **Per-element timing-window RESOLUTION done**
      (slice `story-element-timing-window-gate`, 2026-08-25): the viewer now honours a timed element's own
      `[startTime, startTime + duration)` visibility window — the pure `StoryElementVisibility.isVisible`
      ports iOS `StoryRenderer.shouldRender(item:at:mode:)`, a **sharp** play-mode on/off gate (inclusive
      start, exclusive end; the smooth ramp stays in `StoryMediaFadeResolver`). Both `StoryTextObjectView`
      and `StoryForegroundMediaView` expose `isVisible(atSeconds)` delegating to it, and the canvas render
      loop skips an element outside its window (before this, a timed text/foreground clip stayed on screen
      the whole slide — a real reader-side gap). Convention: a non-positive/absent duration = open-ended
      (Android's wire projection collapses an absent duration to `0.0`, matching how `StoryMediaFadeResolver`
      and the clip-transition path already read it); a non-finite playhead fails open. +16 tests (12
      resolver covering every window branch + boundary/inclusive-exclusive + open-ended + non-finite
      fail-open + non-finite start→0; 2 text-view + 2 foreground-view delegation). Mutation-RED-proven
      (neutering the gate to always-visible reddens exactly the 6 hiding assertions, the always-visible
      ones stay green). **Per-ELEMENT timing AUTHORING done** (slice `story-composer-element-timing`,
      2026-08-25): the composer now WRITES a text element's `startTime`/`duration`, closing the
      author→reader loop against the resolution gate above (before this, an Android-authored text element
      could never carry a per-element window — `toTextObject` never set the two fields). The pure
      `StoryElementTiming` `(startSeconds, durationSeconds)` value type mirrors `StoryTextFade` (iOS's two
      independent start/duration controls, `0…30 s`, a `0` folding back to unset exactly as iOS's
      `$0 > 0 ? … : nil`), `StoryElementTimingCycle` is the tap-friendly discrete ladder
      `[1,2,3,5,10,15,30]` all within iOS's `0…30 s` range; `StoryTextElement.timing` serialises to
      `StoryTextObject.startTime`/`duration` on publish; `onTextElementCycleStart`/`onTextElementCycleDuration`
      advance each end independently (inert on unknown id); two toolbar controls (clock / timelapse, tinted
      when active) author them, localised in 4 locales. +18 tests (10 model/cycle + 4 `toTextObject`
      projection + 4 VM intent). Mutation-RED-proven (neutering `advance` to a constant reddens exactly the
      9 advance/cycle/VM-advance assertions, the model-shape + inert-id ones stay green). **Background-designation
      toggle (VISUAL half) done** (slice `story-composer-background-media`, 2026-08-25): the composer now AUTHORS
      which of a slide's attached media is its single looping background — before this, every media rode as a flat
      `mediaIds` list and the reader fell back to "first video else first image" as the background, so the author
      could not choose. `StorySlide.backgroundMediaId` + `StorySlideDeck.toggleSelectedBackgroundMedia` enforce
      **at most one visual background per slide** (designating replaces the prior; re-designating clears it; inert
      on an unattached id), and `removeMedia` clears the designation when it drops the background media (no orphan
      pointer). On publish the VM resolves the id to the uploaded media's URL/MIME/duration
      (`StoryBackgroundMedia.toMediaObject`) into a single `effects.mediaObjects` entry flagged
      `isBackground = true, loop = true` — a **video** carries its duration onto `duration`+`intrinsicDuration`
      (feeding the reader's `StorySlideDuration` `bgVideoDur` loop-extend), an **image** carries none — exactly the
      shape the reader's `resolveBackgroundMedia` (`firstOrNull { it.isBackground }`) already honours. A `Wallpaper`
      toggle badge on each real media thumbnail authors it (tinted `primary` when active), localised in 4 locales.
      +21 tests (8 deck reducer/invariant + 5 draft serialisation + 5 VM intent/publish-resolution + 3 boundary).
      **Pending**: the AUDIO half (mark one audio track per slide as background → `audioPlayerObjects[].isBackground`),
      blocked until the composer gains an audio-track authoring surface.
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
- [~] Keyframe animation (position/scale/opacity, easing) per clip/element — **reader/playback
      interpolation shipped** (slice `story-keyframe-interpolation`, 2026-08-23): pure
      `StoryKeyframeInterpolator` (clamp/ease/lerp, unsorted-safe) + `StoryEasing.eased`
      (linear/easeIn/easeOut/easeInOut, ports `StoryEasing.apply`) + `StoryKeyframeResolver`
      (per-channel x/y/scale/opacity projection, ports iOS `ReaderKeyframeResolver`), wired into
      the story viewer's foreground layer via `StoryForegroundMediaView.animated(atSeconds)` driven
      by the slide progress clock — keyframes are no longer dropped from the projection. Improves on
      iOS by subtracting the clip `startTime` uniformly across ALL channels (iOS omits it for
      scale/opacity). Pending: keyframe **editing** (add/move/delete + undo/redo, part of the V2
      timeline editor) and text/audio clip keyframe application.
- [~] Clip transitions (crossfade / dissolve, adjustable duration); slide opening animations
      — **reader/playback opacity ramp shipped** (slice `story-clip-transition-opacity`, 2026-08-23):
      pure `StoryClipTransitionResolver` ports iOS `ReaderTransitionResolver.opacity` + its canonical
      primitive `StoryRenderer.clipTransitionOpacity` — the outgoing clip (`fromClipId`) fades 1→0 over
      `[end−dur, end]`, the incoming clip (`toClipId`) fades 0→1 over `[start, start+dur]`, stacked
      transitions multiply, a clip outside its own `[start, end]` window is invisible, and `dissolve`
      is degraded to the crossfade ramp for live playback (per iOS `liveRenderableTransition`; the MP4
      exporter keeps the per-pixel dissolve). Wired into `StoryForegroundMediaView.animated()` (folds
      the transition factor into keyframe-resolved opacity; a participating clip with no `duration` is
      left untouched to avoid a degenerate zero-length window hiding it) — the Compose `.alpha()` glue
      is unchanged. Pending: transition **editing** (add/adjust duration + kind) and the per-pixel
      dissolve on any Android export path (both part of the V2 timeline editor).
- [~] Per-clip **reader fade envelope** shipped (slice `story-media-fade-envelope`, 2026-08-23):
      pure `StoryMediaFadeResolver.fadeOpacity` ports iOS `StoryRenderer.fadeOpacity(item:at:)` — a
      timed foreground clip ramps `0→1` over its own `fadeIn`, holds at `1`, then ramps `1→0` over its
      `fadeOut`, clipped to the clip's `[startTime, startTime+duration)` window (a `null` duration = an
      open-ended clip whose fade-out edge never fires). Threaded `fadeIn`/`fadeOut` into
      `StoryForegroundMediaView` (previously discarded from the wire projection) and folded into
      `animated()` at iOS render precedence `fade ?? keyframeOpacity ?? base`, then × the clip-transition
      ramp — so an authored envelope overrides a keyframe opacity and still multiplies with a crossfade.
      Compose `.alpha()` glue unchanged. Pending (editor side): the per-clip inspector UI to author
      volume / fade in-out / loop / background / delete.
- [~] **Text-object viewer projection** shipped (slice `story-text-object-viewer-projection`, 2026-08-24):
      the viewer decoded `storyEffects.textObjects` on the wire but dropped them from the projection —
      a text overlay authored on a slide rendered nothing. New pure `StoryTextObjectView` +
      `animated(atSeconds)` mirrors `StoryForegroundMediaView`: keyframe transform (via
      `StoryKeyframeResolver`) folded with the object's own fadeIn/fadeOut envelope (via
      `StoryMediaFadeResolver`) at iOS precedence `fade ?? keyframeOpacity ?? base` — a text object never
      joins a clip transition so no transition ramp is folded. New pure `StoryTextObjectProjection`
      resolves the displayed text through the Prisme chain (port of iOS
      `StoryTextObject.resolvedText(preferredLanguages:)` — exact key, then case/region-insensitive
      match, per preferred language in order, else the original) and maps transform/timing/keyframe
      fields into the view. `StorySlideView` gains `textObjects`; the VM projects them with
      `LanguageResolver.preferredContentLanguages(prefs)`. Compose `StoryTextObjectLayer` renders each at
      its center anchor with `.alpha(animated.opacity)`, `fontSize × scale` mapped from the 1080-referential
      design space onto the canvas width, and a `graphicsLayer` rotation. Pending: authored
      background/outline/RTL styling on the overlay; text-object keyframe **editing**.
- [x] **Text-object exploration language override** done (slice `story-text-object-exploration-override`,
      2026-08-24): the caption re-resolved when the reader taps a language chip but text overlays stayed in
      the default-chain language — a tapped "es" translated the caption yet left every overlay unchanged.
      `StoryTextObjectProjection.resolveText`/`project` gain an optional `overrideLanguage` (default `null`,
      2-arg call sites unchanged) tried FIRST without removing the preference chain — mirroring
      `StoryContentResolver`'s own override contract — by prepending it to the exact-then-normalised
      language loop, so it inherits the resolver's case/region-insensitive matching and falls through to
      the normal Prisme resolution when no translation matches. `emit()`'s override branch now re-projects
      the current slide's text objects from the raw item alongside the caption; the Compose layer already
      reads `slide.textObjects`, so caption and overlays repaint together in the chosen language. +9 tests
      (7 projection, 2 viewmodel); mutation RED-proof isolated exactly the 5 override-dependent tests.
- [x] **Language bar descends the Prisme over ALL slide content** done (slice
      `story-language-bar-text-object-translations`, 2026-08-24): `availableLanguagesFor` built its "present"
      content chips from the CAPTION (`item.translations`) alone, so a slide whose text overlays carried a
      translation the caption lacked (nominal once the device locale, rank 4, differs from the app language)
      offered the reader no chip to reach it — the overlay's translation existed but was unreachable, the same
      caption/overlay disagreement the two prior cycles fixed, one rung earlier (the strip that OFFERS the
      languages, not the resolver that renders them). Now unions caption languages (in caption order) with
      every language key across `storyEffects.textObjects[].translations` (blank values filtered, mirroring
      the caption's `content.isNotBlank()`), deduped case-insensitively; the empty-gate and the
      translatable-request arm both account for overlay languages. Consumer path unchanged (tap sets the
      ephemeral override, `emit()` re-projects overlays). +5 viewmodel tests; RED proven against unmodified
      production (exactly these 5 failed, the other 56 stayed green). One pure method; no wire/model change.
- [x] **Realtime overlay translation merge** done (slice `story-text-object-translation-realtime-merge`,
      2026-08-24): Android had **no** handler for `story:translation-updated` — the gateway broadcasts a
      story's freshly-translated on-canvas text overlay (`{ postId, textObjectIndex, translations }`), iOS
      merges it into the open viewer (`StoryItem.mergingTextObjectTranslations`), Android dropped it on the
      floor: an overlay the reader had just asked to have translated never repainted until a full refetch.
      New pure `StoryTextObjectTranslationMerge.merge(item, textObjectIndex, translations)` (canvas sibling of
      `StoryTranslationMerge`) upserts the languages into the targeted text object (existing overwritten, new
      added; out-of-range / no-effects / empty-map → unchanged) via immutable `copy`. New
      `SocketStoryTranslationUpdatedData` + `SocialSocketManager.storyTranslationUpdated` flow wired to
      `listen("story:translation-updated", …)`. The VM subscribes, merges into `rawItems`, and `emit()` now
      re-projects the current slide from `rawItems` **unconditionally** (was gated on an active override), so a
      reader whose preferred language just landed reads it at once — no tap, no refetch (parity with iOS,
      which forces no override either). The unconditional re-projection reproduces `toSlideView` when nothing
      changed, so non-current slides and no-merge emits are untouched. +12 tests (8 pure merge, 2 socket, 2
      viewmodel + reused inert case); RED-proof isolated each piece: merge (4), socket (2), subscription+merge
      (2 vm), and the emit re-projection alone reddened exactly the repaint test while the chip/inert tests
      stayed green. No wire/production logic outside `apps/android`.
- [x] **Realtime story deletion** done (slice `story-deleted-realtime-viewer`, 2026-08-24): Android had **no**
      handler for `story:deleted` — the gateway broadcasts `{ storyId, authorId }` to every friend's feed room
      (`SocialEventsHandler.broadcastStoryDeleted`), iOS folds it out of the open viewer
      (`StoryViewModel.storyDeleted` → `purgeDeadStories`), Android dropped it: a story deleted from another
      device stayed on screen until the viewer was closed. Every client auto-joins its own `feed:{userId}` room
      on auth, so the event reaches Android. New pure `StoryPlayback.removingSlide(storyId)` drops the matched
      slide, drops an emptied author group, and re-anchors the cursor BY IDENTITY (current slide survives → stay;
      current slide removed but group survives → advance to next / fall back to new last; current group emptied →
      clamp onto the group now in the slot; nothing left → dismiss; unknown id → inert). New
      `SocketStoryDeletedData` + `SocialSocketManager.storyDeleted` flow wired to `listen("story:deleted", …)`;
      `StoryViewerViewModel.observeStoryDeletions` subscribes, purges the per-slide caches (`rawItems`,
      `reactionStates`), and re-projects via `emit()`. +16 tests (10 pure engine, 5 viewmodel, 2 socket);
      RED-proof isolated: stubbing `removingSlide` to `return this` reddened exactly the 9 structural engine
      cases while the unknown-id case (correctly expecting `this`) stayed green. No wire/production logic outside
      `apps/android`.
- [x] **Realtime story update** done (slice `story-updated-realtime-viewer`, 2026-08-25): Android had **no**
      handler for `story:updated` — the gateway broadcasts the COMPLETE edited story `{ story, engagementReset }`
      to every visibility-filtered feed room (`SocialEventsHandler.broadcastStoryUpdated`), iOS folds it
      (`StoryViewModel.storyUpdated`), Android dropped it: an edit made on another device never reached the open
      viewer. New pure `StoryPlayback.replacingSlide(newSlide)` swaps the matched slide in place, keeping every
      group's order and the cursor on the SAME slot so the reader's content simply refreshes (unknown id → inert).
      New `SocketStoryUpdatedData(story, engagementReset?)` + `SocialSocketManager.storyUpdated` flow wired to
      `listen("story:updated", …)`; `StoryViewerViewModel.observeStoryUpdates` re-projects the matched slide
      through the same `toStoryItem().toSlideView` conversion the initial load used (repopulating `rawItems`),
      swaps it via `replacingSlide`, and — only on `engagementReset` (a content edit that wiped engagement
      server-side) — purges `reactionStates[storyId]` so the count re-seeds from the fresh story; a metadata-only
      update leaves any live reaction count in place. `ApiPost.toStoryItem()` made `public` in `:sdk-core` so the
      viewer re-projects through the one canonical wire→item mapper. +11 tests (5 pure engine, 4 viewmodel
      incl. the engagement-reset vs metadata-only split, 2 socket); RED-proof isolated: stubbing `replacingSlide`
      to `return this` reddened exactly the 3 structural engine cases while the unknown-id inert case stayed green.
      The tray fold (iOS `storyGroups` + `shouldKeepLocalViewed` viewed-monotonicity) remains a distinct future
      slice — Android's tray is Room-cache-driven, a larger surface. No wire/production logic outside `apps/android`.
- [x] **Realtime story deletion — TRAY** done (slice `story-deleted-realtime-tray`, 2026-08-25): the viewer fold
      (above) dropped a deleted story only from the OPEN viewer; the story TRAY (`StoriesViewModel`) is
      Room-cache-driven and kept the deleted ring until the next background revalidation. The `SocketStoryDeletedData`
      DTO + `SocialSocketManager.storyDeleted` flow already existed (viewer slice); this slice adds the authoritative
      Room-cache removal seam. New `StoryDao.deleteById(id)` (`DELETE … WHERE id = :id`), `StoryCacheSource.deleteLocal`,
      and `StoryRepository.removeCachedStory(storyId)` fold the delete into the cache so the cache-first stream
      repaints without the row; an unknown id is an inert 0-row delete (Room emits nothing → no repaint on an
      over-broadcast delivery). `StoriesViewModel` now injects `SocialSocketManager` and `observeStoryDeletions`
      forwards every `story:deleted` to `removeCachedStory` UNCONDITIONALLY (no own-echo guard, unlike a reaction —
      a story deleted on another device must vanish for its author too; iOS `purgeDeadStories` parity). +4 tests
      (2 `StoryDaoTest` real-Room: `deleteById` removes exactly the matched row / inert on an absent id; 2
      `StoriesViewModelTest`: a delete drops the story from the tray via the reactive cache, and the current user's
      own story is folded too). RED-proof isolated: neutering the subscription reddened EXACTLY the 2 new VM tests
      (17 completed, 2 failed) while the other 15 stayed green. The tray fold of `story:updated`
      (viewed-monotonicity merge, iOS `shouldKeepLocalViewed`) remains the last STORY-realtime slice. No production
      logic outside `apps/android`.
- [x] **Realtime story update — TRAY** done (slice `story-updated-realtime-tray`, 2026-08-25): the viewer fold
      (above) folded `story:updated` only into the OPEN viewer; the story TRAY (`StoriesViewModel`) is
      Room-cache-driven and kept the stale ring until the next background revalidation. This slice — the LAST
      STORY-realtime gap — adds the authoritative Room-cache MERGE seam. New pure `StoryUpdateMerge.merge(previous,
      updated, engagementReset, isOwnStory)` in `:core:model`: on `engagementReset && !isOwnStory` it adopts the
      fresh (unseen) story wholesale (a content edit wiped views/reactions server-side → the ring legitimately
      reverts to unseen); otherwise it preserves the reader's monotone seen state by delegating to
      `PostUpdateMerge` (one source of truth for reader-personal-field preservation). The AUTHOR is the exception
      to the reset (`isOwnStory`) — the server never records the author's own view of their own story, so their
      client-only "seen" survives a reset (iOS `isOwnGroup ||` in `storyUpdated`). Android reads the explicit
      `engagementReset` flag rather than iOS's `contentEditedAt` timestamp (the wire model exposes no such field).
      New `StoryDao.getById(id)` + `StoryCacheSource.findLocal`/`upsertLocal` (read-merge-write seam), and
      `StoryRepository.applyStoryUpdate(updated, engagementReset, currentUserId)` folds it (inert for an unknown id
      or a no-op merge). `StoriesViewModel.observeStoryUpdates` subscribes to `storyUpdated`, resolving the reset
      flag and current user id (the author exception). +14 tests (6 `StoryUpdateMergeTest` pure across every branch,
      2 `StoryDaoTest` real-Room for `getById`, 3 `StoryRepositoryTest` real-Room folds + inert/no-op, 3
      `StoriesViewModelTest` incl. a behavioural repaint reverting the ring to unviewed). RED-proof isolated:
      neutering the reset branch reddened EXACTLY `a non-owner content edit reverts the ring to unseen on an
      engagement reset` (1 of 6) while the other 5 preserve-path cases stayed green. STORY realtime is now fully at
      parity (viewer: reactions/overlay-tx/delete/update; tray: delete/update). No production logic outside
      `apps/android`.
- [ ] Per-clip inspector EDITOR (volume, fade in/out, loop, background, delete)
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
      **Per-slide duration** (slice `story-viewer-slide-duration`, 2026-08-25): the countdown no
      longer runs a flat 5s — pure `StorySlideDuration` (`:core:model`, port of iOS
      `StorySlide.computedTotalDuration()`) is the SSOT: author-pinned `effects.timelineDuration`
      (> 0) wins, else content-derived (background video/audio looped up to ≥ the target, long
      caption text extends past 30 words, 6s static default); the legacy `effects.slideDuration` is
      ignored (arbitrary backend values), matching iOS. Resolved once at projection into
      `StorySlideView.autoAdvanceMillis`, consumed by the countdown tween AND the keyframe playhead
      so animations stay aligned. Fixed a latent v3 gap along the way: `SceneV3.timelineDuration`
      was silently dropped by `StoryEffects.rendering` — now mapped, so a timeline-pinned v3 story
      honours its author duration.
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
- [x] Social feed: cache-first SWR list + pull-to-refresh + cursor-paginated infinite
      scroll done (`PostRepository.feedStream`/`loadMore`/`feedHasMore`, skeleton on cold
      cache, silent background revalidation, 5-from-tail prefetch + footer spinner,
      dedupe-append, history pages do not bump the freshness watermark) ; **new-posts banner
      + realtime-head merge done** (slice `feed-new-posts-banner`, 2026-07-16): pure
      `:feature:feed` `FeedRealtimeReducer`/`FeedRealtimeHead` SSOT — a socket `post:created`
      buffers above the cache feed (newest-first) and bumps a `newPostsCount`, ignoring a
      blank id, a post already in the cache feed (iOS `!posts.contains` guard), or an
      already-buffered echo; `acknowledge` clears the count but keeps the posts at head;
      `reconcile` drops buffered posts the cache refresh has surfaced (no double-render);
      `clear` on pull-to-refresh. `FeedViewModel` injects `SocialSocketManager`, folds
      `postCreated` through the reducer, prepends the (cache-disjoint) realtime head to the
      projection, and survives a background feed re-emission — the Android analogue of iOS
      `mergePreservingRealtimeHead`. `FeedScreen` shows a floating accent "N new posts" pill
      (`ArrowUpward`, plurals en/fr/es/pt) that scrolls to top + acknowledges. +21 tests
      (14 reducer, 7 VM). Mutation-proof: dropping the `loadedIds` guard fails exactly 2 tests.
      **Live `post:deleted` removal done** (slice `feed-realtime-post-deleted`, 2026-07-16):
      the previously-unconsumed `SocialSocketManager.postDeleted` stream now folds through a
      pure `FeedRealtimeReducer.remove` — a deleted id is *tombstoned* (`FeedRealtimeHead.removedIds`)
      so the feed hides it from both the realtime head and the cache-projected list; a buffered
      still-unseen arrival is dropped from the head and the banner count decremented (floored at 0,
      never claiming a gone post); `reconcile` releases a tombstone once a refresh drops the post
      from the cache; `accept` clears a tombstone if the post is re-created; `clear` (pull-to-refresh)
      drops all tombstones. The Android analogue of iOS FeedViewModel removing the post from its
      in-memory array — but pure/unit-testable and race-proof (a lagging stale re-emission that still
      carries the deleted post keeps it hidden). +15 tests (10 reducer, 5 VM). Mutation-proof:
      dropping the tombstone add fails exactly 7 discriminating tests, the other 61 stay green.
      **Live `post:liked`/`post:unliked` count sync done** (slice `feed-realtime-like-sync`, 2026-07-17):
      the previously-unconsumed `SocialSocketManager.postLiked`/`postUnliked` streams now fold through a
      pure `FeedRealtimeReducer.like` into a `FeedRealtimeHead.likes` *overlay* (`LikeOverlay(count, mine)`):
      the gateway's ABSOLUTE `likesCount` overrides the (possibly stale) cache count, while the viewer's
      own `isLiked` flips **only** when the event carries the viewer's own userId (`mine` true/false) —
      another user's like moves the count but preserves the viewer's own state (`mine` null → defer, prior
      own-state preserved). `reconcileLikes` releases an overlay once a refresh's cache count/own-state
      catches up (never reverting a live count to a stale cache value); `clear` (pull-to-refresh) drops all
      overlays. Surpasses iOS: the count/own-state law is a pure, unit-testable overlay — and it fixes the
      iOS `FeedSocketHandler` bug where *any* user's like flips the viewer's own `isLikedByMe` (Android
      gates it on userId in one place). +23 tests (15 reducer, 8 VM). Mutation-proof: dropping the prior-`mine`
      preservation fails exactly the discriminating "another user preserves a prior viewer-own like" test.
      **Live `comment:added`/`comment:deleted` count sync done** (slice `feed-realtime-comment-count`,
      2026-08-21): the `SocialSocketManager.commentAdded`/`commentDeleted` streams — previously consumed only
      by the post-detail/comments VMs, never by the feed list — now fold through a pure
      `FeedRealtimeReducer.comment` into a `FeedRealtimeHead.comments` *overlay* (`Map<String, Int>`): the
      gateway's ABSOLUTE `commentCount` overrides the (possibly stale) cache count, clamped at zero so a
      malformed negative payload never renders a negative badge; no viewer-own dimension (a comment count is
      public). `reconcileComments` releases an overlay once a refresh's cache count catches up (a `null` cache
      count reads as 0), never reverting a live count to a stale cache value; `clear` (pull-to-refresh) drops
      all overlays. Faithful to iOS FeedViewModel's `post.commentCount = data.commentCount` on both streams —
      but pure and unit-testable. `FeedViewModel` collects both streams, projects the overlay through a new
      `withCommentOverlays` helper alongside the like/bookmark overlays. +18 tests (12 reducer, 6 VM).
      Mutation-proof: dropping the negative clamp (`coerceAtLeast(0)`) fails exactly the discriminating
      "comment clamps a negative absolute count to zero" test (1 of 70, no collateral).
- [x] Post reactions (heart like) — **optimistic** toggle via `PostRepository.toggleLike`
      (flips `isLikedByMe` + count instantly, rolls back on failure). Fixes the prior
      bug where any post liked by *others* rendered as liked-by-me (`likeCount > 0`
      proxy removed). UI like state now reads the viewer's own `isLikedByMe`.
- [x] Adaptive multi-image collage layouts (1–5+ media, « +N » overflow) in the feed card
      — pure `MediaCollage.solve(count)` SSOT in `:sdk-ui` (1=single real-aspect, 2=side-by-side,
      3=large-over-two-up, 4=row-major 2×2, 5=two-then-three, 5+ with `+N` overflow on the last
      tile); `PostImageGrid` renders the returned rows/cells (slice `feed-adaptive-collage-layout`,
      2026-07-18). `FeedPostBuilder` still resolves + orders image media and relative URLs.
      Shared building block reusable by the chat-bubble media grid.
- [~] Prisme Linguistique on the feed: post content rendered in the viewer's preferred
      language with a discreet « Traduit » indicator (`ApiPost.displayContent`/`isTranslated`
      port of the message Prisme rules — Map-keyed translations, Rule 1 honoured) ;
      per-post flag strip **shipped** + request-missing-languages **shipped** (slice
      `feed-post-translation-request`, 2026-08-21 — tap a configured-but-absent language chip to translate
      the post on demand and switch to it, via `PostRepository.requestOnDemandTranslation` + `PostTranslationMerge`) ;
      **realtime push merge shipped** (slice `post-translation-updated-realtime-merge`, 2026-08-24 — the
      caption sibling of the story `story:translation-updated` slice). Android had **no** handler for
      `post:translation-updated`; the gateway translates a post server-side and broadcasts the finished
      entry (`{ postId, language, translation:{text,translationModel?,confidenceScore?,createdAt?} }`), iOS
      folds it into the open feed via `FeedViewModel.applyPostTranslation`, Android dropped it on the floor.
      New `SocketPostTranslationUpdatedData` (reuses `ApiPostTranslationEntry` as its `translation` shape) +
      `SocialSocketManager.postTranslationUpdated` flow wired to `listen("post:translation-updated", …)`. New
      entry-preserving `PostTranslationMerge.mergeTranslation(post, lang, entry)` overload (keeps
      model/confidence/timestamp the string overload dropped; no-op on blank lang/text or the identical
      entry) + `PostRepository.applyTranslationUpdate(postId, lang, entry): Boolean` folding it into
      `_feedCache` so the projected card re-renders in the reader's preferred language — no override forced
      (the reader's chain decides; parity with iOS and the story slice). `FeedViewModel` subscribes and
      routes to the repository. +18 tests (9 pure merge, 2 socket decode, 5 repository cache-merge, 1 vm
      routing + no-op cases); RED-proof isolated: neutering the entry merge reddened exactly the 5
      transformation tests, the 3 no-op tests stayed green. No wire/production logic outside `apps/android`.
- [x] Realtime post EDIT merge **shipped** (slice `feed-post-updated-realtime-merge`, 2026-08-24 — the
      whole-post sibling of `post-translation-updated-realtime-merge`, and the post analog of the
      `comment:updated` fold). Android had **no** handler for `post:updated`; the gateway rebroadcasts the
      COMPLETE edited post (`{ post }`) to every feed/post room via `SocialEventsHandler.broadcastPostUpdated`,
      iOS folds it into the feed preserving the viewer's own `isLiked`, Android left the card stale until a
      refetch. New `SocketPostUpdatedData(post: ApiPost)` (mirror of iOS, nests the post under `post`) +
      `SocialSocketManager.postUpdated` flow wired to `listen("post:updated", …)`. New pure
      `PostUpdateMerge.merge(previous, updated): ApiPost?` — adopts the edit's authoritative fields while
      preserving the reader's OWN `isLikedByMe`/`isBookmarkedByMe`/`isViewedByMe`/`currentUserReactions`
      (the broadcast is a single unpersonalized object, so those wire fields are the author's/default view;
      **strictly more faithful than iOS**, which preserves only `isLiked`), returns `null` on an inert
      re-broadcast/no-op. `PostRepository.applyPostUpdate(updated): Boolean` folds it into `_feedCache`;
      `FeedViewModel` subscribes and routes to the repository. +6 tests (PostUpdateMergeTest) + 3 repository
      + 1 socket decode + 1 vm routing = **+11**; RED-proof isolated: dropping the viewer-state preservation
      reddened exactly the 4 preservation/discrimination tests, the 2 preservation-independent tests stayed
      green. No wire/production logic outside `apps/android`.
- [x] Realtime REPOST arrival **shipped** (slice `feed-post-reposted-realtime`, 2026-08-24 — the
      arrival sibling of the `post:created` fold). Android had **no** handler for `post:reposted`; the
      gateway broadcasts a repost as a COMPLETE new post (`{ originalPostId, repost }`) to every
      visibility-filtered feed room via `SocialEventsHandler.broadcastPostReposted`, iOS folds it via
      `FeedSocketHandler` routing `postReposted` through `handlePostUpsert(data.repost)`, Android left the
      repost invisible until a full refetch. New `SocketPostRepostedData(originalPostId, repost: ApiPost)`
      (mirror of iOS, nests the repost under `repost`) + `SocialSocketManager.postReposted` flow wired to
      `listen("post:reposted", …)`. A repost is itself a new feed post, so `FeedViewModel` routes it through
      the SAME `FeedRealtimeReducer.accept` head path `post:created` uses (dedup against the cache-projected
      feed and the buffered head, prepend newest-first, bump the "N new posts" banner) — no new render
      surface: the repost renders through the existing `RepostEmbedBuilder` feed card. +3 tests (1 socket
      decode nesting the repost under `repost`; 1 vm — a repost arrives at the head and raises the banner;
      1 vm — a repost already visible in the cache feed is inert). No wire/production logic outside
      `apps/android`.
- [x] Feed card stats row: like (filled when own) + comment count + repost count,
      mood emoji on the author line, pure `FeedPostPresentation` builder (8 builder
      tests + 1 model Prisme test + 3 repository optimistic/rollback tests, all green)
- [x] Social feed: cursor-paginated post list + infinite scroll done (see above) ;
      new-posts banner + realtime-head merge done (slice `feed-new-posts-banner`, 2026-07-16)
- [~] Feed overlay shell with draggable floating buttons + radial menu ladder — the two
      draggable floating buttons + radial menu ladder (`MeeshyFloatingButtons`/`MeeshyMenuFab`)
      are wired (`MeeshyApp.kt`); the left button's tap **now genuinely toggles Flux <-> Conversations**
      (slice `feed-conversation-toggle`, 2026-08-10) — before this fix it navigated to
      `Routes.FEED` unconditionally, so a second tap while already on the Flux did nothing
      (no way back except the system Back gesture), diverging from iOS
      `RootView.draggableFloatingButtons.onLeftTap`'s `showFeed.toggle()`. Icon now reflects
      the active state too (filled `Home` on the Flux, outline elsewhere) — the closest Android
      equivalent to iOS's icon swap (static glyph <-> `AnimatedLogoView` breathing logo when
      `showFeed == true`); Android has no ported equivalent of that animated-logo treatment yet.
      **Deliberate architectural deviation, not a gap**: iOS shows the Flux as a `ZStack`
      overlay animated on top of the conversation list (`showFeed` toggles visibility with a
      spring animation, the list stays mounted underneath); Android navigates via `NavHost`
      (a real screen swap with save/restore state) — functionally equivalent (same
      toggle semantics, same destination reached) but not a pixel-identical port of the
      overlay/animation mechanism.
- [~] Create post (text, photos/videos, camera, files, location, audio+transcription, visibility, language)
      — **text-only sub-slice done** (slice `feed-post-composer-text`, 2026-08-10): a new
      `FeedComposerPlaceholder` row above the post list (iOS parity: `FeedView.composerPlaceholder`)
      opens `FeedComposerSheet` (`ModalBottomSheet`, same shape as the existing `StatusComposerSheet`),
      publishing a text-only `POST` via the existing, previously-unused-for-this-purpose
      `PostRepository.create()`. Pure `FeedComposerDraft`/`FeedPostVisibility` (Public/Friends/Private,
      port of iOS `postVisibility`) owns the publish gate (non-blank trimmed text) and the trimmed body.
      A new `FeedRealtimeReducer.created()` prepends the network-confirmed post to the same realtime
      head the socket `post:created` path already uses — visible at the top instantly, WITHOUT bumping
      the "N new posts" banner (that's for arrivals from others), and defensively deduped against the
      gateway's own `post:created` echo of this same publish (`state.posts.any { it.id == id }` already
      true by the time the echo lands). **Photo/video attachments sub-slice now done too** (slice
      `feed-composer-media-attachments`, 2026-08-10): the composer sheet gained an attach-media tile
      (system `PickVisualMedia`/`PickMultipleVisualMedia`, routed single-vs-multi by the pure
      `FeedMediaPicker.modeFor` — the Feed counterpart of `StoryMediaPicker`) that uploads through
      `FeedMediaUploader` (`post`-context TUS, the Feed counterpart of `StoryMediaUploader`, consuming
      the `TusUploadRepository` foundation the story-media-tus-upload slice built — never the legacy
      `MessageAttachment`-producing path). `FeedComposerDraft` gained `mediaIds`/`withMedia`/`withoutMedia`/
      `remainingMediaSlots`/`isMediaFull` (`MAX_MEDIA = 10`, parity with the story composer) and the
      publish gate is now non-blank text **or** at least one attached media (mirror of iOS
      `!composerText.isEmpty || !pendingAttachments.isEmpty`) — a media-only post is now possible, and
      its blank content is sent as `null`, never `""`. Verified end-to-end on a real device against the
      live gateway (not just unit tests): logcat confirmed the real TUS `POST`+`PATCH` round-trip
      (`uploadcontext=post`), the `POST /api/v1/posts` body carrying the real returned `mediaIds`, and a
      direct `GET` of the created post confirming the media persisted with a working `fileUrl`/
      `thumbnailUrl` and Prisme translations generated — the test post was deleted afterward.
      **Reel classification done** (slice `feed-composer-reel-classification`, 2026-08-10): every prior
      publish hardcoded `type = "POST"` — confirmed via `services/gateway/src/services/PostService.ts`
      that the gateway only ever *degrades* a claimed `REEL` back to `POST` when the composition doesn't
      qualify, it never auto-*upgrades* a client-sent `POST`, so any Android post with qualifying media
      (a video/audio ≥3s, or ≥2 images) was permanently stuck as a plain post, unlike iOS. New pure
      `ReelComposition` (`:core:model`, mirror of iOS SDK `ReelComposition` and the gateway's own
      `reelComposition.ts` — all three sites now share one rule) computes `qualifiesAsReel`/`defaultType`
      from the already-uploaded media's `mimeType`/`durationMs` — no on-device metadata extraction
      needed, since the gateway's TUS finish response already returns the server-probed duration in the
      same `UploadedMedia` shape every upload path surfaces. `FeedComposerDraft` gained `postType`/
      `qualifiesAsReel`/`forcePlainPost`/`withForcePlainPost` and now tracks `media: List<UploadedMedia>`
      instead of bare ids (mechanical, `mediaIds` stays a computed projection); `FeedComposerSheet` shows
      a Réel⇄Post override chip (iOS parity: `FeedView.composerOverlay`'s toggle) only when the current
      composition qualifies, exactly mirroring iOS's own conditional `if ReelComposition.qualifiesAsReel`
      gate; `FeedViewModel.publishPost` threads the resolved `type` through to `PostRepository.create`
      instead of the old hardcoded literal. +15 tests (13 `ReelCompositionTest`, +14 net new
      `FeedComposerDraftTest` cases covering qualification/boundary/force-toggle/de-qualification-on-
      removal, +1 `FeedViewModelTest` asserting the `type` threads through). Mutation-proof, three axes:
      (a) forcing `meetsMinDuration` to always `true` failed exactly the 3 duration-floor tests: (b)
      loosening the image-count rule from `>= 2` to `>= 1` failed exactly the 2 single-image tests; (c)
      hardcoding `FeedComposerDraft.postType` to ignore `forcePlainPost` failed exactly the 2 tests
      asserting the override — every other test in all three files stayed green each time; all three
      reverted and re-run clean. **Camera-photo capture now done** (slice
      `feed-composer-camera-capture`, 2026-08-10): a second attach tile
      ([Icons.Filled.PhotoCamera], mirror of iOS's `camera.fill` button) launches the system
      `ACTION_IMAGE_CAPTURE` activity ([ActivityResultContracts.TakePicture]) writing into a
      fresh [CameraCaptureFile]-named destination under `context.cacheDir/captures` (new
      `file_paths.xml` `cache-path`), exposed via the app's existing `FileProvider` authority
      (previously used only for GDPR-export sharing) — the resulting Uri is dispatched through
      the **exact same** `dispatchPicked` pipeline gallery picks already use, so zero new
      upload/error-handling logic. **A genuine, on-device-confirmed Android platform bug found
      and fixed in the same slice**: `ActivityResultContracts.TakePicture()`'s own
      `createIntent()` (decompiled and read directly — `Intent(ACTION_IMAGE_CAPTURE).putExtra
      (EXTRA_OUTPUT, uri)`) never sets `FLAG_GRANT_WRITE_URI_PERMISSION`, so the implicitly-
      resolved camera app has no permission to write into our `FileProvider` Uri. First
      on-device pass (stock AOSP camera on `meeshy_pixel8`) reproduced this exactly: the camera
      activity opened and the shutter appeared to work, but the destination `captures/`
      directory stayed empty and no TUS upload ever fired (`success = false` from the launcher,
      silently swallowed by the existing cancel/discard branch — a real device confirms this
      class of bug is invisible to any JVM/Robolectric test). Fixed with the canonical, publicly
      documented Android pattern: `context.packageManager.queryIntentActivities(ACTION_IMAGE_
      CAPTURE, MATCH_DEFAULT_ONLY)` + an explicit `grantUriPermission(pkg, uri,
      FLAG_GRANT_WRITE_URI_PERMISSION or FLAG_GRANT_READ_URI_PERMISSION)` per resolved package,
      called before `takePicture.launch(uri)`. **Deliberate, documented scope cut vs. iOS**:
      photo capture only — iOS's `CameraView` is a custom AVFoundation screen with an in-app
      photo/video toggle; Android delegates entirely to the system camera app's own
      `ACTION_IMAGE_CAPTURE` intent (so no `CAMERA` runtime permission request is needed here —
      the system camera app owns that), and video capture (`ACTION_VIDEO_CAPTURE`, its own
      destination MIME/extension) is a separately-scoped follow-up. New pure
      `CameraCaptureFile.next(nowMillis)` (`:feature:feed`, mirror of the split
      `me.meeshy.sdk.model.export.DataExportFileBuilder` uses) names the destination file from
      an explicit timestamp — deterministic, +4 tests, mutation-proven (hardcoding the filename
      to ignore the timestamp parameter fails **exactly** the 2 discriminating tests, the other
      2 stay green). **Gate**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` (970 tasks,
      full `assembleDebug` + all-module `testDebugUnitTest`, zero failures). **On-device
      verification partially blocked by severe shared-host contention this run**: the first pass
      (pre-fix) ran clean on `meeshy_pixel8` and is what surfaced the URI-permission bug in the
      first place; re-confirming the FULL round-trip (capture → upload → thumbnail) after the
      fix hit host load spiking past 450 mid-session (other concurrent agent sessions on this
      shared box, consistent with prior `feedback_shared_disk_contention_multi_session` reports)
      — the emulator process itself became CPU-starved to the point of never completing boot
      across two fresh launches (~30 min total), so the post-fix round-trip is verified by
      code-level evidence (decompiled bytecode proving the gap; the fix is Android's own
      documented canonical pattern for exactly this problem, not a novel/risky guess) rather
      than a second on-device capture. Flagged honestly rather than claimed — a natural
      candidate for a quick on-device confirmation pass once this shared box is quieter, not
      required to consider this slice done given the strength of the remaining evidence.
      **Camera-video capture now done too** (slice `feed-composer-video-capture`, 2026-08-10 —
      the standing "video capture fast-follow" candidate from the photo-capture slice's own
      deliberate scope cut): a third attach tile ([Icons.Filled.Videocam]) launches the system
      `ACTION_VIDEO_CAPTURE` activity ([ActivityResultContracts.CaptureVideo]) writing into a
      fresh [CameraCaptureFile.nextVideo]-named destination in the **same** `captures/`
      cache directory the photo tile already uses (no new `file_paths.xml` entry needed —
      `cache-path` covers the whole directory, not per-extension), then dispatched through the
      **exact same** `dispatchPicked` pipeline both the gallery pickers and the photo tile already
      use — zero new upload/error-handling logic, zero new manifest surface. **Re-proved the same
      URI-permission bug class applies here before writing any code**: decompiled
      `ActivityResultContracts.CaptureVideo()`'s bytecode (`javap` on the same AndroidX
      `activity-1.9.3` jar) and confirmed its `createIntent()` is the byte-for-byte identical
      shape as `TakePicture()`'s — `Intent(ACTION_VIDEO_CAPTURE).putExtra("output", uri)`, no
      `FLAG_GRANT_WRITE_URI_PERMISSION` — so the fix already shipped for photo capture was known
      to be needed here too, not a novel risk. **Refactor, not duplication**: the
      `queryIntentActivities`+`grantUriPermission` dance and the `capturesDir`/`File`/
      `FileProvider.getUriForFile` construction (previously inlined once in `launchCamera`) are
      now two small private `Context` extensions (`grantCaptureWritePermission(action, uri)`,
      `createCaptureUri(fileName)`) shared by both `launchCamera` and the new
      `launchVideoCapture` — keeps the one bug-prone piece (the permission grant) in exactly one
      place rather than risking the fix drifting between two copies. `CameraCaptureFile` gains
      `nextVideo(nowMillis)` (`video_<millis>.mp4`, distinct prefix/extension from the photo
      `capture_<millis>.jpg` so the two never collide in the shared directory) alongside the
      existing `next` — same pure-builder shape, +6 tests (naming, determinism, distinctness
      across instants, extension, and a same-instant no-collision-with-photo test), mutation-
      proven (hardcoding `nextVideo` to ignore its `nowMillis` parameter fails **exactly** the 2
      discriminating tests — "names the file from the given instant" and "two different instants
      produce two different video file names" — the other 7 in the file, including all 4 existing
      photo tests, stay green). **Gate**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL`
      (970 tasks, full `assembleDebug` + all-module `testDebugUnitTest`, zero failures). **Full
      on-device verification against the live gateway** (`meeshy_pixel8`, already booted and
      idle, host load moderate — no repeat of the prior slice's severe contention): tapped the new
      video tile, confirmed the system `com.android.camera2` app opened in genuine VIDEO mode
      (red `REC 00:0x` indicator, not the photo shutter UI), recorded a ~3s clip, confirmed via
      the same in-flight spinner tile the upload started immediately on return to the composer.
      `adb logcat` confirmed the real TUS `POST`+`PATCH` round-trip (`filename=video_
      1786394334180.mp4`, `filetype=video/mp4`, `uploadcontext=post`, full 1,260,047-byte
      single-`PATCH` upload) — the `video_`/`.mp4` naming from `CameraCaptureFile.nextVideo`
      confirmed verbatim in the real request. Published the resulting post for real (`POST
      /api/v1/posts` → 201): the gateway independently probed the video (`duration: 13982`,
      `width: 1280`, `height: 720`) and **auto-classified it `type: "REEL"`** — the existing
      `ReelComposition` duration-floor rule firing correctly against a genuinely-captured (not
      gallery-picked) video for the first time, with the composer's `Reel⇄Post` override chip
      appearing exactly as it does for a qualifying gallery video. `GET /api/v1/posts/:id`
      confirmed the persisted media (`fileUrl`/`thumbnailUrl` both resolving) before the test
      post was deleted via `DELETE /api/v1/posts/:id` (`{"deleted":true}`, confirmed gone via a
      follow-up 404). **Deliberate, documented scope cut vs. iOS unchanged**: Android now has two
      system-delegated tiles (photo, video) where iOS has one custom AVFoundation screen with an
      in-app photo/video toggle — functionally equivalent capture capability, different
      interaction shape; no `CAMERA` runtime permission needed on Android either way (the system
      camera app owns it). **Generic file attachment now done too** (slice
      `feed-composer-file-attachment`, 2026-08-10 — the standing "files, location, audio,
      per-post language" candidate's smallest, lowest-risk sub-slice, decomposed and picked
      first): a fifth attach tile ([Icons.Filled.AttachFile]) mirrors iOS's `doc.fill` button —
      [ActivityResultContracts.OpenMultipleDocuments] (any MIME type) lets the author pick ANY
      document from the system picker, dispatched through the **exact same** `dispatchPicked`
      pipeline every other tile already uses. **Re-proved the upload path was MIME-agnostic
      before writing any code, rather than assuming it**: read `getAttachmentType`
      (`packages/shared/types/attachment.ts`) and `UploadProcessor.validateFile`
      (`services/gateway/src/services/attachments/UploadProcessor.ts`) end to end — arbitrary
      MIME types are classified (image/audio/video/text/code/document) and only size-limited,
      never type-rejected, so the existing `post`-context TUS pipeline needed zero changes.
      Unlike `PickMultipleVisualMedia`, `OpenMultipleDocuments` has no `maxItems<=1` crash
      constraint, so there is no picker-mode routing to do — `dispatchPicked` already caps to
      `draft.remainingMediaSlots` and surfaces the limit message on overflow. The one genuinely
      new rendering decision — a picked document has no image/video thumbnail — lives in a new
      pure `UploadedMedia.hasThumbnailPreview` extension (`FeedComposerDraft.kt`), reusing the
      already-tested `MediaKindClassifier` (`:core:model`, the SSOT for MIME→kind originally
      built for the auto-download gate) rather than re-sniffing MIME prefixes: `IMAGE`/`VIDEO`
      preview as a thumbnail, everything else (a document, `AUDIO`/`AUDIO_TRANSLATION`, an
      unclassifiable/blank MIME type) falls back to a generic `InsertDriveFile` icon tile.
      `ReelComposition`'s own doc comment ("documents and every other kind never qualify")
      already anticipated this — confirmed no change needed there. +5 tests
      (`FeedComposerDraftTest`: image/video preview, document/audio/blank-mime fallback).
      Mutation-proof: hardcoding `hasThumbnailPreview` to always `true` fails **exactly** the 3
      discriminating fallback tests, the other 37 (including every pre-existing test in the
      file) stay green; reverted via `cp`-backed scratch edit, never `git checkout --`, re-run
      green before continuing. **Gate**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL`
      (970 tasks, full `assembleDebug` + all-module `testDebugUnitTest`, zero failures).
      Reviewer **PASS** (diff `apps/android` only — 2 production files, 4 locale `strings.xml`
      [en/fr/es/pt, `feed_composer_attach_file` carries zero format specifiers], 1 test file;
      SDK purity — the rendering rule lives in `:feature:feed`, reuses the `:core:model`
      classifier rather than duplicating it; SSOT honoured; no coverage floor lowered).
      **Full on-device verification against the live gateway**: pushed a real non-media file to
      the emulator's Downloads, tapped the new tile, confirmed via `uiautomator dump` bounds
      the system DocumentsUI picker opened and the picked file rendered as a generic file-icon
      tile (screenshot-confirmed, not a broken/blank thumbnail) with the same remove-X overlay
      every other tile has. `adb logcat` confirmed two independent real TUS round-trips for two
      different non-media MIME types (`text/plain` and `text/xml`, both `uploadcontext=post`).
      Published the resulting post for real (`POST /api/v1/posts` → success, `media` array
      populated); `GET /api/v1/posts/:id` confirmed the persisted attachment plus Prisme
      translations generated; the test post was deleted afterward (`DELETE` →
      `{"deleted":true}`, confirmed gone via a follow-up 404). Emulator left idle at the home
      screen afterward, pushed test file removed. **Deliberate, documented scope cut**: no
      filename/size label on the file tile yet — `UploadedMedia` (`:core:model`) doesn't carry
      the original filename the gateway's TUS response discards on this path, unlike iOS's
      `MessageAttachment.fileName`; adding it is a separately-scoped follow-up touching the wire
      model, not a rendering-only change. **Audio attachment now done too** (slice
      `feed-composer-voice-capture`, 2026-08-10 — unblocked by the chat composer's real
      `MediaRecorder` capture landing the same day, `chat-voice-recording-capture`): a sixth
      attach tile (`Icons.Filled.Mic`) records in-app via the exact same `VoiceRecordingSession`/
      `VoiceRecordingPill`/`VoiceRecordingFile`/`MicAmplitudeDecibels` stack chat uses — moved to
      `:core:model`/`:sdk-ui` this slice (no behaviour change to chat) specifically so both
      composers share one state machine instead of two drifting copies. While recording, the
      pill replaces the attach-tiles row (same UX shape as chat swapping its input row); Stop/
      Send hands the take to `dispatchItems` (a new shared upload tail extracted from
      `dispatchPicked`) as one more `audio/mp4` `MediaUploadItem` — no gateway/pipeline change
      needed, reusing the already-tested generic-icon fallback (`hasThumbnailPreview`'s `AUDIO`
      case). On-device verification against the live gateway: real mic capture (system
      indicator, growing `cacheDir/voice/*.m4a` file), real TUS `POST`+`PATCH` round-trip
      (`filetype=audio/mp4`, `uploadcontext=post`), gateway's own audio probe confirming genuine
      AAC (`duration:15741,codec:"MPEG-4/AAC"`) — composed cleanly with the existing
      `ReelComposition` duration-floor rule (the ≥3s clip correctly triggered the Reel⇄Post
      chip, zero special-casing needed). Published for real (`POST /api/v1/posts` → 201,
      `type:"REEL"`), confirmed via `GET`, deleted via `DELETE` → follow-up `GET` 404; the local
      recording file is deleted after upload (confirmed empty cache dir), no crash throughout.
      **Location attachment now done too** (slice `feed-composer-location-attachment`,
      2026-08-11 — the smallest, lowest-risk sub-slice of the standing candidate, deliberately
      scoped narrower than iOS's map-based `LocationPickerView`): a seventh attach tile
      ([Icons.Filled.LocationOn]) mirrors iOS's `location.fill` button, requesting
      `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` then capturing one fresh fix straight from
      `android.location.LocationManager` (GPS preferred, network fallback — no Play Services
      dependency added). New pure `SharedPlace` (`:core:model`, mirrors the gateway's
      `{latitude, longitude, name, address, category}` and iOS's `SharedPlace` field-for-field)
      threaded through `CreatePostRequest.location` → `PostRepository.create(location:)` →
      `FeedViewModel.publishPost(location:)`. The attached place renders as its own removable
      chip (raw coordinates via the new `formattedCoordinates()`, `Locale.ROOT`-pinned).
      **Per-post language override now done too** (slice `feed-composer-language-override`,
      2026-08-11 — the last unshipped item of this candidate besides on-device transcription):
      a compact flag pill under the header (port of iOS's `ComposerLanguageFlag` button; the
      collapsed pill shows ONLY the flag, matching iOS's own 2026-07-30 directive) opens a
      search-filtered picker dialog (`ComposerLanguagePickerDialog`, a plain `AlertDialog` —
      mirrors `SettingsScreen`'s own `RegionalLanguageDialog` shape rather than nesting a second
      `ModalBottomSheet`, an established anti-pattern this codebase avoids) reusing the
      already-tested `LanguageStepSelection.pickerLanguages`/`.filter` pure core the registration
      wizard's language step already established — no re-implementation of the catalogue/filter
      rule. New pure `ComposerLanguage` (`:core:model`, port of iOS `ComposerModels.swift`'s
      `DefaultComposerLanguage.resolve()`/`ComposerLanguageFlag.label(for:)`): `DEFAULT` reuses
      `LanguageResolver.FALLBACK_LANGUAGE` ("fr", SSOT — no second hardcoded literal), `flag(code)`
      the catalogue flag or an uppercased raw-code fallback. **RE-PROUVEN before coding**: iOS's
      own `FeedComposerSheet.composerLanguage` does NOT auto-detect from the typed text either
      (confirmed by reading `FeedView+Attachments.swift` — the live-typing detector only wires
      into `UniversalComposerBar`/messages, via `ComposeLanguageDetector` on Android's chat
      composer) — it starts at a hardcoded `"fr"` and only a manual picker changes it, so this
      slice mirrors that exactly rather than reusing chat's auto-detection. Also re-confirmed no
      shared cross-feature language-picker UI component exists yet outside the registration
      inline menu: the pure catalogue/filter core (`LanguageStepSelection`, `:core:model`) IS
      reusable and was reused verbatim, but the Composable picker UI itself is now duplicated a
      third time (registration's inline grid, Settings' `RegionalLanguageDialog`, this dialog) —
      flagged as a legitimate `:sdk-ui` promotion candidate for a future iOS-dette-style pass, not
      done here (stays feature-local per the SDK-purity convention of duplicating small UI glue
      until 3+ call sites force a shared abstraction, and to keep this slice's diff scoped to
      `:feature:feed`/`:core:model` alone). `FeedComposerDraft` gained `language` (defaults to
      `ComposerLanguage.DEFAULT`) + `withLanguage(code)` (replaces, mirrors `withLocation`); the
      choice is always forwarded on publish (`FeedPostPublishRequest.language` → `FeedViewModel.
      publishPost(language:)` → `PostRepository.create(originalLanguage:)`, an already-existing,
      previously-dead wire field — mirrors iOS always sending `originalLanguage: composerLanguage`,
      never omitting it). +12 new tests (5 `ComposerLanguageTest`: default value, known-code flag,
      case-insensitive match, unknown-code uppercase fallback, blank-code empty-string fallback; 5
      `FeedComposerDraftTest`: default language, override, replace-not-accumulate, publish request
      carries default, publish request carries override; 2 `FeedViewModelTest`: no-override
      forwards `null` verbatim, override forwards verbatim). **Mutation-proven**, three axes:
      hardcoding `publishRequest().language` to always `ComposerLanguage.DEFAULT` fails **exactly**
      the "carries the author's chosen language override" test (54 others green); dropping the
      uppercase fallback in `ComposerLanguage.flag` fails **exactly** the unknown-code test (4
      others green); hardcoding `FeedViewModel.publishPost`'s repository call to `originalLanguage
      = null` fails **exactly** the "forwards the author's chosen language override" test (58
      others green) — each reverted via a scratch `cp`-backed edit, never `git checkout --`,
      re-confirmed green. **Gate**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` (970
      tasks, matching every prior slice — no build-graph regression). Reviewer **PASS** (diff
      `apps/android` only — 2 new `:core:model` files, 4 `:feature:feed` production files edited
      [+1 UI file gaining 2 new Composables], 4 locale `strings.xml` [en/fr/es/pt, 3 new keys each,
      one carrying a `%1$s` format spec used only as a content-description string, not rendered
      literally], 2 test files edited; SDK purity — `ComposerLanguage`/`LanguageStepSelection`
      stay the stateless building blocks, the picker dialog + pill are ordinary `:feature:feed` UI
      glue over them; SSOT — `LanguageResolver.FALLBACK_LANGUAGE`/`LanguageStepSelection`/
      `LanguageData` all reused verbatim, zero re-implementation; no coverage floor lowered; no
      tautological tests). **Full on-device verification against the live gateway**
      (`meeshy_pixel8`): repeated the itération-precedent's own corrected lesson — every tap
      resolved via `uiautomator dump` + a grepped `bounds="[x1,y1][x2,y2]"` attribute, including
      catching and correcting a first attempt that reused a screenshot-estimated Publish
      coordinate (missed entirely, sheet stayed open) before switching to the dump-derived bounds.
      Tapped the new flag pill (`content-desc="Francais"` confirmed the default), the picker
      dialog opened showing all 6 catalogue languages with French pre-selected via `RadioButton`,
      selected "Deutsch" — dialog closed, pill updated to the German flag
      (`content-desc="Deutsch"` confirmed via a fresh dump), typed text, tapped the
      dump-verified Publish bounds: `adb logcat` confirmed the real request body
      `{"content":"TestLanguageOverride_de2","originalLanguage":"de"}` and the gateway's `201`
      response echoed `"originalLanguage":"de"` on the persisted post — proving the full
      composer-to-gateway pipeline round-trips the override correctly end to end, not just at the
      unit-test level. Deleted the test post via `curl DELETE /api/v1/posts/:id` (confirmed gone
      via a follow-up `GET` → 404). `adb logcat` checked across the whole session for `FATAL
      EXCEPTION`/`AndroidRuntime` app crashes — none. Emulator left idle on the Feed screen
      afterward (composer closed, not mid-flow). **Still open**: no map UI, no search, no
      reverse-geocoded name/address for the location attachment (each a separately-scoped, heavier
      follow-up — the map picker alone needs a Maps SDK dependency this slice deliberately
      avoided), on-device transcription (iOS's dedicated `AudioPostComposerView` with
      `EdgeTranscriptionService` — a materially larger, separately-scoped feature), durable-outbox
      queueing for offline resilience (media upload itself has no offline-retry path yet either,
      unlike the story composer's — the whole Feed publish isn't durable yet, so this is
      consistent, not a new gap) — each a separately-scoped follow-up. With this slice, the Feed
      post composer now covers every base attachment/option iOS's `composerOverlay` toolbar
      exposes except on-device transcription and the emoji picker.
- [ ] Unified post composer (Post / Status / Story tabs)
- [ ] Quote / repost posts (incl. reposts of stories) with canvas reprojection + "items repositioned" banner
- [x] Post reactions (heart like) — optimistic toggle + live `post:liked`/`post:unliked` socket
      count sync **done** (slice `feed-realtime-like-sync`, 2026-07-17)
- [x] Bookmark / un-bookmark — optimistic `toggleBookmark` (flips `isBookmarkedByMe` + count,
      rolls back on failure) + live personal `post:bookmarked` overlay (absolute count + own-state,
      reconciled against the cache) + accent-tinted bookmark button in the feed card
      (slice `feed-realtime-bookmark-sync`, 2026-07-17)
- [x] Adaptive multi-image collage layouts (1–5+ media) **done** via `MediaCollage.solve` +
      `PostImageGrid` (slice `feed-adaptive-collage-layout`, 2026-07-18). **Fullscreen media gallery
      done** (slice `feed-media-fullscreen-gallery`, 2026-07-18): tapping any collage tile (or the
      single image, or the `+N` overflow tile) opens `MeeshyImageViewer` — the `:sdk-ui` fullscreen
      pager (pinch-zoom/pan/double-tap, ±2 prefetch, save-to-gallery) — positioned on the tapped image
      and paging across ALL of the post's images at full resolution. Pure `:feature:feed`
      `FeedMediaGallery.of(post, imageIndex) → FeedGallery(pages, startIndex)` SSOT (mirror of chat's
      `ConversationMediaGallery`): flattens the post's images to full-res URLs, each page sharing the
      post text as caption (trim → null when blank) + author + timestamp for the viewer chrome, tapped
      index clamped into bounds, empty post → nothing opens. `FeedViewModel` holds the ephemeral
      `imageViewer: FeedGallery?` (open on `openImageViewer`, `null` on `dismissImageViewer`; unknown
      post / image-less post inert). +16 tests (`FeedMediaGalleryTest` 12, `FeedViewModelTest` +4).
- [~] Threaded comments: expand threads ("view N replies") + comment likes + **reply composition** +
      **auto-preview replies** (slice `feed-reply-preview`, 2026-07-18 — the first top-level comments'
      replies auto-preload after the page loads and show a 2-reply inline preview with a "View all N replies"
      affordance, no tap needed; mirror of iOS `preloadReplyPreviews`) + **post-detail realtime room**
      (slice `feed-postdetail-realtime-comments`, 2026-07-18 — a live `comment:added` for the open post
      lands in the thread without a refresh: a top-level comment prepends, a reply prepends into its
      already-visible thread and bumps the parent's "View N replies" count; mirror of iOS
      `PostDetailViewModel.subscribeToSocket` `commentAdded` sink filtered to `postId`) + **live
      `comment:deleted`** (slice `feed-comment-realtime-delete`, 2026-07-18 — a comment/reply deleted
      elsewhere vanishes from the open thread without a refresh: a top-level comment is removed and its
      reply thread purged, a reply is removed and its parent's "View N replies" count decremented;
      mirror of iOS `PostDetailViewModel` `commentDeleted` sink) + **live comment heart reactions**
      (slice `feed-comment-live-reactions`, 2026-07-18 — a `comment:reaction-added`/`comment:reaction-removed`
      heart on the open post syncs without a refresh: the viewer's own reaction lights/clears the heart, a
      third party's moves the displayed count; mirror of iOS `PostDetailViewModel` `commentReactionAdded`/
      `commentReactionRemoved` sinks) + **live header comment-count badge** (slice
      `feed-postdetail-commentcount-badge`, 2026-07-18 — the header badge, owned by the separate
      `PostDetailViewModel`, now subscribes to the same room: a live `comment:added`/`comment:deleted` for the
      open post resyncs the badge to the **server-authoritative** `commentCount` the event carries — clamped
      ≥0 — healing any drift from the thread VM's optimistic arithmetic; a manual refresh drops the live
      overlay for fresh server truth; other posts + a blank route are ignored; mirror of iOS
      `PostDetailViewModel` `commentAdded`/`commentDeleted` `post.commentCount = data.commentCount`) + **mention
      rendering** (slice `feed-comment-mention-rendering`, 2026-07-18 — a comment's content now renders through
      the **shared** `RichMessageText`/`MessageTextParser` the chat bubble uses, so `@Display Name` / `@handle`
      tokens resolve to highlighted, tappable mention links [plus bold/italic/URL rich text]; the pure
      `CommentMentionDirectory` builds the `username → displayName` map from every comment + loaded-reply author,
      mirroring the web `buildMentionDisplayMap` filter — blank handle / absent-or-blank display name / vanity
      `displayName == handle` all dropped) **done** + **per-comment language switcher** (slice
      `feed-comment-language-switcher`, 2026-07-18 — each translated comment now carries a discreet Prisme flag
      strip [translate glyph + original + configured content-language chips], reusing the **shared**
      `PostLanguageStrip` + `LanguageFlagTapResolver`; tapping a chip switches *that* comment's displayed
      language [content + active chip] via a per-comment-keyed override, tapping the active chip reverts to the
      Prisme default; a content-less/unknown tap is inert; mirror of the post-detail `DetailLanguageStrip`,
      keyed per comment rather than per post — the `isTranslated` flag was computed but never rendered before)
      **done** + **comment composer @-mention autocomplete** (slice `feed-comment-mention-autocomplete`,
      2026-07-18 — the comment/reply composer now offers the same @-mention autocomplete the chat composer has:
      the pure mention state-machine was **promoted from `:feature:chat` to `:sdk-core`** as a shared SSOT
      [`MentionComposer` + `MentionAutocompleteState` in `me.meeshy.sdk.mention`, renamed from `ChatMention`],
      so both surfaces share one behaviour; the new pure `CommentMentionRoster` [`:feature:feed`] builds the
      candidate list from the thread's authors [blank-handle drop, self-exclude, display-name→handle degrade,
      case-insensitive dedup first-wins, encounter order]; `PostCommentsViewModel` now owns the composer draft
      + mention panel in a folded flow [`onDraftChange`/`onMentionSelected`, `submit()` reads the draft and
      resets] so a realtime comment landing never tears the half-typed draft down; `PostCommentsSection`'s
      `CommentComposer` is now controlled with a `CommentMentionStrip` mirroring chat's `MentionSuggestionStrip`.
      Local-roster only for now — the remote directory merge [`MentionSearch`] is a later slice) **done** +
      **comment composer remote directory merge** (slice `feed-comment-mention-remote-merge`, 2026-07-19 — a
      two-character-or-longer `@fragment` now enriches the thread-local roster with the shared user directory,
      the feed counterpart of chat's `chat-mention-remote-merge`: the `MentionSearch`/`DirectoryMentionSearch`
      building block was **promoted from `:feature:chat` to `:sdk-core`** [`me.meeshy.sdk.mention`] as the shared
      SSOT so both composers query one directory port, chat re-points to it; `PostCommentsViewModel` fires a
      300 ms-debounced `mentionSearch.search(query)` for the active fragment [`MentionComposer.shouldQueryRemote`
      gates it, a fresh keystroke or a selection cancels the in-flight lookup], excludes the signed-in user,
      and folds the results below the local roster via the pure `applyRemote` [local-first, stale-fragment
      dropped]; a failed lookup degrades to the local roster. +6 `PostCommentsViewModelTest`) **done** +
      **viewer-initiated comment delete** (slice `feed-comment-delete`, 2026-08-17 — the viewer can now
      delete their own comments/replies from the open thread, not just observe a live `comment:deleted`
      from elsewhere. Found via the "ready backend, never wired to UI" heuristic (fifth this session):
      `PostRepository.deleteComment(postId, commentId)` was fully implemented, unlike its already-wired
      siblings `likeComment`/`unlikeComment`. Mirror of iOS `FeedCommentsSheet.deleteHandler`/`deleteComment`
      — gated to `comment.author.id == currentUserId` [`CommentPresentation.isOwn`, new field derived in
      `CommentProjection.build(currentUserId:)`], optimistic removal, full rollback on failure, no
      confirmation dialog [same as iOS's destructive-role menu item — fires on tap]. `PostCommentsViewModel
      .deleteComment(commentId)` deliberately **reuses the exact `onCommentDeleted` transition already
      wired to the socket path** [snapshot `thread`/`replies` → apply the same removal → confirm or restore
      both snapshots on failure] rather than duplicating the removal logic. New `CommentDeleteButton`
      [trash icon, visible only when `isOwn`] wired once in `CommentRow`, covering both top-level and reply
      rows through `ReplyThread`'s existing reuse of that composable. +9 tests [`CommentProjectionTest` ×2:
      isOwn true/false by author id; `PostCommentsViewModelTest` ×6: top-level delete, reply delete +
      parent count decrement, rollback + error on failure, and the three inert guards — blank postId, blank
      commentId, unknown comment id]) **done** + **reply @-mention auto-prefill** (slice
      `reply-mention-prefill`, 2026-08-17 — replying to a comment that is *itself* a reply now
      prefills `@username ` into the composer, port of iOS `FeedCommentsSheet.beginReply(to:)`:
      flat 2-level threading reparents the new reply to the root comment, so without the mention
      the addressed person is never notified — only the thread's root author would be. New pure
      `ReplyMentionPrefill.apply(currentText, previousMention, replyToParentId, authorUsername)`
      [`:feature:feed`] — injects only when `replyToParentId` is non-blank [the target comment is
      a reply, not top-level] and the author has a username; strips the exact previously-injected
      prefix when retargeting to a different reply [idempotent re-tap, no double prefix; an
      edited-away prefix is left alone, mirroring iOS's `hasPrefix` guard]. `beginReply` now tracks
      `prefilledMention` and calls the helper right after positioning `composer.value`. Replying to
      a top-level comment, or canceling a reply [`cancelReply`], never touches the draft — matches
      iOS, which also leaves `composerText` untouched on cancel. +8 `ReplyMentionPrefillTest`
      [pure] + 3 `PostCommentsViewModelTest` [prefill on reply-to-reply, no prefill on top-level,
      retargeting replaces the previous prefill]) **done**;
      effects/blur still open
- [~] Post / comment pin-unpin; repost / quote-repost / share; report — **post pin shipped
      2026-08-17** (slice `feed-pin-own-post`). Re-proof found `PostRepository.pinPost`/
      `unpinPost` (`POST`/`DELETE /posts/{id}/pin`) already fully implemented and TESTED at the
      repository level, with ZERO call sites anywhere in `apps/android` — ready backend, never
      wired to a screen. Confirmed against the iOS reference (`PostService.pinPost`/`unpinPost`,
      `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift`) that iOS itself only
      ever calls `pinPost` — `unpinPost` has **zero call sites in the iOS app too** (`onPin` is
      gated `isOwnPost ? {...} : nil` in `ProfileUserPostsList.swift`/`PostDetailViewModel.swift`,
      exactly like `onDelete`, with no matching `onUnpin`). Ported faithfully: `PostAction.Pin`
      added to the existing pure `PostActionMenu` (own-post-only, ordered right before Delete),
      `FeedViewModel.pinPost(postId)` mirrors the established `repost()`/`deletePost()` shape
      (call → `postRepository.refresh()` on success to pick up the server's `isPinned`, surface
      `errorMessage` on failure). `unpinPost` deliberately left unwired — no UI reference on
      either platform to port. +5 tests (`PostActionMenuTest` ×3: own-post ordering now includes
      `Pin`, someone-else's post never offers it; `FeedViewModelTest` ×2: delegates + refreshes
      on success, surfaces error without refreshing on failure). EN/FR/ES/PT strings.
      **Quote-repost composer shipped 2026-08-22** (slice `feed-quote-repost`): the post menu now
      offers **Quote** right after **Repost** (`PostAction.Quote`, every post, iOS parity with
      `PostDetailView.toggleDetailRepost`). Tapping it opens a commentary composer (`QuoteComposerState`
      + `QuoteComposerSheet`, a dialog coherent with `ReportPostDialog`: an `OutlinedTextField` above a
      bordered source-post preview) → `FeedViewModel.beginQuote`/`onQuoteTextChange`/`cancelQuote`/
      `submitQuote`. New pure `RepostCommand.of(postId, repostOf, quote, commentary)` SSOT ports the two
      decisions iOS scatters across `FeedViewModel.repostPost`/`resolveRepostTargetId`: **(1) target id** —
      reposting a repost targets its recorded ROOT (`originalRepostOfId ?? repostOf.id`), never the
      intermediate share (the gateway hydrates `repostOf` one level deep, so reposting a share by its own
      id embeds an EMPTY share card — a latent bug in the pre-existing simple `repost()`, now fixed since
      **both** paths route through `RepostCommand`); **(2) content/isQuote gating** — a simple repost
      carries no content, a quote carries the trimmed commentary and flags `isQuote`. **Surpasses iOS**:
      a blank/whitespace-only quote degrades to a simple repost (`isQuote = content != null` after
      blank→null), where iOS's raw `content != nil` would send `content = ""`, `isQuote = true` (an empty
      quote card). +23 tests (`RepostCommandTest` ×11 pure incl. root fallback/blank-root-trim/inner-
      whitespace-preserved; `FeedViewModelTest` ×11 — repost own-id, repost-of-repost→root, error path,
      beginQuote preview + inert-on-unknown, draft change, submit-with/without-commentary, submit-of-repost
      →root, cancel, no-composer inert; `PostActionMenuTest` ×1 quote-follows-repost). Mutation RED-proof:
      `isQuote = content != null` → `= quote` fails EXACTLY the 3 degradation tests (2 pure + 1 VM), 730
      others green. EN/FR/ES/PT strings.
      **Post-detail repost + quote shipped 2026-08-22** (slice `feed-postdetail-quote-repost`): the
      full-screen `PostDetailScreen` now matches the feed. iOS offers both there via
      `PostDetailView.toggleDetailRepost(quote:)` (a repost button + Repartager/Citer alert). Android:
      the read-only repost stat becomes an interactive `DetailRepostStat` — tap opens a Repost / Quote
      `DropdownMenu`; the quote path reuses the feed's `QuoteComposerSheet` (widened to `internal`). VM
      gains `repost`/`beginQuote`/`onQuoteTextChange`/`cancelQuote`/`submitQuote`, both folding through the
      SAME tested `RepostCommand` SSOT scoped to the single open post. **Two improvements over iOS's
      post-detail**: (1) reposting a share targets its ROOT (iOS reposts the raw `postId` → empty share
      card); (2) a blank quote degrades to a simple repost (iOS's post-detail quote is content-LESS
      entirely — `content: nil`). Optimistic `isReposted` (fills the icon `Indigo500`) reverts on failure
      (iOS `isPostReposted`); in-flight guard fires the network once; failures surface via `errorMessage`.
      +15 `PostDetailViewModelTest` (root-target ×2, no-root fallback, before-load inert ×2, failure reverts
      ×2, double-fire guard, preview, draft, cancel, submit-with/blank-commentary, submit-of-repost→root,
      no-composer inert). Mutation RED-proof: drop `post.repostOf` → EXACTLY the 2 root tests fail. No new
      strings (reuses `feed_action_repost`/`feed_action_quote` + quote-sheet strings).
      **Still open**: comment pin-unpin (separate surface, not investigated this slice).
- [~] Post view + dwell-time tracking; batched impression tracking — **batched impression
      tracking shipped 2026-08-17** (slice `feed-impression-batching`). Re-proved before coding:
      `PostApi.recordImpressions`/`PostRepository.recordImpressions(postIds, source)`
      (`POST /posts/impressions/batch`) already existed end-to-end, tested, just never called by
      any UI. New `ImpressionBatcher` (`:sdk-core`) — a faithful port of iOS's own
      `ImpressionBatcher.swift` debounce/flush/retry core: an impression is counted per
      APPEARANCE (never deduped — matches the gateway's own batch semantics), `record(postId)`
      appends and (re)schedules a 3s debounce flush, `flushNow()`/`flushNowAsync()` sends
      immediately, a failed send reinserts the batch at the front for the next flush to retry.
      One instance per surface (`FeedViewModel` owns a `source = "feed"` instance directly, not a
      Hilt singleton — mirrors iOS's per-view `@StateObject` lifetime) with its OWN
      `SupervisorJob`+`Dispatchers.IO` scope, deliberately NOT `viewModelScope`: an
      `onCleared()`-triggered flush would otherwise race `viewModelScope`'s own teardown
      (cancelled right after `onCleared()` returns) and likely get dropped. Wired into
      `FeedScreen`'s existing `items(state.posts, key = { it.id })` block via a sibling
      `LaunchedEffect(post.id) { viewModel.trackImpression(post.id) }`, alongside the
      already-existing `loadMoreIfNeeded` effect. +9 tests (`ImpressionBatcherTest`): debounced
      flush fires after the delay; doesn't fire early; groups records within the window into one
      batch; repeat appearances aren't deduped; a blank id is a no-op; `flushNow`
      sends+cancels the pending timer; `flushNow` on an empty batch is inert; `flushNowAsync`
      sends without being awaited; a failed flush keeps the batch for the next retry.
      **Deliberately narrower than iOS's own three safety nets**: the debounced auto-flush and
      an explicit `flushNow`/`flushNowAsync` are ported; iOS's OTHER two nets —
      app-backgrounding flush (`willResignActive`/`didEnterBackground`) and kill-survival
      persistence (UserDefaults, replayed on relaunch) — are NOT, Android has no equivalent
      wiring point yet for either. **Still fully open: dwell-time tracking** — iOS's own
      `EngagementTracker`/`TrackEngagementModifier` is a materially bigger, separate system
      (durable SQLite outbox, session begin/pause/resume with a "topmost owns the clock" rule for
      overlays, `minDwellMs`/`minWatchMs` qualification thresholds, its own
      `POST /posts/engagement/batch` endpoint) — not attempted here, left as its own future slice.
      **Post view recording + author-only reach stats shipped 2026-08-17** (slice
      `post-detail-reach-stats`) — `PostRepository.viewPost(postId)` (`POST /posts/{id}/view`) was
      fully implemented, tested, and unwired, same gap pattern as impression batching but a
      genuinely distinct endpoint [confirmed by reading both: `viewPost` records a single
      deduplicated per-viewer view, `recordImpressions` is the separate batched engagement metric
      already shipped — no overlap, both real iOS network calls fired independently]. Mirror of
      iOS `PostDetailView`'s `.task { try? await PostService.shared.viewPost(...) }`: fires once
      per detail-view session regardless of whether the post fetch itself succeeds, failure
      silently ignored. Paired with the visible half of the feature — iOS's `PostReachFormatter`
      author-only "@pseudo · views · impressions" line (`PostDetailView.authorRevealView`) — since
      wiring the write with nothing to show for it would be a dead end. New pure
      `PostReachFormatter` (`compact()` 1.2k/3.4M formatting, `components()` gated on `isAuthor`)
      + `FeedPostPresentation.viewCount`/`impressionCount`/`isAuthor`/`authorUsername` [new
      `ApiPost.impressionCount` field alongside the pre-existing `viewCount`] + a `PostReachLine`
      composable in `PostDetailScreen`, rendered only for the post's own author. +14 tests
      (`PostReachFormatterTest` ×6, `FeedPostBuilderTest` ×5, `PostDetailViewModelTest` ×3: view
      fires once, blank postId never records, a failed record doesn't disturb the loaded post).
- [~] Feed post detail with text/media/repost, translation flags, threaded comments — **detail screen
      done** (slice `feed-post-detail-screen`, 2026-07-17): tapping a **non-reel** feed post (previously a
      dead-end — the card only routed reels) now opens a full-screen `PostDetailScreen`. `PostDetailViewModel`
      reads the route `postId` (`SavedStateHandle`), fetches via the existing `PostRepository.getPost(id)`,
      projects through the **shared** `FeedPostBuilder` (Prisme parity with the feed), and drives a working
      per-post language switch (the flag strip) via the shared `LanguageFlagTapResolver` + `FeedPostBuilder.
      resolveActiveCode` — one flag-tap rule with the feed and chat. Cold open shows a skeleton (no per-post
      cache yet); a blank id → coherent not-found; a fetch failure → error state + snackbar; pull-to-refresh;
      read-only engagement counts (likes/comments/reposts/bookmarks). Wired from all three feed surfaces
      (feed, saved, user-posts) so no non-reel tap dead-ends anywhere; reels still route to the reels player;
      back returns to the source. **SSOT refactor:** collapsed the three duplicate `toTranslationRows` copies
      (FeedViewModel, FeedPostBuilder, and the new VM) into one shared internal `PostTranslationRows.kt`.
      **Threaded comments now landed** (slice `feed-post-detail-comments`, 2026-07-17): the post-detail
      screen renders a full comment thread beneath the post, on the **existing** `PostRepository.getComments`/
      `addComment`. `core:model` — `ApiPostComment.displayContent`/`isTranslated` (Prisme law reused from
      `ApiPost` — a comment is prism-translated like any content). `:feature:feed` pure — `CommentThreadState`
      (immutable accumulation SSOT: `appended` de-dups by id + advances the last-id cursor watermark,
      `optimistic` prepends a just-sent row, `confirmed` swaps it for the server row, `failed` rolls it back;
      `canLoadMore = hasMore && cursor non-blank`) + `CommentProjection` (author/avatar/Prisme content/reply
      awareness/pending flag). `PostCommentsViewModel` reads the route `postId`, cursor-pages by the last
      comment's id, and **sends optimistically** (Instant-App feedback: the row appears instantly, dimmed,
      then confirmed or removed). Compose `PostCommentsSection` (accent-coherent Indigo, avatar+name+reply
      badge+relative time+Prisme content, composer with send/spinner, "show more"). **SSOT:** collapsed the
      three duplicate `resolveMediaUrl` copies in the feed module into one shared `resolveFeedMediaUrl`
      (`FeedMediaUrl.kt`; FeedPostBuilder/RepostEmbed migrated, their tests unchanged & green). EN/FR/ES/PT.
      **Comment likes now landed** (slice `feed-comment-likes`, 2026-07-17): each comment carries a heart
      like affordance with an **optimistic toggle**, on the **existing** `PostRepository.likeComment`/
      `unlikeComment`. `:feature:feed` pure — `CommentLikeState` (immutable optimistic-like SSOT: `likedIds`
      + per-comment count `deltas` + `inFlightIds` guard; `seeded` marks likes from the server
      `currentUserReactions` heart, additive across pages and never resurrecting a locally-toggled like;
      `beginToggle` flips + guards a double-tap re-entrantly (`null` = skip network), `settle` keeps the
      optimistic result, `rollback` reverts on failure; `displayCount` clamps ≥0). Mirror of iOS
      `PostDetailViewModel.toggleCommentLike`. `CommentProjection` now projects `isLiked` + the optimistic
      count; `PostCommentsViewModel.toggleLike` guards blank post/comment ids, calls like/unlike, and rolls
      back on `Failure`/exception (cancellation-safe). Compose: accent-coherent heart (filled + `Error` red
      when liked, `FavoriteBorder` + secondary otherwise — exact parity with the feed-post like) reusing the
      shared `feed_like`/`feed_unlike` strings (no new strings). +25 tests (15 `CommentLikeStateTest`,
      +3 `CommentProjectionTest`, +7 `PostCommentsViewModelTest`; mutation-proven: dropping the in-flight
      guard fails only the double-tap guard test).
      **Comment replies (1-level) now landed** (slice `feed-comment-replies`, 2026-07-17): each top-level
      comment with `replyCount > 0` shows a natural "View N replies" affordance that expands into indented
      reply rows, on the **existing** `PostRepository.getCommentReplies`. `:feature:feed` pure —
      `CommentRepliesState` (immutable per-parent SSOT: `expandedIds`/`loadingIds`/`loadedIds`/
      `repliesByParent`; `expanded`/`collapsed` idempotent, `beginLoad` returns `null` when already loading
      **or already loaded** so a collapse-then-re-expand never refetches — cache-first Instant-App;
      `loaded` stores rows + marks loaded + clears loading; `failed` clears loading **and collapses** the
      thread exactly as iOS `PostDetailViewModel` does on error). `PostCommentsViewModel.toggleReplies`
      guards blank post/comment ids, expands + fetches once, seeds reply-row likes from
      `currentUserReactions`, and is cancellation-safe. The projection now **filters the top-level list to
      `parentId == null`** (mirror of iOS `topLevelComments`) so a reply mixed into the page never renders
      twice; reply rows reuse `CommentProjection`/`CommentRow` so likes work on replies too. Compose:
      accent-coherent Indigo toggle + discreet loading spinner + indented reply column. EN/FR/ES/PT
      (`post_comments_view_replies` plural + `post_comments_hide_replies`). +23 tests (14
      `CommentRepliesStateTest`, +9 `PostCommentsViewModelTest`; mutation-proven: dropping the
      already-loaded guard fails exactly the 4 no-refetch tests).
      **Auto-preview replies now landed** (slice `feed-reply-preview`, 2026-07-18): after a comment page
      loads, the replies of the first top-level comments with replies **auto-preload in the background** and
      a 2-reply inline preview shows **without a tap** (mirror of iOS `preloadReplyPreviews`
      `schedulePreloadReplyPreviews`/`prefix(5)`), with a "View all N replies" affordance to expand the full
      thread. `:feature:feed` pure — `CommentRepliesState.previewTargets(candidateIds, limit)` (first-`limit`
      fresh parents, dropping loaded/in-flight — bounded like iOS `prefix(5)`) + `beginLoadAll(ids)` (batch
      mark-loading without expanding: a preview is *loaded but collapsed*). `ReplyThreadUiState` gains
      `isPreview` + `hiddenReplyCount`; the projection now also renders **loaded-but-collapsed** threads
      capped to 2 rows, so **collapsing an expanded thread falls back to its preview** (iOS keeps `repliesMap`
      populated after a collapse) rather than hiding it outright. `PostCommentsViewModel.preloadReplyPreviews`
      runs after each successful fetch, idempotent (never refetches a loaded/in-flight thread). Cache-first
      improvement over iOS: a previewed thread is never refetched when the viewer taps "View all". Compose:
      preview rows above an accent-coherent Indigo "View all N replies" toggle; EN/FR/ES/PT
      `post_comments_view_all_replies` plural. +15 tests (+10 `CommentRepliesStateTest` — `beginLoadAll`
      fresh/skip-loaded-loading/inert-empty/inert-all-known, `previewTargets` first-N/fewer-than-limit/
      non-positive-limit/no-candidates/drops-loaded/bounds-before-drop; +5 `PostCommentsViewModelTest` —
      auto-load-without-tap, no-preview-for-zero-replies, capped-to-first-five, expand-previewed-no-refetch,
      empty-preload-no-rows) + 1 rewritten (`collapsing an expanded thread falls back to its reply preview`).
      Mutation-proven: dropping the `take(limit)` cap fails exactly the 3 cap tests (`previewTargets`
      first-N + bounds-before-drop, `capped to the first five`). **Post-detail realtime room now landed**
      (slice `feed-postdetail-realtime-comments`, 2026-07-18): `PostCommentsViewModel` subscribes to
      `SocialSocketManager.commentAdded` filtered to the route `postId`; a live top-level comment prepends
      via `CommentThreadState.received` (deduped, not marked pending), a live reply prepends via
      `CommentRepliesState.receivedReply` (only when the thread is expanded-or-loaded so no phantom partial
      thread) + bumps the parent's `replyCount`. +18 tests (6 `CommentThreadStateTest` `received`, 6
      `CommentRepliesStateTest` `receivedReply`, 6 `PostCommentsViewModelTest` realtime). Mutation-proven:
      flipping `received` prepend→append fails exactly the 3 ordering tests. **Live `comment:deleted` now
      landed** (slice `feed-comment-realtime-delete`, 2026-07-18): a new `SocketCommentDeletedData`
      (`postId`/`commentId`/`commentCount`, mirror of iOS) + `SocialSocketManager.commentDeleted` flow;
      `PostCommentsViewModel.onCommentDeleted` (filtered to the route `postId`) drops a top-level comment via
      `CommentThreadState.removed` + purges its thread via `CommentRepliesState.removedThread`, or drops a
      reply via `removedReply` (parent resolved through `parentOfReply`) + decrements the parent's `replyCount`.
      +22 tests (1 `SocialSocketManagerTest` decode, 5 `CommentThreadStateTest` `removed`, 10
      `CommentRepliesStateTest` `parentOfReply`/`removedReply`/`removedThread`, 6 `PostCommentsViewModelTest`
      realtime-delete). Mutation-proven: flipping the reply-delete decrement `-1`→`+1` fails exactly the
      count-decrement test. **Live comment heart reactions now landed** (slice `feed-comment-live-reactions`,
      2026-07-18): new `SocketCommentReactionUpdateData`/`SocketCommentReactionAggregation` (mirror of iOS
      `SocketCommentReactionUpdateEvent`) + `SocialSocketManager.commentReactionAdded`/`commentReactionRemoved`
      flows (`comment:reaction-added`/`comment:reaction-removed`); `CommentLikeState.reactionApplied(id, isOwn,
      added)` — an own reaction (echoed from this/another device) syncs the liked flag only and leaves the count
      `deltas` untouched (the optimistic toggle already moved it on this device — touching it on the echo would
      double-count), a third party's moves the count only (±1, clamped ≥0 at display), never the liked flag;
      idempotent for the own case. `PostCommentsViewModel.onCommentReaction` (filtered to the route `postId` +
      heart emoji, `isOwn = userId == currentUser.id`) folds it into the existing `CommentLikeState`, so the heart
      + displayed count flow through the existing `CommentProjection` — no new UI. Mirror of iOS
      `PostDetailViewModel` `commentReactionAdded`/`commentReactionRemoved` sinks. +15 tests (8
      `CommentLikeStateTest` `reactionApplied`, 2 `SocialSocketManagerTest` decode, 6 `PostCommentsViewModelTest`
      realtime). Mutation-proven: flipping the third-party delta sign (`+1`→`-1`) fails exactly 4 count-direction
      tests (2 pure + 2 VM). **Still open:** reply @mentions, the authoritative post `commentCount` badge resync
      (owned by `PostDetailViewModel`, a separate VM), per-post + comment cache-first.
      Prior comment thread: +41 tests (6 `CommentPrismeTest`, 9 `CommentProjectionTest`,
      12 `CommentThreadStateTest`, 14 `PostCommentsViewModelTest`).
      +12 `PostDetailViewModelTest` (mutation-proven: skeleton + revert branches).
      **Repost embed cell now landed** (slice `feed-repost-embed-cell`, 2026-07-17): a reposted/quoted
      post rendered as an accent-coherent quote block inside the feed card AND the post detail (and the
      saved / user-posts surfaces, for cross-surface coherence). Pure `RepostEmbedBuilder` projects
      `ApiPost.repostOf` → `RepostEmbedPresentation` (Prisme content via the shared, now-promoted
      `preferredEntry` law extended onto `ApiRepostOf` in `core:model`; author, avatar/media URL
      resolution, first-media preview + "+N" surplus, quote-vs-repost flag, story/reel kind badge).
      The embed's tap target is the ORIGINAL reposted post's id (never the outer card) — mirrors iOS
      `FeedPostCard.repostTapTargetId`; tapping opens its detail. Full story-/reel-canvas embed
      (iOS `StoryRepostEmbedCell`/`ReelRepostEmbedCell`) deferred — no Android story-canvas renderer
      yet, so those render the same quote block + discreet kind badge. +22 tests (14
      `RepostEmbedBuilderTest`, +2 `FeedPostBuilderTest` wiring, 6 `RepostPrismeTest`; mutation-proven
      on the media-surplus branch).
- [~] User-profile posts feed **done** (slice `feed-user-posts-screen`, 2026-07-17): cursor-paginated
      list of a user's authored posts. Generalised the saved-posts pattern into one SSOT — the page DTO
      (`PostPage`, with `BookmarkPage` now a typealias), the pure accumulation law (`PostPageListState`,
      `BookmarksListState` now a typealias) and the `foldPage` adapter are all shared. `sdk-core`:
      `PostRepository.getUserPostsPage(userId,cursor,limit)` (via `rawApiCall`, carries the
      `nextCursor`/`hasMore` watermark the plain `getUserPosts` drops; `success:false`/dataless → `Failure`
      through the single `foldPostPage` law). `UserPostsViewModel` (route `userId` via `SavedStateHandle`,
      cursor paging, skeleton-on-cold, pull-to-refresh, 5-from-tail infinite scroll, blank-id never hits the
      network) projects through the shared `FeedPostBuilder` (Prisme parity with the feed). `UserPostsScreen`
      reuses the feed card projection (read-only, no un-bookmark). Reached from a new profile **Publications**
      row (`onViewPosts` → `Routes.USER_POSTS = profile/{userId}/posts`); back returns to the profile, a reel
      taps to the reels player (no dead end). **community posts feed still pending** (the `getCommunityPosts`
      call + this cursor-list + `FeedPostBuilder` pattern can be reused). +16 tests (11 `UserPostsViewModelTest`,
      +5 `PostRepositoryTest`).
- [x] Bookmarked posts feed (saved posts) with infinite scroll — pure `BookmarksListState`
      (dedup-append cursor pagination + optimistic `removed` + `canLoadMore` law) driving
      `BookmarksViewModel` (cursor paging, optimistic un-bookmark with rollback, skeleton-on-cold,
      pull-to-refresh); `PostRepository.getBookmarksPage` carries the pagination watermark; reached
      from the feed top-bar bookmark action → `Routes.SAVED_POSTS` (slice `feed-bookmarks-screen`, 2026-07-17)
- [x] Post-detail room real-time subscriptions — closed 2026-08-16 (slice `post-detail-realtime-room`).
      Android had ZERO `post:join`/`post:leave` anywhere (`grep` exhaustive), even though
      `PostDetailViewModel` already listened to `comment:added`/`comment:deleted` for its comment-
      count badge — it worked only by the incidental fallback the gateway's `SocialEventsHandler`
      dual-broadcasts comments to (`ROOMS.post`+friend-feed-rooms per its own test name), which
      reaches a friend's activity but never a non-friend's, nor `post:liked`/`post:unliked` (those
      target `ROOMS.post` EXCLUSIVELY — `PostReactionHandler.ts`, no feed-room fallback). Added
      `SocialSocketManager.joinPostRoom`/`.leavePostRoom` (mirrors iOS `SocialSocketManager`,
      `socketManager.emit("post:join"/"post:leave", {postId})` — same `emit`-JSONObject pattern as
      `CallSignalManager`'s existing `call:join`/`call:leave`). `PostDetailViewModel` now joins on
      init (guarded on a non-blank route id) and leaves on `onCleared()`; the existing per-field
      `liveCommentCount` overlay generalised into a `LiveOverlay(commentCount, likeCount, isLiked)`
      so a live `post:liked`/`post:unliked` resyncs the like count and — only when `event.userId`
      is the viewer's own id — the `isLiked` flag, mirroring `FeedViewModel`/`FeedRealtimeReducer
      .like`'s established `mine: Boolean?` semantics (`null` = another user's action, count-only).
      Scoped to `PostDetailScreen` only this slice — iOS also joins the same room from
      `ReelsViewModel`/`StoryViewerView`/`FeedCommentsSheet`; those are real, separate follow-ups
      (documented, not silently dropped), each with its own screen/lifecycle to wire. +9 tests
      (`SocialSocketManagerTest` ×2 for join/leave; `PostDetailViewModelTest` ×7 for the join call,
      the blank-route no-op, viewer-own like/unlike, another-user's-like count-only, cross-post
      isolation, and refresh dropping the overlay).
- [x] Reel-viewer room real-time subscriptions — closed 2026-08-16 (slice `reels-realtime-room`),
      the first of the three follow-ups the line above deliberately deferred. `ReelsViewModel` had
      NO realtime handling of any kind: it never joined a post room, and its like counter only ever
      moved through `toggleLike`'s own optimistic arithmetic. That gap bites hardest precisely here
      — `getReels` ranks by *affinity* and serves reels from authors the viewer does not follow, so
      the friend-feed-room fallback that half-saved post detail does not exist for a reel; the
      gateway's own `commentBroadcastRooms` doc comment even names the « reel viewer » as the
      intended occupant of `ROOMS.post`. `ReelsViewModel.setCurrentReel(reelId)` now moves the
      subscription with the pager (leave the reel scrolled away from, join the one landed on —
      mirror of iOS `ReelsViewModel.currentId`'s `didSet`), idempotent and blank-safe, with
      `onCleared()` leaving the last room. `post:liked`/`post:unliked` resync the named reel's
      `likeCount` to the gateway's ABSOLUTE count (healing optimistic drift) and move `isLiked`
      only for the viewer's own id — the same `mine: Boolean?` convention as post detail and the
      feed. `ReelsScreen` drives it from `snapshotFlow { pagerState.currentPage }` keyed on the
      reel *ids* (structural equality) rather than on `state.reels`, which is a fresh list on every
      optimistic like. +12 tests — the reels module's first test file (join on settle, leave-then-
      join on page change, no re-join on re-settle, blank/null id never joins, null after a join
      still leaves, viewer-own like/unlike, another user's like count-only, optimistic-drift
      healing, cross-reel isolation, out-of-thread inertness, negative-count clamp, anonymous
      viewer). **Still open** (the remaining two of the three): `StoryViewerViewModel` and the feed
      comments sheet, each with its own current-item lifecycle.
- [x] Feed-comments-sheet room real-time subscription — closed 2026-08-16 (slice
      `feed-comments-realtime-room`), the second of the three follow-ups deferred above.
      `PostCommentsViewModel` (Android's take on iOS `FeedCommentsSheet`, presented full-screen over
      the feed/reels/post-detail comment thread) already listened to `comment:added`/`comment:deleted`/
      `commentReactionAdded`/`commentReactionRemoved` but never joined the post room itself — the same
      "modeled the listener, never opened the door" gap as the other two rooms. Re-proved against iOS:
      `FeedCommentsSheet.onAppear`/`.onDisappear` call `SocialSocketManager.shared.joinPostRoom`/
      `.leavePostRoom(postId: post.id)` (lines 704/724) — Android's `observeRealtime()` now calls
      `socialSocket.joinPostRoom(postId)` (guarded on the existing blank-route check) and a new
      `onCleared()` leaves it, mirroring `PostDetailViewModel`'s precedent exactly. No live post-like
      overlay needed here (unlike post detail/reels) — the sheet is presented over a surface that
      already tracks its own like state; only the room join/leave was missing. +2 tests (join on open,
      blank route never joins). **Still open** (the last of the three): `StoryViewerViewModel`.
- [x] Story-viewer room real-time subscription — closed 2026-08-16 (slice `story-viewer-realtime-room`),
      the last of the three room-join follow-ups `post-detail-realtime-room` named. `StoryViewerViewModel`
      had no `joinPostRoom`/`leavePostRoom` anywhere (`grep` exhaustive). Unlike the plain open/close of
      the feed-comments sheet, this one needed the slide-to-slide transition shape: iOS
      `StoryViewerView.transitionPostRoom(from:to:)` (lines 1188-1195) leaves the old story's room and
      joins the new one on every slide change, plus an initial join/final leave on `.onAppear`/
      `.onDisappear` (lines 569/600) — mirror of Android's own `ReelsViewModel.setCurrentReel`. New
      `transitionPostRoom(nextId: String?)` is called from `emit()` — the ViewModel's single "state
      changed" checkpoint, already recomputing `currentId = playback.currentSlide?.id` on every call —
      so the join/leave transition fires exactly when the displayed slide actually changes, and is a
      no-op (idempotent) for every other reason `emit()` runs (a reaction, an image-resolved callback,
      a language-override toggle). `onCleared()` leaves the last room, same shape as `PostDetailViewModel`/
      `ReelsViewModel`. +3 tests (initial join, leave-old/join-new on `advance()`, no re-join/re-leave on
      an unrelated emit). **All three deferred room-join follow-ups now closed.**
- [~] Repost / quote embed cell in the feed — the reposted/quoted post rendered as an
      accent-coherent quote block (author, Prisme content, first-media preview + "+N", quote/repost
      + story/reel kind badge) inside the feed card, post detail, saved and user-posts surfaces; tap
      opens the ORIGINAL post's detail. Pure `RepostEmbedBuilder` + shared `ApiRepostOf` Prisme law
      (slice `feed-repost-embed-cell`, 2026-07-17). **Reposted post's like count now shown** (slice
      `feed-repost-embed-like-count`, 2026-08-22): `RepostEmbedBuilder` projects `ApiRepostOf.likeCount`
      → `RepostEmbedPresentation.likeCount` (null → 0, negative payload clamped to 0, matching the
      established feed-realtime clamp precedent); the shared cell renders an accent-coherent heart +
      count row (parity iOS `FeedPostCard.repostView` / `PostDetailView.repostEmbed`), gated `> 0` to
      mirror the detail embed's restraint and avoid a "0 likes" clutter the feed card does not. +3
      `RepostEmbedBuilderTest` (projects / null→0 / clamps negative; mutation-proven: dropping the
      `coerceAtLeast(0)` fails exactly the negative-clamp test). New `feed_repost_likes_count` plurals
      EN/FR/ES/PT. **Reposted post's mood emoji now shown** (slice `feed-repost-embed-mood-emoji`,
      2026-08-23): gateway payload confirmed on the wire (iOS `APIRepostOf.moodEmoji` decodes it), so
      Android's `ApiRepostOf` gained `moodEmoji: String?` and `RepostEmbedBuilder` projects it →
      `RepostEmbedPresentation.moodEmoji` (blank → null, matching the feed card's own
      `post.moodEmoji?.takeIf { it.isNotBlank() }`); the shared cell prefixes it to the content on a
      firstTextBaseline `Row` (parity iOS `FeedPostCard.swift:966`). **Improvement over iOS:** the cell
      now renders the mood-only case (blank body + emoji) that iOS's own comment flags as previously
      "un corps vide" — a republished mood status is no longer an empty embed on Android. +3
      `RepostEmbedBuilderTest` (projects / absent→null / blank→null; mutation-proven: dropping the
      `takeIf { isNotBlank() }` fails exactly the blank test). No new strings (emoji is verbatim text).
      **Reposted post's location now shown** (slice `feed-repost-embed-location`, 2026-08-23):
      gateway payload confirmed on the wire (iOS `APIRepostOf.location` decodes it), so Android's
      `ApiRepostOf` gained `location: SharedPlace?` (reusing the `:core:model` SSOT — not duplicated)
      and `RepostEmbedBuilder` projects it through the **same** `FeedPostLocationBuilder` the outer
      feed card uses → `RepostEmbedPresentation.location`, so the label resolution has one source of
      truth. The shared cell renders a tappable `FeedPostLocationSticker` inside the quote block after
      the media preview (parity iOS `FeedPostCard.swift:989`); tap reuses the screen's `openPlaceOnMap`
      (`internal`, one map-open path, `geo:` intent + Google-Maps-web fallback — no dead-end). +3
      `RepostEmbedBuilderTest` (projects label+coords / absent→null / coordinate-only→null-label; the
      builder delegates to the already-mutation-proven `FeedPostLocationBuilder`). No new strings
      (reuses `feed_location_shared`/`feed_location_open`). **Still open:** the full story-/reel-canvas
      embed (needs an Android story-canvas renderer — iOS
      `StoryRepostEmbedCell`/`ReelRepostEmbedCell`).
- [x] Feed post location sticker (display side) — a received post's shared place rendered as an
      accent-coherent pin + label capsule under the post's media (slice `feed-post-location-sticker`,
      2026-08-23, parity iOS `FeedPostLocationSticker`). The composer already ATTACHED an outgoing
      location (`SharedPlace` in `:core:model`, `feed-composer-location`), but `ApiPost` dropped the
      field on the way IN, so a received location never surfaced. This lands the display side:
      `ApiPost` gained `location: SharedPlace?` (reusing the existing SSOT model — not duplicated),
      a pure app-side `FeedPostLocationBuilder` projects it → `FeedLocationPresentation(label, lat, lng)`
      with the label resolved name → address → null (iOS `displayLabel` precedence; the cell supplies
      the localized "Position partagée" fallback so a coordinate-only pin still shows a sticker), and
      the shared `FeedPostLocationSticker` cell renders it. Tap opens the place via a `geo:` intent
      with a Google-Maps-web fallback (no dead-end when no map app is installed). +11 tests
      (9 `FeedPostLocationBuilderTest` — null place, name, name-over-address, blank-name→address,
      absent-name→address, blank-both→null, absent-both→null, coord passthrough, coord-only; +2
      `FeedPostBuilderTest` wiring). Mutation-proven: dropping the name `isNotBlank` guard fails exactly
      the two blank-name tests. New strings `feed_location_shared`/`feed_location_open` EN/FR/ES/PT.
      **Repost-embed location now closed** (slice `feed-repost-embed-location`, 2026-08-23 — see the
      Repost / quote embed entry above): `ApiRepostOf.location` plumbed and projected through this same
      `FeedPostLocationBuilder`.

## G. Statuses / Moods
> **TTL correction (slice `status-mood-core`, 2026-07-19):** a mood **status expires 1h** after creation
> (`STATUS_EXPIRY_HOURS = 1`), NOT 21h — the "21h" in the audit is the **STORY** rule. The two are distinct.
- [~] Statuses/moods bar: emoji pills, popover details, infinite scroll — **model + laws SSOT landed**
      (slice `status-mood-core`, 2026-07-19): the pure foundation the bar/composer build on. `:core:model`
      `MoodStatusExpiry` (the 1h expiry law: `effectiveExpiresAtMillis` = explicit `expiresAt` or `createdAt+1h`
      fallback, `isExpired(now)`, `remaining(now)` → `Remaining(totalSeconds, Tier{EXPIRED/SECONDS/MINUTES})`
      with the iOS `timeRemaining` label shape, localisation left app-side) + `:sdk-core` `StatusMapper`
      (`ApiPost.toStatusEntry()` — guard `type=="STATUS"` + non-blank `moodEmoji` + author, avatarColor via
      `DynamicColorGenerator.colorForName`, via = `viaUsername ?? repostOf.author.username`, **carries
      `visibility` + `reactionSummary` the iOS converter drops**; `List<ApiPost>.toStatusEntries()` server-order
      filter; `List<StatusEntry>.orderedForBar(currentUserId)` — own-first then server order, deduped by id).
      +37 tests (19 `MoodStatusExpiryTest`, 18 `StatusMapperTest`; mutation-proven: `<=`→`<` on the expiry
      boundary fails exactly 1 test, `own+others`→`others+own` fails exactly the own-first test).
      **`StatusRepository` transport landed** (slice `status-repository`, 2026-07-19): `:sdk-core`
      `StatusRepository` (`PostApi` `getStatuses`/`getStatusesDiscover` endpoints + `likeWithEmoji`/`PostLikeRequest`
      body) — `StatusFeedMode{FRIENDS,DISCOVER}`, cursor-paginated `list()` folding the page into a `StatusPage`
      of already-mapped `StatusEntry`s via the `toStatusEntries` SSOT (non-statuses dropped, watermark carried,
      `foldStatusPage` mirroring `PostRepository.foldPostPage`), `create()` (POST type=STATUS → mapped entry, a
      non-status response → `PARSE` failure), `delete()`, `react(emoji)` → `POST /posts/:id/like` body. +13
      `StatusRepositoryTest` (list friends/discover endpoint-select, non-status filter, missing-pagination default,
      failure envelope, transport error; create maps entry/PARSE-guard/transport; delete + react success/failure;
      mutation-proven: `DISCOVER→getStatuses` fails exactly the discover-endpoint test, dropping the create
      `PARSE` guard fails exactly the non-status test).
      **`StatusesViewModel` landed** (slice `statuses-viewmodel`, 2026-07-19): `:feature:feed` `StatusesViewModel`
      (UDF `StateFlow<StatusesUiState>`) drives the bar over `StatusRepository.list` — the pure `StatusBarListState`
      accumulation SSOT (`appended` dedup-by-id + watermark, `created` front-hoist, `removed`, `reacted` count-bump)
      projected through the `orderedForBar` SSOT (own-first, deduped). `loadInitial` (guarded) / `refresh` /
      `loadMoreIfNeeded` (tail-threshold 3, silent-fail); `setMode(FRIENDS↔DISCOVER)` resets+reloads (inert on the
      active tab, mirrors iOS's per-mode instance); optimistic `setStatus`/`clearStatus`/`react` with rollback;
      `myStatus` surfaces only in FRIENDS mode. Cold open → skeleton then first page (no repo status cache yet, same
      as bookmarks — L1 cache is the tracked instant-app follow-up). +29 tests (11 `StatusBarListStateTest`,
      18 `StatusesViewModelTest`; mutation-proven: dropping the FRIENDS-only `myStatus` guard fails exactly the
      discover test).
      **Compose `StatusBarView` landed** (slice `status-bar-compose`, 2026-07-19): the `:feature:feed` `LazyRow`
      emoji-pill rail pinned atop `FeedScreen` (iOS `StatusBarView` parity). The pure `buildStatusBarCells` SSOT
      decomposes `StatusesUiState` into ordered `StatusBarCell`s — leading own/`MyStatus` or `AddStatus`, an inline
      `ErrorRetry` chip ONLY on a cold-empty failure (iOS `error != nil && statuses.isEmpty`), the other users'
      `Pill`s (deduped against the own cell), then a trailing `LoadingMore` spinner; `statusPopoverModel` projects a
      tapped entry into the thought-bubble popover (emoji + author + text + `via` + `MoodStatusExpiry` countdown).
      The Composable is thin glue: `loadMoreIfNeeded` on pill scroll-in, `refresh` on the retry chip, own-status
      accent via `hexColor(avatarColor)`, `Popup` popover. +13 tests (`StatusBarPresentationTest`: 9 cell-builder
      branches + 4 popover, mutation-proven: dropping the cold-empty `isEmpty()` guard fails exactly the
      error-not-surfaced-when-populated test). **Still open:** the popover's republish/react actions.
      **Status composer landed** (slice `status-composer`, 2026-07-19): the `:feature:feed` `StatusComposerSheet`
      (`ModalBottomSheet`) opened from the bar's `AddStatus` cell (previously inert — now real, no dead-end). The
      pure `StatusComposerDraft` owns every rule the Composable must not re-implement: the publish gate
      (`canPublish` = a mood emoji is picked, iOS `disabled(selectedEmoji == nil)`), the 122-char cap (`withText`
      clamps, iOS `onChange` prefix), the trimmed body actually sent (`trimmedContent`, `null` when blank), the
      near-limit counter warning (`> 100`), and the emoji toggle (tap the selected one to clear it) + visibility
      change. Publishes through `StatusesViewModel.setStatus(emoji, content, visibility)`. +14 tests
      (`StatusComposerDraftTest`, mutation-proven: dropping the `withText` clamp fails exactly the over-limit
      test; the toggle-deselect guard the emoji-clear test). **Deferred (follow-up §G):** EXCEPT/ONLY visibility
      needs a per-user audience picker Android lacks — this ships the 4 no-audience cases (PUBLIC/COMMUNITY/
      FRIENDS/PRIVATE, mirroring `StoryVisibility`); persisting the last-used visibility (iOS `@AppStorage`) and
      offline-draft recovery (iOS `recoverUnsentStatus`) are also tracked follow-ups.
- [x] Status composer: emoji grid, 122-char text, visibility (public/community/friends/private) — `status-composer`
      (except/only audience picker deferred, tracked above)
- [x] Mood status create, react, delete; 21h expiry + viewer tracking — **all five clauses now
      verified shipped** (last gap closed by slice `status-view-tracking`, 2026-08-17): create/react/
      delete via `StatusRepository.create`/`.react`/`.delete` wired through `StatusesViewModel.setStatus`/
      `.react`/`.clearStatus`; 21h expiry via `MoodStatusExpiry.remaining(expiresAt:)` consumed in
      `StatusBarPresentation`; **viewer tracking** was the last unchecked clause — found via the "ready
      backend, never wired to UI" heuristic's own iOS-reading step: `StatusViewModel.swift`'s doc
      comment states plainly "un mood EST un post… la barre de moods était le seul contenu du produit
      dont la portée restait à zéro" [a mood carries `impressionCount`/`viewCount` like any post, but
      no Android surface fed either]. Reused BOTH building blocks already shipped this session for
      regular posts rather than inventing anything new: the pill's on-screen appearance now calls
      `StatusesViewModel.trackImpression(statusId)` → the same `ImpressionBatcher` class
      (`source = "status"`, mirror of iOS's own `ImpressionBatcher(source: "status", ...)`) used by
      the feed; opening a status's popover (a single per-viewer-deduplicated VIEW, distinct from the
      batched impression) now calls `markStatusViewed(statusId)` → `PostRepository.viewPost`, the
      exact fire-and-forget shape of `PostDetailViewModel.recordView` from the previous slice. Wired
      in `StatusBarView.kt`'s existing `StatusBarCell.Pill` branch only — `StatusBarCell.MyStatus`
      (the viewer's own pill in their own bar) is a SEPARATE branch already, so it's naturally excluded
      exactly as iOS excludes `viewModel.myStatus` from its own tracking filter, with zero extra gating
      code needed. `impressionBatcher.flushNowAsync()` on `onCleared()`, mirroring `FeedViewModel`'s own
      established pattern. +3 tests (`StatusesViewModelTest`: view recorded once, blank id inert, a
      failed record doesn't disturb the loaded bar) — `trackImpression`'s own debounce/batch logic is
      already fully covered by `ImpressionBatcherTest`, so no duplicate ViewModel-level test, matching
      the precedent set by `FeedViewModel.trackImpression` (also untested at the VM level for the same
      reason).
- [x] Status thought-bubble popover on avatar tap with republish action — **republish landed** (slice
      `status-popover-republish`, 2026-07-19): the `Popup` popover already rendered emoji + author + text + `via` +
      `MoodStatusExpiry` countdown (`status-bar-compose`); this slice adds the **Republish** affordance — shown only
      on OTHER users' pills, hidden on the own MyStatus popover (`statusPopoverModel(entry, now, isOwn)` →
      `canRepublish = !isOwn`, the caller deriving `isOwn = entry.id == myStatus?.id`, null-safe so DISCOVER's
      myStatus-less bar makes every pill republishable — parity with iOS `StatusBubbleOverlay`'s `onRepublish != nil`
      gate). Tapping it opens the composer **pre-seeded** via `StatusComposerDraft.republish(source)` (source
      emoji/body/attribution/voice-audio pre-filled — port of iOS `initialEmoji/initialText/viaUsername/repostOfId/
      repostAudioUrl`); the sheet forwards a pure `StatusPublishRequest` to `StatusesViewModel.setStatus`, which now
      carries `viaUsername` through `StatusRepository.create` → `CreatePostRequest.viaUsername` (the wire field iOS
      sends). +12 tests (8 `StatusComposerDraftTest`: publish-request map/null-gate, republish seed/clamp/bodyless/
      blank-emoji/not-a-repost/attribution; 2 `StatusBarPresentationTest`: own hides / other offers republish; 1
      `StatusRepositoryTest`: create body carries repost attribution; 1 `StatusesViewModelTest`: setStatus forwards
      `viaUsername`). **The react half is a separate feature** — iOS puts reactions in a picker, NOT this popover;
      deferred to a follow-up.
      **L1 status cache landed** (slice `status-bar-l1-cache`, 2026-07-19): the in-memory `:sdk-core`
      `StatusBarCache` (keyed per `StatusFeedMode`, iOS `cacheKey = "statuses_<mode>"`) is the Android analogue of
      the memory tier of iOS `CacheCoordinator.statuses`. `StatusesViewModel` now paints a warm re-entry (or a switch
      back to an already-loaded feed) instantly from the cache before any network call: `loadInitial`/`setMode` route
      through a cache-first `loadFromCacheThenNetwork` (Fresh → serve, no fetch; Stale/Syncing → serve + background
      revalidate; Empty → skeleton + fetch, mirroring iOS `loadStatuses`' switch), the first network page + optimistic
      `setStatus`/`clearStatus` write through to the cache (iOS `saveCacheSnapshot`), and `refresh` invalidates then
      reloads (iOS `refresh`). The fresh/stale/expired decision is the new pure `classifyCache` SSOT, now shared by
      `cacheFirstFlow` too (no re-implementation). **Improvement over iOS:** an *expired* snapshot is still served
      while it revalidates (stale-while-revalidate) rather than discarded. +23 tests (6 `ClassifyCacheTest` boundary
      arms, 9 `StatusBarCacheTest`: empty/fresh-boundary/stale/syncing/per-mode isolation/invalidate-scope/re-save
      restamp, 8 `StatusesViewModelTest`: fresh-served-no-fetch, stale-paints-then-replaces, write-through-on-fetch/
      setStatus/clearStatus, mode-switch-instant, refresh-bypasses-cache). Mutation-proven: merging (not replacing) the
      first page fails exactly `a stale cached bar paints instantly then the network first page replaces it`. Disk L2
      tier (cold-launch parity across process death) is the tracked next follow-up.
- [x] Instant-app status bar (L1 in-memory cache, cache-first paint) — `StatusBarCache` (slice
      `status-bar-l1-cache`, 2026-07-19).
- [x] Instant-app status bar — **disk L2 cache** (cold-launch parity across process death) — **landed** (slice
      `status-bar-l2-cache`, 2026-07-19): Room-backed `StatusBarCacheRepository` (`:sdk-core/status`) persists the raw
      feed per `StatusFeedMode` (`statuses:friends` / `statuses:discover`) into a new `status_bar_cache` table (DB
      v10→11) and replays it, mirroring `ProfileStatsCacheRepository` exactly (row-presence = sync marker: absent →
      cold `null`, present `[]` → synced-empty; undecodable payload → cache miss, never a crash). `StatusesViewModel`
      wires it into the `CacheResult.Empty` (cold-L1) branch: seeds the bar from disk before the first network call
      (only while still cold and the mode has not switched underneath the read), then reconciles — every network first
      page and optimistic `setStatus`/`clearStatus` is written through to **both** tiers, and `refresh` invalidates the
      disk row too. The disk tier is a pure keyed store (opaque params, no product decision) so it stays in `:sdk-core`
      alongside `ProfileStatsCacheRepository`; the *when-to-read/write* orchestration stays in the `:feature:feed` VM.
      +17 tests (9 `StatusBarCacheRepositoryTest` Robolectric-Room: cold-null, round-trip-in-order, per-mode keying,
      two-feeds-independent, newest-wins, synced-empty≠cold, invalidate-scope, undecodable→null, rich-field round-trip;
      8 `StatusesViewModelTest`: cold-launch-disk-seed, cold-disk→skeleton, network-write-through, warm-L1-never-reads-
      disk, refresh-invalidates+writes-through, publish-write-through, clear-write-through, failed-clear-no-disk-write).
      Mutation-proven: flipping the seed's mode-equality guard fails exactly `a cold launch seeds the bar from the disk
      cache before the network answers`; dropping the network write-through fails exactly the two write-through tests.
- [x] Mood status react from the bar popover (reaction picker) — **landed** (slice `status-popover-reaction-picker`,
      2026-07-19): the popover now shows an existing-reactions summary row (pure `statusReactionChips` — count-desc,
      emoji tie-break) plus a quick-reaction strip (`EmojiCatalog.defaultQuickReactions`) gated to OTHER users'
      statuses (`StatusPopoverModel.canReact = !isOwn`); tapping fires the already-built optimistic
      `StatusesViewModel.react` and dismisses. Own status stays read-only (no react/republish), coherent with the
      republish gate.
- [x] Friends / Discover status feeds — **toggle UI landed** (slice `status-feed-mode-toggle`, 2026-07-19): the
      compact glass segmented `StatusFeedModeToggle` above the emoji rail drives the already-built
      `StatusesViewModel.setMode` (which serves the target feed's L1-cached bar instantly, no-op on the active feed).
      Pure `statusFeedModeTabs(current)` SSOT owns the order (explicit `[FRIENDS, DISCOVER]`, independent of the enum
      declaration) + selection. iOS ships only the friends feed (two `StatusViewModel` instances, no in-UI switch) —
      Android drives both from one VM, so this is a switch iOS never surfaced. `myStatus` surfaces only in FRIENDS
      mode, so DISCOVER coherently swaps the leading cell to Add. +4 `StatusBarPresentationTest` (both-feeds-offered,
      friends-first order, per-mode selection; mutation-proven: reversing `STATUS_FEED_TAB_ORDER` fails exactly the
      order test, hard-wiring selection to FRIENDS fails exactly the discover-selection test).
- [x] Statuses area **i18n (FR/ES/PT)** — **landed** (slice `status-strings-i18n`, 2026-07-20): the whole 26-key
      `status_*` family (`status_bar_*` / `status_feed_*` / `status_composer_*`) was `values/`-only; now fully
      localised in FR/ES/PT with format-specifier parity preserved (`%1$s`, `%1$d/%2$d`, …). Guarded by a new
      full-module `FeedStringLocalizationParityTest` (2 tests): (1) every base `<string>` key is translated in every
      shipped locale — no silent English fallthrough; (2) each translation keeps the base's positional format
      specifiers — a drifted/dropped arg is a runtime crash, so this is correctness not cosmetics. The guard is
      deliberately full-module so any future feed key added without its FR/ES/PT siblings turns red before it ships.
      Mutation-proven RED: pre-translation the parity test failed with exactly the 26 missing `status_*` keys per
      locale. Pure resource/parity slice — no product logic touched.
- [x] Statuses **realtime socket wiring** (live bar updates) — **landed** (slice `status-realtime-socket`,
      2026-07-20): full parity with iOS `StatusViewModel.subscribeToSocketEvents`. The social event bus gains four
      status flows — `SocialSocketManager` now `listen`s `status:created` / `status:updated` / `status:deleted` /
      `status:reacted` (canonical `SERVER_EVENTS` names — the prompt's `status:new`/`status:reaction` are informal
      labels), each decoding a new `@Serializable` `:core:model` DTO (`SocketStatusCreatedData{status: ApiPost}`,
      `SocketStatusUpdatedData`, `SocketStatusDeletedData{statusId,authorId}`, `SocketStatusReactedData{statusId,
      userId,emoji}` — mirrors of the iOS structs). `StatusesViewModel` folds the deltas straight into the live
      `StatusBarListState`: a friend's `status:created` hoists via `created` (mapped through `toStatusEntry`,
      **de-duplicated + not re-hoisted if already present** — iOS `if !contains`); `status:updated` replaces in
      place via the new pure `StatusBarListState.updated` reducer (inert when absent); `status:deleted` drops via
      `removed`; `status:reacted` bumps via `reacted`, **skipping the reactor's own echo** (`payload.userId !=
      currentUserId()`, since `react` already applied it optimistically). A non-`STATUS` payload (`toStatusEntry` →
      null) is ignored. Deltas fold into `listState` only; the next network `fetchFirstPage` reconciles the
      authoritative page (matches iOS's in-memory mutation — the cache tiers are reconciled by fetch/publish, not by
      each socket delta). +15 tests (2 `StatusBarListStateTest`: `updated` in-place/inert; 4 `SocialSocketManagerTest`:
      created/updated/deleted/reacted decode; 9 `StatusesViewModelTest`: created-hoist, created-echo-in-place,
      non-status-ignored, updated-in-place, updated-absent-inert, deleted-drop, reacted-other-bumps, reacted-own-echo-
      ignored). Mutation-proven RED: neutralising the own-echo guard fails **exactly** `a status reacted echo of the
      viewer's own reaction is ignored`; neutralising the created present-guard fails **exactly** `a status created
      echo of an already-present status leaves it in place` (2 of 42 fail, no collateral). SDK purity: the DTOs +
      event bus are stateless building blocks in `:core:model` / `:sdk-core`; the "which delta does what to the bar"
      orchestration stays in the `:feature:feed` VM.
- [x] Statuses **realtime `status:unreacted`** (live bar reaction-removal) — **landed** (slice `status-unreacted-socket`,
      2026-07-20): the symmetric inverse of the `status:reacted` handler, decoding the gateway's `status:unreacted`
      (canonical `SERVER_EVENTS`, shared `StatusUnreactedEventData`). A **SOTA symmetry the iOS `StatusViewModel` bar
      handlers lack** — iOS never folds reaction-removal into the bar. `SocialSocketManager` now `listen`s
      `status:unreacted` into a new `statusUnreacted` `SharedFlow` decoding `SocketStatusUnreactedData{statusId,userId,
      emoji}` (same shape as `SocketStatusReactedData`). A new pure `StatusBarListState.unreacted(statusId, emoji)`
      reducer drops one reaction, **clamped ≥0 and removing the spent bucket** when it hits zero (so no empty entry
      renders), inert (same instance) when the status is absent **or** carries no such reaction. `StatusesViewModel`
      folds the delta into the live bar **skipping the un-reactor's own echo** (`payload.userId != currentUserId()`,
      symmetric to `reacted`). +8 tests (5 `StatusBarListStateTest`: decrement, remove-bucket-at-zero, inert-absent-id,
      inert-no-such-reaction, inert-no-reactions; 1 `SocialSocketManagerTest`: `status:unreacted` decode; 2
      `StatusesViewModelTest`: other-user-decrements, own-echo-ignored). Mutation-proven RED: neutralising the own-echo
      guard (`if (true)`) fails **exactly** `a status unreacted echo of the viewer's own unreaction is ignored`.
      SDK purity: DTO + flow in `:core:model`/`:sdk-core`, the fold orchestration in the `:feature:feed` VM.

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
- [~] Call reconnection on network change (ICE restart) — **pure reliability policy landed**
      (slice `call-reliability-policy`): the `core:model` `CallReliabilityPolicy` is the SSOT for
      every reconnection *decision*, a total side-effect-free port of iOS `CallReliabilityPolicy`
      (`WebRTCTypes.swift`). `signalingDegraded(callEstablished, socketConnected)` drives the
      discreet "signaling deferred" hint without ever tearing down the DTLS-SRTP media path.
      `evaluateHalfOpen(inbound, outbound, secondsInConnected)` self-heals a silent-audio half-open
      path with exactly one ICE restart **only** once past a 4 s grace AND while we are still sending
      (`outbound > 0`) — a mute/mic-off (`outbound == 0`) is a business condition, not a transport
      fault, so it keeps waiting; the inbound gate is `>= 5` packets. `evaluateConnecting` bounds the
      `.connecting` phase (one ICE restart at 12 s, fail at 25 s, fail taking priority);
      `evaluateReconnecting` gives each `.reconnecting` attempt a 10 s watchdog budget so a silently
      stalled restart escalates instead of hanging forever. `evaluateReconnectTrigger` arbitrates the
      several independent reconnection sources (network-path edges, PC-state callbacks, watchdogs,
      restart-failure) into StartCycle/Coalesce/Escalate so a single blip doesn't burn the whole
      attempt budget on redundant edges. `reconnectingAllowed(state)` enforces the FSM invariant
      (only Connected/Reconnecting/Connecting), `shouldRearmRestartOnCredentialRefresh(state)`
      re-arms the in-flight restart the moment fresh TURN creds land mid-reconnect (inert elsewhere),
      and `shouldResetCallClock(wasReconnecting, hasExistingStartDate)` keeps the duration timer from
      freezing at 00:00 on a first-ever connect that transited `.reconnecting`. Reliability budget
      constants added to `CallQualityThresholds` (RTP gate 5, grace 4 s, connect 12/25 s, reconnect
      10 s). +28 behavioural tests (every arm + boundary + inert arm; three default-param tests pin
      the constants against iOS). Mutation (RED proof): neutralising the "still sending" gate
      (`outbound > 0` → `true`) fails **exactly** the mic-off test (28 tests, 1 failed, no
      collateral). **Pending:** the app-side actuator — the `WebRtcEngine` PC-state/`NetworkCallback`
      seam + watchdog timers that read these verdicts and perform the ICE restart / teardown.
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
- [~] Live in-call transcription overlay (on-device speech-to-text, leader/follower) —
      **pure captions core landed** (slice `call-captions-mode`): the `core:model`
      `CaptionsMode` is the SSOT for the live-captions button's 3-state cycle
      (`Off → Translated → Original → Off`), a faithful port of iOS `CaptionsMode`
      (`apps/ios/Meeshy/Features/Main/Models/CaptionsMode.swift`): `from(isTranscribing,
      showOriginalText)` derives the mode from the two authoritative flags with
      `isTranscribing` priority (a stale `showOriginalText` never surfaces `Original`
      while off), `next` always re-enters on `Translated` (never straight to `Original`),
      and `isShowingCaptions` gates the overlay. The pure `CallCaptionResolver` projects a
      `CallCaptionSegment` onto the on-screen `CaptionLine` under the current mode following
      the **Prisme Linguistique**: `Translated` shows the translation as native content and
      **falls back to the original words when none exists** (Prisme rule 1 — never a blank
      line), `Original` always shows the speaker's own words, `Off` yields nothing, and a
      blank-text segment renders no line; `resolveAll` drops blanks and keeps renderable
      lines in order. +24 behavioural tests. Mutation (RED proof): neutralising the
      blank-translation→absent fallback fails **exactly** the blank-translation test (1
      failed, no collateral). **P2P transcript transport core landed** (slice
      `call-datachannel-protocol`): the pure `core:model` `DataChannelCodec` + `DataChannelInbound`
      is the SSOT codec for the in-band WebRTC data channel (iOS labels it `"transcription"`),
      classifying an inbound frame into `Bye(reason)` / `Caption(segment)` / `Ignored` and
      encoding the outbound `bye` / `ping` / `caption` frames. Faithful port of iOS
      `DataChannelControlMessage` / `DataChannelInbound.decode` (`WebRTCTypes.swift`): a `bye`
      is the WhatsApp-style instant hangup shortcut, a `ping` is inert on receive, and any
      malformed/unknown/empty frame degrades to `Ignored` (never throws). **SOTA extension:** the
      same channel doubles as the captions transport — a `caption` frame carries a
      `CallCaptionSegment` straight to the remote overlay with no server round-trip, and a
      decoded caption is **always forced `isLocal = false`** (a wire `isLocal` claim can never
      make a received caption render as "you"). +30 behavioural tests. Mutation (RED proof):
      neutralising the blank-translation→null drop fails **exactly** the blank-translation test
      (1 failed, no collateral). **Rolling transcript accumulator core landed** (slice
      `call-transcript-buffer`): the pure, immutable `core:model` `LiveTranscript` +
      `CallTranscriptSegment` is the SSOT rolling transcript the overlay renders, a faithful
      port of iOS `CallTranscriptionService.appendSegment` (`CallTranscriptionService.swift`):
      `append(segment)` first drops that speaker's in-progress (non-final) line so at most one
      interim line per speaker is ever live while finalized lines survive, bounds the buffer to
      `retentionLimit` most-recently-*appended* segments (insertion-order suffix, iOS parity
      value 50) so a marathon call stays O(1), and `ordered` projects the retained set sorted by
      wall-clock `capturedAtMs` (a stable sort — ASR start-time is buffer-relative and resets on
      recognizer rotation). `captionLines(mode)` reuses the `CallCaptionResolver` SSOT for the
      Prisme projection. +21 behavioural tests. Mutation (RED proof): neutralising the finality
      gate (dropping `!isFinal` so a new segment evicts the speaker's finalized lines too) fails
      **exactly** the four finals-must-survive tests, no collateral. **Pending:** the app-side
      `EdgeTranscription` STT actuator
      (Android `SpeechRecognizer`), the `WebRtcEngine` data-channel seam that feeds
      `DataChannelCodec` and routes `Bye`/`Caption`, and the accent-coherent overlay UI +
      captions button that consume these cores.
- [ ] In-call translation data channel (dual-stream clean audio) — distinct from the caption
      transport above; this is the separate *clean-audio* stream for far-end translation, still
      pending.
- [~] In-call video filters (colour presets, low-light boost, background blur, skin smoothing) —
      **pure config + preset + auto-degrade cores landed** (slice `call-video-filter-config`): the
      `core:model` `VideoFilterConfig` (colorimetry temperature/tint/brightness/contrast/saturation/
      exposure + the two advanced passes background-blur/skin-smoothing + `hasAdvancedFilters`) is the
      SSOT the WebRTC capture-frame actuator consumes; `VideoFilterPreset` (Natural/Warm/Cool/Vivid/
      Muted, each with a stable `id` + `fromId` round-trip) projects to an enabled config at exact iOS
      parity. `VideoFilterDegradePolicy` is the pure two-tier count-based hysteresis reducer ported from
      iOS `VideoFilterPipeline.updateAutoDegradation`/`isSmoothingDegraded`: skin smoothing (pricier) sheds
      at half the over-budget threshold, the full advanced pass latches off at the threshold (10 slow
      frames >25ms) and restores only after a sustained under-budget streak (30 fast frames <15ms) — the
      confirm/restore asymmetry IS the hysteresis; `effectiveConfig(config, state)` is the SSOT projection
      both actuator and any "filters throttled" UI hint read from. **SOTA upgrade:** iOS buries this in a
      stateful `nonisolated` class with unbounded `Int` counters (untestable without a live GPU); Android
      is a total reducer whose two counters are **clamped** so state is O(1) over a multi-minute call.
      +30 behavioural tests. Mutation (RED proof): removing the over-budget clamp fails **exactly** the
      unbounded-counter test (17 tests, 1 failed, no collateral). **Pending:** the WebRTC `VideoProcessor`/
      `VideoSink` actuator (RenderEffect/GPU colorimetry + ML-Kit segmentation blur + face-detect smoothing)
      that applies `effectiveConfig` per captured frame, the low-light boost pass (folding `FrameLuminance`),
      and the accent-coherent filter panel UI (preset chips + advanced toggles).
- [ ] In-call audio effects (voice changer, baby/demon voice, looping background sound)
- [~] Camera-covered ("dark frame") detection during video calls — **pure detection
      core landed** (slice `call-dark-frame-detection`): the `core:model`
      `DarkFramePolicy` is the SSOT camera-covered detector — a total, side-effect-free
      reducer (`reduce(DarkFrameState, averageBrightness) → DarkFrameDecision`) ported
      from iOS `DarkFrameDetector`, with **count-based hysteresis**: the cover latches
      only after `consecutiveThreshold` (30, iOS default) consecutive frames whose
      average luma is **strictly below** `darkThreshold` (15.0f, iOS default), so a
      single dim frame never trips it, and clears the instant a bright frame returns
      (iOS's responsive restore). It emits `Covered`/`Uncovered` **exactly once** per
      stretch (idempotent while covered) and, a strict SOTA upgrade on iOS's unbounded
      `Int`, **clamps the streak counter** at the threshold so `DarkFrameState` is O(1)
      over a multi-hour covered stream (never overflows). The framework-agnostic other
      half, pure `FrameLuminance.averageOfYPlane(...)`, ports the iOS Y-plane luma
      averaging (sub-sampled, `rowStride`-aware so row padding is skipped, unsigned-byte
      correct) and returns `null` on degenerate geometry rather than a fake pitch-black
      reading. +24 behavioural tests (13 policy, 11 sampler). Mutation (RED proof):
      removing the streak clamp fails **exactly** the bounded-counter test (13, 1 failed,
      no collateral). **Pending:** the WebRTC `VideoProcessor`/`VideoSink` actuator seam
      (read the captured frame's I420 Y plane → `FrameLuminance` → `DarkFramePolicy`) +
      the in-call "camera may be covered" UI hint.
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
- [x] Contacts list (online/offline filters + counts, search, presence + mood-emoji) —
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
      and the friend row renders green/amber/none accordingly. **Mood-emoji presence shipped** (slice
      `contacts-mood-emoji-presence`, 2026-08-11): port of iOS `ContactsListTab.swift`'s
      `statusViewModel.statusForUser(userId:)?.moodEmoji` passed into `MeeshyAvatar`. `MeeshyAvatar`
      (`:sdk-ui`) already rendered a `moodEmoji: String?` badge (shipped with the avatar atom itself,
      just never fed a real value from Contacts) — this slice is the missing orchestration wire, not a
      new UI atom. New pure `List<StatusEntry>.statusForUser(userId) → StatusEntry?` (`:sdk-core/status`,
      exact port of iOS's `statuses.first { $0.userId == userId }`) backs a new
      `ContactsListUiState.moodEmojiFor(userId) → String?` (blank-guarded — a structurally-impossible-
      but-defended-against blank `moodEmoji`). `ContactsListViewModel` now injects the already-existing
      `StatusBarCache` (`:sdk-core`, the Feed status bar's L1 in-memory cache) and reads its **FRIENDS**-
      mode snapshot synchronously on every `load()` — deliberately best-effort, no dedicated network
      fetch of its own: `valueOrNull` collapses Fresh/Stale/Syncing uniformly (a decorative avatar badge
      doesn't need a freshness distinction, mirrors the existing `CategoryRepository` precedent), and a
      cold/never-loaded cache just means no badges yet — exactly iOS's own behaviour before its Feed
      status bar has ever loaded (no popup, no error, the row simply renders without the badge). +9 tests
      (4 `StatusMapperTest`: found/absent/empty-list/first-of-duplicates; 5 `ContactsListViewModelTest`:
      pure state blank-guard, live emoji painted from the FRIENDS cache, no emoji when the user has no
      live status, and the DISCOVER cache never leaking into a Contacts row). Mutation-proven: dropping
      `moodEmojiFor`'s blank-guard fails **exactly** the pure state test (21 others green); swapping the
      cache read from `StatusFeedMode.FRIENDS` to `.DISCOVER` fails **exactly** the two mode-scoped tests
      (19 others green). Both applied via a scratch `cp`-backed edit (never `git checkout --`), restored
      via `cp`, diffed clean against the backup afterward. **Deliberate, documented scope cut**: only the
      Contacts tab is wired this slice (the checklist bullet this closes is specifically "Contacts list")
      — Discover/Requests/Blocked tabs' `MeeshyAvatar(...)` call sites still pass no `moodEmoji` and are
      a natural, small follow-up (same `moodEmojiFor` pattern, same `StatusBarCache` injection, per-tab
      `StatusFeedMode` where relevant — Discover reads the DISCOVER-mode cache, not FRIENDS). No
      cross-screen reactivity: a mood set/cleared while the Contacts tab is already open only shows up on
      the next `load()` (pull-to-retry or re-entry), never live via a socket/Flow — matches the
      "best-effort decoration, not primary content" scope, tracked as a future refinement alongside the
      other 3 tabs, not a regression (iOS itself has no live-update wiring into this specific row either,
      only through re-render on the shared `statusViewModel`'s own `@Published` updates when SwiftUI
      happens to re-evaluate the row).
      **Presence dot now updates LIVE (2026-08-11, slice `presence-live-contacts-overlay`)** — a
      DIFFERENT gap than the mood-emoji one just above: the three-state online/away/offline dot
      shipped by `presence-away-indicator` (2026-07-04) read `FriendRequestUser.isOnline`/
      `lastActiveAt` off the roster's last full `/friends` fetch only, frozen until the next reload
      — unlike mood, this one already HAD a live wire target ready to use: `MessageSocketManager`
      already listened for `user:status`/`presence:snapshot` (both real, gateway-emitted events —
      confirmed via `SERVER_EVENTS.USER_STATUS`/`_broadcastUserStatus` in
      `MeeshySocketIOManager.ts`), just with zero consumers anywhere in the app. **A genuine
      correctness bug found and fixed en route**: `UserStatusEvent`/`PresenceSnapshotEvent`
      (`:core:model`) didn't even match the real payload shape (`status`/`lastSeenAt`/flat
      `onlineUserIds: List<String>` vs. the gateway's actual `isOnline`/`lastActiveAt`/`username` /
      `{users: [...]}`) — so even wiring a consumer to the OLD shape would have silently decoded
      every live frame to blank defaults. Fixed both DTOs against the shared TS type
      (`packages/shared/types/socketio-events.ts`), then wired `ContactsListViewModel.
      observePresence()` (mirrors the existing `observeFriendshipCache()` pattern) to overlay live
      updates via new pure `PresenceOverlay.applyStatus`/`.applySnapshot` (`:feature:contacts`).
      +15 tests (4 `UserStatusEventTest` decode-contract, 6 `PresenceOverlayTest`, 3 new
      `ContactsListViewModelTest`). Mutation-proven on the filter/decode branches. Conversation-
      participant presence (a separate, still-open gap noted in the Home-screen widgets item
      above) can now reuse this same corrected wire in a future slice.
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
- [~] Invite by email; invite by SMS; import phone contacts — **email invite shipped**
      (slice `discover-email-invite`, 2026-08-17). Found via the "ready backend, never wired
      to UI" heuristic: `FriendRepository.sendEmailInvitation(email) → NetworkResult<EmailInvitationResponse>`
      was fully implemented and tested at repository level with zero call sites anywhere in
      `apps/android`. Port of iOS `DiscoverViewModel.sendEmailInvitation`/`DiscoverTab.emailInviteCard`
      (`Features/Contacts/`, not the conversation-scoped `InviteFriendsSheet.swift` an earlier
      search wrongly settled on). `DiscoverUiState` gained `emailText`/`isSendingInvite`/
      `inviteErrorMessage`; `DiscoverViewModel.onEmailTextChanged`/`sendEmailInvitation` trim +
      guard-non-empty + in-flight guard, mirroring iOS's `emailText`/`isSendingInvite` flow
      exactly. New `EmailInviteCard` composable in `DiscoverTab.kt` (icon + title, `TextField` +
      `Button`, `Button` disabled when `emailText.isEmpty() || isSendingInvite`) sits above the
      search field, matching iOS's `inviteSection` position at the top of Discover. **Narrower
      than iOS by design**: no toast — Android's Discover module has zero toast/snackbar
      infrastructure (confirmed via exhaustive grep across `apps/android/feature`), so success
      feedback is implicit (field clears + button disables) and failure surfaces as an inline
      `Text` next to the card via the new `inviteErrorMessage` field — deliberately NOT the
      existing `errorMessage` field, which drives a full-screen `ErrorState` wrong for a
      transient invite failure. +4 tests
      (`DiscoverViewModelTest`: trimmed send + field clear on success, blank address never hits
      the network, error surfaces + address kept for retry, second concurrent call is a no-op).
      Strings ×5 across EN/FR/ES/PT. **SMS invite shipped** (slice `discover-sms-invite`,
      2026-08-17): port of iOS `DiscoverTab.smsInviteCard`/`DiscoverViewModel.phoneText`/
      `smsMessage` — unlike email, no network call at all; iOS just opens
      `MFMessageComposeViewController` pre-filled with the number + a fixed invite message.
      `DiscoverUiState.phoneText` + `DiscoverViewModel.onPhoneTextChanged` hold the draft (never
      cleared on send — mirrors iOS, which also leaves `phoneText` untouched after presenting
      the composer sheet, since the viewer may cancel it). New `SmsInviteCard` composable
      launches `Intent(ACTION_SENDTO, "smsto:$phone")` with `putExtra("sms_body", …)` via
      `runCatching` — the same guarded-launch idiom `ChatLinkOpener.openExternally` already uses
      for a missing handler, Android's platform equivalent of iOS's `canSendText()` pre-check
      (no toast: same "Android has no toast/snackbar infra yet" constraint as email). The invite
      message is a plain Kotlin constant, deliberately **not** localized — faithful to iOS's own
      `smsMessage`, which is a hardcoded literal, not wrapped in `String(localized:)`. +1 test
      (`onPhoneTextChanged updates the phone field`; the actual send is thin Composable glue,
      exempt from the JVM TDD gate per `TDD-COVERAGE.md`). Strings ×4 across EN/FR/ES/PT.
      **Still open**: import phone contacts — needs `READ_CONTACTS` runtime permission + a
      multi-select picker, a materially bigger surface; left for a future slice.
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
      **Avatar + banner upload shipped** (slice `profile-avatar-banner-upload`, 2026-07-11): the media
      pipeline is now wired to the profile image. Pure `:core:model` SSOTs: `ImageUploadTarget`
      (AVATAR/BANNER, each with a per-target `maxBytes` ceiling — 8 MiB / 12 MiB), `ImageUploadValidator`
      (priority-ordered gate: empty → non-image → oversize → Accepted; MIME parsed before any `;` param,
      case-folded; so a `video/mp4` or blank type is rejected and a 10 MiB file passes as a banner yet fails
      as an avatar), `AvatarBannerUpload.firstUploadedUrl` (first non-blank uploaded URL, else `null`), and
      `AvatarBannerApply.apply(user, target, url)` — the optimistic-paint merge SSOT mirroring
      `ProfileEditApply` (overwrites only the targeted field). Orchestration: a dedicated
      `AvatarBannerUploadViewModel` (`:feature:profile`) validates the pick (reject → typed
      `ImageUploadError`, no network touched) → uploads via the existing `MediaRepository`/`MediaApi` (reused
      unchanged) → paints the returned URL optimistically onto the session → confirms with the existing
      `UserRepository.updateAvatar`/`updateBanner` PATCH → adopts the server's canonical identity, or rolls
      the session back to the snapshot on failure. Single-flight guard drops a second pick mid-flight;
      `viewModelScope` work rethrows `CancellationException`. `ProfileScreen` glue: the edit-mode avatar is
      tappable (Indigo camera badge, spinner overlay while uploading) via `PickVisualMedia` (image-only), and
      a "Change cover photo" button uploads the banner; errors surface in the snackbar (EN/FR/ES/PT). Reuses
      the media pipeline entirely — no new endpoint. Surpasses iOS, which uploads only a single compressed
      JPEG avatar (no banner). +36 tests (ImageUploadValidator 14, AvatarBannerApply 4, AvatarBannerUpload 4,
      AvatarBannerUploadViewModel 14). **Pending:** in-place crop/resize/compress step before upload.
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
- [x] Profile QR code display + save/share; share profile via message/email/copy link —
      **shipped** (slice `profile-share`, 2026-07-11), and it **surpasses iOS**, which has no
      profile-share affordance. Pure `:core:model` `ProfileShareLink` is the cross-platform link SSOT:
      `https://meeshy.me/u/{username}` Universal Link + `meeshy://u/{username}` custom scheme, mirroring
      the iOS `DeepLinkParser` contract (`u` = the AASA-claimed user segment) so a QR/link made on
      Android resolves in every client. `canonicalUsername` trims + strips a display-only leading `@`
      (blank / lone-`@` → `null`); `webLink`/`appLink` percent-encode the handle as an RFC 3986 path
      segment (unreserved passthrough, space→`%20`, non-ASCII→uppercase UTF-8 bytes, reserved→`%XX`).
      Pure `:feature:profile` `ProfileShareBuilder.build(user) → ProfileSharePresentation?` (precedent
      `ProfileHeaderBuilder`) projects `effectiveDisplayName`, `@handle` (same `canonicalUsername` SSOT
      so handle ⇄ link never diverge) and both links; `null` when the handle is blank so the affordance
      hides instead of emitting a dead URL. Glue (exempt): `ProfileShareSheet` (ModalBottomSheet with a
      zxing-rendered QR of the web link on a white card + Copy-link + system Share-chooser), a **Share**
      app-bar action on both own and other profiles, EN/FR/ES/PT strings; added `com.google.zxing:core`.
      +22 tests (ProfileShareLink 16, ProfileShareBuilder 6). **Pending:** save the QR image to a file.
- [x] Block / unblock users; report a user (reason + details) — **complete**. Block/unblock shipped
      earlier (durable `BlockRepository` + `BlockedTab`). **Report a user shipped** (slice `report-user`,
      2026-07-11): port of iOS `ReportUserView`, corrected to the gateway contract. Pure `:core:model`
      `ReportReason` (5 reasons, each carrying the **lowercase** gateway `reportType` token —
      spam/harassment/inappropriate/impersonation/other) fixes an iOS bug where `ReportReason.rawValue`
      is UPPERCASE (`"SPAM"`…), values the gateway `createReportSchema` zod enum rejects (an iOS user
      report is silently a `400`). Pure `ReportRequestBuilder.forUser(userId, reason, details) →
      CreateReportRequest?` SSOT: blank id → `null` (inert), details trimmed + blank→null + capped at 500
      (iOS editor-cap parity), `explicitNulls=false` so a null note is omitted from the wire body.
      `:core:network` `ReportApi` (`POST admin/reports`, any authenticated user). `:sdk-core`
      `ReportRepository.reportUser` — **deliberately online** (not a durable outbox action like block: a
      report expects explicit confirmation/error, a silently-deferred report is worse UX), session-gated
      so a signed-out caller can't fire a guaranteed `401` (inert `null`). `:feature:profile`
      `ReportUserViewModel` (UDF immutable `ReportUserUiState`, `canSubmit` guards a double-tap / re-submit
      after success, error is retryable, details cap enforced on input) + `ReportUserScreen` (accent/error
      red reason radios + details field + counter) reached from a **Report** action in the other-user
      profile's app bar (own profile shows Edit instead). +28 tests (ReportReason 6, ReportRequestBuilder 9,
      ReportRepository 5, ReportUserViewModel 8). EN/FR/ES/PT strings. Surpasses iOS (correct wire token +
      testable UDF + retryable error state).
- [x] Change email / phone (two-step verification) — `settings-account-contact-change` (2026-08-11): `AccountContactViewModel`/`AccountContactScreen` (`:feature:settings`), reached via a new Settings row between Two-factor and Active sessions. Email confirms out-of-band (a link mailed to the new address — mirrors iOS `SecurityView`, which never wires `verifyEmailChange` into any UI either) with a 60s resend cooldown (`MagicLinkCountdown` reused verbatim); phone confirms in-app via a 6-digit SMS code (`changePhone` → `verifyPhoneChange`), refreshing the session on success. Both online-only (like `ChangePasswordViewModel`), never optimistic/offline-queued. Reuses `SignupFieldValidation.isEmailValidLocally`/`isPhoneValidLocally` for the local submit gates — no new validator duplicated. +31 tests. Mutation-proven: `canVerifyPhoneCode`'s length check and `toPhoneVerifyErrorKind`'s httpStatus==400 branch each fail exactly their pinning test.
- [x] Two-factor auth: QR enrollment, code verification, backup codes (view + regenerate), disable — `settings-two-factor-auth` (2026-08-11)
- [x] Active device sessions: list, revoke one, revoke all others — shipped `761164959` (2026-08-10, `ActiveSessionsScreen`/`ActiveSessionsViewModel`), confirmed still live on-device 2026-08-11
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
      online-only. **Email channel toggle shipped 2026-08-17** (slice
      `settings-email-notification-toggle`): `UserNotificationPreferences.emailEnabled` already
      synced end-to-end through `NotificationPreferenceSyncBody` — the field just had no
      `SettingsViewModel` intent and no `SettingsScreen` row. New `setEmailEnabled(enabled)`
      (mirrors `setSoundEnabled`'s `updateNotifications { it.copy(...) }` shape) + a
      `NotificationToggleRow` placed right after Push, matching iOS `NotificationSettingsView`'s
      order (Push → Email → Sound → Vibration). Unlike Sound/Vibration/NewMessage on Android
      (gated `enabled = notifications.pushEnabled`), the Email row is **not** gated on push —
      iOS's `notifToggle` helper carries no such dependency for any of its rows, and email is a
      genuinely independent delivery channel. +1 test (`setEmailEnabled_persists`). 1 new string
      across EN/FR/ES/PT.
- [x] Privacy settings (visibility, contacts, media/data, encryption preference) — **shipped**
      (slice `settings-privacy-preferences`, 2026-07-11). Port of iOS `PrivacySettingsView` +
      the visibility/contacts/media legs of `PrivacyPreferences`. **Reuses the existing**
      `PrivacyPreferences` SSOT (`:core:model` `Preferences.kt`, the full 16-field iOS port — this
      slice is its first persistence consumer), building around it: a pure `:core:model`
      `PrivacyCatalog` (`PrivacyToggle` × `PrivacyCategory` — Visibility / Contacts & groups /
      Media & data — with a get/set lens per toggle so an edit read-modify-writes exactly one boolean
      and never clobbers the rest, plus a `sections()` grouped projection) and a corruption-safe JSON
      codec (`storageValue` / `privacyPreferencesFromStorage` — blank/absent/malformed → defaults,
      partial fills missing fields, unknown keys ignored). Durable DataStore-backed
      `PrivacyPreferencesStore` (`:sdk-core`, hydrates on cold start, corrupt value → defaults; Hilt
      provider). `PrivacySettingsViewModel` (`:feature:settings`) mirrors the store into an immutable
      `PrivacyUiState` and writes a per-toggle change through the catalog lens — the base is read
      **inside** the `viewModelScope.launch` so back-to-back edits serialize and never clobber, and a
      re-set of a toggle's current value is an inert no-op. `PrivacySettingsScreen` (glue): one
      accent-coherent section per category with Material switch rows, plus a non-interactive
      **coming-soon Encryption section** mirroring iOS's greyed-out block (the model's encryption
      fields round-trip untouched but stay non-editable — product decision 2026-06-14). Reached from a
      new "Privacy & visibility" row at the top of Settings → Privacy (`Routes.PRIVACY`). +28 tests
      (catalog/codec 16, store 7, VM 5). EN/FR/ES/PT strings. This ships the fully-tested visibility/
      contacts/media toggle surface + durable device-local persistence.
      **Offline-queued backend sync landed** (`settings-privacy-preferences-sync`, 2026-07-11): the
      privacy block now propagates to the gateway (`PATCH /me/preferences/privacy`) durably. Pure
      `:core:model` `PrivacyPreferenceSyncBody.from(prefs)` projects **only the twelve editable
      toggles** — the read-only encryption leg (`encryptionPreference`/`autoEncrypt…`/…) and local
      `extras` are deliberately dropped, so because the gateway PATCH is a partial merge a sync never
      stamps device defaults over server-side encryption prefs (a genuinely better contract than a
      blind full-block push). `core/network` `PreferencesApi.updatePrivacy`; a **new**
      `OutboxKind.UPDATE_PRIVACY_SETTINGS` on the shared `SETTINGS` lane (distinct kind from
      notification's `UPDATE_SETTINGS` so the two coalesce independently and never clobber each other),
      an `OutboxCoalescer` latest-snapshot rule, an `OutboxFlushWorker` `UPDATE_PRIVACY_SETTINGS`
      sender; `:sdk-core` `PrivacyPreferencesSyncRepository` (session-gated durable enqueue keyed by
      own user id; inert with no session). `PrivacySettingsViewModel.setToggle` now persists to the
      device-local store instantly (UI SSOT) **then** enqueues the sync + wakes the worker on a real
      `cmid` (a no-op re-set neither syncs nor wakes). The PATCH is idempotent, so a retry is harmless
      (no rollback). +13 tests (SyncBody 3, SyncRepository 5, VM +3, Coalescer +2). Surpasses iOS,
      whose privacy-preference write is online-only.
- [x] Auto-download settings for media by type and connection (Wi-Fi/cellular) — **shipped** (slice
      `settings-media-auto-download`, 2026-07-11). Port of iOS `MediaDownloadSettingsView` +
      `MediaDownloadPreferences`/`MediaDownloadPolicyEngine`/`NetworkConditionMonitor`. Pure `:core:model`
      SSOTs: `AutoDownloadPolicy` (always / wifiAndGoodCellular / wifiOnly / never) × `MediaKind` (image /
      audio / audioTranslation / video) → `MediaDownloadPreferences` (per-kind policy, iOS defaults, `policy(kind)`
      + `withPolicy(kind, policy)` lens), the corruption-safe JSON codec (`storageValue` /
      `mediaDownloadPreferencesFromStorage`), `MediaDownloadPolicyEngine.shouldAutoDownload(kind, condition, prefs)`
      (the 4×4 truth table + offline gate), and `NetworkConditionResolver.resolveFromFlags(...)` (the pure
      connectivity-flag → `NetworkCondition` resolver; iOS's unused `isExpensive` arg dropped). Durable
      DataStore-backed `MediaDownloadPreferencesStore` (`:sdk-core`, hydrates on cold start, corrupt value →
      defaults). `MediaDownloadViewModel` (`:feature:settings`) mirrors the store into an immutable UI state and
      writes a per-kind policy through the store SSOT — the base is read **inside** the `viewModelScope.launch`
      so back-to-back edits on different kinds serialize and never clobber, and a re-selection of the current
      policy is an inert no-op. `MediaDownloadScreen` (glue): one accent-coherent section per kind with a
      single-choice `RadioButton` list, reached from a new "Auto-download" row in Settings → Data
      (`Routes.MEDIA_DOWNLOAD`). +37 tests (engine 6, resolver 9, prefs/codec 10, store 7, VM 5). EN/FR/ES/PT
      strings.
- [x] Media auto-download decision pipeline — the live `ConnectivityManager` monitor + the first consumer of
      `MediaDownloadPolicyEngine` — **shipped** (slice `media-auto-download-decider`, 2026-07-12). Closes the
      "next slice" NB left by `settings-media-auto-download`. Two pure `:core:model` SSOTs: `MediaKindClassifier`
      (wire MIME → `MediaKind?`; strips the `;`-parameter, trims, case-folds; `image/`→IMAGE, `video/`→VIDEO,
      `audio/`→AUDIO or AUDIO_TRANSLATION per the translation flag; a document / blank / bare top-level token →
      `null` = never auto-fetched) and `MediaAutoDownloadDecider.decide(kind, availability, condition, prefs) →
      AutoDownloadDecision` (the guard chain iOS inlines in `ConversationMediaViews`'s auto-DL `.task`: unsupported
      kind → SKIP_UNSUPPORTED, on-disk → SKIP_ALREADY_AVAILABLE, in-flight → SKIP_IN_FLIGHT, else the
      `MediaDownloadPolicyEngine` verdict → DOWNLOAD / SKIP_POLICY; `decideFor(mimeType,…)` classifies then decides).
      `MediaAvailability` (AVAILABLE/DOWNLOADING/NEEDS_DOWNLOAD) + `AutoDownloadDecision` (with `shouldDownload`).
      `:sdk-core` `NetworkConditionMonitor` (interface + `InMemoryNetworkConditionMonitor` fake +
      `AndroidNetworkConditionMonitor` — the `ConnectivityManager` glue that maps the default network's
      `NetworkCapabilities` onto the four flags the pure, already-tested `NetworkConditionResolver` consumes;
      exposed as a `StateFlow<NetworkCondition>`), Hilt-provided as a `@Singleton`. The future chat media view
      injects the monitor + `MediaDownloadPreferencesStore` and calls the pure decider — the "when to auto-DL"
      rule stays app-side (grain rule). +24 tests (MediaKindClassifier 13, MediaAutoDownloadDecider 11). No new
      DataStore store (no flake surface). EN/FR/ES/PT strings: none needed (no user-facing copy).
- [ ] Local-first user preferences (7 categories) — instant UI + debounced offline-queued sync
- [x] Change password with strength meter + validation — **shipped** (slice `settings-change-password`,
      2026-07-11). Port of iOS `ChangePasswordView` + `PasswordStrengthIndicator`, surpassing it with one SOTA
      gate iOS lacks (the new password must differ from the current one). Two pure `:core:model` SSOTs:
      `PasswordStrength.evaluate(password) → PasswordStrengthLevel` (the 6-band meter — length≥8, length≥12,
      upper, lower, digit, symbol; capped at 5, empty → TOO_WEAK) and `ChangePasswordForm.validate(current, new,
      confirm) → ChangePasswordValidation` (per-rule flags `isCurrentPresent`/`isNewLongEnough`/`passwordsMatch`/
      `isNewDifferent` + composite `canSubmit`). Online-only network path (the gateway must verify the current
      password against the stored hash — cannot be optimistic/offline): `ChangePasswordRequest`/`ChangePasswordResponse`
      (`:core:model`), `UserApi.changePassword` (`PATCH /users/me/password`), `UserRepository.changePassword`.
      `ChangePasswordViewModel` (`:feature:settings`) holds the three buffers, derives the live strength + validation
      off the pure SSOTs, submits with a synchronous double-tap guard, clears the plaintext buffers on success, and
      maps the failure to a targeted `ChangePasswordError` (HTTP 400 → INCORRECT_CURRENT, transport → NETWORK, else
      GENERIC). `ChangePasswordScreen` (glue, coverage-exempt): current/new/confirm fields with per-field visibility
      toggles, a 5-bar accent-coherent strength meter, per-rule hint rows, submit gated on `canSubmit`, reachable via
      a new "Change password" row in the Settings → Privacy section (`Routes.CHANGE_PASSWORD`). +32 tests
      (PasswordStrength 14, ChangePasswordForm 9, ChangePasswordViewModel 9). EN/FR/ES/PT strings.
- [x] GDPR data export (JSON/CSV, selectable scope, share/save file) — **shipped** (slice
      `settings-data-export`, 2026-07-11). Port of iOS `DataExportView` + `DataExportService`,
      **surpassing iOS** on two counts: (1) iOS's share wrapper dropped the actual profile/messages/
      contacts payload and shared only the summary counts — Android shares the **full** payload; (2)
      the export is shared as a real **file** via FileProvider, not truncatable `EXTRA_TEXT`. Three
      pure `:core:model` SSOTs: `DataExportRequestBuilder.build(selection) → DataExportQuery` (the
      always-on `profile` rule + `types` order `profile,messages,contacts` + `format` token, mirroring
      the gateway `parseTypes`), `DataExportData` (the full response model — timestamps kept as raw
      ISO strings so the payload round-trips losslessly to a JSON file), and
      `DataExportFileBuilder.build(data) → ExportArtifact` (fileName from a filesystem-safe stamp of
      the ISO `exportDate`; `text/csv` when the server returned a non-empty `csv` map, else an
      `application/json` re-encoding of the whole payload — so a CSV request with no sections is never
      an empty file). `:core:network` `DataExportApi` (`GET me/export`); `:sdk-core`
      `DataExportRepository` is **deliberately online** + session-gated (the gateway builds the export
      on demand from a live DB read — nothing to defer; a signed-out caller can't fire a guaranteed
      `401`, inert `null`). `:feature:settings` `DataExportViewModel` (UDF immutable state; double-tap
      guard; any selection change invalidates a stale artifact so the user never shares a file that
      doesn't match the current scope; re-selecting the current value is inert; failure → NETWORK/
      GENERIC) + `DataExportScreen` (format picker + content toggles + summary card whose Share action
      writes the artifact to `cacheDir/exports` and launches the chooser). Added a FileProvider
      (`${applicationId}.fileprovider` + `res/xml/file_paths.xml`) to the app module, wired the
      previously no-op Settings → Data "Export my data" row (`Routes.DATA_EXPORT`). +34 tests
      (RequestBuilder 7, FileBuilder 8, DataDecode 3, Repository 4, ViewModel 12). EN/FR/ES/PT strings.
- [x] Account deletion (typed-phrase confirmation + email-confirmation flow) — **shipped** (slice
      `settings-account-deletion`, 2026-07-11). Port of iOS `DeleteAccountView` + `AccountService.deleteAccount`.
      Pure `:core:model` `AccountDeletionConfirmation` SSOT: `REQUIRED_PHRASE = "SUPPRIMER MON COMPTE"` (the gateway
      `z.literal` contract, delete-account-schemas.ts) + `isConfirmed(typed)` — a **verbatim** match (no trim, no
      case-fold: any leniency that cleared the client gate would be a guaranteed server `400 INVALID_CONFIRMATION`);
      the wire always carries the canonical `REQUIRED_PHRASE`, never the raw buffer, so gate ⇄ body can never
      diverge. `:core:model` `DeleteAccountRequest`/`DeleteAccountResponse`; `:core:network`
      `UserApi.deleteAccount` (`@HTTP(method="DELETE", hasBody=true)` on `me/delete-account` — Retrofit needs the
      explicit `@HTTP` to attach a body to a DELETE); `:sdk-core` `UserRepository.deleteAccount` (online-only
      `apiCall` — the gateway opens a 90-day grace period and mails a confirmation link, so it can't be
      optimistic/offline). `:feature:settings` `AccountDeletionViewModel` (+ `AccountDeletionUiState`,
      `AccountDeletionError`): gates the destructive submit behind the verbatim phrase, double-tap safe
      (`isDeleting` set synchronously), flips `isEmailSent` on success (no logout — mirrors iOS's email-confirmation
      view), maps failure → `409 = ALREADY_PENDING` / transport = NETWORK / else GENERIC. `AccountDeletionScreen`
      (glue): red danger warning card enumerating what is lost + monospace confirmation field + gated destructive
      button, swapping to a "check your inbox" state on success; reached from the (previously no-op) "Delete
      account" row in Settings → Danger zone (`Routes.DELETE_ACCOUNT`). +18 tests (AccountDeletionConfirmation 8,
      AccountDeletionViewModel 10). EN/FR/ES/PT strings. Surpasses iOS with the distinct `ALREADY_PENDING` (409)
      error state iOS folds into a single generic message.
- [x] Media cache management (clear cached images/audio/video/thumbnails) — slice `settings-media-cache`
      (2026-07-11). **Surpasses iOS**: iOS `DataStorageView` shows **no sizes** and offers only a single
      "clear all" (its own audit flags the size readout as a future TODO, `estimatedDiskBytes()` unused);
      Android shows the **total + every per-category size** and clears **per-category or all**. Pure
      `:core:model` SSOTs: `ByteSizeFormatter` (binary KB/MB/GB, adaptive 1-decimal, negatives→0 — ports the
      shared iOS `ByteCountFormatter` convention) + `MediaCacheReport`/`MediaCacheCategory` (per-category
      bytes, derived total/`isEmpty`/`nonEmptyCategories`, optimistic `withCleared`). `:feature:settings`
      pure `MediaCacheScanner` (recursive dir size + content wipe, missing-dir = 0/no-op, tested on temp
      dirs), `MediaCacheStore`/`AndroidMediaCacheStore` (maps the 4 categories to `cacheDir/image_cache`
      [Coil default, populated today] + `cacheDir/media/{audio,video,thumbnails}` [pipeline-ready]),
      `MediaCacheViewModel` (init scan, SWR refresh, optimistic per-/all-category clear with rollback,
      in-flight guard, SCAN/CLEAR error mapping, cancellation-safe) + `MediaCacheScreen` (total card,
      per-category rows with size + inline clear, destructive clear-all with confirmation dialog). Wired the
      two previously no-op Settings → Data rows ("Clear media cache" + "Storage used") to `Routes.MEDIA_CACHE`.
      +43 tests (ByteSizeFormatter 15, MediaCacheReport 10, MediaCacheScanner 6, MediaCacheViewModel 12).
      EN/FR/ES/PT strings.
- [x] Crash-report diagnostics viewer with share — **shipped** (slice `settings-crash-diagnostics`,
      2026-07-12). Port of iOS `CrashDiagnosticsManager` + `CrashReportSheet`, with an Android-honest capture
      layer: the directly-capturable analogue of the iOS NSException path is a process-wide
      `Thread.setDefaultUncaughtExceptionHandler`, which persists an uncaught JVM exception and then chains to
      the previously-installed handler (mirroring iOS's `previousExceptionHandler`). Five pure `:core:model`
      SSOTs (package `me.meeshy.sdk.model.diagnostics`): `CrashKind` (EXCEPTION/CRASH/ANR/CPU/DISK, each with a
      stable `severity` badge band [ERROR/WARNING/INFO, mirroring the iOS `kindBadge` colours] + a stable
      lowercase `wireValue` share token) + `CrashSeverity`; `CrashDiagnostic` (`@Serializable`; id, epoch-millis
      timestamp, kind, summary, details); `CrashDiagnosticFactory.fromThrowable(throwable, id, timestampMillis)`
      — the pure port of the iOS `"name: reason"` summary + joined-stack-trace details, id/timestamp injected
      for determinism; `CrashReportFormatter.format`/`formatAll` — the pure port of iOS `formatAllReports()`
      (`[kind] ISO-8601-UTC` / summary / details, blocks `---`-fenced, order-preserving, empty → ""); and
      `CrashReportRetention.sorted`/`retained`/`overflowIds` (MAX_STORED=50) — the pure port of the iOS
      `decodeAllReports()` newest-first sort + cap + GC-overflow, so a crash loop can never grow the store
      without bound. Durable JSON codec `List<CrashDiagnostic>.storageValue`/`crashReportsFromStorage`
      (corruption-safe: blank/absent/malformed/non-array → empty; a single unparseable element is skipped, not
      the whole list — mirroring iOS per-file decode resilience). `:feature:settings`: `CrashDiagnosticsStore`
      interface + coverage-exempt `FileCrashDiagnosticsStore` (single JSON file under
      `filesDir/diagnostics/`, `@Synchronized` synchronous `record` for the dying crash thread, retention cap
      applied on every append/read), `CrashDiagnosticsRecorder` (installs the uncaught-exception handler),
      `CrashReportViewModel` (UDF immutable `CrashReportUiState`; loads newest-first, exposes `shareContent`
      derived from the pure formatter, optimistic clear with snapshot rollback, inert-when-empty + in-flight
      guards, `CancellationException` rethrown), `CrashReportScreen` (severity-coloured kind badges, tap-to-
      expand monospace details, `ACTION_SEND` share, confirmed clear-all, empty/loading states). Wired a new
      "Diagnostics" row in Settings → About (`Routes.DIAGNOSTICS`) + `MeeshyApplication.onCreate` installs the
      recorder. +42 tests (CrashKind 5, CrashDiagnosticFactory 5, CrashReportFormatter 5, CrashReportRetention
      12, CrashReportCodec 6, CrashReportViewModel 9). EN/FR/ES/PT strings. Surpasses iOS by keeping the whole
      capture→retain→format→share pipeline as pure, fully-covered SSOTs rather than inline sheet logic.
- [~] Static screens: Help & Support, Terms of Service (FR/EN), Privacy Policy (FR/EN),
      open-source licenses (auto-generated), About.
      **All five code-complete & locally green.** Licenses (PR #1894) is built + fully tested but **not yet
      merged** — its CI is red only on a **pre-existing, unrelated** gateway failure (`calls-routes.test.ts`,
      3 tests) that also fails on main's own push CI (sha `6d0b17d`); the apps/android-only diff cannot
      touch gateway logic. Slice ⚠ blocked at the merge gate until main's gateway tests go green.
      **About screen shipped** (slice `settings-about-screen`, 2026-07-12). Port of iOS `AboutView`.
      Pure `:core:model` SSOTs (package `me.meeshy.sdk.model.about`): `AppVersionFormatter.format(name, code)`
      — the i18n-agnostic `"name (build)"` fragment (blank name → `1.0.0`, non-positive code → `1`, so the
      label is never empty/`"()"`/negative; the screen wraps it in a localized "Version %s");
      `AboutLinkResolver.resolvable(links)` — the port of iOS `linkRow`'s `if let URL(string:)` guard (keeps
      only non-blank http(s) links, order-preserving, so `ACTION_VIEW` always has a launchable target);
      `AboutPresentationBuilder.build(params)` — assembles the version label, the three info rows
      (platform=`Android {release}` [blank release → bare `Android`], applicationId [blank → default],
      sdkVersion [blank → `1.0.0`]), the fixed feature list and the launchable-only canonical links from the
      opaque `AboutParams` (versionName/versionCode/osRelease/applicationId/sdkVersion — injected app-side from
      `PackageInfo`/`Build`, no Android import in the core). `AboutScreen` (`:feature:settings`) is pure Compose
      glue: brand-gradient header, Indigo section cards, info/feature rows, links open via `ACTION_VIEW`.
      Wired the previously-dead Settings → About "Version" row to `Routes.ABOUT`. +27 tests (AppVersionFormatter 7,
      AboutLinkResolver 9, AboutPresentationBuilder 11). EN/FR/ES/PT strings.
      **ToS + Privacy Policy shipped** (slice `settings-legal-documents`, 2026-07-12). Port of iOS
      `TermsOfServiceView` + `PrivacyPolicyView`, **unified** into one data-driven screen keyed by
      `LegalDocumentKind`. Pure `:core:model` SSOTs (package `me.meeshy.sdk.model.legal`):
      `LegalDocumentKind.fromArg(raw)` — the case-folded/trimmed route-arg parser (`terms`/`privacy`, null on
      blank/unknown so an unrecognised deep link never resolves to the wrong doc); `LegalSectionKey` (the 9 ToS
      + 7 Privacy sections); `LegalDocumentCatalog.sections(kind)` + `.numbered(kind)` (ordered section keys +
      iOS's `index + 1` 1-based numbering). `LegalDocumentScreen` (`:feature:settings`) is pure Compose glue:
      numbered Info-blue section cards, each key resolved to a localized heading/body. Wired the two previously
      **dead-end** Settings → About rows ("Terms of Service", "Privacy Policy") to `Routes.legal(kind)`.
      **Surpasses iOS** by (a) collapsing two near-identical views into one catalog-driven screen and (b) the
      document following the app language automatically across values-* (EN/FR/ES/PT — Prisme philosophy),
      dropping iOS's manual fr/en `Picker`. +14 tests (LegalDocumentCatalog 7, LegalDocumentKind 7). EN/FR/ES/PT
      strings.
      **Help &amp; Support shipped** (slice `settings-help-support`, 2026-07-12). Port of iOS `SupportView`.
      Pure `:core:model` SSOTs (package `me.meeshy.sdk.model.support`): `SupportLinkResolver.resolvable(links)`
      — the launchability gate mirroring iOS `supportLink`'s `if let URL(string:)` guard, **widened** to accept
      `mailto:` alongside `http(s)://` (Help &amp; Support mixes web pages and email-compose links, unlike the
      website-only About screen); `SupportPresentationBuilder.build(params)` — assembles the three link sections
      (Get help = help-center + FAQ; Contact = email + Twitter; Report = bug + feature, the last two pre-filled
      `mailto:` compose links) each launchable-filtered, plus the Information rows (version = trimmed versionName
      with `1.0.0` fallback; build = versionCode with `1` fallback when ≤0; platform = `Android {release}`, bare
      `Android` on blank). Supporting enums `SupportSectionKey`/`SupportLinkKind`/`SupportInfoKey` +
      `SupportParams` (opaque `PackageInfo`/`Build` facts injected app-side, no Android import in the core).
      `SupportScreen` (`:feature:settings`) is pure Compose glue: accent-coded section cards (Success/Info/Warning
      for the three link sections, Neutral for Information — mirroring iOS's per-section tints), each link a
      tappable row opening via `ACTION_VIEW`. Wired a new **Help &amp; Support** row in Settings → About
      (`Routes.SUPPORT`). +24 tests (SupportLinkResolver 11, SupportPresentationBuilder 13). EN/FR/ES/PT strings.
      A two-mutation RED check (drop the `mailto:` scheme + drop the build `≤0` fallback) failed exactly the 9
      relevant tests, confirming they are behavioural not tautological.
      **Open-source licenses shipped** (slice `settings-open-source-licenses`, 2026-07-12) — the last §L static
      screen. Port of iOS `LicensesView`, but over an **Android-accurate** curated catalog (Jetpack Compose,
      AndroidX, Material Components, Hilt, Kotlin Coroutines/Serialization, Coil, OkHttp, Retrofit, Media3
      ExoPlayer, Room, Timber, ZXing, Firebase Android SDK, Socket.IO Client Java, WebRTC-Android) — the libs that
      actually ship, not iOS's Swift deps. Pure `:core:model` SSOTs (package `me.meeshy.sdk.model.licenses`):
      `OpenSourceLicenseType` (MIT/APACHE_2_0/BSD/OTHER — declaration order = render order); `OpenSourceLicense`
      /`OpenSourceLicenseGroup`; `OpenSourceLicenseResolver.resolvable(licenses)` — the launchability gate porting
      iOS `licenseCard`'s `if let URL(string:)` guard, narrowed to `http(s)://` only (licenses only open repo web
      pages, no `mailto:`); `OpenSourceLicensePresentationBuilder.build(licenses)` — **surpasses iOS's flat list**
      by grouping launchable licenses by type in enum order, sorting each group by name case-insensitively, and
      dropping empty groups; `OpenSourceLicenseCatalog` (the curated list + `groups()`). `LicensesScreen`
      (`:feature:settings`) is pure Compose glue: intro line + one accent-coded section per family (MIT=Success,
      Apache=Warning, BSD=Info, Other=Neutral), each row a tappable card opening the repo via `ACTION_VIEW`. Wired
      a new **Open source licenses** row in Settings → About (`Routes.LICENSES`). +26 tests (OpenSourceLicenseResolver
      9, OpenSourceLicensePresentationBuilder 8, OpenSourceLicenseCatalog 7). EN/FR/ES/PT strings. A two-mutation
      RED check (break the group sort + widen the resolver to `mailto:`) failed exactly the 3 relevant tests,
      confirming they are behavioural not tautological. **§L static screens now complete.**

## M. Notifications
- [ ] Notification center with category filters (messages, reactions, mentions, social,
      contacts, groups, calls, translations, system)
- [~] Notification list — real-time socket updates — **shipped 2026-08-17** (slice
      `notification-realtime-socket`): `MessageSocketManager` now listens for `notification:new`
      (gateway's socket payload is the durable `ApiNotification` shape plus toast-only
      `title`/`subtitle`/`_seq` fields, silently dropped by `Json.ignoreUnknownKeys` — no separate
      wire type needed) and exposes it as `SharedFlow<ApiNotification>`, mirroring iOS
      `MessageSocketManager.notificationReceived`. `NotificationsViewModel` collects it and
      prepends the fresh row live (dedup by id — a REST-list race or a duplicate delivery is a
      no-op), bumping `unreadCount` only when the incoming notification isn't already read. +4
      tests (`MessageSocketManagerNotificationTest`: payload decode; `NotificationsViewModelTest`
      ×3: prepend+bump, already-read doesn't bump, duplicate id is a no-op).
      **Stale-while-revalidate cache shipped 2026-08-17** (slice
      `notification-cache-first-stream`). Re-proved before coding: `CachePolicy.Notifications`
      already existed (`freshFor` 60s, `keepFor` 24h) with ZERO usages anywhere — the constant had
      been anticipated but never wired. `NotificationRepository.notificationsStream()` mirrors
      `PostRepository.feedStream()`'s exact shape (in-memory L1 `MutableStateFlow` cache,
      `CacheResult.Empty`/`Fresh`/`Stale`/`Syncing`, background revalidate on staleness) —
      `NotificationsViewModel` is now a thin projector of this stream plus a new
      `unreadCountStream: StateFlow<Int>` (also repository-owned, sourced from the previously
      dormant `NotificationApi.unreadCount()` REST call — the earlier slice's own note "unreadCount
      was never even populated from the server" is now fixed as a natural consequence of this
      refactor, not a separate add-on). `markAsRead`/`markAllAsRead` moved INTO the repository as
      optimistic cache mutations (mirrors `PostRepository.toggleLike`'s rollback-on-failure
      pattern) — necessary for correctness once the ViewModel stopped holding its own copy of the
      list: without this, a live socket arrival re-triggering the shared stream would have
      silently reverted an optimistic local mark-as-read back to unread. `prependLive` (used by the
      real-time socket handler) now lives on the repository too, for the same reason. +10 tests
      (`NotificationRepositoryTest`) + rewritten `NotificationsViewModelTest` (9 tests, now
      exercising the ViewModel's actual remaining job — projecting `CacheResult` variants and
      delegating writes — since dedup/rollback behaviour moved to and is tested at the repository
      layer). **Pagination shipped 2026-08-17** (slice `notifications-pagination`) — re-proved
      against the real iOS reference (`NotificationListViewModel.swift`) rather than the checklist
      wording, which surfaced that iOS's `unreadOnly` published property is genuinely DEAD CODE:
      `refreshFromAPI`/`loadMore` both hardcode `unreadOnly: false` in the actual request, and the
      real "Non lues" filter is 100% CLIENT-SIDE (`filteredNotifications` filters the already-fetched
      list) as ONE of 11 category chips (all/unread/messages/reactions/mentions/social/contacts/
      groups/calls/translations/system) — a materially bigger UI feature than "wire the server
      param", correctly split off and left unattempted. **Only pagination was ported this run**:
      `NotificationRepository.loadMore()` (new `pagedApiCall` — preserves `pagination.hasMore`,
      unlike the plain `apiCall` `list()`/`revalidateNotifications` used before — dedupe by id,
      no-op before the first page loads or once the server reports no further page, cache/`hasMore`
      left untouched on failure so the next scroll retries) + `hasMoreStream: StateFlow<Boolean>`.
      `NotificationsViewModel.loadMore()` mirrors the re-entrancy-guarded shape already established
      by `StatusesViewModel.loadMoreIfNeeded`/`PostCommentsViewModel.loadMore`. UI: `NotificationsScreen`'s
      `LazyColumn` fires `loadMore()` on the last row's appearance (mirror of iOS's trailing
      `ProgressView().onAppear`), showing a spinner while `isLoadingMore`. +9 tests
      (`NotificationRepositoryTest` ×6: append/dedupe/hasMore-false/no-op-before-first-page/
      no-op-when-exhausted/failure-leaves-state-untouched; `NotificationsViewModelTest` ×3:
      delegates-when-available/inert-when-exhausted/concurrent-call-guard). **Still open: the
      11-category client-side filter bar** (including "Non lues") — a separate, larger UI feature,
      not attempted this run.
- [x] Mark read: ouverture du chat + message entrant → optimistic badge zero +
      READ_RECEIPT outbox (coalescé) ; **mark-all-read and swipe actions both done** — note was
      stale on both counts. `markAllRead` (`NotificationRepository.markAllAsRead` +
      `NotificationsViewModel.markAllRead` + the toolbar button in `NotificationsScreen`) was
      already fully wired and tested before this run, just never checked off. **Swipe actions
      shipped 2026-08-17** (slice `notification-swipe-actions`) — port of iOS
      `NotificationRowView`'s `.swipeActions`: trailing (end-to-start) swipe deletes, leading
      (start-to-end) swipe marks read, offered ONLY while unread (mirrors iOS's `if
      !notification.isRead`). `NotificationRepository.delete(id)` existed network-side
      (`DELETE /notifications/{id}`) but had zero cache mutation and zero callers — made
      optimistic (removes the row from the shared cache before the network call, decrements
      `unreadCountStream` when the deleted row was unread, full rollback on failure) mirroring
      `markAsRead`'s exact shape. `NotificationsViewModel.deleteNotification(id)` — thin
      delegator. `NotificationsScreen`'s `NotificationItem` wrapped in `SwipeToDismissBox`
      (mirror of the established `ConversationListScreen` pattern: `confirmValueChange` always
      returns `false` — the gesture never physically dismisses the row, the cache mutation
      flowing back through `state` is what removes/re-styles it). New `NotificationSwipeBackground`
      composable (trash icon + error-tinted background for delete, mark-email-read icon +
      indigo-tinted background for mark-read, transparent when settled or when the leading
      direction has nothing to offer on an already-read row). +3 `NotificationRepositoryTest`
      (delete optimistic + unread decrement, delete on an already-read row leaves the count
      untouched, rollback on failure) + 1 `NotificationsViewModelTest` (delegation). Strings ×2
      across EN/FR/ES/PT.
- [~] In-app real-time notification toast — **re-proved 2026-08-17, found to be a 3-sub-slice
      epic, not a one-shot**: iOS's reference (`NotificationToastManager.swift` +
      `NotificationToastView.swift`) needs (1) the real-time data feed — **shipped**, (2) an
      orchestrator with 2s APN/socket dedup, 7s auto-dismiss timer, and suppression when the
      arriving notification's `conversationId`/`postId` matches the currently-open
      conversation/post, and (3) UI mount + tap-to-navigate — the presentational atom already
      exists (`MeeshyNotificationToast` in `:sdk-ui`'s `MeeshyToast.kt`, unused) but nothing
      calls it.
      **Sub-slice (2), PURE decision core only, shipped 2026-08-17** (slice
      `notification-toast-policy`): `NotificationToastPolicy.decide(notification,
      activeConversationId, activePostId, isDuplicateDelivery, preferences, now) →
      NotificationToastDecision` (`:core:model`) — a genuine EXTRACTION from iOS's own impure
      guard-chain (iOS has no isolated pure version of this logic to port 1:1) covering:
      suppress-if-active-conversation-or-post (wins over everything else), dedup (the "was this
      id already shown in the last 2s" boolean is precomputed by the caller — inherently
      stateful, not this pure function's job), then push-enabled + DND-window gating (both reuse
      already-existing pure predicates, `UserNotificationPreferences.pushEnabled`/
      `DndWindow.isActive`). +8 tests. **Deliberately narrower than iOS's own gate**: the
      PER-TYPE toggle check (iOS `isTypeEnabled`, an 80-case switch over `MeeshyNotificationType`)
      is NOT ported — Android has no raw-wire-type→toggle resolver to reuse
      (`NotificationTypeCatalog` maps a coarser 17-case UI category, not the 80-case wire enum);
      building one is real, separate work, left open rather than invented under this slice's
      budget. Until then every type passes once push+DND clear.
      **Still open**: the STATEFUL wiring (dedup-window bookkeeping, the 7s dismiss timer, a
      Hilt-singleton `CoroutineScope`, `onConversationOpened/Closed`/`onPostOpened/Closed` hooks
      called from `ChatViewModel`/post-detail lifecycle — Android has no equivalent to iOS's
      `ConversationSocketHandler.init`/`deinit` today), the per-type toggle resolver noted
      above, and sub-slice (3) (UI mount + navigation).
- [ ] FCM push: permission request, tap-to-navigate, foreground/silent activity signal, badge sync
- [ ] Rich push: decryption, message-media attachments, sender-avatar style, category quick
      actions (reply / mark-read / accept-friend / call), conversation threading, per-push badge
- [ ] Offline delivery-receipt acknowledgement (✓→✓✓ for offline recipients)
- [ ] Push message prefetch + pre-persist into Room for instant cold-launch
- [ ] `NotificationCoordinator` authority model (socket authoritative; cache only seeds)
- [ ] Comprehensive notification system (~80 types)
- [~] Android `NotificationChannel` taxonomy (ARCHITECTURE.md §18: "~80 notification types
      map onto a curated notification-channel taxonomy"). Today only 2 channels exist
      (`CHANNEL_CALLS` full-screen ringer + a single generic "Messages" channel, both in
      `MeeshyFcmService`) — the ~80 backend notification types above are not mapped onto a
      curated per-category channel set (message/reaction/mention/social/call/etc, each with
      its own importance/sound/badge policy, mirroring iOS's per-category push handling).
      Line added by the app-icon-audit angle-mort pass (2026-08-10, `tasks/android-parity-
      ios-debt-agent-prompt.md` §"Angle mort catégoriel") — not implemented that run.
      **A concrete, live bug behind this gap got found and fixed** (slice
      `notification-channel-id-drift`, 2026-08-10): re-reading `services/gateway/src/services/
      PushNotificationService.ts` `sendViaFCM` end to end (not just the taxonomy line's own
      wording) found the gateway already sends `message.android.notification.channelId =
      'meeshy_notifications'` for every Android non-call push — but `MeeshyFcmService` had only
      ever created a channel named `meeshy_messages`, and only lazily, inside
      `onMessageReceived`. FCM Android semantics: a push carrying both a `notification` and a
      `data` block (every non-call push today) is auto-rendered by the OS/Play services when the
      app is backgrounded or killed — `onMessageReceived` never runs in that case, so the system
      posts directly against the gateway's `channelId`. With no `meeshy_notifications` channel
      ever created and no `com.google.firebase.messaging.default_notification_channel_id`
      manifest fallback declared either (grepped, absent), that push is either dropped or folded
      into a generic, unbranded system "Miscellaneous" channel with none of the intended
      importance/sound — exactly backwards from precisely the scenario push exists for
      (foregrounded, where `onMessageReceived` DOES run and channel creation already worked, was
      never actually affected). **Fixed (production, all `apps/android`)**: new `:app`
      `NotificationChannelIds` object (SSOT for `CHANNEL_MESSAGES`/`CHANNEL_CALLS` + their legacy
      predecessors, replacing the two ad-hoc constant sets previously duplicated in
      `MeeshyFcmService`'s companion) renames the client's message channel id to
      `meeshy_notifications` — byte-for-byte matching the gateway's own literal — and a new
      `NotificationChannelInstaller` creates it **eagerly at process start**
      (`MeeshyApplication.onCreate`, injected via Hilt) rather than only lazily inside the
      handler that's exactly the one that doesn't run in the failure scenario; it also deletes
      the orphaned pre-drift `meeshy_messages` channel (channels are immutable once created —
      same "delete + recreate under a new id" migration `CHANNEL_CALLS` already took `meeshy_calls`
      v1→v2). `MeeshyFcmService`'s own lazy `createNotificationChannel` call in the
      foreground-received path is kept as a harmless, idempotent belt-and-suspenders, now
      pointing at the same SSOT id. **+4 `NotificationChannelInstallerTest`** (Robolectric,
      `@Config(sdk = [26])` pinned to the app's own `minSdk` floor — the module's ambient default
      SDK resolution silently fell back to API 21, well below the O+ `NotificationChannel` API,
      producing a `NoSuchMethodError` until pinned; `testImplementation(libs.androidx.test.ext.
      junit)` added to `:app` for `ApplicationProvider`, missing before this slice): creates the
      channel under the gateway-matching id at `IMPORTANCE_HIGH`, deletes the stale legacy
      channel, idempotent across repeated `install()` calls (no duplicate), never touches the
      calls channel. Mutation-proven: commenting out the legacy-delete call fails **exactly** the
      1 discriminating test, the other 3 stay green. **Gate**: `./apps/android/meeshy.sh check`
      → `BUILD SUCCESSFUL` (970 tasks, full `assembleDebug` + all-module `testDebugUnitTest`,
      zero failures). **Verified on-device** (`meeshy_pixel8` emulator, fresh app launch, no push
      sent): `adb shell dumpsys notification` confirms `NotificationChannel{mId=
      'meeshy_notifications', mImportance=4, mDeleted=false}` exists for `me.meeshy.app.debug`
      the instant the process starts, before any message push ever arrives. **Still open, and
      honestly scoped as a separate, larger follow-up**: the full curated *multi*-channel
      taxonomy (a distinct channel per category — messages/reactions/mentions/social/etc, each
      individually mutable in system settings) needs the gateway to send a **per-type**
      `channelId` instead of the one hardcoded literal it sends today for every non-call push —
      a `services/gateway` change, outside this lane's `apps/android`-only diff scope. This slice
      only closes the concrete id-mismatch defect and lays the SSOT + eager-install foundation a
      future richer taxonomy would build on.
- [x] Per-type semantic row accent (`notifications-type-accent-color`, 2026-07-13): pure
      `:core:model` `notificationTypeAccentHex(type)` SSOT — faithful port of iOS
      `MeeshyNotificationType.accentHex`, mapping all ~80 backend `type` strings (lowercase +
      legacy uppercase alias) onto the 10 category colours (blue messages · coral reactions ·
      purple mentions · teal friend-graph/conversation · gold community/achievements · pink
      calls · green affiliate · red security · cyan translation · indigo system+friend-new,
      also the unknown-type fallback). Row wiring in `NotificationsScreen` (unread background
      tint + unread dot + avatar container) swapped from hardcoded `Indigo500` to the per-type
      accent via `hexColor(...)`, so notifications colour-code by category exactly like the iOS
      `NotificationRowView`. +14 tests (each colour family, legacy-alias↔lowercase equality,
      unknown/empty→indigo fallback, cross-category distinctness).
- [x] Row arrival timestamp as a discreet relative label (`notifications-row-relative-time`,
      2026-07-13): the notification row previously rendered the raw absolute short date-time
      (`shortDateTimeLabel(state.createdAt)`, e.g. "7/13/26, 6:56 AM"), diverging from iOS
      `NotificationRowView` which shows `RelativeTimeFormatter.shortString(for: createdAt)`
      ("5 min", "2 h", "3 j"). Ships pure `:feature:notifications` `NotificationRowTime.epochMillis`
      (resolves the arrival instant from `state.createdAt` via the `isoToEpochMillisOrNull` SSOT →
      null on blank/malformed so the row shows no label rather than a garbled string; unix-epoch 0L
      kept). Row wiring reuses the already-shipped `:sdk-ui` `RelativeTimeFormat.short` +
      `rememberRelativeTimeStrings` (no new strings). +5 tests (arrival-instant, fractional-seconds
      parity, blank→null, unparseable→null, unix-epoch preserved).

## N. Search
- [ ] Global search (messages, conversations, users) with recent searches + query highlighting
- [ ] Local full-text search (FTS, accent-folded, BM25-ranked) + network merge
- [x] User search (paginated) — closed 2026-08-16 (slice `user-search-pagination`). The search
      itself already existed (`NewConversationViewModel`'s debounced `UserRepository.searchUsers`,
      backing the "new conversation" picker) but was a dead-but-half-wired gap exactly like
      `customName`/`reaction`/`tags` before their own slices: `UserRepository.searchUsers` already
      accepted `limit`/`offset` parameters, and the gateway's `GET /users/search` already computed
      `pagination.hasMore` (`offset + resultCount < total`), but the ViewModel only ever fetched
      page one and never exposed a "load more" trigger — the shared `pagedApiCall` helper
      (`PagedResult<T>` — preserves the envelope's `pagination` block that plain `apiCall` discards)
      already existed for exactly this purpose but had zero callers. Added
      `UserRepository.searchUsersPaged` (a new, additive method — NOT a signature change to
      `searchUsers`, which three other call sites depend on: `SuggestionsRepository`,
      `MentionSearch`, `DiscoverViewModel`, none of which need pagination). `NewConversationViewModel
      .loadMoreIfNeeded(userId)` mirrors `CallHistoryViewModel.loadMoreIfNeeded`'s exact shape
      (idempotent threshold guard called per-row during composition, `LOAD_MORE_THRESHOLD = 5`) —
      an established in-repo pattern, not a new one. +7 tests
      (`UserRepositoryTest` ×2, `NewConversationViewModelTest` ×5 incl. append/no-op-far-from-end/
      no-op-no-more-data).

## O. Links
- [ ] Links hub (share / tracking / community / affiliate) with quick-create
- [x] Share/invite links: create (guest rules, anonymous permissions, max-uses, expiration,
      custom slug), list + stats, manage (copy/share/activate/delete)
      — **create half** slice `sharelink-create` (2026-07-25): pure `CreateShareLinkForm`
      + `ShareLinkExpiration` (`:core:model`, deterministic ISO expiry via injected clock; account
      gate forces guest sub-requirements off — port of iOS `CreateShareLinkView.create()`) +
      authenticated `LinkApi.create` (`:core:network`) + `ShareLinkRepository.create` (`:sdk-core`,
      flattens the nested `{ linkId, conversationId, shareLink }` envelope) +
      `CreateShareLinkViewModel`/`CreateShareLinkScreen` (`:feature:conversations`), reached from a
      group chat's top bar (moderator+ → `AddLink`). +23 tests.
      **list/stats/manage half** slice `sharelink-my-links` (2026-07-25): pure `MyShareLinksState`
      reducer (`:core:model`, optimistic toggle/delete keeping the aggregate stats locally exact —
      `totalUses` mirrors the gateway `_sum(currentUses)`) + `MyShareLink.displayName`/`joinUrl`
      helpers + `LinkApi.listMyLinks`/`fetchMyStats`/`toggle`/`delete` (`:core:network`, real routes
      `GET /links`, `GET /links/stats`, `PATCH /links/{linkId}/toggle`, `DELETE /links/{linkId}`) +
      repository methods (`:sdk-core`) + `MyShareLinksViewModel`/`MyShareLinksScreen`
      (`:feature:conversations`, snapshot-rollback on failure, copy/share intents, web-origin-derived
      join URL) reached from **Settings → Share links**. +26 tests.
      **extend-expiry half** slice `sharelink-extend-expiry` (2026-07-25): pure `ExtendShareLinkForm`
      (`:core:model`, reuses `ShareLinkExpiration` but excludes `Never` since the extend route requires
      a concrete `expiresAt`; deterministic ISO via injected clock) + `MyShareLink.isExpired(now)`
      predicate (mirrors the gateway `now > expiresAt` guard, blank/unparseable = never-expiry) +
      `MyShareLinksState.extended(linkId, iso)` optimistic reducer (stats untouched) + `LinkApi.extend`
      (`:core:network`, real route `PATCH /links/{linkId}/extend`) + `ShareLinkRepository.extend`
      (`:sdk-core`) + `MyShareLinksViewModel.extendExpiry` (`:feature:conversations`, snapshot-rollback
      on failure, `Never` inert) + a per-row **Schedule** menu (4 horizons) + an **Expired** badge in
      `MyShareLinksScreen`. +21 tests.
      **created-link success sheet** slice `sharelink-created-sheet` (2026-07-26): pure
      `CreatedShareLink.joinUrl(webOrigin)` + `displayName` presentation helpers (`:core:model`, mirror
      `MyShareLink.joinUrl` trailing-slash handling) + `CreateShareLinkViewModel` now injects
      `MeeshyConfig`, resolves `webOrigin` via `ServerEnvironmentResolver`, and exposes a derived
      `createdJoinUrl` on `CreateShareLinkUiState` (no redundant storage) + `CreateShareLinkScreen`
      replaces the bare pop on success with a `ModalBottomSheet` surfacing the join URL + Copy / Share
      intents + Done (`:feature:conversations`). +10 tests.
      **per-link detail** slice `sharelink-detail` (2026-07-26): pure `ShareLinkDetailPresentation`
      (`:core:model`, projects a `MyShareLink` → all detail fields: identifier label, uses/max labels
      with `∞` glyph, `isExhausted`, parsed created/expires millis via the `isoToEpochMillisOrNull`
      SSOT, reuses `displayName`/`joinUrl`/`isExpired`) + pure `ShareLinkDetailState` reducer (resolve
      one link out of the owner list by `linkId` → Loaded / NotFound, optimistic `toggled`, delete
      signal, error dismiss) + `ShareLinkDetailViewModel` (`:feature:conversations`, resolves via
      `listMyLinks` since there is no per-link owner endpoint, snapshot-rollback on toggle failure,
      `isDeleted` pops back) + `ShareLinkDetailScreen` (header + status + join URL, copy/share/
      activate/delete actions bar, uses/max stat cards, identifier/created/expires info) reached by
      tapping a row in `MyShareLinksScreen` (`share-links/{linkId}` route). Faithful port of iOS
      `ShareLinkDetailView`. +50 tests (24 presentation, 14 state, 12 ViewModel). **Completes the
      share-link management vertical.**
- [x] Anonymous join-via-share-link (preview → form → success); share-link preview screen —
      slice `sharelink-guest-join-form` (2026-07-25): pure `GuestJoinForm` (`:core:model`) +
      `AnonymousSessionRepository.preview()` (`:sdk-core`) + `GuestJoinViewModel`/`GuestJoinScreen`
      (`:feature:auth`, `meeshy://join/{identifier}` deep link). See §J anonymous-sessions entry. +30 tests.
- [ ] UTM tracking links: create, list, toggle, delete; aggregate + per-link click stats
      (geo/device/browser breakdown, click timeline), QR generation
- [ ] Affiliate / referral links: create, copy, share, delete, dashboard stats
- [~] Generic in-app share picker / Android Share-Sheet receiver (text/url/image/message/story →
      conversation) — **lot 1 (text/URL) shipped 2026-08-17** (slice `share-target-text-url`),
      Android's counterpart to iOS's own `MeeshyShareExtension`, scoped identically to iOS's own
      documented lot 1 ("Portée lot 1 : texte + URL" — `apps/ios/CLAUDE.md`). New
      `ShareTargetActivity` (`:app`, `android:excludeFromRecents`) registers an `ACTION_SEND`
      intent-filter for `text/plain` (a shared URL arrives as `EXTRA_TEXT` too, so one MIME type
      covers both). Unlike iOS's extension — a separate process needing its own App Group session
      read and a dedicated offline-relay queue (`ShareSender`/`SharePendingSendConsumer`) — this
      runs in the SAME process as the rest of Meeshy, so `ShareTargetViewModel` reuses the app's
      own `SessionRepository` and `MessageRepository.sendOptimistic` (already durably queued
      through the existing outbox on a failed send) directly: no new relay machinery needed. The
      conversation picker reuses `ForwardTargets` — the exact pure SSOT `ChatViewModel`'s own
      forward-picker sheet already uses — rather than a second filtering rule. Unlike forwarding
      (multi-target), a share picks exactly ONE conversation and finishes, matching platform
      share-sheet convention. +7 tests (`ShareTargetViewModelTest`: picker populates from the
      cache-first conversation stream, query filters by title, a successful send marks the target
      sent and finishes, a second target while one send is in flight is a no-op, blank shared text
      never hits the network, no signed-in user never hits the network, a failed send surfaces the
      error and clears the sending flag without finishing).
      **lot 2 (image/video attachments) shipped 2026-08-17** (slice
      `share-target-media-attachments`). The previous entry's own "needs the TUS upload pipeline"
      note was RE-PROVED and did not hold: `ChatViewModel.sendFileAttachment` — the existing chat
      composer's own attachment path — already enqueues through `MediaUploadQueue` with a `null`
      `TusUploadContext`, which uploads via `MediaRepository`/`POST /attachments/upload`; TUS on
      Android is scoped to post/story/status/comment media only, never message attachments (`grep`
      confirmed zero overlap). `ShareTargetActivity`'s manifest gained two more `ACTION_SEND`
      intent-filters (`image/*`, `video/*`); the Uri is read off the main thread
      (`Dispatchers.IO`) via the exact same `readPickedAttachment` helper the chat composer's own
      picker already used (flipped `private` → `internal` in `ChatScreen.kt` to share it, no
      duplicate glue), then threaded through `ShareTargetViewModel.loadAttachment(bytes, fileName,
      declaredMimeType)` → `MediaUploadQueue.enqueue` → `MessageRepository.sendOptimistic` with the
      resolved `messageType`/`attachmentUploadCmids`/`attachments`, mirroring
      `sendFileAttachment`'s own send shape exactly. +4 tests: upload+send carries the correct
      `messageType`/`attachmentUploadCmids`; an attachment with blank shared text still sends
      (only "nothing at all" is inert now); mime resolves from the file extension when the
      platform declares none; empty bytes are a no-op. **Still open: `ACTION_SEND_MULTIPLE`**
      (sharing several images/videos from a gallery multi-select at once) — deliberately deferred,
      not investigated in detail; a single-item share (the overwhelmingly common case) is fully
      covered by lots 1+2. The "message/story" part of this checklist line's own parenthetical
      refers to Meeshy-internal share/forward targets, not this external-receiver item — already
      tracked separately (§C "forwarded" indicators, §E "Story actions: forward/send").

## P. Media (viewers & editors)
- [ ] Inline video playback (thumbnail → play, auto-hiding controls); fullscreen immersive
      player (seek bar, ±10s, speed 1.0–2.0×, swipe-to-dismiss); Picture-in-Picture
- [ ] Single-active-player coordination across audio + video; save video to gallery
- [ ] Video watch-progress reporting; synchronized karaoke-style transcription (tap-to-seek)
- [ ] Audio message player (waveform, speed control, seek); disk-cache-first instant replay
- [ ] Voice-message autoplay-next chaining; full-screen swipeable audio viewer (reels-style)
- [~] Universal audio recorder (live waveform, duration/min-duration limits, presets)
      — **live-waveform pure core shipped** (slice `media-waveform-interpolation`, 2026-07-12):
      pure `:core:model` `me.meeshy.sdk.model.waveform` — `AudioLevelNormalizer.normalize`
      (dB→`0..1`, ports iOS `AudioRecorderManager.normalizeLevel` with added upper-clamp +
      NaN guard), `WaveformLevelWindow` (immutable 15-sample rolling ring, ports `levelHistory`
      + the initial `Array(repeating:0,count:15)`), `WaveformInterpolator.interpolate`
      (levels→`barCount` linear-blend strip, ports `UniversalComposerBar.interpolatedLevel`,
      whole strip in one pass). +28 tests. The `MediaRecorder`/`AudioRecord` capture + the
      Compose `Canvas` that paints the strip remain app-side glue (pending as a standalone,
      reusable "universal recorder" abstraction — concrete instances now exist and are shared
      between the chat composer's voice pill and the Feed post composer's audio-attachment pill,
      `chat-voice-recording-capture` + `feed-composer-voice-capture`, both driving the same
      `:core:model`/`:sdk-ui` `VoiceRecordingSession`/`VoiceRecordingPill`); this same core
      also underpins the audio-message-player waveform (line 2111).
- [ ] Full-screen audio editor (waveform, trim/crop, word-level transcription, language picker)
- [ ] On-device speech-to-text transcription of recordings
- [ ] Full-screen image editor (crop + ratio presets, 12 filters, brightness/contrast/saturation/
      sharpness/vignette, 6 effects, rotate)
- [ ] Image/video preview screens per context (story/post/message/avatar/banner) with Edit + Use
- [~] Image viewer — `MeeshyImageViewer` plein écran (pager multi-images, pinch-zoom
      borné 1–4×, pan clampé, double-tap 2.5×, tap-to-dismiss, compteur i/n),
      ouvert au tap sur la grille d'images d'une bulle **et sur le collage d'un post du feed**
      (slice `feed-media-fullscreen-gallery`, 2026-07-18 — `FeedMediaGallery` SSOT +
      `FeedViewModel.openImageViewer/dismissImageViewer`) ; drag-to-dismiss + save-to-gallery pending
- [ ] Code attachment viewer (~16 languages, syntax highlight, GitHub light/dark, copy)
- [ ] Document viewer (PDF/presentation/spreadsheet) with share
- [~] Image/video compression before upload (context-aware quality); save media to "Meeshy" album
      — **image compression *plan* shipped** (slice `media-image-compression-plan`, 2026-07-12): pure
      `:core:model` `me.meeshy.sdk.model.media` — `ImageUploadContext` (per-surface longest-edge ceilings
      mirroring iOS `MediaContext.maxImageDimension`: MESSAGE 1200 / STORY 1080 / FEED_POST 1600 /
      AVATAR 512 / FULLSCREEN 2048, **+ BANNER 1600** which iOS lacks; `forUploadTarget` bridges the
      shipped avatar/banner `ImageUploadTarget`) + `ImageCompressionPlanner.plan(context,w,h,quality)` →
      `ImageCompressionPlan(targetW,targetH,quality,resizeRequired)` (longest-edge fit, aspect preserved,
      `floor`-rounded like iOS `targetSize`, resize only when source `>` ceiling, quality clamped 1..100,
      target clamped ≥1, non-positive source → no-op). App-side Bitmap decode/scale/JPEG re-encode +
      video compression + "save to Meeshy album" still pending. +18 tests.
- [~] ThumbHash blur placeholders for all media; audio spectrogram visualization
      — **ThumbHash *decoder* shipped** (slice `media-thumbhash-decode`, 2026-07-12): pure `:core:model`
      `me.meeshy.sdk.model.media.ThumbHash` — faithful port of Evan Wallace's canonical
      `thumbHashToRGBA` / `thumbHashToAverageRGBA` / `thumbHashToApproximateAspectRatio`
      (`averageColor`, `approximateAspectRatio`, `hasAlpha`, `isLandscape`, `decode` → `ThumbHashImage`
      (w,h,rgba)); DC/AC YCoCg→RGB DCT over primitives, no Android `Bitmap`. **Surpasses** the reference:
      rejects a hash too short for the region it reads (`IllegalArgumentException` vs silent OOB) and clamps
      the raster to ≥1×1 so a degenerate header can't yield a 0-sized image. +21 tests.
      — **ThumbHash *encoder* shipped** (slice `media-thumbhash-encode`, 2026-07-12): `ThumbHash.encode(width,
      height, rgba)` → hash `ByteArray`, faithful port of Evan Wallace's `rgbaToThumbHash` (alpha-weighted
      average colour, RGBA→LPQA composited atop the average, forward DCT per channel into DC + scale-normalised
      AC nibbles, fewer luminance bits when alpha present). The `p`/`q` transform is derived as the exact inverse
      of *this repo's* decoder (`p=(r+g)/2−b`, `q=r−g`) so encode∘decode round-trips. **Surpasses** the
      reference's unguarded inputs: rejects a non-positive / over-100 side and a buffer shorter than
      `w·h·4` (`IllegalArgumentException` vs reading past the buffer into `NaN` garbage). +13 tests (hand-derived
      header bytes, solid-colour/gradient/alpha round-trips through `decode`, orientation, guards).
      — **First Coil placeholder wired 2026-08-16** (slice `feed-thumbhash-placeholder`) — both the encoder
      AND the decoder had **zero call sites anywhere in the app** (exhaustive grep) despite being fully
      ported and tested for over a month; `ApiPostMedia.thumbHash`/`FeedPostImage` never even carried the
      field through the feed projection. Added `ThumbHash.decodeBase64(String?): ThumbHashImage?` (`:core:model`,
      pure — base64-decode + malformed/blank/too-short guard, never throws) and
      `rememberThumbHashPainter(base64): Painter?` (`:sdk-ui`, the one Android-`Bitmap`-touching piece,
      UI glue) wired into `FeedScreen`'s `PostImageGrid`/`CollageTile` `AsyncImage`s as the Coil
      `placeholder`. **Scoped to feed post images only** — avatars, message attachments, and story slides
      (iOS's `CachedAsyncImage`/`MeeshyAvatar`/`StorySlideRenderer` all consume ThumbHash already) remain
      real, separate follow-ups, not silently dropped. Slide-level **generation** (encode → upload during
      story composition) is the OTHER open half, tracked by its own checklist line below (§ story composer)
      — genuinely different scope (write path vs. read path). +4 tests (`ThumbHash.decodeBase64` round-trip,
      null/blank, malformed base64, too-short; `FeedPostBuilder` carries `thumbHash` through the projection).

## Q. Cross-cutting infrastructure
- [x] App icon — launcher icon (`app-launcher-icon`, 2026-08-10). Was **entirely absent**:
      `apps/android/app/src/main/res/` had zero `mipmap-*` folders and no drawable icon asset,
      and `<application>` in `AndroidManifest.xml` carried neither `android:icon` nor
      `android:roundIcon` — every install rendered the generic Android launcher icon. Not a
      single line anywhere flagged this, because the integral iOS audit
      (`tasks/audit/part-01..23.md`) only read `.swift` production files and never opened
      iOS's `.xcassets` asset catalogs — a categorical blind spot in the audit itself (found
      by the user, 2026-08-10, `tasks/android-parity-ios-debt-agent-prompt.md` §"Angle mort
      catégoriel"), not a regression. **Shipped:** adaptive icon
      (`mipmap-anydpi-v26/ic_launcher{,_round}.xml` + `drawable/ic_launcher_{background,
      foreground,monochrome}.xml` — background/foreground/Android-13+-themed-icon layers) plus
      legacy PNG fallback (`mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher{,_round}.png`,
      inert at `minSdk 26` — the OS always resolves the adaptive XML — but shipped for
      tooling/launchers that still read the classic path directly) + `android:icon`/
      `android:roundIcon` wired on `<application>`. Ported **pixel-measured**, not eyeballed,
      off the iOS brand asset
      (`apps/ios/Meeshy/Assets.xcassets/AppIcon.appiconset/Icon-Light-1024x1024.png`): a
      connected-component scan of the white glyph pixels gave the 3 bar bounding boxes exactly,
      and corner-pixel sampling confirmed the gradient is exactly Indigo500 `#6366F1`
      (top-left) → Indigo700 `#4338CA` (bottom-right) — matching `apps/ios/CLAUDE.md`'s
      documented brand identity precisely, not a re-hue. Glyph scaled 0.85× beyond the literal
      108/1024 port so every bar corner clears the 66dp adaptive safe-zone circle (max corner
      distance ~30dp of the 33dp radius). Vector layers (API 26+, i.e. every device this app
      can run on) and the legacy PNGs share the exact same derivation
      (`apps/android/scripts/generate_legacy_launcher_icons.py`, committed + documented, mirrors
      the iOS `check_appicon_variants.py` convention) so they can never visually drift. **TDD**:
      `LauncherIconManifestGuardTest` (app module) — asserts `<application>` declares both
      manifest attributes, the adaptive XML references drawables that exist on disk, and every
      legacy density ships both PNGs; proven RED (manifest attributes reverted → the
      icon-declaration test failed, the resource-existence tests stayed green as expected) then
      restored to GREEN by hand before commit. **Verified visually, not just compiled**:
      installed the debug APK on the `meeshy_pixel8` emulator (API 35) and screenshotted both
      the Overview task-switcher (circle mask) and the home-screen app drawer (squircle mask) —
      both render the Indigo-gradient background + white stacked-dashes glyph correctly, no
      generic Android robot icon anywhere.
- [ ] Cache-first / SWR data layer (`CacheResult`, `cacheFirstFlow`, Room as single SoT)
- [ ] Offline outbox (one Room table, FIFO flush, backoff ×5, coalescing, `cmid` idempotency, rollback)
- [ ] Optimistic updates with snapshot rollback + in-flight guards + self/others socket-echo split
- [ ] `MessageStateMachine` + localId↔serverId reconciliation (no duplicate bubbles)
- [ ] Cold-start full conversation sync (bounded parallel paging, retries, completeness guards)
- [ ] Foreground / reconnect delta sync (`updatedSince` checkpoint, burst cooldown, gap-fill)
- [ ] Real-time socket→Room relay (messages, reactions, read status, translations, lifecycle)
- [ ] Two Socket.IO connections (message + social), long-polling transport, robust reconnect + room re-join
- [ ] Crash-safe boot recovery for in-flight queue items + orphaned audio files
- [~] Resumable (TUS) uploads surviving app kill; daily message-retention cleanup; DB maintenance —
      **non-resumable TUS client done** (slice `story-media-tus-upload`, 2026-08-10, §E): `TusApi`/
      `TusUploadRepository` speak the tus.io protocol against the gateway's `POST /api/v1/uploads`.
      **Chunked upload within a single session done** (slice `tus-chunked-upload-core`, 2026-08-10):
      `TusUploadRepository.upload` now splits the body into bounded PATCH calls (`TusChunkPlan`,
      pure chunk-boundary math, `:core:model`) of at most `DEFAULT_CHUNK_SIZE_BYTES` (10 MB, matches
      iOS `TusUploadManager.chunkSize`) instead of one monolithic PATCH — every chunk but the last
      goes through the new `TusApi.uploadChunk`/`patchChunk` (typed `Response<Unit>`, since the
      gateway's `@tus/server` returns a bare `204 No Content` for any non-final PATCH per the
      tus.io protocol), only the last chunk still goes through `uploadData` (the only PATCH whose
      response actually carries the `onUploadFinish` JSON body). A body no larger than one chunk
      (the common case today — compressed images) still makes exactly one PATCH, byte-identical to
      before. **Room-backed checkpoint, resume-within-retries done** (slice
      `tus-upload-checkpoint-resume`, 2026-08-11): new `tus_upload_checkpoint` table
      (`:core:database`, `TusUploadCheckpointEntity`/`Dao`) + pure `TusCheckpointKey`/
      `TusResumePlanner` (`:core:model`) decide, on every `upload()` call, whether to resume an
      existing session (skip `createUpload` entirely, PATCH only the chunks past the last
      *confirmed* offset) or start fresh — deliberately conservative: a checkpoint with zero
      confirmed progress (no intermediate chunk ever acknowledged) always starts fresh rather than
      trust an unconfirmed/possibly-stale session, so only genuinely large multi-chunk uploads that
      failed partway through ever benefit. The row is written after every acknowledged
      intermediate chunk and defensively cleared on completion (harmless no-op when absent). **Does
      NOT yet survive an app kill**: `MediaUploadItem.bytes` is still fully resident in memory for
      the call's lifetime, so a killed process loses the source bytes regardless of the persisted
      offset — that needs the lazy file-source read + a boot-time recovery scan (the existing
      "Crash-safe boot recovery for in-flight queue items" bullet above), still NOT done, along
      with 409 HEAD-recovery and a dedicated `WorkManager` foreground chain. Those remain the next
      sub-slices. Message-retention cleanup / DB maintenance still not started.
- [ ] Background conversation sync + message prefetch (backoff + jitter)
- [ ] Encrypted local storage (AES-GCM Room / EncryptedSharedPreferences) + per-user namespacing + logout wipe
- [ ] E2EE message encryption/decryption (libsignal, batched, fail-closed)
- [ ] Deep links: profile, conversation, join/chat link, magic link, share, user links
      (`meeshy://` + `https://meeshy.me`)
- [ ] Universal Link / push / socket notification routing into the correct screen
- [ ] Home-screen widgets (recent conversations, unread count, favorite contacts, quick reply, mark-read)
      **Angle mort catégoriel comblé (2026-08-11)** : premier `GlanceAppWidget`/`AppWidgetProvider` de
      `apps/android` (slice `widget-unread-count-scaffold`) — foundation minimale + sous-tranche
      "unread count" (`UnreadCountWidget`, parité avec iOS `MeeshyWidgets.UnreadCountWidget`
      `.systemSmall`). Statique/déclenché par l'OS, pas de push-refresh sur changement de données
      (l'analogue Android de `WidgetCenter.reloadAllTimelines()`). **Deuxième sous-tranche
      (2026-08-11)** : `RecentConversationsWidget` (slice `widget-recent-conversations`), parité
      avec iOS `MeeshyWidgets.RecentConversationsWidget` — pinned-first puis plus-récent-d'abord
      (`ConversationRowTime` SSOT), jusqu'à 5 lignes, tap sur une ligne = deep-link direct
      `meeshy://conversation/{id}`. A nécessité un ajout de fondation : `TokenStore.userId`
      (persisté à côté du JWT) — `SessionRepository` est en mémoire seule et vide dans un
      processus widget froid qui n'a jamais tourné le flux de démarrage normal de l'app ; le
      widget lit désormais l'id utilisateur persisté pour résoudre le nom du bon participant
      dans une conversation directe. **Troisième sous-tranche (2026-08-11)** :
      `FavoriteContactsWidget` (slice `widget-favorite-contacts`), parité avec iOS
      `MeeshyWidgets.FavoriteContactsWidget` — une "favorite contact" est une conversation
      DIRECTE épinglée (`isPinned && type == direct`), pas une notion distincte, exactement
      comme `WidgetDataManager.publishFavoriteContacts` sur iOS ; jusqu'à 8 lignes,
      plus-récent-d'abord (`ConversationRowTime` SSOT), tap = deep-link direct dans la
      conversation (`meeshy://conversation/{id}` — Android n'a pas l'équivalent de l'URI
      `meeshy://contact/{id}` d'iOS, réutilise la route déjà câblée plutôt que d'en créer une
      seconde pour le même id). Pas de badge de présence en ligne : `ApiConversation.participants`
      ne porte aucun champ `isOnline`/`lastActiveAt` côté Android (contrairement à
      `MeeshyConversation.lastSeenText` sur iOS) — un vrai gap documenté, pas un oubli. Restent :
      quick reply, mark-read, tailles/kinds additionnels, push-refresh, badge de présence.
      **Fondation posée (2026-08-11, slice `chat-composer-prefill-draft`)** : le deep-link
      `meeshy://conversation/{id}?draft={texte}` pré-remplit désormais le composer via
      `ChatViewModel.initialDraft` — débloque un futur Quick Reply RÉELLEMENT fonctionnel (celui
      d'iOS s'est avéré mort en production, cf. slice `dynamic-launcher-shortcuts`).
      **Quatrième sous-tranche livrée (2026-08-11, slice `widget-quick-reply`)** :
      `QuickReplyWidget`, parité avec iOS `MeeshyWidgets.QuickReplyWidget` — même règle de
      sélection (`premier non-lu, sinon premier`, sur le même ordre pinned-first-then-recency),
      4 chips de réponse pré-écrite (👍/OK/Merci !/Rappelle-moi, exactement le jeu d'iOS),
      chaque tap ouvrant la conversation avec la réponse déjà pré-remplie via le deep-link
      `?draft=` — **réellement fonctionnel, contrairement à son homologue iOS** (confirmé mort en
      production lors du slice `dynamic-launcher-shortcuts`). Restent : mark-read, tailles/kinds
      additionnels, push-refresh, badge de présence.
- [ ] Ongoing-call / translation-progress foreground-service notification (iOS Live Activity equivalent)
- [ ] App Actions / dynamic shortcuts (send message, call, recent conversation) — Siri/Shortcuts equivalent
      **First sub-slice shipped (2026-08-11, slice `dynamic-launcher-shortcuts`)**: dynamic launcher
      shortcuts (long-press the launcher icon) publishing up to the device's own reported max
      (`ShortcutManagerCompat.getMaxShortcutCountPerActivity`) recent conversations, pinned-first
      then most-recent (same ordering SSOT the home-screen widgets already apply), tapping one
      deep-links straight into that conversation. This is the closest ALWAYS-local, fully-testable
      Android equivalent to iOS's `OpenRecentConversationIntent` App Shortcut — confirmed by reading
      `MeeshyAppIntents.swift` end to end that iOS's other 4 App Shortcuts (Send Message, Call
      Contact, Translate, Check Notifications) are Siri/Assistant voice phrases requiring the
      `AppIntents` framework's NL parameter resolution, with **no direct Android equivalent**:
      Android's nearest analogue (Google Assistant "App Actions" via `shortcuts.xml` capability
      bindings) needs external Assistant indexing/review and isn't reliably locally verifiable —
      deliberately deferred as its own, larger follow-up rather than attempted here. Restent :
      Assistant App Actions (send message/call/translate/check notifications voice phrases).
- [ ] Crash / hang / ANR diagnostics with on-device persistence + remote report
- [ ] Privacy-gated analytics (screen tracking); client telemetry headers; network reachability awareness
- [ ] Adaptive iPad/tablet/foldable two-column layout (feed + conversation list/detail, resizable splitter)
- [ ] Deterministic conversation/post accent colour + name-hash palette + theme-adaptive readability
- [ ] Scroll-collapsing navigation header; animated brand logo; branded pull-to-refresh
- [x] Relative-time classification SSOT (`RelativeTime.classify` → `RelativeTimeUnit` ladder;
      port of iOS `RelativeTime.classify`, the threshold source of truth beneath `RelativeTimeFormatter`)
      — pure `:core:model/time`, locale-agnostic (rendering stays UI-side), `Long` arithmetic so a
      decades-old timestamp reaches the absolute-date rung without 32-bit overflow, future/skew → `Now`
- [x] Relative-time *long* framing SSOT (`RelativeTimeLongFormat.label` → `RelativeTimeLongLabel`;
      port of iOS `RelativeTimeFormatter.longString`, the detail-surface `il y a … / hier / date` framing)
      — pure `:core:model/time`, locale-agnostic (the `time.long.*` wording stays UI-side), reuses the
      `RelativeTime` second thresholds as SSOT then switches to **calendar-day** boundaries via an injected
      `ZoneId` (2h across midnight → `Yesterday`; the same instant reads `hier` vs `il y a Nh` per zone),
      future/skew → `Now`
- [x] Relative-time *short* rendering layer (`RelativeTimeFormat.short` + `RelativeTimeStrings`;
      port of the iOS `RelativeTimeFormatter` compact form `maintenant / Nmin / Nh / Nj / Nsem`)
      — pure `:sdk-ui/format`, delegates to `RelativeTime.classify` (thresholds not re-implemented) and
      maps each rung to an **injected** localized template (the `CallTimeLabel` pattern; no Android dep, JVM
      -tested), the `AbsoluteDate` rung → locale/zone date (year only when it differs). `time_relative_*`
      strings EN/FR/ES/PT + `@Composable rememberRelativeTimeStrings()` glue; **wired into the feed post
      timestamp** (raw absolute date → discreet relative label, Prisme framing; unparsable → absolute fallback)
- [x] Conversation-row trailing timestamp (parity with iOS `ThemedConversationRow`'s
      `RelativeTimeFormatter.shortString(for: conversation.lastMessageAt)`) — pure `:feature:conversations`
      `ConversationRowTime.epochMillis` resolves the row's instant (last message `createdAt` → conversation
      `updatedAt` → `createdAt`, first parseable ISO wins via the `isoToEpochMillisOrNull` SSOT, null = no
      label) and the row renders it via `RelativeTimeFormat.short` in a trailing column above the unread
      badge; **colour follows unread state** (error when unread > 0, else the conversation `accentColor`,
      matching iOS `timestampColor`)
- [x] Relative-time *long* rendering layer (`RelativeTimeLongText.long` + `RelativeTimeLongStrings`;
      port of the iOS `RelativeTimeFormatter.longString` detail form `maintenant / il y a 5 min / hier /
      il y a 3j / date`) — pure `:sdk-ui/format`, delegates to `RelativeTimeLongFormat.label` (thresholds +
      calendar-day `Yesterday` boundary not re-implemented) and maps each rung to an **injected** localized
      template; the `AbsoluteDate` rung reuses the **shared `formatAbsoluteDate`** SSOT the short formatter
      also calls (extracted this slice so the two can't drift on the date rendering). `time_relative_long_*`
      strings EN/FR/ES/PT + `@Composable rememberRelativeTimeLongStrings()` glue; **wired into the profile
      header "last seen" line** (`ProfileHeaderBuilder.lastSeenEpochMillis` — null for an online user so the
      live dot speaks, else the parsed `lastActiveAt` for AWAY/OFFLINE; rendered as `profile_last_seen`
      "Vu / Last seen {relative}")
- [x] **Prisme Linguistique on the conversation-row last-message line** — the third and
      last client to receive the rule `/CLAUDE.md` §"Règles critiques du Prisme" #3 names
      (twins: `resolveLastMessagePreview` in `packages/shared`, iOS
      `MeeshyConversation.resolvedLastMessagePreview`). `GET /conversations` ships
      `lastMessageTranslations` + `lastMessageOriginalLanguage` at the conversation ROOT;
      `ApiConversation` declared neither, so `ignoreUnknownKeys` dropped both at decode
      **and** the `ConversationCacheSource` re-encode dropped them again, and every row
      rendered `lastMessage.content` — the sender's language — for every reader. Now:
      the pair is declared, `me.meeshy.sdk.lang.resolveLastMessagePreview` is the pure
      Kotlin twin (prism walked IN ORDER, the original language competing at its own
      RANK, never a fall-back to an arbitrary translation), canonicalisation through the
      new `LanguageCodeNormalizer.normalizeForDedup` (port of the TS
      `normalizeLanguageForDedup` — the very function the gateway builds the wire map's
      KEYS with), and `messageSummaryLine(resolvedContent = …)` substitutes it for the
      raw content on STANDARD/EPHEMERAL_ACTIVE rows only. **Not yet wired**: the two
      home-screen widgets, whose `WidgetEntryPoint` exposes a `userId` but no reader
      prism, and the `conversation:updated` socket half (`ConversationUpdatedSocketEvent`
      carries none of the preview group) — both are their own slices.
