import Foundation
import Testing
@testable import MeeshySDK

/// Les étapes des niveaux (#9706) : une étape tous les dix niveaux, de 10 à 100. Les cas chiffrés de bout en
/// bout vivent dans `GameLawVectorTests` (loi `level`, `mint-preview`, `prestige`) ; ici, les comportements.
@Suite("Jeu Meeshy — les étapes des niveaux")
struct GameLevelStepsTests {

    private func facts(minted: Int = 0, missionsDone: Int = 0, flameRecord: Int = 0, glory: Int = 0,
                       rank: GloryRank = .murmure) -> GameLevelStepFacts {
        GameLevelStepFacts(minted: minted, missionsDone: missionsDone, flameRecord: flameRecord, glory: glory, rank: rank)
    }

    @Test("la table du porteur : une étape par dizaine, de 10 à 100")
    func porteurTable() {
        #expect(GameLevelSteps.rules.map(\.level) == [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
        #expect(GameLevelSteps.rules.map(\.kind) == [.mint, .missions, .rank, .flame, .missions, .rank, .mint, .rank, .flame, .rank])
        #expect(GameLevelSteps.rules.compactMap(\.rank) == [.echo, .voix, .conteur, .passeur])
        #expect(GameLevelSteps.missionsCounted == 10)
    }

    @Test("les points sont là, l'étape manque : le niveau attend au palier précédent")
    func heldBelowTheMissingStep() {
        let gate = GameLevelSteps.gate(facts())
        let p = GameLevels.progress(forScore: GameLevels.threshold(of: 15), cap: GameLevels.capBase, gate: gate)
        #expect(gate == 9)
        #expect(p.level == 9)
        #expect(p.held)
        #expect(!p.isMax)
        #expect(p.nextThreshold == GameLevels.threshold(of: 10))
        #expect(p.pointsToNext == 0)
        #expect(p.progress == 1)
    }

    @Test("l'étape faite après coup : le niveau monte d'un coup")
    func risesAtOnce() {
        let p = GameLevels.progress(forScore: GameLevels.threshold(of: 15), cap: GameLevels.capBase,
                                    gate: GameLevelSteps.gate(facts(minted: 1)))
        #expect(p.level == 15)
        #expect(!p.held)
    }

    @Test("un rang se juge sur le rang servi : le Mythe vaut tous les rangs")
    func rankStepReadsTheServedRank() {
        let all = facts(minted: 5, missionsDone: 10, flameRecord: 30, glory: 35_000, rank: .passeur)
        #expect(GameLevelSteps.gate(all) == nil)
        #expect(GameLevelSteps.gate(facts(minted: 5, missionsDone: 10, flameRecord: 30, glory: 34_999, rank: .conteur)) == 99)
        #expect(GameLevelSteps.gate(facts(minted: 5, missionsDone: 10, flameRecord: 30, rank: .mythe)) == nil)
        #expect(GameLevelSteps.cap(rank: .passeur, steps: all) == GameLevels.capBase)
        #expect(GameLevelSteps.cap(rank: .murmure, steps: facts()) == 9)
        #expect(GameLevelSteps.cap(rank: .murmure, steps: nil) == GameLevels.capBase)
    }

    @Test("la prochaine étape dit ce qui manque, et se tait au-delà de 100")
    func nextStep() {
        #expect(GameLevelSteps.next(after: 9, facts: facts()) == GameLevelStep(level: 10, kind: .mint, target: 1, current: 0, met: false, rank: nil))
        #expect(GameLevelSteps.next(after: 29, facts: facts(glory: 1200))
            == GameLevelStep(level: 30, kind: .rank, target: 2000, current: 1200, met: false, rank: .echo))
        #expect(GameLevelSteps.next(after: 100, facts: facts()) == nil)
        #expect(GameLevelSteps.next(after: 5, facts: nil) == nil)
    }

    @Test("le niveau des ouvertures ne passe pas la dizaine qui suit le record")
    func unlockLevelReadsTheRecord() {
        #expect(GameLevels.stepCeiling(record: nil) == 9)
        #expect(GameLevels.stepCeiling(record: 24) == 29)
        #expect(GameLevels.stepCeiling(record: 100) == nil)
        #expect(GameLevels.levelForUnlocks(score: 250_000, levelRecord: 9) == 9)
        #expect(GameLevels.levelForUnlocks(score: 250_000, levelRecord: 50) == 50)
    }

    @Test("le Prestige demande le million ET le record du niveau 100")
    func prestigeNeedsTheRecord() {
        #expect(GamePrestige.transition(score: 1_000_000, prestige: 0, levelRecord: 99) == .refused(.levelTooLow))
        guard case .allowed = GamePrestige.transition(score: 1_000_000, prestige: 0, levelRecord: 100) else {
            Issue.record("le Prestige devait s'ouvrir")
            return
        }
    }

    @Test("frapper la première Meesh fait l'étape du 10 : le niveau d'après MONTE, rien n'est perdu")
    func mintMakesTheStep() {
        let preview = GameMint.preview(score: 15_000, mintedLifetime: 0, debitablePoints: 15_000, levelCap: GameLevels.capBase,
                                       steps: facts())
        #expect(preview.levelBefore == 9)
        #expect(preview.levelAfter == 11)
        #expect(preview.levelsLost == 0)
    }

    @Test("un ladder d'avant les étapes se lit sans elles, et une sorte d'étape inconnue ne fait pas tomber le bloc")
    func ladderToleratesStepFields() throws {
        let old = #"{"level":9,"tier":"etincelle","floorScore":8100,"nextThreshold":10000,"pointsToNext":0,"progress":1,"record":9,"cap":499,"isMax":false}"#
        let decodedOld = try JSONDecoder().decode(GameBlock.Level.Ladder.self, from: Data(old.utf8))
        #expect(!decodedOld.held)
        #expect(decodedOld.step == nil)
        #expect(decodedOld.steps == nil)

        let unknown = #"{"level":9,"tier":"etincelle","floorScore":8100,"nextThreshold":10000,"pointsToNext":0,"progress":1,"record":9,"cap":499,"isMax":false,"held":true,"step":{"level":10,"kind":"voyage","target":1,"current":0,"met":false,"rank":null},"steps":{"minted":0,"missionsDone":0,"flameRecord":0}}"#
        let decoded = try JSONDecoder().decode(GameBlock.Level.Ladder.self, from: Data(unknown.utf8))
        #expect(decoded.held)
        #expect(decoded.step == nil)
        #expect(decoded.steps == GameLevelStepCounts(minted: 0, missionsDone: 0, flameRecord: 0))
    }
}
