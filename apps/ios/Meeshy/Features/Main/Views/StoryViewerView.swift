import SwiftUI
import UIKit
import Combine
import os
import MeeshySDK
import MeeshyUI

struct SharedContentWrapper: Identifiable {
    let id = UUID()
    let content: SharedContentType
}

/// Wrapper used by `StoryViewerView.fullScreenCover(item:)` to drive the
/// repost-as-story composer launched from the bottom-bar Partager button (C.1).
/// Carrying both the source `StoryItem` and the original author's handle keeps
/// the cover identifiable + supplies what `StoryComposerViewModel(reposting:authorHandle:)`
/// needs without leaking optionals through the binding.
struct RepostStorySourceWrapper: Identifiable {
    let id = UUID()
    let story: StoryItem
    let authorHandle: String
}

/// Wrapper used by `StoryViewerView.fullScreenCover(item:)` to drive the
/// repost-as-post composer launched from the kebab menu's "Editer et republier
/// en post" action (C.2). Mirrors `RepostStorySourceWrapper` but feeds the
/// `UnifiedPostComposer(repostingStory:authorHandle:onPublishRepost:onDismiss:)`
/// init introduced in B.7.
struct RepostPostSourceWrapper: Identifiable {
    let id = UUID()
    let story: StoryItem
    let authorHandle: String
}

/// Draft state for a single story's composer
struct StoryDraft {
    var text: String = ""
    var attachments: [ComposerAttachment] = []
}

// MARK: - Prefetcher host (P3 wire-up)

/// Offscreen `UIViewRepresentable` that installs the
/// `StoryReaderPrefetcher.hostView` into the SwiftUI hierarchy. The host
/// occupies a 1x1 corner behind every visible layer so the prefetcher's
/// child canvas views go through a full `didMoveToWindow` cycle (image
/// decode, AVPlayer asset load, layer-tree build) without taking any
/// visible real estate.
///
/// `MeeshyUI` defaults to `@MainActor` isolation, so `StoryReaderPrefetcher`
/// is `@MainActor`. The closure is invoked synchronously inside
/// `makeUIView` on the main actor (SwiftUI guarantee), so the access is safe.
struct PrefetcherHostView: UIViewRepresentable {
    let prefetcher: StoryReaderPrefetcher

    func makeUIView(context: Context) -> UIView {
        // Wrapper so the prefetcher's host view sits behind any visible layer
        // and never affects layout/hit-testing of the SwiftUI tree.
        let container = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        container.isUserInteractionEnabled = false
        container.clipsToBounds = true
        container.alpha = 0
        container.accessibilityElementsHidden = true
        prefetcher.attach(to: container)
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // Idempotent — `attach(to:)` short-circuits if already parented.
        prefetcher.attach(to: uiView)
    }
}

struct StoryViewerView: View {
    @ObservedObject var viewModel: StoryViewModel
    let groups: [StoryGroup]
    @State var currentGroupIndex: Int
    @Binding var isPresented: Bool
    var isPreviewMode: Bool = false
    var onReplyToStory: ((ReplyContext) -> Void)? = nil
    /// Assets préchargés localement transmis depuis le composer (mode preview uniquement).
    var preloadedImages: [String: UIImage] = [:]
    var preloadedVideoURLs: [String: URL] = [:]
    var preloadedAudioURLs: [String: URL] = [:]
    var initialStoryIndex: Int = 0
    /// One-shot side-effect for the notification flow (Phase F): when set, the
    /// viewer auto-opens either the comments overlay or the viewers sheet on
    /// first appear, then pauses the timer so the user can read what they
    /// were notified about. Default `nil` keeps every legacy entry point
    /// (tray, deep link, story-reaction redirect) on the existing path.
    var initialAction: StoryViewerInitialAction? = nil

    static let heartEmoji = "\u{2764}\u{FE0F}"

    @State var currentStoryIndex = 0 // internal for cross-file extension access
    @State var progress: CGFloat = 0 // internal for cross-file extension access
    /// True once the visible slide's background media is fully usable (real
    /// bitmap / video `.readyToPlay` / solid color). Gates the progress timer
    /// and the centered loading spinner.
    @State var isContentReady: Bool = false // internal for cross-file extension access
    @State var isPaused = false // internal for cross-file extension access
    @State var isGlobalMuted = false // internal for cross-file extension access
    /// True when user is actively engaging with the composer (focused, recording, emoji panel, etc.)
    @State var isComposerEngaged = false // internal for cross-file extension access
    /// True when composer has pending content (text, attachments, or recording)
    @State var hasComposerContent = false // internal for cross-file extension access

    // Per-story draft storage
    @State var storyDrafts: [String: StoryDraft] = [:]

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    /// Durée dynamique du slide courant — max(12, durée max des médias vidéo/audio).
    /// Static text/image slides default to 12s so the reader has time to take in
    /// captions and stickers (the previous 5s default felt rushed for anything
    /// beyond a single-emoji story).
    @State var computedStoryDuration: Double = 12.0 // internal for cross-file extension access
    @State var timerCancellable: AnyCancellable? // internal for cross-file extension access
    @State var hasFiredFadeOut = false // internal for cross-file extension access

