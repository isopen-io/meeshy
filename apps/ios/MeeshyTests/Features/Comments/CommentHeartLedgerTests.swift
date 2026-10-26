import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

final class CommentHeartLedgerTests: XCTestCase {

    private func makeComment(id: String, likes: Int = 0, reactions: [String]? = nil) -> FeedComment {
        FeedComment(id: id, author: "alice", authorId: "a1", content: "stub", likes: likes,
                    currentUserReactions: reactions)
    }

    func test_begin_onUnlikedComment_likesOptimisticallyAndLocksTheHeart() {
        var ledger = CommentHeartLedger()

        let wasLiked = ledger.begin("c1")

        XCTAssertEqual(wasLiked, false)
        XCTAssertTrue(ledger.isLiked("c1"))
        XCTAssertTrue(ledger.isInFlight("c1"))
        XCTAssertEqual(ledger.displayedLikes(of: makeComment(id: "c1", likes: 3)), 4)
    }

    func test_begin_whileInFlight_refusesTheSecondTap() {
        var ledger = CommentHeartLedger()
        _ = ledger.begin("c1")

        XCTAssertNil(ledger.begin("c1"))
        XCTAssertTrue(ledger.isLiked("c1"))
    }

    func test_settle_delivered_keepsTheOptimisticHeartAndUnlocks() {
        var ledger = CommentHeartLedger()
        let wasLiked = ledger.begin("c1") ?? true

        ledger.settle("c1", wasLiked: wasLiked, delivered: true)

        XCTAssertTrue(ledger.isLiked("c1"))
        XCTAssertFalse(ledger.isInFlight("c1"))
        XCTAssertEqual(ledger.displayedLikes(of: makeComment(id: "c1", likes: 3)), 4)
    }

    func test_settle_undelivered_rollsTheHeartBack() {
        var ledger = CommentHeartLedger()
        ledger.seed(from: [makeComment(id: "c1", reactions: [MeeshyQuickReactions.heart])])
        let wasLiked = ledger.begin("c1") ?? false

        ledger.settle("c1", wasLiked: wasLiked, delivered: false)

        XCTAssertTrue(ledger.isLiked("c1"))
        XCTAssertFalse(ledger.isInFlight("c1"))
        XCTAssertEqual(ledger.displayedLikes(of: makeComment(id: "c1", likes: 5)), 5)
    }

    func test_displayedLikes_neverGoesBelowZero() {
        var ledger = CommentHeartLedger()
        ledger.seed(from: [makeComment(id: "c1", reactions: [MeeshyQuickReactions.heart])])
        _ = ledger.begin("c1")

        XCTAssertEqual(ledger.displayedLikes(of: makeComment(id: "c1", likes: 0)), 0)
    }

    func test_seed_isAdditiveAndOnlyCountsTheHeart() {
        var ledger = CommentHeartLedger()
        _ = ledger.begin("c0")

        ledger.seed(from: [
            makeComment(id: "c1", reactions: [MeeshyQuickReactions.heart]),
            makeComment(id: "c2", reactions: ["\u{1F525}"]),
        ])

        XCTAssertEqual(ledger.likedIds, ["c0", "c1"])
    }

    func test_reconcile_myReaction_lightsMyHeartAndClearsTheDelta() {
        var ledger = CommentHeartLedger()
        _ = ledger.begin("c1")

        let count = ledger.reconcile(commentId: "c1", count: 7, reactorUserIds: ["me"], actorUserId: "me", myUserId: "me")

        XCTAssertEqual(count, 7)
        XCTAssertTrue(ledger.isLiked("c1"))
        XCTAssertEqual(ledger.displayedLikes(of: makeComment(id: "c1", likes: count)), 7)
    }

    func test_reconcile_myOwnUnlike_turnsMyHeartOff() {
        var ledger = CommentHeartLedger()
        ledger.seed(from: [makeComment(id: "c1", reactions: [MeeshyQuickReactions.heart])])

        let count = ledger.reconcile(commentId: "c1", count: 2, reactorUserIds: ["other"], actorUserId: "me", myUserId: "me")

        XCTAssertEqual(count, 2)
        XCTAssertFalse(ledger.isLiked("c1"))
    }

    func test_reconcile_aThirdPartyAggregateWhileMyLikeIsInFlight_keepsMyHeartAndCountsIt() {
        var ledger = CommentHeartLedger()
        _ = ledger.begin("c1")

        let count = ledger.reconcile(commentId: "c1", count: 4, reactorUserIds: ["other"], actorUserId: "other", myUserId: "me")

        XCTAssertEqual(count, 5)
        XCTAssertTrue(ledger.isLiked("c1"))
        XCTAssertEqual(ledger.displayedLikes(of: makeComment(id: "c1", likes: count)), 5)
    }

    func test_reconcile_aThirdPartyAggregate_neverLightsMyHeart() {
        var ledger = CommentHeartLedger()

        let count = ledger.reconcile(commentId: "c1", count: 1, reactorUserIds: ["other"], actorUserId: "other", myUserId: "me")

        XCTAssertEqual(count, 1)
        XCTAssertFalse(ledger.isLiked("c1"))
    }

    func test_reconcile_withoutSignedInUser_takesTheServerCount() {
        var ledger = CommentHeartLedger()
        _ = ledger.begin("c1")

        let count = ledger.reconcile(commentId: "c1", count: 9, reactorUserIds: [], actorUserId: "x", myUserId: nil)

        XCTAssertEqual(count, 9)
        XCTAssertEqual(ledger.displayedLikes(of: makeComment(id: "c1", likes: count)), 9)
    }
}
