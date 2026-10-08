import Foundation

// MARK: - La rareté croissante des Meeshes (#9373)
//
// MIROIR de `packages/shared/utils/game/mint.ts` — le prix monte avec le nombre
// de Meeshes déjà frappées :
//
//     prix(n) = round(1221 × 1,06 ^ ⌊(n − 1) ÷ 10⌋), plafonné à 4 884
//
// 1 221 reste la BASE (le prix des dix premières) et celui que les anciens
// clients croient encore : le serveur recalcule et refuse SANS débit.

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
    /// Égal à `levelBefore` quand la frappe n'est pas possible.
    public let levelAfter: Int
    public let levelsLost: Int
    /// `0` quand la frappe n'est pas possible.
    public let gloryGained: Int
    /// Les niveaux ouverts par le rang (#9688) — `nil` devant un serveur antérieur ; les trois champs
    /// voisins gardent l'ancienne loi (bornés à 100) sur le fil.
    public let ladder: GameMintLadder?

    public init(number: Int, price: Int, edition: MeeshEdition, canMint: Bool, missingPoints: Int,
                levelBefore: Int, levelAfter: Int, levelsLost: Int, gloryGained: Int, ladder: GameMintLadder? = nil) {
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

    /// Les niveaux que l'écran montre : la lecture ouverte par le rang, ou ceux d'hier devant un serveur antérieur.
    public var shownLevels: GameMintLadder {
        ladder ?? GameMintLadder(levelBefore: levelBefore, levelAfter: levelAfter, levelsLost: levelsLost)
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
    public static let priceGrowth = 1.06
    /// Quatre fois la base.
    public static let priceCap = basePrice * 4

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

    public static func edition(forNumber n: Int) -> MeeshEdition {
        let rank = max(0, n)
        if rank > 0 && rank % 1000 == 0 { return .prism }
        if rank > 0 && rank % 100 == 0 { return .gold }
        return .silver
    }

    /// Ce que la frappe coûterait et rapporterait, avant confirmation. Pur : le
    /// serveur le rejoue à l'écriture, les clients le montrent avant.
    public static func preview(score: Int, mintedLifetime: Int, debitablePoints: Int, levelCap: Int?) -> GameMintPreview {
        let held = max(0, score)
        let debitable = max(0, debitablePoints)
        let number = min(max(0, mintedLifetime), Int.max - 1) + 1
        let cost = price(forNumber: number)
        let canMint = debitable >= cost
        let levelBefore = GameLevels.level(forScore: held, cap: levelCap)
        let levelAfter = canMint ? GameLevels.level(forScore: max(0, held - cost), cap: levelCap) : levelBefore
        return GameMintPreview(
            number: number,
            price: cost,
            edition: edition(forNumber: number),
            canMint: canMint,
            missingPoints: canMint ? 0 : cost - debitable,
            levelBefore: levelBefore,
            levelAfter: levelAfter,
            levelsLost: levelBefore - levelAfter,
            gloryGained: canMint ? GameGlory.points.mint : 0
        )
    }
}
