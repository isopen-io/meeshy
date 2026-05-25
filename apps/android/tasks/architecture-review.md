# Meeshy Android — Architecture Review

Critical peer review of `ARCHITECTURE.md`, `decisions.md` (ADR-001..017) and
`tasks/feature-parity.md`, assessed against the 2026 state of the art for
advanced messaging platforms (Signal, WhatsApp, Telegram, Element/Matrix,
Google "Now in Android"). Reviewer role: principal mobile architect. Goal:
surface what is missing, weak or naive **before** ~150k lines are written.

Verdict legend: **SOTA** (state-of-the-art) · **OK** (acceptable, idiomatic) ·
**WEAK** (works but below the bar / risky) · **MISSING** (not addressed).

---

## 0. Executive verdict

The architecture is **sound as an app-shell and offline-first data-layer
design** and clearly above the average native rewrite: the module graph, UDF,
Room-as-SoT, the single outbox, Paging 3, type-safe nav, adaptive layout and the
locked design system are all correct, well-reasoned, and explicitly de-risked
against the iOS audit.

It is **not yet ready to drive E2EE, sync-engine, or real-time-transport
implementation**. The single largest gap is that the security model is one
sentence ("libsignal, fail-closed") for what is, at SOTA, the hardest subsystem
in a messenger — and the document inherits the iOS *product* design (per-peer
pairwise ECDH sessions, plaintext-capable groups) without acknowledging that
**group E2EE, multi-device E2EE, key backup and sealed-sender do not fall out of
"adopt libsignal"**. Sync (§4–§6) is specified for the *single-device* case
only; multi-device consistency, the authoritative ordering domain, and gap
detection semantics are under-specified. Observability is essentially absent.

Recommendation: **start implementation of the module graph, design system and
the SWR/outbox SDK foundation now (Phase 2–3 minus E2EE)**; **block the E2EE,
sync-engine and socket-transport work behind a revised security ADR set and a
written threat model.** Estimated 4 new ADRs, 3 amended.

---

## 1. Security & E2EE — **WEAK (E2EE design); OK (at-rest storage)**

ADR-013, ARCHITECTURE §11/§12.5. This is the area that most needs revision.

### What is right
- Dropping the iOS MVP crypto (single ECDH, plaintext fallback) and going
  fail-closed is correct and non-negotiable.
- Tokens in Keystore/`EncryptedSharedPreferences`, per-user namespacing, full
  wipe on logout, Argon2 for the conversation PIN, SSRF guards retained — all
  SOTA-appropriate at-rest hygiene.

### Gaps

**1.1 No threat model.** The document never states *what* it defends against:
honest-but-curious server? compromised server? network adversary? lost/stolen
device? law-enforcement seizure? A messenger architecture without an explicit
threat model cannot have its crypto reviewed. Signal and Matrix both publish
one. **P0.**

**1.2 "libsignal" is named but not scoped.** `libsignal` (the Rust core with
Java/Kotlin bindings) gives you the *primitives* — X3DH, the Double Ratchet, the
Sesame multi-device session model, and the Sender Keys group primitive. It does
**not** give you: the registration/key-distribution server protocol, prekey
replenishment, session-establishment orchestration, or fan-out. The iOS audit
(part-04 `E2EAPI`/`E2EESessionManager`) shows the gateway exposes a *pairwise*
`/signal/keys` + `/signal/session/establish` model with a 600s negative cache
and **per-peer symmetric keys** — i.e. the iOS product never implemented a real
ratchet at all. Porting "libsignal bindings" onto that server contract does not
produce Signal-grade E2EE; it produces libsignal primitives on a non-ratcheting
server protocol. **The architecture must decide and document the actual
protocol**, not the library. **P0.**

**1.3 Group messaging encryption is unaddressed.** Meeshy is group-chat-first
(communities, channels, group conversations up to N members). Pairwise Double
Ratchet does **not** scale to groups — SOTA is **Sender Keys** (Signal/WhatsApp:
per-sender symmetric chain, pairwise-encrypted key distribution, re-key on
membership change) or **MLS / RFC 9420** (Matrix's direction, `libsignal` does
*not* implement MLS — you would need `mls-rs` / OpenMLS). The document has no
position on this. With `minSdk 26` and a fresh build, **MLS is worth a serious
evaluation** (better forward secrecy and post-compromise security at group
scale, tree-based re-key), but it is a large commitment. At minimum an ADR must
choose Sender Keys vs MLS and specify membership-change re-keying. **P0.**

