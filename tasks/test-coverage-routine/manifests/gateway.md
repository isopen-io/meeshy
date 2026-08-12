# Coverage Manifest — Gateway (Fastify)

> Exhaustive list of **every** source file, grouped by feature/domain. `[~]` = a same-named test exists today (heuristic — may be shallow); `[ ]` = no obvious test. The routine must bring each to **92% line+branch** and flip to `[x]` once reviewer-approved.

- Source files: **316**
- With a same-named test today (heuristic): **88** (28%)
- Needing tests / verification: **228**

Heuristic note: a `[~]` only means a similarly-named test file exists — it does NOT mean 92% coverage. Every file, `[~]` included, must be verified to 92%.

## (root)  (0/2 have a test)

- [ ] `services/gateway/src/env.ts`
- [ ] `services/gateway/src/server.ts`

## adapters  (1/2 have a test)

- [~] `services/gateway/src/adapters/node-crypto-adapter.ts`
- [ ] `services/gateway/src/adapters/node-signal-stores.ts`

## config  (0/2 have a test)

- [x] `services/gateway/src/config/message-limits.ts`
- [x] `services/gateway/src/config/user-preferences-defaults.ts`

## dma-interoperability/adapters  (0/1 have a test)

- [ ] `services/gateway/src/dma-interoperability/adapters/LibraryAdapters.ts`

## dma-interoperability/signal-protocol  (3/5 have a test)

- [~] `services/gateway/src/dma-interoperability/signal-protocol/DoubleRatchet.ts`
- [~] `services/gateway/src/dma-interoperability/signal-protocol/SignalKeyManager.ts`
- [ ] `services/gateway/src/dma-interoperability/signal-protocol/SignalProtocolEngine.ts`
- [~] `services/gateway/src/dma-interoperability/signal-protocol/X3DHKeyAgreement.ts`
- [ ] `services/gateway/src/dma-interoperability/signal-protocol/adapters/SignalProtocolAdapter.ts`

## errors  (0/1 have a test)

- [x] `services/gateway/src/errors/custom-errors.ts`

## jobs  (1/7 have a test)

- [ ] `services/gateway/src/jobs/broadcast-sender.ts`
- [x] `services/gateway/src/jobs/cleanup-expired-tokens.ts`
- [x] `services/gateway/src/jobs/delivery-queue-cleanup.ts`
- [x] `services/gateway/src/jobs/index.ts`
- [x] `services/gateway/src/jobs/mutation-log-cleanup.ts`
- [~] `services/gateway/src/jobs/notification-digest.ts`
- [x] `services/gateway/src/jobs/unlock-accounts.ts`

## middleware  (3/9 have a test)

- [x] `services/gateway/src/middleware/admin-permissions.middleware.ts`
- [x] `services/gateway/src/middleware/admin-user-auth.middleware.ts`
- [~] `services/gateway/src/middleware/auth.ts`
- [x] `services/gateway/src/middleware/clientMutationId.ts`
- [x] `services/gateway/src/middleware/deviceLocale.ts`
- [x] `services/gateway/src/middleware/rate-limit.ts`
- [x] `services/gateway/src/middleware/rate-limiter.ts`
- [x] `services/gateway/src/middleware/request-id.ts`
- [x] `services/gateway/src/middleware/validation.ts`

## migrations  (0/1 have a test)

- [ ] `services/gateway/src/migrations/migrate-from-legacy.ts`

## routes  (2/30 have a test)

