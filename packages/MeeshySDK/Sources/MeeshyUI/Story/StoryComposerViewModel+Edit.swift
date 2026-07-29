import SwiftUI
import UIKit
import MeeshySDK

// MARK: - StoryComposerViewModel + Edit (directive 2026-07-29)

extension StoryComposerViewModel {
    /// Initializes the composer to EDIT an already-published story.
    ///
    /// Faithful hydration — unlike `init(reposting:authorHandle:)` this is NOT
    /// lossy: the `StoryEffects` blob is taken verbatim (no locked badge, no
    /// forced duration), the media URLs stay pointed at their server assets
    /// (`postMediaId` non-empty → the publish pipeline skips re-upload), and
    /// the media preload paints the canvas with the existing composition.
    ///
    /// What the app does with it at publish time:
    /// - reads `editingPostId` → routes to `PUT /posts/:id` instead of
    ///   `createStory` (server resets views/reactions, keeps the publication
    ///   date — see gateway `storyContentEditRequested`);
    /// - diffs `editingOriginalMediaIds` against the media still referenced by
    ///   the edited effects to build `removeMediaIds`;
    /// - compares the published background image instance against
    ///   `editingHydratedBackgroundImage` (`===`) to decide whether the
    ///   background must be re-uploaded or the original kept.
    public convenience init(editing story: StoryItem) {
        self.init()

        editingPostId = story.id
        editingOriginalMediaIds = story.media.map(\.id)
        editingInitialVisibility = story.visibility
        editingInitialVisibilityUserIds = story.visibilityUserIds ?? []

        // Le média de FOND est par convention `story.media.first` (le publish
        // l'uploade en premier), sauf s'il est déjà référencé par un objet du
        // canvas — auquel cas la story n'a pas de fond distinct.
        let effects = story.storyEffects ?? StoryEffects()
        let referencedIds = Set(
            (effects.mediaObjects ?? []).map(\.postMediaId)
                + (effects.audioPlayerObjects ?? []).map(\.postMediaId)
        )
        if let first = story.media.first, !referencedIds.contains(first.id) {
            editingOriginalBackgroundMediaId = first.id
        }

        var slide = StorySlide(
            id: UUID().uuidString,
            mediaURL: story.media.first?.url,
            mediaData: nil,
            content: story.content,
            effects: effects,
            duration: 6,
            order: 0
        )
        slide.duration = slide.computedTotalDuration()
        slides = [slide]
        currentSlideIndex = 0

        // Même préchargement 3-tier que le repost — fond + objets du canvas
        // retrouvent leurs bitmaps pour que le canvas peigne immédiatement.
        let targets = RepostMediaPreload.targets(for: story, slideId: slide.id)
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
                        // Ne JAMAIS écraser un fond que l'utilisateur a déjà
                        // remplacé pendant que le préchargement courait — et
                        // capturer l'INSTANCE hydratée pour la comparaison
                        // d'identité au publish (fond inchangé = pas de
                        // ré-upload).
                        guard self.slideImages[target.storageKey] == nil else { continue }
                        self.slideImages[target.storageKey] = image
                        self.editingHydratedBackgroundImage = image
                    case .canvasObject:
                        self.registerLoadedImage(image, for: target.storageKey)
                    }
                }
            }
        }
    }
}
