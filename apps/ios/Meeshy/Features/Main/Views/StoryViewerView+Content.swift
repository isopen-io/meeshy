import SwiftUI
import Combine
import AVFoundation
import QuartzCore
import MeeshySDK
import MeeshyUI

// MARK: - Story progress display-link proxy

/// Wraps a `CADisplayLink` that fires once per display refresh (typically 60Hz,
/// up to 120Hz on ProMotion). The closure is invoked on the main run loop in
/// `.common` mode so it keeps ticking during scroll. Lifetime is bridged via
/// the parent's `AnyCancellable` — when that's cancelled the proxy is dropped
/// and `invalidate()` is called explicitly from the cancellation closure.
final class StoryProgressDisplayLinkProxy {
    /// Tiny boxed Double so the tick closure can mutate the last-committed
    /// progress between fires without requiring `inout` plumbing through a
    /// closure that crosses concurrency boundaries.
    final class MutableDouble {
        var value: Double
        init(_ value: Double) { self.value = value }
    }

    private var displayLink: CADisplayLink?
    private let onTick: @MainActor () -> Void

    init(onTick: @escaping @MainActor () -> Void) {
        self.onTick = onTick
    }

    @MainActor
    func start() {
        invalidate()
        let link = CADisplayLink(target: self, selector: #selector(handleTick))
        if #available(iOS 15.0, *) {
            link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 120, preferred: 60)
        }
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    /// Safe to call from any context — `CADisplayLink.invalidate()` is documented
    /// thread-safe and the run loop drops its strong reference to the proxy.
    func invalidate() {
        displayLink?.invalidate()
        displayLink = nil
    }

    @objc private func handleTick() {
        // CADisplayLink fires on its scheduled run loop (main, here). Hop the
        // closure onto the MainActor explicitly for Swift 6 isolation correctness.
        MainActor.assumeIsolated { onTick() }
    }
}

// MARK: - Reveal Circle Shape

/// Shape animable pour l'effet de révélation circulaire.
struct RevealCircleShape: Shape {
    var progress: CGFloat  // 0 = cercle invisible, 1 = plein écran

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let maxRadius = sqrt(rect.width * rect.width + rect.height * rect.height)
        let radius = maxRadius * progress
        let center = CGPoint(x: rect.midX, y: rect.midY)
        return Path(ellipseIn: CGRect(
            x: center.x - radius, y: center.y - radius,
            width: radius * 2, height: radius * 2
        ))
    }
}

// MARK: - Extracted from StoryViewerView.swift

extension StoryViewerView {

    // MARK: - Text Content

