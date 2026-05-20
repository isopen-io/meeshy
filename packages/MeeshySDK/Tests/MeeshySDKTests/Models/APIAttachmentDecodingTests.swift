import XCTest
@testable import MeeshySDK

/// Verifies that `APIMessageAttachment` and `APIPostMedia` decode the
/// fields surfaced by the gateway R1-R5 refactor — the Prisme Linguistique
/// foundation (`language`, `variantOf`), the consumption-tracking
/// counters (`viewedCount`, `consumedCount`, `listenedByAllAt`,
/// `watchedByAllAt`, `deliveredToAllAt`, …), the E2EE envelope
/// (`encryptionMode`, `encryptionIv`, `encryptionAuthTag`), and the
/// audio/video codec metadata (`bitrate`, `sampleRate`, `codec`, …).
///
/// Pre-R7, the gateway sent every one of these fields on every
/// `attachments: { select: attachmentMediaSelect | attachmentFullSelect }`
/// response and `Decodable` silently dropped them because the iOS
/// struct didn't declare them. The tests below lock the new fields in
/// place so a future contributor cannot accidentally remove them.
final class APIAttachmentDecodingTests: XCTestCase {

    private func iso8601Decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }

    // MARK: - APIMessageAttachment

    func test_APIMessageAttachment_decodesPrismeAndCodecFields() throws {
        let json = """
        {
            "id": "att1",
            "messageId": "msg1",
            "fileName": "voice.m4a",
            "originalName": "voice.m4a",
            "mimeType": "audio/m4a",
            "fileSize": 12345,
            "fileUrl": "https://gate.meeshy.me/static/voice.m4a",
            "thumbnailUrl": null,
            "thumbHash": null,
            "duration": 1500,
            "bitrate": 64000,
            "sampleRate": 44100,
            "codec": "aac",
            "channels": 1,
            "fps": null,
            "videoCodec": null,
            "pageCount": null,
            "lineCount": null,
            "uploadedBy": "user1",
            "isAnonymous": false,
            "createdAt": "2026-05-20T12:00:00Z"
        }
        """
        let data = json.data(using: .utf8)!
        let att = try iso8601Decoder().decode(APIMessageAttachment.self, from: data)

        XCTAssertEqual(att.messageId, "msg1")
        XCTAssertEqual(att.bitrate, 64000)
        XCTAssertEqual(att.sampleRate, 44100)
        XCTAssertEqual(att.codec, "aac")
        XCTAssertEqual(att.channels, 1)
        XCTAssertEqual(att.uploadedBy, "user1")
        XCTAssertEqual(att.isAnonymous, false)
        XCTAssertNotNil(att.createdAt)
    }

    func test_APIMessageAttachment_decodesE2EEEnvelope() throws {
        // Without these three fields, an E2EE-capable client cannot
        // decrypt the attachment. Pre-R7, they were dropped silently by
        // the iOS decoder even though the gateway sent them.
        let json = """
        {
            "id": "att-secret",
            "mimeType": "image/jpeg",
            "isEncrypted": true,
            "encryptionMode": "e2ee",
            "encryptionIv": "AAAAAAAAAAAAAAAAAAAAAA==",
            "encryptionAuthTag": "BBBBBBBBBBBBBBBBBBBBBB=="
        }
        """
        let data = json.data(using: .utf8)!
        let att = try JSONDecoder().decode(APIMessageAttachment.self, from: data)

        XCTAssertEqual(att.isEncrypted, true)
        XCTAssertEqual(att.encryptionMode, "e2ee")
        XCTAssertEqual(att.encryptionIv, "AAAAAAAAAAAAAAAAAAAAAA==")
        XCTAssertEqual(att.encryptionAuthTag, "BBBBBBBBBBBBBBBBBBBBBB==")
    }

    func test_APIMessageAttachment_decodesConsumptionCounters() throws {
        let json = """
        {
            "id": "att-counters",
            "mimeType": "audio/mp3",
            "viewedCount": 3,
            "downloadedCount": 1,
            "consumedCount": 2,
            "deliveredToAllAt": "2026-05-20T12:00:00Z",
            "viewedByAllAt": null,
            "downloadedByAllAt": null,
            "listenedByAllAt": "2026-05-20T12:05:00Z",
            "watchedByAllAt": null
        }
        """
        let data = json.data(using: .utf8)!
        let att = try iso8601Decoder().decode(APIMessageAttachment.self, from: data)

        XCTAssertEqual(att.viewedCount, 3)
        XCTAssertEqual(att.downloadedCount, 1)
        XCTAssertEqual(att.consumedCount, 2)
        XCTAssertNotNil(att.deliveredToAllAt)
        XCTAssertNotNil(att.listenedByAllAt)
        XCTAssertNil(att.viewedByAllAt)
        XCTAssertNil(att.watchedByAllAt)
    }

    func test_APIMessageAttachment_decodesViewOnceAndForwarding() throws {
        let json = """
        {
            "id": "att-fwd",
            "mimeType": "image/jpeg",
            "isViewOnce": true,
            "maxViewOnceCount": 1,
            "viewOnceCount": 0,
            "isBlurred": false,
            "effectFlags": 4,
            "forwardedFromAttachmentId": "att-original",
            "isForwarded": true
        }
        """
        let data = json.data(using: .utf8)!
        let att = try JSONDecoder().decode(APIMessageAttachment.self, from: data)

        XCTAssertEqual(att.isViewOnce, true)
        XCTAssertEqual(att.maxViewOnceCount, 1)
        XCTAssertEqual(att.viewOnceCount, 0)
        XCTAssertEqual(att.effectFlags, 4)
        XCTAssertEqual(att.forwardedFromAttachmentId, "att-original")
        XCTAssertEqual(att.isForwarded, true)
    }

    func test_APIMessageAttachment_backwardsCompatWithLegacyJSON() throws {
        // The minimal pre-R5 JSON shape MUST continue to decode without
        // throwing, so deploying R7 to clients faster than R5 to the
        // gateway can't break existing apps.
        let legacyJson = """
        {
            "id": "att-legacy",
            "fileName": "photo.jpg",
            "mimeType": "image/jpeg",
            "fileSize": 50000,
            "fileUrl": "https://gate.meeshy.me/files/photo.jpg"
        }
        """
        let data = legacyJson.data(using: .utf8)!
        let att = try JSONDecoder().decode(APIMessageAttachment.self, from: data)

        XCTAssertEqual(att.id, "att-legacy")
        XCTAssertEqual(att.fileName, "photo.jpg")
        // All new fields default to nil:
        XCTAssertNil(att.messageId)
        XCTAssertNil(att.bitrate)
        XCTAssertNil(att.encryptionMode)
        XCTAssertNil(att.encryptionIv)
        XCTAssertNil(att.encryptionAuthTag)
        XCTAssertNil(att.consumedCount)
        XCTAssertNil(att.listenedByAllAt)
        XCTAssertNil(att.watchedByAllAt)
        XCTAssertNil(att.forwardedFromAttachmentId)
        XCTAssertNil(att.isForwarded)
    }

    // MARK: - APIPostMedia

    func test_APIPostMedia_decodesPrismeFields() throws {
        // R1 added `language` and `variantOf` to PostMedia. The iOS model
        // didn't declare them pre-R7 → no consumer could read them →
        // language-aware fallback resolution was effectively blocked.
        let json = """
        {
            "id": "media1",
            "fileName": "voice.mp3",
            "mimeType": "audio/mp3",
            "fileSize": 12345,
            "fileUrl": "https://gate.meeshy.me/static/voice-fr.mp3",
            "duration": 1500,
            "order": 0,
            "language": "fr",
            "variantOf": null
        }
        """
        let data = json.data(using: .utf8)!
        let media = try JSONDecoder().decode(APIPostMedia.self, from: data)

        XCTAssertEqual(media.language, "fr")
        XCTAssertNil(media.variantOf)
    }

    func test_APIPostMedia_decodesAsVariant() throws {
        let json = """
        {
            "id": "media-en",
            "mimeType": "audio/mp3",
            "fileUrl": "https://gate.meeshy.me/static/voice-en.mp3",
            "language": "en",
            "variantOf": "media-fr"
        }
        """
        let data = json.data(using: .utf8)!
        let media = try JSONDecoder().decode(APIPostMedia.self, from: data)

        XCTAssertEqual(media.language, "en")
        XCTAssertEqual(media.variantOf, "media-fr")
    }

    func test_APIPostMedia_backwardsCompatWithLegacyJSON() throws {
        let legacyJson = """
        {
            "id": "media-legacy",
            "fileName": "photo.jpg",
            "mimeType": "image/jpeg",
            "fileSize": 50000,
            "fileUrl": "https://gate.meeshy.me/files/photo.jpg",
            "thumbHash": "Y2bxQzg="
        }
        """
        let data = legacyJson.data(using: .utf8)!
        let media = try JSONDecoder().decode(APIPostMedia.self, from: data)

        XCTAssertEqual(media.id, "media-legacy")
        XCTAssertEqual(media.thumbHash, "Y2bxQzg=")
        XCTAssertNil(media.language)
        XCTAssertNil(media.variantOf)
    }
}
