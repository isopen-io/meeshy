import XCTest
@testable import Meeshy
import MeeshySDK

private final class TestNetworkMonitor: NetworkMonitorProviding, @unchecked Sendable {
    var isOnline: Bool
    init(isOnline: Bool = true) { self.isOnline = isOnline }
}

@MainActor
final class CallsViewModelTests: XCTestCase {

    // MARK: - Lifecycle

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.callHistory.invalidate(for: "calls:list:all")
        await CacheCoordinator.shared.callHistory.invalidate(for: "calls:list:missed")
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.callHistory.invalidate(for: "calls:list:all")
        await CacheCoordinator.shared.callHistory.invalidate(for: "calls:list:missed")
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        service: MockCallHistoryService = MockCallHistoryService(),
        networkMonitor: TestNetworkMonitor = TestNetworkMonitor(isOnline: true)
    ) -> (sut: CallsViewModel, service: MockCallHistoryService) {
        let sut = CallsViewModel(service: service, networkMonitor: networkMonitor)
        return (sut, service)
    }

    private static func makeRecord(id: String, direction: String = "outgoing") -> APICallRecord {
        JSONStub.decode("""
        {"callId":"\(id)","conversationId":"conv1","conversationType":"direct","conversationTitle":null,"conversationAvatar":null,"mode":"p2p","status":"ended","endReason":"completed","direction":"\(direction)","isVideo":false,"startedAt":"2026-06-20T10:00:00.000Z","answeredAt":"2026-06-20T10:00:05.000Z","endedAt":"2026-06-20T10:01:05.000Z","durationSec":60,"bytesSent":1000,"bytesReceived":2000,"peer":{"userId":"u2","username":"bob","displayName":"Bob","avatar":null,"phoneNumber":null,"isOnline":true}}
        """)
    }

    private static func page(_ records: [APICallRecord]) -> CallHistoryPage {
        CallHistoryPage(records: records, nextCursor: nil, hasMore: false)
    }

    // MARK: - loadCalls

    func test_loadCalls_success_populatesList() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([
            Self.makeRecord(id: "c1"),
            Self.makeRecord(id: "c2", direction: "missed"),
        ]))

        await sut.loadCalls()

        XCTAssertEqual(sut.calls.count, 2)
        XCTAssertEqual(sut.calls[0].callId, "c1")
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertEqual(service.historyCallCount, 1)
        XCTAssertEqual(service.lastLimit, 30)
        XCTAssertNil(service.lastCursor)
        XCTAssertEqual(service.lastFilter, .all)
    }

    func test_loadCalls_empty_setsLoadedWithEmptyList() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([]))

        await sut.loadCalls()

        XCTAssertTrue(sut.calls.isEmpty)
        XCTAssertEqual(sut.loadState, .loaded)
    }

    /// Regression test: the error message must come from the localization
    /// catalog, not a hardcoded French literal — the app is multi-language
    /// (Prisme Linguistique) and a French-only error string breaks the UI for
    /// every other locale.
    func test_loadCalls_serviceFails_setsLocalizedErrorState() async {
        let (sut, service) = makeSUT(networkMonitor: TestNetworkMonitor(isOnline: true))
        service.historyResult = .failure(URLError(.badServerResponse))

        await sut.loadCalls()

        let expected = String(localized: "calls.history.error", defaultValue: "Erreur lors du chargement", bundle: .main)
        XCTAssertEqual(sut.loadState, .error(expected))
    }

    func test_loadCalls_passesActiveFilterToService() async {
        let (sut, service) = makeSUT()
        sut.filter = .missed
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1", direction: "missed")]))

        await sut.loadCalls()

        XCTAssertEqual(service.lastFilter, .missed)
        XCTAssertEqual(sut.calls.count, 1)
    }

    /// Regression test: `CacheFirstLoader.load` awaits a cache read (and, on
    /// miss, the network fetch) before ever touching `calls`/`loadState`. If
    /// the initial `.task`-driven `loadCalls()` for `.all` is still in flight
    /// when the user switches to `.missed`, and the `.all` fetch resolves
    /// AFTER the `.missed` one already applied its results, the stale `.all`
    /// completion must not clobber the current filter's list.
    func test_loadCalls_staleFilterResolvesAfterNewer_doesNotClobberCurrentResults() async {
        let (sut, service) = makeSUT()
        service.gate(filter: .all)
        service.historyResultByFilter[.all] = .success(Self.page([Self.makeRecord(id: "stale-all")]))
        service.historyResultByFilter[.missed] = .success(Self.page([Self.makeRecord(id: "fresh-missed", direction: "missed")]))

        let staleLoad = Task { await sut.loadCalls() }
        // Let the stale (.all) load actually start and suspend on the gate
        // before switching filters — otherwise the ordering isn't exercised.
        while !service.invokedFilters.contains(.all) {
            await Task.yield()
        }

        sut.setFilter(.missed)
        while sut.calls.map(\.callId) != ["fresh-missed"] {
            await Task.yield()
        }

        await service.releaseGate(for: .all)
        await staleLoad.value

        XCTAssertEqual(sut.filter, .missed)
        XCTAssertEqual(sut.calls.map(\.callId), ["fresh-missed"])
    }

    func test_loadCalls_whenServiceFails_setsErrorState() async {
        struct StubError: Error {}
        let (sut, service) = makeSUT()
        service.historyResult = .failure(StubError())

        await sut.loadCalls()

        XCTAssertTrue(sut.calls.isEmpty)
        guard case .error = sut.loadState else {
            return XCTFail("Expected .error, got \(sut.loadState)")
        }
    }

    // MARK: - setFilter

    func test_setFilter_updatesFilterWithoutFlashingListEmpty() async {
        // Cache-first contract (CLAUDE.md "No spinner when cache has data"):
        // switching filters must not blank the list before the new filter's
        // cache/network result is applied. Regression test for the bug where
        // `setFilter` synchronously set `calls = []` ahead of the async reload.
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1")]))
        await sut.loadCalls()
        XCTAssertFalse(sut.calls.isEmpty)

        sut.setFilter(.missed)

        XCTAssertEqual(sut.filter, .missed)
        XCTAssertFalse(sut.calls.isEmpty)
    }

    func test_setFilter_sameValue_isNoOp() async {
        let (sut, _) = makeSUT()
        sut.setFilter(.all)
        XCTAssertEqual(sut.filter, .all)
    }

    // MARK: - Pagination (#8066)

    private static func page(_ records: [APICallRecord], hasMore: Bool) -> CallHistoryPage {
        CallHistoryPage(records: records, nextCursor: hasMore ? records.last?.callId : nil, hasMore: hasMore)
    }

    func test_loadMore_afterFirstPage_sendsLastCallIdAsCursor_andAppendsOlderCalls() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1"), Self.makeRecord(id: "c2")], hasMore: true))
        service.historyResultByCursor["c2"] = .success(Self.page([Self.makeRecord(id: "c3")], hasMore: false))
        await sut.loadCalls()

        await sut.loadMore()

        XCTAssertEqual(service.lastCursor, "c2")
        XCTAssertEqual(sut.calls.map(\.callId), ["c1", "c2", "c3"])
        XCTAssertTrue(sut.reachedEnd)
    }

    func test_loadMore_afterLastPage_sendsNothing() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1")], hasMore: false))
        await sut.loadCalls()

        await sut.loadMore()

        XCTAssertEqual(service.historyCallCount, 1)
        XCTAssertTrue(sut.reachedEnd)
    }

    func test_loadMore_neverDuplicatesARowAlreadyListed() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1"), Self.makeRecord(id: "c2")], hasMore: true))
        service.historyResultByCursor["c2"] = .success(Self.page([Self.makeRecord(id: "c2"), Self.makeRecord(id: "c3")], hasMore: true))
        await sut.loadCalls()

        await sut.loadMore()

        XCTAssertEqual(sut.calls.map(\.callId), ["c1", "c2", "c3"])
        XCTAssertFalse(sut.reachedEnd)
    }

    func test_loadMore_failure_keepsTheListAndAllowsARetry() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1")], hasMore: true))
        service.historyResultByCursor["c1"] = .failure(URLError(.notConnectedToInternet))
        await sut.loadCalls()

        await sut.loadMore()

        XCTAssertEqual(sut.calls.map(\.callId), ["c1"])
        XCTAssertFalse(sut.reachedEnd)
        XCTAssertFalse(sut.isLoadingMore)
    }

    // MARK: - Erase (#8066)

    func test_hide_removesTheRowBeforeTheGatewayAnswers_thenConfirms() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1"), Self.makeRecord(id: "c2")]))
        await sut.loadCalls()
        service.gateErase()

        let hiding = Task { await sut.hide(callId: "c1") }
        while service.eraseInvocations == 0 { await Task.yield() }

        XCTAssertEqual(sut.calls.map(\.callId), ["c2"])
        await service.releaseErase()
        await hiding.value
        XCTAssertEqual(service.hiddenCallIds, ["c1"])
        XCTAssertEqual(sut.calls.map(\.callId), ["c2"])
        XCTAssertFalse(sut.eraseFailed)
    }

    func test_hide_refused_putsTheRowBackAtItsPlace_andSaysSo() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1"), Self.makeRecord(id: "c2"), Self.makeRecord(id: "c3")]))
        service.hideResult = .failure(URLError(.badServerResponse))
        await sut.loadCalls()

        await sut.hide(callId: "c2")

        XCTAssertEqual(sut.calls.map(\.callId), ["c1", "c2", "c3"])
        XCTAssertTrue(sut.eraseFailed)
    }

    func test_hide_confirmed_leavesTheCachedJournalWithoutTheRow() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1"), Self.makeRecord(id: "c2")]))
        await sut.loadCalls()

        await sut.hide(callId: "c1")

        let cached = await CacheCoordinator.shared.callHistory.load(for: "calls:list:all")
        XCTAssertEqual(cached.value?.map(\.callId), ["c2"])
    }

    func test_clearAll_emptiesTheJournalBeforeTheGatewayAnswers() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1"), Self.makeRecord(id: "c2")]))
        service.clearAllResult = .success(2)
        await sut.loadCalls()
        service.gateErase()

        let clearing = Task { await sut.clearAll() }
        while service.eraseInvocations == 0 { await Task.yield() }

        XCTAssertTrue(sut.calls.isEmpty)
        await service.releaseErase()
        await clearing.value
        XCTAssertEqual(service.clearAllCallCount, 1)
        XCTAssertTrue(sut.calls.isEmpty)
        XCTAssertFalse(sut.eraseFailed)
    }

    func test_clearAll_refused_restoresTheJournal() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1"), Self.makeRecord(id: "c2")]))
        service.clearAllResult = .failure(URLError(.badServerResponse))
        await sut.loadCalls()

        await sut.clearAll()

        XCTAssertEqual(sut.calls.map(\.callId), ["c1", "c2"])
        XCTAssertTrue(sut.eraseFailed)
    }

    // MARK: - Search (#8066)

    private static func groupRecord(id: String, participants: [String]) -> APICallRecord {
        APICallRecord(
            callId: id, conversationId: "conv-\(id)", conversationType: "group", conversationTitle: "Équipe",
            mode: "sfu", status: "ended", direction: "outgoing", isVideo: false,
            startedAt: Date(timeIntervalSince1970: 0), durationSec: 60,
            participants: participants.map { CallHistoryParticipant(participantId: "p-\($0)", displayName: $0) }
        )
    }

    func test_visibleCalls_searchFindsAGroupCallByOneOfItsParticipants() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1"), Self.groupRecord(id: "g1", participants: ["Chloé"])]))
        await sut.loadCalls()

        sut.searchQuery = "chloe"

        XCTAssertEqual(sut.visibleCalls.map(\.callId), ["g1"])
        sut.searchQuery = ""
        XCTAssertEqual(sut.visibleCalls.map(\.callId), ["c1", "g1"])
    }

    func test_searchAcrossHistory_loadsOlderPagesUntilTheEnd() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1")], hasMore: true))
        service.historyResultByCursor["c1"] = .success(Self.page([Self.makeRecord(id: "c2")], hasMore: true))
        service.historyResultByCursor["c2"] = .success(Self.page([Self.groupRecord(id: "g3", participants: ["Chloé"])], hasMore: false))
        await sut.loadCalls()
        sut.searchQuery = "chloe"

        await sut.searchAcrossHistory()

        XCTAssertEqual(service.requestedCursors, [nil, "c1", "c2"])
        XCTAssertEqual(sut.visibleCalls.map(\.callId), ["g3"])
    }

    func test_searchAcrossHistory_withoutQuery_loadsNothing() async {
        let (sut, service) = makeSUT()
        service.historyResult = .success(Self.page([Self.makeRecord(id: "c1")], hasMore: true))
        await sut.loadCalls()

        await sut.searchAcrossHistory()

        XCTAssertEqual(service.historyCallCount, 1)
    }
}
