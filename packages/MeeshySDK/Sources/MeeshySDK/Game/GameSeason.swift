import Foundation

// MARK: - Les saisons (#9386)
//
// MIROIR de `packages/shared/utils/game/season.ts` — huit semaines, un thème,
// quarante étapes gratuites.
//
// Le calendrier est DONNÉ, pas lu sur une horloge : la saison 1 ouvre le lundi
// 2026-10-12, les saisons s'enchaînent sans trou de 56 jours. Les semaines de
// saison sont celles des ligues (lundi local, fermeture dimanche 20 h).
//
// Les ÉTOILES se gagnent par missions (1 facile ou moyenne, 2 difficile, 3 d'Or,
// 5 pour le duo) ; quatre étoiles font une étape. Le parcours gratuit compte 40
// étapes — ses récompenses ne comportent JAMAIS de Meesh. La rangée SCEAU (10
// Meeshes) ajoute un cosmétique toutes les quatre étapes, sans avantage de jeu.

public struct SeasonCalendar: Sendable, Equatable {
    public let number: Int
    public let startDay: String
    /// Le dernier dimanche de la saison.
    public let endDay: String
    public let weekKeys: [String]
    public let themeKey: String

    public init(number: Int, startDay: String, endDay: String, weekKeys: [String], themeKey: String) {
        self.number = number
        self.startDay = startDay
        self.endDay = endDay
        self.weekKeys = weekKeys
        self.themeKey = themeKey
    }
}

public enum SeasonStarSource: String, Sendable, Hashable {
    case easy
    case medium
    case hard
    case gold
    case duo
}

public struct SeasonProgress: Sendable, Equatable {
    public let stars: Int
    /// De 0 à 40.
    public let steps: Int
    public let starsToNext: Int
    /// Fraction de l'étape en cours ; `1` une fois le parcours terminé.
    public let progress: Double
    public let completed: Bool

    public init(stars: Int, steps: Int, starsToNext: Int, progress: Double, completed: Bool) {
        self.stars = stars
        self.steps = steps
        self.starsToNext = starsToNext
        self.progress = progress
        self.completed = completed
    }
}

public enum SeasonRewardKind: String, Codable, Sendable, Hashable {
    case points
    case fragment
    case freeze
    case seasonCup = "season-cup"
}

public struct SeasonReward: Sendable, Equatable {
    public let kind: SeasonRewardKind
    public let amount: Int

    public init(kind: SeasonRewardKind, amount: Int) {
        self.kind = kind
        self.amount = amount
    }
}

public struct SeasonSeal: Sendable, Equatable {
    public let cosmeticKey: String

    public init(cosmeticKey: String) {
        self.cosmeticKey = cosmeticKey
    }
}

public enum SeasonSealRefusal: String, Sendable, Hashable {
    case alreadyOwned = "already-owned"
    case insufficientBalance = "insufficient-balance"
}

public enum SeasonClaimRefusal: String, Sendable, Hashable {
    case outOfRange = "out-of-range"
    case locked
    case alreadyClaimed = "already-claimed"
}

public enum SeasonClaim: Sendable, Equatable {
    case allowed(reward: SeasonReward, seal: SeasonSeal?)
    case refused(SeasonClaimRefusal)
}

public struct SeasonSettlement: Sendable, Equatable {
    public let completed: Bool
    /// +500 au parcours terminé.
    public let glory: Int
    public let cup: Bool
    /// Le badge daté : `season.<n>`, `nil` sans parcours terminé.
    public let badgeKey: String?

    public init(completed: Bool, glory: Int, cup: Bool, badgeKey: String?) {
        self.completed = completed
        self.glory = glory
        self.cup = cup
        self.badgeKey = badgeKey
    }
}

public enum GameSeason {
    public static let oneStart = "2026-10-12"
    public static let weeks = 8
    public static let days = weeks * 7
    public static let steps = 40
    public static let starsPerStep = 4
    /// En Meeshes.
    public static let sealPrice = 10
    /// Un cosmétique de la rangée Sceau toutes les quatre étapes.
    public static let sealEvery = 4
    /// Les points d'une étape ordinaire.
    public static let stepPoints = 100

    /// Les clés de thème, en boucle : une langue du modèle de traduction à chaque saison.
    public static let themeKeys = [
        "language:fr", "language:es", "language:ar", "language:sw",
        "language:ja", "language:pt", "language:hi", "language:zh",
    ]

