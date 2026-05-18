# Meeshy Android — Architecture

Target architecture for the native Android rebuild, designed up-front from the
**integral audit** of all 673 iOS files (`tasks/audit/part-01..23.md`). This
document is the contract: feature code is written against it, not around it.

Audience: senior mobile engineers. Companion files: `decisions.md` (ADRs),
`tasks/feature-parity.md` (the 696-capability catalogue).

---

## 1. Goals & constraints

| # | Goal | Consequence |
|---|------|-------------|
| G1 | **Faithful feature parity** with iOS (696 capabilities) | The audit, not guesswork, drives scope. |
| G2 | **Instant-app feel** — never a spinner over cached data | Cache-first SWR is mandatory infrastructure, not per-screen. |
| G3 | **Offline-first** — reads always work, writes queue and replay | One durable outbox; FIFO flush on reconnect. |
| G4 | **Charte graphique preserved without compromise** | Design system is locked (§10) + screenshot-tested. |
| G5 | **Phone + tablet + foldable + ChromeOS**, one binary | Adaptive layouts (WindowSizeClass) from day one. |
| G6 | **60 fps** hot lists, cold start ≤ 1 s to interactive | Skippable composables, stable keys, Paging 3, baseline profiles. |
| G7 | **Don't inherit iOS tech debt** | §11 lists what is explicitly *not* ported. |

Platform: `minSdk 26` (Android 8.0), `targetSdk 35`, Kotlin 2.x, Compose
(Material 3), single-Activity. **Android only** — no Compose Multiplatform /
desktop target; `:sdk-core` stays an Android library.

---

## 2. Module graph

The iOS app is a dual-target SDK (`MeeshySDK` + `MeeshyUI`) consumed by the app.
Android mirrors that and adds **feature modules** — the iOS audit repeatedly
flagged god objects (`ConversationViewModel` 2840 LOC, `MessageDetailSheet`
2400 LOC); module boundaries are the structural defence against them.

```
                       ┌─────────┐
                       │  :app   │  Application, MainActivity, NavHost,
                       └────┬────┘  Hilt assembly, adaptive Scaffold,
                            │        FCM service, widgets, share-target
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼─────┐        ┌─────▼──────┐      ┌─────▼──────┐
   │:feature: │  ...   │ :feature:  │      │ :feature:  │   12 feature modules
   │  auth    │        │   chat     │      │  stories   │
   └────┬─────┘        └─────┬──────┘      └─────┬──────┘
        │                    │                   │
        └──────────┬─────────┴─────────┬─────────┘
                   │                   │
             ┌─────▼──────┐      ┌──────▼─────┐
             │  :sdk-ui   │─────▶│ :sdk-core  │
             └─────┬──────┘      └──────┬─────┘
                   └──────┬─────────────┘
                    ┌─────▼──────┐
                    │:core:common│  dispatchers, Result, time, logging
                    └────────────┘
```

**Modules**

- **`:core:common`** — `CoroutineDispatchers`, `MeeshyResult`/error model,
  `Clock`, `Logger` (Timber facade), pure utils. No Android-UI deps.
- **`:sdk-core`** — the data + domain SDK. Models & DTOs (`kotlinx.serialization`),
  Retrofit/OkHttp networking, the two Socket.IO wrappers, **Room** database,
  DataStore, repositories, the SWR engine (`CacheResult`/`cacheFirstFlow`), the
  offline outbox, `MessageStateMachine`, `ConversationSyncEngine`,
  `LanguageResolver`, crypto/E2EE. `explicitApi()`, publishable, no Compose.
- **`:sdk-ui`** — the Compose **design system** + reusable UI: charte graphique
  (`MeeshyPalette`, theme tokens, typography, spacing, motion, shapes),
  primitives (avatar, identity bar, buttons, fields, skeletons, toasts,
  progressive image, swipeable rows, pickers), and the Message **Bubble**
  component family. Depends on `:sdk-core` for models. `explicitApi()`.
- **`:feature:*`** — one module per domain: `auth`, `conversations`, `chat`,
  `feed`, `stories`, `calls`, `communities`, `contacts`, `profile`, `settings`,
  `notifications`, `search`, `links`, `media`. Each owns its Compose screens,
  ViewModels, and a nav sub-graph.