- [ ] `services/gateway/src/routes/affiliate.ts`
- [ ] `services/gateway/src/routes/anonymous.ts`
- [ ] `services/gateway/src/routes/attachments.ts`
- [x] `services/gateway/src/routes/calls.ts`
- [x] `services/gateway/src/routes/communities.ts`
- [x] `services/gateway/src/routes/community-preferences.ts`
- [x] `services/gateway/src/routes/conversation-encryption.ts`
- [x] `services/gateway/src/routes/conversation-preferences.ts`
- [x] `services/gateway/src/routes/friends.ts`
- [x] `services/gateway/src/routes/invitations.ts`
- [x] `services/gateway/src/routes/magic-link.ts`
- [x] `services/gateway/src/routes/maintenance.ts`
- [x] `services/gateway/src/routes/mentions.ts`
- [x] `services/gateway/src/routes/message-read-status.ts`
- [ ] `services/gateway/src/routes/messages.ts`
- [x] `services/gateway/src/routes/notifications.ts`
- [ ] `services/gateway/src/routes/password-reset.ts`
- [x] `services/gateway/src/routes/push-tokens.ts`
- [x] `services/gateway/src/routes/reactions.ts`
- [x] `services/gateway/src/routes/signal-protocol.ts`
- [x] `services/gateway/src/routes/translation-jobs.ts`
- [ ] `services/gateway/src/routes/translation-non-blocking.ts`
- [ ] `services/gateway/src/routes/translation.ts`
- [x] `services/gateway/src/routes/two-factor.ts`
- [ ] `services/gateway/src/routes/user-deletions.ts`
- [x] `services/gateway/src/routes/user-stats.ts`
- [ ] `services/gateway/src/routes/users.ts`
- [x] `services/gateway/src/routes/voice-analysis.ts`
- [ ] `services/gateway/src/routes/voice-profile.ts`
- [ ] `services/gateway/src/routes/voice.ts`

## routes/admin  (14/19 have a test)

- [x] `services/gateway/src/routes/admin/agent-topics.ts`
- [x] `services/gateway/src/routes/admin/agent.ts`
- [x] `services/gateway/src/routes/admin/analytics.ts`
- [x] `services/gateway/src/routes/admin/anonymous-users.ts`
- [x] `services/gateway/src/routes/admin/broadcasts.ts`
- [x] `services/gateway/src/routes/admin/content.ts`
- [x] `services/gateway/src/routes/admin/dashboard.ts`
- [x] `services/gateway/src/routes/admin/index.ts`
- [x] `services/gateway/src/routes/admin/invitations.ts`
- [x] `services/gateway/src/routes/admin/languages.ts`
- [x] `services/gateway/src/routes/admin/messages.ts`
- [x] `services/gateway/src/routes/admin/posts.ts`
- [x] `services/gateway/src/routes/admin/reports.ts`
- [x] `services/gateway/src/routes/admin/roles.ts`
- [x] `services/gateway/src/routes/admin/services/PermissionsService.ts`
- [x] `services/gateway/src/routes/admin/system-rankings.ts`
- [ ] `services/gateway/src/routes/admin/system.ts`
- [x] `services/gateway/src/routes/admin/types.ts`
- [x] `services/gateway/src/routes/admin/users.ts`

## routes/attachments  (0/6 have a test)

- [ ] `services/gateway/src/routes/attachments/download.ts`
- [ ] `services/gateway/src/routes/attachments/index.ts`
- [ ] `services/gateway/src/routes/attachments/metadata.ts`
- [ ] `services/gateway/src/routes/attachments/translation.ts`
- [ ] `services/gateway/src/routes/attachments/types.ts`
- [x] `services/gateway/src/routes/attachments/upload.ts`

## routes/auth  (2/7 have a test)

- [ ] `services/gateway/src/routes/auth/index.ts`
- [x] `services/gateway/src/routes/auth/login.ts`
- [ ] `services/gateway/src/routes/auth/magic-link.ts`
- [ ] `services/gateway/src/routes/auth/phone-transfer.ts`
- [x] `services/gateway/src/routes/auth/register.ts`
- [ ] `services/gateway/src/routes/auth/revoke-all-sessions.ts`
- [x] `services/gateway/src/routes/auth/types.ts`

## routes/communities  (6/6 have a test)

- [x] `services/gateway/src/routes/communities/core.ts`
- [x] `services/gateway/src/routes/communities/index.ts`
- [x] `services/gateway/src/routes/communities/members.ts`
- [x] `services/gateway/src/routes/communities/search.ts`
- [x] `services/gateway/src/routes/communities/settings.ts`
- [x] `services/gateway/src/routes/communities/types.ts`

## routes/conversations  (2/15 have a test)