    // MARK: - P3 wire-up : Prefetcher + gated timer
    //
    // `StoryReaderPrefetcher` maintains a sliding window of 3 bootstrapped
    // canvas views around `currentStoryIndex` so the next/previous slide is
    // one CATransaction away when the user taps to advance. The
    // prefetcher's offscreen canvas reports `onContentReady` once its
    // background image lands in the shared cache — we use that signal to
    // drive `StoryReaderTimerController` for the visible slide, since the
    // visible `StoryReaderRepresentable` shares the same image cache (its
    // canvas hits the cache directly on `setReaderContext` → `rebuildLayers`).
    //
    // The timer's `onCompletion` drives auto-advance, replacing the legacy
    // wall-clock CADisplayLink loop in `startTimer()`. The legacy
    // `timerCancellable` is intentionally KEPT and exercised by
    // `restartTimer()` calls from `crossFadeStory` / `groupTransition`
    // (extension code) — wiring `onChange` of the slide index re-cancels
    // it and re-arms the gated timer so both code paths converge on the
    // same auto-advance source of truth.
    @State private var prefetcher = StoryReaderPrefetcher()
    @State private var slideTimer = StoryReaderTimerController()
    /// Latched once `attach(to:)` has been wired via the host
    /// representable — guards against re-firing every onAppear cycle
    /// (scene phase changes / parent re-renders).
    @State private var hasInstalledPrefetchPipeline = false

    @State var showFullEmojiPicker = false // internal for cross-file extension access
    @State var showTextEmojiPicker = false // internal for cross-file extension access
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var emojiToInject = ""
    @State private var composerFocusTrigger = false
    @State var composerLanguage: String = DefaultComposerLanguage.resolve() // internal for cross-file extension access
    @State var commentBlurEnabled: Bool = false // internal for cross-file extension access
    @State var commentEffects: MessageEffects = .none // internal for cross-file extension access
    @State var showLanguageOptions = false // internal for cross-file extension access
    @State var showFullLanguagePicker = false // internal for cross-file extension access
    @StateObject private var keyboard = KeyboardObserver()
    @Environment(\.scenePhase) private var scenePhase

    // Required by `SharePickerView` presented via `.sheet(item:)` below. The
    // sheet creates a separate presentation hierarchy so EnvironmentObjects
    // from the parent fullScreenCover are NOT inherited automatically — we
    // must capture them here and re-inject onto SharePickerView (see line
    // ~257) to avoid the `EnvironmentObject error` crash that previously
    // happened the moment a user tapped the share button on a story.
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var statusViewModel: StatusViewModel

    // === Transition states ===

    // Appear — start visible to avoid blank screen if animation doesn't fire
    @State private var appearScale: CGFloat = 0.92
    @State private var appearCornerRadius: CGFloat = 24
    @State private var appearOpacity: Double = 1

    // Dismiss
    @State var isDismissing = false // internal for cross-file extension access
    @State var dragOffset: CGFloat = 0 // internal for cross-file extension access

    // Group slide (group ↔ group)
    @State var groupSlide: CGFloat = 0 // internal for cross-file extension access

    // Content cross-fade (story ↔ story within group)
    @State var contentOpacity: Double = 1 // internal for cross-file extension access

    // Outgoing layer for true cross-dissolve (old stays visible while new fades in)
    @State var outgoingStory: StoryItem? = nil // internal for cross-file extension access
    @State var outgoingOpacity: Double = 0 // internal for cross-file extension access

    // Transition lock — prevents overlapping animations
    @State var isTransitioning = false // internal for cross-file extension access

    // Text parallax offset (slides up during cross-dissolve for depth)
    @State var textSlideOffset: CGFloat = 0 // internal for cross-file extension access

    // Opening effect animation states
    @State var openingScale: CGFloat = 1.0        // internal for cross-file extension access
    @State var isRevealActive: Bool = false       // internal for cross-file extension access
    @State var closingScale: CGFloat = 1.0        // internal for cross-file extension access

