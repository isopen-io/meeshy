import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// **Un refus DÉFINITIF n'est pas une panne réseau (#7907).**
///
/// Recette 2026-09-25 : un 403 `EMAIL_NOT_VERIFIED` sur la story laissait la
/// carte en « réessayer », chaque réessai échouant pareil ; puis « Stories en
/// attente — publication au retour en ligne », appareil EN LIGNE. Ces témoins
/// tiennent le classement : l'intent quitte la file d'attente pour
/// l'historique d'échecs, la ligne en vol disparaît, et le refus est ANNONCÉ
/// (avec son code) avant ce retrait.
@MainActor
final class StoryUploadRejectionTests: XCTestCase {

    private var sut: StoryViewModel!
    private var mockPostService: MockPostService!
    private var defaultsSuiteName: String!
    private var defaults: UserDefaults!
    private var draftStore: StoryDraftStore!
    private var draftStoreRoot: URL!
    private var cancellables = Set<AnyCancellable>()

    override func setUp() async throws {
        try await super.setUp()
        NetworkMonitor.shared.simulateOnline()
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        await StoryPublishQueue.shared.clearAll()
        await Self.discardFailedHistory()

        defaultsSuiteName = "StoryUploadRejectionTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: defaultsSuiteName)
        mockPostService = MockPostService()
        let api = MockAPIClientForApp()
        api.authToken = "token"
        draftStoreRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryUploadRejectionTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: draftStoreRoot, withIntermediateDirectories: true)
        draftStore = StoryDraftStore(
            dbPath: draftStoreRoot.appendingPathComponent("drafts.sqlite").path,
            mediaDirectory: draftStoreRoot.appendingPathComponent("media")
        )
        sut = StoryViewModel(
            storyService: MockStoryService(),
            postService: mockPostService,
            socialSocket: MockSocialSocket(),
            api: api,
            visibilityStore: StoryVisibilityPreferenceStore(defaults: defaults),
            draftStore: draftStore
        )
    }

    override func tearDown() async throws {
        cancellables.removeAll()
        await StoryPublishFixtureCleanup.purge(sut, defaults: defaults)
        await Self.discardFailedHistory()
        defaults.removePersistentDomain(forName: defaultsSuiteName)
        sut = nil
        mockPostService = nil
        draftStore = nil
        if let draftStoreRoot { try? FileManager.default.removeItem(at: draftStoreRoot) }
        try await super.tearDown()
    }

    private static func discardFailedHistory() async {
        for item in await StoryPublishQueue.shared.failedPendingItems {
            await StoryPublishQueue.shared.discardFailedItem(item.id)
        }
    }

    private static func emailNotVerified() -> MeeshyError {
        .forbidden(
            reason: "Vérifie ton adresse e-mail pour publier",
            body: Data(#"{"success":false,"error":"Vérifie ton adresse e-mail pour publier","code":"EMAIL_NOT_VERIFIED"}"#.utf8)
        )
    }

    private func publish() {
        sut.publishStoryInBackground(slides: [StorySlide()], slideImages: [:], loadedImages: [:], loadedVideoURLs: [:])
    }

    private func waitUntil(_ description: String, timeout: TimeInterval = 8, _ condition: () async -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("Condition jamais atteinte : \(description)")
    }

    // MARK: - Chemin en ligne

    func test_launchUpload_emailNotVerified_announcesTheRejectionWithItsCode() async {
        mockPostService.createStoryResult = .failure(Self.emailNotVerified())
        var rejections: [StoryUploadRejection] = []
        sut.storyUploadRejected.sink { rejections.append($0) }.store(in: &cancellables)

        publish()

        await waitUntil("le refus est annoncé") { !rejections.isEmpty }
        XCTAssertEqual(rejections.first?.code, "EMAIL_NOT_VERIFIED")
    }

    func test_launchUpload_definitiveRefusal_leavesPendingForTheFailedHistory() async {
        mockPostService.createStoryResult = .failure(Self.emailNotVerified())

        publish()

        await waitUntil("l'intent rejoint l'historique d'échecs") {
            !(await StoryPublishQueue.shared.failedPendingItems.isEmpty)
        }
        let pending = await StoryPublishQueue.shared.count
        XCTAssertEqual(pending, 0, "rien n'attend « le retour en ligne » : l'appareil est en ligne")
        XCTAssertTrue(sut.activeUploads.isEmpty, "la ligne ne se rejoue pas à la reconnexion")
        XCTAssertEqual(mockPostService.createStoryCallCount, 1, "aucun réessai")
    }

    func test_launchUpload_networkFailure_staysRetryable() async {
        mockPostService.createStoryResult = .failure(URLError(.notConnectedToInternet))
        var rejections: [StoryUploadRejection] = []
        sut.storyUploadRejected.sink { rejections.append($0) }.store(in: &cancellables)

        publish()

        await waitUntil("l'upload échoue") { [self] in
            sut.activeUploads.contains { $0.phase.isFailed }
        }
        XCTAssertTrue(rejections.isEmpty)
        let history = await StoryPublishQueue.shared.failedPendingItems
        XCTAssertTrue(history.isEmpty)
    }

    // MARK: - Chemin de la file

    func test_executeQueuedPublish_definitiveRefusal_throwsUnrecoverable() async throws {
        mockPostService.createStoryResult = .failure(Self.emailNotVerified())
        let slides = try JSONEncoder.iso8601.encode([StorySlide()])
        let item = StoryPublishQueueItem(visibility: "FRIENDS", slidesPayload: slides)

        do {
            _ = try await sut.executeQueuedPublish(item: item)
            XCTFail("un refus définitif doit lever")
        } catch is StoryPublishUnrecoverableError {
        } catch {
            XCTFail("un 403 EMAIL_NOT_VERIFIED ne se réessaie pas : \(error)")
        }
    }

    // MARK: - La règle

    func test_disposition_refusalAfterACommittedSlide_staysRetryable() {
        XCTAssertEqual(StoryUploadFailureDisposition.of(Self.emailNotVerified(), hasCommittedSlides: true), .retryable)
    }

    func test_disposition_refusalBeforeAnySlide_isRejected() {
        XCTAssertEqual(StoryUploadFailureDisposition.of(Self.emailNotVerified(), hasCommittedSlides: false),
                       .rejected(code: "EMAIL_NOT_VERIFIED"))
    }
}

private extension JSONEncoder {
    static var iso8601: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}
