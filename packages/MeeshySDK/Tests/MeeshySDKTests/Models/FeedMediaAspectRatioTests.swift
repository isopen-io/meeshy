import Testing
@testable import MeeshySDK

@Suite("FeedMedia.aspectRatio")
struct FeedMediaAspectRatioTests {

    private func media(width: Int?, height: Int?) -> FeedMedia {
        FeedMedia(type: .image, width: width, height: height)
    }

    @Test("width/height present returns width divided by height")
    func widthOverHeight() {
        #expect(media(width: 1080, height: 1920).aspectRatio == 1080.0 / 1920.0)
    }

    @Test("square media returns 1.0")
    func square() {
        #expect(media(width: 500, height: 500).aspectRatio == 1.0)
    }

    @Test("missing width returns nil")
    func missingWidth() {
        #expect(media(width: nil, height: 1920).aspectRatio == nil)
    }

    @Test("missing height returns nil")
    func missingHeight() {
        #expect(media(width: 1080, height: nil).aspectRatio == nil)
    }

    @Test("zero height returns nil, never divides by zero")
    func zeroHeight() {
        #expect(media(width: 1080, height: 0).aspectRatio == nil)
    }

    @Test("zero width returns nil, not a false 0.0 ratio")
    func zeroWidth() {
        #expect(media(width: 0, height: 1920).aspectRatio == nil)
    }
}
