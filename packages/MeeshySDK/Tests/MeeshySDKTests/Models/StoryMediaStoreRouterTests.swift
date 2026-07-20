import XCTest
@testable import MeeshySDK

/// R7 — the disk-store router must never trust a missing/contradictory
/// declared type over a recognisable URL extension. The confirmed bug: an
/// .mp4 declared (or defaulted) as image landed in the `images` store, so
/// the video replay path cache-missed and re-downloaded.
final class StoryMediaStoreRouterTests: XCTestCase {

    func test_mp4WithNilType_routesToVideo() {
        XCTAssertEqual(StoryMediaStoreRouter.effectiveKind(
            declaredType: nil, urlString: "https://cdn.test/clip.mp4"), .video)
    }

    func test_mp4DeclaredAsImage_extensionWins() {
        XCTAssertEqual(StoryMediaStoreRouter.effectiveKind(
            declaredType: .image, urlString: "https://cdn.test/clip.mp4"), .video,
            "The confirmed bug: a contradictory declared type must not shadow the content")
    }

    func test_audioExtension_routesToAudio() {
        XCTAssertEqual(StoryMediaStoreRouter.effectiveKind(
            declaredType: nil, urlString: "https://cdn.test/voice.m4a"), .audio)
    }

    func test_extensionlessURL_trustsDeclaredType() {
        XCTAssertEqual(StoryMediaStoreRouter.effectiveKind(
            declaredType: .video, urlString: "https://cdn.test/signed/abc123"), .video)
    }

    func test_extensionlessURL_withoutType_defaultsToImage() {
        XCTAssertEqual(StoryMediaStoreRouter.effectiveKind(
            declaredType: nil, urlString: "https://cdn.test/signed/abc123"), .image)
    }

    func test_uppercaseExtension_isNormalised() {
        XCTAssertEqual(StoryMediaStoreRouter.effectiveKind(
            declaredType: nil, urlString: "https://cdn.test/CLIP.MP4"), .video)
    }
}
