# iOS Audit — Part 03

Chunk: `/tmp/chunks/chunk-03.txt` (34 files). Covers Main feature **Components** (message overlay menu, composer bar, offline/upload/security UI), **Models** (mostly SDK typealias shims), **Navigation** (Router, deep links) and **Services** (API client, auth/anonymous session, attachments, audio record/play, background lifecycle, calls scaffold).

---

## apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift

**Purpose:** iMessage-style long-press overlay for a single message: blurred backdrop, floating bubble preview, quick emoji reaction strip, and a drag-expandable detail panel.

**Public API surface:**
- `struct MessageOverlayMenu: View` — many inputs: `message`, `contactColor`, `conversationId`, `messageBubbleFrame`, `@Binding isPresented`, capability flags `canDelete`/`canEdit`/`isStarred`, translation context (`textTranslations`, `transcription`, `translatedAudios`), and ~15 callback closures (`onReply`, `onCopy`, `onEdit`, `onPin`, `onToggleStar`, `onSelectTranslation`, `onSelectAudioLanguage`, `onRequestTranslation`, `onReact`, `onReport`, `onDelete`, `onDeleteAttachment`).
- `private struct PreviewAudioPlayer: View`, `private struct PreviewVideoPlayer: View` — interactive media players inside the preview (play/pause, scrub slider, ±5s skip, 0.5–2.0x speed menu, percent display).
- `@MainActor private class OverlayAudioPlayer: ObservableObject` — `AVPlayer` wrapper: `isPlaying`, `progress`, `currentTime`, `duration`, `playbackRate`, `isLoading`; `toggle/stop/seek/skip/setRate/timeLabel`. Uses periodic time observer + KVO on `AVPlayerItem.status`.
- `struct EmojiUsageTracker` — `recordUsage`, `sortedEmojis`, `topEmojis(count:defaults:)`; persists usage counts in `UserDefaults` (key `com.meeshy.emojiUsageCount`).

**Key behaviors / algorithms:**
- Composite spring-in animation anchored to the bubble's native corner (topTrailing for sent, topLeading for received); staggered emoji "cascade" via a horizontal gradient mask driven by `emojiReveal`.
- Bubble preview color recipe mirrors `BubbleStandardLayout`: sent = brand primary, received = `DynamicColorGenerator.blendTwo(senderHex 0.30, brandPrimary 0.70)`.
- Preview reuses `BubbleContent.summarizeReactions`, `BubbleReactionsOverlay`, `UserIdentityBar.metaRow`, `BubbleBackground` — same components as the live bubble.
- Drag-expandable bottom panel: collapsed (195pt grid) → expanded (full `MessageDetailSheet`); velocity + 80pt threshold snapping.
- `EmojiUsageTracker.topEmojis` uses deterministic total ordering (count desc, canonical rank, then string) to prevent reshuffling on re-render.
- Image preview grid: 1/2/3/4-up layouts; text capped at 500 chars.
- `overlayActions` builds context-aware `MessageAction` list (reply, copy, pin/unpin, star, edit, delete attachment) gated on `hasText`/`canEdit`/`canDelete`.

**Dependencies / couplings:** `MeeshySDK`, `MeeshyUI` (`EmojiReactionPicker`, `MeeshyAvatar`, `ProgressiveCachedImage`, `BubbleContent`, `BubbleReactionsOverlay`, `UserIdentityBar`, `BubbleBackground`, `MeeshyColors`, `DynamicColorGenerator`); `ThemeManager`, `AuthManager`, `HapticFeedback`, `MeeshyConfig.resolveMediaURL`, `MessageDetailSheet`, `DetailTab`, `MessageAction`.

**Android-port note:** Compose `Popup`/`ModalBottomSheet` with shared-element-style transition; `AnimatedVisibility` + brush masks for the emoji cascade. Audio/video preview → `ExoPlayer` wrapped in a small `ViewModel`. `EmojiUsageTracker` → `SharedPreferences`/DataStore with the same deterministic comparator. This is a large, ornate component — port the *behavior* (action set, translation entry point, reaction strip) but rebuild the chrome natively rather than 1:1 the SwiftUI gradient stacks.

---

## apps/ios/Meeshy/Features/Main/Components/OfflineBanner.swift

**Purpose:** Small red gradient banner shown when the device is offline ("Hors ligne / Les messages seront envoyes a la reconnexion").

**Public API surface:** `struct OfflineBanner: View` (no inputs; localized strings `connection.offline`, `connection.offline.subtitle`).

**Key behaviors:** Pure presentational; fixed top padding 50pt. Visibility controlled by parent.

**Dependencies:** `MeeshyUI`, `Color(hex:)`.

**Android-port note:** Trivial Compose composable; drive visibility from a connectivity `StateFlow` (`ConnectivityManager`). Use string resources.

---

## apps/ios/Meeshy/Features/Main/Components/ReportMessageSheet.swift

**Purpose:** Modal sheet to report a message: pick a reason type + optional free-text detail.

**Public API surface:**
- `struct ReportMessageSheet: View` — `accentColor: String`, `onSubmit: (String, String?) -> Void`.
- `enum ReportType: String, CaseIterable, Identifiable` — `spam`, `inappropriate`, `harassment`, `violence`, `hate_speech`, `impersonation`, `other`; each with `label`, `description`, `icon`.

**Key behaviors:** Submit disabled until a type is selected; passes `type.rawValue` + nil-if-empty reason. Detail field appears with transition once a type is chosen.

