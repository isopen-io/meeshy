import Foundation

// MARK: - Protocol

public protocol ActiveCallServiceProviding: Sendable {
    func activeCall(conversationId: String) async throws -> ActiveCallSession?
    /// `GET /calls/:callId` — the session of ONE call, read by its id (#19650).
    func callSession(callId: String) async throws -> ActiveCallSession?
}

/// The caller's OWN live call, whatever the conversation — `GET /calls/active`,
/// read at launch to resume a call the server still holds (#9111).
public protocol OwnActiveCallProviding: Sendable {
    func ownActiveCall() async throws -> ActiveCallSession?
}

// MARK: - Service

/// Reads `GET /api/v1/conversations/:conversationId/active-call` — used to
/// reconcile a device's local call state with the server's after this
/// device's own `CallManager` session was lost (app relaunch, crash) while
/// the call is still ongoing server-side. See `ActiveCallSession`.
public final class ActiveCallService: ActiveCallServiceProviding, OwnActiveCallProviding, Sendable {
    public static let shared = ActiveCallService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func activeCall(conversationId: String) async throws -> ActiveCallSession? {
        let response: APIResponse<ActiveCallSession?> = try await api.request(
            ConversationsEndpoint.byConversationIdActiveCall(conversationId: conversationId)
        )
        return response.data
    }

    /// Answers a member of the conversation AND an invitee still ringing (the
    /// gateway admits `invitedUserIds`), where the conversation-scoped route
    /// answers 404 to anyone who is not a member (#19650). `nil` on 404.
    public func callSession(callId: String) async throws -> ActiveCallSession? {
        do {
            let response: APIResponse<ActiveCallSession> = try await api.request(CallsEndpoint.byCallId(callId: callId))
            return response.data
        } catch APIError.serverError(404, _) {
            return nil
        }
    }

    /// `nil` when the gateway answers 404 `NO_ACTIVE_CALL` — no call to resume.
    public func ownActiveCall() async throws -> ActiveCallSession? {
        do {
            let response: APIResponse<ActiveCallSession> = try await api.request(CallsEndpoint.active)
            return response.data
        } catch APIError.serverError(404, _) {
            return nil
        }
    }
}