    func storyTextContent(_ content: String, storyEffects: StoryEffects? = nil) -> some View {
        let effects = storyEffects ?? currentStory?.storyEffects
        let position = effects?.textPosition ?? "center"
        let color = effects?.textColor.map { Color(hex: $0) } ?? .white
        let fontStyle = effects?.textStyle ?? "normal"
        let align = effects?.textAlign ?? "center"
        let sizeOverride = effects?.textSize
        let textBg = effects?.textBg
        let offsetY = effects?.textOffsetY ?? 0

        return Text(content)
            .font(fontForStyle(fontStyle, sizeOverride: sizeOverride))
            .foregroundColor(color)
            .multilineTextAlignment(textAlignmentFor(align))
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(
                Group {
                    if let bg = textBg {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(hex: bg).opacity(0.6))
                    }
                }
            )
            .shadow(color: .black.opacity(0.4), radius: 6, y: 2)
            // Neon glow effect for neon text style
            .shadow(
                color: fontStyle == "neon" ? color.opacity(0.7) : .clear,
                radius: fontStyle == "neon" ? 12 : 0
            )
            .shadow(
                color: fontStyle == "neon" ? color.opacity(0.4) : .clear,
                radius: fontStyle == "neon" ? 24 : 0
            )
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: compositeAlignment(position: position, align: align))
            .offset(y: offsetY)
            .accessibilityLabel("Texte de la story: \(content)")
    }

    private func fontForStyle(_ style: String, sizeOverride: CGFloat? = nil) -> Font {
        switch style {
        case "bold":
            return .system(size: sizeOverride ?? 28, weight: .bold, design: .default)
        case "italic":
            return .system(size: sizeOverride ?? 24, weight: .medium, design: .serif).italic()
        case "handwriting":
            return .system(size: sizeOverride ?? 26, weight: .medium, design: .serif)
        case "typewriter":
            return .system(size: sizeOverride ?? 20, weight: .regular, design: .monospaced)
        case "neon":
            return .system(size: sizeOverride ?? 32, weight: .black, design: .rounded)
        case "retro":
            return .system(size: sizeOverride ?? 26, weight: .bold, design: .rounded)
        default:
            return .system(size: sizeOverride ?? 22, weight: .medium)
        }
    }

    private func textAlignmentFor(_ align: String) -> TextAlignment {
        switch align {
        case "left": return .leading
        case "right": return .trailing
        default: return .center
        }
    }

    private func compositeAlignment(position: String, align: String) -> Alignment {
        let v: VerticalAlignment = {
            switch position {
            case "top": return .top
            case "bottom": return .bottom
            default: return .center
            }
        }()
        let h: HorizontalAlignment = {
            switch align {
            case "left": return .leading
            case "right": return .trailing
            default: return .center
            }
        }()
        return Alignment(horizontal: h, vertical: v)
    }

    // MARK: - Media Overlay

    func mediaOverlay(media: FeedMedia, geometry: GeometryProxy) -> some View {
        Group {
            if media.url != nil {
                ProgressiveCachedImage(
                    thumbHash: media.thumbHash,
                    thumbnailUrl: media.thumbnailUrl,
                    fullUrl: media.url
                ) {
                    coloredMediaFallback(media: media)
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: geometry.size.width, height: geometry.size.height)
                .clipped()
            } else {
                coloredMediaFallback(media: media)
            }
        }
        .overlay(alignment: .center) {
            if media.type == .video {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 56))
                    .foregroundColor(.white.opacity(0.8))
                    .shadow(color: .black.opacity(0.4), radius: 8, y: 2)
                    .accessibilityHidden(true)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityLabel(media.type == .video ? "Video de la story" : "Image de la story")
    }

    private func coloredMediaFallback(media: FeedMedia) -> some View {
        LinearGradient(
            colors: [Color(hex: media.thumbnailColor).opacity(0.6), Color(hex: media.thumbnailColor).opacity(0.3)],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // MARK: - Filter Overlay

    var filterOverlay: some View {
        Group {
            if let filter = currentStory?.storyEffects?.filter {
                switch filter {
                case "vintage":
                    Color(hex: "F8B500").opacity(0.15)
                        .blendMode(.multiply)
                case "bw":
                    Color.gray.opacity(0.4)
                        .blendMode(.saturation)
                case "warm":
                    Color(hex: "FF6B6B").opacity(0.1)
                        .blendMode(.softLight)
                case "cool":
                    Color(hex: "08D9D6").opacity(0.1)
                        .blendMode(.softLight)
                default:
                    EmptyView()
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    // MARK: - Unified Drag Gesture (horizontal = groups, vertical = dismiss)

    var unifiedDragGesture: some Gesture {
        DragGesture(minimumDistance: 15, coordinateSpace: .global)
            .onChanged { value in
                guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
                let dx = value.translation.width
                let dy = value.translation.height

                // Decide axis on first significant movement
                if gestureAxis == 0 {
                    if abs(dx) > abs(dy) + 8 {
                        gestureAxis = 1 // horizontal
                        pauseTimer()
                    } else if dy > abs(dx) + 8 && dy > 0 {
                        gestureAxis = 2 // vertical
                        pauseTimer()
                    }
                }

                switch gestureAxis {
                case 1: horizontalDrag = dx
                case 2: if dy > 0 { dragOffset = dy }
                default: break
                }
            }
            .onEnded { value in
                let axis = gestureAxis
                gestureAxis = 0

                guard !isDismissing && !isTransitioning && !isComposerEngaged else {
                    snapBackAll()
                    return
                }

                switch axis {
                case 1: // Horizontal — group navigation
                    let dx = value.translation.width
                    let predicted = value.predictedEndTranslation.width

                    // Transfer interactive drag -> groupSlide (no visual snap)
                    groupSlide += horizontalDrag * 0.5
                    horizontalDrag = 0

                    if (dx < -60 || predicted < -150) && currentGroupIndex < groups.count - 1 {
                        // Swipe left -> next group
                        groupTransition(forward: true) {
                            currentGroupIndex += 1
                            currentStoryIndex = 0
                            progress = 0
                        }
                    } else if (dx > 60 || predicted > 150) && currentGroupIndex > 0 {
                        // Swipe right -> prev group
                        groupTransition(forward: false) {
                            currentGroupIndex -= 1
                            currentStoryIndex = max(0, groups[currentGroupIndex].stories.count - 1)
                            progress = 0
                        }
                    } else {
                        // Snap back — animate groupSlide to 0
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            groupSlide = 0
                        }
                        resumeTimer()
                    }

                case 2: // Vertical — dismiss
                    if value.translation.height > 120 || value.predictedEndTranslation.height > 350 {
                        dismissViewer()
                    } else {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                            dragOffset = 0
                        }
                        resumeTimer()
                    }

                default:
                    snapBackAll()
                }
            }
    }

    private func snapBackAll() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            horizontalDrag = 0
            dragOffset = 0
            groupSlide = 0
        }
        resumeTimer()
    }

    // MARK: - Navigation

    func goToNext() {
        guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
        HapticFeedback.light()
        guard let group = currentGroup else { return }

        if currentStoryIndex < group.stories.count - 1 {
            crossFadeStory {
                currentStoryIndex += 1
                progress = 0
            }
        } else if currentGroupIndex < groups.count - 1 {
            if isPreviewMode {
                isPresented = false
                return
            }
            groupTransition(forward: true) {
                currentGroupIndex += 1
                currentStoryIndex = 0
                progress = 0
            }
        } else {
            if isPreviewMode {
                isPresented = false
                return
            }
            dismissViewer()
        }
    }

    func goToPrevious() {
        guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
        HapticFeedback.light()

        if currentStoryIndex > 0 {
            crossFadeStory {
                currentStoryIndex -= 1
                progress = 0
            }
        } else if currentGroupIndex > 0 {
            groupTransition(forward: false) {
                currentGroupIndex -= 1
                currentStoryIndex = max(0, groups[currentGroupIndex].stories.count - 1)
                progress = 0
            }
        }
    }

    /// True cross-dissolve for stories within the same user.
    /// Old content stays visible (outgoing layer) while new content fades in on top —
    /// eliminates the flash caused by AsyncImage reloading between swaps.
    /// Supports StoryTransitionEffect: fade, zoom, slide, reveal.
    private func crossFadeStory(update: @escaping () -> Void) {
        isTransitioning = true

        // 1. Snapshot current story as outgoing (already rendered, no reload needed)
        outgoingStory = currentStory
        outgoingOpacity = 1
        closingScale = 1.0
        contentOpacity = 0

        let closingEffect = currentStory?.storyEffects?.closing

        // 2. Swap to the incoming story (invisible because contentOpacity = 0)
        update()
        markCurrentViewed()

        // Fire-and-forget prefetch — thumbHash provides instant visual while full image loads
        if let story = currentStory { prefetchAllMedia(for: story) }
        prefetchStory(at: currentStoryIndex + 1)
        prefetchStory(at: currentStoryIndex + 2)

        let incomingEffect = currentStory?.storyEffects?.opening

        switch incomingEffect {
        case .zoom:
            openingScale = 0.88
            textSlideOffset = 0
            isRevealActive = false
        case .slide:
            textSlideOffset = 30
            openingScale = 1.0
            isRevealActive = false
        case .reveal:
            openingScale = 1.0
            textSlideOffset = 0
            isRevealActive = false
        default:
            textSlideOffset = 14
            openingScale = 1.0
            isRevealActive = false
        }

        let animDuration: Double
        let animation: Animation
        switch incomingEffect {
        case .zoom:
            animDuration = 0.4
            animation = .spring(response: 0.4, dampingFraction: 0.75)
        case .slide:
            animDuration = 0.38
            animation = .spring(response: 0.38, dampingFraction: 0.82)
        case .reveal:
            animDuration = 0.4
            animation = .easeOut(duration: 0.4)
        default:
            animDuration = 0.35
            animation = .easeOut(duration: 0.35)
        }

        // 3. Animate immediately — thumbHash provides instant visual while full image loads
        withAnimation(animation) {
            outgoingOpacity = 0
            contentOpacity = 1
            openingScale = 1.0
            textSlideOffset = 0
            if incomingEffect == .reveal { isRevealActive = true }
            if closingEffect == .zoom { closingScale = 1.08 }
        }

        restartTimer()
        DispatchQueue.main.asyncAfter(deadline: .now() + animDuration + 0.04) {
            outgoingStory = nil
            isTransitioning = false
            closingScale = 1.0
        }
    }

    /// Slide transition for navigating between different users' story groups
    private func groupTransition(forward: Bool, update: @escaping () -> Void) {
        guard !isTransitioning else { return }
        isTransitioning = true

        let exitX: CGFloat = forward ? -screenW : screenW
        let enterX: CGFloat = forward ? screenW : -screenW

        // 1. Slide current card off-screen
        withAnimation(.easeIn(duration: 0.2)) {
            groupSlide = exitX
        }

        // 2. Swap content while off-screen, slide new card in immediately
        //    ThumbHash provides instant visual — no need to await prefetch
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            update()
            markCurrentViewed()
            prefetchCurrentGroup()

            groupSlide = enterX
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                groupSlide = 0
            }
            restartTimer()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                isTransitioning = false
            }
        }
    }

    /// Dismiss — shrink to small card and fly toward top
    func dismissViewer() {
        guard !isDismissing else { return }
        isTransitioning = true
        timerCancellable?.cancel()
        // Déclencher le fade-out audio immédiat lors du dismiss
        NotificationCenter.default.post(name: .storyAudioFadeOut, object: nil)

        // isDismissing MUST be inside withAnimation so computed transforms animate
        withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) {
            isDismissing = true
            dragOffset = 0
            horizontalDrag = 0
            groupSlide = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            isPresented = false
        }
    }

    // MARK: - Timer

    /// State-driven pause: the timer checks ALL active UI states each tick
    /// instead of relying on paired pauseTimer/resumeTimer event calls.
    /// `isPaused` is ONLY for direct user gestures (long press, drag).
    private var shouldPauseTimer: Bool {
        isPaused
        || isComposerEngaged
        || hasComposerContent
        || showEmojiStrip
        || showFullEmojiPicker
        || showTextEmojiPicker
        || showLanguageOptions
        || showFullLanguagePicker
        || showCommentsOverlay
        || isTransitioning
        || isDismissing
    }

    func startTimer() {
        timerCancellable?.cancel()
        progress = 0
        isContentReady = false
        hasFiredFadeOut = false
        showCommentsOverlay = false
        replyingToStoryComment = nil
        storyCommentRepliesMap = [:]
        storyCommentExpandedThreads = []
        storyCommentLoadingReplies = []
        loadStoryCommentCount()
        storyReactionCount = currentStory?.reactionCount ?? 0
        updateStoryDuration()
        let duration = computedStoryDuration
        let fadeOutThreshold = max(0, 1.0 - (2.0 / duration))

        // Drive the progress bar from a CADisplayLink instead of `Timer.publish(every: 0.03)`.
        // Two wins:
        // (a) CADisplayLink syncs to the display refresh, auto-pauses when the
        //     app backgrounds, and stops cleanly when invalidated. The Combine
        //     timer kept ticking on background and accumulated wake-ups.
        // (b) A diff-guarded write only commits `progress` when the bar would
        //     visually advance by at least 1/300 (≈1 pixel on a 300pt-wide
        //     viewer). On a 5s story that's ~60 commits total instead of ~165
        //     timer fires — a 2.5x reduction in body re-evaluations of the
        //     storyCard ZStack (audit E1: ~10% CPU continuous).
        //
        // Elapsed time is a PAUSE-AWARE ACCUMULATOR rather than raw wall-clock:
        // each frame adds its delta to `accumulated` ONLY while the timer is not
        // paused AND the slide's real media has loaded (`isContentReady`). This
        // gates the progress bar on content readiness (it stays at 0 until the
        // canvas signals `onContentReady`) and fixes the legacy pause-jump bug
        // where wall-clock kept running behind a sheet/composer/drag pause.
        let accumulated = StoryProgressDisplayLinkProxy.MutableDouble(0)
        let lastFrame = StoryProgressDisplayLinkProxy.MutableDouble(CACurrentMediaTime())
        let lastCommitted = StoryProgressDisplayLinkProxy.MutableDouble(0)
        let proxy = StoryProgressDisplayLinkProxy { [self] in
            let now = CACurrentMediaTime()
            let delta = now - lastFrame.value
            lastFrame.value = now
            guard !shouldPauseTimer, isContentReady else { return }
            accumulated.value += delta
            let raw = min(1.0, CGFloat(accumulated.value / duration))
            if abs(raw - CGFloat(lastCommitted.value)) >= 1.0 / 300.0 || raw >= 1.0 {
                lastCommitted.value = Double(raw)
                progress = raw
            }
            if raw >= fadeOutThreshold && !hasFiredFadeOut {
                hasFiredFadeOut = true
                NotificationCenter.default.post(name: .storyAudioFadeOut, object: nil)
            }
            if raw >= 1.0 {
                goToNext()
            }
        }
        proxy.start()

        // Bridge the proxy lifetime to `timerCancellable` so existing `cancel()`
        // sites at the top of this method, in `restartTimer()`, and in
        // `onDisappear` keep working unchanged. The closure captures `proxy`
        // strongly; cancelling the AnyCancellable invalidates the link.
        timerCancellable = AnyCancellable { proxy.invalidate() }
    }

    /// Restart timer AND clear manual pause (e.g., after drag->transition).
    private func restartTimer() {
        isPaused = false
        startTimer()
    }

    /// Calcule la durée du slide courant en fonction des médias (vidéo/audio).
    /// Minimum 12s pour les slides texte/image seules — l'ancien 5s coupait
    /// trop tôt la lecture des captions et stickers.
    ///
    /// Spec: la story dure `max(longest_media_end_time, configured_slideDuration, 12s_minimum)`.
    /// Avant ce fix, `effects.slideDuration` early-returned et les médias plus longs
    /// que la durée configurée étaient coupés (la vidéo apparaissait quelques
    /// secondes puis disparaissait alors que le son continuait — typique d'un
    /// timer de slide expirant avant la fin du média).
    private func updateStoryDuration() {
        guard let story = currentStory else {
            computedStoryDuration = 12.0
            return
        }
        var maxDuration: Double = 12.0
        let effects = story.storyEffects

        // Configured timeline duration is one CANDIDATE — not authoritative.
        // We always pick the largest of (configured, longest media, minimum).
        if let authoritative = effects?.slideDuration, authoritative > 0 {
            maxDuration = max(maxDuration, Double(authoritative))
        }

        // Durées des médias foreground (composer écrit `placement: "media"`, jamais
        // `"foreground"` — le filtre legacy laissait passer aucun élément, écrasant la
        // durée à 5s pour toute vidéo > 5s). On s'aligne sur les accesseurs partagés.
        for obj in effects?.resolvedForegroundMediaObjects ?? [] {
            let startOffset = Double(obj.startTime ?? 0)
            if let feedMedia = story.media.first(where: { $0.id == obj.postMediaId }),
               let dur = feedMedia.duration, dur > 0 {
                maxDuration = max(maxDuration, startOffset + Double(dur))
            } else if let objDur = obj.duration {
                maxDuration = max(maxDuration, startOffset + Double(objDur))
            }
        }

        // Durées des audio players foreground — même correctif.
        for obj in effects?.resolvedForegroundAudioPlayers ?? [] {
            let startOffset = Double(obj.startTime ?? 0)
            if let feedMedia = story.media.first(where: { $0.id == obj.postMediaId }),
               let dur = feedMedia.duration, dur > 0 {
                maxDuration = max(maxDuration, startOffset + Double(dur))
            } else if let objDur = obj.duration {
                maxDuration = max(maxDuration, startOffset + Double(objDur))
            }
        }

        // Durées des text objects — startTime + duration
        for obj in effects?.textObjects ?? [] {
            let startOffset = obj.startTime ?? 0
            if let dur = obj.duration {
                maxDuration = max(maxDuration, startOffset + dur)
            }
        }

        // Background loop periods — collected here as a separate signal because
        // they DON'T extend the story directly to their full duration (bg
        // audio/video loop). Instead we round the foreground baseline up to
        // the next multiple of each loop period below, so the loop completes
        // its Nth cycle before the slide advances. Without this, a 12s slide
        // with a 5s bg video would cut at 12s mid-third-loop; with it, the
        // slide extends to 15s (3 full cycles).
        var bgLoopPeriods: [Double] = []
        if let bgMedia = effects?.resolvedBackgroundMedia, bgMedia.kind == .video,
           let dur = story.media.first(where: { $0.id == bgMedia.postMediaId })?.duration, dur > 0 {
            bgLoopPeriods.append(Double(dur))
        }
        // Legacy background video (when no canvas mediaObjects).
        if (effects?.mediaObjects ?? []).isEmpty,
           let legacyMedia = story.media.first,
           legacyMedia.type == .video,
           let dur = legacyMedia.duration, dur > 0 {
            bgLoopPeriods.append(Double(dur))
        }
        // Background audio (trimmed range or full clip).
        if let bgAudioId = effects?.backgroundAudioId {
            if let start = effects?.backgroundAudioStart, let end = effects?.backgroundAudioEnd, end > start {
                bgLoopPeriods.append(end - start)
            } else if let feedMedia = story.media.first(where: { $0.id == bgAudioId }),
                      let dur = feedMedia.duration, dur > 0 {
                bgLoopPeriods.append(Double(dur))
            }
        }

        // Pour les vidéos/audios locales en preview, utiliser AVURLAsset si FeedMedia.duration est nil
        if isPreviewMode {
            let capturedVideoURLs = preloadedVideoURLs
            let capturedAudioURLs = preloadedAudioURLs
            let capturedMaxDuration = maxDuration
            let capturedBgPeriods = bgLoopPeriods
            Task { @MainActor in
                var asyncMax = capturedMaxDuration
                for (_, url) in capturedVideoURLs {
                    let asset = AVURLAsset(url: url)
                    if let cmDur = try? await asset.load(.duration) {
                        let dur = CMTimeGetSeconds(cmDur)
                        if dur > 0 && dur.isFinite { asyncMax = max(asyncMax, dur) }
                    }
                }
                for (_, url) in capturedAudioURLs {
                    let asset = AVURLAsset(url: url)
                    if let cmDur = try? await asset.load(.duration) {
                        let dur = CMTimeGetSeconds(cmDur)
                        if dur > 0 && dur.isFinite { asyncMax = max(asyncMax, dur) }
                    }
                }
                computedStoryDuration = Self.roundedUpToBgLoops(baseDuration: asyncMax,
                                                                bgLoopPeriods: capturedBgPeriods)
            }
            return
        }

        computedStoryDuration = Self.roundedUpToBgLoops(baseDuration: maxDuration,
                                                        bgLoopPeriods: bgLoopPeriods)
    }

    /// For each background loop period, round the base duration up to the
    /// nearest multiple of that period. Take the maximum across all bg
    /// sources so the longest-period bg media completes its last cycle.
    /// Sub-millisecond periods are ignored (avoid div-by-zero / pathological
    /// results from corrupt metadata).
    static func roundedUpToBgLoops(baseDuration: Double, bgLoopPeriods: [Double]) -> Double {
        var effective = baseDuration
        for period in bgLoopPeriods where period > 0.001 {
            let cycles = (baseDuration / period).rounded(.up)
            let extended = cycles * period
            if extended > effective { effective = extended }
        }
        return effective
    }

    /// Manual pause — only for direct gesture holds (long press, drag).
    func pauseTimer() { isPaused = true }

    /// Manual resume — only for ending gesture holds.
    func resumeTimer() { isPaused = false }

    // MARK: - Initial Action (Phase F — notification entry point)

    /// Honours the optional `initialAction` (set when this viewer was launched
    /// from a story notification redirect). The 250 ms delay lets the
    /// fullScreenCover finish its presentation animation and lets the canvas
    /// (media + progress bars) mount one frame, otherwise the comments overlay
    /// or viewers sheet animates in over a half-blank screen on cold start.
    /// Idempotent via `hasTriggeredInitialAction` — repeated `.onAppear` calls
    /// (scene phase, parent re-renders) are no-ops.
    func triggerInitialActionIfNeeded() {
        guard let action = initialAction, !hasTriggeredInitialAction else { return }
        hasTriggeredInitialAction = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            switch action {
            case .showCommentsOverlay:
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showCommentsOverlay = true
                }
                pauseTimer()
                if storyComments.isEmpty {
                    loadStoryComments()
                }
            case .showViewersSheet:
                showViewersSheet = true
                pauseTimer()
            }
        }
    }

    // MARK: - Dismiss Composer

    func dismissComposer() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil
        )
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showTextEmojiPicker = false
            showFullEmojiPicker = false
        }
        isComposerEngaged = false
    }

    // MARK: - Actions

    func sendComment(text: String, effectFlags: Int? = nil, parentId: String? = nil) {
        guard !text.isEmpty, let story = currentStory else { return }

        // Optimistic local insert. Reply nesting is currently flat in the UI
        // (Threads-style max-1-niveau pour MVP) — the parentId is forwarded
        // to the backend so the comment graph stays correct, but rendering
        // does not yet visually indent replies. See SOTA audit Pilier 19.
        let currentUser = AuthManager.shared.currentUser
        let authorName: String = currentUser?.displayName ?? currentUser?.username ?? "Moi"
        let authorId: String = currentUser?.id ?? ""
        let optimisticComment = FeedComment(
            id: "temp_\(UUID().uuidString)",
            author: authorName,
            authorId: authorId,
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            content: text,
            parentId: parentId,
            effectFlags: effectFlags ?? 0,
            originalLanguage: composerLanguage
        )

        if let parentId {
            // Reply — insert into repliesMap so it appears in the thread
            var existing = storyCommentRepliesMap[parentId] ?? []
            existing.append(optimisticComment)
            storyCommentRepliesMap[parentId] = existing
            // Also increment the reply count on the parent comment
            if let idx = storyComments.firstIndex(where: { $0.id == parentId }) {
                storyComments[idx].replies += 1
            }
            // Counter now sums top-level + replies, so it must also bump here.
            storyCommentCount += 1
        } else {
            // Top-level comment
            storyComments.append(optimisticComment)
            storyCommentCount += 1
        }

        // Send to API
        let language = composerLanguage
        Task {
            var body: [String: AnyCodable] = [
                "content": AnyCodable(text),
                "originalLanguage": AnyCodable(language),
            ]
            if let effectFlags {
                body["effectFlags"] = AnyCodable(effectFlags)
            }
            if let parentId {
                body["parentId"] = AnyCodable(parentId)
            }
            let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
                endpoint: "/posts/\(story.id)/comments",
                body: body
            )
        }

        // Dismiss composer and give feedback
        DispatchQueue.main.async {
            HapticFeedback.success()
            self.dismissComposer()
            self.storyDrafts.removeValue(forKey: story.id)
        }
    }

    func sendReaction(emoji: String) {
        guard let story = currentStory else { return }

        // Fire & forget like
        Task {
            let body = ReactionRequest(emoji: emoji)
            let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
                endpoint: "/posts/\(story.id)/like",
                body: body
            )
        }
    }

    func shareStory() {
        guard let story = currentStory else { return }
        let shareURL = "https://meeshy.me/story/\(story.id)"
        let activityVC = UIActivityViewController(activityItems: [shareURL], applicationActivities: nil)
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootVC = windowScene.windows.first?.rootViewController {
            var topVC = rootVC
            while let presented = topVC.presentedViewController { topVC = presented }
            activityVC.popoverPresentationController?.sourceView = topVC.view
            topVC.present(activityVC, animated: true)
        }
    }

    // MARK: - Story Time Remaining

    func storyTimeRemaining(_ expiresAt: Date) -> String {
        let seconds = Int(expiresAt.timeIntervalSinceNow)
        if seconds <= 0 { return "expire bientot" }
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        if hours > 0 {
            return "expire dans \(hours)h"
        }
        return "expire dans \(minutes)min"
    }

    // MARK: - Delete Story

    func deleteCurrentStory() {
        guard let story = currentStory else { return }
        HapticFeedback.light()
        
        Task {
            let success = await viewModel.deleteStory(storyId: story.id)
            DispatchQueue.main.async {
                if success {
                    HapticFeedback.success()
                    dismissViewer()
                } else {
                    HapticFeedback.error()
                }
            }
        }
    }

    // MARK: - Mark Viewed

    func markCurrentViewed() {
        if let story = currentStory {
            viewModel.markViewed(storyId: story.id)
        }
    }

    // MARK: - Prefetch

    /// Précharge tous les médias d'une story : legacy media, mediaObjects, audioPlayerObjects, backgroundAudio.
    /// Retourne un Task awaitable pour permettre de bloquer sur le chargement si nécessaire.
    @discardableResult
    private func prefetchAllMedia(for story: StoryItem) -> Task<Void, Never> {
        var urls: [String] = []

        urls.append(contentsOf: story.media.compactMap(\.url))

        if let mediaObjs = story.storyEffects?.mediaObjects {
            for obj in mediaObjs {
                if let urlStr = story.media.first(where: { $0.id == obj.postMediaId })?.url {
                    urls.append(urlStr)
                }
            }
        }

        if let audioObjs = story.storyEffects?.audioPlayerObjects {
            for obj in audioObjs {
                if let urlStr = story.media.first(where: { $0.id == obj.postMediaId })?.url {
                    urls.append(urlStr)
                }
            }
        }

        if let bgAudioId = story.storyEffects?.backgroundAudioId {
            if let urlStr = story.media.first(where: { $0.id == bgAudioId })?.url {
                urls.append(urlStr)
            }
        }

        let uniqueURLs = Array(Set(urls))
        return Task {
            let imageStore = await CacheCoordinator.shared.images
            for urlString in uniqueURLs {
                let mediaType = story.media.first(where: { $0.url == urlString })?.type
                if mediaType == .video || mediaType == .audio {
                    // Video/Audio: download data to disk cache + preroll player
                    _ = try? await imageStore.data(for: urlString)
                    if let url = URL(string: urlString) {
                        await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
                    }
                } else {
                    // Image: use image(for:) to populate UIImage NSCache for instant display
                    _ = await imageStore.image(for: urlString)
                }
            }
        }
    }

    /// Précharge la story à l'index donné dans le groupe actuel.
    @discardableResult
    func prefetchStory(at index: Int) -> Task<Void, Never>? {
        guard currentGroupIndex < groups.count else { return nil }
        let stories = groups[currentGroupIndex].stories
        guard index >= 0, index < stories.count else { return nil }
        return prefetchAllMedia(for: stories[index])
    }

    /// Précharge toutes les stories du groupe actuel + les 2 premières du groupe suivant.
    func prefetchCurrentGroup() {
        guard currentGroupIndex >= 0, currentGroupIndex < groups.count else { return }

        groups[currentGroupIndex].stories.forEach { prefetchAllMedia(for: $0) }

        let nextGroupIdx = currentGroupIndex + 1
        if nextGroupIdx < groups.count {
            let nextStories = groups[nextGroupIdx].stories
            for i in 0..<min(2, nextStories.count) {
                prefetchAllMedia(for: nextStories[i])
            }
        }
    }
}