**1.4 Multi-device E2EE is unaddressed.** The feature catalogue (K: "Active
device sessions: list, revoke one, revoke all others") and the dual Socket.IO +
FCM design both imply multiple concurrent devices per account. Pairwise sessions
are *per device*, not per user — every message must be encrypted once per
recipient device, prekeys are per device, and a new device needs history
transfer or a "history starts here" boundary. Signal's Sesame and WhatsApp's
companion-device model solve this; the architecture says nothing. This also
interacts with §5 (the outbox idempotency key must be device-scoped) and §6
(socket fan-out per device). **P0.**

**1.5 Key backup / restore is unaddressed.** If keys live only in Keystore, a
lost phone = permanently undecryptable history, and even routine device upgrade
loses everything. SOTA: Signal SVR (secure-enclave-backed PIN escrow),
WhatsApp encrypted backups (HSM, 64-digit key or PIN). The catalogue has GDPR
export and "wipe E2EE keys on logout" but **no key escrow / encrypted backup**.
This must be a deliberate decision (even "no backup, history is device-local" is
a decision — but then it must be a documented product stance, and the §11
"per-user cache wipe on logout" silently destroys all E2EE history). **P0.**

**1.6 Metadata minimisation / sealed sender — not mentioned.** Even with perfect
content E2EE, the gateway sees who-talks-to-whom, when, and how often. SOTA
(Signal sealed sender; the general principle) is to minimise server-visible
metadata. This is partly a server concern, but the *client* architecture should
state its posture. At minimum: acknowledge it, and ensure the link-preview
fetcher (audit part-17 `LinkPreviewFetcher`) and OpenGraph resolution do **not**
leak URLs from E2EE conversations to third parties or proxy them in a way that
fingerprints the user. **P1.**

**1.7 Key transparency — not mentioned.** SOTA in 2026 (Signal, WhatsApp, the
Apple Contact Key Verification line of work) is auditable **key transparency**
(verifiable key directory) rather than only manual safety-number comparison.
Minimum bar: a safety-number / fingerprint verification UI and a TOFU + change
warning. Neither is in the catalogue. **P1.**

**1.8 Call media encryption is essentially undocumented.** §12.2 covers call
signalling, FSM and Telecom integration well, but says nothing about media
security. WebRTC gives you DTLS-SRTP hop-by-hop *by default* — but for a P2P
1:1 call against a STUN/TURN topology, if TURN relays media the relay sees
plaintext SRTP unless you add **end-to-end** keying. SOTA for E2EE calls is
DTLS-SRTP **plus** verifying the DTLS fingerprint over the already-E2EE
signalling channel (so a malicious signalling server cannot MITM the
fingerprint), and `Insertable Streams` / SFrame if any media-routing node is
untrusted. The architecture must state: (a) is call media E2EE or only
transport-encrypted, (b) how the DTLS fingerprint is authenticated. **P1.**

**1.9 Encrypted Room — under-specified.** ADR-013 says "sensitive tables
encrypted (AES-GCM / SQLCipher)". AES-GCM-per-column and SQLCipher-whole-DB are
very different (key management, FTS compatibility, query cost). FTS5 search
(ADR-017 / catalogue N) over an encrypted store is a known hard combination —
SQLCipher works but the external-content FTS triggers from audit part-16 need
verification. Pick one and document FTS implications. **P1.**

**1.10 `coerceInputValues = true` (ADR-014) on a security boundary.** Lenient,
coercing deserialization is right for *forward compatibility* but is a footgun
on E2EE/auth payloads: silently coercing a malformed/absent field to a default
can downgrade security (e.g. a missing `isEncrypted` flag coerced to `false`).
**Recommendation:** use the lenient `Json` for feed/profile/social DTOs, but a
**strict** `Json` instance for crypto bundles, key material, and auth tokens.
**P1.**

### ADR actions
- **NEW ADR-018 — Threat model & E2EE protocol** (pairwise + group, the chosen
  group scheme, multi-device/Sesame, what the server is trusted with).
- **NEW ADR-019 — Key backup & recovery** (escrow vs device-local; explicit).
- **AMEND ADR-013** — split into at-rest storage (keep) vs E2EE protocol (move
  to 018); specify SQLCipher-vs-column choice; carve out a strict JSON instance
  for crypto/auth.
- **NEW ADR-020 — Call media security** (DTLS-SRTP + fingerprint
  authentication over signalling; SFrame posture).

---

## 2. Sync & consistency — **WEAK (multi-device); OK (single-device)**

ARCHITECTURE §4, §5(Pattern 4), §6, §12.4; ADR-004/005/006; audit part-16
(`ReconnectionGapDetector`, `MessageStateMachine`, `upsertFromAPIMessages`).

### What is right
- Room as the single SoT, network/sockets write *into* Room, UI observes Room —
  this CQRS-ish unidirectional model is exactly the Now-in-Android pattern and
  kills the iOS dual-store class of bugs (ADR-004). Strong.
- The 3-tier PendingId reconciliation (PendingId → PK → serverId scan) and the
  pure `MessageStateMachine` are well-chosen and directly portable.
- SWR `CacheResult` four-state contract is correct and uniform.

### Gaps

**2.1 The ordering / consistency domain is never named.** SOTA messengers define
*who owns message order*: a server-assigned monotonic sequence per conversation
(WhatsApp), a Lamport/`origin_server_ts` + DAG (Matrix), or a hybrid. §5 says
`sending → sent → delivered → read` but never says **what orders two messages**.
"Sort by `createdAt`" is the iOS approach and is **wrong under clock skew** —
client-stamped times reorder messages, optimistic bubbles jump on ACK, and two
near-simultaneous sends from different devices race. **The architecture must
specify a per-conversation server sequence number** (or accept Matrix-style
DAG ordering) and store it on `MessageEntity` as the sort key, with `createdAt`
only for display. **P0.**

**2.2 Gap detection is reconnect-only and timestamp-based.** Audit part-16's
`ReconnectionGapDetector` fills gaps by *paginating from a last-received
timestamp*. That detects "I was offline", not "I silently missed a socket
frame while connected" (dropped event, out-of-order delivery, server hiccup).
SOTA gap detection uses **sequence-number continuity** (if I hold seq N and the
next socket event is seq N+2, fetch N+1). Without per-conversation sequence
numbers there is no reliable in-band gap detection. Couples directly to 2.1.
**P0.**

**2.3 Multi-device sync / read-state convergence is unaddressed.** If a user has
phone + tablet (the catalogue lists device-session management), reading on one
must converge read receipts and unread counts on the other. The `outbox` +
`socket → Room` model handles *this device's* writes and *inbound* events, but
there is no design for **own-device echo of own actions made elsewhere** (read
on tablet → unread badge on phone). The `NotificationCoordinator` authority
model (§6) governs socket-vs-cache precedence but not multi-device convergence.
**P1.**

**2.4 Conflict resolution is implicit.** Concurrent edits of the same message
from two devices, a delete racing an edit, a reaction toggle racing its own
echo — §5 mentions in-flight guards and self/others echo splitting (good for the
*single-device rapid-tap* case) but there is no stated conflict policy
(last-writer-wins by server seq? server is authoritative always?). State this:
**"server state is authoritative; the client's optimistic state is provisional
and reconciled on the next authoritative read/socket event"** — and make it a
rule, not an emergent behaviour. **P1.**

**2.5 Clock skew is not handled anywhere.** Ephemeral/self-destruct timers,
"2h edit window", live-location expiry, story 21h/24h expiry all depend on time.
Client clock vs server clock can differ by minutes. SOTA computes a
**server-time offset** at connect (from a server timestamp in the handshake/an
NTP-like ping) and evaluates all deadlines in server time. Not mentioned. **P1.**

**2.6 Cold-start full sync completeness.** Catalogue Q lists "bounded parallel
paging, retries, completeness guards" — good intent — but the architecture body
does not define *when sync is considered complete* or how a partial sync is
represented in `CacheResult` (a half-synced conversation list is neither `Fresh`
nor `Stale`). **P2.**

### ADR actions
- **NEW ADR-021 — Message ordering & gap detection** (per-conversation server
  sequence as the sort key + continuity-based gap fill; server-authoritative
  conflict policy; server-time offset).

---

## 3. Real-time transport — **WEAK**

ARCHITECTURE §6; ADR-015.

### Assessment
Two Socket.IO connections **forced to HTTP long-polling** is the single most
questionable *carried-over* decision. ADR-015's reasoning is "iOS proved
WebSocket unreliable against the gateway" — but that is an **iOS-client / gateway
bug**, not a transport law, and the audit itself flags it as something to
"revisit only after verification". Baking a known-degraded transport into the
Android ADR before verifying it on Android is premature.

Long-polling vs WebSocket consequences on Android specifically:
- **Battery / radio:** long-polling = a new HTTP request every ~25–30s = the
  radio never fully idles. This is materially worse for Doze/App-Standby and
  will show up in Android vitals "excessive background wakeups". WebSocket with
  ping/pong keepalive is far gentler.
- **Two connections** doubles the radio cost. SOTA messengers run **one**
  multiplexed connection. ADR-015 rejects multiplexing "to match iOS" — but the
  *gateway* dictates whether one connection can carry both namespaces; if it
  can, Android should multiplex regardless of what iOS does. At minimum, make
  multiplexing an explicit gateway question, not an assumed no.

**3.1** Add a transport-verification spike to Phase 3 *before* ADR-015 is
locked: test `socket.io-client-java` WebSocket against the real gateway from
Android. If it works, Android should not inherit the long-polling penalty.
**P0** (cheap to verify, expensive to retrofit).

**3.2 FCM-vs-socket wake strategy is missing.** §6 covers sockets and §12.2
covers FCM for *calls*, but there is no overall doctrine: when the app is
backgrounded, who delivers messages — the socket (kept alive by a foreground
service? not allowed for chat) or FCM data pushes? SOTA: **socket only while
the app is foreground/visible; FCM high-priority data messages when
backgrounded; the FCM handler writes into Room and the socket is not held in
the background.** Android will *kill* a background socket under Doze regardless,
so this must be designed, not left emergent. The catalogue (M) mentions FCM
prefetch+pre-persist (good) but the architecture body never states the
foreground=socket / background=FCM split. **P0.**

**3.3 Doze / App-Standby / background-restriction handling absent.** No mention
of Doze maintenance windows, FCM priority quotas (high-priority data messages
are rate-limited by the OS once the app is in a restricted bucket), or the
`WorkManager` expedited-quota interaction. The outbox flusher (§5) is
WorkManager-backed — under aggressive OEM battery management (Samsung, Xiaomi)
expedited work can be delayed for *minutes*. **P1.**

**3.4 Reconnect storms / backoff jitter.** §6 says "reconnect re-joins rooms"
but no backoff policy for the socket itself (the *outbox* has backoff; the
socket connection does not). After a server restart, thousands of clients
reconnecting in lockstep is a thundering-herd. Add full-jitter exponential
backoff on the socket. **P2.**

### ADR actions
- **AMEND ADR-015** — downgrade "long-polling" from a decision to a
  *verified-default*; add a Phase-3 WebSocket spike; add the explicit
  foreground-socket / background-FCM doctrine; revisit single-multiplexed-socket
  pending a gateway answer.

---

## 4. Offline / outbox — **OK, with sharp edges**

ARCHITECTURE §5; ADR-006; audit part-16 (`OfflineQueue`, `OutboxFlusher`,
`OutboxRecord`).

### What is right
Consolidating five iOS queues into one Room `outbox` + WorkManager is the
correct call. FIFO, exponential backoff, `Exhausted ×5`, transient-vs-permanent
classification, 404-as-success, in-queue coalescing, the per-`cmid` outcome
`SharedFlow`, crash-safe boot recovery, byte-identical `cmid`/`cid` wire formats
— this is a faithful, well-understood port of a genuinely good iOS subsystem.

### Gaps

**4.1 "Strict FIFO" vs "WorkManager" is a contradiction at scale.** A single
unique WorkManager job draining FIFO means **one permanently-failing item
(repeatedly transient, e.g. a huge media upload on a flaky link) head-of-line
blocks every later mutation** — your read receipt, your reaction, your profile
edit all stall behind it. SOTA: **independent ordering domains** — strict FIFO
*per conversation* for messages (ordering matters), but reactions / read
receipts / profile / settings on **independent lanes** that do not block each
other. Recommend partitioning the outbox by `(kind-class, conversationId)` and
draining lanes concurrently. **P1.**

**4.2 Large-media uploads do not belong in the same drain as text mutations.**
The catalogue lists TUS resumable uploads (audit references `TusUploadManager`).
A 200 MB video upload inside the FIFO outbox worker will (a) block, (b) risk the
WorkManager 10-minute expedited-execution ceiling, (c) fight Doze. Media uploads
should be **their own WorkManager chain** with `setForeground` progress
notification, and the message-send outbox item should depend on the upload's
completion (work continuation / a `uploadId` foreign key), not contain the
bytes. §12 mentions TUS but the §5 outbox design does not separate them. **P1.**

**4.3 Idempotency under multi-device.** `cmid` dedups *replays* at the gateway
`MutationLog` — correct. But if the same account is on two devices, the `cmid`
generator must be device-scoped (or globally unique) so two devices never
collide; and a message sent on the phone must not be re-sent by the tablet's
outbox. Couples to §1.4. **P1.**

**4.4 Outbox unbounded growth / poison messages.** What happens to `Exhausted`
rows? They must be surfaced to the user (failed-message UI exists for messages —
but a failed `ProfileUpdate` or `SettingsUpdate`?) and eventually garbage-
collected. State a retention/visibility policy for terminal outbox rows. **P2.**

---

## 5. Performance — **OK**

ARCHITECTURE §9; ADR-009/017.

### What is right
LazyColumn + stable keys + `contentType` + `@Immutable`/`@Stable` item models +
primitive snapshots into leaf rows + Paging 3 + baseline profiles + off-thread
`TextMeasurer` layout caching + burst-coalescing socket events + Compose
compiler metrics in CI — this is a textbook, Now-in-Android-grade performance
plan. The RecyclerView escape-hatch reasoning (default Compose, drop only on
profiler evidence) is sound and correctly avoids the iOS dual-renderer debt.

### Gaps

**5.1 Inverted list + Paging 3 is a known rough edge.** Chat is an *inverted*
list (newest at bottom, `reverseLayout = true`) and Paging 3 around an *anchor*
(`listAround` deep-link from a notification — audit part-17) with bidirectional
loading (older above, newer below) is genuinely hard with `RemoteMediator`.
"Around-anchor" paging is exactly where Paging 3 is weakest. This is the single
highest-risk performance item and deserves a spike and possibly a hand-rolled
windowed pager for the chat screen specifically. The blanket "Paging 3
everywhere" (ADR-017) should carry an explicit caveat for the message list.
**P1.**

**5.2 `<150 MB RSS` budget is asserted, not instrumented.** No macrobenchmark,
no `Perfetto`/`StrictMode`, no memory-leak gate (LeakCanary) is mentioned (see
§9 below). A budget without a gate is a wish. **P1.**

**5.3 Cold-start ≤1s with a 17-module Hilt graph.** Hilt's generated component
graph and `Application.onCreate` work (FCM, WorkManager init, DataStore, crypto
provider warm-up, Timber) is a classic cold-start tax. Use `App Startup`
(`androidx.startup`) with lazy initializers and verify with a macrobenchmark.
**P2.**

---

## 6. Modularisation & build — **OK / SOTA**

ARCHITECTURE §2; ADR-003.

### What is right
The `:app` / `:feature:*` / `:sdk-ui` / `:sdk-core` / `:core:common` graph with
convention plugins in `build-logic/`, no feature→feature edges, `explicitApi()`
on the SDK, and dependency rules enforced by a Gradle plugin is the
Now-in-Android reference structure. Right-sized for the team.

### Gaps

**6.1 `:sdk-core` is a monolith-in-disguise.** §2 lists *everything* in
`:sdk-core`: all models, networking, both sockets, Room, DataStore, **all**
repositories, the SWR engine, the outbox, the state machine, the sync engine,
`LanguageResolver`, **and crypto/E2EE**. That is the 2840-LOC god object at
module granularity — `:sdk-core` will be the slowest-to-build, most-contended
module, and every feature waits on it. Recommend splitting at least:
`:core:database` (Room), `:core:network` (Retrofit/OkHttp/sockets),
`:core:crypto` (E2EE — also a good security boundary, smaller audit surface),
`:core:datastore`, and a thinner `:sdk-core` (repositories/domain). **P1.**

**6.2 `:core:navigation` is hedged ("or a thin `:core:navigation`").** With 14
feature modules and cross-feature deep links, route contracts in `:app` create
an `:app`-recompile bottleneck. Commit to a real `:core:navigation` (or
`:core:model` for shared route types). Decide it now. **P2.**

**6.3 No mention of `api` vs `implementation` discipline, version-catalog
bundles, or build-cache/remote-cache.** The root CLAUDE.md says Turborepo with
remote caching for the JS monorepo — the Android build needs the equivalent
(Gradle remote build cache, configuration cache). **P2.**

---

## 7. Media pipeline — **WEAK (optimistic on the hardest subsystem)**

ARCHITECTURE §12.1/§12.3; feature-parity E (Stories).

### Assessment
§12 *correctly identifies* the story canvas/renderer and the timeline video
editor as the two heaviest-risk subsystems and the "single shared
`StoryRenderer` feeds composer + reader + export" WYSIWYG principle is the right
architecture. But the plan is one paragraph for what is, realistically, a
multi-month subsystem rivalling a small video-editing app.

**7.1 "Compose `Canvas` for the live composer" will not hold at 60fps for a
rich multi-layer editor with video backgrounds.** Compose `Canvas` is
immediate-mode on the UI thread; a story composer with a looping video
background + draggable text + stickers + freehand ink + filters is a
**GPU-surface** problem (`SurfaceView`/`TextureView` + a GL/Vulkan or
`RenderEffect` pipeline, or Media3 `Transformer`'s preview), not a Compose
`Canvas` problem. The architecture should not promise Compose `Canvas` for the
live editor surface. **P1.**

**7.2 Media3 `Transformer` for export with arbitrary per-keyframe overlays.**
`Transformer` supports overlays and effects, but a story with per-element
keyframe animation (position/scale/opacity easing), transitions, and z-order is
near the limit of `Transformer`'s declarative model — you may need a
frame-by-frame `MediaCodec` compositor. Export-WYSIWYG-parity with the live
canvas is the hardest single guarantee in the catalogue. Flag it as a spike with
a fallback. **P1.**

**7.3 ExoPlayer single-active-player coordination** (catalogue P) across feed
auto-play, chat inline video, story reader, audio messages — needs an explicit
`PlaybackCoordinator` owning one `ExoPlayer` pool. Mentioned in features, absent
from architecture. **P2.**

**7.4 Picture-in-Picture, `Transformer` thermal/battery interaction** — not
mentioned; PiP needs Activity-config and the single-Activity model has PiP
implications. **P2.**

---

## 8. Observability — **MISSING**

This is, after E2EE, the most serious *omission*. ARCHITECTURE §9 mentions
"Compose compiler metrics in CI" and §13 mentions Crashlytics indirectly (via
the audit), but the architecture document has **no observability section at
all**. For a platform targeting 100k msg/s and real-time calls, this is a P0
gap — you cannot operate what you cannot see.

Missing entirely:
- **Crash + ANR reporting.** Crashlytics is implied by the iOS audit but never
  adopted in an ADR. ANR detection via `ApplicationExitInfo` (API 30+) is
  mentioned in audit part-04 but not in the architecture. **P0.**
- **Structured logging strategy beyond "Timber facade".** What ships to a
  backend? PII/E2EE-content redaction in logs is a *security* requirement
  (a logged decrypted message body defeats E2EE). **P0.**
- **Performance monitoring** (Firebase Performance / custom traces): cold start,
  socket-connect latency, message-send round-trip, frame timing in production.
  **P1.**
- **Distributed tracing / correlation IDs.** The `cmid`/`cid` already give you
  client-side correlation; propagate a trace/correlation header through Retrofit
  and the socket so a message can be followed client→gateway→translator. **P1.**
- **Feature flags / remote config / kill-switches.** Essential for staged
  rollout of E2EE, calls, the story editor — and for disabling a broken feature
  without a release. Completely absent. **P0.**
- **A/B experimentation** — at least the hooks. **P2.**

### ADR actions
- **NEW ADR-022 — Observability stack** (Crashlytics + ANR via
  `ApplicationExitInfo`, Firebase Performance / custom traces, structured
  logging with mandatory PII/plaintext redaction, remote config / feature
  flags with kill-switches, correlation-ID propagation).

---

## 9. Testing & CI/CD — **WEAK**

ARCHITECTURE §13; feature-parity "Verification gates".

### What is right
TDD red-green-refactor, JVM unit tests for all pure logic, behaviour-through-
public-API, fakes over Hilt interfaces, factory data, Roborazzi screenshot
gates, Room migration instrumented tests, `kotlinx.serialization` round-trip
tests with real payloads — a strong, correct *unit/component* testing posture.

### Gaps

**9.1 No release pipeline / CI/CD is described at all.** "`./meeshy.sh build` +
`./meeshy.sh test` must pass before commit" is a *local pre-commit* gate, not
CI/CD. Missing: a CI matrix, signing/secrets management, Play Store track
strategy (internal → closed → open → production), staged rollout %, and a
**Baseline Profile generation step** (§9 *uses* baseline profiles but nothing
*generates* them in CI — they go stale silently). **P0.**

**9.2 No Macrobenchmark.** §9 sets a cold-start and jank budget; §13 has no
macrobenchmark to enforce it. Add a `:macrobenchmark` module (cold start, scroll
jank on the message list, baseline-profile generation) to CI. **P1.**

**9.3 Instrumented / E2E test story is thin.** feature-parity says "no emulator
in this environment" and falls back to a live `atabeth` integration test. That
is fragile (depends on prod, non-hermetic, non-reproducible). Plan for a
Gradle-managed-devices / Firebase Test Lab instrumented suite for the critical
flows (login, send/receive, call setup), even if it cannot run in *this*
authoring environment. **P1.**

**9.4 No LeakCanary / StrictMode gate**, no dependency-update automation
(Renovate/Dependabot), no `lint`/`detekt`/`ktlint` mentioned as CI gates. **P2.**

### ADR actions
- **NEW ADR-023 — CI/CD & release engineering** (CI matrix, signing, Play
  tracks + staged rollout, baseline-profile generation in CI, macrobenchmark
  gate, lint/detekt, dependency automation).

---

## 10. Accessibility, i18n, theming — **OK (theming/i18n); WEAK (a11y)**

ARCHITECTURE §10.

### What is right
The locked charte graphique with Roborazzi gates, scalable `sp` typography
honouring system font size, dark mode driven by app preference (not content
locale), full `strings.xml` i18n replacing hardcoded French — all correct, and
the Prisme-vs-UI-language separation is handled well.

### Gaps

**10.1 Accessibility is one line** ("Accessibility for canvas elements" in
catalogue E). No architecture-level a11y strategy: TalkBack semantics for the
chat list and message bubbles (a bubble is a complex node — needs merged
semantics + custom actions for react/reply/forward), content descriptions for
all media, focus order, touch-target minimums (48dp), `LiveRegion` for incoming
messages, RTL layout (the app supports RTL text per catalogue E — but RTL
*layout mirroring* is different and not mentioned), and **screenshot tests do
not test a11y**. SOTA messengers treat a11y as a first-class gate. Add an a11y
section + Espresso/Compose a11y assertions or Accessibility Scanner in CI.
**P1.**

**10.2 Font-scale and large-display screenshot coverage.** Roborazzi tests
light+dark — but not large font scale, not RTL, not the tablet/foldable panes.
The adaptive layout (ADR-011) is a strong feature with no screenshot coverage.
**P2.**

**10.3 Dynamic color is rejected (ADR-016) for brand reasons — fine** — but the
contrast of the locked Indigo palette against WCAG AA in *both* themes should be
verified once and documented, not assumed. **P2.**

---

## 11. SOTA-relevant omissions

Things a 2026 advanced-messenger architecture should address that the document
does not mention at all:

- **11.1 Push-notification reliability & decryption.** Catalogue M lists "rich
  push: decryption" — but FCM data-message **payload size limit is 4KB**. An
  E2EE message cannot always be decrypted inside the push (no room for
  ciphertext + the push must wake the app to fetch + decrypt from Room). The
  notify-then-fetch pattern must be the design; "decrypt in the push" will fail
  for media. Also: notification-channel taxonomy (~80 notification types →
  channels), and the `POST_NOTIFICATIONS` runtime-permission UX. **P1.**
- **11.2 Disappearing messages / data retention is a security feature, not a
  UI feature.** Ephemeral messages (catalogue C), 6-month retention purge (audit
  part-16) and story expiry must be *guaranteed* — including purging from FTS
  index, the media file cache, ThumbHash blobs, the outbox, and push-prefetched
  copies. A message "deleted" but still in the FTS index or `media_snapshots`
  dir is a privacy bug. No architecture-level retention/erasure invariant is
  stated. **P1.**
- **11.3 Moderation / Trust & Safety.** Catalogue has report-message/user/story
  and block — but no architecture for client-side abuse handling: spam-link
  warnings, unknown-sender request UX, media-from-strangers gating, or how
  reported content behaves locally. SOTA messengers invest heavily here. **P2.**
- **11.4 Data residency / GDPR mechanics.** Catalogue L has GDPR export and
  account deletion — but the architecture does not address *local* GDPR: the
  logout/account-switch "full wipe" must be provably complete (Room, DataStore,
  EncryptedSharedPreferences, file caches, WorkManager-enqueued jobs, the FCM
  token, Coil disk cache, crash logs). Make "complete local erasure" an
  explicit, tested invariant. **P1.**
- **11.5 R8 / obfuscation / app size.** No mention of R8 full-mode, resource
  shrinking, `proguard` rules for `kotlinx.serialization` / Retrofit / libsignal
  JNI / Room, App Bundle + dynamic feature modules, or an app-size budget.
  libsignal and stream-webrtc ship large native `.so` files per ABI — ABI splits
  / App Bundle are essentially mandatory. **P1.**
- **11.6 Dependency supply chain.** No mention of dependency verification
  (Gradle dependency-verification metadata / checksums), SBOM, or pinning — for
  an E2EE app, a compromised dependency is a content-confidentiality breach. At
  minimum enable Gradle dependency verification and document the libsignal
  source/version pin. **P1.**
- **11.7 Certificate pinning.** An E2EE app still benefits from pinning the
  gateway TLS cert/SPKI (defence in depth against a rogue CA for the metadata
  channel and key-distribution endpoints). OkHttp `CertificatePinner`. Not
  mentioned. **P2.**
- **11.8 Time-to-first-message after install / account-restore UX** — the
  cold-cache + (potentially) no-key-history case is unspecified.

---

## 12. What is genuinely strong — keep this

These decisions are correct and should **not** be re-litigated:

1. **Room as the single source of truth** (ADR-004) — kills the iOS dual-store
   bug class; UI-observes-Room is the right unidirectional model.
2. **One consolidated outbox** (ADR-006) — five iOS queues → one is a real
   simplification; the coalescing state machine, `cmid` idempotency, crash-safe
   boot recovery and the outcome `SharedFlow` are faithfully and well specified.
3. **SWR `CacheResult` four-state contract** (ADR-005) as shared infrastructure,
   built first — correct, and the "skeleton only on `Empty`, never spinner over
   stale" rule is the right instant-app discipline.
4. **The module graph + convention plugins + enforced dependency rules**
   (ADR-003) — Now-in-Android reference structure, right-sized (subject to
   §6.1's `:sdk-core` split).
5. **One `UiState` + `StateFlow` per screen, single `onEvent` sink**
   (ADR-008) — the correct cure for the iOS scattered-`@Published` god objects;
   trivially testable.
6. **Performance discipline** (§9) — stable keys, `@Immutable` models, primitive
   snapshots into leaf rows, Paging 3, baseline profiles, Compose-metrics CI
   gate, off-thread layout caching — textbook.
7. **Type-safe Navigation-Compose + adaptive `ListDetailPaneScaffold` from day
   one** (ADR-010/011) — correctly avoids the iOS stringly-typed-routes and
   late-tablet-retrofit traps.
8. **Locked design system + Roborazzi gates** (ADR-016) — mechanised brand
   fidelity is exactly right.
9. **The explicit "NOT ported" list** (§11) — refusing to inherit iOS tech debt
   (plaintext-fallback crypto, dual store, god objects, polling loops, Swift-6
   workaround scars) is mature and disciplined.
10. **Driving scope from a full 673-file audit** rather than guesswork — the
    feature-parity catalogue is a genuine anti-omission mechanism.

---

## 13. Prioritised action list

### P0 — block E2EE / sync / transport implementation until resolved
- **P0-1** Write an explicit **threat model** (ADR-018). What is the server
  trusted with; what does each adversary class see.
- **P0-2** Decide and document the **actual E2EE protocol** (ADR-018): pairwise
  scheme, **group scheme (Sender Keys vs MLS)**, multi-device/Sesame. "libsignal"
  is a library, not a design.
- **P0-3** Decide **key backup / recovery** (ADR-019) — escrow vs device-local;
  reconcile with the logout "full wipe".
- **P0-4** Specify **message ordering**: per-conversation server sequence number
  as the sort key; server-authoritative conflict policy (ADR-021).
- **P0-5** Specify **gap detection** via sequence-continuity, not just
  reconnect-timestamp paging (ADR-021).
- **P0-6** State the **foreground-socket / background-FCM** delivery doctrine;
  do not hold a chat socket in the background (§3.2).
- **P0-7** Add a **WebSocket-vs-long-polling verification spike** on Android
  before locking ADR-015; do not inherit the iOS long-polling penalty unproven.
- **P0-8** Add an **observability ADR** (ADR-022): Crashlytics + ANR, perf
  monitoring, structured logging **with mandatory plaintext/PII redaction**,
  **remote config / feature flags / kill-switches**.
- **P0-9** Add a **CI/CD & release ADR** (ADR-023): CI matrix, signing, Play
  staged rollout, **baseline-profile generation in CI**, macrobenchmark gate.

### P1 — resolve before the relevant subsystem is built
- **P1-1** Split `:sdk-core` (`:core:database`, `:core:network`, `:core:crypto`,
  `:core:datastore`) — §6.1.
- **P1-2** Partition the outbox into independent ordering lanes; head-of-line
  blocking is a real scale bug — §4.1.
- **P1-3** Move large-media uploads to a dedicated WorkManager chain with a
  foreground progress notification; the message-send item depends on it — §4.2.
- **P1-4** Specify call media security (ADR-020): DTLS-SRTP + fingerprint
  authenticated over the E2EE signalling channel.
- **P1-5** Multi-device read-state / own-action convergence design — §2.3.
- **P1-6** Server-time-offset handling for all timers (ephemeral, edit window,
  story/location expiry) — §2.5.
- **P1-7** Caveat ADR-017: the inverted, around-anchor message list needs a
  Paging-3 spike and a possible hand-rolled windowed pager — §5.1.
- **P1-8** Strict `Json` instance for crypto/auth payloads; lenient one for the
  rest — §1.10.
- **P1-9** Architecture-level **accessibility** section + CI a11y gate — §10.1.
- **P1-10** Notify-then-fetch push design (4KB FCM limit; media can't decrypt
  in-push); notification-channel taxonomy — §11.1.
- **P1-11** "Complete local erasure" invariant for logout/account-switch and
  for disappearing/retention purges (incl. FTS, file caches, outbox) —
  §11.2/§11.4.
- **P1-12** R8 full-mode + App Bundle + ABI splits + app-size budget; keep rules
  for libsignal JNI / Room / serialization — §11.5.
- **P1-13** Gradle dependency verification + libsignal version pinning — §11.6.
- **P1-14** Realistic GPU-surface plan for the live story composer (not Compose
  `Canvas`); export-WYSIWYG spike with a fallback — §7.1/§7.2.
- **P1-15** Macrobenchmark module + LeakCanary; instrumented critical-flow suite
  plan — §9.2/§9.3.

### P2 — track, resolve opportunistically
- Key transparency / safety-number verification UI (§1.7); metadata-leak audit
  of link previews (§1.6); `:core:navigation` commitment (§6.2); reconnect
  backoff jitter on the socket (§3.4); `PlaybackCoordinator` for ExoPlayer
  (§7.3); cold-start `androidx.startup` (§5.3); font-scale/RTL/tablet screenshot
  coverage (§10.2); WCAG-AA contrast verification of the Indigo palette
  (§10.3); moderation/T&S client architecture (§11.3); certificate pinning
  (§11.7); terminal-outbox-row retention (§4.4); cold-sync completeness
  representation in `CacheResult` (§2.6).

---

## 14. ADR summary

| ADR | Action | Subject |
|-----|--------|---------|
| 001–003 | keep | Native Kotlin/Compose, minSdk26, module graph (split `:sdk-core` per §6.1) |
| 004–012 | keep | Room SoT, SWR, outbox, Hilt, UDF, LazyColumn, nav, adaptive, Android-only |
| 013 | **amend / split** | At-rest storage stays; E2EE protocol moves to 018; specify SQLCipher choice; strict JSON for crypto |
| 014 | keep (qualified) | Lenient JSON — but a strict instance for crypto/auth boundaries |
| 015 | **amend** | Long-polling demoted to verified-default; WebSocket spike; foreground/background delivery doctrine |
| 016–017 | keep | Design system locked; Paging 3 — caveat the inverted message list |
| **018** | **new** | Threat model & E2EE protocol (pairwise + group scheme + multi-device) |
| **019** | **new** | Key backup & recovery |
| **020** | **new** | Call media security (DTLS-SRTP fingerprint authentication) |
| **021** | **new** | Message ordering, gap detection, server-time, conflict policy |
| **022** | **new** | Observability (crash/ANR, perf, logging+redaction, feature flags) |
| **023** | **new** | CI/CD & release engineering (rollout, baseline profiles, benchmark) |

No ADR is rejected outright. ADR-015 is the one most likely to be *reversed* in
practice once the WebSocket spike runs.

---

## 15. Bottom line

The app-architecture craftsmanship (modules, UDF, Room SoT, SWR, outbox, Paging,
adaptive UI, design system) is **strong and implementation-ready**. The
**systems-level hard problems of a 2026 messenger — E2EE protocol design, group
& multi-device encryption, key backup, authoritative message ordering,
multi-device sync convergence, transport/battery doctrine, observability and
release engineering — are under-specified or absent.** The document currently
reads as an excellent *Android app* architecture and an incomplete *secure
real-time messaging platform* architecture.

Proceed with Phase 2 and the non-crypto parts of Phase 3 now. Gate Phase 3's
E2EE, sync engine and socket transport behind the four new security/sync ADRs
(018–021) and a written threat model. Add the observability and CI/CD ADRs
(022–023) before feature work scales. Resolving the nine P0 items is a
days-to-low-weeks effort and will prevent expensive rewrites once 150k lines
exist.
