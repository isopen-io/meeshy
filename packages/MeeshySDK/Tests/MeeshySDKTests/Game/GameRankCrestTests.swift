import Foundation
import Testing
@testable import MeeshySDK

/// Le blason d'un rang (#9636) — miroir des témoins de `packages/shared/__tests__/game/rank-crest.test.ts`.
@Suite("Jeu Meeshy — la géométrie partagée du blason")
struct GameRankCrestTests {

    private let drawn = GloryRank.ladder

    @Test("chaque rang de Murmure à Légende a sa décoration, deux rangs jamais la même, le Mythe aucune")
    func everyRankHasItsOwnCrest() {
        for rank in drawn { #expect(!GameRankCrest.pieces(for: rank).isEmpty) }
        let distinct = Set(drawn.map { "\(GameRankCrest.pieces(for: $0))" })
        #expect(distinct.count == drawn.count)
        #expect(GameRankCrest.pieces(for: .mythe).isEmpty)
    }

    @Test("de plus en plus riche : jamais moins de pièces que le rang d'en dessous, un trait pour Murmure")
    func crestsGrowRicher() {
        let counts = drawn.map { GameRankCrest.pieces(for: $0).count }
        #expect(counts == counts.sorted())
        #expect(counts.first == 1)
        #expect(counts == [1, 2, 3, 4, 5, 6, 12, 19, 20, 21])
    }

    @Test("le laurier d'Ambassadeur reste sous les décorations des rangs suivants")
    func laurelStaysUnder() {
        let laurel = GameRankCrest.pieces(for: .ambassadeur)
        for rank in [GloryRank.orateur, .oracle, .legende] {
            #expect(Array(GameRankCrest.pieces(for: rank).prefix(laurel.count)) == laurel)
        }
    }

    @Test("V = 1 encoche pleine … I = 5, toujours cinq emplacements partant de la gauche")
    func notchesCountTheDivision() {
        #expect(GloryDivision5.allCases.map { GameRankCrest.notches($0).filter(\.on).count } == [1, 2, 3, 4, 5])
        let iv = GameRankCrest.notches(.iv)
        #expect(iv.map(\.on) == [true, true, false, false, false])
        #expect(iv.map(\.x) == [82, 91, 100, 109, 118])
        #expect(GameRankCrest.notches(nil).isEmpty)
    }

    @Test("le petit format garde la proportion du cadre entier")
    func compactFramesKeepTheRatio() {
        let ratio = GameRankCrest.frame.width / GameRankCrest.frame.height
        #expect(abs(GameRankCrest.compactFrame.width / GameRankCrest.compactFrame.height - ratio) < 1e-6)
        #expect(abs(GameRankCrest.compactMythicFrame.width / GameRankCrest.compactMythicFrame.height - ratio) < 1e-6)
    }

    @Test("le halo d'un Mythe reprend les rayons, la teinte, les perles et le numéro de son émission")
    func haloFollowsTheEdition() throws {
        for edition in [1, 42, 100, 101, 1234] {
            let design = try #require(GameMythe.signature(edition: edition))
            let halo = GameRankCrest.mythicHalo(edition: edition)
            #expect(halo.edition == edition)
            #expect(halo.hue == design.hue)
            #expect(halo.rays.count == design.rays.count)
            #expect(halo.beads.count == design.beads.count)
            #expect(halo.numeral?.text == String(edition))
            #expect(halo.gem?.count == 4)
        }
        let first = try #require(GameRankCrest.mythicHalo(edition: 1).rays.first)
        #expect(first.x1 == 100 && first.x2 == 100 && first.y2 < first.y1)
    }

    @Test("sans émission servie : douze rayons, sans gemme, ni perle, ni numéro")
    func defaultHalo() {
        let halo = GameRankCrest.mythicHalo(edition: nil)
        #expect(halo.rays.count == 12 && halo.gem == nil && halo.beads.isEmpty && halo.numeral == nil && halo.hue == nil)
    }

    @Test("deux émissions voisines ne se dessinent jamais pareil")
    func neighbouringEditionsDiffer() {
        let drawings = Set((1...200).map { "\(GameRankCrest.mythicHalo(edition: $0))" })
        #expect(drawings.count == 200)
    }
}
