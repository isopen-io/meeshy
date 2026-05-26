# Audit Part 20 — MeeshyUI Primitives, Profile & Story Canvas

Scope: 35 files from `packages/MeeshySDK/Sources/MeeshyUI/` covering reusable SwiftUI
primitives (images, pickers, chat, swipe, toasts, identity bar), the user-profile sheet
stack, and the Story canvas rendering engine (CALayer/Metal/AVFoundation compositor).

---

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift
- Purpose: Family of progressive, disk-cached async image views with ThumbHash placeholders.
- Public API:
  - `CachedAsyncImage<Placeholder>` — generic async image; `targetSize` enables downsampling (`max(w,h) × screenScale`, else 1200px cap). Convenience init when `Placeholder == Color` (gray).
  - `CachedAvatarImage` — circular avatar with initials fallback + ThumbHash; downsamples to avatar size.
  - `CachedBannerImage` — banner with gradient fallback + ThumbHash, fixed `height`, `clipped`.
  - `ProgressiveCachedImage<Placeholder>` — 3-tier progressive: full → thumbnail → ThumbHash decode → placeholder, with crossfades.
- Key behaviors:
  - Synchronous L2 cache probe in `init` via `DiskCacheStore.cachedImage(for:)` so warm cache renders instantly (no spinner).
  - `MeeshyConfig.resolveMediaURL` resolves relative media paths to absolute.
  - Async fetch via `CacheCoordinator.shared.images.image(for:maxPixelSize:)`; retry button on failure (`retryCount` re-triggers `.task`).
  - Crossfade-in (`easeIn 0.15–0.25s`); `Task.isCancelled` guards prevent stale stamps.
- Dependencies: `MeeshyConfig`, `DiskCacheStore`, `CacheCoordinator`, `UIImage.fromThumbHash` (ThumbHash/Wolt), `Color(hex:)`.
- Android-port note: Use Coil 3 `AsyncImage` with a `DiskCache`/`MemoryCache`; ThumbHash placeholder via a Compose painter decoded from the hash. Provide a `targetSize` modifier mapping to Coil's `size()`. Progressive tiers map to Coil `placeholderMemoryCacheKey` + crossfade. Disk pre-probe → Coil memory cache snapshot lookup.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerField.swift
- Purpose: Inline conversation-category picker — selected chip + search/create input + suggestion list.
- Public API: `CategoryPickerField` (`@MainActor`) — `categories: [ConversationCategory]`, `selectedId: Binding<String?>`, `accentColor`, `onCreateCategory: (String) async -> ConversationCategory?`.
- Key behaviors: filtered suggestions exclude the selected category, sorted by `order`; `canCreate` when query is novel; `submit()` selects exact match or creates; `create()` guards re-entrancy via `isCreating`.
- Dependencies: `ConversationCategory` (SDK), `Color(hex:)`.
- Android-port note: Compose `ExposedDropdownMenuBox` or custom column; `OutlinedTextField` + `FlowRow` chip; hoist `selectedId` state; `onCreateCategory` as a `suspend` lambda.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/CategoryPickerView.swift
- Purpose: Standalone list-style category picker with inline "new category" row.
- Public API: `CategoryPickerView(selectedCategoryId: Binding<String?>)`.
- Key behaviors: loads via `PreferenceService.shared.getCategories()`. TECH DEBT: `createCategory()` is a stub — `PreferenceService.createCategory` does not exist; UI clears field but nothing persists server-side. Uses `print` for error logging.
- Dependencies: `PreferenceService`, `ThemeManager`.
- Android-port note: Largely superseded by `CategoryPickerField`; on Android consolidate into ONE picker component and implement real category creation against the API. Do NOT port the stubbed creation path.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/ChatBubble.swift
- Purpose: Simple animated chat message bubble (used for demos/onboarding, not the production message cell).
- Public API: `ChatBubble(text, isMe, index, animateEntrance, contactColor)`.
- Key behaviors: staggered spring entrance (offset + scale by `index × MeeshyAnimation.staggerDelay`); long-press → `HapticFeedback.medium`; gradient fill + stroke keyed off `contactColor` and dark mode.
- Dependencies: `ThemeManager`, `MeeshyRadius`, `MeeshyAnimation`, `HapticFeedback`.
- Android-port note: Compose `Surface` with gradient `Brush`; entrance via `AnimatedVisibility` + `animateFloatAsState`; long-press via `combinedClickable` + `HapticFeedbackType`.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift
- Purpose: Emoji reaction UI suite — quick strip, full-picker sheet, keyboard panel.
- Public API:
  - `EmojiCategory` (Sendable; `.all` = 6 categories: reactions/faces/gestures/hearts/animals/objects, hundreds of emojis).
  - `EmojiReactionPicker` — quick strip; `scrollable` mode wraps emojis in horizontal scroll with right-edge fade mask; optional `+` expand button; sinusoidal wave entrance.
  - `EmojiFullPickerSheet` — draggable bottom sheet (min 340 / max 85% height), category tabs, 8-col grid.
  - `EmojiKeyboardPanel` — inline keyboard-replacement panel.
  - `WaveTileModifier` (private) — staggered ~0.045s/tile spring rise+fade+scale.
