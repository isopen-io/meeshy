import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// #13864 (R4) — **les cinq familles posées sur une même scène se servent la
/// même barre** : Modifier · Dupliquer · Temps · Retirer ; toucher l'une la
/// fait passer devant les autres, la pastille de son comprise (#13918) — les
/// mêmes mots et la même règle qu'Android (`ComposerSelectionActionBar`).
@MainActor
final class ComposerSceneObjectFamiliesTests: XCTestCase {

    private func scene() -> StorySlide {
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(id: "texte", text: "Salut", x: 0.5, y: 0.2, zIndex: 1)]
        var image = StoryMediaObject(id: "image", kind: .image, aspectRatio: 1)
        image.zIndex = 2
        effects.mediaObjects = [image]
        effects.stickerObjects = [StorySticker(id: "sticker", emoji: "🔥", zIndex: 3)]
        var son = StoryAudioPlayerObject(id: "son", x: 0.5, y: 0.8)
        son.zIndex = 4
        effects.audioPlayerObjects = [son]
        var slide = StorySlide(id: "s", effects: effects, duration: 6, order: 0)
        slide.locationObjects = [StoryLocationObject(id: "lieu",
                                                     place: SharedPlace(latitude: 48.85, longitude: 2.35,
                                                                        name: "Paris"),
                                                     x: 0.5, y: 0.6)]
        return slide
    }

    private func barre(_ id: String, _ famille: ComposerInlineFamily, in slide: StorySlide)
        -> (actions: [ComposerSelectionAction], extras: [ComposerSelectionMediaExtra]) {
        let objet = slide.sceneObject(id: id)
        let offertes = ComposerTrailingRailPolicy.actions(
            slide: slide, selectedId: id, served: ComposerTrailingColumn.servedActions,
            hasEditor: objet.map {
                ComposerSceneSurface.defaultEditableSceneKinds.contains(MeeshyComposerHost.canvasKind($0.kind))
            } ?? false,
            canLeaveScene: false)
        return (ComposerSelectionActions.served(family: famille, offered: offertes, isLocked: false),
                ComposerSelectionActions.mediaExtras(family: famille, offered: offertes,
                                                     cameraTakesPhotos: false, subjectLiftAvailable: false))
    }

    func test_everyFamilyOnASharedScene_servesTheFourActions() {
        let slide = scene()
        let familles: [(String, ComposerInlineFamily)] =
            [("texte", .text), ("image", .image), ("sticker", .sticker), ("lieu", .place), ("son", .audio)]

        for (id, famille) in familles {
            XCTAssertEqual(barre(id, famille, in: slide).actions,
                           [.modify, .duplicate, .time, .remove], "famille \(famille)")
        }
    }

    func test_onlyAPlacedMedia_becomesTheBackground() {
        let slide = scene()
        XCTAssertEqual(barre("image", .image, in: slide).extras, [.setAsBackground])
        XCTAssertEqual(barre("son", .audio, in: slide).extras, [], "seul un média devient le fond")
        XCTAssertEqual(barre("sticker", .sticker, in: slide).extras, [])
    }

    /// Toucher la pastille de son la fait passer devant le sticker — la même
    /// règle que les quatre autres familles.
    func test_touchingTheSoundChip_bringsItInFrontOfTheOtherFamilies() throws {
        let stickerDevant = try XCTUnwrap(scene().effects.broughtToFront("sticker"))
        let devant = try XCTUnwrap(stickerDevant.broughtToFront("son"))
        XCTAssertEqual(devant.sceneObjects.filter { !$0.isBackground }.last?.id, "son")
    }
}
