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
            groupTransition(forward: true) {
                currentGroupIndex += 1
                currentStoryIndex = entryIndex(of: groups[currentGroupIndex])
                progressClock.reset()
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
        reportStoryNavigation(StoryNavigationTelemetry.backward(position: storyTelemetryPosition))

        if currentStoryIndex > 0 {
            crossFadeStory {
                currentStoryIndex -= 1
                progressClock.reset()
            }
        } else if currentGroupIndex > 0 {
            groupTransition(forward: false) {
                currentGroupIndex -= 1
                currentStoryIndex = max(0, groups[currentGroupIndex].stories.count - 1)
                progressClock.reset()
            }
        }
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
