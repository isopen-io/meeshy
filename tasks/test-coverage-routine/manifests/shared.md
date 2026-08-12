# Coverage Manifest — Shared package (TS)

> Exhaustive list of **every** source file, grouped by feature/domain. `[~]` = a same-named test exists today (heuristic — may be shallow); `[ ]` = no obvious test. The routine must bring each to **92% line+branch** and flip to `[x]` once reviewer-approved.

- Source files: **78**
- With a same-named test today (heuristic): **18** (23%)
- Needing tests / verification: **60**

Heuristic note: a `[~]` only means a similarly-named test file exists — it does NOT mean 92% coverage. Every file, `[~]` included, must be verified to 92%.

## (root)  (0/2 have a test)

- [ ] `packages/shared/seed.ts`
- [ ] `packages/shared/vitest.config.ts`

## agent  (0/1 have a test)

- [ ] `packages/shared/agent/archetypes.ts`

## encryption  (3/4 have a test)

- [~] `packages/shared/encryption/crypto-adapter.ts`
- [~] `packages/shared/encryption/encryption-service.ts`
- [~] `packages/shared/encryption/encryption-utils.ts`
- [ ] `packages/shared/encryption/index.ts`

## encryption/signal  (0/3 have a test)

- [ ] `packages/shared/encryption/signal/index.ts`
- [ ] `packages/shared/encryption/signal/signal-store-interface.ts`
- [ ] `packages/shared/encryption/signal/signal-types.ts`

## prisma/migrations  (0/1 have a test)

- [ ] `packages/shared/prisma/migrations/migrate-user-roles.ts`

## types  (5/45 have a test)

- [ ] `packages/shared/types/action-types.ts`
- [ ] `packages/shared/types/admin.ts`
- [ ] `packages/shared/types/affiliate.ts`
- [ ] `packages/shared/types/agent.ts`
- [ ] `packages/shared/types/anonymous.ts`
- [ ] `packages/shared/types/api-responses.ts`
- [~] `packages/shared/types/api-schemas.ts`
- [x] `packages/shared/types/attachment-audio.ts`
- [x] `packages/shared/types/attachment-transcription.ts`
- [x] `packages/shared/types/attachment.ts`
- [x] `packages/shared/types/audio-effects-timeline.ts`
- [x] `packages/shared/types/audio-transcription.ts`
- [ ] `packages/shared/types/community.ts`
- [x] `packages/shared/types/conversation.ts`
- [x] `packages/shared/types/delivery-queue.ts`
- [ ] `packages/shared/types/dma.ts`
- [ ] `packages/shared/types/encryption.ts`
- [~] `packages/shared/types/errors.ts`
- [ ] `packages/shared/types/index.ts`
- [ ] `packages/shared/types/magic-link.ts`
- [ ] `packages/shared/types/mention.ts`
- [ ] `packages/shared/types/message-deletion.ts`
- [ ] `packages/shared/types/message-effect-flags.ts`
- [ ] `packages/shared/types/message-types.ts`
- [ ] `packages/shared/types/messages.ts`
- [ ] `packages/shared/types/messaging.ts`
- [ ] `packages/shared/types/migration-utils.ts`
- [x] `packages/shared/types/notification.ts`
- [~] `packages/shared/types/participant.ts`
- [x] `packages/shared/types/post.ts`
- [ ] `packages/shared/types/push-notification.ts`
- [x] `packages/shared/types/reaction.ts`
- [ ] `packages/shared/types/report.ts`
- [x] `packages/shared/types/role-types.ts`
- [ ] `packages/shared/types/security.ts`
- [ ] `packages/shared/types/signal-database.ts`
- [~] `packages/shared/types/socketio-events.ts`
- [x] `packages/shared/types/status-types.ts`
- [ ] `packages/shared/types/tracking-link.ts`
- [x] `packages/shared/types/translated-audio.ts`
- [ ] `packages/shared/types/user-preferences.ts`
- [ ] `packages/shared/types/user.ts`
- [~] `packages/shared/types/validation.ts`
- [ ] `packages/shared/types/video-call.ts`
- [ ] `packages/shared/types/voice-api.ts`

## types/preferences  (0/8 have a test)

- [x] `packages/shared/types/preferences/application.ts`
- [x] `packages/shared/types/preferences/audio.ts`
- [x] `packages/shared/types/preferences/document.ts`
- [ ] `packages/shared/types/preferences/index.ts`
- [x] `packages/shared/types/preferences/message.ts`
- [x] `packages/shared/types/preferences/notification.ts`
- [x] `packages/shared/types/preferences/privacy.ts`
- [x] `packages/shared/types/preferences/video.ts`

## types/validation  (0/2 have a test)

- [ ] `packages/shared/types/validation/admin-user.ts`
- [ ] `packages/shared/types/validation/index.ts`

## utils  (11/13 have a test)

- [x] `packages/shared/utils/attachment-validators.ts`
- [x] `packages/shared/utils/call-summary.ts`
- [x] `packages/shared/utils/client-message-id.ts`
- [x] `packages/shared/utils/conversation-helpers.ts`
- [~] `packages/shared/utils/email-validator.ts`
- [x] `packages/shared/utils/errors.ts`
- [ ] `packages/shared/utils/index.ts`
- [~] `packages/shared/utils/language-normalize.ts`
- [x] `packages/shared/utils/languages.ts`
- [~] `packages/shared/utils/mention-parser.ts`
- [x] `packages/shared/utils/notification-strings.ts`
- [x] `packages/shared/utils/sender-identity.ts`
- [~] `packages/shared/utils/validation.ts`
