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

/// Miroir des cas de `packages/shared/__tests__/game/banner-recall.test.ts` (#17366, retouche 3).
@Suite("Jeu Meeshy — le bandeau revient quand quelque chose change")
struct GameBannerRecallTests {

    private func moment(done: Int = 0, chest: Bool = false, risk: Bool = false) -> GameBannerMoment {
        GameBannerMoment(actsDone: done, attention: GameAttention(chestReady: chest, flameAtRisk: risk))
    }

    @Test("un acte du jour réalisé rappelle le bandeau")
    func actRecalls() {
        #expect(GameBannerRecall.reason(before: moment(done: 1), after: moment(done: 2)) == .act)
    }

    @Test("l'Offrande qui devient prête rappelle le bandeau, et l'emporte sur l'acte qui l'a ouverte")
    func offeringWins() {
        #expect(GameBannerRecall.reason(before: moment(done: 2), after: moment(done: 3, chest: true)) == .offeringReady)
    }

    @Test("la Flamme qui passe à risque rappelle le bandeau, après un acte du même instant")
    func flameAtRisk() {
        #expect(GameBannerRecall.reason(before: moment(), after: moment(risk: true)) == .flameAtRisk)
        #expect(GameBannerRecall.reason(before: moment(), after: moment(done: 1, risk: true)) == .act)
    }

    @Test("un signal déjà levé ou qui retombe ne rappelle rien")
    func nothingNew() {
        #expect(GameBannerRecall.reason(before: moment(chest: true), after: moment(chest: true)) == nil)
        #expect(GameBannerRecall.reason(before: moment(risk: true), after: moment(risk: true)) == nil)
        #expect(GameBannerRecall.reason(before: moment(done: 3), after: moment(done: 0)) == nil)
        #expect(GameBannerRecall.reason(before: moment(chest: true), after: moment()) == nil)
    }

    @Test("la première lecture, un bloc qui disparaît : rien")
    func noComparison() {
        #expect(GameBannerRecall.reason(before: nil, after: moment(done: 2, chest: true, risk: true)) == nil)
        #expect(GameBannerRecall.reason(before: moment(done: 1), after: nil) == nil)
    }

    @Test("« Jeu masqué » : aucun moment, donc aucun rappel")
    func hiddenGameHasNoMoment() throws {
        let game = try #require(GameBlock.parse(GameBlockFixture.data))
        #expect(GameBannerMoment.of(game, hidden: true) == nil)
        #expect(GameBannerMoment.of(game, hidden: false) != nil)
        #expect(GameBannerMoment.of(nil, hidden: false) == nil)
    }

    @Test("le rappel dure quelques secondes, comme le web")
    func duration() {
        #expect(GameBannerRecall.seconds == 5)
    }
}
