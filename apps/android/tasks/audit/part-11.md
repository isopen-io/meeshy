# iOS Audit — Part 11

Files covered: 20. Feature areas: app shell / root navigation, settings & security, share links, social feed overlay, statuses, stories (tray, viewer, export), skeletons.

---

## apps/ios/Meeshy/Features/Main/Views/RootView.swift

**Purpose**: The authenticated app shell. Hosts the `NavigationStack`, the feed overlay, the draggable floating buttons, the radial menu ladder, and dispatches every deep-link / push / socket notification to a destination.

**Public API surface**:
- `struct StoryViewerRequest: Identifiable, Equatable` — `id: String`, `initialAction: StoryViewerInitialAction?`. Wrapper for `.fullScreenCover(item:)` to avoid the SwiftUI race where `isPresented` flips before sibling `@State` propagates.
- `struct RootView: View` — the shell.
- `extension View.menuAnimation(showMenu:delay:)` — scale/opacity/rotation spring for staggered menu items.
- `private struct PendingSettingsBannerInline`, `private struct PendingStoryBannerInline` — self-hiding offline-queue count banners.
- `private struct NotificationNavContext` — value type unifying `APINotification`, `SocketNotificationEvent`, `NotificationPayload` into one navigation context (type, conversationId, messageId, postId, postType, senderId/Username, storyContext).

**Key behaviors / business logic**:
- `@StateObject`s: `ThemeManager`, `ToastManager`, `StoryViewModel`, `StatusViewModel`, `ConversationListViewModel`, `Router`, `StoryViewerCoordinator`. `@ObservedObject`: `CallManager`, `NetworkMonitor`, `NotificationManager`. `@EnvironmentObject DeepLinkRouter`.
- ZStack layering with explicit `zIndex`: background (orbs), NavigationStack, feed overlay (50), floating buttons (100), menu dismiss (99), menu ladder (151/-1), offline banner (190), notification toast (201), pending-settings banner (189).
- `navigationDestination(for: Route.self)` is a giant switch covering ~30 routes (conversation, settings, profile, contacts, communityList/Detail/Create/Settings/Members/Invite, notifications, userStats, links, affiliate, trackingLinks, shareLinks, communityLinks, dataExport, postDetail, bookmarks, starredMessages, friendRequests, editProfile, storyNotificationTarget).
- `.task` boot sequence: connect `MessageSocketManager`, subscribe status socket events, start `ConversationSyncEngine.startSocketRelay()`, deferred retention cleanup (5s), `conversationViewModel.observeSync()`, register `StoryPublishService.setExecutor(storyViewModel)`, load stories/statuses/conversations, refresh unread count, cold-start push payload recovery.
- Deep link handling: `joinLink`/`chatLink` → `ShareLinkService.joinAuthenticated` (idempotent server-side join) → navigate to conversation; `conversation` → `navigateToConversationById` with 3-tier resolution (in-memory list → GRDB cache → network with one retry @600ms for the gateway commit race).
- `navigateFromNotification` is the central notification → route mapping (huge switch over `MeeshyNotificationType` legacy + new variants). Story comments route to `storyNotificationTarget` via `isStoryNotification` heuristic (`metadata.postType == "STORY"` OR cached post with non-nil `expiresAt`).
- Call presentation split: `displayMode == .fullScreen` → `CallView` cover; `.pip` → `FloatingCallPillView` overlay. Cover dismiss = minimize, not hang up.
- Free-position floating buttons persisted in `@AppStorage` as `"x,y"` normalized strings; menu ladder geometry computed from button position (expand up/down based on y<0.5).

**External dependencies & couplings**: Router, all VMs, `MessageSocketManager`, `ConversationSyncEngine`, `StoryPublishService`, `CacheCoordinator`, `SearchIndex`, `ShareLinkService`, `ConversationService`, `PushNotificationManager`, `SettingsActionQueue`, `DeepLinkParser`, `NotificationCenter` (10+ named notifications).

**Android-port note**: Map to a single-Activity `NavHost` (Navigation Compose) with a typed sealed `Route` class. The huge notification → route switch should become a `NotificationRouter` object (pure Kotlin). Deep links → Navigation Compose `deepLinks` + a `DeepLinkResolver`. Floating buttons / radial menu = custom Compose overlay layer in a `Box` with `zIndex`. The `.task` boot sequence maps to a `LaunchedEffect` in the root composable or an `AppStartupInitializer`. `@AppStorage` → `DataStore`. The 3-tier `navigateToConversationById` (memory → Room cache → network retry) is a strong pattern to keep; implement in a use-case. NotificationCenter named events → a shared `SharedFlow` event bus.

## apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift

