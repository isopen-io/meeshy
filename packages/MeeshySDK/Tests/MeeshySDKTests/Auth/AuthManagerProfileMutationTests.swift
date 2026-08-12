import XCTest
import Combine
@testable import MeeshySDK

@MainActor
final class AuthManagerProfileMutationTests: XCTestCase {

    private func makeUser(displayName: String? = "Alice",
                          bio: String? = "Hello",
                          avatar: String? = "https://cdn/old.jpg") -> MeeshyUser {
        MeeshyUser(id: "u1", username: "alice",
                   displayName: displayName, bio: bio, avatar: avatar)
    }

    func test_applyLocalProfileChanges_updatesAllThreeFields_andPublishesCurrentUser() async {
        let auth = AuthManager.shared
        auth.currentUser = makeUser()

        var emitted: [MeeshyUser?] = []
        let cancellable = auth.currentUserPublisher.sink { emitted.append($0) }
        defer { cancellable.cancel() }

        _ = auth.applyLocalProfileChanges(
            displayName: "Bob",
            bio: "World",
            avatarUrl: "https://cdn/new.jpg"
        )

        XCTAssertEqual(auth.currentUser?.displayName, "Bob")
        XCTAssertEqual(auth.currentUser?.bio, "World")
        XCTAssertEqual(auth.currentUser?.avatar, "https://cdn/new.jpg")
        XCTAssertEqual(emitted.count, 2, "initial + 1 mutation")
        XCTAssertEqual(emitted.last??.displayName, "Bob")
    }

    func test_applyLocalProfileChanges_returnsSnapshotOfPreMutationState() async {
        let auth = AuthManager.shared
        auth.currentUser = makeUser(displayName: "Alice", bio: "Hello",
                                     avatar: "https://cdn/old.jpg")

        let snapshot = auth.applyLocalProfileChanges(
            displayName: "Bob",
            bio: "World",
            avatarUrl: "https://cdn/new.jpg"
        )

        XCTAssertEqual(snapshot.displayName, "Alice")
        XCTAssertEqual(snapshot.bio, "Hello")
        XCTAssertEqual(snapshot.avatarUrl, "https://cdn/old.jpg")
    }

    func test_restoreLocalProfileSnapshot_restoresExactPreMutationState() async {
        let auth = AuthManager.shared
        auth.currentUser = makeUser(displayName: "Alice", bio: "Hello",
                                     avatar: "https://cdn/old.jpg")

        let snapshot = auth.applyLocalProfileChanges(
            displayName: "Bob",
            bio: "World",
            avatarUrl: "https://cdn/new.jpg"
        )
        auth.restoreLocalProfileSnapshot(snapshot)

        XCTAssertEqual(auth.currentUser?.displayName, "Alice")
        XCTAssertEqual(auth.currentUser?.bio, "Hello")
        XCTAssertEqual(auth.currentUser?.avatar, "https://cdn/old.jpg")
    }

    // MARK: - U3 — optimistic profile survives a server revalidation/refresh

    /// The /auth/me revalidation (or token-refresh applySession) returns the
    /// PRE-edit profile while the updateProfile outbox row is still in flight —
    /// the optimistic edit must win, not be clobbered.
    func test_resolveServerUserWithOptimistic_serverHasStaleProfile_keepsOptimisticEdit() {
        let server = makeUser(displayName: "Alice", bio: "Hello", avatar: "https://cdn/old.jpg")
        let pending = ProfileSnapshot(displayName: "Bob", bio: "World", avatarUrl: "https://cdn/new.jpg")

        let r = AuthManager.resolveServerUserWithOptimistic(server, pending: pending)

        XCTAssertEqual(r.user.displayName, "Bob")
        XCTAssertEqual(r.user.bio, "World")
        XCTAssertEqual(r.user.avatar, "https://cdn/new.jpg")
        XCTAssertFalse(r.clearedPending, "edit not yet reflected server-side → keep guarding")
    }

    /// Once the edit propagates and the server returns it, drop the guard so a
    /// later external profile change isn't shadowed by the stale optimistic value.
    func test_resolveServerUserWithOptimistic_serverReflectsEdit_clearsGuard() {
        let server = makeUser(displayName: "Bob", bio: "World", avatar: "https://cdn/new.jpg")
        let pending = ProfileSnapshot(displayName: "Bob", bio: "World", avatarUrl: "https://cdn/new.jpg")

        let r = AuthManager.resolveServerUserWithOptimistic(server, pending: pending)

        XCTAssertEqual(r.user.displayName, "Bob")
        XCTAssertTrue(r.clearedPending)
    }

