# Meeshy Android — Architecture

Target architecture for the native Android rebuild, designed up-front from the
**integral audit** of all 673 iOS files (`tasks/audit/part-01..23.md`) and
hardened against a SOTA peer review (`tasks/architecture-review.md`).

This document is the contract: feature code is written against it, not around
it. Audience: senior mobile engineers. Companions: `decisions.md` (ADR-001..023),
`tasks/feature-parity.md` (696-capability catalogue), `tasks/architecture-review.md`.

---

## 1. Goals & constraints

| # | Goal | Consequence |
|---|------|-------------|
| G1 | Faithful feature parity with iOS (696 capabilities) | The audit, not guesswork, drives scope. |
| G2 | Instant-app feel — never a spinner over cached data | Cache-first SWR is mandatory infrastructure. |
| G3 | Offline-first — reads always work, writes queue and replay | One durable, lane-partitioned outbox. |
| G4 | Charte graphique preserved without compromise | Design system locked (§13) + screenshot-tested. |
| G5 | Phone + tablet + foldable + ChromeOS, one binary | Adaptive layouts (WindowSizeClass) from day one. |
| G6 | 60 fps hot lists, cold start ≤ 1 s to interactive | Skippable composables, Paging 3, baseline profiles, macrobenchmark gate. |
| G7 | Don't inherit iOS tech debt | §16 lists what is explicitly *not* ported. |
| G8 | **Secure messenger, not just a secure app** | Explicit threat model + real E2EE protocol (§8). |
| G9 | **Operable in production** | Observability + remote kill-switches are infrastructure (§12). |

Platform: `minSdk 26`, `targetSdk 35`, Kotlin 2.x, Compose (Material 3),
single-Activity, Android only (no Compose-Multiplatform / desktop target).

---

## 2. Module graph

The iOS app is a dual-target SDK (`MeeshySDK` + `MeeshyUI`) consumed by an app
with god objects (`ConversationViewModel` 2840 LOC). Android mirrors the SDK
idea, adds feature modules, and — per review §6.1 — splits the data SDK so it is
not a module-level monolith.

```
                          ┌─────────┐
                          │  :app   │  Application, MainActivity, NavHost,
                          └────┬────┘  Hilt assembly, adaptive Scaffold,
                               │        FCM service, widgets, share-target
        ┌──────────────────────┼──────────────────────┐
   ┌────▼─────┐  …14×    ┌──────▼─────┐         ┌──────▼──────┐
   │:feature: │          │ :feature:  │         │:core:       │
   │  auth    │          │   chat     │         │ navigation  │ route contracts
   └────┬─────┘          └──────┬─────┘         └─────────────┘
        └───────────┬───────────┘
              ┌─────▼──────┐      ┌────────────┐
              │  :sdk-ui   │─────▶│  :sdk-core │  repositories, domain/use-cases,
              └─────┬──────┘      │            │  SWR engine, outbox, sync engine,
                    │             └──┬───┬───┬─┘  MessageStateMachine, LanguageResolver
                    │     ┌──────────┘   │   └──────────┐
            ┌───────▼───┐ │ ┌────────────▼┐ ┌───────────▼──┐ ┌─────────────┐
            │:core:     │ │ │:core:network│ │:core:database│ │:core:crypto │
            │ designsys?│ │ │ Retrofit/   │ │ Room / FTS5  │ │ E2EE,       │
            └───────────┘ │ │ OkHttp/skt  │ └──────────────┘ │ libsignal   │
                          │ └─────────────┘ ┌──────────────┐ └─────────────┘
                          └────────────────▶│:core:datastore│
                                             └──────────────┘
                          ┌────────────┐
                          │:core:common│  dispatchers, Result, Clock, logging
                          └────────────┘
        ┌───────────────┐
        │:macrobenchmark│  cold-start + jank gate, baseline-profile generator
        └───────────────┘
```

**Modules**

- **`:core:common`** — `CoroutineDispatchers`, `MeeshyResult`/error model,
  `Clock` + server-time offset, Timber facade, pure utils. No Android-UI deps.
