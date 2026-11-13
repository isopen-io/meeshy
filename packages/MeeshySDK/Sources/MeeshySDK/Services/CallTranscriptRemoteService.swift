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
    /// #16665 — absent d'une passerelle antérieure.
    public var captures: [APICallTranscriptCapture]? = nil
    /// A1.6 — la pagination de la passerelle (`offset`/`limit`) : absente d'une
    /// passerelle antérieure, qui rendait alors tout d'une page.
    public var total: Int? = nil
    public var hasMore: Bool? = nil
}

extension APICallTranscript {
    private enum CodingKeys: String, CodingKey {
        case callId, conversationId, callStartedAt, segments, captures, total, hasMore
    }

    /// Une capture malformée se laisse de côté : elle n'efface jamais les
    /// phrases du journal relu.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            callId: try container.decode(String.self, forKey: .callId),
            conversationId: try container.decode(String.self, forKey: .conversationId),
            callStartedAt: try container.decode(Date.self, forKey: .callStartedAt),
            segments: try container.decode([APICallTranscriptSegment].self, forKey: .segments),
            captures: try container.decodeIfPresent([LossyCallTranscriptCapture].self, forKey: .captures)?.compactMap(\.value),
            total: try container.decodeIfPresent(Int.self, forKey: .total),
            hasMore: try container.decodeIfPresent(Bool.self, forKey: .hasMore)
        )
    }
}

private struct LossyCallTranscriptCapture: Decodable {
    let value: APICallTranscriptCapture?

    init(from decoder: Decoder) throws {
        value = try? APICallTranscriptCapture(from: decoder)
    }
}

/// #16665 — une capture d'écran ou une borne de l'enregistrement de l'appel,
/// telle que la passerelle la garde (`CallCaptureEvent`). `kind` reste brut :
/// une sorte inconnue de ce client se laisse de côté au mapping, app-side.
public struct APICallTranscriptCapture: Decodable, Sendable {
    public let id: String
    /// Nul pour un arrêt d'enregistrement que personne n'a demandé.
    public let participantId: String?
    public let userId: String?
    public let displayName: String?
    public let kind: String
    public let offsetMs: Int
    public let at: Date
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

/// Replay du journal de transcription persisté côté gateway:
/// le transcript survit à la suppression de l'app et
/// de ses caches locaux. L'accès est restreint PAR LE SERVEUR aux
/// participants effectifs de l'appel (403 sinon). Atome réseau typé — la
/// cascade « cache local d'abord, distant en fallback » est app-side
/// (SDK Purity).
public final class CallTranscriptRemoteService: CallTranscriptRemoteServiceProviding, Sendable {
    public static let shared = CallTranscriptRemoteService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// A1.6 — l'appel EN ENTIER : la passerelle sert `pageSize` phrases à la fois, on lit page après page
    /// tant qu'elle dit `hasMore`. Une page qui échoue fait échouer la lecture : un appel à moitié lu
    /// ne se range pas au cache comme s'il était complet. Les captures viennent de la première page
    /// (la passerelle les rend à chaque page). Rien ne se lit avant l'appel de cette méthode : la
    /// bascule fermée n'en déclenche aucune.
    public func transcript(callId: String) async throws -> APICallTranscript {
        let first = try await fetchPage(callId: callId, offset: 0)
        var segments = first.segments
        var last = first
        while CallTranscriptPaging.continues(after: last) {
            last = try await fetchPage(callId: callId, offset: segments.count)
            segments += last.segments
        }
        return APICallTranscript(
            callId: first.callId,
            conversationId: first.conversationId,
            callStartedAt: first.callStartedAt,
            segments: segments,
            captures: first.captures,
            total: first.total,
            hasMore: false
        )
    }

    private func fetchPage(callId: String, offset: Int) async throws -> APICallTranscript {
        let response: APIResponse<APICallTranscript> = try await api.request(
            CallsEndpoint.byCallIdTranscript(callId: callId),
            method: "GET",
            body: nil,
            queryItems: [
                URLQueryItem(name: "offset", value: String(offset)),
                URLQueryItem(name: "limit", value: String(CallTranscriptPaging.pageSize))
            ]
        )
        return response.data
    }
}

/// La loi de la lecture page après page : on continue tant que la passerelle annonce une suite ET que la
/// page lue a rapporté quelque chose (une page vide qui dit `hasMore` ne boucle jamais).
enum CallTranscriptPaging {
    static let pageSize = 100

    static func continues(after page: APICallTranscript) -> Bool {
        page.hasMore == true && !page.segments.isEmpty
    }
}
