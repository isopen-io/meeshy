import Foundation
import MeeshySDK

final class MockCallHistoryService: CallHistoryServiceProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var historyResult: Result<CallHistoryPage, Error> =
        .success(CallHistoryPage(records: [], nextCursor: nil, hasMore: false))

    // MARK: - Call Tracking

    var historyCallCount = 0
    var lastLimit: Int?
    var lastCursor: String?
    var lastFilter: CallHistoryFilter?

    // MARK: - Protocol Conformance

    func history(limit: Int, cursor: String?, filter: CallHistoryFilter) async throws -> CallHistoryPage {
        historyCallCount += 1
        lastLimit = limit
        lastCursor = cursor
        lastFilter = filter
        return try historyResult.get()
    }

    // MARK: - Reset

    func reset() {
        historyResult = .success(CallHistoryPage(records: [], nextCursor: nil, hasMore: false))
        historyCallCount = 0
        lastLimit = nil
        lastCursor = nil
        lastFilter = nil
    }
}