**Purpose**: UI components extracted from RootView: themed floating buttons, the social feed overlay, the feed composer, and legacy wrapper shims.

**Public API surface**:
- `struct ThemedFloatingButton` — glass circular button with gradient stroke, badge, press animation.
- `struct ThemedActionButton` — gradient-filled action button with glow, badge (capped at 99), pulse.
- `struct ThemedFeedOverlay` — the full social feed (story tray + composer + infinite-scroll post list). `@StateObject FeedViewModel`.
- `struct ThemedFeedComposer` — multi-line text composer with attachment menu (photo/camera/file/location) + voice toggle.
- `struct ThemedFeedCard`, `struct FeedActionButton` — card + action buttons.
- Legacy shims: `FeedOverlay`, `ColorfulFeedOverlay`, `ColorfulFeedComposer`, `ColorfulFeedCard`, `ColorfulFeedAction`, `ColorfulQuickActionButton`, `QuickActionButton`, `FeedComposer`, `LegacyFeedCard`, `FeedAction`.

**Key behaviors / business logic**:
- `ThemedFeedOverlay`: optimistic post-like with socket reconciliation — `postLikedIds: Set<String>`, `postLikeDelta: [String:Int]`, `postHeartInFlightIds`. `togglePostHeart` flips local state, calls `SocialSocketManager.add/removePostReaction`, rolls back on failure. Listens to `postReactionAdded/Removed` socket subjects; own-user events update `postLikedIds`, other users update `postLikeDelta`.
- Infinite scroll via `loadMoreIfNeeded(currentPost:)` + `prefetchComments` on `.onAppear`.
- `FeedPostCard` is `.equatable()` and `.staggeredAppear(index:baseDelay:)` for list perf.
- Pull-to-refresh refreshes feed + stories + statuses.
- Composer attachment menu: floating capsule of icon buttons; `+` toggles, mic when open.

**External dependencies & couplings**: `FeedViewModel`, `StoryViewModel`, `StatusViewModel`, `ConversationListViewModel`, `Router`, `SocialSocketManager`, `StoryViewerContainer`, `FeedComposerSheet`, `StatusComposerView`, `AuthManager`, `StoryViewerView.heartEmoji`.

**Android-port note**: Feed overlay = a Compose `LazyColumn` modal sheet/overlay. The optimistic-like reconciliation (local set + delta map + in-flight set, socket reconcile) is the canonical pattern — implement in `FeedViewModel` with `StateFlow`. `.equatable()` cells → stable keys + `@Stable`/`@Immutable` data classes. Drop ALL legacy shim structs — do not port. The attachment menu = a Compose dropdown / floating action chip group.

## apps/ios/Meeshy/Features/Main/Views/SecurityView.swift

**Purpose**: Account security settings: password change, 2FA, email change/verify, phone change/verify, conversation-lock master PIN, active sessions.

**Public API surface**: `struct SecurityView: View`. No reusable types — all sections are private computed properties.

**Key behaviors / business logic**:
- 2FA via `TwoFactorViewModel` — setup / disable / backup-codes sheets (`TwoFactorSetupView`, `TwoFactorDisableView`, `TwoFactorBackupCodesView`).
- Conversation-lock PIN via `ConversationLockManager.shared` — modes `setupMasterPin` / `changeMasterPin` / `removeMasterPin` / `unlockAll` driven by `ConversationLockSheet`. Remove only allowed when `lockedCount == 0`.
- Email change: `UserService.changeEmail(ChangeEmailRequest)` → verification email; 60s resend cooldown via `Timer`; on scene re-activation while `emailSent`, refreshes session.
- Phone change: `UserService.changePhone(ChangePhoneRequest)` → SMS code → `verifyPhoneChange(VerifyPhoneChangeRequest)`; 6-digit numeric-filtered code field; 400 → "Code incorrect ou expire".
- Verification badges from `user.emailVerifiedAt` / `phoneVerifiedAt` (nullable DateTime pattern).

**External dependencies & couplings**: `AuthManager`, `TwoFactorViewModel`, `ConversationLockManager`, `UserService`, `MeeshyUser`, `APIError`, `ActiveSessionsView`, `ChangePasswordView`.

**Android-port note**: Compose screen with sections; back-stack via Navigation Compose. 2FA / PIN / sessions = sub-screens or modal bottom sheets. Email/phone change flows are stateful multi-step — model with a `SecurityViewModel` exposing per-section sealed UI states. Resend cooldown `Timer` → coroutine `delay` loop or `CountDownTimer`. Numeric code filtering → `OutlinedTextField` with `KeyboardType.Number` + input filter.

## apps/ios/Meeshy/Features/Main/Views/SettingsView.swift

**Purpose**: Main settings hub — profile card + grouped sections (account, appearance, voice profile, transcription, notifications, data, tools, support, about, logout).

