# iOS Audit — Part 09

Chunk: `chunk-09.txt` (21 files). Feature area: Main feature views — share/tracking links, GDPR (data export / storage / account deletion), profile editing, emoji picker, feed (posts, comments, composer, UIKit-backed list), calls (incoming + floating pill), friend requests, global search, guest conversations, licenses.

All paths absolute. Files read in full.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift

**Purpose**: Form to create a public share/invite link for a group/community conversation, controlling guest access requirements, anonymous-user permissions, and usage/expiration limits.

**Public API surface**:
- `struct CreateShareLinkView: View` — `onCreate: (CreatedShareLink) -> Void` callback; uses `@EnvironmentObject ConversationListViewModel`.
- `private struct ConversationPickerSheet: View` — searchable, grouped (Groupes / Communautés / Canaux & Public) conversation chooser.
- `private enum ExpirationOption: String, CaseIterable` — `never, h24, d7, d30, m3`; `label`, `iso8601` (computed expiry date as ISO8601 string).
- `private extension MeeshyConversation.ConversationType { var displayLabel }`.

**Key behaviors / logic**:
- Filters out `.direct` conversations (`sharableConversations`) — DMs cannot be shared.
- `requireAccount` toggle disables/dims nickname/email/birthday toggles; in `create()` those flags are forced false when `requireAccount` is true (`requireNickname && !requireAccount`).
- Anonymous permissions: messages/files/images/view-history toggles.
- Limits: max-uses stepper with dynamic step (1 / 10 / 100 based on magnitude), expiration menu.
- `create()` builds `CreateShareLinkRequest`, calls `ShareLinkService.shared.createShareLink(request:)` async; slug lowercased; live preview `meeshy.me/join/{slug}`.

**Dependencies / couplings**: `ShareLinkService` (SDK), `ConversationListViewModel`, `ThemeManager`, `HapticFeedback`, `Conversation`/`CreatedShareLink`/`CreateShareLinkRequest` (SDK).

**Android port**: Compose form screen; `ExpirationOption` → Kotlin enum with `Instant`/ISO8601 computed expiry; `ShareLinkRepository` suspend `createShareLink`. Use a `BottomSheet` for the conversation picker with `LazyColumn` grouped headers. Slug live-preview is a simple derived state.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/CreateTrackingLinkView.swift

**Purpose**: Form to create a marketing tracking link (short URL with UTM params + optional custom token).

**Public API surface**: `struct CreateTrackingLinkView: View` — `onCreate: (TrackingLink) -> Void`.

**Key behaviors / logic**:
- Required field: destination URL (`isValid` = non-empty + parseable `URL`).
- Collapsible UTM section (campaign / source / medium).
- Optional custom token (6-char min hinted, not enforced client-side).
- `create()` builds `CreateTrackingLinkRequest`, calls `TrackingLinkService.shared.createLink(req)`.

**Dependencies / couplings**: `TrackingLinkService`, `TrackingLink`, `CreateTrackingLinkRequest` (SDK), `ThemeManager`, `HapticFeedback`.

**Android port**: Straightforward Compose form; URL validation via `Patterns.WEB_URL` or `Uri.parse`. `TrackingLinkRepository.createLink` suspend.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/DataExportView.swift

**Purpose**: GDPR data-export screen — choose format (JSON/CSV) and content scope (messages/media/contacts), request export, share resulting file.

**Public API surface**:
- `struct DataExportView: View` — init with injected `DataExportServiceProviding` (defaults `DataExportService.shared`) — protocol-based DI.
- `enum ExportFormat: String, CaseIterable, Identifiable` — `json`, `csv`; `icon`, `apiValue`.
- `private struct ExportWrapper: Encodable` — custom `encode(to:)` wrapping `DataExportData` for sharing.

**Key behaviors / logic**:
- `performExport()`: builds type list (`profile` always; `messages`/`contacts` conditional), picks one format (csv preferred if selected), calls `service.requestExport(format:types:)`.
- Encodes result to pretty-printed JSON, presents `ShareSheet` (UIActivityViewController) with the `Data`.
- Note: `includeMedia` toggle exists but is NOT passed to the type list — UI/logic mismatch (media never exported). Tech debt.

**Dependencies / couplings**: `DataExportService` / `DataExportServiceProviding`, `ShareSheet`, `HapticFeedback`, `ThemeManager`, `MeeshyUI`.

**Android port**: Compose screen; `DataExportRepository` interface (good DI pattern to keep). Export sharing via `Intent.ACTION_SEND` + `FileProvider`. Fix the `includeMedia` mismatch in the port.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/DataStorageView.swift

**Purpose**: Storage management screen — explains media cache, lets user clear it.

**Public API surface**: `struct DataStorageView: View`.

