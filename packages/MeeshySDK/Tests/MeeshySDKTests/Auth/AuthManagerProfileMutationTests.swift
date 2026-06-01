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
}
