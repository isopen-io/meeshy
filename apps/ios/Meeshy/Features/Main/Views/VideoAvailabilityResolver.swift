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
    /// `false` suspend TOUT démarrage automatique — forcé ou par politique —
    /// sans toucher au téléchargement manuel ni à l'observation (#9702). Le
    /// pager de réels le tient fermé hors de sa fenêtre de préchargement :
    /// sous iOS 16, son `TabView` monte toutes les pages d'un coup, et chacune
    /// téléchargeait son réel entier. Rouvert, l'auto-démarrage se rejoue.
    let mayAutoStart: Bool
    let content: (VideoAvailability, @escaping () -> Void) -> Content

    /// `nil` tant que la tâche n'a pas résolu : le premier rendu lit alors le
    /// disque en synchrone (`VideoAvailability.atFirstRender`), si bien qu'une
    /// vidéo déjà téléchargée ne se dessine jamais « ↓ » (#10370).
    @State private var resolvedAvailability: VideoAvailability?
    @StateObject private var downloader = AttachmentDownloader()

    private var availability: VideoAvailability {
        if downloader.isDownloading {
            return .downloading(progress: downloader.progress)
        }
        if downloader.isCached {
            return .ready
        }
        return resolvedAvailability ?? VideoAvailability.atFirstRender(for: attachment)
    }

    init(
        attachment: MessageAttachment,
        autoDownload: Bool = false,
        mayAutoStart: Bool = true,
        @ViewBuilder content: @escaping (VideoAvailability, @escaping () -> Void) -> Content
    ) {
        self.attachment = attachment
        self.autoDownload = autoDownload
        self.mayAutoStart = mayAutoStart
        self.content = content
    }

    var body: some View {
        content(availability) {
            downloader.start(attachment: attachment, origin: .manual, onShare: nil)
        }
        // #11339 — la zone de lecture de la vidéo, que l'aperçu d'appui long
        // laisse toucher (`MessageOverlayPreviewTouch`).
        .modifier(MessagePreviewPlaybackZoneMarker(attachmentId: attachment.id))
        .task(id: AutoStartKey(attachmentId: attachment.id, mayAutoStart: mayAutoStart)) {
            // Branché sur le registre partagé AVANT toute résolution : un
            // téléchargement de cette vidéo lancé par une autre surface
            // (galerie, autre cellule) s'affiche ici, et sa fin la rend
            // « prête » sans re-télécharger (#7492).
            downloader.observe(attachment)
            let resting = await Self.resolveStatic(attachment)
            resolvedAvailability = resting
            if case .needsDownload = resting,
               !downloader.isDownloading,
               !downloader.isCached {
                let condition = NetworkConditionMonitor.shared.condition
                let prefs = MediaDownloadPreferencesStore.shared.preferences
                if Self.shouldAutoStart(autoDownload: autoDownload, mayAutoStart: mayAutoStart,
                                        condition: condition, prefs: prefs) {
                    downloader.start(attachment: attachment, origin: .automatic, onShare: nil)
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
        mayAutoStart: Bool = true,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences
    ) -> Bool {
        guard mayAutoStart, condition != .offline else { return false }
        return autoDownload || MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .video, condition: condition, prefs: prefs
        )
    }

    /// L'identité de la tâche de résolution : rouvrir l'auto-démarrage la rejoue.
    private struct AutoStartKey: Equatable {
        let attachmentId: String
        let mayAutoStart: Bool
    }

    /// Static resolver helper, testable without SwiftUI hosting.
    static func resolveStatic(_ attachment: MessageAttachment) async -> VideoAvailability {
        await VideoAvailability.resting(for: attachment)
    }
}

extension VideoAvailability {
    /// **La disponibilité au PREMIER rendu se lit sur le disque** (#10370),
    /// comme celle d'un vocal (#7660) : un `stat` synchrone par la règle
    /// unique `AttachmentDownloadCenter.isOnDevice`. Sans elle, la vidéo
    /// partait de `.needsDownload` et montrait « ↓ » jusqu'au retour de
    /// `resting(for:)`, même déjà téléchargée.
    nonisolated static func atFirstRender(
        for attachment: MessageAttachment,
        stat: (String, AttachmentDownloadCenter.CacheStoreKind) -> Bool = {
            AttachmentDownloadCenter.isInTypedStore(key: $0, kind: $1)
        },
        fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }
    ) -> VideoAvailability {
        let onDevice = AttachmentDownloadCenter.isOnDevice(
            urlString: attachment.fileUrl, kind: .video, stat: stat, fileExists: fileExists
        )
        return onDevice ? .ready : .needsDownload
    }

    /// La disponibilité AU REPOS d'une vidéo — fichier local ou cache vidéo.
    /// Site UNIQUE (#7492) : la galerie plein écran en tenait une copie.
    static func resting(for attachment: MessageAttachment) async -> VideoAvailability {
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
