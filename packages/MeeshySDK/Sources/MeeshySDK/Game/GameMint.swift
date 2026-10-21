import Foundation

// MARK: - La rareté croissante des Meeshes (#9373)
//
// MIROIR de `packages/shared/utils/game/mint.ts` — le prix monte avec le nombre
// de Meeshes déjà frappées :
//
//     prix(n) = round(1221 × 1,3 ^ ⌊(n − 1) ÷ 10⌋), plafonné à 16 556
//
// +30 % toutes les dix frappes (#10011) : le plafond tombe à la 101e. 1 221
// reste la BASE (le prix des dix premières) et celui que les anciens clients
// croient encore : le serveur recalcule et refuse SANS débit.
//
// Une Meesh ne se frappe QU'EN DÉBITANT des points, au prix de son rang : aucun
// autre chemin n'existe — ni fragment, ni frappe gratuite (porteur, 2026-10-10).

/// Argent ; or à chaque centième ; prisme à chaque millième. Aucun avantage de jeu.
public enum MeeshEdition: String, CaseIterable, Codable, Sendable, Hashable {
    case silver
    case gold
    case prism
}

/// Ce que la frappe coûterait et rapporterait, avant confirmation.
///
/// Même forme que le bloc `mint` de `GET /me/engagement` : le serveur le
/// calcule, le client peut le rejouer hors ligne et obtient le même résultat.
public struct GameMintPreview: Codable, Sendable, Equatable {
    /// Le numéro que porterait la pièce.
    public let number: Int
    public let price: Int
    public let edition: MeeshEdition
    public let canMint: Bool
    public let missingPoints: Int
    public let levelBefore: Int
    /// Égal à `levelBefore` quand la frappe n'est pas possible. Peut MONTER : la frappe fait une étape (#9706).
    public let levelAfter: Int
    /// Jamais négatif : une frappe qui fait monter ne perd rien.
    public let levelsLost: Int
    /// `0` quand la frappe n'est pas possible.
    public let gloryGained: Int
    /// Les niveaux ouverts par le rang (#9688) — `nil` devant un serveur antérieur ; les trois champs
    /// voisins gardent l'ancienne loi (bornés à 100) sur le fil.
    public let ladder: GameMintLadder?
    /// LE COÛT SELON LE NIVEAU ACTUEL (#10847) — `nil` devant un serveur antérieur. `price` est le coût EFFECTIF :
    /// `basePrice` (le prix de rang de la pièce) × `costFactor` (0,5 au niveau 0, 1 dès le niveau 100).
    public let basePrice: Int?
    public let costFactor: Double?
    /// Le niveau ACTUEL dont le facteur est lu.
    public let costLevel: Int?
    /// La réserve du trésor que le rang n'ouvre pas et qui barre cette pièce (#10848) — `nil` : libre.
    public let locked: GameMintLock?
    /// La dette d'étincelles qui bloque la frappe — `nil` ou `0` : aucune (contrat en cours côté passerelle).
    public let sparksDebt: Int?
    /// Ce qui bloque la frappe hors prix et rang : `.debt` tant qu'une dette d'étincelles existe (409 `MINT_BLOCKED_BY_DEBT`).
    public let blockedBy: GameSparks.MintBlock?

    public init(number: Int, price: Int, edition: MeeshEdition, canMint: Bool, missingPoints: Int,
                levelBefore: Int, levelAfter: Int, levelsLost: Int, gloryGained: Int, ladder: GameMintLadder? = nil,
                basePrice: Int? = nil, costFactor: Double? = nil, costLevel: Int? = nil,
                locked: GameMintLock? = nil, sparksDebt: Int? = nil, blockedBy: GameSparks.MintBlock? = nil) {
        self.blockedBy = blockedBy
        self.basePrice = basePrice
        self.costFactor = costFactor
        self.costLevel = costLevel
        self.locked = locked
        self.sparksDebt = sparksDebt
        self.number = number
        self.price = price
        self.edition = edition
        self.canMint = canMint
        self.missingPoints = missingPoints
        self.levelBefore = levelBefore
        self.levelAfter = levelAfter
        self.levelsLost = levelsLost
        self.gloryGained = gloryGained
        self.ladder = ladder
    }

    private enum CodingKeys: String, CodingKey {
        case number, price, edition, canMint, missingPoints, levelBefore, levelAfter, levelsLost, gloryGained, ladder
        case basePrice, costFactor, costLevel, locked, sparksDebt, blockedBy
    }