- [x] `services/gateway/src/routes/conversations/ban.ts`
- [x] `services/gateway/src/routes/conversations/core.ts`
- [x] `services/gateway/src/routes/conversations/delete-for-me.ts`
- [x] `services/gateway/src/routes/conversations/index.ts`
- [x] `services/gateway/src/routes/conversations/leave.ts`
- [x] `services/gateway/src/routes/conversations/messages-advanced.ts`
- [ ] `services/gateway/src/routes/conversations/messages.ts`
- [x] `services/gateway/src/routes/conversations/participants.ts`
- [x] `services/gateway/src/routes/conversations/search.ts`
- [x] `services/gateway/src/routes/conversations/sharing.ts`
- [x] `services/gateway/src/routes/conversations/stats.ts`
- [x] `services/gateway/src/routes/conversations/threads.ts`
- [ ] `services/gateway/src/routes/conversations/types.ts`
- [x] `services/gateway/src/routes/conversations/utils/access-control.ts`
- [x] `services/gateway/src/routes/conversations/utils/identifier-generator.ts`

## routes/links  (0/13 have a test)

- [ ] `services/gateway/src/routes/links/admin.ts`
- [ ] `services/gateway/src/routes/links/creation.ts`
- [ ] `services/gateway/src/routes/links/index.ts`
- [ ] `services/gateway/src/routes/links/management.ts`
- [ ] `services/gateway/src/routes/links/messages-retrieval.ts`
- [ ] `services/gateway/src/routes/links/messages.ts`
- [ ] `services/gateway/src/routes/links/retrieval.ts`
- [ ] `services/gateway/src/routes/links/types.ts`
- [ ] `services/gateway/src/routes/links/user.ts`
- [ ] `services/gateway/src/routes/links/utils/link-helpers.ts`
- [ ] `services/gateway/src/routes/links/utils/message-formatters.ts`
- [ ] `services/gateway/src/routes/links/utils/prisma-queries.ts`
- [ ] `services/gateway/src/routes/links/validation.ts`

## routes/me  (0/7 have a test)

- [ ] `services/gateway/src/routes/me/delete-account.ts`
- [ ] `services/gateway/src/routes/me/export.ts`
- [ ] `services/gateway/src/routes/me/index.ts`
- [ ] `services/gateway/src/routes/me/preferences/categories.ts`
- [ ] `services/gateway/src/routes/me/preferences/index.ts`
- [ ] `services/gateway/src/routes/me/preferences/preference-router-factory.ts`
- [ ] `services/gateway/src/routes/me/preferences/types.ts`

## routes/posts  (7/7 have a test)

- [x] `services/gateway/src/routes/posts/audio.ts`
- [x] `services/gateway/src/routes/posts/comments.ts`
- [x] `services/gateway/src/routes/posts/core.ts`
- [x] `services/gateway/src/routes/posts/feed.ts`
- [x] `services/gateway/src/routes/posts/index.ts`
- [x] `services/gateway/src/routes/posts/interactions.ts`
- [x] `services/gateway/src/routes/posts/types.ts`

## routes/tracking-links  (0/4 have a test)

- [ ] `services/gateway/src/routes/tracking-links/creation.ts`
- [ ] `services/gateway/src/routes/tracking-links/index.ts`
- [ ] `services/gateway/src/routes/tracking-links/tracking.ts`
- [ ] `services/gateway/src/routes/tracking-links/types.ts`

## routes/uploads  (0/1 have a test)

- [ ] `services/gateway/src/routes/uploads/tus-handler.ts`

## routes/users  (7/8 have a test)

- [x] `services/gateway/src/routes/users/blocking.ts`
- [x] `services/gateway/src/routes/users/contact-change.ts`
- [x] `services/gateway/src/routes/users/devices.ts`
- [x] `services/gateway/src/routes/users/index.ts`
- [x] `services/gateway/src/routes/users/preferences.ts`
- [x] `services/gateway/src/routes/users/presence.ts`
- [x] `services/gateway/src/routes/users/profile.ts`
- [ ] `services/gateway/src/routes/users/types.ts`

## routes/voice  (0/4 have a test)

- [ ] `services/gateway/src/routes/voice/analysis.ts`
- [ ] `services/gateway/src/routes/voice/index.ts`
- [ ] `services/gateway/src/routes/voice/translation.ts`
- [ ] `services/gateway/src/routes/voice/types.ts`

