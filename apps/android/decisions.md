# Meeshy Android — Architectural Decision Records

Key architectural choices for the native Android rebuild, each with context,
rejected alternatives, and consequences. Companion: `ARCHITECTURE.md`.

Format: every record is dated; status is `accepted` unless noted.

---

## ADR-001 — Native Android, Kotlin + Jetpack Compose
**Date:** 2026-05 · **Status:** accepted

**Context.** Rebuild a 673-file SwiftUI app as a first-class Android app.

**Decision.** 100 % Kotlin, Jetpack Compose (Material 3), single-Activity.

**Rejected.** Flutter / React Native / KMP-shared-UI — none give native
fidelity, the platform-API depth (Telecom, WorkManager, Media3, RenderEffect)
the feature set needs, or the charte-graphique control required.

**Consequences.** Full access to AndroidX; Compose recomposition model drives
the performance strategy; the iOS SwiftUI structure maps cleanly to Compose.

---

## ADR-002 — `minSdk 26`, `targetSdk 35`
**Date:** 2026-05 · **Status:** accepted

**Context.** API floor vs. reach vs. modern-API availability.

**Decision.** `minSdk 26` (Android 8.0). `targetSdk 35`.

**Rejected.** `minSdk 21/23` — would force desugaring of features used heavily
(notification channels, `java.time`, foreground-service typing, adaptive icons,
crypto) and lose >99 %-reach modern APIs for negligible extra audience.

**Consequences.** Notification Channels, `java.time`, `ConnectionService`,
`EncryptedSharedPreferences`, adaptive icons available without shims.

---

## ADR-003 — Module graph: SDK split + feature modules
**Date:** 2026-05 · **Status:** accepted

**Context.** iOS is a dual-target SDK (`MeeshySDK` + `MeeshyUI`) plus an app
with 2840-/2400-LOC god objects.

**Decision.** `:sdk-core` + `:sdk-ui` (the SDK, mirroring iOS) + 14
`:feature:*` modules + `:app` + `:core:common`. Dependency rules enforced by a
convention plugin; no feature→feature edges.

**Rejected.** (a) Single `:app` module — re-creates the god-object problem,
slow incremental builds. (b) Pure Clean-Architecture 3-module-per-feature —
ceremony disproportionate to team size.

**Consequences.** Parallel builds, enforced boundaries, the SDK stays
publishable (`explicitApi()`). ~17 build files — kept DRY via `build-logic/`.

---

## ADR-004 — Room as the single source of truth
**Date:** 2026-05 · **Status:** accepted

**Context.** iOS runs a **dual** persistence pipeline — GRDB stores *and* a
parallel `CacheCoordinator`, hand-synced (audit part-06, explicit tech debt).

**Decision.** One Room database is the SoT. Repositories expose `Flow` from Room
queries; network and sockets write **into** Room; the UI only ever observes Room.

**Rejected.** Replicating the dual store; SQLDelight (Room has tighter Paging 3 /
Compose / Hilt integration and is the platform default).

**Consequences.** No dual-write reconciliation bugs; CQRS-ish flow; Room `Flow`
removes the iOS need for a `NotificationCenter` DB-change relay.

---

## ADR-005 — Cache-first SWR as shared infrastructure
**Date:** 2026-05 · **Status:** accepted

**Context.** The audit names cache-first SWR the most important pattern to port
(part-01) — it is what makes the app feel instant.

**Decision.** A `CacheResult` sealed class (`Fresh`/`Stale`/`Expired`/`Empty`) +
`CachePolicy` + a `cacheFirstFlow {}` primitive in `:sdk-core`. Stale is served
immediately; skeletons appear only on `Empty`; network failure never clobbers
cached data.

**Rejected.** Per-screen ad-hoc caching (iOS inconsistency: `BlockedUsersView`/
`BookmarksView` skip it — part-07); the Store5 library (a hand-rolled primitive
on Room is smaller and exactly fits the four-state contract).

**Consequences.** Every list/detail repository is uniform and testable; this is
the first thing built in Phase 3.

---

## ADR-006 — One offline outbox + WorkManager
**Date:** 2026-05 · **Status:** accepted

**Context.** iOS fragments offline writes into `OfflineQueue` + `OutboxFlusher`
+ `SettingsActionQueue` + `RetryEngine` + `StoryPublishQueue` (audit part-16).

