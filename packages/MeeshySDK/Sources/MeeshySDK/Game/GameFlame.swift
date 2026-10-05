import Foundation

// MARK: - La Flamme (#9373)
//
// MIROIR de `packages/shared/utils/game/flame.ts`. La série de jours existante
// prend cinq formes, un bonus sur les missions, des gels qui protègent un jour
// manqué, un rallumage dans les 48 h.
//
// Les jours sont des clés `AAAA-MM-JJ` dans le fuseau de l'utilisateur : la
// transition est pure, sans horloge. La fenêtre de rallumage de 48 h se lit en
// jours calendaires — la Flamme s'éteint au début du deuxième jour sans geste,
// et on peut la rallumer ce jour-là et le suivant.

public enum FlameFormKey: String, CaseIterable, Codable, Sendable, Hashable {
    case braise
    case flamme
    case brasier
    case astre
    case soleil

    public var minDays: Int {
        switch self {
        case .braise: 1
        case .flamme: 7
        case .brasier: 30
        case .astre: 100
        case .soleil: 365
        }
    }
}

public enum FlameOutcome: String, Codable, Sendable, Hashable {
    case started
    case sameDay = "same-day"
    case continued
    case protected
    case broken
}

public struct FlameTransition: Sendable, Equatable {
    public let outcome: FlameOutcome
    public let streak: Int
    public let freezes: Int
    public let freezesUsed: Int
    public let missedDays: Int
    /// La série perdue quand la Flamme s'éteint, `0` sinon — c'est elle qu'un rallumage rend.
    public let lostStreak: Int

    public init(outcome: FlameOutcome, streak: Int, freezes: Int, freezesUsed: Int, missedDays: Int, lostStreak: Int) {
        self.outcome = outcome
        self.streak = streak
        self.freezes = freezes
        self.freezesUsed = freezesUsed
        self.missedDays = missedDays
        self.lostStreak = lostStreak
    }
}

public enum FlameStatus: String, Codable, Sendable, Hashable {
    case none
    case lit
    case atRisk = "at-risk"
    case covered
    case out
}

/// Pourquoi on ne peut pas acheter un gel.
public enum FreezeRefusal: String, Sendable, Hashable {
    case atMaximum = "at-maximum"
    case insufficientBalance = "insufficient-balance"
}

/// Pourquoi on ne peut pas rallumer.
public enum RelightRefusal: String, Sendable, Hashable {
    case noStreak = "no-streak"
    case notExtinguished = "not-extinguished"
    case windowClosed = "window-closed"
    case monthlyLimit = "monthly-limit"
    case insufficientBalance = "insufficient-balance"
}

/// `refusal == nil` ⇔ autorisé.
public struct RelightDecision: Sendable, Equatable {
    public let refusal: RelightRefusal?
    public let price: Int

    public var allowed: Bool { refusal == nil }

    public init(refusal: RelightRefusal?, price: Int) {
        self.refusal = refusal
        self.price = price
    }
}

public enum GameFlame {
    public static let freezeMax = 2
    /// En Meeshes.
    public static let freezePrice = 1
    public static let relightPrice = 3
    /// Jours calendaires de fenêtre après l'extinction (48 h).
    public static let relightWindowDays = 2
    /// Bonus de Flamme : 2 % par jour de série, plafond 50 %.
    public static let bonusPercentPerDay = 2
    public static let bonusPercentMax = 50

    /// `nil` sans série.
    public static func form(forDays days: Int) -> FlameFormKey? {
        FlameFormKey.allCases.last { max(0, days) >= $0.minDays }
    }

    /// Le bonus en pour cent entier — la forme exacte que les récompenses emploient.
    public static func bonusPercent(forDays days: Int) -> Int {
        min(bonusPercentMax, bonusPercentPerDay * max(0, days))
    }

    /// min(0,5 ; 0,02 × jours).
    public static func bonus(forDays days: Int) -> Double {
        Double(bonusPercent(forDays: days)) / 100
    }

