# iOS → Android Audit — Part 02

Scope: `apps/ios/Meeshy/Features/Main/Components/` (chunk-02, 20 files). These are the reusable UI components powering the conversation-info, conversation-locking, invite/share, message-detail, mentions, effects, location-picker, and message-composer feature areas.

---

## apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift

**Purpose**: Bottom-sheet "Conversation" info screen — hero/direct header, action buttons, security verification entry point, pinned-messages preview, and a 4-tab pager (Members / Media / Stats / Options).

**Public API surface**:
- `struct ConversationInfoSheet: View` — inputs: `conversation: Conversation`, `accentColor: String`, `messages: [Message]`.
- `enum InfoTab: String, CaseIterable` — `.members ("Membres")`, `.media ("Medias")`, `.plus ("Stats")`, `.preferences ("Options")`.
- Nested sub-views: `ConversationSettingsView`, `ConversationDashboardView`, `ConversationPreferencesTab`, `SecurityVerificationView`.

**Key behaviors / business logic**:
- `canManageMembers`: role gate — only `creator`/`admin`/`moderator` see the settings gear and "Gerer les membres" link.
- Direct vs group/public branching: direct shows `directConversationHeader` + a block-user button; groups show `heroConversationHeader` (banner image + overlapping avatar).
- `pinnedMessages` derived from `messages.filter { $0.pinnedAt != nil }` sorted desc; `mediaMessages`/`mediaAttachments` filter image/video attachments.
- Participants are paginated: `loadParticipants()` → `ParticipantService.loadFirstPage`, infinite-scroll `loadMoreParticipants()` triggered when last row appears; client-side member search.
- Share link creation via `ShareLinkService.createShareLink` → presents native `UIActivityViewController`.
- Leave conversation via `ConversationService.leave`; block user via `BlockService.blockUser`.
- Reads `PresenceManager.shared` directly (NOT `@ObservedObject`) deliberately to avoid presence events forcing full sheet re-render — a performance pattern.

**Dependencies & couplings**: `ParticipantService`, `ShareLinkService`, `ConversationService`, `BlockService`, `PresenceManager`, `StatusViewModel` (EnvironmentObject), `ToastManager`, `ThemeManager`, `MeeshyAvatar`, `ProgressiveCachedImage`, `HapticFeedback`.

**Android-port note**: Map to a `ModalBottomSheet` with a `HorizontalPager` + tab row. Members/Media use `LazyColumn`/`LazyVerticalGrid` with paging (Paging 3 `LazyPagingItems`). Share = Android `Intent.ACTION_SEND` chooser. ViewModel should expose participants + loadState; do NOT replicate the inline-`@State`-everywhere pattern — hoist participant pagination into a ViewModel.

---

## apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift

**Purpose**: 6-digit master-PIN / 4-digit per-conversation-lock numeric keypad sheet. Single component covers 7 distinct flows.

**Public API surface**:
- `struct ConversationLockSheet: View` — inputs: `mode: Mode`, `conversationId: String?`, `conversationName: String`, `onSuccess: () -> Void`.
- `enum Mode`: `.setupMasterPin`, `.changeMasterPin`, `.removeMasterPin`, `.lockConversation`, `.unlockConversation`, `.openConversation`, `.unlockAll`.

**Key behaviors / business logic**:
- PIN length is mode/step-dependent: 6 for master operations, 4 for per-conversation; `lockConversation` step 0 = 6 (verify master), steps 1/2 = 4.
- Multi-step state machine (`step` 0/1/2) drives titles, subtitles, icons. Step 2 = confirm.
- `handleComplete()` is the core dispatcher: each mode validates via `ConversationLockManager.shared` (`setMasterPin`, `verifyMasterPin`, `forceRemoveMasterPin`, `setLock`, `verifyLock`, `removeLock`, `removeAllLocks`).
- `shakeAndReset` — error feedback: shake animation (`repeatCount(4)`), error haptic, clears PIN, resets to step 1 on confirm mismatch.

**Dependencies & couplings**: `ConversationLockManager.shared` (local-only PIN storage — likely Keychain), `ThemeManager`, `HapticFeedback`, `MeeshyColors`.

**Android-port note**: Build a stateful PIN keypad composable; mode/step state machine maps cleanly to a sealed class + `when`. `ConversationLockManager` → Android equivalent backed by `EncryptedSharedPreferences` / Keystore. The 7-mode enum is a clean spec to port verbatim. Worth a dedicated `LockViewModel` rather than `@State` in the view.

---

## apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift

**Purpose**: "Options" tab content of ConversationInfoSheet — per-user conversation preferences (display, organization, notifications, destructive actions).

**Public API surface**:
- `struct ConversationPreferencesTab: View` — inputs: `conversation`, `participants`, `accentColor`.
- Owns `@StateObject ConversationOptionsViewModel(conversationId:)`.
- Private models: `PrefsUserSearchResult`, `PrefsUserSearchResponse`.

