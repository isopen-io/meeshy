# iOS Audit — Part 12

Scope: 17 files from `apps/ios/Meeshy/Features/Main/Views/` — story viewer (content/sidebar/canvas host), static legal/support screens, conversation list row, message bubble orchestrator + media grid, threads, tracking links, 2FA, user stats, video filters, voice profile management/wizard.

---

## apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift

Purpose: Largest extension of the story viewer — text/media/filter rendering, gestures, navigation, the display-link progress timer, comments, reactions, and the comments-overlay sub-view. ~1960 lines.

Public API surface:
- `StoryProgressDisplayLinkProxy` (final class): wraps `CADisplayLink` (30–120Hz, `.common` mode); nested boxed `MutableDouble` for closure-mutable doubles; `start()` / `invalidate()`.
- `RevealCircleShape: Shape` — animatable circular reveal (`animatableData` = progress; radius = diagonal × progress).
- `extension StoryViewerView` — `storyTextContent(_:storyEffects:)`, `mediaOverlay(media:geometry:)`, `filterOverlay`, `unifiedDragGesture`, `goToNext()`/`goToPrevious()`, `startTimer()`, `updateStoryDuration()`, `roundedUpToBgLoops(...)` (static), `pauseTimer()`/`resumeTimer()`, `triggerInitialActionIfNeeded()`, `dismissComposer()`, `sendComment(...)`, `sendReaction(...)`, `shareStory()`, `storyTimeRemaining(_:)`, `deleteCurrentStory()`, `markCurrentViewed()`, prefetch helpers, comment thread mgmt, `loadStoryComments()`.
- `StoryViewerItem` (Identifiable struct), `StoryViewersSheet: View` (loads `/posts/:id/interactions`).
- `StoryCommentsOverlayView: View` — bottom-half live-chat overlay with reply threading (1-level), inline `UniversalComposerBar`, auto-scroll.
- `StoryCommentRowView: View, Equatable` — bubble-style comment, per-comment language switcher (original ↔ translated), heart + reply.
- `StoryActionButton: View` — circular sidebar button.
- `StoryProgressBarsView: View` — segmented story progress.

Key behaviors / algorithms:
- Progress timer is a **pause-aware accumulator** driven by `CADisplayLink`, not wall-clock; commits `progress` only when it advances ≥ 1/300 (~1px) — ~2.5× fewer body re-evals. Gated on `isContentReady` (real media loaded) and a `shouldPauseTimer` computed predicate aggregating ~10 UI states.
- `updateStoryDuration()`: slide duration = `max(12s, configured slideDuration, longest foreground media/audio/text end-time)`, then `roundedUpToBgLoops()` rounds up to the next full bg loop cycle so looping bg video/audio finishes its cycle.
- `unifiedDragGesture`: single `DragGesture` decides axis (horizontal=group nav, vertical=dismiss) on first 8pt of movement; uses predicted end-translation for fling.
- `crossFadeStory` / `groupTransition`: true cross-dissolve with outgoing layer kept visible to avoid AsyncImage reload flash; per-story opening/closing effects (fade/zoom/slide/reveal).
- Comments: optimistic insert, SWR cache via `CacheCoordinator.comments`; reply count is top-level + replies; reaction like has optimistic delta + in-flight set to prevent rapid-tap desync; live socket updates of comment reactions.
- Prefetch: image cache + AVPlayer preroll for current group + 2 next-group stories.

Dependencies: `StoryViewModel`, `PostService`, `APIClient`, `CacheCoordinator`, `SocialSocketManager`, `StoryMediaLoader`, `AuthManager`, `ReportService`, `PostDetailViewModel.resolveCommentTranslation`.

Android-port note: `CADisplayLink` → `Choreographer.FrameCallback` or a Compose `withInfiniteAnimationFrameMillis` loop; the pause-aware accumulator pattern ports directly. Drag axis-lock → `pointerInput` with a custom axis detector. Cross-dissolve → `AnimatedContent`/`Crossfade` with a kept outgoing layer. Comments overlay → `ModalBottomSheet` with `LazyColumn`. The `shouldPauseTimer` aggregate predicate is good design — keep it.

## apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift

Purpose: Extracted real-struct views for the story viewer's right action sidebar and top header (broken out of the viewer's opaque type to dodge a type-metadata crash).

Public API surface:
- `StoryActionSidebarView: View` — heart/react, reply privately, forward (send), reshare/views, author export, mute, comments, translate. Heavy `@Binding` surface (~12 bindings) + closures (`triggerStoryReaction`, `pauseTimer`, `loadStoryComments`). Private `bounceHeart()` phased spring; `languageScrollStrip` (translation language picker).
- `StoryHeaderView: View` — author avatar (long-press glow), name, timeAgo, repost-via badge, expiry countdown; kebab `Menu` (share/delete for own; profile/repost-as-post/edit-and-repost/report for others); close button. Hosts `UserProfileSheet` and `ReportMessageSheet`.

Key behaviors: Heart bounce driven by a `heartBouncePulse` Int tick (the single reaction-sent seam). Reshare visibility gated on `currentStory?.isPublic` (never for FRIENDS/PRIVATE). Translate strip: tap flag → `POST /posts/:id/translate`; `LanguageUsageTracker` records usage and sorts languages. External share builds `https://meeshy.me/story/<id>`.

Dependencies: `StoryItem`/`StoryGroup`, `EmojiReactionPicker`, `MeeshyAvatar`, `TranslationLanguage`, `LanguageUsageTracker`, `APIClient`, `ReportMessageSheet`, `UserProfileSheet`.

Android-port note: Sidebar → vertical `Column` of icon buttons over the canvas. Kebab → `DropdownMenu`. `ShareLink` → `Intent.ACTION_SEND`. Translate strip → horizontal `LazyRow` of flag chips. Bindings collapse into a single state holder / `StoryViewerUiState`.

## apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift

Purpose: Root story viewer view — owns all viewer `@State`, the prefetcher + gated-timer pipeline wire-up, sheet/fullScreenCover routing (viewers, export, share, repost-as-story, repost-as-post), and lifecycle.

Public API surface:
- `SharedContentWrapper`, `RepostStorySourceWrapper`, `RepostPostSourceWrapper`, `StoryDraft` — Identifiable wrappers / draft model.
- `PrefetcherHostView: UIViewRepresentable` — installs `StoryReaderPrefetcher.hostView` as an invisible 1×1 offscreen view.
- `StoryViewerView: View` — props: `viewModel`, `groups`, `currentGroupIndex`, `isPresented`, `isPreviewMode`, `onReplyToStory`, preloaded image/video/audio maps, `initialStoryIndex`, `initialAction`. ~40 `@State` fields. `static heartEmoji`.
- Internal-for-extension helpers: `installPrefetchPipelineIfNeeded`, `refreshPrefetchWindowAndTimer`, `currentGroup`/`currentStory`, `resolvedViewerLanguageChain`, `storyHasAudioOrVideo`, `storyHasTranslatableContent`, `isContentTranslated`, `currentVoiceCaption`, `triggerStoryReaction`.

Key behaviors:
- **Prefetcher**: `StoryReaderPrefetcher` keeps a sliding `[N-1,N,N+1]` window of bootstrapped offscreen canvas views; `StoryReaderTimerController` is gated on `onContentReady` (image bytes landed in shared cache). Legacy display-link timer is intentionally kept as the actual auto-advance source; the gated timer's callbacks are wired but no-op (documented seam for future migration).
- Prisme Linguistique: viewer language chain = `MeeshyUser.preferredContentLanguages` (never device locale).
- Socket post-room join/leave transitions on story change (idempotent via id check).
- Repost: as-story (full `StoryComposerViewModel(reposting:)`), as-post direct (`PostService.repost` no content), edit-and-repost-as-post (`UnifiedPostComposer`). Toasts mapped on 404/403.
- `initialAction` one-shot (notification entry → comments overlay or viewers sheet, 250ms delay, latched).
- Story card delegated to `StoryViewerContentView`/`StoryCardView` (other files) — both extracted as real structs to avoid Swift type-metadata recursion crash on low-memory devices.

