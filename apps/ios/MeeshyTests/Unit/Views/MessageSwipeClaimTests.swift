import XCTest
@testable import Meeshy

/// #16880 — balayer une bulle pour répondre ou transférer n'ouvre jamais ce que
/// touche le doigt au départ (l'avatar de l'expéditeur vit dans la bulle).
@MainActor
final class MessageSwipeClaimTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 1_000)

    override func tearDown() {
        MessageSwipeClaim.release(at: .distantPast)
        super.tearDown()
    }

    func test_isClaimed_withoutAnySwipe_isFalse() {
        MessageSwipeClaim.release(at: .distantPast)
        XCTAssertFalse(MessageSwipeClaim.isClaimed(at: start))
    }

    func test_isClaimed_whileSwipeIsEngaged_isTrue() {
        MessageSwipeClaim.engage(at: start)
        XCTAssertTrue(MessageSwipeClaim.isClaimed(at: start.addingTimeInterval(1)))
    }

    func test_isClaimed_justAfterRelease_stillTrueSoTheLiftingTapIsSwallowed() {
        MessageSwipeClaim.engage(at: start)
        MessageSwipeClaim.release(at: start.addingTimeInterval(0.5))
        XCTAssertTrue(MessageSwipeClaim.isClaimed(at: start.addingTimeInterval(0.6)))
    }

    func test_isClaimed_afterReleaseWindow_isFalseSoTheNextTapOpens() {
        MessageSwipeClaim.engage(at: start)
        MessageSwipeClaim.release(at: start.addingTimeInterval(0.5))
        XCTAssertFalse(MessageSwipeClaim.isClaimed(at: start.addingTimeInterval(0.5 + MessageSwipeClaim.releaseWindow + 0.01)))
    }

    func test_isClaimed_engagementNeverReleased_expiresInsteadOfBlockingForever() {
        MessageSwipeClaim.engage(at: start)
        XCTAssertFalse(MessageSwipeClaim.isClaimed(at: start.addingTimeInterval(MessageSwipeClaim.staleEngagement + 0.01)))
    }

    func test_release_withoutEngagement_claimsNothing() {
        MessageSwipeClaim.release(at: .distantPast)
        MessageSwipeClaim.release(at: start)
        XCTAssertFalse(MessageSwipeClaim.isClaimed(at: start.addingTimeInterval(0.01)))
    }

    func test_guarded_swallowsActionDuringSwipe_andLetsItThroughAfter() {
        var opened: [String] = []
        let open = MessageSwipeClaim.guarded { (id: String) in opened.append(id) }

        MessageSwipeClaim.engage()
        open("pendant")
        MessageSwipeClaim.release(at: Date().addingTimeInterval(-(MessageSwipeClaim.releaseWindow + 1)))
        open("après")

        XCTAssertEqual(opened, ["après"])
    }
}
