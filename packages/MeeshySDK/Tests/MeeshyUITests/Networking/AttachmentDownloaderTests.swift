import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

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

    // TODO migrate-test: DownloadBadgeView tests (test_downloadBadge_*) cannot live in
    // MeeshyUITests because DownloadBadgeView is defined in the app target (apps/ios/Meeshy)
    // and depends on the app-side Message.DeliveryStatus typealias + app-specific hidesForLocalOrOptimisticMedia
    // computed property. These 4 tests remain covered by the app's MeeshyTests target.
}
