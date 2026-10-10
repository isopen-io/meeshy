import Foundation
import Testing
@testable import MeeshySDK

/// « N'afficher que ce qui a du sens » (#9536) : UNE fonction décide (`GamePlayerBanner.make(game:)`), un témoin par
/// règle — et le bandeau ne paraît qu'à l'ouverture (`GamePlayerBannerOpening`).
@Suite("Jeu Meeshy — le bandeau ne dit que ce qui a du sens")
struct GamePlayerBannerMeaningTests {

    private func block() throws -> GameBlock {
        try #require(GameBlock.parse(GameBlockFixture.data))
    }

    private func level(_ level: Int, score: Int, prestige: Int = 0) throws -> GameBlock.Level {
        let base = try block().level
        return GameBlock.Level(
            level: level, tier: base.tier, score: score, floorScore: 0, nextThreshold: score + 100, pointsToNext: 100,
            progress: 0, record: level, prestige: prestige, canPrestige: false
        )
    }

    private func flame(days: Int, form: FlameFormKey?, status: FlameStatus) -> GameBlock.Flame {
        GameBlock.Flame(days: days, form: form, bonusPercent: 0, freezes: 0, maxFreezes: 2, freezePrice: 1, relightPrice: 3,
                        status: status, canRelight: false)
    }

    /// Un joueur qui n'a encore rien fait : niveau 1, aucun point, aucune Meesh, aucune Gloire, aucune ligue, aucune Flamme.
    private func nothing(
        level levelBlock: GameBlock.Level? = nil, treasury: TreasuryStanding? = nil, glory: GameBlock.Glory? = nil,
        flame flameBlock: GameBlock.Flame? = nil
    ) throws -> GameBlock {
        let base = try block()
        return GameBlock(
            level: try levelBlock ?? level(1, score: 0),
            glory: glory ?? GameBlock.Glory(glory: 0, rank: .murmure, division: .iii, next: nil, gloryMissing: nil, progress: 0),
            treasury: treasury ?? GameTreasury.standing(held: 0), mint: base.mint, missions: base.missions, chest: base.chest,
            flame: flameBlock ?? flame(days: 0, form: nil, status: .none), boosts: base.boosts, guideSeen: base.guideSeen,
            wave2: GameWave2(league: nil)
        )
    }

    // MARK: - Toutes les données à zéro ⇒ aucun bandeau

    @Test("toutes les données à zéro : aucun bandeau")
    func everythingAtZeroMeansNoBanner() throws {
        #expect(GamePlayerBanner.make(game: try nothing()) == nil)
    }

    @Test("le moindre morceau qui a du sens suffit à ouvrir le bandeau")
    func anySinglePieceOpensTheBanner() throws {
        #expect(GamePlayerBanner.make(game: try nothing(level: try level(1, score: 12))) != nil, "un point gagné")
        #expect(GamePlayerBanner.make(game: try nothing(level: try level(2, score: 0))) != nil, "le niveau 2")
        #expect(GamePlayerBanner.make(game: try nothing(treasury: GameTreasury.standing(held: 1))) != nil, "une Meesh")
        let glory = GameBlock.Glory(glory: 10, rank: .murmure, division: .iii, next: nil, gloryMissing: nil, progress: 0)
        #expect(GamePlayerBanner.make(game: try nothing(glory: glory)) != nil, "une Gloire")
        #expect(GamePlayerBanner.make(game: try nothing(flame: flame(days: 3, form: .braise, status: .lit))) != nil, "une Flamme")
    }

    // MARK: - Une règle, un témoin

    @Test("pas de Flamme ⇒ pas de Flamme dans le bandeau")
    func noFlameNoFlame() throws {
        let banner = try #require(GamePlayerBanner.make(game: try nothing(level: try level(5, score: 400))))
        #expect(banner.flame == nil)
    }

    @Test("pas de points ⇒ pas de total de points")
    func noPointsNoTotal() throws {
        let banner = try #require(GamePlayerBanner.make(game: try nothing(treasury: GameTreasury.standing(held: 2))))
        #expect(banner.showsScore == false)
        let earned = try #require(GamePlayerBanner.make(game: try nothing(level: try level(1, score: 40))))
        #expect(earned.showsScore)
    }

    @Test("niveau 1 ⇒ pas de détail de niveau (ni anneau ni jauge)")
    func levelOneHasNoLevelDetail() throws {
        let banner = try #require(GamePlayerBanner.make(game: try nothing(level: try level(1, score: 40))))
        #expect(banner.showsLevel == false)
        let climbing = try #require(GamePlayerBanner.make(game: try nothing(level: try level(2, score: 140))))
        #expect(climbing.showsLevel)
    }