**Decision.** ONE Room `outbox` table + a `WorkManager` `OutboxFlusher` (FIFO,
exponential backoff, `Exhausted` ×5, in-queue coalescing). `clientMutationId`/
`clientMessageId` formats are **byte-identical to iOS/gateway** (wire contract).

**Rejected.** Multiple specialised queues; a foreground service for flushing
(WorkManager with an expedited connectivity-constrained job is the idiomatic,
battery-friendly choice).

**Consequences.** Optimistic UI everywhere with a single rollback mechanism (the
outcome `SharedFlow`); crash-safe boot recovery resets `Inflight` → `Pending`.

---

## ADR-007 — Hilt for dependency injection
**Date:** 2026-05 · **Status:** accepted

**Decision.** Hilt. iOS `*Providing` protocols → Kotlin interfaces bound in Hilt
modules; **every** service gets an interface (some iOS services lacked one).
Dispatchers are injected.

**Rejected.** Koin (less compile-time safety); manual DI (does not scale to ~17
modules).

**Consequences.** Uniform test fakes; `@Singleton` replaces iOS `.shared`.

---

## ADR-008 — UDF: one `UiState` + `StateFlow` per screen
**Date:** 2026-05 · **Status:** accepted

**Context.** iOS scatters many `@Published` properties, triggering broad
re-renders; some screens hoard 15–40 `@State` network buffers (audit part-02/12).

**Decision.** One immutable `UiState` data class per screen, exposed as
`StateFlow`; a single `onEvent(UiEvent)` sink; one-shot `UiEffect` via Channel.

**Rejected.** Many independent flows per screen; raw `mutableStateOf` in
ViewModels.

**Consequences.** Predictable recomposition; trivially testable ViewModels.

---

## ADR-009 — Compose `LazyColumn` for hot lists (with a documented escape hatch)
**Date:** 2026-05 · **Status:** accepted

**Context.** iOS drops to `UICollectionView` for the message list and feed
(precomputed heights, diffable data sources) for zero dropped frames.

**Decision.** Default to Compose `LazyColumn`/`LazyVerticalGrid` with stable
`key`s, `contentType`, `@Immutable` item models, and Paging 3. A
`RecyclerView`-via-`AndroidView` escape hatch is documented but adopted **only**
if a profiler proves jank on a specific list.

**Rejected.** Porting the dual renderer (iOS itself flags this as debt — part-07
has two parallel renderers with divergent models); a `RecyclerView`-first design
(fights the Compose-everywhere choice without evidence).

**Consequences.** One renderer per list; performance defended by skippability +
Paging, verified with Compose compiler metrics in CI.

---

## ADR-010 — Type-safe Navigation-Compose, single Activity, overlay layer
**Date:** 2026-05 · **Status:** accepted

**Decision.** Navigation-Compose with `@Serializable` type-safe routes; one
Activity; floating UI (feed, radial menu, call pill, toasts) in a Compose
overlay layer above the `NavHost`.

**Rejected.** Multi-Activity; Fragment nav; iOS-style stringly-typed routes
(fragile — audit part-02).

**Consequences.** Compile-checked navigation args; `CompositionLocal` removes
the iOS "sheets don't inherit EnvironmentObject" pitfall.

---

## ADR-011 — Adaptive layout from day one (phone / tablet / foldable / ChromeOS)
**Date:** 2026-05 · **Status:** accepted

**Context.** iOS ships an `iPadRootView` two-column layout (audit part-13);
Android must run well — not just run — on tablets, foldables and ChromeOS.

**Decision.** `:app` hosts a `NavigableListDetailPaneScaffold` driven by
`WindowSizeClass`: single-pane on compact, two-pane list-detail on medium/
expanded. Foldable posture via `WindowLayoutInfo`. One binary.

**Rejected.** Phone-only first (Google Play large-screen requirements + the iOS
parity goal make adaptivity non-optional); a separate tablet build.

**Consequences.** Screens are designed pane-aware from the start; no late retrofit.

---

## ADR-012 — Android only; no Compose Multiplatform / desktop target
**Date:** 2026-05 · **Status:** accepted

**Context.** Could `:sdk-core` be Kotlin Multiplatform to enable a future
Compose-Desktop client?

