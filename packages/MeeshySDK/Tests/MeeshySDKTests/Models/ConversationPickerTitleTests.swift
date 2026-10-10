import XCTest
@testable import MeeshySDK

/// #9205 — Communauté › Channel › « Ajouter un channel » nommait une conversation
/// privée par son titre STOCKÉ (`mshy_iHs95XtqLr_S, 2`) ou son identifiant, quand
/// la liste « Meeshy Chats » affiche le nom de l'interlocuteur. Le sélecteur lit
/// désormais `listTitle(currentUserId:)`, qui PROJETTE la résolution de la liste
/// (`toConversation(currentUserId:).displayName`) au lieu de la réécrire.
final class ConversationPickerTitleTests: XCTestCase {

    private func decode(_ payload: [String: Any]) throws -> APIConversation {
        let data = try JSONSerialization.data(withJSONObject: payload)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIConversation.self, from: data)
    }

    private func payload(
        type: String,
        title: String?,
        identifier: String? = "mshy_iHs95XtqLr_S",
        participants: [[String: Any]]? = nil,
        customName: String? = nil
    ) -> [String: Any] {
        var body: [String: Any] = ["id": "conv1", "type": type, "createdAt": "2026-10-01T10:00:00Z"]
        if let title { body["title"] = title }
        if let identifier { body["identifier"] = identifier }
        if let participants { body["participants"] = participants }
        if let customName { body["userPreferences"] = [["customName": customName]] }
        return body
    }

    private let peerAndReader: [[String: Any]] = [
        ["id": "p1", "userId": "u1", "displayName": "Moi"],
        ["id": "p2", "userId": "u2", "displayName": "Bob Martin"],
    ]

    func test_listTitle_directWithLegacyTitle_servesThePeerName() throws {
        let api = try decode(payload(type: "direct", title: "mshy_iHs95XtqLr_S, 2", participants: peerAndReader))

        XCTAssertEqual(api.listTitle(currentUserId: "u1"), "Bob Martin")
    }

    func test_listTitle_directWithoutTitle_neverServesTheIdentifier() throws {
        let api = try decode(payload(type: "direct", title: nil, participants: peerAndReader))

        XCTAssertEqual(api.listTitle(currentUserId: "u1"), "Bob Martin")
    }

    func test_listTitle_equalsTheConversationListDisplayName() throws {
        let api = try decode(payload(type: "group", title: "Voyageurs", participants: peerAndReader, customName: "Les copains"))

        XCTAssertEqual(api.listTitle(currentUserId: "u1"), api.toConversation(currentUserId: "u1").displayName)
        XCTAssertEqual(api.listTitle(currentUserId: "u1"), "Les copains")
    }

    func test_listTitle_groupWithTitle_servesTheTitle() throws {
        let api = try decode(payload(type: "group", title: "Voyageurs", participants: peerAndReader))

        XCTAssertEqual(api.listTitle(currentUserId: "u1"), "Voyageurs")
    }
}