**Dependencies:** `MeeshySDK`, `ThemeManager`, `HapticFeedback`.

**Android-port note:** Compose `ModalBottomSheet` or dialog; `ReportType` → Kotlin `enum class` with the same raw values (server contract). Selectable list rows.

---

## apps/ios/Meeshy/Features/Main/Components/SecurityVerificationView.swift

**Purpose:** E2E encryption verification screen — shows a safety number + QR code, or a "pending" state when keys aren't exchanged yet.

**Public API surface:** `struct SecurityVerificationView: View` — `conversationName: String`, `safetyNumber: String?`.

**Key behaviors:** `generateQRCode(from:)` via `CIFilter.qrCodeGenerator`; `formatSafetyNumber` groups digits in blocks of 5. `verifiedSection` vs `pendingSection` based on `safetyNumber` presence.

**Dependencies:** `CoreImage.CIFilterBuiltins`, `MeeshyUI`, `ThemeManager`.

**Android-port note:** QR via ZXing; group-of-5 formatting trivial. Wire `safetyNumber` from the Signal-protocol layer when available.

---

## apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift

**Purpose:** Thought-bubble popover anchored to a user avatar showing their latest status (text or audio), with a "Republier" action for others' statuses.

**Public API surface:** `struct StatusBubbleOverlay: View` — `status: StatusEntry`, `anchorPoint: CGPoint`, `@Binding isPresented`, `onRepublish: ((StatusEntry) -> Void)?`.

**Key behaviors:** Positions bubble above/below anchor based on `anchorPoint.y` vs 45% of screen height; three "thought circle" dots leading to the bubble; tap or 3pt drag dismisses; auto-plays audio status. Uses `AudioPlayerManager`.

**Dependencies:** `MeeshySDK` (`StatusEntry`), `AudioPlayerManager`, `ThemeManager`, `MeeshyColors`.

**Android-port note:** Compose `Popup` with manual offset math from anchor coordinates; ExoPlayer for audio. `timeAgo`/`viaUsername`/`avatarColor` come from the `StatusEntry` model.

---

## apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Attachments.swift

**Purpose:** Extension of `UniversalComposerBar` — attachment chip previews, the radial "+" attachment ladder, clipboard-content detection/preview.

**Public API surface (extension methods):** `attachmentsPreview`, `attachmentChip(_:)`, `attachmentLadder`, `attachLadderButton(...)`, `attachButton`, `closeAttachMenu()`, `handleClipboardCheck(_:)`, `clipboardContentPreview(_:)`, `iconForType(_:)`, `formatFileSize(_:)`.

**Key behaviors:**
- Attachment ladder: 6 staggered buttons (emoji, file, location, camera, photo library, voice) with per-item delays 0.0–0.20s.
- `handleClipboardCheck` heuristically detects a large paste (>2000 chars, delta >500) and converts text into a `ClipboardContent` attachment, clearing the field.
- Each ladder item closes the menu then fires its callback after a 0.2s delay.

**Dependencies:** `ComposerAttachment`, `ComposerAttachmentType`, `ClipboardContent`, `HapticFeedback`, `.menuAnimation` modifier.

**Android-port note:** Compose attachment chips in a `LazyRow`; ladder → `AnimatedVisibility` column with staggered enter transitions, or a `FloatingActionButton` speed-dial. Clipboard heuristic ports directly.

---

## apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Recording.swift

**Purpose:** Extension of `UniversalComposerBar` — text input field + iMessage-style full-width voice-recording pill (cancel, live waveform, timer, send) and recording lifecycle.

**Public API surface (extension):** `textInputField`, `recordingBar`, `startRecording()`, `stopRecording()`, `cancelRecording()`, `forceStopRecording()`, `expandAndStartRecording()`, `formatDuration(_:)`; private `waveformStrip`, `interpolatedLevel`.

**Key behaviors:**
- Two recording modes: **delegated** (parent owns `AVAudioRecorder` via `onStartRecording`/`onStopRecording`/`onCancelRecording`) and **internal** (composer runs its own `Timer`-based duration, used by stories/comments).
- Waveform: linear interpolation of sampled `externalAudioLevels` across a computed bar count (no tiling artifacts); falls back to animated `ComposerWaveformBar` when no levels.
- Send disabled below `minimumSendableDuration` (0.5s); `forceStopRecording` saves regardless of duration when switching stories (>0.3s).
- Respects `accessibilityReduceMotion`.

**Dependencies:** `AVFoundation`, `ComposerAttachment.voice`, `ComposerWaveformBar`, `HapticFeedback`.

**Android-port note:** `MediaRecorder` / `AudioRecord` for capture; Compose `Canvas` for the waveform with the same interpolation. Keep the delegated-vs-internal split — Android equivalent is a `RecordingController` interface injected into the composer.

---

## apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar.swift

**Purpose:** The universal message composer — reusable wherever a message can be sent (conversation, stories, comments). Mirrors the web `MessageComposer`.

