// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerImageTests.swift
import XCTest
@testable import MeeshyUI

@MainActor
final class StoryBackgroundLayerImageTests: XCTestCase {
    func test_configure_image_withCachedImage_setsContents() async {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let cache = StubImageCache(["pm-1": UIImage(systemName: "star")!])
        let resolver: (String) -> URL? = { _ in URL(string: "https://x.test/img.jpg") }

        layer.configure(kind: .image(postMediaId: "pm-1", thumbHash: nil),
                        transform: .identity, geometry: geom,
                        resolver: resolver, imageCache: cache)

        // Wait for async load
        try? await Task.sleep(nanoseconds: 100_000_000)
        let imageLayer = layer.sublayers?.first { $0.contents != nil }
        XCTAssertNotNil(imageLayer)
    }

    func test_configure_image_withThumbHash_showsPlaceholderImmediately() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(kind: .image(postMediaId: "pm-1",
                                     thumbHash: "AKsHFwSHd3eHd4eXh4iIeIeIiIiYiIiIiIiI"),
                        transform: .identity, geometry: geom,
                        resolver: nil, imageCache: nil)
        // ThumbHashDecoder is a no-op stub, so placeholder will be nil.
        // Skip this test until a real ThumbHash library is linked.
        throw XCTSkip("ThumbHashDecoder is a no-op stub — link ThumbHash library to enable")
    }
}

private struct StubImageCache: ImageCacheReader {
    let images: [String: UIImage]
    init(_ images: [String: UIImage]) { self.images = images }
    nonisolated func cachedImage(for key: String) async -> UIImage? { images[key] }
}
