# Coverage Manifest — MeeshySDK (Swift)

> Exhaustive list of **every** source file, grouped by feature/domain. `[~]` = a same-named test exists today (heuristic — may be shallow); `[ ]` = no obvious test. The routine must bring each to **92% line+branch** and flip to `[x]` once reviewer-approved.

- Source files: **449**
- With a same-named test today (heuristic): **205** (46%)
- Needing tests / verification: **244**

Heuristic note: a `[~]` only means a similarly-named test file exists — it does NOT mean 92% coverage. Every file, `[~]` included, must be verified to 92%.

## MeeshySDK  (1/2 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/MeeshySDK.swift`

## MeeshySDK/Audio  (3/6 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioEditEngine.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioEditing.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioRecordingProviding.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Audio/DefaultSDKAudioRecorder.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformCache.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Audio/WaveformGenerator.swift`

## MeeshySDK/Auth  (3/5 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthService.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Auth/MeeshyUser+ProfileMutation.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Auth/SessionSnapshotStore.swift`

## MeeshySDK/Cache  (11/21 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Cache/AVAsset+NaturalDisplaySize.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Cache/AudioPlayerManager.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBackgroundFlushTask.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBox.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheFirstLoader.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheIdentifiable.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheResult.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheStoreProtocols.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Cache/DecodedImageCache.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/FriendshipCache.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Cache/LoadState.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/MediaFileSaver.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/PhotoLibraryManager.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Cache/PreferenceCacheModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Cache/ThumbnailPrefetcher.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/UserDisplayNameCache.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Cache/VideoFrameExtractor.swift`

## MeeshySDK/Configuration  (1/1 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift`

## MeeshySDK/Core  (2/2 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Core/Logging.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Core/MeeshyError.swift`

## MeeshySDK/Crypto  (1/1 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Crypto/DecryptionActor.swift`

## MeeshySDK/Diagnostics  (1/1 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Diagnostics/CryptoSignposts.swift`

## MeeshySDK/Models  (28/44 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/AffiliateModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/AgentAnalysisModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/AttachmentKind.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/AudioAvailability.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/CallSummaryMetadata.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityLinkModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationDraft.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationUserState.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/FriendModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/LanguageData.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/LocationModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/MemberRole.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/MentionCandidate.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageAttachment+VideoSizing.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageEffects.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/ParticipantModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/PreferenceModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/PresenceModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/RelativeTime.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/SampleData.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/ShareLinkModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/StatsModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryAudioAvailability.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryDrawingStroke.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryEffects+Sanitization.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/StorySlide+ExportTrigger.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/ThreadModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/TrackingLinkModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/TranscriptionModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/UserModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/UserNotificationPreferences+Filter.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/UserRelationshipState.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/UserStateMutation.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Models/VideoAvailability.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Models/VoiceProfileModels.swift`

## MeeshySDK/Networking  (9/11 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Networking/CertificatePinning.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Networking/ImageVariantSelector.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPolicyEngine.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPreferences.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkConditionMonitor.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkMonitor.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Networking/SocketConfig.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadCheckpointStore.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadManager.swift`

## MeeshySDK/Notifications  (4/6 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Notifications/MeeshyMetricsSubscriber.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationCoordinator.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushDeliveryReceiptService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Notifications/SocketNotificationEvent+Toast.swift`

## MeeshySDK/Persistence  (17/35 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/BubbleLayoutEngine.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/CacheEntry.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/CommentRecord.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCacheMetadata.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DatabaseMaintenance.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedDatabaseMigrations.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedPersistenceActor.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/GRDBModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MediaSnapshotStore.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord+ToMessage.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageState.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageStateMachine.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MigrateLegacyQueues.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueuePillProviding.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxFlusher.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxUIItem.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/PendingIdRecord.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/PostRecord.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReactionOutboxTypes.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/RetryEngine.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/SearchIndexMigrations.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/SendablePassthrough.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/SettingsActionQueue.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryOfflineQueue.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryQueueMigrator.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/TranslationCacheRecord.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/TranslationRecords.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/TusUploadCheckpoint.swift`

## MeeshySDK/Persistence/Mutations  (1/1 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Mutations/MutationPayloads.swift`

## MeeshySDK/Search  (2/2 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Search/MessageSearchService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Search/SearchIndex.swift`

## MeeshySDK/Security  (3/4 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Security/DatabaseEncryption.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainStoring.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Security/VoIPTokenStore.swift`

