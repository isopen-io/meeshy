import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class ClipInspectorTests: XCTestCase {

    private func makeClip(
        id: String = "clip-1",
        start: Float = 0.5,
        duration: Float = 5.0,
        volume: Float = 0.85,
        fadeIn: Float = 0.4,
        fadeOut: Float = 0.0,
        loop: Bool = false,
        background: Bool = true
    ) -> ClipInspector.ClipSnapshot {
        ClipInspector.ClipSnapshot(
            id: id,
            displayName: "intro.mp4",
            kind: .video,
            startTime: start,
            duration: duration,
            volume: volume,
            fadeInDuration: fadeIn,
            fadeOutDuration: fadeOut,
            isLooping: loop,
            isBackground: background
        )
    }

    func test_init_quickPresentation_doesNotCrash() {
        let view = ClipInspector(
            presentation: .sheet,
            clip: makeClip(),
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        _ = view.body
    }

    func test_init_popoverPresentation_doesNotCrash() {
        let view = ClipInspector(
            presentation: .popover,
            clip: makeClip(),
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        _ = view.body
    }

    func test_formattedStart_usesFractionalSeconds() {
        let formatted = ClipInspector.formatTime(seconds: 0.5)
        XCTAssertEqual(formatted, "0:00.500")
    }

    func test_formattedDuration_above60s_includesMinutes() {
        XCTAssertEqual(ClipInspector.formatTime(seconds: 65.25), "1:05.250")
    }

    func test_volumeChanged_invokesCallback() {
        var captured: Float?
        let inspector = ClipInspector(
            presentation: .sheet,
            clip: makeClip(volume: 0.5),
            onVolumeChanged: { captured = $0 },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        inspector.simulateVolumeCommit(value: 0.72)
        XCTAssertEqual(captured ?? -1, 0.72, accuracy: 0.001)
    }

    func test_fadeBounds_areClampedTo0to3() {
        XCTAssertEqual(ClipInspector.fadeRange.lowerBound, 0)
        XCTAssertEqual(ClipInspector.fadeRange.upperBound, 3)
    }

    // MARK: - Sections visibles (modale allégée, retours user 2026-07-11)
    // Par défaut la modale ne montre que l'essentiel ; les détails (début/
    // durée, hints) vivent derrière le bouton (i), la configuration
    // d'animation derrière l'icône losange.

    func test_visibleSections_default_hidesDetailsAndAnimation() {
        let sections = ClipInspector.visibleSections(
            kind: .video, isDetailsExpanded: false, isAnimationExpanded: false)
        XCTAssertEqual(sections, [.header, .volume, .toggles, .actions])
    }

    func test_visibleSections_detailsExpanded_insertsDetailsAfterHeader() {
        let sections = ClipInspector.visibleSections(
            kind: .video, isDetailsExpanded: true, isAnimationExpanded: false)
        XCTAssertEqual(sections, [.header, .details, .volume, .toggles, .actions])
    }

    func test_visibleSections_animationExpanded_appendsConfigBelowActions() {
        let sections = ClipInspector.visibleSections(
            kind: .video, isDetailsExpanded: false, isAnimationExpanded: true)
        XCTAssertEqual(sections, [.header, .volume, .toggles, .actions, .animation])
    }

    func test_visibleSections_textAndImageClips_haveNoVolume() {
        for kind in [ClipInspector.ClipSnapshot.Kind.text, .image] {
            let sections = ClipInspector.visibleSections(
                kind: kind, isDetailsExpanded: false, isAnimationExpanded: false)
            XCTAssertEqual(sections, [.header, .toggles, .actions],
                           "\(kind) n'a pas de piste audio — pas de section volume")
        }
    }

    func test_visibleSections_bothExpanded_showsEverythingInOrder() {
        let sections = ClipInspector.visibleSections(
            kind: .audio, isDetailsExpanded: true, isAnimationExpanded: true)
        XCTAssertEqual(sections, [.header, .details, .volume, .toggles, .actions, .animation])
    }

    // MARK: - Confirmation de suppression (jamais de delete direct)

    func test_deleteConfirmation_request_presentsAlert() {
        var confirmation = ClipInspector.DeleteConfirmation()
        XCTAssertFalse(confirmation.isPresented)
        confirmation.request()
        XCTAssertTrue(confirmation.isPresented)
    }

    func test_deleteConfirmation_cancel_dismissesWithoutSideEffect() {
        var confirmation = ClipInspector.DeleteConfirmation()
        confirmation.request()
        confirmation.cancel()
        XCTAssertFalse(confirmation.isPresented)
    }

    func test_deleteConfirmation_confirm_invokesDeleteOnceAndDismisses() {
        var confirmation = ClipInspector.DeleteConfirmation()
        confirmation.request()
        var deleteCount = 0
        confirmation.confirm { deleteCount += 1 }
        XCTAssertEqual(deleteCount, 1)
        XCTAssertFalse(confirmation.isPresented)
    }

    // MARK: - Timing lié début / fin / durée (fin = début + durée)

    func test_resolveLinkedTiming_editDuration_movesEndKeepsStart() {
        let r = ClipInspector.resolveLinkedTiming(
            field: .duration, start: 2, end: 6, duration: 5, slideDuration: 20)
        XCTAssertEqual(r.start, 2, accuracy: 0.001)
        XCTAssertEqual(r.duration, 5, accuracy: 0.001)
        XCTAssertEqual(r.end, 7, accuracy: 0.001)   // start + duration
    }

    func test_resolveLinkedTiming_editEnd_keepsStartRecomputesDuration() {
        let r = ClipInspector.resolveLinkedTiming(
            field: .end, start: 2, end: 8, duration: 4, slideDuration: 20)
        XCTAssertEqual(r.start, 2, accuracy: 0.001)
        XCTAssertEqual(r.end, 8, accuracy: 0.001)
        XCTAssertEqual(r.duration, 6, accuracy: 0.001)   // end - start
    }

    func test_resolveLinkedTiming_editStart_movesClipKeepsDuration() {
        let r = ClipInspector.resolveLinkedTiming(
            field: .start, start: 3, end: 6, duration: 4, slideDuration: 20)
        XCTAssertEqual(r.start, 3, accuracy: 0.001)
        XCTAssertEqual(r.duration, 4, accuracy: 0.001)   // duration preserved
        XCTAssertEqual(r.end, 7, accuracy: 0.001)        // start + duration
    }

    func test_resolveLinkedTiming_clampsDurationNonNegativeAndEndWithinSlide() {
        let neg = ClipInspector.resolveLinkedTiming(
            field: .end, start: 5, end: 3, duration: 2, slideDuration: 20)
        XCTAssertGreaterThanOrEqual(neg.duration, 0)      // end < start clamps duration to 0
        let over = ClipInspector.resolveLinkedTiming(
            field: .duration, start: 18, end: 19, duration: 10, slideDuration: 20)
        XCTAssertLessThanOrEqual(over.end, 20)            // end clamped to slideDuration
    }
}
