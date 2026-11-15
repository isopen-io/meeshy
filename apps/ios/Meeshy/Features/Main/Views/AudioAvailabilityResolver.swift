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
    /// Quand `true`, bypasse la préférence réseau de l'utilisateur
    /// (`MediaDownloadPreferencesStore`) et auto-télécharge toujours — sauf
    /// hors-ligne. Réservé aux surfaces Feed/Posts où l'utilisateur attend que
    /// l'audio soit prêt sans bouton. Les bulles de conversation gardent
    /// `false` : la politique réseau (WiFi-only / data-saver) y est respectée.
    let autoDownload: Bool
    let content: (AudioAvailability, @escaping () -> Void) -> Content

    /// `nil` tant que la tâche n'a pas résolu : le premier rendu lit alors le
    /// disque en synchrone (`AudioAvailability.atFirstRender`), si bien qu'un
    /// audio déjà téléchargé ne se dessine jamais « ↓ » (#10370).
    @State private var resolvedAvailability: AudioAvailability?
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
        return resolvedAvailability ?? AudioAvailability.atFirstRender(for: attachment)
    }

    init(
        attachment: MessageAttachment,
        autoDownload: Bool = false,
        @ViewBuilder content: @escaping (AudioAvailability, @escaping () -> Void) -> Content
    ) {
        self.attachment = attachment
        self.autoDownload = autoDownload
        self.content = content
    }

    var body: some View {
        content(availability) {
            downloader.start(attachment: attachment, origin: .manual, onShare: nil)
        }
        .task(id: attachment.fileUrl) {
            // Branché sur le registre partagé : un téléchargement de ce fichier
            // lancé ailleurs s'affiche ici et le rend « prêt » (#7492).
            downloader.observe(attachment)
            let resting = await Self.resolveStatic(attachment)
            resolvedAvailability = resting
            if case .needsDownload = resting,
               !downloader.isDownloading,
               !downloader.isCached {
                let condition = NetworkConditionMonitor.shared.condition
                let prefs = MediaDownloadPreferencesStore.shared.preferences
                if Self.shouldAutoStart(autoDownload: autoDownload, condition: condition, prefs: prefs) {
                    downloader.start(attachment: attachment, origin: .automatic, onShare: nil)
                }
            }
        }
    }

    /// Décision pure d'auto-démarrage du téléchargement (testable sans hosting).
    /// Hors-ligne : jamais. Sinon : `autoDownload` (Feed/Posts) force le DL, ou
    /// la politique réseau de l'utilisateur l'autorise. `kind: .audio` figé.
    static func shouldAutoStart(
        autoDownload: Bool,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences
    ) -> Bool {
        guard condition != .offline else { return false }
        return autoDownload || MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .audio, condition: condition, prefs: prefs
        )
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

extension AudioAvailability {
    /// **La disponibilité au PREMIER rendu se lit sur le disque** (#10370) —
    /// la règle unique `AttachmentDownloadCenter.isOnDevice`, en synchrone.
    /// `AudioMediaView.availableOnDeviceAtFirstRender` (#7660) en est la
    /// projection pour une URL de langue choisie.
    nonisolated static func atFirstRender(
        for attachment: MessageAttachment,
        stat: (String, AttachmentDownloadCenter.CacheStoreKind) -> Bool = {
            AttachmentDownloadCenter.isInTypedStore(key: $0, kind: $1)
        },
        fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }
    ) -> AudioAvailability {
        let onDevice = AttachmentDownloadCenter.isOnDevice(
            urlString: attachment.fileUrl, kind: .audio, stat: stat, fileExists: fileExists
        )
        return onDevice ? .ready : .needsDownload
    }
}
