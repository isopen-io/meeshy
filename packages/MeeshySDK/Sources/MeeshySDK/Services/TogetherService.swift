import Foundation

// « Ensemble » (#17097) côté REST : ce qu'on peut lire ensemble dans une conversation directe, et l'adresse du média
// d'une séance. La passerelle sert la galerie au seul membre et rejuge tout à l'invitation ; ce service ne décide
// d'aucun droit — il écarte seulement ce qui ne SE LIRAIT pas ensemble (vue unique, chiffré, ni audio ni vidéo).

/// Une pièce telle que la galerie de la conversation la sert (`GET /conversations/:id/attachments`).
public struct TogetherListedAttachment: Decodable, Sendable, Equatable {
    public let id: String
    public let originalName: String
    public let mimeType: String
    public let createdAt: String?
    public let isViewOnce: Bool?
    public let isEncrypted: Bool?

    public init(id: String, originalName: String, mimeType: String, createdAt: String? = nil, isViewOnce: Bool? = nil, isEncrypted: Bool? = nil) {
        self.id = id
        self.originalName = originalName
        self.mimeType = mimeType
        self.createdAt = createdAt
        self.isViewOnce = isViewOnce
        self.isEncrypted = isEncrypted
    }
}

/// Une vidéo ou un audio proposé à la lecture ensemble.
public struct TogetherPiece: Sendable, Equatable, Identifiable {
    public let attachment: TogetherListedAttachment
    public let media: TogetherMediaKind
    public let at: Date

    public var id: String { attachment.id }
}

/// La loi de la liste, iso `togetherPieces` (`apps/web/src/routes/user-profile-together.tsx`) : les vidéos et audios
/// lisibles ensemble, les plus récents d'abord, dédoublonnés, six au plus.
public enum TogetherPieces {
    public static let shown = 6

    public static func select(_ attachments: [TogetherListedAttachment]) -> [TogetherPiece] {
        var seen = Set<String>()
        let pieces = attachments.compactMap { attachment -> TogetherPiece? in
            guard let media = media(of: attachment),
                  attachment.isViewOnce != true,
                  attachment.isEncrypted != true,
                  seen.insert(attachment.id).inserted else { return nil }
            return TogetherPiece(attachment: attachment, media: media, at: date(attachment.createdAt))
        }
        return Array(pieces.sorted { $0.at > $1.at }.prefix(shown))
    }

    static func media(of attachment: TogetherListedAttachment) -> TogetherMediaKind? {
        let mime = attachment.mimeType.lowercased()
        if mime.hasPrefix("video/") { return .video }
        if mime.hasPrefix("audio/") { return .audio }
        return nil
    }

    private static func date(_ raw: String?) -> Date {
        guard let raw else { return .distantPast }
        return WireDate.date(from: raw) ?? .distantPast
    }
}

public protocol TogetherProviding: Sendable {
    /// Les pièces lisibles ensemble de la conversation directe, ou `[]` (aucune, ou panne : la ligne invite à en envoyer).
    func directPieces(conversationId: String) async -> [TogetherPiece]
    /// L'adresse (relative ou absolue) du média d'une séance, ou `nil` s'il ne se lit pas sur cet appareil.
    func mediaURL(attachmentId: String) async -> String?
}

public final class TogetherService: TogetherProviding {
    public static let shared = TogetherService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    private struct Gallery: Decodable {
        let attachments: [Lossy<TogetherListedAttachment>]
    }

    private struct Detail: Decodable {
        struct Attachment: Decodable {
            let fileUrl: String?
            let isEncrypted: Bool?
        }
        let attachment: Attachment
    }

    public func directPieces(conversationId: String) async -> [TogetherPiece] {
        async let videos = listed(conversationId: conversationId, type: .video)
        async let audios = listed(conversationId: conversationId, type: .audio)
        return TogetherPieces.select(await videos + audios)
    }

    public func mediaURL(attachmentId: String) async -> String? {
        let response: APIResponse<Detail>? = try? await api.request(
            AttachmentsEndpoint.byAttachmentIdMetadata(attachmentId: attachmentId), method: "GET", body: nil, queryItems: nil
        )
        guard let detail = response?.data.attachment, detail.isEncrypted != true,
              let url = detail.fileUrl, !url.isEmpty else { return nil }
        return url
    }

    private func listed(conversationId: String, type: TogetherMediaKind) async -> [TogetherListedAttachment] {
        let response: APIResponse<Gallery>? = try? await api.request(
            ConversationsEndpoint.byConversationIdAttachments(conversationId: conversationId),
            method: "GET",
            body: nil,
            queryItems: [URLQueryItem(name: "type", value: type.rawValue), URLQueryItem(name: "limit", value: "\(TogetherPieces.shown)")]
        )
        return response?.data.attachments.compactMap(\.value) ?? []
    }
}

/// Une entrée de liste illisible est écartée, jamais la liste entière.
private struct Lossy<Value: Decodable>: Decodable {
    let value: Value?

    init(from decoder: Decoder) throws {
        value = try? Value(from: decoder)
    }
}
