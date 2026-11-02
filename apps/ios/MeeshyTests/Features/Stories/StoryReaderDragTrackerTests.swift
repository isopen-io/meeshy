import XCTest
@testable import Meeshy

/// The reader's drag bookkeeping (#13135): which axis the gesture took, the
/// surface state frozen at its start, the claims of the reaction strip and the
/// composer, and the purge that keeps a lost `onEnded` from freezing the story.
final class StoryReaderDragTrackerTests: XCTestCase {

    private func track(_ sut: inout StoryReaderDragTracker, dx: CGFloat, dy: CGFloat,
                       feature: Bool = false, yields: Bool = false) -> StoryReaderDragTracker.Axis {
        sut.track(dx: dx, dy: dy, featureAtStart: feature, horizontalYields: { yields })
    }

    func test_track_dominantHorizontalMovement_decidesHorizontal() {
        var sut = StoryReaderDragTracker()
        XCTAssertEqual(track(&sut, dx: 40, dy: 5), .horizontal)
        XCTAssertTrue(sut.isInFlight)
    }

    func test_track_dominantVerticalMovement_decidesVertical_inBothDirections() {
        var down = StoryReaderDragTracker()
        XCTAssertEqual(track(&down, dx: 2, dy: 40), .vertical)
        var up = StoryReaderDragTracker()
        XCTAssertEqual(track(&up, dx: 2, dy: -40), .vertical)
    }

    func test_track_ambiguousMovement_staysUndecided_soThePlaybackKeepsRunning() {
        var sut = StoryReaderDragTracker()
        XCTAssertEqual(track(&sut, dx: 20, dy: 15), .undecided)
        XCTAssertFalse(sut.isInFlight)
    }

    func test_track_horizontalYieldingToTheStrip_staysUndecided_andCanStillGoVertical() {
        var sut = StoryReaderDragTracker()
        XCTAssertEqual(track(&sut, dx: 40, dy: 0, yields: true), .undecided)
        XCTAssertEqual(track(&sut, dx: 0, dy: 40), .vertical)
    }

    func test_track_yieldIsConsultedOnlyForAHorizontalDecision() {
        var sut = StoryReaderDragTracker()
        var consulted = 0
        _ = sut.track(dx: 0, dy: 40, featureAtStart: false, horizontalYields: { consulted += 1; return true })
        XCTAssertEqual(consulted, 0)
    }

    func test_track_decidedAxis_isKeptForTheWholeGesture() {
        var sut = StoryReaderDragTracker()
        _ = track(&sut, dx: 40, dy: 0)
        XCTAssertEqual(track(&sut, dx: 0, dy: 200), .horizontal)
    }

    func test_track_freezesTheFeatureStateAtTheVerticalDecision_neverRereadsIt() {
        var sut = StoryReaderDragTracker()
        _ = track(&sut, dx: 0, dy: 40, feature: true)
        _ = track(&sut, dx: 0, dy: 140, feature: false)
        XCTAssertTrue(sut.finish().hadActiveFeature)
    }

    func test_finish_honoursTheFeatureConsumedByTheChildAtTouchDown() {
        var sut = StoryReaderDragTracker()
        sut.featureConsumedByTouch = true
        _ = track(&sut, dx: 0, dy: 40, feature: false)
        let ended = sut.finish()
        XCTAssertEqual(ended.axis, .vertical)
        XCTAssertTrue(ended.hadActiveFeature)
    }

    func test_finish_consumesBothSnapshots_soTheNextGestureCanCloseTheReader() {
        var sut = StoryReaderDragTracker()
        sut.featureConsumedByTouch = true
        _ = track(&sut, dx: 0, dy: 40, feature: true)
        _ = sut.finish()
        _ = track(&sut, dx: 0, dy: 40, feature: false)
        let next = sut.finish()
        XCTAssertFalse(next.hadActiveFeature)
        XCTAssertFalse(sut.featureConsumedByTouch)
        XCTAssertFalse(sut.isInFlight)
    }

    func test_claims_ofTheStripOrTheComposer_takeTheDragAway() {
        var sut = StoryReaderDragTracker()
        XCTAssertFalse(sut.isClaimedElsewhere)
        sut.reactionStripOwnsDrag = true
        XCTAssertTrue(sut.isClaimedElsewhere)
        sut.reactionStripOwnsDrag = false
        sut.composerOwnsDrag = true
        XCTAssertTrue(sut.isClaimedElsewhere)
    }

    func test_reset_purgesEveryGestureSnapshot_andBumpsTheToken() {
        var sut = StoryReaderDragTracker()
        _ = track(&sut, dx: 0, dy: 40, feature: true)
        sut.featureConsumedByTouch = true
        sut.reactionStripOwnsDrag = true
        sut.composerOwnsDrag = true
        let token = sut.resetToken
        sut.reset()
        XCTAssertFalse(sut.isInFlight)
        XCTAssertFalse(sut.featureConsumedByTouch)
        XCTAssertFalse(sut.isClaimedElsewhere)
        XCTAssertFalse(sut.finish().hadActiveFeature)
        XCTAssertEqual(sut.resetToken, token &+ 1)
    }

    func test_releaseAxis_unfreezesThePlayback_withoutTouchingTheToken() {
        var sut = StoryReaderDragTracker()
        _ = track(&sut, dx: 40, dy: 0)
        let token = sut.resetToken
        sut.releaseAxis()
        XCTAssertFalse(sut.isInFlight)
        XCTAssertEqual(sut.resetToken, token)
        XCTAssertEqual(track(&sut, dx: 0, dy: 40), .vertical)
    }
}
