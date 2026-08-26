import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **E1 (#3886) — la langue DÉCLARÉE au bas du composer est le défaut de TOUT
/// objet posé sur la scène, et du contenu du réel/story.**
///
/// Avant, chaque objet naissait en « fr » codé en dur (`defaultSourceLanguage`).
/// La capsule du composer sème désormais `declaredContentLanguage`, et c'est
/// elle que tout `MeeshyObject` créé prend par défaut — l'auteur pouvant la
/// surcharger par objet (E3). Le contenu du réel/story part dans cette même
/// langue.
@MainActor
final class StoryComposerDeclaredLanguageTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Composer
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }

    // 1 — le repli reste « fr » (aucun hôte n'a semé) ; le défaut STATIQUE
    // historique est intact.
    func test_leRepli_resteFr() {
        XCTAssertEqual(StoryComposerViewModel().declaredContentLanguage, "fr",
                       "Sans hôte, la langue déclarée retombe sur le repli historique.")
        XCTAssertEqual(StoryComposerViewModel.defaultSourceLanguage, "fr",
                       "Le défaut statique de repli n'a pas bougé.")
    }

    // 2 — un objet posé DÉFAUTE à la langue déclarée, pas à « fr ».
    func test_unObjetPose_defauteALaLangueDeclaree() {
        let vm = StoryComposerViewModel()
        vm.declaredContentLanguage = "es"

        _ = vm.addText()

        XCTAssertEqual(vm.currentEffects.textObjects.last?.sourceLanguage, "es",
                       "Un texte posé prend la langue DÉCLARÉE au composer, jamais « fr » codé en dur.")
    }

    // 3 — un SECOND objet, dans une autre langue déclarée, prend la nouvelle
    // valeur (la capsule est bien la source vivante du défaut).
    func test_laLangueDeclaree_estLaSourceVivanteDuDefaut() {
        let vm = StoryComposerViewModel()
        vm.declaredContentLanguage = "de"
        _ = vm.addText()
        vm.declaredContentLanguage = "it"
        _ = vm.addText()

        let langs = vm.currentEffects.textObjects.map(\.sourceLanguage)
        XCTAssertTrue(langs.contains("de") && langs.contains("it"),
                      "Chaque objet naît avec la langue déclarée AU MOMENT de sa pose.")
    }

    // 4 — le contenu du réel/story part dans la langue déclarée : `storyLanguage`
    // est SEMÉ depuis `declaredContentLanguage` à la construction de la vue.
    func test_leContenuDeStory_estSemeDepuisLaLangueDeclaree() throws {
        let src = try sdkSource("Sources/MeeshyUI/Story/StoryComposerView.swift")
        XCTAssertTrue(
            src.contains("State(initialValue: viewModel.declaredContentLanguage)"),
            "Le contenu du réel/story (`storyLanguage`) est semé depuis `declaredContentLanguage` — "
                + "la langue DÉCLARÉE, jamais « fr » codé en dur."
        )
    }
}
