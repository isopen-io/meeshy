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

**Decision.** `:sdk-core` (domain/repositories) + `:sdk-ui` (design system) +
14 `:feature:*` + `:app` + `:core:navigation` + `:core:common`. Per the SOTA
review (§6.1) the data SDK is **split** so it is not a module-level monolith:
`:core:network`, `:core:database`, `:core:datastore`, `:core:crypto`.
Dependency rules enforced by a `build-logic/` convention plugin; no
feature→feature edges; `:core:crypto` isolated as a small audit surface.

**Rejected.** (a) Single `:app` module — re-creates the god-object problem,
slow incremental builds. (b) Pure Clean-Architecture 3-module-per-feature —
ceremony disproportionate to team size. (c) Everything in one `:sdk-core` —
that *is* the 2840-LOC god object at module granularity (review §6.1).

**Consequences.** Parallel builds, enforced boundaries, the SDK stays
publishable (`explicitApi()`); crypto has a contained review surface. ~22 build
files — kept DRY via `build-logic/` convention plugins + version-catalog bundles.

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

## ADR-013 — At-rest storage security
**Date:** 2026-05 · **Status:** amended (E2EE protocol split out to ADR-018)

**Context.** iOS debt: tokens in `UserDefaults`; a conversation PIN hashed with
bare SHA-256; SSRF-relevant media-URL handling (audit part-04/06/15/16). The
SOTA review (§1) noted "AES-GCM / SQLCipher" was under-specified and that FTS5
over a per-column-encrypted store is intractable.

**Decision.** Auth tokens in `EncryptedSharedPreferences` / Android Keystore from
day one, per-user namespaced. Sensitive Room data encrypted with **SQLCipher
(whole-DB)** — chosen over per-column AES-GCM because FTS5 search (ADR-017)
must keep working; the SQLCipher key lives in the Keystore. Conversation PIN via
a salted slow KDF (**Argon2**). Per-user cache namespacing + a provably complete
wipe on logout/account-switch (ARCHITECTURE §18). SSRF guards on media-URL
resolution retained. TLS 1.3 + **certificate/SPKI pinning** (OkHttp
`CertificatePinner`) on the gateway and key-distribution endpoints.

The **E2EE protocol** (pairwise, group, multi-device) is no longer part of this
ADR — see **ADR-018**; key backup see **ADR-019**; call media see **ADR-020**.

**Rejected.** Plain `SharedPreferences` for tokens; per-column AES-GCM (breaks
FTS5); no certificate pinning ("we have E2EE" — but the metadata and
key-distribution channels still need defence in depth).

**Consequences.** At-rest hygiene is correct from the first commit; the hard
E2EE protocol questions are escalated to dedicated, reviewable ADRs.

---

## ADR-014 — `kotlinx.serialization` with lenient, forward-compatible decoding
**Date:** 2026-05 · **Status:** accepted

**Context.** The gateway evolves and old clients persist drafts; iOS uses
pervasive defensive decoding (`id`/`_id` fallback, field-rename aliases,
optional→default promotion — audit part-15).

**Decision.** `kotlinx.serialization` with **two `Json` instances**:
- **Lenient** (`coerceInputValues = true`, `ignoreUnknownKeys = true`, defaults,
  `@JsonNames` aliases, `id`/`_id` custom serializers) — for feed/profile/social/
  message DTOs where the gateway evolves and old clients persist drafts.
- **Strict** (no coercion, explicit nulls, unknown keys rejected) — for crypto
  bundles, key material and auth tokens. Coercing a missing/malformed security
  field to a default is a downgrade attack (review §1.10).

**Rejected.** Moshi/Gson; a single strict parser (crashes on valid evolving
payloads); a single lenient parser (silently downgrades security fields).

**Consequences.** Resilient to gateway drift on data DTOs; tamper-evident on the
security boundary. Round-trip tested with real payloads; strict decoding of
crypto/auth payloads is a dedicated test gate.

---

## ADR-015 — Real-time transport & delivery doctrine
**Date:** 2026-05 · **Status:** amended (review §3)

**Context.** iOS runs two independent sockets (message + social) forced to HTTP
long-polling — WebSocket proved unreliable *against the gateway from iOS* (audit
part-17). The review (§3) flagged that long-polling wakes the radio every
~25–30 s (a real Doze/battery cost), and that no foreground-vs-background
delivery doctrine existed.