Dependencies: `StoryViewModel`, `Router`, `ConversationListViewModel`, `StatusViewModel` (EnvironmentObjects re-injected onto sheets), `SocialSocketManager`, `StoryMediaCoordinator`, `PlaybackCoordinator`, `AuthManager`, `PostService`, `KeyboardObserver`.

Android-port note: Story viewer → full-screen `Pager` (`HorizontalPager` for groups). The prefetcher sliding window → preload images/players for adjacent pages via Coil + ExoPlayer pre-buffering; Compose `Pager` already pre-composes neighbors. No type-metadata-crash concern in Kotlin — the extracted structs are an iOS-only workaround, collapse them back into composables freely. The legacy/gated dual timer is tech debt: implement ONE content-gated auto-advance. EnvironmentObject re-injection issue does not exist with Hilt/CompositionLocal.

## apps/ios/Meeshy/Features/Main/Views/SupportView.swift

Purpose: Static "Aide et support" screen — help center / FAQ links, contact (email, Twitter), bug/feature report mailto links, app version/build/platform info.

Public API surface: `SupportView: View` (no VM). Computed `appVersion`/`buildNumber` from `Bundle.main.infoDictionary`.

Key behaviors: Pure static content; `Link` to URLs (https + mailto). Hardcoded section accent hex colors.

Android-port note: Trivial `@Composable` with a `LazyColumn` of link rows; URLs via `Intent.ACTION_VIEW`. Version from `BuildConfig.VERSION_NAME`/`VERSION_CODE`. No state.

## apps/ios/Meeshy/Features/Main/Views/TermsOfServiceView.swift

Purpose: Static Terms of Service screen with FR/EN toggle; 9 numbered sections per language hardcoded in a `[String: [(title, content)]]` dictionary.

Public API surface: `TermsOfServiceView: View`; `@State selectedLanguage` ("fr"/"en"); segmented `Picker`.

Key behaviors: Pure static; "last updated" date string per language.

Android-port note: Static `@Composable`; language toggle → `SegmentedButton` / `TabRow`. Consider moving copy to string resources (`values/`, `values-en/`) rather than an inline map — cleaner localization.

## apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift

Purpose: Conversation list row cell — avatar, name + type badge, tags, last-message preview (text/attachments/ephemeral/expired/hidden/view-once/draft/typing), timestamp, unread badge. A hot-list leaf view.

Public API surface:
- `ThemedConversationRow: View, @MainActor Equatable` — many `let`/`var` inputs (conversation, community, availableWidth, isDragging, `presenceState`, story ring, mood, typingUsername, isSelected, draftSummary, callback closures). Equatable via `conversation.renderFingerprint` + presence/typing/selection/draft.
- `private struct ConversationAvatarView` — extracted to avoid PAC issues; builds `MeeshyAvatar` with DM vs group context-menu items.
- `static timestampColor(unreadCount:accent:)`.

Key behaviors:
- **Activity heat** algorithm: `0.40·recency + 0.35·unread + 0.15·members + 0.10·pinned` (muted → 0.05); drives a pastel→vibrant background gradient.
- **Dynamic tag overflow**: greedy width-fitting of tags against `availableWidth`, reserving `+N` badge space; always shows ≥1 tag.
- `lastMessageSummaryKind()` switch: expired / hidden / viewOnce / ephemeralActive / standard — each with distinct icon + italic styling.
- Accent color is deterministic per conversation (`conversation.accentColor` / `colorPalette`); pre-parsed once to avoid 19× hex parse per render.
- Leaf-view rules followed: `isDark` passed as value, `@Environment(\.swipeProgress)`, no `@ObservedObject` singletons.

