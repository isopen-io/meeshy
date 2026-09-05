import Foundation

// MARK: - API DTOs

/// Miroir wire de `GET /api/v1/calls/:callId/transcript` (gateway
/// `CallService.getCallTranscript`) — le journal de transcription persisté
/// côté serveur pendant l'appel (segments finaux + traductions, ordonnés par
/// horloge murale de capture). Donnée brute : le mapping vers le domaine
/// `CallTranscript` (isLocal, fallback de noms, fusion avec le cache local)
/// est app-side.
public struct APICallTranscript: Decodable, Sendable {
    public let callId: String
    public let conversationId: String
    public let callStartedAt: Date
    public let segments: [APICallTranscriptSegment]
}

public struct APICallTranscriptSegment: Decodable, Sendable {
    public let id: String
    public let speakerId: String
    public let speakerDisplayName: String?
    public let text: String
    /// Tag de la langue de TRANSCRIPTION (la traduction porte la sienne).
    public let language: String
    public let confidence: Double?
    /// Horloge murale de capture (epoch ms) — clé d'ordre du journal.
    public let capturedAtMs: Int
    public let translations: [APICallTranscriptTranslation]
}

public struct APICallTranscriptTranslation: Decodable, Sendable {
    public let targetLanguage: String
    public let translatedText: String
}

// MARK: - Protocol

public protocol CallTranscriptRemoteServiceProviding: Sendable {
    func transcript(callId: String) async throws -> APICallTranscript
}

// MARK: - Service

/// Replay du journal de transcription persisté côté gateway (décision
/// produit 2026-08-13) : le transcript survit à la suppression de l'app et
/// de ses caches locaux. L'accès est restreint PAR LE SERVEUR aux
/// participants effectifs de l'appel (403 sinon). Atome réseau typé — la
/// cascade « cache local d'abord, distant en fallback » est app-side
/// (SDK Purity).
public final class CallTranscriptRemoteService: CallTranscriptRemoteServiceProviding, @unchecked Sendable {
    public static let shared = CallTranscriptRemoteService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func transcript(callId: String) async throws -> APICallTranscript {
        let response: APIResponse<APICallTranscript> = try await api.request(
            CallsEndpoint.byCallIdTranscript(callId: callId),
            method: "GET",
            body: nil,
            queryItems: nil
        )
        return response.data
    }
}