## MeeshySDK/Services  (30/33 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/AccountService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/AffiliateService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/BlockService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityLinkService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationAnalysisService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationDraftManager.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/DataExportService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/EdgeTranscriptionService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Services/LinkPreviewFetcher.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/LocationService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/MentionService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/MessageService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/NotificationService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/PreferenceService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/ReactionService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/ReportService.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/SessionService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/StatsService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/StatusService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/StoryService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/TrackingLinkService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/TranslationService.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Services/TwoFactorService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/UserPreferencesManager.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/UserService.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Services/VoiceProfileService.swift`

## MeeshySDK/Sockets  (0/2 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift`

## MeeshySDK/Store  (5/5 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStateOutbox.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStore.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStoreSocketBridge.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftStore.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Store/UserCategoryStore.swift`

## MeeshySDK/Story/Drawing  (6/6 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/LegacyDrawingMigration.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokePathBuilder.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeSmoothing.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeWidthDriver.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/StrokeWidthMapping.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Story/Drawing/VariableWidthStrokeBuilder.swift`

## MeeshySDK/Sync  (1/1 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`

## MeeshySDK/Theme  (2/2 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Theme/UserColorCache.swift`

## MeeshySDK/Utils  (7/7 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshySDK/Utils/BoundedFIFOMap.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMessageId.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMutationId.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Utils/CountryFlag.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Utils/MimeTypeResolver.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Utils/RelativeTimeFormatter.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Utils/ThumbHash.swift`

## MeeshySDK/Video  (2/7 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Video/VideoCompositionBuilder.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Video/VideoEditHistory.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Video/VideoEditModels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Video/VideoEditOperations.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Video/VideoEditSessionStore.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshySDK/Video/VideoExportPipeline.swift`
- [~] `packages/MeeshySDK/Sources/MeeshySDK/Video/VideoRenderGeometry.swift`

## MeeshyUI/Auth  (0/2 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyForgotPasswordView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`

## MeeshyUI/Auth/Components  (0/4 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/AuthTextField.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/CountryPicker.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/LanguageSelector.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/PasswordStrengthIndicator.swift`

## MeeshyUI/Community  (0/6 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityCreateView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityDetailView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityInviteView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityListView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityMembersView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Community/CommunitySettingsView.swift`

## MeeshyUI/Compatibility  (0/10 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveAccessibility.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveContentUnavailableView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveGlass.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveMap.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveOnChange.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptivePagingScroll.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptivePresentationStyle.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveSymbolEffects.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveVerticalPager.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/Platform.swift`

## MeeshyUI/Conversation  (1/2 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationSettingsView.swift`

## MeeshyUI/JoinFlow  (0/4 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/AnonymousJoinFormView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowSheet.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinLinkPreviewView.swift`

## MeeshyUI/Location  (0/3 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Location/LiveLocationBadge.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationFullscreenView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Location/LocationMessageView.swift`

## MeeshyUI/Media  (5/31 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/AirPlayRoutePicker.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioEditorController.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioWaveformAnalyzer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/CodeViewerView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/DocumentViewerView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditHistory.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditorModeSwitcher.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditorModel.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageEditorViewModel.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageFilterEngine.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/ImageViewerView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTranscriptionView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyAudioEditorView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyImageEditorView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoCanvasLayer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoEditorView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoSurface.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoThumbnail.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackCoordinator.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/SyntaxHighlighter.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/TranscriptionBadgeView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/UniversalAudioRecorderView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoDisplayAspectCache.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoPlaybackController.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoTransportControls.swift`

## MeeshyUI/Media/VideoEditor  (0/9 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEditor/VideoEditorCaptionsPanel.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEditor/VideoEditorFABColumn.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEditor/VideoEditorMode.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEditor/VideoEditorModeSwitcher.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEditor/VideoEditorStage.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEditor/VideoEditorTimeline.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEditor/VideoEditorToolPanels.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEditor/VideoEditorViewModel.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoEditor/VideoFilterPreviewer.swift`

## MeeshyUI/Navigation  (0/2 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Navigation/ScrollOffsetPreferenceKey.swift`

## MeeshyUI/Networking  (1/1 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshyUI/Networking/MediaDownloadPreferencesStore.swift`

## MeeshyUI/Notifications  (1/3 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationRowView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationToastView.swift`

