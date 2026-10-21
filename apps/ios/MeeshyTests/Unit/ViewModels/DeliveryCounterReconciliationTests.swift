import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class DeliveryCounterReconciliationTests: XCTestCase {

    private func makeMessage(
        id: String,
        status: Message.DeliveryStatus,
        isMe: Bool = true,
        deliveredCount: Int = 0,
        readCount: Int = 0
    ) -> Message {
        Message(
            id: id,
            conversationId: "000000000000000000000097",
            content: "x",
            deliveryStatus: status,
            isMe: isMe,
            deliveredCount: deliveredCount,
            readCount: readCount
        )
    }

    func test_updates_onlyOwnMessagesWhoseFreshStatusIsBetter() {
        let own = [
            makeMessage(id: "better", status: .sent),
            makeMessage(id: "same", status: .delivered),
            makeMessage(id: "theirs", status: .sent, isMe: false),
        ]
        let fresh = [
            makeMessage(id: "better", status: .read, deliveredCount: 2, readCount: 2),
            makeMessage(id: "same", status: .delivered),
            makeMessage(id: "theirs", status: .read),
        ]

        let updates = DeliveryCounterReconciliation.updates(own: own, fresh: fresh)

        XCTAssertEqual(updates.map(\.localId), ["better"])
        XCTAssertEqual(updates.first?.deliveredCount, 2)
        XCTAssertEqual(updates.first?.readCount, 2)
    }

    func test_updates_lastFreshWinsOnDuplicateIds() {
        let own = [makeMessage(id: "m1", status: .sent)]
        let fresh = [
            makeMessage(id: "m1", status: .delivered, deliveredCount: 1),
            makeMessage(id: "m1", status: .read, deliveredCount: 3, readCount: 3),
        ]

        let updates = DeliveryCounterReconciliation.updates(own: own, fresh: fresh)

        XCTAssertEqual(updates.first?.readCount, 3)
    }

    func test_updates_emptyWhenNothingImproves() {
        let own = [makeMessage(id: "m1", status: .read)]
        let fresh = [makeMessage(id: "m1", status: .delivered)]

        XCTAssertTrue(DeliveryCounterReconciliation.updates(own: own, fresh: fresh).isEmpty)
    }
}
