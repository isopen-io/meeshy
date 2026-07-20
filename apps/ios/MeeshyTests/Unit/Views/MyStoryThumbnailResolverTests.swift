import XCTest
@testable import Meeshy

@MainActor
final class MyStoryThumbnailResolverTests: XCTestCase {

    func test_resolve_thumbHashPresent_prefersComposite() {
        let result = MyStoryThumbnailResolver.resolve(thumbHash: "abc123", remoteURL: "https://example.com/thumb.jpg")
        XCTAssertEqual(result, .composite(thumbHash: "abc123"), "the composite includes text/drawing overlays the raw media thumbnail lacks")
    }

    func test_resolve_thumbHashEmpty_fallsBackToRemoteURL() {
        let result = MyStoryThumbnailResolver.resolve(thumbHash: "", remoteURL: "https://example.com/thumb.jpg")
        XCTAssertEqual(result, .remoteURL("https://example.com/thumb.jpg"))
    }

    func test_resolve_thumbHashNil_fallsBackToRemoteURL() {
        let result = MyStoryThumbnailResolver.resolve(thumbHash: nil, remoteURL: "https://example.com/thumb.jpg")
        XCTAssertEqual(result, .remoteURL("https://example.com/thumb.jpg"))
    }

    func test_resolve_neitherPresent_returnsPlaceholder() {
        let result = MyStoryThumbnailResolver.resolve(thumbHash: nil, remoteURL: nil)
        XCTAssertEqual(result, .placeholder, "a genuinely empty story (no media, no text) keeps the generic icon")
    }

    func test_resolve_remoteURLEmpty_noThumbHash_returnsPlaceholder() {
        let result = MyStoryThumbnailResolver.resolve(thumbHash: nil, remoteURL: "")
        XCTAssertEqual(result, .placeholder)
    }
}
