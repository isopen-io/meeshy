import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class EditProfileViewModelTests: XCTestCase {

    // MARK: - Doubles graph

    struct Doubles {
        let auth: MockAuthManager
        let queue: MockOfflineQueue
        let uploader: MockAttachmentUploader
        let cache: MockProfileCacheWriter
        let sleeper: TestSleeper
        let toast: MockToast
        let haptics: MockHaptic
    }

    func makeUser(
        id: String = "u1",
        username: String = "alice",
        displayName: String? = "Alice",
        bio: String? = "Hello world",
        avatar: String? = "https://cdn/old.jpg"
    ) -> MeeshyUser {
        MeeshyUser(id: id, username: username,
                   displayName: displayName, bio: bio, avatar: avatar)
    }

    func makeSUT(
        currentUser: MeeshyUser? = nil
    ) -> (sut: EditProfileViewModel, doubles: Doubles) {
        let user = currentUser ?? makeUser()
        let auth = MockAuthManager()
        auth.currentUser = user
        let queue = MockOfflineQueue()
        let uploader = MockAttachmentUploader()
        let cache = MockProfileCacheWriter()
        let sleeper = TestSleeper()
        let toast = MockToast()
        let haptics = MockHaptic()
        let sut = EditProfileViewModel(
            authManager: auth, offlineQueue: queue, attachmentUploader: uploader,
            profileCache: cache, sleeper: sleeper, toast: toast, haptics: haptics
        )
        return (sut, Doubles(auth: auth, queue: queue, uploader: uploader,
                              cache: cache, sleeper: sleeper, toast: toast,
                              haptics: haptics))
    }

    // MARK: - Initial state

    func test_init_seedsDisplayName_fromCurrentUser() {
        let (sut, _) = makeSUT(currentUser: makeUser(displayName: "Alice"))
        XCTAssertEqual(sut.displayName, "Alice")
    }

    func test_init_seedsBio_fromCurrentUser() {
        let (sut, _) = makeSUT(currentUser: makeUser(bio: "Hello world"))
        XCTAssertEqual(sut.bio, "Hello world")
    }

    func test_init_hasChangesFalse_whenNoEdits() {
        let (sut, _) = makeSUT()
        XCTAssertFalse(sut.hasChanges)
    }

    // MARK: - hasChanges

    func test_hasChanges_trueAfterDisplayNameEdit() {
        let (sut, _) = makeSUT(currentUser: makeUser(displayName: "Alice"))
        sut.displayName = "Bob"
        XCTAssertTrue(sut.hasChanges)
    }

    func test_hasChanges_trueAfterBioEdit() {
        let (sut, _) = makeSUT(currentUser: makeUser(bio: "Hello"))
        sut.bio = "World"
        XCTAssertTrue(sut.hasChanges)
    }

    func test_hasChanges_trueAfterImageSelection() {
        let (sut, _) = makeSUT()
        sut.selectedImageData = Data([0x01, 0x02, 0x03])
        XCTAssertTrue(sut.hasChanges)
    }
}
