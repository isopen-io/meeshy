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
///
/// - `impression` porte, depuis #10501, son contexte de LISTING (rang rendu,
///   page servie, source de classement) et sa VISIBILITÉ au sens MRC quand
///   elle est connue au départ du lot — deux clés facultatives, qu'un serveur
///   antérieur supprime sans erreur ;
/// - `view` porte, depuis la demande du porteur du 2026-10-13, l'ENTRÉE qui a
///   amené l'écran détail (`provenance`, et `origin` pour un listing) ;
/// - `open` est l'engagement d'ouverture envoyé AU TAP sur un contenu d'un
///   listing. Il ne compte AUCUNE vue, et un serveur antérieur ne le connaît
///   pas : il part toujours dans une requête à lui
///   (`SocialEventsDispatch.requests(for:)`) ;
/// - `dwell` est une session de consommation (durée, lecture, micro-actions)
///   de l'`EngagementTracker` : la porte reprend tel quel le corps de l'ancien
///   `POST /posts/engagement/batch`, augmenté du seul discriminant. Un compte
///   seulement — un visiteur ne produit que des vues.
public enum SocialEvent: Codable, Sendable, Equatable {
    case view(postId: String, durationMs: Int?, surface: ReachSurface?, entry: ContentEntry? = nil)
    case impression(postId: String, source: String, surface: ReachSurface?, listing: SocialListing? = nil, visibility: SocialVisibility? = nil)
    case open(postId: String, origin: OpenOrigin?)
    case dwell(EngagementSession)
    /// #10764 — le PREMIER CONTACT d'une session de consommation : le corps
    /// d'un `dwell`, sous la même clé de session, envoyé dès qu'elle commence.
    /// Un serveur qui ne sait pas fusionner une session le refuse ; il part
    /// donc toujours dans une requête à lui.
    case dwellStart(EngagementSession)

    public var postId: String {
        switch self {
        case .view(let postId, _, _, _), .impression(let postId, _, _, _, _), .open(let postId, _):
            return postId
        case .dwell(let session), .dwellStart(let session):
            return session.postId
        }
    }

    /// Un engagement d'ouverture — jamais dans la même requête qu'une vue ou
    /// une impression.
    public var isOpen: Bool {
        if case .open = self { return true }
        return false
    }

    private enum CodingKeys: String, CodingKey {
        case type, postId, durationMs, source, surface, provenance, origin, listing, visibility
    }

    private enum Kind: String, Codable {
        case view, impression, open, dwell
        case dwellStart = "dwell-start"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .view(let postId, let durationMs, let surface, let entry):
            try container.encode(Kind.view, forKey: .type)
            try container.encode(postId, forKey: .postId)
            try container.encodeIfPresent(durationMs, forKey: .durationMs)
            try container.encodeIfPresent(surface, forKey: .surface)
            try container.encodeIfPresent(entry?.provenance, forKey: .provenance)
            try container.encodeIfPresent(entry?.origin, forKey: .origin)
        case .impression(let postId, let source, let surface, let listing, let visibility):
            try container.encode(Kind.impression, forKey: .type)
            try container.encode(postId, forKey: .postId)
            try container.encode(source, forKey: .source)
            try container.encodeIfPresent(surface, forKey: .surface)
            try container.encodeIfPresent(listing, forKey: .listing)
            try container.encodeIfPresent(visibility, forKey: .visibility)
        case .open(let postId, let origin):
            try container.encode(Kind.open, forKey: .type)
            try container.encode(postId, forKey: .postId)
            try container.encodeIfPresent(origin, forKey: .origin)
        case .dwell(let session):
            try container.encode(Kind.dwell, forKey: .type)
            try session.encode(to: encoder)
        case .dwellStart(let session):
            try container.encode(Kind.dwellStart, forKey: .type)
            try session.encode(to: encoder)
        }
    }

    /// Une valeur d'énumération inconnue (file écrite par une version plus
    /// récente) se lit comme absente, jamais comme une erreur de décodage.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let postId = try container.decode(String.self, forKey: .postId)
        let surface = (try? container.decodeIfPresent(ReachSurface.self, forKey: .surface)) ?? nil
        let origin = (try? container.decodeIfPresent(OpenOrigin.self, forKey: .origin)) ?? nil
        switch try container.decode(Kind.self, forKey: .type) {
        case .view:
            let provenance = (try? container.decodeIfPresent(ViewProvenance.self, forKey: .provenance)) ?? nil
            self = .view(
                postId: postId,
                durationMs: try container.decodeIfPresent(Int.self, forKey: .durationMs),
                surface: surface,
                entry: provenance.map { ContentEntry(provenance: $0, origin: origin) }
            )
        case .impression:
            self = .impression(
                postId: postId,
                source: try container.decodeIfPresent(String.self, forKey: .source) ?? "feed",
                surface: surface,
                listing: (try? container.decodeIfPresent(SocialListing.self, forKey: .listing)) ?? nil,
                visibility: (try? container.decodeIfPresent(SocialVisibility.self, forKey: .visibility)) ?? nil
            )
        case .open:
            self = .open(postId: postId, origin: origin)
        case .dwell:
            self = .dwell(try EngagementSession(from: decoder))
        case .dwellStart:
            self = .dwellStart(try EngagementSession(from: decoder))
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
///
/// Les dates partent en ISO 8601 : `dwell.startedAt` est une chaîne côté
/// passerelle, et l'encodeur par défaut écrirait un nombre — le lot entier
/// serait refusé.
///
/// `context.sentAt` (#10500) est l'heure de l'APPAREIL au départ du lot : la
/// passerelle en retranche l'âge `sentAt − occurredAt` de sa propre heure de
/// réception, ce qui corrige un appareil décalé. Un serveur antérieur supprime
/// la clé sans erreur.
///
/// `context.consent` (#10552) est le consentement d'analyse tel que l'app le
/// connaît, le MÊME que celui des lots v2 : la passerelle ne retire d'une
/// impression ses colonnes de mesure que si le lot dit `denied`. Absent quand
/// aucune source n'est installée ; un serveur antérieur supprime la clé.
struct SocialEventsBody: Encodable {
    struct Context: Encodable {
        let sentAt: String
        let consent: SocialEventContext.Consent?
    }

    let events: [StampedSocialEvent]
    let context: Context

    static func encoded(_ events: [StampedSocialEvent], sentAt: Date, consent: SocialEventContext.Consent? = nil) throws -> Data {
        let encoder = MeeshyCoders.encoder(.api)
        return try encoder.encode(SocialEventsBody(events: events, context: Context(sentAt: WireDate.string(from: sentAt), consent: consent)))
    }
}

/// D'où un lot de COMPTAGE tient le consentement d'analyse (#10552). Le SDK ne
/// lit aucun réglage : l'app installe sa règle une fois au lancement. Sans
/// source installée (extension, test), le lot part sans `context.consent`.
public final class SocialEventsConsentSource: Sendable {
    public static let shared = SocialEventsConsentSource()

    private let standingSlot = Locked<(@MainActor @Sendable () -> SocialEventContext.Consent?)?>(nil)

    public init() {}

    public func install(_ standing: @escaping @MainActor @Sendable () -> SocialEventContext.Consent?) {
        standingSlot.mutate { $0 = standing }
    }

    public func current() async -> SocialEventContext.Consent? {
        guard let standing = standingSlot.read({ $0 }) else { return nil }
        return await standing()
    }
}