## services  (33/54 have a test)

- [ ] `services/gateway/src/services/AffiliateTrackingService.ts`
- [ ] `services/gateway/src/services/AgentHttpClient.ts`
- [ ] `services/gateway/src/services/AttachmentEncryptionService.ts`
- [~] `services/gateway/src/services/AttachmentReactionService.ts`
- [~] `services/gateway/src/services/AttachmentTranslateService.ts`
- [~] `services/gateway/src/services/AudioTranslateService.ts`
- [~] `services/gateway/src/services/AuthService.ts`
- [ ] `services/gateway/src/services/AuthTestService.ts`
- [~] `services/gateway/src/services/CacheStore.ts`
- [ ] `services/gateway/src/services/CallCleanupService.ts`
- [~] `services/gateway/src/services/CallService.ts`
- [x] `services/gateway/src/services/CaptchaService.ts`
- [~] `services/gateway/src/services/CommentReactionService.ts`
- [ ] `services/gateway/src/services/ConsentValidationService.ts`
- [x] `services/gateway/src/services/ConversationMessageStatsService.ts`
- [x] `services/gateway/src/services/ConversationStatsService.ts`
- [~] `services/gateway/src/services/EmailService.ts`
- [~] `services/gateway/src/services/EncryptionService.ts`
- [~] `services/gateway/src/services/ExpiredStoriesCleanupService.ts`
- [~] `services/gateway/src/services/GeoIPService.ts`
- [ ] `services/gateway/src/services/InitService.ts`
- [~] `services/gateway/src/services/MagicLinkService.ts`
- [~] `services/gateway/src/services/MaintenanceService.ts`
- [~] `services/gateway/src/services/MediaService.ts`
- [~] `services/gateway/src/services/MentionService.ts`
- [x] `services/gateway/src/services/MessageReadStatusService.ts`
- [~] `services/gateway/src/services/MessagingService.ts`
- [x] `services/gateway/src/services/MultiLevelCache.ts`
- [x] `services/gateway/src/services/MultiLevelJobMappingCache.ts`
- [x] `services/gateway/src/services/MutationLogService.ts`
- [~] `services/gateway/src/services/PasswordResetService.ts`
- [ ] `services/gateway/src/services/PhonePasswordResetService.ts`
- [ ] `services/gateway/src/services/PhoneTransferService.ts`
- [~] `services/gateway/src/services/PostCommentService.ts`
- [~] `services/gateway/src/services/PostFeedService.ts`
- [~] `services/gateway/src/services/PostReactionService.ts`
- [~] `services/gateway/src/services/PostService.ts`
- [ ] `services/gateway/src/services/PrivacyPreferencesService.ts`
- [x] `services/gateway/src/services/PushNotificationService.ts`
- [~] `services/gateway/src/services/ReactionService.ts`
- [x] `services/gateway/src/services/RedisDeliveryQueue.ts`
- [ ] `services/gateway/src/services/SecurityMonitor.ts`
- [~] `services/gateway/src/services/SessionService.ts`
- [~] `services/gateway/src/services/SmsService.ts`
- [~] `services/gateway/src/services/StatusService.ts`
- [x] `services/gateway/src/services/TURNCredentialService.ts`
- [ ] `services/gateway/src/services/TrackingLinkService.ts`
- [~] `services/gateway/src/services/TranslationCache.ts`
- [ ] `services/gateway/src/services/TusCleanupService.ts`
- [ ] `services/gateway/src/services/TwoFactorService.ts`
- [ ] `services/gateway/src/services/VoiceAnalysisService.ts`
- [~] `services/gateway/src/services/VoiceProfileService.ts`
- [ ] `services/gateway/src/services/ZmqSingleton.ts`
- [~] `services/gateway/src/services/ZmqTranslationClient.ts`

## services/admin  (0/6 have a test)

- [x] `services/gateway/src/services/admin/broadcast-translation.service.ts`
- [x] `services/gateway/src/services/admin/permissions.service.ts`
- [x] `services/gateway/src/services/admin/report.service.ts`
- [x] `services/gateway/src/services/admin/user-audit.service.ts`
- [x] `services/gateway/src/services/admin/user-management.service.ts`
- [x] `services/gateway/src/services/admin/user-sanitization.service.ts`

