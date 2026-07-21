import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
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

    // MARK: - Byte-size formatting

    /// `AttachmentDownloader.fmt` must delegate to the single SDK-wide
    /// `formatMediaFileSize` helper — locks the fix for the divergent
    /// binary-vs-decimal formatters bug (AudioPlayerView.formatBytes used to
    /// disagree with this one despite a comment claiming parity).
    func test_fmt_delegatesToSharedSDKFileSizeFormatter() {
        XCTAssertEqual(AttachmentDownloader.fmt(870_400), formatMediaFileSize(870_400))
        XCTAssertEqual(AttachmentDownloader.fmt(1_048_576), formatMediaFileSize(1_048_576))
    }
}

/// Feed/Posts auto-download decision — `autoDownload: true` (Feed/Posts surfaces)
/// must force the download regardless of the user's per-network preference, while
/// still never starting a download offline. `autoDownload: false` (conversation
/// bubbles) must delegate entirely to `MediaDownloadPolicyEngine`, preserving the
/// user's WiFi-only / data-saver UX.
@MainActor
final class MediaAutoDownloadDecisionTests: XCTestCase {

    // MARK: - Video resolver

    func test_video_autoDownloadTrue_overridesWifiOnlyPrefOnCellular() {
        let prefs = MediaDownloadPreferences(video: .wifiOnly)
        XCTAssertTrue(
            VideoAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: true, condition: .badCellular, prefs: prefs
            ),
            "Feed/Posts video must auto-download even when the user picked WiFi-only and is on cellular"
        )
    }

    func test_video_autoDownloadTrue_offline_returnsFalse() {
        let prefs = MediaDownloadPreferences(video: .always)
        XCTAssertFalse(
            VideoAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: true, condition: .offline, prefs: prefs
            ),
            "No download must start while offline, even with autoDownload forced"
        )
    }

    func test_video_autoDownloadFalse_respectsPolicy_wifiOnly_onWifi() {
        let prefs = MediaDownloadPreferences(video: .wifiOnly)
        XCTAssertTrue(
            VideoAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: false, condition: .wifi, prefs: prefs
            )
        )
    }

    func test_video_autoDownloadFalse_respectsPolicy_wifiOnly_onCellular() {
        let prefs = MediaDownloadPreferences(video: .wifiOnly)
        XCTAssertFalse(
            VideoAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: false, condition: .badCellular, prefs: prefs
            ),
            "Conversation video (autoDownload=false) must honour the WiFi-only preference"
        )
    }

    // MARK: - Audio resolver

    func test_audio_autoDownloadTrue_overridesNeverPref() {
        let prefs = MediaDownloadPreferences(audio: .never)
        XCTAssertTrue(
            AudioAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: true, condition: .wifi, prefs: prefs
            ),
            "Feed/Posts audio must auto-download even when the user set audio policy to never"
        )
    }

    func test_audio_autoDownloadTrue_offline_returnsFalse() {
        let prefs = MediaDownloadPreferences(audio: .always)
        XCTAssertFalse(
            AudioAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: true, condition: .offline, prefs: prefs
            )
        )
    }

    func test_audio_autoDownloadFalse_respectsPolicy_neverPref() {
        let prefs = MediaDownloadPreferences(audio: .never)
        XCTAssertFalse(
            AudioAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: false, condition: .wifi, prefs: prefs
            ),
            "Conversation audio (autoDownload=false) must honour the never preference"
        )
    }

    /// The audio resolver must read the per-kind `.audio` policy, never the
    /// `.video` policy (regression guard for a copy-paste of the video helper).
    func test_audio_autoDownloadFalse_usesAudioPolicyNotVideo() {
        let prefs = MediaDownloadPreferences(audio: .always, video: .never)
        XCTAssertTrue(
            AudioAvailabilityResolver<EmptyView>.shouldAutoStart(
                autoDownload: false, condition: .badCellular, prefs: prefs
            ),
            "Audio resolver must read the audio policy (.always), independent of the video policy (.never)"
        )
    }

    // MARK: - resolvedAvailability (multi-language audio: gate progress on the selected url)

    func test_resolvedAvailability_downloadingCurrentURL_showsDownloading() {
        let a = AttachmentDownloader.resolvedAvailability(
            isDownloading: true, downloadingURL: "url-A", currentURL: "url-A",
            isCached: false, progress: 0.5, downloadedBytes: 50, totalBytes: 100,
            resting: .needsDownload)
        XCTAssertEqual(a, .downloading(progress: 0.5, downloadedBytes: 50, totalBytes: 100))
    }

    /// The downloader is shared across all language URLs of the bubble. If it is
    /// busy downloading language A but the user switched the selection to language
    /// B, the in-flight progress MUST NOT be shown on B — it falls through to B's
    /// own resting resolution.
    func test_resolvedAvailability_downloadingOtherURL_doesNotLeakProgressToSelected() {
        let a = AttachmentDownloader.resolvedAvailability(
            isDownloading: true, downloadingURL: "url-A", currentURL: "url-B",
            isCached: false, progress: 0.5, downloadedBytes: 50, totalBytes: 100,
            resting: .needsDownload)
        XCTAssertEqual(a, .needsDownload,
                       "a download for another language must not show progress on the selected one")
    }

    func test_resolvedAvailability_cached_returnsReady() {
        let a = AttachmentDownloader.resolvedAvailability(
            isDownloading: false, downloadingURL: nil, currentURL: "url-A",
            isCached: true, progress: 0, downloadedBytes: 0, totalBytes: 0,
            resting: .needsDownload)
        XCTAssertEqual(a, .ready)
    }

    func test_resolvedAvailability_idle_returnsResting() {
        let a = AttachmentDownloader.resolvedAvailability(
            isDownloading: false, downloadingURL: nil, currentURL: "url-A",
            isCached: false, progress: 0, downloadedBytes: 0, totalBytes: 0,
            resting: .ready)
        XCTAssertEqual(a, .ready)
    }
}