Dependencies: `Conversation`/`MeeshyConversation`, `MeeshyCommunity`, `TagChip`, `MeeshyAvatar`, `PresenceState`, `StoryRingState`, `StatusEntry`, `DraftSummary`, `MeeshyColors`.

Android-port note: `LazyColumn` item; mark the composable with stable params + `@Stable`/`@Immutable` data classes for skipping (Compose equivalent of `.equatable()`). Heat gradient and greedy tag-fitting port directly. `swipeProgress` → `SwipeToDismissBox` progress. Pre-parse accent color outside recomposition (remember).

## apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift

Purpose: Visual media grid + inline carousel for the message bubble (extension on `BubbleStandardLayout`).

Public API surface:
- `extension BubbleStandardLayout` — `visualMediaGrid` (1–4+ collage layouts), `makeGridCell(...)`, `carouselView`, `downloadBadge(...)`.
- `BubbleGridCell` (fileprivate struct) — single grid cell: media layer, overflow `+N`, blur/view-once overlay, view-count badge, download badge. `handleTap()` / `handleReveal()`.
- `BubbleGridImageView`, `BubbleGridVideoThumbnailView` (fileprivate) — bounded `some View` image/video-thumb cells.
- `AttachmentBlurOverlayView` (private) — long-press-to-reveal blur for view-once/blurred media.
- `BubbleCarouselView: View` — native paging carousel (`ScrollView` + `scrollTargetBehavior(.paging)`), scroll transitions (scale/opacity/blur), page indicator (dots ≤7, fraction >7), adjacent-page prefetch.

Key behaviors:
- Grid layouts: 1 solo, 2 side-by-side, 3 (60/40 split), 4+ (2×2 with `+N` overflow on cell 4).
- View-once: `handleReveal` calls `onConsumeViewOnce` (gateway consumes entitlement) then reveals for 5s before re-blurring; view-once count badge.
- Carousel pauses `SharedAVPlayerManager` when paging away from a playing video; haptic on page change.
- Extensive comments document an iOS-specific type-demangler crash (`swift_getTypeByMangledNameInContextImpl`) — the reason for the concrete-struct extraction.

Dependencies: `MessageAttachment`, `ProgressiveCachedImage`, `DownloadBadgeView`, `InlineVideoPlayerView`, `SharedAVPlayerManager`, `CacheCoordinator`, `MeeshyConfig.resolveMediaURL`.

Android-port note: Grid → custom `Layout`/`Row`/`Column` composable (same collage logic). Carousel → `HorizontalPager` with `graphicsLayer` page transforms; video via ExoPlayer. View-once reveal → timed state. The demangler-crash workaround is iOS-only — no need in Kotlin; just write idiomatic composables.

## apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift

Purpose: Thin composition orchestrator for the message bubble (was a 953-line god view). Owns the public init API, local `@State`, lifecycle controllers, and kind dispatch.

Public API surface:
- `ThemedMessageBubble: View, @MainActor Equatable` — ~40 init params (message, contactColor, isDirect, isDark, transcription, translations, preferredTranslation, translatedAudios, sender presence/mood/story ring, ~15 callback closures, `allAudioItems`, group flags, mention names, highlight term, edit flags, `userLanguages`).
- `@State`: display/secondary lang codes, sheet/fullscreen presentations, share URL, carousel state, revealed attachment ids.
- `@StateObject`: `BubbleBlurRevealController`, `BubbleEphemeralController`.

Key behaviors:
- Builds an immutable `BubbleContent` value model once per body eval (via `BubbleContentBuilder`), dispatches on `content.kind`: `.deleted` → `BubbleDeletedView`, `.burned` (un-revealed) → `BubbleBurnedView`, ephemeral-expired → `EmptyView`, else → `BubbleStandardLayout`.
- Lifecycle: ephemeral timer started from `message.expiresAt`; blur-reveal duration read from `UserPreferencesManager`.
- `selectedProfileUser` change routes to `router.deepLinkProfileUser`.
- Equatable carefully compares only inputs that change WITHOUT bumping `message.updatedAt` (presence, mood, story ring, group flags, prefs, effect flags, reaction identity set) — gates body re-eval for hot list cells.

