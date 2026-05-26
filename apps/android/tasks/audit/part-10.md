# iOS Audit — Part 10

Scope: 19 files from `apps/ios/Meeshy/Features/Main/Views/` — auth (login, magic link, onboarding), settings (notifications, privacy, media downloads, privacy policy), conversation creation/participants, the hot message-list (UIKit collection view bridge), feed post detail/translation, and message-reply/report flows.

---

## apps/ios/Meeshy/Features/Main/Views/LinksHubView.swift

- **Purpose**: Hub screen synthesizing every "link" type the platform offers (share, tracking, community, affiliate). Deep link `meeshy.me/links`.
- **Public API**: `struct LinksHubView: View`.
- **Key behaviors**:
  - Collapsible header (`CollapsibleHeader` + `ScrollOffsetPreferenceKey` driving `scrollOffset`).
  - 4 category cards, each navigates via `router.push(route)` to `.shareLinks` / `.trackingLinks` / `.communityLinks` / `.affiliate`; cards with a quick-create action present a sheet (`CreateShareLinkView`, `CreateTrackingLinkView`, `AffiliateCreateView`).
  - Pure presentation; no data loading.
- **Dependencies**: `Router`, `ConversationListViewModel` (env), `ThemeManager`, `HapticFeedback`.
- **Android-port note**: Compose screen with collapsible `TopAppBar` (`enterAlwaysScrollBehavior`) + `LazyColumn`. Cards = clickable `Card` rows routing through a NavController. Quick-create launches a `ModalBottomSheet`.

## apps/ios/Meeshy/Features/Main/Views/LoginView.swift

- **Purpose**: Primary authentication screen — supports saved-account picker, manual username/password login, and environment selection (dev/staging/prod/custom).
- **Public API**: `struct LoginView: View`. Internal `Field` focus enum.
- **Key behaviors**:
  - Two modes: `accountPickerSection` (when `authManager.savedAccounts` non-empty) vs `normalLoginSection`. Saved accounts removable via context menu (`removeSavedAccount`).
  - Simulator-only credential prefill (`atabeth` / test password) gated on `SIMULATOR_DEVICE_NAME` env.
  - `environmentSelector`: picks `MeeshyConfig.ServerEnvironment` (allCases), custom host text entry → `MeeshyConfig.shared.applyEnvironment`.
  - Animated ambient orbs, gradient brand title, error row driven by `authManager.errorMessage`.
  - Sheets: forgot password, magic link; full-screen cover: `OnboardingFlowView` registration.
  - Login via `await authManager.login(username:password:)`.
- **Dependencies**: `AuthManager` (env), `ThemeManager`, `MeeshyConfig`, `SavedAccount`, `MeeshyAvatar`, `AnimatedLogoView`.
- **Android-port note**: Compose screen; `AuthViewModel` exposing `savedAccounts`, `isLoading`, `errorMessage`. Saved accounts persisted in encrypted DataStore/Room. Environment selector → segmented buttons + config singleton. Keep simulator prefill out of release builds (`BuildConfig.DEBUG` + emulator check).

## apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift

- **Purpose**: Passwordless login — sends an email magic link, then shows a waiting screen with a countdown.
- **Public API**: `struct MagicLinkView: View`. Internal `Step` enum (`.emailInput`, `.waiting`).
- **Key behaviors**:
  - Regex email validation (`/^[A-Za-z0-9._%+-]+@.../`).
  - `sendMagicLink()` → `AuthService.shared.requestMagicLink(email:)` returns `expiresInSeconds`; starts an async countdown loop (1s sleep, cancellation-checked); on expiry shows "lien expiré".
  - Resend disabled while countdown > 0.
- **Dependencies**: `AuthManager` (env), `AuthService`, `APIError`, `os.Logger`.
- **Android-port note**: Compose 2-step screen; coroutine countdown in ViewModel (cancel on leave). `AuthService.requestMagicLink` → Retrofit call returning expiry. Magic link deep-link handled by app's intent filter.

## apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift

- **Purpose**: Settings for auto-downloading media by type (image/audio/video) over Wi-Fi vs cellular.
- **Public API**: `struct MediaDownloadPreferences: Codable, Equatable, Sendable` (6 bools); `struct MediaDownloadSettingsView: View`.
- **Key behaviors**: Loads/saves prefs to `UserDefaults` key `meeshy_media_download_prefs` (JSON encoded). `onChange(of: prefs)` auto-persists. Default: images both on, audio/video Wi-Fi only.
- **Dependencies**: `ThemeManager`, `HapticFeedback`.
- **Android-port note**: `MediaDownloadPreferences` as Kotlin data class persisted via DataStore (Proto or Preferences). Toggle rows in a settings `LazyColumn`. The download-policy enforcement must be honored by the media download manager (check `ConnectivityManager` Wi-Fi vs metered).

## apps/ios/Meeshy/Features/Main/Views/MessageListView.swift

- **Purpose**: SwiftUI `UIViewControllerRepresentable` bridge wrapping the UIKit `MessageListViewController`, plus two helper views: `BubbleSwipeContainer` (swipe-to-reply/forward) and `MessagePressedOverlay` (long-press contextual action menu).
- **Public API**:
  - `struct BubbleSwipeContainer<Content: View>` — horizontal drag gesture: `replyDirection = isMine ? -1 : +1`; commit at ≥66pt of a 72pt zone with 15% rubber-banding past zone; haptics on threshold cross + commit; shows date stamp under threshold, action icon over. Long press (0.45s) → `onLongPress`.
  - `struct MessagePressedOverlay: View` — iMessage-style: light 0.28 black backdrop, re-rendered `ThemedMessageBubble` scaled 0.92→1.0, bottom compact action row (Reply/Forward/React/Translate/Copy/Delete; Delete only `isMine`).
  - `struct MessageListView: UIViewControllerRepresentable` — bridges store + ViewModel + ~20 closure callbacks (`onLoadOlder`, `onSwipeReply`, `onLongPress`, `onAddReaction(id, CGRect?)`, `onToggleReaction`, `onShowMessageInfo/Reactions/TranslationDetail`, `onConsumeViewOnce`, `onRequestTranslation`, etc.). `Coordinator` tracks trigger counters for scroll-to-bottom / scroll-to-message / slow-scroll search state.
- **Key behaviors**: Triggers (`scrollToBottomTrigger`, `scrollToMessageTrigger`, `isSearchingQuotedMessage`) are integer/bool counters diffed in `updateUIViewController` to fire imperative VC methods.
- **Dependencies**: `MessageStore`, `ConversationViewModel`, `Router`/`StoryViewModel`/`StatusViewModel`/`ConversationListViewModel` (env), `ThemedMessageBubble`, `MessageAttachment`.
- **Android-port note**: This is the hottest list in the app. Android equivalent: a `RecyclerView` (or Compose `LazyColumn` with `reverseLayout=true`) hosting message bubbles. Swipe-to-reply/forward = `ItemTouchHelper` or custom drag with the same direction/threshold logic (66/72pt → dp). Long-press overlay = a custom dialog/overlay composable, NOT the native context menu. Preserve the closure-callback contract as a listener interface or ViewModel events.

## apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift

- **Purpose**: UIKit `UICollectionView` host for the message list — performance-critical hot path. Uses an **inverted** layout (`scaleY: -1` transform) so newest messages sit at the visual bottom.
- **Public API**: `final class MessageListViewController: UIViewController`, conforms to `UICollectionViewDelegate`. Imperative methods: `update(isDark:accentColor:)`, `applyBottomInset`, `scrollToBottom`, `scrollToMessage(localId:)`, `scrollToMessageFast`, `startSlowScrollUp`/`stopSlowScroll`, `cellFrameInWindow(messageId:)`.
- **Key behaviors / algorithms worth preserving**:
  - **Inverted collection view**: `transform = scaleX:1, y:-1`; cell content counter-flipped (`.scaleEffect(x:1, y:-1)`). `scrollsToTop=false` (status-bar tap would scroll wrong way).
  - **Diffable data source** keyed by `localId` (stable across `.sending→.sent→.delivered`); calls `snapshot.reconfigureItems` every snapshot to re-run cell registration in place (picks up GRDB state changes) WITHOUT insert/move/delete diff animation.
  - **Cells host SwiftUI** via `UIHostingConfiguration` (iOS 16+) wrapping `BubbleSwipeContainer` + `ThemedMessageBubble`. VM-owned dynamic state (translations, transcriptions, audio translations, last-message gating) snapped into immutable `let`s at config time so SwiftUI sees only Equatable primitives → no cross-cell re-render.
  - Native `UIContextMenuInteraction` explicitly removed from each cell (custom overlay used instead).
  - **Translation event refresh**: `messageTranslations/Transcriptions/TranslatedAudios/activeTranslationOverrides` publishers merged, `dropFirst()`, `debounce(80ms)` → forced `applySnapshot(animated:false)` because socket-driven translations never touch GRDB.
  - **Unread badge**: detects bottom-growth deltas while user scrolled away (`isCurrentlyNearBottom`, `pendingUnreadCount`).
  - **Pagination**: `scrollViewDidScroll` fires `onLoadOlder` when `distanceFromBottom < 800pt`; guarded by `isLoadingOlder`.
  - **Slow continuous scroll** for quoted-message search: `CADisplayLink` at ~80pt/s; triggers pagination near end so it can keep flowing.
  - `flashCell` highlight after scroll-to-message.
  - `conversationViewModel` held `weak` (owned by SwiftUI Representable).
- **Dependencies**: `MessageStore` (`messagesDidChange` PassthroughSubject, `message(for:)`, `messages`, `isUserScrolling`), `ConversationViewModel`, UIKit, Combine.
- **Android-port note**: Map to `RecyclerView` with `LinearLayoutManager(reverseLayout=true, stackFromEnd=true)` + `ListAdapter`/`DiffUtil` keyed by localId; `notifyItemChanged` payloads for in-place state updates (analog of `reconfigureItems`). Pagination via `RecyclerView.OnScrollListener` threshold or Paging 3. Slow-scroll search = `smoothScrollBy` loop or `ValueAnimator`. Bubbles can be Compose-in-RecyclerView (`ComposeView`/`AbstractComposeView`) or native views — keep the "snap immutable state" discipline to avoid recompositions. **Architecture note**: this hybrid UIKit-inside-SwiftUI is a deliberate perf choice; Android's `RecyclerView` is the natural equivalent and should be preferred over a pure-Compose `LazyColumn` for this hot list.

## apps/ios/Meeshy/Features/Main/Views/NewConversationView.swift

- **Purpose**: Create a new direct or group conversation by searching/selecting users.
- **Public API**: `struct NewConversationView: View`; `struct SearchedUser: Decodable, Identifiable` (id, username, firstName, lastName, displayName, email, isOnline, lastActiveAt, avatar); `Notification.Name` extensions `.navigateToConversation`, `.handlePushNotification`.
- **Key behaviors**:
  - Debounced search (350ms, cancelable Task, min 2 chars) → `APIClient.request("/users/search")`, filters out current user.
  - `isGroupMode` when `selectedUsers.count > 1` → shows group title field (required).
  - `createConversation()`: `POST /conversations` with inline `CreateConversationBody {type, title?, participantIds}`; on success dismisses, posts `.navigateToConversation` notification after 0.3s.
  - Selected users shown as removable chips; mood emoji from `StatusViewModel`.
- **Dependencies**: `APIClient`, `AuthManager`, `StatusViewModel` (env), `Router`, `MeeshyAvatar`, `DynamicColorGenerator`.
- **Android-port note**: `NewConversationViewModel` with debounced search (`Flow.debounce(350)`). Notification → use a shared event bus / `SharedFlow` rather than `NotificationCenter`. `SearchedUser` = Kotlin data class with Moshi/kotlinx.serialization.

## apps/ios/Meeshy/Features/Main/Views/NotificationSettingsView.swift