- **`:core:network`** — Retrofit/OkHttp (one HTTP client), the two Socket.IO
  wrappers, `MeeshyConfig`, interceptors, certificate pinning, correlation-ID
  propagation. Two `Json` instances (lenient + strict — §8.6).
- **`:core:database`** — Room DB, DAOs, FTS5, migrations. Single source of truth.
- **`:core:datastore`** — `DataStore` (preferences) + `EncryptedSharedPreferences`
  wrappers; per-user namespacing.
- **`:core:crypto`** — E2EE: `libsignal` bindings, X3DH/Double Ratchet, Sender
  Keys, the session/key stores, key-distribution orchestration. Isolated so the
  security-audit surface is one small module.
- **`:sdk-core`** — the domain SDK: repositories, use-cases, the SWR engine
  (`CacheResult`/`cacheFirstFlow`), the outbox, `ConversationSyncEngine`,
  `MessageStateMachine`, `LanguageResolver`, `NotificationCoordinator`.
  `explicitApi()`, publishable, no Compose.
- **`:sdk-ui`** — the Compose **design system** + reusable UI (charte graphique,
  primitives, the Message Bubble family). `explicitApi()`.
- **`:core:navigation`** — type-safe route contracts shared across features
  (avoids an `:app`-recompile bottleneck — review §6.2).
- **`:feature:*`** — one module per domain: `auth`, `conversations`, `chat`,
  `feed`, `stories`, `calls`, `communities`, `contacts`, `profile`, `settings`,
  `notifications`, `search`, `links`, `media`.
- **`:app`** — `Application`, single `MainActivity`, `NavHost`, Hilt assembly,
  adaptive `Scaffold`, FCM `Service`, widgets, share-target, deep links.
- **`:macrobenchmark`** — cold-start / scroll-jank benchmarks, baseline-profile
  generation (run in CI — §17).

**Dependency rules** (enforced by a `build-logic/` convention plugin):
1. `:feature:*` → `:sdk-core`, `:sdk-ui`, `:core:navigation`, `:core:common`.
   **Never feature → feature.**
2. `:sdk-core` → `:core:{network,database,datastore,crypto,common}`.
   `:sdk-ui` → `:sdk-core`. `:core:crypto` → `:core:{database,common}` only.
3. No upward edges; only `:app` sees the whole graph.
4. `api` vs `implementation` is deliberate; version-catalog bundles; Gradle
   configuration cache + remote build cache enabled.

---

## 3. Layered architecture & state

Each feature is **UI → (Domain) → Data** with strict Unidirectional Data Flow.

- **UI** (`:feature:*`, `:sdk-ui`): stateless `@Composable` screens receive one
  immutable `UiState` and emit events through a single `onEvent(UiEvent)` sink;
  one-shot effects (nav, snackbar) via `Channel<UiEffect>`. One `UiState` data
  class per screen, exposed as `StateFlow` from a Hilt `ViewModel` — the cure
  for the iOS scattered-`@Published` god objects. Every `UiState` and list-item
  model is `@Immutable`/`@Stable`; leaf rows receive primitive snapshots, never a
  global `StateFlow` collected inside the row.
- **Domain** (`:sdk-core`, optional): a use-case exists **only** where logic is
  non-trivial or shared (`SendMessageUseCase`, `SyncConversationsUseCase`,
  `ResolveDisplayContentUseCase`). No one-use-case-per-method ceremony.
- **Data** (`:sdk-core` + `:core:*`): one **Repository** per aggregate is the
  only API the app sees. **Room is the single source of truth** — repositories
  expose `Flow` from Room; network/sockets/FCM/outbox write *into* Room; the UI
  observes Room, never the network. (The iOS dual GRDB↔`CacheCoordinator` write
  is dropped.) **Conflict policy: server state is authoritative; the client's
  optimistic state is provisional and reconciled on the next authoritative read
  or socket event.**

---

## 4. Pattern #1 — SWR cache

