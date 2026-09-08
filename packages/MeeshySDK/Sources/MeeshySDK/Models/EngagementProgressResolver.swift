import Foundation

// MARK: - La progression résolue

/// Un palier d'une échelle (badge, série ou niveau), atteint ou à venir.
/// `reachedAt` est la date du palier GRAVÉ (`EngagementMilestone.reachedAt`),
/// `nil` tant qu'aucune trace n'existe — y compris pour un palier atteint par
/// le seul compteur.
public struct EngagementTier: Sendable, Equatable, Identifiable {
    public let threshold: Int
    public let reached: Bool
    public let reachedAt: String?
    public var id: Int { threshold }

    public init(threshold: Int, reached: Bool, reachedAt: String?) {
        self.threshold = threshold
        self.reached = reached
        self.reachedAt = reachedAt
    }
}

/// Une ÉCHELLE : la valeur courante posée sur ses paliers. `progress` est la
/// fraction parcourue ENTRE le dernier palier franchi et le suivant — ce
/// qu'une barre affiche, jamais la fraction depuis zéro ; `1` quand l'échelle
/// est complète, et `nextThreshold` vaut alors `nil`.
public struct EngagementScaleProgress: Sendable, Equatable {
    public let value: Int
    public let tiers: [EngagementTier]
    public let reachedCount: Int
    public let previousThreshold: Int
    public let nextThreshold: Int?
    public let progress: Double

    public init(value: Int, tiers: [EngagementTier], reachedCount: Int, previousThreshold: Int, nextThreshold: Int?, progress: Double) {
        self.value = value
        self.tiers = tiers
        self.reachedCount = reachedCount
        self.previousThreshold = previousThreshold
        self.nextThreshold = nextThreshold
        self.progress = progress
    }

    /// Ce qu'il reste avant le prochain palier — `nil` quand l'échelle est complète.
    public var remainingToNext: Int? {
        nextThreshold.map { max(0, $0 - value) }
    }
}

public struct EngagementAxisProgress: Sendable, Equatable, Identifiable {
    public let axis: EngagementAxisKey
    public let scale: EngagementScaleProgress
    public var id: String { axis.rawValue }
    public var family: EngagementAxisFamily { axis.family }

    public init(axis: EngagementAxisKey, scale: EngagementScaleProgress) {
        self.axis = axis
        self.scale = scale
    }
}

public struct EngagementLevelProgress: Sendable, Equatable {
    public let scale: EngagementScaleProgress
    /// Le niveau COURANT — 0 avant le premier palier, le nombre de paliers au sommet.
    public var level: Int { scale.reachedCount }

    public init(scale: EngagementScaleProgress) {
        self.scale = scale
    }
}

public struct EngagementStreakProgress: Sendable, Equatable {
    public let scale: EngagementScaleProgress
    /// La série QUI COURT — c'est elle qui avance vers le prochain jalon.
    public let currentDays: Int
    /// Le record — c'est LUI qui tient un jalon pour atteint, une série rompue ne le reprend pas.
    public let longestDays: Int

    public init(scale: EngagementScaleProgress, currentDays: Int, longestDays: Int) {
        self.scale = scale
        self.currentDays = currentDays
        self.longestDays = longestDays
    }
}

public struct EngagementAchievementProgress: Sendable, Equatable, Identifiable {
    public let key: EngagementAchievementKey
    public let unlocked: Bool
    public let reachedAt: String?
    public var id: String { key.rawValue }

    public init(key: EngagementAchievementKey, unlocked: Bool, reachedAt: String?) {
        self.key = key
        self.unlocked = unlocked
        self.reachedAt = reachedAt
    }
}

public struct EngagementFamilyGroup: Sendable, Equatable, Identifiable {
    public let family: EngagementAxisFamily
    public let axes: [EngagementAxisProgress]
    public var id: String { family.rawValue }

    public init(family: EngagementAxisFamily, axes: [EngagementAxisProgress]) {
        self.family = family
        self.axes = axes
    }
}

