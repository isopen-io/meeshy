import Foundation
import Testing
@testable import MeeshySDK

/// Le premier Rêve, sous le niveau 5 (#17370, tranche iOS #20119) — miroir de `packages/shared/__tests__/game/contract.test.ts`
/// (champ `fullDreamIn` tolérant) et de `apps/web/src/lib/view/player-banner.test.ts` (sa pièce du bandeau).
@Suite("Jeu Meeshy — le premier Rêve d'un acte, sous le niveau 5")
struct GameFirstDreamTests {

    private func missionsJSON(unlocked: Bool, items: String, extra: String = "") -> String {
        """
        {"dayKey":"2026-11-21","prismDay":false,"unlocked":\(unlocked),"items":\(items),"rerollAvailable":false\(extra)}
        """
    }

    private let easyAct = """
    [{"id":"m0","templateKey":"send-texts","difficulty":"easy","signal":"axis:content.text_message","prism":false,\
    "target":3,"progress":0,"reward":30,"glory":40,"completedAt":null}]
    """

    private func decode(_ json: String) throws -> GameBlock.Missions {
        try JSONDecoder().decode(GameBlock.Missions.self, from: Data(json.utf8))
    }

    @Test("sous le niveau 5, la passerelle sert les étincelles qui manquent avant le Rêve complet")
    func decodesFullDreamIn() throws {
        let missions = try decode(missionsJSON(unlocked: false, items: easyAct, extra: ",\"fullDreamIn\":600"))
        #expect(missions.fullDreamIn == 600)
        #expect(missions.items.count == 1)
    }

    @Test("un serveur antérieur ne sert pas le champ : il reste absent, le bloc se lit")
    func toleratesAnOlderServer() throws {
        #expect(try decode(missionsJSON(unlocked: false, items: "[]")).fullDreamIn == nil)
    }

    @Test("une valeur illisible ou négative tombe seule, sans emporter le Rêve")
    func toleratesAnUnreadableValue() throws {
        #expect(try decode(missionsJSON(unlocked: false, items: easyAct, extra: ",\"fullDreamIn\":\"600\"")).fullDreamIn == nil)
        #expect(try decode(missionsJSON(unlocked: false, items: easyAct, extra: ",\"fullDreamIn\":-3")).fullDreamIn == nil)
    }

    @Test("le champ survit au cache : encoder puis relire le rend à l'identique")
    func roundTrips() throws {
        let missions = try decode(missionsJSON(unlocked: false, items: easyAct, extra: ",\"fullDreamIn\":600"))
        let again = try JSONDecoder().decode(GameBlock.Missions.self, from: JSONEncoder().encode(missions))
        #expect(again == missions)
    }

    @Test("le bandeau : le premier Rêve a sa pièce, qui dit son acte unique")
    func bannerShowsTheFirstDream() throws {
        let banner = GamePlayerBanner(game: try game(missions: decode(missionsJSON(unlocked: false, items: easyAct))))
        #expect(banner.dailyMission == GamePlayerBanner.DailyMission(done: 0, total: 1))
    }

    @Test("le bandeau, devant un serveur antérieur sous le niveau 5 : aucun acte servi, aucune pièce")
    func bannerWithoutActs() throws {
        let banner = GamePlayerBanner(game: try game(missions: decode(missionsJSON(unlocked: false, items: "[]"))))
        #expect(banner.dailyMission == nil)
    }

    private func game(missions: GameBlock.Missions) throws -> GameBlock {
        let base = try #require(GameBlock.parse(GameBlockFixture.data))
        return GameBlock(
            level: base.level, glory: base.glory, treasury: base.treasury, mint: base.mint, missions: missions,
            chest: base.chest, flame: base.flame, boosts: base.boosts, guideSeen: base.guideSeen
        )
    }
}