// MARK: - Story Viewers Sheet

struct StoryViewerItem: Identifiable {
    let id: String
    let username: String
    let displayName: String
    let avatarUrl: String?
    let viewedAt: Date
    let reactionEmoji: String?
    let replyContent: String?
    let hasReshared: Bool
}

struct StoryViewersSheet: View {
    @Environment(\.dismiss) private var dismiss
    let story: StoryItem
    let accentColor: Color

    @State private var viewers: [StoryViewerItem] = []
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            ZStack {
                ThemeManager.shared.mode.isDark ? Color.black.ignoresSafeArea() : Color(UIColor.systemGroupedBackground).ignoresSafeArea()

                if isLoading {
                    ProgressView("Chargement des vues...")
                        .tint(accentColor)
                } else if viewers.isEmpty {
                    EmptyStateView(
                        icon: "eye.slash",
                        title: "Aucune vue pour le moment",
                        subtitle: "Les personnes qui regardent votre story apparaîtront ici."
                    )
                } else {
                    List {
                        Section(header: Text("\(viewers.count) Vues")
                            .font(.headline)
                            .foregroundColor(.primary)
                            .textCase(nil)
                        ) {
                            ForEach(viewers) { viewer in
                                viewerRow(viewer)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Vues")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") {
                        dismiss()
                    }
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(accentColor)
                }
            }
            .task {
                await loadViewers()
            }
        }
    }

