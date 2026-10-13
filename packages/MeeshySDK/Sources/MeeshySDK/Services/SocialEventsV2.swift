import Foundation

// MARK: - Chaque interaction avec un contenu est capturée (#10499, #10500)
//
// Le catalogue TYPÉ des événements v2 de `POST /social/events`. Contrat :
// `services/gateway/decisions/2026-10-13-social-events-v2-chaque-interaction-avec-un-contenu-est-capturee.md`.
//
// Sur le fil, un événement est PLAT : `type`, `action`, l'enveloppe
// (`eventId`, `occurredAt`, `target`, `surface`, `listing`, `prism`) puis les
// champs propres de sa famille. Aucune chaîne libre ne part : énumérations,
// identifiants, nombres. Jamais d'URL, jamais de texte saisi, jamais d'image.
//
// Les types v2 ne voyagent JAMAIS avec un type de comptage (`impression`,
// `view`, `open`, `dwell`) : ce sont deux types Swift distincts, et un serveur
// antérieur qui refuse le lot v2 en 400 n'emporte aucune vue.

/// Ce sur quoi porte un événement. Miroir de `SOCIAL_TARGET_KINDS`.
public enum SocialTargetKind: String, Encodable, Sendable, CaseIterable {
    case post, reel, story, status, comment, profile, hashtag, sound, community, link, notification
}

/// Une référence nue — le PARENT d'une cible (le post d'un commentaire, la
/// story d'un sticker, le contenu visé par une notification).
public struct SocialTargetRef: Encodable, Sendable, Equatable, Hashable {
    public let kind: SocialTargetKind
    public let id: String

    public init(kind: SocialTargetKind, id: String) {
        self.kind = kind
        self.id = id
    }
}

public struct SocialTarget: Encodable, Sendable, Equatable, Hashable {
    public let kind: SocialTargetKind
    public let id: String
    public let parent: SocialTargetRef?

    public init(kind: SocialTargetKind, id: String, parent: SocialTargetRef? = nil) {
        self.kind = kind
        self.id = id
        self.parent = parent
    }

    /// Un hashtag se nomme en minuscules, sans `#`, ≤ 100 caractères.
    public static func hashtag(_ name: String) -> SocialTarget {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let bare = trimmed.hasPrefix("#") ? String(trimmed.dropFirst()) : trimmed
        return SocialTarget(kind: .hashtag, id: String(bare.lowercased().prefix(100)))
    }

    /// Un lien se nomme par l'id de son lien de suivi, sinon par son DOMAINE
    /// enregistrable — jamais par l'URL. `nil` : rien d'enregistrable.
    public static func link(url: URL, trackingLinkId: String? = nil, parent: SocialTargetRef? = nil) -> SocialTarget? {
        if let trackingLinkId, !trackingLinkId.isEmpty {
            return SocialTarget(kind: .link, id: trackingLinkId, parent: parent)
        }
        guard let domain = RegistrableDomain.of(url) else { return nil }
        return SocialTarget(kind: .link, id: domain, parent: parent)
    }

    public var ref: SocialTargetRef { SocialTargetRef(kind: kind, id: id) }
}

/// D'où vient le classement d'un listing — servi par la passerelle.
public enum SocialRankingSource: String, Codable, Sendable, CaseIterable {
    case following
    case forYou = "for_you"
    case trending, nearby, search, hashtag, sound, profile, bookmarks, other

    /// Une valeur servie inconnue se rabat sur `other`, jamais une erreur.
    public init(served: String?) {
        self = served.flatMap(SocialRankingSource.init(rawValue:)) ?? .other
    }

    /// Relue d'une file persistée : même repli que pour une valeur servie.
    public init(from decoder: Decoder) throws {
        self.init(served: try decoder.singleValueContainer().decode(String.self))
    }
}

/// Le contexte de listing d'un événement émis DEPUIS un listing.
public struct SocialListing: Codable, Sendable, Equatable {
    public let feedRequestId: String?
    public let position: Int?
    public let rankingSource: SocialRankingSource?
    public let listingSessionId: String?

    public init(feedRequestId: String? = nil, position: Int? = nil, rankingSource: SocialRankingSource? = nil, listingSessionId: String? = nil) {
        self.feedRequestId = feedRequestId
        self.position = position
        self.rankingSource = rankingSource
        self.listingSessionId = listingSessionId
    }
}

/// Ce que le lecteur a VU — mesure du Prisme Linguistique.
public struct SocialPrism: Encodable, Sendable, Equatable {
    public enum TranslationSource: String, Encodable, Sendable { case server, device }

    public let displayedLanguage: String
    public let originalLanguage: String?
    public let translated: Bool
    public let translationSource: TranslationSource?

    public init(displayedLanguage: String, originalLanguage: String?, translated: Bool, translationSource: TranslationSource? = nil) {
        self.displayedLanguage = displayedLanguage
        self.originalLanguage = originalLanguage
        self.translated = translated
        self.translationSource = translated ? (translationSource ?? .server) : nil
    }

    /// La langue servie par la descente du Prisme : `nil` ⇒ l'original.
    public static func served(translationLanguage: String?, originalLanguage: String?) -> SocialPrism? {
        if let translationLanguage {
            return SocialPrism(displayedLanguage: translationLanguage, originalLanguage: originalLanguage, translated: true)
        }
        guard let originalLanguage else { return nil }
        return SocialPrism(displayedLanguage: originalLanguage, originalLanguage: originalLanguage, translated: false)
    }
}

