import Foundation
import Testing
@testable import MeeshySDK

/// Ce qu'un gain de Gloire fait au rang (#19859, miroir de `gloryAfterGain` de `packages/shared/utils/game/glory.ts`) :
/// la frappe finit sur la gloire gagnée ET le pas vers le rang suivant. Mêmes cas que le témoin partagé
/// (`packages/shared/__tests__/game/glory-after-gain.test.ts`).
@Suite("Jeu Meeshy — ce qu'un gain de Gloire fait au rang")
struct GameGloryAfterGainTests {

    private func step(_ rank: GloryRank, _ division5: GloryDivision5) -> GloryStep {
        GameGlory.steps.first { $0.rank == rank && $0.division5 == division5 }!
    }

    @Test("sans marche franchie : la gloire qui manque jusqu'à la marche suivante, comptée APRÈS le gain")
    func towardTheNextStepCountsAfterTheGain() {
        #expect(GameGlory.afterGain(before: 0, gained: 100, mythic: false)
            == .toward(gloryMissing: step(.murmure, .iv).minGlory - 100, rank: .murmure, division5: .iv))
    }

    @Test("une division franchie : le nouveau nom, avec sa division")
    func aDivisionCrossedSaysTheNewName() {
        let start = step(.conteur, .iii).minGlory
        #expect(GameGlory.afterGain(before: start - 1, gained: 1000, mythic: false) == .risen(rank: .conteur, division5: .iii))
    }

    @Test("un rang franchi : le nouveau rang, à sa division V")
    func aRankCrossedStartsAtDivisionFive() {
        #expect(GameGlory.afterGain(before: 1500, gained: 1000, mythic: false) == .risen(rank: .echo, division5: .v))
    }

    @Test("atteindre la marche pile la franchit")
    func reachingTheStepExactlyCrossesIt() {
        #expect(GameGlory.afterGain(before: 1000, gained: 1000, mythic: false) == .risen(rank: .echo, division5: .v))
    }

    @Test("en Légende I, faute de suite, rien à dire")
    func legendOneHasNothingToSay() {
        #expect(GameGlory.afterGain(before: step(.legende, .i).minGlory + 10, gained: 1000, mythic: false) == nil)
    }

    @Test("le Mythe vient du serveur : rien à dire, même sous le seuil")
    func mythicHasNothingToSay() {
        #expect(GameGlory.afterGain(before: 10, gained: 1000, mythic: true) == nil)
    }

    @Test("un gain nul ou négatif ne fabrique pas de marche franchie")
    func aNullOrNegativeGainNeverCrosses() {
        #expect(GameGlory.afterGain(before: 1500, gained: 0, mythic: false)
            == .toward(gloryMissing: step(.murmure, .i).minGlory - 1500, rank: .murmure, division5: .i))
        #expect(GameGlory.afterGain(before: -20, gained: -5, mythic: false)
            == .toward(gloryMissing: step(.murmure, .iv).minGlory, rank: .murmure, division5: .iv))
    }
}