    private func viewerRow(_ viewer: StoryViewerItem) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: viewer.displayName,
                context: .storyViewer,
                avatarURL: viewer.avatarUrl
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(viewer.displayName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)

                    if viewer.hasReshared {
                        Image(systemName: "arrow.2.squarepath")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(accentColor)
                    }

                    Spacer()

                    Text(viewer.viewedAt, style: .time)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }

                if let reply = viewer.replyContent {
                    HStack(spacing: 6) {
                        Image(systemName: "arrowshape.turn.up.left.fill")
                            .font(.system(size: 10))
                        Text(reply)
                            .font(.system(size: 14))
                            .lineLimit(1)
                    }
                    .foregroundColor(.secondary)
                } else if let reaction = viewer.reactionEmoji {
                    HStack(spacing: 6) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.red)
                        Text(reaction)
                            .font(.system(size: 14))
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowBackground(ThemeManager.shared.mode.isDark ? Color(UIColor.secondarySystemGroupedBackground) : Color.white)
    }

    struct ViewersResponse: Decodable {
        struct ViewerApi: Decodable {
            let id: String
            let username: String
            let displayName: String?
            let avatarUrl: String?
            let viewedAt: Date?
            let reaction: String?
        }
        let viewers: [ViewerApi]
    }

    private func loadViewers() async {
        let response: APIResponse<ViewersResponse>? = try? await APIClient.shared.request(endpoint: "/posts/\(story.id)/interactions")

        await MainActor.run {
            if let apiViewers = response?.data.viewers {
                self.viewers = apiViewers.map { v in
                    StoryViewerItem(
                        id: v.id,
                        username: v.username,
                        displayName: v.displayName ?? v.username,
                        avatarUrl: v.avatarUrl,
                        viewedAt: v.viewedAt ?? Date(),
                        reactionEmoji: v.reaction,
                        replyContent: nil,
                        hasReshared: false
                    )
                }
            }
            self.isLoading = false
        }
    }
}