- Key behaviors: react animation (scale 1.3 pulse, 0.3s); haptics on tap; sheet drag with velocity-based snap/dismiss.
- Dependencies: `HapticFeedback`, localized strings (`bundle: .module`).
- Android-port note: Emoji categories → Kotlin data objects. Quick strip → `LazyRow`. Full picker → `ModalBottomSheet` with draggable detents + `LazyVerticalGrid`. Wave entrance → per-item `animateFloatAsState` with index delay.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift
- Purpose: Standard empty-state placeholder (icon + title + subtitle + optional action).
- Public API: `EmptyStateView(icon, title, subtitle, actionLabel?, accentColor, compact, onAction?)`.
- Key behaviors: spring fade+offset appear; compact mode reorders action above title; accessibility-combined.
- Android-port note: Compose composable with `Icon` + `Text` + optional `Button`; `AnimatedVisibility` for entrance.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/ErrorBannerView.swift
- Purpose: Top-anchored auto-dismissing error banner bound to a `MeeshyError?`.
- Public API: `ErrorBannerView(error: Binding<MeeshyError?>)`.
- Key behaviors: 4s auto-dismiss via cancellable `Task`; haptic error; tap-to-dismiss; reacts to `error?.errorDescription` change.
- Dependencies: `MeeshyError` (SDK), `@Environment(\.theme)`, `MeeshyColors` (uses deprecated `coral`/`pink` aliases — TECH DEBT).
- Android-port note: Compose `Snackbar`/custom banner via `SnackbarHostState`; coroutine `delay(4000)` auto-dismiss. Replace deprecated colors with `error` semantic color.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/FloatingButtons.swift
- Purpose: Draggable, snap-to-edge floating action buttons (free-position + legacy corner variants) + notification badge.
- Public API:
  - `ButtonPosition` (normalized 0–1 x/y, Equatable/Sendable) + `ButtonCorner` legacy enum.
  - `FreeFloatingButtonsContainer` / `FreeFloatingButton` — drag with rubber-bounds clamping, optional horizontal edge-snap, safe-zone insets keyed to search-bar visibility.
  - `FloatingButtonsContainer` / `LegacyFloatingButton` — 4-corner snap variant (backward compat).
  - `NotificationBadge(count)` — pulsing red badge, clamps at 99.
- Key behaviors: position persisted as `"x,y"` string binding; drag end normalizes + snaps; haptics on tap/longpress/drop; 1.12–1.15 drag scale.
- Android-port note: Compose draggable `Box` with `pointerInput(detectDragGestures)`; position persisted to DataStore as serialized x/y; snap logic in drag-end. Badge → `BadgedBox` with `infiniteRepeatable` pulse. Legacy corner variant need not be ported.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/LanguagePickerSheet.swift
- Purpose: Translation-language picker sheet + supporting language catalog.
- Public API:
  - `TranslationLanguage` (Identifiable/Hashable/Sendable; BCP-47 `id`, flag, name, `group`). `.all` = ~39 NLLB-200 languages; `.quickStrip` = 9 top languages.
  - `LanguageUsageTracker` — UserDefaults-backed frequency counter (`recordUsage`, `sorted(_:)`).
  - `LanguagePickerSheet` — draggable bottom sheet, search bar, 4-col flag grid.
- Key behaviors: search across name/code/flag; drag-to-dismiss with velocity; selection delays 0.2s before callback for tap feedback.
- Dependencies: `HapticFeedback`, localized strings.
- Android-port note: `TranslationLanguage` → Kotlin data class catalog (single source of truth, shareable with content-language resolution). `LanguageUsageTracker` → DataStore preferences map. Sheet → `ModalBottomSheet` + `LazyVerticalGrid`.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyAvatar.swift
- Purpose: THE canonical avatar component — context-driven sizing/decorations (story ring, mood badge, presence dot, context menu).
- Public API:
  - `AvatarContext` (Sendable enum, ~20 cases + `.custom(CGFloat)`) — each case derives `size`, `showsStoryRing/MoodBadge/OnlineDot`, `isTappable`, `defaultPulse`, `animatesStoryRing/MoodBadge`, `shadowRadius/Y`, ring/badge/dot metrics.
  - `StoryRingState` (`.none/.unread/.read`), `AvatarKind` (`.user/.entity`), `AvatarContextMenuItem` (stable string id derived from label+icon).
  - `MeeshyAvatar` view — image (CachedAvatarImage) or initials gradient; angular-gradient rotating story ring; mood emoji badge; presence dot; long-press context menu.
- Key behaviors:
  - Performance: ring/badge continuous animations DISABLED in list/feed contexts (`animatesStoryRing/MoodBadge`) to avoid N simultaneous GPU animations during scroll.
  - Bugfix note: context-menu items resolved ONCE per body pass (UUID identity churn caused EXC_BAD_ACCESS in AttributeGraph).
  - `badgeOffset` does trig (45° on avatar edge) to place badge correctly given ring glow size growth.
  - Tap priority: unread story → onViewStory, else onTap, else onViewProfile.