**Key behaviors / logic**:
- `clearCache()` clears 4 cache stores via `CacheCoordinator.shared`: `images`, `audio`, `video`, `thumbnails` (`.clearAll()` each, async).
- Confirmation alert before clearing; toast on success.
- Static info text: cached files auto-deleted after 7 days.

**Dependencies / couplings**: `CacheCoordinator` (SDK 3-tier cache), `ToastManager`, `HapticFeedback`, `ThemeManager`.

**Android port**: Compose screen; cache manager (`CacheCoordinator` equivalent — Coil disk cache + custom audio/video/thumbnail stores). No cache-size display currently (could add).

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/DeleteAccountView.swift

**Purpose**: Account deletion screen — typed-phrase confirmation + final alert, then shows email-confirmation success state.

**Public API surface**: `struct DeleteAccountView: View`.

**Key behaviors / logic**:
- Requires exact phrase `"SUPPRIMER MON COMPTE"` typed; delete button disabled otherwise; checkmark appears on match.
- Two-step confirm: button → final destructive alert → `performDeletion()`.
- `performDeletion()` calls `AccountService.shared.deleteAccount(confirmationPhrase:)`; on success swaps to `emailConfirmationView` (account not deleted immediately — email confirmation required).
- Warning card lists what is lost (conversations, messages, media, contacts, settings).

**Dependencies / couplings**: `AccountService`, `AuthManager`, `ThemeManager`, `HapticFeedback`.

**Android port**: Compose screen with `OutlinedTextField` (monospace), `AlertDialog` for final confirm. `AccountRepository.deleteAccount`. The confirmation phrase is French — localize.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/DiffableTypes.swift

**Purpose**: Section/item identifier enums + typealiases for `UICollectionViewDiffableDataSource` (Swift 6 `nonisolated` + `Sendable` requirement).

**Public API surface**:
- `enum MessageListSection { case main }`, `enum MessageListItem { case message(localId:) }`.
- `enum FeedListSection { case main }`, `enum FeedListItem { case textPost(id:) / mediaPost(id:) }`.
- `enum CommentListSection { case topLevel(commentId:) }`, `enum CommentListItem { case comment(id:) / loadMoreReplies(parentId:, remaining:) }`.
- Typealiases: `MessageListDataSource`, `FeedListDataSource`, `CommentListDataSource`.

**Key behaviors / logic**: All `Hashable, Sendable`. Items reference data by id only — diffing keyed on identity, not value.

**Android port**: No direct equivalent needed — Compose `LazyColumn` uses `key =` lambdas + `ListAdapter`/`DiffUtil` only if a RecyclerView is used. The pattern (item = id reference, data looked up separately) maps to a `LazyColumn(items, key = { it.id })` reading from a state-held list.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift

**Purpose**: Edit-profile screen — avatar picker, editable display name + bio, read-only account fields.

**Public API surface**: `struct EditProfileView: View` — init injects `EditProfileViewModel` (default new instance) via `@StateObject`; `@EnvironmentObject AuthManager`.

**Key behaviors / logic**:
- Avatar via `PhotosPicker`; on selection `viewModel.loadSelectedPhoto(item)`; shows `avatarPreviewImage` or `MeeshyAvatar`.
- Bio with `bioMaxLength` enforcement (truncates on `onChange`), live char counter (red at limit).
- Read-only rows: email, phone, username (`@`-prefixed).
- `saveButton` disabled unless `viewModel.hasChanges`; calls `viewModel.saveProfile { dismiss() }`.
- Success overlay shown via `viewModel.showSuccess`.

**Dependencies / couplings**: `EditProfileViewModel` (separate file — not in this chunk), `AuthManager`, `MeeshyAvatar`, `MeeshyColors`, `ThemeManager`, `PhotosUI`.

**Android port**: Compose screen + `EditProfileViewModel` (Hilt). Avatar picker via `ActivityResultContracts.PickVisualMedia`. `hasChanges`/`showSuccess` as `StateFlow`. Bio length enforced in VM.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift

**Purpose**: Full emoji picker with FR/EN keyword search, 10 categories, frequent/recent persistence, quick-reactions row.

**Public API surface**:
- `enum EmojiGridCategory: String, CaseIterable, Identifiable` — recent/smileys/people/animals/food/activities/travel/objects/symbols/flags; `icon`, `emojis` (large hardcoded arrays).
- `final class EmojiDataManager: @unchecked Sendable` — singleton; `searchEmojis(_:)` (literal contains + keyword map), private `emojiMatchesKeyword` (FR/EN keyword → emoji-list map).
- `struct EmojiPickerView: View` — embeddable; `recentEmojis`, `onSelect`; `@AppStorage("frequentEmojis")` persisted as JSON `Data`.
- `struct EmojiPickerSheet: View` — `NavigationView`-wrapped sheet wrapper.
- `struct EmojiScaleButtonStyle: ButtonStyle` — scale-up on press.

