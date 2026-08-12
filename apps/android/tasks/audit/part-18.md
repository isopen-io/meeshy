# Audit Part 18 — MeeshyUI: Auth, Community, Conversation Settings, JoinFlow, Location, Media

Scope: 23 SwiftUI files from `packages/MeeshySDK/Sources/MeeshyUI/`. These are reusable UI components in the `MeeshyUI` target (depends on `MeeshySDK` core). Feature areas: password recovery, registration flow, community CRUD, conversation/community settings, anonymous join flow, location sharing, and media viewers (audio/code/document/image).

---

## packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyForgotPasswordView.swift

**Purpose**: Multi-mode password recovery screen — recover via email link OR via phone number (account lookup → identity verification → SMS code → reset).

**Public API**: `MeeshyForgotPasswordView: View` (`public init()`). Internal enums `RecoveryMode {email, phone}`, `PhoneStep {lookup, verifyIdentity, verifyCode}`, struct `MaskedInfo`.

**Key behaviors**:
- Email flow: `authManager.requestPasswordReset(email:)` → success screen.
- Phone flow is a 3-step state machine making raw `APIClient.shared.post` calls with inline `Encodable`/`Decodable` structs:
  - `/auth/forgot-password/phone/lookup` → returns `tokenId` + masked user info (displayName/username/email partially hidden).
  - `/auth/forgot-password/phone/verify-identity` → user must type FULL username + email to prove identity.
  - `/auth/forgot-password/phone/verify-code` → SMS 6-digit code → `resetToken`.
  - `/auth/reset-password` with token + newPassword + confirmPassword.
- Reset password presented as a sheet (`.medium`/`.large` detents) with `PasswordStrengthIndicator` + client-side match check.

**Dependencies**: `AuthManager.shared`, `APIClient.shared`, `ThemeManager`, `CountryPicker`, `AuthTextField`, `PasswordStrengthIndicator`, `APIResponse<T>`.

**Android note**: Compose multi-step screen; model as a sealed-class recovery state. The phone flow security pattern (masked info + full-identity re-entry challenge) must be preserved exactly. Use a Retrofit endpoint set for the 4 calls; back the masked-info challenge with server validation. Localization strings (`.module` bundle) → `strings.xml`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift

**Purpose**: ViewModel + step enum driving the 8-step gamified registration wizard.

**Public API**:
- `enum RegistrationStep: Int, CaseIterable {pseudo, phone, email, identity, password, language, profile, recap}` with computed `funHeader`, `funSubtitle`, `iconName`, `accentColor`.
- `@MainActor final class RegistrationViewModel: ObservableObject` — 20+ `@Published` form/validation fields; `totalSteps`; methods `selectSuggestion`, `nextStep`, `previousStep`, `skipCurrentStep`, `register()`; computed `canProceed`, `phonePlaceholder`, `summaryItems`.

**Key behaviors**:
- `detectCountry()` from `Locale.current.region`; `detectLanguages()` maps region → language via static `regionLanguageMap` (~50 entries), validated against `LanguageSelector.defaultLanguages`.
- Combine debounce (1s) on username/email/phone → async availability checks via `AuthService.shared.checkAvailability`. Cancellable `Task` per field; on API failure, fields default to "available=true" (fail-open).
- Local validation: username 2-16 chars alphanumeric+`_-`; email contains `@` and `.`; phone ≥8 digits.
- `canProceed` is a per-step gate. `register()` builds `RegisterRequest` and delegates to `AuthManager.shared.register`.
- The funny FR/Cameroonian copy ("C'est comment mon gars?", "fort comme le ndole de maman") is brand voice — preserve tone.

**Dependencies**: `CountryPicker`, `LanguageSelector`, `AuthService`, `AuthManager`, `RegisterRequest`, Combine.

**Android note**: ViewModel (AndroidX `ViewModel` + `StateFlow`). Replace Combine debounce with `MutableStateFlow` + `.debounce(1000).distinctUntilChanged().mapLatest{}`. Region→language map → a resource/constant table. Keep the fail-open availability behavior as a deliberate choice (network errors should not block registration). Preserve gamified copy in localized resources.

---

## packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityCreateView.swift

**Purpose**: New-community creation form with live preview card, emoji picker, privacy toggle, and inline member search/select.

**Public API**: `CommunityCreateView: View` (`init(onCreated:, onDismiss:)`). Internal `@MainActor CommunityCreateViewModel: ObservableObject` — fields `name, identifier, description, selectedEmoji, isPrivate, memberSearch, searchResults, selectedMembers`; static `popularEmojis` (15); computed `accentColor` (via `DynamicColorGenerator.colorForName`), `isValid`; `createCommunity() async -> MeeshyCommunity?`.

**Key behaviors**:
- Live preview card: gradient from derived accent color + emoji + name + privacy badge, animated on name/emoji change.
- Identifier field prefixed with `mshy_`.
- Member search debounced (`didSet` → `scheduleSearch`, min 2 chars) via `UserService.shared.searchUsers`, excludes current user.
- `createCommunity()` calls `CommunityService.shared.create` then sequentially `addMember` for each selected member (best-effort `try?`).
- Default privacy is `private = true`.

