import Foundation

// MARK: - L'objectif de Flamme (#17379, #20522)
//
// MIROIR de `packages/shared/utils/game/flame-goal.ts`. Au premier jour d'une
// Flamme, le joueur choisit 7, 14 ou 30 jours, ou rien. L'objectif atteint
// déclenche un signe des aïeux et propose la marche suivante de l'échelle (les
// formes de la Flamme au-delà : 100 puis 365 jours). Rater l'objectif ne retire
// rien : la passerelle cesse de le servir.

/// L'objectif que le bloc `flame` sert : ce qui se propose aujourd'hui, et l'objectif en cours ou atteint. Le décodage
/// REFUSE une forme illisible : le bloc le lit en `try?`, si bien qu'un objectif illisible rend la carte d'avant.
public struct GameServedFlameGoal: Codable, Sendable, Equatable {
    public struct Current: Codable, Sendable, Equatable {
        public let target: Int
        public let remaining: Int
        public let reached: Bool
        /// La marche suivante une fois l'objectif atteint ; `nil` après la dernière, ou tant qu'il court.
        public let next: Int?

        public init(target: Int, remaining: Int, reached: Bool, next: Int?) {
            self.target = target
            self.remaining = remaining
            self.reached = reached
            self.next = next
        }

        private enum CodingKeys: String, CodingKey {
            case target, remaining, reached, next
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            target = try container.decode(Int.self, forKey: .target)
            remaining = try container.decode(Int.self, forKey: .remaining)
            reached = try container.decode(Bool.self, forKey: .reached)
            next = try container.decodeIfPresent(Int.self, forKey: .next)
            guard target >= 0, remaining >= 0, (next ?? 0) >= 0 else {
                throw DecodingError.dataCorruptedError(forKey: .target, in: container, debugDescription: "objectif illisible")
            }
        }
    }

    public let offer: [Int]
    public let current: Current?

    public init(offer: [Int], current: Current?) {
        self.offer = offer
        self.current = current
    }

    private enum CodingKeys: String, CodingKey {
        case offer, current
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        offer = try container.decode([Int].self, forKey: .offer)
        current = try container.decodeIfPresent(Current.self, forKey: .current)
        guard offer.allSatisfy({ $0 >= 0 }) else {
            throw DecodingError.dataCorruptedError(forKey: .offer, in: container, debugDescription: "objectif illisible")
        }
    }
}

/// Pourquoi un objectif est refusé — la `reason` que la passerelle pose sur `FLAME_GOAL_NOT_ALLOWED`.
public enum FlameGoalRefusal: String, Sendable, Hashable {
    case noFlame = "no-flame"
    case notOffered = "not-offered"
}

public enum GameFlameGoalLaw {
    public static let firstChoices: [Int] = [7, 14, 30]

    /// Les choix du premier jour, puis les formes de la Flamme au-delà : 7, 14, 30, 100, 365.
    public static let ladder: [Int] = firstChoices
        + FlameFormKey.allCases.map(\.minDays).filter { $0 > (firstChoices.max() ?? 0) }

    /// La marche au-dessus de `target` ; `nil` après la dernière.
    public static func next(after target: Int) -> Int? {
        ladder.first { $0 > max(0, target) }
    }

    /// Ce que le bloc dirait de l'objectif choisi aujourd'hui, Flamme à `streak` jours — la projection de
    /// `servedFlameGoal(chooseFlameGoal(...))` : en cours tant que la Flamme est sous la cible, atteint sinon.
    public static func servedAfterChoosing(target: Int, streak: Int) -> GameServedFlameGoal? {
        let target = max(0, target)
        let streak = max(0, streak)
        guard target > 0, streak > 0 else { return nil }
        guard streak >= target else {
            return GameServedFlameGoal(
                offer: [], current: GameServedFlameGoal.Current(target: target, remaining: target - streak, reached: false, next: nil)
            )
        }
        let next = next(after: target)
        return GameServedFlameGoal(
            offer: next.map { [$0] } ?? [], current: GameServedFlameGoal.Current(target: target, remaining: 0, reached: true, next: next)
        )
    }

    /// La clé de guide qui ferme le signe des aïeux et la marche suivante, une fois par objectif atteint
    /// (`game.guideSeen`). Miroir de `flameGoalNextSeenKey`.
    public static func nextSeenKey(reachedTarget: Int) -> String {
        "flame-goal-next-\(max(0, reachedTarget))"
    }
}

public struct FlameGoalRequest: Encodable, Sendable, Equatable {
    public let requestId: String
    public let target: Int

    public init(requestId: String, target: Int) {
        self.requestId = requestId
        self.target = target
    }
}

public struct FlameGoalResponse: Decodable, Sendable, Equatable {
    /// `chosen` | `already-chosen`.
    public let status: String
    public let goal: GameServedFlameGoal

    public var alreadyDone: Bool { status.hasPrefix("already-") }

    public init(status: String, goal: GameServedFlameGoal) {
        self.status = status
        self.goal = goal
    }
}
