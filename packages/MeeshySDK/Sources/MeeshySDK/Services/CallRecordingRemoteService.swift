import Foundation

/// Réponse de `POST /api/v1/calls/:callId/recordings/:recordingId/attachment`
/// (#8064) : le fichier est lié, et la bulle de l'appel qui le porte.
public struct APICallRecordingLink: Decodable, Sendable, Equatable {
    public let recordingId: String
    public let messageId: String
    public let attachmentId: String

    public init(recordingId: String, messageId: String, attachmentId: String) {
        self.recordingId = recordingId
        self.messageId = messageId
        self.attachmentId = attachmentId
    }
}

struct CallRecordingLinkBody: Encodable, Sendable {
    let attachmentId: String
}

public protocol CallRecordingRemoteServiceProviding: Sendable {
    func link(callId: String, recordingId: String, attachmentId: String) async throws -> APICallRecordingLink
}

/// Rattache un enregistrement d'appel déjà téléversé à la bulle de l'appel.
/// La passerelle vérifie seule que l'appelant EST l'enregistreur d'un
/// enregistrement réellement démarré, et que la pièce jointe est un audio
/// qu'il a lui-même déposé. Atome réseau : quand réessayer est app-side.
public final class CallRecordingRemoteService: CallRecordingRemoteServiceProviding, @unchecked Sendable {
    public static let shared = CallRecordingRemoteService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func link(callId: String, recordingId: String, attachmentId: String) async throws -> APICallRecordingLink {
        let response: APIResponse<APICallRecordingLink> = try await api.post(
            CallsEndpoint.byCallIdRecordingsByRecordingIdAttachment(callId: callId, recordingId: recordingId),
            body: CallRecordingLinkBody(attachmentId: attachmentId)
        )
        return response.data
    }
}
