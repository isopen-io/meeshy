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

        let count = ledger.reconcile(commentId: "c1", count: 7, change: .added, actorUserId: "me", myUserId: "me")

        XCTAssertEqual(count, 7)
        XCTAssertTrue(ledger.isLiked("c1"))
        XCTAssertEqual(ledger.displayedLikes(of: makeComment(id: "c1", likes: count)), 7)
    }

    func test_reconcile_myOwnUnlike_turnsMyHeartOff() {
        var ledger = CommentHeartLedger()
        ledger.seed(from: [makeComment(id: "c1", reactions: [MeeshyQuickReactions.heart])])

        let count = ledger.reconcile(commentId: "c1", count: 2, change: .removed, actorUserId: "me", myUserId: "me")

        XCTAssertEqual(count, 2)
        XCTAssertFalse(ledger.isLiked("c1"))
    }

    /// L'affichage est `likes + delta` : c'est LUI que ce témoin garde. Depuis
    /// #20410 le registre GARDE le delta d'un geste en vol au lieu de l'absorber
    /// dans le compte rendu — l'affichage est le même, et le roster de réacteurs
    /// n'est plus consulté.
    func test_reconcile_aThirdPartyAggregateWhileMyLikeIsInFlight_keepsMyHeartAndCountsIt() {
        var ledger = CommentHeartLedger()
        _ = ledger.begin("c1")

        let count = ledger.reconcile(commentId: "c1", count: 4, change: .added, actorUserId: "other", myUserId: "me")

        XCTAssertTrue(ledger.isLiked("c1"))
        XCTAssertEqual(ledger.displayedLikes(of: makeComment(id: "c1", likes: count)), 5)
    }

    func test_reconcile_aThirdPartyAggregate_neverLightsMyHeart() {
        var ledger = CommentHeartLedger()

        let count = ledger.reconcile(commentId: "c1", count: 1, change: .added, actorUserId: "other", myUserId: "me")

        XCTAssertEqual(count, 1)
        XCTAssertFalse(ledger.isLiked("c1"))
    }

    /// **LE TÉMOIN DE LA COUPE DU ROSTER (#20410).** Un lecteur qui a DÉJÀ aimé
    /// — son cœur posé, rien en vol — reçoit l'agrégat d'un tiers. Le compte du
    /// serveur le compte déjà : l'affichage doit valoir le compte, exactement.
    ///
    /// C'est le cas que l'ancienne implémentation ne tenait que par le ROSTER
    /// (la branche « suis-je nommé parmi les réacteurs ? »), et que la
    /// réparation prescrite par l'issue — retirer les deux branches et garder
    /// « mon cœur est posé ⇒ compte + 1 » — rendait FAUX : un cœur de trop pour
    /// tout lecteur ayant aimé, c'est-à-dire exactement le défaut qu'elle visait.
    func test_reconcile_aThirdPartyAggregate_whenIAlreadyLikedAndNothingIsInFlight_showsTheServerCount() {
        var ledger = CommentHeartLedger()
        ledger.seed(from: [makeComment(id: "c1", reactions: [MeeshyQuickReactions.heart])])

        let count = ledger.reconcile(commentId: "c1", count: 4, change: .added, actorUserId: "other", myUserId: "me")

        XCTAssertEqual(count, 4)
        XCTAssertTrue(ledger.isLiked("c1"), "l'agrégat d'un tiers n'éteint pas mon cœur")
        XCTAssertEqual(
            ledger.displayedLikes(of: makeComment(id: "c1", likes: count)), 4,
            "le compte du serveur me compte déjà — aucun cœur en trop")
    }

    /// Mon propre écho fait autorité même quand mon état local le contredit :
    /// c'est le seul lecteur dont l'appartenance au roster CHANGE, et
    /// `(acteur, direction)` la détermine entièrement.
    func test_reconcile_myOwnEchoFromAnotherDevice_takesTheDirectionOfTheEvent() {
        var ledger = CommentHeartLedger()

        let added = ledger.reconcile(commentId: "c1", count: 3, change: .added, actorUserId: "me", myUserId: "me")
        XCTAssertEqual(added, 3)
        XCTAssertTrue(ledger.isLiked("c1"))

        let removed = ledger.reconcile(commentId: "c1", count: 2, change: .removed, actorUserId: "me", myUserId: "me")
        XCTAssertEqual(removed, 2)
        XCTAssertFalse(ledger.isLiked("c1"))
    }

    /// Une direction illisible ne bouge mon cœur dans AUCUN sens — un défaut
    /// sûr : seul notre propre gateway produit ces événements.
    func test_reconcile_anUnreadableDirection_leavesMyHeartAlone() {
        var ledger = CommentHeartLedger()
        ledger.seed(from: [makeComment(id: "c1", reactions: [MeeshyQuickReactions.heart])])

        let count = ledger.reconcile(commentId: "c1", count: 6, change: nil, actorUserId: "me", myUserId: "me")

        XCTAssertEqual(count, 6)
        XCTAssertTrue(ledger.isLiked("c1"))
    }

    func test_heartChange_readsTheWireActionAndRefusesAnythingElse() {
        XCTAssertEqual(CommentHeartLedger.HeartChange(wireAction: "add"), .added)
        XCTAssertEqual(CommentHeartLedger.HeartChange(wireAction: "remove"), .removed)
        XCTAssertNil(CommentHeartLedger.HeartChange(wireAction: "added"))
        XCTAssertNil(CommentHeartLedger.HeartChange(wireAction: ""))
    }

    func test_reconcile_withoutSignedInUser_takesTheServerCount() {
        var ledger = CommentHeartLedger()
        _ = ledger.begin("c1")

        let count = ledger.reconcile(commentId: "c1", count: 9, change: .added, actorUserId: "x", myUserId: nil)

        XCTAssertEqual(count, 9)
        XCTAssertEqual(ledger.displayedLikes(of: makeComment(id: "c1", likes: count)), 9,
                       "sans session, aucun geste optimiste à préserver : le compte du serveur, seul")
    }
}