`cacheFirstFlow {}` is the primitive every list/detail repository uses; it is
built first in Phase 3.

```kotlin
sealed interface CacheResult<out T> {
    data class Fresh<T>(val value: T) : CacheResult<T>   // within freshFor
    data class Stale<T>(val value: T) : CacheResult<T>   // serve now, revalidate
    data class Syncing<T>(val value: T?) : CacheResult<T> // partial cold sync
    data object Empty : CacheResult<Nothing>             // cold start → skeleton
}
data class CachePolicy(val freshFor: Duration, val keepFor: Duration)
```

1. Emit the Room-cached value immediately (`Fresh`/`Stale` by age).
2. If not `Fresh`, fetch network on `Dispatchers.IO`; persist into Room (Room's
   `Flow` re-emits → UI updates). Network failure never overwrites cached data.
3. Skeleton/shimmer only on `Empty`; `Syncing` represents a half-complete cold
   sync (review §2.6). No polling loops — Room `Flow` is the change signal.

Room is the durable L2 SoT; an in-memory LRU L1 is added only where profiling
shows hot round-trips. Cursor + `hasMore` persisted with the list.

---

## 5. Pattern #2 — Offline outbox (lane-partitioned)

iOS fragments offline writes into five queues; Android consolidates to **one
Room `outbox` table**, but drained in **independent ordering lanes** so a
stuck item never head-of-line-blocks unrelated mutations (review §4.1).

- `outbox(cmid, lane, kind, payloadJson, dependsOn, attempts, state, createdAt)`.
- **Lanes** drain concurrently:
  - `message:{conversationId}` — strict FIFO per conversation (ordering matters);
  - `reaction`, `readReceipt`, `presence` — independent, lossy-coalescing lanes;
  - `social` (posts/comments/likes), `profile`, `settings` — independent lanes.
- **`clientMutationId` (`cmid_…`) / `clientMessageId` (`cid_…`)** are the
  idempotency keys, **byte-identical to iOS/gateway** (`MutationLog` dedup);
  `cmid` generation is **device-scoped** so two devices never collide (§8.4).
- **`OutboxFlusher`**: a `WorkManager` unique work per lane, expedited on a
  connectivity constraint — FIFO drain, full-jitter exponential backoff,
  `Exhausted` after 5 attempts, transient-vs-permanent classification,
  404-as-success.
- **Large-media uploads are NOT in the outbox.** TUS resumable uploads run in a
  **dedicated `WorkManager` chain** with a `setForeground` progress
  notification; the message-send outbox item carries an `uploadId` and
  `dependsOn` the upload's completion (review §4.2).
- **In-queue coalescing**: send+delete cancels both; repeated edits merge;
  reaction toggle cancels itself.
- An outcome `SharedFlow<OutboxOutcome>` keyed by `cmid` drives optimistic
  rollback on `Exhausted`. Terminal rows are surfaced to the user (failed-state
  UI) and GC'd on a retention policy.
- **Crash-safe boot recovery**: reset `Inflight` → `Pending`, re-attach orphaned
  media on launch.

**Pattern #3 — Optimistic updates.** Snapshot → apply local → enqueue → reconcile
or roll back on the outcome flow. Per-entity in-flight guard sets prevent
rapid-tap desync; socket echoes split self-vs-others.

---

## 6. Message ordering, consistency & sync

The review (§2) flagged that the ordering domain was never named. It is now
specified.

- **Authoritative order = a per-conversation monotonic server sequence number
  `seq`.** `MessageEntity.seq` is the **sort key**; `createdAt` is display-only.
  This eliminates clock-skew reordering and optimistic-bubble jump-on-ACK.
  *(Gateway dependency: the gateway must assign and return `seq`; tracked as a
  cross-team contract — until then the client falls back to `createdAt` and the
  limitation is documented.)*
- **Gap detection by sequence continuity**: holding `seq = N`, if the next socket
  event is `seq = N + 2`, fetch `N + 1`. This catches frames silently missed
  *while connected*, which timestamp-based reconnect paging cannot (review §2.2).
  Reconnect still runs a bounded delta sync as a backstop.
