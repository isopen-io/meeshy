# iOS Audit — Part 07

Scope: 39 files under `apps/ios/Meeshy/Features/Main/Views/` — audio fullscreen/composer,
the decomposed message Bubble component family, calls UI, UIKit collection-view cells
(an alternate hot-list rendering path), comment threads, community links, and the
animated conversation background. This part is the single source of truth for porting
these UI capabilities to a native Android (Kotlin / Jetpack Compose) rebuild.

---

## apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift

- Purpose: Full-screen, swipeable audio "reels" viewer. Horizontal paging across all audio
  attachments in a conversation; per-page playback, waveform, transcription, language switch, save/share.
- Public API surface:
  - `struct AudioFullscreenView: View` — inputs `allAudioItems: [ConversationViewModel.AudioItem]`,
    `startAttachmentId`, `contactColor`, `mentionDisplayNames`, `onDismissToMessage: ((String)->Void)?`.
  - `private struct AudioFullscreenPage: View` — single audio item; owns `AudioPlaybackManager`
    and `AudioWaveformAnalyzer` as `@StateObject`; `SaveState` enum (`idle/saving/saved/failed`).
- Key behaviors / algorithms:
  - Horizontal `ScrollView` + `LazyHStack` + `.scrollTargetBehavior(.paging)` + `.scrollPosition(id:)`;
    `containerRelativeFrame` for full-bleed pages. Vertical drag-down dismiss (>120pt or predicted >300pt),
    drag offset damped at 0.6. On dismiss returns to source message via `onDismissToMessage`.
  - Active-page detection: only `isActive` page plays; others `player.stop()`. Haptic on page change.
  - Waveform: `AudioWaveformAnalyzer` over downloaded audio bytes (from `CacheCoordinator.shared.audio`);
    deterministic fallback bars via `sin/cos` seed when no samples. Scrollable waveform with playhead bar.
  - Speeds: `[1.0,1.25,1.5,1.75,2.0]`. Seek bar with thumb + drag. Skip ±10s.
  - Transcription panel: displays `TranscriptionDisplaySegment` with karaoke-style current-time seek;
    "Transcrire" CTA calls `AttachmentService.shared.requestTranscription` (3s wait then refresh).
  - Language strip (Prisme): pills for original + each `MessageTranslatedAudio`; tap switches audio URL;
    `+translate` opens language picker sheet listing 41 codes (available ones sorted first).
  - Save: downloads file to temp, presents `UIActivityViewController` via window-scene traversal.
- Dependencies: `AudioPlaybackManager`, `AudioWaveformAnalyzer`, `MediaTranscriptionView`,
  `MessageTextRenderer`, `LanguageDisplay`, `MeeshyConfig.resolveMediaURL`, `CacheCoordinator`,
  `AttachmentService`, `StatusViewModel`, `UserProfileSheet`, `HapticFeedback`.
- Android port note: Compose `HorizontalPager` (Accompanist/Foundation) with snap. Use ExoPlayer
  for audio (one player, release inactive pages). Waveform = custom `Canvas`. Save = `MediaStore` +
  Android share sheet (`Intent.ACTION_SEND`). `containerRelativeFrame` → `fillMaxSize()` page.
  Window-scene traversal logic is iOS-specific; replace with `Activity` context.

## apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift

- Purpose: Record an audio post with on-device transcription, language selection, preview, then publish.
- Public API surface:
  - `struct AudioPostComposerView: View` — `onPublish: (URL, String, MobileTranscriptionPayload?) -> Void`.
    Private `ComposerPhase` enum (`idle/recording/transcribing/preview`).
  - `private struct WaveformView` — live mic-level bars.
  - `struct AudioLanguagePickerView: View` — searchable locale picker, `@Binding selectedLocale: Locale`,
    toggle "show all languages" (device-available vs full supported set).
- Key behaviors:
  - `AudioRecorderManager` `@StateObject` provides `isRecording`, `duration`, `audioLevels`.
  - On stop → `EdgeTranscriptionService.shared.transcribe(audioURL:locale:)` (WhisperKit, on-device).
  - Locale resolution: user `systemLanguage`/`regionalLanguage` + keyboard primary lang +
    `["fr","en"]` fallback, normalized via `EdgeTranscriptionService.normalizedLocale`.
  - Builds `MobileTranscriptionPayload` (text, language, confidence, `MobileTranscriptionSegment[]`)
    from on-device segments; published with mime `audio/mp4`.
  - Cancel cleans up temp file + cancels transcription. Error panel with retry.
- Dependencies: `AudioRecorderManager`, `EdgeTranscriptionService` (WhisperKit), `ThemeManager`,
  `MeeshyColors`, `AuthManager.currentUser`, `MobileTranscriptionPayload/Segment` (SDK).
- Android port note: `MediaRecorder`/`AudioRecord` for capture; on-device STT via Android
  `SpeechRecognizer` or a bundled Whisper (whisper.cpp / TFLite). Locale picker = Compose
  searchable list. Keep the `systemLanguage`/`regionalLanguage` resolution order (Prisme rule:
  never use device UI locale for content language).

## apps/ios/Meeshy/Features/Main/Views/BlockedUsersView.swift

- Purpose: List of blocked users with unblock (swipe action + button + confirm alert).
- Public API surface: `struct BlockedUsersView: View`; uses `[BlockedUser]` model.
- Key behaviors: Cold-cache skeleton (`shimmer()` rows), empty state, pull-to-refresh.
  `BlockService.shared.listBlockedUsers()` / `unblockUser(userId:)`. Optimistic removal on
  unblock success with spring animation. Toasts via `ToastManager`. `os.Logger`.