/// La surface d'un événement v2 : `CONTENT_SURFACES`, étendue de façon
/// additive (une valeur que le serveur ignore est ôtée, jamais un refus).
public struct SocialSurface: RawRepresentable, Encodable, Sendable, Equatable, Hashable {
    public let rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }
    public init(_ reach: ReachSurface) { self.rawValue = reach.rawValue }

    public static let search = SocialSurface(rawValue: "search")
    public static let notifications = SocialSurface(rawValue: "notifications")
    public static let comments = SocialSurface(rawValue: "comments")
    public static let linkPreview = SocialSurface(rawValue: "link_preview")

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

/// Un événement v2 : l'enveloppe et la charge de sa famille.
public struct SocialEventV2: Encodable, Sendable, Equatable {
    public let eventId: String
    public let occurredAt: Date
    /// Absente d'un résumé de LISTING (`scroll.listing`) : il ne porte sur
    /// aucun contenu en particulier.
    public let target: SocialTarget?
    public let surface: SocialSurface?
    public let listing: SocialListing?
    public let prism: SocialPrism?
    public let payload: SocialEventV2Payload

    public init(
        eventId: String = SocialEventV2.newEventId(),
        occurredAt: Date = Date(),
        target: SocialTarget?,
        surface: SocialSurface? = nil,
        listing: SocialListing? = nil,
        prism: SocialPrism? = nil,
        payload: SocialEventV2Payload
    ) {
        self.eventId = eventId
        self.occurredAt = occurredAt
        self.target = target
        self.surface = surface
        self.listing = listing
        self.prism = prism
        self.payload = payload
    }

    /// UUID v4 en minuscules — posé à la CRÉATION, jamais au rejeu.
    public static func newEventId() -> String { UUID().uuidString.lowercased() }

    public var type: String { payload.type }
    public var action: String { payload.action }

    private enum CodingKeys: String, CodingKey {
        case type, action, eventId, occurredAt, target, surface, listing, prism
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(payload.type, forKey: .type)
        try container.encode(payload.action, forKey: .action)
        try container.encode(eventId, forKey: .eventId)
        try container.encode(SocialEventsV2Wire.isoString(occurredAt), forKey: .occurredAt)
        try container.encodeIfPresent(target, forKey: .target)
        try container.encodeIfPresent(surface, forKey: .surface)
        try container.encodeIfPresent(listing, forKey: .listing)
        try container.encodeIfPresent(prism, forKey: .prism)
        try payload.encodeFields(to: encoder)
    }
}

/// La charge d'un événement — une famille par cas.
public enum SocialEventV2Payload: Sendable, Equatable {
    case interaction(SocialInteraction)
    case negative(SocialNegative)
    case playback(PlaybackSummary)
    case link(SocialLinkEvent)
    case discovery(SocialDiscovery)
    case story(SocialStoryEvent)
    case notification(SocialNotificationEvent)
    case screenCapture(SocialScreenCapture)
    case scrollListing(ScrollListingSummary)
    case scrollContent(ScrollContentSummary)
    case visibility(SocialVisibility)

    public var type: String {
        switch self {
        case .interaction: return "interaction"
        case .negative: return "negative"
        case .playback: return "playback"
        case .link: return "link"
        case .discovery: return "discovery"
        case .story: return "story"
        case .notification: return "notification"
        case .screenCapture: return "screen_capture"
        case .scrollListing, .scrollContent: return "scroll"
        case .visibility: return "visibility"
        }
    }

    public var action: String {
        switch self {
        case .interaction(let e): return e.action.rawValue
        case .negative(let e): return e.action.rawValue
        case .playback: return "session"
        case .link(let e): return e.action.rawValue
        case .discovery(let e): return e.action.rawValue
        case .story(let e): return e.action.rawValue
        case .notification(let e): return e.action.rawValue
        case .screenCapture(let e): return e.action.rawValue
        case .scrollListing: return "listing"
        case .scrollContent: return "content"
        case .visibility: return "measured"
        }
    }

    /// Les types que la passerelle peut ÉCHANTILLONNER (point 7) : les autres
    /// partent toujours.
    public var isSampleable: Bool {
        switch self {
        case .scrollListing, .scrollContent, .playback, .visibility: return true
        default: return false
        }
    }

    /// Les types qu'un lecteur SANS compte peut produire (`ANONYMOUS_V2_TYPES`) :
    /// ni interaction, ni négatif, ni story, ni notification.
    public var isAllowedForVisitor: Bool {
        switch self {
        case .visibility, .playback, .scrollListing, .scrollContent, .screenCapture, .link, .discovery: return true
        default: return false
        }
    }

    func encodeFields(to encoder: Encoder) throws {
        switch self {
        case .interaction(let e): try e.encode(to: encoder)
        case .negative(let e): try e.encode(to: encoder)
        case .playback(let e): try e.encode(to: encoder)
        case .link(let e): try e.encode(to: encoder)
        case .discovery(let e): try e.encode(to: encoder)
        case .story(let e): try e.encode(to: encoder)
        case .notification(let e): try e.encode(to: encoder)
        case .screenCapture(let e): try e.encode(to: encoder)
        case .scrollListing(let e): try e.encode(to: encoder)
        case .scrollContent(let e): try e.encode(to: encoder)
        case .visibility(let e): try e.encode(to: encoder)
        }
    }
}
