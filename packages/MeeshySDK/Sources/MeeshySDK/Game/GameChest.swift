import Foundation

// MARK: - Le coffre du jour (#9373, #10011)
//
// MIROIR de `packages/shared/utils/game/chest.ts` — déterministe par utilisateur, par jour, par EFFORT des
// missions du jour et par le cours de la Meesh du compte. Des points (500 à 10 000 selon l'effort), de la Gloire
// (un point pour dix de ces points), une PRIME en points au cours de la prochaine Meesh (1 chance sur 20 le prix
// entier, sinon 1 sur 6 son cinquième arrondi), UN fragment d'étoile une fois sur six (un objet de collection,
// `GameStarFragments`) et un gel de Flamme une fois sur vingt. Gratuit ; contenu certain, primes possibles et
// probabilités affichés AVANT l'ouverture ; rien ne se transfère ni ne se convertit, et aucune Meesh ne sort
// d'un coffre : une Meesh se frappe toujours en débitant des points (`GameMint`).
//
// Les tirages, dans l'ordre : la valeur d'avant #10011 (consommée, ignorée), le fragment d'étoile, le gel, la
// prime entière, la prime d'un cinquième — les cinq toujours consommés.
//
// L'EFFORT se calcule sur le catalogue, côté passerelle (`dayEffort`) : le client lit le contenu du jour servi
// (`GameBlock.Chest.today`) et ne rejoue que la loi qui part de l'effort.

/// Ce que le coffre peut contenir — affiché avant l'ouverture. Les bornes de Gloire et la prime manquent devant
/// un serveur d'avant #10011.
public struct ChestOdds: Codable, Sendable, Equatable {
    public let minPoints: Int
    public let maxPoints: Int
    /// La chance d'UN fragment d'étoile.
    public let fragment: Double
    public let freeze: Double
    public let minGlory: Int?
    public let maxGlory: Int?
    /// La chance de la prime entière, puis — quand elle n'est pas tombée — celle d'un cinquième.
    public let bonusWhole: Double?
    public let bonusFifth: Double?

    public init(minPoints: Int, maxPoints: Int, fragment: Double, freeze: Double,
                minGlory: Int? = nil, maxGlory: Int? = nil, bonusWhole: Double? = nil, bonusFifth: Double? = nil) {
        self.minPoints = minPoints
        self.maxPoints = maxPoints
        self.fragment = fragment
        self.freeze = freeze
        self.minGlory = minGlory
        self.maxGlory = maxGlory
        self.bonusWhole = bonusWhole
        self.bonusFifth = bonusFifth
    }
}

/// La prime tirée au coffre.
/// `noBonus` (valeur `"none"` sur le fil) plutôt que `none` : un `bonus == .none` ne se confond jamais avec
/// `Optional.none`.
public enum ChestBonus: String, Codable, Sendable, Equatable {
    case noBonus = "none"
    case fifth, whole
}

/// Le contenu du coffre ouvert. `points` est le TOTAL crédité, prime comprise. `glory` vaut 0 et la prime est
/// absente devant un coffre ouvert avant #10011 (ou un serveur antérieur) : un ancien coffre se lit encore.
public struct DailyChest: Codable, Sendable, Equatable {
    public let points: Int
    /// UN fragment d'étoile trouvé.
    public let fragment: Bool
    public let freeze: Bool
    public let glory: Int
    /// La prime tombée — `nil` devant un coffre ou un serveur d'avant elle.
    public let bonus: ChestBonus?
    /// Son montant en points, déjà compris dans `points`.
    public let bonusPoints: Int

    public init(points: Int, fragment: Bool, freeze: Bool, glory: Int = 0, bonus: ChestBonus? = nil, bonusPoints: Int = 0) {
        self.points = points
        self.fragment = fragment
        self.freeze = freeze
        self.glory = glory
        self.bonus = bonus
        self.bonusPoints = bonusPoints
    }

    private enum CodingKeys: String, CodingKey {
        case points, fragment, freeze, glory, bonus, bonusPoints
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        points = try container.decode(Int.self, forKey: .points)
        fragment = try container.decode(Bool.self, forKey: .fragment)
        freeze = try container.decode(Bool.self, forKey: .freeze)
        glory = (try? container.decodeIfPresent(Int.self, forKey: .glory)) ?? 0
        bonus = (try? container.decodeIfPresent(ChestBonus.self, forKey: .bonus)) ?? nil
        bonusPoints = (try? container.decodeIfPresent(Int.self, forKey: .bonusPoints)) ?? 0
    }
}

/// Le contenu CERTAIN du coffre du jour et ses deux primes possibles, en points, servis avant l'ouverture.
public struct ChestContent: Codable, Sendable, Equatable {
    public let points: Int
    public let glory: Int
    /// La prime entière possible : le prix de la prochaine Meesh du compte. `nil` devant un serveur antérieur.
    public let bonusWhole: Int?
    /// La prime d'un cinquième possible.
    public let bonusFifth: Int?

