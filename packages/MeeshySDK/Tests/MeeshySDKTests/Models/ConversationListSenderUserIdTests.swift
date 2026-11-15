import XCTest
@testable import MeeshySDK

/// #7978 — la passerelle joint à chaque aperçu l'identité UTILISATEUR de son
/// auteur (`lastMessageSenderUserId`). `senderId` est un `Participant.id` et
/// `updatedBy` nomme l'ACTEUR d'un recalcul : quand un tiers supprimait le
/// dernier message et que le mien redevenait l'aperçu, la ligne disait
/// « Demo » au lieu de « Vous ».
final class ConversationListSenderUserIdTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_790_000_000)

    private func wireDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = WireDate.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: raw)
            }
            return date
        }
        return decoder
    }

    private func row() -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .group, lastMessageAt: t0,
            lastMessagePreview: "Oups", lastMessageId: "m-third"
        )
        conversation.lastMessageSenderName = "Tiers"
        return conversation
    }

    private func event(_ body: [String: Any]) throws -> ConversationUpdatedEvent {
        let payload = body.merging(["conversationId": "conv-1", "updatedAt": "2026-09-25T09:10:00.000Z"]) { given, _ in given }
        return try wireDecoder().decode(ConversationUpdatedEvent.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    private func merged(_ body: [String: Any]) throws -> MeeshyConversation {
        let storeEvent = ConversationStoreSocketBridge.mapConversationUpdated(try event(body), readerId: "u-me")
        return try XCTUnwrap(ConversationStore.merging(row(), with: storeEvent))
    }

    private func recalculated(senderUserId: String, senderName: String, actor: String) -> [String: Any] {
        [
            "updatedBy": ["id": actor],
            "senderId": "p-author",
            "previewRecalculated": true,
            "lastMessageId": "m-older",
            "lastMessageAt": WireDate.string(from: t0.addingTimeInterval(-60)),
            "lastMessagePreview": "Hello everyone",
            "lastMessageSenderName": senderName,
            "lastMessageSenderUserId": senderUserId,
        ]
    }

    func test_merging_thirdPartyDeletesAndMyMessageBecomesThePreview_saysTheReaderLabel() throws {
        let conversation = try merged(recalculated(senderUserId: "u-me", senderName: "Demo", actor: "u-third"))

        XCTAssertEqual(conversation.lastMessageId, "m-older")
        XCTAssertEqual(conversation.lastMessageSenderName, ConversationListAuthor.readerLabel)
    }

    func test_merging_iDeleteAndSomeoneElsesMessageBecomesThePreview_keepsTheirName() throws {
        let conversation = try merged(recalculated(senderUserId: "u-bob", senderName: "Bob", actor: "u-me"))

        XCTAssertEqual(conversation.lastMessageSenderName, "Bob")
    }

    func test_messageSenderUserId_prefersTheServedAuthorIdentity() throws {
        let recalculatedByOther = try event(["updatedBy": ["id": "u-third"], "lastMessageId": "m-1",
                                             "previewRecalculated": true, "lastMessageSenderUserId": "u-me"])
        let messageDriven = try event(["updatedBy": ["id": "u-actor"], "lastMessageId": "m-1",
                                       "lastMessageSenderUserId": "u-author"])
        let legacyRecalculated = try event(["updatedBy": ["id": "u-third"], "lastMessageId": "m-1",
                                            "previewRecalculated": true])

        XCTAssertEqual(recalculatedByOther.messageSenderUserId, "u-me")
        XCTAssertEqual(messageDriven.messageSenderUserId, "u-author")
        XCTAssertNil(legacyRecalculated.messageSenderUserId)
    }

    func test_decoding_aMalformedServedIdentity_keepsTheEvent() throws {
        let decoded = try event(["lastMessageId": "m-1", "lastMessageSenderUserId": 42])

        XCTAssertEqual(decoded.lastMessageIdValue, "m-1")
        XCTAssertNil(decoded.lastMessageSenderUserId)
    }
}
