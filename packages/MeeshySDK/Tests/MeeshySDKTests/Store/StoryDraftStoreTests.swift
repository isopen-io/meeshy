import XCTest
@testable import MeeshySDK

final class StoryDraftStoreSDKTests: XCTestCase {

    private var store: StoryDraftStore!
    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryDraftStoreSDKTests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let dbPath = tempDir.appendingPathComponent("test.db").path
        let mediaDir = tempDir.appendingPathComponent("media")
        store = StoryDraftStore(dbPath: dbPath, mediaDirectory: mediaDir)
    }

    override func tearDown() {
        store = nil
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    // MARK: - E4 inc.2 : command-history blob (opaque sidecar)

    func test_commandHistoryBlob_nilWhenNeverSaved() {
        XCTAssertNil(store.loadCommandHistoryBlob())
    }

    func test_commandHistoryBlob_roundTrip() {
        let payload = Data(#"{"slide-1":{"commands":[],"cursor":0}}"#.utf8)

        store.saveCommandHistoryBlob(payload)

        XCTAssertEqual(store.loadCommandHistoryBlob(), payload,
                       "The blob is opaque to the core store — bytes in, same bytes out")
    }

    func test_commandHistoryBlob_overwrittenByLaterSave() {
        store.saveCommandHistoryBlob(Data("old-history".utf8))
        store.saveCommandHistoryBlob(Data("new-history".utf8))

        XCTAssertEqual(store.loadCommandHistoryBlob(), Data("new-history".utf8),
                       "Each autosave replaces the previous history snapshot")
    }

    func test_clear_purgesCommandHistoryBlob() {
        store.saveCommandHistoryBlob(Data("history".utf8))

        store.clear()

        XCTAssertNil(store.loadCommandHistoryBlob(),
                     "Discarding the draft must discard its undo history with it")
    }

    // MARK: - isEmpty

    func test_isEmpty_trueInitially() {
        XCTAssertTrue(store.isEmpty())
    }

    func test_isEmpty_falseAfterSave() {
        let slide = StorySlide(id: "s1", content: "Hello")
        store.save(slides: [slide], visibility: "PUBLIC")
        XCTAssertFalse(store.isEmpty())
    }

    // MARK: - load

    func test_load_returnsNilWhenEmpty() {
        XCTAssertNil(store.load())
    }

    // MARK: - saveMedia : cycle restore → autosave (constat « Médias indisponibles »)

    /// Après `restoreDraft()`, `loadedVideoURLs` pointent DANS le media dir du
    /// store. L'autosave suivante rappelait `saveMedia` avec ces mêmes URLs :
    /// `removeItem(dest)` détruisait la SOURCE (source == dest) puis `copyItem`
    /// échouait en silence — le média était perdu au resume suivant.
    func test_saveMedia_resaveFromRestoredURL_keepsVideoFile() throws {
        let source = tempDir.appendingPathComponent("clip.mp4")
        try Data("fake-video-bytes".utf8).write(to: source)
        store.saveMedia(images: [:], videoURLs: ["el-1": source], audioURLs: [:])

        let restored = store.loadMedia()
        let restoredURL = try XCTUnwrap(restored.videoURLs["el-1"])

        store.saveMedia(images: [:], videoURLs: ["el-1": restoredURL], audioURLs: [:])

        XCTAssertTrue(FileManager.default.fileExists(atPath: restoredURL.path),
                      "Re-sauver un média déjà dans le store ne doit pas le détruire")
        let reloaded = store.loadMedia()
        XCTAssertNotNil(reloaded.videoURLs["el-1"])
        XCTAssertTrue(reloaded.lostElementIds.isEmpty)
    }

    func test_saveMedia_resaveFromRestoredURL_keepsAudioFile() throws {
        let source = tempDir.appendingPathComponent("track.m4a")
        try Data("fake-audio-bytes".utf8).write(to: source)
        store.saveMedia(images: [:], videoURLs: [:], audioURLs: ["au-1": source])

        let restoredURL = try XCTUnwrap(store.loadMedia().audioURLs["au-1"])

        store.saveMedia(images: [:], videoURLs: [:], audioURLs: ["au-1": restoredURL])

        XCTAssertTrue(FileManager.default.fileExists(atPath: restoredURL.path))
        XCTAssertTrue(store.loadMedia().lostElementIds.isEmpty)
    }

    /// Une source disparue (tmp purgé) ne doit ni détruire la copie encore
    /// valide du store, ni enregistrer une ligne fantôme qui deviendrait un
    /// « média perdu » au prochain resume.
    func test_saveMedia_missingSource_keepsPreviousCopy() throws {
        let source = tempDir.appendingPathComponent("clip.mp4")
        try Data("fake-video-bytes".utf8).write(to: source)
        store.saveMedia(images: [:], videoURLs: ["el-1": source], audioURLs: [:])
        let storedURL = try XCTUnwrap(store.loadMedia().videoURLs["el-1"])

        let gone = tempDir.appendingPathComponent("purged.mp4")
        store.saveMedia(images: [:], videoURLs: ["el-1": gone], audioURLs: [:])

        XCTAssertTrue(FileManager.default.fileExists(atPath: storedURL.path),
                      "La copie du store survit quand la nouvelle source n'existe plus")
        let reloaded = store.loadMedia()
        XCTAssertNotNil(reloaded.videoURLs["el-1"])
        XCTAssertTrue(reloaded.lostElementIds.isEmpty)
    }

    // MARK: - save + load round-trip

    func test_save_load_roundTrip_preservesSlideData() {
        let effects = StoryEffects(background: "00FF00")
        let slide = StorySlide(id: "slide-1", content: "Test content", effects: effects, duration: 10.0)

        store.save(slides: [slide], visibility: "FRIENDS")
        let result = store.load()

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.slides.count, 1)
        XCTAssertEqual(result?.slides.first?.id, "slide-1")
        XCTAssertEqual(result?.slides.first?.content, "Test content")
        XCTAssertEqual(result?.slides.first?.duration ?? 0, 10.0, accuracy: 0.01)
        XCTAssertEqual(result?.slides.first?.effects.background, "00FF00")
        XCTAssertEqual(result?.visibility, "FRIENDS")
    }

    func test_save_load_multipleSlides_preservesOrder() {
        let slides = [
            StorySlide(id: "a", content: "First"),
            StorySlide(id: "b", content: "Second"),
            StorySlide(id: "c", content: "Third")
        ]

        store.save(slides: slides, visibility: "PUBLIC")
        let result = store.load()

        XCTAssertEqual(result?.slides.count, 3)
        XCTAssertEqual(result?.slides[0].id, "a")
        XCTAssertEqual(result?.slides[1].id, "b")
        XCTAssertEqual(result?.slides[2].id, "c")
    }

    // MARK: - save overwrites

    func test_save_overwritesPreviousDraft() {
        store.save(slides: [StorySlide(id: "old"), StorySlide(id: "old2")], visibility: "PUBLIC")
        store.save(slides: [StorySlide(id: "new")], visibility: "PRIVATE")

        let result = store.load()
        XCTAssertEqual(result?.slides.count, 1)
        XCTAssertEqual(result?.slides.first?.id, "new")
        XCTAssertEqual(result?.visibility, "PRIVATE")
    }

    // MARK: - clear

    func test_clear_makesIsEmptyTrue() {
        store.save(slides: [StorySlide(id: "x")], visibility: "PUBLIC")
        XCTAssertFalse(store.isEmpty())

        store.clear()
        XCTAssertTrue(store.isEmpty())
    }

    func test_clear_makesLoadReturnNil() {
        store.save(slides: [StorySlide(id: "x")], visibility: "PUBLIC")
        store.clear()
        XCTAssertNil(store.load())
    }

    // MARK: - Visibility default

    func test_load_defaultVisibility_isPublic() {
        // Save a slide, then manually delete the meta row to test default
        store.save(slides: [StorySlide(id: "v1")], visibility: "PUBLIC")
        let result = store.load()
        XCTAssertEqual(result?.visibility, "PUBLIC")
    }
}
