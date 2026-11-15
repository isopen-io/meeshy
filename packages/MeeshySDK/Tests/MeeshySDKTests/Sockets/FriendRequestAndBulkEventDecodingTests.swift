import XCTest
@testable import MeeshySDK

/// Décodage des charges des quatre événements branchés dans
/// `setupEventHandlers()` : le cycle de vie d'une demande d'ami
/// (`friend-request:cancelled` / `:rejected`) et les deux annonces de masse
/// des notifications (`notification:read-bulk` / `:deleted-bulk`).
///
/// Les charges sont écrites ici telles que le gateway les émet — un champ
/// déclaré obligatoire alors qu'il ne voyage pas ferait échouer le décodage en
/// silence (le décodeur log et abandonne), et l'écouteur serait mort sans que
/// rien ne rougisse.
final class FriendRequestAndBulkEventDecodingTests: XCTestCase {

    private let decoder = JSONDecoder()

    // MARK: - friend-request:cancelled

    func test_friendRequestCancelledEvent_decodesGatewayPayload() throws {
        let json = """
        {"friendRequestId": "fr-1", "cancelledBy": "user-a"}
        """.data(using: .utf8)!

        let event = try decoder.decode(FriendRequestCancelledEvent.self, from: json)

        XCTAssertEqual(event.friendRequestId, "fr-1")
        XCTAssertEqual(event.cancelledBy, "user-a")
    }

    func test_friendRequestCancelledEvent_withoutRequestId_stillDecodes() throws {
        let json = """
        {"cancelledBy": "user-a"}
        """.data(using: .utf8)!

        let event = try decoder.decode(FriendRequestCancelledEvent.self, from: json)

        XCTAssertNil(event.friendRequestId)
        XCTAssertEqual(
            event.cancelledBy, "user-a",
            "`cancelledBy` est le SEUL champ dont le retrait dépend : c'est lui qui identifie l'autre partie"
        )
    }

    func test_friendRequestCancelledEvent_withoutCancelledBy_fails() {
        let json = """
        {"friendRequestId": "fr-1"}
        """.data(using: .utf8)!

        XCTAssertThrowsError(
            try decoder.decode(FriendRequestCancelledEvent.self, from: json),
            "Sans `cancelledBy`, aucune clé de cache à retirer : mieux vaut échouer bruyamment que muter au hasard"
        )
    }

    // MARK: - friend-request:rejected

    func test_friendRequestRejectedEvent_decodesGatewayPayloadWithoutSenderId() throws {
        // `emitFriendRequestRejected` route vers l'user-room de l'expéditeur et
        // n'écrit sur le fil que `{friendRequestId, rejecterId}` : `senderId`
        // sert au ROUTAGE, il ne voyage pas.
        let json = """
        {"friendRequestId": "fr-2", "rejecterId": "user-b"}
        """.data(using: .utf8)!

        let event = try decoder.decode(FriendRequestRejectedEvent.self, from: json)

        XCTAssertEqual(event.rejecterId, "user-b")
        XCTAssertEqual(event.friendRequestId, "fr-2")
        XCTAssertNil(event.senderId)
    }

    func test_friendRequestRejectedEvent_withSenderId_stillDecodes() throws {
        let json = """
        {"senderId": "user-a", "friendRequestId": "fr-2", "rejecterId": "user-b"}
        """.data(using: .utf8)!

        let event = try decoder.decode(FriendRequestRejectedEvent.self, from: json)

        XCTAssertEqual(event.senderId, "user-a")
        XCTAssertEqual(event.rejecterId, "user-b")
    }

    func test_friendRequestRejectedEvent_withoutRejecterId_fails() {
        let json = """
        {"senderId": "user-a", "friendRequestId": "fr-2"}
        """.data(using: .utf8)!

        XCTAssertThrowsError(try decoder.decode(FriendRequestRejectedEvent.self, from: json))
    }

    // MARK: - notification:read-bulk

    func test_notificationReadBulkEvent_decodesAllScope() throws {
        let json = """
        {"scope": {"kind": "all"}}
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationReadBulkEvent.self, from: json)

        XCTAssertEqual(event.scope.kind, "all")
        XCTAssertNil(event.scope.contextKey)
        XCTAssertNil(event.scope.types)
    }

    func test_notificationReadBulkEvent_decodesContextScope() throws {
        let json = """
        {"scope": {"kind": "context", "contextKey": "conversationId", "contextValue": "c1"}}
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationReadBulkEvent.self, from: json)

        XCTAssertEqual(event.scope.contextKey, "conversationId")
        XCTAssertEqual(event.scope.contextValue, "c1")
    }

    func test_notificationReadBulkEvent_decodesTypesScope() throws {
        let json = """
        {"scope": {"kind": "types", "types": ["friend_request", "contact_request"]}}
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationReadBulkEvent.self, from: json)

        XCTAssertEqual(event.scope.types, ["friend_request", "contact_request"])
    }

    func test_notificationReadBulkEvent_withoutScope_fails() {
        let json = "{}".data(using: .utf8)!

        XCTAssertThrowsError(
            try decoder.decode(NotificationReadBulkEvent.self, from: json),
            "Le prédicat EST la charge : sans lui il n'y a rien à rejouer"
        )
    }

    // MARK: - notification:deleted-bulk

    func test_notificationDeletedBulkEvent_decodesReadScope() throws {
        let json = """
        {"scope": {"kind": "read"}}
        """.data(using: .utf8)!

        let event = try decoder.decode(NotificationDeletedBulkEvent.self, from: json)

        XCTAssertEqual(event.scope.kind, "read")
        XCTAssertTrue(NotificationBulkScopeMapping.purgesReadRows(event.scope))
    }
}