**Key behaviors / logic**:
- `selectEmoji` updates frequent list (dedup, prepend, cap 24), persists to `@AppStorage`.
- Search hides category tabs; recent tab shows quick-reactions grid + recent grid; otherwise 8-col `LazyVGrid`.
- Bilingual keyword search (heart/coeur, smile/sourire, etc.).

**Dependencies / couplings**: Self-contained (only SwiftUI); no SDK. Uses `Color.accentColor`, `UIColor.systemGray6`.

**Android port**: Compose `BottomSheet` with `LazyVerticalGrid`; emoji categories as Kotlin enum with hardcoded arrays. Frequent emojis persisted via DataStore (JSON). Keyword map → Kotlin `Map<String, List<String>>`. Consider Android emoji-compat for rendering consistency.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift

**Purpose**: Comments bottom sheet for a feed post — threaded comments with auto-preview replies, optimistic heart likes, live socket updates, mention-aware composer.

**Public API surface**:
- `struct ThreadedCommentSection: View` — renders a top-level comment + replies (auto-preview first 2, expandable for all); mood/story/presence resolvers.
- `struct CommentsSheetView: View` — main sheet; `post`, `accentColor`, `onSendComment`, `onLikeComment`; init creates `MentionComposerController`.
  - `static func computeLikedIds(from: [APIPostComment]) -> Set<String>` — testable seeding from `currentUserReactions`.
- `struct CommentRowView: View, Equatable` — single comment row, Prisme Linguistique flag toggle (original/translated), like/reply/ellipsis actions.
- `struct FeedCard: View` — legacy thin wrapper around `FeedPostCard`.

**Key behaviors / logic**:
- `repliesMap: [String: [FeedComment]]`, `expandedThreads`, `loadingReplies` manage thread state.
- Hoisted optimistic like state: `likedIds`, `likeDelta` (count delta), `heartInFlightIds` (rapid-tap guard).
- `toggleCommentLike` — optimistic flip + `SocialSocketManager.addCommentReaction/removeCommentReaction`; rollback on error.
- Joins/leaves post room on appear/disappear; `onReceive` for `commentAdded`, `commentReactionAdded/Removed` — distinguishes own user (`likedIds`) vs others (`likeDelta`).
- `.task` hydrates `repliesMap` from `CacheCoordinator.comments` cache (`replies-{commentId}` key) before network — cache-first.
- `loadReplies` resolves translations via `PostDetailViewModel.resolveCommentTranslation`, persists to cache.
- Composer: `UniversalComposerBar` with effects/blur, reply banner, mention suggestions panel.

**Dependencies / couplings**: `SocialSocketManager`, `PostService`, `CacheCoordinator`, `PostDetailViewModel`, `StatusViewModel`, `StoryViewModel`, `PresenceManager`, `AuthManager`, `MentionComposerController`, `UniversalComposerBar`, `UserProfileSheet`, `MeeshyAvatar`.

**Android port**: Compose `BottomSheet`; `CommentsViewModel` holding `repliesMap`/`expandedThreads`/optimistic like maps as `StateFlow`. Socket events via repository `Flow`. Cache-first reply hydration → Room/disk cache. `CommentRowView` is `Equatable` for re-render skipping — Compose handles this with stable params + `@Stable` data classes. Mention controller → its own VM/state holder.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/FeedListView.swift

**Purpose**: Thin `UIViewControllerRepresentable` bridging `FeedListViewController` (UIKit) into SwiftUI.

**Public API surface**: `struct FeedListView: UIViewControllerRepresentable` — `store: FeedStore`.

**Android port**: N/A — Compose `LazyColumn` is the native list. No bridge needed.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/FeedListViewController.swift

**Purpose**: UIKit `UICollectionView` + `UICollectionViewDiffableDataSource` backing for the feed — high-performance scrolling alternative to the SwiftUI `ScrollView`.

**Public API surface**: `final class FeedListViewController: UIViewController` — init `store: FeedStore`; `UICollectionViewDelegate` extension.

**Key behaviors / logic**:
- `UICollectionViewCompositionalLayout` with estimated-height (200) items.
- Two cell registrations: `TextPostCell`, `MediaPostCell` (based on `post.mediaJson != nil`).
- `applySnapshot` rebuilds diffable snapshot from `store.posts`.
- `observeStore` subscribes `store.postsDidChange` (Combine) → re-applies snapshot.
- `scrollViewDidScroll` triggers `store.loadOlder()` when within 300pt of bottom (infinite scroll).

