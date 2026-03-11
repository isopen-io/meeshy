import Foundation

// MARK: - Models

public struct UserSession: Codable, Sendable, Identifiable {
    public let id: String
    public let deviceName: String?
    public let ipAddress: String?
    public let lastActive: Date?
    public let createdAt: Date
    public let isCurrent: Bool
}

// MARK: - Protocol

public protocol SessionServiceProviding: Sendable {
    func listSessions() async throws -> [UserSession]
    func revokeSession(sessionId: String) async throws
    func revokeAllOtherSessions() async throws
}

// MARK: - Implementation

public final class SessionService: SessionServiceProviding, @unchecked Sendable {
    public static let shared = SessionService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func listSessions() async throws -> [UserSession] {
        let response: APIResponse<[UserSession]> = try await api.request(endpoint: "/auth/sessions")
        return response.data
    }

    public func revokeSession(sessionId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/auth/sessions/\(sessionId)")
    }

    public func revokeAllOtherSessions() async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/auth/sessions")
    }
}
