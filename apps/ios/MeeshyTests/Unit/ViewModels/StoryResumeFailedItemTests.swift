import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

// MARK: - StoryResumeFailedItemTests
//
// Incrément 5 de la spec « brouillons multiples et récupération » : l'action
// « Reprendre » convertit un échec de publication en brouillon ÉDITABLE.
//
// L'invariant central est l'ORDRE : le brouillon (slides + copies des médias)
// est écrit et VÉRIFIÉ avant que l'item de file ne soit retiré. Un échec au
// milieu (payload corrompu, média disparu, copie ratée) laisse l'item INTACT —
// le travail n'est jamais perdu entre deux états.
//
// Le retrait de l'item passe par le seam `failedItemDiscarder` (le chemin réel
// traverse `StoryPublishService.shared` → la queue actor singleton, que ces
// tests ne doivent pas muter).
@MainActor
final class StoryResumeFailedItemTests: XCTestCase {

    private var cancellables: Set<AnyCancellable> = []
    private var tempRoot: URL!

    override func setUp() async throws {
        try await super.setUp()
        cancellables = []
        tempRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryResumeFailedItemTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
    }

    override func tearDown() async throws {
        cancellables = []
        if let tempRoot { try? FileManager.default.removeItem(at: tempRoot) }
        tempRoot = nil
        try await super.tearDown()
    }

    // MARK: - Factories

    private func makeSUT() -> StoryViewModel {
        StoryViewModel(
            storyService: MockStoryService(),
            postService: MockPostService(),
            socialSocket: MockSocialSocket(),
            api: MockAPIClientForApp(),
            visibilityStore: StoryVisibilityPreferenceStore(
                defaults: UserDefaults(suiteName: "StoryResumeFailedItemTests-\(UUID().uuidString)")!
            )
        )
    }

    private func makeDraftStore() -> StoryDraftStore {
        StoryDraftStore(
            dbPath: tempRoot.appendingPathComponent("drafts.db").path,
            mediaDirectory: tempRoot.appendingPathComponent("media")
        )
    }

