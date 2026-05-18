# iOS → Android Audit — Part 08

Scope: Conversation list and conversation detail UI layer (SwiftUI views + extensions).
14 files covering the two highest-traffic screens of Meeshy: the sectioned/searchable
conversation list and the full conversation (chat) detail screen with composer, message
rows, media gallery, header and scroll controls.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationBackgroundComponents.swift

**Purpose**: Decorative animated background sub-views for the conversation detail screen
(extracted from `ConversationAnimatedBackground`). Pure visual chrome — no data.

**Public API surface**:
- `struct ConvBgPulseRing` — expanding pulse ring (group/globe).
- `struct ConvBgFixedAvatar` — orbiting placeholder avatar with connection beam + glow.
- `struct ConvBgGlobePulseRing` — larger globe-scale pulse ring.
- `struct ConvBgSatellite` — orbiting satellite icon with signal waves + connection beam.
- `struct ConvBgSignalWave` — wave propagating toward center.
- `struct ConvBgWaveShape: Shape` — animatable sine-wave shape (`phase`, `amplitude`, `frequency`).
- 5 `#Preview` configs (direct, group, group+encrypted, community, global+E2EE+multilingual).

**Key behaviors / algorithms**:
- Deterministic placement: `fixedAngle = index * 2π / totalCount` for avatars, `baseAngle = index * 2π/3` for satellites.
- "Infinite" linear animations are faked by multiplying duration & target by 100 (`duration: 60*100`, `orbitAngle = 2π*100`) — a hack to approximate `repeatForever` without auto-reverse.
- Animations stopped via `Transaction(animation: nil)` / `disablesAnimations` on `onDisappear` to reset state.
- Background style driven by `ConversationBackgroundConfig` (conversationType, isEncrypted, isE2EEncrypted, memberCount, topLanguages).

**Dependencies & couplings**: `ConversationAnimatedBackground`, `ConversationBackgroundConfig` (defined elsewhere); `Conversation.ConversationType` from MeeshySDK.

**Android-port note**: Pure cosmetic. Reimplement with Jetpack Compose `Canvas` + `rememberInfiniteTransition` / `animateFloat`. Use real `RepeatMode.Restart` infinite transitions instead of the ×100 duration hack. `ConvBgWaveShape` → custom `Shape` or `Path` drawn in `Canvas`. Low priority; can ship a static gradient first and add animation later.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationHelperViews.swift

**Purpose**: Small reusable themed buttons/avatars for the conversation detail header and
composer, plus legacy bridge structs.

**Public API surface**:
- `struct ThemedBackButton` — circular glass back button, collapses in `compactMode`.
- `struct ThemedAvatarButton` — header avatar button wrapping `MeeshyAvatar` (story ring, presence, mood).
- `struct ThemedComposerButton` — circular composer action button (active/inactive gradient, optional icon rotation).
- Legacy aliases: `ConversationOptionButton`, `AttachOptionButton`, `MessageBubble`, `ColorfulMessageBubble` (thin wrappers over `ThemedActionButton` / `ThemedMessageBubble`).

**Key behaviors**: Press feedback = scale 0.9 spring + `DispatchQueue.asyncAfter(0.1)` reset. `HapticFeedback.light()` on composer button tap.

**Dependencies & couplings**: `MeeshyAvatar`, `MeeshyColors`, `ThemedActionButton`, `ThemedMessageBubble`, `PresenceState`, `Color(hex:)`.

**Android-port note**: Map to small `@Composable` functions. Press-scale = `Modifier.pointerInput` + `animateFloatAsState`. Drop the legacy alias structs entirely — they are tech debt; the Android codebase should start clean with one canonical button per role.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationListHelpers.swift

**Purpose**: Components for the conversation LIST screen: section headers, hard-press
preview, community card, filter chips, tag chip, plus legacy bridge structs.

**Public API surface**:
- `struct SectionHeaderView` — collapsible category header (icon glow, count badge, chevron rotation, drop-target highlight).
- `struct ConversationPreviewView` — peek/hard-press preview popover (avatar + recent cached messages in a mini chat list, own `Router`).
- `struct ThemedCommunityCard: View, Equatable` — banner-image community card; `Equatable` compares only `community` (leaf-cell perf rule).
- `struct ThemedFilterChip` — selectable capsule filter chip.
- `struct TagChip` — colored conversation tag pill.
- `struct SemanticColors` — legacy 20-color vibrant palette + `colorForName` → `DynamicColorGenerator`.
- Legacy aliases: `ColorfulConversationRow`, `CommunityCard`, `ColorfulFilterChip`, `ConversationRow`, `CategoryPill`, `FilterChip`.

**Key behaviors**:
- `ThemedCommunityCard` reads a per-community color override from `UserDefaults` key `community.color.<id>` at init.
- `formatCount` abbreviates: `1.2M` / `1.2k`.
- `ConversationPreviewView` renders cached `ThemedMessageBubble`s with `allowsHitTesting(false)`.

**Dependencies & couplings**: `ConversationSection`, `Community`/`MeeshyCommunity`, `ConversationTag`, `ConversationFilter`, `MeeshyAvatar`, `CachedBannerImage`, `ThemedConversationRow`, `EmptyStateView`, `DynamicColorGenerator`.

