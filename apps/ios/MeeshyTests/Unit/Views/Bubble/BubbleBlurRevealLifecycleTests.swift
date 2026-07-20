import XCTest
@testable import Meeshy

@MainActor
final class BubbleBlurRevealLifecycleTests: XCTestCase {

    func test_phaseDurations_sumToExpected() {
        let total = BubbleBlurRevealLifecycle.Phase.fogIn.duration
                  + BubbleBlurRevealLifecycle.Phase.blurApply.duration
                  + BubbleBlurRevealLifecycle.Phase.fogOut.duration
        XCTAssertEqual(total, 1.3, accuracy: 0.001)
    }

    func test_revealRequest_viewOnce_requiresConsume() {
        let req = BubbleBlurRevealLifecycle.RevealRequest(messageId: "m1", isViewOnce: true)
        XCTAssertTrue(req.requiresConsume)
    }

    func test_revealRequest_blurredOnly_skipsConsume() {
        let req = BubbleBlurRevealLifecycle.RevealRequest(messageId: "m1", isViewOnce: false)
        XCTAssertFalse(req.requiresConsume)
    }
}
