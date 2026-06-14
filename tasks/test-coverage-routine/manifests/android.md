# Coverage Manifest — Android app (Kotlin)

> Exhaustive list of **every** source file, grouped by feature/domain. `[~]` = a same-named test exists today (heuristic — may be shallow); `[ ]` = no obvious test. The routine must bring each to **92% line+branch** and flip to `[x]` once reviewer-approved.

- Source files: **148**
- With a same-named test today (heuristic): **28** (19%)
- Needing tests / verification: **120**

Heuristic note: a `[~]` only means a similarly-named test file exists — it does NOT mean 92% coverage. Every file, `[~]` included, must be verified to 92%.

## app/src/main  (0/6 have a test)

- [ ] `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`
- [ ] `apps/android/app/src/main/kotlin/me/meeshy/app/MeeshyApplication.kt`
- [ ] `apps/android/app/src/main/kotlin/me/meeshy/app/di/AppModule.kt`
- [ ] `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`
- [ ] `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`
- [ ] `apps/android/app/src/main/kotlin/me/meeshy/app/push/PushTokenHandler.kt`

## core/common/src  (0/1 have a test)

- [ ] `apps/android/core/common/src/main/kotlin/me/meeshy/core/common/CoroutineDispatchers.kt`

## core/crypto/src  (0/1 have a test)

- [ ] `apps/android/core/crypto/src/main/kotlin/me/meeshy/core/crypto/Module.kt`

## core/database/src  (3/10 have a test)

- [ ] `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/DatabaseModule.kt`
- [ ] `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/MeeshyDatabase.kt`
- [~] `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/ConversationDao.kt`
- [~] `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/MessageDao.kt`
- [~] `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/OutboxDao.kt`
- [ ] `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/SyncMetaDao.kt`
- [ ] `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/ConversationEntity.kt`
- [ ] `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/MessageEntity.kt`
- [ ] `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/OutboxEntity.kt`
- [ ] `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/SyncMetaEntity.kt`

## core/datastore/src  (0/1 have a test)

- [ ] `apps/android/core/datastore/src/main/kotlin/me/meeshy/core/datastore/Module.kt`

## core/model/src  (1/38 have a test)

- [~] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageResolver.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Affiliate.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AgentAnalysis.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ApiConversationDetail.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ApiMessageDetail.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ApiResponse.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Auth.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Community.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CommunityLink.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Conversation.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationDraft.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Core.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Feed.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/FocusFilterSnapshot.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Friend.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LastMessageSummaryKind.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Location.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MeeshyUser.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MemberRole.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MentionCandidate.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Message.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffects.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Notification.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Participant.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Post.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Presence.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ShareLink.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SocketEvents.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Stats.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Thread.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TrackingLink.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Transcription.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/UserRelationshipState.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/UserRequests.kt`
- [ ] `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VoiceProfile.kt`

## core/navigation/src  (0/1 have a test)

- [ ] `apps/android/core/navigation/src/main/kotlin/me/meeshy/core/navigation/Module.kt`

## core/network/src  (1/20 have a test)

- [~] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/ApiCall.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/AuthInterceptor.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/EncryptedTokenStore.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/JsonConverterFactory.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/MeeshyApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/MeeshyConfig.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/NetworkModule.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/NetworkResult.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/TokenStore.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/AuthApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/CommunityApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ConversationApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/FriendApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/MessageApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/NotificationApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ReactionApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/StoryApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/TranslationApi.kt`
- [ ] `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/UserApi.kt`

## feature/auth/src  (1/2 have a test)

- [~] `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/AuthViewModel.kt`
- [ ] `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/LoginScreen.kt`

## feature/chat/src  (2/3 have a test)

- [~] `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatListItems.kt`
- [ ] `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`
- [~] `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

## feature/contacts/src  (0/2 have a test)

- [ ] `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsScreen.kt`
- [ ] `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsViewModel.kt`

## feature/conversations/src  (3/4 have a test)

- [~] `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConnectionBanner.kt`
- [ ] `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`
- [~] `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`
- [~] `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/LastMessagePreview.kt`

## feature/feed/src  (1/2 have a test)

- [ ] `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedScreen.kt`
- [~] `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`

## feature/notifications/src  (1/2 have a test)

- [ ] `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt`
- [~] `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsViewModel.kt`

## feature/profile/src  (0/2 have a test)

- [ ] `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileScreen.kt`
- [ ] `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileViewModel.kt`

## feature/settings/src  (0/2 have a test)

- [ ] `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsScreen.kt`
- [ ] `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsViewModel.kt`

## sdk-core/src/main  (10/34 have a test)

- [~] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/AuthRepository.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/CacheClock.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/CachePolicy.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/CacheResult.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/SwrCacheSource.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/cacheFirstFlow.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/community/CommunityRepository.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationCacheSource.kt`
- [~] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/LocalMessage.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageCacheSource.kt`
- [~] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/di/SdkModule.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendRepository.kt`
- [~] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/message/MessageStateMachine.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationRepository.kt`
- [~] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxCoalescer.kt`
- [~] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxDrainer.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxIds.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`
- [~] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxRepository.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/reaction/ReactionRepository.kt`
- [~] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionRepository.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocialSocketManager.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocketManager.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`
- [~] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/ConversationAccent.kt`
- [~] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/DynamicColorGenerator.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/translation/TranslationRepository.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/user/UserRepository.kt`
- [ ] `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/util/IsoTimestamps.kt`

## sdk-ui/src/main  (5/17 have a test)

- [~] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/AvatarInitials.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/BrandLogo.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyPrimaryButton.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshySkeleton.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContent.kt`
- [~] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`
- [~] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/EmojiDetector.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`
- [~] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerTransform.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/ColorHex.kt`
- [~] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyDimens.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyMotion.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyPalette.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyTheme.kt`
- [ ] `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyThemeTokens.kt`