    @Test("un Prestige ramène au niveau 1 mais garde ses étoiles : le détail reste")
    func prestigeKeepsTheLevelDetail() throws {
        let banner = try #require(GamePlayerBanner.make(game: try nothing(level: try level(1, score: 0, prestige: 1))))
        #expect(banner.showsLevel)
    }

    @Test("pas de Meeshes ⇒ pas de Meeshes")
    func noMeeshesNoMeeshes() throws {
        let banner = try #require(GamePlayerBanner.make(game: try nothing(level: try level(5, score: 400))))
        #expect(banner.meeshes == nil)
    }

    @Test("pas de Gloire ⇒ pas de blason ; pas de ligue ⇒ pas de ligue")
    func noGloryNoBlasonNoLeagueNoLeague() throws {
        let banner = try #require(GamePlayerBanner.make(game: try nothing(level: try level(5, score: 400))))
        #expect(banner.rank == nil)
        #expect(banner.league == nil)
    }

    @Test("un joueur complet garde tout : rien n'est retiré à qui a tout")
    func aCompletePlayerKeepsEverything() throws {
        let banner = try #require(GamePlayerBanner.make(game: try block()))
        #expect(banner.showsLevel && banner.showsScore)
        #expect(banner.meeshes == 9)
        #expect(banner.rank != nil)
    }

    // MARK: - À l'ouverture seulement

    private let launch = Date(timeIntervalSince1970: 1_700_000_000)

    @Test("le bandeau s'ouvre avec l'application et reste trente secondes")
    func opensWithTheAppAndLingersThirtySeconds() {
        let opening = GamePlayerBannerOpening(openedAt: launch)
        #expect(opening.isOpen(at: launch))
        #expect(opening.remaining(at: launch) == 30)
        #expect(opening.remaining(at: launch.addingTimeInterval(12)) == 18)
        #expect(opening.isOpen(at: launch.addingTimeInterval(29.9)))
        #expect(opening.isOpen(at: launch.addingTimeInterval(30)) == false)
        #expect(opening.remaining(at: launch.addingTimeInterval(500)) == 0)
    }

    @Test("une horloge qui recule ne prolonge jamais le bandeau")
    func aClockGoingBackwardsNeverExtendsTheBanner() {
        let opening = GamePlayerBannerOpening(openedAt: launch)
        #expect(opening.remaining(at: launch.addingTimeInterval(-60)) == 30)
    }

    @Test("un retour après quelques secondes ne le rouvre pas")
    func aShortTripDoesNotReopenIt() {
        var opening = GamePlayerBannerOpening(openedAt: launch)
        opening.appWentAway(at: launch.addingTimeInterval(40))
        let reopened = opening.appCameBack(at: launch.addingTimeInterval(100))
        #expect(reopened == false)
        #expect(opening.isOpen(at: launch.addingTimeInterval(100)) == false)
    }

    @Test("une vraie absence le rouvre pour trente secondes")
    func aRealAbsenceReopensIt() {
        var opening = GamePlayerBannerOpening(openedAt: launch)
        opening.appWentAway(at: launch.addingTimeInterval(40))
        let back = launch.addingTimeInterval(40 + GamePlayerBannerOpening.realAbsence)
        let reopened = opening.appCameBack(at: back)
        #expect(reopened)
        #expect(opening.isOpen(at: back))
        #expect(opening.remaining(at: back) == 30)
    }

    @Test("un second départ ne repousse pas l'instant du départ")
    func aSecondDepartureKeepsTheFirstInstant() {
        var opening = GamePlayerBannerOpening(openedAt: launch)
        opening.appWentAway(at: launch.addingTimeInterval(40))
        opening.appWentAway(at: launch.addingTimeInterval(300))
        let reopened = opening.appCameBack(at: launch.addingTimeInterval(40 + GamePlayerBannerOpening.realAbsence))
        #expect(reopened)
    }

    @Test("un retour sans départ (le démarrage à froid) ne rouvre rien")
    func aReturnWithoutDepartureReopensNothing() {
        var opening = GamePlayerBannerOpening(openedAt: launch)
        let reopened = opening.appCameBack(at: launch.addingTimeInterval(1_000))
        #expect(reopened == false)
    }

    @Test("la sortie dure entre 0,8 et 1,2 seconde")
    func theExitIsSlow() {
        #expect(GamePlayerBannerOpening.exitDuration >= 0.8)
        #expect(GamePlayerBannerOpening.exitDuration <= 1.2)
    }
}
