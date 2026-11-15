import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationReadReceiptSenderTests: XCTestCase {

    private struct Enqueued: Equatable {
        let conversationId: String
        let messageIds: [String]?
        let caughtUpId: String?
        let language: String?
        let exceptions: [String: String]?
    }

    private final class OutboxSpy {
        var calls: [Enqueued] = []
    }

    private func makeSUT() -> (sut: ConversationReadReceiptSender, engine: MockConversationSyncEngine, outbox: OutboxSpy) {
        let engine = MockConversationSyncEngine()
        let outbox = OutboxSpy()
        let sut = ConversationReadReceiptSender(syncEngine: engine) { conversationId, messageIds, caughtUpId, languages in
            outbox.calls.append(Enqueued(
                conversationId: conversationId, messageIds: messageIds, caughtUpId: caughtUpId,
                language: languages?.language, exceptions: languages?.exceptions
            ))
        }
        return (sut, engine, outbox)
    }

    private func waitUntil(_ condition: @MainActor () -> Bool) async {
        for _ in 0..<200 where !condition() { try? await Task.sleep(nanoseconds: 10_000_000) }
    }

    func test_send_withCaughtUpId_marksReadLocallyThenEnqueues() async {
        let (sut, engine, outbox) = makeSUT()

        sut.send(conversationId: "conv-1", messageIds: ["m1"], caughtUpId: "m1", languages: nil)

        await waitUntil { engine.markConversationReadLocallyCallCount == 1 }
        XCTAssertEqual(engine.lastMarkReadConversationId, "conv-1")
        XCTAssertEqual(outbox.calls.map(\.caughtUpId), ["m1"])
    }

    func test_send_withNilMessageIds_marksReadLocally() async {
        let (sut, engine, outbox) = makeSUT()

        sut.send(conversationId: "conv-1", messageIds: nil, caughtUpId: nil, languages: nil)

        await waitUntil { engine.markConversationReadLocallyCallCount == 1 }
        XCTAssertEqual(engine.markConversationReadLocallyCallCount, 1)
        XCTAssertEqual(outbox.calls.count, 1)
    }

    func test_send_partialBatchWithoutCaughtUp_enqueuesOnly_andNeverMarksReadLocally() async {
        let (sut, engine, outbox) = makeSUT()

        sut.send(conversationId: "conv-1", messageIds: ["m1", "m2"], caughtUpId: nil, languages: nil)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(engine.markConversationReadLocallyCallCount, 0)
        XCTAssertEqual(outbox.calls.map(\.messageIds), [["m1", "m2"]])
    }

    func test_send_forwardsLanguagesUnchanged() {
        let (sut, _, outbox) = makeSUT()

        sut.send(conversationId: "conv-1", messageIds: ["m1"], caughtUpId: nil, languages: (language: "fr", exceptions: ["m1": "en"]))

        XCTAssertEqual(outbox.calls.first?.language, "fr")
        XCTAssertEqual(outbox.calls.first?.exceptions, ["m1": "en"])
    }
}
