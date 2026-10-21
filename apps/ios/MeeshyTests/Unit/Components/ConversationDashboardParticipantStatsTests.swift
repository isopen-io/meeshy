import XCTest
import MeeshySDK
@testable import Meeshy

/// Le tableau de bord regroupait l'activité par NOM affiché : deux membres homonymes (ou plusieurs sans nom, tous
/// « ? ») fusionnaient en une ligne, et le `ForEach` recevait des identifiants en double.
final class ConversationDashboardParticipantStatsTests: XCTestCase {

    private func message(_ id: String, from sender: String, name: String?, _ text: String) -> MeeshyMessage {
        MeeshyMessage(id: id, conversationId: "c1", senderId: sender, content: text, originalLanguage: "fr", senderName: name)
    }

    func test_twoMembersWithTheSameName_stayTwoRows() {
        let stats = ConversationDashboardClientStats.computeParticipantStats(from: [
            message("1", from: "u-a", name: "Alex", "un deux"),
            message("2", from: "u-b", name: "Alex", "trois"),
            message("3", from: "u-a", name: "Alex", "quatre"),
        ])
        XCTAssertEqual(stats.count, 2)
        XCTAssertEqual(stats.map(\.id), ["u-a", "u-b"])
        XCTAssertEqual(stats.first?.messageCount, 2)
        XCTAssertEqual(stats.first?.wordCount, 3)
    }

    func test_sendersWithoutAName_areNotMerged() {
        let stats = ConversationDashboardClientStats.computeParticipantStats(from: [
            message("1", from: "u-x", name: nil, "a"),
            message("2", from: "u-y", name: nil, "b"),
        ])
        XCTAssertEqual(Set(stats.map(\.id)), ["u-x", "u-y"])
    }

    func test_aRenamedMember_isOneRowUnderTheLatestName() {
        let stats = ConversationDashboardClientStats.computeParticipantStats(from: [
            message("1", from: "u-a", name: "Alex", "a"),
            message("2", from: "u-a", name: "Alexandre", "b"),
        ])
        XCTAssertEqual(stats.map(\.name), ["Alexandre"])
    }

    func test_theRows_areIdentifiedBySender() throws {
        let view = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Components/ConversationDashboardView.swift"))
        XCTAssertTrue(view.contains("id: \\.element.id"))
        XCTAssertFalse(view.contains("id: \\.element.name"))
    }
}