**Android-port note**: `SectionHeaderView` → Compose `Row` with `AnimatedContent`/rotation for chevron, accept lambda. Hard-press preview has no native Compose equivalent — map to a long-press bottom sheet or a Material `DropdownMenu`-style popup. Per-community color override → DataStore. `ThemedCommunityCard` equatability → mark the composable inputs stable / use `key()`. Drop legacy aliases.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift

**Purpose**: ConversationListView's context menu + the two extracted overlay View structs
(top header overlay, bottom search/communities/filters bar).

**Public API surface**:
- `extension ConversationListView.conversationContextMenu(for:)` — full long-press context menu.
- `struct ConversationListHeaderOverlay` — collapsible top header ("Meeshy" title, share-link, new-conversation, notifications badge, settings icons; iPad feed button).
- `struct ConversationListBottomBar` — bottom-pinned search bar + communities carousel + category filter chips; owns `searchBounce` state.

**Key behaviors / business logic**:
- Context menu actions: pin/unpin, mute/unmute, mark read/unread, details sheet, invite (if `canCreateShareLink`), favorite-emoji submenu (⭐️❤️🔥💎🎯✨🏆💡 or remove), move-to-category submenu, lock/unlock (requires master PIN — alert if none), archive/unarchive (hidden if archived+blocked), block/unblock (DM only), delete (soft delete for user).
- Bottom bar: magnifying-glass toggles `showSearchOverlay`; opening it focuses the search field; communities carousel + filter chips appear inside a glass panel only when overlay open; dashboard (widget) and global-search buttons.
- Header overlay wraps `CollapsibleHeader` driven by `scrollOffset`.

**Dependencies & couplings**: `ConversationListViewModel`, `Router`, `ConversationLockManager`, `BlockService`, `ShareLinkService`, `ThemeManager`, `CollapsibleHeader`, `ConversationFilter`, `MeeshyCommunity`.

**Android-port note**: Context menu → Compose `DropdownMenu` triggered by long-press combined gesture; favorite emoji + move-to-category submenus → nested `DropdownMenu` or a bottom sheet with sub-rows. Collapsible header → `TopAppBar` with `scrollBehavior` (`enterAlways`/`exitUntilCollapsed`). Bottom bar → a `Column` pinned with `Scaffold` bottomBar or an overlay `Box` aligned bottom. Notification badge → `BadgedBox`.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationListView+Rows.swift

**Purpose**: Per-row + pagination-footer View structs extracted to keep the list body's
opaque type small (a type-metadata crash on low-memory devices forced this split).

**Public API surface**:
- `struct ConversationRowItem<Menu: View>` — one conversation row: `SwipeableRow` (leading + trailing swipe actions) wrapping an `.equatable()` `ThemedConversationRow`, with tap, `.onDrag`, `.contextMenu` + hard-press `preview`, and `.task { onLoadPreview() }`. All inputs are plain values/closures.
- `struct ConversationPaginationFooter` — cursor-based infinite-scroll footer driven by `conversationViewModel.paginationState` (`.loadingMore` spinner / `.exhausted` "all loaded" hint when count>30 / `.error` retry button / `.idle` invisible 1pt sentinel firing `loadMore` on appear).

**Key behaviors**: Drag-and-drop reorder provides `NSItemProvider(conversation.id)`. Preview messages loaded lazily per-row via `.task`. Pagination is triggered both by an invisible sentinel and by a per-row threshold (see ConversationListView).

**Dependencies & couplings**: `SwipeableRow`, `ThemedConversationRow`, `ConversationPreviewView`, `SwipeAction`, `ConversationListViewModel`, `StoryRingState`, `DraftSummary`, `StatusEntry`.

**Android-port note**: Row → `SwipeToDismissBox` (Material3) for swipe actions, but Material's box supports only 2 directions with one action each — Meeshy has up to 3 leading + 4 trailing actions, so build a custom swipe-revealed action layer (anchored draggable). `LazyColumn` handles infinite scroll naturally; trigger `loadMore` when `lastVisibleItemIndex >= size - 5` via `derivedStateOf` on `LazyListState`. Drag-to-reorder → `reorderable` lib or custom `detectDragGestures`.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift

**Purpose**: The conversation LIST screen — sectioned, searchable, filterable, with
pull-to-refresh, drag-to-category, story tray, infinite scroll. Top-level screen.

**Public API surface**:
- `struct SectionDropDelegate: DropDelegate` — handles dropping a conversation onto a category section (forbidden on `"pinned"`).
- `struct ConversationListView: View` — main list. Inits with optional `isScrollingDown`/`feedIsVisible` bindings, `onSelect`, `onStoryViewRequest`, `onNewConversation`, iPad params, `selectedConversationId`.
- `struct ShareLinkPickerSheet` — list of share-link-eligible conversations.
- Internal helpers: `canCreateShareLink(for:)`, `shareConversationLink(for:)`, `leadingSwipeActions`/`trailingSwipeActions`, `triggerLoadMoreIfNeeded`, `toggleSection`, `handleDrop`, `loadUserCommunities`, `applyCommunities`.