    /// The common login/session path: no optimistic edit → the server user is
    /// authoritative and unchanged (additive guard, zero behavior change here).
    func test_resolveServerUserWithOptimistic_noPending_returnsServerUnchanged() {
        let server = makeUser(displayName: "Server", bio: "Bio", avatar: "https://cdn/s.jpg")

        let r = AuthManager.resolveServerUserWithOptimistic(server, pending: nil)

        XCTAssertEqual(r.user.displayName, "Server")
        XCTAssertEqual(r.user.bio, "Bio")
        XCTAssertFalse(r.clearedPending)
    }

    // MARK: - ProfileSnapshot Codable

    /// The guard must survive a process kill+relaunch (persisted to the
    /// keychain, decoded back on the next cold start) — round trip parity
    /// is the minimum bar for that.
    func test_profileSnapshot_encodesAndDecodesRoundTrip() throws {
        let snapshot = ProfileSnapshot(displayName: "Bob", bio: "World", avatarUrl: "https://cdn/new.jpg")

        let data = try JSONEncoder().encode(snapshot)
        let decoded = try JSONDecoder().decode(ProfileSnapshot.self, from: data)

        XCTAssertEqual(decoded, snapshot)
    }
}

// MARK: - Pending profile guard survives a cold start (keychain-backed)

/// `pendingOptimisticProfile` was in-memory only: killing the app while an
/// `updateProfile` outbox row was still unconfirmed dropped the guard, so the
/// next cold start's `/auth/me` revalidation could clobber the correctly
/// keychain-hydrated optimistic edit with the stale pre-edit server value.
/// These tests swap in an `InMemoryKeychainStore` (production `KeychainManager`
/// silently no-ops outside an app host) to prove the guard itself is now
/// persisted/cleared under a real keychain, mirroring `AuthManagerRefreshTests`.
@MainActor
final class AuthManagerPendingProfilePersistenceTests: XCTestCase {
    private var originalKeychain: (any KeychainStoring)!
    private var mockKeychain: InMemoryKeychainStoreForPendingProfileTests!

    override func setUp() async throws {
        try await super.setUp()
        originalKeychain = AuthManager.shared.keychain
        mockKeychain = InMemoryKeychainStoreForPendingProfileTests()
        AuthManager.shared.keychain = mockKeychain
    }

    override func tearDown() async throws {
        AuthManager.shared.keychain = originalKeychain
        try await super.tearDown()
    }

    private func makeUser() -> MeeshyUser {
        MeeshyUser(id: "u1", username: "alice", displayName: "Alice", bio: "Hello", avatar: "https://cdn/old.jpg")
    }

    func test_applyLocalProfileChanges_persistsPendingGuardToKeychain() {
        let auth = AuthManager.shared
        auth.currentUser = makeUser()

        _ = auth.applyLocalProfileChanges(displayName: nil, bio: "World -qa", avatarUrl: nil)

        let stored = mockKeychain.load(forKey: "meeshy_pending_profile_u1", account: nil)
        XCTAssertNotNil(stored, "the optimistic guard must survive a process kill — nothing was persisted")
        let decoded = try? JSONDecoder().decode(ProfileSnapshot.self, from: Data(stored!.utf8))
        XCTAssertEqual(decoded?.bio, "World -qa")
    }

    func test_restoreLocalProfileSnapshot_clearsPersistedGuard() {
        let auth = AuthManager.shared
        auth.currentUser = makeUser()
        let snapshot = auth.applyLocalProfileChanges(displayName: nil, bio: "World -qa", avatarUrl: nil)
        XCTAssertNotNil(mockKeychain.load(forKey: "meeshy_pending_profile_u1", account: nil))

        auth.restoreLocalProfileSnapshot(snapshot)

        XCTAssertNil(mockKeychain.load(forKey: "meeshy_pending_profile_u1", account: nil),
                      "a rolled-back edit must not leave a stale guard behind for the next cold start")
    }
}

private final class InMemoryKeychainStoreForPendingProfileTests: KeychainStoring, @unchecked Sendable {
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws {
        store[key] = value
    }

    func load(forKey key: String, account: String?) -> String? {
        store[key]
    }

    func delete(forKey key: String, account: String?) {
        store.removeValue(forKey: key)
    }

    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }

    func loadAsync(forKey key: String, account: String?) async -> String? {
        load(forKey: key, account: account)
    }
}
