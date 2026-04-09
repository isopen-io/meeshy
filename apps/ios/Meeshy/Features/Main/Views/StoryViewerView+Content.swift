import SwiftUI
import Combine
import AVFoundation
import MeeshySDK
import MeeshyUI

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

    // MARK: - Gesture Overlay

    func gestureOverlay(geometry: GeometryProxy) -> some View {
        HStack(spacing: 0) {
            // Left half — previous
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    if isComposerEngaged { dismissComposer(); return }
                    goToPrevious()
                }
                .accessibilityLabel("Story precedente")
                .accessibilityHint("Toucher pour revenir a la story precedente")
                .accessibilityAddTraits(.isButton)

            // Right half — next
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    if isComposerEngaged { dismissComposer(); return }
                    goToNext()
                }
                .accessibilityLabel("Story suivante")
                .accessibilityHint("Toucher pour passer a la story suivante")
                .accessibilityAddTraits(.isButton)
        }
        // Exclude the bottom composer zone from tap targets
        .padding(.bottom, 120 + geometry.safeAreaInsets.bottom)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.2)
                .onChanged { _ in
                    guard !isComposerEngaged else { return }
                    pauseTimer()
                }
                .onEnded { _ in
                    guard !isComposerEngaged else { return }
                    resumeTimer()
                }
        )
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

    private func goToNext() {
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

    private func goToPrevious() {
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
        || isTransitioning
        || isDismissing
    }

    func startTimer() {
        timerCancellable?.cancel()
        progress = 0
        hasFiredFadeOut = false
        showCommentsOverlay = false
        loadStoryCommentCount()
        updateStoryDuration()
        let duration = computedStoryDuration
        let interval: Double = 0.03
        let increment = CGFloat(interval / duration)
        let fadeOutThreshold = max(0, 1.0 - (2.0 / duration))

        timerCancellable = Timer.publish(every: interval, on: .main, in: .common)
            .autoconnect()
            .sink { _ in
                guard !shouldPauseTimer else { return }
                if progress >= 1.0 {
                    goToNext()
                } else {
                    progress += increment
                    // Déclencher le fade-out audio 2s avant la fin
                    if progress >= fadeOutThreshold && !hasFiredFadeOut {
                        hasFiredFadeOut = true
                        NotificationCenter.default.post(name: .storyAudioFadeOut, object: nil)
                    }
                }
            }
    }

    /// Restart timer AND clear manual pause (e.g., after drag->transition).
    private func restartTimer() {
        isPaused = false
        startTimer()
    }

    /// Calcule la durée du slide courant en fonction des médias (vidéo/audio).
    /// Minimum 5s pour les slides texte/image seules.
    private func updateStoryDuration() {
        guard let story = currentStory else {
            computedStoryDuration = 5.0
            return
        }
        var maxDuration: Double = 5.0
        let effects = story.storyEffects

        if let authoritative = effects?.slideDuration, authoritative > 0 {
            computedStoryDuration = Double(authoritative)
            return
        }

        // Durées des médias foreground (vidéo + audio) — startTime + duration = end time
        if let mediaObjects = effects?.mediaObjects {
            for obj in mediaObjects where obj.placement == "foreground" {
                let startOffset = Double(obj.startTime ?? 0)
                if let feedMedia = story.media.first(where: { $0.id == obj.postMediaId }),
                   let dur = feedMedia.duration, dur > 0 {
                    maxDuration = max(maxDuration, startOffset + Double(dur))
                } else if let objDur = obj.duration {
                    maxDuration = max(maxDuration, startOffset + Double(objDur))
                }
            }
        }

        // Durées des audio players foreground — startTime + duration = end time
        if let audioObjects = effects?.audioPlayerObjects {
            for obj in audioObjects where obj.placement == "foreground" {
                let startOffset = Double(obj.startTime ?? 0)
                if let feedMedia = story.media.first(where: { $0.id == obj.postMediaId }),
                   let dur = feedMedia.duration, dur > 0 {
                    maxDuration = max(maxDuration, startOffset + Double(dur))
                } else if let objDur = obj.duration {
                    maxDuration = max(maxDuration, startOffset + Double(objDur))
                }
            }
        }

        // Durées des text objects — startTime + displayDuration
        if let textObjects = effects?.textObjects {
            for obj in textObjects {
                let startOffset = Double(obj.startTime ?? 0)
                if let displayDur = obj.displayDuration {
                    maxDuration = max(maxDuration, startOffset + Double(displayDur))
                }
            }
        }

        // Legacy background video duration (when no canvas mediaObjects)
        if (effects?.mediaObjects ?? []).isEmpty,
           let legacyMedia = story.media.first,
           legacyMedia.type == .video,
           let dur = legacyMedia.duration, dur > 0 {
            maxDuration = max(maxDuration, Double(dur))
        }

        // Audio de fond (trimé ou complet)
        if let bgAudioId = effects?.backgroundAudioId {
            if let start = effects?.backgroundAudioStart, let end = effects?.backgroundAudioEnd, end > start {
                maxDuration = max(maxDuration, end - start)
            } else if let feedMedia = story.media.first(where: { $0.id == bgAudioId }),
                      let dur = feedMedia.duration, dur > 0 {
                maxDuration = max(maxDuration, Double(dur))
            }
        }

        // Pour les vidéos/audios locales en preview, utiliser AVURLAsset si FeedMedia.duration est nil
        if isPreviewMode {
            let capturedVideoURLs = preloadedVideoURLs
            let capturedAudioURLs = preloadedAudioURLs
            let capturedMaxDuration = maxDuration
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
                computedStoryDuration = asyncMax
            }
            return
        }

        computedStoryDuration = maxDuration
    }

    /// Manual pause — only for direct gesture holds (long press, drag).
    func pauseTimer() { isPaused = true }

    /// Manual resume — only for ending gesture holds.
    func resumeTimer() { isPaused = false }

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

    func sendComment(text: String, effectFlags: Int? = nil) {
        guard !text.isEmpty, let story = currentStory else { return }

        // Optimistic local insert
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
            effectFlags: effectFlags ?? 0,
            originalLanguage: currentUser?.systemLanguage
        )
        storyComments.append(optimisticComment)
        storyCommentCount += 1

        // Send to API
        Task {
            var body: [String: AnyCodable] = ["content": AnyCodable(text)]
            if let effectFlags {
                body["effectFlags"] = AnyCodable(effectFlags)
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

    func reshareStory() {
        guard let story = currentStory else { return }
        HapticFeedback.light()

        Task {
            do {
                let body = RepostRequest(content: nil, isQuote: false)
                let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.post(
                    endpoint: "/posts/\(story.id)/repost",
                    body: body
                )
                HapticFeedback.success()
            } catch {
                HapticFeedback.error()
            }
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

// MARK: - Story Comments Overlay (live-chat style)

extension StoryViewerView {

    /// Instagram-style live comment overlay: scrolls up, fades out at mid-screen.
    var storyCommentsOverlay: some View {
        let userLang = AuthManager.shared.currentUser?.preferredContentLanguages.first ?? "fr"

        return VStack(spacing: 0) {
            Spacer()

            ZStack(alignment: .bottom) {
                ScrollViewReader { proxy in
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            ForEach(storyComments) { comment in
                                storyCommentRow(comment: comment, userLang: userLang)
                                    .id(comment.id)
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
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 20)
                        .padding(.bottom, 8)
                    }
                    .frame(maxHeight: UIScreen.main.bounds.height * 0.4)
                    .onChange(of: storyComments.count) { _, _ in
                        if let last = storyComments.last {
                            withAnimation(.easeOut(duration: 0.3)) {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }
                .mask(
                    VStack(spacing: 0) {
                        LinearGradient(
                            stops: [
                                .init(color: .clear, location: 0),
                                .init(color: .black, location: 1)
                            ],
                            startPoint: .top, endPoint: .bottom
                        )
                        .frame(height: 60)

                        Color.black
                    }
                )
            }
        }
        .padding(.bottom, 70)
    }

    func storyCommentRow(comment: FeedComment, userLang: String) -> some View {
        let displayContent = comment.translatedContent ?? comment.content
        let hasTranslation = comment.translatedContent != nil
        let originalLang = comment.originalLanguage

        return HStack(alignment: .top, spacing: 8) {
            // Avatar
            if let avatarURL = comment.authorAvatarURL,
               let url = MeeshyConfig.resolveMediaURL(avatarURL) {
                CachedAsyncImage(url: url.absoluteString) {
                    commentAvatarPlaceholder(color: comment.authorColor)
                }
                .frame(width: 28, height: 28)
                .clipShape(Circle())
            } else {
                commentAvatarPlaceholder(color: comment.authorColor)
            }

            VStack(alignment: .leading, spacing: 2) {
                // Header: displayName · timestamp · flags · translate
                HStack(spacing: 6) {
                    Text(comment.author)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)

                    Text("·")
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.4))

                    Text(comment.timestamp, style: .relative)
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.4))

                    if let lang = originalLang, lang != userLang {
                        Text(commentFlagEmoji(for: lang))
                            .font(.system(size: 10))
                    }

                    if hasTranslation {
                        Image(systemName: "translate")
                            .font(.system(size: 9))
                            .foregroundColor(MeeshyColors.indigo400.opacity(0.7))
                    }
                }

                // Comment text
                Text(displayContent)
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.9))
                    .lineLimit(4)
                    .multilineTextAlignment(.leading)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.35))
                .background(.ultraThinMaterial.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        )
    }

    func commentAvatarPlaceholder(color: String) -> some View {
        Circle()
            .fill(Color(hex: color))
            .frame(width: 28, height: 28)
    }

    func commentFlagEmoji(for languageCode: String) -> String {
        switch languageCode.prefix(2) {
        case "fr": return "🇫🇷"
        case "en": return "🇬🇧"
        case "es": return "🇪🇸"
        case "de": return "🇩🇪"
        case "it": return "🇮🇹"
        case "pt": return "🇵🇹"
        case "ar": return "🇸🇦"
        case "zh": return "🇨🇳"
        case "ja": return "🇯🇵"
        case "ko": return "🇰🇷"
        case "ru": return "🇷🇺"
        case "hi": return "🇮🇳"
        case "tr": return "🇹🇷"
        case "nl": return "🇳🇱"
        default: return "🌐"
        }
    }

    // MARK: - Load Comments

    func loadStoryComments() {
        guard let story = currentStory, !isLoadingComments else { return }
        isLoadingComments = true
        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []

        Task {
            do {
                let response = try await PostService.shared.getComments(postId: story.id, limit: 50)
                if response.success {
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
                    storyCommentCount = comments.count
                }
            } catch {}
            isLoadingComments = false
        }
    }

    func loadStoryCommentCount() {
        guard let story = currentStory else {
            storyCommentCount = 0
            storyComments = []
            return
        }

        Task {
            do {
                let response = try await PostService.shared.getComments(postId: story.id, limit: 1)
                if response.success {
                    storyCommentCount = response.data.count
                }
            } catch {}
        }
    }
}
