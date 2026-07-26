import XCTest
import Combine
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

// MARK: - StorySaveProgressMapperTests

/// Le bake occupe 0…90 % de l'anneau, l'écriture Photos les 10 % restants.
/// Sans ce découpage l'anneau atteindrait 100 % avant que la vidéo ne soit
/// dans la photothèque — l'utilisateur croirait l'enregistrement terminé.
///
/// `@MainActor` : `StorySaveProgressMapper` vit dans le target `Meeshy`, dont
/// `SWIFT_DEFAULT_ACTOR_ISOLATION` est `MainActor` (SE-0466) — un type non
/// annoté y est donc main-actor-isolé par défaut. Même patron que
/// `StoryExportPreflightTests` (Task 1) pour la même raison.
@MainActor
final class StorySaveProgressMapperTests: XCTestCase {

    func test_bake_zero_isZero() {
        XCTAssertEqual(StorySaveProgressMapper.bake(0), 0, accuracy: 0.0001)
    }

    func test_bake_full_stopsAtBakeShare() {
        XCTAssertEqual(StorySaveProgressMapper.bake(1), 0.9, accuracy: 0.0001)
    }

    func test_bake_half_isHalfOfBakeShare() {
        XCTAssertEqual(StorySaveProgressMapper.bake(0.5), 0.45, accuracy: 0.0001)
    }

    func test_bake_clampsAboveOne() {
        XCTAssertEqual(StorySaveProgressMapper.bake(1.5), 0.9, accuracy: 0.0001)
    }

    func test_bake_clampsBelowZero() {
        XCTAssertEqual(StorySaveProgressMapper.bake(-0.2), 0, accuracy: 0.0001)
    }
}

// MARK: - Doubles

/// Exporteur pilotable : publie une suite de fractions puis rend (ou non) une URL.
/// Distinct de `MockShareExporter` (StoryExportShareViewModelTests) parce que ce
/// service a besoin de scripter la progression, pas seulement le résultat.
@MainActor
final class ScriptedStoryExporter: StoryVideoExportServiceProviding {

    enum Outcome { case success, failure }

    var outcome: Outcome = .success
    /// Fractions publiées via `onProgress` avant de rendre le résultat.
    var progressScript: [Double] = []

    private(set) var prepareCallCount = 0
    private(set) var cleanupCallCount = 0
    private(set) var lastLanguages: [String] = []
    private(set) var lastCleanupURL: URL?
    private(set) var lastBakedURL: URL?

    func prepareExport(
        slide: StorySlide,
        languages: [String],
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryExportPhase) -> Void)?
    ) async -> URL? {
        prepareCallCount += 1
        lastLanguages = languages
        for fraction in progressScript { onProgress?(fraction) }

        switch outcome {
        case .success:
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("scripted-save-\(UUID().uuidString).mp4")
            do { try Data().write(to: url) } catch { XCTFail("temp write failed: \(error)") }
            lastBakedURL = url
            return url
        case .failure:
            return nil
        }
    }

    func cleanupExport(at url: URL) {
        cleanupCallCount += 1
        lastCleanupURL = url
        do { try FileManager.default.removeItem(at: url) } catch { /* déjà absent */ }
    }
}

/// Photothèque simulée. `MockPhotoLibrarySaver` (MediaSaveCoordinatorTests) est
/// `private` à son fichier — d'où ce double dédié.
final class StubPhotoSaver: PhotoLibrarySaving, @unchecked Sendable {

    enum Failure: Error { case denied }

    var shouldFail = false
    private(set) var savedVideoURLs: [URL] = []

    func saveImage(_ data: Data) async throws {}

    func saveVideo(at url: URL) async throws {
        savedVideoURLs.append(url)
        if shouldFail { throw Failure.denied }
    }
}

// MARK: - StoryPhotoSaveServiceTests

@MainActor
final class StoryPhotoSaveServiceTests: XCTestCase {

