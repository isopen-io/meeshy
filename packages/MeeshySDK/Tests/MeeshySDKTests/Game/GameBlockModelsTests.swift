import Foundation
import Testing
@testable import MeeshySDK

/// Le bloc `game` — jamais à moitié lu (#9378).
@Suite("Jeu Meeshy — le bloc game de GET /me/engagement")
struct GameBlockModelsTests {

    @Test("le bloc que la passerelle sert se décode en entier")
    func decodesTheServedBlock() throws {
        let block = try #require(GameBlock.parse(GameBlockFixture.data))

        #expect(block.level.level == 34)
        #expect(block.level.tier == .eclat)
        #expect(block.level.record == 36)
        #expect(block.level.nextThreshold == 12_250)
        #expect(block.glory.rank == .voix)
        #expect(block.glory.division == .iii)
        #expect(block.glory.next == GloryStep(rank: .voix, division: .ii, minGlory: 2166))
        #expect(block.treasury.tier == .bourse)
        #expect(block.treasury.next?.key == .escarcelle)
        #expect(block.mint.number == 13)
        #expect(block.mint.price == 1294)
        #expect(block.mint.edition == .silver)
        #expect(block.missions.items.count == 3)
        #expect(block.missions.items[0].isCompleted)
        #expect(!block.missions.items[1].isCompleted)
        #expect(block.missions.items[2].signal == .axis(.post))
        #expect(block.chest.status == .locked)
        #expect(block.chest.reward == nil)
        #expect(block.chest.odds == GameChest.odds)
        #expect(block.flame.form == .braise)
        #expect(block.flame.status == .lit)
        #expect(block.boosts.tailwind == 1.25)
        #expect(block.boosts.prismHour?.window == PrismHourWindow(startMinute: 1185, endMinute: 1245))
        #expect(block.guideSeen == ["onboarding.welcome", "first-level"])
    }

    @Test("ce que la passerelle sert est ce que la loi Swift rend, aperçu de frappe compris")
    func servedBlockAgreesWithTheLaw() throws {
        let block = try #require(GameBlock.parse(GameBlockFixture.data))

        #expect(block.mint == GameMint.preview(score: 12_180, mintedLifetime: 12, debitablePoints: 12_180))
        #expect(GameLevels.progress(forScore: block.level.score).level == block.level.level)
        #expect(GameGlory.standing(glory: block.glory.glory, mythic: false).rank == block.glory.rank)
        #expect(GameTreasury.standing(held: block.treasury.held) == block.treasury)
        #expect(GameFlame.bonusPercent(forDays: block.flame.days) == block.flame.bonusPercent)
        #expect(block.boosts.tailwind == GameBoosts.tailwind(level: block.level.level, levelRecord: block.level.record))
        #expect(block.boosts.prismHour?.window == GameBoosts.prismHour(userId: "u1", dayKey: "2026-10-05"))
    }

    @Test("un bloc à moitié compris n'est jamais lu : une clé de palier inconnue, un champ manquant")
    func partialBlockIsNeverHalfRead() {
        #expect(GameBlock.parse(GameBlockFixture.withUnknownTier) == nil)
        #expect(GameBlock.parse(GameBlockFixture.withoutFlame) == nil)
        #expect(GameBlock.parse(Data("{}".utf8)) == nil)
        #expect(GameBlock.parse(Data("n'importe quoi".utf8)) == nil)
    }

    @Test("une clé en plus, ajoutée par un serveur plus récent, est ignorée")
    func extraKeysAreIgnored() {
        #expect(GameBlock.parse(GameBlockFixture.withExtraKey) != nil)
    }

    @Test("un signal de mission inconnu reste une chaîne : l'écran ne casse pas")
    func unknownSignalSurvives() throws {
        let patched = GameBlockFixture.json.replacingOccurrences(of: "reply-distinct-conversations", with: "signal-du-futur")
        let block = try #require(GameBlock.parse(Data(patched.utf8)))
        #expect(block.missions.items[1].signal.rawValue == "signal-du-futur")
    }

    @Test("un coffre ouvert montre sa récompense")
    func claimedChestShowsItsReward() throws {
        let patched = GameBlockFixture.json.replacingOccurrences(
            of: "\"status\":\"locked\",\"odds\"", with: "\"status\":\"claimed\",\"odds\"")
            .replacingOccurrences(of: "\"freeze\":0.05},\"reward\":null", with: "\"freeze\":0.05},\"reward\":{\"points\":112,\"fragment\":true,\"freeze\":false}")
        let block = try #require(GameBlock.parse(Data(patched.utf8)))
        #expect(block.chest.status == .claimed)
        #expect(block.chest.reward == DailyChest(points: 112, fragment: true, freeze: false))
    }

    @Test("le bloc survit à un aller-retour par le cache")
    func roundTripsThroughTheCache() throws {
        let block = try #require(GameBlock.parse(GameBlockFixture.data))
        let again = try JSONDecoder().decode(GameBlock.self, from: JSONEncoder().encode(block))
        #expect(again == block)
    }
}