**Key architectural note**: This is a **performance escape hatch** — the UIKit list is gated behind `FeedView.useUIKitList` (currently `false`). The SwiftUI `LazyVStack` path is the default.

**Dependencies / couplings**: `FeedStore`, `TextPostCell`/`MediaPostCell` (not in chunk), `FeedListDataSource`/`FeedListItem`/`FeedListSection` (DiffableTypes.swift).

**Android port**: Compose `LazyColumn` is already high-performance — the UIKit-collection-view escape hatch is NOT needed on Android. Infinite scroll via `LazyListState` reaching end; `FeedStore` → repository with paging (Paging 3 library or manual). Do not port the dual-list mechanism.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift

**Purpose**: `FeedPostCard` extension rendering media previews — adaptive multi-image grid layouts + per-type single-media views.

**Public API surface (extension methods on `FeedPostCard`)**:
- `var mediaPreview` — grid layouts for 1/2/3/4/5+ media (5+ shows `+N` overlay).
- `galleryImageView(_:)` — image cell with video/audio overlays.
- `openFullscreen(_:)`, `mediaIsCompact(_:)`.
- `singleMediaView(_:)` → `imageMediaView`, `videoMediaView`, `audioMediaView`, `documentMediaView`, `locationMediaView`.

**Key behaviors / logic**:
- Multi-image collage layouts: 1=single, 2=side-by-side, 3=1 large+2 stacked, 4=2×2, 5+=2 then 3 with `+N`.
- `ProgressiveCachedImage` with thumbHash + thumbnail + full URL (progressive load).
- Single image uses real aspect ratio when width/height known.
- Video → `InlineVideoPlayerView`; audio → `AudioPlayerView` with transcription; document → metadata card; location → map placeholder card.
- `mediaIsCompact` (audio/document/location) skips fixed 220pt height.

**Dependencies / couplings**: `FeedMedia`, `ProgressiveCachedImage`, `InlineVideoPlayerView`, `AudioPlayerView`, `MessageAttachment` (`toMessageAttachment()`), `ThemeManager`.

**Android port**: Compose; collage layouts via `Row`/`Column` with weights or a custom `Layout`. `ProgressiveCachedImage` → Coil with thumbHash placeholder (thumbhash decoder lib). Video/audio players → ExoPlayer/Media3 components. Document/location cards trivial.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift

**Purpose**: Single feed post cell — author header, expandable text, Prisme Linguistique translation flags, media, repost/quote, actions bar, top-3-comments preview.

**Public API surface**: `struct FeedPostCard: View, Equatable` — large param surface: `post`, optional socket-driven `isLiked`/`displayLikeCount`/`isHeartInFlight`, ~13 action callbacks (`onLike`, `onRepost`, `onQuote`, `onShare`, `onBookmark`, `onSendComment`, `onLikeComment`, `onSelectLanguage`, `onTapPost`, `onTapRepost`, `onDelete`, `onReport`, `onPin`), mood data (`authorMoodEmoji`, `onAuthorMoodTap`, `moodLookup`).

**Key behaviors / logic**:
- **Prisme Linguistique**: `currentDisplayLangCode` resolves preferred content language; `effectiveContent` shows translation or original; `secondaryContent`/`secondaryLangCode` inline secondary-translation panel; `buildAvailableFlags()` (original + preferred langs available as translations, minus active); `handleFlagTap` switches active/secondary or requests translation via `onSelectLanguage`.
- Text truncation: 20-word limit with "voir plus / voir moins" expansion.
- `isStoryRepost` — POST that reposts a STORY renders `StoryRepostEmbedCell` instead of standard media+repost.
- Optimistic likes: `effectiveIsLiked`/`effectiveLikeCount` prefer socket-driven props over `post.*`; heart-burst animation.
- `repostView` — quoted/reposted-content card (tappable to original).
- `commentsPreview` — top-3 comments by likes, stacked avatars of remaining commenters, "Voir N commentaires".
- Author header: mood/profile avatar, repost indicator, language flag strip, context menu (copy/share/bookmark/pin/delete/report).
- **Leaf-view perf**: `theme` read directly (no `@ObservedObject`), `Equatable` conformance compares post id/likes/isLiked/commentCount/translatedContent/mood — enables `.equatable()` in `ForEach`.

**Dependencies / couplings**: `FeedPost`/`FeedComment`/`RepostContent`/`FeedMedia` (SDK), `CommentsSheetView`, `PostTranslationSheet`, `UserProfileSheet`, `StoryRepostEmbedCell`, `ConversationMediaGalleryView`, `LanguageDisplay`, `MeeshyAvatar`, `AuthManager`, `ConversationViewModel.MediaSenderInfo`.