    /// Les champs d'hier restent STRICTS ; ceux des étincelles se taisent s'ils sont illisibles (une réserve ajoutée
    /// avant la mise à jour de l'app) au lieu d'emporter le bloc du jeu.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        number = try c.decode(Int.self, forKey: .number)
        price = try c.decode(Int.self, forKey: .price)
        edition = try c.decode(MeeshEdition.self, forKey: .edition)
        canMint = try c.decode(Bool.self, forKey: .canMint)
        missingPoints = try c.decode(Int.self, forKey: .missingPoints)
        levelBefore = try c.decode(Int.self, forKey: .levelBefore)
        levelAfter = try c.decode(Int.self, forKey: .levelAfter)
        levelsLost = try c.decode(Int.self, forKey: .levelsLost)
        gloryGained = try c.decode(Int.self, forKey: .gloryGained)
        ladder = (try? c.decodeIfPresent(GameMintLadder.self, forKey: .ladder)) ?? nil
        basePrice = GameSparks.count(c, .basePrice)
        costFactor = (try? c.decodeIfPresent(Double.self, forKey: .costFactor)) ?? nil
        costLevel = GameSparks.count(c, .costLevel)
        locked = (try? c.decodeIfPresent(GameMintLock.self, forKey: .locked)) ?? nil
        sparksDebt = GameSparks.count(c, .sparksDebt)
        blockedBy = GameSparks.mintBlock(c, .blockedBy)
    }

    /// Ce qui empêche la frappe, dans l'ordre où l'écran doit le dire — `nil` : rien ne l'empêche.
    /// La DETTE d'abord (elle se règle avant tout le reste), puis la RÉSERVE fermée par le rang (gagner des
    /// étincelles n'y changerait rien), enfin les étincelles qui MANQUENT.
    public enum Blocker: Equatable, Sendable {
        case sparksDebt(Int)
        case treasuryLocked(GameMintLock)
        case missingSparks(Int)
    }

    public var blocker: Blocker? {
        if blockedBy == .debt || (sparksDebt ?? 0) > 0 { return .sparksDebt(sparksDebt ?? 0) }
        if let locked { return .treasuryLocked(locked) }
        if missingPoints > 0 { return .missingSparks(missingPoints) }
        return nil
    }

    /// Les niveaux que l'écran montre : la lecture ouverte par le rang, ou ceux d'hier devant un serveur antérieur.
    public var shownLevels: GameMintLadder {
        ladder ?? GameMintLadder(levelBefore: levelBefore, levelAfter: levelAfter, levelsLost: levelsLost)
    }
}

/// Le rang de Gloire qu'une réserve exige (#10848) : la division héritée (1–3) ET la division à cinq crans (V = 5, la
/// plus faible ; I = 1, la plus haute).
public struct GameRankRequirement: Codable, Sendable, Equatable, Hashable {
    public let rank: GloryRank
    public let division: Int
    public let division5: Int

    public init(rank: GloryRank, division: Int, division5: Int) {
        self.rank = rank
        self.division = division
        self.division5 = division5
    }
}

/// La réserve du trésor que le rang n'ouvre pas encore et qui barre la frappe (#10848).
public struct GameMintLock: Codable, Sendable, Equatable, Hashable {
    public let tier: TreasuryTierKey
    public let minHeld: Int
    public let requires: GameRankRequirement

    public init(tier: TreasuryTierKey, minHeld: Int, requires: GameRankRequirement) {
        self.tier = tier
        self.minHeld = minHeld
        self.requires = requires
    }
}

/// Les niveaux de la frappe, ouverts par le rang (#9688).
public struct GameMintLadder: Codable, Sendable, Equatable {
    public let levelBefore: Int
    public let levelAfter: Int
    public let levelsLost: Int

    public init(levelBefore: Int, levelAfter: Int, levelsLost: Int) {
        self.levelBefore = levelBefore
        self.levelAfter = levelAfter
        self.levelsLost = levelsLost
    }
}

public enum GameMint {
    /// Le prix des dix premières Meeshes.
    public static let basePrice = 1221
    public static let priceStepEvery = 10
    public static let priceGrowth = 1.3
    /// Le plafond (porteur, 2026-10-10) : atteint à la 101e frappe.
    public static let priceCap = 16_556

    /// Le prix de la n-ième Meesh frappée (n commence à 1 ; une valeur < 1 vaut 1).
    ///
    /// Le plafond se pose AVANT la conversion en entier : au-delà de quelques milliers
    /// de numéros, `1,06^k` dépasse `Int.max` puis l'infini, et `Int(_:)` planterait
    /// sur un `mint.number` démesuré reçu du réseau. Le TS rend alors le plafond.
    public static func price(forNumber n: Int) -> Int {
        let rank = max(1, n)
        let steps = Double((rank - 1) / priceStepEvery)
        let raw = (Double(basePrice) * pow(priceGrowth, steps)).rounded(.toNearestOrAwayFromZero)
        return Int(min(raw, Double(priceCap)))
    }

    // MARK: Le coût selon le niveau ACTUEL (#10847) — `sparks.ts`, en millièmes entiers (aucun flottant).

