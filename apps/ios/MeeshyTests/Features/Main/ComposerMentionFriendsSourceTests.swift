import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ComposerMentionFriendsSourceTests: XCTestCase {

    // MARK: - Factory

    private func makeFriendUser(
        id: String,
        username: String,
        displayName: String? = nil
    ) -> FriendRequestUser {
        FriendRequestUser(
            id: id, username: username, firstName: nil, lastName: nil,
            displayName: displayName, avatar: "avatar-\(id).png", isOnline: nil, lastActiveAt: nil
        )
    }

    private func makeAcceptedRequest(
        id: String = "req-1",
        sender: FriendRequestUser,
        receiver: FriendRequestUser
    ) -> FriendRequest {
        FriendRequest(
            id: id, senderId: sender.id, receiverId: receiver.id, message: nil,
            status: "accepted", sender: sender, receiver: receiver,
            respondedAt: nil, createdAt: Date(), updatedAt: nil
        )
    }

    private func makePage(_ requests: [FriendRequest]) -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        OffsetPaginatedAPIResponse(success: true, data: requests, pagination: nil, error: nil)
    }

    // MARK: - Tests

    func test_acceptedFriends_mapsAggregatedFriendsToMentionCandidates() async {
        let me = makeFriendUser(id: "me", username: "moi")
        let alice = makeFriendUser(id: "alice-id", username: "alice", displayName: "Alice Dupont")
        let mock = MockFriendService()
        mock.allFriendRequestsResult = .success(makePage([makeAcceptedRequest(sender: me, receiver: alice)]))

        let candidates = await ComposerMentionFriendsSource.acceptedFriends(
            friendService: mock, currentUserId: "me"
        )

        XCTAssertEqual(candidates.count, 1)
        XCTAssertEqual(candidates.first?.id, "alice-id")
        XCTAssertEqual(candidates.first?.username, "alice")
        XCTAssertEqual(candidates.first?.displayName, "Alice Dupont")
        XCTAssertEqual(candidates.first?.avatarURL, "avatar-alice-id.png")
    }

    func test_acceptedFriends_neverIncludesTheCurrentUser() async {
        let me = makeFriendUser(id: "me", username: "moi")
        let bob = makeFriendUser(id: "bob-id", username: "bob")
        let mock = MockFriendService()
        mock.allFriendRequestsResult = .success(makePage([makeAcceptedRequest(sender: bob, receiver: me)]))

        let candidates = await ComposerMentionFriendsSource.acceptedFriends(
            friendService: mock, currentUserId: "me"
        )

        XCTAssertFalse(
            candidates.contains { $0.id == "me" },
            "L'auteur ne doit jamais pouvoir se @mentionner lui-même via sa propre liste d'amis."
        )
        XCTAssertEqual(candidates.map(\.id), ["bob-id"])
    }

    func test_acceptedFriends_callsTheServiceWithAcceptedStatusAndTheFirstPage() async {
        let mock = MockFriendService()
        mock.allFriendRequestsResult = .success(makePage([]))

        _ = await ComposerMentionFriendsSource.acceptedFriends(friendService: mock, currentUserId: "me")

        XCTAssertEqual(mock.allFriendRequestsCallCount, 1)
        XCTAssertEqual(mock.lastAllFriendRequestsStatus, "accepted")
        XCTAssertEqual(mock.lastAllFriendRequestsOffset, 0)
    }

    func test_acceptedFriends_onNetworkFailure_returnsEmptyArrayRatherThanThrowing() async {
        let mock = MockFriendService()
        mock.allFriendRequestsResult = .failure(NSError(domain: "test", code: 1))

        let candidates = await ComposerMentionFriendsSource.acceptedFriends(friendService: mock, currentUserId: "me")

        XCTAssertEqual(
            candidates, [],
            "Un brouillon composer ne doit jamais planter ni afficher d'erreur pour une liste d'autocomplétion."
        )
    }

    /// **Revue Opus 2026-08-27.** Sans la garde, `FriendListAggregator`
    /// considère `sender.id != ""` systématiquement vrai — un `currentUserId`
    /// vide (aucun utilisateur authentifié) ferait apparaître l'AUTEUR dans sa
    /// propre liste de mentions, au lieu de renvoyer une liste vide.
    func test_acceptedFriends_withEmptyCurrentUserId_returnsEmptyArray_withoutCallingTheService() async {
        let me = makeFriendUser(id: "me", username: "moi")
        let alice = makeFriendUser(id: "alice-id", username: "alice")
        let mock = MockFriendService()
        mock.allFriendRequestsResult = .success(makePage([makeAcceptedRequest(sender: me, receiver: alice)]))

        let candidates = await ComposerMentionFriendsSource.acceptedFriends(
            friendService: mock, currentUserId: ""
        )

        XCTAssertEqual(candidates, [])
        XCTAssertEqual(
            mock.allFriendRequestsCallCount, 0,
            "Sans utilisateur authentifié, aucun appel réseau ne devrait partir."
        )
    }
}
