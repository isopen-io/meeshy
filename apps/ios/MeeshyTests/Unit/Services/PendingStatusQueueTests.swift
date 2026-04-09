import XCTest
@testable import Meeshy

final class PendingStatusQueueTests: XCTestCase {

    // PendingStatusQueue is an actor using UserDefaults for persistence.
    // We test enqueue, FIFO ordering, capacity, and data model serialization.

    private let testKey = "meeshy_pending_status_actions"

    override func setUp() async throws {
        UserDefaults.standard.removeObject(forKey: testKey)
    }

    override func tearDown() async throws {
        UserDefaults.standard.removeObject(forKey: testKey)
    }

    // MARK: - PendingAction Data Model

    func test_pendingAction_encodesAndDecodes() throws {
        let action = PendingStatusQueue.PendingAction(
            conversationId: "conv123",
            type: "read",
            timestamp: Date(timeIntervalSince1970: 1000)
        )

        let data = try JSONEncoder().encode(action)
        let decoded = try JSONDecoder().decode(PendingStatusQueue.PendingAction.self, from: data)

        XCTAssertEqual(decoded.conversationId, "conv123")
        XCTAssertEqual(decoded.type, "read")
        XCTAssertEqual(decoded.timestamp, Date(timeIntervalSince1970: 1000))
    }

    func test_pendingAction_storesConversationId() {
        let action = PendingStatusQueue.PendingAction(
            conversationId: "abc",
            type: "received",
            timestamp: Date()
        )
        XCTAssertEqual(action.conversationId, "abc")
    }

    func test_pendingAction_storesType() {
        let action = PendingStatusQueue.PendingAction(
            conversationId: "abc",
            type: "read",
            timestamp: Date()
        )
        XCTAssertEqual(action.type, "read")
    }

    // MARK: - Enqueue

    func test_enqueue_persistsActionToUserDefaults() async {
        let queue = PendingStatusQueue.shared
        let action = PendingStatusQueue.PendingAction(
            conversationId: "conv1",
            type: "read",
            timestamp: Date()
        )

        await queue.enqueue(action)

        let data = UserDefaults.standard.data(forKey: testKey)
        XCTAssertNotNil(data)

        let actions = try? JSONDecoder().decode([PendingStatusQueue.PendingAction].self, from: data!)
        XCTAssertEqual(actions?.count, 1)
        XCTAssertEqual(actions?.first?.conversationId, "conv1")
    }

    func test_enqueue_multipleActions_preservesFIFOOrder() async {
        let queue = PendingStatusQueue.shared

        for i in 0..<3 {
            let action = PendingStatusQueue.PendingAction(
                conversationId: "conv\(i)",
                type: "read",
                timestamp: Date()
            )
            await queue.enqueue(action)
        }

        let data = UserDefaults.standard.data(forKey: testKey)!
        let actions = try! JSONDecoder().decode([PendingStatusQueue.PendingAction].self, from: data)

        XCTAssertEqual(actions.count, 3)
        XCTAssertEqual(actions[0].conversationId, "conv0")
        XCTAssertEqual(actions[1].conversationId, "conv1")
        XCTAssertEqual(actions[2].conversationId, "conv2")
    }

    // MARK: - Capacity Limit

    func test_enqueue_overMaxActions_trimsByDroppingOldest() async {
        let queue = PendingStatusQueue.shared

        for i in 0..<105 {
            let action = PendingStatusQueue.PendingAction(
                conversationId: "conv\(i)",
                type: "read",
                timestamp: Date()
            )
            await queue.enqueue(action)
        }

        let data = UserDefaults.standard.data(forKey: testKey)!
        let actions = try! JSONDecoder().decode([PendingStatusQueue.PendingAction].self, from: data)

        XCTAssertLessThanOrEqual(actions.count, 100)
        XCTAssertEqual(actions.last?.conversationId, "conv104")
    }
}