Dependencies: `Message`, `BubbleContent`/`BubbleContentBuilder`, `BubbleStandardLayout`, `BubbleDeletedView`/`BubbleBurnedView`, controllers, `Router`, `UserPreferencesManager`.

Android-port note: Orchestrator → composable that builds an immutable `BubbleContent` then `when(content.kind)` dispatches. Lifecycle controllers → `rememberSaveable` state + `LaunchedEffect`/coroutine timers. Equatable → stable/immutable data classes so Compose skips recomposition; pass primitives. Preserve the "extend BubbleContent + new sub-view, never inline" architectural rule from CLAUDE.md.

## apps/ios/Meeshy/Features/Main/Views/ThreadView.swift

Purpose: Message thread/replies screen — parent message card + flat reply list + inline composer.

Public API surface: `ThreadView: View` — props `parentMessage: MeeshyMessage`, `conversationId`. `@State` replies/replyText/isLoading/isSending/sendError.

Key behaviors: `loadReplies()` fetches `/conversations/:id/messages?replyToId=...&limit=50`; `sendReply()` optimistically clears the field, sends via `MessageService.shared.send`, restores text on failure, reloads. Accent = parent sender color.

Dependencies: `MeeshyMessage`/`APIMessage`, `APIClient`, `MessageService`, `SendMessageRequest`, `StatusViewModel`.

Android-port note: Standard detail screen with a small `ViewModel`. No SWR cache here (refetch-on-send) — could add cache. Reply list → `LazyColumn`.

## apps/ios/Meeshy/Features/Main/Views/TrackingLinkDetailView.swift

Purpose: Detail/analytics screen for a single UTM tracking link — stats, geo/device/browser breakdowns, click timeline, UTM config, QR generation, copy/share/delete.

Public API surface:
- `TrackingLinkDetailView: View` — prop `link: TrackingLink`; owns `TrackingDetailViewModel`.
- `TrackingDetailViewModel: ObservableObject` — `@Published clicks`, `isLoadingMore`; `load()`; computed `topCountries`/`topDevices`/`topBrowsers` (group-by-count-sort).

Key behaviors: QR via `CIFilter("CIQRCodeGenerator")` → 10× scale → share. Breakdown rows render proportional bars. Country flag from regional-indicator unicode math. Delete via `TrackingLinkService`.

Dependencies: `TrackingLink`/`TrackingLinkClick`, `TrackingLinkService`, CoreImage, `UIActivityViewController`.

Android-port note: QR via ZXing. Charts/bars → custom composables or a chart lib. Share/copy → `Intent`/`ClipboardManager`. Country flag math ports directly. ViewModel → Hilt VM.

## apps/ios/Meeshy/Features/Main/Views/TrackingLinksView.swift

Purpose: List of UTM tracking links + aggregate stats overview; create-link entry point.

Public API surface:
- `TrackingLinksView: View` — owns `TrackingLinksViewModel`; `showCreate` sheet → `CreateTrackingLinkView`.
- `TrackingLinksViewModel: ObservableObject` — `@Published links`, `stats`, `isLoading`; `load()` (SWR via `CacheCoordinator.trackingLinks`), `loadStats()`.

Key behaviors: SWR cache-first: fresh → return; stale → show + refresh; expired/empty → spinner if empty + refresh. `refreshFromAPI` parallelizes list + stats with `async let`. Pull-to-refresh.

Dependencies: `TrackingLink`/`TrackingLinkStats`, `TrackingLinkService`, `CacheCoordinator`.

Android-port note: `LazyColumn` + `pullRefresh`; SWR pattern → Repository emitting cached-then-network `Flow`. `NavigationLink` → nav route to detail.

## apps/ios/Meeshy/Features/Main/Views/TwoFactorSetupView.swift

Purpose: 2FA enrollment wizard, disable flow, and backup-codes regeneration.

