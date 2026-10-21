import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationWindowFetcherTests: XCTestCase {

    private final class UpsertSpy: APIMessageUpserting, @unchecked Sendable {
        private(set) var prisms: [[String]] = []
        func upsertFromAPIMessages(_ apiMessages: [APIMessage], preferredLanguages: [String]) async throws {
            prisms.append(preferredLanguages)
        }
    }

    private func makeSUT() -> (sut: ConversationWindowFetcher, service: MockMessageService, spy: UpsertSpy) {
        let service = MockMessageService()
        let spy = UpsertSpy()
        return (ConversationWindowFetcher(messageService: service, persistence: spy), service, spy)
    }

    private struct ServiceDown: Error {}

    func test_around_upsertsServedPageWithReaderPrism_andReturnsResponse() async throws {
        let (sut, service, spy) = makeSUT()

        let response = try await sut.around("m-target", in: "conv-1", limit: 30, readerPrism: ["fr", "en"], label: "test.around")

        XCTAssertTrue(response.success)
        XCTAssertEqual(service.lastListAroundMessageId, "m-target")
        XCTAssertEqual(service.lastListAroundConversationId, "conv-1")
        XCTAssertEqual(spy.prisms, [["fr", "en"]])
    }

    func test_around_whenServiceThrows_rethrowsWithoutUpsert() async {
        let (sut, service, spy) = makeSUT()
        service.listAroundResult = .failure(ServiceDown())

        do {
            _ = try await sut.around("m-target", in: "conv-1", limit: 30, readerPrism: ["fr"], label: "test.around")
            XCTFail("l'échec réseau doit remonter")
        } catch {
            XCTAssertTrue(error is ServiceDown)
        }
        XCTAssertTrue(spy.prisms.isEmpty)
    }

    func test_after_requestsFromWatermarkMinusOneMillisecond_andUpserts() async throws {
        let (sut, service, spy) = makeSUT()
        let watermark = Date(timeIntervalSince1970: 5_000)

        let response = try await sut.fetchAfter(watermark, in: "conv-1", limit: 30)
        await sut.upsert(response, readerPrism: ["es"], label: "test.after")

        XCTAssertEqual(service.lastListAfterAfter, watermark.addingTimeInterval(-0.001))
        XCTAssertEqual(service.lastListAfterLimit, 30)
        XCTAssertEqual(spy.prisms, [["es"]])
    }
}
