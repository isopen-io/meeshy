import XCTest
@testable import Meeshy
import MeeshySDK

/// Quelle carte Mee et Meo montrent, et quand elles la comptent comme vue (#9379).
@MainActor
final class GameGuideSessionTests: XCTestCase {

    private final class FakeVisits: GameVisitStoring {
        var day: String?
        init(day: String? = nil) { self.day = day }
        func lastVisitDay() -> String? { day }
        func rememberVisit(day: String) { self.day = day }
    }

    private func allOnboardingKeys() -> [String] {
        GameGuide.onboardingSteps.map { GameGuide.onboardingSeenKey($0.key) }
    }

    private func makeSUT(
        visits: FakeVisits = FakeVisits(),
        today: String = "2026-10-05"
    ) -> (sut: GameGuideSession, service: MockGameService, seenKeys: () -> [String]) {
        let service = MockGameService()
        var recorded: [String] = []
        let sut = GameGuideSession(service: service, visits: visits, today: { today }, onSeen: { recorded.append(contentsOf: $0) })
        return (sut, service, { recorded })
    }

    private func settle() async {
        await Task.yield()
        await Task.yield()
    }

    func test_observe_atOpening_showsTheFirstUnseenOnboardingStep() {
        let (sut, _, _) = makeSUT()
        sut.observe(game: GameFixture.game(), settled: true)
        XCTAssertEqual(sut.card?.key, "onboarding.welcome")
        XCTAssertEqual(sut.card?.step, GuideCard.Step(index: 1, total: 7))
    }

    func test_observe_marksTheDisplayedCardAsSeenAndTellsTheServer() async {
        let (sut, service, seen) = makeSUT()
        sut.observe(game: GameFixture.game(), settled: true)
        await settle()
        XCTAssertEqual(seen(), ["onboarding.welcome"])
        XCTAssertEqual(service.guideSeenCalls, [["onboarding.welcome"]])
    }

    func test_observe_aRefusedSeenWriteDoesNotRemoveTheCard() async {
        let (sut, service, _) = makeSUT()
        service.guideSeenResult = .failure(URLError(.notConnectedToInternet))
        sut.observe(game: GameFixture.game(), settled: true)
        await settle()
        XCTAssertNotNil(sut.card, "le prix d'un hors-ligne : la carte se redira")
    }

    func test_observe_whileAGestureIsInFlight_doesNothing() {
        let (sut, _, _) = makeSUT()
        sut.observe(game: GameFixture.game(), settled: false)
        XCTAssertNil(sut.card)
    }

    func test_dismiss_duringTheOnboarding_showsTheNextStep() {
        let (sut, _, _) = makeSUT()
        sut.observe(game: GameFixture.game(), settled: true)
        sut.dismiss()
        XCTAssertEqual(sut.card?.key, "onboarding.first-points")
    }

    func test_skipAll_marksEveryRemainingStepInOneSendAndClosesTheCard() async {
        let (sut, service, _) = makeSUT()
        sut.observe(game: GameFixture.game(), settled: true)
        await settle()
        sut.skipAll()
        await settle()
        XCTAssertNil(sut.card)
        XCTAssertEqual(service.guideSeenCalls.count, 2)
        XCTAssertEqual(Set(service.guideSeenCalls[1]), Set(allOnboardingKeys()).subtracting(["onboarding.welcome"]))
    }

    func test_observe_afterTheOnboarding_showsOneMomentOnly() {
        let (sut, _, _) = makeSUT()
        let game = GameFixture.game(score: 12_180, guideSeen: allOnboardingKeys())
        sut.observe(game: game, settled: true)
        XCTAssertNotNil(sut.card)
        XCTAssertNil(sut.card?.step)
    }

    func test_observe_seenDiscoveriesAreNotToldAgainAtOpening() {
        let (sut, _, _) = makeSUT()
        var seen = allOnboardingKeys()
        seen.append(contentsOf: ["first-level", "new-tier", "missions-unlocked", "new-rank", "treasury-tier"])
        sut.observe(game: GameFixture.game(score: 12_180, guideSeen: seen), settled: true)
        XCTAssertNil(sut.card, "des découvertes vues ne se redisent pas à l'ouverture")
    }

    func test_observe_aTransitionReplacesTheCardAfterTheOnboarding() {
        let (sut, _, _) = makeSUT()
        let seen = allOnboardingKeys()
        sut.observe(game: GameFixture.game(score: 12_180, glory: 1_900, guideSeen: seen + ["first-level", "new-tier", "missions-unlocked", "treasury-tier"]), settled: true)
        XCTAssertNil(sut.card)
        sut.observe(game: GameFixture.game(score: 12_180, glory: 2_000, guideSeen: seen), settled: true)
        XCTAssertEqual(sut.card?.key, "new-rank")
        XCTAssertEqual(sut.card?.presentation, .full)
    }

    func test_observe_aTransitionDoesNotInterruptTheOnboarding() {
        let (sut, _, _) = makeSUT()
        sut.observe(game: GameFixture.game(glory: 5_990), settled: true)
        sut.observe(game: GameFixture.game(glory: 6_090), settled: true)
        XCTAssertEqual(sut.card?.key, "onboarding.welcome")
    }

    func test_observe_aRefusedGesture_whoseStateWasRestored_leavesNoCard() {
        let (sut, _, _) = makeSUT()
        let seen = allOnboardingKeys()
        let calm = GameFixture.game(score: 12_180, glory: 1_900, guideSeen: seen + ["first-level", "new-tier", "missions-unlocked", "treasury-tier"])
        sut.observe(game: calm, settled: true)
        sut.observe(game: GameFixture.game(score: 12_180, glory: 2_000, guideSeen: seen), settled: false)
        sut.observe(game: calm, settled: true)
        XCTAssertNil(sut.card)
    }

    func test_observe_aWeekAway_welcomesTheReturnOnTheDeviceDayNotTheCacheDay() {
        let visits = FakeVisits(day: "2026-09-27")
        let (sut, _, _) = makeSUT(visits: visits, today: "2026-10-05")
        let seen = allOnboardingKeys() + ["first-level", "new-tier", "missions-unlocked", "new-rank", "treasury-tier"]
        sut.observe(game: GameFixture.game(score: 12_180, guideSeen: seen), settled: true)
        XCTAssertEqual(sut.card?.key, "return-after-absence")
        XCTAssertEqual(visits.day, "2026-10-05")
    }
}