**Key behaviors / business logic**:
- Sections: `groupedConversations` computed on a background queue inside the ViewModel; `expandedSections` set with persistence per user category; flat list when only the `"other"` section exists.
- Cache-first community load: `CacheCoordinator.communities.load` → `.fresh`/`.stale`(serve+revalidate)/`.expired`/`.empty`(network); cache key fixed `"list"`.
- Pull-to-refresh: `MeeshyRefreshableScroll` (native `.refreshable` + branded indicator) refreshes conversations + stories + statuses + communities in parallel via `async let`.
- Skeleton ONLY on cold start (`loadState == .loading && groupedConversations.isEmpty`); distinct error EmptyState with retry when `loadFailed`; normal empty state otherwise.
- Infinite scroll: `triggerLoadMoreIfNeeded` fires `loadMore` within 5 rows of the tail (always-on; ViewModel short-circuits when `hasMore == false`).
- Scroll-direction throttling (0.15s) toggles `isScrollingDown` to hide/show bottom bar.
- Share-link permission: DM → false; group → role in {admin,moderator,owner,co-owner,bigboss}; else true.
- `share...Link` builds a `CreateShareLinkRequest` and presents `UIActivityViewController`.
- Sheets/overlays: conversation info, invite friends, lock sheet, status composer/bubble, widget preview, global search (`fullScreenCover`), block confirmation dialog, master-PIN-required alert.

**Architecturally significant**: Extensive comments document a Swift type-metadata instantiation crash on iPhone XR/iOS 17.6 — the monolithic body type was split into nominal structs (`ConversationRowItem`, `ConversationListHeaderOverlay`, `ConversationListBottomBar`, `ConversationPaginationFooter`). Direct singleton reads (`ThemeManager`, `PresenceManager`, `ConversationLockManager`) instead of `@ObservedObject` to avoid re-rendering hundreds of rows on every theme/presence event. Contains `print("[DIAG]…")` debug logging — tech debt.

**Dependencies & couplings**: `ConversationListViewModel`, `StoryViewModel`, `StatusViewModel`, `Router`, `CacheCoordinator`, `CommunityService`, `ShareLinkService`, `ConversationLockManager`, `BlockService`, `MeeshyRefreshableScroll`, `CollapsibleHeaderMetrics`, `StoryTrayView`.

**Android-port note**: `LazyColumn` with sticky section headers (`stickyHeader`). Pull-to-refresh → `PullToRefreshBox`. Drag-to-category → custom drag + drop-target detection. Cache-first SWR pattern maps directly to a Repository emitting a sealed `CacheResult`/`Resource` from Room + Retrofit. Scroll-direction hide → observe `LazyListState.firstVisibleItemScrollOffset` deltas in `derivedStateOf`. Share via `Intent.ACTION_SEND` chooser. Remove all `print("[DIAG]")` lines.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift

**Purpose**: Fullscreen swipeable gallery for ALL visual media (images + videos) in a
conversation. Opened by tapping any image/video bubble.

**Public API surface**:
- `struct ConversationMediaGalleryView` — inputs: `allAttachments`, `startAttachmentId`, `accentColor`, `captionMap`, `senderInfoMap` (`[id: ConversationViewModel.MediaSenderInfo]`).
- Private `enum SaveState { idle, saving, saved, failed }`.

**Key behaviors / business logic**:
- Horizontal paging via `ScrollView` + `.scrollTargetBehavior(.paging)` + `.scrollPosition(id:)`.
- Image page: pinch-to-zoom (`MagnificationGesture`, clamp 1–5×), double-tap zoom (1↔2.5×), vertical drag-to-dismiss (>150pt when not zoomed). Progressive image: thumbHash → thumbnail → full URL via `ProgressiveCachedImage`.
- Video page: `SharedAVPlayerManager` shared player; drag-to-dismiss triggers PiP if playing; play button loads + plays + caches.
- Neighbor prefetch ±2 around current index into `CacheCoordinator.images`.
- Save to Photos: downloads via `URLSession`, video → temp file → `PhotoLibraryManager.saveVideo`, image → `saveImage`; auto-reset state after 2s; haptics on success/fail.
- Controls overlay: tap toggles; close, `n / total` counter (`contentTransition(.numericText())`), save button, bottom author metadata (avatar, name, date, dimensions, file size) + caption.

**Dependencies & couplings**: `MessageAttachment`, `SharedAVPlayerManager`, `ProgressiveCachedImage`, `FullscreenAVPlayerLayerView`, `CacheCoordinator`, `PhotoLibraryManager`, `MeeshyConfig.resolveMediaURL`, `ConversationViewModel.MediaSenderInfo`.

**Android-port note**: `HorizontalPager` (Accompanist/Compose foundation). Pinch-zoom → `Modifier.transformable` / a Zoomable lib. Video → ExoPlayer (`PlayerView`); PiP via `enterPictureInPictureMode`. Save to gallery → `MediaStore`. Prefetch via Coil `ImageLoader.enqueue`. thumbHash decode → port the thumbHash algorithm or use BlurHash equivalent.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift

**Purpose**: Media sub-components for message bubbles: share sheet, download badge,
real-progress downloader, audio bubble view, recording waveform bars.

