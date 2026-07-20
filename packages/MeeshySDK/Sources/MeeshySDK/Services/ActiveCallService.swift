import Foundation

// MARK: - Protocol

public protocol ActiveCallServiceProviding: Sendable {
    func activeCall(conversationId: String) async throws -> ActiveCallSession?
}

// MARK: - Service

/// Reads `GET /api/v1/conversations/:conversationId/active-call` — used to
/// reconcile a device's local call state with the server's after this
/// device's own `CallManager` session was lost (app relaunch, crash) while
/// the call is still ongoing server-side. See `ActiveCallSession`.
public final class ActiveCallService: ActiveCallServiceProviding, @unchecked Sendable {
    public static let shared = ActiveCallService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func activeCall(conversationId: String) async throws -> ActiveCallSession? {
        let response: APIResponse<ActiveCallSession?> = try await api.request(
            endpoint: "/conversations/\(conversationId)/active-call"
        )
        return response.data
    }
}