    public init(points: Int, glory: Int, bonusWhole: Int? = nil, bonusFifth: Int? = nil) {
        self.points = points
        self.glory = glory
        self.bonusWhole = bonusWhole
        self.bonusFifth = bonusFifth
    }
}

public enum GameChest {
    public static let pointsMin = 500
    public static let pointsMax = 10_000
    public static let effortFloor = 300
    public static let effortCeiling = 4500
    /// Un point de Gloire pour dix points — miroir de `gloryForChest` (`glory.ts`).
    public static let gloryDivisor = 10
    /// La prime d'un cinquième : le prix de la prochaine Meesh divisé par cinq, arrondi.
    public static let bonusFifthDivisor = 5

    public static let odds = ChestOdds(
        minPoints: pointsMin, maxPoints: pointsMax, fragment: 1.0 / 6.0, freeze: 1.0 / 20.0,
        minGlory: pointsMin / gloryDivisor, maxGlory: pointsMax / gloryDivisor,
        bonusWhole: 1.0 / 20.0, bonusFifth: 1.0 / 6.0
    )

    /// Les points pour cet effort : une droite de 500 (300 d'effort) à 10 000 (4 500), arrondie au plus proche.
    public static func points(forEffort effort: Int) -> Int {
        let bounded = min(effortCeiling, max(effortFloor, effort))
        let span = effortCeiling - effortFloor
        let gain = pointsMax - pointsMin
        return pointsMin + (gain * (bounded - effortFloor) * 2 + span) / (2 * span)
    }

    public static func glory(forPoints points: Int) -> Int {
        max(0, points) / gloryDivisor
    }

    /// Les deux primes possibles au cours de la Meesh du compte : le prix entier, et son cinquième arrondi.
    public static func bonusAmounts(nextMeeshPrice: Int) -> (whole: Int, fifth: Int) {
        let whole = max(0, nextMeeshPrice)
        return (whole, (whole * 2 + bonusFifthDivisor) / (2 * bonusFifthDivisor))
    }

    public static func content(forEffort effort: Int, nextMeeshPrice: Int) -> ChestContent {
        let earned = points(forEffort: effort)
        let bonus = bonusAmounts(nextMeeshPrice: nextMeeshPrice)
        return ChestContent(points: earned, glory: glory(forPoints: earned), bonusWhole: bonus.whole, bonusFifth: bonus.fifth)
    }

    public static func daily(userId: String, dayKey: String, effort: Int, nextMeeshPrice: Int) -> DailyChest {
        var rng = GameRandom(parts: GameSeedParts(userId: userId, dayKey: dayKey, salt: "chest"))
        _ = rng.next()
        let fragment = rng.next() < odds.fragment
        let freeze = rng.next() < odds.freeze
        let wholeDraw = rng.next() < (odds.bonusWhole ?? 0)
        let fifthDraw = rng.next() < (odds.bonusFifth ?? 0)
        let certain = content(forEffort: effort, nextMeeshPrice: nextMeeshPrice)
        let bonus: ChestBonus = wholeDraw ? .whole : fifthDraw ? .fifth : .noBonus
        let bonusPoints: Int
        switch bonus {
        case .whole: bonusPoints = certain.bonusWhole ?? 0
        case .fifth: bonusPoints = certain.bonusFifth ?? 0
        case .noBonus: bonusPoints = 0
        }
        return DailyChest(
            points: certain.points + bonusPoints, fragment: fragment, freeze: freeze,
            glory: certain.glory, bonus: bonus, bonusPoints: bonusPoints
        )
    }
}

// MARK: - Les fragments d'étoile (#10011)
//
// MIROIR de `packages/shared/utils/game/star-fragments.ts`. Le seul fragment du Jeu : un objet de COLLECTION,
// trouvé un à la fois (coffre 1/6, étapes de saison 5, 15, 25, 35). Le serveur tient le total ; le client le lit
// (`GameBlock.starFragments`) et ne l'écrit jamais. Il ne se convertit en rien et ne paie aucune frappe.

/// Le total de fragments d'étoile collectés, servi par la passerelle.
public struct StarFragmentsTotal: Codable, Sendable, Equatable {
    public let collected: Int

    public init(collected: Int) {
        self.collected = collected
    }
}

public enum GameStarFragments {
    /// Les étapes réclamées d'UNE saison qui donnent un fragment d'étoile — une étape rejouée ne compte qu'une fois.
    public static func season(claimedSteps: [Int]) -> Int {
        Set(claimedSteps.filter { GameSeason.stepReward($0)?.kind == .fragment }).count
    }

    /// Le total collecté, toutes sources confondues.
    public static func collected(chestDays: Int, seasons: [[Int]]) -> Int {
        max(0, chestDays) + seasons.reduce(0) { $0 + season(claimedSteps: $1) }
    }
}