**Public API surface**:
- `struct ShareSheet: UIViewControllerRepresentable` — wraps `UIActivityViewController`.
- `struct DownloadBadgeView` — 3-state badge (idle → downloading w/ progress ring → cached/hidden).
- `final class AttachmentDownloader: ObservableObject` — `@Published isCached/isDownloading/downloadedBytes/totalBytes`, `progress`; methods `checkCache`, `start(attachment:onShare:)`, `cancel`; static `fmt(bytes)`.
- `struct CachedPlayIcon` — play overlay shown only once media is locally cached (polls every 1.5s).
- `struct AudioMediaView: View, Equatable` — audio message bubble: placeholder (static waveform + play-to-download) until cached, then `AudioPlayerView`; flag pills for translated audio languages, transcription, delivery checkmarks.
- `struct AnimatedWaveformBar` — random-animated recording bar.
- `struct AudioLevelBar` — mic-level-driven recording bar.

**Key behaviors / business logic**:
- `AttachmentDownloader.start`: `Task.detached` streaming download via `URLSession.bytes`, 16KB buffer flush, per-flush progress update on `MainActor`, stores into `CacheCoordinator.audio` or `.video` keyed by resolved URL; haptics on success/fail; cancellable.
- `AudioMediaView` `Equatable` compares attachment/message id, isDark, accent/contact color, `activeAudioLanguageOverride`.
- Audio delivery status switch handles: `sending`, `invisible` (no glyph pre-200ms debounce), `clock`, `slow` (warning), `sent`, `delivered` (double gray check), `read` (bold indigo double check), `failed`.
- Flag pill selection drives `selectedAudioLangCode` (nil = original); underline-color highlight.
- Cache polling loops (`while !Task.isCancelled && !isCached`) — 1s/1.5s/2s intervals.

**Dependencies & couplings**: `MessageAttachment`, `Message`, `MessageTranscription`, `MessageTranslatedAudio`, `MessageTranslation`, `ConversationViewModel.AudioItem`, `AudioPlayerView`, `AudioFullscreenView`, `CacheCoordinator`, `MeeshyConfig`, `LanguageDisplay`, `MessageTextRenderer`.

**Android-port note**: Download badge → composable with `CircularProgressIndicator`. `AttachmentDownloader` → a `ViewModel`/coroutine using OkHttp streaming `ResponseBody.source()` for byte progress; cache via Room/disk. Cache-polling loops are an anti-pattern — replace with a `Flow`/callback from the cache layer that emits when an item is stored (event-driven, not poll). Waveform bars → `Canvas` animated. Share → `Intent` chooser.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift

**Purpose**: `ConversationView` extension — voice recording, message sending with
attachments (incl. TUS upload + offline queue), and attachment import handlers.

**Public API surface** (extension methods):
- `startRecording`, `stopAndPreviewRecording`, `stopAndSendRecording`.
- `sendMessageWithAttachments` — the core send pipeline.
- `formatRecordingTime`, `handlePhotoSelection`, `generateVideoThumbnail`, `handleFileImport`, `mimeTypeForURL`, `getFileSize`, `addCurrentLocation`, `handleLocationSelection`, `handleCameraVideo`, `handleCameraCapture`, `sendMessage`.

**Key behaviors / business logic** (CRITICAL — port faithfully):
- Text-only send: clears UI immediately, calls `viewModel.sendMessage`.
- File send: optimistic GRDB insert (`insertOptimisticMediaMessage`) so the bubble survives store refreshes; client message id MUST use canonical `cid_<uuidv4-lowercase>` format (`ClientMessageId.generate()`) — legacy `temp_` prefix fails the gateway regex.
- Offline audio: if offline AND only audio → write-ahead persist to `Documents/pending-audio/<cid>.m4a` and `OfflineQueue.enqueueAudio`; dispatcher later TUS-uploads + emits `message:send-with-attachments` so the gateway audio pipeline (Whisper→NLLB→TTS) runs on reconnect. Other attachment types do NOT support offline (lose local URL).
- Online upload: `TusUploadManager` resumable upload, `progressPublisher` → `composerState.uploadProgress`; uploaded data cached into `CacheCoordinator.audio/images/thumbnails`.
- Audio path goes through `MessageSocketManager.sendWithAttachmentsAsync` (WebSocket) — REST does NOT trigger the audio pipeline; maps `tempId → ack.messageId` via `viewModel.pendingServerIds`.
- Reconnects socket if disconnected before sending (1s wait).
- Photo selection: video → raw temp file → `MediaCompressor.compressVideo`; image → `UIImage`. Camera capture → `MediaCompressor.compressImage`.
- `mimeTypeForURL` — exhaustive ext→MIME table (images, video, audio, documents, code, archives).

**Dependencies & couplings**: `AudioRecorderManager`, `MessageAttachment`, `ConversationViewModel`, `MessageSocketManager`, `TusUploadManager`, `OfflineQueue`/`OfflineQueue.shared`, `NetworkMonitor`, `MediaCompressor`, `CacheCoordinator`, `AuthManager`, `MeeshyConfig`, `DiskCacheStore`, `ClientMessageId`, `ToastManager`, `ReplyContextCleaner`.

