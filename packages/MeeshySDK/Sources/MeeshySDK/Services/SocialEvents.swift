import Foundation

// MARK: - Chaque affichage d'un contenu est compté, avec ou sans compte (#10483)
//
// `POST /social/events` est la porte UNIQUE de la télémétrie de lecture. Ce
// fichier en porte le contrat de fil côté iOS : les deux événements qu'un
// lecteur produit en LISANT (une impression, une vue), la SURFACE qui les a
// produits, et SOUS QUELLE identité ils partent.

/// Où le contenu est apparu. Facultative sur le fil : un serveur antérieur à
/// #10483 la supprime sans erreur (`z.object` non strict), donc un client neuf
/// ne dépend jamais d'un serveur neuf.
public enum ReachSurface: String, Codable, Sendable, CaseIterable {
    case feed
    case reels
    case profile
    case bookmarks
    case hashtag
    case community
    case nearby
    case sound
    case storyRail = "story_rail"
    case moodAvatar = "mood_avatar"
    case citation
    case detail
    case story
    case visitor
}

/// Un événement de lecture. `surface` (et `durationMs`) ne s'écrivent que s'ils
/// sont présents : une clé `null` serait refusée par le schéma de la porte.
public enum SocialEvent: Codable, Sendable, Equatable {
    case view(postId: String, durationMs: Int?, surface: ReachSurface?)
    case impression(postId: String, source: String, surface: ReachSurface?)

    public var postId: String {
        switch self {
        case .view(let postId, _, _), .impression(let postId, _, _):
            return postId
        }
    }

    private enum CodingKeys: String, CodingKey {
        case type, postId, durationMs, source, surface
    }

    private enum Kind: String, Codable {
        case view, impression
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .view(let postId, let durationMs, let surface):
            try container.encode(Kind.view, forKey: .type)
            try container.encode(postId, forKey: .postId)
            try container.encodeIfPresent(durationMs, forKey: .durationMs)
            try container.encodeIfPresent(surface, forKey: .surface)
        case .impression(let postId, let source, let surface):
            try container.encode(Kind.impression, forKey: .type)
            try container.encode(postId, forKey: .postId)
            try container.encode(source, forKey: .source)
            try container.encodeIfPresent(surface, forKey: .surface)
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let postId = try container.decode(String.self, forKey: .postId)
        let surface = try container.decodeIfPresent(ReachSurface.self, forKey: .surface)
        switch try container.decode(Kind.self, forKey: .type) {
        case .view:
            self = .view(
                postId: postId,
                durationMs: try container.decodeIfPresent(Int.self, forKey: .durationMs),
                surface: surface
            )
        case .impression:
            self = .impression(
                postId: postId,
                source: try container.decodeIfPresent(String.self, forKey: .source) ?? "feed",
                surface: surface
            )
        }
    }
}

/// SOUS QUELLE identité un lot part.
///
/// Un compte s'annonce par son JWT, que le transport pose déjà. Un lecteur
/// sans compte présente `X-Session-Token` : le jeton d'un invité de lien
/// (`anon_…`) s'il en a un, sinon sa clé visiteur (`visitor_<uuid>`). La
/// passerelle n'écrit jamais cette valeur : elle en dérive une empreinte HMAC.
public enum SocialEventsCredential: Sendable, Equatable {
    case account
    case visitor(String)

    /// L'en-tête à ajouter à la requête — `nil` pour un compte.
    public var headers: [String: String]? {
        switch self {
        case .account: return nil
        case .visitor(let token): return ["X-Session-Token": token]
        }
    }
}

/// La réponse de la porte : ce qui a été écrit, ce qui a été écarté.
public struct SocialEventsReceipt: Codable, Sendable, Equatable {
    public let recorded: Int
    public let rejected: Int

    public init(recorded: Int, rejected: Int) {
        self.recorded = recorded
        self.rejected = rejected
    }
}

/// Le corps de `POST /social/events`.
struct SocialEventsBody: Encodable {
    let events: [SocialEvent]
}
