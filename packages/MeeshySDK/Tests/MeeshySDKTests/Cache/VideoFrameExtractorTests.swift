import XCTest
@testable import MeeshySDK

final class VideoFrameExtractorTests: XCTestCase {

    // MARK: - Singleton

    func test_shared_returnsSameInstance() async {
        let a = VideoFrameExtractor.shared
        let b = VideoFrameExtractor.shared
        XCTAssertTrue(a === b)
    }

    // MARK: - evict

    func test_evict_nonexistentId_doesNotCrash() async {
        await VideoFrameExtractor.shared.evict(objectId: "nonexistent-\(UUID().uuidString)")
    }

    // MARK: - evictAll

    func test_evictAll_doesNotCrash() async {
        await VideoFrameExtractor.shared.evictAll()
    }

    // MARK: - extractFrames with invalid URL

    func test_extractFrames_invalidURL_returnsEmptyArray() async {
        let bogusURL = URL(fileURLWithPath: "/tmp/nonexistent-video-\(UUID().uuidString).mp4")
        let frames = await VideoFrameExtractor.shared.extractFrames(
            objectId: "test-invalid-\(UUID().uuidString)",
            url: bogusURL,
            maxFrames: 3
        )
        XCTAssertTrue(frames.isEmpty)
    }

    // MARK: - Cache eviction after extract

    func test_evict_afterExtract_doesNotCrash() async {
        let objectId = "test-evict-after-\(UUID().uuidString)"
        let bogusURL = URL(fileURLWithPath: "/tmp/nonexistent-\(objectId).mp4")

        _ = await VideoFrameExtractor.shared.extractFrames(objectId: objectId, url: bogusURL)
        await VideoFrameExtractor.shared.evict(objectId: objectId)
    }
}
