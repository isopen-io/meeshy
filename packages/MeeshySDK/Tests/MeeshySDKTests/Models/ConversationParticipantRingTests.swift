import XCTest
@testable import MeeshySDK

/// #10713 — le contour d'avatar équipé du pair d'une directe voyage avec la
/// ligne de liste : la passerelle le sert sur le participant
/// (`profileDecor.avatarRing`), le SDK le porte jusqu'à `MeeshyConversation`,
/// et le cache le garde. Charge ADDITIVE : sans lui, la ligne d'avant.
final class ConversationParticipantRingTests: XCTestCase {

    private func decode(_ payload: [String: Any]) throws -> APIConversation {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIConversation.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    private let ring: [String: Any] = ["pack": "contours-essentiels", "item": "perle", "origin": "builtin", "contract": NSNull()]

    private func payload(type: String, peerDecor: Any?) -> [String: Any] {
        var peer: [String: Any] = ["id": "p2", "userId": "u2", "displayName": "Bob"]
        if let peerDecor { peer["profileDecor"] = peerDecor }
        return [
            "id": "conv1",
            "type": type,
            "createdAt": "2026-10-15T10:00:00Z",
            "participants": [["id": "p1", "userId": "moi", "displayName": "Moi"], peer],
        ]
    }

    func test_aDirectCarriesThePeerRing() throws {
        let conversation = try decode(payload(type: "direct", peerDecor: ["avatarRing": ring])).toConversation(currentUserId: "moi")
        XCTAssertEqual(conversation.participantRing, ServedProfileDecorItem(pack: "contours-essentiels", item: "perle", origin: .builtin))
    }

    func test_withoutADecorTheRowIsTheOneBefore() throws {
        XCTAssertNil(try decode(payload(type: "direct", peerDecor: nil)).toConversation(currentUserId: "moi").participantRing)
    }

    func test_anUnreadableDecorNeverBreaksTheList() throws {
        XCTAssertNil(try decode(payload(type: "direct", peerDecor: "pas un objet")).toConversation(currentUserId: "moi").participantRing)
    }

    func test_aGroupCarriesNoPeerRing() throws {
        XCTAssertNil(try decode(payload(type: "group", peerDecor: ["avatarRing": ring])).toConversation(currentUserId: "moi").participantRing)
    }

    func test_theRingSurvivesTheCache() throws {
        let conversation = try decode(payload(type: "direct", peerDecor: ["avatarRing": ring])).toConversation(currentUserId: "moi")
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        let restored = try decoder.decode(MeeshyConversation.self, from: encoder.encode(conversation))
        XCTAssertEqual(restored.participantRing, conversation.participantRing)
    }

    func test_aRingArrivingRepaintsTheRow() throws {
        let bare = try decode(payload(type: "direct", peerDecor: nil)).toConversation(currentUserId: "moi")
        let ringed = try decode(payload(type: "direct", peerDecor: ["avatarRing": ring])).toConversation(currentUserId: "moi")
        XCTAssertNotEqual(bare.renderFingerprint, ringed.renderFingerprint, "la ligne de liste est `.equatable()` sur cette empreinte")
    }
}