**Public API surface:**
- `struct UniversalComposerBar: View` — extremely large config surface: `Style` enum (`.dark`/`.light`), `ComposerMode?`, `startMinimized`, accent/secondary colors, `maxLength`, feature flags (`showVoice`/`showLocation`/`showAttachment`/`showLanguageSelector`/`showEmoji`), language selector (`selectedLanguage`, `availableLanguages`, `onLanguageChange`).
- Callbacks: simple (`onSend`, `onFocusChange`), rich (`onSendMessage(text, [ComposerAttachment], lang)`, `onVoiceRecord`, `onLocationRequest`), edit mode (`onCustomSend`, `onTextChange`), recording delegation, attachment ladder callbacks, draft management (`onSaveDraft`, `getDraft`, `storyId`), `onAnyInteraction`, `onHasContentChange`.
- Bindings: `textBinding`, `injectedEmoji`, `ephemeralDuration`, `isBlurEnabled`, `pendingEffects`, `focusTrigger`.
- Internal state shared with extensions: `text`, `isFocused`, `attachments`, `isRecording`, `recordingDuration`, `recordingTimer`, `isMinimized`, `clipboardContent`.

**Key behaviors:**
- Minimized floating-button mode (mic + write buttons) ↔ expanded composer; swipe-down collapses.
- Top toolbar: ephemeral-duration toggle (`EphemeralDuration`), blur toggle, effects toggle (full sheet) or permanent-effects inline picker (comments), sentiment emoji (from `TextAnalyzer`), language pill, char counter (shown above 80% of max).
- `ComposerMode` resolves placeholder/maxLength/feature visibility, overriding manual props.
- Story-aware draft persistence: on `storyId` change, save old draft and load/clear for new.
- `TextAnalyzer` does live sentiment + language detection; auto-locks language and can present `LanguagePickerSheet`.
- Recording bar replaces the entire row when recording.
- `MessageEffects` / `MessageEffectFlags` (`.glow`, `.pulse`, `.rainbow`, `.sparkle`) for message effects.

**Dependencies:** `MeeshySDK`, `TextAnalyzer`, `LanguagePickerSheet`, `DetectedLanguage`, `LanguageOption`, `ComposerMode`, `ComposerAttachment`, `EphemeralDuration`, `MessageEffects`, `KeyboardObserver`, `ComposerWaveformBar`, `HapticFeedback`, `ThemeManager`.

**Android-port note:** This is the single most reusable UI surface — port carefully as a self-contained Compose component with a `ComposerState` holder. The huge callback surface should become an interface (`ComposerCallbacks`) + an immutable `ComposerConfig`. `ComposerMode` → sealed class. Effects/ephemeral/blur are cross-cutting message features; map their toggle state into the send payload.

---

## apps/ios/Meeshy/Features/Main/Components/UploadProgressBar.swift

**Purpose:** Progress bar for an in-flight attachment upload queue (percent, current file name, file count, byte totals).

**Public API surface:** `struct UploadProgressBar: View` — `progress: UploadQueueProgress`, `accentColor: String`.

**Key behaviors:** Reads `UploadQueueProgress` (`globalPercentage`, `files`, `completedFiles`, `totalFiles`, `uploadedBytes`, `totalBytes`); shows the first `.uploading` file's name; animated gradient fill.

**Dependencies:** `MeeshySDK` (`UploadQueueProgress`), `MeeshyUI`, `ThemeManager`.

**Android-port note:** Compose `LinearProgressIndicator` + text; drive from the upload manager's progress `Flow`.

---

## apps/ios/Meeshy/Features/Main/Components/VideoPreviewView.swift

**Purpose:** Deprecated stub — `VideoPreviewView` is a typealias for `MeeshyVideoEditorView` (SDK).

**Public API surface:** `@available(*, deprecated) typealias VideoPreviewView = MeeshyVideoEditorView`.

**Android-port note:** Ignore — port `MeeshyVideoEditorView` from the SDK directly; do not carry the deprecated alias.

---

## apps/ios/Meeshy/Features/Main/Models/AnonymousSessionContext.swift

**Purpose:** Local model for an anonymous (shared-link) session.

**Public API surface:** `struct AnonymousSessionContext: Codable` — `sessionToken`, `participantId`, `permissions: ParticipantPermissions`, `linkId`, `conversationId`. Extension `AnonymousJoinResponse.toSessionContext`.

**Key behaviors:** Maps an `AnonymousJoinResponse` into the context; hardcodes `canSendVideos/Audios/Locations/Links = false` (anonymous users get text/file/image only).

**Dependencies:** `MeeshySDK` (`AnonymousJoinResponse`, `ParticipantPermissions`).

**Android-port note:** Kotlin `data class` + serialization; mapper function. Preserve the restricted-permissions defaults — that's a product rule.

---

## apps/ios/Meeshy/Features/Main/Models/AnyCodable.swift

**Purpose:** Type-erased `Codable` for API responses whose payload shape is irrelevant.

**Public API surface:** `struct AnyCodable: Codable` — `value: Any`; decodes Bool/Int/Double/String, defaults to empty string.

**Android-port note:** Use `kotlinx.serialization` `JsonElement` or Gson `JsonElement`. Rarely needed.

---

## apps/ios/Meeshy/Features/Main/Models/AuthModels.swift

**Purpose:** App-layer auth model shim; most auth types now live in the SDK.

**Public API surface:** `struct RefreshTokenData: Decodable` — `token`, `expiresIn`. (`LoginRequest`, `LoginResponseData`, `MeeshyUser`, `MeResponseData` are sourced from `MeeshySDK/Auth/AuthModels.swift`.)

**Android-port note:** Auth models belong in a shared `:sdk` Android module; keep `RefreshTokenData` alongside.

---

## apps/ios/Meeshy/Features/Main/Models/Conversation.swift

**Purpose:** Backward-compat typealiases only.

**Public API surface:** `typealias Conversation = MeeshyConversation`, `ConversationTag = MeeshyConversationTag`, `ConversationSection = MeeshyConversationSection`, `Community = MeeshyCommunity`.

