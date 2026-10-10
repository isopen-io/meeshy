import Foundation

// MARK: - Filter

public enum CallHistoryFilter: String, Sendable, CaseIterable {
    case all
    case missed
}

/// The call's media, filtered by the gateway (`?type=`, #8203).
public enum CallHistoryType: String, Sendable, CaseIterable {
    case all
    case audio
    case video
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
    /// One page of the journal, narrowed by the gateway itself (#8203): `type`
    /// keeps one media, `search` the rows whose shown name matches — accent-
    /// and case-insensitive, over the whole 90-day window, in one request.
    func history(
        limit: Int,
        cursor: String?,
        filter: CallHistoryFilter,
        type: CallHistoryType,
        search: String?
    ) async throws -> CallHistoryPage
    /// Hides one call from the reader's own journal (#8066) — never for the
    /// other participants. Throws when the gateway refuses (not a member).
    func hide(callId: String) async throws
    /// Clears the reader's own journal (#8066) and returns how many calls left it.
    func clearAll() async throws -> Int
}

// MARK: - Service

/// Reads the call journal from `GET /api/v1/calls/history` (cursor-paginated,
/// filtered and searched server-side — #8203)
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
        filter: CallHistoryFilter = .all,
        type: CallHistoryType = .all,
        search: String? = nil
    ) async throws -> CallHistoryPage {
        var queryItems = [
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "filter", value: filter.rawValue),
        ]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        if type != .all {
            queryItems.append(URLQueryItem(name: "type", value: type.rawValue))
        }
        if let search = search?.trimmingCharacters(in: .whitespacesAndNewlines), !search.isEmpty {
            queryItems.append(URLQueryItem(name: "q", value: search))
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
