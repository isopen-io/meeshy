# Meeshy iOS Audit — Part 06

Scope: Main feature ViewModels (conversation, feed, social, story, voice, 2FA, profile) + a slice of Main feature Views (about, sessions, affiliate, audio effects). 20 files.

---

## apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift

**Purpose**: The central, ~2840-line `@MainActor` ObservableObject driving a single chat conversation screen — message list, send/edit/delete/react/pin, pagination, search, jump-to-message, translation/transcription resolution, live location, typing, and real-time socket reconciliation.

**Public API surface**
- `class ConversationViewModel: ObservableObject, ConversationSocketDelegate`
- Nested: `MessageTranslation` (struct), `ConversationDependencies` (DI struct, `.live`), `DateGroup`, `MediaSenderInfo`, `AudioItem`, `DeleteMode` enum (`.local`/`.everyone`), `JumpResult` enum (`.foundLocally`/`.loadedFromServer`/`.notFound`).
- Key `@Published`: `messages: [Message]`, `isLoadingInitial/Older/Newer`, `isRevalidating`, `editInProgress: Set<String>`, `hasOlder/NewerMessages`, `isSending`, `error`, `scrollAnchorId`, `newMessageAppended: Int`, `typingUsernames`, `messageTranslations`, `messageTranscriptions`, `messageTranslatedAudios`, `activeTranslationOverrides`, `activeAudioLanguageOverrides`, `activeLiveLocations`, `lastUnreadMessage`, `reactionDetails`, `firstUnreadMessageId`, `isConversationClosed`, `accessRevoked`, `ephemeralDuration`, `isBlurEnabled`, `pendingEffects`, `showEffectsPicker`, `mentionController`, search state (`searchResults`, `isSearching`, `searchHasMore`, `currentSearchQuery`, `isSearchingQuotedMessage`, `quotedMessageSearchTarget`, `isInJumpedState`).
- Methods: `loadMessages`, `loadOlderMessages`, `loadNewerMessages`, `loadMessagesAround`, `jumpToQuotedMessage`, `returnToLatest`, `sendMessage(...)`, `retryMessage`, `removeFailedMessage`, `insertOptimisticMediaMessage`, `removeExpiredMessages`, `toggleStar/isStarred`, `toggleReaction`, `fetchReactionDetails`, `deleteMessage`, `deleteAttachment`, `togglePin`, `consumeViewOnce`, `markMessageAsConsumed`, `editMessage`, `editRevisions`, `reportMessage`, `markAsRead`, `markAsReceived`, `syncMissedMessages`, `searchMessages`, `loadMoreSearchResults`, `preferredTranslation(for:)`, `setActiveTranslation/AudioLanguage`, `shareLocation`, `start/stop/updateLiveLocation`, `serverId(for:)`, `persistMessagesUsingServerIds`, mention delegation (`handleMentionQuery`, `insertMention`, `clearMentionSuggestions`).

**Key behaviors / algorithms worth preserving**
- **Dual data pipeline**: GRDB-backed `MessageStore` is the source of truth — all writes go through `MessagePersistenceActor`; a `messagesDidChange` Combine subscription mirrors records into `@Published messages`. The legacy `CacheCoordinator.messages` store is kept in sync in parallel for the conversation-list preview/unread badge.
- **Cache-first + SWR**: `loadMessages` switches on `CacheResult` (`.fresh/.stale/.expired/.empty`), surfaces GRDB instantly, and background-revalidates from the API (`isRevalidating` drives a subtle sparkle, never a spinner).
- **Optimistic message lifecycle**: a single canonical `clientMessageId` (`cid_<uuid>`) used end-to-end; `pendingServerIds` maps optimistic id→server id and is NEVER swapped in-memory (avoids ForEach key churn / bubble remount flash). State machine events: `.serverAck`, `.sendFailed`, `.retryExhausted`.
- **Offline send**: gated on `NetworkMonitor.isOffline` only (not socket state) — enqueues `OfflineQueueItem`, inserts optimistic GRDB record + cache, bumps conversation preview.
- **Derived-cache invalidation**: large hand-rolled memoization layer (`_messageIdIndex`, `_messagesByDate`, `_topActiveMembers`, `_mediaSenderInfoMap`, `_allVisualAttachments`, `_mediaCaptionMap`, `_allAudioItems`, `_replyCountMap`, `_mentionDisplayNames/_Candidates`, double-optional `_cachedLastReceived/SentIndex`) invalidated in `messages.didSet`.
- **Token-bucket reaction rate limiter**: burst 10, refill 3/s (`consumeReactionToken`).
- **Prisme Linguistique**: `preferredTranslation(for:)` resolves systemLanguage → regionalLanguage → customDestinationLanguage; returns `nil` (show original) when original already in a preferred language or no match — never falls back to `translations.first`.
- **Pagination**: debounced (0.3s), retry (3×, 500ms); `loadOlderMessages` anticipatory prefetch when scrolling fast & not near bottom.
- **E2EE**: direct conversations encrypt via `SessionManager.encryptMessage`, decrypt via `DecryptionActor`; MVP falls back to plaintext on encrypt failure (tech debt — flagged in code).
- **Access revocation**: 403/404/410 → wipes per-conversation cache + GRDB, sets `accessRevoked` so the View dismisses.
- **Transcription retry**: 5s delayed re-fetch for audio attachments missing Whisper transcription.
- **Local delete** ("delete for me") via `LocallyHiddenMessagesStore`; **edit history** maintained locally via `EditHistoryStore` (backend has no edit-history endpoint); **star** local-only via `StarredMessagesStore`.
- Media prefetch debounced 300ms, TaskGroup parallel image/thumb/audio + video preroll.