- **Purpose**: Comprehensive notification preferences (7 sections: General, Messages, Conversations, Contacts/Groups, Feed, Display, Do-Not-Disturb).
- **Public API**: `struct NotificationSettingsView: View`.
- **Key behaviors**:
  - All toggles bind through `UserPreferencesManager.shared.notification` via `WritableKeyPath<UserNotificationPreferences, Bool>` + `prefs.updateNotification { }`.
  - DnD: start/end time text fields, `DndDay` selector (7-day capsule toggles, French initials L M M J V S D).
  - ~30 distinct notification toggle keypaths covering push/email/sound/vibration/badge, message types, conversation events, social feed events.
- **Dependencies**: `UserPreferencesManager` (`@ObservedObject` singleton), `UserNotificationPreferences`, `DndDay`, `ThemeManager`.
- **Android-port note**: `UserPreferencesManager` → DataStore-backed repository; `UserNotificationPreferences` data class. KeyPath pattern → property references or a sealed key enum. DnD scheduling should also map to Android `NotificationChannel` importance + a quiet-hours scheduler. Many of these toggles are server-synced too — keep that in mind.

## apps/ios/Meeshy/Features/Main/Views/OnboardingView.swift

- **Purpose**: First-run 5-page onboarding carousel (welcome, multilingual, voice cloning, E2E privacy, live demo).
- **Public API**: `struct OnboardingView: View` with `@Binding var hasCompletedOnboarding: Bool`. Private `OnboardingPage` model.
- **Key behaviors**:
  - `TabView(.page)` carousel, animated per-page gradient background + ambient floating orbs, per-page icon gradient.
  - Page 5 (`id==4`) renders a live `mockConversationPreview` of 3 real `ThemedMessageBubble`s with hardcoded demo `MeeshyMessage`/`MessageTranslation`/`MessageTranscription`/blurred message — showcasing translation, audio transcription, blur effects.
  - `completeOnboarding()` requests `UNUserNotificationCenter` authorization (alert/badge/sound) then sets the binding.
- **Dependencies**: `MeeshySDK` models (`MeeshyMessage`, `MessageTranslation`, `MessageTranscription`, `MessageEffects`), `AnimatedLogoView`, `UserNotifications`, `os.Logger`.
- **Android-port note**: Compose `HorizontalPager` with `PagerState`; animated gradient via `animateColorAsState`. Demo page reuses the real bubble composable with fake data. Notification permission → `POST_NOTIFICATIONS` runtime permission request (Android 13+) on completion.

## apps/ios/Meeshy/Features/Main/Views/OverlayMenu.swift

- **Purpose**: Small legacy top-right popup menu (Profil / Nouvelle Conversation / Créer un lien / Notifications).
- **Public API**: `struct OverlayMenu: View` with `onDismiss` closure.
- **Key behaviors**: All buttons just call `onDismiss` — appears to be **dead/placeholder code** (no real navigation wired). Uses deprecated `Color.white.opacity` styling, not the design system.
- **Android-port note**: Likely skip — superseded by other navigation. If a quick-action menu is needed, use a `DropdownMenu`. **Tech debt: do not port as-is.**

## apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift

- **Purpose**: Group conversation member list with role management, add/remove, leave-group.
- **Public API**: `struct ParticipantsView: View` (props: conversationId, accentColor, currentUserRole).
- **Key behaviors**:
  - Cache-first load: `CacheCoordinator.shared.participants.load` → `.fresh` returns, `.stale` shows then refreshes, `.expired/.empty` refreshes; refresh via `ParticipantService.loadFirstPage`, saved back to cache, `UserDisplayNameCache.trackFromParticipants`.
  - Pagination via `loadMoreIfNeeded` on last-item appear (`ParticipantService.loadNextPage` / `hasMore`).
  - Real-time updates via `MessageSocketManager` publishers: `participantRoleUpdated`, `conversationJoined`, `conversationLeft` — each updates local list + invalidates service cache.
  - **Role permission matrix**: `MemberRole` (creator > admin > moderator > member). Creator manages everyone; admin manages member/moderator only (not other admins); moderator can remove members. Context menu + swipe-action promote/demote/remove; alerts confirm role change/removal/leave.
  - Role-change/remove call `ConversationService` + mirror into `ParticipantService` cache.
  - Presence via `PresenceManager.presenceState(for:)` (read directly, not `@ObservedObject`, to avoid full-list re-render).