    private func writeImageFile(named name: String) throws -> URL {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8))
        let image = renderer.image { ctx in
            UIColor.systemIndigo.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        let url = tempRoot.appendingPathComponent(name)
        try XCTUnwrap(image.jpegData(compressionQuality: 0.9)).write(to: url)
        return url
    }

    private func writeAudioFile(named name: String) throws -> URL {
        let url = tempRoot.appendingPathComponent(name)
        try Data([0x00, 0x01, 0x02, 0x03]).write(to: url)
        return url
    }

    private func makeSlidesPayload(slideIds: [String] = [UUID().uuidString]) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let slides = slideIds.enumerated().map { index, id in
            StorySlide(id: id, content: "slide \(index)", effects: StoryEffects(), duration: 5, order: index)
        }
        return try encoder.encode(slides)
    }

    private func makeFailedItem(
        slidesPayload: Data,
        mediaReferences: [StoryMediaReference] = []
    ) -> StoryPublishQueueItem {
        StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: slidesPayload,
            mediaReferences: mediaReferences,
            originalLanguage: "fr"
        )
    }

    // MARK: - Succès : brouillon écrit, PUIS item retiré

    func test_resumeFailedItem_success_writesDraftThenDiscardsItem() async throws {
        let sut = makeSUT()
        let store = makeDraftStore()
        let slideId = UUID().uuidString
        let bgURL = try writeImageFile(named: "bg.jpg")
        let audioURL = try writeAudioFile(named: "voice.m4a")
        let item = makeFailedItem(
            slidesPayload: try makeSlidesPayload(slideIds: [slideId]),
            mediaReferences: [
                StoryMediaReference(elementId: "slide-bg-\(slideId)", mediaType: "image", localFilePath: bgURL.path),
                StoryMediaReference(elementId: "audio-1", mediaType: "audio", localFilePath: audioURL.path),
            ]
        )

        var discardCount = 0
        var draftIdsListedAtDiscard: [String] = []
        sut.failedItemDiscarder = { _ in
            discardCount += 1
            draftIdsListedAtDiscard = store.listDrafts().map(\.id)
        }

        let draftId = await sut.resumeFailedItem(item, draftStore: store)

        let resolvedId = try XCTUnwrap(draftId, "La reprise doit produire un brouillon")
        XCTAssertEqual(discardCount, 1, "L'item de file doit être retiré après la copie")
        XCTAssertTrue(
            draftIdsListedAtDiscard.contains(resolvedId),
            "ORDRE : le brouillon doit déjà être listé AU MOMENT du discard — sinon un crash entre les deux perd le travail"
        )

        let summary = try XCTUnwrap(store.listDrafts().first { $0.id == resolvedId })
        XCTAssertEqual(summary.slideCount, 1)

        let persistedIds = Set(store.loadMediaReferences(draftId: resolvedId).map(\.elementId))
        XCTAssertEqual(
            persistedIds, ["slide-bg-\(slideId)", "audio-1"],
            "Chaque média de l'item doit avoir sa COPIE sous meeshy_draft_media/<draftId>/"
        )
        let copiedPaths = store.loadMediaReferences(draftId: resolvedId).map(\.localFilePath)
        XCTAssertFalse(
            copiedPaths.contains(bgURL.path),
            "Les médias doivent être COPIÉS (l'item peut être supprimé ensuite sans les emporter)"
        )
    }

    // MARK: - Fidélité d'audience et de langue

    func test_resumeFailedItem_success_preservesAudienceAndLanguage() async throws {
        let sut = makeSUT()
        let store = makeDraftStore()
        let item = StoryPublishQueueItem(
            visibility: "ONLY",
            slidesPayload: try makeSlidesPayload(),
            visibilityUserIds: ["u1", "u2"],
            originalLanguage: "pt"
        )
        sut.failedItemDiscarder = { _ in }

        let draftId = await sut.resumeFailedItem(item, draftStore: store)

        let resolvedId = try XCTUnwrap(draftId)
        let stored = try XCTUnwrap(store.load(draftId: resolvedId))
        XCTAssertEqual(stored.visibility, "ONLY")
        XCTAssertEqual(
            stored.visibilityUserIds, ["u1", "u2"],
            "La liste « Seulement… » doit survivre à la reprise — sinon le brouillon repris publierait vers personne"
        )
        XCTAssertEqual(
            stored.originalLanguage, "pt",
            "La langue d'origine (Prisme Linguistique) doit survivre à la reprise"
        )
    }

    // MARK: - Payload corrompu : item INTACT

    func test_resumeFailedItem_corruptPayload_leavesItemIntact() async {
        let sut = makeSUT()
        let store = makeDraftStore()
        let item = makeFailedItem(slidesPayload: Data("not json".utf8))

        var discardCount = 0
        sut.failedItemDiscarder = { _ in discardCount += 1 }

        let draftId = await sut.resumeFailedItem(item, draftStore: store)

        XCTAssertNil(draftId)
        XCTAssertEqual(discardCount, 0, "Un payload indécodable ne doit JAMAIS retirer l'item de file")
        XCTAssertTrue(store.listDrafts().isEmpty, "Aucun brouillon fantôme ne doit rester")
    }

    // MARK: - Média manquant : item INTACT, pas de brouillon partiel

    func test_resumeFailedItem_missingMediaFile_leavesItemIntact() async throws {
        let sut = makeSUT()
        let store = makeDraftStore()
        let item = makeFailedItem(
            slidesPayload: try makeSlidesPayload(),
            mediaReferences: [
                StoryMediaReference(
                    elementId: "gone-1",
                    mediaType: "image",
                    localFilePath: tempRoot.appendingPathComponent("does-not-exist.jpg").path
                ),
            ]
        )

        var discardCount = 0
        sut.failedItemDiscarder = { _ in discardCount += 1 }

        let draftId = await sut.resumeFailedItem(item, draftStore: store)

        XCTAssertNil(draftId)
        XCTAssertEqual(discardCount, 0, "Un média manquant laisse l'item de file INTACT")
        XCTAssertTrue(
            store.listDrafts().isEmpty,
            "Pas de brouillon aux médias manquants : le travail ne doit jamais être perdu entre deux états"
        )
    }

    // MARK: - Slides vides : item INTACT

    func test_resumeFailedItem_emptySlides_leavesItemIntact() async throws {
        let sut = makeSUT()
        let store = makeDraftStore()
        let item = makeFailedItem(slidesPayload: try makeSlidesPayload(slideIds: []))

        var discardCount = 0
        sut.failedItemDiscarder = { _ in discardCount += 1 }

        let draftId = await sut.resumeFailedItem(item, draftStore: store)

        XCTAssertNil(draftId)
        XCTAssertEqual(discardCount, 0)
        XCTAssertTrue(store.listDrafts().isEmpty)
    }

    // MARK: - Câblage composer : pendingDraftId posé AVANT showStoryComposer

    func test_openComposer_resumingDraft_setsPendingDraftIdBeforePresentingComposer() {
        let sut = makeSUT()
        var pendingAtPresentation: String?

        sut.$showStoryComposer
            .dropFirst()
            .filter { $0 }
            .sink { [weak sut] _ in
                pendingAtPresentation = sut?.pendingDraftId
            }
            .store(in: &cancellables)

        sut.openComposer(resumingDraftId: "draft-42")

        XCTAssertTrue(sut.showStoryComposer)
        XCTAssertEqual(
            pendingAtPresentation, "draft-42",
            "pendingDraftId doit être posé AVANT showStoryComposer — sinon le composer s'ouvre sur un id neuf et duplique le brouillon"
        )
    }
}