// MARK: - Story Comments Overlay (live-chat style with replies)

/// Full-featured comment overlay: occupies bottom half of screen with
/// infinite scroll, reply threading (simple indentation), inline
/// UniversalComposerBar, and timer pause. All other controls except
/// the composer are hidden.
///
/// Extracted from `StoryViewerView.storyCommentsOverlay` (formerly an
/// `AnyView`) so the deeply-nested comment panel becomes its own
/// type-metadata unit instead of inflating the viewer's opaque type.
struct StoryCommentsOverlayView: View {
    let storyComments: [FeedComment]
    let storyCommentCount: Int
    let storyCommentRepliesMap: [String: [FeedComment]]
    let storyCommentExpandedThreads: Set<String>
    let storyCommentLoadingReplies: Set<String>
    let isLoadingComments: Bool
    let userLang: String
    let composerAccentColor: String

    @Binding var showCommentsOverlay: Bool
    @Binding var replyingToStoryComment: FeedComment?
    @Binding var composerLanguage: String
    @Binding var commentEffects: MessageEffects
    @Binding var commentBlurEnabled: Bool

    let makeStoryCommentRow: (FeedComment, String) -> StoryCommentRowView
    let toggleStoryCommentThread: (String) async -> Void
    let sendComment: (_ text: String, _ effectFlags: Int?, _ parentId: String?) -> Void

