import Foundation

// MARK: - Le guide d'un badge — MIROIR de packages/shared/utils/game/badge-guide.ts (#9639)
//
// Ce qu'un badge d'accumulation explique de LUI-MÊME : l'échelle de ses sept
// paliers (seuil, matière, ruban, date gravée), le palier atteint et POURQUOI
// (le seuil franchi, ou la seule trace gravée quand le compteur est redescendu),
// les étoiles allumées sur sept, ce qu'il manque pour la prochaine étoile, et le
// rangement des badges par famille. Gardé par les vecteurs partagés
// `packages/shared/fixtures/reading-modes/badge-guide.vectors.json`
// (`BadgeGuideVectorTests`) : sur divergence, c'est le TS qui a raison.

/// Un palier gravé servi par la passerelle : son seuil et sa date ISO 8601.
public struct BadgeServedTier: Sendable, Equatable {
    public let threshold: Int
    public let reachedAt: String

    public init(threshold: Int, reachedAt: String) {
        self.threshold = threshold
        self.reachedAt = reachedAt
    }
}

/// Un palier de l'échelle d'un badge.
public struct BadgeRung: Sendable, Equatable, Identifiable {
    public let threshold: Int
    public let material: BadgeMaterialKey
    public let ribbon: Bool
    public let reached: Bool
    public let reachedAt: String?
    public var id: Int { threshold }
}

/// Pourquoi un palier est tenu.
public enum BadgeReachReason: String, Sendable, Equatable {
    /// Le compteur a franchi le seuil.
    case thresholdCrossed = "threshold-crossed"
    /// Le compteur est redescendu sous le seuil ; la trace gravée le tient.
    case served
}

public struct BadgeReached: Sendable, Equatable {
    public let threshold: Int
    public let material: BadgeMaterialKey
    public let reason: BadgeReachReason
    public let reachedAt: String?
}

public struct BadgeNextStar: Sendable, Equatable {
    public let threshold: Int
    public let material: BadgeMaterialKey
    public let missing: Int
}

public struct BadgeGuide: Sendable, Equatable, Identifiable {
    public let axis: EngagementAxisKey
    public let family: EngagementAxisFamily
    public let count: Int
    /// Les sept paliers, du cuivre au prisme.
    public let rungs: [BadgeRung]
    /// Les étoiles allumées, une par palier atteint, sur `BadgeGuideResolver.starsMax`.
    public let stars: Int
    /// Le plus haut palier tenu, `nil` avant le premier.
    public let reached: BadgeReached?
    /// La prochaine étoile, `nil` au Prisme.
    public let next: BadgeNextStar?
    public var id: EngagementAxisKey { axis }

    /// Les paliers à venir, dans l'ordre : la suite du badge.
    public var upcoming: [BadgeRung] { rungs.filter { !$0.reached } }
}

public struct BadgeGuideFamilyGroup: Sendable, Equatable, Identifiable {
    public let family: EngagementAxisFamily
    public let guides: [BadgeGuide]
    public var id: EngagementAxisFamily { family }
}

public enum BadgeGuideResolver {
    /// Sept paliers, sept étoiles.
    public static var starsMax: Int { GameBadgeTiers.materials.count }

    public static func resolve(axis: EngagementAxisKey, count rawCount: Int, served: [BadgeServedTier]) -> BadgeGuide {
        let count = max(0, rawCount)
        let rungs = GameBadgeTiers.materials.map { material -> BadgeRung in
            let reachedAt = served.first { $0.threshold == material.threshold }?.reachedAt
            return BadgeRung(
                threshold: material.threshold,
                material: material.key,
                ribbon: material.ribbon,
                reached: count >= material.threshold || reachedAt != nil,
                reachedAt: reachedAt
            )
        }
        let top = rungs.last { $0.reached }
        let upcoming = rungs.first { !$0.reached && (top == nil || $0.threshold > (top?.threshold ?? 0)) }
        return BadgeGuide(
            axis: axis,
            family: axis.family,
            count: count,
            rungs: rungs,
            stars: rungs.filter(\.reached).count,
            reached: top.map {
                BadgeReached(threshold: $0.threshold, material: $0.material,
                             reason: count >= $0.threshold ? .thresholdCrossed : .served, reachedAt: $0.reachedAt)
            },
            next: upcoming.map { BadgeNextStar(threshold: $0.threshold, material: $0.material, missing: max(0, $0.threshold - count)) }
        )
    }

    /// Le guide d'un axe de la progression résolue : ses paliers datés sont les traces servies.
    public static func resolve(axis: EngagementAxisKey, value: Int, tiers: [EngagementTier]) -> BadgeGuide {
        resolve(axis: axis, count: value,
                served: tiers.compactMap { tier in tier.reachedAt.map { BadgeServedTier(threshold: tier.threshold, reachedAt: $0) } })
    }

    /// Le guide d'un axe de la progression résolue.
    public static func resolve(_ progress: EngagementAxisProgress) -> BadgeGuide {
        resolve(axis: progress.axis, value: progress.scale.value, tiers: progress.scale.tiers)
    }

    /// Les badges par famille dans l'ordre déclaré, l'ordre du catalogue dans chacune ; une famille vide ne paraît pas.
    public static func byFamily(_ guides: [BadgeGuide]) -> [BadgeGuideFamilyGroup] {
        let order = EngagementAxisKey.allCases
        return EngagementAxisFamily.allCases.compactMap { family in
            let members = guides
                .filter { $0.family == family }
                .sorted { (order.firstIndex(of: $0.axis) ?? 0) < (order.firstIndex(of: $1.axis) ?? 0) }
            return members.isEmpty ? nil : BadgeGuideFamilyGroup(family: family, guides: members)
        }
    }
}