**Public API surface**: `struct SettingsView: View`. Private generic helpers `settingsSection<Content>` and `settingsRow<Trailing>`.

**Key behaviors / business logic**:
- `@ObservedObject UserPreferencesManager.shared` (`prefs`) drives toggles/pickers via `prefs.updateNotification/updateAudio/updateApplication { ... }` mutation closures. `.task { await prefs.fetchFromBackend() }`.
- Theme picker: `ThemePreference.allCases` → `theme.preference` + `theme.syncWithSystem`, mirrored to `prefs` via `syncThemeToPrefs` (`AppThemeMode.auto/light/dark`).
- Interface language picker from `LanguageData.interfaceLanguages` (flag + nativeName).
- Notification toggles: pushEnabled / soundEnabled / vibrationEnabled.
- Transcription toggle: `prefs.audio.autoTranscribeIncoming`; engine label "Apple Speech (on-device)".
- Collapsible header (`CollapsibleHeader` + `ScrollOffsetPreferenceKey` + `coordinateSpace("scroll")`).
- Navigates via `Router` (profile, starredMessages) and a large set of `.sheet` presentations (privacy, notifications, security, blockedUsers, about, terms, privacyPolicy, licenses, support, dataStorage, mediaDownload, deleteAccount, stats, affiliate, dataExport, voice profile wizard/manage).
- Logout: confirm alert → `authManager.logout()` + `MessageSocketManager.disconnect()`.

**External dependencies & couplings**: `Router`, `AuthManager`, `UserPreferencesManager`, `ThemeManager`, `LanguageData`, ~16 sheet destination views.

**Android-port note**: Compose `LazyColumn` of `PreferenceCategory`-style sections. `UserPreferencesManager` → a `SettingsRepository` backed by DataStore + a backend sync. Collapsible header → `TopAppBar` with `enterAlwaysScrollBehavior` / `LargeTopAppBar`. The accessibility labels/hints are thorough — replicate via `contentDescription` + `semantics`.

## apps/ios/Meeshy/Features/Main/Views/ShareLinkDetailView.swift

**Purpose**: Detail screen for one share link — header card, action bar (copy/share/toggle/delete), stats, info.

**Public API surface**: `struct ShareLinkDetailView: View` — `init(link: MyShareLink)`.

**Key behaviors / business logic**:
- Local `@State isActive` seeded from `link.isActive`.
- Actions: copy `joinUrl` to clipboard (2s checkmark feedback); share via `UIActivityViewController`; `toggleActive` → `ShareLinkService.toggleLink(linkId:isActive:)`; `deleteLink` → `ShareLinkService.deleteLink` then `dismiss`.
- Stats: `currentUses`, `maxUses` (∞ when nil). Info rows: identifier, createdAt, optional expiresAt.

**External dependencies & couplings**: `MyShareLink`, `ShareLinkService`, `ThemeManager`, `HapticFeedback`.

**Android-port note**: Compose detail screen. Clipboard → `ClipboardManager`. Share → `Intent.ACTION_SEND` chooser. Confirmation dialog → `AlertDialog`. The 2s copy-feedback → coroutine `delay`.

## apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift

**Purpose**: List of the user's share links with a stats overview and create entry.

**Public API surface**:
- `struct ShareLinksView: View`.
- `@MainActor class ShareLinksViewModel: ObservableObject` — `links: [MyShareLink]`, `stats: MyShareLinkStats?`, `isLoading`; `load()`, `loadStats()`.

**Key behaviors / business logic**:
- Cache-first `load()`: `CacheCoordinator.shared.shareLinks.load(for:"list")` — `.fresh` returns immediately; `.stale` shows + background `refreshFromAPI`; `.expired/.empty` sets `isLoading` then refreshes.
- `refreshFromAPI` runs links + stats concurrently with `async let`, saves links to cache.
- Rows are `NavigationLink` → `ShareLinkDetailView`; per-row quick copy button; pull-to-refresh; empty state.
- `CreateShareLinkView` sheet on `+`.

**External dependencies & couplings**: `ShareLinkService`, `CacheCoordinator`, `MyShareLink`, `MyShareLinkStats`, `ConversationListViewModel` (env), `CreateShareLinkView`.

**Android-port note**: `ShareLinksViewModel` with `StateFlow`; cache-first via Room (`fresh/stale/expired/empty` → a `CacheResult` sealed class). `async let` → `async {}`/`awaitAll`. List → `LazyColumn` with navigation to detail.

## apps/ios/Meeshy/Features/Main/Views/SharePickerView.swift

**Purpose**: Bottom-sheet picker to share arbitrary content into a conversation.