**Dependencies & couplings**: `MessageStore`, `MessagePersistenceActor`, `ConversationSocketHandler` (delegate), `MessageService`, `ConversationService`, `ReactionService`, `ReportService`, `ConversationSyncEngine`, `MentionService`, `MentionComposerController`, `DecryptionActor`/`SessionManager`, `OfflineQueue`/`OutboxFlusher`/`OutboxFlushTrigger`, `CacheCoordinator`, `LocationService`, `AuthManager`, `NetworkMonitor`, `EditHistoryStore`, `StarredMessagesStore`, `LocallyHiddenMessagesStore`, GRDB.

**Android-port note**: Map to a Hilt-injected `ConversationViewModel` exposing `StateFlow`. GRDB → **Room** with `Flow<List<MessageEntity>>` observed by the ViewModel (replaces the manual `messagesDidChange` mirror). Persistence actor → a Room-backed repository on `Dispatchers.IO`. Optimistic-id mapping, token-bucket limiter, pagination debounce and SWR cache logic all port directly. The hand-rolled memoization should be replaced by `derivedStateOf`/computed `Flow`s (Room queries can do date-grouping). This is the highest-risk/highest-value file — split into a repository + several use-cases for the Android rebuild.

## apps/ios/Meeshy/Features/Main/ViewModels/EditProfileViewModel.swift

**Purpose**: Drives the edit-profile sheet (display name, bio, avatar) with optimistic update + offline-queue + rollback.

**Public API**: `class EditProfileViewModel: ObservableObject`; `SaveState` enum (`.idle/.uploadingAvatar/.enqueueing/.success/.failed`); `@Published` `displayName`, `bio`, `selectedImageData`, `avatarPreviewImage`, `saveState`, `errorMessage`, `showSuccess`; computed `hasChanges`, `isSaving`, `isUploadingAvatar`, `bioMaxLength`(300); `loadSelectedPhoto`, `saveProfile(onDismiss:)`.

**Key behaviors**: Avatar uploaded synchronously online-first (`AttachmentUploader.uploadAvatar`); profile changes built into `UpdateProfilePayload` with `ClientMutationId`, applied optimistically via `AuthManager.applyLocalProfileChanges` (returns `ProfileSnapshot`), enqueued through `OfflineQueue`; `observeOutcome` subscribes to `OfflineQueue.outcomeStream(for: cmid)` and rolls back the snapshot on `.exhausted`. Observer attached BEFORE enqueue to avoid a race.

**Dependencies**: `AuthManaging`, `OfflineQueueing`, `AttachmentUploading`, `ProfileCacheWriting` (CacheCoordinator), `Sleeping`, `ToastSurfacing`, `HapticSurfacing` — all protocol-injected with `.shared` defaults.

**Android-port note**: ViewModel with `MutableStateFlow<SaveState>`; PhotosPicker → Android Photo Picker / `ActivityResultContracts`. The cmid+outcome-stream rollback pattern maps to a Flow/Channel from the offline-queue repository.

## apps/ios/Meeshy/Features/Main/ViewModels/FeedSocketHandler.swift

