import XCTest
@testable import Meeshy
import MeeshySDK

/// La liste COMPLÈTE des arrivées d'un lien (#7813) : peinte depuis les
/// arrivées récentes déjà en main, remplacée par la première page serveur,
/// prolongée page par page sans double chargement ni doublon.
@MainActor
final class ShareLinkArrivalsListViewModelTests: XCTestCase {

    private enum ProbeError: Error { case offline }

    private func entry(_ name: String, at seconds: TimeInterval, anonymous: Bool = false) -> ShareLinkArrivalEntry {
        ShareLinkArrivalEntry(
            displayName: name,
            isAnonymous: anonymous,
            country: "FR",
            language: "fr",
            joinedAt: Date(timeIntervalSince1970: seconds)
        )
    }

    private func page(_ entries: [ShareLinkArrivalEntry], next: String?) -> Result<ShareLinkArrivalsPage, Error> {
        .success(ShareLinkArrivalsPage(arrivals: entries, nextCursor: next))
    }

    private func makeSUT(
        seed: [ShareLinkArrivalEntry] = [],
        totalCount: Int = 42
    ) -> (ShareLinkArrivalsListViewModel, MockShareLinkManager) {
        let service = MockShareLinkManager()
        let sut = ShareLinkArrivalsListViewModel(
            linkId: "mshy_Kq7Rb2Xn",
            totalCount: totalCount,
            seed: seed,
            service: service
        )
        return (sut, service)
    }

    // MARK: - Cache-first

    func test_init_withRecentArrivalsInHand_paintsThemWithoutSkeletonNorNetwork() {
        let (sut, service) = makeSUT(seed: [entry("Priya", at: 30), entry("Lukas", at: 20)])

        XCTAssertEqual(sut.arrivals.map(\.displayName), ["Priya", "Lukas"])
        XCTAssertFalse(sut.showsSkeleton)
        XCTAssertFalse(sut.showsEmpty)
        XCTAssertEqual(service.fetchLinkArrivalsCallCount, 0, "nothing blocks the first frame")
    }

    func test_loadFirstPage_withNothingInHand_showsSkeletonWhileLoading() async {
        let (sut, service) = makeSUT()
        service.fetchLinkArrivalsDelayNanoseconds = 50_000_000
        service.fetchLinkArrivalsResult = page([entry("Priya", at: 30)], next: nil)

        let load = Task { await sut.loadFirstPage() }
        for _ in 0..<100 where !sut.isLoadingFirstPage { await Task.yield() }
        XCTAssertTrue(sut.showsSkeleton)
        await load.value

        XCTAssertFalse(sut.showsSkeleton)
        XCTAssertEqual(sut.arrivals.map(\.displayName), ["Priya"])
    }

    // MARK: - First page

    func test_loadFirstPage_success_replacesTheSeedWithTheServerPage() async {
        let (sut, service) = makeSUT(seed: [entry("Stale", at: 10)])
        service.fetchLinkArrivalsResult = page([entry("Priya", at: 30), entry("Lukas", at: 20)], next: "c2")

        await sut.loadFirstPage()

        XCTAssertEqual(sut.arrivals.map(\.displayName), ["Priya", "Lukas"])
        XCTAssertEqual(service.fetchLinkArrivalsCursors, [nil])
        XCTAssertEqual(service.fetchLinkArrivalsLimits, [ShareLinkArrivalsListViewModel.pageSize])
        XCTAssertTrue(sut.hasMore)
        XCTAssertFalse(sut.firstPageFailed)
    }

    func test_loadFirstPage_emptyServerPage_showsTheEmptyState() async {
        let (sut, service) = makeSUT(totalCount: 0)
        service.fetchLinkArrivalsResult = page([], next: nil)

        await sut.loadFirstPage()

        XCTAssertTrue(sut.showsEmpty)
        XCTAssertFalse(sut.hasMore)
        XCTAssertFalse(sut.showsFullError)
    }

    func test_loadFirstPage_failureWithNothingInHand_showsTheBlockingError() async {
        let (sut, service) = makeSUT()
        service.fetchLinkArrivalsResult = .failure(ProbeError.offline)

        await sut.loadFirstPage()

        XCTAssertTrue(sut.showsFullError)
        XCTAssertFalse(sut.showsEmpty)
        XCTAssertFalse(sut.showsSkeleton)
    }

    func test_loadFirstPage_failureWithSeed_keepsTheSeedAndOffersANonBlockingRetry() async {
        let (sut, service) = makeSUT(seed: [entry("Priya", at: 30)])
        service.fetchLinkArrivalsResult = .failure(ProbeError.offline)

        await sut.loadFirstPage()

        XCTAssertEqual(sut.arrivals.map(\.displayName), ["Priya"])
        XCTAssertFalse(sut.showsFullError)
        XCTAssertTrue(sut.showsFooterError)
    }

    func test_retry_afterAFirstPageFailure_reloadsTheFirstPage() async {
        let (sut, service) = makeSUT()
        service.fetchLinkArrivalsQueue = [.failure(ProbeError.offline), page([entry("Priya", at: 30)], next: nil)]

        await sut.loadFirstPage()
        await sut.retry()

        XCTAssertEqual(service.fetchLinkArrivalsCursors, [nil, nil])
        XCTAssertEqual(sut.arrivals.map(\.displayName), ["Priya"])
        XCTAssertFalse(sut.showsFullError)
    }

    // MARK: - Next pages

