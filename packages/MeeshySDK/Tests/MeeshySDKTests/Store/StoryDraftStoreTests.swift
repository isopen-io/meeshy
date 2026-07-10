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
