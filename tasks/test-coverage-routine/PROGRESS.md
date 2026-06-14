# Test Coverage Routine — Progress Tracker

> **This file is the single source of truth for the autonomous test-coverage routine.**
> Every scheduled run reads it, picks the next slice, does the work, then updates it.
> Do NOT delete history — append run entries to `RUNLOG.md`.

- **Cadence:** every 3h, driven by a Claude Code **web Routine** or **local cron** (see
  `SETUP-ROUTINE.md`). Not GitHub Actions.
- **Phase = one run's slice.** Each run branches off the latest `main`
  (`claude/coverage/<slice-id>`), does the slice, opens a PR, and **merges it to main** when green +
  reviewed + tests-only (see `ROUTINE.md` §7). No long-lived branch; conflicts resolved by keeping
  both sides' tests.
- **Coverage target:** **≥92% line + branch** on the targeted module(s) **and ≥92% on the diff's
  changed lines** (enforced per-file + per-diff — see `ROUTINE.md` §Coverage rules).
- **Quality gate:** every phase must PASS the reviewer rubric in `REVIEWER.md` before merge.
- **Merge guard:** never merge past red CI, never merge a diff that touches production logic
  (left open for a human).

Legend: `☐` todo · `◐` in progress · `☑` done (≥92% + reviewer PASS, merged to main) · `⊘` n/a
· `⚠` blocked

---

## Sprint 0 — Restore CI enforcement (MUST run first)

Without this, every test the routine writes is non-blocking and proves nothing.
Each item is a separate slice; run them in order. Validate via the PR's own CI run.

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 0.1 | Measure current coverage baselines (web jest, gateway jest, translator pytest, iOS, android) and record them in this file | — | ☑ |
| 0.2 | Remove `continue-on-error` for web + gateway test jobs | `.github/workflows/ci.yml:211,224` | ☑ |
| 0.3 | Re-enable the disabled Python test job with a CPU-only marker split (no GB model downloads) | `.github/workflows/ci.yml:242` (`if: false`) | ☑ |
| 0.4 | Add **ratcheting** `coverageThreshold` to web jest at the measured baseline | `apps/web/jest.config.js` | ☑ |
| 0.5 | Stop gateway jest from silently excluding `routes/middleware/websocket/grpc` & ignoring whole test dirs; add a global threshold at baseline | `services/gateway/jest.config.json` | ☐ |
| 0.6 | Restore translator `fail_under` toward 80 on the non-excluded set; tighten over-broad `exclude_lines` (error handling/cleanup should count) | `services/translator/pyproject.toml` | ☐ |
| 0.7 | Triage & un-skip the dark `.skip` test files (or delete with justification) | `gateway: ZmqTranslationClient.test.ts.skip`, `AttachmentService.test.ts.skip`, `AuthHandler.test.ts.skip` | ☐ |

> **Ratcheting rule:** thresholds are set at the *current measured* value and only ever raised.
> A run that raises coverage bumps the floor so it can never regress. Never set a floor above
> what currently passes (that breaks CI for everyone).

---

## Feature matrix (end-to-end vertical slices)

Each cell = "92% line+branch on this feature's modules in this app, reviewer-approved."
A run targets **one (feature × app) cell**. Pick the highest-priority `☐` cell, top-to-bottom.
`P0` rows are security/correctness-critical and come first.

| Pri | Feature | gateway | translator | web | iOS | android | shared/SDK |
|-----|---------|:------:|:----------:|:---:|:---:|:-------:|:----------:|
| P0 | **Auth** (login/register/JWT/session/2FA/magic-link/pw-reset) | ☐ | ⊘ | ☐ | ☐ | ☐ | ☐ |
| P0 | **Encryption & attachments** (E2EE, AES-GCM, encrypt-then-upload, audio attach) | ☐ | ⊘ | ☐ | ☐ | ☐ | ☐ |
| P0 | **Prisme Linguistique** (lang resolution + translation display) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| P0 | **Messaging core** (send/recv/edit/delete/optimistic/dedup/clientMessageId) | ☐ | ⊘ | ☐ | ☐ | ☐ | ☐ |
| P1 | **Real-time** (Socket.IO presence, typing, reactions, delivery, reconnect) | ☐ | ⊘ | ☐ | ☐ | ☐ | ☐ |
| P1 | **Conversations & membership** (create/join/leave/participants/settings) | ☐ | ⊘ | ☐ | ☐ | ☐ | ☐ |
| P1 | **Offline & sync** (outbox, failed-messages queue, reconnect flush) | ☐ | ⊘ | ☐ | ☐ | ☐ | ☐ |
| P1 | **ZMQ infra** (worker pool, connection mgr, multipart frames, dedup) | ☐ | ☐ | ⊘ | ⊘ | ⊘ | ⊘ |
| P1 | **Voice/audio** (transcription, TTS, voice profiles, voice translation) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| P2 | **Notifications** (push, in-app, Firebase/APNs, delivery queue) | ☐ | ⊘ | ☐ | ☐ | ☐ | ☐ |
| P2 | **Feed / posts / stories / reactions** | ☐ | ⊘ | ☐ | ☐ | ☐ | ☐ |
| P2 | **Calls** (WebRTC, call lifecycle, ICE restart) | ☐ | ⊘ | ☐ | ☐ | ⊘ | ⊘ |
| P2 | **Rate limiting** (message/api/socket limits, Redis fallback) | ☐ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ |
| P2 | **Admin & moderation** | ☐ | ⊘ | ☐ | ⊘ | ⊘ | ⊘ |
| P2 | **Theme/accent color** (ColorGeneration algorithm) | ⊘ | ⊘ | ☐ | ☐ | ☐ | ☐ |
| P2 | **Video/story export** (composition, export pipeline) | ⊘ | ⊘ | ☐ | ☐ | ☐ | ☐ |