- Dependencies: `BlockService`, `ThemeManager`, `MeeshyAvatar`, `EmptyStateView`,
  `DynamicColorGenerator.colorForName`, `ToastManager`, `HapticFeedback`.
- Android port note: `LazyColumn` + `SwipeToDismiss`; Material `AlertDialog`; shimmer via
  Compose placeholder. ViewModel calls a `BlockRepository`. Note: this screen does NOT use
  the cache-first ViewModel pattern — direct service call (minor tech debt vs Instant App spec).

## apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift

- Purpose: Saved/bookmarked feed posts list with infinite scroll.
- Public API surface: `struct BookmarksView: View`; owns `BookmarksViewModel` (`posts`,
  `isLoading`, `hasMore`, `loadBookmarks()`, `refresh()`, `removeBookmark(_:)`).
- Key behaviors: `LazyVStack` of `FeedPostCard` (`.equatable()`); sentinel `Color.clear` onAppear
  triggers next page; post tap routes to `.postDetail`; report via `ReportService`.
- Dependencies: `BookmarksViewModel`, `FeedPostCard`, `Router`, `ThemeManager`,
  `ReportService`, `ToastManager`.
- Android port note: `LazyColumn` + paging (Paging 3). Reuse a shared `FeedPostCard` composable.
  `Router.push(.postDetail)` → Navigation Compose route.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift

- Purpose: Renders a single in-bubble attachment, dispatching by type.
- Public API surface: `struct BubbleAttachmentView: View` — `attachment`, `isMe`, `isDark`,
  `accentHex`, optional `transcription`, `translatedAudios`, `onShareFile`, `onTapLocation`.
