import XCTest
import SwiftUI
@testable import Meeshy

/// #7878 — la barre d'une scène (réel composé, story) se parcourt au doigt.
/// La logique du geste est pure : ce qu'un doigt pointe, ce que la barre
/// montre, ce qui est remis à la lecture au relâcher.
@MainActor
final class SceneScrubStateTests: XCTestCase {

    // MARK: - Fraction depuis la position du doigt

    func test_fraction_middleOfTheTrack_isHalf() {
        XCTAssertEqual(SceneScrubState.fraction(locationX: 150, width: 300), 0.5, accuracy: 0.0001)
    }

    func test_fraction_fingerBeyondTheEdges_isClamped() {
        XCTAssertEqual(SceneScrubState.fraction(locationX: -40, width: 300), 0)
        XCTAssertEqual(SceneScrubState.fraction(locationX: 900, width: 300), 1)
    }

    func test_fraction_trackWithoutWidth_isZero() {
        XCTAssertEqual(SceneScrubState.fraction(locationX: 20, width: 0), 0)
        XCTAssertEqual(SceneScrubState.fraction(locationX: .nan, width: 300), 0)
    }

    // MARK: - Temps depuis fraction

    func test_seconds_quarterOfAnEightSecondScene_isTwo() {
        XCTAssertEqual(SceneScrubState.seconds(fraction: 0.25, duration: 8), 2, accuracy: 0.0001)
    }

    func test_seconds_withoutDuration_isZero() {
        XCTAssertEqual(SceneScrubState.seconds(fraction: 0.5, duration: 0), 0)
        XCTAssertEqual(SceneScrubState.seconds(fraction: 2, duration: 8), 8, accuracy: 0.0001)
    }

    // MARK: - État du geste

    func test_track_firstTouch_beginsTheScrub() {
        var state = SceneScrubState()

        let phase = state.track(locationX: 60, width: 300)

        XCTAssertEqual(phase, .began)
        XCTAssertTrue(state.isScrubbing)
        XCTAssertEqual(state.fraction ?? -1, 0.2, accuracy: 0.0001)
    }

    func test_track_followingMoves_areMoves() {
        var state = SceneScrubState()
        _ = state.track(locationX: 60, width: 300)

        let phase = state.track(locationX: 240, width: 300)

        XCTAssertEqual(phase, .moved)
        XCTAssertEqual(state.fraction ?? -1, 0.8, accuracy: 0.0001)
    }

    func test_finish_afterAScrub_returnsTheChosenFractionAndRests() {
        var state = SceneScrubState()
        _ = state.track(locationX: 90, width: 300)

        let committed = state.finish()

        XCTAssertEqual(committed ?? -1, 0.3, accuracy: 0.0001)
        XCTAssertFalse(state.isScrubbing, "Relâcher rend toujours la barre à son repos")
    }

    func test_finish_withoutScrub_returnsNothing() {
        var state = SceneScrubState()

        XCTAssertNil(state.finish())
    }

    // MARK: - Ce que la barre montre

    func test_displayed_atRest_followsPlayback() {
        XCTAssertEqual(SceneScrubState().displayed(playback: 0.42), 0.42, accuracy: 0.0001)
    }

    func test_displayed_whileScrubbing_followsTheFinger() {
        var state = SceneScrubState()
        _ = state.track(locationX: 30, width: 300)

        XCTAssertEqual(state.displayed(playback: 0.9), 0.1, accuracy: 0.0001)
    }

    // MARK: - Accessibilité : ±10 %

    func test_adjusted_increment_addsTenPercent() {
        XCTAssertEqual(SceneScrubState.adjusted(0.35, direction: .increment), 0.45, accuracy: 0.0001)
    }

    func test_adjusted_decrement_isClampedAtTheStart() {
        XCTAssertEqual(SceneScrubState.adjusted(0.05, direction: .decrement), 0, accuracy: 0.0001)
        XCTAssertEqual(SceneScrubState.adjusted(0.95, direction: .increment), 1, accuracy: 0.0001)
    }
}