    private func makeSUT() -> (
        sut: StoryPhotoSaveService,
        exporter: ScriptedStoryExporter,
        photos: StubPhotoSaver,
        toasts: MockFeedbackToast
    ) {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let toasts = MockFeedbackToast()
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: toasts,
            preferredLanguages: { ["fr"] },
            intro: { nil }
        )
        return (sut, exporter, photos, toasts)
    }

    private func makeStory(translations: [StoryTranslation]? = nil) -> StoryItem {
        StoryItem(id: "story-\(UUID().uuidString)",
                  content: "Hello",
                  storyEffects: StoryEffects(textObjects: [StoryTextObject(text: "Hello")]),
                  translations: translations)
    }

    /// Draine la file du MainActor jusqu'à ce que le job disparaisse, avec une
    /// borne dure : sans borne, un test rouge tournerait jusqu'au timeout xctest.
    private func waitUntilIdle(_ sut: StoryPhotoSaveService, storyId: String) async {
        for _ in 0..<200 {
            if sut.progress(for: storyId) == nil { return }
            await Task.yield()
        }
        XCTFail("le job n'a jamais été retiré pour \(storyId)")
    }

    // MARK: Succès

    func test_save_success_writesToPhotosThenClearsJob() async {
        let (sut, exporter, photos, toasts) = makeSUT()
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(photos.savedVideoURLs.count, 1)
        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.successMessages.count, 1)
        XCTAssertTrue(toasts.errorMessages.isEmpty)
        XCTAssertEqual(exporter.cleanupCallCount, 1, "le MP4 temporaire doit être nettoyé après l'écriture Photos")
    }

    /// La langue gravée est résolue automatiquement (le chemin « Enregistrer »
    /// n'a plus de sheet) : la préférence n'est honorée que si la story la porte.
    func test_save_bakesPreferredLanguageWhenAvailable() async {
        let (sut, exporter, _, _) = makeSUT()
        let story = makeStory(translations: [StoryTranslation(language: "fr", content: "Bonjour")])

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.lastLanguages, ["fr"])
    }

    func test_save_bakesOriginalWhenPreferredUnavailable() async {
        let (sut, exporter, _, _) = makeSUT()
        let story = makeStory(translations: [StoryTranslation(language: "de", content: "Hallo")])

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.lastLanguages, [], "aucune préférence disponible → texte original")
    }

    // MARK: Progression

    /// Le bake ne doit JAMAIS pousser l'anneau au-delà de 90 % : les 10 %
    /// restants appartiennent à l'écriture Photos.
    func test_save_bakeProgressNeverExceedsBakeShare() async {
        let (sut, exporter, photos, _) = makeSUT()
        exporter.progressScript = [0.25, 0.5, 1.0]
        photos.shouldFail = false
        let story = makeStory()

        var observed: [Double] = []
        let cancellable = sut.$jobs.sink { jobs in
            if let value = jobs[story.id] { observed.append(value) }
        }
        defer { cancellable.cancel() }

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        let duringBake = observed.filter { $0 < 1 }
        XCTAssertFalse(duringBake.isEmpty, "au moins une valeur de progression doit être publiée")
        XCTAssertTrue(duringBake.allSatisfy { $0 <= StorySaveProgressMapper.bakeShare + 0.0001 },
                      "progressions observées : \(observed)")
    }

    // MARK: Échecs

    func test_save_bakeFailure_clearsJobAndShowsError() async {
        let (sut, exporter, photos, toasts) = makeSUT()
        exporter.outcome = .failure
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertTrue(photos.savedVideoURLs.isEmpty)
        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.errorMessages.count, 1)
        XCTAssertTrue(toasts.successMessages.isEmpty)
    }

    func test_save_photosFailure_clearsJobCleansFileAndShowsError() async {
        let (sut, exporter, photos, toasts) = makeSUT()
        photos.shouldFail = true
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.errorMessages.count, 1)
        XCTAssertTrue(toasts.successMessages.isEmpty)
        XCTAssertEqual(exporter.cleanupCallCount, 1,
                       "un échec Photos ne doit pas laisser le MP4 temporaire derrière lui")
    }

    // MARK: Idempotence et annulation

    func test_save_twiceForSameStory_startsOnlyOneExport() async {
        let (sut, exporter, _, _) = makeSUT()
        let story = makeStory()

        sut.save(story: story)
        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.prepareCallCount, 1)
    }

    func test_cancel_clearsJobImmediately() async {
        let (sut, _, _, toasts) = makeSUT()
        let story = makeStory()

        sut.save(story: story)
        XCTAssertNotNil(sut.progress(for: story.id), "le job doit exister dès l'appel à save")

        sut.cancel(storyId: story.id)

        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.successMessages.count, 1, "l'annulation est confirmée par un toast")
    }

    func test_cancel_unknownStory_isNoOp() {
        let (sut, _, _, toasts) = makeSUT()
        sut.cancel(storyId: "inexistante")
        XCTAssertTrue(toasts.successMessages.isEmpty)
        XCTAssertTrue(toasts.errorMessages.isEmpty)
    }
}
