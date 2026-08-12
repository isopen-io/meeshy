import XCTest
@testable import Meeshy

/// Pure playback-position math backing `mediaConsumptionCard`'s per-participant
/// progress bar / percentage — ported from the (now-deleted) `MessageInfoSheet
/// .mediaFraction` so the "who watched how far" detail keeps a testable core
/// instead of inline arithmetic in the view body.
@MainActor
final class MessageViewsDetailMediaConsumptionTests: XCTestCase {

    func test_positionFraction_completeFlag_isAlwaysOne() {
        XCTAssertEqual(
            MessageViewsDetailView.positionFraction(positionMs: 100, complete: true, durationMs: 10_000),
            1
        )
    }

    func test_positionFraction_completeFlag_ignoresMissingDuration() {
        XCTAssertEqual(
            MessageViewsDetailView.positionFraction(positionMs: nil, complete: true, durationMs: nil),
            1
        )
    }

    func test_positionFraction_partialPosition_computesRatio() {
        XCTAssertEqual(
            MessageViewsDetailView.positionFraction(positionMs: 2_500, complete: false, durationMs: 10_000),
            0.25
        )
    }

    func test_positionFraction_missingDuration_returnsZero() {
        XCTAssertEqual(
            MessageViewsDetailView.positionFraction(positionMs: 2_500, complete: false, durationMs: nil),
            0
        )
    }

    func test_positionFraction_missingPosition_returnsZero() {
        XCTAssertEqual(
            MessageViewsDetailView.positionFraction(positionMs: nil, complete: false, durationMs: 10_000),
            0
        )
    }

    func test_positionFraction_zeroDuration_returnsZero() {
        XCTAssertEqual(
            MessageViewsDetailView.positionFraction(positionMs: 500, complete: false, durationMs: 0),
            0
        )
    }

    func test_positionFraction_positionBeyondDuration_clampsToOne() {
        XCTAssertEqual(
            MessageViewsDetailView.positionFraction(positionMs: 12_000, complete: false, durationMs: 10_000),
            1
        )
    }

    func test_positionFraction_negativePosition_clampsToZero() {
        XCTAssertEqual(
            MessageViewsDetailView.positionFraction(positionMs: -500, complete: false, durationMs: 10_000),
            0
        )
    }
}
