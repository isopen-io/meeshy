import XCTest
@testable import Meeshy
import MeeshySDK

/// Les mises à jour optimistes de la vague 2 (#9481) : ce que l'écran montre AVANT la réponse du serveur,
/// recalculé par la MÊME loi — jamais un nombre inventé, et rien quand le geste n'a pas de sens.
@MainActor
final class GameWave2OptimisticTests: XCTestCase {

    // MARK: - La ligue

    func test_afterConsent_opensTheLeagueWithoutInventingThePseudonym() {
        let state = GameWave2Fixture.state(GameWave2Fixture.game(league: GameWave2Fixture.league(access: .consentRequired, pseudonym: nil, current: nil)))
        let next = GameWave2Optimistic.afterConsent(state, consent: true, pseudonym: nil)
        XCTAssertEqual(next.game.league?.access, .open)
        XCTAssertNil(next.game.league?.pseudonym, "le tirage au sort est celui du serveur, jamais deviné")
    }

    func test_afterConsent_aLockedOrMinorLeagueDoesNotOpenLocally() {
        for access in [LeagueAccess.locked, .minor] {
            let state = GameWave2Fixture.state(GameWave2Fixture.game(league: GameWave2Fixture.league(access: access, pseudonym: nil, current: nil)))
            XCTAssertEqual(GameWave2Optimistic.afterConsent(state, consent: true, pseudonym: nil), state, "\(access)")
        }
    }

    func test_afterConsent_withdrawingClosesTheLeagueAndForgetsTheGroupAndThePseudonym() {
        let state = GameWave2Fixture.state()
        let next = GameWave2Optimistic.afterConsent(state, consent: false, pseudonym: nil)
        XCTAssertEqual(next.game.league?.access, .consentRequired)
        XCTAssertNil(next.game.league?.pseudonym)
        XCTAssertNil(next.game.league?.current)
    }

    func test_afterConsent_withdrawingWhenNotInTheLeagueChangesNothing() {
        let state = GameWave2Fixture.state(GameWave2Fixture.game(league: GameWave2Fixture.league(access: .consentRequired, pseudonym: nil, current: nil)))
        XCTAssertEqual(GameWave2Optimistic.afterConsent(state, consent: false, pseudonym: nil), state)
    }

    func test_withConsentResult_postsTheServedPseudonym() {
        let state = GameWave2Fixture.state(GameWave2Fixture.game(league: GameWave2Fixture.league(pseudonym: nil)))
        let next = GameWave2Optimistic.withConsentResult(state, consent: true, pseudonym: "Colibri-0042")
        XCTAssertEqual(next.game.league?.pseudonym, "Colibri-0042")
    }

    func test_withPseudonym_onlyInsideAnOpenLeague() {
        let closed = GameWave2Fixture.state(GameWave2Fixture.game(league: GameWave2Fixture.league(access: .consentRequired, pseudonym: nil, current: nil)))
        XCTAssertEqual(GameWave2Optimistic.withPseudonym(closed, pseudonym: "Zephyr"), closed)
        XCTAssertEqual(GameWave2Optimistic.withPseudonym(GameWave2Fixture.state(), pseudonym: "Zephyr").game.league?.pseudonym, "Zephyr")
    }

    // MARK: - Le duo

    func test_afterInvite_marksTheDuoInvitedAsTheInviter_withoutADuoIdOrAMission() {
        let next = GameWave2Optimistic.afterInvite(GameWave2Fixture.state(), friendId: "f9", friendName: "Léa")
        XCTAssertEqual(next.game.duo?.status, .invited)
        XCTAssertEqual(next.game.duo?.role, .inviter)
        XCTAssertEqual(next.game.duo?.partner, GameDuoBlock.Partner(userId: "f9", displayName: "Léa"))
        XCTAssertNil(next.game.duo?.duoId)
        XCTAssertNil(next.game.duo?.mission, "la mission du duo est tirée par le serveur")
    }

    func test_afterInvite_isRefusedWhenALockedOrBusyDuo() {
        let locked = GameWave2Fixture.state(GameWave2Fixture.game(duo: GameWave2Fixture.duo(unlocked: false)))
        XCTAssertEqual(GameWave2Optimistic.afterInvite(locked, friendId: "f9", friendName: "Léa"), locked)
        let busy = GameWave2Fixture.state(GameWave2Fixture.game(duo: GameWave2Fixture.duo(status: .active, role: .inviter, duoId: "d1")))
        XCTAssertEqual(GameWave2Optimistic.afterInvite(busy, friendId: "f9", friendName: "Léa"), busy)
    }

