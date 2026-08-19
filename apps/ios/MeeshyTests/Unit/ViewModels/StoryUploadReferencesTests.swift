import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// La publication DÉCLARE les modes que l'auteur a choisis. Elle ne devine plus
/// les `@handle` des objets texte : le serveur les relit lui-même (légende ET
/// canevas, badges exclus), et deux dériveurs finiraient par ne plus dire la
/// même chose.
///
/// Toute suite qui publie DOIT purger ses fixtures : `MeeshyTests` est hébergé
/// dans `Meeshy.app`, un résidu est visible au lancement suivant.
@MainActor
final class StoryUploadReferencesTests: XCTestCase {

    private var sut: StoryViewModel!
    private var mockStoryService: MockStoryService!
    private var mockPostService: MockPostService!
    private var mockSocket: MockSocialSocket!
    private var mockAPI: MockAPIClientForApp!
    private var defaultsSuiteName: String!
    private var defaults: UserDefaults!
    private var draftStore: StoryDraftStore!
    private var draftStoreRoot: URL!

    override func setUp() async throws {
        try await super.setUp()
        NetworkMonitor.shared.simulateOnline()
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        await StoryPublishQueue.shared.clearAll()

        defaultsSuiteName = "StoryUploadReferencesTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: defaultsSuiteName)
        mockStoryService = MockStoryService()
        mockPostService = MockPostService()
        mockSocket = MockSocialSocket()
        mockAPI = MockAPIClientForApp()
        mockAPI.authToken = "token"
        draftStoreRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryUploadReferencesTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: draftStoreRoot, withIntermediateDirectories: true)
        draftStore = StoryDraftStore(
            dbPath: draftStoreRoot.appendingPathComponent("drafts.sqlite").path,
            mediaDirectory: draftStoreRoot.appendingPathComponent("media")
        )
        sut = StoryViewModel(
            storyService: mockStoryService,
            postService: mockPostService,
            socialSocket: mockSocket,
            api: mockAPI,
            visibilityStore: StoryVisibilityPreferenceStore(defaults: defaults),
            draftStore: draftStore
        )
    }

    override func tearDown() async throws {
        await StoryPublishFixtureCleanup.purge(sut, defaults: defaults)
        defaults.removePersistentDomain(forName: defaultsSuiteName)
        defaults = nil
        defaultsSuiteName = nil
        sut = nil
        mockStoryService = nil
        mockPostService = nil
        mockSocket = nil
        mockAPI = nil
        draftStore = nil
        if let draftStoreRoot { try? FileManager.default.removeItem(at: draftStoreRoot) }
        draftStoreRoot = nil
        try await super.tearDown()
    }

    func test_upload_sendsDeclaredModes_notDerivedHandles() async {
        publish(references: [
            ComposerReference(username: "alice", userId: "u-a", display: .pinned),
            ComposerReference(username: "bob", userId: nil, display: .silent),
        ])

        await waitUntil("la story est publiée") { [self] in
            mockPostService.createStoryCallCount > 0
        }

        let sent = mockPostService.lastCreateStoryMentions ?? []
        XCTAssertEqual(sent.count, 2)
        XCTAssertEqual(sent.first?.userId, "u-a")
        XCTAssertEqual(sent.first?.display, "PINNED")
        XCTAssertEqual(sent.last?.username, "bob")
        XCTAssertEqual(sent.last?.display, "SILENT")
    }

    func test_upload_doesNotDeriveMentionsFromTextObjects() async {
        // La dérivation vivait ici (`handles(inAll: textObjects.map(\.text))`).
        // Elle appartient désormais au SERVEUR, qui relit le texte lui-même —
        // deux dériveurs finiraient par ne plus dire la même chose.
        publish(slides: [slide(withTextObjects: [StoryTextObject(text: "coucou @carol")])])

        await waitUntil("la story est publiée") { [self] in
            mockPostService.createStoryCallCount > 0
        }

        XCTAssertNil(mockPostService.lastCreateStoryMentions,
                     "Un @handle écrit dans un objet texte n'est plus déclaré par le client")
    }

    func test_upload_declaresTheBadgesTheCanvasCarries_evenWithoutADeclaredList() async {
        // Le serveur EXCLUT les badges de sa relecture (`referenceUserId` les
        // distingue d'une phrase). Un brouillon repris a perdu la liste
        // déclarée mais a gardé son canevas : sans cette union, la pastille
        // resterait visible et ne préviendrait personne.
        var badge = StoryTextObject(text: "@alice")
        badge.referenceUserId = "u-a"
        publish(slides: [slide(withTextObjects: [badge])])

        await waitUntil("la story est publiée") { [self] in
            mockPostService.createStoryCallCount > 0
        }

        let sent = mockPostService.lastCreateStoryMentions ?? []
        XCTAssertEqual(sent.count, 1)
        XCTAssertEqual(sent.first?.userId, "u-a")
        XCTAssertEqual(sent.first?.display, "PINNED")
    }

    func test_upload_doesNotDeclareTheSameBadgeTwice() async {
        var badge = StoryTextObject(text: "@alice")
        badge.referenceUserId = "u-a"
        publish(slides: [slide(withTextObjects: [badge])],
                references: [ComposerReference(username: "alice", userId: "u-a", display: .pinned)])

        await waitUntil("la story est publiée") { [self] in
            mockPostService.createStoryCallCount > 0
        }

        XCTAssertEqual(mockPostService.lastCreateStoryMentions?.count, 1)
    }

    // MARK: - Helpers

    private func slide(withTextObjects objects: [StoryTextObject]) -> StorySlide {
        var slide = StorySlide()
        var effects = StoryEffects()
        effects.textObjects = objects
        slide.effects = effects
        return slide
    }

    private func publish(slides: [StorySlide] = [StorySlide()],
                         references: [ComposerReference] = []) {
        sut.publishStoryInBackground(
            slides: slides,
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            visibility: PostVisibility.friends.rawValue,
            references: references
        )
    }

    /// Attente par CONDITION (jamais un `Task.sleep` fixe) : les chaînes
    /// persist → revendication → enrichissement → drain sont asynchrones.
    private func waitUntil(
        _ description: String,
        timeout: TimeInterval = 8,
        _ condition: () async -> Bool
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("Condition jamais atteinte : \(description)")
    }
}