**Purpose**: `@MainActor` router that subscribes to `SocialSocketManager` Combine publishers and writes decoded records into `FeedPersistenceActor` (GRDB) atomically.

**Public API**: `class FeedSocketHandler`; `init(persistence:socialSocket:)`; `arm()`, `disarm()`. Extensions: `PostRecord(from: APIPost)`, `CommentRecord(from: APIPostComment, postId:)` — `nonisolated` failable inits with JSON-encoded blob fields.

**Key behaviors**: Routes post created/updated/deleted/liked/unliked/reposted/bookmarked, comment added/deleted/liked, post translation updated → persistence upserts. Bookmark is UI-only (no persistence record).

**Dependencies**: `FeedPersistenceActor`, `SocialSocketProviding`, `PostRecord`/`CommentRecord` (GRDB models).

**Android-port note**: A repository-layer socket collector — collect `Flow`s from the Socket.IO wrapper and `upsert` into Room. The `nonisolated` failable-init mappers become pure Kotlin mapper functions.

## apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift

**Purpose**: Social feed timeline ViewModel — cache-first load, infinite scroll, post CRUD/like/bookmark/repost/share/report/pin, comments, real-time socket updates, media prefetch.

**Public API**: `class FeedViewModel: ObservableObject`; `@Published` `posts: [FeedPost]`, `isLoading`, `isLoadingMore`, `hasMore`, `hasLoaded`, `error`, `newPostsCount`, `publishError`, `publishSuccess`; `setupPersistence(store:socketHandler:persistence:)`; `loadFeed(forceRefresh:)`, `loadMoreIfNeeded`, `refresh`, `prefetchComments`, `acknowledgeNewPosts`, `likePost`, `bookmarkPost`, `createPost`, `sendComment`, `likeComment`, `repostPost`, `sharePost`, `deletePost`, `reportPost`, `pinPost`, `setTranslationOverride`, `clearTranslationOverride`, `requestTranslation`, `subscribeToSocketEvents`, `unsubscribeFromSocketEvents`, `prefetchMediaForPost`, `prefetchMedia(around:)`.

**Key behaviors**: Cache-first with SWR via `CacheCoordinator.feed` keyed `main-feed` / `bookmarks` / per-post; cursor pagination (loads more 5 items from end); optimistic like with batched mutation + revert; `newPostsCount` banner; debounced cache save (2s); media prefetch debounced 150ms over a visible window (-2..+7), TaskGroup parallel + separate video preroll. `likeComment` routed through `OfflineQueue` outbox. Translation override resolution honours preferred languages. GRDB persistence runs alongside cache.

**Dependencies**: `APIClientProviding`, `SocialSocketProviding`, `PostServiceProviding`, `LanguageProviding`, `FeedStore`, `FeedSocketHandler`, `FeedPersistenceActor`, `CacheCoordinator`, `OfflineQueue`, `ToastManager`, `StoryMediaLoader`.

**Android-port note**: Compose `LazyColumn` + Paging 3 (`PagingSource` from Room). Socket subscriptions → repository Flows. Optimistic like/revert with snapshot ports directly. Replace `debouncedCacheSave` with Room write-through.

## apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift

**Purpose**: App-wide search across messages / conversations / users with FTS5-first + network-merge.

**Public API**: `SearchTab` enum (`.messages/.conversations/.users` with localized name + icon); result structs `GlobalSearchMessageResult`, `GlobalSearchConversationResult`, `GlobalSearchUserResult`; `class GlobalSearchViewModel: ObservableObject`; `@Published` `searchText`, `selectedTab`, three result arrays, `loadState`, `recentSearches`, `hasSearched`; computed `isSearching`, `messageCount/conversationCount/userCount/totalResultCount`; recent-search CRUD methods.