**Dependencies**: `CommunityService`, `UserService`, `AuthManager`, `DynamicColorGenerator`, `MeeshyAvatar`, `UserSearchResult`, `MeeshyCommunity`.

**Android note**: Compose form + ViewModel. Member search as `StateFlow` debounce. Color derivation must reuse the shared `DynamicColorGenerator` port. Note add-member loop is N+1 calls — consider a bulk-create API for Android to reduce round trips.

---

## packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityDetailView.swift

**Purpose**: Community profile screen — banner/avatar header, stats, action buttons, segmented Channels/Feed tabs. Includes `AddChannelSheet`.

**Public API**: `CommunityDetailView: View` (`init(communityId:, onSelectConversation:, onOpenSettings:, onOpenMembers:, onInvite:, onDismiss:)`). `@MainActor CommunityDetailViewModel` — `community, conversations, isMember, isCreator, isAdmin, currentUserRole, isLoading`; `load()`, `joinCommunity()`, `leaveCommunity()`. `AddChannelSheet: View` with its own paginated state.

**Key behaviors**:
- `load()` fetches community, derives role: `isCreator = createdBy == currentUserId`; `isMember` = creator OR in member list; `isAdmin = role.hasMinimumRole(.admin) || isCreator`. Channels loaded only if member.
- Per-community color/emoji overridden from `UserDefaults` keys `community.color.{id}` / `community.emoji.{id}` (local-only personalization).
- Floating navigation header over banner; admin menu (settings/leave); non-admin gets a (non-functional) heart button.
- `bannerView` uses `CachedBannerImage` (3-tier cache, reused across cards).
- Feed tab is a placeholder (`EmptyStateView`).
- `AddChannelSheet`: paginated conversation list (page 20), search filter, can move a conversation already in another community (confirm dialog) via `CommunityService.addConversation`.

**Dependencies**: `CommunityService`, `ConversationService`, `AuthManager`, `MeeshyAvatar`, `CachedBannerImage`, `EmptyStateView`, `CommunitySettingsView`, `MemberRole`, `APIConversation`.

**Android note**: Compose screen with `Scaffold` + collapsing toolbar. Role derivation logic must port verbatim. The `UserDefaults` color/emoji overrides → `DataStore` (per-community keys). AddChannelSheet → bottom sheet with `LazyColumn` paging (Paging 3). Heart button is dead code — do NOT port.

---

## packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityInviteView.swift

**Purpose**: Search users and invite them to a community.

**Public API**: `CommunityInviteView: View` (`init(communityId:)`). `@MainActor CommunityInviteViewModel` — `searchText, searchResults, isSearching, invitedUserIds: Set<String>, recentlyInvited, invitingUserId`; `searchUsers()`, `inviteUser(userId:)`. DI via `CommunityServiceProviding` / `UserServiceProviding` protocols (testable).

**Key behaviors**:
- Search triggered on submit (not debounced), min 2 chars.
- Invited users tracked in a Set; "Recently Invited" section shown above results.
- Avatar shows presence (online/offline).

**Dependencies**: `CommunityService`, `UserService` (via protocols), `MeeshyAvatar`, `EmptyStateView`, `MeeshyColors`, `os.Logger`.

**Android note**: Compose search screen. This file demonstrates the SDK's protocol-based DI pattern (`{Service}Providing`) — Android should mirror with interfaces injected via Hilt. Search-on-submit is intentional; keep it.

---

## packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityListView.swift

**Purpose**: Grid of communities with search, pull-to-refresh, infinite scroll, collapsible header.

**Public API**: `CommunityListView: View` (`init(onSelectCommunity:, onCreateCommunity:, onDismiss:)`). `@MainActor CommunityListViewModel` — `communities, isLoading, hasMore, searchText`; `loadIfNeeded()`, `refresh()`, `loadMore()`, `load(append:)`. Private `VibrantCommunityCard: View, Equatable`.

**Key behaviors**:
- 2-column `LazyVGrid`; per-card staggered spring entrance animation (`delay(index * 0.04)`).
- `VibrantCommunityCard` is `Equatable` (equality only on `community` data — leaf-cell optimization per CLAUDE.md) — full-bleed banner with `CachedBannerImage`, ringed avatar with `CachedAvatarImage`, member/channel counts formatted (k/M).
- Search debounced 350ms via `searchTask` (`didSet`); resets offset.
- `loadIfNeeded` guards on `hasLoaded` flag; pagination page size 20, `hasMore` from `pagination.hasMore`.
- `CollapsibleHeader` driven by `ScrollOffsetPreferenceKey`.

**Dependencies**: `CommunityService`, `CollapsibleHeader`, `CachedBannerImage`, `CachedAvatarImage`, `DynamicColorGenerator`, `ScrollOffsetPreferenceKey`, `MeeshyColors`.

