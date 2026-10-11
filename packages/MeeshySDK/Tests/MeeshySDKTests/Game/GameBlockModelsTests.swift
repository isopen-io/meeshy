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
        #expect(block.level.nextThreshold == 122_500)
        #expect(block.glory.rank == .voix)
        #expect(block.glory.division == .iii)
        #expect(block.glory.division5 == .v)
        #expect(block.glory.next == GloryStep(rank: .voix, division: .iii, division5: .iv, minGlory: 7800))
        #expect(block.treasury.tier == .bourse)
        #expect(block.treasury.next?.key == .escarcelle)
        #expect(block.mint.number == 13)
        #expect(block.mint.price == 1587)
        #expect(block.mint.edition == .silver)
        #expect(block.missions.items.count == 3)
        #expect(block.missions.items[0].isCompleted)
        #expect(!block.missions.items[1].isCompleted)
        #expect(block.missions.items[2].signal == .axis(.post))
        #expect(block.chest.status == .locked)
        #expect(block.chest.reward == nil)
        // Le coffre de la fixture est celui d'un serveur d'avant #10011 : quatre champs, rien de plus.
        #expect(block.chest.odds == ChestOdds(minPoints: 60, maxPoints: 200, fragment: 1.0 / 6.0, freeze: 0.05))
        #expect(block.chest.today == nil)
        #expect(block.starFragments == nil)
        #expect(block.flame.form == .braise)
        #expect(block.flame.status == .lit)
        #expect(block.boosts.tailwind == 1.25)
        #expect(block.boosts.prismHour?.window == PrismHourWindow(startMinute: 1185, endMinute: 1245))
        #expect(block.guideSeen == ["onboarding.welcome", "first-level"])
    }

    @Test("ce que la passerelle sert est ce que la loi Swift rend, aperçu de frappe compris")
    func servedBlockAgreesWithTheLaw() throws {
        let block = try #require(GameBlock.parse(GameBlockFixture.data))

        #expect(block.mint == GameMint.preview(score: 121_800, mintedLifetime: 12, debitablePoints: 121_800,
                                               levelCap: GameGlory.levelCap(forRank: block.glory.rank)))
        #expect(GameLevels.progress(forScore: block.level.score, cap: GameGlory.levelCap(forRank: block.glory.rank)).level == block.level.level)
        #expect(block.level.ladder == nil)
        #expect(block.level.shown.level == block.level.level)
        #expect(GameGlory.standing(glory: block.glory.glory, mythic: false).rank == block.glory.rank)
        #expect(GameTreasury.standing(held: block.treasury.held) == block.treasury)
        #expect(GameFlame.bonusPercent(forDays: block.flame.days) == block.flame.bonusPercent)
        #expect(block.boosts.tailwind == GameBoosts.tailwind(level: block.level.level, levelRecord: block.level.record))
        #expect(block.boosts.prismHour?.window == GameBoosts.prismHour(userId: "u1", dayKey: "2026-10-05"))
    }

    @Test("un bloc à jour porte la lecture ouverte par le rang dans ladder, les champs d'hier restent sous l'ancienne loi (#9688)")
    func ladderCarriesTheRankOpenedLevel() throws {
        let json = String(decoding: GameBlockFixture.data, as: UTF8.self).replacingOccurrences(
            of: "\"canPrestige\":false}",
            with: "\"canPrestige\":false,\"ladder\":{\"level\":640,\"tier\":\"amas\",\"floorScore\":4096000,\"nextThreshold\":4108810,\"pointsToNext\":100,\"progress\":0.99,\"record\":640,\"cap\":1000,\"isMax\":false}}"
        )
        let block = try #require(GameBlock.parse(Data(json.utf8)))
        #expect(block.level.level == 34)
        #expect(block.level.ladder?.level == 640)
        #expect(block.level.shown.tier == .amas)
        #expect(block.level.shown.cap == 1000)
    }

    @Test("un bloc à moitié compris n'est jamais lu : une clé de palier inconnue, un champ manquant")
    func partialBlockIsNeverHalfRead() {
        #expect(GameBlock.parse(GameBlockFixture.withUnknownTier) == nil)
        #expect(GameBlock.parse(GameBlockFixture.withoutFlame) == nil)
        #expect(GameBlock.parse(Data("{}".utf8)) == nil)
        #expect(GameBlock.parse(Data("n'importe quoi".utf8)) == nil)
    }

    @Test("un ancien serveur sans division5 : la division héritée se relit telle quelle, aucune place")
    func oldServerFallsBackToTheLegacyDivision() throws {
        let patched = GameBlockFixture.json.replacingOccurrences(of: #""division":3,"division5":5,"#, with: #""division":2,"#)
        let block = try #require(GameBlock.parse(Data(patched.utf8)))
        #expect(block.glory.division5 == nil)
        #expect(block.glory.shownDivision == .ii)
        #expect(block.glory.mythicSeat == nil)
    }

    @Test("le Mythe servi porte sa place et son émission ; une place illisible se tait sans faire tomber le bloc")
    func mythicSeatIsReadOrSilenced() throws {
        let mythe = #""glory":{"glory":1000000,"rank":"mythe","division":null,"division5":null,"next":null,"gloryMissing":null,"progress":1,"mythic":{"number":42,"edition":57}}"#
        let served = GameBlockFixture.json.replacingOccurrences(
            of: #""glory":{"glory":7000,"rank":"voix","division":3,"division5":5,"next":{"rank":"voix","division":3,"division5":4,"minGlory":7800},"gloryMissing":800,"progress":0.5555555555555556}"#,
            with: mythe)
        let block = try #require(GameBlock.parse(Data(served.utf8)))
        #expect(block.glory.mythicSeat == MythicSeatRef(number: 42, edition: 57))
        #expect(block.glory.shownDivision == nil)
        let broken = served.replacingOccurrences(of: #""mythic":{"number":42,"edition":57}"#, with: #""mythic":{"number":42}"#)
        let tolerant = try #require(GameBlock.parse(Data(broken.utf8)))
        #expect(tolerant.glory.rank == .mythe && tolerant.glory.mythicSeat == nil)
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

    @Test("un coffre d'aujourd'hui dit son contenu certain, ses primes possibles et ses bornes (#10011)")
    func chestSaysItsContentBeforeOpening() throws {
        let patched = GameBlockFixture.json.replacingOccurrences(
            of: "\"freeze\":0.05},\"reward\":null",
            with: "\"freeze\":0.05,\"minGlory\":50,\"maxGlory\":1000,\"bonusWhole\":0.05,\"bonusFifth\":0.16666666666666666},\"reward\":null,\"today\":{\"points\":2083,\"glory\":208,\"bonusWhole\":1221,\"bonusFifth\":244}"
        )
        let block = try #require(GameBlock.parse(Data(patched.utf8)))
        #expect(block.chest.today == ChestContent(points: 2083, glory: 208, bonusWhole: 1221, bonusFifth: 244))
        #expect(block.chest.odds.maxGlory == 1000)
        #expect(block.chest.odds.bonusWhole == 0.05)
    }

    @Test("le bloc sert les fragments d'étoile collectés ; illisibles, ils tombent seuls (#10011)")
    func starFragmentsAreServed() throws {
        let served = GameBlockFixture.json.replacingOccurrences(of: "\"guideSeen\":[", with: "\"starFragments\":{\"collected\":6},\"guideSeen\":[")
        #expect(try #require(GameBlock.parse(Data(served.utf8))).starFragments == StarFragmentsTotal(collected: 6))
        let broken = GameBlockFixture.json.replacingOccurrences(of: "\"guideSeen\":[", with: "\"starFragments\":{\"collected\":\"six\"},\"guideSeen\":[")
        #expect(try #require(GameBlock.parse(Data(broken.utf8))).starFragments == nil)
    }

    @Test("un contenu du jour illisible tombe seul : le bloc reste lu")
    func unreadableChestContentFallsAlone() throws {
        let patched = GameBlockFixture.json.replacingOccurrences(
            of: "\"freeze\":0.05},\"reward\":null",
            with: "\"freeze\":0.05},\"reward\":null,\"today\":{\"points\":\"beaucoup\"}"
        )
        let block = try #require(GameBlock.parse(Data(patched.utf8)))
        #expect(block.chest.today == nil)
    }

    @Test("le bloc survit à un aller-retour par le cache")
    func roundTripsThroughTheCache() throws {
        let block = try #require(GameBlock.parse(GameBlockFixture.data))
        let again = try JSONDecoder().decode(GameBlock.self, from: JSONEncoder().encode(block))
        #expect(again == block)
    }
}