**Android-port note:** No port. Real model definitions are in the SDK chunk (`CoreModels`).

---

## apps/ios/Meeshy/Features/Main/Models/FeedModels.swift

**Purpose:** Typealiases — `FeedItem = MeeshyFeedItem`, `ConversationFilter = MeeshyConversationFilter`.

**Android-port note:** No port; SDK-sourced.

---

## apps/ios/Meeshy/Features/Main/Models/Message.swift

**Purpose:** Typealiases — `Message = MeeshyMessage`, `MessageAttachment = MeeshyMessageAttachment`, `Reaction = MeeshyReaction`, `ReactionSummary = MeeshyReactionSummary`, `ChatMessage = MeeshyChatMessage`, `MessageReaction = MeeshyMessageReaction`.

**Android-port note:** No port; SDK-sourced.

---

## apps/ios/Meeshy/Features/Main/Models/MessageModels.swift

**Purpose:** App-only model.

**Public API surface:** `struct SearchResultItem: Identifiable` — `id`, `conversationId`, `content`, `matchedText`, `matchType` ("content" | "translation"), `senderName`, `senderAvatar?`, `createdAt`.

**Android-port note:** Kotlin `data class` for in-app message search results.

---

## apps/ios/Meeshy/Features/Main/Models/Models.swift

**Purpose:** Empty placeholder — documents that `Models.swift` was split into `Conversation.swift`, `Message.swift`, `FeedModels.swift`, `SampleData.swift`.

**Android-port note:** Ignore.

---

## apps/ios/Meeshy/Features/Main/Models/PostModels.swift

**Purpose:** Documentation-only shim — `APIAuthor`, `APIPostMedia`, `APIRepostOf`, `APIPostComment`, `APIPost`, `APIPost.toFeedPost()` all live in `MeeshySDK/Models/PostModels.swift`.

**Android-port note:** Ignore; SDK-sourced.

---

## apps/ios/Meeshy/Features/Main/Models/SampleData.swift

**Purpose:** Static mock data for SwiftUI previews / `ConversationPreviewView` — conversations, communities, feed items, and sample messages.

**Public API surface:** `struct SampleData` — `conversations`, `communities`, `feedItems`, `messages(conversationId:)`, `sampleMessages(conversationId:contactColor:)`.

**Key behaviors:** Covers edge cases (very long titles, huge member counts, all conversation types, every message type: text, reply, image, audio, video, file, location, long text).

**Android-port note:** Build equivalent `@Preview` sample data, ideally in `androidTest`/preview source set, not production code. Useful as a test fixture catalogue (note the deliberate edge cases).

---

## apps/ios/Meeshy/Features/Main/Models/StoryModels.swift

**Purpose:** Documentation-only shim — `StoryEffects`, `StoryItem`, `StoryGroup`, `StatusEntry`, `ReplyContext`, `ReactionRequest`, `RepostRequest`, `StatusCreateRequest`, `StoryViewRequest`, and conversions (`[APIPost].toStoryGroups()`, `APIPost.toStatusEntry()`) all in `MeeshySDK/Models/StoryModels.swift`.

**Android-port note:** Ignore; SDK-sourced.

---

## apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift

**Purpose:** URL parsing + pending-deep-link state for Universal Links and the `meeshy://` custom scheme.

**Public API surface:**
- `enum DeepLinkDestination` — `ownProfile`, `userProfile(username)`, `conversation(id)`, `magicLink(token)`, `share(text?, url?)`, `userLinks`, `external(URL)`.
- `enum DeepLinkParser` — static `parse(_:)`, `open(_:navigate:)`, `isMeeshyDeepLink(_:)`.
- `enum DeepLink: Equatable` — `joinLink`, `chatLink`, `magicLink`, `conversation`.
- `@MainActor final class DeepLinkRouter: ObservableObject` (singleton) — `@Published pendingDeepLink`, `handle(url:) -> Bool`, `consumePendingDeepLink()`.

**Key behaviors:**
- Recognized hosts: `meeshy.me`, `www.meeshy.me`, `app.meeshy.me`.
- Routes: `/me` → own profile, `/u/{username}`, `/c/{id}` & `/conversation/{id}`, `/join/{id}` & `/l/{id}`, `/chat/{id}`, `/auth/magic-link?token=`, `/share?text=&url=`, `/links`.
- Defensive: collapses empty path segments (double slashes), lowercases host, rejects empty/whitespace identifiers up front (avoids opaque server 404s). `isMeeshyDeepLink` lets `AppDelegate` decide whether to claim a Universal Link.

**Dependencies:** `UIKit`, `MeeshySDK`.

**Android-port note:** Android App Links via `<intent-filter android:autoVerify="true">` + `meeshy://` scheme intent filter. Centralize parsing in a `DeepLinkParser` object; `pendingDeepLink` → a `StateFlow` on a navigation `ViewModel`/singleton consumed once on resume. Keep the same defensive rules.

---

## apps/ios/Meeshy/Features/Main/Navigation/Router+StoryReply.swift

**Purpose:** Router extension — handle a story-reply action by resolving/creating the DM with the story author then navigating with `pendingReplyContext`.

**Public API surface:** `Router.navigateToStoryReply(_ context: ReplyContext, conversationListViewModel:)`.

**Key behaviors:** Fast path resolves the direct conversation from the local conversation list cache by `participantUserId`; falls back to `ConversationService.findDirectWith(userId:)` then `create` + `getById`. Sets `pendingReplyContext` before navigating; toast on failure.