public struct EngagementProgress: Sendable, Equatable {
    public let level: EngagementLevelProgress
    public let streak: EngagementStreakProgress
    /// Dans l'ordre du catalogue — `axesByFamily` les range par section.
    public let axes: [EngagementAxisProgress]
    public let achievements: [EngagementAchievementProgress]
    /// Badges obtenus, tous axes confondus (un badge = un couple axe × palier).
    public let badgesEarned: Int
    public let badgesTotal: Int
    /// Aucune activité comptée, aucun palier gravé — l'ÉTAT VIDE de l'écran.
    public let isEmpty: Bool

    public init(
        level: EngagementLevelProgress,
        streak: EngagementStreakProgress,
        axes: [EngagementAxisProgress],
        achievements: [EngagementAchievementProgress],
        badgesEarned: Int,
        badgesTotal: Int,
        isEmpty: Bool
    ) {
        self.level = level
        self.streak = streak
        self.axes = axes
        self.achievements = achievements
        self.badgesEarned = badgesEarned
        self.badgesTotal = badgesTotal
        self.isEmpty = isEmpty
    }

    /// Les axes rangés par SECTION, dans l'ordre du modèle § 2 ; l'ordre du catalogue est conservé dans chaque section.
    public var axesByFamily: [EngagementFamilyGroup] {
        EngagementAxisFamily.allCases
            .map { family in EngagementFamilyGroup(family: family, axes: axes.filter { $0.family == family }) }
            .filter { !$0.axes.isEmpty }
    }

    public var unlockedAchievementCount: Int {
        achievements.filter(\.unlocked).count
    }
}

// MARK: - Le résolveur

/// LA LOI DE PROGRESSION — miroir Swift de `resolveEngagementProgress`
/// (`packages/shared/utils/engagement-progress.ts`), rejouée sur le MÊME
/// fichier de vecteurs (`packages/shared/fixtures/reading-modes/engagement-progress.vectors.json`,
/// `EngagementProgressVectorTests`) : les deux clients tirent la même
/// progression de la même charge, ou le témoin rougit.
///
/// DEUX SOURCES, DEUX QUESTIONS — jamais confondues :
///  - le COMPTEUR (`count`, `engagementScore`, `longestStreakDays`) dit CE QUI
///    A ÉTÉ FAIT : un palier est atteint dès que la valeur le dépasse ;
///  - le PALIER GRAVÉ (`milestones`) dit QUAND il a été SERVI : il fournit la
///    date, et suffit seul à tenir un palier pour atteint — un palier servi ne
///    se reprend jamais (anti-rejeu, modèle § 4), même si le compteur est
///    recalculé plus bas.
/// Un `axisKey` inconnu, une clé de palier hors catalogue : ignorés, jamais une
/// erreur. Une valeur négative vaut 0.
///
/// Rule engine STATELESS, sans singleton ni décision produit — SDK
/// (`packages/MeeshySDK/CLAUDE.md`, tableau de placement).
public enum EngagementProgressResolver {
    public static func resolve(_ payload: APIEngagementProgress) -> EngagementProgress {
        let served = indexServed(payload)
        let counts = indexCounts(payload)

        let axes = EngagementAxisKey.allCases.map { axis -> EngagementAxisProgress in
            let count = counts[axis] ?? 0
            let scale = resolveScale(
                value: count,
                reachedValue: count,
                thresholds: EngagementCatalog.badgeThresholds
            ) { threshold in
                served[servedKey(.badge, EngagementCatalog.badgeMilestoneKey(axis, threshold: threshold))]
            }
            return EngagementAxisProgress(axis: axis, scale: scale)
        }

        let score = safeCount(payload.level.engagementScore)
        let levelScale = resolveScale(
            value: score,
            reachedValue: score,
            thresholds: EngagementCatalog.levelThresholds
        ) { threshold in
            served[servedKey(.level, EngagementCatalog.levelMilestoneKey(threshold: threshold))]
        }

        let currentDays = safeCount(payload.streak.currentStreakDays)
        let longestDays = max(safeCount(payload.streak.longestStreakDays), currentDays)
        let streakScale = resolveScale(
            value: currentDays,
            reachedValue: longestDays,
            thresholds: EngagementCatalog.streakThresholds
        ) { threshold in
            served[servedKey(.streak, EngagementCatalog.streakMilestoneKey(threshold: threshold))]
        }

        let achievements = EngagementAchievementKey.allCases.map { key -> EngagementAchievementProgress in
            let reachedAt = served[servedKey(.achievement, key.rawValue)]
            return EngagementAchievementProgress(key: key, unlocked: reachedAt != nil, reachedAt: reachedAt)
        }

        let badgesEarned = axes.reduce(0) { $0 + $1.scale.reachedCount }
        let hasActivity = axes.contains { $0.scale.value > 0 }
            || score > 0
            || longestDays > 0
            || badgesEarned > 0
            || levelScale.reachedCount > 0
            || streakScale.reachedCount > 0
            || achievements.contains(where: \.unlocked)

        return EngagementProgress(
            level: EngagementLevelProgress(scale: levelScale),
            streak: EngagementStreakProgress(scale: streakScale, currentDays: currentDays, longestDays: longestDays),
            axes: axes,
            achievements: achievements,
            badgesEarned: badgesEarned,
            badgesTotal: EngagementAxisKey.allCases.count * EngagementCatalog.badgeThresholds.count,
            isEmpty: !hasActivity
        )
    }