**Android note**: `LazyVerticalGrid` (2 columns) + Paging 3. The `Equatable` leaf-cell pattern → Compose stable/`@Immutable` data classes for skip-on-recompose. Staggered animation via `AnimatedVisibility` with index-based delay. Card count formatting helper is portable utility.

---

## packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityMembersView.swift

**Purpose**: Community member list grouped by role, with admin role-change/remove actions.

**Public API**: `CommunityMembersView: View` (`init(communityId:, onInvite:)`). `MemberRow: View`. `@MainActor CommunityMembersViewModel` — `members, isLoading, hasMore, isCurrentUserAdmin, isMember`; `canInvite`; `loadIfNeeded/refresh/loadMore/load`, `updateRole(memberId:role:)`, `removeMember(userId:)`. DI via `CommunityServiceProviding`.

**Key behaviors**:
- Members grouped by `CommunityRole` (`Dictionary(grouping:)`), sections sorted by `role.level` desc.
- `MemberRow`: avatar + presence, role badge with icon + role-tinted color; admin gets a `Menu` to change role (all `CommunityRole.allCases`) or remove (destructive).
- `load()` computes `isCurrentUserAdmin` from current user's `communityRole.hasMinimumRole(.admin)`.
- Pagination page size 30.

**Dependencies**: `CommunityService`, `AuthManager`, `MeeshyAvatar`, `EmptyStateView`, `CommunityRole`, `APICommunityMember`/`APICommunityUser`, `MeeshyColors`.

**Android note**: `LazyColumn` with sticky headers per role group. `CommunityRole` enum + `hasMinimumRole`/`level`/`icon`/`displayName` must port. Role-change menu → `DropdownMenu`. Paging 3 for member list.

---

## packages/MeeshySDK/Sources/MeeshyUI/Community/CommunitySettingsView.swift

**Purpose**: Edit community visuals (avatar/banner/color/emoji), name/description, privacy; delete/leave.

**Public API**: `CommunitySettingsView: View` (`init(community:, onUpdated:, onDeleted:, onLeft:)`). `@MainActor CommunitySettingsViewModel` — editable + `original*` snapshot fields; `hasChanges`; `save()`, `uploadCompressedAvatar/Banner`, `deleteCommunity()`, `leaveCommunity()`. Static `presetColors` (12 hex).

**Key behaviors**:
- Diff-based save: only changed fields sent to `CommunityService.update`; `hasChanges` compares against `original*` snapshots.
- Color + emoji are LOCAL-ONLY personalization persisted to `UserDefaults` (`community.color.{id}`, `community.emoji.{id}`), NOT sent to server.
- Image upload: writes to temp file → `TusUploadManager` (resumable TUS protocol) → returns `fileUrl`. Uses `.entityImagePickerFlow` modifier (crop/compress with maxSizeKB).
- Toasts posted via `NotificationCenter` (`meeshy.showToast`, userInfo message/isSuccess).
- Danger zone: creator sees delete, non-creator sees leave.

**Dependencies**: `CommunityService`, `MeeshyConfig`, `APIClient`, `TusUploadManager`, `MeeshyAvatar`, `PhotosUI`, `AuthManager`, `entityImagePickerFlow` modifier.

**Android note**: Compose settings screen. Diff-based save is a clean pattern — keep. TUS upload → a TUS Android client (e.g. tus-java-client). Photo picker → Android Photo Picker + crop. `UserDefaults` color/emoji → `DataStore`. Toast via `NotificationCenter` → an app-level event bus / `SnackbarHostState`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationSettingsView.swift

**Purpose**: Conversation/channel settings — visuals, info, permissions (write-role, announcement mode, slow mode, auto-translate), member management, delete-for-me / delete-for-all / leave.

**Public API**: `ConversationSettingsView: View` (`init(conversation:, currentUserRole:, onUpdated:, onLeft:)`). `@MainActor public ConversationSettingsViewModel` — editable + `original*` fields incl. `defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled`; `participants, totalMemberCount`; `save()`, `uploadCompressed*`, `leaveConversation`, `deleteConversationForAll`, `loadMembers`, `updateRole`, `expelParticipant`, `banParticipant`.

**Key behaviors**:
- Permissions section visible only to `currentUserRole.hasMinimumRole(.admin)`: write-role picker (everyone/member/moderator/admin), announcement toggle, slow-mode picker (0/10/30/60/300s), auto-translate toggle.
- Member management: search-filter locally; per-member `Menu` actions gated by role comparison (`currentUserRole > targetRole`): promote admin/moderator, demote member, expel, ban (admin+).
- Diff-based `save()` via `ConversationService.update`.
- Three danger actions: `deleteForMe` (server `deleteForMe` + `NotificationCoordinator.removeConversation` + `CacheCoordinator.conversations.invalidateAll()`); `deleteConversationForAll` (creator only); `leave`.
- `MemberRole` enum is `Comparable` (`<`, `>` used for permission gating); `effectiveRole` on participant.

