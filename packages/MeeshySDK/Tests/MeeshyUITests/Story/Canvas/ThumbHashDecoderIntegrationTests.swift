// ThumbHashDecoderIntegrationTests — verify `StoryBackgroundLayer` consumes
// the Wolt-format thumbHash via `ThumbHashDecoder.decodeIfAvailable(_:)`
// and surfaces a non-nil placeholder UIImage BEFORE the full image loads.
//
// Failure modes covered:
// - Decoder returns nil for invalid/empty hashes (no crash, no leak).
// - Decoder returns a non-nil UIImage for a fresh Wolt-encoded hash.
// - The CGImage produced has positive width/height ready for
//   `CALayer.contents` assignment.

import XCTest
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

#if canImport(UIKit)
import UIKit
#endif

@MainActor
final class ThumbHashDecoderIntegrationTests: XCTestCase {

    private func makeEncodedHash(w: Int = 24, h: Int = 24) -> String {
        var rgba = [UInt8](repeating: 0, count: w * h * 4)
        for y in 0 ..< h {
            for x in 0 ..< w {
                let i = (y * w + x) * 4
                rgba[i]     = UInt8((x * 255) / max(1, w - 1))
                rgba[i + 1] = UInt8((y * 255) / max(1, h - 1))
                rgba[i + 2] = 96
                rgba[i + 3] = 255
            }
        }
        let bytes = rgbaToThumbHash(w: w, h: h, rgba: rgba)
        return Data(bytes).base64EncodedString()
    }

    // MARK: - Decoder seam

    func test_decoder_emptyHash_returnsNil() {
        XCTAssertNil(ThumbHashDecoder.decodeIfAvailable(""))
    }

    func test_decoder_invalidBase64_returnsNil() {
        XCTAssertNil(ThumbHashDecoder.decodeIfAvailable("!!not-base64!!"))
    }

    func test_decoder_validHash_returnsImageWithCGImage() {
        let hash = makeEncodedHash()
        let image = ThumbHashDecoder.decodeIfAvailable(hash)
        XCTAssertNotNil(image, "Wolt-format hash must decode to a UIImage")
        XCTAssertNotNil(image?.cgImage,
                        "Decoded UIImage MUST expose a CGImage so CALayer.contents can consume it")
        XCTAssertGreaterThan(image?.cgImage?.width ?? 0, 0)
        XCTAssertGreaterThan(image?.cgImage?.height ?? 0, 0)
    }

    // MARK: - StoryBackgroundLayer.configure

    func test_storyBackgroundLayer_imageKindWithThumbHash_assignsPlaceholderContents() {
        let hash = makeEncodedHash()
        let layer = StoryBackgroundLayer()
        let geometry = CanvasGeometry(renderSize: CGSize(width: 360, height: 640))

        layer.configure(
            kind: .image(postMediaId: "missing-media-for-this-test", thumbHash: hash),
            transform: BackgroundTransform.identity,
            geometry: geometry,
            resolver: { _ in nil },        // no network resolution -> placeholder only
            imageCache: nil
        )

        // The placeholder is set synchronously inside `configure(...)` so it
        // must already be visible to a reader on the main actor.
        let contentLayer = layer.sublayers?.first
        XCTAssertNotNil(contentLayer, "Image kind must add an image sublayer")
        XCTAssertNotNil(contentLayer?.contents,
                        "ThumbHash placeholder MUST be assigned to CALayer.contents before async load")
    }

    func test_storyBackgroundLayer_imageKindWithInvalidThumbHash_skipsContents() {
        let layer = StoryBackgroundLayer()
        let geometry = CanvasGeometry(renderSize: CGSize(width: 360, height: 640))

        layer.configure(
            kind: .image(postMediaId: "missing", thumbHash: "###invalid###"),
            transform: BackgroundTransform.identity,
            geometry: geometry,
            resolver: { _ in nil },
            imageCache: nil
        )

        let contentLayer = layer.sublayers?.first
        XCTAssertNotNil(contentLayer)
        XCTAssertNil(contentLayer?.contents,
                     "Invalid thumbHash MUST NOT produce placeholder contents")
    }
}
