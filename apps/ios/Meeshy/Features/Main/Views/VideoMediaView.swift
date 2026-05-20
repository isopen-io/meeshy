import SwiftUI
import MeeshySDK
import MeeshyUI

/// Wrapper of `InlineVideoPlayerView` that resolves `VideoAvailability` from
/// `CacheCoordinator.shared.video`, triggers auto-download via
/// `AttachmentDownloader` according to `MediaDownloadPolicyEngine`, and
/// injects `availability` + `onDownload` into the inline player. Conceptual
/// mirror of `AudioMediaView`.
struct VideoMediaView: View, Equatable {
    let attachment: MessageAttachment
    let accentColor: String
    let isDark: Bool

    var onExpandFullscreen: (() -> Void)? = nil

    static func == (lhs: VideoMediaView, rhs: VideoMediaView) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.attachment.fileUrl == rhs.attachment.fileUrl
            && lhs.attachment.fileSize == rhs.attachment.fileSize
            && lhs.isDark == rhs.isDark
            && lhs.accentColor == rhs.accentColor
    }

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

    private func resolveAvailability() async {
        let urlString = attachment.fileUrl
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(
                atPath: URL(string: urlString)?.path ?? ""
            )
            resolvedAvailability = VideoAvailability.resolve(
                isLocalFile: true, localFileExists: exists, isServerCached: false
            )
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.video.isCached(resolved)
        resolvedAvailability = VideoAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: cached
        )
    }

    var body: some View {
        InlineVideoPlayerView(
            attachment: attachment,
            accentColor: accentColor,
            availability: availability,
            onDownload: { downloader.start(attachment: attachment, onShare: nil) },
            onExpandFullscreen: onExpandFullscreen
        )
        .task(id: attachment.fileUrl) {
            await resolveAvailability()
            if case .needsDownload = resolvedAvailability, !downloader.isDownloading {
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
}