**Dependencies:** `MeeshySDK`, `ConversationService`, `AuthManager`, `ToastManager`.

**Android-port note:** Equivalent suspend function on a navigation coordinator; cache-first then API. Preserve the "centralized so all call sites behave identically" rationale.

---

## apps/ios/Meeshy/Features/Main/Navigation/Router.swift

**Purpose:** App navigation state — `NavigationStack` path manager, deep-link dispatch, iPad two-column forwarding.

**Public API surface:**
- `enum Route: Hashable` — ~25 cases (conversation, settings, profile, contacts, community*, notifications, userStats, links, affiliate, trackingLinks, shareLinks, communityLinks, dataExport, postDetail, bookmarks, starredMessages, friendRequests, editProfile, `storyNotificationTarget(storyId:intent:context:)`). Extensions: `isHub`, `displayTitle`, `analyticsScreenName` (in AnalyticsManager.swift).
- `@MainActor final class Router: ObservableObject` (not a singleton — injected) — `@Published path: [Route]`, `deepLinkProfileUser`, `pendingShareContent`, `pendingReplyContext`, `pendingHighlightMessageId`; `onRouteRequested`/`onPopRequested` (iPad hooks); `push/pop/popToRoot`, `navigateToConversation(_:highlightMessageId:)`, `handleDeepLink(_:)`.

**Key behaviors:**
- `push` dedups against current route; hub routes pop back to existing instance instead of re-pushing; iPad intercept via `onRouteRequested`.
- `navigateToConversation` replaces the path in a single atomic mutation on iPhone (avoids "NavigationRequestObserver multiple times per frame" warning) but uses delayed two-step on iPad.
- `path.didSet` fires `AnalyticsManager.trackRoute` and a `[DIAG]` print.
- Deep-link handler maps `DeepLinkDestination` → navigation / magic-link validation / share content.

**Dependencies:** `MeeshySDK`, `MeeshyUI`, `os`, `ConversationService`, `AuthManager`, `ToastManager`, `AnalyticsManager`, `DeepLinkParser`.

**Android-port note:** Jetpack Navigation Compose or a custom back-stack `StateFlow<List<Route>>`. `Route` → sealed class/interface; hub-route dedup logic ports directly. iPad two-column maps to a list-detail `NavigableListDetailPaneScaffold` on large screens. Remove the `[DIAG]` print (tech debt).

---

## apps/ios/Meeshy/Features/Main/Services/APIClient.swift

**Purpose:** App-layer REST client — generic async/await requests, pagination, token refresh on 401.

**Public API surface:**
- Response types: `APIResponse<T>`, `PaginatedAPIResponse<T>` (+ `CursorPagination`), `OffsetPaginatedAPIResponse<T>` (+ `OffsetPagination`).
- `enum APIError: LocalizedError` — `invalidURL`, `noData`, `decodingError`, `serverError(Int, String?)`, `networkError`, `unauthorized`.
- `final class APIClient` (singleton) — `baseURL` (UserDefaults-switchable remote/local), `setUseLocalGateway(_:)`, `authToken`/`sessionToken` (Keychain-backed), `request<T>(endpoint:method:body:queryItems:)`, `paginatedRequest`, `offsetPaginatedRequest`, `post`, `put`, `delete`, `refreshAuthToken(currentToken:)`.

**Key behaviors:**
- Custom ISO8601 date decoding (with then without fractional seconds).
- On HTTP 401: transparently refreshes the token via `/auth/refresh`, retries once; on repeat-401 calls `AuthManager.handleUnauthorized()`.
- JSON decoding offloaded to `Task.detached(priority: .userInitiated)` (keeps main thread free).
- Bearer token + `x-session-token` header (anonymous sessions).
- Token refresh uses a direct `URLRequest` to avoid recursion.
- Base URLs hardcoded: `https://gate.meeshy.me/api/v1`, `http://localhost:3000/api/v1`.

**Dependencies:** `MeeshySDK`, `KeychainManager`, `AuthManager`, `RefreshTokenData`.

**Android-port note:** Retrofit + OkHttp + Moshi/kotlinx-serialization; an `Authenticator` for the 401 refresh-and-retry; `EncryptedSharedPreferences`/Keystore for tokens. Custom date adapter for the dual ISO8601 formats. Note: SDK has its own `APIClient` (`MeeshySDK/Networking`) — confirm which one Android should consolidate around; ideally one client.

---

## apps/ios/Meeshy/Features/Main/Services/AnalyticsManager.swift

**Purpose:** Firebase Analytics wrapper — screen tracking, privacy-gated collection.

**Public API surface:** `@MainActor final class AnalyticsManager` (singleton) — `syncCollectionState()`, `trackScreen(_:screenClass:)`, `trackRoute(_:)`. Extension `Route.analyticsScreenName`.

**Key behaviors:** Collection enabled/disabled per `UserPreferencesManager.privacy.allowAnalytics`; `trackRoute` maps each `Route` to a screen name (defaults to "ConversationList").

**Dependencies:** `FirebaseAnalytics`, `MeeshySDK`, `UserPreferencesManager`, `os`.

**Android-port note:** Firebase Analytics Android SDK; `setAnalyticsCollectionEnabled` gated on the same privacy preference. `analyticsScreenName` mapping ports directly. Call from a `NavController` destination-changed listener.

---

