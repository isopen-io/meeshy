import Foundation

// MARK: - Filter

public enum CallHistoryFilter: String, Sendable, CaseIterable {
    case all
    case missed
}

// MARK: - Page

public struct CallHistoryPage: Sendable {
    public let records: [APICallRecord]
    public let nextCursor: String?
    public let hasMore: Bool

    public init(records: [APICallRecord], nextCursor: String?, hasMore: Bool) {
        self.records = records
        self.nextCursor = nextCursor
        self.hasMore = hasMore
    }
}

// MARK: - Erase results

struct CallHistoryHideResult: Decodable {
    let callId: String?
    let hidden: Bool?
}

struct CallHistoryClearResult: Decodable {
    let cleared: Int
}

// MARK: - Protocol

public protocol CallHistoryServiceProviding: Sendable {
    func history(limit: Int, cursor: String?, filter: CallHistoryFilter) async throws -> CallHistoryPage
    /// Hides one call from the reader's own journal (#8066) — never for the
    /// other participants. Throws when the gateway refuses (not a member).
    func hide(callId: String) async throws
    /// Clears the reader's own journal (#8066) and returns how many calls left it.
    func clearAll() async throws -> Int
}

// MARK: - Service

/// Reads the call journal from `GET /api/v1/calls/history` (cursor-paginated)
/// and erases it for the reader alone (`DELETE /api/v1/calls/history[/:callId]`).
public final class CallHistoryService: CallHistoryServiceProviding, @unchecked Sendable {
    public static let shared = CallHistoryService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func history(
        limit: Int = 30,
        cursor: String? = nil,
        filter: CallHistoryFilter = .all
    ) async throws -> CallHistoryPage {
        var queryItems = [
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "filter", value: filter.rawValue),
        ]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }

        let response: PaginatedAPIResponse<[APICallRecord]> = try await api.request(
            CallsEndpoint.history,
            queryItems: queryItems
        )

        return CallHistoryPage(
            records: response.data,
            nextCursor: response.pagination?.nextCursor,
            hasMore: response.pagination?.hasMore ?? false
        )
    }

    public func hide(callId: String) async throws {
        let _: APIResponse<CallHistoryHideResult> = try await api.request(
            CallsEndpoint.historyByCallId(callId: callId),
            method: "DELETE"
        )
    }

    public func clearAll() async throws -> Int {
        let response: APIResponse<CallHistoryClearResult> = try await api.request(
            CallsEndpoint.history,
            method: "DELETE"
        )
        return response.data.cleared
    }
}