    func test_loadNextPage_appendsWithTheCursorTheServerGave() async {
        let (sut, service) = makeSUT()
        service.fetchLinkArrivalsQueue = [
            page([entry("Priya", at: 30)], next: "c2"),
            page([entry("Lukas", at: 20)], next: "c3"),
        ]

        await sut.loadFirstPage()
        await sut.loadNextPage()

        XCTAssertEqual(service.fetchLinkArrivalsCursors, [nil, "c2"])
        XCTAssertEqual(sut.arrivals.map(\.displayName), ["Priya", "Lukas"])
        XCTAssertTrue(sut.hasMore)
    }

    func test_loadNextPage_atTheEndOfTheList_doesNotCallTheServer() async {
        let (sut, service) = makeSUT()
        service.fetchLinkArrivalsResult = page([entry("Priya", at: 30)], next: nil)

        await sut.loadFirstPage()
        await sut.loadNextPage()

        XCTAssertEqual(service.fetchLinkArrivalsCallCount, 1)
        XCTAssertFalse(sut.hasMore)
    }

    func test_loadNextPage_beforeAnyServerPage_doesNotGuessACursor() async {
        let (sut, service) = makeSUT(seed: [entry("Priya", at: 30)])

        await sut.loadNextPage()

        XCTAssertEqual(service.fetchLinkArrivalsCallCount, 0)
    }

    func test_loadNextPage_twiceAtOnce_loadsThePageOnlyOnce() async {
        let (sut, service) = makeSUT()
        service.fetchLinkArrivalsQueue = [
            page([entry("Priya", at: 30)], next: "c2"),
            page([entry("Lukas", at: 20)], next: nil),
        ]
        await sut.loadFirstPage()
        service.fetchLinkArrivalsDelayNanoseconds = 50_000_000

        async let first: Void = sut.loadNextPage()
        async let second: Void = sut.loadNextPage()
        _ = await (first, second)

        XCTAssertEqual(service.fetchLinkArrivalsCursors, [nil, "c2"])
        XCTAssertEqual(sut.arrivals.map(\.displayName), ["Priya", "Lukas"])
    }

    func test_loadNextPage_overlappingRows_areNotShownTwice() async {
        let (sut, service) = makeSUT()
        let priya = entry("Priya", at: 30)
        service.fetchLinkArrivalsQueue = [
            page([priya, entry("Lukas", at: 20)], next: "c2"),
            page([entry("Lukas", at: 20), entry("Ana", at: 10)], next: nil),
        ]

        await sut.loadFirstPage()
        await sut.loadNextPage()

        XCTAssertEqual(sut.arrivals.map(\.displayName), ["Priya", "Lukas", "Ana"])
        XCTAssertEqual(Set(sut.arrivals.map(\.id)).count, sut.arrivals.count)
    }

    func test_loadNextPage_failure_keepsTheListAndRetriesTheSameCursor() async {
        let (sut, service) = makeSUT()
        service.fetchLinkArrivalsQueue = [
            page([entry("Priya", at: 30)], next: "c2"),
            .failure(ProbeError.offline),
            page([entry("Lukas", at: 20)], next: nil),
        ]

        await sut.loadFirstPage()
        await sut.loadNextPage()

        XCTAssertEqual(sut.arrivals.map(\.displayName), ["Priya"])
        XCTAssertTrue(sut.showsFooterError)
        XCTAssertFalse(sut.showsFullError)

        await sut.retry()

        XCTAssertEqual(service.fetchLinkArrivalsCursors, [nil, "c2", "c2"])
        XCTAssertEqual(sut.arrivals.map(\.displayName), ["Priya", "Lukas"])
        XCTAssertFalse(sut.showsFooterError)
    }

    func test_loadNextPageIfNeeded_farFromTheEnd_doesNothing() async {
        let (sut, service) = makeSUT()
        let entries = (0..<20).map { entry("P\($0)", at: TimeInterval(100 - $0)) }
        service.fetchLinkArrivalsResult = page(entries, next: "c2")
        await sut.loadFirstPage()

        await sut.loadNextPageIfNeeded(after: entries[2])

        XCTAssertEqual(service.fetchLinkArrivalsCallCount, 1)
    }

    func test_loadNextPageIfNeeded_nearTheEnd_loadsTheNextPage() async {
        let (sut, service) = makeSUT()
        let entries = (0..<20).map { entry("P\($0)", at: TimeInterval(100 - $0)) }
        service.fetchLinkArrivalsQueue = [page(entries, next: "c2"), page([entry("Last", at: 1)], next: nil)]
        await sut.loadFirstPage()

        await sut.loadNextPageIfNeeded(after: entries[17])

        XCTAssertEqual(service.fetchLinkArrivalsCursors, [nil, "c2"])
        XCTAssertEqual(sut.arrivals.last?.displayName, "Last")
    }

    // MARK: - Refresh

    func test_refresh_restartsFromTheFirstPage_andDropsTheOldTail() async {
        let (sut, service) = makeSUT()
        service.fetchLinkArrivalsQueue = [
            page([entry("Priya", at: 30)], next: "c2"),
            page([entry("Lukas", at: 20)], next: nil),
            page([entry("New", at: 40), entry("Priya", at: 30)], next: "c9"),
        ]
        await sut.loadFirstPage()
        await sut.loadNextPage()

        await sut.refresh()

        XCTAssertEqual(service.fetchLinkArrivalsCursors, [nil, "c2", nil])
        XCTAssertEqual(sut.arrivals.map(\.displayName), ["New", "Priya"])
        XCTAssertTrue(sut.hasMore)
    }
}
