import XCTest
@testable import MeeshySDK

final class NotificationServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: NotificationService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = NotificationService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeNotification(id: String = "n1") -> APINotification {
        APINotification(
            id: id, userId: "u1", type: "new_message", priority: "normal",
            content: "Hello", actor: nil, context: nil, metadata: nil,
            state: NotificationState(isRead: false, readAt: nil, createdAt: "2026-01-01T00:00:00Z", expiresAt: nil),
            delivery: nil
        )
    }

    // MARK: - list

    func test_list_callsCorrectEndpoint() async throws {
        let response = NotificationListResponse(success: true, data: [], pagination: nil, unreadCount: 0)
        mock.stub("/notifications", result: response)

        _ = try await service.list()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/notifications")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_list_returnsNotifications() async throws {
        let notif = makeNotification()
        let response = NotificationListResponse(success: true, data: [notif], pagination: nil, unreadCount: 1)
        mock.stub("/notifications", result: response)

        let result = try await service.list()

        XCTAssertEqual(result.data.count, 1)
        XCTAssertEqual(result.data[0].id, "n1")
    }

    // MARK: - unreadCount

    func test_unreadCount_callsCorrectEndpoint() async throws {
        let response = UnreadCountResponse(success: true, count: 5)
        mock.stub("/notifications/unread-count", result: response)

        let count = try await service.unreadCount()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/notifications/unread-count")
        XCTAssertEqual(count, 5)
    }

    func test_unreadCount_returnsZero() async throws {
        let response = UnreadCountResponse(success: true, count: 0)
        mock.stub("/notifications/unread-count", result: response)

        let count = try await service.unreadCount()

        XCTAssertEqual(count, 0)
    }

    // MARK: - markAsRead

    func test_markAsRead_callsCorrectEndpoint() async throws {
        let notif = makeNotification()
        let response = APIResponse<APINotification>(success: true, data: notif, error: nil)
        mock.stub("/notifications/n1/read", result: response)

        try await service.markAsRead(notificationId: "n1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/notifications/n1/read")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - markAllAsRead

    func test_markAllAsRead_callsCorrectEndpoint() async throws {
        let response = MarkReadResponse(success: true, count: 3)
        mock.stub("/notifications/read-all", result: response)

        let count = try await service.markAllAsRead()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/notifications/read-all")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(count, 3)
    }

    func test_markAllAsRead_nilCount_returnsZero() async throws {
        let response = MarkReadResponse(success: true, count: nil)
        mock.stub("/notifications/read-all", result: response)

        let count = try await service.markAllAsRead()

        XCTAssertEqual(count, 0)
    }

    // MARK: - delete

    func test_delete_callsCorrectEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["deleted": true], error: nil)
        mock.stub("/notifications/n1", result: response)

        try await service.delete(notificationId: "n1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/notifications/n1")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - Error handling

    func test_list_networkError_propagates() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.list()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {} else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func test_unreadCount_serverError_propagates() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 401, message: "Unauthorized")

        do {
            _ = try await service.unreadCount()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 401)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }
}
