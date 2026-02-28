import Foundation

// MARK: - Affiliate Token

public struct AffiliateToken: Decodable, Identifiable {
    public let id: String
    public let token: String
    public let name: String
    public let affiliateLink: String?
    public let maxUses: Int?
    public let currentUses: Int
    public let isActive: Bool
    public let expiresAt: String?
    public let createdAt: String
    public let _count: AffiliateCount?
    public let clickCount: Int

    public var referralCount: Int { _count?.affiliations ?? 0 }

    enum CodingKeys: String, CodingKey {
        case id, token, name, affiliateLink, maxUses, currentUses
        case isActive, expiresAt, createdAt, _count
        case clickCount
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        token = try c.decode(String.self, forKey: .token)
        name = try c.decode(String.self, forKey: .name)
        affiliateLink = try c.decodeIfPresent(String.self, forKey: .affiliateLink)
        maxUses = try c.decodeIfPresent(Int.self, forKey: .maxUses)
        currentUses = try c.decode(Int.self, forKey: .currentUses)
        isActive = try c.decode(Bool.self, forKey: .isActive)
        expiresAt = try c.decodeIfPresent(String.self, forKey: .expiresAt)
        createdAt = try c.decode(String.self, forKey: .createdAt)
        _count = try c.decodeIfPresent(AffiliateCount.self, forKey: ._count)
        clickCount = (try? c.decodeIfPresent(Int.self, forKey: .clickCount)) ?? 0
    }
}

public struct AffiliateCount: Decodable {
    public let affiliations: Int
}

// MARK: - Affiliate Stats

public struct AffiliateStats: Decodable {
    public let totalTokens: Int?
    public let totalReferrals: Int?
    public let totalVisits: Int?
    public let conversionRate: Double?

    public init(totalTokens: Int? = nil, totalReferrals: Int? = nil,
                totalVisits: Int? = nil, conversionRate: Double? = nil) {
        self.totalTokens = totalTokens; self.totalReferrals = totalReferrals
        self.totalVisits = totalVisits; self.conversionRate = conversionRate
    }
}

// MARK: - Create Affiliate Token Request

public struct CreateAffiliateTokenRequest: Encodable {
    public let name: String
    public let maxUses: Int?
    public let expiresAt: String?

    public init(name: String, maxUses: Int? = nil, expiresAt: String? = nil) {
        self.name = name; self.maxUses = maxUses; self.expiresAt = expiresAt
    }
}