**Public API surface**:
- `enum SharedContentType` — `.text(String)`, `.url(URL)`, `.image(UIImage)`, `.message(Message)`, `.story(item: StoryItem, authorName: String)`.
- `struct SharePickerView: View` — `sharedContent`, `onDismiss`, optional `onShareToConversation` callback.

**Key behaviors / business logic**:
- Content preview banner adapts icon/label/preview per `SharedContentType`.
- `loadConversations`: in-memory VM list → `CacheCoordinator.conversations` cache → `APIClient.offsetPaginatedRequest("/conversations", offset:0, limit:50)`.
- Filtered to `isActive` conversations + name search.
- `shareToConversation`: if `onShareToConversation` handler given, delegate; else POST `/conversations/:id/messages` with `SendMessageRequest` (sets `forwardedFromId` for `.message`, builds story link text for `.story`). Per-row in-flight spinner + sent checkmark.
- `contentToSend`: image → nil (no text); story → emoji + `https://meeshy.me/story/{id}` link.

**External dependencies & couplings**: `ConversationListViewModel`, `Router`, `StatusViewModel` (env), `CacheCoordinator`, `APIClient`, `SendMessageRequest`, `ToastManager`, `EmptyStateView`.

**Android-port note**: Modal bottom sheet. `SharedContentType` → Kotlin sealed class (use a bitmap/URI instead of `UIImage`). Reuse for both in-app share and the Android Share Sheet receiver (`ACTION_SEND` intent target). Cache-first conversation load same as elsewhere.

## apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonFeedPost.swift

**Purpose**: Cold-start placeholder for a feed post card; mirrors `FeedPostCard` layout.

**Public API surface**: `struct SkeletonFeedPost: View` (`mediaHeight`, `bodyLineCount`); `struct SkeletonFeedList: View` (`count`, default 3).

**Key behaviors / business logic**: Leaf view — no `@ObservedObject`/`@StateObject`; dark/light via `@Environment(\.colorScheme)` only. Uses `SkeletonShape` + `.skeletonShimmer()`. `accessibilityElement(children: .ignore)` + a "Chargement" label.

**Android-port note**: Compose skeleton composable with a shimmer `Brush` animation (Accompanist placeholder or custom). Pass `isDark: Boolean` or read `isSystemInDarkTheme()`.

## apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonProfileHeader.swift

**Purpose**: Cold-start placeholder for the profile header (banner + avatar + identity + bio + stats).

**Public API surface**: `struct SkeletonProfileHeader: View` (`bannerHeight`, `avatarDiameter`, `bioLineCount`).

**Key behaviors / business logic**: Leaf view, same skeleton rules. Avatar offset overlapping banner; 3 stat cells.

**Android-port note**: Compose skeleton; banner box + offset avatar via `Modifier.offset`.

## apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonStoryThumb.swift

**Purpose**: Cold-start placeholder for a story tray thumbnail + the horizontal tray row.

**Public API surface**: `struct SkeletonStoryThumb: View`; `struct SkeletonStoryTrayRow: View` (`count`, default 6).

**Key behaviors / business logic**: Leaf views; ring + avatar + label shapes; horizontal `ScrollView`.

**Android-port note**: Compose `LazyRow` of shimmer thumbs.

## apps/ios/Meeshy/Features/Main/Views/Skeletons/SkeletonVisibilityResolver.swift

**Purpose**: Pure decision helper — should a list/feed show skeletons or real content.

**Public API surface**: `public enum SkeletonVisibilityResolver` — `shouldShowSkeleton(loadState: LoadState, hasCachedData: Bool) -> Bool` and overload `shouldShowSkeleton(isLoading: Bool, hasCachedData: Bool)`.

**Key behaviors / business logic**: Skeleton only when NO cached data AND a load is in flight (`.loading`). Stale/fresh/loaded/idle/offline/error → false (fall through to content or empty state). Codifies the Instant-App "skeleton only on cold cache" rule.

**Android-port note**: Port verbatim as a Kotlin `object` with a `LoadState` sealed class. This is a single-source-of-truth helper — keep it pure and unit-tested.

## apps/ios/Meeshy/Features/Main/Views/StarredMessagesView.swift

**Purpose**: WhatsApp-style list of starred messages across all conversations.

**Public API surface**: `struct StarredMessagesView: View`; `private struct StarredRow`.

**Key behaviors / business logic**:
- `@StateObject StarredMessagesStore.shared` — `snapshots: [StarredMessageSnapshot]` (self-contained: sender, content preview, source conversation chip/accent color, sentAt).
- Context-menu remove; toolbar "Tout retirer"; empty state.
- Tap navigates via `Router.pendingHighlightMessageId` + `NotificationCenter.post("navigateToConversationById", object: conversationId)` then `dismiss` — reuses the highlight-in-conversation flow.

