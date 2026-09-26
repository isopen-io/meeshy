import XCTest
import MeeshySDK
@testable import Meeshy

/// Le tableau de bord recalcule ses statistiques client (sentiment, mots,
/// médias) quand le CONTENU des messages change, pas seulement leur nombre :
/// clé sur `messages.count`, une édition laissait la section Sentiment
/// périmée tant que la conversation restait ouverte (#7945).
@MainActor
final class ConversationDashboardClientStatsTests: XCTestCase {

    private let at = Date(timeIntervalSince1970: 1_000)

    private func makeMessage(id: String, content: String = "salut", updatedAt: Date) -> Message {
        Message(id: id, conversationId: "conv-1", content: content, updatedAt: updatedAt)
    }

    func test_snapshotKey_sameMessages_isStable() {
        let messages = [makeMessage(id: "m1", updatedAt: at), makeMessage(id: "m2", updatedAt: at)]

        XCTAssertEqual(
            ConversationDashboardClientStats.snapshotKey(for: messages),
            ConversationDashboardClientStats.snapshotKey(for: messages)
        )
    }

    func test_snapshotKey_editedMessageWithSameCount_changes() {
        let before = [makeMessage(id: "m1", content: "salut", updatedAt: at), makeMessage(id: "m2", updatedAt: at)]
        let after = [
            makeMessage(id: "m1", content: "c'est nul", updatedAt: at.addingTimeInterval(5)),
            makeMessage(id: "m2", updatedAt: at),
        ]

        XCTAssertNotEqual(
            ConversationDashboardClientStats.snapshotKey(for: before),
            ConversationDashboardClientStats.snapshotKey(for: after)
        )
    }
}
