import Foundation
import Contacts
@testable import Meeshy
import MeeshySDK

final class MockContactSyncService: ContactSyncProviding, @unchecked Sendable {
    var authorizationStatusResult: CNAuthorizationStatus = .authorized
    var requestAccessResult = true
    var findFriendsResult: Result<[ContactMatch], Error> = .success([])
    var syncDirectoryResult: Result<DirectorySyncResult, Error> = .success(
        DirectorySyncResult(totalContacts: 0, processedContacts: 0, syncedCount: 0, matchedCount: 0, removedCount: 0)
    )

    var requestAccessCallCount = 0
    var findFriendsCallCount = 0
    var syncDirectoryCallCount = 0
    var lastSyncDirectoryMode: DirectorySyncMode?

    func authorizationStatus() -> CNAuthorizationStatus {
        authorizationStatusResult
    }

    func requestAccess() async -> Bool {
        requestAccessCallCount += 1
        return requestAccessResult
    }

    func findFriendsFromContacts() async throws -> [ContactMatch] {
        findFriendsCallCount += 1
        return try findFriendsResult.get()
    }

    func syncDirectory(mode: DirectorySyncMode) async throws -> DirectorySyncResult {
        syncDirectoryCallCount += 1
        lastSyncDirectoryMode = mode
        return try syncDirectoryResult.get()
    }

    func reset() {
        authorizationStatusResult = .authorized
        requestAccessResult = true
        findFriendsResult = .success([])
        syncDirectoryResult = .success(
            DirectorySyncResult(totalContacts: 0, processedContacts: 0, syncedCount: 0, matchedCount: 0, removedCount: 0)
        )
        requestAccessCallCount = 0
        findFriendsCallCount = 0
        syncDirectoryCallCount = 0
        lastSyncDirectoryMode = nil
    }
}
