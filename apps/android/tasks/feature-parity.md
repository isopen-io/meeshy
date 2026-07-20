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
- [~] Voice recording UI (iMessage-style pill: cancel, live waveform, timer, min-duration gating) —
      **logic + pill UI done** (slice `chat-voice-recording-pill`, 2026-07-15, +29 tests). Pure
      `:feature:chat` `VoiceRecordingSession` SSOT: `Idle`/`Recording` phases, `start`/`tick`/`meter`/
      `cancel`/`stop` transitions, `canSend` min-duration gate (`>= 0.5s`, iOS `minimumSendableDuration`
      parity), `formattedElapsed` (`m:ss`, iOS `formatDuration`), `recordingDotOpacity(reduceMotion)`
      blink (iOS `dotOpacity`), and a `VoiceRecordingStop(session, outcome)` result
      (`Completed(duration, levels)` / `TooShort` / `Inactive`). Composes the existing `:core:model`
      waveform blocks (`AudioLevelNormalizer` + `WaveformLevelWindow`) — no bespoke buffer. Wired real
      (`ChatComposer`, exempt glue): blank-composer `Mic` button starts, a 100 ms `LaunchedEffect` ticks
      the timer, the `VoiceRecordingPill` (X cancel / animated waveform / blinking dot + timer / stop /
      send, stop+send gated by `canSend`) replaces the input row while recording. **Pending follow-up:**
      real `MediaRecorder`/`AudioRecord` capture feeding `meter()`, and the voice-attachment send pipeline
      (VM + upload) — the pill drives the *session* today, not yet the audio bytes.
- [◐] Attachment ladder (emoji, file, location, camera, photo library, voice) — **file + photo-library picker done**
      (slice `chat-attachment-file-picker`, 2026-07-16): the composer now carries an attach button
      (`Icons.Filled.AttachFile`) launching the system document/photo picker (`GetContent("*/*")`); the pick is
      read into memory (`readPickedAttachment` — ContentResolver byte read + `OpenableColumns.DISPLAY_NAME`
      query + declared content-type, `null`-safe on a revoked grant), its MIME resolved via the new pure
      `MimeTypeResolver` SSOT (iOS `MimeTypeResolver.swift` port — declared type first, filename extension as
      fallback), typed via pure `AttachmentMessageType.forMime` (reusing `MediaKindClassifier`), and sent through
      the **same** durable upload→graft→send chain the clipboard path uses (`ChatViewModel.sendFileAttachment`).
      Any composer text rides along as the body and clears. **Pending:** in-app camera capture, an emoji-ladder
      tray grouping the entries, voice (socket audio pipeline), and per-pick upload-progress. **Location** ships
      separately (see live-location rows).
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
- [ ] Live sentiment + language detection ("smart context zone") with language pill/picker override
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
      **Follow-up:** the interactive `includeTranslatable` arm (tap a configured-but-absent language on a
      post to request it on demand — needs a post on-demand translation path), and the per-story timeline strip.
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
- [ ] Ad-hoc blocking text translation
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
      per-post flag strip / request-missing-languages pending
- [x] Feed card stats row: like (filled when own) + comment count + repost count,
      mood emoji on the author line, pure `FeedPostPresentation` builder (8 builder
      tests + 1 model Prisme test + 3 repository optimistic/rollback tests, all green)
- [x] Social feed: cursor-paginated post list + infinite scroll done (see above) ;
      new-posts banner + realtime-head merge done (slice `feed-new-posts-banner`, 2026-07-16)
- [ ] Feed overlay shell with draggable floating buttons + radial menu ladder
- [ ] Create post (text, photos/videos, camera, files, location, audio+transcription, visibility, language)
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
      dropped]; a failed lookup degrades to the local roster. +6 `PostCommentsViewModelTest`) **done**;
      effects/blur still open
- [ ] Post / comment pin-unpin; repost / quote-repost / share; report
- [ ] Post view + dwell-time tracking; batched impression tracking
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
- [ ] Post-detail room real-time subscriptions
- [~] Repost / quote embed cell in the feed — the reposted/quoted post rendered as an
      accent-coherent quote block (author, Prisme content, first-media preview + "+N", quote/repost
      + story/reel kind badge) inside the feed card, post detail, saved and user-posts surfaces; tap
      opens the ORIGINAL post's detail. Pure `RepostEmbedBuilder` + shared `ApiRepostOf` Prisme law
      (slice `feed-repost-embed-cell`, 2026-07-17). **Still open:** the full story-/reel-canvas embed
      (needs an Android story-canvas renderer — iOS `StoryRepostEmbedCell`/`ReelRepostEmbedCell`).

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
- [ ] Mood status create, react, delete; 21h expiry + viewer tracking
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
- [~] Universal audio recorder (live waveform, duration/min-duration limits, presets)
      — **live-waveform pure core shipped** (slice `media-waveform-interpolation`, 2026-07-12):
      pure `:core:model` `me.meeshy.sdk.model.waveform` — `AudioLevelNormalizer.normalize`
      (dB→`0..1`, ports iOS `AudioRecorderManager.normalizeLevel` with added upper-clamp +
      NaN guard), `WaveformLevelWindow` (immutable 15-sample rolling ring, ports `levelHistory`
      + the initial `Array(repeating:0,count:15)`), `WaveformInterpolator.interpolate`
      (levels→`barCount` linear-blend strip, ports `UniversalComposerBar.interpolatedLevel`,
      whole strip in one pass). +28 tests. The `MediaRecorder`/`AudioRecord` capture + the
      Compose `Canvas` that paints the strip remain app-side glue (pending); this same core
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
      header bytes, solid-colour/gradient/alpha round-trips through `decode`, orientation, guards). App-side
      raster→`Bitmap` wrap + Coil placeholder wiring + slide-level generation (encode → upload) still pending.

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