- Dependencies: `CachedAvatarImage`, `DynamicColorGenerator.colorForName`, `PresenceState`, `ThemeManager`, `HapticFeedback`, `.pulse()`/`.ifTrue()` modifiers.
- Android-port note: Critical reusable component. `AvatarContext` → Kotlin sealed class/enum with computed properties. Compose `Box` layering Coil image / initials, animated ring (`drawBehind` angular `Brush.sweepGradient` + `rotate`), badge overlay. Context menu → `DropdownMenu` on long-press. Honor list-context animation suppression for scroll perf.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyPullIndicator.swift
- Purpose: Brand pull-to-refresh indicator (animated logo dashes + indigo gradient ring).
- Public API: `MeeshyPullPhase` (`.idle/.pulling(progress)/.armed/.refreshing/.completing`, Equatable/Sendable); `MeeshyPullIndicator(phase:)`; `Color.interpolated(to:t:)` extension.
- Key behaviors: self-sizes 0→90pt with pull progress; logo color interpolates indigo300→indigo500; rotation up to 180° at threshold; rotating gradient ring during refresh; `AnimatedLogoView` breathing.
- Dependencies: `MeeshyColors`, `AnimatedLogoView`.
- Android-port note: Custom indicator inside Compose `PullToRefreshBox` (Material3) replacing default; phase enum + `Canvas`-drawn logo + animated rotation/color.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyRefreshableScroll.swift
- Purpose: ScrollView wrapper combining native iOS `.refreshable` with the branded `MeeshyPullIndicator` (hides native spinner via `.tint(.clear)`).
- Public API: `MeeshyRefreshableScroll(onRefresh: () async -> Void, coordinateSpaceName, onScrollOffsetChange:, topPadding:, content:)`.
- Key behaviors: scroll offset captured via `GeometryReader` + `ScrollOffsetPreferenceKey`; computes `.pulling/.armed` phases pre-refresh (90pt threshold); haptic medium at arm crossing; refresh sequence `refreshing → work → completing (haptic success) → 400ms → idle`; exposes scroll offset for sticky/collapsible headers.
- Android-port note: Compose `PullToRefreshBox` + `LazyColumn`; scroll offset via `LazyListState.firstVisibleItemScrollOffset` exposed for collapsible headers; custom indicator from MeeshyPullIndicator port.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/ProfileCompletionRing.swift
- Purpose: Circular progress ring for profile completion %.
- Public API: `ProfileCompletionRing(progress: Double)` (clamped 0–1).
- Key behaviors: animated trim on appear (spring 0.8); centered "XX%" text; gradient stroke (deprecated `pink`/`cyan` — TECH DEBT).
- Android-port note: Compose `Canvas` `drawArc` with `animateFloatAsState`; replace legacy colors with brand indigo.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/SkeletonView.swift
- Purpose: Skeleton/shimmer loading placeholders.
- Public API: `ShimmerModifier` + `View.skeletonShimmer()`; `SkeletonShape(width,height,cornerRadius)`; `SkeletonConversationRow`; `SkeletonMessageBubble(index)`.
- Key behaviors: linear repeating shimmer gradient sweep; message bubble varies width/height/alignment by index for organic look.
- Android-port note: Compose shimmer via `Brush` + `infiniteRepeatable` offset animation (or accompanist/3rd-party shimmer); skeleton shapes as composables.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/StatsCard.swift
- Purpose: Horizontal stat card (icon + label + value) with glass + accent tint.
- Public API: `StatsCard(icon, label, value, accentColor)`.
- Dependencies: `ThemeManager.surfaceGradient`, `.glassCard()`.
- Android-port note: Compose `Card` / `Surface` with leading circular icon + text column.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/SwipeableRow.swift
- Purpose: Generic swipe-to-reveal-actions row (leading + trailing actions, persistent open state).
- Public API: `SwipeProgressKey`/`EnvironmentValues.swipeProgress`; `SwipeAction(icon,label,color,action)`; `SwipeableRow<Content>(leadingActions, trailingActions, content)`.
- Key behaviors: 76pt action cells; rubber-banding beyond bounds (0.18 factor); 35% threshold or 450 velocity to snap open/closed; actions stay open & tappable until re-swipe or content tap; per-cell reveal progress drives icon scale 0.4→1.0; exposes `swipeProgress` to content via Environment; vertical-drag rejection (scroll-friendly).
- Android-port note: Compose `SwipeToDismissBox` insufficient (it dismisses) — implement custom `anchoredDraggable` with leading/trailing anchors; action cells in a `Row` behind content; expose swipe progress via `CompositionLocal`.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputField.swift
- Purpose: Tag input — chips + search/create field + suggestion panel.
- Public API: `TagInputField` (`@MainActor`) — `selectedTags: Binding<[String]>`, `knownTags`, `accentColor`.
- Key behaviors: suggestions filtered (max 8) excluding selected; `canCreate` for novel queries; submit picks first suggestion or creates; chips in `FlowLayout`.
- Dependencies: `FlowLayout` (external, not in this chunk).
- Android-port note: Compose `FlowRow` of chips + `OutlinedTextField` + suggestion `Column`.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/TagInputView.swift
- Purpose: Alternate tag input — inline chips + input in a custom flow layout.
- Public API: `TagInputView(tags: Binding<[String]>, onTagsChanged:)`; `TagFlowLayout` (SwiftUI `Layout` impl).
- Key behaviors: `TagFlowLayout` wraps subviews into rows by width; deterministic per-tag color via `hashValue % 9`.
- Android-port note: Two tag-input variants exist — consolidate into one on Android (`FlowRow`). `TagFlowLayout` is replaced by `FlowRow`.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/ToastView.swift
- Purpose: Toast notification pill.
- Public API: `ToastType` (`.success/.error/.info`, color + default icon); `Toast` (Equatable by UUID; message, type, icon, isTappable); `ToastView(toast:)`.
- Dependencies: `MeeshyColors` (deprecated `green/coral/cyan` — TECH DEBT), `MeeshySpacing/MeeshyFont/MeeshyShadow`.
- Android-port note: Compose `Snackbar` custom content via `SnackbarHost`; replace legacy colors with semantic tokens.

