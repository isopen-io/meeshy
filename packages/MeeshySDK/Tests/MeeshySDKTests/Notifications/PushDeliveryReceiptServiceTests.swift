import XCTest
@testable import MeeshySDK

final class PushDeliveryReceiptServiceTests: XCTestCase {

    private var defaults: UserDefaults!
    private let suiteName = "com.meeshy.test.push-receipts"

    override func setUp() {
        super.setUp()
        UserDefaults().removePersistentDomain(forName: suiteName)
        defaults = UserDefaults(suiteName: suiteName)!
    }

    override func tearDown() {
        UserDefaults().removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    // MARK: - Helpers

    private actor CallRecorder {
        var calls: [String] = []
        var shouldFail = false
        func setFailure(_ value: Bool) { shouldFail = value }
        func record(_ id: String) throws {
            calls.append(id)
            if shouldFail { throw TestError.network }
        }
    }

    private enum TestError: Error { case network }

    private func makeSUT(
        recorder: CallRecorder,
        authenticated: Bool = true
    ) -> PushDeliveryReceiptService {
        let deps = PushDeliveryReceiptService.Dependencies(
            markAsReceived: { id in
                try await recorder.record(id)
            },
            isAuthenticated: { authenticated }
        )
        return PushDeliveryReceiptService(dependencies: deps, defaults: defaults)
    }

    // MARK: - Tests

    func test_ack_whenAuthenticatedAndBackendOk_callsMarkAsReceived() async {
        let recorder = CallRecorder()
        let sut = makeSUT(recorder: recorder)

        await sut.ack(conversationId: "conv-1", messageId: "msg-1")

        let calls = await recorder.calls
        XCTAssertEqual(calls, ["conv-1"])
        XCTAssertEqual(sut._pendingCount(), 0)
    }

    func test_ack_whenNotAuthenticated_queuesForLater() async {
        let recorder = CallRecorder()
        let sut = makeSUT(recorder: recorder, authenticated: false)

        await sut.ack(conversationId: "conv-1", messageId: nil)

        let calls = await recorder.calls
        XCTAssertTrue(calls.isEmpty, "Unauthenticated calls must not hit the backend")
        XCTAssertEqual(sut._pendingCount(), 1)
    }

    func test_ack_whenBackendFails_queuesForRetry() async {
        let recorder = CallRecorder()
        await recorder.setFailure(true)
        let sut = makeSUT(recorder: recorder)

        await sut.ack(conversationId: "conv-1", messageId: nil)

        let calls = await recorder.calls
        XCTAssertEqual(calls, ["conv-1"])
        XCTAssertEqual(sut._pendingCount(), 1, "Failed ack must be queued")
    }

    func test_flushPending_retriesQueuedReceiptsSuccessfully() async {
        let recorder = CallRecorder()
        await recorder.setFailure(true)
        let sut = makeSUT(recorder: recorder)

        await sut.ack(conversationId: "conv-1", messageId: nil)
        await sut.ack(conversationId: "conv-2", messageId: nil)
        XCTAssertEqual(sut._pendingCount(), 2)

        await recorder.setFailure(false)
        await sut.flushPending()

        let calls = await recorder.calls
        XCTAssertEqual(calls.filter { $0 == "conv-1" }.count, 2)
        XCTAssertEqual(calls.filter { $0 == "conv-2" }.count, 2)
        XCTAssertEqual(sut._pendingCount(), 0, "Successful flush clears the queue")
    }

    func test_flushPending_whenStillOffline_keepsQueue() async {
        let recorder = CallRecorder()
        let sut = makeSUT(recorder: recorder, authenticated: false)

        await sut.ack(conversationId: "conv-1", messageId: nil)
        XCTAssertEqual(sut._pendingCount(), 1)

        await sut.flushPending()
        XCTAssertEqual(sut._pendingCount(), 1, "Offline flush must not drop the queue")
    }

    func test_ack_deduplicatesSameConversation() async {
        let recorder = CallRecorder()
        let sut = makeSUT(recorder: recorder, authenticated: false)

        await sut.ack(conversationId: "conv-1", messageId: "msg-1")
        await sut.ack(conversationId: "conv-1", messageId: "msg-2")

        XCTAssertEqual(sut._pendingCount(), 1, "Only the latest ack per conversation is kept")
    }

    func test_flushPending_whenFailuresRemain_requeues() async {
        let recorder = CallRecorder()
        await recorder.setFailure(true)
        let sut = makeSUT(recorder: recorder)

        await sut.ack(conversationId: "conv-1", messageId: nil)
        XCTAssertEqual(sut._pendingCount(), 1)

        await sut.flushPending()
        XCTAssertEqual(sut._pendingCount(), 1, "Still-failing items remain queued")
    }
}