**Decision.**
- `socket.io-client-java` ×2 (message + social) — independent reconnect, with
  full-jitter exponential backoff. ~80 event publishers collapse into
  sealed-class `SharedFlow`s; handlers write into Room; socket errors never
  force logout.
- **Transport is a *verified default*, not a locked decision.** Phase 3 begins
  with a **WebSocket-vs-long-polling spike on Android against the real gateway**.
  If WebSocket works, Android uses it (long-polling's radio penalty is not
  inherited unproven). Until then, long-polling is the safe start.
- **Delivery doctrine**: the socket is held **only while the app is
  foreground/visible**; backgrounded delivery moves to **FCM high-priority data
  messages** (notify-then-fetch). No foreground service keeps a chat socket alive.
- Single-multiplexed-socket remains open pending a gateway answer; if the
  gateway can carry both namespaces on one connection, Android multiplexes.

**Rejected.** Locking long-polling before the Android spike; holding a chat
socket in the background (Android kills it under Doze regardless).

**Consequences.** Battery cost is minimised once the spike resolves; background
delivery is designed, not emergent. ADR-015 is the most likely to be *reversed*
in practice once the spike runs.

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

**Decision.** Paging 3 + `RemoteMediator` (Room-backed) for the feed, search,
member and notification lists. **Caveat (review §5.1):** the chat message list
is *inverted, around-anchor and bidirectional* — Paging 3's weakest case. A
Phase-5 spike decides Paging 3 vs a hand-rolled windowed pager **for the message
list specifically**; "Paging 3 everywhere" does not apply unconditionally there.

**Rejected.** Hand-rolled pagination everywhere (memory-unbounded, repetitive);
assuming Paging 3 trivially handles the inverted anchored chat list.

**Consequences.** Bounded memory and uniform load states on standard lists; the
highest-risk list (chat) is explicitly de-risked with a spike before it is built.

---

## ADR-018 — Threat model & E2EE protocol
**Date:** 2026-05 · **Status:** accepted · **Gates:** all `:core:crypto` work

**Context.** The review (§1) found "libsignal, fail-closed" named a library, not
a protocol — and that group E2EE, multi-device E2EE and the actual server
contract were unaddressed. The iOS gateway exposes a *pairwise, non-ratcheting*
`/signal/*` model; porting libsignal onto it as-is does not yield Signal-grade
E2EE.

**Decision.**
- **Threat model**: the server is **honest-but-curious** — it stores ciphertext
  and routes messages and must not read content; it does observe metadata. A
  **network adversary** is defeated by TLS 1.3 + certificate pinning. A
  **lost/stolen device** is mitigated by at-rest encryption + Keystore + an
  optional app-lock. The server is **not** trusted with message or call content.
- **Pairwise**: X3DH + Double Ratchet via `libsignal`; prekey bundles via the
  gateway; prekey replenishment; **fail-closed**.
- **Group**: **Sender Keys** (the scheme `libsignal` provides), with a
  **re-key on every membership change**. MLS (RFC 9420) is recorded as a future
  evaluation but is out of scope for v1.
- **Multi-device**: per-device sessions (Sesame model); a per-user device list;
  a newly linked device gets a **"history starts here" boundary** (no history
  transfer in v1); `cmid` generation is device-scoped.
- This requires a **gateway protocol contract** for ratcheting prekeys, Sender-Key
  distribution and the device list — tracked as a cross-team dependency.

**Rejected.** "Adopt libsignal" as the whole design; pairwise Double Ratchet for
groups (does not scale); per-user (not per-device) sessions; MLS for v1 (large
commitment, not in `libsignal`).

**Consequences.** E2EE is a reviewable protocol, not a library reference; the
gateway contract is surfaced early; `:core:crypto` is the audit boundary.

---

## ADR-019 — E2EE key backup & recovery
**Date:** 2026-05 · **Status:** accepted

**Context.** If keys live only in the Keystore, a lost phone — or even a routine
device upgrade — loses all E2EE history. The §16/§18 logout "full wipe"
otherwise silently destroys it (review §1.5).

**Decision.** **v1 = device-local keys, no server escrow.** Consequences are made
explicit: losing the device loses E2EE history; logout/account-switch **warns
the user** that on-device messages will be removed before wiping. An encrypted
PIN-escrow backup (Signal-SVR style: secure-enclave-backed escrow) is
**roadmapped** as a follow-up, not built in v1.

