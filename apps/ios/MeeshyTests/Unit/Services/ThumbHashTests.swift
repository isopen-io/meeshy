import XCTest
@testable import MeeshySDK

final class ThumbHashTests: XCTestCase {

    // MARK: - thumbHashToRGBA

    func test_thumbHashToRGBA_emptyHash_returnsEmpty() {
        let (w, h, rgba) = thumbHashToRGBA(hash: [])
        XCTAssertEqual(w, 0)
        XCTAssertEqual(h, 0)
        XCTAssertTrue(rgba.isEmpty)
    }

    func test_thumbHashToRGBA_tooShortHash_returnsEmpty() {
        let (w, h, rgba) = thumbHashToRGBA(hash: [0x1, 0x2, 0x3])
        XCTAssertEqual(w, 0)
        XCTAssertEqual(h, 0)
        XCTAssertTrue(rgba.isEmpty)
    }

    func test_thumbHashToRGBA_validHash_returnsNonEmptyImage() {
        // Minimal valid 5-byte hash
        let hash: [UInt8] = [0x63, 0x66, 0xF1, 0x43, 0x38]
        let (w, h, rgba) = thumbHashToRGBA(hash: hash)
        XCTAssertGreaterThan(w, 0)
        XCTAssertGreaterThan(h, 0)
        XCTAssertEqual(rgba.count, w * h * 4)
    }

    func test_thumbHashToRGBA_outputHas4ChannelsPerPixel() {
        let hash: [UInt8] = [0x50, 0x40, 0x30, 0x20, 0x10]
        let (w, h, rgba) = thumbHashToRGBA(hash: hash)
        XCTAssertEqual(rgba.count, w * h * 4, "RGBA should have exactly 4 bytes per pixel")
    }

    // MARK: - thumbHashToAverageRGBA

    func test_thumbHashToAverageRGBA_emptyHash_returnsDefault() {
        let (r, g, b, a) = thumbHashToAverageRGBA(hash: [])
        XCTAssertEqual(r, 0.0)
        XCTAssertEqual(g, 0.0)
        XCTAssertEqual(b, 0.0)
        XCTAssertEqual(a, 1.0)
    }

    func test_thumbHashToAverageRGBA_validHash_returnsColorInRange() {
        let hash: [UInt8] = [0x63, 0x66, 0xF1, 0x43, 0x38]
        let (r, g, b, a) = thumbHashToAverageRGBA(hash: hash)
        XCTAssertGreaterThanOrEqual(r, 0.0)
        XCTAssertLessThanOrEqual(r, 1.0)
        XCTAssertGreaterThanOrEqual(g, 0.0)
        XCTAssertLessThanOrEqual(g, 1.0)
        XCTAssertGreaterThanOrEqual(b, 0.0)
        XCTAssertLessThanOrEqual(b, 1.0)
        XCTAssertGreaterThanOrEqual(a, 0.0)
        XCTAssertLessThanOrEqual(a, 1.0)
    }

    func test_thumbHashToAverageRGBA_noAlphaFlag_alphaIsOne() {
        // byte3 bit 7 = 0 → no alpha → a should be 1.0
        let hash: [UInt8] = [0x3F, 0x3F, 0x3F, 0x00, 0x00]
        let (_, _, _, a) = thumbHashToAverageRGBA(hash: hash)
        XCTAssertEqual(a, 1.0)
    }

    // MARK: - thumbHashToApproximateAspectRatio

    func test_thumbHashToApproximateAspectRatio_emptyHash_returnsOne() {
        let ratio = thumbHashToApproximateAspectRatio(hash: [])
        XCTAssertEqual(ratio, 1.0)
    }

    func test_thumbHashToApproximateAspectRatio_validHash_returnsPositive() {
        let hash: [UInt8] = [0x63, 0x66, 0xF1, 0x43, 0x38]
        let ratio = thumbHashToApproximateAspectRatio(hash: hash)
        XCTAssertGreaterThan(ratio, 0.0)
    }

    // MARK: - UIImage.fromThumbHash

    @MainActor
    func test_fromThumbHash_invalidBase64_returnsNil() {
        let image = UIImage.fromThumbHash("not-valid-base64!!!")
        XCTAssertNil(image)
    }

    @MainActor
    func test_fromThumbHash_emptyString_returnsNil() {
        let image = UIImage.fromThumbHash("")
        XCTAssertNil(image)
    }

    @MainActor
    func test_fromThumbHash_tooShortHash_returnsNil() {
        // Base64 of 3 bytes (too short for thumbhash)
        let image = UIImage.fromThumbHash("AQID")
        XCTAssertNil(image)
    }