## packages/MeeshySDK/Sources/MeeshyUI/Primitives/UserIdentityBar.swift
- Purpose: THE composable identity row — avatar + 4 element slots (leading/trailing × primary/secondary) rendering name, role, time, delivery status, language flags, translate button, presence, etc.
- Public API:
  - `IdentityBarElement` enum (Identifiable; name/username/roleBadge/time/delivery/flags/translateButton/presence/memberSince/actionButton/actionMenu/text) — stable string ids.
  - `ActionMenuItem`, `AvatarConfig` (avatar params bundle).
  - `UserIdentityBar` view + factory presets: `.messageBubble(...)`, `.comment(...)`, `.listing(...)`, `.metaRow(...)`.
- Key behaviors:
  - `deliveryView` renders 8 `MeeshyMessage.DeliveryStatus` states (sending/invisible/clock/slow/sent/delivered/read/failed) — `.invisible` is an EmptyView (200ms optimistic-send debounce); `.read` forces contrast color on tinted own-message bubbles.
  - `flagsView` shows language flags with active underline; `LanguageDisplay.from(code:)` resolves flag/color.
  - `messageBubble` preset supports `inlineTime` (group convs put time inline with author; direct convs pin trailing); empty time+nil delivery convention skips trailing meta group.
  - role badge hidden for `.member`.
- Dependencies: `MeeshyMessage.DeliveryStatus`, `MemberRole`, `PresenceState`, `LanguageDisplay`, `MeeshyAvatar`, `MeeshyColors`, `ThemeManager`.
- Android-port note: Central message/comment/list-row component. Model `IdentityBarElement` as a sealed class; `UserIdentityBar` as a composable taking 4 element lists + `AvatarConfig`; factory presets → companion functions. Delivery-status rendering is load-bearing — port all 8 states incl. the optimistic `.invisible` placeholder.

## packages/MeeshySDK/Sources/MeeshyUI/Profile/ConnectionActionView.swift
- Purpose: Compact relationship-action pill (add/accept/decline/cancel/contact/blocked) auto-synced to `FriendshipCache` + `BlockService`.
- Public API: `ConnectionActionView(userId, userName, accentColor, friendService: FriendServiceProviding, resolver: UserRelationshipResolver, onError, onSuccess)`.
- Key behaviors:
  - State → render: `.current` hidden, `.blocked`/`.connected` read-only badges, `.pendingReceived` → ✗/✓ buttons, `.pendingSent` → cancel pill, `.none` → add button.
  - Optimistic mutation + rollback owned by the component (sendRequest/accept/decline/cancelSent each apply cache mutation, call API, rollback on failure); haptics throughout; `invalidatePersistedFriendCaches()` after each.
  - Re-renders reactively via `@ObservedObject` on the two singletons.
- Dependencies: `FriendshipCache`, `BlockService`, `FriendService`/`FriendServiceProviding`, `UserRelationshipResolver`, `MeeshyColors`, `HapticFeedback`.
- Android-port note: Composable observing `FriendshipCache`/`BlockService` as `StateFlow`s; relationship resolver as injected provider; optimistic+rollback in a ViewModel or the component's own coroutine scope. DI via constructor defaults → Hilt/Koin.

## packages/MeeshySDK/Sources/MeeshyUI/Profile/FullscreenImageView.swift
- Purpose: Fullscreen zoomable image viewer (banner/avatar tap-through).
- Public API: `FullscreenImageView(imageURL, fallbackText, accentColor)`.
- Key behaviors: `AsyncImage` with pinch-zoom (1–4×) + pan (springs back); close button; avatar fallback at 200pt; hides status bar. NOTE: uses raw `AsyncImage` not the cached pipeline.
- Android-port note: Compose fullscreen `Dialog`/destination with `Modifier.pointerInput` zoom/pan transform; Coil image. Use the cached image loader for consistency.

## packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileSheetUser.swift
- Purpose: Lightweight value model for the profile sheet + factory adapters from many domain types.
- Public API: `ProfileSheetUser` (Identifiable/Equatable; userId?, username, displayName?, avatarURL?, accentColor, bio, system/regionalLanguage, isOnline, lastActiveAt, createdAt, bannerURL, timezone, registrationCountry, profileCompletionRate, hasE2EE). Factories: `from(idOrUsername:)`, `from(message:)`, `from(storyGroup:)`, `from(feedPost:)`, `from(feedComment:)`, `from(conversation:)`, `from(user:accentColor:)`.
- Key behaviors: ObjectId detection (24-char hex); ISO8601 date parsing with/without fractional seconds; `accentColor` defaults to `DynamicColorGenerator.colorForName`; `hasE2EE` derived from `signalIdentityKeyPublic != nil`.
- Android-port note: Kotlin data class + companion factory functions; ISO8601 parsing via `Instant.parse` with fallback; ObjectId regex check reused from other modules.

## packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift
- Purpose: Full user-profile sheet — banner, identity, 3 tabs (Profile / Conversations / Stats), connection + block actions.
- Public API: `ConnectionStatus` enum; `UserProfileSheet(user: ProfileSheetUser, onDismiss, onNavigateToConversation, onSendMessage, moodEmoji, onMoodTap)`; private `ProfileTab` enum.
- Key behaviors:
  - SWR cache: `CacheCoordinator.shared.profiles.load` → `.fresh` use cached, `.stale` use cached + background refresh, `.expired/.empty` fetch; fetched profile saved back + indexed in `SearchIndex` + `UserDisplayNameCache`.
  - 403 server error → `isBlockedByTarget` → auto-dismiss.
  - Lazy-loads stats (`UserService.getUserStats`) and shared conversations (`ConversationService.listSharedWith`) on tab appear.
  - Connection actions optimistic + rollback against `FriendshipCache`; block/unblock via `BlockService`; toasts posted via `NotificationCenter` "meeshy.showToast".
  - Profile tab: bio card, language pills, `ProfileCompletionRing`, timezone/country chips, E2EE badge, action buttons. Stats tab: member-since + `StatsCard`s + achievements grid (`AchievementBadge`).
  - Navigation fallback via `NotificationCenter` posts (`navigateToConversation`, `sendMessageToUser`).
- Dependencies: `CacheCoordinator`, `UserService`, `ConversationService`, `FriendshipCache`, `BlockService`, `FriendService`, `SearchIndex`, `UserDisplayNameCache`, `MeeshyAvatar`, `FullscreenImageView`, `ProfileCompletionRing`, `StatsCard`, `AchievementBadge`, `CountryFlag`, `LanguageDisplay`, `UserStats`/`Achievement`.
- Android-port note: Compose screen/bottom-sheet backed by a ViewModel doing SWR (`CacheResult` flow) + lazy tab loads. Replace `NotificationCenter` toast/navigation hacks with proper event channels / nav callbacks. 403 → blocked-by-target handling preserved. Tab content as separate composables.