## services/attachments  (6/8 have a test)

- [~] `services/gateway/src/services/attachments/AttachmentService.ts`
- [~] `services/gateway/src/services/attachments/MetadataManager.ts`
- [ ] `services/gateway/src/services/attachments/ThumbHashGenerator.ts`
- [~] `services/gateway/src/services/attachments/UploadProcessor.ts`
- [~] `services/gateway/src/services/attachments/attachmentIncludes.ts`
- [ ] `services/gateway/src/services/attachments/index.ts`
- [~] `services/gateway/src/services/attachments/thumbnail.ts`
- [~] `services/gateway/src/services/attachments/video-transcode-plan.ts`

## services/image  (0/1 have a test)

- [ ] `services/gateway/src/services/image/ImageProcessingService.ts`

## services/message-translation  (5/6 have a test)

- [~] `services/gateway/src/services/message-translation/EncryptionHelper.ts`
- [~] `services/gateway/src/services/message-translation/LanguageCache.ts`
- [~] `services/gateway/src/services/message-translation/MessageTranslationService.ts`
- [~] `services/gateway/src/services/message-translation/TranslationCache.ts`
- [~] `services/gateway/src/services/message-translation/TranslationStats.ts`
- [ ] `services/gateway/src/services/message-translation/index.ts`

## services/messaging  (1/4 have a test)

- [ ] `services/gateway/src/services/messaging/MessageProcessor.ts`
- [ ] `services/gateway/src/services/messaging/MessageValidator.ts`
- [~] `services/gateway/src/services/messaging/MessagingService.ts`
- [ ] `services/gateway/src/services/messaging/index.ts`

## services/notifications  (4/6 have a test)

- [ ] `services/gateway/src/services/notifications/FirebaseNotificationService.ts`
- [x] `services/gateway/src/services/notifications/NotificationFormatter.ts`
- [~] `services/gateway/src/services/notifications/NotificationService.ts`
- [x] `services/gateway/src/services/notifications/SocketNotificationService.ts`
- [ ] `services/gateway/src/services/notifications/index.ts`
- [ ] `services/gateway/src/services/notifications/types.ts`
- [x] `services/gateway/src/services/notifications/reactionNotify.ts`

## services/posts  (6/7 have a test)

- [x] `services/gateway/src/services/posts/PostAudioService.ts`
- [x] `services/gateway/src/services/posts/PostTranslationService.ts`
- [x] `services/gateway/src/services/posts/StoryTextObjectTranslationService.ts`
- [~] `services/gateway/src/services/posts/postIncludes.ts`
- [x] `services/gateway/src/services/posts/postVisibility.ts`
- [x] `services/gateway/src/services/posts/postReplySnapshot.ts`
- [x] `services/gateway/src/services/posts/reelAffinity.ts`

## services/preferences  (1/2 have a test)

- [~] `services/gateway/src/services/preferences/PreferencesService.ts`
- [ ] `services/gateway/src/services/preferences/index.ts`

## services/storage  (0/2 have a test)

- [ ] `services/gateway/src/services/storage/MediaStorage.ts`
- [ ] `services/gateway/src/services/storage/OrphanMediaCleanupService.ts`

## services/zmq-agent  (0/1 have a test)

- [ ] `services/gateway/src/services/zmq-agent/ZmqAgentClient.ts`

## services/zmq-translation  (7/7 have a test)

- [x] `services/gateway/src/services/zmq-translation/ZmqConnectionManager.ts`
- [x] `services/gateway/src/services/zmq-translation/ZmqMessageHandler.ts`
- [x] `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts`
- [x] `services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts`
- [x] `services/gateway/src/services/zmq-translation/index.ts`
- [x] `services/gateway/src/services/zmq-translation/types.ts`
- [x] `services/gateway/src/services/zmq-translation/utils/zmq-helpers.ts`

## socketio  (3/6 have a test)

