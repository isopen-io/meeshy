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
}
