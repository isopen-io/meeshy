import XCTest
@testable import MeeshySDK

/// The message-info sheet must show EXACTLY who consumed each attachment, with
/// WhatsApp-style all-or-nothing "by all" only when every recipient completed
/// the media-appropriate action (view / download / listen / watch).
final class AttachmentConsumptionResolverTests: XCTestCase {

    // MARK: - primaryAction by media type

    func test_primaryAction_image_isViewed() {
        XCTAssertEqual(AttachmentConsumptionResolver.primaryAction(forMimeType: "image/jpeg"), .viewed)
    }

    func test_primaryAction_audio_isListened() {
        XCTAssertEqual(AttachmentConsumptionResolver.primaryAction(forMimeType: "audio/mp4"), .listened)
    }

    func test_primaryAction_video_isWatched() {
        XCTAssertEqual(AttachmentConsumptionResolver.primaryAction(forMimeType: "video/quicktime"), .watched)
    }

    func test_primaryAction_document_isDownloaded() {
        XCTAssertEqual(AttachmentConsumptionResolver.primaryAction(forMimeType: "application/pdf"), .downloaded)
    }

    // MARK: - resolve picks the action-matching count + marker

    func test_resolve_image_usesViewedCountAndMarker() {
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "image/png", recipientCount: 3,
            viewedCount: 2, downloadedCount: 9, consumedCount: 9,
            viewedByAllAt: nil, downloadedByAllAt: Date(),
            listenedByAllAt: nil, watchedByAllAt: nil)
        XCTAssertEqual(s.action, .viewed)
        XCTAssertEqual(s.count, 2, "image status reflects viewedCount, not downloadedCount")
        XCTAssertFalse(s.isCompleteByAll, "2 of 3 viewers is not all")
    }

    func test_resolve_audio_usesConsumedCountAndListenedMarker() {
        let at = Date()
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "audio/mpeg", recipientCount: 2,
            viewedCount: 0, downloadedCount: 0, consumedCount: 2,
            viewedByAllAt: nil, downloadedByAllAt: nil,
            listenedByAllAt: at, watchedByAllAt: nil)
        XCTAssertEqual(s.action, .listened)
        XCTAssertEqual(s.count, 2)
        XCTAssertEqual(s.byAllAt, at)
        XCTAssertTrue(s.isCompleteByAll, "listenedByAllAt marker means everyone listened")
    }

    func test_resolve_video_usesConsumedCountAndWatchedMarker() {
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "video/mp4", recipientCount: 4,
            viewedCount: 0, downloadedCount: 0, consumedCount: 4,
            viewedByAllAt: nil, downloadedByAllAt: nil,
            listenedByAllAt: nil, watchedByAllAt: nil)
        XCTAssertEqual(s.action, .watched)
        XCTAssertTrue(s.isCompleteByAll, "4 of 4 watchers reaches the denominator")
    }

    // MARK: - all-or-nothing soundness

    func test_isCompleteByAll_partialGroup_isFalse() {
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "image/jpeg", recipientCount: 10,
            viewedCount: 1, downloadedCount: 0, consumedCount: 0,
            viewedByAllAt: nil, downloadedByAllAt: nil,
            listenedByAllAt: nil, watchedByAllAt: nil)
        XCTAssertFalse(s.isCompleteByAll, "one viewer out of ten is not by-all")
    }

    func test_isCompleteByAll_unknownDenominator_neverClaimsByAllFromCounts() {
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "application/zip", recipientCount: 0,
            viewedCount: 0, downloadedCount: 5, consumedCount: 0,
            viewedByAllAt: nil, downloadedByAllAt: nil,
            listenedByAllAt: nil, watchedByAllAt: nil)
        XCTAssertEqual(s.action, .downloaded)
        XCTAssertEqual(s.count, 5)
        XCTAssertFalse(s.isCompleteByAll,
            "unknown denominator must never claim by-all from a count alone")
    }

    func test_isCompleteByAll_markerWinsOverUnknownDenominator() {
        let at = Date()
        let s = AttachmentConsumptionResolver.resolve(
            mimeType: "application/pdf", recipientCount: 0,
            viewedCount: 0, downloadedCount: 3, consumedCount: 0,
            viewedByAllAt: nil, downloadedByAllAt: at,
            listenedByAllAt: nil, watchedByAllAt: nil)
        XCTAssertTrue(s.isCompleteByAll, "the server's downloadedByAllAt marker is authoritative")
    }
}