**Key behaviors / business logic**:
- Sections: Display (custom name, reaction emoji), Organization (pin toggle, category picker, tag input), Notifications (mute toggle, mentions-only toggle — disabled when muted), Actions (archive/unarchive, leave group, delete-for-me).
- All preference mutations go through `ConversationOptionsViewModel` (`setCustomName`, `setReaction`, `setPinned`, `setCategory`, `createCategoryAndSelect`, `setTags`, `setMuted`, `setMentionsOnly`, `toggleArchive`, `leave`, `deleteForMe`).
- `canLeave` = not direct and not creator. `isCreator` gate.
- Member search debounce: `PassthroughSubject` + `.debounce(300ms)`, min 3 chars, hits `/users/search`, filters out existing/already-added members. (Search results state is present but the UI rendering of it isn't in this section — partially dead code.)
- Watches `viewModel.didDelete`/`didLeave` to auto-dismiss.

**Dependencies & couplings**: `ConversationOptionsViewModel`, `APIClient`, `CategoryPickerField`, `TagInputField`, `EmojiPickerSheet`, `StatusViewModel`, `PresenceManager`.

**Android-port note**: Map to a settings screen with `Switch`, chip-based tag input, category dropdown. Use a ViewModel exposing a `prefs` state object. Debounced search → `snapshotFlow`/`debounce` operator on a `MutableStateFlow`. Note `prefsIfEmptyFallback` helper — trivial. The unused platform-search state is tech debt — don't carry it.

---

## apps/ios/Meeshy/Features/Main/Components/CrashReportSheet.swift

**Purpose**: Debug/diagnostics sheet listing captured crash diagnostics with expandable detail and a share-all action.

**Public API surface**:
- `struct CrashReportSheet: View` — input: `reports: [CrashDiagnostic]`.
- Consumes `CrashDiagnostic` (`id`, `kind`, `timestamp`, `summary`, `details`) and `CrashDiagnostic.Kind` (`.nsException`, `.crash`, `.hang`, `.cpuException`, `.diskWriteException`).

**Key behaviors / business logic**:
- `List` of sections; tap row expands `details` (monospaced, selectable text).
- `kindBadge` color-codes severity; `formatAllReports()` builds a plain-text bundle for `ShareLink`.

**Dependencies & couplings**: `CrashDiagnostic` model (likely from a `CrashReportManager`), `MeeshyColors`.

**Android-port note**: Lower priority (developer/diagnostics surface). Maps to a `LazyColumn` of expandable cards. Android crash capture would use `MetricKit` equivalent — Firebase Crashlytics non-fatal logs or `ApplicationExitInfo`. Share via `ACTION_SEND` text intent.

---

## apps/ios/Meeshy/Features/Main/Components/EffectsPickerView.swift

**Purpose**: Bottom-sheet picker for message visual effects (behavior, entry animation, permanent effects, ephemeral duration).

**Public API surface**:
- `struct EffectChip: View` — toggleable chip bound to a `MessageEffectFlags` OptionSet.
- `struct EffectsPickerView: View` — `@Binding var effects: MessageEffects`, `accentColor: String`.
- Consumes `MessageEffectFlags` (option set: `.ephemeral`, `.blurred`, `.viewOnce`, `.shake`, `.zoom`, `.explode`, `.confetti`, `.fireworks`, `.waoo`, `.glow`, `.pulse`, `.rainbow`, `.sparkle`), `MessageEffects` (`flags`, `ephemeralDuration`, `hasAnyEffect`), `EphemeralDuration` enum.

**Key behaviors / business logic**:
- 3 effect categories rendered via `FlowLayout`. Ephemeral duration picker appears conditionally when `.ephemeral` is set.
- Active-effects summary uses `effects.flags.rawValue.nonzeroBitCount` to count; "Tout effacer" resets to `.none`.

**Dependencies & couplings**: `MessageEffects`/`MessageEffectFlags` (SDK), `FlowLayout`, `EphemeralDuration`, `HapticFeedback`.

**Android-port note**: `MessageEffectFlags` OptionSet → Kotlin `enum class` + `EnumSet` or bitmask `Int`. `FlowLayout` → Compose `FlowRow`. Chips → `FilterChip`. The actual effect rendering lives in `MessageEffectModifiers.swift` (below).

---

## apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift

**Purpose**: Sheet to forward a message to another conversation; thin message preview + searchable conversation list with per-row send buttons.

**Public API surface**:
- `struct ForwardPickerSheet: View` — inputs: `message: Message`, `sourceConversationId: String`, `accentColor: String`, `onDismiss: () -> Void`.

**Key behaviors / business logic**:
- Loads conversations via `APIClient.offsetPaginatedRequest("/conversations", offset:0, limit:50)`, maps `APIConversation.toConversation(currentUserId:)`.
- Excludes the source conversation; client-side name search.
- Forward = `POST /conversations/{id}/messages` with `SendMessageRequest(forwardedFromId:, forwardedFromConversationId:)`.
- Per-row state: `sendingToId` (spinner), `sentToIds` (green check) — optimistic-ish, disables other sends while one is in flight.

**Dependencies & couplings**: `APIClient`, `AuthManager`, `MeeshyAvatar`, `StatusViewModel`, `ProgressiveCachedImage`. Note duplication: ForwardPickerSheet AND MessageDetailSheet's "forward" tab both implement forwarding — tech debt.

**Android-port note**: `ModalBottomSheet` + `LazyColumn`. Forwarding is also reachable from MessageDetailSheet — consolidate into one `ForwardMessageUseCase` for Android. `forwardedFromId`/`forwardedFromConversationId` fields must be in the Android `SendMessageRequest`.

---

## apps/ios/Meeshy/Features/Main/Components/GlobalEnvironment.swift

**Purpose**: Compile-safe injection helper for global environment objects across SwiftUI context boundaries (`.sheet`/`.fullScreenCover` lose environment by default).

**Public API surface**:
- `extension View { func injectGlobalEnvironment(router:conversationListViewModel:statusViewModel:) -> some View }`.

**Key behaviors / business logic**: Forces all three globals (`Router`, `ConversationListViewModel`, `StatusViewModel`) to be passed explicitly so a missing dependency is a compile error, not a runtime fatal.

**Android-port note**: Not directly portable — Compose `CompositionLocal`s do not get lost across sheets/dialogs the way SwiftUI environment does. The lesson: define explicit `CompositionLocalProvider`s or pass ViewModels via Hilt scoping. No equivalent file needed.

---

## apps/ios/Meeshy/Features/Main/Components/ImageEditView.swift

**Purpose**: Deprecated typealias shim — `ImageEditView` → `MeeshyImageEditorView` (moved into MeeshyUI SDK).

**Public API surface**: `typealias ImageEditView = MeeshyImageEditorView` (`@available(*, deprecated)`).

**Android-port note**: Skip — port the real `MeeshyImageEditorView` from the SDK module instead. Indicates the image editor is an SDK-level shared component.

---

## apps/ios/Meeshy/Features/Main/Components/InviteFriendsSheet.swift

**Purpose**: Rich share-link creation sheet — editable invite card, two-phase UI (quick share → full options panel), full share-link configuration.

**Public API surface**:
- `struct InviteFriendsSheet: View` — input: `conversation: Conversation`.
- Private `enum ExpirationOption`: `.never`, `.h24`, `.d7`, `.d30`, `.m3` (with `.iso8601` computed dates).

**Key behaviors / business logic**:
- Background link creation on `.task` (`createLinkInBackground`) so URL is ready before user shares.
- Phase 1: card preview + options summary + share button + "customize" link. Phase 2: full options panel (Identity, Limits, Permissions, Access).
- Configurable fields: invite message, link name, expiration, max-uses (stepper 1–10000), permissions (messages/images/files/history), access requirements (require account / nickname / email / birthday).
- Access logic: `requireAccount` disables and overrides nickname/email toggles. `optionsModified` flag triggers link re-creation on share if options changed after initial creation.
- `CreateShareLinkRequest` built from all fields; `ShareLinkService.createShareLink` → `CreatedShareLink`.
- URL format: `https://meeshy.me/join/{identifier ?? linkId}`. Copy-to-clipboard with transient "Copie !" feedback.

**Dependencies & couplings**: `ShareLinkService`, `CreateShareLinkRequest`, `CreatedShareLink`, `UIPasteboard`, `UIActivityViewController`, `MeeshyColors`, `ThemeManager`.

**Android-port note**: `ModalBottomSheet` with expand/collapse. `UIActivityViewController` → `ACTION_SEND` chooser. `UIPasteboard` → `ClipboardManager`. `ExpirationOption` enum + ISO8601 dates port directly. The full `CreateShareLinkRequest` field set is the canonical spec for share-link config — capture all fields.

---

## apps/ios/Meeshy/Features/Main/Components/LanguagePickerSheet.swift

**Purpose**: Searchable language picker sheet (`ProfileLanguagePickerSheet`) — flag, native name, English name, optional "clear" row.

**Public API surface**:
- `struct ProfileLanguagePickerSheet: View` — inputs: `title`, `languages: [LanguageInfo]`, `selectedCode: String`, `allowClear: Bool`, `onSelect: (String) -> Void`.
- Consumes `LanguageInfo` (`code`, `name`, `nativeName`, `flag`, `colorHex`).

**Key behaviors / business logic**: Client-side filter across name/nativeName/code. Selection highlight uses per-language `colorHex`. "Aucune" clear row passes `""`.

**Dependencies & couplings**: `LanguageInfo` (SDK), `ThemeManager`. Note: `MessageComposer` references a *different* `LanguagePickerSheet(style:onSelect:onDismiss:)` — there are two distinct language pickers.

**Android-port note**: `ModalBottomSheet` + searchable `LazyColumn`. `LanguageInfo` is shared SDK data — reuse the Android SDK model. Consolidate the two language pickers if possible.

---

## apps/ios/Meeshy/Features/Main/Components/LinkPreviewCard.swift

**Purpose**: Compact OpenGraph link-preview card rendered below message bubbles when text contains a URL. Self-loading (no ViewModel coupling).

**Public API surface**:
- `struct LinkPreviewCard: View` — inputs: `urlString: String`, `accentColor: String`, `isDark: Bool`.
- `struct SafariView: UIViewControllerRepresentable` (private) — wraps `SFSafariViewController`.
- Consumes `LinkMetadata` (`siteName`, `host`, `title`, `description`, `imageURL`, `hasAnyVisibleField`).

**Key behaviors / business logic**:
- `@ObservedObject LinkPreviewStore.shared` — singleton store; `requestMetadata(for:)` on appear, `metadata(for:)` lookup. SWR-style: skeleton card until metadata loads, then populated card.
- Tap opens in-app Safari sheet.

**Dependencies & couplings**: `LinkPreviewStore.shared`, `SFSafariViewController`, `MeeshyColors`, `HapticFeedback`, `AsyncImage`.

**Android-port note**: `LinkPreviewStore` → a repository/cache that scrapes OG metadata (or a backend endpoint). `SFSafariViewController` → Chrome Custom Tabs (`androidx.browser`). Card is a leaf composable taking primitive inputs (`isDark: Bool`) — good leaf-view pattern, preserve it.

---

## apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift

**Purpose**: Full-screen map-based location picker — search, map-center pin, reverse geocoding, "my position", confirm.

**Public API surface**:
- `struct LocationPickerView: View` — inputs: `accentColor: String`, `onSelect: (CLLocationCoordinate2D, String?) -> Void`.
- `@MainActor final class LocationPickerModel: NSObject, ObservableObject, CLLocationManagerDelegate` — published: `selectedCoordinate`, `addressString`, `isGeocoding`, `searchResults: [MKMapItem]`, `userLocation`.

**Key behaviors / business logic**:
- `Map` with `onMapCameraChange(.onEnd)` → updates selected location to map center.
- `updateSelectedLocation` debounces reverse-geocode by 300ms (cancellable `Task`).
- `reverseGeocode` builds a deduplicated address from placemark parts; cancels prior geocode.
- `search` uses `MKLocalSearch` (top 5 results), regioned to user location. Explicit `[weak self]` to avoid leaks if picker dismissed mid-search.
- `CLLocationManagerDelegate` handles permission changes, location updates (auto-selects first location if none chosen), and errors (logs + clears spinner).

**Dependencies & couplings**: MapKit, CoreLocation, `ThemeManager`, `HapticFeedback`, `os.Logger`.

**Android-port note**: Map → Google Maps Compose (`com.google.maps.android:maps-compose`) or Mapbox. `CLGeocoder` → Android `Geocoder` (use the async `getFromLocation` API on API 33+). `MKLocalSearch` → Places SDK Autocomplete. `CLLocationManager` → `FusedLocationProviderClient`. Permission flow → `ActivityResultContracts.RequestPermission`. The 300ms debounce + cancellation is worth preserving.

---

## apps/ios/Meeshy/Features/Main/Components/MediaPlayerContext.swift

**Purpose**: Defines `ClipboardContent` — an app-local model for clipboard paste content (NOT a media player despite the filename).

**Public API surface**:
- `struct ClipboardContent: Identifiable, Equatable` — `id`, `text`, `truncatedPreview` (200-char prefix + "..."), `charCount`, `createdAt`. `init(text:)` auto-generates a millisecond-timestamp id.

**Android-port note**: Trivial data class. The filename is misleading (filename says "MediaPlayerContext" but content is clipboard) — do not carry the misnomer. Map to a Kotlin `data class ClipboardContent`.

---

## apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift

**Purpose**: Member-management section of the conversation settings screen — searchable member list with role badges and a per-member moderation action menu.

**Public API surface**:
- `struct MemberManagementSection: View` — `@ObservedObject viewModel: ConversationSettingsViewModel`, `currentUserRole: MemberRole`.
- Private `struct MemberAction` (label, icon, isDestructive, async handler).
- Consumes `APIParticipant` (`name`, `effectiveRole`, `resolvedAvatar`, `userId`, `id`) and `MemberRole` (`.creator > .admin > .moderator > .member`, with `hasMinimumRole` + comparable ordering).

**Key behaviors / business logic**:
- `availableActions(for:targetRole:)` — role-based permission matrix:
  - Only `creator` can promote to Admin (and only members below admin).
  - `admin`+ can promote a member to Moderator.
  - Anyone outranking can demote a non-member to Member.
  - Everyone outranking can Expel.
  - `admin`+ can Ban.
  - Actions only shown if `currentUserRole > targetRole`.
- Actions call `viewModel.updateRole`, `expelParticipant`, `banParticipant`.
- "Add member" button gated to `moderator`+, opens `AddParticipantSheet`.
- Loading skeleton, empty state, client-side member name search.

**Dependencies & couplings**: `ConversationSettingsViewModel`, `AddParticipantSheet`, `MeeshyAvatar`, `DynamicColorGenerator`, `MemberRole`/`APIParticipant` (SDK).

**Android-port note**: This role-permission matrix is critical business logic — port `availableActions` verbatim into a pure function/use-case (testable). `MemberRole` comparability → Kotlin `enum` with `ordinal` or explicit rank. Action menu → `DropdownMenu`. Add a `MemberManagementViewModel`.

---

## apps/ios/Meeshy/Features/Main/Components/MentionComposerController.swift

**Purpose**: Reusable `@`-mention autocomplete controller for any text composer (conversation, story comment) — context-aware API routing.

**Public API surface**:
- `@MainActor public final class MentionComposerController: ObservableObject`.
- `enum Context: Equatable, Sendable` — `.conversation(id:)`, `.post(id:)`, with `contextId`/`contextType`.
- Published: `suggestions: [MentionCandidate]`, `activeQuery: String?`, `draftMentions: [String: MentionCandidate]`.
- Methods: `handleQuery(in:)`, `clearSuggestions()`, `insertMention(_:into:) -> String`, `clearDraft()`.
- Init injects `MentionServiceProviding` (default `MentionService.shared`) — protocol-based DI.

**Key behaviors / business logic**:
- `extractMentionQuery` parses trailing `@query` (no spaces = still typing).
- Local candidates filtered immediately; API call debounced 300ms, only when query ≥ 2 chars.
- `mergeAPISuggestions` dedups API results against local by username; API results appended after locals.
- `insertMention` replaces trailing `@query` with `@username ` and records the candidate in `draftMentions`.
- Cancellation-aware (`Task.isCancelled` checks, swallows `CancellationError`).

**Dependencies & couplings**: `MentionServiceProviding`/`MentionService`, `MentionCandidate`, `MentionSuggestion`, `MentionContextType` (SDK), `os.Logger`.

**Android-port note**: Excellent DI/testable design — port directly. → `MentionComposerViewModel` (or plain class) with `StateFlow<List<MentionCandidate>>`, debounce via Flow operators. `Context` → sealed class. The string-parsing helpers (`extractMentionQuery`, `replaceMentionQuery`) port verbatim. Keep the protocol-injection pattern (Hilt-injected `MentionService` interface).

---

## apps/ios/Meeshy/Features/Main/Components/MentionSuggestionPanel.swift

**Purpose**: Reusable autocomplete panel UI rendered above a composer when `MentionComposerController.activeQuery` is non-nil.

**Public API surface**:
- `struct MentionSuggestionPanel: View` — `@ObservedObject controller: MentionComposerController`, `accentColor`, `currentText`, `onSelect: (String) -> Void`.

**Key behaviors / business logic**: Renders up to 200pt-tall scrollable list of candidates (avatar + display name + `@username`); 3 shimmer skeleton rows while `suggestions` empty. Tap → `controller.insertMention` → `onSelect(updatedText)`.

**Dependencies & couplings**: `MentionComposerController`, `MeeshyAvatar`, `ThemeManager`.

**Android-port note**: Compose dropdown/`LazyColumn` overlay above the input. Pairs with the ported `MentionComposerController`. Skeleton via shimmer modifier.

---

## apps/ios/Meeshy/Features/Main/Components/MessageComposer.swift

**Purpose**: Standalone chat message composer bar — attach button, auto-growing text field, sentiment/language smart badges, send/voice button.

**Public API surface**:
- `struct MessageComposer: View` — `@Binding text: String`, `@FocusState.Binding isFocused: Bool`, `onSend: () -> Void`.
- Owns `@StateObject TextAnalyzer`.

**Key behaviors / business logic**:
- `TextAnalyzer.analyze(text:)` runs on every text change → exposes `sentiment` (emoji), `displayLanguage`, `showLanguagePicker`.
- Send button shows a sentiment emoji badge (top-right) and, after 20+ chars, a tappable language-flag badge (bottom-right) opening a language picker for manual override.
- Action button morphs: text present → send (pink gradient, paperplane); empty → voice mic button.
- Heavy bespoke animation (focus glow, send bounce, attach rotation).
- NOTE: Uses legacy hardcoded colors (`#08D9D6`, `#FF2E63`, `#FF6B6B`) — pre-Indigo-rebrand. The attach (+) and voice (mic) buttons have no real handlers (impact haptic only). Likely a legacy/secondary composer; the primary composer is elsewhere (Bubble architecture).

**Dependencies & couplings**: `TextAnalyzer` (app-local), `DetectedLanguage`, `LanguagePickerSheet` (the `style:`-variant), `UIImpactFeedbackGenerator`.

**Android-port note**: Compose `TextField` with `BasicTextField` for fine control; `bringIntoViewRequester` for focus. Sentiment analysis → ML Kit or a `TextAnalyzer` equivalent. ANTI-PATTERN to fix on port: hardcoded legacy colors must be replaced with the Indigo theme tokens; wire up real attach/voice handlers. Treat this file as reference, not literal — verify which composer is actually current before porting.

---

## apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift

**Purpose**: The large multi-tab message-detail / context-action sheet — the single entry point for translation exploration, read receipts, reactions, reporting, deletion, forwarding, sentiment, transcription, and edit history. ~2400 lines.

**Public API surface**:
- `struct MessageDetailSheet: View` — extensive init: `message`, `contactColor`, `conversationId`, `initialTab`, `canDelete`, `actions: [MessageAction]?`, `textTranslations`, `transcription`, `translatedAudios`, plus callbacks `onSelectTranslation`, `onSelectAudioLanguage`, `onRequestTranslation`, `onDismissAction`, `onReact`, `onReport`, `onDelete`, `externalTabSelection: Binding<DetailTab?>`, `editRevisions`.
- `enum DetailTab: String, CaseIterable` — `.language, .views, .reactions, .react, .report, .delete, .forward, .sentiment, .transcription, .edits` (each has icon/label/color).
- `enum DetailGridItem` — `.action(MessageAction)` | `.tab(DetailTab)`.
- `struct MessageAction: Identifiable` — `id, icon, label, color, handler` (shared with overlay integration).
- Private: `ViewsFilter` enum (`sent/delivered/read/notSeen/listened/watched`), `ReactionUserItem`, `ReadStatusData`/`ReceivedByUser`/`ReadByUser`/`NotSeenByUser` (REST decode models), `DetailActionButtonStyle`.

**Key behaviors / business logic**:
- 5-column `LazyVGrid` of actions+tabs; tapping a tab reveals its content below; staggered appear animation (0.04s/index).
- `availableTabs` dynamic gating: `.delete` requires `canDelete`; `.sentiment` requires non-empty text; `.transcription` requires audio/video attachment; `.edits` requires `isEdited` && non-empty `editRevisions`.
- **Language tab** = the Prisme Linguistique explorer. Shows original-language banner, original content (text or transcription), per-language rows (18 supported languages). Tapping a language: if translated → toggle selection + notify parent via `onSelectTranslation`; if audio-only translation → `onSelectAudioLanguage`; else → on-demand `TranslationService.translate` + `onRequestTranslation` for socket persistence. Pre-populates from `textTranslations` and `GET /messages/:id/translations` (note: that endpoint returns an OBJECT nesting `translations`, NOT a bare array — documented decode workaround).
- **Views tab** — sub-filter capsules with counts: Sent (author card + message meta: id, type, source, language, encryption, edited, attachments, forward-from, reply-to), Delivered/Read/NotSeen (user lists from `GET /messages/:id/read-status`), Listened/Watched (per audio/video attachment consumption via `AttachmentService.getStatusDetails` — listen/watch count, completion %, last position).
- **Reactions tab** — `GET /reactions/{id}`, filterable by emoji, user list sorted by recency.
- **React tab** — `EmojiPickerView` with usage tracking (`EmojiUsageTracker`).
- **Report tab** — `ReportType` selection + optional reason → `onReport`.
- **Delete tab** — confirmation with animated icon → `onDelete`.
- **Forward tab** — duplicate of `ForwardPickerSheet` logic (load conversations, search, send with `forwardedFromId`).
- **Sentiment tab** — on-device `NLTagger(.sentimentScore)` → emoji + gradient meter.
- **Transcription tab** — shows transcription text + word-by-word segments (`TranscriptionDisplaySegment`, speaker-colored when multi-speaker), confidence/duration; empty state offers `AttachmentService.requestTranscription`; lists translated-audio transcriptions with "Clone" voice badges.
- **Edits tab** — local `EditRevision[]` history, current version first, chronological versions below.
- `deliveryStatusLevel` collapses 8 delivery states into 5 buckets (failed/sending/sent/delivered/read).

**Dependencies & couplings**: `APIClient`, `TranslationService`, `AttachmentService`, `AuthManager`, NaturalLanguage framework, `EmojiPickerView`, `EmojiUsageTracker`, `LanguageDisplay`, `TranscriptionDisplaySegment`, `FlowLayout`, `MeeshyAvatar`, many SDK models (`MessageTranslation`, `MessageTranscription`, `MessageTranslatedAudio`, `ReactionGroup`, `ReactionSyncResponse`, `EditRevision`, `ReportType`).

**Android-port note**: This is the most architecturally significant file in the chunk and needs DECOMPOSITION on port — it is a 2400-line god-view mixing 10 tabs of network logic + UI. Port each tab as a separate composable + a `MessageDetailViewModel` (or per-tab Viewmodels) that owns the network calls and exposes state. The Language tab is the canonical Prisme Linguistique UI — it MUST stay the single entry point for translation exploration. Reuse `ForwardMessageUseCase` instead of re-implementing forward. Sentiment → ML Kit / on-device model. The REST decode quirk for `/messages/:id/translations` (object-nested) must be replicated in the Android API model. `externalTabSelection` binding → a one-shot navigation event in the ViewModel.

---

## apps/ios/Meeshy/Features/Main/Components/MessageEffectModifiers.swift

**Purpose**: The actual SwiftUI rendering of message effects — one-shot appearance animations, particle overlays, and continuous persistent effects.

**Public API surface**:
- One-shot `ViewModifier`s: `ShakeEffect`, `ZoomEffect`, `ExplodeEffect`, `WaooEffect`.
- Particle overlay `View`s: `ConfettiOverlay` (30 falling particles), `FireworksOverlay` (20 radial sparks), `ExplodeOverlay` (radial-gradient burst), `WaooOverlay` (scaling star).
- Continuous `ViewModifier`s: `GlowEffect` (intensity-driven shadow), `PulseEffect` (scale), `RainbowEffect` (animated angular-gradient border), `SparkleEffect` (`TimelineView` + `Canvas` sparkle particles).
- `extension View { func messageEffects(_:hasPlayedAppearance:) }` — composes all modifiers; one-shot effects gated on `!hasPlayedAppearance`.

**Key behaviors / business logic**: One-shot effects play once per bubble lifecycle (gated by `hasPlayedAppearance`). Persistent effects loop forever (`repeatForever`). `SparkleEffect` uses `TimelineView(.animation)` + `Canvas` for procedural per-frame sparkle rendering.

**Dependencies & couplings**: `MessageEffects`/`MessageEffectFlags` (SDK), `MeeshyColors` (indirectly via hardcoded `#6366F1`).

**Android-port note**: One-shot modifiers → `AnimatedVisibility` / `Animatable` driven by a `playedAppearance` flag. Particle overlays → Compose `Canvas` + `LaunchedEffect`-driven particle state, or a particle library. `SparkleEffect`'s `TimelineView+Canvas` → `withInfiniteAnimation` + `Canvas` drawing. The `messageEffects` composition pattern → a single Compose `Modifier` extension. Hardcoded `#6366F1` should use the theme's `indigo500`. This is a substantial but self-contained port.

---

## apps/ios/Meeshy/Features/Main/Components/MessageInfoSheet.swift

**Purpose**: Per-message delivery-status sheet — sender card, 3-step delivery timeline (Sent/Delivered/Read), content preview, per-participant read receipts.

**Public API surface**:
- `struct MessageInfoSheet: View` — inputs: `message: Message`, `contactColor: String`.
- `struct ParticipantReceipt: Identifiable` — `id, name, avatarURL, color, deliveredAt, readAt`.
- `struct MessageReadStatusResponse: Decodable` (+ nested `ReceivedEntry`/`ReadEntry`) — REST decode model for `/messages/:id/read-status`.

**Key behaviors / business logic**:
- Derives `deliveredTimestamp`/`readTimestamp` from `message.deliveryStatus` (currently uses `updatedAt` as a proxy — imprecise).
- Vertical timeline with connector lines that activate per delivery progress.
- `loadReadReceipts()` merges `readBy` + `receivedBy` into a per-participant `ParticipantReceipt` map (read entries win, received-only entries added if not in readBy), sorted by read time desc.
- Overlaps heavily with MessageDetailSheet's Views tab — both consume `/messages/:id/read-status`. MessageInfoSheet appears to be an older/simpler variant.

**Dependencies & couplings**: `APIClient`, `MeeshyAvatar`, `DynamicColorGenerator`, `MeeshyColors`, `ThemeManager`.

**Android-port note**: Functionally a subset of MessageDetailSheet's Views tab — on Android, consolidate into ONE message-info surface (the read-status data + timeline). Don't port both. Timeline → a vertical `Column` with `Divider`/`Canvas` connectors. The `ParticipantReceipt` merge logic is portable.

---

## Architecture observations

### State management
- Heavy reliance on per-view `@State` for network-loaded data (ConversationInfoSheet participants, MessageDetailSheet's ~15 `@State` network buffers). This violates the project's own cache-first/ViewModel rules. On Android, hoist all network state into ViewModels with explicit `LoadState`.
- Good patterns to preserve: `MentionComposerController` (protocol-injected, testable, `ObservableObject`); `ConversationOptionsViewModel` ownership in `ConversationPreferencesTab`.
- Deliberate anti-`@ObservedObject` pattern: ConversationInfoSheet/ConversationPreferencesTab read `PresenceManager.shared` as a plain property to avoid presence-event-driven re-render storms — the "Zero Unnecessary Re-render" principle. Android: pass primitive presence values, don't observe the whole singleton.

### Caching / SWR
- `LinkPreviewStore.shared` is a clean SWR singleton: skeleton card → `requestMetadata` → populated card. Good model for an Android repository.
- `InviteFriendsSheet` pre-creates the share link in the background on appear so the URL is instantly shareable — a nice instant-app touch worth keeping.
- MessageDetailSheet has weak caching — most tabs refetch on every open (`readStatusData == nil` guards only). Improve on port.

### Concurrency
- Consistent `async/await` + `Task`; `MentionComposerController` and `LocationPickerModel` correctly use cancellable debounced `Task`s and `[weak self]`. `LocationPickerModel` has explicit, well-commented leak-avoidance for `MKLocalSearch` callbacks. Replicate cancellation discipline with Kotlin coroutine `Job` cancellation / Flow `debounce`.

### Navigation
- Sheets use `NavigationStack` + `navigationDestination(for: String.self)` with string route values ("settings") — stringly-typed routing, fragile. Android: use a typed nav graph.
- `externalTabSelection: Binding<DetailTab?>` in MessageDetailSheet is a one-shot programmatic-tab-select hack — model as a nav event in the ViewModel on Android.

### Dependency injection
- Mixed: `MentionComposerController` does proper protocol injection; most views call `Service.shared` singletons directly inside view bodies (`ShareLinkService.shared`, `APIClient.shared`, `ConversationService.shared`). On Android, route everything through Hilt-injected interfaces.

### Performance
- `LazyVStack`/`LazyVGrid` used for member lists, media grids, conversation lists — map to `LazyColumn`/`LazyVerticalGrid`.
- `ProgressiveCachedImage` (thumbHash → thumbnail URL → full URL) is the hot-list image strategy — Android needs a Coil-based equivalent with a BlurHash/ThumbHash placeholder.
- Staggered list-item appear animations (0.04–0.05s/index) are a consistent brand motion language.

### Anti-patterns / tech debt NOT to carry over
- `MessageDetailSheet.swift` is a 2400-line god-view — MUST be decomposed into per-tab composables + ViewModel(s).
- Forwarding logic is duplicated 3× (`ForwardPickerSheet`, MessageDetailSheet forward tab). Consolidate into one `ForwardMessageUseCase`.
- Read-status UI duplicated between `MessageInfoSheet` and MessageDetailSheet's Views tab. Build one.
- `MessageComposer.swift` uses pre-rebrand hardcoded colors and has dead attach/voice handlers — verify it is still the live composer before porting; fix colors/handlers.
- `MediaPlayerContext.swift` filename does not match its `ClipboardContent` content — rename on port.
- Unused platform-user-search state in `ConversationPreferencesTab`.
- `ImageEditView.swift` is a deprecated shim — port the SDK's `MeeshyImageEditorView` instead.
- Filename `LanguagePickerSheet.swift` declares `ProfileLanguagePickerSheet`, and a separate `LanguagePickerSheet(style:)` exists elsewhere — two language pickers; unify.

### Portable user-facing features / capabilities
- [ ] Conversation info sheet: hero/direct headers, members / media / stats / options tabs
- [ ] Paginated member list with infinite scroll + client-side search
- [ ] Shared-media grid (image/video thumbnails)
- [ ] Pinned-messages preview + full pinned-messages list
- [ ] End-to-end encryption: security-number verification entry point
- [ ] Block user (direct conversations)
- [ ] Leave / archive / delete-for-me conversation
- [ ] Conversation lock: master PIN setup/change/remove, per-conversation 4-digit lock, unlock-all
- [ ] Per-conversation preferences: custom name, reaction emoji, pin, category, tags, mute, mentions-only
- [ ] Crash-report diagnostics viewer with share
- [ ] Message visual effects picker (ephemeral, blur, view-once, entry animations, permanent effects) + ephemeral duration
- [ ] Message visual effects rendering (shake/zoom/explode/waoo/confetti/fireworks/glow/pulse/rainbow/sparkle)
- [ ] Forward message to another conversation
- [ ] Rich invite-link creation: editable card, expiration, max-uses, permissions, access requirements, copy/share
- [ ] Searchable language picker
- [ ] OpenGraph link-preview cards under message bubbles + in-app browser
- [ ] Map-based location picker with search, reverse geocoding, "my position"
- [ ] Member moderation: promote/demote (creator→admin, admin→moderator), expel, ban, add member
- [ ] @-mention autocomplete (context-aware: conversation / post) with debounced API + local merge
- [ ] Message composer with sentiment emoji + detected-language badge + manual language override
- [ ] Message detail: per-language translation explorer (Prisme Linguistique entry point), on-demand translate
- [ ] Message detail: delivery/read receipts (sent/delivered/read/not-seen) with timeline
- [ ] Message detail: per-attachment listen/watch consumption stats (count, completion, position)
- [ ] Message detail: reactions list (filterable by emoji), add reaction with usage tracking
- [ ] Message detail: report message (typed reasons + free text)
- [ ] Message detail: delete message
- [ ] Message detail: on-device sentiment analysis meter
- [ ] Message detail: audio/video transcription view (word segments, speakers, confidence) + request transcription
- [ ] Message detail: translated-audio transcriptions with voice-clone badge
- [ ] Message detail: edit-history viewer
- [ ] Message info sheet: delivery timeline + per-participant read receipts
