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
}
