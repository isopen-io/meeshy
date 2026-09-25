import XCTest
import CoreMedia
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// #7878 — une scène se parcourt au doigt : la barre pointe une fraction, le
/// canvas se redessine à l'instant correspondant, puis reprend de là.
///
/// Le moteur n'est pas réécrit : le scrubber déplace `currentTime`, la SEULE
/// horloge que la vidéo, l'audio et les fenêtres d'objets suivent déjà.
@MainActor
final class ScenePlaybackScrubberTests: XCTestCase {

    private func canvas(duration: TimeInterval = 8) -> StoryCanvasUIView {
        var effects = StoryEffects()
        effects.background = "#112233"
        return StoryCanvasUIView(slide: StorySlide(id: "slide-scrub", effects: effects, duration: duration),
                                 mode: .play)
    }

    private func attached(duration: TimeInterval = 8) -> (ScenePlaybackScrubber, StoryCanvasUIView) {
        let scrubber = ScenePlaybackScrubber()
        let view = canvas(duration: duration)
        scrubber.attach(view)
        return (scrubber, view)
    }

    // MARK: - Sans canvas, rien ne casse

    func test_scrub_beforeAnyCanvas_isHarmless() {
        let scrubber = ScenePlaybackScrubber()

        scrubber.begin()
        scrubber.scrub(toFraction: 0.5)
        scrubber.end(atFraction: 0.5)

        XCTAssertFalse(scrubber.isScrubbing)
    }

    // MARK: - Le geste suspend la lecture

    func test_begin_attachedCanvas_pausesPlayback() {
        let (scrubber, view) = attached()

        scrubber.begin()

        XCTAssertTrue(scrubber.isScrubbing)
        XCTAssertTrue(view.isPlaybackPaused, "Pendant le glissé, la scène ne court pas sous le doigt")
    }

    // MARK: - La scène se redessine à l'instant pointé

    func test_scrub_quarter_movesThePlayheadToAQuarterOfTheScene() {
        let (scrubber, view) = attached(duration: 8)
        scrubber.begin()

        scrubber.scrub(toFraction: 0.25)

        XCTAssertEqual(view.currentTime.seconds, view.effectiveSlideTotalDuration * 0.25, accuracy: 0.001)
    }

    func test_scrub_backToZero_reachesTheOrigin() {
        let (scrubber, view) = attached(duration: 8)
        scrubber.begin()
        scrubber.scrub(toFraction: 0.6)

        scrubber.scrub(toFraction: 0)

        XCTAssertEqual(view.currentTime.seconds, 0, accuracy: 0.0001,
                       "Reculer jusqu'au début doit être possible — `seedPlayhead` refuse zéro")
    }

    func test_scrub_outOfRange_isClampedToTheScene() {
        let (scrubber, view) = attached(duration: 8)
        scrubber.begin()

        scrubber.scrub(toFraction: 3)
        XCTAssertEqual(view.currentTime.seconds, view.effectiveSlideTotalDuration, accuracy: 0.0001)

        scrubber.scrub(toFraction: -1)
        XCTAssertEqual(view.currentTime.seconds, 0, accuracy: 0.0001)

        scrubber.scrub(toFraction: .nan)
        XCTAssertEqual(view.currentTime.seconds, 0, accuracy: 0.0001)
    }

    func test_scrub_withoutBegin_isIgnored() {
        let (scrubber, view) = attached(duration: 8)

        scrubber.scrub(toFraction: 0.5)

        XCTAssertEqual(view.currentTime.seconds, 0, accuracy: 0.0001,
                       "Un scrub n'existe qu'entre `begin` et `end`")
    }

    // MARK: - Relâcher reprend depuis la position choisie

    func test_end_hostPlaying_resumesFromTheChosenPosition() {
        let (scrubber, view) = attached(duration: 8)
        scrubber.begin()
        scrubber.scrub(toFraction: 0.3)

        scrubber.end(atFraction: 0.5)

        XCTAssertFalse(scrubber.isScrubbing)
        XCTAssertFalse(view.isPlaybackPaused)
        XCTAssertEqual(view.currentTime.seconds, view.effectiveSlideTotalDuration * 0.5, accuracy: 0.001)
    }

    func test_end_hostPaused_keepsThePause() {
        let (scrubber, view) = attached(duration: 8)
        scrubber.hostPaused = true
        scrubber.begin()

        scrubber.end(atFraction: 0.5)

        XCTAssertTrue(view.isPlaybackPaused,
                      "Un scrub ne relance pas une scène que l'utilisateur avait mise en pause")
    }

    func test_end_afterTheSceneCompleted_rearmsPlayback() {
        let (scrubber, view) = attached(duration: 8)
        view.simulateTickAt(seconds: view.effectiveSlideTotalDuration)
        XCTAssertTrue(view.completionFired, "Fixture : la scène est allée au bout")

        scrubber.begin()
        scrubber.scrub(toFraction: 0.4)
        scrubber.end(atFraction: 0.4)

        XCTAssertFalse(view.completionFired, "Reculer après la fin rejoue la scène jusqu'à sa fin")
        XCTAssertNotNil(view.displayLink, "L'horloge du canvas repart")
    }

    // MARK: - Le fil descend du player jusqu'au canvas

    func test_scenePlayer_forwardsItsScrubberToTheCanvasHost() {
        let scrubber = ScenePlaybackScrubber()
        let player = MeeshyScenePlayer(document: CanvasV3(scenes: []),
                                       mode: .reel,
                                       sceneIndex: .constant(0),
                                       isPlaying: .constant(true),
                                       accentColorHex: "#7C3AED",
                                       scrubber: scrubber)

        XCTAssertTrue(player.host.scrubber === scrubber)
    }

    func test_scenePlayer_withoutScrubber_mountsNone() {
        let player = MeeshyScenePlayer(document: CanvasV3(scenes: []),
                                       mode: .card,
                                       sceneIndex: .constant(0),
                                       isPlaying: .constant(false),
                                       accentColorHex: "#7C3AED")

        XCTAssertNil(player.host.scrubber)
    }
}