    func test_withDuoId_postsTheServedIdentifier() {
        let invited = GameWave2Optimistic.afterInvite(GameWave2Fixture.state(), friendId: "f9", friendName: "Léa")
        XCTAssertEqual(GameWave2Optimistic.withDuoId(invited, duoId: "d42").game.duo?.duoId, "d42")
    }

    func test_afterAccept_onlyTheInviteeActivates() {
        let asInvitee = GameWave2Fixture.state(GameWave2Fixture.game(duo: GameWave2Fixture.duo(status: .invited, role: .invitee, duoId: "d1")))
        XCTAssertEqual(GameWave2Optimistic.afterAccept(asInvitee).game.duo?.status, .active)
        let asInviter = GameWave2Fixture.state(GameWave2Fixture.game(duo: GameWave2Fixture.duo(status: .invited, role: .inviter, duoId: "d1")))
        XCTAssertEqual(GameWave2Optimistic.afterAccept(asInviter), asInviter, "on n'accepte pas sa propre invitation")
    }

    func test_afterAbandon_endsAnInvitedOrActiveDuo_andNothingElse() {
        for status in [DuoBlockStatus.invited, .active] {
            let state = GameWave2Fixture.state(GameWave2Fixture.game(duo: GameWave2Fixture.duo(status: status, role: .inviter, duoId: "d1")))
            XCTAssertEqual(GameWave2Optimistic.afterAbandon(state).game.duo?.status, .abandoned, "\(status)")
        }
        let done = GameWave2Fixture.state(GameWave2Fixture.game(duo: GameWave2Fixture.duo(status: .completed, role: .inviter, duoId: "d1")))
        XCTAssertEqual(GameWave2Optimistic.afterAbandon(done), done)
    }

    // MARK: - La saison

    func test_afterSeasonClaim_claimsAReachedStepAndAdvancesTheNextReward() {
        let state = GameWave2Fixture.state(GameWave2Fixture.game(season: GameWave2Fixture.season(steps: 4, claimed: [1, 2])))
        let next = GameWave2Optimistic.afterSeasonClaim(state, step: 3)
        XCTAssertEqual(next.game.season?.claimedSteps, [1, 2, 3])
        XCTAssertEqual(next.game.season?.nextReward?.step, 4)
        XCTAssertEqual(next.game.season?.nextReward?.reward.kind, .points)
    }

    /// Les points d'étape sont ceux de LA saison (calendrier servi, #10232) : le geste optimiste ne les ramène pas à 100.
    func test_afterSeasonClaim_theNextRewardCarriesTheSeasonsOwnStepPoints() {
        let state = GameWave2Fixture.state(GameWave2Fixture.game(season: GameWave2Fixture.season(steps: 4, claimed: [1, 2], stepPoints: 150)))
        let next = GameWave2Optimistic.afterSeasonClaim(state, step: 3)
        XCTAssertEqual(next.game.season?.nextReward?.reward, GameSeasonBlock.Reward(kind: .points, amount: 150))
        XCTAssertEqual(next.game.season?.stepPoints, 150, "le geste garde les points de la saison")
    }

    func test_aStepShowsTheSeasonsPoints_andTheLawWhenTheServerDoesNotSendThem() {
        XCTAssertEqual(GameWave2Fixture.season(stepPoints: 70).stepReward(1), SeasonReward(kind: .points, amount: 70))
        XCTAssertEqual(GameWave2Fixture.season().stepReward(1), SeasonReward(kind: .points, amount: GameSeason.stepPoints))
        XCTAssertEqual(GameWave2Fixture.season(stepPoints: 70).stepReward(5), SeasonReward(kind: .fragment, amount: 1))
    }

    func test_afterSeasonClaim_refusesAnUnreachedOrAlreadyClaimedStep() {
        let state = GameWave2Fixture.state(GameWave2Fixture.game(season: GameWave2Fixture.season(steps: 4, claimed: [1, 2])))
        XCTAssertEqual(GameWave2Optimistic.afterSeasonClaim(state, step: 9), state)
        XCTAssertEqual(GameWave2Optimistic.afterSeasonClaim(state, step: 2), state)
        XCTAssertEqual(GameWave2Optimistic.afterSeasonClaim(state, step: 0), state)
    }