## packages/MeeshySDK/Sources/MeeshyUI/Story/AudioSpectrogramView.swift
- Purpose: Real-time audio spectrogram visualization (FFT bands).
- Public API: `AudioSpectrogramRenderer` (nonisolated; `computeBins(from: [Float]) -> [[Float]]`); `AudioSpectrogramView(samples, barColor)` (internal).
- Key behaviors: vDSP/Accelerate Hanning-windowed FFT (fftSize 64, 32 bands); per-column band RMS normalized by global max; rendered via SwiftUI `Canvas` with indigo300→indigo600 frequency-blended colors; FFT runs on detached background task.
- Dependencies: `Accelerate` (vDSP), `MeeshyColors`.
- Android-port note: Compute FFT with a Kotlin/JNI DSP lib (e.g. JTransforms) on a background dispatcher; render bands with Compose `Canvas` `drawRect`. Heavy; consider caching computed bins per sample buffer.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasGeometry.swift
- Purpose: Design-space ↔ render-space coordinate mapping for the Story canvas.
- Public API: `CanvasGeometry` (Equatable/Sendable) — `designWidth 1080`, `designHeight 1920`, `renderSize`, `scaleFactor` (= renderSize.width / 1080); `render(_:)` for point/length/size; `designLength/Point(forNormalized:)`.
- Key behaviors: uniform 9:16 scaling based on width; the cross-device parity invariant — every render dimension is a linear function of `scaleFactor`.
- Android-port note: Kotlin data class with identical constants; map dp/px carefully — Story canvas should render at a fixed 1080×1920 design ref and scale uniformly. This is foundational to canvas fidelity — port exactly.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/CanvasReprojector.swift
- Purpose: Reprojects story-object normalized positions between aspect ratios (center-anchored), incl. PencilKit drawings.
- Public API: `CanvasReprojector(from:to:)` — `reproject(text/sticker/media/audio:)`, `ReprojectedItem<T>` + `ReprojectionWarning.clamped`; extension `reproject(drawing: PKDrawing)` / `reproject(drawingData: Data?)`.
- Key behaviors: center (0.5,0.5) preserved; positions outside [0,1] clamped + warned; scale/aspect/rotation invariant; PKDrawing scaled by uniform min(x,y) factor.
- Dependencies: `PencilKit`, story object models (SDK).
- Android-port note: Kotlin reprojection math is straightforward. PencilKit has no Android equivalent — story drawings must use a custom ink/path model (or Compose `Path` serialization). This is a non-trivial port concern: design the Android ink format up front.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift
- Purpose: `CALayer` subclass rendering the story background (solid color / gradient / image+thumbHash / video).
- Public API: `BackgroundTransform` (scale/offset/rotation → `CATransform3D`); `StoryBackgroundLayer` with `Kind` enum + `GradientDirection`; `configure(kind:transform:geometry:resolver:imageCache:)`; `handleAppLifecycle(active:)`; `ThumbHashDecoder`.
- Key behaviors: ThumbHash synchronous placeholder then async bitmap load; 3 image sources (image cache → direct embedded URL → resolver+network); BUGFIX note: online viewer passes `imageCache: nil`, so network download guarded by `resolver` only; video via `AVPlayer`/`AVQueuePlayer`+`AVPlayerLooper`; pause/resume on app lifecycle.
- Dependencies: `AVFoundation`, `CanvasGeometry`, `ImageCacheReader`, `UIImage.fromThumbHash`.
- Android-port note: Use a custom `View`/Compose `Canvas` or `SurfaceView` for the story canvas. Background: gradient via `Brush`, image via Coil + ThumbHash placeholder, video via Media3 `ExoPlayer` with looping. Lifecycle pause/resume via `LifecycleObserver`. The whole CALayer-tree architecture must be re-platformed (see Architecture observations).

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryFilteredLayer.swift
- Purpose: `CAMetalLayer` running Metal compute kernels for real-time story filters (vintage sepia, B&W contrast).
- Public API: `StoryFilteredLayer` — `Kind` (`vintage`/`bwContrast`, raw value = kernel name); `kind`, `intensity`, `sourceTexture`; `render()`; static `preheatPipeline(kind:)` / `preheatAllPipelines()`.
- Key behaviors: process-wide pipeline cache (NSLock-guarded) to avoid 5–50ms compile hit on first render; kernels bundled via `Bundle.module` Metal library; lazy compile fallback in `render()`.
- Dependencies: `Metal`, `StoryRenderingContext`, `StoryFilters.metal`.
- Android-port note: Port filters as GLSL/RenderEffect (API 31+ `RenderEffect`) or a custom OpenGL ES / Vulkan compute shader, or RenderScript-replacement (Toolkit). Pipeline preheat → shader program pre-compilation cache. Significant GPU re-platforming effort.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryGlassBackdropLayer.swift
- Purpose: `CALayer` painting a frosted-glass blur backdrop behind story text.
- Public API: `StoryGlassBackdropLayer` — `configure(sigma:)`, `setBackdropTexture(_:)`.
- Key behaviors: two paths — GPU MPS (`StoryBlurFilter` / `MPSImageGaussianBlur`) when a backdrop `MTLTexture` is supplied (used in AVFoundation exports), else private `CAFilter "gaussianBlur"` fallback (same mechanism as `UIVisualEffectView`); detailed ARC/`takeUnretainedValue` correctness note; MPS path requires `.shared` storage textures + Y-flip for CALayer coords. TODO: wire per-tick canvas snapshot into backdrop texture.
- Dependencies: `Metal`, `CoreImage`, `MPSImageGaussianBlur`, `StoryRenderingContext`, `StoryBlurFilter`.
- Android-port note: Compose `Modifier.blur` / `RenderEffect.createBlurEffect` (API 31+) for live preview; for baked video export, a GPU Gaussian blur shader on the captured backdrop texture. No `CAFilter` equivalent — must implement explicitly.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift
- Purpose: `CALayer` rendering a single story media object (image or video).
- Public API: `StoryMediaImageLoading` protocol + `DiskCacheImageLoader` conformer; `StoryMediaLayer` — `configure(with:geometry:mode:)`, test seams `_setImageLoaderForTesting`/`_currentImageLoadTaskForTesting`.
- Key behaviors:
  - P0 perf fix: `file://` URLs stay synchronous; `http(s)` go async through `CacheCoordinator` to avoid blocking-network-on-main-thread (~30 dropped frames).
  - `currentLoadTask` cancelled on every `configure` so recycled layers never stamp stale images.
  - Design-space sizing (`baseMediaDesignSize` = 65% short side, square = 50%) projected via geometry; `shouldRasterize` for static images in `.play` mode.
  - Video: `AVPlayer` + `AVPlayerLayer`, loop observer via `NotificationCenter`; `.play` plays immediately, `.edit` seeks to zero.
