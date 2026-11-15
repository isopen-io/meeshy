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

    public var displayName: String { name ?? token }
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