**Rejected.** Silent history loss (a UX/trust failure); shipping a half-designed
escrow under time pressure (escrow is security-critical and deserves its own
design pass).

**Consequences.** A defensible, documented v1 stance; the user is never
surprised; escrow is a deliberate future decision.

---

## ADR-020 — Call media security
**Date:** 2026-05 · **Status:** accepted

**Context.** §12.2 covered call signalling but not media security. WebRTC gives
DTLS-SRTP hop-by-hop; a TURN-relayed call exposes plaintext SRTP to the relay
unless end-to-end keyed (review §1.8).

**Decision.** Call media uses **DTLS-SRTP**; the DTLS fingerprint is
**authenticated over the E2EE-protected signalling channel** so a malicious
signalling server cannot MITM it. When media is TURN-relayed, **SFrame /
Insertable Streams** end-to-end keying is applied so the relay never sees
plaintext. A safety-number verification UI + TOFU-with-change-warning is provided.

**Rejected.** Transport-only encryption (relay sees plaintext); trusting the
signalling server with the fingerprint.

**Consequences.** Calls are end-to-end confidential even through untrusted
relays; aligned with the §8 threat model.

---

## ADR-021 — Message ordering, gap detection & consistency
**Date:** 2026-05 · **Status:** accepted · **Gates:** the sync engine

**Context.** The review (§2) found the ordering domain was never named;
`createdAt` sorting reorders under clock skew; gap detection was
reconnect-timestamp-only.

**Decision.**
- **Authoritative order = a per-conversation monotonic server sequence number
  `seq`**, stored on `MessageEntity` as the **sort key**; `createdAt` is
  display-only.
- **Gap detection by `seq` continuity** (hold N, see N+2 → fetch N+1) — catches
  frames missed while connected; reconnect delta sync is a backstop.
- **Conflict policy**: server state is authoritative; optimistic client state is
  provisional and reconciled on the next authoritative read/socket event.
- **Server-time offset** computed at the socket handshake; all time-based
  deadlines (ephemeral, edit window, story/location expiry) evaluated in server
  time.
- Requires the gateway to assign/return `seq`; until then the client falls back
  to `createdAt` and the limitation is documented.

**Rejected.** `createdAt` as the sort key; reconnect-only gap detection;
last-writer-wins by client clock.

**Consequences.** Stable ordering, reliable in-band gap fill, no clock-skew
bugs; one gateway contract dependency is made explicit.

---

## ADR-022 — Observability
**Date:** 2026-05 · **Status:** accepted

**Context.** The review (§8) found observability essentially absent — a P0 gap
for a platform doing real-time messaging and calls.

**Decision.** Built before feature work scales:
- **Crashlytics** + ANR detail via `ApplicationExitInfo`.
- **Firebase Performance** + custom traces (cold start, socket-connect latency,
  message-send round-trip, frame timing).
- **Structured logging** (Timber) with **mandatory PII/plaintext redaction** — a
  logged decrypted message defeats E2EE; redaction is a security control. No
  content, tokens or keys are ever logged.
- **Correlation IDs** — `cmid`/`cid` + a trace header propagated through Retrofit
  and the socket.
- **Remote config / feature flags / kill-switches** — staged rollout of E2EE,
  calls and the story editor; a broken feature disabled without a release.

**Rejected.** Deferring observability to "after MVP" (you cannot operate or
safely roll out what you cannot see).

**Consequences.** The app is operable and incidents are diagnosable from day one;
risky subsystems ship behind flags.

---

## ADR-023 — CI/CD & release engineering
**Date:** 2026-05 · **Status:** accepted

**Context.** The review (§9) found only a local pre-commit gate — no CI/CD, no
baseline-profile generation, no benchmark gate.

**Decision.** A CI pipeline: build/test matrix; `lint` + `detekt` + `ktlint` +
Compose-compiler-metrics gates; Roborazzi screenshot gate; **`:macrobenchmark`**
running cold-start/jank checks and **generating the baseline profile in CI** (so
it never goes stale); signing/secrets management; **Play tracks** internal →
closed → open → production with **staged rollout %**; Gradle dependency
verification + Renovate dependency automation; an SBOM artifact.

