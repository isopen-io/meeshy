import Foundation
import Testing
@testable import MeeshySDK

/// L'anneau des actes du jour autour du bouton du menu (#17768) — miroir de
/// `packages/shared/__tests__/game/acts-ring.test.ts`, mêmes cas.
@Suite("Jeu Meeshy — l'anneau des actes du jour")
struct GameActsRingTests {

    private func missions(unlocked: Bool = true, done: [Bool] = [false, false, false]) -> GameBlock.Missions {
        let items = done.enumerated().map { index, isDone in
            GameBlock.Mission(
                id: "m\(index)", templateKey: "send-texts", difficulty: .easy, signal: MissionSignal("axis:content.text_message"),
                prism: false, target: 5, progress: isDone ? 5 : 0, reward: 30, glory: 0,
                completedAt: isDone ? "2026-11-13T09:00:00.000Z" : nil
            )
        }
        return GameBlock.Missions(dayKey: "2026-11-13", prismDay: false, unlocked: unlocked, items: items, rerollAvailable: true)
    }

    @Test("compte les actes du jour réalisés sur ceux du jour")
    func countsTheDoneActs() {
        #expect(GameActsRing.of(missions: missions(done: [true, false, true]), hidden: false) == GameActsRing(done: 2, total: 3))
    }

    @Test("aucun acte réalisé : l'anneau existe, éteint")
    func noActDone() {
        #expect(GameActsRing.of(missions: missions(), hidden: false) == GameActsRing(done: 0, total: 3))
    }

    @Test("les trois actes réalisés : l'anneau est plein")
    func allActsDone() {
        let ring = GameActsRing.of(missions: missions(done: [true, true, true]), hidden: false)
        #expect(ring == GameActsRing(done: 3, total: 3))
        #expect(ring?.isComplete == true)
    }

    @Test("avant le niveau 5, les actes ne sont pas ouverts : aucun anneau")
    func lockedBeforeLevelFive() {
        #expect(GameActsRing.of(missions: missions(unlocked: false, done: [true, false, false]), hidden: false) == nil)
    }

    @Test("un jour servi sans acte : aucun anneau")
    func dayWithoutActs() {
        #expect(GameActsRing.of(missions: missions(done: []), hidden: false) == nil)
    }

    @Test("« Jeu masqué » : aucun anneau")
    func hiddenGame() {
        #expect(GameActsRing.of(missions: missions(done: [true, true, false]), hidden: true) == nil)
    }

    @Test("sans bloc de jeu (cache vide, ancien serveur) : aucun anneau")
    func noBlock() {
        #expect(GameActsRing.of(nil, hidden: false) == nil)
    }

    @Test("le bloc servi de la fixture : un acte sur trois")
    func servedBlock() throws {
        let game = try #require(GameBlock.parse(GameBlockFixture.data))
        #expect(GameActsRing.of(game, hidden: false) == GameActsRing(done: 1, total: 3))
    }
}
