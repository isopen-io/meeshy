import Foundation
import Testing
@testable import MeeshySDK

/// La bannière du joueur (#9494) : seulement ce qui existe, dans l'ordre de la conception — miroir de
/// `apps/web/src/lib/view/player-banner.test.ts`.
@Suite("Jeu Meeshy — la bannière du joueur")
struct GamePlayerBannerTests {

    private func block() throws -> GameBlock {
        try #require(GameBlock.parse(GameBlockFixture.data))
    }

    /// Le bloc du joueur de la fixture (niveau 34, 9 Meeshes, Gloire 1 730, Flamme de 4 jours), recomposé avec ce qu'un test veut changer.
    private func game(
        level: GameBlock.Level? = nil, glory: GameBlock.Glory? = nil, treasury: TreasuryStanding? = nil,
        flame: GameBlock.Flame? = nil, league: GameLeagueBlock? = nil
    ) throws -> GameBlock {
        let base = try block()
        return GameBlock(
            level: level ?? base.level, glory: glory ?? base.glory, treasury: treasury ?? base.treasury, mint: base.mint,
            missions: base.missions, chest: base.chest, flame: flame ?? base.flame, boosts: base.boosts, guideSeen: base.guideSeen,
            wave2: GameWave2(league: league)
        )
    }

    private func flame(days: Int, form: FlameFormKey?, status: FlameStatus) -> GameBlock.Flame {
        GameBlock.Flame(days: days, form: form, bonusPercent: 0, freezes: 0, maxFreezes: 2, freezePrice: 1, relightPrice: 3,
                        status: status, canRelight: false)
    }

    private func league(access: LeagueAccess, current: GameLeagueBlock.Current?) -> GameLeagueBlock {
        GameLeagueBlock(
            unlocked: true, access: access, pseudonym: nil, weekKey: "2026-W41",
            closes: .init(dayKey: "2026-10-11", minuteOfDay: 1200), current: current,
            friends: .init(rank: 1, size: 1, weekPoints: 0)
        )
    }

    private func current(_ league: LeagueKey, rank: Int) -> GameLeagueBlock.Current {
        GameLeagueBlock.Current(league: league, groupId: "g1", groupSize: 30, rank: rank, weekPoints: 120, zone: .safe, cup: nil, pointsToPromotion: 5)
    }

    @Test("le niveau, le palier, les points et ce qu'il manque viennent du bloc servi")
    func levelAndGauge() throws {
        let banner = GamePlayerBanner(game: try block())
        #expect(banner.level == 34)
        #expect(banner.tier == .eclat)
        #expect(banner.score == 12180)
        #expect(banner.nextLevel == 35)
        #expect(banner.pointsToNext == 70)
        #expect(banner.percent == 89)
    }

    @Test("au sommet, la jauge est pleine et plus rien ne manque")
    func atTheTop() throws {
        let top = GameBlock.Level(level: 100, tier: .galaxie, score: 100_000, floorScore: 100_000, nextThreshold: nil,
                                  pointsToNext: 0, progress: 0.3, record: 100, prestige: 0, canPrestige: true)
        let banner = GamePlayerBanner(game: try game(level: top))
        #expect(banner.progress == 1)
        #expect(banner.nextLevel == nil)
        #expect(banner.pointsToNext == nil)
        #expect(banner.percent == 100)
    }

    @Test("une jauge hors de [0, 1] ou illisible ne casse rien")
    func progressIsBounded() throws {
        func banner(progress: Double) throws -> GamePlayerBanner {
            let base = try block().level
            let level = GameBlock.Level(level: base.level, tier: base.tier, score: base.score, floorScore: base.floorScore,
                                        nextThreshold: base.nextThreshold, pointsToNext: base.pointsToNext, progress: progress,
                                        record: base.record, prestige: base.prestige, canPrestige: base.canPrestige)
            return GamePlayerBanner(game: try game(level: level))
        }
        #expect(try banner(progress: 1.7).progress == 1)
        #expect(try banner(progress: -0.2).progress == 0)
        #expect(try banner(progress: .nan).progress == 0)
    }

    @Test("un nouveau joueur ne voit que son anneau et sa jauge : jamais un zéro, un tiret ou une case vide")
    func aNewPlayerSeesOnlyTheRingAndTheGauge() throws {
        let glory = GameBlock.Glory(glory: 0, rank: .murmure, division: .iii, next: nil, gloryMissing: nil, progress: 0)
        let banner = GamePlayerBanner(game: try game(
            glory: glory, treasury: GameTreasury.standing(held: 0), flame: flame(days: 0, form: nil, status: .none)
        ))
        #expect(banner.meeshes == nil)
        #expect(banner.rank == nil)
        #expect(banner.league == nil)
        #expect(banner.flame == nil)
    }

    @Test("le trésor paraît à la première Meesh gardée, le rang à la première Gloire")
    func treasuryAndRank() throws {
        let banner = GamePlayerBanner(game: try block())
        #expect(banner.meeshes == 9)
        #expect(banner.rank == GamePlayerBanner.Rank(rank: .voix, division: .iii))
    }

    @Test("Mythe n'a pas de division")
    func mythHasNoDivision() throws {
        let glory = GameBlock.Glory(glory: 90_000, rank: .mythe, division: nil, next: nil, gloryMissing: nil, progress: 1)
        let banner = GamePlayerBanner(game: try game(glory: glory))
        #expect(banner.rank == GamePlayerBanner.Rank(rank: .mythe, division: nil))
    }

    @Test("la ligue ne paraît qu'avec le consentement ET un groupe")
    func leagueNeedsConsentAndAGroup() throws {
        let placed = current(.jade, rank: 4)
        #expect(GamePlayerBanner(game: try game(league: league(access: .open, current: placed))).league
            == GamePlayerBanner.League(league: .jade, place: 4))
        #expect(GamePlayerBanner(game: try game(league: league(access: .open, current: nil))).league == nil)
        for access in [LeagueAccess.locked, .minor, .consentRequired] {
            #expect(GamePlayerBanner(game: try game(league: league(access: access, current: placed))).league == nil, "\(access)")
        }
        #expect(GamePlayerBanner(game: try block()).league == nil, "un ancien serveur ne sert pas la ligue")
    }

    @Test("la Flamme paraît quand elle brûle — allumée, menacée ou couverte — jamais éteinte")
    func flameOnlyWhenBurning() throws {
        for status in [FlameStatus.lit, .atRisk, .covered] {
            let banner = GamePlayerBanner(game: try game(flame: flame(days: 23, form: .flamme, status: status)))
            #expect(banner.flame == GamePlayerBanner.Flame(form: .flamme, days: 23), "\(status)")
        }
        for status in [FlameStatus.none, .out] {
            #expect(GamePlayerBanner(game: try game(flame: flame(days: 23, form: .flamme, status: status))).flame == nil, "\(status)")
        }
        #expect(GamePlayerBanner(game: try game(flame: flame(days: 0, form: .braise, status: .lit))).flame == nil)
        #expect(GamePlayerBanner(game: try game(flame: flame(days: 5, form: nil, status: .lit))).flame == nil)
    }
}