**Rejected.** Treating `./meeshy.sh build && ./meeshy.sh test` as the release
process; manual baseline profiles (silently rot); unstaged production releases.

**Consequences.** Reproducible, gated releases; performance regressions caught
in CI; safe staged rollout of a large, security-sensitive app.

---

## ADR-024 — `applicationId = me.meeshy.android`, distinct de la coque Capacitor
**Date:** 2026-10-22 · **Status:** accepted (décision porteur, #11570)

**Context.** Le dégel du 2026-10-22 remet l'app native en développement, et la coque Capacitor de `apps/web`
sert déjà Android sous `me.meeshy.app` (`apps/web/android/app/build.gradle`). Les deux déclaraient le même
`applicationId` : un appareil ne peut pas les installer côte à côte, et une fiche Play n'en porte qu'une.

**Decision.** L'app native publie sous `me.meeshy.android` (`me.meeshy.android.debug` en debug). Le
`namespace` Kotlin reste `me.meeshy.app` : c'est l'espace des classes générées (`R`, `BuildConfig`), sans
rapport avec l'identité de publication. Le renommer réécrirait des centaines d'imports pour rien.

**Rejected.** Garder `me.meeshy.app` et retirer la coque du Play Store : la coque est le chemin Android en
service. Renommer le `namespace` : c'est un coût sans effet sur l'utilisateur.

**Consequences.** Deux fiches Play, deux apps installables côte à côte. `assetlinks.json` doit recevoir les
entrées `me.meeshy.android` (empreinte de la clé Play App Signing) et `me.meeshy.android.debug`. Le projet
Firebase doit déclarer une app Android `me.meeshy.android` pour que FCM délivre ses pushes. Les deux
démarches attendent la console du porteur (`docs/magic-link-app-links.md`).


---

## ADR-025 — Jetons : l'échelle d'iOS à l'identique, des ressorts convertis, Nunito pour les deux « designs »
**Date:** 2026-10-22 · **Status:** accepted (lot F0b de la parité, #11570 / #11600)

**Context.** `DesignTokens.swift` est la source des jetons d'interface. Android n'en portait qu'une partie
(espacements sur une grille de 4 dp, cinq rayons, deux ressorts à raideur de Material, un délai d'échelonnement de
45 ms), si bien qu'un écran porté d'iOS retombait sur des littéraux. Côté typographie, iOS écrit le texte courant
dans la police système (SF Pro) et réserve le design arrondi (SF Pro Rounded) aux grands titres ; SF n'existe pas
sur Android.

**Decision.**
1. **L'échelle est celle d'iOS, sans filtre.** Espacements (dont `xxs` 2, `xsPlus` 6, `smPlus` 10, `mdPlus` 14),
   rayons (dont `xxs` 4, `xs` 8, `smPlus` 12, `lgPlus` 18, `xlPlus` 22), tailles de police 9..34, icônes, contrôles,
   bordures, opacités, ombres et largeurs de lecture (`formMaxWidth` 600, `contentMaxWidth` 700). La contrainte de
   grille de 4 dp est retirée : iOS intercale des demi-pas et les écrans portés les utilisent.
   `MeeshyScalesParityTest` lit `DesignTokens.swift` et exige un jumeau Kotlin de même valeur pour chaque jeton :
   ajouter un jeton côté iOS sans le porter fait rougir le test.
2. **Les ressorts se convertissent, ils ne s'approchent pas.** Un ressort SwiftUI `(response, dampingFraction)` est
   de masse unitaire : `dampingRatio = dampingFraction`, `stiffness = (2π / response)²`. `springFast` (0,25 / 0,7),
   `springDefault` (0,4 / 0,75) et `springBouncy` (0,5 / 0,6) sont posés ainsi ; `standardSpring()` et `bouncySpring()`
   restent comme alias de `springDefault()` et `springBouncy()`, pour ne pas toucher les appelants des autres lots.
   Le délai d'échelonnement passe de 45 à 40 ms (`staggerDelay` 0,04 s).
3. **Le texte suit la police du système ; l'emoji seul, non.** Les tailles sont en `sp` : `meeshyText(size, weight,
   rounded)` est l'équivalent de `MeeshyFont.relative` (Dynamic Type). `emojiTextStyle(size)` est celui de
   `MeeshyFont.emoji` : la taille `sp` est dérivée de la taille en dp et de la densité (`Dp.toSp()`), de sorte que
   l'emoji s'affiche à la taille EXACTE demandée (90 / 60 / 45) à tout réglage de police.
4. **Écart assumé : Nunito pour les deux designs.** Android n'a pas SF Pro ; la famille de marque est Nunito
   (arrondie), appliquée à tout le texte, y compris là où iOS reste sur la police système. `meeshyText(rounded = …)`
   garde le drapeau d'iOS et deux noms privés de famille (`DefaultDesignFontFamily`, `RoundedDesignFontFamily`),
   aujourd'hui identiques : si le produit veut un corps de texte neutre à côté des titres arrondis, UNE ligne change,
   aucun site d'appel. Poids ajoutés à la famille : 300 (Light) et 900 (Black), pour que tout poids iOS retombe sur
   un poids réel de la police variable.
5. **Cible tactile : 44 pt d'iOS, plancher de 48 dp d'Android.** `MeeshyControlSize.tapTarget` reste 44 (parité) ;
   `minTouchTarget` (48 dp, Material et TalkBack) est le plancher qu'un composant interactif ne franchit jamais.

**Rejected.** Garder la grille de 4 dp et arrondir les demi-pas d'iOS (un 14 devient 12 ou 16 : chaque écran porté
dérive d'un pixel sans que rien ne le dise). Une raideur de Material (`StiffnessMediumLow`) « proche » de celle d'iOS
(le rebond ne se ressemble pas). Un emoji en `sp` mis à l'échelle (à 2× de police, l'emoji de 90 remplit la bulle).
Charger une police de corps neutre pour imiter SF Pro (une seconde famille à embarquer, pour une différence que
l'utilisateur ne compare pas).

**Consequences.** Le premier lot qui consomme un jeton n'invente plus de littéral. Les ressorts de `EmojiPicker`,
`LanguageQuickStrip` et `StoryActionRail` s'assouplissent (raideur 200 → 158). `EmojiDetector.fontSizeSp` (90 / 60 /
45) et `MessageBubble` écrivent encore l'emoji en `sp` mis à l'échelle : le branchement de `emojiTextStyle` relève du
lot qui découpe la bulle (fichier chaud).

## ADR-026 — Épinglage SPKI de la passerelle (production et staging)

**Décision.** Le client OkHttp PARTAGÉ (REST, Socket.IO polling et WebSocket) porte un intercepteur réseau `CertificatePinInterceptor`, contribué par `CertificatePinnerContributor` (`@IntoSet HttpClientContributor`). Pour `gate.meeshy.me` et `gate.staging.meeshy.me`, un certificat de la chaîne doit porter une empreinte SHA-256 de SPKI (RSA 2048/4096, EC P-256/P-384) du pin-set (`GatewayPins` : clé courante + clé de secours), sinon `SSLPeerUnverifiedException` avant tout envoi de requête (donc de jeton). Miroir d'iOS (`CertificatePinning.swift`), dont le verdict (`CertificatePinDecision`) est repris dans `:core:model`. Le journal ne contient que l'hôte et le nombre d'empreintes, jamais la chaîne.

**Mode non configuré.** localhost, 10.0.2.2 et tout environnement personnalisé ne sont pas épinglés ; un pin-set vide laisse aussi l'hôte non configuré (validation système seule) — état de livraison tant que les empreintes de production ne sont pas renseignées (elles ne se mesurent pas depuis le conteneur de développement). `network_security_config.xml` refuse le clair en release ; la variante debug n'ouvre que localhost et 10.0.2.2.

**Expiration.** `GatewayPins.EXPIRES_AT_EPOCH_MILLIS` : passé ce jour, le pin-set est ignoré, la validation système reste, un avertissement est journalisé une fois par processus. Pas de brique silencieuse : l'application ne cesse pas de fonctionner parce qu'une rotation a été oubliée, mais l'oubli est visible.

**Procédure de rotation.** (1) Générer la future clé hors ligne ; calculer `openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`. (2) Publier une version qui l'ajoute à `BACKUP` (ancienne `CURRENT` conservée) et repousser la date d'expiration. (3) Attendre l'adoption de cette version (version minimale). (4) Faire émettre le certificat sur la nouvelle clé. (5) Version suivante : la nouvelle clé en `CURRENT`, nouvelle clé de secours en `BACKUP`. Jamais de bascule sèche (rétrocompatibilité de la production).