Public API surface:
- `TwoFactorSetupView: View` — `@ObservedObject viewModel: TwoFactorViewModel`, `onComplete`/`onCancel`. Nested `enum SetupStep { loading, showSecret, enterCode, showBackupCodes, error }`.
- `TwoFactorDisableView: View` — password + 6-digit code → `viewModel.disable`.
- `TwoFactorBackupCodesView: View` — verify code → regenerate backup codes.

Key behaviors: QR rendered from `setup.qrCodeDataUrl` base64 data-URL (`.interpolation(.none)`). 6-digit code inputs filtered to numerics, capped at 6, `numberPad`. Backup codes 2-column grid, copy-all. Localized strings via `String(localized:)`.

Dependencies: `TwoFactorViewModel`, `TwoFactorSetup` model.

Android-port note: Step `enum` → sealed class UI state. QR data-URL → decode base64 to `Bitmap` (`Image`). Code field → `OutlinedTextField` with `KeyboardType.NumberPad` + input filter. Localized strings → string resources. Three screens share one VM.

## apps/ios/Meeshy/Features/Main/Views/UserStatsView.swift

Purpose: User statistics dashboard — stat cards (messages, conversations, translations, languages, member days, friend requests), activity timeline chart, achievement badges.

Public API surface:
- `UserStatsView: View` — owns `UserStatsViewModel`.
- `UserStatsViewModel: ObservableObject` — `@Published stats: UserStats?`, `timeline: [TimelinePoint]`, `isLoading`; `load()` (SWR).

Key behaviors: SWR for both `stats` and `timeline` caches; `refreshFromAPI` parallelizes `fetchStats` + `fetchTimeline(days:30)` with `async let`. Timeline via Swift `Charts` (`StatsTimelineChart`). Badges in 3-col grid (`AchievementBadgeView`).

Dependencies: `UserStats`/`TimelinePoint`, `StatsService`, `CacheCoordinator` (stats + timeline stores), `Charts`, `AchievementBadgeView`.

Android-port note: Chart → Vico / MPAndroidChart / Compose canvas. SWR → Repository `Flow`. Stat cards / badges → `LazyVerticalGrid`.

## apps/ios/Meeshy/Features/Main/Views/VideoFilterControlView.swift

Purpose: Reusable video-filter slider panel — temperature, brightness, contrast, saturation, exposure + enable toggle + reset.

Public API surface: `VideoFilterControlView: View` — `@Binding config: VideoFilterConfig`.

Key behaviors: Temperature slider works in 0–1 normalized space, mapped to 3000–10000K via a derived `Binding`. `formatValue` shows signed delta from neutral. Reset → `VideoFilterConfig()`; reset enabled only when `config != default`.

Dependencies: `VideoFilterConfig` (SDK model), `MeeshyColors`.

Android-port note: `VideoFilterConfig` lives in SDK — port to shared module. Sliders → `Slider`; the temperature normalized-binding maps to a derived `MutableState` transform. Stateless, `@Binding` → hoisted state.

## apps/ios/Meeshy/Features/Main/Views/VideoFiltersPanel.swift

Purpose: Full video-filters panel for calls — preset chips, the slider control view, advanced toggles (background blur radius, skin smoothing intensity), performance-degradation indicator.

Public API surface: `VideoFiltersPanel: View` — `@ObservedObject callManager = CallManager.shared`; `@State filterConfig`, `activePreset: VideoFilterPreset?`.

Key behaviors: Presets (`natural/warm/cool/vivid/muted`) — selecting a preset applies its config but preserves background-blur + skin-smoothing settings. `filterConfig` synced bidirectionally with `callManager.videoFilters.config` (onAppear load + onChange write). `isAutoDegraded` shows a warning capsule when the system auto-disables filters for performance.

Dependencies: `CallManager.shared`, `VideoFilterConfig`/`VideoFilterPreset`, `VideoFilterControlView`.

