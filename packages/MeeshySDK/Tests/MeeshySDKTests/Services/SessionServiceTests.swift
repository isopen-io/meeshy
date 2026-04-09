import XCTest
@testable import MeeshySDK

final class SessionServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: SessionService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = SessionService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeSession(id: String = "s1", isCurrent: Bool = false) -> UserSession {
        UserSession(id: id, deviceName: "iPhone 16", ipAddress: "1.2.3.4", lastActive: nil, createdAt: Date(), isCurrent: isCurrent)
    }

    // MARK: - listSessions

    func test_listSessions_callsCorrectEndpoint() async throws {
        let sessions = [makeSession()]
        let response = APIResponse<[UserSession]>(success: true, data: sessions, error: nil)
        mock.stub("/auth/sessions", result: response)

        _ = try await service.listSessions()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/sessions")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func test_listSessions_returnsSessionList() async throws {
        let sessions = [
            makeSession(id: "s1", isCurrent: true),
            makeSession(id: "s2", isCurrent: false)
        ]
        let response = APIResponse<[UserSession]>(success: true, data: sessions, error: nil)
        mock.stub("/auth/sessions", result: response)

        let result = try await service.listSessions()

        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result[0].id, "s1")
        XCTAssertTrue(result[0].isCurrent)
        XCTAssertEqual(result[1].id, "s2")
        XCTAssertFalse(result[1].isCurrent)
    }

    func test_listSessions_emptyList() async throws {
        let response = APIResponse<[UserSession]>(success: true, data: [], error: nil)
        mock.stub("/auth/sessions", result: response)

        let result = try await service.listSessions()

        XCTAssertTrue(result.isEmpty)
    }

    // MARK: - revokeSession

    func test_revokeSession_callsCorrectEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["revoked": true], error: nil)
        mock.stub("/auth/sessions/s1", result: response)

        try await service.revokeSession(sessionId: "s1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/sessions/s1")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - revokeAllOtherSessions

    func test_revokeAllOtherSessions_callsCorrectEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["revoked": true], error: nil)
        mock.stub("/auth/sessions", result: response)

        try await service.revokeAllOtherSessions()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/auth/sessions")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - Error handling

    func test_listSessions_networkError_propagates() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.listSessions()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {} else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func test_revokeSession_serverError_propagates() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 403, message: "Forbidden")

        do {
            try await service.revokeSession(sessionId: "s1")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 403)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }
}
