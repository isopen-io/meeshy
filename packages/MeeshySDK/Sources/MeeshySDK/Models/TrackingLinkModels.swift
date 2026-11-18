import Foundation

// MARK: - TrackingLink Models

public struct TrackingLink: Codable, Identifiable, Sendable, CacheIdentifiable {
    public let id: String
    public let token: String
    public let name: String?
    public let campaign: String?
    public let source: String?
    public let medium: String?
    public let originalUrl: String
    public let shortUrl: String
    public let totalClicks: Int
    public let uniqueClicks: Int
    public let isActive: Bool
    public let expiresAt: Date?
    public let createdAt: Date
    public let lastClickedAt: Date?
    /// Les clics des derniers jours, le plus ancien d'abord (planche `Moi-Liens`, « 7 j ») ; absent d'un serveur qui
    /// ne le sert pas encore.
    public var dailyClicks: [Int]? = nil
    /// Le nombre de pays d'où l'on a cliqué (« 31 pays ») ; absent d'un serveur qui ne le sert pas encore.
    public var countryCount: Int? = nil

    public var displayName: String { name ?? token }
}

public extension TrackingLink {
    /// Le même lien, l'interrupteur posé : ce que l'écran montre avant que le serveur confirme.
    func withActive(_ active: Bool) -> TrackingLink {
        TrackingLink(id: id, token: token, name: name, campaign: campaign, source: source, medium: medium,
                     originalUrl: originalUrl, shortUrl: shortUrl, totalClicks: totalClicks, uniqueClicks: uniqueClicks,
                     isActive: active, expiresAt: expiresAt, createdAt: createdAt, lastClickedAt: lastClickedAt,
                     dailyClicks: dailyClicks, countryCount: countryCount)
    }

    /// Le même lien, les changements posés : ce que l'écran montre avant que le serveur confirme.
    func applying(_ changes: TrackingLinkChanges) -> TrackingLink {
        TrackingLink(id: id, token: token, name: changes.name ?? name, campaign: changes.campaign ?? campaign,
                     source: changes.source ?? source, medium: changes.medium ?? medium,
                     originalUrl: originalUrl, shortUrl: shortUrl, totalClicks: totalClicks, uniqueClicks: uniqueClicks,
                     isActive: changes.isActive ?? isActive, expiresAt: changes.expiresAt ?? expiresAt,
                     createdAt: createdAt, lastClickedAt: lastClickedAt,
                     dailyClicks: dailyClicks, countryCount: countryCount)
    }
}

/// Réponse de `POST /api/v1/tracking-links` (#9185). La passerelle ENVELOPPE le
/// lien — `{ trackingLink, existed? }`, contrat `CreateTrackingLinkResponseData`
/// de `packages/shared/types/tracking-link.ts` — et `existed` signale un lien que
/// l'appelant avait déjà créé pour la même URL. Le lien posé directement sous
/// `data` (forme antérieure) se lit encore.
public struct CreatedTrackingLink: Decodable, Sendable {
    public let link: TrackingLink
    public let existed: Bool

    public init(link: TrackingLink, existed: Bool) {
        self.link = link
        self.existed = existed
    }

    private enum CodingKeys: String, CodingKey {
        case trackingLink, existed
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard let wrapped = try container.decodeIfPresent(TrackingLink.self, forKey: .trackingLink) else {
            self.init(link: try TrackingLink(from: decoder), existed: false)
            return
        }
        self.init(link: wrapped, existed: try container.decodeIfPresent(Bool.self, forKey: .existed) ?? false)
    }
}

public struct TrackingLinkClick: Codable, Identifiable, Sendable {
    public let id: String
    public let country: String?
    public let city: String?
    public let device: String?
    public let browser: String?
    public let os: String?
    public let referrer: String?
    public let socialSource: String?
    public let redirectStatus: String
    public let clickedAt: Date
}

public struct TrackingLinkDetail: Codable, Sendable {
    public let link: TrackingLink
    public let clicks: [TrackingLinkClick]
    public let total: Int
}

public struct TrackingLinkStats: Codable, Sendable, CacheIdentifiable {
    public var id: String { "stats" }
    public let totalLinks: Int
    public let totalClicks: Int
    public let uniqueClicks: Int
    public let activeLinks: Int
}

