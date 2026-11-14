import Foundation
import Testing
@testable import MeeshySDK

/// Miroir des cas de `packages/shared/__tests__/game/attention.test.ts` (#17796).
@Suite("Jeu Meeshy — ce que le Jeu signale hors de ses écrans")
struct GameAttentionTests {

    private func law(unlocked: Bool = true, chest: GameBlock.Chest.Status = .locked, flame: FlameStatus = .lit,
                     days: Int = 4) -> GameAttention {
        GameAttention(missionsUnlocked: unlocked, chest: chest, flame: flame, flameDays: days)
    }

    @Test("l'Offrande servie prête se signale")
    func readyChestRaises() {
        #expect(law(chest: .ready) == GameAttention(chestReady: true, flameAtRisk: false))
    }

    @Test("une Offrande voilée ou déjà ouverte ne se signale pas")
    func lockedOrClaimedChestStaysQuiet() {
        #expect(!law(chest: .locked).chestReady)
        #expect(!law(chest: .claimed).chestReady)
    }

    @Test("avant le niveau 5, aucune Offrande ne se signale, même servie prête")
    func lockedMissionsHideTheChest() {
        #expect(!law(unlocked: false, chest: .ready).chestReady)
    }

    @Test("la Flamme servie à risque se signale")
    func flameAtRiskRaises() {
        #expect(law(flame: .atRisk) == GameAttention(chestReady: false, flameAtRisk: true))
    }

    @Test("une Flamme allumée, couverte, éteinte ou absente ne se signale pas", arguments: [FlameStatus.none, .lit, .covered, .out])
    func otherFlamesStayQuiet(status: FlameStatus) {
        #expect(!law(flame: status).flameAtRisk)
    }

    @Test("une Flamme sans jour ne se dit pas à risque")
    func flameWithoutDaysStaysQuiet() {
        #expect(!law(flame: .atRisk, days: 0).flameAtRisk)
    }

    @Test("« Jeu masqué » : rien ne se signale")
    func hiddenGameSaysNothing() throws {
        let game = try #require(GameBlock.parse(GameBlockFixture.data))
        #expect(GameAttention.of(game, hidden: true) == .none)
    }

    @Test("sans bloc de jeu (cache vide, ancien serveur), rien ne se signale")
    func noBlockSaysNothing() {
        #expect(GameAttention.of(nil, hidden: false) == .none)
    }

    @Test("le bloc servi est lu tel quel : Offrande prête et Flamme à risque")
    func servedBlockIsRead() throws {
        let served = GameBlockFixture.json
            .replacingOccurrences(of: "\"chest\":{\"status\":\"locked\"", with: "\"chest\":{\"status\":\"ready\"")
            .replacingOccurrences(of: "\"status\":\"lit\"", with: "\"status\":\"at-risk\"")
        let game = try #require(GameBlock.parse(Data(served.utf8)))
        #expect(GameAttention.of(game, hidden: false) == GameAttention(chestReady: true, flameAtRisk: true))
        let quiet = try #require(GameBlock.parse(GameBlockFixture.data))
        #expect(GameAttention.of(quiet, hidden: false) == .none)
        #expect(GamePlayerBanner.make(game: game)?.attention == GameAttention(chestReady: true, flameAtRisk: true),
                "le bandeau porte le signal lu du même bloc")
        #expect(GamePlayerBanner.make(game: quiet)?.attention == GameAttention.none)
    }

    @Test("les deux signaux coexistent ; isRaised dès qu'un signal est levé")
    func bothSignals() {
        #expect(law(chest: .ready, flame: .atRisk) == GameAttention(chestReady: true, flameAtRisk: true))
        #expect(!GameAttention.none.isRaised)
        #expect(GameAttention(chestReady: true, flameAtRisk: false).isRaised)
        #expect(GameAttention(chestReady: false, flameAtRisk: true).isRaised)
    }
}