    // Horizontal swipe (group ↔ group)
    @State var horizontalDrag: CGFloat = 0 // internal for cross-file extension access
    @State var gestureAxis: Int = 0 // internal for cross-file extension access  // 0=undecided, 1=horizontal, 2=vertical
    @State var showViewersSheet = false
    @State var showExportShareSheet = false
    @StateObject var exportShareViewModel = StoryExportShareViewModel()
    @State var showCommentsOverlay = false
    @State var storyReactionCount: Int = 0
    @State var storyComments: [FeedComment] = []
    @State var isLoadingComments = false
    @State var storyCommentCount: Int = 0
    @State var replyingToStoryComment: FeedComment? = nil
    @State var storyCommentRepliesMap: [String: [FeedComment]] = [:]
    @State var storyCommentExpandedThreads: Set<String> = []
    @State var storyCommentLoadingReplies: Set<String> = []
    /// Optimistic local tracking of liked comments (id ∈ set => current user reacted).
    @State var storyCommentLikedIds: Set<String> = []
    /// Local like-count delta keyed by comment id, applied on top of the server `comment.likes`
    /// to avoid waiting for refetch after a tap.
    @State var storyCommentLikeDelta: [String: Int] = [:]
    /// In-flight heart taps: commentIds with a pending network call. Prevents rapid-tap desync.
    @State var heartInFlightIds: Set<String> = []
    /// Latched once the `initialAction` (Phase F notification entry point) has
    /// been honoured. Guards against re-firing on every `.onAppear` cycle —
    /// scene phase transitions and parent re-renders both republish onAppear,
    /// and we only ever want to auto-open the overlay/sheet once per
    /// presentation.
    @State var hasTriggeredInitialAction = false

    private var screenH: CGFloat { UIScreen.main.bounds.height }

    var screenW: CGFloat { UIScreen.main.bounds.width } // internal for cross-file extension access

    // Drag dismiss progress 0–1
    private var dragProgress: CGFloat {
        min(max(dragOffset / 350, 0), 1)
    }

    // Combined horizontal offset (programmatic slide + interactive drag)
    private var totalSlideX: CGFloat {
        groupSlide + horizontalDrag * 0.5
    }

    // Depth effect from horizontal movement (slight scale + rotation)
    private var slideProgress: CGFloat {
        min(abs(totalSlideX) / screenW, 1.0)
    }

    // Extracted into the nominal `StoryViewerContentView` struct (see
    // StoryViewerView+Canvas.swift) so the deeply-nested story canvas no
    // longer composes into `StoryViewerView.body`'s opaque type. That
    // monolithic type triggered a Swift type-metadata instantiation crash on
    // low-memory devices (cf. ConversationListView). A real struct breaks the
    // type just as effectively as `AnyView` while preserving SwiftUI
    // structural identity / diffing.
    private var viewerContent: some View {
        StoryViewerContentView(
            prefetcher: prefetcher,
            isPreviewMode: isPreviewMode,
            cardScale: cardScale,
            cardCornerRadius: cardCornerRadius,
            cardOpacity: cardOpacity,
            cardOffsetY: cardOffsetY,
            totalSlideX: totalSlideX,
            slideProgress: slideProgress,
            dragProgress: dragProgress,
            isPresented: $isPresented,
            makeStoryCard: { geometry in storyCard(geometry: geometry) }
        )
        .background(Color.black)
        .preferredColorScheme(.dark)
        .ignoresSafeArea()
        .statusBarHidden()
        .gesture(unifiedDragGesture)
        .onAppear {
            if initialStoryIndex > 0, currentGroupIndex < groups.count {
                currentStoryIndex = min(initialStoryIndex, groups[currentGroupIndex].stories.count - 1)
            }
            StoryMediaCoordinator.shared.activate {
                isGlobalMuted = true
            }
            installPrefetchPipelineIfNeeded()
            refreshPrefetchWindowAndTimer()
            startTimer()
            markCurrentViewed()
            prefetchCurrentGroup()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                appearScale = 1.0
                appearCornerRadius = 0
            }
            triggerInitialActionIfNeeded()
            if let story = currentStory {
                SocialSocketManager.shared.joinPostRoom(postId: story.id)
            }
        }
        .onDisappear {
            timerCancellable?.cancel()
            slideTimer.reset()
            prefetcher.detach()
            hasInstalledPrefetchPipeline = false
            StoryMediaCoordinator.shared.deactivate()
            if let story = currentStory {
                SocialSocketManager.shared.leavePostRoom(postId: story.id)
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background {
                timerCancellable?.cancel()
                slideTimer.reset()
                PlaybackCoordinator.shared.stopAll()
                isPresented = false
            }
        }
        .onChange(of: currentStoryIndex) { oldValue, _ in
            isContentReady = false
            refreshPrefetchWindowAndTimer()
            let previousStory = currentGroup.flatMap { group in
                group.stories.indices.contains(oldValue) ? group.stories[oldValue] : nil
            }
            transitionPostRoom(from: previousStory, to: currentStory)
        }
        .onChange(of: currentGroupIndex) { oldValue, _ in
            isContentReady = false
            refreshPrefetchWindowAndTimer()
            let previousStory: StoryItem? = (oldValue >= 0 && oldValue < groups.count &&
                groups[oldValue].stories.indices.contains(currentStoryIndex))
                ? groups[oldValue].stories[currentStoryIndex]
                : nil
            transitionPostRoom(from: previousStory, to: currentStory)
        }
        .onReceive(SocialSocketManager.shared.commentReactionAdded.receive(on: DispatchQueue.main)) { event in
            guard showCommentsOverlay else { return }
            guard event.postId == currentStory?.id else { return }
            guard event.emoji == Self.heartEmoji else { return }
            let currentUserId = AuthManager.shared.currentUser?.id
            if event.userId == currentUserId {
                storyCommentLikedIds.insert(event.commentId)
            } else {
                storyCommentLikeDelta[event.commentId] = (storyCommentLikeDelta[event.commentId] ?? 0) + 1
            }
        }
        .onReceive(SocialSocketManager.shared.commentReactionRemoved.receive(on: DispatchQueue.main)) { event in
            guard showCommentsOverlay else { return }
            guard event.postId == currentStory?.id else { return }
            guard event.emoji == Self.heartEmoji else { return }
            let currentUserId = AuthManager.shared.currentUser?.id
            if event.userId == currentUserId {
                storyCommentLikedIds.remove(event.commentId)
            } else {
                storyCommentLikeDelta[event.commentId] = (storyCommentLikeDelta[event.commentId] ?? 0) - 1
            }
        }
    }

