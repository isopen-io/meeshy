import XCTest
import MeeshySDK
@testable import Meeshy

/// Chantier Rivière iOS, lot 1 — le pont PUR fil → loi (`RiverConversationMapping`).
@MainActor
final class RiverConversationMappingTests: XCTestCase {

    private static let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    private func message(
        _ id: String, sender: String, name: String? = nil, minutes: Double,
        source: MeeshyMessage.MessageSource = .user, replyTo: String? = nil, deleted: Bool = false
    ) -> MeeshyMessage {
        var m = MeeshyMessage(
            id: id, conversationId: "c", senderId: sender, content: "texte \(id)",
            createdAt: Self.t0.addingTimeInterval(minutes * 60), updatedAt: Self.t0
        )
        m.senderName = name
        m.messageSource = source
        m.replyToId = replyTo
        if deleted { m.deletedAt = Self.t0 }
        return m
    }

    // MARK: - Les messages système ne sont la voix de personne

    func test_systemMessages_areExcluded_fromVoicesAndLanes() {
        let messages = [
            message("m1", sender: "alice", name: "Alice", minutes: 0),
            message("sys", sender: "newcomer", name: "Nouveau", minutes: 1, source: .system),
            message("m2", sender: "bob", name: "Bob", minutes: 2)
        ]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        XCTAssertEqual(input.messages.map(\.id), ["m1", "m2"], "l'avis d'arrivée n'entre pas dans la loi")
        XCTAssertEqual(input.participants.map(\.id), ["alice", "bob"], "l'arrivant n'est pas une voix : pas de lane fantôme")
        XCTAssertEqual(input.viewerId, "me")
    }

    func test_deletedMessages_areNotVoices_either() {
        let messages = [message("m1", sender: "alice", minutes: 0), message("gone", sender: "alice", minutes: 1, deleted: true)]
        XCTAssertEqual(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me").messages.map(\.id), ["m1"])
    }

    func test_participants_areTheSenders_withTheirLatestKnownName_inOrderOfFirstAppearance() {
        let messages = [
            message("m1", sender: "bob", name: "Bob", minutes: 0),
            message("m2", sender: "alice", name: "Alice", minutes: 1),
            message("m3", sender: "bob", name: "Bob R.", minutes: 2)
        ]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        XCTAssertEqual(input.participants.map(\.id), ["bob", "alice"])
        XCTAssertEqual(input.participants.first?.displayName, "Bob R.", "dernier nom connu")
    }

    func test_replyTarget_isCarriedToTheLaw_forConnectors() {
        let messages = [message("m1", sender: "alice", minutes: 0), message("m2", sender: "bob", minutes: 1, replyTo: "m1")]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        XCTAssertEqual(input.messages.last?.replyToMessageId, "m1")
    }

    // MARK: - Contenus : Prisme injecté, heure, réponse

    func test_contents_carryThePrismeText_theTime_andTheReplyPreview() {
        var m2 = message("m2", sender: "bob", name: "Bob", minutes: 1, replyTo: "m1")
        m2.replyTo = ReplyReference(messageId: "m1", authorName: "Alice", previewText: "Salut")
        let messages = [message("m1", sender: "alice", name: "Alice", minutes: 0), m2]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages,
            text: { "PRISME:\($0.id)" },
            time: { _ in "12:45" }
        )
        XCTAssertEqual(contents.count, geometry.bubbles.count, "une bulle, un contenu")
        let bob = try? XCTUnwrap(contents.first { $0.bubble.messageId == "m2" })
        XCTAssertEqual(bob?.text, "PRISME:m2", "le texte vient du Prisme injecté, jamais de `content` nu")
        XCTAssertEqual(bob?.timeString, "12:45")
        XCTAssertEqual(bob?.senderDisplayName, "Bob")
        XCTAssertEqual(bob?.replyPreview, RiverReplyPreview(authorDisplayName: "Alice", text: "Salut"))
        XCTAssertEqual(bob?.layout, geometry.layout)
    }

    func test_initialCursor_isTheMostRecentBubble_orTheReadersShoreWhenEmpty() {
        let messages = [message("m1", sender: "alice", minutes: 0), message("m2", sender: "bob", minutes: 1), message("m3", sender: "alice", minutes: 2)]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let cursor = RiverConversationMapping.initialCursor(geometry: geometry)
        XCTAssertEqual(cursor.rank, geometry.bubbles.map(\.rank).max())
        let empty = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: [], viewerId: "me"))
        XCTAssertEqual(RiverConversationMapping.initialCursor(geometry: empty), RiverLaneResolver.RiverCursor(laneIndex: 0, rank: 0))
    }

    func test_fingerprint_ignoresSystemMessages_andChangesWithVoices() {
        let base = [message("m1", sender: "alice", minutes: 0)]
        let withSystem = base + [message("sys", sender: "x", minutes: 1, source: .system)]
        XCTAssertEqual(RiverConversationMapping.fingerprint(messages: base), RiverConversationMapping.fingerprint(messages: withSystem))
        XCTAssertNotEqual(RiverConversationMapping.fingerprint(messages: base), RiverConversationMapping.fingerprint(messages: base + [message("m2", sender: "bob", minutes: 2)]))
    }
}
