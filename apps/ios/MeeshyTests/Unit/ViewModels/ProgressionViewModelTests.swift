import XCTest
@testable import Meeshy
import MeeshySDK

/// L'écran « Progression » (#5698) — cache-first, et ce que chaque état promet.
@MainActor
final class ProgressionViewModelTests: XCTestCase {

    private func makePayload(score: Int = 36, textMessages: Int = 12) -> APIEngagementProgress {
        APIEngagementProgress(
            counters: [.init(axisKey: "content.text_message", count: textMessages)],
            milestones: [.init(milestoneType: .badge, milestoneKey: "content.text_message:10", reachedAt: "2026-09-04T08:00:00.000Z")],
            streak: .init(currentStreakDays: 1, longestStreakDays: 1),
            level: .init(engagementScore: score)
        )
    }

    private func makeSUT(
        result: Result<APIEngagementProgress, Error>? = nil,
        isOnline: Bool = true
    ) -> (sut: ProgressionViewModel, service: MockEngagementProgressService) {
        let service = MockEngagementProgressService()
        if let result { service.fetchProgressResult = result }
        let sut = ProgressionViewModel(
            service: service,
            networkMonitor: FakeNetworkMonitor(isOnline: isOnline),
            currentUserId: "me-\(UUID().uuidString)"
        )
        return (sut, service)
    }

    func test_initialState_isIdle_withoutSkeleton() {
        let (sut, _) = makeSUT()

        XCTAssertNil(sut.progress)
        XCTAssertEqual(sut.loadState, .idle)
        XCTAssertFalse(sut.showsSkeleton)
    }

    func test_load_forceNetwork_success_resolvesTheProgress() async {
        let (sut, service) = makeSUT(result: .success(makePayload()))

        await sut.load(forceNetwork: true)

        XCTAssertEqual(service.fetchProgressCallCount, 1)
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertEqual(sut.progress?.level.level, 1)
        XCTAssertEqual(sut.progress?.badgesEarned, 2)
        XCTAssertEqual(sut.progress?.isEmpty, false)
        XCTAssertFalse(sut.showsSkeleton)
    }

    func test_load_forceNetwork_emptyAccount_isTheEmptyState() async {
        let (sut, _) = makeSUT(result: .success(.empty))

        await sut.load(forceNetwork: true)

        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertEqual(sut.progress?.isEmpty, true)
        XCTAssertEqual(sut.progress?.axes.count, EngagementAxisKey.allCases.count)
    }

    func test_load_forceNetwork_failureOnline_surfacesTheScreenPhrase() async {
        let (sut, _) = makeSUT(result: .failure(URLError(.badServerResponse)))

        await sut.load(forceNetwork: true)

        guard case .error(let message) = sut.loadState else {
            return XCTFail("Expected an error state, got \(sut.loadState)")
        }
        XCTAssertEqual(message, String(localized: "progression.load_error", defaultValue: "Impossible de charger la progression", bundle: .main))
        XCTAssertEqual(sut.errorMessage, message)
        XCTAssertNil(sut.progress)
    }

    func test_load_forceNetwork_failureOffline_isOffline_notAnError() async {
        let (sut, _) = makeSUT(result: .failure(URLError(.notConnectedToInternet)), isOnline: false)

        await sut.load(forceNetwork: true)

        XCTAssertEqual(sut.loadState, .offline)
        XCTAssertTrue(sut.isOffline)
        XCTAssertNil(sut.errorMessage)
    }

    func test_load_failureAfterASnapshot_keepsTheSnapshotVisible() async {
        let (sut, service) = makeSUT(result: .success(makePayload()))
        await sut.load(forceNetwork: true)
        XCTAssertNotNil(sut.progress)

        service.fetchProgressResult = .failure(URLError(.timedOut))
        await sut.load(forceNetwork: true)

        XCTAssertNotNil(sut.progress, "un échec de rafraîchissement ne retire jamais l'instantané déjà peint")
        XCTAssertEqual(sut.progress?.badgesEarned, 2)
        XCTAssertFalse(sut.showsSkeleton)
    }

    // MARK: - La frappe (#6467)

    private var echecDeFrappe: String {
        String(localized: "progression.meesh.mint_error", defaultValue: "La frappe n'a pas abouti — réessayez", bundle: .main)
    }

    /// **L'échec se dit là où le geste a eu lieu.** Mesuré sur staging le
    /// 2026-09-14 : l'échec allait à `loadState`, que l'écran rend EN HAUT du
    /// contenu, sous le détail resté ouvert. Rien ne changeait dans le détail,
    /// et le porteur a retouché deux fois.
    func test_mint_failure_isToldToTheDetail() async {
        let (sut, service) = makeSUT(result: .success(makePayload()))
        await sut.load(forceNetwork: true)
        service.mintResult = .failure(URLError(.networkConnectionLost))

        await sut.mint()

        XCTAssertFalse(sut.isMinting, "la frappe reste « en cours » après son échec")
        XCTAssertEqual(sut.mintError, echecDeFrappe)
        XCTAssertNotNil(sut.progress, "un échec de frappe ne retire pas l'instantané")
    }

    func test_mint_retryAfterAFailure_clearsTheError_andKeepsTheSameIntent() async {
        let (sut, service) = makeSUT(result: .success(makePayload()))
        await sut.load(forceNetwork: true)
        service.mintResult = .failure(URLError(.networkConnectionLost))
        await sut.mint()

        service.mintResult = .success(APIMeeshMintResult(status: "minted", balance: 1, mintedLifetime: 1))
        await sut.mint()

        XCTAssertNil(sut.mintError, "l'échec précédent reste affiché après une frappe réussie")
        XCTAssertEqual(service.mintRequestIds.count, 2)
        XCTAssertEqual(service.mintRequestIds.first, service.mintRequestIds.last, "le réessai doit porter la MÊME intention")
    }
}
