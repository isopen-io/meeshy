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
