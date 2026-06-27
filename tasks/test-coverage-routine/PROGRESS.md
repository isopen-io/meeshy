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
| 0.5 | Stop gateway jest from silently excluding `routes/middleware/websocket/grpc` & ignoring whole test dirs; add a global threshold at baseline | `services/gateway/jest.config.json` | ☑ |
| 0.6 | Restore translator `fail_under` toward 80 on the non-excluded set; tighten over-broad `exclude_lines` (error handling/cleanup should count) | `services/translator/pyproject.toml` | ☑ |
| 0.7 | Triage & un-skip the dark `.skip` test files (or delete with justification) | `gateway: ZmqTranslationClient.test.ts.skip`, `AttachmentService.test.ts.skip`, `AuthHandler.test.ts.skip` | ☑ |

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
| P0 | **Auth** (login/register/JWT/session/2FA/magic-link/pw-reset) | ☑ | ⊘ | ☑ | ☐ | ☐ | ☑ (TS shared; MeeshySDK Swift ⊘ Linux env) |
| P0 | **Encryption & attachments** (E2EE, AES-GCM, encrypt-then-upload, audio attach) | ☑ | ⊘ | ☑ | ☐ | ☐ | ☑ (encryption-service.ts 100%/94.28%; types/encryption.ts 100%; attachment-validators.ts 100%) |
| P0 | **Prisme Linguistique** (lang resolution + translation display) | ☑ | ☑ | ☑ | ☐ | ☐ | ☑ (TS shared; MeeshySDK Swift ⊘ Linux env) |
| P0 | **Messaging core** (send/recv/edit/delete/optimistic/dedup/clientMessageId) | ☑ sub: MessageHandler.ts ☑, messages.ts ☑ (99.69%lines/93.91%branches; 167 tests) | ⊘ | ☑ | ☐ | ☐ | ☑ (client-message-id.ts 100%; MeeshySDK Swift ⊘ Linux env) |
| P1 | **Real-time** (Socket.IO presence, typing, reactions, delivery, reconnect) | ☑ sub: StatusHandler☑ ConversationHandler☑ AttachmentReactionHandler☑ LocationHandler☑ CallEventsHandler☑ MeeshySocketIOManager☑ | ⊘ | ☑ sub: notification-socketio.singleton☑ use-connection-status☑ use-socketio-messaging☑ | ☐ | ☐ | ☑ (types/status-types.ts 100%/100%; utils/errors.ts 100%/100%; utils/notification-strings.ts 100%/96.96%; MeeshySDK Swift ⊘ Linux env) |
| P1 | **Conversations & membership** (create/join/leave/participants/settings) | ☑ sub: leave.ts☑ ban.ts☑ delete-for-me.ts☑ stats.ts☑ ConversationStatsService.ts☑ ConversationMessageStatsService.ts☑ conversation-id-cache.ts☑ identifier-generator.ts☑ access-control.ts☑ participants.ts☑ search.ts☑ threads.ts☑ index.ts☑ sharing.ts☑ core.ts☑ messages-advanced.ts☑ | ⊘ | ☑ sub: transformers.service.ts☑ crud.service.ts☑ links.service.ts☑ link-conversation.service.ts☑ | ☐ | ☐ | ☑ (types/conversation.ts 100%/100%; MeeshySDK Swift ⊘ Linux env) |
| P1 | **Offline & sync** (outbox, failed-messages queue, reconnect flush) | ☑ sub: RedisDeliveryQueue.ts☑ delivery-queue-cleanup.ts☑ MessageReadStatusService.ts☑ MutationLogService.ts☑ withMutationLog.ts☑ | ⊘ | ☑ sub: use-auto-retry-failed-messages.ts☑ use-messaging.ts☑ messages.service.ts☑ | ☐ | ☐ | ☑ sub: types/delivery-queue.ts☑(100%/100%) utils/call-summary.ts☑(100%/98.78%) utils/languages.ts☑(100%/96.15%+100% funcs) |
| P1 | **ZMQ infra** (worker pool, connection mgr, multipart frames, dedup) | ☑ sub: ZmqMessageHandler.ts☑ ZmqRequestSender.ts☑ zmq-helpers.ts☑ ZmqTranslationClient.ts☑ ZmqConnectionManager.ts☑ | ☑ sub: zmq_models.py☑ zmq_pool/worker_pool.py☑ zmq_voice_handler.py☑ zmq_pool/connection_manager.py☑ zmq_pool/translation_processor.py☑ zmq_pool/zmq_pool_manager.py☑ | ⊘ | ⊘ | ⊘ | ⊘ |
| P1 | **Voice/audio** (transcription, TTS, voice profiles, voice translation) | ☑ sub: VoiceAnalysisService.ts☑ routes/voice-analysis.ts☑ (VoiceProfileService.ts bonus gap-fill: branches 68.48%→84.84%) | ☑ sub: pipeline_cache.py☑(100%) smart_segment_merger.py☑(96%) segment_splitter.py☑(100%) audio_utils.py☑(100%) transcribe_gap_filler.py☑(96%) diarization_service.py☑(99% pure logic; GPU/pyannote methods pragma'd) | ☑ sub: audio-formatters.ts☑ audio-effect-presets.ts☑ voice-profile-utils.ts☑ use-voice-analysis.ts☑ use-voice-settings.ts☑ use-voice-profile-management.ts☑ use-audio-translation.ts☑ (PR #721 merged 2026-06-19) | ☐ | ☐ | ☑ sub: attachment-audio.ts☑(98.29%lines/97.14%branches) audio-transcription.ts☑(100%/100%) audio-effects-timeline.ts☑(100%/100%) attachment-transcription.ts☑(100%/100%) translated-audio.ts☑(100%/100%); 102 tests; MeeshySDK Swift ⊘ Linux env |
| P2 | **Notifications** (push, in-app, Firebase/APNs, delivery queue) | ☑ sub: NotificationFormatter.ts☑ SocketNotificationService.ts☑ notification-schemas.ts☑ routes/notifications.ts☑ routes/push-tokens.ts☑ | ⊘ | ☑ sub: notification-translations.ts☑ notification-sound.ts☑ use-tab-notification.ts☑ use-notifications-v2.ts☑ | ☐ | ☐ | ☑ sub: types/notification.ts☑(100%lines/100%branches) types/preferences/notification.ts☑(100%lines/100%branches); 91 tests; push-notification.ts ⊘ (interfaces only, no runtime) |
| P2 | **Feed / posts / stories / reactions** | ☑ sub: PostAudioService.ts☑ PostTranslationService.ts☑ StoryTextObjectTranslationService.ts☑ postReplySnapshot.ts☑ postVisibility.ts☑ reelAffinity.ts☑ reactionNotify.ts☑ | ⊘ | ☑ sub: posts.service.ts☑ story.service.ts☑ use-feed-query.ts☑ use-feed-variants.ts☑ use-post-translation.ts☑ use-post-mutations.ts☑ use-post-socket-cache-sync.ts☑ use-reactions-query.ts☑ use-stories.ts☑ use-stories-realtime.ts☑ use-feed-realtime.ts☑ lib/story-transforms.ts☑ | ☐ | ☐ | ☑ sub: types/reaction.ts☑(100%lines/100%branches) types/post.ts☑(type-only, 0 executable lines — smoke test); 32 tests |
| P2 | **Calls** (WebRTC, call lifecycle, ICE restart) | ☑ sub: call-schemas.ts☑ CallService.ts☑ CallCleanupService.ts☑ routes/calls.ts☑ | ⊘ | ☑ sub: adaptive-degradation.ts☑(100%/96%) call-store.ts☑(100%/100%) use-call-quality.ts☑(100%/100%) use-video-call.ts☑(100%/97%) use-call-banner.ts☑(100%/100%) webrtc-service.ts☑(99.35%/98.80%) | ☐ | ⊘ | ⊘ |
| P2 | **Rate limiting** (message/api/socket limits, Redis fallback) | ☑ sub: rate-limiter.ts (auth factories)☑ socket-rate-limiter.ts☑ message-limits.ts☑ middleware/rate-limit.ts☑ middleware/rate-limiter.ts☑ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ |
| P2 | **Admin & moderation** | ☑ sub: services/admin/*☑ middleware/admin-user-auth☑ validation/admin-schemas☑ routes/admin/{analytics☑ anonymous-users☑ broadcasts☑ dashboard☑ index☑ invitations☑ messages☑ posts☑ reports☑ roles☑ system-rankings☑ users☑ agent-topics☑(95%lines/93.47%branches) languages☑(100%lines/96.15%branches) agent☑(100%lines/93.09%branches) content☑(100%lines/100%branches)} | ⊘ | ☑ (PR #974 open — ⚠ blocked on pre-existing gateway CI failure in AuthHandler.manual-auth.test.ts; unrelated to this PR's web-test diff; will merge once main is green) sub: use-admin-settings.ts☑(100%/100%) use-settings-save.ts☑(100%/100%) use-settings-validation.ts☑(100%/100%)+TDZ-bugfix admin.service.ts☑(100%/100%) config-form-merge.ts☑(100%/100%) ranking/utils.tsx☑(100%/100%) settings/SettingField.tsx☑(100%/100%) settings/SettingsStats.tsx☑(100%/100%) settings/SettingsHeader.tsx☑(100%/100%) ConfirmDialog.tsx☑(100%/100%) settings/SettingsAlerts.tsx☑(100%/100%) settings/{General,Database,Security,RateLimiting,Messages,Uploads,Server,Features}SettingsSection.tsx☑(100%/100%) Charts.tsx☑ TableSkeleton.tsx☑ InfoIcon.tsx☑ ranking/{RankingFilters,RankingTable,RankingPodium,UserRankCard,ConversationRankCard,MessageRankCard,LinkRankCard,constants}☑ ranking/RankingStatsImpl.tsx☑(100%/100%) ranking/index.ts☑(100%/100%) settings/index.ts☑(100%/100%) hooks/admin/index.ts☑(100%/100%) use-agent-admin-events.ts☑(100%/100%) agent/{AgentHistoryTab☑ AgentTopicRegexTester☑ ScanLogDetail☑ ScanLogTable☑ UserDisplay☑ UserPicker☑}(100%/100%) agent/{AgentArchetypesTab☑ AgentMessagesModal☑ AgentRolesSection☑ AgentTopicsTab☑ DeliveryQueueItemCard☑ DeliveryQueuePanel☑ ScanHistoryChart☑}(93%branch/100%lines) user-detail/{UserActivitySection☑ UserContactInfoSection☑ UserConversationsSection☑ UserGeolocationSection☑ UserLanguageSection☑ UserMediaSection☑ UserPersonalInfoSection☑ UserPostsSection☑ UserReportedMessagesSection☑ UserReportsSection☑ UserSecuritySection☑}(≥93%branch/≥97%lines) agent/{AgentConfigDialog☑(98%branch/100%lines) AgentLiveTab☑(92.68%branch/100%lines) AgentConversationsTab☑(100%branch) AgentGlobalConfigTab☑(100%branch) AgentLlmTab☑(100%branch) AgentOverviewTab☑(100%branch) ScanControlPanel☑(100%branch) TriggerSchedulingModal☑(92.85%branch) AgentScheduleTimeline☑(92.53%branch) AgentTopicEditModal☑(96.87%branch) ConversationPicker☑(100%branch)} AdminLayout.tsx☑(98.59%lines/98.79%branches) ChartsImpl.tsx☑(100%/100%) app/admin/debug.tsx☑(100%lines/92%branches) | ⊘ | ⊘ | ⊘ |
| P2 | **Theme/accent color** (ColorGeneration algorithm) | ⊘ | ⊘ | ☑ sub: use-resolved-theme.ts☑(100%/100%) tag-colors.ts☑(100%/100%) date-format.ts☑(100%/100%) | ☐ | ☐ | ☐ |
| P2 | **Video/story export** (composition, export pipeline) | ⊘ | ⊘ | ☑ sub: components/video/{CompactVideoPlayer☑ VideoControls☑ VideoLightbox☑ VideoPlayer☑ VolumeControl☑ index☑} hooks/use-video-playback☑ | ☐ | ☐ | ☐ |

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
- **gateway:** `src/services/RedisDeliveryQueue.ts` (delivery queue for offline users), `src/jobs/delivery-queue-cleanup.ts` (cleanup job), `src/services/MessageReadStatusService.ts` (read/received status synced on reconnect), `src/services/MutationLogService.ts` (idempotency/dedup), `src/utils/withMutationLog.ts` (idempotent mutation helper)
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
| web | `pnpm --filter web test:coverage` | 42.97 | 35.17 | 2026-06-22 (post P2 Theme/accent color × web; +1 test for use-resolved-theme dark→light transition; date-format+tag-colors already at 100%; stmts:42.21/branch:35.17/funcs:39.16/lines:42.97; threshold floor unchanged lines:42/branches:34/statements:41/functions:38 — new measurements already above floor) |
| gateway | `pnpm --filter gateway test:coverage` | 72.16 (local) / ~67.5 (CI est.) | 67.51 (local) / ~63 (CI est.) | 2026-06-27 (post P2 Admin × gateway content.ts ☑ — content.ts 100%lines/100%branches, 53 tests; local stmts=72%/branches=67.51%/funcs=72.43%/lines=72.16%; threshold floor ratcheted lines:65→67/branches:61→63/statements:65→67/functions:65→67; CI bun gap ~4-5pp) |
| translator | `.venv/bin/python -m pytest tests/ -m "not slow and not gpu" --cov=src` | ~39 | n/a | 2026-06-19 (post P1 Voice/audio × translator; +127 tests covering 6 modules; fail_under ratcheted 37→39; diarization GPU methods pragma'd) |
| iOS | `./apps/ios/meeshy.sh test` | n/a | n/a | not measurable (no macOS/Xcode in CI env) |
| android | `apps/android/meeshy.sh test` | n/a | n/a | not measurable (no Android SDK in CI env) |
| shared | `pnpm --filter @meeshy/shared test:coverage` | 99.70 | 96.87 | 2026-06-27 (post P2 Feed/posts/stories × shared; +32 tests, 949 total; types/reaction.ts☑(100%/100%) types/post.ts☑(type-only); threshold floor unchanged lines:99/branches:96/functions:93/statements:99 — new measurements already above floor) |

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
