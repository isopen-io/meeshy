import Foundation
import MeeshySDK

final class MockCallHistoryService: CallHistoryServiceProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var historyResult: Result<CallHistoryPage, Error> =
        .success(CallHistoryPage(records: [], nextCursor: nil, hasMore: false))

    /// Per-filter override, consulted before `historyResult`. Lets a test
    /// return different pages for `.all` vs `.missed` without needing a
    /// stateful stub — used by the `loadCalls()` stale-filter race test.
    var historyResultByFilter: [CallHistoryFilter: Result<CallHistoryPage, Error>] = [:]

    /// Test seam: a `history(filter:)` call matching a gated filter suspends
    /// until the test calls `releaseGate(for:)`. Lets a test force a specific
    /// out-of-order completion between two concurrent `history(...)` calls
    /// for different filters, deterministically (no `Task.sleep` timing).
    private var gates: [CallHistoryFilter: AsyncTestGate] = [:]

    // MARK: - Call Tracking

    var historyCallCount = 0
    var lastLimit: Int?
    var lastCursor: String?
    var lastFilter: CallHistoryFilter?

    /// Every filter `history(...)` has been invoked with, appended BEFORE any
    /// gate wait — lets a test detect "the gated call has actually started
    /// and is suspended" without racing on `lastFilter` (only set once the
    /// gate opens).
    private(set) var invokedFilters: [CallHistoryFilter] = []

    // MARK: - Gate Control

    func gate(filter: CallHistoryFilter) {
        gates[filter] = AsyncTestGate()
    }

    func releaseGate(for filter: CallHistoryFilter) async {
        await gates[filter]?.open()
        gates[filter] = nil
    }

    // MARK: - Protocol Conformance

    func history(limit: Int, cursor: String?, filter: CallHistoryFilter) async throws -> CallHistoryPage {
        invokedFilters.append(filter)
        if let gate = gates[filter] {
            await gate.wait()
        }
        historyCallCount += 1
        lastLimit = limit
        lastCursor = cursor
        lastFilter = filter
        if let perFilter = historyResultByFilter[filter] {
            return try perFilter.get()
        }
        return try historyResult.get()
    }

    // MARK: - Reset

    func reset() {
        historyResult = .success(CallHistoryPage(records: [], nextCursor: nil, hasMore: false))
        historyResultByFilter = [:]
        gates = [:]
        invokedFilters = []
        historyCallCount = 0
        lastLimit = nil
        lastCursor = nil
        lastFilter = nil
    }
}

/// Minimal async gate — suspends `wait()` callers until `open()` is called.
/// Mirrors the pattern in `MeeshyAppPushBootstrapOrderTests.AsyncGate`.
private actor AsyncTestGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { continuation in
            waiters.append(continuation)
        }
    }

    func open() {
        isOpen = true
        waiters.forEach { $0.resume() }
        waiters.removeAll()
    }
}
