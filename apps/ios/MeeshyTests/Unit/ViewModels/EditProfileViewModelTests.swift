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
        let toast: MockFeedbackToast
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
        let toast = MockFeedbackToast()
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
        let (sut, doubles) = makeSUT(currentUser: makeUser(displayName: "Alice", bio: "Hello world"))
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(doubles.auth.appliedProfileChanges.count, 1)
        XCTAssertEqual(doubles.auth.appliedProfileChanges.first?.displayName, "Bob")
        // bio was never touched — it must be omitted (nil), not resent, so
        // `withProfileChanges`'s `bio ?? self.bio` keeps the existing value
        // rather than the caller re-asserting a value that happens to match.
        XCTAssertNil(doubles.auth.appliedProfileChanges.first?.bio)
        XCTAssertNil(doubles.auth.appliedProfileChanges.first?.avatarUrl)
    }

    func test_save_clearingBio_sendsEmptyString_notOmitted() async {
        let (sut, doubles) = makeSUT(currentUser: makeUser(bio: "Hello world"))
        sut.bio = ""

        await sut.saveProfile(onDismiss: {})

        let payload = doubles.queue.lastPayload as? UpdateProfilePayload
        XCTAssertEqual(payload?.bio, "",
            "Clearing a previously-set bio must send an explicit empty string, not omit the field")
        XCTAssertEqual(doubles.auth.appliedProfileChanges.first?.bio, "",
            "The optimistic apply must also reflect the clear, not silently keep the old bio")
    }

    func test_save_bioUnchanged_omitsFieldFromPayload() async {
        let (sut, doubles) = makeSUT(currentUser: makeUser(bio: "Hello world"))
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        let payload = doubles.queue.lastPayload as? UpdateProfilePayload
        XCTAssertNil(payload?.bio, "Untouched bio must be omitted (nil), not resent")
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

    // MARK: - Failure paths + outcome observer

    func test_save_setsFailedState_whenAvatarUploadThrows_noLocalMutation() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"
        sut.selectedImageData = Data([0x01])
        doubles.uploader.uploadAvatarResult = .failure(APIError.serverError(500, "boom"))

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(sut.saveState, .failed)
        XCTAssertEqual(doubles.queue.enqueueCalls.count, 0)
        XCTAssertEqual(doubles.auth.appliedProfileChanges.count, 0,
                       "No local mutation when upload fails")
        XCTAssertEqual(doubles.auth.restoredSnapshots.count, 0,
                       "Nothing to rollback")
        XCTAssertNotNil(sut.errorMessage)
    }

    func test_save_rollsBackSnapshot_whenEnqueueThrows() async {
        let (sut, doubles) = makeSUT(currentUser: makeUser(displayName: "Alice"))
        sut.displayName = "Bob"
        doubles.queue.enqueueResult = .failure(APIError.serverError(500, "queue dead"))

        await sut.saveProfile(onDismiss: {})

        XCTAssertEqual(sut.saveState, .failed)
        XCTAssertEqual(doubles.auth.appliedProfileChanges.count, 1)
        XCTAssertEqual(doubles.auth.restoredSnapshots.count, 1)
        XCTAssertEqual(doubles.auth.restoredSnapshots.first?.displayName, "Alice")
    }

    func test_save_rollsBackSnapshot_whenOutcomeStreamEmitsExhausted() async {
        let (sut, doubles) = makeSUT(currentUser: makeUser(displayName: "Alice"))
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        guard let call = doubles.queue.enqueueCalls.first,
              let payload = call.payload as? UpdateProfilePayload else {
            return XCTFail("no enqueue call")
        }

        // Wait for the observer Task to register its continuation
        // (fire-and-forget Task scheduled inside saveProfile).
        try? await waitForContinuation(in: doubles.queue,
                                        for: payload.clientMutationId)

        doubles.queue.emitOutcome(.exhausted(cmid: payload.clientMutationId),
                                   for: payload.clientMutationId)

        // Give the observer Task a tick to run.
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertGreaterThanOrEqual(doubles.auth.restoredSnapshots.count, 1)
        XCTAssertEqual(doubles.haptics.errorCount, 1)
        XCTAssertEqual(doubles.toast.errorMessages.count, 1)
    }

    func test_save_doesNotRollback_whenOutcomeStreamEmitsApplied() async {
        let (sut, doubles) = makeSUT()
        sut.displayName = "Bob"

        await sut.saveProfile(onDismiss: {})

        guard let payload = doubles.queue.lastPayload as? UpdateProfilePayload else {
            return XCTFail("no payload")
        }
        try? await waitForContinuation(in: doubles.queue,
                                        for: payload.clientMutationId)
        doubles.queue.emitOutcome(.applied(cmid: payload.clientMutationId),
                                   for: payload.clientMutationId)
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(doubles.auth.restoredSnapshots.count, 0)
        XCTAssertEqual(doubles.haptics.errorCount, 0)
    }

    /// Polls the mock's continuation dict until the observer has registered
    /// its continuation for `cmid`. Times out after 500 ms (50 × 10 ms).
    private func waitForContinuation(
        in queue: MockOfflineQueue,
        for cmid: String
    ) async throws {
        for _ in 0..<50 {
            if queue.outcomeContinuations[cmid] != nil { return }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Observer continuation never registered for cmid=\(cmid)")
    }
}