---

## Exhaustive file-level checklists

The **complete, every-file** lists live in [`manifests/`](manifests/README.md) — one per app,
grouped by feature/domain, with a checkbox per source file (2,538 files total; ~1,716 untested).
The routine ticks `[x]` there as each file reaches 92% line+branch + reviewer PASS.

| App | Manifest | Files | Untested-ish |
|-----|----------|:-----:|:------------:|
| Gateway | [`manifests/gateway.md`](manifests/gateway.md) | 316 | 228 |
| Translator | [`manifests/translator.md`](manifests/translator.md) | 110 | 86 |
| Web | [`manifests/web.md`](manifests/web.md) | 1091 | 728 |
| iOS | [`manifests/ios.md`](manifests/ios.md) | 346 | 250 |
| Android | [`manifests/android.md`](manifests/android.md) | 148 | 120 |
| Shared | [`manifests/shared.md`](manifests/shared.md) | 78 | 60 |
| MeeshySDK | [`manifests/sdk-swift.md`](manifests/sdk-swift.md) | 449 | 244 |

When a `(feature × app)` cell is selected, resolve it to files by intersecting the manifest's
domain groups with the feature's module targets below, then cover **every** file in that
intersection to 92% before flipping the cell `☑`.

## Per-feature module targets

The routine resolves a cell to concrete files here. Keep this list updated as the codebase moves.
(Paths are seeds from the 2026-06-14 coverage analysis — verify they still exist before testing.)

### Auth
- **gateway:** `src/services/AuthService.ts`, `TwoFactorService.ts`, `MagicLinkService.ts`, `PasswordResetService.ts`, `SessionService.ts`, `routes/two-factor.ts`, `middleware/auth.ts`, `middleware/admin-permissions.middleware.ts`
- **web:** `services/auth.service.ts`, `auth-manager.service.ts`, `two-factor.service.ts`, `stores/auth-store.ts`, `hooks/use-auth*.ts`
- **iOS:** `Services/E2EAPI.swift`, `Services/APIClient.swift`, auth ViewModels; SDK `TwoFactorService.swift`
- **android:** `feature/auth/**`, `core/network/**` auth paths
- **shared:** auth-related Zod schemas in `utils/validation.ts`

### Encryption & attachments
- **gateway:** `src/services/AttachmentEncryptionService.ts`, `AttachmentService.ts`, `attachments/UploadProcessor.ts`, `MetadataManager.ts`, `AttachmentReactionService.ts`
- **translator:** audio attachment intake `src/services/zmq_transcription_handler.py`, `audio_fetcher.py`
- **web:** `lib/encryption/e2ee-crypto.ts`, `adapters/web-crypto-adapter.ts`, `adapters/indexeddb-key-storage-adapter.ts`, `services/attachmentService.ts`, `tusUploadService.ts`
- **iOS:** `Services/E2EAPI.swift`, attachment adopters
- **shared:** `encryption/*` (already strong — verify branch coverage 92%)

### Prisme Linguistique
- **gateway:** `packages/shared/utils/conversation-helpers.ts` call-sites in message-translation
- **translator:** `src/services/language_capabilities.py`
- **web:** `utils/user-language-preferences.ts`, `services/translation.service.ts`, `advanced-translation.service.ts`, `message-translation.service.ts`
- **iOS:** `Features/Main/ViewModels/Conversation/TranslationResolver.swift`, `ConversationStateStore.swift`
- **android:** `feature/chat/**` translation display, `LanguageProviding` equivalent
- **shared:** `utils/conversation-helpers.ts` (strong — verify 92% branch), `language-normalize.ts`

