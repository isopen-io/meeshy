import XCTest
@testable import MeeshySDK

final class ConversationAnalysisServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: ConversationAnalysisService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = ConversationAnalysisService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - fetchAnalysis

    func test_fetchAnalysis_callsCorrectEndpoint() async throws {
        let analysis = ConversationAnalysis(conversationId: "conv1")
        let response = APIResponse<ConversationAnalysis>(success: true, data: analysis, error: nil)
        mock.stub("/conversations/conv1/analysis", result: response)

        let result = try await service.fetchAnalysis(conversationId: "conv1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv1/analysis")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.conversationId, "conv1")
    }

    func test_fetchAnalysis_withDifferentId_callsCorrectEndpoint() async throws {
        let analysis = ConversationAnalysis(conversationId: "conv99")
        let response = APIResponse<ConversationAnalysis>(success: true, data: analysis, error: nil)
        mock.stub("/conversations/conv99/analysis", result: response)

        let result = try await service.fetchAnalysis(conversationId: "conv99")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv99/analysis")
        XCTAssertEqual(result.conversationId, "conv99")
    }

    func test_fetchAnalysis_propagatesNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.fetchAnalysis(conversationId: "conv1")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    func test_fetchAnalysis_propagatesServerError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 500, message: "Internal error")

        do {
            _ = try await service.fetchAnalysis(conversationId: "conv1")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 500)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    // MARK: - fetchStats

    func test_fetchStats_callsCorrectEndpoint() async throws {
        let stats = ConversationMessageStatsResponse(
            conversationId: "conv1", totalMessages: 100, totalWords: 500, totalCharacters: 3000,
            contentTypes: ContentTypeCounts(text: 80, image: 5, audio: 10, video: 3, file: 2),
            participantStats: [], dailyActivity: [],
            hourlyDistribution: [:], languageDistribution: [], updatedAt: nil
        )
        let response = APIResponse<ConversationMessageStatsResponse>(success: true, data: stats, error: nil)
        mock.stub("/conversations/conv1/stats", result: response)

        let result = try await service.fetchStats(conversationId: "conv1")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/conversations/conv1/stats")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.totalMessages, 100)
        XCTAssertEqual(result.totalWords, 500)
        XCTAssertEqual(result.conversationId, "conv1")
    }

    func test_fetchStats_propagatesError() async {
        mock.errorToThrow = MeeshyError.network(.timeout)

        do {
            _ = try await service.fetchStats(conversationId: "conv1")
            XCTFail("Expected error to be thrown")
        } catch {
            // expected
        }
    }
}