**Dependencies**: `ConversationService`, `MeeshyConfig`, `APIClient`, `TusUploadManager`, `NotificationCoordinator`, `CacheCoordinator`, `MeeshyAvatar`, `PhotosUI`, `MemberRole`, `APIParticipant`.

**Android note**: Compose settings with conditional permissions section. `MemberRole` must be a `Comparable` enum in Kotlin (ordinal-based ordering). Member actions menu logic ports verbatim — it's the core moderation model. `deleteForMe` must trigger local cache invalidation + conversation removal from list. Auto-translate toggle ties into the Prisme Linguistique pipeline.

---

## packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift

**Purpose**: Floating "scroll-to-bottom" pill that morphs into a rich unread/typing/offline/search-loading indicator.

**Public API**: `ConversationScrollControlsView: View` — large `init` with ~16 params (unreadCount, typingUsernames, last-unread content + attachment thumb/audio metadata, isAudioPlaying, isOffline, isSearchingQuotedMessage, typingDotPhase, accentColor, secondaryColor, `onScrollToBottom`, `onPlayAudio`). Pure presentational (no VM).

**Key behaviors**:
- 4 states: searching-quoted (pulsing magnifier + dots), unread/typing rich preview, offline pill, plain chevron.
- Single-unread shows attachment preview (image via `ProgressiveCachedImage` thumbhash/thumbnail/full, or audio play/pause button) + text/typing label + count badge.
- Multiple-unread shows count; typing indicator takes priority over count.
- Typing label localized to FR pluralization (`écrit`/`écrivent`/`N personnes écrivent`).
- `typingDotPhase` (Int 0-2) drives animated dots; gradient background from accent/secondary, gray when offline.

**Dependencies**: `ProgressiveCachedImage`, `MeeshyColors`. Stateless apart from local `searchPulse`.

**Android note**: A stateless Compose component receiving all params (good — port directly). Use `AnimatedContent` for the 4-state morph. `ProgressiveCachedImage` → progressive image loader (thumbhash decode → thumbnail → full). Typing-dot animation via `rememberInfiniteTransition` or phase param hoisted from parent.

---

## packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/AnonymousJoinFormView.swift

**Purpose**: Form for anonymous users joining a conversation via share link — required/optional fields driven by link requirements.

**Public API**: `AnonymousJoinFormView: View` (`init(viewModel: JoinFlowViewModel, onBack:)`). Internal `enum FormField {firstName, lastName, username, email}`.

**Key behaviors**:
- Required fields: first/last name always; username if `linkInfo.requireNickname`; email if `requireEmail`; birthday picker if `requireBirthday` (min age 13 enforced via date range).
- Optional section shows username/email when not required.
- Language picker (14 languages) for content language.
- Focus-state field styling; error banner; submit gated on `viewModel.isFormValid`.

**Dependencies**: `JoinFlowViewModel`, `ThemeManager`, `MeeshyColors`.

**Android note**: Compose form bound to a shared `JoinFlowViewModel`. Birthday `DatePicker` with max-date = today − 13y (COPPA-style age gate — keep). Conditional fields driven by `ShareLinkInfo` flags.

---

## packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowSheet.swift

**Purpose**: Container sheet orchestrating the anonymous join flow phases (loading → preview → form → success/error).

**Public API**: `JoinFlowSheet: View` (`init(identifier: String, onJoinSuccess: (AnonymousJoinResponse) -> Void)`). Extension making `JoinFlowViewModel.Phase: Equatable`.

**Key behaviors**:
- Switches on `viewModel.phase`; transitions between phases with spring animation + slide.
- Ambient indigo orb background; success state shows checkmark + "open conversation" CTA invoking `onJoinSuccess`; error state offers retry.
- Loads link info on `.task`.

**Dependencies**: `JoinFlowViewModel`, `JoinLinkPreviewView`, `AnonymousJoinFormView`, `ThemeManager`, `MeeshyColors`, `HapticFeedback`.

**Android note**: A modal bottom sheet / dialog with a `when(phase)` Compose switch (sealed class `Phase`). `Phase` Equatable → Kotlin `data class`/sealed class auto-equality.

---

## packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift

**Purpose**: ViewModel for the anonymous join flow — loads share-link info, validates form, submits join.

**Public API**: `@MainActor public JoinFlowViewModel: ObservableObject` — `linkInfo: ShareLinkInfo?, joinResult: AnonymousJoinResponse?, phase: Phase, errorMessage`, form fields; `enum Phase {loading, preview, form, success, error(String)}`; `loadLinkInfo()`, `proceedToForm()`, `isFormValid`, `submitJoin()`.

**Key behaviors**:
- `loadLinkInfo` maps `MeeshyError.server(404)` → "link not found", `server(410)` → server message (expired).
- `submitJoin` builds `AnonymousJoinRequest` (birthday ISO8601 only if required), maps errors: 409 conflict, `.forbidden`, 410 gone, 429 rate-limit ("trop d'utilisateurs connectés"), `.auth`.
- `isFormValid` enforces link requirements (nickname/email).

