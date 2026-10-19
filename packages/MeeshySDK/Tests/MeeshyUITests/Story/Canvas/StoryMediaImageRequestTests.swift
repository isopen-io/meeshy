import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class StoryMediaImageRequestTests: XCTestCase {

    private let url = URL(fileURLWithPath: "/tmp/a.png")

    private func makeMedia(id: String = "m1", filter: String? = nil) -> StoryMediaObject {
        var media = StoryMediaObject(id: id, mediaURL: url.absoluteString, kind: .image, aspectRatio: 1)
        media.filter = filter
        return media
    }

    func test_sameMediaSameURL_isEqual() {
        let first = StoryMediaImageRequest(media: makeMedia(), resolvedURL: url)
        let second = StoryMediaImageRequest(media: makeMedia(), resolvedURL: url)
        XCTAssertNotNil(first)
        XCTAssertEqual(first, second)
    }

    func test_differentMediaId_isNotEqual() {
        let first = StoryMediaImageRequest(media: makeMedia(id: "m1"), resolvedURL: url)
        let second = StoryMediaImageRequest(media: makeMedia(id: "m2"), resolvedURL: url)
        XCTAssertNotEqual(first, second)
    }

    func test_differentURL_isNotEqual() {
        let first = StoryMediaImageRequest(media: makeMedia(), resolvedURL: url)
        let second = StoryMediaImageRequest(media: makeMedia(), resolvedURL: URL(fileURLWithPath: "/tmp/b.png"))
        XCTAssertNotEqual(first, second)
    }

    func test_differentFilter_isNotEqual() {
        let first = StoryMediaImageRequest(media: makeMedia(filter: nil), resolvedURL: url)
        let second = StoryMediaImageRequest(media: makeMedia(filter: "noir"), resolvedURL: url)
        XCTAssertNotEqual(first, second)
    }

    func test_noResolvableURL_isNil() {
        XCTAssertNil(StoryMediaImageRequest(media: makeMedia(), resolvedURL: nil))
    }

    func test_noMedia_isNil() {
        XCTAssertNil(StoryMediaImageRequest(media: nil, resolvedURL: url))
    }
}