- **`MessageStateMachine`** — a pure, fully unit-tested function:
  `sending → sent → delivered (✓✓) → read`, plus `retry`/`failed` (one 8-state
  enum). A `PendingId` table maps `localId ↔ serverId`; upsert uses a 3-tier
  lookup (PendingId → PK → serverId scan) so an optimistic bubble is never
  duplicated.
- **Server-time offset**: computed at socket-connect handshake; all deadlines
  (ephemeral timers, the 2 h edit window, live-location & story expiry) are
  evaluated in **server time**, never client clock (review §2.5).
- **Multi-device convergence**: own actions performed on another device echo
  back over the socket; read-state and unread counts are server-authoritative
  and converge via socket events + delta sync. The `cmid` device-scoping
  prevents a tablet from re-sending a phone's queued message.
- **Cold-start full sync**: bounded parallel page fan-out (`Semaphore(4)`),
  retries, completeness guards (empty-page / zero-new-id stagnation / iteration
  ceiling); represented as `CacheResult.Syncing` until complete.

---

## 7. Real-time transport

- **Two Socket.IO connections** (message + social) — independent reconnect, as
  on iOS. Whether they can be multiplexed into one is an **open gateway
  question**; if the gateway allows it, Android multiplexes (one connection =
  half the radio cost).
- **Transport is a *verified default*, not a locked decision.** iOS forces HTTP
  long-polling because WebSocket proved unreliable *against the gateway from
  iOS*. Phase 3 starts with a **WebSocket-vs-long-polling spike on Android**; if
  WebSocket works, Android uses it (long-polling wakes the radio every ~25–30 s —
  a real Doze/battery penalty). Until the spike, long-polling is the safe start.
- **Delivery doctrine — foreground socket / background FCM.** The socket is held
  **only while the app is foreground/visible**. When backgrounded, Android will
  kill a chat socket regardless, so delivery moves to **FCM high-priority data
  messages**; the FCM handler writes into Room and (for non-E2EE / small
  payloads) pre-persists. The socket is *not* kept alive by a foreground service
  for chat.
- ~80 iOS Combine publishers collapse into a few sealed-class `SharedFlow`s
  (`MessageSocketEvent`, `SocialSocketEvent`); handlers write into Room (CQRS-ish).
- Socket connection uses full-jitter exponential backoff (anti thundering-herd);
  reconnect re-joins rooms and runs gap-fill (§6).
- **`NotificationCoordinator` authority model**: socket events are
  authoritative; cache/REST snapshots only *seed* unseen entries, never regress a
  socket-owned value. Socket errors never force logout (only an APIClient 401).
  Async handlers are wrapped in try/catch.

---

## 8. Security & E2EE

The single hardest subsystem. Backed by a written threat model and ADR-018..020.

### 8.1 Threat model
- **Server: honest-but-curious.** It stores ciphertext and routes messages; it
  must **not** be able to read message/call content. It does see metadata
  (who↔who, when, sizes) — metadata minimisation is a roadmap concern (§8.7).
- **Network adversary**: defeated by TLS 1.3 + **certificate/SPKI pinning**
  (OkHttp `CertificatePinner`) on the gateway and key-distribution endpoints.
- **Lost/stolen device**: at-rest encryption (§8.5) + Keystore + optional
  app-lock (biometric / device credential).
- **Compromised dependency**: Gradle dependency verification + a pinned
  `libsignal` version (§18).

### 8.2 Pairwise E2EE
X3DH key agreement + the Double Ratchet via **`libsignal`** (Rust core, Kotlin
bindings). Prekey bundles published to and fetched from the gateway
`/signal/*` endpoints; prekey replenishment when the server pool runs low.
**Fail-closed** — a message is never sent in plaintext on an encryption failure.