Android-port note: Preset chips → `LazyRow`. Filter pipeline (color matrix, background blur via segmentation, skin smoothing) is heavy GPU work — on Android use a `GLSurfaceView`/`Surface` shader or ML Kit selfie segmentation; the auto-degrade fallback is important to preserve. Two-way sync with a call manager → shared `StateFlow`.

## apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift

Purpose: Voice-profile management screen — status, info, cloning toggle, sample list (add/delete), GDPR-compliant profile deletion.

Public API surface:
- `VoiceProfileManageView: View` — prop `accentColor`; owns `VoiceProfileManageViewModel`. Sheets: add-samples (`VoiceRecordingView`), wizard (`VoiceProfileWizardView`).
- Uses `VoiceProfile`, `VoiceSample`, `VoiceProfileStatus` enum (`pending/processing/ready/failed/expired`).

Key behaviors: Status-driven icon/color/label/description. Cloning toggle → `viewModel.toggleCloning`. Add samples → `VoiceRecordingView(minimumSamples:1, minimumDurationSeconds:10)` → `uploadAdditionalSamples`. Delete profile → confirmation alert citing GDPR; irreversible.

Dependencies: `VoiceProfileManageViewModel`, `VoiceProfile`/`VoiceSample`/`VoiceProfileStatus`, `VoiceRecordingView`.

Android-port note: Status enum → sealed class / enum. Sample list → `LazyColumn`. Recording → `MediaRecorder` + permission. Confirmation → `AlertDialog`. GDPR delete must stay explicit/irreversible-warned.

## apps/ios/Meeshy/Features/Main/Views/VoiceProfileWizardView.swift

Purpose: Voice-profile creation wizard — consent → age verification → recording → processing → complete.

Public API surface:
- `VoiceProfileWizardView: View` — prop `accentColor`; owns `VoiceProfileWizardViewModel`. Uses `VoiceProfileWizardStep` enum (`consent, ageVerification, recording, processing, complete`, `rawValue`-ordered, `CaseIterable`).

Key behaviors: Step indicator = capsules filled up to current step's rawValue. Consent step lists 4 GDPR/usage info rows + `grantConsent()`. Age verification = wheel `DatePicker` for birth date → `confirmAgeVerification()` (required for minors / voice cloning). Recording = `VoiceRecordingView(minimumSamples:3, minimumDurationSeconds:10)` → `uploadSamples`. Processing shows `uploadedCount/totalToUpload` progress. Complete shows resulting profile stats.

Dependencies: `VoiceProfileWizardViewModel`, `VoiceProfileWizardStep`, `VoiceProfile`, `VoiceRecordingView`, `MeeshyColors`.

Android-port note: Multi-step wizard → single VM with a step `StateFlow` and a `when` over composable screens, or a nav graph. Date picker → Material `DatePicker`. Recording permission + `MediaRecorder`. The consent/age-gate flow is compliance-critical — preserve exactly.

---

## Architecture observations

State management:
- ViewModels are `@MainActor ObservableObject` with `@Published`; views own them via `@StateObject`, receive via `@ObservedObject`. Singletons (`AuthManager`, `CacheCoordinator`, `CallManager`, `SocialSocketManager`, `ThemeManager`, `PlaybackCoordinator`, `StoryMediaCoordinator`) accessed as shared instances.
- `StoryViewerView` is a state-heavy outlier (~40 `@State` fields spread across a main file + 3 extension files). The extension-file split is purely a workaround for a Swift type-metadata recursion crash on large opaque `some View` types — NOT a portable architecture decision. Android: collapse into one screen + one `StoryViewerUiState`/ViewModel.

Caching / SWR:
- Consistent SWR via `CacheCoordinator.shared.<store>` with a `.fresh/.stale/.expired/.empty` switch (TrackingLinksViewModel, UserStatsViewModel, story comments). Fresh → return; stale → show + background refresh; expired/empty → spinner only if no data. This is the canonical pattern to replicate with Android Repositories emitting cached-then-network `Flow`s.

