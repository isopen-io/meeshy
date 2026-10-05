import XCTest
@testable import Meeshy

/// Les chorégraphies sont des FONCTIONS du temps (#9381) : « à 0,45 s, le marteau est
/// en bas » se prouve sans écran, et le haptique tombe sur les mêmes instants.
final class GameTimelineTests: XCTestCase {

    func test_durations_areThoseOfTheBoard() {
        XCTAssertEqual(GameTimeline.strikeDuration, 1.2)
        XCTAssertEqual(GameTimeline.rankDuration, 1.6)
        XCTAssertEqual(GameTimeline.levelGainDuration, 0.6)
        XCTAssertEqual(GameTimeline.levelLossDuration, 0.8)
        XCTAssertEqual(GameTimeline.badgeDuration, 0.7)
        XCTAssertEqual(GameTimeline.chestDuration, 1.4)
    }

    func test_strike_theHammerIsDownAtTheImpact_andRisesAfterward() {
        let atImpact = GameTimeline.strike(at: GameTimeline.strikeImpact)
        XCTAssertEqual(atImpact.hammer, 1, accuracy: 0.001)
        XCTAssertLessThan(GameTimeline.strike(at: 0.7).hammer, 0.01)
        XCTAssertEqual(GameTimeline.strike(at: 0).hammer, 0)
    }

    func test_strike_theCoinFlipsOnlyAfterTheImpact_andShowsItsNumberAtTheEnd() {
        XCTAssertEqual(GameTimeline.strike(at: GameTimeline.strikeImpact).flip, 0)
        XCTAssertEqual(GameTimeline.strike(at: GameTimeline.strikeDuration).flip, 1, accuracy: 0.001)
        XCTAssertGreaterThan(GameTimeline.strike(at: 0.9).flip, GameTimeline.strike(at: 0.7).flip)
    }

    func test_strike_theWaveStartsAtTheImpactAndIsDoneBeforeTheEnd() {
        XCTAssertEqual(GameTimeline.strike(at: 0.3).wave, 0)
        XCTAssertEqual(GameTimeline.strike(at: 0.95).wave, 1, accuracy: 0.001)
    }

    func test_strike_theHapticShockLandsOnTheImpact() {
        XCTAssertEqual(GameHapticPattern.strike.first?.time, GameTimeline.strikeImpact)
        XCTAssertEqual(GameHapticPattern.strike.first?.intensity, 1.0, "un choc net")
        XCTAssertLessThan(GameHapticPattern.strike[1].intensity, 0.6, "puis un léger rebond")
    }

    func test_rank_threeTapsOnePerStroke_atTheInstantEachStrokeLights() {
        XCTAssertEqual(GameHapticPattern.rank.count, 3)
        XCTAssertEqual(GameHapticPattern.rank.map(\.time), GameTimeline.rankStrokeTimes)
        let lit = GameTimeline.rank(at: GameTimeline.rankStrokeTimes[1] + 0.15)
        XCTAssertEqual(lit.strokes[1], 1, accuracy: 0.001)
        XCTAssertEqual(lit.strokes[0], 0, accuracy: 0.001)
    }

    func test_rank_theShieldRisesFirst_theTenantsLandLast() {
        XCTAssertEqual(GameTimeline.rank(at: 0.5).rise, 1, accuracy: 0.001)
        XCTAssertEqual(GameTimeline.rank(at: 1.0).tenants, 0)
        XCTAssertEqual(GameTimeline.rank(at: GameTimeline.rankDuration).tenants, 1, accuracy: 0.001)
    }

    func test_level_theRingFillsIn06AndEmptiesIn08() {
        XCTAssertEqual(GameTimeline.ringProgress(from: 0.2, to: 0.9, at: GameTimeline.levelGainDuration, duration: GameTimeline.levelGainDuration), 0.9, accuracy: 0.001)
        XCTAssertEqual(GameTimeline.ringProgress(from: 0.9, to: 0.1, at: GameTimeline.levelLossDuration, duration: GameTimeline.levelLossDuration), 0.1, accuracy: 0.001)
        XCTAssertEqual(GameTimeline.ringProgress(from: 0.2, to: 0.9, at: 0, duration: 0.6), 0.2, accuracy: 0.001)
    }

    func test_level_aLossPlaysNoHaptic_aGainPlaysOneLightTap() {
        XCTAssertEqual(GameHapticPattern.levelGain.count, 1)
        XCTAssertLessThan(GameHapticPattern.levelGain[0].intensity, 0.5)
    }

    func test_badge_theMaterialRisesFromTheBottomWhenLit_andRetreatsWhenExtinguished() {
        XCTAssertEqual(GameTimeline.badgeFill(lighting: true, at: 0), 0)
        XCTAssertEqual(GameTimeline.badgeFill(lighting: true, at: GameTimeline.badgeDuration), 1, accuracy: 0.001)
        XCTAssertEqual(GameTimeline.badgeFill(lighting: false, at: 0), 1)
        XCTAssertEqual(GameTimeline.badgeFill(lighting: false, at: GameTimeline.badgeDuration), 0, accuracy: 0.001)
    }

    func test_chest_theLidOpensFirst_thenTheRewardsRiseOneByOne_withOneTapEach() {
        XCTAssertEqual(GameTimeline.chestLid(at: GameTimeline.chestLidEnd), 1, accuracy: 0.001)
        XCTAssertEqual(GameTimeline.reward(0, at: 0.4), 0)
        XCTAssertEqual(GameTimeline.reward(2, at: GameTimeline.rewardStart(2)), 0)
        XCTAssertEqual(GameTimeline.reward(2, at: GameTimeline.chestDuration), 1, accuracy: 0.001)
        XCTAssertEqual(GameHapticPattern.chest(rewards: 3).map(\.time), (0..<3).map(GameTimeline.rewardStart))
        XCTAssertTrue(GameHapticPattern.chest(rewards: 0).isEmpty)
    }

    func test_chest_everyRewardIsOutBeforeTheChoreographyEnds() {
        XCTAssertLessThanOrEqual(GameTimeline.rewardStart(2) + 0.3, GameTimeline.chestDuration + 1e-9)
    }

    func test_window_isClampedToZeroAndOne() {
        XCTAssertEqual(GameTimeline.window(-1, from: 0, to: 1), 0)
        XCTAssertEqual(GameTimeline.window(5, from: 0, to: 1), 1)
        XCTAssertEqual(GameTimeline.window(0.5, from: 0, to: 1), 0.5)
    }
}
