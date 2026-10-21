import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationMessageMergeTests: XCTestCase {

    private func makeMessage(
        _ id: String, at seconds: TimeInterval, status: Message.DeliveryStatus = .sent
    ) -> Message {
        Message(
            id: id,
            conversationId: "000000000000000000000095",
            senderId: "u1",
            content: "texte",
            createdAt: Date(timeIntervalSince1970: seconds),
            updatedAt: Date(timeIntervalSince1970: seconds),
            deliveryStatus: status,
            isMe: true
        )
    }

    func test_supersededOptimisticRow_isDroppedWhenItsServerIdArrives() {
        let current = [makeMessage("cid_1", at: 10, status: .sending)]
        let incoming = [makeMessage("srv_1", at: 10)]

        let outcome = ConversationMessageMerge.merge(
            current: current, incoming: incoming, pendingServerIds: ["cid_1": "srv_1"]
        )

        XCTAssertEqual(outcome.messages.map(\.id), ["srv_1"])
        XCTAssertEqual(outcome.superseded, ["cid_1"])
    }

    func test_localOnlyRows_arePreservedAndSortedByCreatedAt() {
        let current = [makeMessage("local_late", at: 30, status: .sending), makeMessage("shared", at: 10)]
        let incoming = [makeMessage("shared", at: 10), makeMessage("srv_mid", at: 20)]

        let outcome = ConversationMessageMerge.merge(current: current, incoming: incoming, pendingServerIds: [:])

        XCTAssertEqual(outcome.messages.map(\.id), ["shared", "srv_mid", "local_late"])
        XCTAssertTrue(outcome.superseded.isEmpty)
    }

    func test_nothingToPreserve_returnsTheIncomingSnapshotAsIs() {
        let incoming = [makeMessage("b", at: 20), makeMessage("a", at: 10)]

        let outcome = ConversationMessageMerge.merge(current: [], incoming: incoming, pendingServerIds: [:])

        XCTAssertEqual(outcome.messages.map(\.id), ["b", "a"])
    }

    func test_trueDrops_areReportedForDiagnostics_andSupersededOnesAreExpected() {
        let before = [makeMessage("cid_1", at: 10, status: .sending), makeMessage("lost", at: 20, status: .failed)]
        let after = [makeMessage("srv_1", at: 10)]

        let drops = ConversationMessageMerge.drops(before: before, after: after, superseded: ["cid_1"])

        XCTAssertEqual(drops.all, ["cid_1", "lost"])
        XCTAssertEqual(drops.unexpected, ["lost"])
        XCTAssertEqual(drops.inFlightOrSent, 1)
    }

    func test_noDrop_reportsNothing() {
        let messages = [makeMessage("a", at: 10)]

        let drops = ConversationMessageMerge.drops(before: messages, after: messages, superseded: [])

        XCTAssertTrue(drops.all.isEmpty)
        XCTAssertTrue(drops.unexpected.isEmpty)
    }
}
