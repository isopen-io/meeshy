import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - StoryComposerViewModel + Repost

extension StoryComposerViewModel {
    /// Initializes the composer pre-populated for reposting `story`.
    ///
    /// Clones the active `StoryItem` (the slide currently displayed in the viewer) into a
    /// fresh `StorySlide` (the composer's internal type — different from `StoryItem`),
    /// drops any credit chip the source inherited, and triggers an asynchronous media
    /// preload via the shared `CacheCoordinator` (3-tier cache) so the canvas paints
    /// instantly once mounted. No « Reposté de @auteur » chip is added (#10524): the
    /// credit lives in the viewer header, after the date.
    ///
    /// - Parameter story: The source story (the viewer's `StoryItem`). Carries the
    ///   repost-chain IDs we need (`id`, `repostOfId`, `originalRepostOfId`) — that is
    ///   why we do not require an `APIPost` here.
    ///
    /// The publish flow itself is NOT modified — `StoryComposerViewModel` still does not
    /// call `PostService.create*` directly. Publication is delegated to the
    /// `onPublishSlide` callback (`StoryComposerView.swift`) implemented by the iOS app
    /// caller (Phase C), which reads `vm.repostOfId` and forwards it to
    /// `PostService.create(...)` / `createStory(...)` (B.5c).
    public convenience init(reposting story: StoryItem) {
        self.init()

        // Repost chain IDs (root-flatten):
        // `repostOfId` always points to the immediate parent (the story we are reposting
        // from). `originalRepostOfId` walks up the chain to the root: prefer the source
        // story's `originalRepostOfId`, else its `repostOfId` (intermediate parent), else
        // the source itself (this story IS the root).
        self.repostOfId = story.id
        self.originalRepostOfId = story.originalRepostOfId
            ?? story.repostOfId
            ?? story.id

        // Convert StoryItem → StorySlide (composer's internal type). Lossy conversion:
        // we keep the first media URL, the content and the effects ; defaults for
        // duration (6 s default for static reposts) and order (0).
        var cloned = StorySlide(
            id: UUID().uuidString,
            mediaURL: story.media.first?.url,
            mediaData: nil,
            content: story.content,
            effects: story.storyEffects ?? StoryEffects(),
            duration: 6,
            order: 0
        )

        // **Aucune puce de crédit** (décision porteur 2026-10-13, #10524) : le
        // crédit vit dans l'en-tête du lecteur, après la date. La puce qu'une
        // source publiée avant la règle porte encore part avec la copie, sans
        // jamais toucher le texte éditable de l'auteur.
        cloned.effects.textObjects = StoryRepostCredit.stripped(from: cloned.effects.textObjects)

        self.slides = [cloned]
        self.currentSlideIndex = 0

        // Preload images via CacheCoordinator (3-tier cache, cancellable).
        // FeedMedia.url is `String?` and MeeshyConfig.resolveMediaURL returns `URL?` with
        // SSRF validation — both guards stay so we never hand a tainted URL to the cache.
        // Les clés de rangement sont résolues AVANT le chargement — voir
        // `RepostMediaPreload`, qui documente pourquoi une clé-URL était perdue
        // par tous les lecteurs et repartait en file hors-ligne comme faux fond.
        let targets = RepostMediaPreload.targets(for: story, slideId: cloned.id)
        preloadTask = Task { [weak self] in
            await withTaskGroup(of: (RepostMediaPreload.Target, UIImage?).self) { group in
                for target in targets {
                    group.addTask {
                        let image = await CacheCoordinator.shared.images
                            .image(for: target.url.absoluteString)
                        return (target, image)
                    }
                }
                for await (target, image) in group {
                    guard !Task.isCancelled, let self, let image else { continue }
                    switch target.destination {
                    case .slideBackground:
                        self.slideImages[target.storageKey] = image
                    case .canvasObject:
                        // `registerLoadedImage` bump `loadedImagesVersion` :
                        // sans ce bump le pont image du canvas reste périmé et
                        // le média préchargé ne s'affiche jamais.
                        self.registerLoadedImage(image, for: target.storageKey)
                    }
                }
            }
        }
    }
}