**Key behaviors**: 300ms debounced search (Combine on `$searchText`), `searchTask` cancellation on each keystroke; three parallel `async let` legs; each leg merges FTS5 local results (`SearchIndex` / `MessageSearchService`) with remote API results (remote first, dedup by id). In-memory 5-entry LRU cache for message-query results, 2-min staleTTL (documented deviation from spec's persistent GRDB cache — `GlobalSearchMessageResult` not Codable). Recent searches persisted in `UserDefaults` (max 10). `loadState` distinguishes `.cachedStale` (no spinner) from `.loading`.

**Dependencies**: `APIClientProviding`, `UserServiceProviding`, `AuthManaging`, `MessageSearchService`, `SearchIndex`, `CacheCoordinator`, GRDB.

**Android-port note**: Room **FTS4/FTS5** virtual tables for local message/conversation/user search; debounced `searchText` via `flatMapLatest` on a `MutableStateFlow`. Recent searches → DataStore. LRU cache → simple in-memory `LinkedHashMap`.

## apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift

**Purpose**: Single-post detail screen — post + threaded comments, replies, like, bookmark, real-time updates.

**Public API**: `class PostDetailViewModel: ObservableObject`; `@Published` `post`, `comments` (didSet derives `_topLevelComments`), `isLoading`, `isLoadingComments`, `hasMoreComments`, `error`, `replyingTo`, `repliesMap`, `expandedThreads`, `loadingReplies`; computed `topLevelComments`, `preferredLanguages`, `userLanguage`; `setupPersistence`, `loadPost`, `loadComments`, `loadMoreComments`, `toggleThread`, `loadReplies`, `likePost`, `bookmarkPost`, `sendComment`, `sendReply`, `clearReply`, `subscribeToSocket`; static `resolveCommentTranslation`.

**Key behaviors**: Cache-first post + comments (`CacheCoordinator.feed` / `.comments`); cursor pagination; thread expand lazily loads replies into `repliesMap`; `likePost` + `sendComment` route through `OfflineQueue` outbox with optimistic insert + snapshot rollback (optimistic id = `cmid`); `sendReply` goes direct via `PostService`. Socket `commentAdded` reconciles nested vs top-level; translation resolution mirrors Prisme rules.

**Dependencies**: `PostServiceProviding`, `SocialSocketManager`, `LanguageProviding`, `OfflineQueueing`, `CommentStore`, `FeedPersistenceActor`, `CacheCoordinator`, `ToastManager`.

**Android-port note**: ViewModel + Room comment store; threaded comments in Compose with expand/collapse state in `StateFlow`. Outbox-driven optimistic comment/like ports directly.

## apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift

**Purpose**: Mood-status feature (ephemeral emoji statuses) — list, set, clear, react, infinite scroll, real-time.

**Public API**: `class StatusViewModel: ObservableObject`; `@Published` `statuses`, `myStatus`, `isLoading`, `isLoadingMore`, `error`; `mode: StatusService.Mode`; static `moodOptions` (10 emoji); `loadStatuses`, `loadMoreIfNeeded`, `refresh`, `setStatus`, `clearStatus`, `statusForUser`, `moodTapHandler`, `subscribeToSocketEvents`, `reactToStatus`; computed `currentUserDisplayName`, `currentUserInitial`.

**Key behaviors**: Cache-first SWR keyed `statuses_<mode>`; cursor pagination (trigger within last 3); optimistic set/clear with snapshot rollback; socket created/deleted/updated; `moodTapHandler` returns a closure that anchors `StatusBubbleController` popover.

**Dependencies**: `StatusServiceProviding`, `SocialSocketProviding`, `AuthManaging`, `CacheCoordinator`, `StatusBubbleController`, `ToastManager`.

**Android-port note**: ViewModel + Room cache; status bubble popover → Compose `Popup`. Mood emoji grid trivial.

## apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift

**Purpose**: Author-only "export story to MP4 and share externally" flow — NEVER touches the Meeshy backend.

**Public API**: `StoryExportSharePhase` enum (`.idle/.exporting/.ready/.sharing/.failed(String)`); `class StoryExportShareViewModel: ObservableObject`; `@Published` `phase`, `progress`, `sharedURL`, `errorMessage`, `availableLanguages`, `selectedLanguage`; `prepare(story:)`, `startExport(story:)`, `markSharingPresented`, `finishSharing(success:)`, `cancel()`.

**Key behaviors**: `prepare` seeds export languages from story translations; defaults `selectedLanguage` to user's preferred content language if available. `startExport` reconstructs a `StorySlide` via `toRenderableSlide(preferredLanguages:)` (Prisme Linguistique — chosen language baked into overlays), bakes MP4 via `StoryVideoExportService`, surfaces a temp file URL. Temp MP4 cleaned up on share finish/cancel.

**Dependencies**: `StoryVideoExportServiceProviding`, `AuthManager`, `os.Logger`.

**Android-port note**: MP4 baking → `MediaCodec`/`MediaMuxer` or a render pipeline; external share → `Intent.ACTION_SEND` with a `FileProvider` URI. Keep the strict rule: export output never uploaded to Meeshy.

## apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift

**Purpose**: Story tray + multi-slide story publishing (online + offline-queue), with RAW publish (assets + JSON effects), background upload, retry, real-time.

**Public API**: `class StoryViewModel: ObservableObject, StoryPublishExecutor`; nested `StoryUploadState` (with `UploadPhase` enum); `@Published` `storyGroups`, `isLoading`, `isPublishing`, `publishError`, `showStoryComposer`, `activeUpload`; `executeQueuedPublish(item:)`, `loadStories`, `markViewed`, lookup methods (`storyGroupForUser`, `groupIndex(forUserId/forStoryId)`, `hasStories`, `hasUnviewedStories`), `publishStory`, `publishStorySingle`, `publishStoryInBackground`, `enqueueStoryForOfflinePublish`, `retryUpload`, `cancelUpload`, `deleteStory`, `subscribeToSocketEvents`.

**Key behaviors**: Cache-first SWR keyed `recent_tray`; preserves locally-viewed state across API syncs. `runStoryUpload` is the shared headless pipeline (UI-driven + queue-driven) — uploads slide background + foreground media (image/video/audio) via **TUS** (`TusUploadManager`), encodes `StoryEffects` JSON, creates one Post per slide; skips already-published slides on retry to avoid duplicates; cancel deletes orphan committed slides. Offline path persists media to a per-story disk dir + `StoryPublishQueue` (replayed on reconnect/cold start via `executeQueuedPublish`). Auto-retry on socket reconnect (2s settle). `StoryPublishUnrecoverableError` → queue drops; other errors retryable. Prefetch first unviewed slide high-priority + 3 upcoming utility-priority. **Critical rule**: `runStoryUpload` must never invoke MP4 export.

**Dependencies**: `StoryServiceProviding`, `PostServiceProviding`, `SocialSocketProviding`, `APIClientProviding`, `TusUploadManager`, `MediaCompressor`, `StoryMediaLoader`, `StoryPublishQueue`, `CacheCoordinator`, `AuthManager`, `ToastManager`.

**Android-port note**: TUS resumable upload has an Android client (`tus-java-client` / OkHttp). Background upload → `WorkManager` job (survives process death — replaces both `uploadTask` and the offline queue). RAW publish + per-slide Post creation ports directly. Story tray = Compose horizontal list.

## apps/ios/Meeshy/Features/Main/ViewModels/TwoFactorViewModel.swift

**Purpose**: TOTP 2FA setup/enable/disable/recovery-codes management.

**Public API**: `class TwoFactorViewModel: ObservableObject`; `@Published` `isEnabled`, `isLoading`, `error`, `setupData: TwoFactorSetup?`, `recoveryCodes: [String]`; `checkStatus`, `beginSetup`, `enable(code:)`, `disable(code:password:)`, `getBackupCodes(code:)`, `clearError`, `reset`.

**Key behaviors**: Straightforward async service calls with French error strings; `enable` surfaces backup codes.

**Dependencies**: `TwoFactorServiceProviding`.

**Android-port note**: Trivial ViewModel. QR code from `setupData` rendered with a QR lib.

## apps/ios/Meeshy/Features/Main/ViewModels/UserProfileViewModel.swift

**Purpose**: Other-user profile sheet — full profile, stats, shared conversations, block/unblock.

**Public API**: `class UserProfileViewModel: ObservableObject`; `@Published` `profileUser: ProfileSheetUser`, `fullUser: MeeshyUser?`, `sharedConversations`, `isLoading`, `isBlocked`, `isBlockedByTarget`, `userStats`, `isLoadingStats`, `statsError`; computed `isCurrentUser`; `loadFullProfile`, `loadUserStats`, `findSharedConversations(from:)`, `blockUser`, `unblockUser`.

**Key behaviors**: Cache-first SWR for profile + stats; profile fetch by id-or-username, indexes user into `SearchIndex`; 403 on profile fetch → `isBlockedByTarget`. Block/unblock route through `OfflineQueue` outbox with `cmid`, optimistic flip, and `observeOutcome` rollback on `.exhausted`.

**Dependencies**: `AuthManaging`, `BlockServiceProviding`, `UserService`, `CacheCoordinator`, `SearchIndex`, `OfflineQueue`, `ToastManager`.

**Android-port note**: ViewModel + Room profile cache; outbox-driven block/unblock ports directly.

## apps/ios/Meeshy/Features/Main/ViewModels/VoiceProfileManageViewModel.swift

**Purpose**: Manage an existing voice-clone profile — samples, consent, cloning toggle, deletion.

**Public API**: `class VoiceProfileManageViewModel: ObservableObject`; `@Published` `profile`, `samples`, `consentStatus`, `isLoading`, `isCloningEnabled`, `error`; `loadProfile`, `toggleCloning(enabled:)`, `deleteSample(id:)`, `deleteProfile`, `uploadAdditionalSamples([Data])`.

**Key behaviors**: `loadProfile` parallel-fetches profile/samples/consent (`async let`); optimistic toggle + sample-delete with rollback; sample duration estimated from byte count (16 kHz).

**Dependencies**: `VoiceProfileServiceProviding`.

**Android-port note**: ViewModel; audio sample upload via multipart. Duration estimate heuristic ports directly.

## apps/ios/Meeshy/Features/Main/ViewModels/VoiceProfileWizardViewModel.swift

**Purpose**: Onboarding wizard to create a voice-clone profile (consent → recording → processing → complete).

**Public API**: `class VoiceProfileWizardViewModel: ObservableObject`; `@Published` `currentStep: VoiceProfileWizardStep`, `consentStatus`, `profile`, `isLoading`, `isUploading`, `uploadedCount`, `totalToUpload`, `error`, `ageVerified`, `birthDate`; `checkConsent`, `grantConsent`, `confirmAgeVerification`, `uploadSamples([Data])`, private `estimateDurationMs`.

**Key behaviors**: Consent gate with age verification; uploads samples sequentially tracking progress; 1s sleep then fetches profile before `.complete`.

**Dependencies**: `VoiceProfileServiceProviding`.

**Android-port note**: Multi-step wizard → Compose with a `currentStep` enum in `StateFlow`; date picker for birth date.

## apps/ios/Meeshy/Features/Main/Views/AboutView.swift

**Purpose**: Static "About" screen — app version, platform info, description, feature list, external links, copyright.

**Public API**: `struct AboutView: View`. No ViewModel; reads `Bundle.main.infoDictionary` for version/build.

**Key behaviors**: Sectioned ScrollView with themed gradient cards; `Link` rows open URLs in Safari; accessibility labels/hints/headers applied.

**Dependencies**: `ThemeManager`, `AnimatedLogoView`, `HapticFeedback`, `Color(hex:)`.

**Android-port note**: Static Compose screen; version from `PackageInfo`/`BuildConfig`; links via `Intent.ACTION_VIEW`.

## apps/ios/Meeshy/Features/Main/Views/AchievementBadgeView.swift

**Purpose**: Reusable badge component showing an achievement with a circular progress ring.

**Public API**: `struct AchievementBadgeView: View`; input `let achievement: Achievement`.

**Key behaviors**: ZStack — background stroke circle + trimmed progress arc (`trim(from:0,to:progress)`, rotated -90°) + SF Symbol icon; locked state dims to 0.7 opacity and muted color; combined accessibility label.

**Dependencies**: `Achievement` model, `ThemeManager`, `Color(hex:)`.

**Android-port note**: Compose component; progress ring via `Canvas`/`drawArc` or `CircularProgressIndicator`. Leaf component — pass primitives.

## apps/ios/Meeshy/Features/Main/Views/ActiveSessionsView.swift

**Purpose**: Lists active login sessions with revoke-one / revoke-all-others. Includes its `ActiveSessionsViewModel` in-file.

**Public API**: `struct ActiveSessionsView: View`; `class ActiveSessionsViewModel: ObservableObject` — `@Published` `sessions: [UserSession]`, `isLoading`, `isRevoking`, `showError`, `errorMessage`; `loadSessions`, `revokeSession(sessionId:)`, `revokeAllOtherSessions`.

**Key behaviors**: Loads sessions on `.task`; current session badged + green icon; revoke removes optimistically after server success; error alert.

**Dependencies**: `SessionServiceProviding`, `ThemeManager`, `MeeshyColors`, `HapticFeedback`.

**Android-port note**: ViewModel + Compose list; "current device" detected server-side. Note: ViewModel co-located with View — for Android keep ViewModel in its own file.

## apps/ios/Meeshy/Features/Main/Views/AdaptiveRootView.swift

**Purpose**: Top-level size-class router — chooses iPad vs phone root.

**Public API**: `struct AdaptiveRootView: View` — branches on `horizontalSizeClass` to `iPadRootView()` or `RootView()`.

**Android-port note**: Equivalent to a `WindowSizeClass`-based root composable (Material3 `calculateWindowSizeClass`) selecting compact vs expanded layouts.

## apps/ios/Meeshy/Features/Main/Views/AffiliateCreateView.swift

**Purpose**: Sheet to create a referral/affiliate link (name + optional max-uses).

**Public API**: `struct AffiliateCreateView: View`; `var onCreate: ((AffiliateToken) -> Void)?` callback; local `@State` for form fields, `isCreating`, `errorMessage`.

**Key behaviors**: `NavigationStack` form; create button disabled when name empty; calls `AffiliateService.shared.createToken`, fires haptic + `onCreate` callback, dismisses.

**Dependencies**: `AffiliateService`, `ThemeManager`, `HapticFeedback`.

**Android-port note**: Modal bottom sheet / dialog with a form; callback → result via `StateFlow`/nav result.

## apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift

**Purpose**: Affiliate dashboard — stats overview (links/signups/clicks), list of referral tokens with copy/share/delete. Includes `AffiliateViewModel` in-file.

**Public API**: `struct AffiliateView: View`; `class AffiliateViewModel: ObservableObject` — `@Published` `tokens: [AffiliateToken]`, `isLoading`; `load`, `deleteToken`.

**Key behaviors**: Cache-first SWR keyed `affiliateTokens`/`list`; stats computed by reducing tokens; copy to `UIPasteboard`; share via `UIActivityViewController`; optimistic delete with snapshot rollback + cache write.

**Dependencies**: `AffiliateService`, `CacheCoordinator.affiliateTokens`, `ThemeManager`, `HapticFeedback`.

**Android-port note**: ViewModel + Room cache; share via `ACTION_SEND`; clipboard via `ClipboardManager`.

## apps/ios/Meeshy/Features/Main/Views/AudioEffectsPanel.swift

**Purpose**: In-call audio-effects panel — select voice effect (auto-tune / baby / demon / ambiance) and tune parameters with live sliders.

**Public API**: `struct AudioEffectsPanel: View`; `@ObservedObject callManager = CallManager.shared`; local `@State` for selected effect + per-effect param structs (`VoiceCoderParams`, `BabyVoiceParams`, `DemonVoiceParams`, `BackSoundParams`).

**Key behaviors**: Horizontal effect-chip selector; conditional parameter sliders per effect type; `onChange` → `debouncedUpdate` (150ms) → `callManager.updateAudioEffectParams`; `applyEffect` builds an `AudioEffectConfig` and calls `setAudioEffect`; ambiance picker has rain/cafe/nature sounds; glass `.ultraThinMaterial` styling.

**Dependencies**: `CallManager` (WebRTC audio pipeline), `MeeshyUI`, `MeeshyColors`, audio-effect param/config types.

**Android-port note**: In-call effects map to WebRTC `AudioProcessing` / a custom audio-effect chain; Compose `Slider`s with debounced updates to the call manager. `@ObservedObject` on singleton → collect a minimal `StateFlow` slice (Android "zero unnecessary recomposition" concern).

---

## Architecture observations

**State management**: Uniform MVVM — every screen is a `@MainActor ObservableObject` with `@Published` state and constructor-injected protocol dependencies defaulting to `.shared` singletons. Android: Hilt-injected ViewModels exposing `StateFlow`; the `*Providing` protocols become Kotlin interfaces for test fakes.

**Caching / SWR (pervasive, non-negotiable)**: Almost every loading ViewModel is cache-first via `CacheCoordinator` `CacheResult` (`.fresh/.stale/.expired/.empty`) — surface cache instantly, background-revalidate, never spin when data exists. `LoadState` enum standardizes this. Android: a generic `Resource`/`CacheResult` sealed class + Room as the durable cache, with repository functions returning `Flow` that emit cached-then-fresh.

**Dual persistence pipeline**: A major in-progress architecture migration — GRDB (`MessageStore`/`MessagePersistenceActor`, `FeedStore`/`FeedPersistenceActor`, `CommentStore`) is becoming the source of truth via DB-observation, while the legacy `CacheCoordinator` stores are kept in sync in parallel for list previews/badges. **For Android, build ONLY the Room-backed pipeline — do not replicate the dual-write tech debt.** ConversationViewModel's `messages.didSet` manual-memoization layer and the legacy `CacheCoordinator.messages` sync should be dropped in favour of reactive Room queries (`Flow`) + `derivedStateOf`.

**Optimistic updates + offline outbox**: Consistent pattern across feed/profile/block/comment/like/read-receipt/message-send — a `ClientMutationId`/`ClientMessageId`, optimistic local write, enqueue into the unified `OfflineQueue` (`OutboxFlusher`, exponential backoff, 5 attempts), and a per-cmid `outcomeStream` observer that rolls back on `.exhausted`. Stories use a separate `StoryPublishQueue`. Android: a single Room-backed outbox table + `WorkManager` flusher; rollback driven by a `Flow` of outcomes keyed by cmid. This is the spine of the app's "instant + offline" UX and must be ported faithfully.

**Concurrency**: Swift actors (`MessagePersistenceActor`, `DecryptionActor`, `FeedPersistenceActor`) isolate DB/crypto work off the main thread; `async let`/`TaskGroup` for parallel fetches and media prefetch; debounced tasks throughout (search 300ms, pagination 300ms, cache-save 2s, effect params 150ms, media prefetch 150–300ms). Android: `Dispatchers.IO` repositories, `coroutineScope`/`async` for parallelism, `flatMapLatest`/`debounce` operators.

**Real-time**: Two Socket.IO managers (`MessageSocketManager`, `SocialSocketManager`) expose Combine publishers; handlers either mutate `@Published` arrays directly or route into the GRDB persistence actor. Translation/transcription arrive asynchronously via socket events after the initial fetch. Android: a Socket.IO wrapper exposing `Flow`s; collectors write to Room.

**Performance techniques worth keeping**: anticipatory pagination prefetch, parallel media prefetch with TaskGroup + separate video preroll, the immutable-id strategy that avoids list-cell remounts, token-bucket rate limiting for reactions, leaf-view primitives over `@ObservedObject` singletons.

**Anti-patterns / tech debt — do NOT carry over**: (1) the GRDB↔CacheCoordinator dual-write — build one Room source of truth; (2) the giant 2840-line `ConversationViewModel` and its hand-rolled double-optional memoization — split into repository + use-cases, use Room queries; (3) E2EE silently falling back to plaintext on encrypt failure (MVP shortcut explicitly flagged in code) — Android should fail closed or surface an error; (4) `print("[DIAG]…")`/`print("[SendFlow]…")` debug logging left in production code — use structured logging; (5) ViewModels co-located in View files (`ActiveSessionsViewModel`, `AffiliateViewModel`) — keep ViewModels in dedicated files; (6) hardcoded hex accent colors in some screens (`AboutView`, `AffiliateView`) instead of the theme palette.

### Portable user-facing features / capabilities
- [ ] Real-time 1:1 / group chat with optimistic send, edit, delete (for-me / for-everyone), reactions, pin, reply, forward
- [ ] Message search within a conversation + global search across messages/conversations/users (FTS + network merge)
- [ ] Jump-to-quoted-message and jump-to-search-result with windowed pagination
- [ ] Prisme Linguistique — automatic per-user translation display with original/secondary language exploration
- [ ] Audio messages with transcription + translated audio (voice-cloned TTS)
- [ ] View-once / ephemeral / blurred messages and message effects
- [ ] Live location sharing
- [ ] Starred/bookmarked messages and local edit history
- [ ] Offline message send + outbox replay with retry/rollback
- [ ] Social feed: posts, comments, threaded replies, like, bookmark, repost/quote, share, report, pin
- [ ] Mood statuses (ephemeral emoji statuses) with reactions
- [ ] Stories: multi-slide RAW publishing, offline-queued publish, background upload, retry, viewer tracking
- [ ] Author-only story MP4 export + external share (no backend upload)
- [ ] Voice-clone profile: consent wizard, sample upload, manage/delete, cloning toggle
- [ ] User profile view with stats, achievements, shared conversations, block/unblock
- [ ] Edit own profile (name, bio, avatar) with optimistic update
- [ ] Two-factor authentication setup/enable/disable + recovery codes
- [ ] Active-session management (revoke one / revoke all others)
- [ ] Affiliate / referral links: create, copy, share, delete, dashboard stats
- [ ] In-call audio voice effects (auto-tune, baby, demon, ambiance)
- [ ] Adaptive iPad/phone layout, About screen
