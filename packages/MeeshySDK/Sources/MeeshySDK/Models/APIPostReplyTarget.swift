import Foundation

/// Métadonnées enrichies de la story citée — renvoyées par le gateway dans
/// `GET /messages` quand le message répond à une story. `nil` si la story a
/// été supprimée.
/// Snapshot figé du post cité (status/story/reel/post) dans une réponse —
/// reçu via le champ `postReplyTo` (legacy : `storyReplyTo`). Survit à
/// l'expiration du post car capturé au moment de la réponse.
public struct APIPostReplyTarget: Decodable, Sendable {
    public let id: String
    /// Type du post cité ("STATUS" | "STORY" | "POST" | "REEL"), figé dans le
    /// snapshot. Optionnel pour compat avec les payloads legacy.
    public let type: String?
    public let reactionCount: Int
    public let commentCount: Int
    /// Nombre de partages de la story, figé au moment de la réponse.
    public let shareCount: Int
    public let createdAt: Date
    public let thumbnailUrl: String?
    public let previewText: String
    /// Présent quand le post cité est un mood/statut — déclenche le rendu
    /// dédié (emoji + contenu + date) côté bulle.
    public let moodEmoji: String?
    /// Nom d'affichage de l'auteur du post cité, figé par le gateway.
    /// `nil` sur un snapshot antérieur au 2026-08-10 — le rendu retombe alors
    /// sur le libellé générique de la citation.
    public let authorName: String?
    /// #7950 — le post cité a été SUPPRIMÉ par son auteur : la passerelle a
    /// vidé l'instantané et pose ce marqueur (même nom que `replyTo.deletedAt`).
    /// La citation devient « Story indisponible », sans porte. `nil` ⇒
    /// disponible — une story seulement EXPIRÉE garde son instantané.
    public let deletedAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, type, reactionCount, commentCount, shareCount, createdAt, thumbnailUrl, previewText, moodEmoji, authorName, deletedAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        reactionCount = try c.decode(Int.self, forKey: .reactionCount)
        commentCount = try c.decode(Int.self, forKey: .commentCount)
        shareCount = try c.decodeIfPresent(Int.self, forKey: .shareCount) ?? 0
        thumbnailUrl = try c.decodeIfPresent(String.self, forKey: .thumbnailUrl)
        previewText = try c.decode(String.self, forKey: .previewText)
        moodEmoji = try c.decodeIfPresent(String.self, forKey: .moodEmoji)
        authorName = try c.decodeIfPresent(String.self, forKey: .authorName)
        deletedAt = (try? c.decodeIfPresent(String.self, forKey: .deletedAt)).flatMap { WireDate.date(from: $0) }
        // `createdAt` est décodé depuis une String puis parsé ici — agnostique
        // de la `dateDecodingStrategy` du JSONDecoder appelant (la prod utilise
        // une stratégie `.custom`, les tests `.iso8601`). Tolère les
        // millisecondes (`.000Z`) que le gateway émet via `Date.toISOString()`.
        let raw = try c.decode(String.self, forKey: .createdAt)
        guard let date = WireDate.date(from: raw) else {
            throw DecodingError.dataCorruptedError(forKey: .createdAt, in: c,
                debugDescription: "Date ISO8601 invalide: \(raw)")
        }
        createdAt = date
    }
}
