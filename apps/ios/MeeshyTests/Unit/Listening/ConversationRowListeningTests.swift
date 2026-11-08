import XCTest
import MeeshySDK
@testable import Meeshy

/// La ligne de liste ne montre l'écoute que du pair d'un direct (#16733) : un groupe n'a pas UN pair, un direct sans
/// pair connu n'a personne à écouter. Ce qui s'affiche reste ce que le serveur a servi (le centre d'écoute juge).
final class ConversationRowListeningTests: XCTestCase {

    private func conversation(type: MeeshyConversation.ConversationType, peer: String?) -> MeeshyConversation {
        MeeshyConversation(id: "c1", identifier: "c1", type: type, participantUserId: peer)
    }

    func test_listenedUserId_direct_isThePeer() {
        XCTAssertEqual(ConversationRowListening.userId(for: conversation(type: .direct, peer: "alice")), "alice")
    }

    func test_listenedUserId_group_isNil() {
        XCTAssertNil(ConversationRowListening.userId(for: conversation(type: .group, peer: "alice")))
    }

    func test_listenedUserId_directWithoutPeer_isNil() {
        XCTAssertNil(ConversationRowListening.userId(for: conversation(type: .direct, peer: nil)))
        XCTAssertNil(ConversationRowListening.userId(for: conversation(type: .direct, peer: "")))
    }
}