    /// Le facteur au niveau 0, en millièmes : 50 %.
    public static let costFactorAtLevelZeroPermille = 500
    /// Le niveau à partir duquel la frappe est au plein tarif.
    public static let fullPriceLevel = 100

    /// Le facteur de coût en millièmes (500 à 1000) pour ce niveau ACTUEL — linéaire, plein tarif dès le niveau 100.
    public static func costFactorPermille(level: Int) -> Int {
        let bounded = min(fullPriceLevel, max(0, level))
        let span = 1000 - costFactorAtLevelZeroPermille
        return costFactorAtLevelZeroPermille + (span * bounded) / fullPriceLevel
    }

    /// Le prix de la n-ième Meesh pour un compte à ce niveau ACTUEL : `prix(n)` × le facteur, arrondi, au moins 1.
    /// Le serveur recalcule toujours ; l'écran montre celui qu'il sert (`mintCost`, `mint.price`).
    public static func effectivePrice(forNumber n: Int, level: Int) -> Int {
        max(1, (price(forNumber: n) * costFactorPermille(level: level) + 500) / 1000)
    }

    public static func edition(forNumber n: Int) -> MeeshEdition {
        let rank = max(0, n)
        if rank > 0 && rank % 1000 == 0 { return .prism }
        if rank > 0 && rank % 100 == 0 { return .gold }
        return .silver
    }

    /// L'édition DESSINÉE de la n-ième Meesh (#11483) : la plus haute édition atteinte — l'argent avant le n° 100, l'or
    /// à partir du n° 100, le prisme à partir du n° 1000 (porteur, 2026-10-21 : « Le n° 247 dessiné en or »). La matière,
    /// l'oiseau du revers et les poussières de la cérémonie suivent ce dessin ; la chorégraphie de la frappe suit la loi
    /// (`edition(forNumber:)`). MIROIR de `meeshDisplayEdition` (`packages/shared/utils/game/mint.ts`), rejoué sur
    /// `meesh-display-edition.vectors.json`.
    public static func displayEdition(forNumber n: Int) -> MeeshEdition {
        let rank = max(0, n)
        if rank >= 1000 { return .prism }
        if rank >= 100 { return .gold }
        return .silver
    }

    /// Les faits des étapes APRÈS la frappe (#9706) : une Meesh de plus, et sa Gloire — qui peut faire
    /// passer un rang. Le Mythe, servi par le serveur, reste le Mythe.
    private static func stepsAfterMint(_ steps: GameLevelStepFacts) -> GameLevelStepFacts {
        let glory = max(0, steps.glory) + GameGlory.points.mint
        return GameLevelStepFacts(
            minted: max(0, steps.minted) + 1,
            missionsDone: steps.missionsDone,
            flameRecord: steps.flameRecord,
            glory: glory,
            rank: steps.rank == .mythe ? .mythe : GameGlory.standing(glory: glory, mythic: false).rank
        )
    }

    /// Ce que la frappe coûterait et rapporterait, avant confirmation. Pur : le
    /// serveur le rejoue à l'écriture, les clients le montrent avant.
    ///
    /// Avec les étapes (#9706, `steps` — son `minted` est relu sur `mintedLifetime`), la frappe peut FAIRE une
    /// étape : le niveau d'après se lit sous le plafond d'après, et peut monter. `nil` : sans étapes.
    public static func preview(score: Int, mintedLifetime: Int, debitablePoints: Int, levelCap: Int?,
                               steps: GameLevelStepFacts? = nil) -> GameMintPreview {
        let held = max(0, score)
        let debitable = max(0, debitablePoints)
        let number = min(max(0, mintedLifetime), Int.max - 1) + 1
        let cost = price(forNumber: number)
        let canMint = debitable >= cost
        let before = steps.map {
            GameLevelStepFacts(minted: max(0, mintedLifetime), missionsDone: $0.missionsDone, flameRecord: $0.flameRecord,
                               glory: $0.glory, rank: $0.rank)
        }
        let after = before.map(stepsAfterMint)
        let capBefore = GameLevels.tighter(levelCap, GameLevelSteps.gate(before))
        let capAfter = after.map { GameLevelSteps.cap(rank: $0.rank, steps: $0) } ?? capBefore
        let levelBefore = GameLevels.level(forScore: held, cap: capBefore)
        let levelAfter = canMint ? GameLevels.level(forScore: max(0, held - cost), cap: capAfter) : levelBefore
        return GameMintPreview(
            number: number,
            price: cost,
            edition: edition(forNumber: number),
            canMint: canMint,
            missingPoints: canMint ? 0 : cost - debitable,
            levelBefore: levelBefore,
            levelAfter: levelAfter,
            levelsLost: max(0, levelBefore - levelAfter),
            gloryGained: canMint ? GameGlory.points.mint : 0
        )
    }
}