    private var topLevelComments: [FeedComment] {
        storyComments.filter { $0.parentId == nil }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Tap-to-dismiss upper half
            Color.black.opacity(0.3)
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showCommentsOverlay = false
                        replyingToStoryComment = nil
                    }
                }
                .frame(maxHeight: .infinity)

            // Comment panel — bottom half
            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("\(storyCommentCount) commentaire\(storyCommentCount > 1 ? "s" : "")")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)

                    Spacer()

                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showCommentsOverlay = false
                            replyingToStoryComment = nil
                        }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white.opacity(0.6))
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(Color.white.opacity(0.1)))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

                Divider()
                    .background(Color.white.opacity(0.1))

                // Scrollable comments
                ScrollViewReader { proxy in
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVStack(alignment: .leading, spacing: 6) {
                            ForEach(topLevelComments) { comment in
                                makeStoryCommentRow(comment, userLang)
                                    .id(comment.id)

                                let replies = storyCommentRepliesMap[comment.id] ?? []
                                let autoPreview = Array(replies.prefix(2))
                                if !autoPreview.isEmpty && !storyCommentExpandedThreads.contains(comment.id) {
                                    ForEach(autoPreview) { reply in
                                        makeStoryCommentRow(reply, userLang)
                                            .padding(.leading, 32)
                                            .id(reply.id)
                                    }
                                }

                                if comment.replies > 2 {
                                    Button {
                                        HapticFeedback.light()
                                        Task { await toggleStoryCommentThread(comment.id) }
                                    } label: {
                                        HStack(spacing: 4) {
                                            Image(systemName: storyCommentExpandedThreads.contains(comment.id) ? "chevron.up" : "chevron.down")
                                                .font(.system(size: 9, weight: .bold))
                                            let remaining = max(0, comment.replies - 2)
                                            Text(storyCommentExpandedThreads.contains(comment.id)
                                                 ? "Masquer"
                                                 : "Voir \(remaining) autre\(remaining > 1 ? "s" : "") r\u{00E9}ponse\(remaining > 1 ? "s" : "")")
                                                .font(.system(size: 11, weight: .semibold))
                                        }
                                        .foregroundColor(Color(hex: comment.authorColor))
                                        .padding(.leading, 40)
                                        .padding(.vertical, 4)
                                    }
                                }

                                if storyCommentExpandedThreads.contains(comment.id) {
                                    if storyCommentLoadingReplies.contains(comment.id) && replies.isEmpty {
                                        HStack {
                                            Spacer()
                                            ProgressView().tint(.white.opacity(0.5)).scaleEffect(0.7)
                                            Spacer()
                                        }
                                        .padding(.leading, 32)
                                        .padding(.vertical, 4)
                                    }

                                    ForEach(replies) { reply in
                                        makeStoryCommentRow(reply, userLang)
                                            .padding(.leading, 32)
                                            .id(reply.id)
                                    }
                                }
                            }

                            if isLoadingComments {
                                HStack {
                                    Spacer()
                                    ProgressView()
                                        .tint(.white.opacity(0.6))
                                    Spacer()
                                }
                                .padding(.vertical, 8)
                            }

                            if topLevelComments.isEmpty && !isLoadingComments {
                                VStack(spacing: 8) {
                                    Image(systemName: "bubble.left.and.bubble.right")
                                        .font(.system(size: 28))
                                        .foregroundColor(.white.opacity(0.3))
                                    Text("Pas encore de commentaires")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(.white.opacity(0.5))
                                    Text("Soyez le premier \u{00E0} commenter !")
                                        .font(.system(size: 11))
                                        .foregroundColor(.white.opacity(0.3))
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 32)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.top, 8)
                        .padding(.bottom, 12)
                    }
                    .onChange(of: storyComments.count) { _, _ in
                        if let last = storyComments.last {
                            withAnimation(.easeOut(duration: 0.3)) {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                    .onChange(of: replyingToStoryComment?.id) { _, newId in
                        // Bring the target into view so the user sees what they're
                        // replying to even if it was off-screen.
                        guard let id = newId else { return }
                        withAnimation(.easeOut(duration: 0.3)) {
                            proxy.scrollTo(id, anchor: .center)
                        }
                    }
                }

                // Inline composer for story comments (reply banner attached inside)
                storyCommentComposerBar
            }
            .frame(maxHeight: UIScreen.main.bounds.height * 0.5)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(Color.black.opacity(0.6))
                    )
                    .ignoresSafeArea(edges: .bottom)
            )
        }
    }

    // MARK: - Story Comment Composer

    private var storyCommentComposerBar: some View {
        let replyContext = replyingToStoryComment
        return UniversalComposerBar(
            style: .dark,
            mode: .comment,
            accentColor: replyContext?.authorColor ?? composerAccentColor,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onSend: { text in
                let effects = commentEffects
                let blur = commentBlurEnabled
                commentEffects = .none
                commentBlurEnabled = false
                let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
                let effectFlags = flags > 0 ? Int(flags) : nil
                let parentId = replyingToStoryComment?.id
                replyingToStoryComment = nil
                sendComment(text, effectFlags, parentId)
            },
            replyBanner: replyContext.map { reply in
                AnyView(
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(hex: reply.authorColor))
                            .frame(width: 3, height: 30)

                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 4) {
                                Image(systemName: "arrowshape.turn.up.left.fill")
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundColor(Color(hex: reply.authorColor))
                                Text("R\u{00E9}ponse \u{00E0} \(reply.author)")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(Color(hex: reply.authorColor))
                            }
                            Text(reply.displayContent)
                                .font(.system(size: 11))
                                .foregroundColor(.white.opacity(0.6))
                                .lineLimit(1)
                        }

                        Spacer()

                        Button {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                replyingToStoryComment = nil
                            }
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white.opacity(0.6))
                                .frame(width: 22, height: 22)
                                .background(Circle().fill(Color.white.opacity(0.12)))
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(hex: reply.authorColor).opacity(0.18))
                    .overlay(
                        Rectangle()
                            .fill(Color(hex: reply.authorColor).opacity(0.35))
                            .frame(height: 0.5),
                        alignment: .bottom
                    )
                )
            },
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects
        )
        .padding(.horizontal, 8)
        .padding(.bottom, 4)
    }
}

extension StoryViewerView {

    // MARK: - Story Comment Thread Management

    func toggleStoryCommentThread(_ commentId: String) async {
        if storyCommentExpandedThreads.contains(commentId) {
            storyCommentExpandedThreads.remove(commentId)
        } else {
            storyCommentExpandedThreads.insert(commentId)
            // Always refetch to get latest replies
            await loadStoryCommentReplies(commentId: commentId)
        }
    }

