import Foundation
import MeeshySDK
import MeeshyUI

/// Préchargement des médias du fil autour de la cellule visible : possède ses
/// deux tâches (debounce du scroll, fenêtre de préchargement) et l'indice du
/// dernier déclenchement. `FeedViewModel` ne lui fournit que la lecture de
/// `posts` ; il reste la façade (`prefetchMediaForPost`, `prefetchMedia(around:)`).
final class FeedMediaPrefetcher {
    nonisolated deinit {}

    private let postsProvider: () -> [FeedPost]
    private var prefetchTask: Task<Void, Never>?
    private var prefetchDebounceTask: Task<Void, Never>?
    private var lastPrefetchIndex: Int = -1

    init(posts: @escaping () -> [FeedPost]) {
        self.postsProvider = posts
    }

    /// Debounced entry point from scroll — avoids task thrashing during fast scroll.
    func prefetchMediaForPost(_ postId: String) {
        guard let index = postsProvider().firstIndex(where: { $0.id == postId }) else { return }
        guard abs(index - lastPrefetchIndex) >= 2 else { return }
        lastPrefetchIndex = index
        prefetchDebounceTask?.cancel()
        prefetchDebounceTask = Task {
            guard await cancellableSleep(for: .milliseconds(150)), !Task.isCancelled else { return }
            prefetchMedia(around: index)
        }
    }

    /// Décision PURE : ce média de post doit-il être PRÉCHARGÉ, la politique
    /// d'auto-téléchargement étant déjà résolue ? Miroir de
    /// `BubbleCarouselView.shouldPrefetchAttachment`, avec l'axe que le feed
    /// ajoute : une vidéo n'est pas UN chemin mais DEUX.
    ///
    /// - vidéo AVEC vignette : la branche ne tire qu'une image distante → `prefs.image` ;
    /// - vidéo SANS vignette : `StoryMediaLoader.videoThumbnail` décode la
    ///   première frame du MP4 **distant** (moov + premier GOP) — ce sont des
    ///   octets VIDÉO, donc `prefs.video` (`.wifiOnly` par défaut), sans quoi un
    ///   bon cellulaire tirerait de la vidéo sous couvert de « vignette ».
    /// - document : jamais préchargé (branche `default` du routage ci-dessous).
    nonisolated static func shouldPrefetchFeedMedia(
        kind: FeedMediaType,
        hasThumbnail: Bool,
        allowImage: Bool,
        allowVideo: Bool,
        allowAudio: Bool
    ) -> Bool {
        switch kind {
        case .image: return allowImage
        case .video: return hasThumbnail ? allowImage : allowVideo
        case .audio: return allowAudio
        case .document: return false
        }
    }

    /// Prefetch media for posts in the visible window + next 5.
    func prefetchMedia(around index: Int) {
        prefetchTask?.cancel()
        // L'indice a pu être pris 150 ms plus tôt : un rafraîchissement qui raccourcit le fil entre-temps
        // rendait une borne basse au-delà de la haute.
        let posts = postsProvider()
        let lower = min(max(0, index - 2), posts.count)
        let upper = min(posts.count, max(lower, index + 7))
        let slice = Array(posts[lower..<upper])
        prefetchTask = Task(priority: .utility) {
            guard !slice.isEmpty else { return }

            // Respecte la politique d'auto-téléchargement — miroir de
            // `ConversationMediaHandler.prefetchRecentMedia`. Sans elle, la
            // fenêtre de 9 posts tirait le fichier AUDIO ENTIER de chaque post
            // jamais joué, et l'image pleine taille, en cellulaire contraint.
            // Résolus UNE fois ici : la garde thermique du preroll consulte déjà
            // l'appareil, il manquait le RÉSEAU.
            let condition = NetworkConditionMonitor.shared.condition
            let prefs = MediaDownloadPreferencesStore.shared.preferences
            let allowImage = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: condition, prefs: prefs)
            let allowVideo = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: condition, prefs: prefs)
            let allowAudio = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: condition, prefs: prefs)

            let imageStore = await CacheCoordinator.shared.images
            let thumbStore = await CacheCoordinator.shared.thumbnails

            // Parallel prefetch: images/thumbnails in TaskGroup, video preroll separate
            await withTaskGroup(of: Void.self) { group in
                for post in slice {
                    for media in post.media {
                        guard !Task.isCancelled else { return }
                        guard FeedMediaPrefetcher.shouldPrefetchFeedMedia(
                            kind: media.type,
                            hasThumbnail: media.thumbnailUrl.flatMap { MeeshyConfig.resolveMediaURL($0) } != nil,
                            allowImage: allowImage,
                            allowVideo: allowVideo,
                            allowAudio: allowAudio
                        ) else { continue }

                        switch media.type {
                        case .image:
                            if let thumbUrl = media.thumbnailUrl,
                               let resolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            }
                            if let url = media.url,
                               let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            }

                        case .video:
                            if let thumbUrl = media.thumbnailUrl,
                               let resolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            } else if let url = media.url, let resolved = MeeshyConfig.resolveMediaURL(url) {
                                let thumbKey = "thumb:\(resolved.absoluteString)"
                                if thumbStore.cachedData(for: thumbKey) == nil {
                                    group.addTask { _ = await StoryMediaLoader.shared.videoThumbnail(url: resolved) }
                                }
                            }

                        case .audio:
                            if let url = media.url,
                               let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString {
                                group.addTask { _ = try? await CacheCoordinator.shared.audio.data(for: resolved) }
                            }

                        default:
                            break
                        }
                    }
                }
            }

            // Video preroll: separate from main group — non-blocking, fire-and-forget.
            // Suspended while the device is critically hot (SOTA thermal back-off,
            // WWDC19 #422) so fast scrolling stops spawning new decode sessions until
            // it cools down. `allowVideo` : le preroll charge le MP4 lui-même,
            // c'est la branche la plus coûteuse de tout le prefetch.
            if allowVideo,
               MediaThermalPolicy.shouldPrefetchVideo(thermalState: ProcessInfo.processInfo.thermalState),
               let firstVideo = slice.flatMap(\.media).first(where: { $0.type == .video }),
               let url = firstVideo.url, let resolved = MeeshyConfig.resolveMediaURL(url) {
                Task(priority: .utility) {
                    await StoryMediaLoader.shared.preloadAndCachePlayer(url: resolved)
                }
            }
        }
    }
}
