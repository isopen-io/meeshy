import XCTest
@testable import MeeshySDK

final class StoryDraftStoreTests: XCTestCase {

    private var store: StoryDraftStore!
    private var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryDraftStoreTests-\(UUID().uuidString)")
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

    // MARK: - Slide Persistence

    func test_save_load_roundtrip() {
        let effects = StoryEffects(background: "FF0000")
        let slide = StorySlide(id: "s1", content: "Hello", effects: effects, duration: 7.5)

        store.save(slides: [slide], visibility: "FRIENDS")
        let result = store.load()

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.slides.count, 1)
        XCTAssertEqual(result?.slides.first?.id, "s1")
        XCTAssertEqual(result?.slides.first?.content, "Hello")
        XCTAssertEqual(result?.slides.first?.duration ?? 0, 7.5, accuracy: 0.01)
        XCTAssertEqual(result?.visibility, "FRIENDS")
    }

    func test_save_overwritesPrevious() {
        let s1 = StorySlide(id: "a")
        let s2 = StorySlide(id: "b")

        store.save(slides: [s1, s2], visibility: "PUBLIC")
        store.save(slides: [s1], visibility: "PRIVATE")

        let result = store.load()
        XCTAssertEqual(result?.slides.count, 1)
        XCTAssertEqual(result?.visibility, "PRIVATE")
    }

    func test_isEmpty_trueWhenEmpty() {
        XCTAssertTrue(store.isEmpty())
    }

    func test_isEmpty_falseAfterSave() {
        store.save(slides: [StorySlide()], visibility: "PUBLIC")
        XCTAssertFalse(store.isEmpty())
    }

    func test_clear_removesSlides() {
        store.save(slides: [StorySlide()], visibility: "PUBLIC")
        store.clear()
        XCTAssertTrue(store.isEmpty())
        XCTAssertNil(store.load())
    }

    func test_load_returnsNilWhenEmpty() {
        XCTAssertNil(store.load())
    }

    // MARK: - Media Persistence

    func test_saveMedia_image_roundtrip() {
        let image = createTestImage()
        store.saveMedia(images: ["img-1": image], videoURLs: [:], audioURLs: [:])

        let media = store.loadMedia()

        XCTAssertEqual(media.images.count, 1)
        XCTAssertNotNil(media.images["img-1"])
        XCTAssertTrue(media.videoURLs.isEmpty)
        XCTAssertTrue(media.audioURLs.isEmpty)
    }

    func test_saveMedia_video_roundtrip() {
        let videoURL = createTempFile(name: "test.mp4", content: "fake-video-data")

        store.saveMedia(images: [:], videoURLs: ["vid-1": videoURL], audioURLs: [:])

        let media = store.loadMedia()

        XCTAssertEqual(media.videoURLs.count, 1)
        XCTAssertNotNil(media.videoURLs["vid-1"])
        XCTAssertTrue(FileManager.default.fileExists(atPath: media.videoURLs["vid-1"]!.path))
    }

    func test_saveMedia_audio_roundtrip() {
        let audioURL = createTempFile(name: "test.m4a", content: "fake-audio-data")

        store.saveMedia(images: [:], videoURLs: [:], audioURLs: ["aud-1": audioURL])

        let media = store.loadMedia()

        XCTAssertEqual(media.audioURLs.count, 1)
        XCTAssertNotNil(media.audioURLs["aud-1"])
        XCTAssertTrue(FileManager.default.fileExists(atPath: media.audioURLs["aud-1"]!.path))
    }

    func test_saveMedia_mixedTypes_roundtrip() {
        let image = createTestImage()
        let videoURL = createTempFile(name: "clip.mp4", content: "video")
        let audioURL = createTempFile(name: "clip.m4a", content: "audio")

        store.saveMedia(
            images: ["img-1": image],
            videoURLs: ["vid-1": videoURL],
            audioURLs: ["aud-1": audioURL]
        )

        let media = store.loadMedia()
        XCTAssertEqual(media.images.count, 1)
        XCTAssertEqual(media.videoURLs.count, 1)
        XCTAssertEqual(media.audioURLs.count, 1)
    }

    func test_saveMedia_overwritesPrevious() {
        let img1 = createTestImage()
        store.saveMedia(images: ["a": img1, "b": img1], videoURLs: [:], audioURLs: [:])

        let img2 = createTestImage()
        store.saveMedia(images: ["c": img2], videoURLs: [:], audioURLs: [:])

        let media = store.loadMedia()
        XCTAssertEqual(media.images.count, 1)
        XCTAssertNotNil(media.images["c"])
        XCTAssertNil(media.images["a"])
    }

    func test_clear_removesMediaFiles() {
        let image = createTestImage()
        let videoURL = createTempFile(name: "test.mp4", content: "data")

        store.saveMedia(images: ["img": image], videoURLs: ["vid": videoURL], audioURLs: [:])

        let mediaBefore = store.loadMedia()
        XCTAssertEqual(mediaBefore.images.count, 1)

        store.clear()

        let mediaAfter = store.loadMedia()
        XCTAssertTrue(mediaAfter.images.isEmpty)
        XCTAssertTrue(mediaAfter.videoURLs.isEmpty)
    }

    func test_loadMedia_emptyWhenNothingSaved() {
        let media = store.loadMedia()
        XCTAssertTrue(media.images.isEmpty)
        XCTAssertTrue(media.videoURLs.isEmpty)
        XCTAssertTrue(media.audioURLs.isEmpty)
    }

    func test_saveMedia_preservesFileExtension() {
        let movURL = createTempFile(name: "clip.mov", content: "mov-data")
        store.saveMedia(images: [:], videoURLs: ["v1": movURL], audioURLs: [:])

        let media = store.loadMedia()
        XCTAssertTrue(media.videoURLs["v1"]?.pathExtension == "mov")
    }

    // MARK: - Lost media (Pilier 21 SOTA audit)

    func test_loadMedia_returnsLostElementIds_whenFilesDisappear() {
        let image = createTestImage()
        let videoURL = createTempFile(name: "v.mp4", content: "video-data")
        store.saveMedia(
            images: ["img-keep": image],
            videoURLs: ["vid-disappear": videoURL],
            audioURLs: [:]
        )

        // Sanity check: both are loadable initially
        let before = store.loadMedia()
        XCTAssertEqual(before.images.count, 1)
        XCTAssertEqual(before.videoURLs.count, 1)
        XCTAssertTrue(before.lostElementIds.isEmpty)

        // Simulate OS purge / external deletion of the video file
        let mediaDir = tempDir.appendingPathComponent("media")
        let videoFiles = (try? FileManager.default.contentsOfDirectory(at: mediaDir, includingPropertiesForKeys: nil)) ?? []
        for url in videoFiles where url.pathExtension == "mp4" {
            try? FileManager.default.removeItem(at: url)
        }

        let after = store.loadMedia()
        XCTAssertEqual(after.images.count, 1, "image survived")
        XCTAssertTrue(after.videoURLs.isEmpty, "video file was removed")
        XCTAssertEqual(after.lostElementIds, ["vid-disappear"], "video element flagged as lost")
    }

    func test_purgeLostMedia_removesOrphanRows() {
        let image = createTestImage()
        let videoURL = createTempFile(name: "v.mp4", content: "data")
        store.saveMedia(
            images: ["img-keep": image],
            videoURLs: ["vid-orphan": videoURL],
            audioURLs: [:]
        )

        // Remove the video file from disk (DB row remains pointing to ghost)
        let mediaDir = tempDir.appendingPathComponent("media")
        let files = (try? FileManager.default.contentsOfDirectory(at: mediaDir, includingPropertiesForKeys: nil)) ?? []
        for url in files where url.pathExtension == "mp4" {
            try? FileManager.default.removeItem(at: url)
        }

        let lost = store.loadMedia().lostElementIds
        XCTAssertEqual(lost, ["vid-orphan"])

        store.purgeLostMedia(lost)

        // Re-load: the lost row is gone, so lostElementIds is empty.
        let final = store.loadMedia()
        XCTAssertTrue(final.lostElementIds.isEmpty)
        XCTAssertEqual(final.images.count, 1)
    }

    func test_purgeLostMedia_emptySetIsNoOp() {
        let image = createTestImage()
        store.saveMedia(images: ["img": image], videoURLs: [:], audioURLs: [:])

        store.purgeLostMedia([])

        let media = store.loadMedia()
        XCTAssertEqual(media.images.count, 1, "valid media untouched by empty purge")
    }

    // MARK: - Helpers

    private func createTestImage() -> UIImage {
        UIGraphicsBeginImageContext(CGSize(width: 10, height: 10))
        UIColor.red.setFill()
        UIRectFill(CGRect(x: 0, y: 0, width: 10, height: 10))
        let image = UIGraphicsGetImageFromCurrentImageContext()!
        UIGraphicsEndImageContext()
        return image
    }

    private func createTempFile(name: String, content: String) -> URL {
        let url = tempDir.appendingPathComponent("source_\(name)")
        try? content.data(using: .utf8)?.write(to: url)
        return url
    }
}
