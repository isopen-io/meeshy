import SwiftUI
import Combine
import AVFoundation
import QuartzCore
import os
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
            .accessibilityLabel(String(localized: "story.viewer.a11y.storyText", defaultValue: "Texte de la story: \(content)", bundle: .main))
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
                    fullUrl: media.url,
                    autoLoad: true
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
                    MeeshyColors.error.opacity(0.1)
                        .blendMode(.softLight)
                case "cool":
                    MeeshyColors.indigo300.opacity(0.1)
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
                case 1:
                    horizontalDrag = dx
                    // Face du cube côté direction courante — recalculée à
                    // chaque tick : le geste est réversible mi-course.
                    let total = groupSlide + dx
                    neighborPreviewDirection = total < 0 ? 1 : (total > 0 ? -1 : 0)
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

                    // Transfer interactive drag -> groupSlide (no visual snap).
                    // 1:1 (Lot 3) — cohérent avec `totalSlideX` sans amorti.
                    groupSlide += horizontalDrag
                    horizontalDrag = 0

                    if (dx < -60 || predicted < -150) && currentGroupIndex < groups.count - 1 {
                        // Swipe left -> next group. Reprend l'auteur suivant à
                        // sa première story non lue (parité avec l'aperçu du
                        // cube), pas systématiquement à la slide 0.
                        HapticFeedback.light()
                        groupTransition(forward: true) {
                            currentGroupIndex += 1
                            currentStoryIndex = entryIndex(of: groups[currentGroupIndex])
                            progress = 0
                        }
                    } else if (dx > 60 || predicted > 150) && currentGroupIndex > 0 {
                        // Swipe right -> prev group
                        HapticFeedback.light()
                        groupTransition(forward: false) {
                            currentGroupIndex -= 1
                            currentStoryIndex = max(0, groups[currentGroupIndex].stories.count - 1)
                            progress = 0
                        }
                    } else {
                        // Snap back — animate groupSlide to 0. La face du cube
                        // reste montée pendant le retour (elle sort de l'écran
                        // avec l'animation), nettoyée une fois posée.
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            groupSlide = 0
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) {
                            if !isTransitioning { neighborPreviewDirection = 0 }
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
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) {
            if !isTransitioning { neighborPreviewDirection = 0 }
        }
        resumeTimer()
    }

    // MARK: - Navigation

    // Pas de haptic ici : `goToNext`/`goToPrevious` sont aussi le chemin de
    // l'auto-advance (timer `onCompletion`) — vibrer à chaque slide casse la
    // fluidité de lecture (retour user 2026-07-13 : « 3 retours haptiques par
    // slide »). Le tick unique par navigation MANUELLE vit au point de geste
    // (touchUp nav dans +Canvas, commit de swipe de groupe ci-dessus).
    func goToNext() {
        guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
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
                currentStoryIndex = entryIndex(of: groups[currentGroupIndex])
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

    /// Transition cube entre groupes d'auteurs (Lot 3). Pendant le drag, les
    /// deux faces (carte + aperçu voisin) suivent déjà le doigt ; le commit
    /// termine la rotation jusqu'à ±90° puis swappe le contenu à l'arête —
    /// la carte réelle remplace la face entrante à transform identité, swap
    /// invisible. Le canvas voisin est chaud (prefetch inter-groupes), la
    /// première frame réelle est instantanée.
    private func groupTransition(forward: Bool, update: @escaping () -> Void) {
        guard !isTransitioning else { return }
        isTransitioning = true
        // Tap-en-bord / auto-advance arrivent ici sans drag : poser la
        // direction pour que la face entrante participe au commit.
        neighborPreviewDirection = forward ? 1 : -1

        let exitX: CGFloat = forward ? -screenW : screenW
        withAnimation(.spring(response: 0.32, dampingFraction: 0.9)) {
            groupSlide = exitX
        }

        // Swap quand l'arête est quasi à 90° (~96 % de la course du spring) :
        // la face entrante est alors à ~quelques points de l'identité.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.38) {
            update()
            markCurrentViewed()
            prefetchCurrentGroup()

            // Sans animation : la carte réelle prend la place exacte de la
            // face entrante (transform identité), la face est démontée.
            groupSlide = 0
            neighborPreviewDirection = 0
            restartTimer()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                isTransitioning = false
            }
        }
    }

    /// Dismiss — shrink to small card and fly toward top
    func dismissViewer() {
        guard !isDismissing else { return }
        isTransitioning = true
        slideTimer.setPaused(true)
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
    ///
    /// - `isPaused` : pauses du timer pour sheets, drag-to-dismiss, etc.
    ///   (timer-only — le canvas continue à jouer).
    /// - `isLongPressPaused` : toggle long-press utilisateur (timer + canvas
    ///   gelés ensemble via `.storyPlayerPause`).
    /// Internal car lu depuis `StoryViewerView.swift` (cross-file extension) :
    /// le helper `storyCard(geometry:)` passe cette valeur à `StoryCardView`
    /// pour propager la pause au canvas via `StoryReaderRepresentable.isPaused`.
    /// Composers + pickers + transitions pause the slide timer. Comments
    /// overlay does NOT (the user wants to read comments while the story
    /// keeps playing/looping behind). Focus on the comment composer engages
    /// `isComposerEngaged` which DOES pause — that's the intended trigger,
    /// not the overlay visibility alone (user spec 2026-05-28).
    var shouldPauseTimer: Bool {
        isPaused
        || isLongPressPaused
        || isComposerEngaged
        || hasComposerContent
        || showEmojiStrip
        || showFullEmojiPicker
        || showTextEmojiPicker
        || showLanguageOptions
        || showFullLanguagePicker
        // L'overlay commentaires ouvert met la story en pause : lire / répondre à
        // un commentaire ne doit pas laisser la slide auto-avancer sous l'overlay
        // (bug 2026-06-01 — l'utilisateur lit les commentaires et la story passe
        // à la slide suivante). Parité Instagram : ouvrir les commentaires gèle
        // la lecture (timer + médias via `isCanvasPlaybackPaused`).
        || showCommentsOverlay
        || isTransitioning
        || isDismissing
        // Interstitiel d'identité inter-groupes : la lecture (timer + canvas +
        // audio) attend la fin des ~1,2 s (ou le tap skip) — reprise sans saut.
        || showGroupIntro
    }

    func startTimer() {
        progress = 0
        isContentReady = false
        hasFiredFadeOut = false
        hasFiredNextPrefetch = false
        showCommentsOverlay = false
        replyingToStoryComment = nil
        storyCommentRepliesMap = [:]
        storyCommentExpandedThreads = []
        storyCommentLoadingReplies = []
        // Slide changed → drop previous slide's comment list, like overrides, and
        // any in-flight heart taps. Without this, `isStoryCommentsEmpty` stays
        // false in the sidebar tap path (Sidebar:277) and the overlay re-opens
        // with the prior slide's comments without ever refetching.
        storyComments = []
        storyCommentLikedIds = []
        storyCommentLikeDelta = [:]
        heartInFlightIds = []
        isLoadingComments = false
        loadStoryCommentCount()
        storyReactionCount = currentStory?.reactionCount ?? 0
        storyCurrentUserReactions = currentStory?.currentUserReactions ?? []
        updateStoryDuration()

        // PROGRESS = StoryReaderTimerController (SDK), unique display-link de
        // progression. Gating : `markContentReady` (canvas visible via
        // `adaptiveOnChange(of: isContentReady)` + canvas préfetché via
        // `refreshPrefetchWindowAndTimer`) empêche le compte avant contenu ;
        // pause : `setPaused` asservi à `shouldPauseTimer`. La barre, le seuil
        // de prefetch N+1 et `goToNext()` vivent dans les callbacks câblés par
        // `installPrefetchPipelineIfNeeded`. Le wall-clock du controller reste
        // l'autorité de la durée slide (cf. plan Lot 2 — l'asservissement au
        // clock canvas clampé bloquerait l'auto-advance sur les pauses UI).
        refreshPrefetchWindowAndTimer()
        slideTimer.setPaused(shouldPauseTimer)
    }

    /// Restart timer AND clear manual pause (e.g., after drag->transition).
    /// Changement de slide ou sortie de transition : on repart en lecture
    /// fraîche. On désarme **les deux** drapeaux de pause :
    /// - `isPaused` (timer-only)
    /// - `isLongPressPaused` (long-press latch — déclenche `.storyPlayerResume`
    ///   au canvas si on était latched-paused au moment du changement).
    private func restartTimer() {
        isPaused = false
        isLongPressPaused = false
        startTimer()
    }

    /// Calcule la durée du slide courant en fonction des médias (vidéo/audio).
    /// Minimum 6s pour les slides texte/image seules — parité Instagram/Snapchat,
    /// abaissé depuis 12s après retour utilisateur « les stories durent trop ».
    ///
    /// Spec: la story dure `max(longest_media_end_time, configured_slideDuration, 6s_minimum)`,
    /// puis arrondie au multiple supérieur de chaque période de loop bg pour
    /// que la vidéo/audio bg ne soit JAMAIS coupée au milieu d'un cycle.
    /// Avant ce fix, `effects.slideDuration` early-returned et les médias plus longs
    /// que la durée configurée étaient coupés (la vidéo apparaissait quelques
    /// secondes puis disparaissait alors que le son continuait — typique d'un
    /// timer de slide expirant avant la fin du média).
    /// SINGLE SOURCE OF TRUTH pour la durée du slide.
    /// User spec 2026-05-27 :
    /// - Slide statique → 6 s
    /// - Slide avec vidéo OU audio bg → durée du media (loopé si < 6 s)
    /// - `storyEffects.slideDuration` configuré prime quand > 0
    ///
    /// Délégation à `StorySlide.toRenderableSlide(...).computedTotalDuration()`
    /// pour aligner exactement avec la durée que pilote le canvas
    /// (`StoryCanvasUIView.displayLinkTick.effectiveDuration`). Garantit que
    /// progress bar (wall-clock viewer-side) et auto-advance (canvas-side)
    /// utilisent la MÊME valeur.
    static let defaultSlideDuration: Double = 6.0

    private func updateStoryDuration() {
        guard let story = currentStory else {
            computedStoryDuration = Self.defaultSlideDuration
            return
        }
        // `preferredLanguages: []` — la résolution de langue n'affecte
        // pas la durée (computedTotalDuration ne consulte plus le texte
        // résolu depuis sa simplification single-source-of-truth).
        // Évite la dépendance sur `resolvedViewerLanguageChain` (private
        // dans StoryViewerView.swift, inaccessible depuis cette extension).
        let renderable = story.toRenderableSlide(preferredLanguages: [])
        computedStoryDuration = renderable.computedTotalDuration()
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

    /// Manual pause — sheets, drag-to-dismiss, composer engaged, etc.
    /// **Timer-only** : le canvas (vidéo BG, audios, effets) continue à
    /// jouer. Cela évite un blip audible au cycle pause/resume rapide
    /// d'un drag de transition. Le toggle long-press passe par
    /// `isLongPressPaused` (qui, lui, freeze le canvas via notification).
    func pauseTimer() { isPaused = true }

    /// Manual resume — symétrique de `pauseTimer()`. N'inverse pas le
    /// long-press latch (`isLongPressPaused`) : si l'utilisateur a stoppé
    /// la story via long-press puis ouvert une sheet, la fermeture de la
    /// sheet ne doit pas relancer la story automatiquement.
    func resumeTimer() {
        isPaused = false
    }

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

    func sendComment(text: String, effectFlags: Int? = nil, parentId: String? = nil, pendingMedia: PendingCommentMedia? = nil) {
        guard (!text.isEmpty || pendingMedia != nil), let story = currentStory else { return }
        EngagementTracker.shared.recordAction(.commented, surface: .storyViewer)

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
            originalLanguage: composerLanguage,
            media: pendingMedia.map { [$0.optimistic] } ?? []
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

        // Send to API. Un média éventuel est uploadé (uploadContext=comment → PostMedia)
        // puis transmis via `attachmentIds` ; la ligne serveur réconcilie via le socket
        // `comment:added` (qui porte désormais le média). Le commentaire optimiste
        // affiche déjà le média local.
        let language = composerLanguage
        Task {
            var attachmentIds: [String]? = nil
            if let pendingMedia, let uploadedId = try? await CommentMediaUploader.upload(pendingMedia) {
                attachmentIds = [uploadedId]
            }
            await StoryInteractionService().postComment(
                storyId: story.id,
                content: text,
                originalLanguage: language,
                effectFlags: effectFlags,
                parentId: parentId,
                attachmentIds: attachmentIds,
                mobileTranscription: pendingMedia?.mobileTranscription
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
        EngagementTracker.shared.recordAction(.reacted, surface: .storyViewer)

        // Fire & forget like
        Task {
            await StoryInteractionService().react(storyId: story.id, emoji: emoji)
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
            // C3 : ce slide vient d'être affiché → 1 impression (source "story") pour CE
            // post-slide, en plus de la vue unique. Chaque changement de slide en émet une.
            viewModel.recordStoryImpression(storyId: story.id)
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
        let task = Task {
            let imageStore = await CacheCoordinator.shared.images
            for urlString in uniqueURLs {
                // Annulé par l'onDisappear du viewer : sans ce check, les
                // téléchargements + prerolls AVPlayer continuaient après la
                // fermeture (borné par le cache FIFO de 6 players, mais
                // réseau/CPU gaspillés pour un viewer mort).
                guard !Task.isCancelled else { return }
                let mediaType = story.media.first(where: { $0.url == urlString })?.type
                if mediaType == .video {
                    // Le canvas relit la vidéo via `CacheCoordinator.shared.video`
                    // (`videoLocalFileURL(for:)`). Le prefetch DOIT peupler CE
                    // store — pas `images` — sinon le canvas tombe en cache-miss
                    // et re-télécharge ce qui vient d'être préchargé.
                    _ = try? await CacheCoordinator.shared.video.data(for: urlString)
                    if let url = URL(string: urlString) {
                        await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
                    }
                } else if mediaType == .audio {
                    // Idem : le lecteur audio relit via le store `audio`.
                    _ = try? await CacheCoordinator.shared.audio.data(for: urlString)
                } else {
                    // Image: use image(for:) to populate UIImage NSCache for instant display
                    _ = await imageStore.image(for: urlString)
                }
            }
            guard !Task.isCancelled else { return }
            // Pre-probe foreground video audio tracks so `storyHasAudibleSound`
            // resolves to its final value before the slide is rendered —
            // without this, the sound button « apparait après quelques 100 ms »
            // when the story carries a video with audio (user bug 2026-05-28
            // « le calcul pour savoir si on affiche le bouton son doit se
            // faire avant qu'on affiche la story »). The probe lives in
            // `StoryViewerView.swift` so it can touch the private @State /
            // private resolveVideoURL helpers directly.
            await self.preProbeVideoAudio(for: story)
        }
        prefetchTasks.append(task)
        return task
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
    @Environment(\.colorScheme) private var colorScheme
    let story: StoryItem
    let accentColor: Color
    /// Mood resolution (local-first). Passed explicitly rather than via
    /// `@EnvironmentObject` so it survives the sheet boundary.
    @ObservedObject var statusViewModel: StatusViewModel
    /// Opens the tapped viewer's profile. Owned by the presenter
    /// (`StoryViewerView` holds the `Router`) so the sheet never reaches a
    /// `Router` `@EnvironmentObject` across its boundary.
    let onOpenProfile: (StoryViewerItem) -> Void

    private var isDark: Bool { colorScheme == .dark }

    @State private var viewers: [StoryViewerItem] = []
    @State private var isLoading = true
    // Coalescing anti-course pour le re-fetch temps réel : une rafale de
    // `story:viewed` ne doit pas lancer N fetches `/interactions` concurrents
    // (ils peuvent se terminer dans le désordre → liste momentanément périmée).
    // `isRefreshing` = un seul fetch en vol ; `refreshQueued` = un événement est
    // arrivé pendant le fetch → on relance EXACTEMENT une fois à la fin.
    @State private var isRefreshing = false
    @State private var refreshQueued = false

    var body: some View {
        NavigationStack {
            ZStack {
                isDark ? Color.black.ignoresSafeArea() : Color(UIColor.systemGroupedBackground).ignoresSafeArea()

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
                        // C4 + C1 : en-tête = viewCount AUTORITATIF (dénormalisé, la même
                        // valeur que le bouton « Vues » ; élimine le « bouton dit 3 / sheet
                        // dit 2 » où la sheet montrait la longueur de /interactions) + les
                        // impressions (author-only), pour la parité avec le détail/réel.
                        // Nouvelle clé de localisation (pas de traduction existante à casser).
                        Section(header: Text(String(localized: "story.viewer.viewsAndImpressions", defaultValue: "\(story.viewCount ?? viewers.count) Vues · \(story.impressionCount ?? 0) impressions", bundle: .main))
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
            .navigationTitle(String(localized: "story.viewer.views.title", defaultValue: "Vues", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) {
                        dismiss()
                    }
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(accentColor)
                }
            }
            .task {
                await loadViewers()
            }
            // Temps réel : chaque `story:viewed` de CETTE story (émis par le
            // gateway vers la feed room de l'auteur) re-fetch la liste enrichie
            // via `/posts/:id/interactions`. Sans ça, la feuille chargeait une
            // seule fois (`.task`) et un nouveau viewer n'apparaissait jamais tant
            // qu'elle restait ouverte — le cœur du « la remontée des vues ne se
            // fait pas en temps réel ». Le re-fetch est silencieux (pas de spinner :
            // `loadViewers` ne repasse pas `isLoading` à true).
            .onReceive(SocialSocketManager.shared.storyViewed) { viewedData in
                guard viewedData.storyId == story.id else { return }
                Task { await loadViewers() }
            }
        }
    }

    private func viewerRow(_ viewer: StoryViewerItem) -> some View {
        HStack(spacing: 12) {
            // Local-first mood (StatusViewModel) + presence (PresenceManager
            // live store). `onViewProfile` + row tap open the viewer's profile.
            MeeshyAvatar(
                name: viewer.displayName,
                context: .storyViewerRow,
                avatarURL: viewer.avatarUrl,
                moodEmoji: statusViewModel.statusForUser(userId: viewer.id)?.moodEmoji,
                presenceState: PresenceManager.shared.resolvedState(userId: viewer.id, isOnline: nil),
                onViewProfile: { onOpenProfile(viewer) },
                onMoodTap: statusViewModel.moodTapHandler(for: viewer.id)
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
                            .foregroundColor(MeeshyColors.error)
                        Text(reaction)
                            .font(.system(size: 14))
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture { onOpenProfile(viewer) }
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowBackground(isDark ? Color(UIColor.secondarySystemGroupedBackground) : Color.white)
    }

    private func loadViewers() async {
        // Un seul fetch en vol : si un autre tourne déjà, on note qu'un refresh
        // est dû (`refreshQueued`) et on sort — le fetch courant le rejouera.
        let shouldStart = await MainActor.run { () -> Bool in
            if isRefreshing { refreshQueued = true; return false }
            isRefreshing = true
            return true
        }
        guard shouldStart else { return }

        // Boucle jusqu'à ce qu'aucun événement n'ait été mis en file pendant le
        // dernier fetch — au plus un refresh de rattrapage, jamais N concurrents.
        repeat {
            await MainActor.run { refreshQueued = false }
            // M1 follow-up: the wire-shape decoding + nullable-field
            // defaulting now lives in StoryInteractionService.loadViewers.
            // A nil result here means "couldn't load" (logged at fault level
            // in the service) — we leave the previous list alone, matching
            // the prior swallow-and-show-empty behaviour.
            let snapshots = await StoryInteractionService().loadViewers(storyId: story.id)
            await MainActor.run {
                if let snapshots {
                    self.viewers = snapshots.map { s in
                        StoryViewerItem(
                            id: s.id,
                            username: s.username,
                            displayName: s.displayName,
                            avatarUrl: s.avatarUrl,
                            viewedAt: s.viewedAt,
                            reactionEmoji: s.reactionEmoji,
                            replyContent: nil,
                            hasReshared: false
                        )
                    }
                }
                self.isLoading = false
            }
        } while await MainActor.run(body: { refreshQueued })

        await MainActor.run { isRefreshing = false }
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
/// Listing threadé d'UN commentaire racine d'une story : la ligne racine, l'aperçu
/// auto des 2 premières réponses, le bouton « Voir N autres réponses » / « Masquer »,
/// et les réponses dépliées. Composant réutilisable extrait de `StoryCommentsOverlayView`
/// (le rendu est préservé à l'identique) — paramétré par un builder de ligne opaque
/// (`makeRow`) pour rester agnostique du style de la ligne.
struct StoryCommentThread: View {
    let comment: FeedComment
    let replies: [FeedComment]
    let isExpanded: Bool
    let isLoadingReplies: Bool
    let userLang: String
    let makeRow: (FeedComment, String) -> StoryCommentRowView
    let onToggleThread: () -> Void

    var body: some View {
        makeRow(comment, userLang)
            .id(comment.id)

        let autoPreview = Array(replies.prefix(2))
        if !autoPreview.isEmpty && !isExpanded {
            ForEach(autoPreview) { reply in
                makeRow(reply, userLang)
                    .padding(.leading, 32)
                    .id(reply.id)
            }
        }

        if comment.replies > 2 {
            Button {
                HapticFeedback.light()
                onToggleThread()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 9, weight: .bold))
                    let remaining = max(0, comment.replies - 2)
                    Text(isExpanded
                         ? "Masquer"
                         : "Voir \(remaining) autre\(remaining > 1 ? "s" : "") r\u{00E9}ponse\(remaining > 1 ? "s" : "")")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundColor(StoryCommentRowView.legibleAuthorColor(hex: comment.authorColor))
                .padding(.leading, 40)
                .padding(.vertical, 4)
                .storyOverlayLegible()
            }
        }

        if isExpanded {
            if isLoadingReplies && replies.isEmpty {
                HStack {
                    Spacer()
                    ProgressView().tint(.white.opacity(0.5)).scaleEffect(0.7)
                    Spacer()
                }
                .padding(.leading, 32)
                .padding(.vertical, 4)
            }

            ForEach(replies) { reply in
                makeRow(reply, userLang)
                    .padding(.leading, 32)
                    .id(reply.id)
            }
        }
    }
}

struct StoryCommentsOverlayView: View {
    let storyComments: [FeedComment]
    let storyCommentCount: Int
    let storyCommentRepliesMap: [String: [FeedComment]]
    let storyCommentExpandedThreads: Set<String>
    let storyCommentLoadingReplies: Set<String>
    let isLoadingComments: Bool
    let userLang: String
    /// Vrai quand la story consultée est expirée. Affiche une bannière au-dessus
    /// de la liste pour que les commentaires/réactions restent visibles tout en
    /// indiquant que la story n'est plus accessible (spec 2026-06-23).
    var isStoryExpired: Bool = false

    @Binding var showCommentsOverlay: Bool
    /// Réservation visuelle. Quand non-nil, le composer principal (un
    /// `StoryComposerBarView` rendu dans la canvas « Bottom area ») affiche
    /// sa reply banner. L'overlay s'en sert seulement pour étirer sa
    /// `composerSpaceReservation` afin que la liste ne passe pas sous la
    /// banner.
    @Binding var replyingToStoryComment: FeedComment?

    /// Drives the dynamic max-height of the comment list — with keyboard the
    /// list expands toward the top, without it the list caps at ~50 % of the
    /// screen so the underlying story stays manipulable above the list.
    @ObservedObject var keyboard: KeyboardObserver

    /// Vrai safe area bas lu sur la keyWindow par le parent
    /// (`StoryViewerView.windowBottomInset`). Necessaire parce que cet
    /// overlay est rendu dans le ZStack canvas qui herite du
    /// `.ignoresSafeArea()` root — `geometry.safeAreaInsets.bottom` y vaut 0.
    /// Sans cette valeur, `composerSpaceReservation` retombait sur une
    /// constante hardcodee (54pt pour iPhone Pro) qui derivait sur iPhone
    /// SE / iPad / pliables (bug 2026-05-28 : « le commentaire sort du
    /// viewport EXACTEMENT comme la zone de composition »).
    let safeBottom: CGFloat

    let makeStoryCommentRow: (FeedComment, String) -> StoryCommentRowView
    let toggleStoryCommentThread: (String) async -> Void

    private var topLevelComments: [FeedComment] {
        storyComments.filter { $0.parentId == nil }
    }

    /// Instagram-style top fade — older comments dissolve toward the middle
    /// of the screen as the user scrolls up. Bottom stays solid so the row
    /// touching the composer is fully legible.
    private var listFadeMask: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: .clear, location: 0.0),
                .init(color: .black.opacity(0.4), location: 0.12),
                .init(color: .black, location: 0.30),
                .init(color: .black, location: 1.0)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    /// Cap the comment list to ~half the screen when the keyboard is hidden
    /// so the rest of the story (head, mid-frame) stays visible and tappable.
    /// When the keyboard rises the list can grow into the space the keyboard
    /// uncovered.
    private var listMaxHeight: CGFloat {
        let screen = UIScreen.main.bounds.height
        return keyboard.isVisible ? screen * 0.62 : screen * 0.42
    }

    /// Instagram-style overlay: comments float above the composer with a top
    /// fade, the story behind stays visible AND interactable (no opaque
    /// background catching taps). Composer alone wears a subtle glass strip so
    /// the input is legible against any background.
    ///
    /// No global scrim behind the list — each individual `StoryCommentRowView`
    /// carries its own dark bubble for legibility (user spec 2026-05-28:
    /// « enlève le fond dégradé noir sur le composant de listing »). The
    /// `listFadeMask` keeps fading rows out at the top so older comments
    /// dissolve into the story above as the user scrolls up.
    /// Bannière « story expirée » : les commentaires/réactions restent
    /// consultables, mais on signale que la story n'est plus accessible.
    private var expiredStoryBanner: some View {
        Label {
            Text(String(localized: "story.viewer.expiredBanner", defaultValue: "Story expirée — les commentaires restent visibles", bundle: .main))
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
        } icon: {
            Image(systemName: "clock.badge.xmark")
                .font(.system(size: 11, weight: .semibold))
        }
        .foregroundColor(.white.opacity(0.85))
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Capsule().fill(MeeshyColors.error.opacity(0.32)))
        .padding(.bottom, 6)
        .transition(.opacity)
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            if isStoryExpired {
                expiredStoryBanner
            }
            commentsList
                .frame(maxHeight: listMaxHeight)
                .mask(listFadeMask)
                // Réserve l'espace occupé par le composer principal rendu
                // dans la canvas « Bottom area » (cf. `StoryComposerBarView`
                // à canvas line ~1078). Sans cette réservation, les derniers
                // commentaires de la liste passeraient SOUS le composer
                // (bug user 2026-05-28 « deuxième instance de composer
                // apparaît et fait disparaître l'autre »). On unifie sur
                // UN SEUL composer (le principal) et on laisse la liste
                // s'arrêter juste au-dessus.
                .padding(.bottom, composerSpaceReservation)
        }
        // **CRITIQUE** : forcer la VStack à remplir toute la hauteur du
        // canvas. Sans `.frame(maxHeight: .infinity)`, le `Spacer(minLength:
        // 0)` collapse à 0pt et la liste se positionne au TOP de la VStack
        // intrinsèque (~150-200pt) qui se centre dans le canvas ZStack →
        // les commentaires apparaissent dans le tiers supérieur de l'écran
        // au lieu de juste au-dessus du composer (bug user 2026-05-28
        // « la zone de commentaire est coupé »). Auparavant `composerStrip`
        // avec son `Rectangle.ignoresSafeArea(.bottom)` étirait
        // implicitement la VStack ; maintenant il faut le déclarer.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .animation(.easeInOut(duration: 0.25), value: keyboard.isVisible)
        .animation(.easeInOut(duration: 0.2), value: replyingToStoryComment?.id)
    }

    /// Hauteur réservée pour le composer principal (StoryComposerBarView)
    /// + son safe area / sa montée clavier. La liste s'arrête au MILIEU du
    /// composer (et non au-dessus) pour que les nouveaux commentaires
    /// paraissent « émerger » de la zone de composition au scroll — le
    /// composer recouvre visuellement la moitié inférieure de la liste,
    /// et la masque-gradient `listFadeMask` cache déjà les rows arrivant
    /// par le haut. User spec 2026-05-28 : « le composant pour remonter
    /// les commentaires doit débuter en milieu de la zone de composition
    /// […] on verra les commentaires sortir de cette zone ».
    /// - clavier visible : `keyboard.height` + composer ~ 92pt (sans banner)
    ///   ou ~140pt (avec reply banner)
    /// - clavier caché : safe area ~34pt + 20pt breathing room + composer/2.
    private var composerSpaceReservation: CGFloat {
        let composerHeight: CGFloat = replyingToStoryComment != nil ? 142 : 92
        // Mirror `composerBottomPadding(geometry:)` cote canvas : safe area
        // reel + 20pt breathing room quand clavier cache, sinon hauteur clavier.
        // `safeBottom` arrive du parent via `windowBottomInset` (keyWindow),
        // pas via `geometry.safeAreaInsets.bottom` qui vaut 0 sous
        // `.ignoresSafeArea()` (bug 2026-05-28).
        let bottomPadding: CGFloat = keyboard.isVisible
            ? keyboard.height
            : safeBottom + 20
        // Half-composer overlap — list ends at composer.middle, the lower
        // half is the « emerge » zone where new rows transition into view.
        return composerHeight / 2 + bottomPadding
    }

    // MARK: - Comments List

    private var commentsList: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(topLevelComments.enumerated()), id: \.element.id) { idx, comment in
                        // Separator between top-level comments — `Divider()`
                        // SwiftUI natif (1pt, white opacity ~15%) au lieu de la
                        // RoundedRectangle box autour de chaque row (user spec
                        // 2026-05-28 : « alignés et séparés par des ---- »).
                        if idx > 0 {
                            Divider()
                                .overlay(Color.white.opacity(0.28))
                                .shadow(color: .black.opacity(0.3), radius: 1)
                                .padding(.vertical, 4)
                        }

                        StoryCommentThread(
                            comment: comment,
                            replies: storyCommentRepliesMap[comment.id] ?? [],
                            isExpanded: storyCommentExpandedThreads.contains(comment.id),
                            isLoadingReplies: storyCommentLoadingReplies.contains(comment.id),
                            userLang: userLang,
                            makeRow: makeStoryCommentRow,
                            onToggleThread: { Task { await toggleStoryCommentThread(comment.id) } }
                        )
                    }

                    if isLoadingComments {
                        HStack {
                            Spacer()
                            ProgressView().tint(.white.opacity(0.6))
                            Spacer()
                        }
                        .padding(.vertical, 8)
                    }

                    if topLevelComments.isEmpty && !isLoadingComments {
                        emptyPlaceholder
                    }
                }
                // **Aligned with composer's 28pt outer padding** (cf.
                // canvas line 1108). Le commentaire-row visuel commence
                // exactement au même `leading` que la rangée de saisie du
                // composer → plus de désalignement entre la liste
                // commentaires et la zone Commenter / reply banner (bug
                // user 2026-05-28). Trailing 80pt préserve le dégagement
                // sidebar (Layer 8 ~56+6=62pt depuis le bord droit).
                .padding(.leading, 28)
                .padding(.trailing, 80)
                .padding(.top, 24)
                .padding(.bottom, 12)
            }
            .adaptiveOnChange(of: storyComments.count) { _, _ in
                if let last = storyComments.last {
                    withAnimation(.easeOut(duration: 0.3)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
            .adaptiveOnChange(of: replyingToStoryComment?.id) { _, newId in
                // Bring the target into view so the user sees what they're
                // replying to even if it was off-screen.
                guard let id = newId else { return }
                withAnimation(.easeOut(duration: 0.3)) {
                    proxy.scrollTo(id, anchor: .center)
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyPlaceholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 28))
                .foregroundColor(.white.opacity(0.7))
            Text(String(localized: "story.viewer.comments.empty", defaultValue: "Pas encore de commentaires", bundle: .main))
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white.opacity(0.85))
            Text(String(localized: "story.viewer.comments.beFirst", defaultValue: "Soyez le premier \u{00E0} commenter !", bundle: .main))
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.65))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .storyOverlayLegible()
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
                    authorUsername: c.author.username,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: commentId,
                    originalLanguage: c.originalLanguage, translatedContent: translated,
                    currentUserReactions: c.currentUserReactions,
                    media: (c.media ?? []).map { $0.toFeedMedia() }
                )
            }
            storyCommentRepliesMap[commentId] = replies
        } catch {
            // Échec réseau transitoire : on garde le thread OUVERT (le
            // refermer punissait l'utilisateur qui venait de l'ouvrir) —
            // il affiche son état vide/spinner et le prochain toggle ou
            // refetch opportuniste réessaiera.
            Logger.messages.error("[StoryViewer] loadStoryCommentReplies failed for \(commentId, privacy: .public): \(error.localizedDescription, privacy: .public)")
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
                // Répondre à une réponse (niveau 2) : la réponse reste plate au niveau 2
                // (parent racine, cf. submitStoryComment) — on injecte une @mention de
                // l'auteur ciblé dans le composer pour qu'il soit notifié (`user_mentioned`).
                if comment.parentId != nil, let username = comment.authorUsername, !username.isEmpty {
                    emojiToInject = "@\(username) "
                }
                // Faire APPARAÎTRE l'universal composer bar : on déclenche le focus
                // pour ouvrir le clavier immédiatement (spec 2026-06-23) — l'auteur
                // (et tout viewer) peut répondre sans tap supplémentaire.
                //
                // Pour l'auteur de sa propre story, le composer n'existe PAS avant
                // ce tap (cf. condition de rendu `!isOwnStory || replyingToStoryComment`
                // dans +Canvas) : il est monté dans la même passe que `replyingToStoryComment`.
                // Or `focusTrigger` est consommé via `onChange`, qui ne fire pas au
                // montage initial — poser `true` synchroniquement serait ignoré et le
                // drapeau resterait coincé. On force donc un front false→true sur le
                // runloop suivant, une fois le composer monté et son `onChange` actif.
                composerFocusTrigger = false
                DispatchQueue.main.async { composerFocusTrigger = true }
                HapticFeedback.light()
            },
            onToggleLike: {
                HapticFeedback.light()
                Task { await toggleStoryCommentLike(comment) }
            }
        )
    }

    // MARK: - Story Comment Reactions

    /// Applique un événement socket `comment:reaction-added` ou
    /// `comment:reaction-removed` en utilisant l'agrégation server-authoritative
    /// (`event.aggregation.count` + `event.aggregation.hasCurrentUser`).
    ///
    /// Avant 2026-05-28, le code maintenait deux états locaux séparés —
    /// `storyCommentLikedIds` (set d'ids likés par l'utilisateur) et
    /// `storyCommentLikeDelta` (offset depuis le count serveur) — et appliquait
    /// l'événement socket en patchant le delta selon `event.userId ==
    /// currentUserId`. Ce design dérivait facilement :
    ///   - Si `currentUserId` était nil ou mal formaté, l'événement propre était
    ///     traité comme « autre utilisateur » → delta double-comptait.
    ///   - Si le serveur émettait un `comment:reaction-removed` parasite (ex :
    ///     idempotence côté gateway), le delta repassait à 0 et le count
    ///     « disparaissait » à l'écran (bug user 2026-05-28).
    ///
    /// La solution : faire confiance à `event.aggregation` qui porte le state
    /// global (count total + flag `hasCurrentUser`) après application de
    /// l'événement. On met à jour `storyComments[i].likes` à ce count, on
    /// réinitialise le delta à 0, et on synchronise `storyCommentLikedIds`
    /// depuis `hasCurrentUser`. Le résultat affiché — `comment.likes + delta`
    /// — converge vers la vérité serveur sans flicker.
    func applyCommentReactionEvent(_ event: SocketCommentReactionUpdateEvent) {
        // 2026-05-29 : on ne gate plus sur `showCommentsOverlay` — l'état doit
        // rester aligné sur le serveur même quand l'overlay est fermé.
        // Si `storyComments` est vide (overlay jamais ouvert), `firstIndex(where:)`
        // plus bas retourne nil et on skip silencieusement ; on se ré-aligne
        // au prochain load via `computeLikedIds(fromCachedComments:)` (Task 3).
        guard event.postId == currentStory?.id else { return }
        guard event.emoji == Self.heartEmoji else { return }

        let commentId = event.commentId
        let serverCount = event.aggregation.count
        let userHasReacted = event.aggregation.hasCurrentUser

        // Mise à jour de likedIds depuis l'agrégat (source de vérité) — peu
        // importe que ce soit l'événement de l'utilisateur courant ou d'un
        // autre, l'agrégat décrit l'état global.
        if userHasReacted {
            storyCommentLikedIds.insert(commentId)
        } else {
            storyCommentLikedIds.remove(commentId)
        }

        // Reset du delta et propagation du count serveur dans la liste pour
        // que la prochaine reaction parte d'une baseline propre.
        storyCommentLikeDelta[commentId] = 0
        if let idx = storyComments.firstIndex(where: { $0.id == commentId }) {
            storyComments[idx].likes = serverCount
        } else if let parentId = storyComments.first(where: { storyCommentRepliesMap[$0.id]?.contains(where: { $0.id == commentId }) == true })?.id,
                  var replies = storyCommentRepliesMap[parentId],
                  let replyIdx = replies.firstIndex(where: { $0.id == commentId }) {
            replies[replyIdx].likes = serverCount
            storyCommentRepliesMap[parentId] = replies
        }
    }

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

    /// Overload pour le chemin cache : `FeedComment` (déjà mappé) porte maintenant
    /// `currentUserReactions` (cf. `FeedModels.swift`). Permet de restaurer
    /// `storyCommentLikedIds` au cold start sans round-trip réseau.
    static func computeLikedIds(fromCachedComments comments: [FeedComment]) -> Set<String> {
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
        // Stale-write guard: drop the result ONLY if the viewer has CLEARLY
        // swiped to a different known story. A transient `currentStory == nil`
        // (group/index race during socket updates) must NOT drop the response
        // — otherwise the overlay stays empty for a story that has comments.
        if let now = currentStory?.id, now != story.id { return }
        switch cached {
        case .fresh(let comments, _):
            storyComments = comments
            storyCommentLikedIds = Self.computeLikedIds(fromCachedComments: comments)
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
            return
        case .stale(let comments, _):
            storyComments = comments
            storyCommentLikedIds = Self.computeLikedIds(fromCachedComments: comments)
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
            // Stale-write guard: drop ONLY if user has clearly swiped to a
            // different known story (tolerate transient nil reads).
            if let now = currentStory?.id, now != story.id { return }
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
                    authorUsername: c.author.username,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: c.parentId,
                    originalLanguage: c.originalLanguage, translatedContent: translated,
                    currentUserReactions: c.currentUserReactions,
                    media: (c.media ?? []).map { $0.toFeedMedia() }
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
        } catch {
            // Cache-first : l'overlay garde les commentaires cachés déjà
            // affichés ; on logue l'échec du refresh réseau au lieu de
            // l'avaler (diagnostic des overlays vides signalés).
            Logger.messages.error("[StoryViewer] fetchStoryComments failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Seeds `storyCommentCount` for the slide that just became visible.
    ///
    /// Uses the count baked into the story payload as the first approximation,
    /// then reconciles with the local comments cache if one exists. The payload
    /// is frequently a >24h client cache, so its count can be a stale 0 for a
    /// story that has since gained comments — and the sidebar hides the comments
    /// button at 0. To break that, when (and ONLY when) the count is still 0
    /// after the cache check, a single debounced network reconciliation confirms
    /// the real count. The 400ms dwell + stale-id guard keep this O(1) per
    /// *watched* story (never the O(N)-on-swipe fetch removed in 2026-05-28).
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
            if let now = currentStory?.id, now != story.id { return }
            switch cached {
            case .fresh(let comments, _), .stale(let comments, _):
                let top = comments.filter { $0.parentId == nil }
                let total = top.count + top.reduce(0) { $0 + $1.replies }
                if total != storyCommentCount { storyCommentCount = total }
                return
            case .expired, .empty:
                break
            }

            // Stale-0 reconciliation. The story payload is frequently served from
            // a >24h client cache, so its `commentCount` can read 0 for a story
            // that has since received comments; with no comment cache above we
            // cannot distinguish a genuine 0 from a stale 0, and the sidebar's
            // `count > 0` gate then hides the comments button even though the
            // thread exists (user-reported: « malgré les commentaires on ne
            // voyait rien »). Confirm against the network — but ONLY for the
            // ambiguous 0, and debounced so a fast swipe-through never spams it
            // (the O(N)-on-swipe regression of 2026-05-28). 400ms dwell + the
            // stale-id guard mean only stories the viewer actually pauses on
            // trigger a single lightweight reconciliation.
            guard storyCommentCount == 0 else { return }
            try? await Task.sleep(nanoseconds: 400_000_000)
            if let now = currentStory?.id, now != story.id { return }
            guard let response = try? await PostService.shared.getComments(
                postId: story.id, cursor: nil, limit: 50
            ) else { return }
            if let now = currentStory?.id, now != story.id { return }
            // Same formula as the cache/open paths: top-level comments + their
            // replies. A genuinely empty thread stays 0 → button stays hidden.
            let top = response.data.filter { $0.parentId == nil }
            let total = top.count + top.reduce(0) { $0 + ($1.replyCount ?? 0) }
            if total != storyCommentCount { storyCommentCount = total }
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
        lhs.comment.translatedContent == rhs.comment.translatedContent &&
        lhs.comment.media.first?.id == rhs.comment.media.first?.id &&
        lhs.comment.media.first?.transcription?.text == rhs.comment.media.first?.transcription?.text &&
        lhs.comment.media.first?.translatedAudios.count == rhs.comment.media.first?.translatedAudios.count
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

    /// Flat row sans box : sliver vertical coloré à gauche (identité auteur)
    /// + avatar + VStack {header, contenu, actions}. Pas de RoundedRectangle
    /// background, pas de strokeBorder — les rows sont séparées par un
    /// `Divider()` côté `StoryCommentsOverlayView.commentsList`
    /// (user spec 2026-05-28 : « les commentaires ne doivent pas être dans
    /// des box mais alignés et séparés par des ---- uniquement »).
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Sliver vertical d'accent : identité couleur de l'auteur,
            /// extrait du background pour ne pas avoir à wrapper la row.
            Capsule(style: .continuous)
                .fill(bubbleColor)
                .frame(width: 3)
                .shadow(color: .black.opacity(0.35), radius: 3)
                .padding(.vertical, 6)

            avatar

            VStack(alignment: .leading, spacing: 4) {
                headerRow
                contentText
                // Média unique du commentaire (image/vidéo/audio) — inline + plein
                // écran, identique aux autres surfaces de commentaires.
                if let media = comment.media.first {
                    CommentMediaView(
                        media: media,
                        accentColor: comment.authorColor,
                        authorName: comment.author,
                        authorAvatarURL: comment.authorAvatarURL,
                        authorColor: comment.authorColor,
                        sentAt: comment.timestamp
                    )
                    .padding(.top, 2)
                }
                actionRow
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
        .padding(.trailing, 12)
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
        // Halo de séparation : l'avatar reste détaché même sur une story claire.
        .shadow(color: .black.opacity(0.4), radius: 4, y: 1)
    }

    private var headerRow: some View {
        HStack(spacing: 6) {
            Text(comment.author)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundColor(Self.legibleAuthorColor(hex: comment.authorColor))

            if hasTranslation {
                Text("\u{00B7}").font(.system(size: 10)).foregroundColor(.white.opacity(0.55))
                languageSwitcher
            }

            Text("\u{00B7}").font(.system(size: 10)).foregroundColor(.white.opacity(0.55))

            Text(comment.timestamp, style: .relative)
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.75))
        }
        // Halo lisibilité (cf. StoryActionButton sidebar) — le header reste net
        // sur n'importe quel fond de story, clair comme foncé. Pas de box.
        .storyOverlayLegible()
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
            .foregroundColor(.white)
            .lineLimit(6)
            .multilineTextAlignment(.leading)
            .animation(.easeInOut(duration: 0.2), value: showOriginal)
            .messageEffects(comment.effects, hasPlayedAppearance: true)
            // Halo renforcé sur le corps du commentaire — c'est le texte le plus
            // long, donc le plus exposé à un fond clair/chargé. Blanc plein +
            // double ombre = lisible partout sans cartouche.
            .storyOverlayLegible(strong: true)
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
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(isLiked ? MeeshyColors.error : .white.opacity(0.92))
                        .scaleEffect(isLiked ? 1.15 : 1.0)
                    if likeCount > 0 {
                        Text("\(likeCount)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(isLiked ? MeeshyColors.error : .white.opacity(0.85))
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
                    Text(String(localized: "story.viewer.reply", defaultValue: "R\u{00E9}pondre", bundle: .main))
                        .font(.system(size: 10.5, weight: .semibold))
                }
                .foregroundColor(.white.opacity(0.88))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)

            Spacer()
        }
        .padding(.top, 2)
        // Halo lisibilité sur la rangée d'actions (cœur + Répondre).
        .storyOverlayLegible()
    }
}