- Dependencies: `AVFoundation`, `CanvasGeometry`, `CacheCoordinator`, `RenderMode`, story models.
- Android-port note: Story media item = composable/`View` with Coil (images) + Media3 ExoPlayer (video); cancel pending loads on recycle; design-space sizing math ported exactly. Looping via ExoPlayer `REPEAT_MODE_ONE`.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryStickerLayer.swift
- Purpose: `CALayer` rendering a story sticker (single emoji glyph) as a cached raster image.
- Public API: `StoryStickerLayer` — `configure(with:geometry:mode:)`.
- Key behaviors: emoji rasterized via `StoryStickerRasterizer.shared.cgImage(for:size:)`; design-space sizing via geometry; `shouldRasterize` in `.play`.
- Android-port note: Render emoji to a `Bitmap` via `Canvas.drawText` cached by (emoji,size); place in story canvas with rotation/scale/zIndex.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryTextLayer.swift
- Purpose: `CATextLayer` subclass rendering story text with crisp cross-device typography + backgrounds (solid / glass).
- Public API: `StoryTextLayer` — `configure(with:geometry:mode:)`, `setGlyphsHidden(_:)`, `setBackdropTexture(_:)`.
- Key behaviors:
  - Cross-device parity: text measured at DESIGN font size, whole bounding box projected once via geometry (measuring in render space would break iPhone↔iPad linearity).
  - `StoryTextFontResolver` applies `textStyle` (bold/neon/typewriter/handwriting/classic); RTL via `.natural` paragraph writing direction.
  - Outline/stroke: negative `strokeWidth` % (fill + contour); width normalized to design px so contour thickness is scale-independent.
  - Word-wrap at 88% design width; `truncationMode = .none` (never ellipsize).
  - Backgrounds: `.solid` tinted CALayer or `.glass` `StoryGlassBackdropLayer` at zPosition -1; `setGlyphsHidden` toggles transparent foreground for in-place editing.
- Dependencies: `CoreText`, `Metal`, `CanvasGeometry`, `StoryTextFontResolver`, `StoryGlassBackdropLayer`, story models.
- Android-port note: Render text via Compose `Text`/`drawText` or Android `StaticLayout` for wrapping; measure at design font size + project. RTL via `TextDirection`. Stroke/outline via `Paint.Style.STROKE` pass. Custom fonts loaded from assets. Glass background → blur composable.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/RepostPayload.swift
- Purpose: Serializable payload for reposting a story slide (extracts all objects + source metadata).
- Public API: `RepostPayload` (Sendable/Codable; textObjects, mediaObjects, stickers, drawingData, audioPlayerObjects, sourceCanvasSize, sourceSlideId, sourceStoryItemId); extensions `StorySlide.extractRepostPayload(...)`, `StoryItem.extractRepostPayload()`.
- Android-port note: Kotlin data class (`@Serializable`); extension functions on the slide/item models. `drawingData` format depends on the chosen Android ink representation.

## packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift
- Purpose: Custom `AVVideoCompositing` that bakes story slides to MP4 using the SAME `StoryRenderer.render()` as the live canvas (bit-exact export).
- Public API: `StoryAVCompositor` (AVVideoCompositing); `StoryCompositionInstruction` (AVVideoCompositionInstructionProtocol; carries slide + languages + timeRange).
- Key behaviors:
  - Bridges AVFoundation worker queue → MainActor via `DispatchQueue.main.sync` + `MainActor.assumeIsolated` per frame (caveat: never call export from MainActor or it deadlocks).
  - `renderFrame`: cache scope-invalidation; backdrop capture (pooled `BackdropCapturing`, invalidated per frame to bound shared-memory to O(1)); foreground layer tree via `StoryRenderer.render`; static opening transition (fade/reveal) for first 0.5s; manual background paint (solidColor/gradient/image aspectFill, video left to substrate track) into `CVPixelBuffer` via `CGContext` with Y-flip.
  - Cancellation: `cancelAllPendingVideoCompositionRequests` sets flag sync then clears async so in-flight requests observe it.
- Dependencies: `AVFoundation`, `CoreMedia`, `StoryRenderer`, `StoryRendererCache`, `StoryBackdropCapture`/`BackdropCapturing`, `CanvasGeometry`, `StoryRenderingContext`.
- Android-port note: No `AVVideoCompositing` equivalent. Story export on Android = render each frame of the canvas to a `Bitmap`/GL texture and feed `MediaCodec` (or Media3 `Transformer` with a custom `GlEffect`/frame processor). Reuse the shared story renderer to render frames; this is a substantial subsystem rebuild — plan a dedicated `StoryExporter` using Media3 Transformer + custom video frame effects.

---

## Architecture observations

### State management
- Reusable components are largely stateless/declarative; state hoisted via `Binding`s (pickers, tag inputs, floating buttons). `MeeshyAvatar`, `UserIdentityBar` are pure presentation taking config objects.
- Shared mutable state via `@ObservedObject` singletons: `ThemeManager.shared`, `FriendshipCache.shared`, `BlockService.shared`. `ConnectionActionView`/`UserProfileSheet` reactively re-render when these publish. Android: expose as `StateFlow` and `collectAsStateWithLifecycle()`.
- `UserProfileSheet` keeps heavy view-local state (loaded user, stats, conversations, loading flags) — on Android this belongs in a `ViewModel`.

### Caching / SWR
- Strong cache-first pattern: image views probe `DiskCacheStore` synchronously in `init` for instant warm render (no spinner). Port to Coil memory-cache snapshot lookup.
- `UserProfileSheet` is a textbook SWR consumer: `CacheCoordinator.profiles.load` → distinct handling of `.fresh/.stale/.expired/.empty`, serving stale + background refresh. This is the canonical pattern to replicate across Android.
- `LanguageUsageTracker` = lightweight UserDefaults frequency store → DataStore.