    /// `nil` quand l'achat est permis, sinon la raison du refus.
    public static func freezeRefusal(freezes: Int, balance: Int) -> FreezeRefusal? {
        if max(0, freezes) >= freezeMax { return .atMaximum }
        if max(0, balance) < freezePrice { return .insufficientBalance }
        return nil
    }

    /// Le jour où l'utilisateur AGIT : que devient la série ?
    ///
    /// Un gel couvre un jour manqué, et il est consommé AUTOMATIQUEMENT — mais
    /// seulement si les gels couvrent TOUS les jours manqués. Partiellement
    /// couverte, la Flamme s'éteint quand même : dépenser des gels pour rien
    /// serait une perte sèche. La série part alors à 1 (aujourd'hui).
    public static func advance(lastActiveDay: String?, today: String, streak rawStreak: Int, freezes rawFreezes: Int) -> FlameTransition {
        let streak = max(0, rawStreak)
        let freezes = max(0, rawFreezes)
        guard let lastActiveDay else {
            return FlameTransition(outcome: .started, streak: 1, freezes: freezes, freezesUsed: 0, missedDays: 0, lostStreak: 0)
        }
        let gap = GameDay.diff(from: lastActiveDay, to: today) ?? 0
        if gap <= 0 {
            return FlameTransition(outcome: .sameDay, streak: streak, freezes: freezes, freezesUsed: 0, missedDays: 0, lostStreak: 0)
        }
        if gap == 1 {
            return FlameTransition(outcome: .continued, streak: streak + 1, freezes: freezes, freezesUsed: 0, missedDays: 0, lostStreak: 0)
        }
        let missedDays = gap - 1
        if missedDays <= freezes {
            return FlameTransition(outcome: .protected, streak: streak + 1, freezes: freezes - missedDays,
                                   freezesUsed: missedDays, missedDays: missedDays, lostStreak: 0)
        }
        return FlameTransition(outcome: .broken, streak: 1, freezes: freezes, freezesUsed: 0,
                               missedDays: missedDays, lostStreak: streak)
    }

    /// L'état de la Flamme à l'ouverture, avant tout geste du jour.
    public static func status(lastActiveDay: String?, today: String, streak: Int, freezes: Int) -> FlameStatus {
        guard let lastActiveDay, max(0, streak) > 0 else { return .none }
        let gap = GameDay.diff(from: lastActiveDay, to: today) ?? 0
        if gap <= 0 { return .lit }
        if gap == 1 { return .atRisk }
        return gap - 1 <= max(0, freezes) ? .covered : .out
    }

    /// 3 Meeshes, dans les 48 h qui suivent l'extinction, une fois par mois.
    ///
    /// `lastActiveDay` est le dernier jour actif d'AVANT la rupture.
    public static func relightDecision(lastActiveDay: String?, today: String, streakBeforeBreak: Int,
                                       lastRelightDay: String?, balance: Int) -> RelightDecision {
        func refuse(_ reason: RelightRefusal) -> RelightDecision {
            RelightDecision(refusal: reason, price: relightPrice)
        }
        guard let lastActiveDay, max(0, streakBeforeBreak) > 0 else { return refuse(.noStreak) }
        let gap = GameDay.diff(from: lastActiveDay, to: today) ?? 0
        if gap <= 1 { return refuse(.notExtinguished) }
        if gap > 1 + relightWindowDays { return refuse(.windowClosed) }
        if let lastRelightDay, GameDay.month(of: lastRelightDay) == GameDay.month(of: today) {
            return refuse(.monthlyLimit)
        }
        if max(0, balance) < relightPrice { return refuse(.insufficientBalance) }
        return RelightDecision(refusal: nil, price: relightPrice)
    }

    /// La série d'avant la rupture, à poursuivre par le geste du jour. Si le
    /// joueur a déjà agi aujourd'hui (sa série repartie à 1), le serveur rejoue
    /// `advance` sur ce résultat pour que le geste du jour s'y ajoute.
    public static func relight(today: String, streakBeforeBreak: Int) -> (streak: Int, lastActiveDay: String?) {
        (max(0, streakBeforeBreak), GameDay.add(-1, to: today))
    }
}