    public static func calendar(number: Int) -> SeasonCalendar? {
        guard number >= 1, let startDay = GameDay.add((number - 1) * days, to: oneStart),
              let endDay = GameDay.add(days - 1, to: startDay) else { return nil }
        let weekKeys = (0..<weeks).compactMap { GameDay.add($0 * 7, to: startDay) }
        return SeasonCalendar(number: number, startDay: startDay, endDay: endDay, weekKeys: weekKeys,
                              themeKey: themeKeys[(number - 1) % themeKeys.count])
    }

    /// Le numéro de la saison qui contient ce jour, `nil` avant la première.
    public static func season(at dayKey: String) -> Int? {
        guard let elapsed = GameDay.diff(from: oneStart, to: dayKey), elapsed >= 0 else { return nil }
        return elapsed / days + 1
    }

    /// La semaine de saison de 1 à 8, `nil` avant la première saison.
    public static func week(at dayKey: String) -> Int? {
        guard let elapsed = GameDay.diff(from: oneStart, to: dayKey), elapsed >= 0 else { return nil }
        return (elapsed % days) / 7 + 1
    }

    /// La saison d'un moment, la fermeture du dimanche 20 h comprise.
    public static func season(of moment: LeagueMoment) -> Int? {
        season(at: GameLeague.weekOfMoment(moment))
    }

    public static func isOpen(season: Int, at dayKey: String) -> Bool {
        self.season(at: dayKey) == season
    }

    public static func stars(for source: SeasonStarSource) -> Int {
        switch source {
        case .easy, .medium: 1
        case .hard: 2
        case .gold: 3
        case .duo: 5
        }
    }

    public static func progress(stars rawStars: Int) -> SeasonProgress {
        let stars = max(0, rawStars)
        let reached = min(steps, stars / starsPerStep)
        let completed = reached >= steps
        let inStep = stars % starsPerStep
        return SeasonProgress(
            stars: stars,
            steps: reached,
            starsToNext: completed ? 0 : starsPerStep - inStep,
            progress: completed ? 1 : Double(inStep) / Double(starsPerStep),
            completed: completed
        )
    }

    /// La récompense GRATUITE d'une étape : des points ; un fragment de cosmétique
    /// toutes les cinq étapes, un gel de Flamme toutes les dix, la coupe à la 40e.
    public static func stepReward(_ step: Int) -> SeasonReward? {
        guard (1...steps).contains(step) else { return nil }
        if step == steps { return SeasonReward(kind: .seasonCup, amount: 1) }
        if step % 10 == 0 { return SeasonReward(kind: .freeze, amount: 1) }
        if step % 5 == 0 { return SeasonReward(kind: .fragment, amount: 1) }
        return SeasonReward(kind: .points, amount: stepPoints)
    }

    /// Le cosmétique de la rangée Sceau à cette étape, `nil` hors des étapes marquées.
    public static func sealReward(season: Int, step: Int) -> SeasonSeal? {
        guard (1...steps).contains(step), step % sealEvery == 0 else { return nil }
        return SeasonSeal(cosmeticKey: "season-\(season).seal-\(step / sealEvery)")
    }

    /// `nil` quand l'achat est permis, sinon le refus.
    public static func sealRefusal(balance: Int, owned: Bool) -> SeasonSealRefusal? {
        if owned { return .alreadyOwned }
        return balance >= sealPrice ? nil : .insufficientBalance
    }

    public static func claim(season: Int, step: Int, stepsReached: Int, claimed: [Int], sealOwned: Bool) -> SeasonClaim {
        guard let reward = stepReward(step) else { return .refused(.outOfRange) }
        if claimed.contains(step) { return .refused(.alreadyClaimed) }
        if step > stepsReached { return .refused(.locked) }
        return .allowed(reward: reward, seal: sealOwned ? sealReward(season: season, step: step) : nil)
    }

    public static func settlement(season: Int, stepsReached: Int) -> SeasonSettlement {
        stepsReached >= steps
            ? SeasonSettlement(completed: true, glory: GameGlory.points.season, cup: true, badgeKey: "season.\(season)")
            : SeasonSettlement(completed: false, glory: 0, cup: false, badgeKey: nil)
    }
}