    @MainActor
    func test_fromThumbHash_validBase64_returnsImage() {
        // Base64 encode a minimal valid 5-byte hash
        let hash: [UInt8] = [0x63, 0x66, 0xF1, 0x43, 0x38]
        let base64 = Data(hash).base64EncodedString()
        let image = UIImage.fromThumbHash(base64)
        XCTAssertNotNil(image, "Should decode a valid thumbhash to a UIImage")
        if let image {
            XCTAssertGreaterThan(image.size.width, 0)
            XCTAssertGreaterThan(image.size.height, 0)
        }
    }

    @MainActor
    func test_fromThumbHash_performance() {
        let hash: [UInt8] = [0x63, 0x66, 0xF1, 0x43, 0x38, 0xCA, 0x00]
        let base64 = Data(hash).base64EncodedString()

        measure {
            for _ in 0..<100 {
                _ = UIImage.fromThumbHash(base64)
            }
        }
        // 100 decodes should complete in < 100ms total (< 1ms each)
    }

    // MARK: - UIImage.thumbHashAverageColor

    @MainActor
    func test_thumbHashAverageColor_validHash_returnsColor() {
        let hash: [UInt8] = [0x63, 0x66, 0xF1, 0x43, 0x38]
        let base64 = Data(hash).base64EncodedString()
        let color = UIImage.thumbHashAverageColor(base64)
        XCTAssertNotNil(color)
    }

    @MainActor
    func test_thumbHashAverageColor_invalidHash_returnsNil() {
        let color = UIImage.thumbHashAverageColor("invalid")
        XCTAssertNil(color)
    }

    // MARK: - Model Integration

    func test_APIMessageAttachment_decodesThumbHash() throws {
        let json = """
        {
            "id": "abc123",
            "fileName": "photo.jpg",
            "originalName": "photo.jpg",
            "mimeType": "image/jpeg",
            "fileSize": 12345,
            "fileUrl": "https://example.com/photo.jpg",
            "thumbnailUrl": "https://example.com/photo_thumb.jpg",
            "thumbHash": "Y2bxQzg=",
            "width": 1920,
            "height": 1080
        }
        """
        let data = json.data(using: .utf8)!
        let attachment = try JSONDecoder().decode(APIMessageAttachment.self, from: data)
        XCTAssertEqual(attachment.thumbHash, "Y2bxQzg=")
    }

    func test_APIMessageAttachment_decodesWithoutThumbHash() throws {
        let json = """
        {
            "id": "abc123",
            "fileName": "photo.jpg",
            "mimeType": "image/jpeg",
            "fileSize": 12345,
            "fileUrl": "https://example.com/photo.jpg"
        }
        """
        let data = json.data(using: .utf8)!
        let attachment = try JSONDecoder().decode(APIMessageAttachment.self, from: data)
        XCTAssertNil(attachment.thumbHash)
    }

    func test_APIPostMedia_decodesThumbHash() throws {
        let json = """
        {
            "id": "media1",
            "mimeType": "image/jpeg",
            "fileUrl": "https://example.com/photo.jpg",
            "thumbnailUrl": "https://example.com/photo_thumb.jpg",
            "thumbHash": "Y2bxQzg="
        }
        """
        let data = json.data(using: .utf8)!
        let media = try JSONDecoder().decode(APIPostMedia.self, from: data)
        XCTAssertEqual(media.thumbHash, "Y2bxQzg=")
    }

    func test_FeedMedia_thumbHashPassedThroughBridge() {
        let feedMedia = FeedMedia(
            type: .image,
            url: "https://example.com/photo.jpg",
            thumbnailUrl: "https://example.com/thumb.jpg",
            thumbHash: "Y2bxQzg="
        )

        let attachment = feedMedia.toMessageAttachment()
        XCTAssertEqual(attachment.thumbHash, "Y2bxQzg=")
    }

    func test_MeeshyMessageAttachment_thumbHashInitParam() {
        let attachment = MeeshyMessageAttachment(
            mimeType: "image/jpeg",
            fileUrl: "https://example.com/photo.jpg",
            thumbHash: "Y2bxQzg=",
            thumbnailColor: "4ECDC4"
        )
        XCTAssertEqual(attachment.thumbHash, "Y2bxQzg=")
    }

    func test_MeeshyMessageAttachment_thumbHashDefaultsToNil() {
        let attachment = MeeshyMessageAttachment(mimeType: "image/jpeg")
        XCTAssertNil(attachment.thumbHash)
    }

    func test_StoryEffects_thumbHashField() throws {
        let json = """
        {
            "background": "gradient:#FF0000,#0000FF",
            "thumbHash": "Y2bxQzg="
        }
        """
        let data = json.data(using: .utf8)!
        let effects = try JSONDecoder().decode(StoryEffects.self, from: data)
        XCTAssertEqual(effects.thumbHash, "Y2bxQzg=")
    }
}
