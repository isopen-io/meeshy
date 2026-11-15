import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
private final class SpyTranscriptionReceiver: TranscriptionRetryReceiving {
    private(set) var deliveries: [[String]] = []

    func extractAttachmentTranscriptions(from apiMessages: [APIMessage]) {
        deliveries.append(apiMessages.map(\.id))
    }
}

@MainActor
final class TranscriptionRetrySchedulerTests: XCTestCase {

    private func apiMessage(id: String, attachmentsJSON: String) -> APIMessage {
        JSONStub.decode("""
        {"id":"\(id)","conversationId":"conv-1","senderId":"user-1","createdAt":"2026-01-01T00:00:00.000Z","attachments":\(attachmentsJSON)}
        """)
    }

    private func audioWithoutTranscription(id: String) -> APIMessage {
        apiMessage(id: id, attachmentsJSON: #"[{"id":"att-\#(id)","mimeType":"audio/mp4"}]"#)
    }

    private func audioWithTranscription(id: String) -> APIMessage {
        apiMessage(id: id, attachmentsJSON: #"[{"id":"att-\#(id)","mimeType":"audio/mp4","transcription":{"text":"Bonjour","language":"fr"}}]"#)
    }

    private func photo(id: String) -> APIMessage {
        apiMessage(id: id, attachmentsJSON: #"[{"id":"att-\#(id)","mimeType":"image/jpeg"}]"#)
    }

    private func response(ids: [String]) -> MessagesAPIResponse {
        let items = ids.map {
            #"{"id":"\#($0)","conversationId":"conv-1","senderId":"user-1","createdAt":"2026-01-01T00:00:00.000Z"}"#
        }
        return JSONStub.decode("""
        {"success":true,"data":[\(items.joined(separator: ","))],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    private func makeSUT(service: MockMessageService = MockMessageService()) -> (sut: TranscriptionRetryScheduler, service: MockMessageService) {
        (TranscriptionRetryScheduler(messageService: service, delay: .milliseconds(1)), service)
    }

    func test_idsMissingTranscription_selectsOnlyAudioWithoutTranscription() {
        let ids = TranscriptionRetryScheduler.idsMissingTranscription([
            audioWithoutTranscription(id: "a"),
            audioWithTranscription(id: "b"),
            photo(id: "c"),
            audioWithoutTranscription(id: "d")
        ])

        XCTAssertEqual(ids, ["a", "d"])
    }

    func test_schedule_afterDelay_refetchesEachIdAround_andDeliversToReceiver() async {
        let (sut, service) = makeSUT()
        service.listAroundResult = .success(response(ids: ["window"]))
        let receiver = SpyTranscriptionReceiver()

        let task = sut.schedule(
            for: [audioWithoutTranscription(id: "a"), audioWithoutTranscription(id: "d")],
            conversationId: "conv-1", receiver: receiver
        )
        await task?.value

        XCTAssertEqual(service.listAroundCallCount, 2)
        XCTAssertEqual(service.lastListAroundMessageId, "d")
        XCTAssertEqual(service.lastListAroundConversationId, "conv-1")
        XCTAssertEqual(receiver.deliveries, [["window"], ["window"]])
    }

    func test_schedule_receiverGoneBeforeDelay_fetchesNothing() async {
        let service = MockMessageService()
        let sut = TranscriptionRetryScheduler(messageService: service, delay: .milliseconds(20))
        var receiver: SpyTranscriptionReceiver? = SpyTranscriptionReceiver()

        let task = sut.schedule(for: [audioWithoutTranscription(id: "a")], conversationId: "conv-1", receiver: receiver!)
        receiver = nil
        await task?.value

        XCTAssertEqual(service.listAroundCallCount, 0)
    }

    func test_schedule_oneFailure_continuesWithNextId() async {
        let (sut, service) = makeSUT()
        service.listAroundResult = .failure(URLError(.notConnectedToInternet))
        let receiver = SpyTranscriptionReceiver()

        let task = sut.schedule(
            for: [audioWithoutTranscription(id: "a"), audioWithoutTranscription(id: "d")],
            conversationId: "conv-1", receiver: receiver
        )
        await task?.value

        XCTAssertEqual(service.listAroundCallCount, 2, "un échec est journalisé puis l'id suivant est relu")
        XCTAssertTrue(receiver.deliveries.isEmpty)
    }

    func test_schedule_nothingMissing_schedulesNothing() {
        let (sut, service) = makeSUT()
        let receiver = SpyTranscriptionReceiver()

        let task = sut.schedule(
            for: [audioWithTranscription(id: "b"), photo(id: "c")],
            conversationId: "conv-1", receiver: receiver
        )

        XCTAssertNil(task)
        XCTAssertEqual(service.listAroundCallCount, 0)
    }
}