**Android-port note**: This is the heart of message sending — move it ALL into the conversation `ViewModel`/Repository (it should not be UI-layer code on Android). TUS resumable upload → `tus-java-client` or a custom OkHttp implementation. Offline write-ahead → Room outbox table + `WorkManager` for reconnect dispatch. Audio MUST go through the socket. Video/image compression → `Transformer` (Media3) / `Bitmap` recompress. Optimistic insert → insert into Room, observe via `Flow`. Honor the `cid_<uuidv4>` id format on the wire.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationView+Composer.swift

**Purpose**: `ConversationView` extension — the message composer UI (powered by
`UniversalComposerBar`), reply/edit banners, and pending-attachment preview tiles.

**Public API surface** (extension members):
- `var themedComposer` — `UniversalComposerBar` wired with text binding, language, attachments, edit/reply banners, recording callbacks, ephemeral/blur/effects toggles, photo/file/camera/location/contact pickers, emoji injection.
- `handleContactSelection`, `composerReplyBanner`, `composerEditBanner`, `submitEdit`, `cancelEdit`, `composerReplyAttachmentIcon`, `composerReplyAttachmentPreview`, `pendingAttachmentsPreview`, `attachmentPreviewTile`, `handleAttachmentPreviewTap`, `iconForAttachmentType`, `labelForAttachment`.

**Key behaviors / business logic**:
- Composer accent color changes with mode: ephemeral → `FF6B6B`, blur → `A855F7`, effects → `6366F1`, else conversation accent.
- Edit mode hides ephemeral/blur/effects controls; `onCustomSend` dispatches to submitEdit / stopAndSendRecording / sendMessageWithAttachments.
- Pickers presented via `.photosPicker` (max 10, images+videos), `.fileImporter`, `.fullScreenCover` camera, `.sheet` location/contact.
- Tap pending image → `MeeshyImagePreviewView` editor; pending video → `MeeshyVideoPreviewView`; audio → `MeeshyAudioPreviewView` (trim).
- `submitEdit` no-ops if content unchanged.
- Reply banner: colored bar, author, attachment-type icon + preview text + rich thumbnail (image/video/audio waveform/location), cancel button via `ReplyContextCleaner`.
- Contact selection currently sends contact info as plain text (noted as interim).

**Dependencies & couplings**: `UniversalComposerBar`, `ConversationComposerState`, `ConversationScrollState`, `ReplyReference`, `ReplyContextCleaner`, `EffectsPickerView`, `CameraView`, `LocationPickerView`, `ContactPickerView`, `MeeshyImage/Video/AudioPreviewView`, `MediaCompressor`, `UploadProgressBar`, `CachedAsyncImage`, `MessageEffectFlags`, `EphemeralDuration`.

**Android-port note**: Build a `MessageComposer` composable with a text `BasicTextField`, attachment row, banner slots. Photo picker → `ActivityResultContracts.PickMultipleVisualMedia`; files → `OpenMultipleDocuments`; camera → `TakePicture`/`CaptureVideo`; contacts → `PickContact`. Effects/blur/ephemeral toggles → state in the ViewModel. Media editors are separate screens. Contact-as-text is a known shortcut — consider proper contact card messages on Android.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift

**Purpose**: `ConversationView` extension — animated background, header avatar wrapper,
audio/video call buttons, header tags row, navigate-to-DM; plus the extracted
`ConversationHeaderAvatarView` struct.

**Public API surface**:
- `var conversationBackground` — `ConversationAnimatedBackground` configured from the conversation.
- `var headerAvatarView` — thin wrapper → `ConversationHeaderAvatarView`.
- `var headerCallButtons` — audio + video call buttons (DM only) via `CallManager.startCall`.
- `var headerTagsRow` — horizontally scrollable lock icon + category tag + colored tags.
- `func navigateToDM(with:name:)` — finds existing DM or creates one via `POST /conversations`.
- `private struct ConversationHeaderAvatarView` — expanded/collapsed avatar(s) with story ring, mood, presence, avatar context menus, stacked active-member avatars for groups.

**Key behaviors / business logic**:
- `resolvedCalleeName` prefers conversation title > participantUsername > "Inconnu"; `looksLikeObjectId` guards against 24-char hex / UUID strings leaking as a display name.
- `ConversationHeaderAvatarView` is a dedicated struct specifically to avoid an ARM64e PAC (Pointer Authentication Code) `EXC_BAD_ACCESS` crash — `@ViewBuilder` properties capturing `@EnvironmentObject` + `@State` in escaping closures crash in `swift_retain`.
- Avatar context menu items vary: "Voir les stories" (if stories), "Voir le profil" (DM), "Conversation" (info), "Envoyer un message" (groups → navigateToDM).
- `navigateToDM` reuses an existing DM if present, else creates and refreshes the list.

**Dependencies & couplings**: `ConversationAnimatedBackground`, `MeeshyAvatar`, `CallManager`, `StoryViewModel`, `StatusViewModel`, `PresenceManager`, `Router`, `APIClient`, `APIConversation`, `ProfileSheetUser`, `AvatarContextMenuItem`.

**Android-port note**: Header → `TopAppBar`/custom `Row`. Call buttons → trigger WebRTC call flow (CallManager equivalent). The PAC-crash workaround is iOS-specific — Compose has no equivalent issue; just write a normal `@Composable`. navigate-to-DM logic belongs in the ViewModel/Repository. Avatar context menu → `DropdownMenu`.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift

**Purpose**: `ConversationView` extension — the message-row builder, in-conversation search
(bar, results, debounce, jump), quick-reaction bar, failed-message retry, reply-count pill,
and the pure `QuickReactionBarPlacement` geometry helper.

**Public API surface**:
- `func messageRow(index:msg:)` — builds one `ThemedMessageBubble` with the full closure surface (reactions, info, translations, story reply, media tap, view-once, swipe gestures). NOTE: largely dead code — the live screen now uses the UIKit `MessageListView` bridge.
- `prefetchNearbyMedia`, `triggerReply`, `scrollToAndHighlight`.
- Search: `var searchBar`, `searchResultsOverlay`, `searchResultRow`, `highlightedText`, `formatSearchDate`, `triggerBackendSearch`, `debounceSearch` (400ms, associated-object task storage), `jumpToSearchResult`, `dismissSearch`, `searchOverlay`, `searchResultsBlurOverlay`, `returnToLatestButton`.
- Quick reactions: `quickReactionBar`, `quickReactionEmojiStrip` (`EmojiReactionPicker`), `quickReactionActionsRow`, `messageActionButton`, `closeReactionBar`, `quickReactionBarOverlay`.
- `failedMessageBar`, `replyCountFor`, `replyCountPill`.
- `enum QuickReactionBarPlacement` — pure CGRect geometry: `compute(anchor:container:barHeight:topLimit:composerHeight:gap:) -> Result(inset:)`.

**Key behaviors / business logic**:
- Swipe-to-reply/forward: rubber-band drag (free to 72pt, 15% resistance beyond), commit at ≥66pt directed; reply = swipe toward center, forward = away; haptics.
- Highlight: `scrollToAndHighlight` scrolls + applies a 1.2s amber highlight then fades.
- Search: debounced 400ms, min 2 chars; results show translation-match globe icon; `jumpToSearchResult` loads messages around the target and scrolls.
- Quick-reaction bar: top emojis from `EmojiUsageTracker.topEmojis`; emoji-only mode vs full actions (reply/copy/forward/delete); `EmojiUsageTracker.recordUsage` on react.
- `QuickReactionBarPlacement` clamps the bar fully on-screen (below bubble, never under header, never past bottom edge; fallback above composer when no anchor).
- `replyCountPill` jumps to the first reply of the parent message.

**Dependencies & couplings**: `ThemedMessageBubble`, `ConversationViewModel`, `MessageSocketManager`, `EmojiReactionPicker`, `EmojiUsageTracker`, `CacheCoordinator`, `SearchResultItem`, `SharedAVPlayerManager`, `AuthManager`, `ToastManager`, `DetailTab`.

**Android-port note**: Message row → a `key`-stable `@Composable` rendered in a `LazyColumn`. Swipe-to-reply rubber-band → `anchoredDraggable` / custom drag with resistance curve. Search → debounced `Flow` (`debounce(400)`) in the ViewModel; highlight via transient state. Quick-reaction bar → an anchored `Popup` positioned with the bubble's `LayoutCoordinates` bounds — port `QuickReactionBarPlacement` verbatim as pure Kotlin (it's unit-testable). `EmojiUsageTracker` → DataStore-backed most-used list. The `objc_getAssociatedObject` debounce-task storage is an iOS hack — use a normal `Job` in the ViewModel.

---

## apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift

**Purpose**: `ConversationView` extension — scroll-to-bottom button (with rich unread
preview) and inline typing indicator.

**Public API surface**:
- `var hasTypingIndicator`, `unreadAttachment`, `hasUnreadContent`, `isOffline` (hardcoded `false` — TODO).
- `var scrollToBottomButton` → `ConversationScrollControlsView` with unread count, typing usernames, last-unread preview (text / attachment thumbHash / audio), play-audio callback.
- `var unreadAttachmentTypeLabel`, `typingLabel` (1 / 2 / N-person variants).
- `var inlineTypingIndicator` — author name + "écrit" + 3 animated bouncing dots driven by `typingDotPublisher`.

**Key behaviors**: Typing label localizes pluralization manually. Inline dots animate via a `Timer.publish` received in `onReceive`. Scroll-to-bottom resets `unreadBadgeCount` and `lastUnreadMessage`, increments `scrollToBottomTrigger`.

**Dependencies & couplings**: `ConversationScrollControlsView`, `ConversationViewModel`, `MessageAttachment`, `AudioPlayerManager`.

**Android-port note**: Scroll-to-bottom FAB → `FloatingActionButton` shown when `!isNearBottom`, with a `BadgedBox` for unread count. Typing indicator → animated dots composable with `rememberInfiniteTransition`. `isOffline` should be wired to a real `NetworkMonitor` flow (the hardcoded `false` is tech debt to fix on Android).

---

## apps/ios/Meeshy/Features/Main/Views/ConversationView.swift

**Purpose**: The conversation DETAIL (chat) screen — top-level. Composes background,
the UIKit-bridged message list, floating header, composer, overlays, sheets, and owns
all per-screen state structs.

