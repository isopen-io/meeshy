import XCTest
@testable import MeeshySDK

/// `friend-request:cancelled` et `friend-request:rejected` sont les deux seuls
/// signaux qui retirent une demande en attente SANS action locale. Le premier
/// n'a même aucune ligne `Notification` derrière lui (signal temps réel pur) :
/// sans écouteur, la demande retirée restait affichée jusqu'au prochain
/// chargement complet.
///
/// Ce que ces tests fixent, c'est la DIRECTION du retrait — le défaut classique
/// ici est de vider `_receivedPending` quand c'est `_sentPending` qui porte la
/// ligne (ou l'inverse), ce qui produit un no-op silencieux : rien ne casse,
/// rien ne bouge.
final class FriendRequestRealtimeWithdrawalTests: XCTestCase {

    private func makeSUT() -> FriendshipCache {
        let cache = FriendshipCache.shared
        cache.clear()
        return cache
    }

    // MARK: - friend-request:cancelled (les deux sens)

    func test_applyFriendRequestWithdrawal_whenReaderHadSentTheRequest_clearsIt() async {
        let sut = makeSUT()
        sut.didSendRequest(to: "user-other", requestId: "fr-1")
        XCTAssertEqual(sut.status(for: "user-other"), .pendingSent(requestId: "fr-1"))

        await MessageSocketManager.applyFriendRequestWithdrawal(otherUserId: "user-other")

        XCTAssertEqual(sut.status(for: "user-other"), .none)
    }

    func test_applyFriendRequestWithdrawal_whenReaderHadReceivedTheRequest_clearsIt() async {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-other", requestId: "fr-2")
        XCTAssertEqual(sut.status(for: "user-other"), .pendingReceived(requestId: "fr-2"))

        await MessageSocketManager.applyFriendRequestWithdrawal(otherUserId: "user-other")

        XCTAssertEqual(
            sut.status(for: "user-other"), .none,
            "La charge ne porte que `cancelledBy` : elle ne dit PAS de quel côté est le lecteur, " +
            "donc le retrait doit couvrir les deux sens"
        )
        XCTAssertEqual(sut.pendingReceivedCount, 0)
    }

    func test_applyFriendRequestWithdrawal_onUnknownUser_leavesTheRestUntouched() async {
        let sut = makeSUT()
        sut.didSendRequest(to: "user-kept", requestId: "fr-3")
        sut.didReceiveRequest(from: "user-also-kept", requestId: "fr-4")

        await MessageSocketManager.applyFriendRequestWithdrawal(otherUserId: "user-absent")

        XCTAssertEqual(sut.status(for: "user-kept"), .pendingSent(requestId: "fr-3"))
        XCTAssertEqual(sut.status(for: "user-also-kept"), .pendingReceived(requestId: "fr-4"))
    }

    func test_applyFriendRequestWithdrawal_neverTouchesAnEstablishedFriendship() async {
        let sut = makeSUT()
        sut.didAcceptRequest(from: "user-friend")

        await MessageSocketManager.applyFriendRequestWithdrawal(otherUserId: "user-friend")

        XCTAssertTrue(
            sut.isFriend("user-friend"),
            "Le retrait d'une DEMANDE n'est pas une rupture d'amitié — `didRemoveFriend` est un autre geste"
        )
    }

    // MARK: - friend-request:rejected (un seul sens)

    func test_applyFriendRequestRejection_clearsTheRequestTheReaderHadSent() async {
        let sut = makeSUT()
        sut.didSendRequest(to: "user-rejecter", requestId: "fr-5")

        await MessageSocketManager.applyFriendRequestRejection(rejecterId: "user-rejecter")

        XCTAssertEqual(
            sut.status(for: "user-rejecter"), .none,
            "L'événement arrive chez l'EXPÉDITEUR d'origine : sa demande vit dans `_sentPending`"
        )
    }

    func test_applyFriendRequestRejection_leavesAReceivedRequestUntouched() async {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-other", requestId: "fr-6")

        await MessageSocketManager.applyFriendRequestRejection(rejecterId: "user-other")

        XCTAssertEqual(
            sut.status(for: "user-other"), .pendingReceived(requestId: "fr-6"),
            "Un refus reçu par l'expéditeur ne dit RIEN d'une demande entrante : la vider serait une " +
            "disparition inexpliquée côté écran Demandes"
        )
    }
}
