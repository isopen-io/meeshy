import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// V3-3 — **choisir « Post » publie un post.**
///
/// Le composer offrait un éventail de formats dont l'envoi ne savait rien :
/// `CreateStoryRequest.type` était un littéral figé, et la file de publication
/// appelait `createStory` quoi qu'il arrive. Cette suite éprouve le fil app-side
/// de bout en bout — du hand-off au service — sur les DEUX chemins, en ligne et
/// hors-ligne.
///
/// Le chemin hors-ligne compte autant que l'autre : le format ne vit nulle part
/// ailleurs que dans l'item de file (le brouillon ne le porte pas), donc un
/// rejeu qui ne l'emporterait pas republierait une story là où l'auteur avait
/// choisi « Post » — des heures plus tard, sans rien pour le dire.
///
/// Toute suite qui publie DOIT purger ses fixtures : `MeeshyTests` est hébergé
/// dans `Meeshy.app`, un résidu est visible au lancement suivant.
@MainActor
final class StoryUploadFormatTests: XCTestCase {

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

        defaultsSuiteName = "StoryUploadFormatTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: defaultsSuiteName)
        mockStoryService = MockStoryService()
        mockPostService = MockPostService()
        mockSocket = MockSocialSocket()
        mockAPI = MockAPIClientForApp()
        mockAPI.authToken = "token"
        draftStoreRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryUploadFormatTests-\(UUID().uuidString)")
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
        await StoryPublishQueue.shared.clearAll()
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

    // MARK: - En ligne

    /// LE test de ce lot : le format choisi atteint le service. Il rougissait
    /// avant V3-3, où le seul appel possible était `createStory`.
    func test_publishing_asAPost_sendsAPost() async {
        sut.publishStoryInBackground(
            targetType: .post,
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            visibility: PostVisibility.friends.rawValue
        )

        await waitUntil("la publication a atteint le service") { [self] in
            mockPostService.lastCreateCanvasPostType != nil
        }

        XCTAssertEqual(mockPostService.lastCreateCanvasPostType, .post,
                       "Choisir « Post » doit publier un POST, pas une story.")
    }

    func test_publishing_asAReel_sendsAReel() async {
        sut.publishStoryInBackground(
            targetType: .reel,
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            visibility: PostVisibility.friends.rawValue
        )

        await waitUntil("la publication a atteint le service") { [self] in
            mockPostService.lastCreateCanvasPostType != nil
        }

        XCTAssertEqual(mockPostService.lastCreateCanvasPostType, .reel)
    }

    /// Non-régression de TOUTES les surfaces sans éventail (édition,
    /// republication, portes historiques) : elles ne passent aucun format et
    /// doivent publier exactement ce qu'elles publiaient.
    func test_publishing_withoutChoosing_stillSendsAStory() async {
        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            visibility: PostVisibility.friends.rawValue
        )

        await waitUntil("la publication a atteint le service") { [self] in
            mockPostService.lastCreateCanvasPostType != nil
        }

        XCTAssertEqual(mockPostService.lastCreateCanvasPostType, .story)
    }

    // MARK: - Hors-ligne : le format doit SURVIVRE à la file

    func test_theQueuedPublish_remembersTheChosenFormat() async {
        await sut.enqueueStoryForOfflinePublish(
            targetType: .post,
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:],
            loadedAudioURLs: [:],
            visibility: "PUBLIC",
            visibilityUserIds: []
        )

        let items = await StoryPublishQueue.shared.pendingItems
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items.first?.targetTypePayload, "POST",
                       "Le format ne vit nulle part ailleurs : un rejeu qui ne l'emporte pas republie une story.")
    }

    /// Une file écrite avant ce champ (ou par une version qui l'ignore) reste
    /// publiable, et publie ce qu'elle a toujours publié.
    func test_aQueuedItemWithoutAFormat_isReadAsAStory() {
        let item = StoryPublishQueueItem(visibility: "PUBLIC", slidesPayload: Data())

        XCTAssertNil(item.targetTypePayload)
        XCTAssertEqual(item.targetTypePayload.flatMap(PostType.init(rawValue:)) ?? .story, .story)
    }

    /// Un format inconnu (row écrite par une version future) ne doit pas faire
    /// échouer le rejeu : il retombe sur la story, et la publication part.
    func test_anUnknownQueuedFormat_fallsBackToAStory_ratherThanFailing() {
        let item = StoryPublishQueueItem(visibility: "PUBLIC", slidesPayload: Data(),
                                         targetTypePayload: "PODCAST")

        XCTAssertEqual(item.targetTypePayload.flatMap(PostType.init(rawValue:)) ?? .story, .story)
    }

    // MARK: - Helpers

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