// MARK: - Story Overlay Legibility

extension View {
    /// Halo sombre pour le texte/les icônes qui flottent directement au-dessus
    /// d'une story (aucune box, aucun scrim — spec user 2026-05-28). Réplique le
    /// traitement approuvé de la sidebar (`StoryActionButton`, 2026-06-03) : une
    /// ombre serrée pour des glyphes nets + une ombre plus diffuse pour détacher
    /// le contenu d'un fond clair ou chargé. `strong` pour les longs paragraphes.
    func storyOverlayLegible(strong: Bool = false) -> some View {
        self
            .shadow(color: .black.opacity(strong ? 0.7 : 0.55), radius: strong ? 3 : 2, y: 1)
            .shadow(color: .black.opacity(strong ? 0.45 : 0.3), radius: strong ? 8 : 6)
    }
}

extension StoryCommentRowView {
    /// Couleur du nom d'auteur garantie lisible sur une story arbitraire.
    /// Les couleurs d'auteur très sombres (`luminance < 0.4` WCAG) sont mélangées
    /// vers le blanc pour ne jamais disparaître sur un fond foncé ; le halo gère
    /// les fonds clairs. Pure + testable (cf. StoryViewerCommentReactionTests).
    static func legibleAuthorColor(hex: String) -> Color {
        let base = Color(hex: hex)
        guard base.luminance < 0.4 else { return base }
        let ui = UIColor(base)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        let f: CGFloat = 0.55
        return Color(
            red: Double(r + (1 - r) * f),
            green: Double(g + (1 - g) * f),
            blue: Double(b + (1 - b) * f)
        )
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
    /// Marqueur de participation : non-nil ⇒ le FAB actif dessine son contour
    /// accent dans `accentOutlineColor` (ex : couleur d'avatar pour le cœur déjà
    /// réagi) plutôt que dans son `activeGlow`/`activeColor` par défaut. La
    /// valeur du symbole n'est plus rendue en overlay — seule sa présence
    /// (non-nil) sélectionne la couleur du contour (cf. `body`).
    var accentOutline: String? = nil
    var accentOutlineColor: Color = .clear
    let action: () -> Void

    var body: some View {
        Button {
            action()
        } label: {
            // Densité resserrée 2026-07-10 : spacing glyph→label 4→2 et padding
            // vertical 8→3 — le rail complet gagne ~30 % de compacité (parité
            // TikTok/IG) tout en gardant ≥ 44pt de hauteur tappable par bouton
            // (glyph 46 + label ~12 + 2×3 de padding).
            VStack(spacing: 2) {
                ZStack {
                    // Plus de cartouche circulaire : style « glyph flottant »
                    // TikTok/Instagram (spec user 2026-06-25 « supprimer les
                    // cercles autour des FABs, juste le glyph + ombre »).
                    //
                    // FAB ACTIF (l'utilisateur a participé : réaction posée, son
                    // actif, overlay commentaires/traductions ouvert…) → contour
                    // accent PRONONCÉ. Le liseré est dessiné en rendant le même
                    // symbole agrandi en couleur accent JUSTE DERRIÈRE le glyph
                    // blanc : un contour net qui ressort sur n'importe quel fond
                    // de story (clair comme foncé), là où l'ancien anneau du chip
                    // disparaissait. Couleur du contour = couleur de participation
                    // du bouton (`accentOutlineColor`, ex : couleur d'avatar pour
                    // le cœur) sinon le glow/accent du bouton.
                    if isActive {
                        Image(systemName: icon)
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(accentOutline != nil ? accentOutlineColor : (activeGlow ?? activeColor))
                            .scaleEffect(1.22)
                    }

                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.white)
                        .adaptiveSymbolBounce(value: isActive)
                }
                .frame(width: 46, height: 46)
                // Halo sous l'icône — lisibilité garantie sur N'IMPORTE QUEL fond
                // de story (clair comme foncé), sans voile ni cartouche. Inactif →
                // ombre sombre ; actif → glow coloré plus large qui renforce le
                // contour accent.
                .shadow(
                    color: isActive ? (activeGlow ?? activeColor).opacity(0.55) : .black.opacity(0.6),
                    radius: isActive ? 7 : 4,
                    y: isActive ? 0 : 1
                )

                Text(label)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(isActive ? 0.98 : 0.85))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    // Même halo pour le label : blanc sur fond clair sinon illisible.
                    .shadow(color: .black.opacity(0.55), radius: 2, y: 1)
            }
            .frame(width: 56)
            // Élargit la zone sensible de quelques pixels AUTOUR du glyph + label.
            // Sans cartouche/cercle de fond (style « glyph flottant »), seul le
            // glyph rendu était tappable : un tap qui manquait le glyph de
            // quelques pixels traversait jusqu'à l'overlay de navigation (Layer 6
            // de StoryViewerView+Canvas — gesture prev/next) et faisait passer la
            // story à la suivante (bug user 2026-06-28 « je touche un bouton, ça
            // passe à la story suivante »). Le `padding` agrandit le rectangle et
            // comble les gaps entre FABs ; `contentShape(Rectangle())` rend TOUT
            // ce rectangle (padding inclus) sensible, transparent compris.
            // (3pt vertical + spacing 8/6 du rail : ≤ 2pt de jour entre deux
            // zones tappables — la protection anti-tap-traversant reste réelle.)
            .padding(.vertical, 3)
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
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
        .accessibilityLabel(String(localized: "story.viewer.a11y.position", defaultValue: "Story \(currentIndex + 1) sur \(group?.stories.count ?? 0)", bundle: .main))
        .accessibilityValue(String(localized: "story.viewer.a11y.percent", defaultValue: "\(Int(progress * 100)) pourcent", bundle: .main))
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