**Android port**: Compose `FeedPostCard` composable; the heavy callback surface → a single sealed `FeedPostAction` event channel to the VM (cleaner than 13 lambdas). Prisme Linguistique logic should move to VM/use-case (`resolveDisplayLanguage`, `buildAvailableFlags`) — keep composable thin. `Equatable` → stable `@Immutable` data classes. Story-repost embed reuses the story renderer.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift

**Purpose**: `FeedView` extension — composer attachment handling (photo/video/camera/file/location), TUS upload, post publishing; plus standalone `FeedComposerSheet` (fullscreen composer used for quotes & overlay).

**Public API surface**:
- `extension FeedView` — `handleFeedPhotoSelection`, `handleFeedCameraCapture`, `handleFeedCameraVideo`, `handleFeedFileImport`, `handleFeedLocationSelection`, `publishPostWithAttachments`, `publishAudioPost`, `feedPendingAttachmentsRow`, MIME/icon/label helpers.
- `struct FeedComposerSheet: View` — fullscreen composer (`viewModel`, `initialText`, `pendingAttachmentType`, optional `quotePost`, `onDismiss`); duplicate handler set.
- `private struct EditingAttachmentItem: Identifiable`.

**Key behaviors / logic**:
- Photo/video selection: video data → temp file → `MediaCompressor.shared.compressVideo(context:.feedPost)`, thumbnail via `AVAssetImageGenerator`; image → `MediaCompressor.compressImageData`.
- Camera capture/video, file import (security-scoped resource), location (`MessageAttachment.location`).
- `publishPostWithAttachments`: text-only path → `viewModel.createPost`; with files → `TusUploadManager` per-file upload (thumbHash from thumbnails), progress via Combine `progressPublisher`, then `createPost(mediaIds:)`.
- `publishAudioPost` — audio TUS upload + `createPost` with `mobileTranscription`.
- `FeedComposerSheet`: visibility menu (PUBLIC/FRIENDS/PRIVATE), language picker, image/video preview editors (`MeeshyImagePreviewView`, `MeeshyVideoPreviewView`), quote mode → `viewModel.repostPost(isQuote:true)`.

**Key tech-debt note**: Handler logic is **duplicated** between the `FeedView` extension and `FeedComposerSheet` (two nearly identical implementations of photo/camera/file/publish handlers). Do NOT carry this duplication to Android.

**Dependencies / couplings**: `MediaCompressor`, `TusUploadManager`, `MessageAttachment`, `FeedViewModel`, `AudioPostComposerView`, `AudioLanguagePickerView`, `CameraView`, `LocationPickerView`, `MeeshyImagePreviewView`/`MeeshyVideoPreviewView`, `UploadProgressBar`, `MeeshyConfig`, `APIClient`, `ToastManager`.

**Android port**: One shared `PostComposerViewModel` owning attachment state + upload — eliminate duplication. Media compression → custom (MediaCodec/Transformer for video, Bitmap for images). TUS upload client (tus-android or custom OkHttp). Pickers: PhotoPicker, `ACTION_OPEN_DOCUMENT`, CameraX, location picker. Progress as `StateFlow`.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/FeedView.swift

**Purpose**: Main social feed screen — post list, composer placeholder + fullscreen composer overlay, infinite scroll, new-posts banner, socket-driven reactions, impression tracking, persistence wiring.

**Public API surface**: `struct FeedView: View` — `@StateObject FeedViewModel`, `@EnvironmentObject Router`/`StatusViewModel`, many `@State` for composer/attachments.
- `static func computePostLikedIds(from: [FeedPost]) -> Set<String>` — testable seeding.

**Key behaviors / logic**:
- **Dual list path**: `useUIKitList` flag toggles UIKit `FeedListView` vs SwiftUI `feedScrollView` (currently SwiftUI default).
- Post reaction state hoisted to parent: `postLikedIds`, `postLikeDelta`, `postHeartInFlightIds` — feed list does NOT join per-post socket rooms (too many); `togglePostHeart` optimistic + `SocialSocketManager.addPostReaction/removePostReaction` with rollback.
- `feedScrollView`: `MeeshyRefreshableScroll` (branded pull-to-refresh), `LazyVStack` with composer placeholder, `ConnectionBanner`, error/empty states, `SkeletonFeedList` (cold-start only via `SkeletonVisibilityResolver`), `ForEach(posts)` with `.equatable()`.
- Per-post `onAppear`: `loadMoreIfNeeded`, `prefetchMediaForPost`, `prefetchComments`, `trackImpression`.
- `.task`: lazily wires persistence — `FeedStore` + `FeedSocketHandler` from `DependencyContainer`, `store.startObserving(dbPool:)`, `store.loadInitial()`, then `loadFeed()`; seeds liked state; `subscribeToSocketEvents`.
- `onChange(of: posts)` merges liked state for new pages (preserves optimistic state).
- `onReceive` socket `postReactionAdded/Removed` — own-user vs others.
- New-posts banner → scroll-to-top + `acknowledgeNewPosts`.
- Impression tracking: `pendingImpressionIds` debounced 3s `Timer`, batch `PostService.recordImpressions`.
- Composer placeholder + fullscreen `composerOverlay` (ZStack overlay, not sheet) with toolbar (photo/camera/emoji/file/location/audio), visibility menu, language picker.

