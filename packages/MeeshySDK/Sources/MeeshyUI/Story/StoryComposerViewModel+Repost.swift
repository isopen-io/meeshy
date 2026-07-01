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
    /// appends a non-editable "locked" badge sticker at the bottom-center of the canvas,
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

        // Locked badge sticker — non-editable text rendered at bottom-center.
        // The composer (StoryTextObject `isLocked == true`, see Patch B.3) skips
        // drag/edit/delete for this object so reposters cannot strip the attribution.
        // Direct interpolation : the Localizable.xcstrings catalog does not yet have
        // a `story.repost.badge` key with a `%@` placeholder, and `String(localized:)`
        // requires a StaticString literal (not a runtime-interpolated key). When the
        // catalog grows a proper entry, switch to `String(format: NSLocalizedString(...))`.
        let badgeText = "Reposté de @\(authorHandle)"
        let badge = StoryTextObject(
            id: UUID().uuidString,
            text: badgeText,
            x: 0.5, y: 0.92,
            scale: 1.0, rotation: 0,
            fontSize: 14,
            textStyle: "bold",
            textColor: "FFFFFF",
            textAlign: "center",
            textBg: "6366F1",
            isLocked: true
        )
        var effects = cloned.effects
        // Strip toute attribution verrouillée héritée de la source avant d'ajouter
        // la nôtre : reposter un repost empilerait sinon deux badges locked qui se
        // chevauchent au même point (x:0.5, y:0.92). Les text objects locked sont
        // EXCLUSIVEMENT des badges d'attribution (ce site est l'unique producteur de
        // `isLocked: true`), donc ce filtre ne touche jamais le texte éditable de
        // l'auteur. Le nouveau badge attribue à la source immédiate (`authorHandle`) ;
        // la racine reste tracée via `originalRepostOfId`.
        var texts = effects.textObjects.filter { $0.isLocked != true }
        texts.append(badge)
        effects.textObjects = texts
        cloned.effects = effects

        self.slides = [cloned]
        self.currentSlideIndex = 0

        // Preload images via CacheCoordinator (3-tier cache, cancellable).
        // FeedMedia.url is `String?` and MeeshyConfig.resolveMediaURL returns `URL?` with
        // SSRF validation — both guards stay so we never hand a tainted URL to the cache.
        let mediaList = story.media
        preloadTask = Task { [weak self] in
            await withTaskGroup(of: (String, UIImage?).self) { group in
                for media in mediaList {
                    guard let urlString = media.url,
                          let url = MeeshyConfig.resolveMediaURL(urlString) else { continue }
                    let key = url.absoluteString
                    group.addTask {
                        let image = await CacheCoordinator.shared.images.image(for: key)
                        return (key, image)
                    }
                }
                for await (key, image) in group {
                    guard !Task.isCancelled, let self, let image else { continue }
                    self.slideImages[key] = image
                }
            }
        }
    }
}
