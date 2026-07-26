import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Le préchargement média du repost rangeait ses bitmaps sous
/// `slideImages[url.absoluteString]`. Or :
///
///   - `slideImages` est la map des FONDS de slide, lue par `slideImages[slide.id]`
///     (`StoryComposerView+SyncRestore`, `+Publication`) ;
///   - le canvas d'édition, lui, lit `loadedImages` keyé par `StoryMediaObject.id`.
///
/// Aucun lecteur n'interrogeait donc jamais une clé-URL : le préchargement
/// était intégralement perdu, et le canvas repartait à zéro au montage.
///
/// Pire : `persistPublishIntentToQueue` re-clé TOUT `slideImages` en
/// `"slide-bg-<clé>"`. Ces entrées parasites partaient en file hors-ligne
/// comme faux fonds de slide — des fichiers écrits sur disque et des
/// références média qu'aucune slide ne réclamerait jamais.
@MainActor
final class RepostMediaPreloadTests: XCTestCase {

    // MARK: - Fixtures

    private func media(id: String, url: String) -> FeedMedia {
        FeedMedia(id: id, type: .image, url: url)
    }

    private func storyItem(media: [FeedMedia], effects: StoryEffects) -> StoryItem {
        StoryItem(id: "src-1", content: nil, media: media, storyEffects: effects,
                  createdAt: Date(), expiresAt: nil,
                  repostOfId: nil, originalRepostOfId: nil,
                  visibility: "PUBLIC", isViewed: false)
    }

    private func mediaObject(id: String, postMediaId: String) -> StoryMediaObject {
        var m = StoryMediaObject(id: id, postMediaId: postMediaId, kind: .image, aspectRatio: 1)
        m.isBackground = false
        return m
    }

    // MARK: - Le défaut : la clé de rangement

    func test_preloadTargets_areKeyedByCanvasObjectId_notByURL() {
        var effects = StoryEffects()
        effects.mediaObjects = [mediaObject(id: "obj-1", postMediaId: "pm-1"),
                                mediaObject(id: "obj-2", postMediaId: "pm-2")]
        let story = storyItem(media: [media(id: "pm-1", url: "https://cdn.test/a.jpg"),
                                      media(id: "pm-2", url: "https://cdn.test/b.jpg")],
                              effects: effects)

        let targets = RepostMediaPreload.targets(for: story, slideId: "slide-9")
        let canvas = targets.filter { $0.destination == .canvasObject }

        XCTAssertEqual(Set(canvas.map(\.storageKey)), ["obj-1", "obj-2"],
                       "Les bitmaps de premier plan doivent être rangés sous l'id de l'OBJET canvas — c'est la seule clé que le pont image du composer interroge.")
        // Le fond de slide est une cible LÉGITIME et distincte : il vise
        // `slideImages[slide.id]`, que le composer relit vraiment.
        XCTAssertEqual(targets.filter { $0.destination == .slideBackground }.map(\.storageKey),
                       ["slide-9"])
    }

    /// Le FOND, lui, va bien dans `slideImages` — mais sous l'id de la SLIDE,
    /// la clé que `slideImages[slide.id]` interroge.
    func test_backgroundTarget_isKeyedBySlideId() {
        let effects = StoryEffects(background: nil)
        let story = storyItem(media: [media(id: "pm-bg", url: "https://cdn.test/bg.jpg")],
                              effects: effects)

        let targets = RepostMediaPreload.targets(for: story, slideId: "slide-9")

        XCTAssertEqual(targets.map(\.storageKey), ["slide-9"])
        XCTAssertEqual(targets.map(\.destination), [.slideBackground])
    }

    func test_noTargetIsEverKeyedByAURL() {
        var effects = StoryEffects()
        effects.mediaObjects = [mediaObject(id: "obj-1", postMediaId: "pm-1")]
        let story = storyItem(media: [media(id: "pm-1", url: "https://cdn.test/a.jpg")],
                              effects: effects)

        for target in RepostMediaPreload.targets(for: story, slideId: "slide-9") {
            XCTAssertFalse(target.storageKey.contains("://"),
                           "Une clé-URL pollue slideImages et repart en file hors-ligne comme faux fond : « \(target.storageKey) »")
        }
    }

    // MARK: - Appariement objet ↔ média distant

    func test_objectWithoutAMatchingRemoteMedia_isSkipped() {
        var effects = StoryEffects()
        effects.mediaObjects = [mediaObject(id: "obj-1", postMediaId: "absent")]
        let story = storyItem(media: [media(id: "pm-1", url: "https://cdn.test/a.jpg")],
                              effects: effects)

        let canvasTargets = RepostMediaPreload.targets(for: story, slideId: "s")
            .filter { $0.destination == .canvasObject }
        XCTAssertTrue(canvasTargets.isEmpty,
                      "Sans URL distante, rien à précharger — mieux vaut aucune entrée qu'une clé morte.")
    }

    func test_mediaWithoutAURL_isSkipped() {
        var effects = StoryEffects()
        effects.mediaObjects = [mediaObject(id: "obj-1", postMediaId: "pm-1")]
        let story = storyItem(media: [FeedMedia(id: "pm-1", type: .image, url: nil)],
                              effects: effects)
        XCTAssertTrue(RepostMediaPreload.targets(for: story, slideId: "s").isEmpty)
    }

    func test_emptyStory_hasNothingToPreload() {
        let story = storyItem(media: [], effects: StoryEffects())
        XCTAssertTrue(RepostMediaPreload.targets(for: story, slideId: "s").isEmpty)
    }

    // MARK: - Déterminisme et unicité

    func test_targetsAreStableAcrossCalls() {
        var effects = StoryEffects()
        effects.mediaObjects = [mediaObject(id: "obj-2", postMediaId: "pm-2"),
                                mediaObject(id: "obj-1", postMediaId: "pm-1")]
        let story = storyItem(media: [media(id: "pm-1", url: "https://cdn.test/a.jpg"),
                                      media(id: "pm-2", url: "https://cdn.test/b.jpg")],
                              effects: effects)

        XCTAssertEqual(RepostMediaPreload.targets(for: story, slideId: "s").map(\.storageKey),
                       RepostMediaPreload.targets(for: story, slideId: "s").map(\.storageKey))
    }

    /// Deux objets canvas peuvent pointer le MÊME média distant (dupliqué sur
    /// le canvas) : chacun doit recevoir son propre bitmap sous SA clé.
    func test_twoObjectsSharingOneRemoteMedia_bothGetATarget() {
        var effects = StoryEffects()
        effects.mediaObjects = [mediaObject(id: "obj-1", postMediaId: "pm-1"),
                                mediaObject(id: "obj-2", postMediaId: "pm-1")]
        let story = storyItem(media: [media(id: "pm-1", url: "https://cdn.test/a.jpg")],
                              effects: effects)

        let keys = RepostMediaPreload.targets(for: story, slideId: "s")
            .filter { $0.destination == .canvasObject }.map(\.storageKey)
        XCTAssertEqual(Set(keys), ["obj-1", "obj-2"])
    }
}