- **Dependencies**: `ParticipantService`, `ConversationService`, `CacheCoordinator`, `MessageSocketManager`, `PresenceManager`, `StatusViewModel` (env), `MemberRole`, `PaginatedParticipant`, `MeeshyAvatar`, `AddParticipantSheet`.
- **Android-port note**: `ParticipantsViewModel` with cache-first (`CacheResult` sealed class), paged list, socket event collection (`SharedFlow`). Role matrix → pure function `canRemove(actor, target)` / `canPromoteTo(...)`. Swipe actions = `SwipeToDismiss` / `ItemTouchHelper`; context menu = `DropdownMenu`. Presence read should not trigger list recomposition (pass primitive `PresenceState`).

## apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift

- **Purpose**: Full social-feed post detail — text (with translation), media grid, repost embed, actions bar, threaded comments, comment composer.
- **Public API**: `struct PostDetailView: View` (postId, optional initialPost, showComments flag).
- **Key behaviors**:
  - **Prisme Linguistique**: `currentDisplayLangCode` resolves active lang from `activeDisplayLangCode` override → user `preferredContentLanguages` → original → `fr`. `effectiveContent` returns translated/original text; `secondaryContent` for inline secondary-language panel; `buildAvailableFlags` builds dedup'd flag strip; `handleFlagTap` toggles secondary panel or switches active lang. Same logic mirrored separately for repost embeds (`repostEffectiveContent`, `repostSecondaryContent`, `repostLanguageFlags`).
  - **Socket-driven likes** (single-post room): `joinPostRoom`/`leavePostRoom` on appear/disappear; optimistic toggle with rollback (`postLikedIds`, `postLikeDelta`, `postHeartInFlightIds`); `onReceive` `postReactionAdded/Removed` distinguishes self vs others.
  - Text truncation at 60 words with voir plus/moins expansion; `viewPost` analytics call on open + on expand.
  - Media: single/grid (2/3/4+ layouts with "+N" overlay), `ProgressiveCachedImage`, `InlineVideoPlayerView`, `AudioPlayerView`, document/location cells; fullscreen via `ConversationMediaGalleryView`.
  - Repost embed: handles `STORY`-type reposts via `StoryReaderRepresentable` (9:16 canvas) vs standard media.
  - Threaded comments via `ThreadedCommentSection`; `viewModel.topLevelComments` / `repliesFor` / `toggleThread`; pagination "Charger plus".
  - Composer `UniversalComposerBar` (`.comment` mode) supports reply, blur/effects, language selection; persistence wired on `.task` via `CommentStore` + `DependencyContainer.feedPersistence`.
- **Dependencies**: `PostDetailViewModel`, `SocialSocketManager`, `PostService`, `FeedPost`/`RepostContent`/`FeedMedia`/`PostTranslation`, `StatusViewModel`/`StoryViewModel`/`Router` (env), `CommentStore`, `DependencyContainer`, `LanguageDisplay`, `UniversalComposerBar`, `ConnectionBanner`.
- **Android-port note**: Large composite screen — break into composables (author header, text+flags, media grid, repost card, actions, comments, composer). `PostDetailViewModel` owns post + comments + socket subscription. Translation resolution → shared `resolveContentLanguage` util. Socket likes → optimistic update pattern in ViewModel with rollback. Threaded comments → nested `LazyColumn` items / `ConcatAdapter`.

## apps/ios/Meeshy/Features/Main/Views/PostTranslationSheet.swift

