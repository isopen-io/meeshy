import Foundation
@testable import Meeshy
import MeeshySDK

final class MockContactDirectoryService: ContactDirectoryServiceProviding, @unchecked Sendable {
    var syncResult: Result<DirectorySyncResult, Error> = .success(
        DirectorySyncResult(totalContacts: 0, processedContacts: 0, syncedCount: 0, matchedCount: 0, removedCount: 0)
    )
    var listResult: Result<[DirectoryContact], Error> = .success([])
    var clearResult: Result<DirectoryClearResult, Error> = .success(DirectoryClearResult(removedCount: 0))

    var syncCallCount = 0
    var listCallCount = 0
    var clearCallCount = 0
    var lastSyncRequest: DirectorySyncRequest?
    var lastListFilter: DirectoryFilter?
    var lastListQuery: String?
    var lastListCursor: String?
    /// Le delta demandé — c'est lui qui distingue une première lecture d'un
    /// rattrapage borné (#4163).
    var lastListUpdatedSince: Date?

    func sync(_ request: DirectorySyncRequest) async throws -> DirectorySyncResult {
        syncCallCount += 1
        lastSyncRequest = request
        return try syncResult.get()
    }

    func page(
        cursor: String?,
        limit: Int,
        filter: DirectoryFilter,
        query: String?,
        updatedSince: Date?
    ) async throws -> PaginatedAPIResponse<[DirectoryContact]> {
        listCallCount += 1
        lastListFilter = filter
        lastListQuery = query
        lastListCursor = cursor
        lastListUpdatedSince = updatedSince
        let contacts = try listResult.get()
        // Une SEULE page, sans suite : `nextCursor` nul clôt la lecture. Les
        // témoins de pagination ont leur propre double (`PagedDirectoryStub`),
        // qui sert plusieurs pages.
        return PaginatedAPIResponse(
            success: true,
            data: contacts,
            pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: limit),
            error: nil
        )
    }

    func clear() async throws -> DirectoryClearResult {
        clearCallCount += 1
        return try clearResult.get()
    }

    func reset() {
        syncResult = .success(
            DirectorySyncResult(totalContacts: 0, processedContacts: 0, syncedCount: 0, matchedCount: 0, removedCount: 0)
        )
        listResult = .success([])
        clearResult = .success(DirectoryClearResult(removedCount: 0))
        syncCallCount = 0
        listCallCount = 0
        clearCallCount = 0
        lastSyncRequest = nil
        lastListFilter = nil
        lastListCursor = nil
        lastListUpdatedSince = nil
        lastListQuery = nil
    }
}
