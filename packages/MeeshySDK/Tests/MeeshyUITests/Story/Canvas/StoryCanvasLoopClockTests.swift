import XCTest
import UIKit
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// **Une scène qui reboucle rejoue AVEC son horloge (#10555).**
///
/// La fin d'une scène arrête le lien de lecture. Le tour suivant change
/// l'identité de la slide et repasse par `setMode(.play, time: .zero)` sans
/// changer de mode : sans réarmement, la vidéo et le son repartent, et le
/// playhead — donc la barre de progression de l'hôte — reste figé.
@MainActor
final class StoryCanvasLoopClockTests: XCTestCase {

    private func makeSlide(pass: Int) -> StorySlide {
        var effects = StoryEffects()
        effects.background = "#112233"
        return StorySlide(id: pass == 0 ? "reel@s1" : "reel@s1#\(pass)", effects: effects, duration: 6)
    }

    private func makeMountedCanvas() -> (view: StoryCanvasUIView, window: UIWindow) {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 412, height: 732))
        let view = StoryCanvasUIView(slide: makeSlide(pass: 0), mode: .play)
        view.frame = window.bounds
        window.addSubview(view)
        window.isHidden = false
        view.layoutIfNeeded()
        return (view, window)
    }

    private func playToTheEnd(_ view: StoryCanvasUIView) {
        view._forceContentReadyForTesting()
        view._advancePlayheadForTesting(by: view.effectiveSlideTotalDuration)
    }

    private func loop(_ view: StoryCanvasUIView, pass: Int) {
        view.slide = makeSlide(pass: pass)
        view.setMode(.play, time: .zero)
    }

    func test_sceneEnd_stopsThePlaybackClock() {
        let (view, window) = makeMountedCanvas()
        XCTAssertNotNil(view.displayLink, "une scène née en lecture a son horloge")

        playToTheEnd(view)

        XCTAssertNil(view.displayLink)
        withExtendedLifetime(window) {}
    }

    func test_loopTurn_rearmsThePlaybackClock_andRestartsFromZero() {
        let (view, window) = makeMountedCanvas()
        var published: [Double] = []
        view.onPlaybackTime = { published.append($0) }
        playToTheEnd(view)

        loop(view, pass: 1)

        XCTAssertNotNil(view.displayLink, "le tour suivant rejoue avec son horloge : la barre de l'hôte repart")
        XCTAssertEqual(view.currentTime.seconds, 0, accuracy: 1e-6)

        view._forceContentReadyForTesting()
        view._advancePlayheadForTesting(by: 0.5)
        XCTAssertEqual(published.last ?? -1, 0.5, accuracy: 1e-3,
                       "la position publiée repart du début du tour, pas de la fin du précédent")
        withExtendedLifetime(window) {}
    }

    func test_loopTurn_everyTurnCompletesAgain() {
        let (view, window) = makeMountedCanvas()
        let turns = TurnCounter()
        view.setReaderContext(StoryReaderContext(onCompletion: { turns.increment() }))

        playToTheEnd(view)
        loop(view, pass: 1)
        playToTheEnd(view)
        loop(view, pass: 2)

        XCTAssertEqual(turns.value, 2)
        XCTAssertNotNil(view.displayLink, "le troisième tour a son horloge comme le premier")
        withExtendedLifetime(window) {}
    }

    func test_loopTurn_underHostPause_rearmsAPausedClock() {
        let (view, window) = makeMountedCanvas()
        playToTheEnd(view)
        view.setPaused(true)

        loop(view, pass: 1)

        XCTAssertEqual(view.displayLink?.isPaused, true,
                       "réarmée sous la pause de l'hôte, l'horloge attend la reprise au lieu de jouer sous le gel")
        withExtendedLifetime(window) {}
    }

    func test_loopTurn_offScreen_leavesTheClockToTheReturnOnScreen() {
        let view = StoryCanvasUIView(slide: makeSlide(pass: 0), mode: .play)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()
        playToTheEnd(view)

        loop(view, pass: 1)

        XCTAssertNil(view.displayLink, "hors écran, c'est le retour à l'écran qui réarme l'horloge")
    }
}

private final class TurnCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    var value: Int { lock.withLock { count } }

    func increment() { lock.withLock { count += 1 } }
}