- **Purpose**: Bottom sheet listing a post's original + available translations and letting the user request missing translations.
- **Public API**: `struct PostTranslationSheet: View` (post, `onSelectLanguage`, `onRequestTranslation` callbacks).
- **Key behaviors**:
  - `missingLanguages` = user `preferredContentLanguages` minus original minus existing translations.
  - Original section + available translations (sorted, with confidence %) → tap fires `onSelectLanguage` + dismiss.
  - Request section: `PostService.requestTranslation(postId:targetLanguage:)`; tracks `requestingLanguages`/`requestedLanguages` for inline progress/checkmark; toast on error.
- **Dependencies**: `FeedPost`, `PostTranslation`, `PostService`, `AuthManager`, `LanguageDisplay`, `ToastManager`.
- **Android-port note**: `ModalBottomSheet` with sectioned list. Request translation = ViewModel call with per-language loading state map.

## apps/ios/Meeshy/Features/Main/Views/PrivacyPolicyView.swift

- **Purpose**: Static privacy policy document with fr/en language toggle.
- **Public API**: `struct PrivacyPolicyView: View`. Hardcoded `sections` dictionary (fr/en, 7 sections each).
- **Key behaviors**: Segmented picker switches language; numbered policy section cards; "last updated" line. Pure static content.
- **Android-port note**: Static screen; store the policy text in string resources (`values/`, `values-en/`) instead of an inline dictionary, or fetch from a remote/bundled markdown. Segmented toggle → `SegmentedButton`.

## apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift

- **Purpose**: Privacy preferences (4 sections: Visibility, Contacts/Groups, Media/Data, Encryption).
- **Public API**: `struct PrivacySettingsView: View`.
- **Key behaviors**:
  - Toggles bound through `UserPreferencesManager.shared.privacy` via `WritableKeyPath<PrivacyPreferences, Bool>` + `updatePrivacy { }`.
  - Visibility: online status, last seen, read receipts, typing indicator, hide-from-search.
  - Encryption: `EncryptionPreference` menu picker (disabled/optional/always), auto-encrypt new conversations, show encryption status, warn-on-unencrypted.
  - `onChange(of: allowAnalytics)` → `AnalyticsManager.shared.syncCollectionState()`.
- **Dependencies**: `UserPreferencesManager`, `PrivacyPreferences`, `EncryptionPreference`, `AnalyticsManager`.
- **Android-port note**: Same DataStore-backed prefs repository. Analytics toggle must gate the analytics SDK collection at runtime (Firebase `setAnalyticsCollectionEnabled`). `blockScreenshots` → `FLAG_SECURE` on the window.

## apps/ios/Meeshy/Features/Main/Views/ProfileView.swift

- **Purpose**: Current-user profile screen — view/edit identity, contact, languages, stats, friend requests, member-since; avatar/banner upload.
- **Public API**: `struct ProfileView: View`. Private extension `MeeshyUser.applyingProfileEdits(...)` (optimistic copy builder).
- **Key behaviors**:
  - Edit mode toggles inline `TextField`s; collapsible header with Modifier/Enregistrer trailing button.
  - **Optimistic save**: applies edits to `authManager.currentUser` immediately via `applyingProfileEdits`; `UpdateProfileRequest` sent; on failure rolls back to snapshot + re-opens editor.
  - **Offline save**: if `NetworkMonitor.isOffline`, enqueues a `SettingsAction` (`PATCH /users/me/profile`) into `SettingsActionQueue` for replay; success toast.
  - Avatar/banner: `PhotosPicker` → `MeeshyImagePreviewView` editor → `ImageCompressor.compress` (500KB avatar / 800KB banner) → `UserService.uploadImage` + `updateAvatar/updateBanner`.
  - Stats cache-first via `CacheCoordinator.shared.stats` + `StatsService.fetchStats`.
  - Language pickers (system/regional/custom) via `ProfileLanguagePickerSheet` + `LanguageData.allLanguages`.
  - Cold-start skeleton via `SkeletonVisibilityResolver` when `currentUser == nil`.
  - Verification badges for email/phone (`emailVerifiedAt`/`phoneVerifiedAt`).