### Messaging core
- **gateway:** `src/services/messaging/MessageProcessor.ts`, `MessageValidator.ts`, `socketio/handlers/MessageHandler.ts`, `routes/conversations/messages.ts`
- **web:** `services/socketio/orchestrator.service.ts`, `messaging.service.ts`, `connection.service.ts`, `stores/failed-messages-store.ts`, `hooks/queries/use-send-message-mutation.ts`, `utils/optimistic-message.ts`
- **iOS:** conversation send pipeline, `OutboxDispatcher.swift`, optimistic adopters
- **android:** `feature/chat/**` send path
- **shared:** `utils/client-message-id.ts`

### Real-time
- **gateway:** `socketio/handlers/StatusHandler.ts`, `ConversationHandler.ts`, `CallEventsHandler.ts`, `LocationHandler.ts`, `AttachmentReactionHandler.ts`, `MeeshySocketIOManager.ts`
- **web:** socket hooks reconnect/dedup, `notification-socketio.singleton.ts`
- **iOS:** `ConversationSocketHandler.swift` (has tests — fill gaps), `FeedSocketHandler.swift`

### Offline & sync
- **web:** `stores/failed-messages-store.ts` (overflow/migration), offline queue
- **iOS:** `Services/OutboxDispatcher.swift` (+ protocol+mock), offline queue VM tests
- **android:** sync/outbox equivalents

### ZMQ infra
- **gateway:** `services/zmq-translation/ZmqMessageHandler.ts`, `ZmqRequestSender.ts`, `utils/zmq-helpers.ts`, `ZmqConnectionManager.ts`
- **translator:** `services/zmq_pool/connection_manager.py`, `worker_pool.py`, `translation_processor.py`, `zmq_pool_manager.py`, `zmq_models.py`, `zmq_voice_handler.py`

### Voice/audio
- **translator:** `language_capabilities.py`, `diarization_service.py` (pure logic only), `transcribe_gap_filler.py`, `utils/smart_segment_merger.py`, `segment_splitter.py`, `audio_utils.py`, `pipeline_cache.py`
- **gateway:** `VoiceAnalysisService.ts`, `routes/voice-analysis.ts`
- **iOS/SDK:** `Audio/*`, voice-profile ViewModels, SDK `Video/VideoExportPipeline.swift`

> Cells marked `⊘` mean the feature doesn't meaningfully exist in that app. Re-evaluate if the
> architecture changes.

---

## Coverage baselines (filled by slice 0.1)

Measured 2026-06-14. Commands run after `pnpm install` + `cd packages/shared && pnpm build`.

| Suite | Command | Line % | Branch % | Recorded |
|-------|---------|:------:|:--------:|:--------:|
| web | `pnpm --filter web test:coverage` | 33.10 | 25.77 | 2026-06-14 (re-measured after Sprint 0.2/0.3 fixes; threshold floor set at 33/25) |
| gateway | `pnpm --filter gateway test:coverage` | 52.12 | 47.16 | 2026-06-14 |
| translator | `.venv/bin/python -m pytest tests/ -m "not slow and not gpu" --cov=src` | 37.09 | n/a | 2026-06-14 (subset: no-GPU tests only; 4 files w/ import errors excluded) |
| iOS | `./apps/ios/meeshy.sh test` | n/a | n/a | not measurable (no macOS/Xcode in CI env) |
| android | `apps/android/meeshy.sh test` | n/a | n/a | not measurable (no Android SDK in CI env) |
| shared | `pnpm --filter @meeshy/shared test:coverage` | 95.22 | 92.17 | 2026-06-14 |

### Key findings from baseline measurement

**CI enforcement gaps identified (Sprint 0 items):**

1. **Web + gateway tests run with `continue-on-error: true`** (ci.yml lines 211, 224) — CI never
   fails on test failures in these suites. This makes the test gate non-blocking.
2. **Python translator tests completely disabled** (`if: false`, ci.yml line 242) — zero Python
   coverage enforcement in CI.
3. **Gateway jest excludes routes, middleware, websocket, grpc** from `collectCoverageFrom`
   (jest.config.json) — large portions of the codebase silently uncovered.
4. **Gateway has 3 `.skip` test files** (`ZmqTranslationClient.test.ts.skip`,
   `AttachmentService.test.ts.skip`, `AuthHandler.test.ts.skip`) — tests excluded entirely.
5. **Translator `fail_under = 10`** (pyproject.toml) — floor is essentially no coverage gate.
6. **Web tests fail due to unresolved `encryption-service.js` import** from
   `packages/shared/encryption/index.ts` → 95 test suites error (Jest can't load modules that
   import this); total web coverage therefore understates actual testable coverage.
7. **Shared coverage already strong**: 95.22% line / 92.17% branch — already at target.

### Web test failure root cause
`packages/shared/encryption/index.ts` re-exports `./encryption-service.js` (compiled JS path).
When web Jest runs, the `@meeshy/shared` alias resolves to the TS source tree (not dist), so
`encryption-service.js` doesn't exist at the TS source path. Fix: ensure `packages/shared` is
built before web tests run (Sprint 0 fix or per-run pre-step).
