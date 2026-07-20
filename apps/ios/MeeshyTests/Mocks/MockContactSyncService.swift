import Foundation
import Contacts
@testable import Meeshy
import MeeshySDK

final class MockContactSyncService: ContactSyncProviding, @unchecked Sendable {
    var authorizationStatusResult: CNAuthorizationStatus = .authorized
    var requestAccessResult = true
    var findFriendsResult: Result<[ContactMatch], Error> = .success([])

    var requestAccessCallCount = 0
    var findFriendsCallCount = 0

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

    func reset() {
        authorizationStatusResult = .authorized
        requestAccessResult = true
        findFriendsResult = .success([])
        requestAccessCallCount = 0
        findFriendsCallCount = 0
    }
}
