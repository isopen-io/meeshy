import Foundation
import Testing
@testable import MeeshySDK

/// Le bandeau d'ouverture (#10846) : chaque pièce est son propre bouton vers SA fiche — étincelles → points, rang →
/// gloire, niveau → niveau, Meeshes → meesh, Flamme → flamme, ligue → ligue, trophées → vitrine, mission du jour →
/// missions, saison → saison. Seulement les pièces qui existent, dans l'ordre du bandeau.
@Suite("Jeu Meeshy — les pièces du bandeau")
struct GamePlayerBannerPiecesTests {

    @Test("chaque pièce mène à sa fiche")
    func eachPieceOpensItsConcept() {
        let expected: [GamePlayerBanner.Piece: ProgressionConcept] = [
            .sparks: .points, .rank: .glory, .level: .level, .meesh: .meesh, .flame: .flame,
            .league: .league, .trophies: .showcase, .mission: .missions, .season: .season,
        ]
        for piece in GamePlayerBanner.Piece.allCases {
            #expect(piece.concept == expected[piece], "\(piece)")
        }
        #expect(GamePlayerBanner.Piece.allCases.count == 9)
    }

    @Test("seulement les pièces qui existent, dans l'ordre du bandeau")
    func onlyThePiecesThatExist() {
        let full = GamePlayerBanner(level: 12, tier: .lueur, progress: 0.4, score: 900, nextLevel: 13, pointsToNext: 200,
                                    meeshes: 3, rank: .init(rank: .voix, division: .ii), league: .init(league: .jade, place: 4),
                                    flame: .init(form: .braise, days: 5), trophies: 2,
                                    dailyMission: .init(done: 1, total: 3), season: .init(number: 1))
        #expect(full.pieces == [.level, .sparks, .meesh, .rank, .league, .flame, .trophies, .mission, .season])

        let bare = GamePlayerBanner(level: 1, tier: .etincelle, progress: 0, score: 40, nextLevel: 2, pointsToNext: 60)
        #expect(bare.pieces == [.sparks], "niveau 1 : ni anneau ni jauge ; des étincelles : leur total")
    }

    @Test("le total montré est la POCHE, jamais le cycle")
    func theTotalIsThePocket() throws {
        let level = GameBlock.Level(level: 9, tier: .etincelle, score: 8_200, floorScore: 8_100, nextThreshold: 10_000,
                                    pointsToNext: 1_800, progress: 0.05, record: 9, prestige: 0, canPrestige: false,
                                    sparks: 5_000, sparksCycle: 8_200)
        let base = try #require(GameBlock.parse(GameBlockFixture.data))
        let game = GameBlock(level: level, glory: base.glory, treasury: base.treasury, mint: base.mint, missions: base.missions,
                             chest: base.chest, flame: base.flame, boosts: base.boosts, guideSeen: base.guideSeen,
                             wave2: GameWave2())
        #expect(GamePlayerBanner(game: game).score == 5_000)
    }

    @Test("la mission du jour et la saison ne font jamais naître un bandeau")
    func missionsAndSeasonAloneSayNothing() {
        let quiet = GamePlayerBanner(level: 1, tier: .etincelle, progress: 0, score: 0, nextLevel: 2, pointsToNext: 100,
                                     dailyMission: .init(done: 0, total: 3), season: .init(number: 1))
        #expect(!quiet.hasAnythingToSay)
    }
}
