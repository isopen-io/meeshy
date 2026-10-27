import SwiftUI
import MeeshySDK
import MeeshyUI

extension StoryViewerView {

    // MARK: - Unified Drag Gesture (horizontal = groups, vertical = dismiss)

    // Les DEUX lois de cession de ce drag — et la clé qui alimente la première —
    // vivent dans `StoryReaderDragOwnership.swift` : `StoryReaderDragStartZone`
    // (cède sur le point de départ, aux panneaux défilants) et
    // `StoryReactionStripGesture` (cède sur la direction, à la barre de
    // réactions). Elles y disent aussi pourquoi les deux critères ne sont pas
    // interchangeables.

    var unifiedDragGesture: some Gesture {
        DragGesture(minimumDistance: 15, coordinateSpace: .global)
            .onChanged { value in
                guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
                // Yields to the reaction strip (#6083) and the composer (#8431),
                // then to a rail scrub (#7878): neither cube nor dismiss.
                guard !drag.isClaimedElsewhere, !isScrubbingRail else { return }
                // Born INSIDE a scrollable surface, the gesture belongs to its
                // scroll: an `UIScrollView` taking the sequence never delivers
                // our `onEnded` (`StoryReaderDragStartZone`, fail-safe when the
                // surface edge is unknown).
                guard !StoryReaderDragStartZone.yieldsToScrollableSurface(
                    hasScrollableSurface: hasScrollableReaderSurface,
                    surfaceTopY: effectiveScrollableSurfaceTopY,
                    dragStartY: value.startLocation.y
                ) else { return }
                let dx = value.translation.width
                let dy = value.translation.height
                let axis = drag.track(
                    dx: dx, dy: dy, featureAtStart: hasActiveReaderFeature,
                    horizontalYields: { StoryReaderHorizontalYield.yields(stripFrame: reactionStripFrame, chromeFrames: readerChromeFrames, dragStart: value.startLocation) }
                )
                switch axis {
                case .horizontal:
                    horizontalDrag = StoryGroupSwipeDecision.displayedTranslation(
                        dx, width: screenW,
                        hasNeighbor: dx < 0 ? currentGroupIndex < groups.count - 1 : currentGroupIndex > 0
                    )
                    // Reversible mid-gesture: the cube face follows the direction.
                    let total = groupSlide + dx
                    neighborPreviewDirection = total < 0 ? 1 : (total > 0 ? -1 : 0)
                case .vertical:
                    // Down: the card follows the finger. Up: fullscreen is a
                    // reframing, not a move — the card stays put.
                    dragOffset = max(0, dy)
                case .undecided:
                    break
                }
            }
            .onEnded { value in
                let ended = drag.finish()
                guard !isDismissing && !isTransitioning && !isComposerEngaged else {
                    snapBackAll()
                    return
                }
                switch ended.axis {
                case .horizontal:
                    concludeGroupSwipe(value)
                case .vertical:
                    concludeVerticalSwipe(value, hadActiveFeature: ended.hadActiveFeature)
                case .undecided:
                    snapBackAll()
                }
            }
    }

    /// Group navigation. The cube geometry lives in SCREEN space: never flip
    /// this sign alone (#4297) — the commit face would leave against the finger.
    /// Progressive and cancellable all the way (#11192).
    private func concludeGroupSwipe(_ value: DragGesture.Value) {
        groupSlide += horizontalDrag
        horizontalDrag = 0
        switch StoryGroupSwipeDecision.decide(
            translation: value.translation.width,
            predictedEnd: value.predictedEndTranslation.width,
            width: screenW,
            hasNext: currentGroupIndex < groups.count - 1,
            hasPrevious: currentGroupIndex > 0
        ) {
        case .next:
            HapticFeedback.light()
            groupTransition(forward: true) { landOnNextGroup() }
        case .previous:
            HapticFeedback.light()
            groupTransition(forward: false) { landOnPreviousGroup() }
        case .cancel:
            snapBackAll()
        }
    }

    /// Fullscreen or dismiss (`StoryVerticalGestureDecisions`). The surface
    /// state is the one FROZEN at the gesture start, never reread here: closing
    /// a surface by swiping down never leaves the reader.
    private func concludeVerticalSwipe(_ value: DragGesture.Value, hadActiveFeature: Bool) {
        switch StoryVerticalGestureDecisions.decide(
            translationY: value.translation.height,
            predictedY: value.predictedEndTranslation.height,
            isFullscreen: isFullscreenStorySession,
            threshold: 120,
            hasActiveFeature: hadActiveFeature
        ) {
        case .dismissActiveFeature:
            dismissActiveReaderFeature()
            snapDragOffsetBack()
        case .dismissViewer:
            dismissViewer()
        case .enterFullscreen:
            HapticFeedback.light()
            setFullscreenSession(true)
            snapDragOffsetBack()
        case .exitFullscreen:
            HapticFeedback.light()
            setFullscreenSession(false)
            snapDragOffsetBack()
        case .cancel, .none:
            snapDragOffsetBack()
        }
    }

    /// Bascule la session plein écran et synchronise l'état au repos du chrome.
    /// Même mécanique que l'entrée par le menu « … » (`StoryViewerView+Sidebar`)
    /// — un seul comportement, deux points d'entrée.
    func setFullscreenSession(_ enabled: Bool) {
        isFullscreenStorySession = enabled
        withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
            chromeVisible = !enabled
        }
    }

    /// Ramène la carte à sa position de repos après un geste vertical non
    /// validé (ou validé sans dismiss), et relance la lecture.
    private func snapDragOffsetBack() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
            dragOffset = 0
        }
        resumeTimer()
    }

    /// The anti-sticky-state net (`StoryReaderDragTracker.reset()`): called by
    /// `snapBackAll()`, at the start of every group transition, and when the
    /// reader leaves mid-drag. Paths where `onEnded` never comes are repaired
    /// by the state-driven pause, at the next gesture.
    func resetGestureTracking() {
        drag.reset()
    }

    private func snapBackAll() {
        resetGestureTracking()
        withAnimation(StoryGroupCube.settleAnimation) {
            horizontalDrag = 0
            dragOffset = 0
            groupSlide = 0
        }
        delays.run(after: .milliseconds(320)) { if !isTransitioning { neighborPreviewDirection = 0 } }
        resumeTimer()
    }
}
