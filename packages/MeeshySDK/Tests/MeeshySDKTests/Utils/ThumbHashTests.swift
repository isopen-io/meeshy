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

    func test_thumbHashToRGBA_validHash_returnsNonEmptyPixels() {
        let (w, h, rgba) = thumbHashToRGBA(hash: validHash)
        XCTAssertGreaterThan(w, 0)
        XCTAssertGreaterThan(h, 0)
        XCTAssertEqual(rgba.count, w * h * 4)
    }

    func test_thumbHashToRGBA_tooShortHash_returnsEmpty() {
        let (w, h, rgba) = thumbHashToRGBA(hash: [0x01, 0x02])
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

    func test_fromThumbHash_validBase64_createsImage() {
        // Construct a minimal valid thumbhash: 5 bytes with reasonable values
        let hash: [UInt8] = [0x3F, 0x3F, 0x3F, 0x00, 0x44]
        let base64 = Data(hash).base64EncodedString()
        let result = UIImage.fromThumbHash(base64)
        XCTAssertNotNil(result, "A 5-byte thumbhash should produce a valid UIImage")
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
