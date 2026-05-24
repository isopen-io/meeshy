import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// Sprint 3 RC3.2 — the download badge / `AttachmentDownloader` must resolve
/// local-cache state per media type and never surface a download affordance
/// for media that is already on disk (optimistic `file://` media, or a message
/// still in its optimistic delivery phase).
@MainActor
final class AttachmentDownloaderTests: XCTestCase {

    // MARK: - Factories

    private func makeImageAttachment(fileUrl: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: "att-img-\(UUID().uuidString)",
            mimeType: "image/jpeg",
            fileUrl: fileUrl,
            uploadedBy: "user-test"
        )
    }

    private func makeBadge(
        attachment: MeeshyMessageAttachment,
        deliveryStatus: MeeshyMessage.DeliveryStatus
    ) -> DownloadBadgeView {
        DownloadBadgeView(
            attachment: attachment,
            accentColor: "#6366F1",
            messageDeliveryStatus: deliveryStatus
        )
    }

    // MARK: - checkCache routing

    func test_checkCache_imageAttachment_checksImageStore() async {
        let fileUrl = "https://cdn.example.com/img-\(UUID().uuidString).jpg"
        let key = MeeshyConfig.resolveMediaURL(fileUrl)?.absoluteString ?? fileUrl
        await CacheCoordinator.shared.images.store(Data([0x01, 0x02, 0x03]), for: key)

        let downloader = AttachmentDownloader()
        await downloader.checkCache(makeImageAttachment(fileUrl: fileUrl))

        XCTAssertTrue(downloader.isCached, "An image present in the images store must be reported as cached")

        await CacheCoordinator.shared.images.invalidate(for: key)
    }

    func test_checkCache_localFileAttachment_setsCachedWithoutNetwork() async throws {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("optimistic-\(UUID().uuidString).jpg")
        try Data([0xFF, 0xD8, 0xFF]).write(to: tempURL)
        defer { try? FileManager.default.removeItem(at: tempURL) }

        let downloader = AttachmentDownloader()
        await downloader.checkCache(makeImageAttachment(fileUrl: tempURL.absoluteString))

        XCTAssertTrue(downloader.isCached, "A local file:// attachment that exists on disk must be reported as cached")
    }

    func test_checkCache_localFileAttachment_missingFile_staysNotCached() async {
        let missingURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("missing-\(UUID().uuidString).jpg")

        let downloader = AttachmentDownloader()
        await downloader.checkCache(makeImageAttachment(fileUrl: missingURL.absoluteString))

        XCTAssertFalse(downloader.isCached, "A file:// attachment whose file is absent must not be reported as cached")
    }

    // MARK: - DownloadBadgeView visibility

    func test_downloadBadge_forSendingMessage_isHidden() {
        let badge = makeBadge(
            attachment: makeImageAttachment(fileUrl: "https://cdn.example.com/photo.jpg"),
            deliveryStatus: .sending
        )
        XCTAssertTrue(badge.hidesForLocalOrOptimisticMedia,
                      "The download badge must be hidden while the carrier message is .sending")
    }

    func test_downloadBadge_forInvisibleMessage_isHidden() {
        let badge = makeBadge(
            attachment: makeImageAttachment(fileUrl: "https://cdn.example.com/photo.jpg"),
            deliveryStatus: .invisible
        )
        XCTAssertTrue(badge.hidesForLocalOrOptimisticMedia,
                      "The download badge must be hidden during the .invisible optimistic phase")
    }

    func test_downloadBadge_forLocalFileAttachment_isHidden() {
        let badge = makeBadge(
            attachment: makeImageAttachment(fileUrl: "file:///var/mobile/tmp/camera_1.jpg"),
            deliveryStatus: .sent
        )
        XCTAssertTrue(badge.hidesForLocalOrOptimisticMedia,
                      "The download badge must be hidden for local file:// media")
    }

    func test_downloadBadge_forConfirmedServerMedia_isVisible() {
        let badge = makeBadge(
            attachment: makeImageAttachment(fileUrl: "https://cdn.example.com/photo.jpg"),
            deliveryStatus: .sent
        )
        XCTAssertFalse(badge.hidesForLocalOrOptimisticMedia,
                       "The download badge must remain available for confirmed remote media")
    }
}