## apps/ios/Meeshy/Features/Main/Services/AnonymousSessionStore.swift

**Purpose:** Keychain persistence for `AnonymousSessionContext`, keyed by `linkId`.

**Public API surface:** `enum AnonymousSessionStore` — static `save(_:) -> Bool`, `load(linkId:) -> AnonymousSessionContext?`, `delete(linkId:)`.

**Key behaviors:** `kSecClassGenericPassword`, service `me.meeshy.app.anonymous-session`, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`; JSON-encodes the context.

**Dependencies:** `Security`, `os`, `AnonymousSessionContext`.

**Android-port note:** `EncryptedSharedPreferences` or Jetpack Security keyset, one entry per `linkId`. Same JSON serialization.

---

## apps/ios/Meeshy/Features/Main/Services/AttachmentSendService.swift

**Purpose:** Orchestrates sending a message with attachments — TUS upload of media/audio, then socket/REST send.

**Public API surface:**
- `struct AttachmentSendResult: Sendable`, `struct PendingFileInfo: Sendable`.
- `@MainActor protocol AttachmentSendServiceProviding` — `send(conversationId:content:attachments:audioURL:mediaFiles:thumbnails:replyToId:originalLanguage:onProgress:)`.
- `@MainActor final class AttachmentSendService` (singleton, DI for `MessageService`/`MessageSocketManager`).
- `enum AttachmentSendError: LocalizedError` — `missingConfiguration`, `socketConnectionFailed`.

**Key behaviors:**
- Ensures socket connected (connect + 1s sleep + check).
- Uploads audio (`audio/mp4`) and each non-audio attachment via `TusUploadManager`; computes `thumbHash` for images; caches uploaded data into `CacheCoordinator` (audio/images/thumbnails).
- **Audio messages go via socket** `sendWithAttachments` (triggers the translator audio pipeline); non-audio go via REST `MessageService.send` — matches the documented "audio pipeline only over WebSocket" rule.
- Deletes temp files after upload; progress published via Combine `progressPublisher`.

**Dependencies:** `MeeshySDK` (`MeeshyMessageAttachment`, `TusUploadManager`, `UploadQueueProgress`, `SendMessageRequest`, `MessageServiceProviding`, `MessageSocketProviding`), `CacheCoordinator`, `AuthManager`, `MeeshyConfig`, `APIClient`.

**Android-port note:** A `tus-android-client` (or custom TUS) for resumable uploads; coroutine-based send service. Preserve the audio-via-socket / others-via-REST split — it's a backend pipeline contract. ThumbHash needs a Kotlin port. Progress → `Flow<UploadQueueProgress>`.

---

## apps/ios/Meeshy/Features/Main/Services/AttachmentUploader.swift

**Purpose:** Simple synchronous (online-only) avatar upload via multipart form.

**Public API surface:** `protocol AttachmentUploading: Sendable` — `uploadAvatar(_ data: Data) async throws -> URL`; `final class AttachmentUploader` (singleton); static `compress(_:maxSizeKB:)`.

**Key behaviors:** Re-encodes JPEG, dropping compression quality in 0.1 steps until ≤ `maxSizeKB` (default 500KB); multipart POST to `/attachments/upload`.

**Dependencies:** `MeeshySDK`, `UIKit`, `APIClient`.

**Android-port note:** OkHttp `MultipartBody`; Bitmap compress loop. Distinct from the TUS path — avatars are small, online-only.

---

## apps/ios/Meeshy/Features/Main/Services/AudioPlayerManager.swift

**Purpose:** `AVAudioPlayer`-based playback for audio messages/statuses, integrated with playback + media-session coordinators.

**Public API surface:** `@MainActor class AudioPlayerManager: ObservableObject, StoppablePlayer, AVAudioPlayerDelegate` — `@Published isPlaying/progress/duration`; `play(urlString:)`, `playLocalFile(url:)`, `stop()`, `togglePlayPause()`.

**Key behaviors:**
- Loads audio via `CacheCoordinator.audio.data(for:)` (cache-first); plays from `Data`.
- Registers with `PlaybackCoordinator` so only one player runs at a time (`willStartPlaying(external:)`).
- Subscribes to `MediaSessionCoordinator.events` — pauses on interruption / route-change-old-device-unavailable; does **not** auto-resume.
- **Audit P1-8/P1-9:** never touches/deactivates the `AVAudioSession` while a VoIP call is active (`CallManager.callState.isActive`) — protects the WebRTC mic path.
- 0.05s progress timer; auto-stop at completion.

**Dependencies:** `AVFoundation`, `MeeshySDK`/`MeeshyUI` (`StoppablePlayer`, `PlaybackCoordinator`, `MediaSessionCoordinator`), `CacheCoordinator`, `CallManager`, `MeeshyConfig`.

**Android-port note:** `ExoPlayer` (or `MediaPlayer`) per instance; a single-player coordinator (`AudioFocusManager` + `AudioManager.requestAudioFocus`). Android audio-focus loss handling replaces the AVAudioSession interruption logic; pause-don't-resume rule ports. Respect active VoIP call state.

---

## apps/ios/Meeshy/Features/Main/Services/AudioRecorderManager.swift

**Purpose:** `AVAudioRecorder`-based voice-message recorder with live metering.

**Public API surface:** `@MainActor final class AudioRecorderManager: ObservableObject, AudioRecordingProviding` (singleton) — `@Published isRecording/duration/audioLevels`; `recordedFileURL`; `configure(settings:onMaxDurationReached:)`, `startRecording()`, `stopRecording() -> URL?`, `cancelRecording()`, `result() -> AudioRecordingResult?`.

**Key behaviors:**
- m4a / AAC; settings from `AudioRecordingSettings` (sample rate, channels, bit rate, min/max duration).
- **Audit P1-10:** refuses to start while a VoIP call is active; uses `.playAndRecord` + `.voiceChat` mode (system EC/AGC/NS) and drops Bluetooth A2DP to avoid HFP-flap glitches.
- 0.05s metering timer, 15-sample rolling `audioLevels` window, dB normalization (-50dB floor); `onMaxDurationReached` callback.
- **Audit P2-iOS-4:** deactivates the session on cancel so the mic indicator turns off.

**Dependencies:** `AVFoundation`, `MeeshySDK` (`AudioRecordingProviding`, `AudioRecordingSettings`, `AudioRecordingResult`), `CallManager`.

**Android-port note:** `MediaRecorder` (AAC/m4a) for the file + `AudioRecord` or `MediaRecorder.getMaxAmplitude()` for metering. Replace AVAudioSession config with `AudioManager` mode/focus + `VOICE_COMMUNICATION` source. Preserve the active-call guard and the 15-sample level window.

---

## apps/ios/Meeshy/Features/Main/Services/BackgroundTaskManager.swift

**Purpose:** `BGTaskScheduler` registration + scheduling for conversation sync and message prefetch.

**Public API surface:** `@MainActor final class BackgroundTaskManager` (singleton) — task IDs `conversation-sync` / `message-prefetch`; `registerTasks()`, `scheduleConversationSync(after:)`, `scheduleMessagePrefetch()`.

**Key behaviors:**
- Conversation sync = `BGAppRefreshTask`; message prefetch = `BGProcessingTask` (requires network).
- **Exponential backoff** on sync failure (1→2→4→8 min, cap 15 min), reset to 15 min on success; failure count persisted in UserDefaults.
- **±20% jitter** on both schedulers to avoid a thundering-herd wake-up.
- Prefetch reads cached conversations, picks up to 10 unread, calls `ConversationSyncEngine.ensureMessages`.
- `expirationHandler` cancels the in-flight task; reschedules *after* knowing the outcome.

**Dependencies:** `BackgroundTasks`, `MeeshySDK`, `ConversationSyncEngine`, `CacheCoordinator`, `os`.

**Android-port note:** `WorkManager` with `PeriodicWorkRequest` / `OneTimeWorkRequest`; backoff via `setBackoffCriteria(EXPONENTIAL)`; jitter via randomized `setInitialDelay`. Network constraint via `Constraints`. `expirationHandler` → cooperative coroutine cancellation when WorkManager stops the worker.

---

## apps/ios/Meeshy/Features/Main/Services/BackgroundTransitionCoordinator.swift

**Purpose:** Orchestrates the app's `.background`/foreground scene transitions under a bounded `beginBackgroundTask` umbrella.

**Public API surface:**
- `@MainActor protocol BackgroundTransitioning` — `enterBackground()`, `resumeFromBackground()`.
- `@MainActor final class BackgroundTransitionCoordinator` (singleton).
- `@MainActor final class MediaLifecycleBridge` (singleton) — `prepareForBackground()`, `resumeFromBackground()`.

**Key behaviors:**
- `enterBackground` ordered steps (each time-bounded, never rethrows): stop audio + deactivate session → flush all caches → purge stale TUS checkpoints (>2 days) → flush push receipts → sockets prepare-for-background → schedule BG tasks (auth users only) → notifications sync.
- `resumeFromBackground`: consume NSE pending messages → resume sockets → refresh presence (REST gap-fill) → resume audio → sync conversations → retry push receipts → flush offline outbox (`OutboxFlusher` + `OutboxDispatcher` + `OfflineQueue`).
- `withBudget` wraps each step, logs anything >1s.

**Dependencies:** `UIKit`, `MeeshySDK`/`MeeshyUI`, `MediaSessionCoordinator`, `PlaybackCoordinator`, `CacheCoordinator`, `TusUploadCheckpointStore`, `PushDeliveryReceiptService`, `MessageSocketManager`, `SocialSocketManager`, `BackgroundTaskManager`, `NotificationCoordinator`, `NSEPendingMessageConsumer`, `PresenceService`, `ConversationSyncEngine`, `DependencyContainer`, `OutboxFlusher`/`OutboxDispatcher`, `OfflineQueue`.

**Android-port note:** Map to `ProcessLifecycleOwner` `ON_STOP`/`ON_START` (or per-Activity lifecycle); each step a suspend function in a coordinator. The ordered choreography is architecturally important — replicate it. `MediaLifecycleBridge` is a clean SDK/app seam worth keeping.

---

## apps/ios/Meeshy/Features/Main/Services/CallEventQueue.swift

**Purpose:** Scaffold for a serial actor that will own canonical client-side call FSM state (Phase 0 — no transition logic yet).

**Public API surface:** `actor CallEventQueue` — `state: CallState`, `version: Int`, `currentCallId: String?`; `register(hook:)`, `unregister(hookIdentifier:)`, `currentHooks()`.

**Key behaviors:** Currently only manages a list of `MediaPipelineHook`s; intended as the single source of truth for call state with `CallManager` as a `@MainActor` façade. Reference: `docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md`.

**Dependencies:** `os`, `CallState`, `MediaPipelineHook`.

**Android-port note:** A coroutine `Actor`-like serialized event loop (single-threaded `CoroutineDispatcher` or `Channel`-backed processor) holding call FSM state, with a `ViewModel`-facing `StateFlow` mirror. Since this is an incomplete scaffold, port the *intent* (serial FSM + hook registry) once the call feature is built; don't carry the empty stub.

---

## Architecture observations

**State management & DI**
- Heavy singleton use (`APIClient`, `AnalyticsManager`, `AudioRecorderManager`, `BackgroundTaskManager`, `DeepLinkRouter`, `AttachmentSendService`, coordinators). Newer services *also* expose protocols (`AttachmentSendServiceProviding`, `BackgroundTransitioning`, `AudioRecordingProviding`, `AttachmentUploading`) with init-injection and `.shared` defaults — testability-aware. `Router` is notably **not** a singleton (injected). Android: prefer Hilt/Koin DI over `object` singletons; keep the protocol-first pattern as interfaces.
- ViewModels/managers are `@MainActor ObservableObject`; the call subsystem is moving to an `actor` (`CallEventQueue`) as a serial FSM with a `@MainActor` façade — a sound pattern, mirror with a serialized coroutine processor + `StateFlow`.

**Caching / SWR**
- Pervasive `CacheCoordinator` 3-tier cache (memory/disk/network) seeded eagerly on upload; background prefetch reads cache snapshots. Cache-first is enforced architecturally. Android: a `Store`-like layer (e.g. Store5 or a hand-rolled repository) feeding Compose state.

**Concurrency**
- async/await throughout; JSON decode offloaded to `Task.detached`. Audio/media subsystems carefully coordinate `AVAudioSession` against active VoIP calls (multiple "Audit P1-x" guards) — these are real bug fixes; the Android equivalent (`AudioManager` focus/mode vs. WebRTC call) must replicate the same guards.
- Background transition is choreographed with bounded budgets and a single `beginBackgroundTask` — replicate ordering on Android.

**Navigation**
- `Route` enum + `[Route]` stack `Router`; deep-link parsing is centralized, defensive, and dual-scheme (Universal Links + `meeshy://`). iPad two-column handled via route-interception callbacks.