### 8.3 Group E2EE — Sender Keys
Group conversations / communities / channels use **Sender Keys** (the
Signal/WhatsApp scheme `libsignal` provides): each sender derives a symmetric
chain; the chain key is distributed to members over pairwise sessions; the group
**re-keys on every membership change** (join/leave/role change). MLS (RFC 9420)
is recorded as a future evaluation (better post-compromise security at scale)
but is out of scope for v1 — `libsignal` does not implement it.

### 8.4 Multi-device
Sessions are **per device**, not per user (Sesame model). The account holds a
device list; a message is encrypted once per recipient device; prekeys are
per device. A newly linked device gets a **"history starts here" boundary** —
no historical-message transfer in v1 (a documented product stance). `cmid`
generation is device-scoped.

### 8.5 At-rest storage
Auth tokens in `EncryptedSharedPreferences` / Keystore (per-user namespaced).
Sensitive Room tables encrypted with **SQLCipher** (whole-DB) — chosen over
per-column AES-GCM because FTS5 search (§N) over a per-column-encrypted store is
intractable; SQLCipher keeps FTS working. The SQLCipher key lives in the
Keystore. Conversation PIN hashed with a salted slow KDF (Argon2). SSRF guards
on media-URL resolution retained.

### 8.6 Key backup & strict decoding
- **Key backup — device-local only in v1.** No server escrow. Consequence:
  losing the device loses E2EE history; logout/account-switch **must warn the
  user** that on-device messages will be removed. Encrypted PIN-escrow backup
  (Signal-SVR style) is roadmapped (ADR-019).
- **Strict JSON for crypto/auth.** `coerceInputValues`/lenient decoding is used
  for feed/profile/social DTOs only; crypto bundles, key material and auth
  tokens use a **strict `Json`** instance — a coerced-to-default security flag
  is a downgrade attack (review §1.10).

### 8.7 Call media & metadata
- Call media: WebRTC **DTLS-SRTP**; the DTLS fingerprint is **authenticated over
  the E2EE-protected signalling channel** so a malicious signalling server
  cannot MITM it. If media is TURN-relayed, **SFrame / Insertable Streams**
  end-to-end keying is applied so the relay never sees plaintext (ADR-020).
- Safety-number / fingerprint verification UI + TOFU with a change warning.
  Key transparency (verifiable key directory) is roadmapped.
- Link-preview / OpenGraph resolution must not leak URLs from E2EE conversations
  to third parties — previews for E2EE chats are fetched client-side or via a
  privacy-preserving proxy, never by handing the URL to the gateway.

---

## 9. Navigation & adaptive layout

- **Single Activity**, Navigation-Compose, **type-safe `@Serializable` routes**;
  each `:feature:*` contributes a nav sub-graph; cross-feature contracts in
  `:core:navigation`.
- **Overlays** (feed, radial menu, call pill, toasts, banners) in a Compose
  overlay layer (`Box` + `zIndex`) above the `NavHost`.
- **Adaptive (G5), first-class from day one.** `:app` hosts a
  `NavigableListDetailPaneScaffold` driven by `WindowSizeClass`: single-pane on
  compact (phone); two-pane list-detail on medium/expanded (tablet, foldable
  unfolded, ChromeOS, Android-16 desktop mode) — the equivalent of the iOS
  `iPadRootView`. Foldable posture via `WindowLayoutInfo`.
- Deep links (`meeshy://`, `https://meeshy.me`) + push + socket notifications
  normalise into **one** event type, routed once by a pure `DeepLinkRouter`.

---

## 10. DI & concurrency

- **Hilt** everywhere; iOS `*Providing` protocols → Kotlin interfaces; every
  service gets an interface for uniform test fakes. iOS `.shared` → `@Singleton`.
- Coroutines + `Flow`. **Dispatchers are injected** (tests use
  `StandardTestDispatcher`). iOS `actor`s → dispatcher-confined classes / `Mutex`
  (Room already serialises writes). Cancellable `Job`s replace `Task`/`Timer`;
  `flatMapLatest`/`debounce` replace cancel-on-change tasks.