- Key behaviors: `switch attachment.type` → `ImageViewerView` / `VideoPlayerView` /
  `AudioPlayerView` / (`CodeViewerView` if `CodeLanguage.detect` else `DocumentViewerView`) /
  `LocationMessageView` (fallback placeholder when lat/lon missing). Not Equatable (SDK model
  isn't Equatable; not a list-critical cell).
- Dependencies: SDK `MessageAttachment`, `CodeLanguage`, viewer components.
- Android port note: A `when(attachment.type)` Composable dispatcher. Code/document
  detection by mime/extension. Location → Maps SDK static/interactive map.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleBackground.swift

- Purpose: Rounded-rect bubble fill + stroke. Stateless, `Equatable`.
- Public API surface: `struct BubbleBackground: View, Equatable` — `isMe`, `accentHex`, `isDark`.
- Key behaviors: `isMe` → brand indigo gradient (no stroke); else accent-tinted translucent
  gradient + accent stroke. Opacity varies with `isDark`.
- Android port note: Trivial — `Box` with `RoundedCornerShape(18.dp)` + `Brush.linearGradient`,
  `border` for received. Wrap in `@Stable`/`derivedStateOf` for skip optimization.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleBlurRevealLifecycle.swift

- Purpose: Pure lifecycle + controller for blurred / view-once message reveal.
- Public API surface:
  - `enum BubbleBlurRevealLifecycle` — `Phase` (`fogIn/blurApply/fogOut` w/ durations),
    `defaultRevealDuration = 5s`, `struct RevealRequest { messageId, isViewOnce, requiresConsume }`.
  - `@MainActor final class BubbleBlurRevealController: ObservableObject` — `isRevealed`,
    `fogOpacity`; `setVisibilityDuration`, `requestReveal(request:consumeViewOnce:)`, `cancel()`.
- Key behaviors: For view-once messages, calls `consumeViewOnce` first; reveal proceeds only on
  server-confirmed success. Reveal animation sequence: visible → fog-in (0.4s) → re-blur (0.4s)
  → fog-out (0.5s), driven by a cancellable `Task` with `Task.sleep`.
- Android port note: Plain Kotlin state holder (ViewModel-scoped or remembered); coroutine for
  the sequenced animation; `Modifier.blur()` + animated fog overlay. View-once consume = repo call.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallbacks.swift

- Purpose: Value struct bundling 13 optional bubble closures (deliberately NOT Equatable).
- Public API surface: `struct BubbleCallbacks` — `onViewStory`, `onAddReaction`, `onToggleReaction`,
  `onOpenReactPicker`, `onShowInfo`, `onShowReactions`, `onReplyTap`, `onStoryReplyTap`,
  `onMediaTap`, `onConsumeViewOnce`, `onRequestTranslation`, `onShowTranslationDetail`,
  `onScrollToMessage`; `static let empty`.
- Android port note: Kotlin `data class BubbleCallbacks` of nullable lambdas, or a single
  `(BubbleEvent) -> Unit` sealed-event sink (cleaner for Compose recomposition skipping —
  pass a stable lambda reference).

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContent.swift

- Purpose: Immutable value model describing exactly what one message bubble should render.
  Central to the "zero unnecessary re-render" decomposition.
- Public API surface: `struct BubbleContent: Equatable` with nested `Kind`
  (`standard/deleted/burned/ephemeralExpired`), `Attachments` (`none/visualGrid/audio/nonMedia/
  mixed`), `Text` (raw, isEmojiOnly, emojiFontSize), `Translation` (preferred/active/original
  lang, availableFlags, secondary lang+content), `Reply`, `Ephemeral`, `Meta` (timeString,
  deliveryStatus). Top-level fields: messageId, kind, text, translation, reply, attachments,
  ephemeral, isBlurred, isViewOnce, isPinned, isForwarded, editedAt, isEditSaving,
  hasEditHistory, reactions, meta, isMe, senderName. Computed `isEmojiOnly`,
  `hasTextOrNonMediaContent`.
- Key behaviors: Custom `Equatable` compares only render-affecting fields; reactions compared by
  emoji/count/includesMe slices. `hasTextOrNonMediaContent` suppresses the text bubble for
  audio-only-with-transcription messages. TODO(Task14) notes: attachment/reply equality is
  id-only and may miss late server thumbnail/counter updates — known limitation.
- Android port note: Kotlin `data class` (auto `equals`). Sealed classes for `Kind`/`Attachments`.
  This is the cleanest, most directly portable design in the chunk — keep it verbatim as the
  bubble render model. Equatable-by-render-slice → Compose `@Stable` data class.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift

- Purpose: `BubbleContent` factory + pure testable helpers; centralizes all translation/emoji/
  reaction resolution previously inline in the god-view.
- Public API surface: `extension BubbleContent` — `init(message:translations:preferredTranslation:
  translatedAudios:userLanguages:secondaryLangCode:activeDisplayLangCode:currentUserId:
  timeString:isEditSaving:hasEditHistory:)`; static `resolveEffectiveContent`,
  `buildAvailableFlags`, `summarizeReactions`.
- Key behaviors:
  - Kind: deleted > view-once-burned (`isViewOnce && viewOnceCount>0`) > standard.
  - `resolveEffectiveContent`: active==original → original; else matching translation; else
    preferredTranslation match; else `preferredTranslation?.translatedContent ?? content`.
    **Known divergence (TODO prisme):** last-resort fallback to preferredTranslation violates
    Prisme rule #1 (should return original) — kept for legacy visual fidelity, flagged for audit.
  - Emoji-only detection runs on ORIGINAL `message.content` (not translated), gated to
    no-attachment / no-reply messages via `EmojiDetector.analyze`.
  - `buildAvailableFlags`: original + preferred + regional + custom (deduped, only if has
    translation), excluding the active lang.
  - `summarizeReactions`: first-seen-stable-order emoji aggregation with includesMe.
  - Attachment categorization → single-category enum cases or `.mixed`.
- Android port note: Kotlin factory function / mapper in the data layer. Helpers are pure → unit
  testable. **Carry the prisme TODO into the Android backlog and fix it correctly** (return
  original when no preferred-language translation matches).

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleEphemeralLifecycle.swift

- Purpose: Pure lifecycle + controller for ephemeral (self-destruct) message countdowns.
- Public API surface: `enum BubbleEphemeralLifecycle` — `State` (`running(remaining)/expired/
  none`) with `evaluate(expiresAt:now:)`; `format(remaining:)` → "7s"/"1m 05s"/"2h 03m".
  `@MainActor final class BubbleEphemeralController: ObservableObject` — `state`; `start(expiresAt:)`,
  `stop()`.
- Key behaviors: `Timer.publish(every:1)` ticks; transitions to `.expired` and self-cancels.
- Android port note: Kotlin coroutine `flow { while … delay(1000) }` or `tickerFlow`; remembered
  state holder. Pure `evaluate`/`format` are directly portable + unit-testable.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift

- Purpose: Bubble text with "show more / show less" truncation, locally stateful, `Equatable`.
- Public API surface: `struct BubbleExpandableText: View, Equatable` — `content`, `isMe`,
  `mentionDisplayNames`, `highlightTerm`, `mentionTint`, `linkTint`, `onLongPress`;
  nested testable `State { content, isExpanded; needsTruncation(limit:) }`;
  `truncateLimit = 512`; static `truncateAtWord`.
- Key behaviors: Truncates at last word boundary within 512 chars, chevron toggles expansion;
  rich rendering via `MessageTextRenderer` (mentions, links, highlight term).
- Android port note: Compose `Text` with `maxLines` + `TextOverflow`; `truncateAtWord` is pure
  Kotlin. Rich rendering via `AnnotatedString` (mentions, URL links, search highlight spans).

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleLanguageFlagController.swift

- Purpose: Pure decision logic for tapping a language flag on a bubble.
- Public API surface: `enum BubbleLanguageFlagController` — `Context`, `Action`
  (`switchPrimary/openSecondary/closeSecondary/requestTranslation(targetLang:)`), `Outcome`;
  static `handleTap(code:current:messageOriginalLang:translations:) -> Outcome`.
- Key behaviors: No translation for code → request translation. Original lang → switch primary
  display, clear secondary. Other lang → toggle inline secondary panel.
- Android port note: Pure Kotlin function returning a sealed `Action`. Directly portable +
  unit-testable; UI applies the outcome with its own animation.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleMetaBadges.swift

- Purpose: Collection of small stateless `Equatable` badge sub-views overlaid on bubbles.
- Public API surface: `BubbleEditedIndicator` (saving spinner vs pencil + history dot),
  `BubbleMediaTimestampOverlay` (dark capsule time + delivery on media grids),
  `BubbleMediaDeliveryCheckmark` (per-`DeliveryStatus` glyph: sending/invisible/clock/slow/sent/
  delivered/read/failed), `BubblePinnedIndicator`, `BubbleForwardedIndicator` (with optional
  sender/conversation name), `BubbleDeliveryBadge` (offline hourglass / failed retry button),
  `BubbleEphemeralBadge` (flame + countdown capsule).
- Key behaviors: `DeliveryStatus` state machine has 8 states incl. debounced `.invisible`
  (no glyph) and `.slow`. `BubbleDeliveryBadge` only renders for `isMe` + `.failed` or
  `.sending`+offline; retry calls `onRetry`.
- Android port note: Small `@Composable` functions, each `@Stable`. Map the 8-state delivery
  enum exactly. Repeating rotation animation for the saving glyph.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift

- Purpose: Quoted-reply preview inside a bubble; delegates to story-reply variant.
- Public API surface: `struct BubbleQuotedReply: View, Equatable` (manual `Equatable` via
  `ReplySlice` projection of `ReplyReference`); `struct BubbleStoryReplyPreview: View, Equatable`
  (`PreviewSlice`); static `replyAttachmentIcon(_:)`.
- Key behaviors: Left accent bar (author/accent color), author name ("Vous" for self),
  attachment icon + preview text or story preview (camera glyph, "Story", relative date,
  reaction/comment counts), thumbnail via `CachedAsyncImage`. SDK `ReplyReference` is not
  Equatable → projected to a private slice struct for memoization.
- Android port note: Composable; project `ReplyReference` to a stable Kotlin data class for
  recomposition skipping. `CachedAsyncImage` → Coil `AsyncImage`.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleReactionsOverlay.swift

- Purpose: Reaction pill strip under a bubble, with comet-landing entry animation.
- Public API surface: `struct BubbleReactionsOverlay: View, Equatable` — `messageId`,
  `summaries: [ReactionSummary]`, `isMe`, `isDark`, `isLastReceivedMessage`, `accentHex`,
  callbacks (excluded from Equatable); `maxVisible = 4`.
  `private struct CometPillModifier: ViewModifier` — entry animation.
- Key behaviors: Sent → trailing pills + overflow `+N`; received → add-reaction smiley (only on
  last received) / overflow + pills. `includesMe` pills heavily emphasized (saturated fill,
  2.5pt stroke, shadow). `@State seenEmojis` tracks already-seen emojis so only newly-arrived
  reactions play the comet animation (zoom 2.6x → spring impact → 3-oscillation wobble + haptic).
  44pt min hit target on the smiley despite a 24pt visible chip.
- Android port note: `Row` of pill `Composable`s; comet animation via `Animatable` /
  `animateFloatAsState` keyframes + `Modifier.graphicsLayer`. Track seen-emoji set in
  `remember`. Haptics via `HapticFeedback`. Keep the `includesMe` visual emphasis.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSecondaryContent.swift

- Purpose: Inline secondary-translation panel under a bubble (Prisme exploration).
- Public API surface: `struct BubbleSecondaryContent: View, Equatable` — `content`, `langCode`,
  `isMe`, `textPrimary`, `mentionDisplayNames`, `mentionTint`, `linkTint`.
- Key behaviors: Language-colored divider (line-dot-line), flag + language name header,
  pastel language-tinted background, rich-rendered translated text. `transition` opacity+move.
- Android port note: `Column` with `AnimatedVisibility`; language color from a `LanguageDisplay`
  map. Pure leaf composable — stable inputs only.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift

- Purpose: Orchestrator for the `.standard` bubble kind — the largest, most important file in
  the chunk. Structurally identical port of legacy `ThemedMessageBubble.messageContent`.
- Public API surface: `struct BubbleStandardLayout: View` — ~40 inputs: `content: BubbleContent`,
  raw `message`, visual context (`contactColor`, `isDirect`, `isDark`, presence/mood/story-ring),
  `transcription`, `translatedAudios`, `textTranslations`, `preferredTranslation`,
  `allAudioItems`, position flags (`isLastInGroup/isLastReceivedMessage/isLastSentMessage`),
  12 callbacks, 10 `@Binding`s (display state owned by wrapper), 2 `@ObservedObject` controllers
  (`blurController`, `ephemeralController`).
- Key behaviors / business logic:
  - Branches on `content.attachments`/`text`/`reply`/`translation`/`reactions` so a simple
    "Salut" instantiates only text + meta-row (no reply/attachment/translation sub-views).
  - Bubble width capped at 70% screen; sent right / received left; `Spacer(minLength: 50)`.
  - Content stack: visual grid OR inline carousel (`showCarousel`), standalone audio bubbles,
    then emoji-only OR text bubble OR (audio-only) bare identity bar.
  - `bottomSpacing` depends on `isLastInGroup` + `hasReactions`.
  - Blur/view-once: `shouldBlur` masks content with `blur(20)` + masked rounded rect; fog
    overlay (radial gradient + offset circles); tap-to-reveal via `blurController`.
  - Reactions overlay anchored to bottom corner, offset `y:8`, padding `-4` ("sticker on corner").
  - Identity bar: `UserIdentityBar.messageBubble` (received last-in-group, non-direct) vs
    `.metaRow`; carries time/delivery/translation flags + translate button.
  - Time visibility: groups show on every bubble; direct only on last sent + last received.
    Delivery checkmarks shown on every outgoing message.
  - `BubbleDeliveryBadge` (offline hourglass / failed retry) gated on `NetworkMonitor.shared.isOnline`
    (read as computed property to avoid subscribing to its `@Published`); retry resolves outbox
    row by `clientMessageId` via `OfflineQueue.shared.retryByClientMessageId`.
  - Inline OpenGraph preview for first URL (`LinkPreviewFetcher.firstURL` → `LinkPreviewCard`).
  - Fullscreen presentation: `onMediaTap` delegates to parent, else local `fullScreenCover`
    (image/video); location fullscreen via separate cover. Share sheet for files.
  - Flag tap delegates to `BubbleLanguageFlagController.handleTap`, then applies outcome with
    spring animation.
  - Builds a composite VoiceOver `accessibilityLabel` (sender, text, media counts, time,
    delivery, edited/pinned/ephemeral, reactions).
- Dependencies: every `Bubble*` sub-view, `UserIdentityBar`, `AudioMediaView`, `LinkPreviewCard`,
  `ImageFullscreen`, `VideoFullscreenPlayerView`, `LocationFullscreenView`, `ShareSheet`,
  `NetworkMonitor`, `OfflineQueue`, `MeeshyConfig`, `DynamicColorGenerator`.
- Android port note: Compose `Row`/`Column` orchestrator; pass `BubbleContent` + a stable
  callback sink. Use `Modifier.blur` (API 31+; fallback RenderScript/overlay) for blur reveal.
  Carousel = `HorizontalPager`. Bindings → hoisted state in the message-list ViewModel. The
  conditional-instantiation design (skip absent sub-views) maps to Compose naturally — keep it.
  Offline retry → WorkManager-backed outbox lookup by `clientMessageId`.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStyle.swift

- Purpose: Value struct of derived visual context passed `let` to bubble sub-views (no singleton
  observation — "zero unnecessary re-render").
- Public API surface: `struct BubbleStyle: Equatable` — `isDark`, `accentColorHex`,
  `isLastInGroup`, `isLastReceivedMessage`, `showAvatar`, `isDirect`, `presenceState`,
  `senderMoodEmoji`, `senderStoryRingState`, `highlightSearchTerm`, `mentionDisplayNames`,
  nested `UserLanguages { regional, custom }`.
- Android port note: Kotlin `data class`, `@Stable`. Pass primitives, not singletons.

## apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleSystemViews.swift

- Purpose: "System" replacement bubbles when content is unavailable.
- Public API surface: `struct BubbleDeletedView: View, Equatable` ("Message supprime", nosign
  glyph); `struct BubbleBurnedView: View, Equatable` ("Vu et efface", flame glyph) — both
  stateless, `isMe`/`isDark` only.
- Android port note: Trivial capsule composables.

## apps/ios/Meeshy/Features/Main/Views/CallEffectsOverlay.swift

- Purpose: Bottom-sheet overlay during a call for audio effects / video filters.
- Public API surface: `enum EffectsPanelType { audioEffects, videoFilters }`;
  `struct CallEffectsOverlay: View` — `@Binding isExpanded`, `isVideoEnabled`,
  `@ObservedObject CallManager.shared`.
- Key behaviors: Backdrop tap to dismiss; scrollable `AudioEffectsPanel`/`VideoFiltersPanel`;
  secondary toolbar with active-state indicators reading `callManager.activeAudioEffect` /
  `videoFilters.config.isEnabled`. Spring animations.
- Dependencies: `CallManager`, `AudioEffectsPanel`, `VideoFiltersPanel`, `MeeshyColors`.
- Android port note: Compose `ModalBottomSheet`; observe a `CallViewModel` state. Audio
  effects/video filters need WebRTC-side processing — Android-equivalent filter pipeline.

## apps/ios/Meeshy/Features/Main/Views/CallView.swift

- Purpose: Full-screen 1:1 call UI (audio + video) covering all call states.
- Public API surface: `struct CallView: View` — `@ObservedObject CallManager.shared`,
  `@StateObject CallTranscriptionService`. `private extension Logger { calls }`.
- Key behaviors:
  - State switch on `callManager.callState`: `ringing(isOutgoing)`, `offering` (shown as
    outgoing ringing — peer hasn't accepted yet), `connecting`, `connected`, `ended(reason)`,
    `reconnecting`, `idle`. Incoming → `IncomingCallView`.
  - Video: local camera as background (`CallVideoView`), remote full-area, draggable local
    preview (100x140, snaps to edges, tap = switch camera). Audio: gradient bg + ambient orbs,
    pulsing avatar.
  - Control bar (horizontal scroll): mute, speaker, effects (+ toggle), camera flip, video
    toggle, end call. Connection-quality dot (P2-iOS-10) maps WebRTC ICE states to color.
  - Live transcript overlay from `CallTranscriptionService.displayedSegments` (per-speaker dot,
    final vs partial opacity); `isShowingOverlay` flag lets the service skip partial work when hidden.
  - Minimize-to-PiP: top-leading chevron + drag-down (video) → `callManager.displayMode = .pip`.
  - Respects `accessibilityReduceMotion` (skip infinite pulse). Localized end-reason strings.
  - Audit notes embedded: P1-18 avoids deprecated `UIScreen.main` (uses key-window bounds),
    P2-iOS-7 dynamic VoiceOver labels.
- Dependencies: `CallManager`, `CallTranscriptionService`, `CallVideoView`, `IncomingCallView`,
  `CallEffectsOverlay`, `CallEndReason`, `ThemeManager`, `AuthManager`.
- Android port note: WebRTC (`org.webrtc`) for tracks; `SurfaceViewRenderer` for video; PiP via
  Android `PictureInPictureParams`. Call state machine → `CallViewModel` sealed state. CallKit
  has no Android equivalent — use `ConnectionService`/`Telecom` + foreground service.
  Reduce-motion → check `Settings.Global.ANIMATOR_DURATION_SCALE`.

## apps/ios/Meeshy/Features/Main/Views/CallWaitingBannerView.swift

- Purpose: Top banner for a second incoming call while already in a call ("end and answer" / reject).
- Public API surface: `struct CallWaitingBannerView: View` — `callerName`, `autoDismissSeconds`
  (default 15), `@Binding isVisible`, `onReject`, `onEndAndAnswer`.
- Key behaviors: Parent-driven visibility (audit P2-iOS-11 refactor away from `show()`-returns-view
  anti-pattern). Auto-dismiss `Task` cancelled on disappear / manual action. Top move+opacity transition.
- Android port note: Compose banner with `AnimatedVisibility`; auto-dismiss via `LaunchedEffect`
  + `delay`. Hoist `isVisible` to the call ViewModel.

## apps/ios/Meeshy/Features/Main/Views/Cells/AudioBubbleCell.swift

- Purpose: **UIKit** `UICollectionViewCell` for an audio message — part of an alternate
  UIKit-collection-view conversation rendering path (NOT the SwiftUI bubble path).
- Public API surface: `final class AudioBubbleCell: UICollectionViewCell` —
  `configure(with: MessageRecord, isMe:)`.
- Key behaviors: Play button + waveform placeholder + duration + `DeliveryIndicatorView`;
  outgoing/incoming bg colors from asset catalog; `prepareForReuse` clears record.
- Dependencies: `MessageRecord` (SDK local DB record), `DeliveryIndicatorView`.
- Android port note: Maps to a `RecyclerView` ViewHolder OR a Compose `LazyColumn` item. NOTE:
  the app has two parallel conversation renderers (SwiftUI `Bubble*` and this UIKit `*Cell`
  family) — confirm which is live before porting; the UIKit cells use `MessageRecord`/`PostRecord`/
  `CommentRecord` local-DB models and `cachedBubbleHeight` for fast-scroll layout caching.

## apps/ios/Meeshy/Features/Main/Views/Cells/DeliveryIndicatorView.swift

- Purpose: **UIKit** `UIView` — timestamp + delivery-state icon (used inside the UIKit cells).
- Public API surface: `final class DeliveryIndicatorView: UIView` —
  `configure(state: MessageState, timestamp:, isFromCurrentUser:)`.
- Key behaviors: `MessageState` enum (`sending/queued/draft/sent/delivered/read/failed`) → SF
  Symbol + tint; cross-dissolve transition on icon change; icon hidden for received messages.
- Android port note: Composable / View showing time + state icon; `MessageState` enum mapping.
  Note this is a 5-ish-state model distinct from the SwiftUI side's 8-state `DeliveryStatus` —
  the Android model should unify these.

## apps/ios/Meeshy/Features/Main/Views/Cells/LoadMoreRepliesCell.swift

- Purpose: **UIKit** cell — "View N more replies" affordance in a comment thread.
- Public API surface: `final class LoadMoreRepliesCell: UICollectionViewCell` —
  `configure(parentId:remaining:)`; indented 56+40pt.
- Android port note: A `LazyColumn` "load more" item composable; tap → expand thread.

## apps/ios/Meeshy/Features/Main/Views/Cells/MediaBubbleCell.swift

- Purpose: **UIKit** cell for an image/video message bubble.
- Public API surface: `final class MediaBubbleCell: UICollectionViewCell` —
  `configure(with: MessageRecord, isMe:, imageCache: DecodedImageCache)`.
- Key behaviors: Reads decoded image from `DecodedImageCache` (sync) else async
  `ThumbnailPrefetcher.shared.get(key:)`; `preferredLayoutAttributesFitting` uses
  `record.cachedBubbleHeight` to avoid layout passes during fast scroll; cancellable load task;
  duration label for video.
- Android port note: Coil with a memory `BitmapPool`; precomputed item heights for smooth
  scrolling (or rely on `LazyColumn` measurement). `ThumbnailPrefetcher` → Coil prefetch.

## apps/ios/Meeshy/Features/Main/Views/Cells/MediaPostCell.swift

- Purpose: **UIKit** cell for a feed post with media (author, content, image, like/comment).
- Public API surface: `final class MediaPostCell: UICollectionViewCell` —
  `configure(with: PostRecord)`.
- Key behaviors: `UIStackView` layout; like button heart fill/tint by `isLikedByMe`.
- Android port note: Compose feed-post card item.

## apps/ios/Meeshy/Features/Main/Views/Cells/ReplyCell.swift

- Purpose: **UIKit** cell for a nested comment reply.
- Public API surface: `final class ReplyCell: UICollectionViewCell` —
  `configure(with: CommentRecord, depth:)`; `baseIndent=16`, `indentPerDepth=40`.
- Key behaviors: Leading-constraint indentation per depth; `RelativeDateTimeFormatter` timestamp.
- Android port note: `LazyColumn` item with `padding(start = baseIndent + depth*indentPerDepth)`.

## apps/ios/Meeshy/Features/Main/Views/Cells/SystemMessageCell.swift

- Purpose: **UIKit** cell for centered system messages in a conversation.
- Public API surface: `final class SystemMessageCell` — `configure(with: MessageRecord)`.
- Android port note: Centered caption composable.

## apps/ios/Meeshy/Features/Main/Views/Cells/TextBubbleCell.swift

- Purpose: **UIKit** cell for a text message bubble (incoming/outgoing alignment).
- Public API surface: `final class TextBubbleCell: UICollectionViewCell` —
  `configure(with: MessageRecord, isMe:)`; private `UIColor(hex:)` convenience init.
- Key behaviors: Toggles leading/trailing constraints for side alignment; max width 78%; sender
  label hidden for self (collapses gap via empty attributed string); `cachedBubbleHeight` for
  fast-scroll layout caching.
- Android port note: Compose message row; sender label hidden for self; max-width fraction.

## apps/ios/Meeshy/Features/Main/Views/Cells/TextPostCell.swift

- Purpose: **UIKit** cell for a text-only feed post (author, content, stats: like/comment/repost).
- Public API surface: `final class TextPostCell` — `configure(with: PostRecord)`.
- Key behaviors: Vertical stack; relative timestamp; like/comment/repost buttons; bottom separator.
- Android port note: Compose feed-post card; reuse with `MediaPostCell` variant.

## apps/ios/Meeshy/Features/Main/Views/Cells/TopLevelCommentCell.swift

- Purpose: **UIKit** cell for a top-level comment (avatar, name, content, like/reply).
- Public API surface: `final class TopLevelCommentCell` — `configure(with: CommentRecord)`.
- Android port note: Compose comment item.

## apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift

- Purpose: Change-password form (current, new, confirm) with validation + strength meter.
- Public API surface: `struct ChangePasswordView: View`; private `Field` focus enum.
- Key behaviors: Validation — current non-empty, new ≥8 chars, new==confirm;
  `PasswordStrengthIndicator`; live validation hints; `AuthService.shared.changePassword`;
  maps `APIError.serverError(400,_)` → "Mot de passe actuel incorrect"; success overlay then
  auto-dismiss after 1.5s.
- Dependencies: `AuthService`, `PasswordStrengthIndicator`, `ThemeManager`, `APIError`,
  `MeeshyError`.
- Android port note: Compose form, `OutlinedTextField` (`PasswordVisualTransformation`),
  `FocusRequester`. ViewModel calls `AuthRepository.changePassword`. Map server-error codes.

## apps/ios/Meeshy/Features/Main/Views/CommentListView.swift

- Purpose: SwiftUI bridge wrapping the UIKit comment list controller.
- Public API surface: `struct CommentListView: UIViewControllerRepresentable` —
  `store: CommentStore`; `makeUIViewController` / no-op `updateUIViewController`.
- Android port note: Drop the bridge — render comments directly with `LazyColumn`.

## apps/ios/Meeshy/Features/Main/Views/CommentListViewController.swift

- Purpose: **UIKit** comment thread list — `UICollectionViewCompositionalLayout` +
  `UICollectionViewDiffableDataSource`, threaded comments with expandable replies.
- Public API surface: `final class CommentListViewController: UIViewController` —
  `init(store: CommentStore)`, `onToggleThread: ((String)->Void)?`, `applySnapshot(animated:)`.
- Key behaviors: Self-sizing items (`estimated(80)`); 3 cell registrations
  (`TopLevelCommentCell`, `ReplyCell` depth 1, `LoadMoreRepliesCell`); section per top-level
  comment; appends visible replies + a "load more" item when `replyCount > loaded` and thread
  expanded; diffable-snapshot driven by `CommentStore` (`topLevelComments`, `replies(for:)`,
  `expandedThreads`); tap on load-more → `onToggleThread`.
- Dependencies: `CommentStore`, the `Cells/*` UIKit cells, `CommentListItem`/`CommentListSection`.
- Android port note: `LazyColumn` with a sealed `CommentListItem` (`Comment` / `LoadMoreReplies`);
  state from a `CommentViewModel` mirroring `CommentStore` (`topLevelComments`, `replies`,
  `expandedThreads`). DiffUtil-equivalent is automatic with Compose keys. Self-sizing is free.

## apps/ios/Meeshy/Features/Main/Views/CommunityLinkDetailView.swift

- Purpose: Detail screen for one community invite link (copy / share / copy identifier, stats, info).
- Public API surface: `struct CommunityLinkDetailView: View` — `link: CommunityLink`.
- Key behaviors: Copy `joinUrl`/`identifier` to `UIPasteboard` with feedback; share via
  `UIActivityViewController`; member count, active status, info rows.
- Android port note: Compose screen; `ClipboardManager`; share `Intent.ACTION_SEND`.

## apps/ios/Meeshy/Features/Main/Views/CommunityLinksView.swift

- Purpose: List of communities the user administers, with their invite links + stats overview.
- Public API surface: `struct CommunityLinksView: View`; `@MainActor class CommunityLinksViewModel:
  ObservableObject` — `links`, `isLoading`, computed `stats`, `load()`.
- Key behaviors: **Cache-first SWR** done correctly — `CacheCoordinator.shared.communityLinks.load`
  switch (`fresh` → return, `stale` → show + background refresh, `expired/empty` → spinner only
  if empty + refresh); refresh saves back to cache. Stats via `CommunityLinkService.shared.stats`.
  Navigation to create + detail.
- Dependencies: `CommunityLinksViewModel`, `CommunityLinkService`, `CacheCoordinator`, `Router`,
  `CommunityLink`/`CommunityLinkStats`.
- Android port note: `LazyColumn`; ViewModel + repository with the same SWR cache resolution
  (Room/DataStore). This is a good reference implementation of the cache-first pattern to mirror.

## apps/ios/Meeshy/Features/Main/Views/ConversationAnimatedBackground.swift

- Purpose: Composable animated conversation background — per-conversation-type ambient animation
  plus encryption / multilingual / particle / wave overlay layers.
- Public API surface:
  - `struct ConversationBackgroundConfig` — `conversationType`, `isEncrypted`, `isE2EEncrypted`,
    `memberCount`, `topLanguages`, accent/secondary/groupEnd hex, `isDarkMode`,
    `groupColorFadeDuration`; `init(from: Conversation, …)` derives from the conversation's
    `colorPalette`; computed `baseAnimationStyle` (`intimate/group/community/global`),
    `showEncryptionOverlay`, `showMultilingualOverlay` (≥3 languages).
  - `struct ConversationAnimatedBackground: View`.
- Key behaviors:
  - 4 base animations: intimate (two linked circles + floating hearts, direct/bot), group
    (pulse rings + central circle + orbiting avatars + members badge, color cross-fades over
    `groupColorFadeDuration`), community (concentric expanding rings), global (globe + satellites).
  - Encryption overlay: orbiting lock glyphs (`lock.shield` for E2EE), shield badge / envelopes.
  - Multilingual overlay: orbiting country-flag emojis from `topLanguages` (`languageToFlag` map).
  - Floating blurred particles + layered sine `ConvBgWaveShape`. All layers `.opacity(0.12)`.
  - Driven by 4 repeating animation phases; `.drawingGroup()` for Metal-rasterized compositing;
    `stopAnimations()` disables on disappear.
- Dependencies: SDK `Conversation` (`type`, `encryptionMode`, `colorPalette`, `memberCount`),
  `ThemeManager`, `MeeshyUI`, `ConvBg*` helper shapes/components (separate file).
- Android port note: Compose `Canvas` + `Modifier.drawWithCache`; `rememberInfiniteTransition`
  for the repeating phases; `graphicsLayer { renderEffect / compositingStrategy }` for
  blur/`drawingGroup` equivalent. This is a heavy decorative view — gate behind a perf/battery
  setting and respect reduce-motion. Conversation accent palette comes from
  `ColorGeneration` (deterministic per conversation) — port that algorithm too.

---

## Architecture observations

### Portable user-facing features (checklist)
- [ ] Full-screen swipeable audio viewer (reels-style paging, waveform, seek, speeds, save/share)
- [ ] In-bubble audio playback with per-language audio switching (Prisme)
- [ ] Audio post recording + on-device transcription + language picker before publish
- [ ] Karaoke-style transcription with current-time seek
- [ ] Blocked-users management (list, swipe-to-unblock, confirm)
- [ ] Bookmarked posts feed with infinite scroll
- [ ] Message bubbles: text, emoji-only, images/video grid, inline carousel, audio, files, location
- [ ] Quoted-reply previews including story-reply previews (counts, thumbnails)
- [ ] Reaction pills with comet-landing entry animation + own-reaction emphasis + overflow
- [ ] Inline translation: language flag strip, secondary-translation panel, translate detail entry
- [ ] Ephemeral message countdown badges; blurred / view-once tap-to-reveal with fog effect
- [ ] Delivery status (8-state) checkmarks + offline-pending hourglass + failed-message retry
- [ ] Edited / pinned / forwarded message indicators
- [ ] Inline OpenGraph link previews
- [ ] 1:1 audio + video calls: ringing/connecting/connected/ended, PiP, controls, effects, filters
- [ ] Live in-call transcription overlay; connection-quality indicator
- [ ] Call-waiting banner (second incoming call)
- [ ] Change password with strength meter + validation
- [ ] Threaded comments with expandable replies ("view N more")
- [ ] Community invite links: list, stats, detail, copy/share
- [ ] Per-conversation animated background (type-based + encryption/multilingual layers)

### State management & re-render discipline
- The Bubble family is a deliberate decomposition of a former god-object (`ThemedMessageBubble`).
  Core pattern: an immutable `BubbleContent` value model + a pure `BubbleContentBuilder` factory,
  fed to many small `Equatable`/leaf sub-views. Sub-views take primitive `let` inputs, never
  observe singletons — enabling SwiftUI's fast-path skip. **This is the gold-standard design to
  port verbatim**: a `BubbleContent` Kotlin `data class` + stable Composables. Compose's
  recomposition skipping is the direct equivalent of `.equatable()`.
- Callbacks (`BubbleCallbacks`, 13 closures) are intentionally excluded from equality. In Compose,
  pass stable lambda references (or an event sink) so they don't break skipping.

### Concurrency & lifecycle
- Lifecycle controllers (`BubbleBlurRevealController`, `BubbleEphemeralController`) encapsulate
  cancellable `Task`/`Timer.publish` away from views — clean separation, portable to coroutine
  state holders. Pure logic (`evaluate`, `format`, `handleTap`, `resolveEffectiveContent`,
  `truncateAtWord`) is split out for unit testing — keep this discipline in Kotlin.

### Caching / SWR
- `CommunityLinksViewModel` is a correct reference implementation of the mandated cache-first
  stale-while-revalidate pattern (`CacheCoordinator` `.fresh/.stale/.expired/.empty` switch).
- Inconsistency: `BlockedUsersView` and `BookmarksView` do NOT use the cache-first pattern —
  they call services directly. Android should standardize all list screens on the SWR repo pattern.

### Two parallel conversation/feed renderers (significant tech-debt signal)
- There are **two distinct rendering stacks**: (1) the SwiftUI `Bubble*` family operating on the
  SDK `Message` domain model, and (2) a UIKit `UICollectionView` cell family (`Cells/*`,
  `CommentListViewController`) operating on local-DB `MessageRecord`/`PostRecord`/`CommentRecord`
  models with `cachedBubbleHeight` layout caching and `UICollectionViewDiffableDataSource`.
  The UIKit path is the high-performance "hot list" approach (precomputed heights, cell reuse,
  diffable snapshots) for smooth fast-scroll. **Before porting, confirm which is the live path**;
  do NOT replicate two renderers on Android. Compose `LazyColumn` with stable keys gives the
  diffable-datasource benefit for free; precomputed-height caching is usually unnecessary in
  Compose but the underlying intent (zero dropped frames on message-list scroll) must be met.
- The two paths also carry **two divergent delivery-state enums** (`MessageState` 5-state in
  `DeliveryIndicatorView` vs `MeeshyMessage.DeliveryStatus` 8-state in the SwiftUI bubbles).
  Unify into a single delivery-status model on Android.

### Known correctness debt to fix (not port)
- `BubbleContentBuilder.resolveEffectiveContent` last-resort fallback to
  `preferredTranslation?.translatedContent` violates Prisme rule #1 (must return the original
  when no preferred-language translation matches). Flagged `TODO(prisme)` — fix correctly on Android.
- `BubbleContent.Attachments`/`Reply` equality is id-only (`TODO(Task14)`) and can miss late
  server thumbnail/counter updates — Android `data class` equality should cover those fields.

### Performance techniques worth keeping
- `drawingGroup()` (Metal rasterization) for the heavy animated background → Compose
  `graphicsLayer`/`compositingStrategy`. Gate decorative animation behind reduce-motion + battery.
- Reaction "seen emoji" set prevents replaying entry animations on list re-render — replicate
  with `remember`-scoped state.
- `NetworkMonitor` read as a plain computed property (not observed) inside the bubble to avoid
  re-rendering every list cell on connectivity changes — important pattern for Android too
  (don't collect a global connectivity `StateFlow` inside every list item).