## MeeshyUI/Primitives  (2/22 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/AchievementBadge.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/AnimatedLogoView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerField.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ChatBubble.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ErrorBannerView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/FeedbackToastView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/FloatingButtons.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/LanguagePickerSheet.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyPullIndicator.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyRefreshableScroll.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ProfileCompletionRing.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/SkeletonView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/StatsCard.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/SwipeableRow.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputField.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift`

## MeeshyUI/Profile  (0/4 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Profile/ConnectionActionView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Profile/FullscreenImageView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileSheetUser.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`

## MeeshyUI/Story  (3/38 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/AudioSpectrogramView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingEditFloatingBubbles.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingEditToolOptions.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/DrawingStrokeList.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/FontStylePicker.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/MediaPlacementSheet.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/SlideMiniPreview.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPanel.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPlayerView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasFraming.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasGuides.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+GranularSync.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+DrawingEditing.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+TextEditing.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryDrawingToolbar.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterGridView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryFilterPicker.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryLogging.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaCoordinator.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaLoader.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryOfflineQueueBootstrap.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryReaderLoadingOverlay.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideRenderer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditToolbar.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditorView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVideoCaptionMetadata.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVideoPlayerView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/TextBackgroundStylePicker.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditFloatingBubbles.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/TextEditToolOptions.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelineTrackView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/TrackDetailPopover.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift`

## MeeshyUI/Story/Canvas  (11/29 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasGeometry.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasReprojector.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryFilteredLayer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryGlassBackdropLayer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryStickerLayer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/RepostPayload.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBackdropCapture.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryBlurFilter.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasRepresentable.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+InlineTextEdit.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryDurationPolicy.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryInlineTextEditor.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryMediaDecoder.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderContext.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderPrefetcher.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderResolvers.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderTimerController.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRendererCache.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderingContext.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStickerRasterizer.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryTextFontResolver.swift`

## MeeshyUI/Story/Controls  (3/10 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/AudioForegroundChip.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/BandStateMachine.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/CanvasLayerIndicator.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerBottomBand.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerControlsLayer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerFABColumn.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerToolSwitcherHeader.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/StoryAudioCell.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/StoryComposerObject+Duplicate.swift`

## MeeshyUI/Story/Drawing  (3/3 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/MeeshyStrokeCanvas.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/StoryStrokeRasterizer.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Drawing/StrokeCaptureLayer.swift`

## MeeshyUI/Story/Timeline  (32/42 have a test)

- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/AudioMixer.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/CustomTransitionCompositor.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/DissolveVideoCompositor.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine+Providing.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngineErrors.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineMediaSource.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/TimelineSignposter.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/VideoCompositor.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/CommandStack.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/KeyframeInterpolator.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/SnapEngine.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Model/TimelineEngineMode.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Util/SOTAImageThumbnail.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/ClipSelectionState.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineGeometry.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineMode.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+OfflinePublish.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineEmptyState.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/ProTimelineView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/QuickTimelineView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineContainerSwitcher.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineModeSwitcher.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TimelineToolbar.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Indicators/OfflineIndicatorBadge.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/InspectorPresentation.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/KeyframeInspector.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/TransitionInspector.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/DurationHandle.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/KeyframeMarkerView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/PlayheadView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/RulerView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Overlay/SnapGuideView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/AudioClipBar.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TextClipBar.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TrackBarView.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/TransitionBadge.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Track/VideoClipBar.swift`

## MeeshyUI/Theme  (1/7 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Theme/Accessibility.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Theme/AttachmentDisplay.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Theme/ColorExtensions.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Theme/ThemeManager.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Theme/ViewModifiers.swift`

## MeeshyUI/Utilities  (2/9 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Utilities/EmojiDetector.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Utilities/EntityImagePickerFlow.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Utilities/HapticFeedback.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Utilities/ImageCompressor.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Utilities/LanguageDisplay.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift`
- [~] `packages/MeeshySDK/Sources/MeeshyUI/Utilities/TextAnalyzer.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Utilities/UserDisplayName.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/Utilities/WeakDisplayLinkTarget.swift`

## MeeshyUI/VoiceProfile  (0/3 have a test)

- [ ] `packages/MeeshySDK/Sources/MeeshyUI/VoiceProfile/VoiceProfileManageView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/VoiceProfile/VoiceProfileWizardView.swift`
- [ ] `packages/MeeshySDK/Sources/MeeshyUI/VoiceProfile/VoiceRecordingView.swift`
