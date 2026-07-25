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

    // MARK: - registerInFlightDownload race (source guard)

    /// `startDownloadFlow` used to discard `registerInFlightDownload`'s Bool
    /// return and unconditionally await its OWN byte task — so when a second
    /// bubble (or a second language of the same audio) resolved to the exact
    /// same cache key between the initial piggyback check and this
    /// registration attempt, BOTH calls streamed the full file concurrently.
    /// `startDownloadFlow` runs inside a `Task.detached` closure doing real
    /// `URLSession` I/O, which this repo's own test suite for this class
    /// deliberately never exercises (no wall-clock/network flakiness) — a
    /// source guard is the established pattern here for wiring that can't be
    /// driven through the public API without spinning up real networking
    /// (cf. `CameraModelSwitchDuringRecordingTests`).
    private func conversationMediaViewsSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // apps/ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationMediaViews.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_startDownloadFlow_honorsRegisterInFlightDownloadReturnValue() throws {
        let source = try conversationMediaViewsSource()
        XCTAssertFalse(
            source.contains("await store.registerInFlightDownload(byteTask, for: resolvedKey)\n                let data = try await byteTask.value"),
            "startDownloadFlow must not discard registerInFlightDownload's Bool and unconditionally await its own task"
        )
        XCTAssertTrue(
            source.contains("let registered = await store.registerInFlightDownload(byteTask, for: resolvedKey)"),
            "startDownloadFlow must capture registerInFlightDownload's return value"
        )
        XCTAssertTrue(
            source.contains("byteTask.cancel()"),
            "Losing the registration race must cancel the now-redundant task instead of letting it run to completion"
        )
    }

    /// B9 fix — `registerInFlightDownload`'s entry can self-clear (the winner
    /// persists its payload, then its wrapper Task nils the registry) between
    /// our failed registration and the very next `inFlightDownload(for:)`
    /// read, since both are actor hops with a real suspension point in
    /// between. The previous fallback (`else { data = try await
    /// byteTask.value }`) awaited its OWN just-cancelled task in that case:
    /// `Task.checkCancellation()` inside the byte loop throws
    /// `CancellationError`, which the outer `catch`'s cancellation guard
    /// (`guard !Task.isCancelled, !(error is CancellationError) else {
    /// return }` — written for the explicit user-tap-cancel path, where
    /// `cancel()` already resets state before this catch ever runs) silently
    /// swallows, stranding `isDownloading == true` forever with the badge
    /// spinner stuck and `startDownloadFlow`'s own entry guard blocking any
    /// retry. `byteTask.value` must therefore appear exactly once in the
    /// function (the `registered == true` winner path) — never as a fallback
    /// once the entry has vanished.
    func test_startDownloadFlow_losingRaceWithClearedEntry_neverAwaitsOwnCancelledTask() throws {
        let source = try conversationMediaViewsSource()
        let occurrences = source.components(separatedBy: "byteTask.value").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "byteTask.value must be awaited only on the registration-winner path — a second occurrence means the "
            + "loser falls back to awaiting its OWN cancelled task, whose CancellationError is swallowed by the "
            + "outer catch's cancellation guard and strands isDownloading == true forever"
        )
        XCTAssertTrue(
            source.contains("data = try await store.data(for: resolvedKey)"),
            "When the in-flight entry vanished after losing the race, the fallback must read through the store's "
            + "own idempotent fetch (cache-hit if the winner already persisted, safe re-fetch otherwise) instead "
            + "of the loser's own cancelled task"
        )
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