**External dependencies & couplings**: `StarredMessagesStore`, `Router`, `ThemeManager` (env), `StarredMessageSnapshot`.

**Android-port note**: Compose `LazyColumn`; `StarredMessagesStore` → a repository backed by local DB. Navigation via the shared event bus carrying `conversationId` + `highlightMessageId`.

## apps/ios/Meeshy/Features/Main/Views/StatsTimelineChart.swift

**Purpose**: 30-day activity line/area chart.

**Public API surface**: `struct StatsTimelineChart: View` — `timeline: [TimelinePoint]`, `color: String`.

**Key behaviors / business logic**: Uses Swift `Charts` — `LineMark` + `AreaMark` with catmullRom interpolation, gradient fill. `shortDate` parses `YYYY-MM-DD` → `DD/MM`.

**Android-port note**: Use a Compose chart library (Vico, or YCharts) — line + filled area. Date parsing trivial. `TimelinePoint` is a shared model.

## apps/ios/Meeshy/Features/Main/Views/StatusBarView.swift

**Purpose**: Horizontal "moods/statuses" bar (emoji pills) above the conversation list.

**Public API surface**: `struct StatusBarView: View` — `viewModel: StatusViewModel`, `onAddStatus`, optional `onTapStatus`.

**Key behaviors / business logic**:
- My-status pill (or Add pill) + other users' pills; error pill (tap retries `loadStatuses`); loading-more spinner.
- Infinite scroll via `loadMoreIfNeeded(currentStatus:)`.
- Tapping a pill opens a `popover(item:)` showing emoji, username, content, `via @user`, time remaining.
- Pills use `glassCard` + `breathingGlow`.

**External dependencies & couplings**: `StatusViewModel`, `StatusEntry`, `ThemeManager`.

**Android-port note**: Compose `LazyRow` of pill chips; popover → `Popup`/dropdown anchored to the pill. `StatusEntry` is a shared model.

## apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift

**Purpose**: Compose / republish a status (mood emoji + short text + visibility).

**Public API surface**:
- `enum StatusVisibility: String, CaseIterable` — `.public`/`.friends`/`.except`/`.only`, with `label` + `icon`.
- `struct StatusComposerView: View` — `viewModel: StatusViewModel`, optional `initialEmoji`/`initialText`/`viaUsername` (republish flow).

**Key behaviors / business logic**:
- 5-column emoji grid from `StatusViewModel.moodOptions`; toggle selection.
- Text field capped at 122 chars with live counter (turns error color >100).
- Visibility picker (horizontal chips); last choice persisted in `@AppStorage("lastStatusVisibility")`.
- Live preview pill (avatar + emoji badge + name + text).
- Publish → `viewModel.setStatus(emoji:content:visibility:visibilityUserIds:viaUsername:)`; `visibilityUserIds` passed only for `.except`/`.only`.

**External dependencies & couplings**: `StatusViewModel`, `MeeshyColors`, `HapticFeedback`.

**Android-port note**: Compose modal sheet. `StatusVisibility` → Kotlin enum. Emoji grid → `LazyVerticalGrid`. `@AppStorage` → DataStore. Char-cap via input filter. The `.except`/`.only` user-picker is referenced but not in this file — needs a member picker screen.

## apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift

**Purpose**: Author-only sheet that bakes the current story slide into an MP4 and presents the system share sheet. NEVER touches the Meeshy backend.

**Public API surface**: `struct StoryExportShareSheet: View` — `story: StoryItem`, `viewModel: StoryExportShareViewModel`; private `ShareWrapper`, `ActivityView` (UIActivityViewController wrapper).

**Key behaviors / business logic**:
- Phases: `idle / exporting / ready / sharing / failed` (from `StoryExportShareViewModel`).
- Language picker (Prisme Linguistique) — chosen language is baked into the MP4 overlay text; "Texte original" = nil.
- `prepare(story:)` on appear; `startExport` runs the bake with a linear progress; `sharedURL` drives the `UIActivityViewController` sheet; `finishSharing(success:)` then dismiss.
- Error alert from `viewModel.errorMessage`.

**External dependencies & couplings**: `StoryExportShareViewModel`, `StoryItem`, `StoryVideoExportService`/`StoryExporter` (via VM), `UIActivityViewController`.

**Android-port note**: Author-only local video export. Implement the MP4 bake with MediaCodec/Media3 Transformer (render overlays onto frames). Share via `Intent.ACTION_SEND` with a `FileProvider` URI. Keep the absolute rule: export is client-side only, never uploaded. Language picker stays — baked text language is viewer-chosen at export time.

## apps/ios/Meeshy/Features/Main/Views/StoryRepostEmbedCell.swift

