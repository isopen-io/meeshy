import XCTest
@testable import MeeshySDK

final class ThumbHashTests: XCTestCase {

    // A minimal valid thumbhash (5+ bytes, base64-encoded)
    // This represents a simple solid-ish color placeholder.
    private let validBase64 = "IQgSFYJ4d4h6eFeHh4g="  // 14 bytes decoded
    private let validHash: [UInt8] = [0x21, 0x08, 0x12, 0x15, 0x82, 0x78, 0x77, 0x88, 0x7A, 0x78, 0x57, 0x87, 0x87, 0x88]

    // MARK: - thumbHashToApproximateAspectRatio

    func test_thumbHashToApproximateAspectRatio_validHash_returnsPositiveValue() {
        let ratio = thumbHashToApproximateAspectRatio(hash: validHash)
        XCTAssertGreaterThan(ratio, 0.0)
    }

    func test_thumbHashToApproximateAspectRatio_validHash_returnsReasonableRange() {
        let ratio = thumbHashToApproximateAspectRatio(hash: validHash)
        // Aspect ratio should be between 0.1 (very tall) and 10.0 (very wide)
        XCTAssertGreaterThan(ratio, 0.1)
        XCTAssertLessThan(ratio, 10.0)
    }

    func test_thumbHashToApproximateAspectRatio_tooShortHash_returnsOne() {
        let shortHash: [UInt8] = [0x01, 0x02, 0x03]
        let ratio = thumbHashToApproximateAspectRatio(hash: shortHash)
        XCTAssertEqual(ratio, 1.0)
    }

    func test_thumbHashToApproximateAspectRatio_emptyHash_returnsOne() {
        let ratio = thumbHashToApproximateAspectRatio(hash: [])
        XCTAssertEqual(ratio, 1.0)
    }

    // MARK: - thumbHashToAverageRGBA

    func test_thumbHashToAverageRGBA_validHash_returnsValuesInRange() {
        let (r, g, b, a) = thumbHashToAverageRGBA(hash: validHash)
        XCTAssertGreaterThanOrEqual(r, 0.0)
        XCTAssertLessThanOrEqual(r, 1.0)
        XCTAssertGreaterThanOrEqual(g, 0.0)
        XCTAssertLessThanOrEqual(g, 1.0)
        XCTAssertGreaterThanOrEqual(b, 0.0)
        XCTAssertLessThanOrEqual(b, 1.0)
        XCTAssertGreaterThanOrEqual(a, 0.0)
        XCTAssertLessThanOrEqual(a, 1.0)
    }

    func test_thumbHashToAverageRGBA_tooShortHash_returnsDefaults() {
        let (r, g, b, a) = thumbHashToAverageRGBA(hash: [0x01])
        XCTAssertEqual(r, 0.0)
        XCTAssertEqual(g, 0.0)
        XCTAssertEqual(b, 0.0)
        XCTAssertEqual(a, 1.0)
    }

    func test_thumbHashToAverageRGBA_emptyHash_returnsDefaults() {
        let (r, g, b, a) = thumbHashToAverageRGBA(hash: [])
        XCTAssertEqual(r, 0.0)
        XCTAssertEqual(g, 0.0)
        XCTAssertEqual(b, 0.0)
        XCTAssertEqual(a, 1.0)
    }

    // MARK: - thumbHashToRGBA

    func test_thumbHashToRGBA_realRoundtripHash_returnsNonEmptyPixels() {
        // Encode a tiny image first so the hash length matches Wolt expectations.
        let w = 8, h = 8
        var src = [UInt8](repeating: 0, count: w * h * 4)
        for i in 0 ..< w * h {
            src[i * 4]     = 90
            src[i * 4 + 1] = 180
            src[i * 4 + 2] = 220
            src[i * 4 + 3] = 255
        }
        let encoded = rgbaToThumbHash(w: w, h: h, rgba: src)
        XCTAssertGreaterThan(encoded.count, 5)
        let (outW, outH, rgba) = thumbHashToRGBA(hash: encoded)
        XCTAssertGreaterThan(outW, 0)
        XCTAssertGreaterThan(outH, 0)
        XCTAssertEqual(rgba.count, outW * outH * 4)
    }

    func test_thumbHashToRGBA_tooShortHash_returnsEmpty() {
        let (w, h, rgba) = thumbHashToRGBA(hash: [0x01, 0x02])
        XCTAssertEqual(w, 0)
        XCTAssertEqual(h, 0)
        XCTAssertTrue(rgba.isEmpty)
    }

    func test_thumbHashToRGBA_truncatedAfterHeader_returnsEmpty() {
        // 5-byte header only — decoder must refuse to fabricate AC values.
        let (w, h, rgba) = thumbHashToRGBA(hash: [0x21, 0x08, 0x12, 0x15, 0x82])
        XCTAssertEqual(w, 0)
        XCTAssertEqual(h, 0)
        XCTAssertTrue(rgba.isEmpty)
    }

    // MARK: - UIImage.fromThumbHash

    func test_fromThumbHash_invalidString_returnsNil() {
        let result = UIImage.fromThumbHash("not-valid-base64!!!")
        XCTAssertNil(result)
    }

    func test_fromThumbHash_emptyString_returnsNil() {
        let result = UIImage.fromThumbHash("")
        XCTAssertNil(result)
    }

    func test_fromThumbHash_tooShortBase64_returnsNil() {
        // Base64 of 2 bytes — too short for a thumbhash
        let result = UIImage.fromThumbHash("AQI=")
        XCTAssertNil(result)
    }

    func test_fromThumbHash_truncatedFiveByteHeader_returnsNil() {
        // A Wolt-spec hash needs the 5-byte header PLUS AC coefficient bytes
        // (typical total ~25-28 bytes). A bare 5-byte header is not enough,
        // so the strict decoder must return nil instead of fabricating pixels.
        let hash: [UInt8] = [0x3F, 0x3F, 0x3F, 0x00, 0x44]
        let base64 = Data(hash).base64EncodedString()
        XCTAssertNil(UIImage.fromThumbHash(base64),
                     "A 5-byte truncated hash is not a valid Wolt ThumbHash payload")
    }

    func test_fromThumbHash_realRoundtrip_createsImage() {
        // Encode a tiny solid-color RGBA buffer and round-trip it through
        // the decoder. The Wolt encoder always emits a full hash so the
        // result must be non-nil.
        let w = 16
        let h = 16
        var rgba = [UInt8](repeating: 0, count: w * h * 4)
        for i in 0 ..< w * h {
            rgba[i * 4]     = 200
            rgba[i * 4 + 1] = 120
            rgba[i * 4 + 2] = 60
            rgba[i * 4 + 3] = 255
        }
        let hashBytes = rgbaToThumbHash(w: w, h: h, rgba: rgba)
        XCTAssertGreaterThan(hashBytes.count, 5, "Wolt hash includes AC bytes after the 5-byte header")
        let base64 = Data(hashBytes).base64EncodedString()
        XCTAssertNotNil(UIImage.fromThumbHash(base64))
    }

    // MARK: - UIImage.thumbHashAverageColor

    func test_thumbHashAverageColor_invalidBase64_returnsNil() {
        let result = UIImage.thumbHashAverageColor("!!!invalid!!!")
        XCTAssertNil(result)
    }

    func test_thumbHashAverageColor_validBase64_returnsColor() {
        let hash: [UInt8] = [0x3F, 0x3F, 0x3F, 0x00, 0x44]
        let base64 = Data(hash).base64EncodedString()
        let result = UIImage.thumbHashAverageColor(base64)
        XCTAssertNotNil(result)
    }
}