**Performance techniques**
- `EmojiUsageTracker` deterministic ordering to kill re-render reshuffle; overlay menu reuses live-bubble sub-components (`BubbleContent`, `BubbleReactionsOverlay`) for visual consistency and to avoid divergent code; waveform interpolation avoids tiling artifacts; BG schedulers use jitter to avoid herd effects.

**Anti-patterns / tech debt — do NOT carry over**
- `Router.path.didSet` contains a raw `print("[DIAG] ...")` — drop it; use structured logging.
- `Models.swift`, `PostModels.swift`, `StoryModels.swift`, `Message.swift`, `Conversation.swift`, `FeedModels.swift` are empty/typealias-only shims (SDK migration residue) — Android should reference SDK/shared models directly, no shims.
- `VideoPreviewView.swift` is a deprecated typealias — ignore.
- App-layer `APIClient` duplicates the SDK's networking client — Android should consolidate on **one** HTTP client.
- `AttachmentSendService.ensureSocketConnected` uses a fixed 1-second `Task.sleep` to wait for socket connection — fragile; Android should await a real connection-state signal instead.
- `AnyCodable` silently defaults unknown payloads to `""` — lossy; avoid relying on it.

### Portable user-facing features / capabilities
- [ ] Long-press message overlay menu (preview bubble, quick reactions, action grid, drag-to-expand detail panel)
- [ ] Quick emoji reaction strip with usage-based ordering (most-used emojis surface first)
- [ ] In-overlay interactive audio/video preview (play/pause, scrub, ±5s, 0.5–2.0x speed)
- [ ] Message actions: reply, copy, pin/unpin, star/bookmark, edit, delete, delete attachment
- [ ] Report a message (7 reason types + optional detail)
- [ ] E2E security verification screen (safety number + QR code, pending state)
- [ ] Status thought-bubble popover on avatar tap, with republish action
- [ ] Universal message composer: text, attachments, voice recording, location, emoji
- [ ] Voice recording UI (iMessage-style pill: cancel, live waveform, timer, send) with min-duration gating
- [ ] Attachment ladder (emoji, file, location, camera, photo library, voice)
- [ ] Large-paste detection → clipboard-content attachment
- [ ] Ephemeral (self-destruct) message mode with duration picker
- [ ] Blurred-message ("tap to reveal") mode
- [ ] Message effects (glow, pulse, rainbow, sparkle) — full sheet + permanent inline picker for comments
- [ ] Live sentiment + language detection in the composer, with language pill/picker
- [ ] Per-context (story) draft save/restore in the composer
- [ ] Offline banner ("messages will send on reconnect")
- [ ] Upload progress bar (queue percent, current file, byte totals)
- [ ] Deep links: profile, conversation, join/chat link, magic link, share, user links (Universal Links + `meeshy://`)
- [ ] Story-reply → resolve/create DM with story author and navigate
- [ ] Send messages with attachments (resumable TUS upload; audio over socket, others over REST)
- [ ] Avatar upload (compressed JPEG)
- [ ] Audio message playback (cache-first, single-player coordination, interruption handling)
- [ ] Background conversation sync + message prefetch (with backoff & jitter)
- [ ] Magic-link authentication via deep link
- [ ] Privacy-gated analytics (screen tracking)
- [ ] Anonymous (shared-link) sessions with restricted send permissions
- [ ] Transparent token refresh on 401 with one retry