- **`:app`** — `Application`, single `MainActivity`, the `NavHost`, Hilt graph
  assembly, the adaptive `Scaffold`, FCM `Service`, widgets, share-target,
  deep-link routing.

**Dependency rules** (enforced by a Gradle convention plugin):

1. `:feature:*` may depend on `:sdk-core`, `:sdk-ui`, `:core:common` — **never on
   another `:feature:*`**. Cross-feature navigation goes through route contracts
   declared in `:app` (or a thin `:core:navigation`).
2. `:sdk-ui` → `:sdk-core` → `:core:common`. No upward edges.
3. Only `:app` sees the whole graph and wires DI.
4. `:sdk-core` has **no** Compose / Activity dependency.

Convention plugins in `build-logic/` keep the ~17 `build.gradle.kts` files DRY.

---

## 3. Layered architecture & state

Each feature follows **UI → (Domain) → Data**, with strict Unidirectional Data
Flow. MVVM as on iOS, but with the god-object cure baked in.

### UI layer (`:feature:*`, `:sdk-ui`)
- `@Composable` screens are **stateless**: they receive a `UiState` and emit
  events. No business logic, no direct repository calls.
- One **`UiState` data class** per screen, exposed as `StateFlow<UiState>` from a
  Hilt `ViewModel`. (iOS scatters many `@Published`; we collapse to one state.)
- Events: a single `onEvent(UiEvent)` sink (sealed interface). One-shot effects
  (navigation, snackbars) via a `Channel`/`SharedFlow<UiEffect>`.