    func loadStoryCommentReplies(commentId: String) async {
        guard let story = currentStory,
              !storyCommentLoadingReplies.contains(commentId) else { return }
        storyCommentLoadingReplies.insert(commentId)
        defer { storyCommentLoadingReplies.remove(commentId) }
        do {
            let response = try await PostService.shared.getCommentReplies(
                postId: story.id, commentId: commentId
            )
            let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
            let replies = response.data.map { c -> FeedComment in
                let translated = PostDetailViewModel.resolveCommentTranslation(
                    translations: c.translations, originalLanguage: c.originalLanguage,
                    preferredLanguages: langs
                )
                return FeedComment(
                    id: c.id, author: c.author.name, authorId: c.author.id,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: commentId,
                    originalLanguage: c.originalLanguage, translatedContent: translated
                )
            }
            storyCommentRepliesMap[commentId] = replies
        } catch {
            storyCommentExpandedThreads.remove(commentId)
        }
    }

    func makeStoryCommentRow(_ comment: FeedComment, userLang: String) -> StoryCommentRowView {
        StoryCommentRowView(
            comment: comment,
            userLang: userLang,
            isLiked: storyCommentLikedIds.contains(comment.id),
            likeCount: max(0, comment.likes + (storyCommentLikeDelta[comment.id] ?? 0)),
            isInFlight: heartInFlightIds.contains(comment.id),
            onReply: {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    replyingToStoryComment = comment
                }
                HapticFeedback.light()
            },
            onToggleLike: {
                HapticFeedback.light()
                Task { await toggleStoryCommentLike(comment) }
            }
        )
    }

    // MARK: - Story Comment Reactions

    func toggleStoryCommentLike(_ comment: FeedComment) async {
        let id = comment.id
        guard !heartInFlightIds.contains(id) else { return }
        heartInFlightIds.insert(id)
        defer { heartInFlightIds.remove(id) }

        let wasLiked = storyCommentLikedIds.contains(id)
        let postId = currentStory?.id ?? ""

        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            if wasLiked {
                storyCommentLikedIds.remove(id)
                storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) - 1
            } else {
                storyCommentLikedIds.insert(id)
                storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) + 1
            }
        }

        do {
            if wasLiked {
                _ = try await SocialSocketManager.shared.removeCommentReaction(commentId: id, postId: postId, emoji: StoryViewerView.heartEmoji)
            } else {
                _ = try await SocialSocketManager.shared.addCommentReaction(commentId: id, postId: postId, emoji: StoryViewerView.heartEmoji)
            }
        } catch {
            withAnimation {
                if wasLiked {
                    storyCommentLikedIds.insert(id)
                    storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) + 1
                } else {
                    storyCommentLikedIds.remove(id)
                    storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) - 1
                }
            }
        }
    }

    // MARK: - Load Comments

    static func computeLikedIds(from comments: [APIPostComment]) -> Set<String> {
        return Set(
            comments
                .filter { $0.currentUserReactions?.contains(StoryViewerView.heartEmoji) == true }
                .map { $0.id }
        )
    }

    func loadStoryComments() {
        guard let story = currentStory, !isLoadingComments else { return }
        Task { await loadStoryCommentsAsync(story: story) }
    }

    private func loadStoryCommentsAsync(story: StoryItem) async {
        let cacheKey = "post-\(story.id)"

        let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
        switch cached {
        case .fresh(let comments, _):
            storyComments = comments
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
            return
        case .stale(let comments, _):
            storyComments = comments
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
        case .expired, .empty:
            isLoadingComments = true
        }

        await fetchStoryCommentsFromNetwork(story: story, cacheKey: cacheKey)
        isLoadingComments = false
    }

    private func fetchStoryCommentsFromNetwork(story: StoryItem, cacheKey: String) async {
        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        do {
            let response = try await PostService.shared.getComments(postId: story.id, cursor: nil, limit: 50)
            let comments = response.data.map { c -> FeedComment in
                let translated: String? = {
                    guard let dict = c.translations else { return nil }
                    for lang in langs {
                        if let entry = dict[lang] { return entry.text }
                    }
                    return nil
                }()
                return FeedComment(
                    id: c.id, author: c.author.name, authorId: c.author.id,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: c.parentId,
                    originalLanguage: c.originalLanguage, translatedContent: translated
                )
            }
            storyComments = comments
            storyCommentLikedIds = Self.computeLikedIds(from: response.data)
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
            try? await CacheCoordinator.shared.comments.save(comments, for: cacheKey)

            let topLevel = topAll.filter { $0.replies > 0 }
            Task {
                for comment in topLevel.prefix(5) {
                    await loadStoryCommentReplies(commentId: comment.id)
                }
            }
        } catch {}
    }

    func loadStoryCommentCount() {
        guard let story = currentStory else {
            storyCommentCount = 0
            storyComments = []
            return
        }

        storyCommentCount = story.commentCount

        Task {
            let cacheKey = "post-\(story.id)"
            let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
            switch cached {
            case .fresh(let comments, _):
                let top = comments.filter { $0.parentId == nil }
                let total = top.count + top.reduce(0) { $0 + $1.replies }
                if total != storyCommentCount { storyCommentCount = total }
                return
            case .stale(let comments, _):
                let top = comments.filter { $0.parentId == nil }
                let total = top.count + top.reduce(0) { $0 + $1.replies }
                if total != storyCommentCount { storyCommentCount = total }
            case .expired, .empty:
                break
            }
            do {
                let response = try await PostService.shared.getComments(postId: story.id, cursor: nil, limit: 50)
                if response.success {
                    let top = response.data.filter { $0.parentId == nil }
                    let totalReplies = top.reduce(0) { $0 + ($1.replyCount ?? 0) }
                    let total = top.count + totalReplies
                    if total != storyCommentCount { storyCommentCount = total }
                }
            } catch {}
        }
    }
}

// MARK: - Story Comment Row View
//
// Modern bubble-style row used by the story viewer comments overlay.
// - Background tinted with the author's accent color (mirrors post comment cards).
// - Header pair of language flags lets the viewer toggle between original and
//   prisme-translated content without leaving the overlay.
// - Heart reaction + Reply CTAs sit below the text in their own action row.
struct StoryCommentRowView: View, Equatable {
    let comment: FeedComment
    let userLang: String
    let isLiked: Bool
    let likeCount: Int
    var isInFlight: Bool = false
    let onReply: () -> Void
    let onToggleLike: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.comment.id == rhs.comment.id &&
        lhs.isLiked == rhs.isLiked &&
        lhs.likeCount == rhs.likeCount &&
        lhs.isInFlight == rhs.isInFlight &&
        lhs.comment.content == rhs.comment.content &&
        lhs.comment.translatedContent == rhs.comment.translatedContent
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showOriginal: Bool = false

    private var hasTranslation: Bool {
        comment.translatedContent != nil && comment.originalLanguage != nil
    }

    private var displayContent: String {
        if showOriginal { return comment.content }
        return comment.translatedContent ?? comment.content
    }

    private var bubbleColor: Color { Color(hex: comment.authorColor) }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            avatar