### Concurrency
- Heavy use of structured `Task` with `Task.isCancelled` guards and explicit cancellation of in-flight loads on view recycle (`CachedAsyncImage`, `StoryMediaLayer`) — important for list/canvas scroll correctness; replicate with Kotlin coroutine `Job` cancellation tied to component lifecycle.
- Story canvas is `@MainActor` for CALayer config; `StoryAVCompositor` bridges AVFoundation worker threads to MainActor per frame — a fragile pattern; Android export should keep frame rendering off the main thread entirely.
- `AudioSpectrogramRenderer` and Story FFT run on detached background tasks; metal pipeline cache is NSLock-guarded.

### Navigation & eventing — ANTI-PATTERN
- `UserProfileSheet` uses `NotificationCenter.default.post` for toasts (`meeshy.showToast`), conversation navigation (`navigateToConversation`), and DM creation (`sendMessageToUser`) as a fallback when callbacks are nil. Do NOT carry this over — Android should use explicit nav callbacks / a `SharedFlow` event bus or the navigation component.

### Performance techniques
- `MeeshyAvatar` deliberately disables continuous ring/badge animations in list/feed contexts (`animatesStoryRing/MoodBadge`) to avoid N concurrent GPU animations during scroll — replicate this scroll-aware animation suppression on Android.
- Story canvas built on CALayer tree with `shouldRasterize` for static layers in `.play`, Metal pipeline preheat, pooled backdrop textures, design-space→render-space linear projection for cross-device parity.
- `AvatarContextMenuItem` uses stable string ids (not UUID) to avoid AttributeGraph identity churn / use-after-free — Android equivalent: stable `key` in `LazyColumn`/menu items.

### Tech debt NOT to carry over
- `CategoryPickerView.createCategory()` is a non-functional stub; two redundant tag-input components (`TagInputField` vs `TagInputView`) and two category pickers — consolidate to one each on Android.
- Deprecated `MeeshyColors` legacy aliases (`pink/coral/cyan/green/teal`) still used in `ErrorBannerView`, `ToastView`, `ProfileCompletionRing`, `UserProfileSheet` send-message button — Android must use the indigo brand scale + semantic tokens only.
- `CategoryPickerView` uses `print` for error logging.
- `FullscreenImageView` uses raw `AsyncImage` instead of the cached pipeline — inconsistent; Android should use one image loader everywhere.

### Story canvas re-platforming (biggest concern)
- The entire Story rendering engine (`CanvasGeometry`, layer subclasses, Metal filters, glass blur, `StoryAVCompositor`) is deeply tied to CALayer / CATextLayer / CAMetalLayer / Metal / MPS / AVFoundation / PencilKit. There is no 1:1 Android mapping. Plan a dedicated Android story subsystem: a Compose/`Canvas`/`SurfaceView` renderer, Media3 ExoPlayer for video layers, Media3 Transformer + custom GL frame effects for MP4 export, `RenderEffect`/GLSL for filters & glass blur, and a custom ink model replacing PencilKit. The design-space (1080×1920) coordinate model and reprojection math ARE portable and should be reused verbatim.

---

### Portable user-facing features / capabilities
- [ ] Disk-cached progressive images with ThumbHash placeholders (avatars, banners, posts)
- [ ] Conversation category selection & creation (inline picker)
- [ ] Emoji reaction quick-strip + full emoji picker sheet + emoji keyboard panel
- [ ] Standardized empty-state placeholders
- [ ] Auto-dismissing error banner
- [ ] Draggable, snap-to-edge floating action buttons with persisted position
- [ ] Translation-language picker with search + usage-frequency sorting
- [ ] Context-aware user avatars (story ring, mood badge, presence dot, long-press menu)
- [ ] Branded pull-to-refresh indicator + refreshable scroll wrapper
- [ ] Profile completion ring
- [ ] Skeleton/shimmer loading placeholders
- [ ] Swipe-to-reveal row actions (leading + trailing, persistent)
- [ ] Tag input with chips, suggestions & create-new
- [ ] Toast notifications (success/error/info)
- [ ] Composable identity bar (name/role/time/delivery-status/language-flags/translate)
- [ ] Message delivery status indicators (sending → sent → delivered → read → failed)
- [ ] Connection/friend-request action pill (add/accept/decline/cancel) with optimistic updates
- [ ] Fullscreen zoomable image viewer
- [ ] Full user profile sheet (banner, identity, Profile/Conversations/Stats tabs, achievements)
- [ ] Block / unblock users
- [ ] Audio spectrogram visualization
- [ ] Story canvas: text / sticker / media / drawing layers with cross-device parity
- [ ] Story backgrounds: solid color / gradient / image / looping video
- [ ] Real-time story filters (vintage, B&W contrast)
- [ ] Frosted-glass text backdrops in stories
- [ ] Story text typography styles + outline/stroke + RTL support
- [ ] Story repost (extract & re-author another slide's content)
- [ ] Story-to-MP4 export with bit-exact rendering
