import XCTest
@testable import MeeshySDK

/// #7548 — le RANG d'une ligne de liste (règle client du contrat #7545,
/// décision porteur #7546) : max(`lastMessageAt`, `lastReaction.createdAt`
/// quand la réaction vise un message du LECTEUR). Une réaction à mon message
/// remonte ma ligne ; une réaction entre tiers s'affiche sans la réordonner.
final class ConversationListActivityTests: XCTestCase {

    private let lastMessageAt = Date(timeIntervalSince1970: 1_790_000_000)

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
        MeeshyConversation(id: "conv-1", identifier: "conv-1", type: .group, lastMessageAt: lastMessageAt,
                           lastMessagePreview: "avant", lastMessageId: "m-0")
    }

    private func reaction(target: String?, at date: Date) -> [String: Any] {
        [
            "emoji": "❤️", "reactorId": "p-bob", "reactorUserId": "u-bob", "reactorName": "Bob",
            "messageId": "m-0", "targetSenderId": "p-target", "targetSenderUserId": target.map { $0 as Any } ?? NSNull(),
            "excerpt": "avant", "excerptOriginalLanguage": "fr", "excerptTranslations": NSNull(),
            "excerptProtection": NSNull(), "createdAt": WireDate.string(from: date),
        ]
    }

    private func merged(reaction payload: [String: Any], readerId: String = "u-me") throws -> MeeshyConversation {
        let body: [String: Any] = [
            "conversationId": "conv-1", "updatedAt": "2026-09-23T10:00:00.000Z", "lastReaction": payload,
        ]
        let event = try wireDecoder().decode(
            ConversationUpdatedEvent.self, from: JSONSerialization.data(withJSONObject: body))
        let storeEvent = ConversationStoreSocketBridge.mapConversationUpdated(event, readerId: readerId)
        return try XCTUnwrap(ConversationStore.merging(row(), with: storeEvent))
    }

    // MARK: - Socket

    func test_aReactionToMyMessage_raisesTheRow() throws {
        let reactedAt = lastMessageAt.addingTimeInterval(300)

        let conversation = try merged(reaction: reaction(target: "u-me", at: reactedAt))

        XCTAssertEqual(conversation.listActivityAt, reactedAt)
        XCTAssertEqual(conversation.lastMessageAt, lastMessageAt, "la date du dernier message ne bouge pas")
    }

    func test_aReactionBetweenOthers_showsWithoutReordering() throws {
        let conversation = try merged(reaction: reaction(target: "u-alice", at: lastMessageAt.addingTimeInterval(300)))

        XCTAssertNotNil(conversation.lastReaction)
        XCTAssertEqual(conversation.listActivityAt, lastMessageAt)
    }

    func test_anOlderReaction_neverLowersTheRank() throws {
        let conversation = try merged(reaction: reaction(target: "u-me", at: lastMessageAt.addingTimeInterval(-300)))

        XCTAssertEqual(conversation.listActivityAt, lastMessageAt)
    }

    func test_anUnknownReader_neverClaimsAReaction() throws {
        let conversation = try merged(
            reaction: reaction(target: nil, at: lastMessageAt.addingTimeInterval(300)), readerId: "")

        XCTAssertEqual(conversation.listActivityAt, lastMessageAt)
    }

    func test_aClearedReaction_dropsItsRank() throws {
        var conversation = try merged(reaction: reaction(target: "u-me", at: lastMessageAt.addingTimeInterval(300)))
        let body: [String: Any] = [
            "conversationId": "conv-1", "updatedAt": "2026-09-23T10:00:00.000Z", "lastReaction": NSNull(),
        ]
        let event = try wireDecoder().decode(
            ConversationUpdatedEvent.self, from: JSONSerialization.data(withJSONObject: body))
        conversation = try XCTUnwrap(ConversationStore.merging(
            conversation, with: ConversationStoreSocketBridge.mapConversationUpdated(event, readerId: "u-me")))

        XCTAssertEqual(conversation.listActivityAt, lastMessageAt)
    }

    // MARK: - GET /conversations

    func test_restRow_rankedByAReactionToMyMessage() throws {
        let reactedAt = lastMessageAt.addingTimeInterval(600)
        let payload: [String: Any] = [
            "id": "conv-1", "type": "group", "createdAt": "2026-09-23T09:00:00.000Z",
            "lastMessageAt": WireDate.string(from: lastMessageAt),
            "lastReaction": reaction(target: "u-me", at: reactedAt),
        ]
        let api = try wireDecoder().decode(APIConversation.self, from: JSONSerialization.data(withJSONObject: payload))

        XCTAssertEqual(api.toConversation(currentUserId: "u-me").listActivityAt, reactedAt)
        XCTAssertEqual(api.toConversation(currentUserId: "u-other").listActivityAt, lastMessageAt)
    }

    // MARK: - Cache disque

    func test_theRankSurvivesTheCacheRoundTrip() throws {
        let reactedAt = lastMessageAt.addingTimeInterval(300)
        let conversation = try merged(reaction: reaction(target: "u-me", at: reactedAt))

        let decoded = try JSONDecoder().decode(MeeshyConversation.self, from: JSONEncoder().encode(conversation))

        XCTAssertEqual(decoded.listActivityAt, reactedAt)
    }
}