            VStack(alignment: .leading, spacing: 4) {
                headerRow
                contentText
                actionRow
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(bubbleColor.opacity(0.18))
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(bubbleColor.opacity(0.35), lineWidth: 0.5)
            }
        )
    }

    @ViewBuilder
    private var avatar: some View {
        Group {
            if let avatarURL = comment.authorAvatarURL,
               let url = MeeshyConfig.resolveMediaURL(avatarURL) {
                CachedAsyncImage(url: url.absoluteString, targetSize: CGSize(width: 32, height: 32)) {
                    Circle().fill(bubbleColor)
                }
            } else {
                Circle()
                    .fill(bubbleColor)
                    .overlay(
                        Text(String(comment.author.prefix(1)).uppercased())
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                    )
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(bubbleColor.opacity(0.55), lineWidth: 1))
    }

    private var headerRow: some View {
        HStack(spacing: 6) {
            Text(comment.author)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundColor(bubbleColor)

            if hasTranslation {
                Text("\u{00B7}").font(.system(size: 10)).foregroundColor(.white.opacity(0.35))
                languageSwitcher
            }

            Text("\u{00B7}").font(.system(size: 10)).foregroundColor(.white.opacity(0.35))

            Text(comment.timestamp, style: .relative)
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.5))
        }
    }

    private var languageSwitcher: some View {
        let origCode = comment.originalLanguage
        let origDisplay = LanguageDisplay.from(code: origCode)
        let targetDisplay = LanguageDisplay.from(code: userLang)

        return HStack(spacing: 4) {
            languageFlag(
                flag: origDisplay?.flag ?? "?",
                color: origDisplay?.color ?? LanguageDisplay.defaultColor,
                isActive: showOriginal
            )
            .onTapGesture {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showOriginal = true
                }
                HapticFeedback.light()
            }

            languageFlag(
                flag: targetDisplay?.flag ?? "?",
                color: targetDisplay?.color ?? LanguageDisplay.defaultColor,
                isActive: !showOriginal
            )
            .onTapGesture {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showOriginal = false
                }
                HapticFeedback.light()
            }

            Image(systemName: "translate")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(MeeshyColors.indigo400.opacity(0.85))
        }
    }

    private func languageFlag(flag: String, color: String, isActive: Bool) -> some View {
        VStack(spacing: 1) {
            Text(flag)
                .font(.system(size: isActive ? 12 : 10))
                .scaleEffect(isActive ? 1.05 : 1.0)
            if isActive {
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color(hex: color))
                    .frame(width: 10, height: 1.5)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: isActive)
    }

    private var contentText: some View {
        Text(displayContent)
            .font(.system(size: 13.5))
            .foregroundColor(.white.opacity(0.95))
            .lineLimit(6)
            .multilineTextAlignment(.leading)
            .animation(.easeInOut(duration: 0.2), value: showOriginal)
            .messageEffects(comment.effects, hasPlayedAppearance: true)
    }

    private var actionRow: some View {
        HStack(spacing: 16) {
            Button {
                withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.6)) {
                    onToggleLike()
                }
            } label: {
                HStack(spacing: 3) {
                    Image(systemName: isLiked ? "heart.fill" : "heart")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(isLiked ? MeeshyColors.error : .white.opacity(0.55))
                        .scaleEffect(isLiked ? 1.15 : 1.0)
                    if likeCount > 0 {
                        Text("\(likeCount)")
                            .font(.system(size: 10.5, weight: .semibold))
                            .foregroundColor(isLiked ? MeeshyColors.error : .white.opacity(0.6))
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isInFlight)
            .frame(minHeight: 44)

            Button(action: onReply) {
                HStack(spacing: 3) {
                    Image(systemName: "arrowshape.turn.up.left")
                        .font(.system(size: 11, weight: .semibold))
                    Text("R\u{00E9}pondre")
                        .font(.system(size: 10.5, weight: .semibold))
                }
                .foregroundColor(.white.opacity(0.6))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)

            Spacer()
        }
        .padding(.top, 2)
    }
}

// MARK: - Story Action Button

/// Single circular action button used in the story viewer's right sidebar.
/// Extracted from `StoryViewerView.storyActionButton(...)` so the sidebar
/// no longer inlines this subtree ~9 times into one opaque type.
struct StoryActionButton: View {
    let icon: String
    let label: String
    var isActive: Bool = false
    var activeColor: Color = .white
    var activeGlow: Color? = nil
    let action: () -> Void

    var body: some View {
        Button {
            action()
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    // Outer glow when active
                    if isActive, let glow = activeGlow {
                        Circle()
                            .fill(glow.opacity(0.2))
                            .frame(width: 52, height: 52)
                            .blur(radius: 4)
                    }

                    Circle()
                        .fill(isActive ? activeColor.opacity(0.15) : Color.white.opacity(0.08))
                        .overlay(
                            Circle()
                                .stroke(
                                    isActive ?
                                        AnyShapeStyle(activeColor.opacity(0.4)) :
                                        AnyShapeStyle(Color.white.opacity(0.15)),
                                    lineWidth: isActive ? 1 : 0.5
                                )
                        )
                        .frame(width: 46, height: 46)

                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(isActive ? activeColor : .white)
                        .symbolEffect(.bounce, value: isActive)
                }
                .shadow(
                    color: isActive ? (activeGlow ?? activeColor).opacity(0.3) : .black.opacity(0.2),
                    radius: isActive ? 8 : 4,
                    y: isActive ? 0 : 2
                )

                Text(label)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(isActive ? 0.95 : 0.65))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 56)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityHint(isActive ? "\(label) actif, toucher pour desactiver" : "Toucher pour \(label.lowercased())")
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }
}

// MARK: - Story Progress Bars

/// Segmented progress indicator for the story viewer's current group.
/// Extracted from `StoryViewerView.progressBars` so the header layer no
/// longer inlines a `ForEach` / `GeometryReader` subtree into the viewer's
/// opaque type.
struct StoryProgressBarsView: View {
    let group: StoryGroup?
    let currentIndex: Int
    let progress: CGFloat

    var body: some View {
        HStack(spacing: 3) {
            if let group {
                ForEach(Array(group.stories.enumerated()), id: \.element.id) { index, _ in
                    GeometryReader { barGeo in
                        let w = width(for: index, totalWidth: barGeo.size.width)
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.2))
                            Capsule()
                                .fill(
                                    index == currentIndex ?
                                    AnyShapeStyle(LinearGradient(
                                        colors: [MeeshyColors.indigo500, MeeshyColors.error, MeeshyColors.indigo400],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )) :
                                    AnyShapeStyle(Color.white)
                                )
                                .frame(width: w)
                                .shadow(
                                    color: index == currentIndex ? MeeshyColors.indigo500.opacity(0.6) : .clear,
                                    radius: 4, y: 0
                                )
                        }
                    }
                    .frame(height: 3)
                    .accessibilityHidden(true)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Story \(currentIndex + 1) sur \(group?.stories.count ?? 0)")
        .accessibilityValue("\(Int(progress * 100)) pourcent")
    }

    private func width(for index: Int, totalWidth: CGFloat) -> CGFloat {
        if index < currentIndex {
            return totalWidth
        } else if index == currentIndex {
            return totalWidth * progress
        } else {
            return 0
        }
    }
}