    var body: some View {
        viewerContent
        .sheet(isPresented: $showViewersSheet, onDismiss: { resumeTimer() }) {
            if let story = currentStory {
                StoryViewersSheet(story: story, accentColor: Color(hex: "4ECDC4"))
            }
        }
        .sheet(isPresented: $showExportShareSheet, onDismiss: {
            exportShareViewModel.cancel()
            resumeTimer()
        }) {
            if let story = currentStory {
                StoryExportShareSheet(
                    story: story,
                    viewModel: exportShareViewModel
                )
                .presentationDetents([.medium, .large] as Set<PresentationDetent>)
                .presentationDragIndicator(.visible)
            }
        }
        .sheet(item: $sharedContentWrapper, onDismiss: { resumeTimer() }) { wrapper in
            SharePickerView(
                sharedContent: wrapper.content,
                onDismiss: { sharedContentWrapper = nil },
                onShareToConversation: nil
            )
            .environmentObject(router)
            .environmentObject(conversationListViewModel)
            .environmentObject(statusViewModel)
            .presentationDetents([.medium, .large] as Set<PresentationDetent>)
        }
        .fullScreenCover(item: $repostStoryComposerSource, onDismiss: { resumeTimer() }) { wrapper in
            StoryComposerView(
                viewModel: StoryComposerViewModel(
                    reposting: wrapper.story,
                    authorHandle: wrapper.authorHandle
                ),
                onPublishSlide: { _, _, _, _, _ in },
                onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility in
                    viewModel.publishStoryInBackground(
                        slides: slides,
                        slideImages: slideImages,
                        loadedImages: loadedImages,
                        loadedVideoURLs: loadedVideoURLs,
                        loadedAudioURLs: loadedAudioURLs,
                        originalLanguage: originalLanguage,
                        visibility: visibility
                    )
                    repostStoryComposerSource = nil
                },
                onDismiss: { repostStoryComposerSource = nil }
            )
        }
        .fullScreenCover(item: $editAndRepostAsPostSource, onDismiss: { resumeTimer() }) { wrapper in
            UnifiedPostComposer(
                repostingStory: wrapper.story,
                authorHandle: wrapper.authorHandle,
                onPublishRepost: { content, sourceStory in
                    do {
                        _ = try await PostService.shared.repost(
                            postId: sourceStory.id,
                            targetType: .post,
                            content: content.isEmpty ? nil : content,
                            isQuote: !content.isEmpty
                        )
                        editAndRepostAsPostSource = nil
                        ToastManager.shared.show("Publié")
                    } catch {
                        ToastManager.shared.showError("Échec de la publication")
                        throw error
                    }
                },
                onStoryImported: { result in
                    Logger.stories.info(
                        "repost.import slide=\(result.targetSize.width, privacy: .public)x\(result.targetSize.height, privacy: .public) texts=\(result.texts.count, privacy: .public) media=\(result.media.count, privacy: .public) stickers=\(result.stickers.count, privacy: .public) drawing=\(result.drawingData != nil, privacy: .public) audios=\(result.audios.count, privacy: .public) clamped=\(result.warnings.count, privacy: .public)"
                    )
                },
                onDismiss: { editAndRepostAsPostSource = nil }
            )
        }
    }

    // MARK: - P3 wire-up : prefetcher + gated timer (internal for tests)

    /// Languages used by the prefetcher to project `StoryItem → StorySlide`
    /// (Prisme Linguistique chain). Mirrors `resolvedViewerLanguageChain`
    /// — both come from `MeeshyUser.preferredContentLanguages` — but exposed
    /// here so the wire-up integration tests can intercept the call without
    /// touching the private accessor.
    var preferredContentLanguagesForReader: [String] {
        AuthManager.shared.currentUser?.preferredContentLanguages ?? []
    }

    /// Stories of the current group, snapshotted via `currentGroup`. Empty
    /// when the index points past the end of `groups`.
    var currentGroupStories: [StoryItem] {
        currentGroup?.stories ?? []
    }

    /// Slide duration used to arm the gated timer. Mirrors the legacy
    /// `computedStoryDuration` path so a slide with bg-loop video / long
    /// foreground media still gets the rounded-up duration. The legacy
    /// `updateStoryDuration()` writes `computedStoryDuration` synchronously
    /// for the non-preview path (only `isPreviewMode` defers to AVURLAsset),
    /// so reading it here after `refreshPrefetchWindowAndTimer()` calls
    /// `updateStoryDuration()` indirectly via `startTimer()` is safe.
    var currentSlideDuration: TimeInterval {
        computedStoryDuration > 0 ? computedStoryDuration : 12.0
    }

    /// Installs the prefetcher host pipeline once per viewer lifecycle. The
    /// `PrefetcherHostView` representable handles the `attach(to:)` call
    /// inside `makeUIView` — this method only wires the timer callbacks
    /// and latches the install flag so re-entrant `.onAppear` cycles are
    /// no-ops.
    ///
    /// Parameters intentionally exposed so the integration tests can pass
    /// in dedicated prefetcher/timer instances without going through
    /// SwiftUI's `@State` storage (which only binds inside body evaluation).
    /// Production callers always use the defaults.
    func installPrefetchPipelineIfNeeded(
        prefetcher: StoryReaderPrefetcher? = nil,
        timer: StoryReaderTimerController? = nil
    ) {
        guard !hasInstalledPrefetchPipeline else { return }
        hasInstalledPrefetchPipeline = true
        // The prefetcher itself is bootstrapped via
        // `PrefetcherHostView.makeUIView` — this method only owns the
        // timer callbacks (which can't be wired from the representable
        // because the representable cannot read SwiftUI state). The
        // `prefetcher` parameter is part of the API for symmetry with
        // `refreshPrefetchWindowAndTimer(prefetcher:timer:)`; the tests
        // pass it through so the install fence is uniform on both seams.
        _ = prefetcher
        let t = timer ?? self.slideTimer
        // Reset the gated timer so a re-entrant `.onAppear` doesn't keep
        // the previous slide's countdown alive across the host re-install.
        t.reset()
        t.onProgressChange = { _ in
            // Visual progress bar is driven by the legacy
            // `startTimer()` display-link loop — the gated timer only
            // owns the auto-advance trigger. Wiring `onProgressChange`
            // here (no-op for now) keeps the seam available so a
            // post-launch refactor can switch the bar to gated progress
            // without touching the structure of the integration.
        }
        t.onCompletion = {
            // No-op : the legacy `startTimer()` display-link loop already
            // owns `goToNext()` (it fires when `progress >= 1.0`), so
            // wiring a second auto-advance here would double-skip. The
            // seam stays exposed so a follow-up patch can pivot to gated
            // advance once the legacy loop is fully retired, and so the
            // integration test can assert the callback is wired without
            // having to spin the legacy display link.
        }
    }

    /// Re-arms the prefetcher's sliding window AND the gated slide timer
    /// to track `currentStory`. Called on `.onAppear` and on every change
    /// of `currentStoryIndex` / `currentGroupIndex`.
    ///
    /// 1. Updates the prefetch window to `[N-1, N, N+1]`.
    /// 2. Re-wires `onContentReady` on the prefetched canvas of the
    ///    current slide so the gated timer flips to active the moment
    ///    the background image lands in the shared cache. The visible
    ///    `StoryReaderRepresentable` hits the same cache, so this is a
    ///    strong proxy for "user is actually seeing real content".
    /// 3. Calls `setCurrentSlide(id:duration:)` to reset the gated timer.
    ///
    /// `prefetcher` / `timer` parameters default to the view's `@State`
    /// instances. The integration tests pass in dedicated instances so
    /// the assertions can read window state and slide id without going
    /// through SwiftUI's `@State` storage.
    func refreshPrefetchWindowAndTimer(
        prefetcher: StoryReaderPrefetcher? = nil,
        timer: StoryReaderTimerController? = nil
    ) {
        let p = prefetcher ?? self.prefetcher
        let t = timer ?? self.slideTimer
        let stories = currentGroupStories
        guard !stories.isEmpty,
              stories.indices.contains(currentStoryIndex) else {
            t.reset()
            return
        }
        let chain = preferredContentLanguagesForReader
        let context = StoryReaderContext(
            preferredLanguages: chain,
            mute: isGlobalMuted,
            onCompletion: nil,
            postMediaURLResolver: nil,
            imageCache: nil
        )
        p.updateWindow(items: stories,
                       currentIndex: currentStoryIndex,
                       context: context,
                       preferredLanguages: chain)

        let current = stories[currentStoryIndex]
        t.setCurrentSlide(id: current.id, duration: currentSlideDuration)

        // Re-wire `onContentReady` on the prefetched canvas of the
        // CURRENT slide. The prefetcher's canvas reports readiness once
        // its background image bytes land — same cache as the visible
        // canvas, so this is a strong proxy. `[weak t = t]` captures the
        // timer reference weakly so an in-flight onContentReady ping after
        // the viewer is torn down doesn't keep the timer alive.
        if let canvas = p.view(for: current.id) {
            let slideId = current.id
            canvas.onContentReady = { [weak t = t] in
                t?.markContentReady(slideId: slideId)
            }
        }
    }

    /// Direct repost-as-post action wired to the kebab menu's "Republier en
    /// post" item. Mirrors the share-button repost UX (C.1) but skips the
    /// composer — fires `PostService.repost` immediately with no content and
    /// Transitions the Socket.IO post room subscription from `oldStory` to `newStory`.
    /// The old.id != new.id check makes redundant calls (e.g. double-fire from both
    /// onChange handlers at a group boundary) idempotent.
    private func transitionPostRoom(from oldStory: StoryItem?, to newStory: StoryItem?) {
        if let old = oldStory, old.id != newStory?.id {
            SocialSocketManager.shared.leavePostRoom(postId: old.id)
        }
        if let new = newStory, new.id != oldStory?.id {
            SocialSocketManager.shared.joinPostRoom(postId: new.id)
        }
    }

    /// `isQuote: false`. Surfaces user-facing toasts on success / known error
    /// codes (404 = source story gone, 403 = repost forbidden) and a generic
    /// failure otherwise. Errors are mapped against `APIError.serverError`'s
    /// status-code payload since that's the shape `APIClient` throws.
    private func repostAsPostDirect() {
        guard let story = currentStory else { return }
        HapticFeedback.light()
        Task {
            do {
                _ = try await PostService.shared.repost(
                    postId: story.id,
                    targetType: .post,
                    content: nil,
                    isQuote: false
                )
                await MainActor.run {
                    HapticFeedback.success()
                    ToastManager.shared.show("Republié dans ton feed")
                }
            } catch APIError.serverError(404, _) {
                await MainActor.run {
                    ToastManager.shared.showError("La story n'est plus disponible")
                }
            } catch APIError.serverError(403, _) {
                await MainActor.run {
                    ToastManager.shared.showError("Cette story ne peut pas être repartagée")
                }
            } catch {
                await MainActor.run {
                    ToastManager.shared.showError("Échec de la republication")
                }
            }
        }
    }

    // MARK: - External share URL builder

    /// Builds the public web URL surfaced through ShareLink so the story can
    /// be shared outside Meeshy (Messages, Mail, other apps). Aligned with
    /// the existing pattern in `SharePickerView.swift` that already references
    /// `https://meeshy.me/story/<id>`. Returns nil if the story id is empty.
    private func makeStoryExternalShareURL(_ storyId: String) -> URL? {
        guard !storyId.isEmpty else { return nil }
        return URL(string: "https://meeshy.me/story/\(storyId)")
    }

    // MARK: - Computed Card Transforms

    private var cardScale: CGFloat {
        if isDismissing { return 0.12 }
        return appearScale * (1.0 - dragProgress * 0.35)
    }

    private var cardCornerRadius: CGFloat {
        if isDismissing { return 32 }
        return max(appearCornerRadius, dragProgress * 36)
    }

    private var cardOpacity: Double {
        if isDismissing { return 0 }
        return appearOpacity * (1.0 - Double(dragProgress) * 0.3)
    }

    private var cardOffsetY: CGFloat {
        if isDismissing { return -screenH * 0.35 }
        return dragOffset * 0.5
    }

    @State var showEmojiStrip = false // internal for cross-file extension access
    @State private var bigReactionEmoji: String?
    @State private var bigReactionPhase: Int = 0
    @State private var sharedContentWrapper: SharedContentWrapper?
    @State private var repostStoryComposerSource: RepostStorySourceWrapper?
    @State private var editAndRepostAsPostSource: RepostPostSourceWrapper?

    private let quickEmojis = ["❤️", "😂", "😮", "🔥", "😢", "👏"]

    // MARK: - Story Card

    /// Builds the story canvas for the supplied geometry. Extracted into the
    /// nominal `StoryCardView` struct (see StoryViewerView+Canvas.swift) so
    /// its ~10-layer `ZStack` is its own type-metadata unit.
    private func storyCard(geometry: GeometryProxy) -> StoryCardView {
        StoryCardView(
            geometry: geometry,
            currentStory: currentStory,
            outgoingStory: outgoingStory,
            currentGroup: currentGroup,
            currentStoryIndex: currentStoryIndex,
            resolvedViewerLanguage: resolvedViewerLanguage,
            resolvedViewerLanguageChain: resolvedViewerLanguageChain,
            preloadedImages: preloadedImages,
            preloadedVideoURLs: preloadedVideoURLs,
            preloadedAudioURLs: preloadedAudioURLs,
            currentVoiceCaption: currentVoiceCaption,
            isContentTranslated: isContentTranslated,
            isOwnStory: isOwnStory,
            quickEmojis: quickEmojis,
            progress: progress,
            outgoingOpacity: outgoingOpacity,
            closingScale: closingScale,
            contentOpacity: contentOpacity,
            textSlideOffset: textSlideOffset,
            openingScale: openingScale,
            isRevealActive: isRevealActive,
            bigReactionEmoji: bigReactionEmoji,
            bigReactionPhase: bigReactionPhase,
            storyReactionCount: storyReactionCount,
            storyCommentCount: storyCommentCount,
            isStoryCommentsEmpty: storyComments.isEmpty,
            currentStoryNeedsVideoExport: currentStoryNeedsVideoExport,
            storyHasAudioOrVideo: storyHasAudioOrVideo,
            storyHasTranslatableContent: storyHasTranslatableContent,
            isGlobalMuted: isGlobalMuted,
            availableTranslationLanguages: availableTranslationLanguages,
            onReplyToStory: onReplyToStory,
            composerAccentColor: currentGroup?.avatarColor ?? "6366F1",
            storyComments: storyComments,
            storyCommentRepliesMap: storyCommentRepliesMap,
            storyCommentExpandedThreads: storyCommentExpandedThreads,
            storyCommentLoadingReplies: storyCommentLoadingReplies,
            isLoadingComments: isLoadingComments,
            commentsUserLang: AuthManager.shared.currentUser?.preferredContentLanguages.first ?? "fr",
            isContentReady: $isContentReady,
            showEmojiStrip: $showEmojiStrip,
            showFullEmojiPicker: $showFullEmojiPicker,
            showCommentsOverlay: $showCommentsOverlay,
            showLanguageOptions: $showLanguageOptions,
            showFullLanguagePicker: $showFullLanguagePicker,
            showViewersSheet: $showViewersSheet,
            showExportShareSheet: $showExportShareSheet,
            isGlobalMutedBinding: $isGlobalMuted,
            showTextEmojiPicker: $showTextEmojiPicker,
            isComposerEngaged: $isComposerEngaged,
            hasComposerContent: $hasComposerContent,
            sharedContentWrapper: $sharedContentWrapper,
            repostStoryComposerSource: $repostStoryComposerSource,
            editAndRepostAsPostSource: $editAndRepostAsPostSource,
            isPresented: $isPresented,
            selectedProfileUser: $selectedProfileUser,
            showReportSheet: $showReportSheet,
            replyingToStoryComment: $replyingToStoryComment,
            composerLanguage: $composerLanguage,
            commentEffects: $commentEffects,
            commentBlurEnabled: $commentBlurEnabled,
            emojiToInject: $emojiToInject,
            composerFocusTrigger: $composerFocusTrigger,
            storyDrafts: $storyDrafts,
            keyboard: keyboard,
            triggerStoryReaction: { triggerStoryReaction($0) },
            pauseTimer: { pauseTimer() },
            resumeTimer: { resumeTimer() },
            loadStoryComments: { loadStoryComments() },
            dismissComposer: { dismissComposer() },
            goToPrevious: { goToPrevious() },
            goToNext: { goToNext() },
            sendComment: { text, effectFlags, parentId in
                sendComment(text: text, effectFlags: effectFlags, parentId: parentId)
            },
            makeStoryCommentRow: { comment, userLang in
                makeStoryCommentRow(comment, userLang: userLang)
            },
            toggleStoryCommentThread: { await toggleStoryCommentThread($0) },
            makeStoryExternalShareURL: { makeStoryExternalShareURL($0) },
            storyTimeRemaining: { storyTimeRemaining($0) },
            deleteCurrentStory: { deleteCurrentStory() },
            repostAsPostDirect: { repostAsPostDirect() },
            dismissViewer: { dismissViewer() },
            reportStory: { storyId, reportType, reason in
                try await ReportService.shared.reportStory(storyId: storyId, reportType: reportType, reason: reason)
            },
            composerBottomPadding: { composerBottomPadding(geometry: $0) }
        )
    }

    // MARK: - Right Action Sidebar

    private var isOwnStory: Bool {
        currentGroup?.id == AuthManager.shared.currentUser?.id
    }

    /// Whether the currently shown story has time-evolving content worth
    /// baking into an MP4 (animated text, background video, voice
    /// attachment, opening transition, etc.). Reconstructs the
    /// renderable slide via the same path the live canvas consumes so the
    /// gate matches the export's own routing in `prepareExport`.
    private var currentStoryNeedsVideoExport: Bool {
        guard let story = currentStory else { return false }
        return story.toRenderableSlide(preferredLanguages: preferredContentLanguagesForReader).needsVideoExport
    }

    // MARK: - Available Translation Languages

    private var availableTranslationLanguages: [TranslationLanguage] {
        guard let translations = currentStory?.translations, !translations.isEmpty else { return [] }
        let availableCodes = Set(translations.map(\.language))
        return TranslationLanguage.all.filter { availableCodes.contains($0.id) }
    }

    // MARK: - Story Reactions

    private func triggerStoryReaction(_ emoji: String) {
        HapticFeedback.medium()

        // Big floating emoji — dramatic 3-phase animation
        bigReactionEmoji = emoji
        bigReactionPhase = 0
        // Phase 1: burst in with overshoot
        withAnimation(.spring(response: 0.25, dampingFraction: 0.4)) {
            bigReactionPhase = 1
        }
        // Phase 1.5: subtle pulse at peak (secondary haptic)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            HapticFeedback.light()
        }
        // Phase 2: float up and dissolve
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            withAnimation(.easeOut(duration: 0.6)) { bigReactionPhase = 2 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            bigReactionEmoji = nil
            bigReactionPhase = 0
        }

        // Collapse strip after reaction (timer auto-resumes when showEmojiStrip=false)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                showEmojiStrip = false
            }
        }

        storyReactionCount += 1
        sendReaction(emoji: emoji)
    }

    // MARK: - Computed Bottom Padding

    private func composerBottomPadding(geometry: GeometryProxy) -> CGFloat {
        if showTextEmojiPicker {
            // Emoji panel is showing — just need safe area below it
            return geometry.safeAreaInsets.bottom
        } else if keyboard.isVisible {
            // Keyboard is showing — push everything above it
            return keyboard.height
        } else {
            // Default — safe area + breathing room
            return geometry.safeAreaInsets.bottom + 20
        }
    }

    // MARK: - Current State

    var currentGroup: StoryGroup? { // internal for cross-file extension access
        guard currentGroupIndex >= 0 && currentGroupIndex < groups.count else { return nil }
        return groups[currentGroupIndex]
    }

    var currentStory: StoryItem? { // internal for cross-file extension access
        guard let group = currentGroup,
              currentStoryIndex >= 0 && currentStoryIndex < group.stories.count else { return nil }
        return group.stories[currentStoryIndex]
    }

    /// Premier element de la chaine Prisme — utilise pour les API single-string
    /// (audio variants legacy, contenu de message, etc.). Pour la resolution complete
    /// on passe `resolvedViewerLanguageChain` au reader.
    private var resolvedViewerLanguage: String? {
        resolvedViewerLanguageChain.first
    }

    /// Chaine complete : systemLanguage → regionalLanguage → customDestinationLanguage → "fr"
    /// (cf. `MeeshyUser.preferredContentLanguages`). Utilisee par le reader pour resoudre
    /// les traductions selon le Prisme Linguistique.
    private var resolvedViewerLanguageChain: [String] {
        AuthManager.shared.currentUser?.preferredContentLanguages ?? []
    }

    var storyHasAudioOrVideo: Bool {
        guard let story = currentStory else { return false }
        guard let effects = story.storyEffects else { return false }
        if effects.voiceAttachmentId != nil { return true }
        if effects.backgroundAudioId != nil { return true }
        if let audioObjs = effects.audioPlayerObjects, !audioObjs.isEmpty { return true }
        if let mediaObjs = effects.mediaObjects {
            if mediaObjs.contains(where: { $0.kind == .video }) { return true }
        }
        return false
    }

    var storyHasTranslatableContent: Bool { // internal for cross-file extension access
        guard let story = currentStory else { return false }
        if let text = story.content, !text.isEmpty { return true }
        if let effects = story.storyEffects {
            if effects.voiceAttachmentId != nil { return true }
            if let audioObjs = effects.audioPlayerObjects, !audioObjs.isEmpty { return true }
        }
        return false
    }

    var isContentTranslated: Bool { // internal for cross-file extension access
        guard storyHasTranslatableContent,
              let story = currentStory,
              let viewerLang = resolvedViewerLanguage,
              let translations = story.translations,
              !translations.isEmpty else { return false }
        return translations.contains { $0.language == viewerLang }
    }

    // MARK: - Voice Caption

    var currentVoiceCaption: String? { // internal for cross-file extension access
        guard let effects = currentStory?.storyEffects,
              effects.voiceAttachmentId != nil,
              let transcriptions = effects.voiceTranscriptions,
              !transcriptions.isEmpty else { return nil }
        let lang = resolvedViewerLanguage ?? "en"
        return transcriptions.first { $0.language == lang }?.content
            ?? transcriptions.first?.content
    }


    // MARK: - Header state

    /// Used by `StoryHeaderView`'s report sheet — owned here so the sheet
    /// presentation survives header re-renders.
    @State private var showReportSheet = false

    // MARK: - Content, Gestures, Navigation, Timer & Actions (see StoryViewerView+Content.swift)
}
