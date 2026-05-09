import XCTest
@testable import MeeshySDK

private struct TestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

/// Mock store that lets each test choose what `load(for:)` returns and
/// records the items handed to `save(_:for:)` so the assertions can prove
/// the loader persisted fresh fetches.
private actor MockStore: MutableCacheStore {
    typealias Key = String
    typealias Value = TestItem

    let policy = CachePolicy.conversations
    var loadResult: CacheResult<[TestItem]> = .empty
    var savedItems: [String: [TestItem]] = [:]
    var loadCallCount = 0
    var saveCallCount = 0

    init(loadResult: CacheResult<[TestItem]> = .empty) {
        self.loadResult = loadResult
    }

    func load(for key: String) async -> CacheResult<[TestItem]> {
        loadCallCount += 1
        return loadResult
    }
    func save(_ items: [TestItem], for key: String) async {
        saveCallCount += 1
        savedItems[key] = items
    }
    func update(for key: String, mutate: @Sendable ([TestItem]) -> [TestItem]) async {
        savedItems[key] = mutate(savedItems[key] ?? [])
    }
    func mergeUpdate(for key: String, mutate: @Sendable ([TestItem]) -> [TestItem]) async {
        savedItems[key] = mutate(savedItems[key] ?? [])
    }
    func invalidate(for key: String) async { savedItems.removeValue(forKey: key) }
    func invalidateAll() async { savedItems.removeAll() }
}

private final class StubNetworkMonitor: NetworkMonitorProviding, @unchecked Sendable {
    private let _isOnline: Bool
    init(isOnline: Bool) { self._isOnline = isOnline }
    var isOnline: Bool { _isOnline }
}

private final class AtomicCounter: @unchecked Sendable {
    private let queue = DispatchQueue(label: "AtomicCounter")
    private var _value: Int = 0
    func increment() { queue.sync { _value += 1 } }
    var value: Int { queue.sync { _value } }
}

@MainActor
final class CacheFirstLoaderTests: XCTestCase {

    // MARK: - .fresh

    func test_load_cachedFresh_skipsFetchAndSetsCachedFreshState() async {
        let store = MockStore(loadResult: .fresh([TestItem(id: "1", name: "A")], age: 1))
        let monitor = StubNetworkMonitor(isOnline: true)
        let loader = CacheFirstLoader(store: store, key: "k", networkMonitor: monitor)

        var capturedState: LoadState?
        var capturedItems: [TestItem]?
        let fetchCallCount = AtomicCounter()

        let task = await loader.load(
            fetch: {
                fetchCallCount.increment()
                return [TestItem(id: "X", name: "from-network")]
            },
            setLoadState: { state in capturedState = state },
            apply: { items in capturedItems = items }
        )

        XCTAssertNil(task, "Fresh cache must NOT return a revalidation task")
        XCTAssertEqual(fetchCallCount.value, 0, "Fresh cache must not call fetch")
        XCTAssertEqual(capturedState, .cachedFresh)
        XCTAssertEqual(capturedItems, [TestItem(id: "1", name: "A")])
        let saveCount = await store.saveCallCount
        XCTAssertEqual(saveCount, 0)
    }

    // MARK: - .stale

    func test_load_cachedStale_appliesImmediatelyAndReturnsRevalidationTask() async {
        let store = MockStore(loadResult: .stale([TestItem(id: "1", name: "A")], age: 60))
        let monitor = StubNetworkMonitor(isOnline: true)
        let loader = CacheFirstLoader(store: store, key: "k", networkMonitor: monitor)

        var capturedStates: [LoadState] = []
        var capturedItems: [[TestItem]] = []
        let fresh = [TestItem(id: "2", name: "B")]

        let task = await loader.load(
            fetch: { fresh },
            setLoadState: { state in capturedStates.append(state) },
            apply: { items in capturedItems.append(items) }
        )

        // Immediately the stale items should be applied + state cachedStale.
        XCTAssertEqual(capturedItems.first, [TestItem(id: "1", name: "A")])
        XCTAssertEqual(capturedStates.first, .cachedStale)

        // Wait for revalidation to complete; assert fresh items applied.
        await task?.value
        XCTAssertEqual(capturedItems.last, fresh)
        XCTAssertEqual(capturedStates.last, .loaded)

        // Fresh items should be persisted.
        let saved = await store.savedItems["k"]
        XCTAssertEqual(saved, fresh)
    }