**Decision.** Android only. `:sdk-core` stays an Android library (AndroidX deps
allowed). No KMP, no desktop target.

**Rejected.** KMP-ready `:sdk-core` — would constrain the data layer (no direct
AndroidX/Room/WorkManager use) for a desktop client that is out of scope. Windows
WSA is discontinued; ChromeOS/Android-16 desktop mode already run the Android app.

**Consequences.** Simpler, idiomatic Android data layer. Revisit only if a
desktop client is ever scoped.

---

## ADR-013 — Security: Keystore-backed storage, libsignal E2EE, fail-closed
**Date:** 2026-05 · **Status:** accepted

**Context.** iOS debt: tokens in `UserDefaults`; an E2EE MVP (single ECDH, no
ratchet) that **silently falls back to plaintext** on encrypt failure; a
conversation PIN hashed with bare SHA-256 (audit part-04/06/15).

**Decision.** Auth tokens in `EncryptedSharedPreferences`/Keystore from day one
(per-user namespaced). Sensitive Room tables encrypted (AES-GCM / SQLCipher).
E2EE via `libsignal` bindings — a real ratchet, **fail-closed** (never send
plaintext on failure). Conversation PIN via a salted slow KDF (Argon2).
Per-user cache namespacing + full wipe on logout/account-switch. SSRF guards on
media-URL resolution retained.

**Rejected.** Reproducing the iOS MVP crypto; plain `SharedPreferences` for tokens.

**Consequences.** Security is correct from the first commit, not retrofitted.

---

## ADR-014 — `kotlinx.serialization` with lenient, forward-compatible decoding
**Date:** 2026-05 · **Status:** accepted

**Context.** The gateway evolves and old clients persist drafts; iOS uses
pervasive defensive decoding (`id`/`_id` fallback, field-rename aliases,
optional→default promotion — audit part-15).

**Decision.** `kotlinx.serialization` with `coerceInputValues = true`,
`ignoreUnknownKeys = true`, default values, `@JsonNames` for legacy aliases, and
custom serializers for `id`/`_id`. One shared `Json` config.

**Rejected.** Moshi/Gson; a strict parser (would crash on valid evolving payloads).

**Consequences.** Resilient to gateway drift; round-trip tested with real payloads.

---

## ADR-015 — Two Socket.IO connections, long-polling transport
**Date:** 2026-05 · **Status:** accepted

**Context.** iOS runs two independent sockets (message + social) and forces
HTTP long-polling — WebSocket proved unreliable against the gateway
(audit part-17).

**Decision.** Match it: `socket.io-client-java` ×2, long-polling transport. ~80
event publishers collapse into sealed-class `SharedFlow`s; handlers write into
Room; socket errors never force logout.

**Rejected.** A single multiplexed socket; WebSocket transport (revisit only
after verification against the gateway).

**Consequences.** Behaviour matches the tested gateway contract; independent
reconnect per socket.

---

## ADR-016 — Charte graphique locked + screenshot-tested
**Date:** 2026-05 · **Status:** accepted

**Context.** Preserving the Meeshy visual identity is a hard product requirement.

**Decision.** The design system (Indigo scale, `#6366F1→#4338CA` gradient,
semantic colours, theme tokens, typography, spacing, motion, the conversation
`accentColor` algorithm) is locked in `ARCHITECTURE.md §10` and lives in
`:sdk-ui`. Roborazzi screenshot tests (light + dark) are a CI gate for every
primitive and screen. No hardcoded hex in feature code.

**Rejected.** Per-feature styling; a Material-You dynamic-colour theme (would
override the brand Indigo).

**Consequences.** Visual drift is caught mechanically; the brand is guaranteed.

---

## ADR-017 — Paging 3 for long lists
**Date:** 2026-05 · **Status:** accepted

**Context.** iOS hand-rolls `offset/pageSize/hasMore/loadMore` per screen
(audit part-18) and `MessageStore` grows unbounded (part-05).

**Decision.** Paging 3 + `RemoteMediator` (Room-backed) for message history,
feed, search, member and notification lists.

**Rejected.** Hand-rolled pagination (memory-unbounded, repetitive, error-prone).

**Consequences.** Bounded memory, uniform loading/error/append states.
