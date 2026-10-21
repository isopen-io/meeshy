import XCTest
@testable import MeeshySDK

/// Un compte de réactions NÉGATIF servi par le serveur (REST `reactionSummary`
/// ou socket `reaction:sync`) faisait planter la plage `0..<count`.
final class ReactionCountBoundsTests: XCTestCase {

    func test_reconstructFromSummary_negativeCount_yieldsNoReactionForThatEmoji() {
        let reactions = MeeshyReaction.reconstructFromSummary(
            messageId: "m", reactionSummary: ["👍": -1, "❤️": 2],
            currentUserReactions: ["❤️"], currentUserId: "u"
        )
        XCTAssertEqual(reactions.count, 2)
        XCTAssertTrue(reactions.allSatisfy { $0.emoji == "❤️" })
    }

    func test_expandedReactions_negativeCount_yieldsNoReactionForThatEmoji() {
        let reactions = ConversationSyncEngine.expandedReactions(messageId: "m", aggregations: [
            ReactionAggregationEvent(emoji: "🔥", count: -1, participantIds: nil, hasCurrentUser: nil),
            ReactionAggregationEvent(emoji: "👍", count: 2, participantIds: ["a"], hasCurrentUser: nil),
        ])
        XCTAssertEqual(reactions.map(\.emoji), ["👍", "👍"])
        XCTAssertEqual(reactions.map(\.participantId), ["a", nil])
    }
}
