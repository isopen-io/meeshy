import Foundation
import os
import MeeshySDK

/// Préchargement des stories, extrait de `ConversationListViewModel.swift`
/// (hors budget) pour que #8759 puisse y ajouter sa loi sans grossir l'hôte.
extension ConversationListViewModel {

    // MARK: - Story Prefetch

    /// Précharge les stories : 2 premières de chaque groupe + 3 premiers groupes complets.
    /// Utilise les DiskCacheStore existants (images/video) avec cache-hit check.
    func prefetchRecentStories() {
        storyPrefetchTask?.cancel()

        storyPrefetchTask = Task.detached(priority: .utility) { [storyService = self.storyService] in
            // Cache-first : `StoryViewModel.loadStories()` récupère déjà le feed
            // (limit=50) et préfetch ses médias au lancement, en écrivant le
            // MÊME `storiesCacheKey`. On saute notre fetch réseau redondant
            // (limit=30) quand ce cache est déjà peuplé — sinon les deux partent
            // au cold start, tapant /posts/feed/stories deux fois et churnant la
            // même clé de cache.
            switch await CacheCoordinator.shared.stories.load(for: StoryViewModel.storiesCacheKey) {
            case .fresh, .stale:
                return
            case .expired, .empty:
                break
            }
            do {
                let response = try await storyService.list(cursor: nil, limit: 30)
                guard response.success, !Task.isCancelled else { return }

                let storyGroups = response.data.toStoryGroups()
                guard !storyGroups.isEmpty else { return }

                // Collecter les URLs à précharger (2 par groupe + reste des 3 premiers)
                var imageURLs: [String] = []
                var videoURLs: [String] = []
                for (i, group) in storyGroups.enumerated() {
                    let limit = i < 3 ? group.stories.count : min(2, group.stories.count)
                    for story in group.stories.prefix(limit) {
                        for media in story.media {
                            guard let url = media.url, !url.isEmpty else { continue }
                            switch media.type {
                            case .video:
                                videoURLs.append(url)
                            default:
                                imageURLs.append(url)
                            }
                        }
                    }
                }

                // Précharger images par lots de 8
                let imageStore = await CacheCoordinator.shared.images
                let uniqueImageURLs = Array(Set(imageURLs))
                for chunk in stride(from: 0, to: uniqueImageURLs.count, by: 8) {
                    guard !Task.isCancelled else { return }
                    let end = min(chunk + 8, uniqueImageURLs.count)
                    await withTaskGroup(of: Void.self) { taskGroup in
                        for urlString in uniqueImageURLs[chunk..<end] {
                            taskGroup.addTask {
                                _ = await imageStore.image(for: urlString)
                            }
                        }
                    }
                }

                // Précharger vidéos par lots de 4 (plus lourds)
                let videoStore = await CacheCoordinator.shared.video
                let uniqueVideoURLs = Array(Set(videoURLs))
                for chunk in stride(from: 0, to: uniqueVideoURLs.count, by: 4) {
                    guard !Task.isCancelled else { return }
                    let end = min(chunk + 4, uniqueVideoURLs.count)
                    await withTaskGroup(of: Void.self) { taskGroup in
                        for urlString in uniqueVideoURLs[chunk..<end] {
                            taskGroup.addTask {
                                _ = try? await videoStore.data(for: urlString)
                            }
                        }
                    }
                }

                try? await CacheCoordinator.shared.stories.save(storyGroups, for: StoryViewModel.storiesCacheKey)
                Logger.messages.info("[ConversationListVM] Stories prefetched: \(storyGroups.count) groups, \(uniqueImageURLs.count) images, \(uniqueVideoURLs.count) videos")
            } catch {
                Logger.messages.error("[ConversationListVM] Story prefetch failed: \(error.localizedDescription)")
            }
        }
    }
}
