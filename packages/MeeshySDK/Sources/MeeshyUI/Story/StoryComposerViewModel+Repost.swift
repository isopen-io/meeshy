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
    /// appends the repost credit chip when — and only when — the source story was
/// PUBLIC (`StoryRepostCredit`), at the bottom-center of the canvas,
    /// and triggers an asynchronous media preload via the shared `CacheCoordinator`
    /// (3-tier cache) so the canvas paints instantly once mounted.
    ///
    /// - Parameters:
    ///   - story: The source story (the viewer's `StoryItem`). Carries the repost-chain
    ///            IDs we need (`id`, `repostOfId`, `originalRepostOfId`) — that is why we
    ///            do not require an `APIPost` here.
    ///   - authorHandle: What to render in the badge ("Reposté de @\(authorHandle)") —
    ///                   typically `currentGroup.username` from the iOS caller.
    ///
    /// The publish flow itself is NOT modified — `StoryComposerViewModel` still does not
    /// call `PostService.create*` directly. Publication is delegated to the
    /// `onPublishSlide` callback (`StoryComposerView.swift`) implemented by the iOS app
    /// caller (Phase C), which reads `vm.repostOfId` and forwards it to
    /// `PostService.create(...)` / `createStory(...)` (B.5c).
    public convenience init(reposting story: StoryItem, authorHandle: String) {
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

        // **Le crédit n'est DÛ que si l'original était public** (directive
        // porteur 2026-09-01). La règle, la forme de la pastille et son
        // libellé localisé vivent dans `StoryRepostCredit` — pures, donc
        // éprouvables sans monter un canvas.
        //
        // Le RETRAIT des crédits hérités, lui, est INCONDITIONNEL : republier
        // une republication publique vers une audience restreinte garderait
        // sinon la signature qu'on vient de juger indue. C'est le cas que
        // l'ancien code ne pouvait pas produire — il ajoutait toujours — et
        // celui qui apparaît dès que l'ajout devient conditionnel.
        //
        // Une note de l'ancien commentaire disparaît avec lui parce qu'elle
        // était FAUSSE : elle promettait que le composer « skips drag » pour un
        // objet verrouillé. Aucun geste ne consulte le verrou — ni `handlePan`,
        // ni la manipulation — et c'est très bien : la directive demande
        // justement que la pastille se déplace. Le verrou interdit ce qui la
        // RETIRE ou la DÉNATURE (édition, duplication, suppression, sortie de
        // scène), jamais ce qui la déplace.
        var effects = cloned.effects
        var texts = StoryRepostCredit.stripped(from: effects.textObjects)
        if let badge = StoryRepostCredit.badge(for: story, authorHandle: authorHandle) {
            texts.append(badge)
        }
        effects.textObjects = texts
        cloned.effects = effects

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
