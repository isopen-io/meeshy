import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Navigation (extrait de StoryViewerView+Content, #10506)

extension StoryViewerView {

    // Pas de haptic ici : `goToNext`/`goToPrevious` sont aussi le chemin de
    // l'auto-advance (timer `onCompletion`) — vibrer à chaque slide casse la
    // fluidité de lecture (retour user 2026-07-13 : « 3 retours haptiques par
    // slide »). Le tick unique par navigation MANUELLE vit au point de geste
    // (touchUp nav dans +Canvas, commit de swipe de groupe ci-dessus).
    func goToNext() {
        guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
        guard let group = currentGroup else { return }
        reportStoryNavigation(StoryNavigationTelemetry.forward(position: storyTelemetryPosition))

        if currentStoryIndex < group.stories.count - 1 {
            crossFadeStory {
                currentStoryIndex += 1
                progressClock.reset()
            }
        } else if currentGroupIndex < groups.count - 1 {
            if isPreviewMode {
                isPresented = false
                return
            }
            groupTransition(forward: true) { landOnNextGroup() }
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
        reportStoryNavigation(StoryNavigationTelemetry.backward(position: storyTelemetryPosition))

        if currentStoryIndex > 0 {
            crossFadeStory {
                currentStoryIndex -= 1
                progressClock.reset()
            }
        } else if currentGroupIndex > 0 {
            groupTransition(forward: false) { landOnPreviousGroup() }
        }
    }

    /// « Auteur précédent », borné : la liste a pu rétrécir sous le lecteur
    /// depuis que l'index a été posé (`StoryViewerPosition`).
    /// Atterrit sur l'auteur SUIVANT, borné par la liste que la transition tient. La garde du tap se lit 0,38 s
    /// avant cette closure : entre-temps `reanchorPosition` peut avoir recalé l'index (un `story:created` trié
    /// devant), et `groups[currentGroupIndex]` après un `+= 1` sortait du tableau — plantage.
    func landOnNextGroup() {
        guard let next = StoryViewerPosition.nextGroupIndex(after: currentGroupIndex, groupCount: groups.count) else { return }
        currentGroupIndex = next
        currentStoryIndex = entryIndex(of: groups[next])
        progressClock.reset()
    }

    func landOnPreviousGroup() {
        guard let landing = StoryViewerPosition.previousGroupLanding(
            storyCounts: groups.map(\.stories.count), from: currentGroupIndex
        ) else { return }
        currentGroupIndex = landing.group
        currentStoryIndex = landing.story
        progressClock.reset()
    }

    /// `groups` a bougé sous le lecteur (tri, insertion, purge) : la position
    /// suit la story montrée, pas son rang. Quand c'est la MÊME story qui reste
    /// à l'écran, les index bougent sans rejouer minuteur, intro ni marquage.
    func reanchorPosition(from old: [StoryViewerPosition.GroupShape], to new: [StoryViewerPosition.GroupShape]) {
        let here = StoryViewerPosition.Landing(group: currentGroupIndex, story: currentStoryIndex)
        guard let landing = StoryViewerPosition.reanchor(from: old, to: new, at: here), landing != here else { return }
        let shownBefore = StoryViewerPosition.storyId(at: here, in: old)
        let shownAfter = StoryViewerPosition.storyId(at: landing, in: new)
        if let shownBefore, shownBefore == shownAfter {
            reanchoredStoryId = shownBefore
            DispatchQueue.main.async { reanchoredStoryId = nil }
        }
        currentGroupIndex = landing.group
        currentStoryIndex = landing.story
    }

    /// Vrai pendant le seul tour où `reanchorPosition` a déplacé les index sans
    /// changer la story montrée : les observateurs d'index n'ont rien à rejouer.
    var isReanchoringSameStory: Bool {
        reanchoredStoryId != nil && reanchoredStoryId == currentStory?.id
    }

    /// Dismiss — shrink to small card and fly toward top
    func dismissViewer() {
        guard !isDismissing else { return }
        reportStoryNavigation(StoryNavigationTelemetry.exit(position: storyTelemetryPosition))
        isTransitioning = true
        slideTimer.setPaused(true)
        // Le son s'éteint en fondu pendant le ressort, avant la coupure de `stopAll()` (#9867).
        Task { await PlaybackCoordinator.shared.fadeOutAllExternal(duration: 0.4) }

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

    // MARK: - Télémétrie de lecture (#10506)

    /// Où en est le lecteur : la slide, le nombre de slides de l'auteur, la
    /// part écoulée de la slide et sa durée.
    var storyTelemetryPosition: StoryNavigationTelemetry.Position? {
        guard let story = currentStory, let group = currentGroup, !isPreviewMode else { return nil }
        return StoryNavigationTelemetry.Position(
            storyId: story.id,
            slideIndex: currentStoryIndex,
            slideCount: group.stories.count,
            fraction: Double(progressClock.fraction),
            durationSeconds: computedStoryDuration
        )
    }

    func reportStoryNavigation(_ events: [SocialEventV2]) {
        events.forEach { SocialEventsV2Reporter.shared.emit($0) }
    }
}

/// Ce qu'un geste de navigation dans une story DIT au catalogue v2. Pure :
/// la vue ne fait que lire sa position et remettre les événements.
nonisolated enum StoryNavigationTelemetry {
    struct Position: Equatable {
        let storyId: String
        let slideIndex: Int
        let slideCount: Int
        let fraction: Double
        let durationSeconds: Double

        var elapsedMs: Int { max(0, Int((fraction * durationSeconds * 1_000).rounded())) }
        var isAtTheEnd: Bool { slideIndex >= slideCount - 1 && fraction >= StoryNavigationTelemetry.autoAdvanceFraction }
    }

    /// Au-delà, `goToNext` vient de la minuterie, pas d'un toucher.
    static let autoAdvanceFraction = 0.97

    static func forward(position: Position?, at date: Date = Date()) -> [SocialEventV2] {
        guard let position, position.fraction < autoAdvanceFraction else { return [] }
        let tap = event(.tapForward, position: position, at: date)
        guard let skip = SocialNegative.quickSkip(visibleMs: position.elapsedMs) else { return [tap] }
        return [tap, SocialEventV2(occurredAt: date, target: target(position), surface: SocialSurface(.story), payload: .negative(skip))]
    }

    static func backward(position: Position?, at date: Date = Date()) -> [SocialEventV2] {
        guard let position else { return [] }
        return [event(.tapBack, position: position, at: date)]
    }

    /// La fermeture avant la fin de la dernière slide de l'auteur.
    static func exit(position: Position?, at date: Date = Date()) -> [SocialEventV2] {
        guard let position, !position.isAtTheEnd else { return [] }
        return [event(.exitBeforeEnd, position: position, at: date)]
    }

    static func event(_ action: SocialStoryEvent.Action, position: Position, at date: Date = Date()) -> SocialEventV2 {
        SocialEventV2(
            occurredAt: date,
            target: target(position),
            surface: SocialSurface(.story),
            payload: .story(SocialStoryEvent(action: action, slideIndex: position.slideIndex, slideCount: position.slideCount, elapsedMs: position.elapsedMs))
        )
    }

    private static func target(_ position: Position) -> SocialTarget {
        SocialTarget(kind: .story, id: position.storyId)
    }
}
