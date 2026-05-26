import SwiftUI
import MeeshySDK
import MeeshyUI

/// Resolves `AudioAvailability` for a `MessageAttachment` (type `.audio`) by:
///   1. Checking local file existence for `file://` URLs.
///   2. Querying `CacheCoordinator.audio.isCached(url)` for remote URLs.
///   3. Owning an `AttachmentDownloader` and applying
///      `MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, …)` on
///      resolve — auto-démarre le DL si la policy l'autorise.
///
/// Mirrors `VideoAvailabilityResolver` 1:1 (mono-URL, `kind: .audio`
/// hardcodé). Pour les usages multi-langue (audio + audio translations,
/// switching de langue active), voir `AudioMediaView` qui maintient sa
/// propre orchestration et gère `startTranslatedAudio`.
///
/// App-side per the SDK Purity rule (`packages/MeeshySDK/CLAUDE.md`) — it
/// orchestrates SDK building blocks and encodes the Meeshy "when auto-DL
/// audio" UX decision. The SDK stays pure (atoms + services) ; the app
/// composes them.
///
/// Usage:
///   AudioAvailabilityResolver(attachment: att) { availability, onDownload in
///       AudioPlayerView(attachment: att, context: .messageBubble,
///                       accentColor: accentHex, transcription: …,
///                       translatedAudios: …,
///                       availability: availability, onDownload: onDownload)
///   }
struct AudioAvailabilityResolver<Content: View>: View {
    let attachment: MessageAttachment
    let content: (AudioAvailability, @escaping () -> Void) -> Content

    @State private var resolvedAvailability: AudioAvailability = .needsDownload
    @StateObject private var downloader = AttachmentDownloader()

    private var availability: AudioAvailability {
        if downloader.isDownloading {
            return .downloading(
                progress: downloader.progress,
                downloadedBytes: downloader.downloadedBytes,
                totalBytes: downloader.totalBytes
            )
        }
        if downloader.isCached {
            return .ready
        }
        return resolvedAvailability
    }

    init(
        attachment: MessageAttachment,
        @ViewBuilder content: @escaping (AudioAvailability, @escaping () -> Void) -> Content
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
                    kind: .audio, condition: condition, prefs: prefs
                ) {
                    downloader.start(attachment: attachment, onShare: nil)
                }
            }
        }
    }

    /// Static resolver helper, testable without SwiftUI hosting.
    static func resolveStatic(_ attachment: MessageAttachment) async -> AudioAvailability {
        let urlString = attachment.fileUrl
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(atPath: URL(string: urlString)?.path ?? "")
            return AudioAvailability.resolve(isLocalFile: true, localFileExists: exists, isServerCached: false)
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.audio.isCached(resolved)
        return AudioAvailability.resolve(isLocalFile: false, localFileExists: false, isServerCached: cached)
    }
}
