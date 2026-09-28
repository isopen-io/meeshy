import Foundation

public protocol CallModerationRemoteServiceProviding: Sendable {
    /// #8438 — retire `participantId` (le `userId` d'un inscrit) de l'appel.
    /// La passerelle décide seule si l'appelant en a le droit.
    func removeParticipant(callId: String, participantId: String) async throws
}

/// `DELETE /api/v1/calls/:callId/participants/:participantId`. Atome réseau :
/// la confirmation et l'affichage sont app-side.
public final class CallModerationRemoteService: CallModerationRemoteServiceProviding, @unchecked Sendable {
    public static let shared = CallModerationRemoteService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    private struct NoBody: Encodable {}

    public func removeParticipant(callId: String, participantId: String) async throws {
        let _: APIResponse<EmptySuccess> = try await api.delete(
            CallsEndpoint.byCallIdParticipantsByParticipantId(callId: callId, participantId: participantId),
            body: NoBody()
        )
    }
}