**Purpose**: Renders a feed POST that reposts a STORY — outer post text + embedded read-only story canvas.

**Public API surface**: `struct StoryRepostEmbedCell: View` — `post: FeedPost`, `preferredContentLanguages: [String]?`.

**Key behaviors / business logic**:
- Single-level attribution header ("Reposté de @handle"); full repost chain preserved server-side (`RepostContent.originalRepostOfId`) but not displayed (MVP).
- Embeds `StoryReaderRepresentable(repost:preferredContentLanguages:mute:true)` at 9:16 aspect, rounded-clipped, muted for autoplay.
- Accessibility: labeled as a button to open fullscreen.

**External dependencies & couplings**: `FeedPost`, `StoryReaderRepresentable`.

**Android-port note**: Compose cell — text + an embedded muted story renderer at 9:16. The story renderer is a `UIViewRepresentable` on iOS; on Android it becomes a Compose `AndroidView` wrapping a custom story player view, or a fully-Compose story renderer.

## apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift

**Purpose**: Horizontal story carousel (my-story button + other users' rings) above the feed/conversation list.

**Public API surface**:
- `struct StoryTrayView: View` — `viewModel: StoryViewModel`, `onViewStory: (String)->Void`, optional `onAddStatus`.
- `private struct MyStoryButton` — extracted to avoid PAC issues with `@ViewBuilder` + `@EnvironmentObject`.
- `private struct StoryUploadOverlay` — circular upload-progress / failed-retry overlay on the avatar.
- `private struct StoryPreviewAssets: Identifiable` — slides + preloaded background/foreground images, video & audio URLs.

**Key behaviors / business logic**:
- Cache-first skeleton via `SkeletonVisibilityResolver.shouldShowSkeleton(isLoading:hasCachedData:)`.
- Reads `PresenceManager`/`ThemeManager` directly (NOT `@ObservedObject`) to avoid full-tray re-render on every presence/theme event — explicit perf decision.
- My-story button: tap opens own viewer (if has story) or composer; long-press context menu (view my story / add story / change mood); plus-badge composer entry; mood `💭` badge; `StoryUploadOverlay` during active upload (progress ring or failed state with retry/cancel).
- Story rings show `MeeshyAvatar` with `storyState` (unread/read), mood emoji, presence; count dots when >1 story.
- Composer flow: `fullScreenCover` → `StoryComposerView` with `onPublishAllInBackground` (RAW publish — `viewModel.publishStoryInBackground`) and `onPreview` (nested `fullScreenCover` → `StoryViewerView` in preview mode with preloaded assets). Preview dismiss posts `.storyComposerUnmuteCanvas`.

**External dependencies & couplings**: `StoryViewModel`, `StatusViewModel`, `Router`, `ConversationListViewModel`, `PresenceManager`, `StoryComposerView`, `StoryViewerView`, `StoryViewerContainer`, `StoryGroup`, `StorySlide`, `MeeshyAvatar`, `DynamicColorGenerator`.

**Android-port note**: Compose `LazyRow`. The deliberate "read singleton directly, don't observe" perf pattern → in Compose, do NOT collect presence/theme `StateFlow` inside the tray composable; pass snapshots or use derived state. Upload overlay = circular progress indicator. Story RAW-publish background flow is core — keep `publishStoryInBackground` decoupled from any local bake.

## apps/ios/Meeshy/Features/Main/Views/StoryViewerContainer.swift

**Purpose**: Reactive wrapper that shows a loading/not-found state until the requested user's story group is available, then transitions into `StoryViewerView`. Solves the cover-opens-before-load race.

**Public API surface**: `struct StoryViewerContainer: View` — `viewModel`, `userId: String?`, `isPresented` binding, optional `onReplyToStory`, `singleGroup`, `initialStoryIndex`, `presentationSource`, `initialAction`.

**Key behaviors / business logic**:
- `.task(id: uid)` runs `ensureGroupAvailable`: empty uid → not-found; group present → render; missing → `loadStories(forceNetwork:true)`, then 2.5s grace wait, then `timedOut = true`.
- `notFoundOverlay` with Retry + Close; `loadingOverlay` spinner; `closeButton` always present.
- `ConnectionBanner` overlaid (non-hit-testing).

**External dependencies & couplings**: `StoryViewModel`, `StoryViewerView`, `StoryViewerInitialAction`, `ConnectionBanner`.

**Android-port note**: A Compose composable that observes the VM's story groups; shows loading → content → error per a `StoryViewerLoadState`. The race it solves (navigation target opens before async data) is real in Compose too — keep the wrapper. `.task(id:)` → `LaunchedEffect(uid)`.

## apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift

**Purpose**: Dedicated View structs extracted from `StoryViewerView` so the deeply nested story canvas is its own type-metadata unit (the monolithic opaque type blew the Swift type-checker budget and crashed on low-memory devices).

**Public API surface**:
- `struct StoryGestureOverlayView` — tap-left/right navigation + long-press pause.
- `struct StoryComposerBarView` — bottom comment composer (`UniversalComposerBar` wiring, draft save/restore, effects, blur, emoji panel trigger).
- `struct StoryCardView` — the full ~10-layer story canvas (background, outgoing cross-dissolve reader, current `StoryReaderRepresentable`, loading spinner, voice caption, audio badge, translation badge, gradient scrims, gesture overlay, progress bars + header, action sidebar, big-reaction overlay, comments overlay, composer + emoji panel, full emoji picker, full language picker).
- `struct StoryViewerContentView` — root canvas: black base, offscreen `PrefetcherHostView`, geometry-wrapped card with transform stack (scale, corner radius, 3D rotation, shadow) + preview-mode close button.

**Key behaviors / business logic**:
- Story background: `gradient:c1,c2` prefix → `LinearGradient`, else hex color, else default indigo gradient.
- Translation badge surfaces `resolvedViewerLanguage` (Prisme Linguistique) discreetly.
- Big-reaction emoji: 3-phase burst/float animation (`bigReactionPhase` 0/1/2).
- Comments overlay (Instagram-style) with threaded replies (`storyCommentRepliesMap`, expanded threads, loading replies).
- Composer: drafts per `storyId` (`StoryDraft`), `MessageEffects` + blur flags packed into `effectFlags` bitmask; inline `EmojiKeyboardPanel` replaces system keyboard; swipe-down dismisses.
- Full language picker posts to `/posts/{id}/translate` with `targetLanguage`, records `LanguageUsageTracker` usage.
- `StoryCardView` takes an enormous parameter list (~60 `let`/`@Binding`/closures) — all state owned by `StoryViewerView`, passed down. This extraction is purely a compiler workaround.

**External dependencies & couplings**: `StoryReaderRepresentable`, `StoryProgressBarsView`, `StoryHeaderView`, `StoryActionSidebarView`, `StoryCommentsOverlayView`, `StoryCommentRowView`, `UniversalComposerBar`, `EmojiKeyboardPanel`, `EmojiFullPickerSheet`, `LanguagePickerSheet`, `PrefetcherHostView`, `StoryReaderPrefetcher`, `KeyboardObserver`, `APIClient`, `LanguageUsageTracker`, `MessageEffects`/`MessageEffectFlags`.

**Android-port note**: The story viewer is the most complex screen — design it cleanly from scratch on Android. The huge-parameter-list extraction is an iOS-compiler artifact: do NOT replicate it. Instead use a `StoryViewerViewModel` exposing one `StateFlow<StoryViewerUiState>` and let composables read it. The 10-layer canvas → a Compose `Box` with layers; story media renderer = `AndroidView` (ExoPlayer for video/audio) or a custom Compose renderer. Gesture overlay = `pointerInput` (tap zones + long-press). Effects bitmask, drafts-per-story, threaded comments, language-translate trigger, prefetcher are all portable concepts. Big-reaction animation = `Animatable` keyframes.

---

## Architecture observations

**State management**
- MVVM throughout: `ObservableObject` ViewModels with `@Published`; `@StateObject` when the view creates the VM, `@ObservedObject`/`@EnvironmentObject` when received. Android: ViewModels exposing `StateFlow`/`UiState`.
- Heavy use of singletons (`*Manager.shared`): `AuthManager`, `ThemeManager`, `ToastManager`, `NotificationManager`, `CallManager`, `NetworkMonitor`, `PresenceManager`, `ConversationLockManager`, `StoryPublishService`, `SettingsActionQueue`, `MessageSocketManager`, `SocialSocketManager`, `UserPreferencesManager`, `StarredMessagesStore`. Android: convert to Hilt-injected singletons (`@Singleton`).
- Deliberate "read singleton directly, do NOT `@ObservedObject`" perf pattern in leaf/list views (`StoryTrayView`, `MyStoryButton`, leaf bubbles) to avoid full subtree re-render on theme/presence events. In Compose: do not `collectAsState()` global flows in hot list items; pass snapshots / use `derivedStateOf`.

**Caching / SWR**
- Strong cache-first / stale-while-revalidate everywhere: `CacheCoordinator.shared.<store>.load(for:key)` returns `.fresh/.stale/.expired/.empty`. `.stale` is rendered immediately + silent background refresh; skeleton only on cold/empty cache. `SkeletonVisibilityResolver` codifies this as a pure, testable helper — port verbatim.
- 3-tier conversation resolution in `RootView.navigateToConversationById`: in-memory → GRDB disk cache → network (with one retry @600ms to dodge the gateway commit race). Excellent pattern — keep.

**Concurrency**
- `async/await` + `Task`; `@MainActor` ViewModels; `Task.detached(priority:)` for background cache refresh / cleanup; `async let` for parallel fetches.
- Optimistic updates with rollback + socket reconciliation (feed post likes: local set + delta map + in-flight set). This is the canonical pattern for all reactive actions.

**Navigation**
- Hybrid `NavigationStack(path:)` (Router-owned `NavigationPath`) for hierarchical flows + `ZStack` with explicit `zIndex` for overlays (feed, menu, banners, toasts, call pill). Android: single-Activity Navigation Compose `NavHost` for hierarchy; a Compose overlay layer (`Box` + zIndex) for floating UI.
- Notification/deep-link → route mapping is centralized but lives inline in `RootView` as a massive switch over legacy + new `MeeshyNotificationType` variants. Android: extract to a pure `NotificationRouter`.
- `NotificationCenter` named events used as an app-wide event bus (`navigateToConversation`, `handlePushNotification`, `sendMessageToUser`, `openProfileSheet`, `openStoryComposer`, `pushNavigateToRoute`, `storyComposerUnmuteCanvas`, etc.). Android: a single shared `SharedFlow` event bus.

**Performance techniques**
- `.equatable()` on feed cells; `.staggeredAppear`; `.drawingGroup()` to rasterize the static background orbs into one Metal texture; `LazyVStack`/`LazyHStack`.
- `StoryViewerView+Canvas.swift` exists ONLY because the monolithic story-viewer body exceeded the Swift type-checker budget and crash-instantiated type metadata on low-memory devices — the ~60-parameter `StoryCardView` extraction is an iOS-compiler workaround, NOT an architecture to copy. Android should build the story viewer from a clean `StoryViewerViewModel` + `UiState`.
- Offscreen `StoryReaderPrefetcher` host (1x1 view) for media prefetch.

**Anti-patterns / tech debt — do NOT carry over**
- `RootViewComponents.swift` legacy shim structs (`ColorfulFeedOverlay`, `LegacyFeedCard`, `FeedAction`, etc.) — dead aliases; drop entirely.
- Massive inline notification switch in `RootView` — extract.
- `StoryCardView`'s ~60-parameter init — iOS type-checker artifact; replace with a single observed `UiState`.
- `NotificationCenter`-as-event-bus with stringly-typed names (`Notification.Name("sendMessageToUser")`) — replace with typed sealed events.
- Self-inlined components "to avoid a project.pbxproj edit" (`PendingSettingsBannerInline`, `PendingStoryBannerInline`) — an Xcode-specific constraint; on Android just make them normal files.

**Portable user-facing features / capabilities**
- [ ] Authenticated app shell: conversation list home, navigation stack, overlays
- [ ] Draggable free-position floating buttons (feed + menu) with persisted positions
- [ ] Radial menu ladder (links, notifications, contacts, communities) with unread badge
- [ ] Social feed overlay: infinite-scroll posts, optimistic likes, repost/quote/share/bookmark, comments, prefetch
- [ ] Story tray carousel: my-story button, story rings, count dots, upload progress overlay with retry/cancel
- [ ] Story composer entry + RAW background publish + offline pending-story banner
- [ ] Story preview mode (pre-publish)
- [ ] Full story viewer: tap navigation, long-press pause, progress bars, reactions, comments (threaded), translation badge, audio badge, voice caption, big-reaction animation
- [ ] Author-only story MP4 export with language selection + system share (never uploaded)
- [ ] Story repost-embed cell in the feed
- [ ] Statuses/moods bar: emoji pills, popover details, infinite scroll
- [ ] Status composer / republish: emoji grid, 122-char text, visibility (public/friends/except/only)
- [ ] Settings hub: profile card, appearance/theme + interface language, notifications toggles, transcription, voice profile, data, tools, support, about, logout
- [ ] Security: password change, 2FA setup/disable/backup codes, email change+verify, phone change+SMS verify, conversation master-PIN, active sessions
- [ ] Share links: list + stats overview, detail (copy/share/activate/delete), create
- [ ] Generic in-app share picker (text/url/image/message/story → conversation) — reuse as the Android Share Sheet receiver
- [ ] Starred messages list with navigate-to-conversation highlight
- [ ] User stats 30-day activity chart
- [ ] Cold-start skeleton placeholders (feed post, profile header, story tray) gated by cache-first resolver
- [ ] Pending offline-settings sync banner
- [ ] Real-time notification toast + offline banner + connection banner
- [ ] Picture-in-picture call pill alongside full-screen call
- [ ] Universal Link / push / socket notification routing into the correct screen
