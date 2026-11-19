import Foundation
import Testing
@testable import MeeshySDK

/// L'acte du Rêve qui avance, vu à l'envoi (#17367, tranche iOS #19716) — miroir de
/// `packages/shared/__tests__/game/act-advance.test.ts`, mêmes cas.
@Suite("Jeu Meeshy — un acte du Rêve qui avance se voit à l'envoi")
struct GameActAdvanceTests {

    private func act(_ id: String, _ difficulty: MissionDifficulty, _ progress: Int, _ target: Int) -> GameBlock.Mission {
        GameBlock.Mission(
            id: id, templateKey: "send-texts", difficulty: difficulty, signal: MissionSignal("axis:content.text_message"),
            prism: false, target: target, progress: progress, reward: 30, glory: 0, completedAt: nil
        )
    }

    private func game(_ items: [GameBlock.Mission], dayKey: String = "2026-11-18", unlocked: Bool = true) -> GameBlock.Missions {
        GameBlock.Missions(dayKey: dayKey, prismDay: false, unlocked: unlocked, items: items, rerollAvailable: true)
    }

    private func day(_ medium: Int, _ hard: Int = 0) -> GameBlock.Missions {
        game([act("a", .easy, 1, 1), act("b", .medium, medium, 5), act("c", .hard, hard, 8)])
    }

    @Test("l'acte dont la progression monte est rendu avec sa nouvelle progression et son objectif")
    func theAdvancedActIsServed() {
        #expect(GameActAdvance.between(day(2), day(3), hidden: false) == GameActAdvance(difficulty: .medium, progress: 3, target: 5))
    }

    @Test("un acte qui atteint son objectif est rendu aussi : « 5 sur 5 »")
    func anActReachingItsTarget() {
        #expect(GameActAdvance.between(day(4), day(5), hidden: false) == GameActAdvance(difficulty: .medium, progress: 5, target: 5))
    }

    @Test("une progression servie au-delà de l'objectif se lit à l'objectif")
    func progressBeyondTheTarget() {
        #expect(GameActAdvance.between(day(4), day(7), hidden: false) == GameActAdvance(difficulty: .medium, progress: 5, target: 5))
    }

    @Test("quand deux actes avancent ensemble, le premier dans l'ordre du jour parle")
    func twoActsTogether() {
        #expect(GameActAdvance.between(day(2, 1), day(3, 2), hidden: false) == GameActAdvance(difficulty: .medium, progress: 3, target: 5))
    }

    @Test("aucun acte n'avance : rien")
    func nothingMoves() {
        #expect(GameActAdvance.between(day(2), day(2), hidden: false) == nil)
    }

    @Test("une progression qui baisse ne dit rien")
    func progressGoingDown() {
        #expect(GameActAdvance.between(day(3), day(2), hidden: false) == nil)
    }

    @Test("« Jeu masqué » : rien, même quand un acte avance")
    func hiddenGame() {
        #expect(GameActAdvance.between(day(2), day(3), hidden: true) == nil)
    }

    @Test("un nouveau jour n'est pas une avancée : les actes ont changé de journée")
    func aNewDay() {
        #expect(GameActAdvance.between(day(2), game([act("b", .medium, 3, 5)], dayKey: "2026-11-19"), hidden: false) == nil)
    }

    @Test("un acte remplacé (relance) n'est pas une avancée : seul un même acte se compare")
    func aRerolledAct() {
        let rerolled = game([act("a", .easy, 1, 1), act("z", .medium, 3, 5), act("c", .hard, 0, 8)])
        #expect(GameActAdvance.between(day(2), rerolled, hidden: false) == nil)
    }

    @Test("actes pas encore ouverts : rien")
    func locked() {
        let before = game([act("b", .medium, 2, 5)], unlocked: false)
        let after = game([act("b", .medium, 3, 5)], unlocked: false)
        #expect(GameActAdvance.between(before, after, hidden: false) == nil)
    }

    @Test("sans lecture d'avant ou d'après (cache vide, ancien serveur) : rien")
    func missingReadings() {
        #expect(GameActAdvance.between(nil, day(3), hidden: false) == nil)
        #expect(GameActAdvance.between(day(2), nil, hidden: false) == nil)
    }
}
