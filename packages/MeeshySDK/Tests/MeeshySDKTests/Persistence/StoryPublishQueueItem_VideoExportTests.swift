import XCTest
@testable import MeeshySDK

/// Sprint 8 Phase 5 — publish→exporter wiring (spec §3.4).
///
/// Covers the `videoExportURL` property + `hasValidVideoExport` resume
/// helper on `StoryPublishQueueItem`. The TUS uploader relies on these
/// guarantees:
///   - default-nil keeps every existing call site untouched (back-compat)
///   - Codable round-trip preserves the absolute path verbatim, so a queue
///     restored from disk can resume the chunked upload from the same MP4
///   - `hasValidVideoExport` only returns `true` when the file is reachable
///     so the publish handler can branch between fast path (resume TUS) and
///     slow path (re-export from `slidesPayload`)
///   - legacy JSON written before this field existed must still decode,
///     so users upgrading the app do not lose pending publications
final class StoryPublishQueueItem_VideoExportTests: XCTestCase {

    private var tempDir: URL!

    override func setUpWithError() throws {
        try super.setUpWithError()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryPublishQueueItemVideoExportTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tempDir)
        tempDir = nil
        try super.tearDownWithError()
    }

    // MARK: - Default value

    func test_videoExportURL_default_is_nil() {
        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: Data("[]".utf8)
        )

        XCTAssertNil(item.videoExportURL)
        XCTAssertFalse(item.hasValidVideoExport)
    }

    // MARK: - Codable round-trip

    func test_videoExportURL_codable_round_trip() throws {
        let exportURL = tempDir.appendingPathComponent("baked.mp4")
        let original = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: Data("[]".utf8),
            videoExportURL: exportURL
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(StoryPublishQueueItem.self, from: data)

        XCTAssertEqual(decoded.videoExportURL, exportURL)
        XCTAssertEqual(decoded.videoExportURL?.path, exportURL.path)
        XCTAssertEqual(decoded.id, original.id)
        XCTAssertEqual(decoded.tempStoryId, original.tempStoryId)
    }

    func test_videoExportURL_codable_round_trip_preserves_nil() throws {
        let original = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: Data("[]".utf8),
            videoExportURL: nil
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(StoryPublishQueueItem.self, from: data)

        XCTAssertNil(decoded.videoExportURL)
    }

    // MARK: - hasValidVideoExport

    func test_hasValidVideoExport_returnsTrue_whenFileExists() throws {
        let exportURL = tempDir.appendingPathComponent("present.mp4")
        try Data("fake mp4 bytes".utf8).write(to: exportURL)

        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: Data("[]".utf8),
            videoExportURL: exportURL
        )

        XCTAssertTrue(item.hasValidVideoExport)
    }

    func test_hasValidVideoExport_returnsFalse_whenFileDeleted() throws {
        let exportURL = tempDir.appendingPathComponent("ephemeral.mp4")
        try Data("fake mp4 bytes".utf8).write(to: exportURL)

        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: Data("[]".utf8),
            videoExportURL: exportURL
        )
        XCTAssertTrue(item.hasValidVideoExport)

        try FileManager.default.removeItem(at: exportURL)

        XCTAssertFalse(item.hasValidVideoExport)
    }

    func test_hasValidVideoExport_returnsFalse_whenURLisNil() {
        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: Data("[]".utf8),
            videoExportURL: nil
        )

        XCTAssertFalse(item.hasValidVideoExport)
    }

    // MARK: - Legacy JSON back-compat

    /// JSON shaped exactly like the pre-Phase-5 on-disk format (no
    /// `videoExportURL` key). The new struct must decode this without
    /// throwing and surface `videoExportURL == nil` so users upgrading the
    /// app never lose their pending publications.
    func test_legacy_items_without_videoExportURL_decode_correctly() throws {
        let legacyJSON = """
        {
          "id": "queue-legacy-1",
          "tempStoryId": "pending_legacy_1",
          "visibility": "PUBLIC",
          "slidesPayload": "\(Data("[]".utf8).base64EncodedString())",
          "repostOfId": null,
          "mediaReferences": [],
          "createdAt": "2026-05-11T10:00:00Z",
          "retryCount": 2,
          "lastError": "network unreachable"
        }
        """

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(
            StoryPublishQueueItem.self,
            from: Data(legacyJSON.utf8)
        )

        XCTAssertEqual(decoded.id, "queue-legacy-1")
        XCTAssertEqual(decoded.tempStoryId, "pending_legacy_1")
        XCTAssertEqual(decoded.visibility, "PUBLIC")
        XCTAssertEqual(decoded.retryCount, 2)
        XCTAssertEqual(decoded.lastError, "network unreachable")
        XCTAssertNil(decoded.repostOfId)
        XCTAssertTrue(decoded.mediaReferences.isEmpty)
        XCTAssertNil(decoded.videoExportURL)
        XCTAssertFalse(decoded.hasValidVideoExport)
    }
}
