import XCTest
@testable import Meeshy
import MeeshySDK

/// Les mises à jour optimistes de la vague 2 (#9481) : ce que l'écran montre AVANT la réponse du serveur,
/// recalculé par la MÊME loi — jamais un nombre inventé, et rien quand le geste n'a pas de sens.
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
        XCTAssertEqual(next.game.glory.glory, state.game.glory.glory + 1000)
        XCTAssertEqual(next.game.trophies?.order.first, "trophy.prestige.1")
        XCTAssertTrue(next.game.trophies?.items.contains { $0.key == "trophy.prestige.1" } ?? false)
    }

    func test_afterPrestige_keepsWhatThePassageDoesNotTouch() {
        let state = GameWave2Fixture.state(GameWave2Fixture.atLevel100())
        let next = GameWave2Optimistic.afterPrestige(state)
        XCTAssertEqual(next.game.treasury, state.game.treasury, "le trésor reste")
        XCTAssertEqual(next.game.flame, state.game.flame, "la Flamme reste")
        XCTAssertEqual(next.game.glory.rank, state.game.glory.rank)
        XCTAssertEqual(next.meesh, state.meesh)
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
}