**Dependencies / couplings**: `FeedViewModel`, `FeedStore`, `FeedSocketHandler`, `DependencyContainer`, `SocialSocketManager`, `PostService`, `Router`, `StatusViewModel`, `CollapsibleHeader`, `MeeshyRefreshableScroll`, `ConnectionBanner`, `SkeletonFeedList`, plus all composer deps.

**Android port**: `FeedScreen` composable + `FeedViewModel` (Hilt). `LazyColumn` with `key`; infinite scroll via `LazyListState`; pull-to-refresh via `PullRefreshIndicator`. Hoisted reaction state → VM `StateFlow` maps. Socket events via repository `Flow`. Impression tracking → debounced `Flow` (`debounce(3s)` + batch). Persistence: `FeedStore` ≈ Room DAO + repository; `dbPool` → Room. Skeleton cold-start gating logic worth porting (`SkeletonVisibilityResolver`). Drop the UIKit dual-list path.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/FloatingCallPillView.swift

**Purpose**: Picture-in-picture floating call pill — compact ongoing-call control shown as a RootView overlay.

**Public API surface**: `struct FloatingCallPillView: View` — `@ObservedObject CallManager.shared`.

**Key behaviors / logic**:
- Visible only when `callManager.displayMode == .pip && callState.isActive`.
- Avatar (initial), remote username, monospaced duration timer (green).
- Controls: mute, speaker, expand, hangup; tap pill → expand to fullscreen (`displayMode = .fullScreen`).
- Uses `@ObservedObject` on singleton directly (not `@EnvironmentObject`) — comment explains overlay closures don't propagate environment objects.

**Dependencies / couplings**: `CallManager` (singleton), `MeeshyColors`, `HapticFeedback`, `.pressable()`.

**Android port**: Compose overlay (or system PiP / bubble). `CallViewModel`/`CallManager` singleton observed via `collectAsState`. Duration formatting trivial. Android may use a foreground-service notification + a Compose overlay anchored to the activity.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift

**Purpose**: List of received friend requests with accept/reject actions.

**Public API surface**:
- `struct FriendRequestListView: View` — `@StateObject FriendRequestListViewModel`.
- `@MainActor final class FriendRequestListViewModel: ObservableObject` — `@Published requests`, `isLoading`, `errorMessage`; `loadRequests()`, `respond(to:accepted:)`.

**Key behaviors / logic**:
- `loadRequests` → `FriendService.shared.receivedRequests()`.
- `respond` → `FriendService.respond(requestId:accepted:)`, removes from list optimistically on success.
- Row: avatar (mood/presence), name/username, optional message, relative time; accept (green gradient) / reject (gray) buttons.
- `relativeTime` — French relative formatter.

**Dependencies / couplings**: `FriendService`, `FriendRequest` (SDK), `StatusViewModel`, `MeeshyAvatar`, `DynamicColorGenerator`.

**Android port**: `FriendRequestsScreen` + `FriendRequestsViewModel` (Hilt). `requests` as `StateFlow`. `FriendRepository.receivedRequests` / `respond`. Relative-time via `DateUtils.getRelativeTimeSpanString`.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift

**Purpose**: Global search across messages, conversations, and users with tabbed results, recent searches, and Prisme-aware last-message summaries.

**Public API surface**: `struct GlobalSearchView: View` — `@StateObject GlobalSearchViewModel`, `@EnvironmentObject ConversationListViewModel`/`Router`/`StatusViewModel`.

**Key behaviors / logic**:
- Tab bar (`SearchTab`: messages/conversations/users) with result-count badges floated as icon overlays (deliberate: avoids label wrapping).
- States: searching indicator, recent searches (when query < 2 chars), empty results, per-tab result lists.
- Recent searches: add/remove/clear via VM (persisted).
- Result rows with staggered appear animation; `highlightedText` highlights query match (case/diacritic-insensitive `AttributedString`).
- `conversationLastMessageLabel` — handles `lastMessageSummaryKind()`: hidden / viewOnce / expired / ephemeralActive / standard (ephemeral & hidden message privacy states).
- Navigation: message tap → `router.push(.conversation)`; conversation tap → push; user tap → `UserProfileSheet`.
- Extensive accessibility labels (localized).