    func test_afterSeasonClaim_lastReachedStepLeavesNoNextReward() {
        let state = GameWave2Fixture.state(GameWave2Fixture.game(season: GameWave2Fixture.season(steps: 4, claimed: [1, 2, 3])))
        XCTAssertNil(GameWave2Optimistic.afterSeasonClaim(state, step: 4).game.season?.nextReward)
    }

    func test_afterSealBought_paysInMeeshesAtBothPlacesAndOwnsTheSeal() {
        let state = GameWave2Fixture.state(GameWave2Fixture.game(held: 12), balance: 12)
        let next = GameWave2Optimistic.afterSealBought(state)
        XCTAssertEqual(next.game.season?.sealOwned, true)
        XCTAssertEqual(next.game.treasury.held, 2)
        XCTAssertEqual(next.meesh?.balance, 2)
    }

    func test_afterSealBought_withoutTheMeeshesOrAlreadyOwned_changesNothing() {
        let poor = GameWave2Fixture.state(GameWave2Fixture.game(held: 9), balance: 9)
        XCTAssertEqual(GameWave2Optimistic.afterSealBought(poor), poor)
        let owned = GameWave2Fixture.state(GameWave2Fixture.game(season: GameWave2Fixture.season(sealOwned: true), held: 30), balance: 30)
        XCTAssertEqual(GameWave2Optimistic.afterSealBought(owned), owned)
    }

    // MARK: - La vitrine et la visibilité

    func test_withShowcaseOrder_putsTheOrderAsGiven() {
        let state = GameWave2Fixture.state()
        let order = ["trophy.league-cup.2026-10-05.jade.gold", "trophy.flame.100"]
        XCTAssertEqual(GameWave2Optimistic.withShowcaseOrder(state, order: order).game.trophies?.order, order)
        XCTAssertEqual(GameWave2Optimistic.withShowcaseOrder(state, order: state.game.trophies?.order ?? []), state)
    }

    func test_withVisibility_patchesOnlyWhatIsChanged() {
        let next = GameWave2Optimistic.withVisibility(GameWave2Fixture.state(), atlas: .friends)
        XCTAssertEqual(next.game.visibility, GameVisibility(showcase: .friends, rank: .friends, treasury: .me, atlas: .friends))
    }

    // MARK: - Le Prestige

    func test_afterPrestige_restartsTheLevelByTheLawAndPlacesTheStarAndTheTrophy() {
        let state = GameWave2Fixture.state(GameWave2Fixture.atLevel100())
        let next = GameWave2Optimistic.afterPrestige(state, now: Date(timeIntervalSince1970: 1_790_000_000))
        XCTAssertEqual(next.game.level.level, 1)
        XCTAssertEqual(next.game.level.score, 0)
        XCTAssertEqual(next.game.level.record, 1, "le record repart avec le niveau")
        XCTAssertEqual(next.game.level.prestige, 1)
        XCTAssertFalse(next.game.level.canPrestige)
        XCTAssertEqual(next.game.prestige?.stars, 1)
        XCTAssertEqual(next.game.glory.glory, state.game.glory.glory + GameGlory.points.prestige)
        XCTAssertEqual(next.game.trophies?.order.first, "trophy.prestige.1")
        XCTAssertTrue(next.game.trophies?.items.contains { $0.key == "trophy.prestige.1" } ?? false)
    }

    /// Le passage recompose le niveau comme la passerelle (#9688) : la lecture ouverte repart à 1 elle aussi, et
    /// l'aperçu de frappe porte sa propre lecture ouverte.
    func test_afterPrestige_restartsTheOpenedLevelInTheLadderToo() {
        let state = GameWave2Fixture.state(GameWave2Fixture.atLevel100())
        XCTAssertEqual(state.game.level.shown.level, 100)
        let next = GameWave2Optimistic.afterPrestige(state)
        XCTAssertEqual(next.game.level.ladder?.level, 1)
        XCTAssertEqual(next.game.level.ladder?.record, 1)
        XCTAssertEqual(next.game.level.ladder?.cap, GameGlory.levelCap(forRank: next.game.glory.rank))
        XCTAssertNotNil(next.game.mint.ladder)
    }

