import Foundation

// MARK: - Filter

public enum CallHistoryFilter: String, Sendable {
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

// MARK: - Protocol

public protocol CallHistoryServiceProviding: Sendable {
    func history(limit: Int, cursor: String?, filter: CallHistoryFilter) async throws -> CallHistoryPage
}

// MARK: - Service

/// Reads the call journal from `GET /api/v1/calls/history` (cursor-paginated).
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
            endpoint: "/calls/history",
            queryItems: queryItems
        )

        return CallHistoryPage(
            records: response.data,
            nextCursor: response.pagination?.nextCursor,
            hasMore: response.pagination?.hasMore ?? false
        )
    }
}