**Dependencies / couplings**: `GlobalSearchViewModel` (not in chunk), `GlobalSearchMessageResult`/`ConversationResult`/`UserResult`, `MeeshyConversation.ConversationType`, `Router`, `ConversationListViewModel`, `StatusViewModel`, `UserProfileSheet`, `EmptyStateView`, `MeeshyAvatar`.

**Android port**: `GlobalSearchScreen` + `GlobalSearchViewModel`. Debounced query `StateFlow`; tabbed results (`TabRow` + `LazyColumn`). Recent searches via DataStore. Query highlight via `AnnotatedString` + `SpanStyle`. Last-message summary kinds → sealed class. Result counts as badges.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/GuestConversationContainer.swift

**Purpose**: Container routing anonymous/guest users into a conversation — shows join flow if no session, else the conversation.

**Public API surface**:
- `struct GuestSession` — `identifier: String`, `context: AnonymousSessionContext?`.
- `struct GuestConversationContainer: View` — `session`, `onSessionCreated`, `onDismiss`.

**Key behaviors / logic**:
- If `session.context` present → `ConversationView(conversation:anonymousSession:)`.
- Else → `JoinFlowSheet(identifier:)`; on join, `joinResponse.toSessionContext` → `onSessionCreated`.

**Dependencies / couplings**: `ConversationView`, `JoinFlowSheet`, `Conversation`, `AnonymousSessionContext` (SDK).

**Android port**: `GuestConversationContainer` composable with conditional navigation: join flow screen vs conversation screen. `AnonymousSessionContext` model + `X-Session-Token` auth path (per CLAUDE.md anonymous-user auth).

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/IncomingCallView.swift

**Purpose**: Incoming-call screen — pulsing-ring avatar animation, caller info, accept/reject buttons.

**Public API surface**: `struct IncomingCallView: View` — `@ObservedObject callManager: CallManager` (passed in, NOT `.shared` — comment: avoids re-creating subscription on parent re-render).

**Key behaviors / logic**:
- 4 expanding stroked rings with staggered repeating animation; avatar bounce.
- **Reduce Motion**: all repeating animations disabled when `accessibilityReduceMotion` true (static layout shown) — accessibility-aware.
- Call type badge (audio/video).
- Accept → `callManager.answerCall()`; reject → `callManager.rejectCall()`.

**Dependencies / couplings**: `CallManager`, `MeeshyColors`, `.pressable()`.

**Android port**: `IncomingCallScreen` composable; respect Android's reduced-motion setting (`Settings.Global.ANIMATOR_DURATION_SCALE` / `LocalAccessibilityManager`). Full-screen incoming-call should use a full-screen `Notification` intent + `CallStyle` notification (Android 12+) for system integration. Accept/reject via `CallViewModel`.

---

## /home/user/meeshy/apps/ios/Meeshy/Features/Main/Views/LicensesView.swift

**Purpose**: Open-source licenses screen — static list of third-party libraries with license badges and repo links.

**Public API surface**:
- `struct LicensesView: View`.
- `private struct OpenSourceLicense: Identifiable` — name/author/licenseType/url.

**Key behaviors / logic**: Hardcoded license list (Socket.IO, Firebase, Kingfisher, WhisperKit, WebRTC, Starscream); cards are `Link`s opening the repo in Safari; badge color by license type.

**Tech-debt note**: List includes `Kingfisher` — but `apps/ios/CLAUDE.md` states Kingfisher was removed (2026-05). Stale list. Android port should reflect actual Android deps.

**Dependencies / couplings**: None (self-contained).

**Android port**: `LicensesScreen` — better: use the Gradle license-plugin (`com.mikepenz:aboutlibraries`) to auto-generate from actual dependencies rather than a hardcoded list. Links via `Intent.ACTION_VIEW`.

---

## Architecture observations

### State management
- Mixed model: `@StateObject` VMs (`FeedViewModel`, `EditProfileViewModel`, `FriendRequestListViewModel`, `GlobalSearchViewModel`), `@EnvironmentObject` singletons (`AuthManager`, `Router`, `StatusViewModel`, `ConversationListViewModel`, `StoryViewModel`), and `.shared` singletons accessed directly (`CallManager`, `SocialSocketManager`, `PresenceManager`, `ThemeManager`, `CacheCoordinator`).
- **Optimistic-update pattern is pervasive and consistent**: snapshot → local flip → network → rollback on failure. Implemented for post likes (`FeedView.togglePostHeart`) and comment likes (`FeedCommentsSheet.toggleCommentLike`), each with an in-flight guard set (`*HeartInFlightIds`) to prevent rapid-tap desync, and an own-user-vs-others split for socket echoes (`likedIds` for self, `likeDelta` for others). Port this verbatim to Android (`StateFlow` maps).
- Reaction/like state is **hoisted to the parent screen** (`FeedView`) rather than living in `FeedPost` values — keeps cells value-stable and `.equatable()`. Maps cleanly to Compose: VM holds reaction maps, cards receive primitives.