    /// La `Date` d'un palier gravé — ISO 8601 avec ou sans fraction de seconde,
    /// les deux formes que la passerelle a servies au fil du temps ; `nil` pour
    /// une chaîne absente ou illisible, jamais une date inventée.
    public static func reachedDate(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        return isoFractional.date(from: iso) ?? isoPlain.date(from: iso)
    }

    // `nonisolated(unsafe)` : ISO8601DateFormatter est thread-safe (même motif
    // que `NotificationModels.swift`).
    nonisolated(unsafe) private static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    nonisolated(unsafe) private static let isoPlain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    // MARK: - Détail

    private static func safeCount(_ value: Int) -> Int {
        max(0, value)
    }

    private static func servedKey(_ type: EngagementMilestoneType, _ key: String) -> String {
        "\(type.rawValue)|\(key)"
    }

    /// `reachedAt` du premier palier gravé par (nature, clé) — la contrainte unique du modèle en garantit un seul.
    private static func indexServed(_ payload: APIEngagementProgress) -> [String: String] {
        payload.milestones.reduce(into: [String: String]()) { index, milestone in
            let key = servedKey(milestone.milestoneType, milestone.milestoneKey)
            if index[key] == nil { index[key] = milestone.reachedAt }
        }
    }

    /// La valeur RETENUE par axe — la plus haute si la charge en portait deux (elle n'en porte qu'une).
    private static func indexCounts(_ payload: APIEngagementProgress) -> [EngagementAxisKey: Int] {
        payload.counters.reduce(into: [EngagementAxisKey: Int]()) { index, counter in
            guard let axis = EngagementAxisKey(rawValue: counter.axisKey) else { return }
            index[axis] = max(index[axis] ?? 0, safeCount(counter.count))
        }
    }

    private static func resolveScale(
        value: Int,
        reachedValue: Int,
        thresholds: [Int],
        reachedAtOf: (Int) -> String?
    ) -> EngagementScaleProgress {
        let tiers = thresholds.map { threshold -> EngagementTier in
            let reachedAt = reachedAtOf(threshold)
            return EngagementTier(threshold: threshold, reached: reachedValue >= threshold || reachedAt != nil, reachedAt: reachedAt)
        }
        let previousThreshold = thresholds.last(where: { $0 <= value }) ?? 0
        let nextThreshold = thresholds.first(where: { $0 > value })
        let progress: Double
        if let nextThreshold {
            progress = min(1, max(0, Double(value - previousThreshold) / Double(nextThreshold - previousThreshold)))
        } else {
            progress = 1
        }
        return EngagementScaleProgress(
            value: value,
            tiers: tiers,
            reachedCount: tiers.filter(\.reached).count,
            previousThreshold: previousThreshold,
            nextThreshold: nextThreshold,
            progress: progress
        )
    }
}
