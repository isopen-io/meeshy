import Foundation

// MARK: - Affiliate Token

public struct AffiliateToken: Codable, Identifiable, Sendable, CacheIdentifiable {
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

    public init(
        id: String, token: String, name: String, affiliateLink: String?,
        maxUses: Int?, currentUses: Int, isActive: Bool, expiresAt: String?,
        createdAt: String, _count: AffiliateCount?, clickCount: Int
    ) {
        self.id = id; self.token = token; self.name = name
        self.affiliateLink = affiliateLink; self.maxUses = maxUses
        self.currentUses = currentUses; self.isActive = isActive
        self.expiresAt = expiresAt; self.createdAt = createdAt
        self._count = _count; self.clickCount = clickCount
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

public struct AffiliateCount: Codable, Sendable {
    public let affiliations: Int
}

// MARK: - Affiliate Stats

public struct AffiliateStats: Codable, Sendable {
    public let totalTokens: Int?
    public let totalReferrals: Int?
    public let totalVisits: Int?
    public let conversionRate: Double?
    public let completedReferrals: Int?
    public let pendingReferrals: Int?
    /// Les filleuls eux-mêmes — ce que l'onglet « Affilies » liste.
    public let referrals: [AffiliateReferral]?
    /// L'entonnoir (#19207) : les visites de tous mes liens. Absent d'une passerelle plus ancienne.
    public let visits: Int?
    /// L'entonnoir (#19207) : les filleuls inscrits depuis toujours.
    public let registrations: Int?
    /// Les filleuls inscrits depuis le premier du mois (UTC, #19207).
    public let registrationsThisMonth: Int?
    /// Les filleuls vus dans les trente derniers jours (#19207) ; `nil` tant que la passerelle ne mesure pas l'activité.
    public let active: Int?
    /// Ce que le parrainage rapporte et le prochain palier (#19508) ; absent tant que le jeu ne le sert pas (#7743).
    public let rewards: AffiliateRewards?

    public init(totalTokens: Int? = nil, totalReferrals: Int? = nil,
                totalVisits: Int? = nil, conversionRate: Double? = nil,
                completedReferrals: Int? = nil, pendingReferrals: Int? = nil,
                referrals: [AffiliateReferral]? = nil, visits: Int? = nil,
                registrations: Int? = nil, registrationsThisMonth: Int? = nil,
                active: Int? = nil, rewards: AffiliateRewards? = nil) {
        self.totalTokens = totalTokens; self.totalReferrals = totalReferrals
        self.totalVisits = totalVisits; self.conversionRate = conversionRate
        self.completedReferrals = completedReferrals; self.pendingReferrals = pendingReferrals
        self.referrals = referrals
        self.visits = visits; self.registrations = registrations
        self.registrationsThisMonth = registrationsThisMonth; self.active = active
        self.rewards = rewards
    }
}

/// Ce que le parrainage rapporte (#19508) : le gain par filleul actif, le total gagné, le prochain palier.
public struct AffiliateRewards: Codable, Sendable, Equatable {
    public let perActiveReferral: Int?
    public let earned: Int?
    public let nextTier: AffiliateRewardTier?

    public init(perActiveReferral: Int? = nil, earned: Int? = nil, nextTier: AffiliateRewardTier? = nil) {
        self.perActiveReferral = perActiveReferral
        self.earned = earned
        self.nextTier = nextTier
    }
}

/// Le prochain palier : combien de filleuls comptent déjà, combien il en faut, et ce qu'il débloque (texte servi).
public struct AffiliateRewardTier: Codable, Sendable, Equatable {
    public let reached: Int
    public let target: Int
    public let reward: String?

    public init(reached: Int, target: Int, reward: String? = nil) {
        self.reached = reached
        self.target = target
        self.reward = reward
    }
}

// MARK: - Affiliate Referral

/// Un filleul : l'utilisateur qui a rejoint Meeshy via un lien d'affiliation.
public struct AffiliateReferral: Codable, Sendable, Identifiable, Equatable, CacheIdentifiable {
    public let id: String
    public let status: String?
    public let createdAt: Date?
    public let completedAt: Date?
    public let referredUser: ReferredUser?
    /// `active` / `inactive` : vu sur Meeshy dans les trente derniers jours (#19207), jamais une date. Absent tant
    /// que la passerelle ne mesure pas l'activité, `nil` si le filleul masque son statut en ligne.
    public let activity: String?

    public init(
        id: String,
        status: String? = nil,
        createdAt: Date? = nil,
        completedAt: Date? = nil,
        referredUser: ReferredUser? = nil,
        activity: String? = nil
    ) {
        self.id = id
        self.status = status
        self.createdAt = createdAt
        self.completedAt = completedAt
        self.referredUser = referredUser
        self.activity = activity
    }

    /// Nom d'affichage du filleul, pseudo en dernier recours.
    public var resolvedName: String {
        guard let user = referredUser else { return "" }
        let composed = [user.firstName, user.lastName]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return composed.isEmpty ? "@\(user.username)" : composed
    }
}

public struct ReferredUser: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let username: String
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
    public let isOnline: Bool?

    public init(
        id: String,
        username: String,
        firstName: String? = nil,
        lastName: String? = nil,
        avatar: String? = nil,
        isOnline: Bool? = nil
    ) {
        self.id = id
        self.username = username
        self.firstName = firstName
        self.lastName = lastName
        self.avatar = avatar
        self.isOnline = isOnline
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
