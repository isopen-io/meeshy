import Foundation

// MARK: - La frappe selon les étincelles (#10847, #10848, #10892)
//
// MIROIR de `previewSparksMint` (`packages/shared/utils/game/sparks.ts`) et de `treasuryReserveAccess` /
// `treasuryLockFor` (`packages/shared/utils/game/treasury.ts`). Rejoué cas pour cas sur
// `packages/shared/fixtures/reading-modes/sparks.vectors.json` (#10894) : sur divergence, c'est le TS qui a raison.
//
//  - la POCHE paie et fait le niveau : le niveau d'après se lit sur la poche moins le prix ;
//  - le prix est celui de la pièce × le facteur du niveau ACTUEL (`effectivePrice`), lu au moins au niveau 1 ;
//  - une pièce qui ferait entrer dans une réserve que le rang n'ouvre pas est barrée (`locked`) ;
//  - une dette d'étincelles bloque toute frappe (`blockedBy == .debt`).
//
// L'écran montre ce que la passerelle SERT ; cette loi ne sert qu'à l'optimiste, pour qu'il ne peigne jamais un prix,
// un niveau ou un « Frapper » que la passerelle refuserait.

public extension GameTreasury {

    /// Les réserves fermées par le rang — les autres paliers sont ouverts à tous.
    static let rankRequirements: [TreasuryTierKey: (rank: GloryRank, division5: GloryDivision5)] = [
        .coffre: (.voix, .i),
        .tresor: (.polyglotte, .iii),
        .reserve: (.ambassadeur, .iii),
    ]

    private static func requirement(of tier: TreasuryTierKey) -> GameRankRequirement? {
        rankRequirements[tier].map {
            GameRankRequirement(rank: $0.rank, division: $0.division5.legacy.rawValue, division5: $0.division5.rawValue)
        }
    }

    /// FAIL-CLOSED : une marche introuvable ne s'ouvre pour personne. Le Mythe, servi par le serveur, ouvre tout.
    private static func reaches(glory: Int, mythic: Bool, _ requirement: GameRankRequirement) -> Bool {
        if mythic { return true }
        guard let step = GameGlory.steps.first(where: {
            $0.rank == requirement.rank && $0.division5?.rawValue == requirement.division5
        }) else { return false }
        return glory >= step.minGlory
    }

    /// Pour chaque réserve, son état et le rang qu'elle exige — `treasuryReserveAccess`.
    static func reserveAccess(glory: Int, mythic: Bool = false) -> [TreasuryStanding.Access] {
        TreasuryTierKey.allCases.map { tier in
            let required = requirement(of: tier)
            return TreasuryStanding.Access(
                key: tier,
                minHeld: tier.minHeld,
                locked: required.map { !reaches(glory: glory, mythic: mythic, $0) } ?? false,
                requires: required
            )
        }
    }

    /// La réserve qui barre la prochaine Meesh gardée — `treasuryLockFor`. `nil` : la frappe est libre.
    static func lock(held rawHeld: Int, glory: Int, mythic: Bool = false) -> GameMintLock? {
        let after = max(0, rawHeld) + 1
        for tier in TreasuryTierKey.allCases where tier.minHeld <= after {
            guard let required = requirement(of: tier), !reaches(glory: glory, mythic: mythic, required) else { continue }
            return GameMintLock(tier: tier, minHeld: tier.minHeld, requires: required)
        }
        return nil
    }
}

public extension GameMint {

    /// Ce que la frappe coûterait et rapporterait — `previewSparksMint`. `steps` : les faits des étapes (#9706), leur
    /// `minted` relu sur `mintedLifetime` ; `nil` sans étapes. Les niveaux rendus sont BRUTS (sans la borne de 100 du fil).
    static func sparksPreview(sparks: Int, mintedLifetime: Int, held: Int, glory: Int, mythic: Bool = false,
                              levelCap: Int?, steps: GameLevelStepFacts?, debt: Int = 0) -> GameMintPreview {
        let pocket = max(0, sparks)
        let minted = min(max(0, mintedLifetime), Int.max - 1)
        let number = minted + 1
        let before = steps.map {
            GameLevelStepFacts(minted: minted, missionsDone: $0.missionsDone, flameRecord: $0.flameRecord,
                               glory: $0.glory, rank: $0.rank)
        }
        let after = before.map(stepsAfterSparksMint)
        let capBefore = GameLevels.tighter(levelCap, GameLevelSteps.gate(before))
        let capAfter = after.map { GameLevelSteps.cap(rank: $0.rank, steps: $0) } ?? capBefore

        let levelBefore = GameLevels.level(forScore: pocket, cap: capBefore)
        let costLevel = max(GameLevels.minLevel, levelBefore)
        let price = effectivePrice(forNumber: number, level: costLevel)
        let locked = GameTreasury.lock(held: held, glory: glory, mythic: mythic)
        let owed = max(0, debt)
        let affordable = pocket >= price
        let canMint = affordable && locked == nil && owed == 0
        let levelAfter = canMint ? GameLevels.level(forScore: pocket - price, cap: capAfter) : levelBefore
        return GameMintPreview(
            number: number,
            price: price,
            edition: edition(forNumber: number),
            canMint: canMint,
            missingPoints: affordable ? 0 : price - pocket,
            levelBefore: levelBefore,
            levelAfter: levelAfter,
            levelsLost: max(0, levelBefore - levelAfter),
            gloryGained: canMint ? GameGlory.points.mint : 0,
            basePrice: self.price(forNumber: number),
            costFactor: Double(costFactorPermille(level: costLevel)) / 1000,
            costLevel: costLevel,
            locked: locked,
            sparksDebt: owed,
            blockedBy: owed > 0 ? .debt : nil
        )
    }

    /// Les faits des étapes APRÈS la frappe : une Meesh de plus, et sa Gloire — qui peut faire passer un rang.
    private static func stepsAfterSparksMint(_ steps: GameLevelStepFacts) -> GameLevelStepFacts {
        let glory = max(0, steps.glory) + GameGlory.points.mint
        return GameLevelStepFacts(
            minted: max(0, steps.minted) + 1,
            missionsDone: steps.missionsDone,
            flameRecord: steps.flameRecord,
            glory: glory,
            rank: steps.rank == .mythe ? .mythe : GameGlory.standing(glory: glory, mythic: false).rank
        )
    }
}
