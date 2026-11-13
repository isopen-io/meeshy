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
    /// tant qu'elle dit `hasMore` (loi de `CallTranscriptPaging.Reading`). Une page qui échoue fait échouer
    /// la lecture : un appel à moitié lu ne se range pas au cache comme s'il était complet. La Task annulée
    /// (la cellule est partie, la bascule s'est repliée) ne lit plus aucune page. Rien ne se lit avant
    /// l'appel de cette méthode : la bascule fermée n'en déclenche aucune.
    public func transcript(callId: String) async throws -> APICallTranscript {
        try Task.checkCancellation()
        let first = try await fetchPage(callId: callId, offset: 0)
        var reading = CallTranscriptPaging.Reading(first: first)
        while reading.continues {
            try Task.checkCancellation()
            let page = try await fetchPage(callId: callId, offset: reading.offset)
            reading = reading.absorbing(page)
        }
        return reading.transcript
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

/// La loi de la lecture page après page. On continue tant que la passerelle annonce une suite, que la
/// page lue a apporté au moins une phrase NEUVE (une page vide, ou qui répète la précédente, ne boucle
/// jamais) et que la borne de pages n'est pas atteinte. Une phrase servie par deux pages (la passerelle
/// range par heure, une ligne arrivée entre deux lectures décale la suivante) ne se garde qu'une fois, à
/// sa première place ; la page suivante reprend après ce que la passerelle a RENDU, doublons compris.
enum CallTranscriptPaging {
    static let pageSize = 100
    /// 200 pages de 100 : 20 000 phrases, bien au-delà d'un appel d'une journée ; au-delà, la passerelle se
    /// trompe et la lecture s'arrête, l'appel se disant alors incomplet (`hasMore`).
    static let maxPages = 200

    struct Reading: Sendable {
        let offset: Int
        let continues: Bool
        private let first: APICallTranscript
        private let segments: [APICallTranscriptSegment]
        private let seen: Set<String>
        private let lastSaidMore: Bool
        private let pagesRead: Int

        init(first: APICallTranscript) {
            self.init(first: first, kept: [], seen: [], offset: 0, pagesRead: 0, page: first)
        }

        private init(
            first: APICallTranscript,
            kept: [APICallTranscriptSegment],
            seen: Set<String>,
            offset: Int,
            pagesRead: Int,
            page: APICallTranscript
        ) {
            var known = seen
            let fresh = page.segments.filter { known.insert($0.id).inserted }
            let read = pagesRead + 1
            let saysMore = page.hasMore == true
            self.first = first
            self.segments = kept + fresh
            self.seen = known
            self.offset = offset + page.segments.count
            self.pagesRead = read
            self.lastSaidMore = saysMore
            self.continues = saysMore && !fresh.isEmpty && read < CallTranscriptPaging.maxPages
        }

        func absorbing(_ page: APICallTranscript) -> Reading {
            Reading(first: first, kept: segments, seen: seen, offset: offset, pagesRead: pagesRead, page: page)
        }

        /// Les captures viennent de la première page : la passerelle les rend à chaque page.
        var transcript: APICallTranscript {
            APICallTranscript(
                callId: first.callId,
                conversationId: first.conversationId,
                callStartedAt: first.callStartedAt,
                segments: segments,
                captures: first.captures,
                total: first.total,
                hasMore: lastSaidMore
            )
        }
    }
}
