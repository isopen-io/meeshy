import XCTest
import Combine
@testable import MeeshySDK

/// #8892 — « est dans la conversation » : décodage des charges serveur
/// (`ViewingEvent`, `ViewingSnapshotEvent`,
/// `packages/shared/types/socketio-events/presence.ts`) et état indexé par
/// conversation que les trois événements alimentent.
final class ConversationViewingTests: XCTestCase {

    private func change(_ userId: String, _ conversationId: String) -> ConversationViewingChange {
        ConversationViewingChange(userId: userId, conversationId: conversationId)
    }

    // MARK: - Décodage

    func test_decodeChange_serverPayload_readsUserAndConversation() throws {
        let json = #"{"userId":"u1","conversationId":"c1"}"#
        let event = try JSONDecoder().decode(ConversationViewingChange.self, from: Data(json.utf8))
        XCTAssertEqual(event, change("u1", "c1"))
    }

    func test_decodeSnapshot_serverPayload_readsEveryPeer() throws {
        let json = #"{"conversationId":"c1","userIds":["u1","u2"]}"#
        let snapshot = try JSONDecoder().decode(ConversationViewingSnapshot.self, from: Data(json.utf8))
        XCTAssertEqual(snapshot, ConversationViewingSnapshot(conversationId: "c1", userIds: ["u1", "u2"]))
    }

    // MARK: - État

    func test_applying_arrived_marksPeerHereInThatConversationOnly() {
        let viewers = ConversationViewers().applying(.arrived(change("u1", "c1")))
        XCTAssertTrue(viewers.isHere(userId: "u1", conversationId: "c1"))
        XCTAssertFalse(viewers.isHere(userId: "u1", conversationId: "c2"))
        XCTAssertFalse(viewers.isHere(userId: "u2", conversationId: "c1"))
    }

    func test_applying_left_removesOnlyThatPeer() {
        let viewers = ConversationViewers()
            .applying(.arrived(change("u1", "c1")))
            .applying(.arrived(change("u2", "c1")))
            .applying(.left(change("u1", "c1")))
        XCTAssertFalse(viewers.isHere(userId: "u1", conversationId: "c1"))
        XCTAssertTrue(viewers.isHere(userId: "u2", conversationId: "c1"))
    }

    func test_applying_leftLastPeer_dropsTheConversationEntry() {
        let viewers = ConversationViewers()
            .applying(.arrived(change("u1", "c1")))
            .applying(.left(change("u1", "c1")))
        XCTAssertEqual(viewers, ConversationViewers())
    }

    func test_applying_snapshot_replacesTheSetForThatConversation() {
        let viewers = ConversationViewers()
            .applying(.arrived(change("u1", "c1")))
            .applying(.arrived(change("u9", "c2")))
            .applying(.snapshot(ConversationViewingSnapshot(conversationId: "c1", userIds: ["u2", "u3"])))
        XCTAssertEqual(viewers.users(in: "c1"), ["u2", "u3"])
        XCTAssertTrue(viewers.isHere(userId: "u9", conversationId: "c2"))
    }

    func test_applying_emptySnapshot_clearsThatConversation() {
        let viewers = ConversationViewers()
            .applying(.arrived(change("u1", "c1")))
            .applying(.snapshot(ConversationViewingSnapshot(conversationId: "c1", userIds: [])))
        XCTAssertFalse(viewers.isHere(userId: "u1", conversationId: "c1"))
        XCTAssertEqual(viewers, ConversationViewers())
    }

    // MARK: - Nouvelle session (snapshots à la (re)connexion)

    func test_applying_sessionStarted_forgetsEveryConversation() {
        let viewers = ConversationViewers()
            .applying(.arrived(change("u1", "c1")))
            .applying(.arrived(change("u2", "c2")))
            .applying(.sessionStarted)
        XCTAssertEqual(viewers, ConversationViewers())
    }

    func test_applying_snapshotsAfterSessionStarted_keepOnlyWhatTheServerReannounced() {
        let viewers = ConversationViewers()
            .applying(.arrived(change("left-meanwhile", "c1")))
            .applying(.arrived(change("u2", "c2")))
            .applying(.sessionStarted)
            .applying(.snapshot(ConversationViewingSnapshot(conversationId: "c2", userIds: ["u2", "u3"])))
        XCTAssertFalse(viewers.isHere(userId: "left-meanwhile", conversationId: "c1"))
        XCTAssertEqual(viewers.users(in: "c2"), ["u2", "u3"])
    }

    func test_handleViewingSessionStarted_publishesSessionStartedOnTheViewingChannel() {
        var received: [ConversationViewingEvent] = []
        let cancellable = MessageSocketManager.shared.conversationViewing
            .sink { received.append($0) }

        MessageSocketManager.shared.handleViewingSessionStarted()

        cancellable.cancel()
        XCTAssertEqual(received, [.sessionStarted])
    }

    // MARK: - Clé d'un auteur de message

    func test_viewingKey_registeredSender_isTheAccountId() {
        let message = MeeshyMessage(
            conversationId: "c1", senderId: "participant-1", content: "salut",
            senderUserId: "user-1"
        )
        XCTAssertEqual(message.viewingKey, "user-1")
    }

    func test_viewingKey_anonymousSender_isTheParticipantId() {
        let message = MeeshyMessage(
            conversationId: "c1", senderId: "participant-1", content: "salut",
            senderUserId: "user-ghost", senderIsAnonymous: true
        )
        XCTAssertEqual(message.viewingKey, "participant-1")
    }

    func test_viewingKey_registeredSenderWithoutAccountId_fallsBackToSenderId() {
        let message = MeeshyMessage(conversationId: "c1", senderId: "participant-1", content: "salut")
        XCTAssertEqual(message.viewingKey, "participant-1")
    }
}