**Dependencies**: `ShareLinkService.shared`, `ShareLinkInfo`, `AnonymousJoinRequest/Response`, `MeeshyError`.

**Android note**: AndroidX ViewModel; `Phase` sealed class. Error-code → message mapping must port (404/409/410/429). `ShareLinkService` → Retrofit service. This is the entry point for the deep-link join experience.

---

## packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinLinkPreviewView.swift

**Purpose**: Preview card for a share link before joining — conversation banner, details, stats, requirements, join CTA.

**Public API**: `JoinLinkPreviewView: View` (`init(linkInfo: ShareLinkInfo, onJoin:)`).

**Key behaviors**:
- Banner with gradient + avatar initials, conversation type icon/label (direct/group/public/global/community/channel).
- Stats row: participants / language count / member count.
- Requirements badges (account/nickname/email/birthday), allowed-languages list.
- If `requireAccount`, hides join button and shows "account required" message.
- `relativeDate()` formats link expiry in FR ("dans Nmin/h/j", "le dd MMM").
- Usage counter `currentUses/maxUses`.

**Dependencies**: `ShareLinkInfo`, `ThemeManager`, `MeeshyColors`.

**Android note**: Stateless Compose card. Type-icon/label mapping and `relativeDate` are portable helpers (relative-time should use Android's `DateUtils.getRelativeTimeSpanString` or a shared formatter). `requireAccount` branch gating must port.

---

## packages/MeeshySDK/Sources/MeeshyUI/Location/LiveLocationBadge.swift

**Purpose**: Two components for live location sharing — an active-share badge and a duration picker.

**Public API**:
- `LiveLocationBadge: View` (`init(username:, remainingTime: TimeInterval, accentColor:, onStop:)`) — pulsing green dot, "X partage sa position", countdown, optional Stop button.
- `LiveLocationDurationPicker: View` (`init(selectedDuration: Binding<LiveLocationDuration>, accentColor:)`) — capsule chips for `LiveLocationDuration.allCases`.

**Key behaviors**: `formattedRemaining` formats time as `Hh MMm` / `Nmin SSs` / `Ns restantes`.

**Dependencies**: `LiveLocationDuration` (SDK enum, `CaseIterable`, `displayText`), `MeeshySDK`.

**Android note**: Two small Compose components. `LiveLocationDuration` enum ports directly. Pulsing dot via `rememberInfiniteTransition`. The countdown text needs a ticking timer in the parent.

---

## packages/MeeshySDK/Sources/MeeshyUI/Location/LocationFullscreenView.swift

**Purpose**: Fullscreen map view of a shared location with open-in-Maps / directions actions.

**Public API**: `LocationFullscreenView: View` (`init(latitude:, longitude:, placeName:, address:, accentColor:, senderName:)`). Private `FullscreenMapView17` (iOS 17 `Map` API), `FullscreenMapView16` (legacy `Map`).

**Key behaviors**:
- 1000m region; standard/hybrid map toggle.
- Bottom card: sender, place name/address, raw coordinates (monospaced), "Ouvrir dans Plans" + "Itinéraire" buttons via `MKMapItem.openInMaps` (driving directions).
- iOS-version-split map implementations.

**Dependencies**: `MapKit`, `LocationPinView` (from LocationMessageView.swift).

**Android note**: Google Maps Compose (`GoogleMap` composable) or Mapbox. "Open in Maps"/directions → `Intent` with `geo:` URI / Google Maps navigation intent. Hybrid toggle → `MapType`. No version split needed on Android.

---

## packages/MeeshySDK/Sources/MeeshyUI/Location/LocationMessageView.swift

**Purpose**: Inline location message bubble — small non-interactive map preview with info bar; tap → fullscreen. Defines shared `LocationPinView`.

**Public API**: `LocationMessageView: View` (`init(latitude:, longitude:, placeName:, address:, accentColor:, onTapFullscreen:)`). `enum LocationPinSize {small, large}` with size metrics. `struct LocationPinView: View`. `struct LocationAnnotationItem: Identifiable` (iOS 16 annotation). Private `LocationMapView17`/`LocationMapView16`.

**Key behaviors**: 260pt-wide card, 150pt map (interaction disabled), 500m region, optional info bar with place/address. Custom pin = white location icon on accent-colored circle + triangle pointer.

**Dependencies**: `MapKit`.

**Android note**: Compose map preview with `uiSettings` all disabled (lite mode / static). Custom `Marker` with a composable pin. Tap → navigate to fullscreen. `LocationPinSize` metrics port as a constants enum.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift

**Purpose**: Audio message player — `AudioPlaybackManager` (playback engine) + `AudioPlayerView` (UI with waveform, inline transcription, multi-language audio switching).

**Public API**:
- `@MainActor public AudioPlaybackManager: NSObject, ObservableObject` — `isPlaying, progress, currentTime, duration, speed: PlaybackSpeed, isLoading`; `onPlaybackFinished`, `attachmentId`; `play(urlString:)`, `playLocal(url:)`, `stop()`, `togglePlayPause()`, `seek(to:)`, `seekToTime`, `skip(seconds:)`, `setSpeed`, `cycleSpeed`, `unregisterFromCoordinator()`; static autoplay registry (`registerAutoplay`/`unregisterAutoplay`).
- `public AudioPlayerView: View` — props for attachment, context, transcription, `translatedAudios`, callbacks; rich `init` with `bottomContent` ViewBuilder.

**Key behaviors**:
- Playback through `CacheCoordinator.shared.audio.data(for:)` (cached fetch); `AVAudioSession` playback category; rate-enabled `AVAudioPlayer`.
- `PlaybackCoordinator.shared` ensures single active player (registers/`willStartPlaying`).
- Listen-progress telemetry: posts `/attachments/{id}/status` with `action: listened`, position/duration, `complete` (only if ≥3s listened or completed).
- Autoplay-next: static registry of (url, play closure); on finish, triggers the previous-registered entry (chains voice messages newest→oldest).
- Waveform: 25/35 bars, `AudioWaveformAnalyzer` real samples or deterministic sine-fallback; tap-to-seek on waveform.
- Inline transcription: `TranscriptionDisplaySegment`s rendered via `FlowLayout`, active segment highlighted/tappable to seek; long transcriptions (>255 chars) truncated + expand chevron.
- Multi-language: language pills switch between original + `translatedAudios`; `externalLanguage` binding syncs language across views.
- 50ms progress timer.

**Dependencies**: `AVFoundation`, `CacheCoordinator`, `PlaybackCoordinator`, `MeeshyConfig`, `APIClient`, `AudioWaveformAnalyzer`, `WaveformCache`, `PlaybackSpeed`, `TranscriptionDisplaySegment`, `MessageTranscription`, `MessageTranslatedAudio`, `DetectedLanguage`, `FlowLayout`, `MediaPlayerContext`.

**Android note**: `AudioPlaybackManager` → a `MediaPlayer`/ExoPlayer-backed ViewModel; `AVAudioSession` → `AudioManager`/audio focus. Single-active-player coordinator → a singleton holding the current player. Autoplay registry is order-dependent — model as a list of voice messages with next-index logic. Waveform analyzer (Part covers `AudioWaveformAnalyzer`); render bars in Compose `Canvas`. Listen-telemetry POST must port (analytics for read receipts on audio). This is a high-complexity component — budget accordingly.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/AudioWaveformAnalyzer.swift

**Purpose**: `@MainActor ObservableObject` wrapper around `WaveformCache` exposing `@Published samples` for SwiftUI binding.

**Public API**: `AudioWaveformAnalyzer` — `samples: [Float], isAnalyzing`; `analyze(data:barCount:)`, `analyze(url:barCount:)`, `waveformImageData(from:width:height:) async -> Data`; static `generateFallback(count:)`.

**Key behaviors**: Delegates to `WaveformCache.shared` (actor doing the actual PCM analysis); cancellable `Task`; on failure produces a deterministic sine-based fallback waveform. `waveformImageData` generates a waveform thumbnail (used as audio thumbhash).

**Dependencies**: `AVFoundation`, `WaveformCache` (SDK core).

**Android note**: A ViewModel exposing `StateFlow<List<Float>>`. The actual decode/downsample (`WaveformCache`) is in core — audited elsewhere; Android needs an equivalent PCM-extraction utility (`MediaExtractor`/`MediaCodec`). Keep the deterministic fallback generator.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/CodeViewerView.swift

**Purpose**: Source-code attachment viewer — inline preview card + fullscreen sheet with syntax highlighting.

**Public API**: `CodeViewerView: View` (`init(attachment:, language: CodeLanguage, context:, accentColor:, onDelete:)`). `CodeFullSheet: View` (`init(attachment:, language:, codeContent:, accentColor:)`).

**Key behaviors**:
- Loads code via `CacheCoordinator.shared.images.data(for:)` decoded as UTF-8 (text fetched through the image cache store).
- Inline card: language badge (colored), file size, first 10 highlighted lines + "+N lignes" indicator.
- Compact card variant for composer.
- `CodeFullSheet`: full file, horizontal+vertical scroll, line numbers, copy-to-clipboard.
- Syntax highlighting via `SyntaxHighlighter.highlight(code, language:, theme:, fontSize:)` returning per-line `AttributedString`s; `SyntaxTheme.github(isDark:)`.

**Dependencies**: `CacheCoordinator`, `MeeshyConfig`, `CodeLanguage`, `SyntaxHighlighter`, `SyntaxTheme`, `MediaPlayerContext`, `UIPasteboard`.

**Android note**: Compose code viewer. Syntax highlighter → a Kotlin highlighter (e.g. Prism4j / Highlights library) producing `AnnotatedString`. `CodeLanguage` enum + colors port. Fullscreen sheet → separate screen with horizontal scroll (`horizontalScroll`). Copy → `ClipboardManager`.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/DocumentViewerView.swift

**Purpose**: Document attachment viewer — inline rich/compact card + fullscreen `WKWebView` sheet.

**Public API**: `DocumentViewerView: View` (`init(attachment:, context:, accentColor:, onDelete:)`). `DocumentFullSheet: View`. `DocumentWebView: UIViewRepresentable` (WKWebView wrapper).

**Key behaviors**:
- `DocumentMediaType.detect(from:)` → icon/color/label; rich card shows name, type, size, page count.
- Fullscreen renders the document URL in a `WKWebView`; `ShareLink` for sharing; fallback "preview unavailable" view.
- Compact variant for composer with delete button.

**Dependencies**: `WebKit`, `DocumentMediaType`, `MeeshyConfig`, `MediaPlayerContext`.

**Android note**: Compose document card. `WKWebView` → Android `WebView` (`AndroidView` wrapper) — or better, render PDFs natively via `PdfRenderer` for offline support. Share via `Intent.ACTION_SEND`. `DocumentMediaType` detection logic ports.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/ImageFilterEngine.swift

**Purpose**: Core Image-based photo editing engine — filter presets, manual adjustments, effects, thumbnail generation.

**Public API**:
- `enum ImageFilter` (12: original/vivid/dramatic/mono/noir/sepia/warm/cool/fade/chrome/process/instant) — `displayName`.
- `enum ImageEffect` (6: none/blur/vignette/sharpen/bloom/grain) — `displayName`, `iconName`.
- `@MainActor public ImageFilterEngine: ObservableObject` — `activeFilter, brightness, contrast, saturation, sharpness, vignetteIntensity, activeEffect`; `applyEdits(to:) -> UIImage`, `generateThumbnails(from:size:) -> [ImageFilter: UIImage]`, `reset()`.

**Key behaviors**:
- Pipeline: filter preset → manual `CIColorControls`/`CISharpenLuminance`/`CIVignette` adjustments → effect.
- Filters map to `CIPhotoEffect*`, `CISepiaTone`, `CITemperatureAndTint`, `CIColorControls`.
- Effects: Gaussian blur, vignette, sharpen, bloom, custom grain (random generator + color matrix + source-over composite).
- `generateThumbnails` renders all 12 filter previews at thumbnail size.
- GPU-backed `CIContext` (software renderer disabled).

**Dependencies**: `CoreImage`, `CoreImage.CIFilterBuiltins`, `UIKit`.

**Android note**: This is the heaviest port. Core Image → RenderScript is deprecated; use GPUImage-Android, a custom OpenGL ES / Vulkan pipeline, or `RenderEffect` (API 31+) for blur. Each `CIFilter` needs an equivalent shader. Thumbnail generation → render all presets to small bitmaps off-thread. Consider whether full filter parity is in scope for v1 — it's a large effort; the filter/effect enums + display names are portable but the engine is a rewrite.

---

## packages/MeeshySDK/Sources/MeeshyUI/Media/ImageViewerView.swift

**Purpose**: Image attachment viewer — inline cached image (context-sized) + zoomable fullscreen viewer with save-to-photos.

**Public API**: `ImageViewerView: View` (`init(attachment:, context:, accentColor:, isOwnMessage:, onDelete:, onEdit:)`). `ImageFullscreen: View` (`init(imageUrl:, accentColor:, caption:, mentionDisplayNames:, attachmentId:)`).

**Key behaviors**:
- Inline: `CachedAsyncImage` with target size 280×280, shimmer placeholder; context-dependent max width/height (messageBubble 240×200, composer 100×80, feed/story/fullscreen larger).
- Overlays: delete (composer), edit pill (editable contexts), file-size badge.
- `ImageFullscreen`: pinch-zoom (`MagnifyGesture`, 1–5×), pan, double-tap zoom, drag-down-to-dismiss (>200pt at scale ≤1.05), tap to toggle controls.
- Save-to-photos: downloads via `URLSession`, `PhotoLibraryManager.shared.saveImage`, state machine (idle/saving/saved/failed), posts `downloaded` attachment status.
- View telemetry: on disappear posts `/attachments/{id}/status` `action: viewed` (if ≥500ms), with `wasZoomed` flag. Suppressed for own messages (`attachmentId: nil`).
- Caption rendered with `MessageTextRenderer` (mention-aware).

**Dependencies**: `CachedAsyncImage`, `MeeshyConfig`, `PhotoLibraryManager`, `APIClient`, `MessageTextRenderer`, `AttachmentStatusBody`, `MediaPlayerContext`, `HapticFeedback`.

**Android note**: Compose image viewer. `CachedAsyncImage` → Coil with size hints + placeholder/shimmer. Fullscreen zoom/pan → `Modifier.pointerInput` with `detectTransformGestures` + double-tap; drag-to-dismiss gesture. Save → MediaStore (scoped storage). Telemetry POSTs (`viewed`/`downloaded`/`wasZoomed`) must port — these feed read-receipt analytics. Caption mention rendering shares the `MessageTextRenderer` port.

---

## Architecture observations

**State management**: Consistent MVVM — every screen has a `@MainActor ObservableObject` ViewModel with `@Published` fields. Two DI styles coexist: most VMs hard-reference `Service.shared` singletons, but newer ones (`CommunityInviteViewModel`, `CommunityMembersViewModel`) inject `{Service}Providing` protocols with `.shared` defaults — Android should standardize on the latter (Hilt-injected interfaces) everywhere.

**Diff-based settings save**: Both settings VMs snapshot `original*` values at init, expose `hasChanges`, and send only changed fields to the API. Clean, idempotent — port as-is.

**Pagination pattern**: Repeated everywhere — `hasLoaded` guard, `currentOffset`, `pageSize` (20 or 30), `loadIfNeeded/refresh/loadMore`, `hasMore` from `pagination.hasMore`. Android should replace this hand-rolled pattern with Paging 3 + `RemoteMediator`.

**Caching / SWR**: `CacheCoordinator` is the single entry point — audio fetched via `.audio`, code text via `.images` store (text-through-image-cache is a quirk). `CachedBannerImage`/`CachedAvatarImage`/`CachedAsyncImage`/`ProgressiveCachedImage` are 3-tier (memory/disk/network) progressive loaders. Android: Coil for images + a custom disk cache for audio; preserve progressive thumbhash→thumbnail→full loading.

**Concurrency**: Combine debounce for form validation; cancellable `Task` per async operation (consistent `Task.isCancelled` checks). `PlaybackCoordinator` enforces a single active audio player globally. Android: `StateFlow.debounce`, `viewModelScope` + `Job` cancellation, a singleton playback coordinator.

**Local-only personalization tech debt**: Community color/emoji stored in `UserDefaults` (per-id keys) and NOT synced to server — only device-local. Decision to port deliberately or move server-side; flagged.

**Telemetry**: Media views post `/attachments/{id}/status` (`listened`/`viewed`/`downloaded` + position/duration/`wasZoomed`/`complete`), gated by minimum engagement thresholds (3s audio, 500ms image). This drives read receipts — must port.

**Cross-cutting events**: Toasts via `NotificationCenter` (`meeshy.showToast`) — Android needs an app-level event bus / shared `SnackbarHostState`.

**Anti-patterns to NOT carry over**: dead "heart" button in CommunityDetailView; placeholder Feed/Posts tabs; `print()` logging in `CommunityListViewModel` (others use `os.Logger`); inline ad-hoc `Encodable/Decodable` request structs in `MeeshyForgotPasswordView` (should be in a service layer); fail-open availability validation is intentional but document it.

**Performance**: Leaf-cell `Equatable` conformance (`VibrantCommunityCard`) to skip re-renders — Android: stable `@Immutable` data classes. GPU `CIContext` for image filters. Deterministic waveform fallback avoids blocking on analysis. Lazy grids/stacks throughout.

**iOS version splits**: MapKit code branches iOS 16 vs 17 `Map` APIs — irrelevant on Android (single Maps SDK).

### Portable user-facing features
- [ ] Password recovery via email link
- [ ] Password recovery via phone (lookup → masked-info identity challenge → SMS code → reset)
- [ ] 8-step gamified registration wizard with live username/email/phone availability checks
- [ ] Country auto-detection + region→language inference at signup
- [ ] Community creation (name, identifier `mshy_`, description, emoji, privacy, initial members)
- [ ] Community detail screen (banner, stats, channels list, role-based actions)
- [ ] Add existing conversation as a community channel (incl. move from another community)
- [ ] Community member invite (user search + invited tracking)
- [ ] Community member management (role grouping, promote/demote, remove)
- [ ] Community settings (avatar/banner upload, color/emoji, privacy, delete/leave)
- [ ] Conversation settings (visuals, info, permissions, members, delete-for-me/all, leave)
- [ ] Conversation moderation: write-role, announcement mode, slow mode, auto-translate, expel/ban
- [ ] Floating scroll-to-bottom control with rich unread/typing/offline/search states
- [ ] Anonymous join-via-share-link flow (preview → form → success)
- [ ] Share-link preview (conversation info, stats, requirements, expiry)
- [x] Live location sharing badge + duration picker (`chat-live-location-sessions` 2026-07-16 — `:sdk-ui` `LiveLocationBadge` + `LiveLocationDurationPicker`)
- [ ] Location message bubble + fullscreen map (open in Maps / directions)
- [ ] Audio message player (waveform, speed control, seek)
- [ ] Inline audio transcription with tap-to-seek + multi-language audio switching
- [ ] Voice-message autoplay-next chaining
- [ ] Audio/image listen/view/download telemetry (read receipts)
- [ ] Code attachment viewer with syntax highlighting + copy
- [ ] Document attachment viewer (WebView/PDF) with share
- [ ] Image attachment viewer with pinch-zoom, pan, double-tap, drag-to-dismiss
- [ ] Save image to photo library
- [ ] Photo filter/effect editing engine (12 filters, 6 effects, manual adjustments)
