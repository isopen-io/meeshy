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

    // MARK: - saveProfile happy path (no avatar)

    func test_save_appliesOptimisticLocally_beforeEnqueue() async {
        let (sut, doubles) = makeSUT(currentUser: makeUser(displayName: "Alice"))
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(doubles.auth.appliedProfileChanges.count, 1)
        XCTAssertEqual(doubles.auth.appliedProfileChanges.first?.displayName, "Bob")
        XCTAssertEqual(doubles.auth.appliedProfileChanges.first?.bio, "Hello world")
        XCTAssertNil(doubles.auth.appliedProfileChanges.first?.avatarUrl)
    }

    func test_save_enqueuesUpdateProfilePayload_withCmid() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(doubles.queue.enqueueCalls.count, 1)
        XCTAssertEqual(doubles.queue.enqueueCalls.first?.kind, .updateProfile)
        let payload = doubles.queue.lastPayload as? UpdateProfilePayload
        XCTAssertNotNil(payload?.clientMutationId)
        XCTAssertFalse(payload?.clientMutationId.isEmpty ?? true)
    }

    func test_save_persistsOptimisticUserInCache_afterEnqueue() async {
        let user = makeUser(id: "u1", displayName: "Alice")
        let (sut, doubles) = makeSUT(currentUser: user)
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(doubles.cache.saveProfileCalls.count, 1)
        XCTAssertEqual(doubles.cache.saveProfileCalls.first?.userId, "u1")
        XCTAssertEqual(doubles.cache.saveProfileCalls.first?.user.displayName, "Bob",
                       "Cache write captures the post-optimistic user")
    }

    func test_save_callsDismissCallback_afterSuccessDelay() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"
        var dismissed = false

        await sut.saveProfile(onDismiss: { dismissed = true })

        XCTAssertTrue(dismissed)
        XCTAssertEqual(doubles.sleeper.sleepCalls, [1500])
    }

    // MARK: - saveProfile with avatar

    func test_save_uploadsAvatarBeforeEnqueue_whenImageSelected() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"
        sut.selectedImageData = Data([0x01, 0x02, 0x03])
        doubles.uploader.uploadAvatarResult = .success(URL(string: "https://cdn/new.jpg")!)

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(doubles.uploader.uploadAvatarCallCount, 1)
        XCTAssertEqual(doubles.uploader.lastUploadAvatarData, Data([0x01, 0x02, 0x03]))
    }

    func test_save_enqueuesPayloadWithUploadedUrl() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"
        sut.selectedImageData = Data([0x01])
        doubles.uploader.uploadAvatarResult = .success(URL(string: "https://cdn/new.jpg")!)

        await sut.saveProfile(onDismiss: {})

        let payload = doubles.queue.lastPayload as? UpdateProfilePayload
        XCTAssertEqual(payload?.avatarUrl, "https://cdn/new.jpg")
    }
}