**Public API surface**:
- `struct ConversationView: View` — init `(conversation:replyContext:anonymousSession:)`; creates `ConversationViewModel` via `@StateObject`.
- State structs: `ConversationActiveMember`, `ConversationOverlayState` (overlay menu, detail sheet, quick-reaction anchor, story viewer, reply thread), `ConversationScrollState` (near-bottom, unread badge, scroll triggers, swipe offset, media editor queues), `PreviewMedia`, `ConversationComposerState` (attachments, pickers, language, reply/edit, emoji), `ConversationHeaderState` (search, story viewer, typing dot phase).
- `private struct InteractivePopEnabler: UIViewControllerRepresentable` — re-enables the iOS edge-swipe-back gesture when the nav bar is hidden.

**Key behaviors / business logic**:
- The visible message list is `MessageListView` — a **UIKit collection-view bridge** backed by a GRDB `messageStore` (performance: native cell recycling for the hot message list). It exposes a huge callback surface (load older, scroll-to-message, near-bottom, story-reply, swipe reply/forward, long-press, add/toggle reaction, open react picker, message info, reactions, translation detail, media tap, consume view-once, request translation).
- Draft persistence: `persistDraft` saves full compose state (text, reply ref, language, effect flags, blur, ephemeral duration) to `DraftStore` on every change; restored in `onAppear` (empty drafts purged).
- Composer language priority on appear: keyboard layout > system language > current default.
- `task`: `observeSync()` + `loadMessages()` + connect socket; handles `router.pendingHighlightMessageId` (scroll to / load-around a deep-linked message).
- `accessRevoked` observer → toast + dismiss when the server revokes access.
- Cold-start skeleton overlay shown only while `isLoadingInitial && messages.isEmpty`.
- Delete confirmation dialog: "Delete for everyone" gated by authorship + `canDeleteForEveryone` (2-hour window); else "Delete for me".
- Keyboard height tracked via `keyboardWillShow/Hide` notifications; composer height measured via `GeometryReader`.
- `jumpToQuotedMessage` flow: local → instant; server → pulsing indicator while fetching → scroll+highlight; not-found → toast.
- Sheets/covers: media gallery, preview media (image/video/audio fullscreen), `MessageDetailSheet` (tabs: react/views/reactions/language), forward picker, story viewer (×2 — header + overlay), conversation info, overlay menu, reply thread overlay.
- Section/date headers: `formatDateSection` (Aujourd'hui/Hier/weekday/day-month/full), `joinedBanner`, `unreadSeparator`, encryption disclaimer.
- Anonymous mode: simplified header bar.

**Architecturally significant**:
- The deep opaque-type chain `body → bodyWithSheets → bodyWithCovers → bodyWithLifecycle → bodyContent → floatingHeaderSection → expandedHeaderBand` crashed `swift_getTypeByMangledName` (demangler depth limit) — `expandedHeaderBand` is type-erased to `AnyView` and the body is split into many `@ViewBuilder` properties as a deliberate workaround.
- UIKit collection view (`MessageListView`) used for the hot message list — a key performance technique.
- GRDB (`messageStore`) as the local source of truth for messages, observed for live updates.
- Direct singleton reads (`ThemeManager`, `PresenceManager`) to avoid re-render storms.
- Contains `print("[DIAG]…")` debug logging — tech debt.

**Dependencies & couplings**: `ConversationViewModel`, `MessageListView` (UIKit bridge + GRDB store), `StoryViewModel`, `StatusViewModel`, `Router`, `ConversationListViewModel`, `AudioRecorderManager`, `AudioPlayerManager`, `DraftStore`, `MessageDraft`, `MessageSocketManager`, `CacheCoordinator`, `ToastManager`, `MessageDetailSheet`, `MessageOverlayMenu`, `ReplyThreadOverlay`, `StoryViewerContainer`, `ConversationInfoSheet`, `ForwardPickerSheet`, `EmojiKeyboardPanel`, `ConnectionBanner`.

**Android-port note**: Map to a `ConversationScreen` composable + `ConversationViewModel`. The UIKit collection-view bridge → `LazyColumn` (Compose `LazyColumn` already recycles efficiently — no separate bridge needed). GRDB message store → Room with `Flow` observation. Draft persistence → DataStore. Deep-link highlight → nav args. Keyboard handling → `WindowInsets.ime` + `imePadding()`. The AnyView/type-checker workarounds are iOS-specific — irrelevant on Android. Delete-for-everyone 2h gating, jump-to-quoted flow, date-section formatting, unread separator, encryption disclaimer, anonymous mode all port directly. Remove `print("[DIAG]")` lines.

---

## Architecture observations

**State management**
- MVVM with `@StateObject` ViewModels; per-screen UI state collected into plain value structs (`ConversationComposerState`, `ConversationScrollState`, `ConversationOverlayState`, `ConversationHeaderState`) held as `@State` — keeps animation/scroll/picker state out of the ViewModel (good separation). Android: hold equivalents in `rememberSaveable`/`mutableStateOf` or a UI-state data class in the ViewModel.
- Deliberate avoidance of `@ObservedObject` on global singletons (`ThemeManager`, `PresenceManager`, `ConversationLockManager`) — they are read directly so presence/theme events do not re-render the whole list. Android: expose these as `StateFlow` and collect them only in the small leaf composables that need them.

**Caching / SWR (cache-first is mandatory)**
- `CacheCoordinator` with typed stores (`communities`, `images`, `audio`, `video`, `thumbnails`) returning a `CacheResult` (`.fresh`/`.stale`/`.expired`/`.empty`). Stale is served immediately + silent background revalidate. Skeleton placeholders appear ONLY on cold start (empty cache). Android: a Repository emitting a sealed `Resource`/`CacheResult` from Room + Retrofit; `PullToRefreshBox`; show skeletons only when the Room flow is empty.
- GRDB message store is the single source of truth for messages, observed live. Android → Room + `Flow`.

**Concurrency**
- `async let` for parallel refresh fan-out (conversations + stories + statuses + communities). `Task.detached` for streaming downloads. Android: `coroutineScope { async {} }` and `Dispatchers.IO`.
- ANTI-PATTERN: cache-availability polling loops (`while !Task.isCancelled && !isCached { sleep(1s) }`) in `DownloadBadgeView`/`CachedPlayIcon`/`AudioMediaView`. Do NOT carry over — make the cache layer emit an event/`Flow` when an item is stored.
- ANTI-PATTERN: infinite animations faked with `duration: x*100` in background components. Use real `RepeatMode` infinite transitions on Android.

**Navigation**
- Hybrid `NavigationStack` + `ZStack` overlays; `Router` owns the path. Sheets/`fullScreenCover` for modals; `InteractivePopEnabler` re-enables edge-swipe-back. Android: Navigation-Compose for hierarchy; `ModalBottomSheet`/dialogs for modals; system back is automatic.

**Performance techniques worth preserving**
- UIKit collection view bridge (`MessageListView`) for the hot message list — Compose `LazyColumn` recycles natively, so no bridge is needed but the intent (efficient recycling, stable keys, `.equatable()` cells) must be honored with stable `key`s and `@Stable` row inputs.
- Real byte-level download progress via streamed reads (`URLSession.bytes`) → OkHttp `BufferedSource` on Android.
- ±2 neighbor media prefetch in the gallery; per-row preview prefetch on `.task`.

**Tech debt — do NOT carry over**
- `print("[DIAG]…")` debug logging scattered through `ConversationListView` and `ConversationView`.
- Legacy bridge structs (`ColorfulConversationRow`, `MessageBubble`, `FilterChip`, `SemanticColors`, etc.) — start the Android UI clean.
- `isOffline` hardcoded to `false` in `ConversationView+ScrollIndicators` — wire to a real network monitor.
- `objc_getAssociatedObject` used to stash a debounce `Task` on a struct — use a normal `Job` in the ViewModel.
- Heavy SwiftUI message-send/upload logic living in a *View* extension (`ConversationView+AttachmentHandlers`) — on Android this MUST live in the ViewModel/Repository, not the UI layer.
- Multiple Swift-type-checker / runtime-metadata crash workarounds (AnyView erasure, body splitting, dedicated structs to dodge ARM64e PAC crashes) — entirely iOS-specific; ignore on Android.

**Portable user-facing features / capabilities**
- [ ] Sectioned conversation list with collapsible user categories + drag-to-category
- [ ] Conversation list search overlay + category filter chips + communities carousel
- [ ] Pinned / muted / locked / archived / favorited (emoji) conversation states
- [ ] Conversation swipe actions (pin, mute, lock, archive, mark read/unread, block, hide)
- [ ] Conversation context menu (pin, mute, mark read, details, invite, favorite, move, lock, archive, block, delete)
- [ ] Conversation lock with master PIN
- [ ] Hard-press conversation preview popover
- [ ] Pull-to-refresh (branded indicator) + cursor-based infinite scroll
- [ ] Cold-start skeletons + error-with-retry empty state
- [ ] Share-link creation + invite-friends sheet + share-link picker
- [ ] Story tray + per-conversation story rings
- [ ] Conversation detail screen with animated themed background
- [ ] Message composer: text, voice recording, photo/video/file/camera/location/contact attachments
- [ ] Ephemeral messages, blur reveal, message effects, view-once
- [ ] Reply (swipe + banner), forward (swipe + picker), edit (with 2h gating note), delete (for me / for everyone with 2h window)
- [ ] Optimistic media send + TUS resumable upload + upload progress
- [ ] Offline message queueing (audio write-ahead, FIFO flush on reconnect)
- [ ] Quick-reaction emoji bar anchored to the bubble + full reaction picker
- [ ] In-conversation message search (debounced, translation-match aware) + jump-to-result
- [ ] Jump-to-quoted-message (local instant / server fetch with indicator)
- [ ] Reply-count pills + reply thread overlay
- [ ] Fullscreen media gallery (swipe, pinch-zoom, save to gallery, PiP video)
- [ ] Audio message bubble with translated-audio language flags + transcription + delivery status
- [ ] Multilingual translation (Prisme Linguistique): per-message language flags, translation detail tab, request retranslation
- [ ] Audio/video calls from the conversation header
- [ ] Typing indicators (header + inline) + scroll-to-bottom button with rich unread preview
- [ ] Date section headers, joined banner, unread separator, E2EE disclaimer
- [ ] Draft auto-save/restore (text + reply + language + effects + blur + ephemeral)
- [ ] Anonymous-session conversation mode
- [ ] Mention suggestions panel + emoji keyboard panel
- [ ] Connection-status banner + error banner