Concurrency / performance:
- Story progress timer is the standout: a `CADisplayLink` pause-aware accumulator with a 1/300 diff-guard to cut body re-evaluations ~2.5×, gated on real-content-ready. Port the accumulator + readiness gate.
- `async let` parallelism for independent fetches (stats+timeline, links+stats).
- Leaf-view re-render discipline: `ThemedConversationRow` and `ThemedMessageBubble` are `Equatable` with hand-written `==` comparing only render-affecting inputs (`renderFingerprint`, reaction identity sets, presence) — Compose equivalent is stable/immutable data classes so recomposition is skipped.
- Media: `ProgressiveCachedImage` (thumbHash → thumbnail → full), 3-tier `CacheCoordinator.images`, AVPlayer preroll, adjacent-page prefetch in carousels and a sliding-window story prefetcher.

Navigation: Mixed `NavigationStack` (`NavigationLink`, `@Environment(\.dismiss)`) + `Router` for deep links + sheets/`fullScreenCover` with Identifiable item wrappers. EnvironmentObjects must be manually re-injected onto sheet hierarchies (an iOS pitfall — non-issue with Hilt/CompositionLocal).

Anti-patterns / tech debt to NOT carry over:
- Dual auto-advance timers in the story viewer (legacy display-link is authoritative; gated `StoryReaderTimerController` callbacks are wired-but-no-op). Implement ONE content-gated auto-advance.
- The 4-file `StoryViewerView` split and the `BubbleGridCell`/`fileprivate` struct extraction are Swift-compiler/runtime workarounds — do not replicate the fragmentation in Kotlin.
- `DispatchQueue.main.asyncAfter` used pervasively for animation sequencing — port to coroutine `delay` or animation completion callbacks.
- ToS copy and many UI strings are hardcoded inline (FR-first); move to Android string resources for proper localization.
- Hardcoded hex accent colors scattered across static screens (Support/Tracking) — centralize.

Portable user-facing features / capabilities:
- [ ] Story viewer: tap-advance + swipe (horizontal=group, vertical=dismiss), segmented progress bars, cross-dissolve transitions with per-story opening/closing effects (fade/zoom/slide/reveal)
- [ ] Story content rendering: text styling (bold/italic/handwriting/typewriter/neon/retro), positioning, background, filters (vintage/bw/warm/cool), media overlays
- [ ] Story reactions: emoji quick-strip + full picker, big floating reaction animation, heart-button bounce, reaction count
- [ ] Story comments overlay: live-chat panel, 1-level reply threading, inline composer with effects/blur, per-comment language switcher, optimistic posting + reaction likes
- [ ] Story actions: reply privately (DM with story context), forward/send, reshare-as-story, repost-as-post (direct + edit), author-only MP4 export, mute/unmute, translate (request + language strip), report
- [ ] Story viewers sheet (who-viewed list with reaction/reshare indicators)
- [ ] Story prefetch / sliding-window media preloading; content-gated auto-advance timer
- [ ] Per-viewer story translation via Prisme Linguistique language chain
- [ ] Conversation row: activity-heat background, dynamic tag overflow, rich last-message preview (ephemeral/expired/hidden/view-once/draft/typing), unread badge, presence/story-ring/mood
- [ ] Message bubble: visual media grid (1–4+ collage), inline paging carousel, view-once reveal, blurred media, download/share
- [ ] Message threads: parent + replies + inline composer
- [ ] UTM tracking links: list + aggregate stats, detail analytics (geo/device/browser breakdown, click timeline), QR generation, copy/share/delete, create
- [ ] Two-factor auth: QR enrollment, code verification, backup codes (view + regenerate), disable flow
- [ ] User statistics dashboard: stat cards, activity timeline chart, achievement badges
- [ ] Video call filters: presets, color/exposure sliders, background blur, skin smoothing, performance auto-degrade indicator
- [ ] Voice profile: creation wizard (consent → age verification → recording → processing → complete), management (status, cloning toggle, sample add/delete), GDPR deletion
- [ ] Static screens: Help & Support (links, contact, report, app info), Terms of Service (FR/EN)
