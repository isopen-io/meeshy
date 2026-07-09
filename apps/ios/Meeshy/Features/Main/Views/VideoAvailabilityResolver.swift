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
    /// Quand `true`, bypasse la préférence réseau de l'utilisateur
    /// (`MediaDownloadPreferencesStore`) et auto-télécharge toujours — sauf
    /// hors-ligne. Réservé aux surfaces Feed/Posts où l'utilisateur attend que
    /// le média apparaisse sans bouton (parité avec `ProgressiveCachedImage`
    /// `autoLoad`). Les bulles de conversation gardent `false` : la politique
    /// réseau (WiFi-only / data-saver) y est respectée.
    let autoDownload: Bool
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
        autoDownload: Bool = false,
        @ViewBuilder content: @escaping (VideoAvailability, @escaping () -> Void) -> Content
    ) {
        self.attachment = attachment
        self.autoDownload = autoDownload
        self.content = content
    }

    var body: some View {
        content(availability) {
            downloader.start(attachment: attachment, onShare: nil)
        }
        .task(id: attachment.id) {
            resolvedAvailability = await Self.resolveStatic(attachment)
            if case .needsDownload = resolvedAvailability,
               !downloader.isDownloading,
               !downloader.isCached {
                let condition = NetworkConditionMonitor.shared.condition
                let prefs = MediaDownloadPreferencesStore.shared.preferences
                if Self.shouldAutoStart(autoDownload: autoDownload, condition: condition, prefs: prefs) {
                    downloader.start(attachment: attachment, onShare: nil)
                }
            }
        }
    }

    /// Décision pure d'auto-démarrage du téléchargement (testable sans hosting).
    /// Hors-ligne : jamais (inutile de lancer un DL sans réseau). Sinon :
    /// `autoDownload` (Feed/Posts) force le téléchargement, ou la politique
    /// réseau de l'utilisateur l'autorise. `kind: .video` figé pour ce resolver.
    static func shouldAutoStart(
        autoDownload: Bool,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences
    ) -> Bool {
        guard condition != .offline else { return false }
        return autoDownload || MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .video, condition: condition, prefs: prefs
        )
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
