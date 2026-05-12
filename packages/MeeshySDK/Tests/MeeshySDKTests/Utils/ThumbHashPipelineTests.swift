// ThumbHashPipelineTests — end-to-end Wolt-spec pipeline coverage.
//
// These tests assert the contract that `StoryBackgroundLayer.ThumbHashDecoder`
// relies on: any Wolt-format hash (encoded on-device, encoded by the gateway's
// `thumbhash` npm package, or a manually-crafted valid byte sequence) must
// decode to a non-nil UIImage so the canvas can render a blur placeholder
// before the full media loads.

import XCTest
@testable import MeeshySDK

#if canImport(UIKit)
import UIKit
#endif

final class ThumbHashPipelineTests: XCTestCase {

    // MARK: - Helpers

    /// Produces a synthetic RGBA buffer with a deterministic gradient so the
    /// encoder has real signal to compress (avoids degenerate all-zero output).
    private func makeRGBA(w: Int, h: Int, alpha: UInt8 = 255) -> [UInt8] {
        var data = [UInt8](repeating: 0, count: w * h * 4)
        for y in 0 ..< h {
            for x in 0 ..< w {
                let i = (y * w + x) * 4
                data[i]     = UInt8((x * 255) / max(1, w - 1))
                data[i + 1] = UInt8((y * 255) / max(1, h - 1))
                data[i + 2] = UInt8(((x + y) * 255) / max(1, w + h - 2))
                data[i + 3] = alpha
            }
        }
        return data
    }

    // MARK: - Roundtrip

    func test_encode_decode_roundtrip_producesNonNilImage() {
        let rgba = makeRGBA(w: 24, h: 24)
        let hash = rgbaToThumbHash(w: 24, h: 24, rgba: rgba)
        XCTAssertGreaterThan(hash.count, 5,
                             "Wolt encoder must emit at least one byte of AC data after the 5-byte header")
        let base64 = Data(hash).base64EncodedString()

        let image = UIImage.fromThumbHash(base64)
        XCTAssertNotNil(image, "Decoder must produce a UIImage from a freshly-encoded Wolt hash")
        XCTAssertGreaterThan(image?.size.width ?? 0, 0)
        XCTAssertGreaterThan(image?.size.height ?? 0, 0)
    }

    func test_encode_decode_roundtrip_withAlpha_producesNonNilImage() {
        // Force hasAlpha by using a non-opaque pixel buffer.
        let rgba = makeRGBA(w: 20, h: 16, alpha: 180)
        let hash = rgbaToThumbHash(w: 20, h: 16, rgba: rgba)
        XCTAssertFalse(hash.isEmpty)
        let base64 = Data(hash).base64EncodedString()
        XCTAssertNotNil(UIImage.fromThumbHash(base64))
    }

    func test_encode_landscapeImage_decodesToLandscapeAspect() {
        let rgba = makeRGBA(w: 60, h: 30)
        let hash = rgbaToThumbHash(w: 60, h: 30, rgba: rgba)
        XCTAssertFalse(hash.isEmpty)

        let ratio = thumbHashToApproximateAspectRatio(hash: hash)
        XCTAssertGreaterThan(ratio, 1.0,
                             "Wide source must round-trip into a landscape-shaped placeholder")
    }

    // MARK: - Negative cases

    func test_decoder_invalidHash_returnsNil() {
        XCTAssertNil(UIImage.fromThumbHash("###not-valid-base64###"))
    }

    func test_decoder_emptyHash_returnsNil() {
        XCTAssertNil(UIImage.fromThumbHash(""))
    }

    func test_decoder_truncatedHash_returnsNil() {
        // 5-byte header without any AC coefficients — must not decode.
        let truncated: [UInt8] = [0x21, 0x08, 0x12, 0x00, 0x44]
        let b64 = Data(truncated).base64EncodedString()
        XCTAssertNil(UIImage.fromThumbHash(b64))
    }

    func test_decoder_oneByteHash_returnsNil() {
        let b64 = Data([0x42]).base64EncodedString()
        XCTAssertNil(UIImage.fromThumbHash(b64))
    }

    // MARK: - Gateway compatibility (Wolt thumbhash npm)

    func test_thumbhashFromGatewayLength_decodes_correctly() {
        // The gateway's `services/gateway/.../ThumbHashGenerator.ts` calls
        // `rgbaToThumbHash` from the `thumbhash` npm package on a 100×100 RGBA
        // buffer. The output length depends on aspect ratio and alpha, but
        // typical hashes are 22-30 bytes. Simulating a gateway hash means
        // re-encoding a 100×100 buffer here — the on-device encoder is
        // byte-compatible with the npm package (both are vendored from
        // evanw/thumbhash). Any non-empty hash MUST decode.
        let rgba = makeRGBA(w: 100, h: 100)
        let hash = rgbaToThumbHash(w: 100, h: 100, rgba: rgba)
        XCTAssertFalse(hash.isEmpty)
        XCTAssertGreaterThanOrEqual(hash.count, 20,
                                    "Wolt 100×100 hash is typically ≥20 bytes")
        XCTAssertLessThanOrEqual(hash.count, 40,
                                 "Wolt 100×100 hash is typically ≤40 bytes")

        let b64 = Data(hash).base64EncodedString()
        XCTAssertNotNil(UIImage.fromThumbHash(b64),
                        "Gateway-shaped hashes must decode to a placeholder image")
    }

    // MARK: - Color preservation

    func test_averageColor_redImage_extractsRedDominant() {
        let w = 8, h = 8
        var rgba = [UInt8](repeating: 0, count: w * h * 4)
        for i in 0 ..< w * h {
            rgba[i * 4]     = 230   // red
            rgba[i * 4 + 1] = 30
            rgba[i * 4 + 2] = 30
            rgba[i * 4 + 3] = 255
        }
        let hash = rgbaToThumbHash(w: w, h: h, rgba: rgba)
        XCTAssertFalse(hash.isEmpty)
        let (r, g, b, _) = thumbHashToAverageRGBA(hash: hash)
        XCTAssertGreaterThan(r, g, "Red channel must dominate green for a red source")
        XCTAssertGreaterThan(r, b, "Red channel must dominate blue for a red source")
    }
}
