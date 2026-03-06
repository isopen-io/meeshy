import XCTest
@testable import MeeshySDK

final class ReportServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: ReportService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = ReportService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - reportMessage

    func testReportMessagePostsToAdminReports() async throws {
        let reportData = ReportResponseData(id: "report1")
        let response = APIResponse<ReportResponseData>(success: true, data: reportData, error: nil)
        mock.stub("/admin/reports", result: response)

        try await service.reportMessage(messageId: "msg123", reportType: "SPAM", reason: "Obvious spam")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/admin/reports")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testReportMessageWithNilReason() async throws {
        let reportData = ReportResponseData(id: "report2")
        let response = APIResponse<ReportResponseData>(success: true, data: reportData, error: nil)
        mock.stub("/admin/reports", result: response)

        try await service.reportMessage(messageId: "msg456", reportType: "HARASSMENT")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/admin/reports")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - reportUser

    func testReportUserPostsToAdminReports() async throws {
        let reportData = ReportResponseData(id: "report3")
        let response = APIResponse<ReportResponseData>(success: true, data: reportData, error: nil)
        mock.stub("/admin/reports", result: response)

        try await service.reportUser(userId: "user789", reportType: "IMPERSONATION", reason: "Fake account")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/admin/reports")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testReportUserWithNilReason() async throws {
        let reportData = ReportResponseData(id: "report4")
        let response = APIResponse<ReportResponseData>(success: true, data: reportData, error: nil)
        mock.stub("/admin/reports", result: response)

        try await service.reportUser(userId: "user000", reportType: "SPAM")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - reportStory

    func testReportStoryPostsToAdminReports() async throws {
        let reportData = ReportResponseData(id: "report5")
        let response = APIResponse<ReportResponseData>(success: true, data: reportData, error: nil)
        mock.stub("/admin/reports", result: response)

        try await service.reportStory(storyId: "story123", reportType: "INAPPROPRIATE", reason: "Violent content")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/admin/reports")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testReportStoryWithNilReason() async throws {
        let reportData = ReportResponseData(id: "report6")
        let response = APIResponse<ReportResponseData>(success: true, data: reportData, error: nil)
        mock.stub("/admin/reports", result: response)

        try await service.reportStory(storyId: "story456", reportType: "SPAM")

        XCTAssertEqual(mock.requestCount, 1)
    }

    // MARK: - reportConversation

    func testReportConversationPostsToAdminReports() async throws {
        let reportData = ReportResponseData(id: "report7")
        let response = APIResponse<ReportResponseData>(success: true, data: reportData, error: nil)
        mock.stub("/admin/reports", result: response)

        try await service.reportConversation(
            conversationId: "conv123",
            reportType: "SCAM",
            reason: "Financial scam attempt"
        )

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/admin/reports")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testReportConversationWithNilReason() async throws {
        let reportData = ReportResponseData(id: "report8")
        let response = APIResponse<ReportResponseData>(success: true, data: reportData, error: nil)
        mock.stub("/admin/reports", result: response)

        try await service.reportConversation(conversationId: "conv456", reportType: "HARASSMENT")

        XCTAssertEqual(mock.requestCount, 1)
    }

    // MARK: - All report types hit same endpoint

    func testAllReportTypesUseAdminReportsEndpoint() async throws {
        let reportData = ReportResponseData(id: "r1")
        let response = APIResponse<ReportResponseData>(success: true, data: reportData, error: nil)
        mock.stub("/admin/reports", result: response)

        try await service.reportMessage(messageId: "m1", reportType: "SPAM")
        try await service.reportUser(userId: "u1", reportType: "SPAM")
        try await service.reportStory(storyId: "s1", reportType: "SPAM")
        try await service.reportConversation(conversationId: "c1", reportType: "SPAM")

        XCTAssertEqual(mock.requestCount, 4)
        for request in mock.requests {
            XCTAssertEqual(request.endpoint, "/admin/reports")
            XCTAssertEqual(request.method, "POST")
        }
    }

    // MARK: - Error handling

    func testReportMessagePropagatesNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            try await service.reportMessage(messageId: "m1", reportType: "SPAM")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func testReportUserPropagatesAuthError() async {
        mock.errorToThrow = MeeshyError.auth(.sessionExpired)

        do {
            try await service.reportUser(userId: "u1", reportType: "HARASSMENT")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error {
                // expected
            } else {
                XCTFail("Expected auth sessionExpired, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func testReportStoryPropagatesServerError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 429, message: "Trop de requetes")

        do {
            try await service.reportStory(storyId: "s1", reportType: "SPAM")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 429)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }
}