- The Swift-6 strict-concurrency workaround class does not exist on Android —
  idiomatic Kotlin, no ported scars.
- Cold start: `androidx.startup` lazy initializers; verified by macrobenchmark.

---

## 11. Performance

- Compose `LazyColumn`/`LazyVerticalGrid` for lists, stable `key`s +
  `contentType`, `@Immutable` item models, primitive snapshots into leaf rows.
- **Paging 3** for feed, search, member and notification lists. **Caveat (review
  §5.1):** the chat screen is an *inverted, around-anchor, bidirectional* list —
  Paging 3's weakest case. A Phase-5 spike decides Paging 3 vs a hand-rolled
  windowed pager for the message list specifically.
- Message **Bubble**: immutable `BubbleContent` built by a pure
  `BubbleContentBuilder`, fed to small skippable composables; off-thread
  `TextMeasurer` layout caching. Stable lambda refs / event sink so callbacks
  don't break skipping.
- Coil 3, 3-tier progressive images (ThumbHash → thumbnail → full), bounded
  memory cache. Decorative animation via `graphicsLayer` gated on
  reduce-motion + battery. Socket translation events burst-coalesced (~80 ms).
- **Gated, not asserted**: a `:macrobenchmark` module enforces cold-start ≤ 1 s
  and message-scroll jank in CI; **LeakCanary** + `StrictMode` in debug;
  baseline profiles generated in CI (§17); Compose compiler metrics tracked.
  Budget: < 150 MB typical RSS.
- R8 full-mode + resource shrinking; App Bundle + per-ABI splits (libsignal /
  stream-webrtc ship large native `.so`s — §18).

---

## 12. Observability

Production-operability infrastructure — built before feature work scales (ADR-022).

- **Crash + ANR**: Firebase Crashlytics; ANR detail mined from
  `ApplicationExitInfo` (API 30+).
- **Performance monitoring**: Firebase Performance + custom traces — cold start,
  socket-connect latency, message-send round-trip, frame timing in production.
- **Structured logging**: a Timber tree with **mandatory PII / plaintext
  redaction** — a logged decrypted message body defeats E2EE; redaction is a
  security control, not a nicety. No message content, tokens, or keys ever logged.
- **Correlation IDs**: the `cmid`/`cid` plus a trace header propagated through
  Retrofit and the socket so a message is followable client → gateway →
  translator.
- **Remote config / feature flags / kill-switches**: staged rollout of E2EE,
  calls and the story editor; a broken feature is disabled remotely without a
  release. Hooks for A/B experiments.

---

## 13. Design System — **CHARTE GRAPHIQUE (LOCKED)**

> **Non-negotiable.** The Meeshy visual identity is preserved pixel-faithfully.
> Any screen that deviates fails review. Verified by Roborazzi screenshot tests
> (light + dark + large font scale + RTL + tablet panes) for every primitive and
> screen.

### 13.1 Brand — Indigo
The identity is the **Indigo gradient `#6366F1 → #4338CA`** (logo-derived) — the
signature for CTAs, hero elements, the logo. It must not be re-hued, re-angled
or substituted. Material-You dynamic colour is **rejected** (it would override
the brand).

### 13.2 Indigo scale (`MeeshyPalette`)
`indigo50 #EEF2FF` · `100 #E0E7FF` · `200 #C7D2FE` · `300 #A5B4FC` ·
`400 #818CF8` · **`500 #6366F1` (primary / gradient start)** · `600 #4F46E5` ·
**`700 #4338CA` (primary deep / gradient end)** · `800 #3730A3` · `900 #312E81` ·
`950 #1E1B4B`.

### 13.3 Semantic colours (static)
`success #34D399` · `warning #FBBF24` · `error #F87171` · `info #60A5FA` ·
`readReceipt #818CF8`. WCAG-AA contrast of the palette in both themes is verified
once and documented.

