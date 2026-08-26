import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **E3 (#3888) — chaque élément posé sur la scène déclare sa langue d'origine.**
/// Le champ existait sur texte/média/audio ; il couvre désormais sticker et
/// lieu. Défaut : la langue DÉCLARÉE au composer (`declaredContentLanguage`,
/// E1) ; surchargeable par élément via `updateElementLanguage`.
@MainActor
final class StoryElementLanguageTests: XCTestCase {

    func test_stickerEtLieu_defautentALaLangueDeclaree() {
        let vm = StoryComposerViewModel()
        vm.declaredContentLanguage = "es"

        let sticker = vm.addSticker(emoji: "🎉")
        let loc = vm.addLocation(place: SharedPlace(latitude: 0, longitude: 0, name: "x"))

        XCTAssertEqual(sticker.sourceLanguage, "es",
                       "Un sticker posé prend la langue déclarée, comme texte/média/audio.")
        XCTAssertEqual(loc.sourceLanguage, "es",
                       "Une pastille de lieu posée prend la langue déclarée.")
    }

    func test_updateElementLanguage_couvreStickerEtLieu() {
        let vm = StoryComposerViewModel()
        var fx = StoryEffects()
        fx.stickerObjects = [StorySticker(emoji: "🎉", sourceLanguage: "en")]
        fx.locationObjects = [StoryLocationObject(
            place: SharedPlace(latitude: 0, longitude: 0), sourceLanguage: "en")]
        vm.currentEffects = fx
        let stickerId = fx.stickerObjects![0].id
        let locId = fx.locationObjects[0].id

        vm.updateElementLanguage(elementId: stickerId, language: "it")
        vm.updateElementLanguage(elementId: locId, language: "pt")

        XCTAssertEqual(vm.currentEffects.stickerObjects?.first?.sourceLanguage, "it",
                       "Le choix de l'auteur prime sur le sticker.")
        XCTAssertEqual(vm.currentEffects.locationObjects.first?.sourceLanguage, "pt",
                       "…et sur la pastille de lieu.")
    }
}