- **Dependencies**: `AuthManager`, `UserService`, `StatsService`, `CacheCoordinator`, `NetworkMonitor`, `SettingsActionQueue`/`SettingsAction`, `ImageCompressor`, `MeeshyImagePreviewView`, `LanguageData`, `Router`, `FriendshipCache`, `PhotosUI`.
- **Android-port note**: `ProfileViewModel` with edit-mode state. Optimistic update + rollback pattern in VM. Offline write queue → Room-backed `WorkManager` job (PATCH replays on connectivity). Avatar/banner → `ActivityResultContracts.PickVisualMedia` → image cropper → compress (`Bitmap`/coil) → upload. Stats cache-first via repository. Language picker = bottom sheet.

## apps/ios/Meeshy/Features/Main/Views/ReplyContextCleaner.swift

- **Purpose**: Small `@MainActor struct` that atomically clears both the in-memory `ReplyReference` and the persisted `replyToId` in `DraftStore`.
- **Public API**: `struct ReplyContextCleaner` — init(conversationId, draftStore=.shared); `clear(pendingReplyReference: inout ReplyReference?)`.
- **Key behaviors**: Fixes a bug where a persisted reply id outlived the in-memory reference, causing the reply banner to reappear after re-entering a conversation. Preserves draft text/attachments.
- **Dependencies**: `DraftStore`, `ReplyReference` (MeeshySDK).
- **Android-port note**: Trivial helper — fold into the `ConversationViewModel`/draft repository: when clearing reply, also clear `replyToId` from the persisted draft (Room/DataStore) in one operation.

## apps/ios/Meeshy/Features/Main/Views/ReplyThreadOverlay.swift

- **Purpose**: Modal card overlay showing a message's reply thread (parent + nested replies).
- **Public API**: `struct ReplyThreadOverlay: View` (conversationId, parentMessageId, accentColor, isDark, allMessages, `translationResolver`, `isPresented` binding).
- **Key behaviors**:
  - `resolveThread()`: if parent is in `allMessages`, builds the thread locally via `collectLocalReplies` — BFS over `replyToId` links, capped at 10 levels; otherwise falls back to `loadThreadFromAPI` (`GET /conversations/:id/threads/:parentId`).
  - Drag-to-dismiss (>100pt), tap-backdrop dismiss; skeleton + error/retry states.
  - `translationResolver` applied to displayed content (Prisme Linguistique).
  - Mini reply chips for nested-reply context.
- **Dependencies**: `APIClient`, `AuthManager`, `MeeshyMessage`/`ReplyReference`/`ThreadData` (SDK), `MeeshyAvatar`, `os.Logger`.
- **Android-port note**: `ModalBottomSheet` or dialog. BFS thread builder = pure Kotlin function (`Map<id, message>`, frontier set, 10-iteration cap). API fallback via repository. `translationResolver` = lambda from the conversation ViewModel.

## apps/ios/Meeshy/Features/Main/Views/ReportUserView.swift

- **Purpose**: Form to report a user (reason + optional details).
- **Public API**: `struct ReportUserView: View` (userId, username). Private `enum ReportReason` (SPAM, HARASSMENT, INAPPROPRIATE_CONTENT, IMPERSONATION, OTHER) with label/icon.
- **Key behaviors**: Radio-style reason picker, 500-char-capped `TextEditor` details, `submitReport()` → `ReportService.reportUser(userId:reportType:reason:)`; success toast + dismiss, error message inline.
- **Dependencies**: `ReportService`, `ToastManager`, `ThemeManager`.
- **Android-port note**: Simple form screen; `ReportReason` enum with string resources; `ReportViewModel` calling a report repository. Char-cap via `TextField` `maxLength`.

---

## Architecture observations

- **Hybrid UIKit-in-SwiftUI for the hot message list**: `MessageListView` (Representable) + `MessageListViewController` (`UICollectionView`, inverted `scaleY:-1` transform, diffable data source, `UIHostingConfiguration` cells, `CADisplayLink` slow-scroll) is a deliberate performance architecture. The discipline of "snap VM `@Published` state into immutable `let`s at cell-config time" prevents cross-cell re-renders. **Android equivalent**: `RecyclerView` with `reverseLayout`, `ListAdapter`/`DiffUtil`, `notifyItemChanged` payloads — strongly prefer this over a pure-Compose `LazyColumn` for this list. The ~20-closure callback contract should become a listener interface or ViewModel event flow.