- Every `UiState` and list-item model is `@Immutable`/`@Stable` so Compose skips
  recomposition. Leaf list items receive **primitive snapshots** — never a
  global singleton `StateFlow` collected inside a row (the iOS "Zero
  Unnecessary Re-render" rule, audit parts 06/08/11/12).

### Domain layer (optional, `:sdk-core`)
- A **use-case / interactor** is introduced **only** where logic is non-trivial
  or shared across features (`SendMessageUseCase`, `SyncConversationsUseCase`,
  `ResolveDisplayContentUseCase` for the Prisme). Trivial reads call the
  repository directly — no ceremony, no one-use-case-per-method.

### Data layer (`:sdk-core`)
- **Repository** per aggregate (`MessageRepository`, `ConversationRepository`,
  `FeedRepository`, …). The repository is the single API the rest of the app
  sees; it owns Room, network, sockets, the outbox, and the SWR policy.
- **Room is the single source of truth.** Repositories expose `Flow` from Room
  queries; UI observes Room, never the network directly. (iOS runs a dual
  GRDB ↔ `CacheCoordinator` write — audit part-06 — that debt is **dropped**.)

```
Compose screen ──state──▶ ViewModel ──▶ UseCase? ──▶ Repository
      ▲                      ▲                          │
      └────── UiState ───────┘            Room Flow ◀────┤── network / sockets
                                                         │   write into Room
                                                         └── outbox (mutations)
```

---

## 4. Load-bearing pattern #1 — SWR cache

The audit calls cache-first SWR "the single most important pattern to port
faithfully" (part-01) — it is what makes the app feel instant.

```kotlin
sealed interface CacheResult<out T> {
    data class Fresh<T>(val value: T) : CacheResult<T>
    data class Stale<T>(val value: T) : CacheResult<T>   // serve now, revalidate
    data object Expired : CacheResult<Nothing>           // value too old, refetch
    data object Empty   : CacheResult<Nothing>           // cold start → skeleton
}

data class CachePolicy(val freshFor: Duration, val keepFor: Duration)
```

`cacheFirstFlow {}` is the primitive every list/detail repository uses:

1. Emit the Room-cached value immediately as `Fresh` or `Stale` (by age).
2. If `Stale`/`Expired`/`Empty`, fetch network on `Dispatchers.IO`.
3. Persist the network result into Room (Room's `Flow` re-emits → UI updates).
4. Network failure **never** overwrites a usable cached value.

Rules (from the Instant-App principles + audit):
- **Skeleton/shimmer only on `Empty`** (cold cache). Stale data is shown, never
  a spinner.
- L1 is an in-memory LRU only where Room round-trips are measurably hot; Room
  (L2) is always the durable SoT.
- Cursor + `hasMore` are persisted alongside the list (audit part-05).
- The cache layer emits change events via Room `Flow` — **no polling loops**
  (`while !cached { delay(1s) }` from iOS audit part-08 is an anti-pattern).

---

## 5. Load-bearing pattern #2 — Offline outbox

The audit calls the outbox "the spine of the app's instant + offline UX"
(part-06). iOS fragmented it into `OfflineQueue` + `OutboxFlusher` +
`SettingsActionQueue` + `RetryEngine` + `StoryPublishQueue`. **Android
consolidates to ONE.**

- One Room table `outbox(cmid, kind, payloadJson, attempts, state, createdAt)`.
  `kind` is a sealed taxonomy: `SendMessage`, `EditMessage`, `DeleteMessage`,
  `Reaction`, `ReadReceipt`, `FriendRequest`, `Block`, `ProfileUpdate`,
  `SettingsUpdate`, `Post`, `Comment`, `Like`, `PublishStory`, …
- **`clientMutationId` (`cmid_…`) / `clientMessageId` (`cid_…`)** are the
  idempotency keys — **byte-identical formats to iOS/gateway** (wire contract,
  audit parts 16/17). The gateway `MutationLog` dedups replays.
- **`OutboxFlusher`** runs in a `WorkManager` unique work, expedited on a
  connectivity constraint: FIFO drain, exponential backoff, `Exhausted` after 5
  attempts, transient-vs-permanent error classification, 404-as-success.
- **In-queue coalescing** (audit part-16): send+delete cancels both, repeated
  edits merge, a reaction toggle cancels itself.
- An **outcome `SharedFlow<OutboxOutcome>` keyed by `cmid`** drives optimistic
  rollback when an item is `Exhausted`.
- **Crash-safe boot recovery**: on launch, reset `Inflight` rows → `Pending`,
  re-attach orphaned audio files.

## Pattern #3 — Optimistic updates
Snapshot → apply local mutation → enqueue outbox → reconcile / roll back on the
outcome flow. An in-flight guard set per entity prevents rapid-tap desync;
socket echoes are split self-vs-others (self updates a `likedIds` set, others a
`likeDelta` count) — audit part-09.

## Pattern #4 — Message delivery
`MessageStateMachine` is a **pure, fully unit-tested** function:
`sending → sent → delivered (✓✓) → read`, plus `retry`/`failed`. A
`PendingId` table maps `localId ↔ serverId`; upsert uses a 3-tier lookup
(PendingId → primary key → serverId scan) so an optimistic bubble is never
duplicated when the server echo arrives (audit part-16). The 8-state delivery
enum is the single model (iOS had a 5-state and an 8-state — part-07; unified).

---

## 6. Real-time — Socket.IO

- **Two independent connections**: message socket + social socket — kept
  separate (independent reconnect), matching iOS (audit part-17).
- **Transport forced to HTTP long-polling** initially — WebSocket proved
  unreliable against the gateway on iOS; revisit only after verification.
- ~80 iOS Combine publishers collapse into a few **sealed-class `SharedFlow`s**
  (`MessageSocketEvent`, `SocialSocketEvent`) — smaller surface, exhaustive `when`.
- Socket ACK callbacks are bridged with `suspendCancellableCoroutine`.
- Socket handlers **write into Room**; the UI observes Room (CQRS-ish, audit
  part-05). Translation/transcription arrive asynchronously post-fetch.
- **`NotificationCoordinator` authority model** (audit part-15): socket events
  are authoritative; cache/REST snapshots may only *seed* unseen entries and
  must never regress a socket-owned value. Port the precedence rules exactly.
- Socket errors **never** force logout — only an APIClient 401 does.
- Reconnect re-joins rooms and runs the delta-sync gap-fill.
- Async event handlers are wrapped in try/catch (`emit()` does not await).

---

## 7. Navigation & adaptive layout

- **Single Activity**, Navigation-Compose with **type-safe routes**
  (`@Serializable` route objects) — replaces iOS stringly-typed routes.
- Each `:feature:*` contributes a nav sub-graph; route *contracts* for
  cross-feature jumps live in `:app`.
- **Overlays** (feed, radial menu, call pill, toasts, banners) are a Compose
  overlay layer (`Box` + `zIndex`) above the `NavHost` — mirrors the iOS
  `ZStack` overlay model.
- **Adaptive (G5) — first-class from day one.** `:app` hosts a
  `NavigableListDetailPaneScaffold` driven by `WindowSizeClass`:
  - Compact (phone): single pane, full-screen navigation.
  - Medium/Expanded (tablet, foldable unfolded, ChromeOS, desktop mode):
    two-pane list-detail — conversation list + conversation, and feed +
    detail — the direct equivalent of the iOS `iPadRootView` two-column
    (audit part-13).
  - Foldable hinge / posture handled via `WindowManager` `WindowLayoutInfo`.
- Deep links (`meeshy://`, `https://meeshy.me`) resolved by a pure
  `DeepLinkRouter`; push/socket/notification routing normalised into **one**
  event type then routed once (iOS triplicated this — audit part-13).

---

## 8. Dependency injection & concurrency

- **Hilt** everywhere. iOS `*Providing` protocols → Kotlin **interfaces** bound
  in Hilt modules; every service gets an interface (some iOS services lacked
  one — audit part-17) for uniform test fakes.
- iOS `.shared` singletons → Hilt `@Singleton`; resist literal translation when
  a scoped repository + ViewModel is cleaner.
- Coroutines + `Flow`. **Dispatchers are injected** (`CoroutineDispatchers`) —
  never hard-coded — so tests use `StandardTestDispatcher`.
- iOS `actor`s → classes confined to a dispatcher or guarded by `Mutex`; Room
  already serialises DB writes.
- Cancellable `Job`s replace iOS `Task`/`Timer`; `flatMapLatest`/`debounce`
  replace cancel-on-change `Task`s. Frame/audio callbacks stay off the main
  thread and pass immutable data classes (audit part-04).
- The whole class of Swift-6 strict-concurrency workarounds (`@unchecked
  Sendable`, `nonisolated`, GRDB observation crashes) **does not exist** on
  Android — write idiomatic Kotlin, don't port the scars (audit part-05/16).

---

## 9. Performance strategy (G6)

- **Compose `LazyColumn`/`LazyVerticalGrid`** for all lists, with stable `key`s
  and `contentType`. iOS uses a `UICollectionView` escape hatch for hot lists;
  Compose's native recycling + skippable items is the equivalent. A
  `RecyclerView`-via-`AndroidView` escape hatch is documented but **used only
  if a profiler proves jank** — default is Compose.
- **Paging 3** for the message history, feed, search, and member lists —
  replaces iOS hand-rolled `offset/hasMore/loadMore` pagination (audit part-18)
  and bounds memory (iOS `MessageStore` grows unbounded — part-05).
- **Skippability**: `@Immutable`/`@Stable` everywhere; verify with Compose
  compiler metrics in CI. Stable lambda refs / an event sink so callbacks don't
  break skipping (iOS excludes the 13-closure `BubbleCallbacks` from equality —
  part-07).
- **Message Bubble**: port the iOS gold-standard verbatim — an immutable
  `BubbleContent` built by a pure `BubbleContentBuilder`, fed to small skippable
  composables with primitive inputs. Off-thread `TextMeasurer` layout caching
  for bubbles (iOS `BubbleLayoutEngine` — part-16).
- **Images**: Coil 3, 3-tier progressive (ThumbHash placeholder → thumbnail →
  full), bounded memory cache, downsampling.
- **Decorative animation** (`graphicsLayer`/`compositingStrategy` for ambient
  backgrounds — iOS `drawingGroup()`) gated behind reduce-motion + battery.
- Burst-coalesce socket translation events (~80 ms debounce → ~80 % fewer
  recompositions — part-05).
- **Baseline Profiles** + R8 for cold-start; splash min-duration to avoid a
  flash on hot cache.
- Budget: cold start ≤ 1 s to interactive, zero dropped frames on message
  scroll, < 150 MB typical RSS.

---

## 10. Design System — **CHARTE GRAPHIQUE (LOCKED)**

> **Non-negotiable.** The Meeshy visual identity is preserved pixel-faithfully.
> Any screen that deviates from this section fails review. Verified by Roborazzi
> screenshot tests (light + dark) for every primitive and screen.

### 10.1 Brand — Indigo
The identity is the **Indigo gradient `#6366F1 → #4338CA`** (logo-derived). The
gradient is THE signature — CTAs, hero elements, logo. It is sacred and must not
be re-hued, re-angled, or substituted.

### 10.2 Indigo scale (`MeeshyPalette`)
`indigo50 #EEF2FF` · `indigo100 #E0E7FF` · `indigo200 #C7D2FE` ·
`indigo300 #A5B4FC` · `indigo400 #818CF8` · **`indigo500 #6366F1` (primary /
gradient start)** · `indigo600 #4F46E5` · **`indigo700 #4338CA` (primary deep /
gradient end)** · `indigo800 #3730A3` · `indigo900 #312E81` · `indigo950 #1E1B4B`.

### 10.3 Semantic colours (static, theme-independent)
`success #34D399` · `warning #FBBF24` · `error #F87171` · `info #60A5FA` ·
`readReceipt #818CF8`.

### 10.4 Theme tokens (`MeeshyThemeTokens`, light + dark)
- **Light**: white / indigo-tinted surfaces, `indigo950` text, `indigo200` borders.
- **Dark**: near-black indigo-tinted surfaces, `indigo50` text, `indigo900` borders.
- Dark mode is driven by the persisted app theme preference **and**
  `@Composable`-read `isSystemInDarkTheme()` for the `system` option — never the
  device content locale.

### 10.5 Conversation accent colour (deterministic)
Every conversation has a unique accent computed from its metadata — ported from
`ColorGeneration.swift` (already in `:sdk-core/DynamicColorGenerator`):
```
primary   = blend(languageColor·0.30, typeColor·0.30, themeColor·0.40)
secondary = hueShift(primary, +30°)
accent    = hueShift(primary, −30°)
```
Fallback: `DynamicColorGenerator.colorForName(name)` (DJB2 hash → 20-colour
palette). **Rule:** every conversation-context component uses `accentColor`;
semantic colours stay static; no hardcoded hex (iOS has stray hex in `AboutView`/
`AffiliateView`/Support — audit part-06/12; **fixed on Android**).

### 10.6 Typography, spacing, shape, motion
- Typography: a Material 3 type scale mapped to the iOS roles; **scalable `sp`**
  honouring system font size — no fixed point sizes (iOS regression part-10).
- Spacing: 4 dp base grid; shape: rounded tokens matching the iOS corner radii.
- Glass UI: translucent surface + indigo-tinted border (iOS `.ultraThinMaterial`).
- Motion: spring `response 0.4–0.7 / damping 0.6–0.8`; staggered list-item entry
  `0.04–0.05 s × index`; this stagger is part of the brand and is preserved.
- Haptics: light / medium / success / error mapped to `HapticFeedback`.

### 10.7 Component family
Avatar (story ring + mood badge + presence dot), identity bar, buttons,
fields, skeleton/shimmer, toasts, swipeable rows, tag input, branded
pull-to-refresh, progressive image, the Message Bubble family, animated brand
logo, scroll-collapsing header — all in `:sdk-ui`, all screenshot-tested.

---

## 11. What is explicitly NOT ported (iOS debt — from the audit)

- Dual persistence (GRDB ↔ `CacheCoordinator`) → **one Room SoT**.
- God objects (`ConversationViewModel` 2840 LOC, `MessageDetailSheet` 2400 LOC)
  → decomposed per §3.
- E2EE MVP (single ECDH, no real ratchet, **plaintext fallback on encrypt
  failure**) → **libsignal, fail-closed** (audit part-04/06).
- Tokens in `UserDefaults` → `EncryptedSharedPreferences`/Keystore from day one.
- Conversation PIN hashed with bare SHA-256 → salted slow KDF (Argon2).
- `print()` logging → Timber structured logging.
- `NotificationCenter` stringly-typed event bus → typed `SharedFlow`.
- Stringly-typed routes → type-safe nav.
- Cache-availability polling loops → Room `Flow` events.
- Five parallel queues → one outbox (§5).
- Hardcoded French strings → `strings.xml` resources (full i18n).
- iOS compiler workarounds (file splitting, `AnyView`, 60-parameter inits, ARM64e
  PAC dodges, GRDB observation crash relay) → not applicable, not replicated.
- Duplicated logic (forwarding ×3, composer/attachment handlers ×2, Prisme
  resolution ×3, two fullscreen video players) → single implementations.
- Dead/placeholder code (`OverlayMenu`, `ProfileSupportViews`, `LiveActivityBridge`
  stub, `WebRTCStubs`, legacy bridge shims) → built properly or omitted.

---

## 12. Heaviest-risk subsystems (ranked) & approach

1. **Story canvas / rendering engine** — iOS uses CALayer/Metal/MPS/AVFoundation/
   PencilKit with no 1:1 Android mapping. Approach: a dedicated subsystem — one
   Kotlin `StoryRenderer` (the single source of truth) driving a Compose
   `Canvas`/custom `View` for the live composer **and** the reader **and** a
   Media3 `Transformer` for export (WYSIWYG parity, audit part-21). Effects via
   `RenderEffect`/GLSL. PencilKit's opaque blob → a **portable point/stroke ink
   model** (cross-platform JSON). The design-space (1080×1920) geometry and
   reprojection maths port verbatim.
2. **WebRTC calls** — CallKit → Telecom `ConnectionService` + full-screen-intent
   incoming UI + foreground service; PushKit → FCM data messages. Port the call
   **FSM, timeouts, reconnection, reason mapping**; **discard** the CallKit
   bug-workarounds. Android's libwebrtc *does* expose the ADM, so the dual-stream
   effect/transcription split (disabled on iOS) can be implemented properly.
3. **Story timeline video editor** — a typed command stack (`sealed
   TimelineCommand`, `apply`/`revert` on an immutable `TimelineProject`,
   list+cursor undo/redo) → Media3 `Composition`/`Transformer` + `ExoPlayer`;
   sample-accurate audio scheduling re-implemented against the Android audio clock.
4. **Offline outbox + sync engine** — §5; mostly pure logic, high-value, well
   specified by the audit.
5. **E2EE** — adopt `libsignal` bindings; do not reproduce the iOS MVP.

---

## 13. Testing strategy (TDD — non-negotiable, per CLAUDE.md)

- **JVM unit tests** for every ViewModel, repository, the SWR engine, the
  outbox/coalescing logic, `MessageStateMachine`, `LanguageResolver`,
  `DynamicColorGenerator`, deep-link routing — red → green → refactor.
- Test **behaviour through public APIs**; fakes implement the Hilt interfaces;
  factory functions for data (no shared mutable state).
- **Roborazzi** screenshot tests render Compose on the JVM — the charte
  graphique fidelity gate (§10), light + dark, for every `:sdk-ui` primitive and
  every feature screen.
- `kotlinx.serialization` round-trip tests with real gateway payloads; lenient
  decoding (`coerceInputValues`, `@JsonNames`, `id`/`_id`) verified.
- Room + instrumented tests for migrations and DAO queries.
- Gates: `./meeshy.sh build` (compile) and `./meeshy.sh test` (JVM) must pass
  before any commit.

---

## 14. Build order

`Phase 2` Module graph + Hilt + nav skeleton + adaptive scaffold →
`Phase 3` SDK foundation (SWR cache first, then outbox, sync, sockets, push,
E2EE) → `Phase 4` design system + `:sdk-ui` primitives (screenshot baseline) →
`Phase 5` feature slices: Auth → Conversations → Chat → Feed → Stories → Calls →
Communities/Contacts/Profile/Settings/Notifications/Search/Links/Media →
`Phase 6` integration, deep links, adaptive verification, final diff audit.

Each phase leaves the build green and the app runnable.
