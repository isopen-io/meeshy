import SwiftUI
import MeeshySDK
import MeeshyUI

/// Resolves `VideoAvailability` for a `MessageAttachment` by:
///   1. Checking local file existence for `file://` URLs.
///   2. Querying `CacheCoordinator.video.isCached(url)` for remote URLs.
///   3. Owning an `AttachmentDownloader` and applying
///      `MediaDownloadPolicyEngine.shouldAutoDownload` on resolve.
///
/// Replaces `VideoMediaView` (inline path) and `GatedVideoFullscreenPlayer`
/// (fullscreen path) — both used to duplicate this logic.
///
/// App-side because it orchestrates SDK building blocks
/// (`CacheCoordinator`, `MediaDownloadPolicyEngine`, `NetworkConditionMonitor`,
/// `MediaDownloadPreferencesStore`, `AttachmentDownloader`) for Meeshy
/// product UX decisions. The SDK stays pure (atoms + services) ; the app
/// composes them.
///
/// Usage:
///   VideoAvailabilityResolver(attachment: att) { availability, onDownload in
///       MeeshyVideoPlayer(attachment: att, style: .inline, controls: .inlineDefault,
///                         accentColor: contactColor, frame: .bubble,
///                         availability: availability, onDownload: onDownload,
///                         onExpand: { ... })
///   }
struct VideoAvailabilityResolver<Content: View>: View {
    let attachment: MessageAttachment
    let content: (VideoAvailability, @escaping () -> Void) -> Content

    @State private var resolvedAvailability: VideoAvailability = .needsDownload
    @StateObject private var downloader = AttachmentDownloader()

    private var availability: VideoAvailability {
        if downloader.isDownloading {
            return .downloading(progress: downloader.progress)
        }
        if downloader.isCached {
            return .ready
        }
        return resolvedAvailability
    }

    init(
        attachment: MessageAttachment,
        @ViewBuilder content: @escaping (VideoAvailability, @escaping () -> Void) -> Content
    ) {
        self.attachment = attachment
        self.content = content
    }

    var body: some View {
        content(availability) {
            downloader.start(attachment: attachment, onShare: nil)
        }
        .task(id: attachment.fileUrl) {
            resolvedAvailability = await Self.resolveStatic(attachment)
            if case .needsDownload = resolvedAvailability,
               !downloader.isDownloading,
               !downloader.isCached {
                let condition = NetworkConditionMonitor.shared.condition
                let prefs = MediaDownloadPreferencesStore.shared.preferences
                if MediaDownloadPolicyEngine.shouldAutoDownload(
                    kind: .video, condition: condition, prefs: prefs
                ) {
                    downloader.start(attachment: attachment, onShare: nil)
                }
            }
        }
    }

    /// Static resolver helper, testable without SwiftUI hosting.
    static func resolveStatic(_ attachment: MessageAttachment) async -> VideoAvailability {
        let urlString = attachment.fileUrl
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(atPath: URL(string: urlString)?.path ?? "")
            return VideoAvailability.resolve(isLocalFile: true, localFileExists: exists, isServerCached: false)
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.video.isCached(resolved)
        return VideoAvailability.resolve(isLocalFile: false, localFileExists: false, isServerCached: cached)
    }
}