### Caching / SWR
- Cache-first is honored: `FeedCommentsSheet.task` hydrates `repliesMap` from `CacheCoordinator.comments` (`.fresh`/`.stale` branches) before network; `loadReplies` persists back. `FeedView` cold-start skeleton gated by `SkeletonVisibilityResolver.shouldShowSkeleton(isLoading:hasCachedData:)` — skeleton ONLY on empty cache. `FeedStore` + `dbPool` provide a persistent feed cache observed via Combine. Android: Room + repository `Flow`, skeleton only on empty cache.

### Concurrency
- `async/await` throughout; `Task { }` from view actions; `@MainActor` VMs. TUS uploads stream progress via Combine `PassthroughSubject`. Socket events delivered as Combine publishers, consumed via `.onReceive(...receive(on: .main))`.

### Navigation
- `Router` (NavigationPath) for push navigation (`router.push(.conversation/.postDetail)`); sheets/fullScreenCovers for modals; the feed composer is a **ZStack overlay** (`composerOverlay`), not a sheet. Guest flow is conditional-view routing.

### Performance techniques
- **UIKit `UICollectionView` + diffable data source escape hatch** (`FeedListViewController`) exists for the hot feed list, gated behind `FeedView.useUIKitList` (currently off). On Android this is unnecessary — `LazyColumn` is the native high-performance path; do NOT replicate the dual-list mechanism.
- Leaf-view re-render avoidance: `FeedPostCard`/`CommentRowView` are `Equatable` + read `ThemeManager` directly (no `@ObservedObject` on singletons), enabling `.equatable()` in `ForEach`. Compose equivalent: `@Immutable`/`@Stable` data classes + stable params.
- Impression tracking debounced (3s `Timer`, batched API call).

### Anti-patterns / tech debt — do NOT carry over
- **Duplicated composer/attachment handler logic** between `FeedView+Attachments` extension and `FeedComposerSheet` (two near-identical photo/camera/file/publish implementations). Android: one shared `PostComposerViewModel`.
- `FeedPostCard` has a **13+ callback parameter surface** — port as a single sealed `FeedPostAction` event channel.
- `DataExportView.includeMedia` toggle has no effect (never added to export type list) — UI/logic mismatch; fix in port.
- `LicensesView` hardcodes a stale list (includes removed `Kingfisher`) — Android should auto-generate licenses from real dependencies.
- Prisme Linguistique resolution logic (`currentDisplayLangCode`, `effectiveContent`, `buildAvailableFlags`) lives **inside the view** in `FeedPostCard` — move to a VM/use-case on Android (single source of truth, testable).
- French string literals scattered in views (`"SUPPRIMER MON COMPTE"`, button labels) — many newer files use `String(localized:)` but several (Create*/Data*/Delete* views) hardcode French. Android: full string-resource extraction.

### Portable user-facing features / capabilities
- [ ] Create share/invite link for groups & communities (guest access rules, anonymous permissions, max-uses, expiration, custom slug)
- [ ] Create marketing tracking link (destination URL, UTM params, custom token)
- [ ] GDPR data export (JSON/CSV, selectable content scope, share/save file)
- [ ] Media cache management (clear cached images/audio/video/thumbnails)
- [ ] Account deletion (typed-phrase confirmation, email-confirmation flow)
- [ ] Edit profile (avatar upload, display name, bio with char limit; read-only account fields)
- [ ] Emoji picker (10 categories, FR/EN keyword search, frequent/recent persistence, quick reactions)
- [ ] Social feed: post list with infinite scroll, pull-to-refresh, new-posts banner
- [ ] Create post (text, photos/videos, camera, files, location, audio with transcription, visibility, language)
- [ ] Quote / repost posts (including reposts of stories)
- [ ] Post reactions (heart like) with optimistic updates + live socket sync
- [ ] Adaptive multi-image collage layouts (1–5+ media) + fullscreen gallery
- [ ] Per-post translation (Prisme Linguistique: flag strip, inline secondary translation, request-translation)
- [ ] Threaded comments (auto-preview replies, expand threads, comment likes, mentions, effects/blur)
- [ ] Post impression tracking
- [ ] Incoming call screen (accept/reject, audio/video, reduce-motion aware)
- [ ] Floating PiP call pill (mute/speaker/expand/hangup, duration timer)
- [ ] Friend requests list (accept/reject)
- [ ] Global search (messages, conversations, users; recent searches; query highlighting)
- [ ] Guest/anonymous conversation join flow
- [ ] Open-source licenses screen
