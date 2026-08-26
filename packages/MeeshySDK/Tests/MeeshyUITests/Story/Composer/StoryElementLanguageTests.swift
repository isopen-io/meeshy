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

    // L'UI : un objet non-texte sélectionné SUPPORTE le contrôle de langue ;
    // rien de sélectionné ⇒ pas de barre (loi 4).
    func test_selectionNonTexte_supporteLeControleDeLangue() {
        let vm = StoryComposerViewModel()
        var fx = StoryEffects()
        let sticker = StorySticker(emoji: "🎉", sourceLanguage: "en")
        fx.stickerObjects = [sticker]
        vm.currentEffects = fx

        XCTAssertFalse(vm.selectedElementSupportsLanguage,
                       "Sans sélection, aucune barre de langue d'élément.")

        vm.selectedElementId = sticker.id
        XCTAssertTrue(vm.selectedElementSupportsLanguage,
                      "Un sticker sélectionné supporte le contrôle de langue.")
        XCTAssertEqual(vm.selectedElementSourceLanguage, "en",
                       "…et le contrôle lit la langue courante de l'élément.")
    }

    // Le TEXTE n'ouvre PAS cette barre — il a sa propre pastille dans l'éditeur
    // inline (pas deux contrôles pour la même chose).
    func test_selectionTexte_nOuvrePasLaBarreDElement() {
        let vm = StoryComposerViewModel()
        var fx = StoryEffects()
        let text = StoryTextObject(id: "t1", text: "Bonjour", sourceLanguage: "fr")
        fx.textObjects = [text]
        vm.currentEffects = fx
        vm.selectedElementId = "t1"

        XCTAssertFalse(vm.selectedElementSupportsLanguage,
                       "Le texte garde sa pastille d'éditeur — la barre d'élément ne double pas.")
    }

    // GARDE SOURCE : la barre est montée dans le canvas, et écrit par le point
    // d'entrée UNIQUE `updateElementLanguage`, avec les MÊMES choix que le texte.
    func test_gardeSource_laBarreEstCablee_etReutiliseLesChoix() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()   // MeeshySDK
        func src(_ rel: String) throws -> String {
            try String(contentsOf: root.appendingPathComponent(rel), encoding: .utf8)
        }
        let canvas = try src("Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift")
        XCTAssertTrue(canvas.contains("StoryElementLanguageBar(viewModel: viewModel)"),
                      "La barre doit être montée dans le canvas, comme le toolbar texte.")
        let bar = try src("Sources/MeeshyUI/Story/StoryElementLanguageBar.swift")
        XCTAssertTrue(bar.contains("viewModel.updateElementLanguage(elementId: elementId, language: code)"),
                      "La barre écrit par le point d'entrée UNIQUE `updateElementLanguage`.")
        XCTAssertTrue(bar.contains("TextEditToolOptions.languageChoices(current: current)"),
                      "…et réutilise les MÊMES choix de langue que le texte, jamais une liste recopiée.")
    }
}
