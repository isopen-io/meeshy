import Foundation
import MeeshySDK

/// Mock for `SessionServiceProviding` used by `ActiveSessionsViewModelTests`.
final class MockSessionService: SessionServiceProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var listSessionsResult: Result<[UserSession], Error> = .success([])
    var revokeSessionResult: Result<Void, Error> = .success(())
    var revokeAllOtherSessionsResult: Result<Void, Error> = .success(())

    // MARK: - Call tracking

    private(set) var listSessionsCallCount = 0
    private(set) var revokeSessionCallCount = 0
    private(set) var lastRevokedSessionId: String?
    private(set) var revokeAllOtherSessionsCallCount = 0

    func reset() {
        listSessionsCallCount = 0
        revokeSessionCallCount = 0
        lastRevokedSessionId = nil
        revokeAllOtherSessionsCallCount = 0
    }

    // MARK: - Protocol

    func listSessions() async throws -> [UserSession] {
        listSessionsCallCount += 1
        return try listSessionsResult.get()
    }

    func revokeSession(sessionId: String) async throws {
        revokeSessionCallCount += 1
        lastRevokedSessionId = sessionId
        try revokeSessionResult.get()
    }

    func revokeAllOtherSessions() async throws {
        revokeAllOtherSessionsCallCount += 1
        try revokeAllOtherSessionsResult.get()
    }
}