### 13.4 Theme tokens (`MeeshyThemeTokens`, light + dark)
Light: white / indigo-tinted surfaces, `indigo950` text, `indigo200` borders.
Dark: near-black indigo-tinted surfaces, `indigo50` text, `indigo900` borders.
Driven by the persisted app theme preference + `isSystemInDarkTheme()` for the
`system` option — never the device content locale.

### 13.5 Conversation accent colour (deterministic)
Ported from `ColorGeneration.swift` (`:sdk-core/DynamicColorGenerator`):
```
primary   = blend(languageColor·0.30, typeColor·0.30, themeColor·0.40)
secondary = hueShift(primary, +30°)
accent    = hueShift(primary, −30°)
```
Fallback: DJB2 hash → 20-colour palette. Every conversation-context component
uses `accentColor`; semantic colours stay static; **no hardcoded hex** in
feature code.

### 13.6 Typography, spacing, shape, motion
Material 3 type scale mapped to the iOS roles, **scalable `sp`** honouring system
font size. 4 dp spacing grid; rounded shape tokens matching the iOS radii.
Glass UI = translucent surface + indigo-tinted border. Motion: spring
`response 0.4–0.7 / damping 0.6–0.8`; staggered list entry `0.04–0.05 s × index`
(part of the brand). Haptics: light / medium / success / error.

### 13.7 Component family
Avatar (story ring + mood badge + presence dot), identity bar, buttons, fields,
skeleton/shimmer, toasts, swipeable rows, tag input, branded pull-to-refresh,
progressive image, the Message Bubble family, animated brand logo,
scroll-collapsing header — all in `:sdk-ui`, all screenshot-tested.

---

## 14. Accessibility & i18n

- **Architecture-level a11y, not an afterthought.** TalkBack semantics for the
  chat list and bubbles (a bubble = merged semantics + custom actions for
  react/reply/forward); content descriptions for all media; logical focus order;
  48 dp minimum touch targets; `LiveRegion` for incoming messages; full **RTL
  layout mirroring** (not just RTL text). Accessibility Scanner / Compose a11y
  assertions in CI.
- **i18n**: full `strings.xml` extraction — no hardcoded French (iOS debt).
  Locale-aware date/number formatting. The **UI language is independent of the
  Prisme content language** — content resolution never uses the device locale.

---

## 15. Heaviest-risk subsystems (ranked) & approach

1. **Story canvas / rendering engine** — one Kotlin `StoryRenderer` is the
   single source of truth feeding the live composer, the reader, and the export
   compositor (WYSIWYG). The live composer surface is a **GPU surface**
   (`SurfaceView`/`TextureView` + GL/`RenderEffect`), **not** Compose `Canvas`
   (immediate-mode, UI-thread — won't hold 60 fps with video + layers; review
   §7.1). PencilKit's opaque blob → a portable point/stroke ink model.
2. **WebRTC calls** — Telecom `ConnectionService` + full-screen-intent UI +
   foreground service; PushKit → FCM data. Port the call FSM/timeouts/reconnection;
   discard CallKit workarounds. Media security per §8.7.
3. **Story timeline video editor** — typed command stack (`sealed
   TimelineCommand`, immutable `TimelineProject`, list+cursor undo/redo) +
   Media3 `Transformer`/`ExoPlayer`. Export with per-keyframe overlays is near
   `Transformer`'s declarative limit — a spike decides `Transformer` vs a
   frame-by-frame `MediaCodec` compositor, with a documented fallback (review §7.2).
4. **E2EE** (§8) — `:core:crypto`; gated behind ADR-018..020.
5. **Sync engine + lane-partitioned outbox** (§5–§6).

A single `PlaybackCoordinator` owns one `ExoPlayer` pool across feed auto-play,
chat inline video, story reader and audio messages.

---

## 16. What is explicitly NOT ported (iOS debt)