- [~] `services/gateway/src/socketio/AgentAdminRelay.ts`
- [x] `services/gateway/src/socketio/CallEventsHandler.ts`
- [ ] `services/gateway/src/socketio/MeeshySocketIOHandler.ts`
- [x] `services/gateway/src/socketio/MeeshySocketIOManager.ts`
- [~] `services/gateway/src/socketio/emitAttachmentUpdated.ts`
- [~] `services/gateway/src/socketio/serializeAttachmentForSocket.ts`

## socketio/handlers  (6/12 have a test)

- [~] `services/gateway/src/socketio/handlers/AdminAgentHandler.ts`
- [x] `services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts`
- [~] `services/gateway/src/socketio/handlers/AuthHandler.ts`
- [~] `services/gateway/src/socketio/handlers/CommentReactionHandler.ts`
- [x] `services/gateway/src/socketio/handlers/ConversationHandler.ts`
- [x] `services/gateway/src/socketio/handlers/LocationHandler.ts`
- [x] `services/gateway/src/socketio/handlers/MessageHandler.ts`
- [~] `services/gateway/src/socketio/handlers/PostReactionHandler.ts`
- [ ] `services/gateway/src/socketio/handlers/ReactionHandler.ts`
- [~] `services/gateway/src/socketio/handlers/SocialEventsHandler.ts`
- [x] `services/gateway/src/socketio/handlers/StatusHandler.ts`
- [ ] `services/gateway/src/socketio/handlers/index.ts`

## socketio/utils  (2/5 have a test)

- [ ] `services/gateway/src/socketio/utils/index.ts`
- [~] `services/gateway/src/socketio/utils/message-payload-filter.ts`
- [ ] `services/gateway/src/socketio/utils/participant-resolver.ts`
- [~] `services/gateway/src/socketio/utils/resolved-languages-refresh.ts`
- [ ] `services/gateway/src/socketio/utils/socket-helpers.ts`

## types  (0/3 have a test)

- [ ] `services/gateway/src/types/fastify.d.ts`
- [ ] `services/gateway/src/types/global.d.ts`
- [ ] `services/gateway/src/types/translation.types.ts`

## utils  (13/20 have a test)

- [~] `services/gateway/src/utils/blocking.ts`
- [~] `services/gateway/src/utils/circuitBreaker.ts`
- [x] `services/gateway/src/utils/conversation-id-cache.ts`
- [~] `services/gateway/src/utils/etag.ts`
- [~] `services/gateway/src/utils/keyed-mutex.ts`
- [~] `services/gateway/src/utils/languages.ts`
- [~] `services/gateway/src/utils/logger-enhanced.ts`
- [x] `services/gateway/src/utils/logger.ts`
- [~] `services/gateway/src/utils/normalize.ts`
- [~] `services/gateway/src/utils/pagination.ts`
- [x] `services/gateway/src/utils/participant-resolver.ts`
- [x] `services/gateway/src/utils/rate-limiter.ts`
- [x] `services/gateway/src/utils/response.ts`
- [~] `services/gateway/src/utils/sanitize.ts`
- [~] `services/gateway/src/utils/session-token.ts`
- [~] `services/gateway/src/utils/socket-broadcast.ts`
- [x] `services/gateway/src/utils/socket-rate-limiter.ts`
- [x] `services/gateway/src/utils/transcription.ts`
- [~] `services/gateway/src/utils/translation-transformer.ts`
- [x] `services/gateway/src/utils/withMutationLog.ts`

## validation  (9/11 have a test)

- [x] `services/gateway/src/validation/admin-schemas.ts`
- [x] `services/gateway/src/validation/call-schemas.ts`
- [x] `services/gateway/src/validation/conversation-encryption-schemas.ts`
- [x] `services/gateway/src/validation/delete-account-schemas.ts`
- [x] `services/gateway/src/validation/helpers.ts`
- [x] `services/gateway/src/validation/mentions-schemas.ts`
- [x] `services/gateway/src/validation/message-read-status-schemas.ts`
- [x] `services/gateway/src/validation/messages-schemas.ts`
- [x] `services/gateway/src/validation/notification-schemas.ts`
- [x] `services/gateway/src/validation/socket-event-schemas.ts`
- [x] `services/gateway/src/validation/two-factor-schemas.ts`