    func test_load_cachedStale_revalidationFailureKeepsStaleData() async {
        let store = MockStore(loadResult: .stale([TestItem(id: "1", name: "A")], age: 60))
        let monitor = StubNetworkMonitor(isOnline: true)
        let loader = CacheFirstLoader(store: store, key: "k", networkMonitor: monitor)

        var capturedStates: [LoadState] = []
        var capturedItems: [[TestItem]] = []

        let task = await loader.load(
            fetch: { throw NSError(domain: "test", code: 500) },
            setLoadState: { state in capturedStates.append(state) },
            apply: { items in capturedItems.append(items) }
        )

        await task?.value

        // Stale data must remain visible — no rollback.
        XCTAssertEqual(capturedItems.last, [TestItem(id: "1", name: "A")])
        // We were online so we don't transition to .offline on failure;
        // the cachedStale state is preserved.
        XCTAssertEqual(capturedStates.last, .cachedStale)
    }

    // MARK: - .empty

    func test_load_empty_fetchesAndSavesAndSetsLoaded() async {
        let store = MockStore(loadResult: .empty)
        let monitor = StubNetworkMonitor(isOnline: true)
        let loader = CacheFirstLoader(store: store, key: "k", networkMonitor: monitor)

        var capturedStates: [LoadState] = []
        var capturedItems: [TestItem]?
        let fresh = [TestItem(id: "1", name: "A"), TestItem(id: "2", name: "B")]

        let task = await loader.load(
            fetch: { fresh },
            setLoadState: { state in capturedStates.append(state) },
            apply: { items in capturedItems = items }
        )

        XCTAssertNil(task)
        XCTAssertEqual(capturedItems, fresh)
        XCTAssertEqual(capturedStates.first, .loading)
        XCTAssertEqual(capturedStates.last, .loaded)
        let saved = await store.savedItems["k"]
        XCTAssertEqual(saved, fresh)
    }

    func test_load_empty_fetchFailureOffline_setsOfflineState() async {
        let store = MockStore(loadResult: .empty)
        let monitor = StubNetworkMonitor(isOnline: false)
        let loader = CacheFirstLoader(store: store, key: "k", networkMonitor: monitor)

        var capturedState: LoadState?

        _ = await loader.load(
            fetch: { throw NSError(domain: "test", code: 500) },
            setLoadState: { state in capturedState = state },
            apply: { _ in }
        )

        XCTAssertEqual(capturedState, .offline)
    }

    func test_load_empty_fetchFailureOnline_setsErrorState() async {
        let store = MockStore(loadResult: .empty)
        let monitor = StubNetworkMonitor(isOnline: true)
        let loader = CacheFirstLoader(store: store, key: "k", networkMonitor: monitor)

        var capturedState: LoadState?

        _ = await loader.load(
            fetch: { throw NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "boom"]) },
            setLoadState: { state in capturedState = state },
            apply: { _ in }
        )

        switch capturedState {
        case .error: break
        default: XCTFail("Expected .error, got \(String(describing: capturedState))")
        }
    }

    // MARK: - Cancellation

    func test_load_cachedStale_revalidationTaskCanBeCancelled() async {
        let store = MockStore(loadResult: .stale([TestItem(id: "1", name: "A")], age: 60))
        let monitor = StubNetworkMonitor(isOnline: true)
        let loader = CacheFirstLoader(store: store, key: "k", networkMonitor: monitor)

        var capturedItems: [[TestItem]] = []

        let task = await loader.load(
            fetch: {
                // Simulate slow network so the cancel can race.
                try await Task.sleep(nanoseconds: 500_000_000)
                return [TestItem(id: "X", name: "should-not-apply")]
            },
            setLoadState: { _ in },
            apply: { items in capturedItems.append(items) }
        )

        task?.cancel()
        await task?.value

        // Cancelled work must not have applied or persisted the fresh data.
        // We may see one "apply" for the initial stale data, but never "X".
        XCTAssertFalse(capturedItems.contains(where: { $0.first?.id == "X" }))
        let saveCount = await store.saveCallCount
        XCTAssertEqual(saveCount, 0)
    }
}
