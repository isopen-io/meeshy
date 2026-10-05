import XCTest
@testable import Meeshy
import MeeshySDK

/// Ce que le guide relève dans l'état du jeu (#9379) : une découverte se dit UNE
/// fois, une urgence se redit à chaque ouverture, et ce que le serveur ne sert pas
/// n'est jamais inventé.
@MainActor
final class GameGuideEventsTests: XCTestCase {

    private func keys(_ events: [GuideEvent]) -> [GuideMomentKey] { events.map(\.key) }

    func test_standing_aFreshLevelOneAccount_hasNothingToSay() {
        let game = GameFixture.game(score: 0, glory: 0, minted: 0, held: 0, flameDays: 0, flameStatus: .none)
        XCTAssertTrue(GameGuideEvents.standing(game: game, seen: [], daysAway: nil).isEmpty)
    }

    func test_standing_aDiscoveryIsToldOnlyWhileItsKeyIsUnseen() {
        let game = GameFixture.game(score: 12_180)
        let fresh = GameGuideEvents.standing(game: game, seen: [], daysAway: nil)
        let told = GameGuideEvents.standing(game: game, seen: Set(GuideMomentKey.allCases.map(\.rawValue)), daysAway: nil)
        XCTAssertTrue(keys(fresh).contains(.firstLevel))
        XCTAssertTrue(keys(fresh).contains(.newTier))
        XCTAssertTrue(keys(fresh).contains(.missionsUnlocked))
        XCTAssertTrue(told.isEmpty, "tout est vu : plus aucune découverte")
    }

    func test_standing_theFlameInDanger_isToldAgainEvenWhenSeen() {
        let game = GameFixture.game(score: 0, glory: 0, minted: 0, held: 0, flameDays: 4, flameStatus: .atRisk)
        let events = GameGuideEvents.standing(game: game, seen: ["flame-at-risk"], daysAway: nil)
        XCTAssertEqual(keys(events), [.flameAtRisk])
    }

    func test_standing_anExtinguishedFlame_carriesItsRelightPriceAndNeverInventsTheLostDays() {
        let game = GameFixture.game(score: 0, glory: 0, minted: 0, held: 0, flameDays: 0, flameStatus: .out, canRelight: true)
        let events = GameGuideEvents.standing(game: game, seen: [], daysAway: nil)
        XCTAssertEqual(events, [.flameOut(lostDays: 0, relightPrice: 3, canRelight: true)])
    }

    func test_standing_returnAfterAWeekAway_isToldButNotBeforeSevenDays() {
        let game = GameFixture.game(score: 0, glory: 0, minted: 0, held: 0, flameDays: 0, flameStatus: .none)
        XCTAssertEqual(keys(GameGuideEvents.standing(game: game, seen: [], daysAway: 7)), [.returnAfterAbsence])
        XCTAssertTrue(GameGuideEvents.standing(game: game, seen: [], daysAway: 6).isEmpty)
    }

    func test_standing_theFirstMintPossible_isAnnouncedWithItsPriceAndTheLevelsItCosts() {
        let game = GameFixture.game(score: 1_300, glory: 0, minted: 0, held: 0)
        let events = GameGuideEvents.standing(game: game, seen: [], daysAway: nil)
        XCTAssertTrue(events.contains(.firstMintPossible(price: game.mint.price, levelsLost: game.mint.levelsLost, gloryGain: game.mint.gloryGained)))
    }

    func test_transitions_aNewRank_isToldWithTheGloryStillMissing() {
        let before = GameFixture.game(glory: 1_490)
        let after = GameFixture.game(glory: 1_590)
        let events = GameGuideEvents.transitions(from: before, to: after)
        XCTAssertEqual(keys(events), [.newRank])
    }

    func test_transitions_theFirstMint_namesTheLevelsBeforeAndAfterAndTheRecordThatEndsTheTailwind() {
        let before = GameFixture.game(score: 12_180, minted: 0)
        let after = GameFixture.game(score: 10_886, levelRecord: 34, minted: 1)
        let events = GameGuideEvents.transitions(from: before, to: after)
        XCTAssertTrue(events.contains(.firstMint(levelBefore: 34, levelAfter: after.level.level, tailwindUntilLevel: 34)))
    }

    func test_transitions_theFlameGoingOut_isToldOnlyAtTheCrossing() {
        let lit = GameFixture.game(flameStatus: .lit)
        let out = GameFixture.game(flameDays: 0, flameStatus: .out, canRelight: true)
        XCTAssertEqual(keys(GameGuideEvents.transitions(from: lit, to: out)), [.flameOut])
        XCTAssertTrue(GameGuideEvents.transitions(from: out, to: out).isEmpty)
    }

    func test_transitions_nothingChanged_saysNothing() {
        let game = GameFixture.game()
        XCTAssertTrue(GameGuideEvents.transitions(from: game, to: game).isEmpty)
    }

    func test_transitions_theDropOfTheLevelAfterAMint_isNotACelebration() {
        let before = GameFixture.game(score: 12_180, minted: 12)
        let after = GameFixture.game(score: 10_886, levelRecord: 34, minted: 13)
        XCTAssertFalse(keys(GameGuideEvents.transitions(from: before, to: after)).contains(.newTier))
    }

    func test_transitions_aMint_announcesTheBadgeThatWentOut_withTheDistanceToRelightIt() {
        let before = GameFixture.game(score: 12_180, minted: 12)
        let after = GameFixture.game(score: 10_886, levelRecord: 34, minted: 13)
        let events = GameGuideEvents.transitions(from: before, to: after, badgeImpactBefore: MintBadgeImpact(lost: 2, regain: 11))
        XCTAssertTrue(events.contains(.badgeExtinguished(missingActions: 11)))
    }

    func test_transitions_aMintThatExtinguishesNothing_saysNothingAboutBadges() {
        let before = GameFixture.game(score: 12_180, minted: 12)
        let after = GameFixture.game(score: 10_886, levelRecord: 34, minted: 13)
        XCTAssertFalse(keys(GameGuideEvents.transitions(from: before, to: after, badgeImpactBefore: MintBadgeImpact(lost: 0, regain: 0))).contains(.badgeExtinguished))
        XCTAssertFalse(keys(GameGuideEvents.transitions(from: before, to: after, badgeImpactBefore: nil)).contains(.badgeExtinguished),
                       "inconnu ne s'annonce pas")
    }

    func test_transitions_withoutAMint_noBadgeIsAnnounced() {
        let game = GameFixture.game()
        XCTAssertTrue(GameGuideEvents.transitions(from: game, to: game, badgeImpactBefore: MintBadgeImpact(lost: 3, regain: 5)).isEmpty)
    }

    /// L'écu ne MONTE que sur une marche gagnée : une frappe refusée restaure la Gloire
    /// d'avant, et la division retrouvée n'est pas une promotion à célébrer.
    func test_rankClimbed_onlyForAStepUp_neverForTheStepRestoredAfterARefusal() {
        let voixIII = GameFixture.game(glory: 1_500)
        let voixII = GameFixture.game(glory: 2_200)
        let mythe = GameFixture.game(glory: 90_000, mythic: true)
        let legende = GameFixture.game(glory: 90_000)
        XCTAssertTrue(GameGuideEvents.rankClimbed(from: voixIII, to: voixII))
        XCTAssertFalse(GameGuideEvents.rankClimbed(from: voixII, to: voixIII))
        XCTAssertFalse(GameGuideEvents.rankClimbed(from: voixII, to: voixII))
        XCTAssertTrue(GameGuideEvents.rankClimbed(from: legende, to: mythe))
    }
}