    func test_afterPrestige_keepsWhatThePassageDoesNotTouch() {
        let state = GameWave2Fixture.state(GameWave2Fixture.atLevel100())
        let next = GameWave2Optimistic.afterPrestige(state)
        XCTAssertEqual(next.game.treasury, state.game.treasury, "le trésor reste")
        XCTAssertEqual(next.game.flame, state.game.flame, "la Flamme reste")
        let lawful = GameGlory.standing(glory: state.game.glory.glory + GameGlory.points.prestige, mythic: false)
        XCTAssertEqual(next.game.glory.rank, lawful.rank, "le rang suit la Gloire du Prestige, par la loi (#9636)")
        XCTAssertEqual(next.game.glory.division5, lawful.division5)
        XCTAssertEqual(next.meesh?.balance, state.meesh?.balance, "le solde reste")
        XCTAssertEqual(next.meesh?.mintCost, next.game.mint.price, "le compteur de Meeshes lit le prix suivant du héro")
    }

    func test_afterPrestige_closesTheLeagueAndTheDuoUntilTheRecordIsBack() {
        let next = GameWave2Optimistic.afterPrestige(GameWave2Fixture.state(GameWave2Fixture.atLevel100()))
        XCTAssertEqual(next.game.league?.access, .locked)
        XCTAssertEqual(next.game.league?.unlocked, false)
        XCTAssertNil(next.game.league?.current)
        XCTAssertEqual(next.game.duo?.unlocked, false)
    }

    func test_afterPrestige_withoutAnOpenProposal_changesNothing() {
        let state = GameWave2Fixture.state()
        XCTAssertEqual(GameWave2Optimistic.afterPrestige(state), state)
        let maxed = GameWave2Fixture.state(GameWave2Fixture.atLevel100(prestige: 5))
        XCTAssertEqual(GameWave2Optimistic.afterPrestige(maxed), maxed)
    }

    // MARK: - Le Prestige devant une passerelle des étincelles (#10902)

    private func sparkedAtLevel100(debt: Int = 0) -> GameState {
        let base = GameWave2Fixture.atLevel100(prestige: 1)
        let pocket = base.level.score
        let game = GameFixture.sparked(base, pocket: pocket, cycle: 1_500_000, lifetime: 2_000_000, debt: debt,
                                       levelRecord: 100, levelMaxLifetime: 104)
        return GameWave2Fixture.state(game)
    }

    func test_afterPrestige_onASparksServer_keepsTheLeagueAndTheDuoOpen_theLifetimeMaxSurvives() {
        let state = sparkedAtLevel100()
        let next = GameWave2Optimistic.afterPrestige(state)
        XCTAssertEqual(next.game.level.prestige, 2)
        XCTAssertEqual(next.game.league, state.game.league, "le niveau max à vie ouvre toujours la ligue")
        XCTAssertEqual(next.game.duo, state.game.duo, "et le duo")
    }

    func test_afterPrestige_onASparksServer_emptiesThePocketAndTheCycle_keepsTheLifetimeAndTheDebt() {
        let next = GameWave2Optimistic.afterPrestige(sparkedAtLevel100(debt: 75))
        XCTAssertEqual(next.game.level.sparks, 0)
        XCTAssertEqual(next.game.level.sparksCycle, 0)
        XCTAssertEqual(next.game.level.sparksLifetime, 2_000_000)
        XCTAssertEqual(next.game.level.sparksDebt, 75)
        XCTAssertEqual(next.game.level.levelMaxLifetime, 104)
        XCTAssertEqual(next.game.level.ladder?.levelMaxLifetime, 104)
        XCTAssertEqual(next.game.mint.blockedBy, .debt, "la dette survit au passage et bloque toujours la frappe")
    }

    func test_afterPrestige_onASparksServer_announcesTheNextCoinAtTheLevelOneFactor() {
        let state = sparkedAtLevel100()
        let next = GameWave2Optimistic.afterPrestige(state)
        let number = state.game.mint.number
        XCTAssertEqual(next.game.mint.number, number, "le passage ne frappe rien : la prochaine pièce reste la même")
        XCTAssertEqual(next.game.mint.price, GameMint.effectivePrice(forNumber: number, level: 1))
        XCTAssertEqual(next.game.boosts.tailwind, 1)
    }

    func test_afterPrestige_onASparksServer_rereadsTheReservesOnTheGloryOfThePassage() {
        let next = GameWave2Optimistic.afterPrestige(sparkedAtLevel100())
        XCTAssertEqual(next.game.treasury.access, GameTreasury.reserveAccess(glory: next.game.glory.glory))
        XCTAssertEqual(next.game.treasury.held, sparkedAtLevel100().game.treasury.held)
    }
}