- **Cache-first / stale-while-revalidate is pervasive**: `ParticipantsView` and `ProfileView` (stats) both use `CacheCoordinator.shared.{store}.load` returning `.fresh/.stale/.expired/.empty`, serving stale immediately then refreshing. This `CacheResult` sealed-type pattern must be replicated in the Android data layer (repository returns `Flow<CacheResult<T>>` or emits cached-then-network).

- **Optimistic updates with rollback everywhere**: post likes (`PostDetailView` — optimistic toggle + `inFlightIds` guard + socket-event reconciliation distinguishing self vs others), profile save (`ProfileView.applyingProfileEdits` snapshot + rollback). Plus an **offline write queue** (`SettingsActionQueue` / `SettingsAction` for profile PATCH replay). Android: ViewModel-level optimistic state + `WorkManager`-backed offline mutation queue.

- **Real-time via socket publishers + careful re-render avoidance**: `ParticipantsView` reads `PresenceManager` directly (not `@ObservedObject`) and consumes `MessageSocketManager` publishers; `MessageListViewController` debounces (80ms) merged translation publishers because socket-driven translations bypass GRDB. Android: `SharedFlow` event streams, debounced collection, and passing primitive values to list items to avoid recomposition.

- **Prisme Linguistique resolution duplicated**: `PostDetailView` reimplements language resolution three ways (post, repost, plus `PostTranslationSheet`'s `missingLanguages`). This is tech debt — Android should have ONE shared content-language resolver (`resolveUserLanguage` equivalent) used by messages, posts, reposts, stories.

- **Preferences pattern**: `UserPreferencesManager.shared` with `WritableKeyPath` + `update{Section}{}` mutation closures backs notification/privacy settings; `MediaDownloadSettingsView` uses ad-hoc `UserDefaults` JSON. Consolidate on Android into one DataStore-backed preferences repository. Note many of these prefs are also server-synced.

- **Anti-patterns to NOT carry over**: `OverlayMenu.swift` is dead/placeholder code (all buttons just dismiss, non-design-system styling). `NotificationCenter`-based navigation (`.navigateToConversation`) should become a typed event bus / `SharedFlow`. Several screens use fixed font point sizes (`.font(.system(size:))`) instead of scalable typography — Android should use `sp` + Material typography for accessibility/Dynamic Type parity.

### Portable user-facing features

- [ ] Links hub (share / tracking / community / affiliate links) with quick-create
- [ ] Username/password login with saved-account picker (multi-account)
- [ ] Server environment selector (dev/staging/prod/custom host)
- [ ] Passwordless magic-link login with email + countdown + resend
- [ ] First-run onboarding carousel with live feature demo
- [ ] Auto-download settings for media by type and connection (Wi-Fi/cellular)
- [ ] Notification preferences (push/email/sound/vibration, per-event types, Do-Not-Disturb schedule)
- [ ] Privacy settings (visibility, contacts, media/data, encryption preference)
- [ ] Privacy policy document (fr/en)
- [ ] Create new direct/group conversation via user search
- [ ] Group participant list with role management (promote/demote/remove) and leave-group
- [ ] Add participants to a conversation
- [ ] Real-time message list: inverted layout, swipe-to-reply/forward, long-press action menu
- [ ] Scroll-to-latest with unread badge, jump-to-quoted-message with slow-scroll search
- [ ] Pagination of older messages
- [ ] Message reply-thread overlay
- [ ] Feed post detail with text/media/repost, translation flags, threaded comments
- [ ] Post translation sheet (view translations + request missing languages)
- [ ] Post like (socket-driven, optimistic) and bookmark
- [ ] Comment composer with reply, blur/effects, language selection
- [ ] User profile view/edit (identity, bio, languages, avatar/banner upload) with offline save
- [ ] User stats display
- [ ] Friend-requests entry point with pending badge
- [ ] Report a user (reason + details)
- [ ] On-demand message translation request
