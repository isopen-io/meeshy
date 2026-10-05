import XCTest
@testable import MeeshySDK

/// Le RANG d'une ligne de liste. #9026 (directive porteur du 2026-10-01) : le
/// serveur sert `listRankAt` = max(`lastMessageAt`, `lastActivityAt`) à TOUS les
/// participants — réaction, appel, épingle remontent la ligne pour chacun.
/// Le client prend max(`lastMessageAt`, `listRankAt`, et la règle client #7548 :
/// `lastReaction.createdAt` quand la réaction vise un message du LECTEUR) — sans
/// rang servi (serveur antérieur), une réaction entre tiers ne réordonne rien.
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

    // MARK: - #9026 — le rang SERVI, le même pour tous les participants

    private func merged(body extra: [String: Any], into base: MeeshyConversation? = nil,
                        readerId: String = "u-me") throws -> MeeshyConversation? {
        var body: [String: Any] = ["conversationId": "conv-1", "updatedAt": "2026-10-01T10:00:00.000Z"]
        body.merge(extra) { _, new in new }
        let event = try wireDecoder().decode(
            ConversationUpdatedEvent.self, from: JSONSerialization.data(withJSONObject: body))
        return ConversationStore.merging(base ?? row(),
                                         with: ConversationStoreSocketBridge.mapConversationUpdated(event, readerId: readerId))
    }

    func test_aReactionBetweenOthers_withAServedRank_raisesTheRowForEveryone() throws {
        let reactedAt = lastMessageAt.addingTimeInterval(300)

        let conversation = try XCTUnwrap(merged(body: [
            "lastReaction": reaction(target: "u-alice", at: reactedAt),
            "listRankAt": WireDate.string(from: reactedAt),
        ]))

        XCTAssertEqual(conversation.listActivityAt, reactedAt)
        XCTAssertEqual(conversation.lastMessageAt, lastMessageAt, "la date AFFICHÉE reste celle du dernier message")
    }

    func test_aRankOnlyEvent_callOrPin_raisesTheRow() throws {
        let activityAt = lastMessageAt.addingTimeInterval(120)

        let conversation = try XCTUnwrap(merged(body: ["listRankAt": WireDate.string(from: activityAt)]))

        XCTAssertEqual(conversation.listRankAt, activityAt)
        XCTAssertEqual(conversation.listActivityAt, activityAt)
    }

    func test_aServedRankOlderThanTheLastMessage_neverLowersTheRow() throws {
        let conversation = try merged(body: ["listRankAt": WireDate.string(from: lastMessageAt.addingTimeInterval(-60))])

        XCTAssertEqual(conversation?.listActivityAt ?? row().listActivityAt, lastMessageAt)
    }

    func test_aStaleRankArrivingLate_neverRewindsTheServedRank() throws {
        let later = lastMessageAt.addingTimeInterval(600)
        let first = try XCTUnwrap(merged(body: ["listRankAt": WireDate.string(from: later)]))

        let second = try merged(body: ["listRankAt": WireDate.string(from: lastMessageAt.addingTimeInterval(300))], into: first)

        XCTAssertNil(second, "un rang plus ancien ne change rien à la ligne")
        XCTAssertEqual(first.listActivityAt, later)
    }

    func test_aRankOnlyEvent_reordersThePersistedList() throws {
        let fresher = MeeshyConversation(id: "conv-2", identifier: "conv-2", type: .group,
                                         lastMessageAt: lastMessageAt.addingTimeInterval(60),
                                         lastMessagePreview: "plus récent", lastMessageId: "m-2")
        let activityAt = lastMessageAt.addingTimeInterval(120)
        let event = ConversationUpdatedStoreEvent(conversationId: "conv-1", listRankAt: activityAt)

        let reordered = try XCTUnwrap(ConversationSyncEngine.applyingConversationUpdate(event, to: [fresher, row()]))

        XCTAssertEqual(reordered.map(\.id), ["conv-1", "conv-2"])
    }

    func test_restRow_rankedByTheServedRank_forEveryReader() throws {
        let activityAt = lastMessageAt.addingTimeInterval(900)
        let payload: [String: Any] = [
            "id": "conv-1", "type": "group", "createdAt": "2026-09-23T09:00:00.000Z",
            "lastMessageAt": WireDate.string(from: lastMessageAt),
            "listRankAt": WireDate.string(from: activityAt),
        ]
        let api = try wireDecoder().decode(APIConversation.self, from: JSONSerialization.data(withJSONObject: payload))

        XCTAssertEqual(api.toConversation(currentUserId: "u-me").listActivityAt, activityAt)
        XCTAssertEqual(api.toConversation(currentUserId: "u-other").listActivityAt, activityAt)
    }

    func test_theServedRankSurvivesTheCacheRoundTrip() throws {
        let activityAt = lastMessageAt.addingTimeInterval(300)
        let conversation = try XCTUnwrap(merged(body: ["listRankAt": WireDate.string(from: activityAt)]))

        let decoded = try JSONDecoder().decode(MeeshyConversation.self, from: JSONEncoder().encode(conversation))

        XCTAssertEqual(decoded.listActivityAt, activityAt)
    }

    func test_theEngineOwnsTheServedRank_whenTheViewPersistsItsSnapshot() throws {
        let activityAt = lastMessageAt.addingTimeInterval(300)
        let engineRow = try XCTUnwrap(merged(body: ["listRankAt": WireDate.string(from: activityAt)]))

        let persisted = ConversationListLastMessage.persisting([row()], over: [engineRow])

        XCTAssertEqual(persisted.first?.listActivityAt, activityAt)
    }
}