public struct CreateTrackingLinkRequest: Encodable {
    public let name: String?
    public let originalUrl: String
    public let campaign: String?
    public let source: String?
    public let medium: String?
    public let token: String?
    public let expiresAt: String?

    /// Le jeton personnalisé part sous `customToken`, la clé que la passerelle
    /// déclare (`creation.ts`) : sous `token`, il était ignoré en silence.
    private enum CodingKeys: String, CodingKey {
        case name, originalUrl, campaign, source, medium, expiresAt
        case token = "customToken"
    }

    public init(
        name: String? = nil,
        originalUrl: String,
        campaign: String? = nil,
        source: String? = nil,
        medium: String? = nil,
        token: String? = nil,
        expiresAt: String? = nil
    ) {
        self.name = name
        self.originalUrl = originalUrl
        self.campaign = campaign
        self.source = source
        self.medium = medium
        self.token = token
        self.expiresAt = expiresAt
    }
}

// MARK: - La carte des visiteurs (contrat #19412)

/// Une zone de la carte des visiteurs : un pays (ISO 3166-1 alpha-2), sa ville quand le plancher de k-anonymat du
/// serveur la laisse, et le nombre de clics. Un agrégat, jamais un clic isolé : ni IP, ni coordonnée.
public struct TrackingVisitorPlace: Codable, Sendable, Equatable {
    public let country: String
    public let city: String?
    public let count: Int

    public init(country: String, city: String?, count: Int) {
        self.country = country
        self.city = city
        self.count = count
    }
}

/// Ce que `GET /tracking-links/:token/stats` sert à la carte. Les deux champs manquent chez un serveur antérieur à
/// #19412 : la carte s'en passe alors.
public struct TrackingLinkPlaceStats: Decodable, Sendable, Equatable {
    public let countryCount: Int?
    public let clicksByPlace: [TrackingVisitorPlace]?

    public init(countryCount: Int?, clicksByPlace: [TrackingVisitorPlace]?) {
        self.countryCount = countryCount
        self.clicksByPlace = clicksByPlace
    }
}

// MARK: - Modifier un lien (contrat #19412)

/// Ce que l'on change d'un lien de suivi. Un champ `nil` ne part pas ; `.some(nil)` part à `null` et l'efface.
public struct TrackingLinkChanges: Encodable, Sendable, Equatable {
    public var name: String??
    public var campaign: String??
    public var source: String??
    public var medium: String??
    public var expiresAt: Date??
    public var isActive: Bool?

    public init(name: String?? = nil, campaign: String?? = nil, source: String?? = nil, medium: String?? = nil,
                expiresAt: Date?? = nil, isActive: Bool? = nil) {
        self.name = name
        self.campaign = campaign
        self.source = source
        self.medium = medium
        self.expiresAt = expiresAt
        self.isActive = isActive
    }

    private enum CodingKeys: String, CodingKey {
        case name, campaign, source, medium, expiresAt, isActive
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try Self.encode(name, .name, in: &container)
        try Self.encode(campaign, .campaign, in: &container)
        try Self.encode(source, .source, in: &container)
        try Self.encode(medium, .medium, in: &container)
        try Self.encode(expiresAt.map { $0.map { ISO8601DateFormatter().string(from: $0) } }, .expiresAt, in: &container)
        try container.encodeIfPresent(isActive, forKey: .isActive)
    }

    private static func encode(_ change: String??, _ key: CodingKeys,
                               in container: inout KeyedEncodingContainer<CodingKeys>) throws {
        guard let change else { return }
        if let value = change {
            try container.encode(value, forKey: key)
        } else {
            try container.encodeNil(forKey: key)
        }
    }

    /// Le serveur a-t-il laissé de côté un nom ou un UTM demandé ? Un serveur antérieur à #19412 ignore ces champs.
    public func isUnretained(by served: TrackingLink) -> Bool {
        let asked: [(String??, String?)] = [(name, served.name), (campaign, served.campaign),
                                            (source, served.source), (medium, served.medium)]
        return asked.contains { change, servedValue in
            guard let change else { return false }
            return change != servedValue
        }
    }
}