Dual persistence → one Room SoT · god objects → decomposed (§3) · E2EE
plaintext-fallback → fail-closed (§8) · tokens in `UserDefaults` →
Keystore · bare-SHA-256 PIN → Argon2 · `print()` → Timber · `NotificationCenter`
event bus → typed `SharedFlow` · stringly-typed routes → type-safe nav ·
cache-polling loops → Room `Flow` · five queues → one lane-partitioned outbox ·
hardcoded French → `strings.xml` · iOS compiler workarounds (file splitting,
`AnyView`, 60-param inits, GRDB-observation relay) → not replicated · duplicated
logic (forwarding ×3, composer ×2, Prisme resolution ×3, two video players) →
single implementations · dead/placeholder code → built properly or omitted.

---

## 17. Testing, CI/CD & release engineering

- **TDD** (red → green → refactor) — every ViewModel, repository, the SWR
  engine, the outbox/coalescing logic, `MessageStateMachine`, sequence/gap logic,
  `LanguageResolver`, `DynamicColorGenerator`, deep-link routing. Behaviour
  through public APIs; fakes over Hilt interfaces; factory data.
- **Roborazzi** screenshot tests — the charte-graphique gate (§13): light, dark,
  large font scale, RTL, tablet panes.
- `kotlinx.serialization` round-trip tests with real gateway payloads; **strict
  decoding verified for crypto/auth** (§8.6).
- Room migration + DAO instrumented tests.
- **`:macrobenchmark`** — cold start, message-list scroll jank; **generates the
  baseline profile in CI** (so it never goes stale). LeakCanary in debug.
- **CI/CD (ADR-023)**: a CI matrix; `lint` + `detekt` + `ktlint` gates;
  Compose-compiler-metrics check; signing/secrets management; **Play tracks**
  internal → closed → open → production with **staged rollout %**; dependency
  automation (Renovate) + Gradle dependency verification.
- Instrumented critical-flow suite (login, send/receive, call setup) planned for
  Gradle Managed Devices / Firebase Test Lab — the live `atabeth` integration
  test is a smoke check, not the E2E strategy.
- Local gates: `./meeshy.sh build` + `./meeshy.sh test` before every commit.

---

## 18. Cross-cutting concerns

- **Push reliability** — FCM data payloads cap at 4 KB; an E2EE message (esp.
  media) cannot be decrypted *in* the push. The design is **notify-then-fetch**:
  the push wakes the app, which fetches + decrypts from the gateway into Room.
  ~80 notification types map onto a curated **notification-channel taxonomy**;
  `POST_NOTIFICATIONS` runtime-permission UX handled.
- **Retention & erasure as a security invariant** — when a message is deleted,
  expires (ephemeral), or the 6-month purge runs, it is removed from **every**
  store: Room rows, the **FTS index**, the media file cache, ThumbHash blobs, the
  outbox, and any push-prefetched copy. Logout/account-switch performs a
  **provably complete local wipe** (Room, DataStore, EncryptedSharedPreferences,
  file/Coil caches, enqueued WorkManager jobs, the FCM token, crash buffers) —
  a tested invariant.
- **App size & native code** — App Bundle + per-ABI splits (libsignal +
  stream-webrtc native libraries); R8 full-mode; keep rules for
  `kotlinx.serialization`, Retrofit, Room and the libsignal JNI; an app-size
  budget tracked in CI.
- **Supply chain** — Gradle dependency verification (checksums); `libsignal`
  pinned to a vetted version/source; an SBOM produced in CI.

---

## 19. Build order

`Phase 2` Module graph + convention plugins + Hilt + type-safe nav skeleton +
adaptive scaffold + observability + CI/CD bootstrap →
`Phase 3` SDK foundation — SWR cache first, then the lane-partitioned outbox,
sync engine (`seq`/gap), sockets (after the WS spike), push; **E2EE gated behind
ADR-018..020 + the threat model** →
`Phase 4` design system + `:sdk-ui` primitives (Roborazzi baseline) →
`Phase 5` feature slices: Auth → Conversations → Chat → Feed → Stories → Calls →
Communities / Contacts / Profile / Settings / Notifications / Search / Links /
Media →
`Phase 6` integration, deep links, adaptive verification, macrobenchmark gate,
final diff audit.

Each phase leaves the build green and the app runnable.
