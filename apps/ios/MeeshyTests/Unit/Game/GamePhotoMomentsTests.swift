import XCTest
@testable import Meeshy
import MeeshySDK

/// Les moments qui se photographient (#9382) : une identité stable, et ce que Mee
/// propose APRÈS la célébration — jamais à l'ouverture.
@MainActor
final class GamePhotoMomentsTests: XCTestCase {

    private func ids(_ moments: [PhotoMoment]) -> [String] { moments.map(\.id) }

    func test_theStartMoment_hasAStableIdentity() {
        XCTAssertEqual(GamePhotoMoments.start().id, "start")
        XCTAssertEqual(GamePhotoMoments.start().emblem, .start)
    }

    func test_aNewDivisionIsANewMoment_theSameStandingIsTheSameMoment() {
        let a = GamePhotoMoments.rank(.voix, division: .ii)
        XCTAssertEqual(a.id, GamePhotoMoments.rank(.voix, division: .ii).id)
        XCTAssertNotEqual(a.id, GamePhotoMoments.rank(.voix, division: .i).id)
    }

    func test_transition_aRankGainedWithMoreGlory_proposesThePhoto() {
        let before = GameFixture.game(glory: 5_990)
        let after = GameFixture.game(glory: 6_090)
        XCTAssertEqual(ids(GamePhotoMoments.ofTransition(from: before, to: after)), ["rank:voix:5"])
    }

    func test_transition_theTenthMint_proposesThePhoto_butTheSecondDoesNot() {
        let tenth = GamePhotoMoments.ofTransition(
            from: GameFixture.game(score: 20_000, minted: 9), to: GameFixture.game(score: 18_700, minted: 10)
        )
        XCTAssertTrue(ids(tenth).contains("meesh:10"))
        let second = GamePhotoMoments.ofTransition(
            from: GameFixture.game(score: 20_000, minted: 1), to: GameFixture.game(score: 18_700, minted: 2)
        )
        XCTAssertFalse(second.contains { $0.id.hasPrefix("meesh:") })
    }

    func test_transition_theFirstMint_proposesThePhoto() {
        let moments = GamePhotoMoments.ofTransition(
            from: GameFixture.game(score: 121_800, minted: 0), to: GameFixture.game(score: 10_959, minted: 1)
        )
        XCTAssertTrue(ids(moments).contains("meesh:1"))
    }

    func test_transition_theFlameCrossingSevenDays_proposesThePhotoOnce() {
        let before = GameFixture.game(flameDays: 6)
        XCTAssertEqual(ids(GamePhotoMoments.ofTransition(from: before, to: GameFixture.game(flameDays: 7))), ["flame:7"])
        XCTAssertTrue(GamePhotoMoments.ofTransition(from: GameFixture.game(flameDays: 7), to: GameFixture.game(flameDays: 8)).isEmpty)
    }

    func test_transition_aNewTier_proposesThePhoto() {
        let moments = GamePhotoMoments.ofTransition(from: GameFixture.game(score: 3_900), to: GameFixture.game(score: 4_100))
        XCTAssertTrue(ids(moments).contains("tier:lueur") || ids(moments).contains("tier:lumiere"))
    }

    func test_transition_nothingChanged_proposesNothing() {
        let game = GameFixture.game()
        XCTAssertTrue(GamePhotoMoments.ofTransition(from: game, to: game).isEmpty)
    }

    func test_flameThreshold_isTheHighestOneReached() {
        XCTAssertEqual(GamePhotoMoments.flameThreshold(for: 31), 30)
        XCTAssertEqual(GamePhotoMoments.flameThreshold(for: 365), 365)
        XCTAssertNil(GamePhotoMoments.flameThreshold(for: 3))
    }

    func test_fromCard_aMintedFirstCoinIsNumberedOneNotTwo() {
        let game = GameFixture.game(score: 10_959, minted: 1)
        XCTAssertEqual(GamePhotoMoments.fromCard(key: .firstMint, game: game)?.id, "meesh:1")
    }

    func test_fromCard_aMomentThatIsNotAPhotoRendersNothing() {
        XCTAssertNil(GamePhotoMoments.fromCard(key: .priceRises, game: GameFixture.game()))
    }

    /// Les paliers au-delà de 100 se photographient au premier niveau qu'ils couvrent (#9688) : 101 pour Nébuleuse.
    func test_transition_crossingLevel101_proposesNebuleuseAtLevel101() {
        let before = GameFixture.game(score: GameLevels.threshold(of: 100) + 5)
        let after = GameFixture.game(score: GameLevels.threshold(of: 101) + 5)
        let moment = GamePhotoMoments.ofTransition(from: before, to: after).first { $0.id == "tier:nebuleuse" }
        XCTAssertEqual(moment?.emblem, .tier(.nebuleuse, level: 101))
    }

    func test_fromCard_theNewTierCard_readsTheTierOfTheLadder() {
        let game = GameFixture.game(score: GameLevels.threshold(of: 1_050), glory: 400_000)
        XCTAssertEqual(GamePhotoMoments.fromCard(key: .newTier, game: game)?.emblem, .tier(.singularite, level: 1000))
    }
}
