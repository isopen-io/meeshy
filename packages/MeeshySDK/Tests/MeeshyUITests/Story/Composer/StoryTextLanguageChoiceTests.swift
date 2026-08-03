import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// L'auteur choisit la langue de son texte À CÔTÉ des autres réglages de
/// texte, avant de valider (directive user 2026-07-25).
///
/// Une langue source fausse ne se voit pas à l'écriture : le texte s'affiche
/// normalement. Elle se paie à la traduction — le moteur part de la mauvaise
/// langue, et le texte ressort inchangé ou incompréhensible. D'où un choix
/// explicite plutôt qu'une déduction silencieuse. Depuis la directive
/// 2026-07-30 le défaut n'est plus deviné du tout : tout texte démarre en
/// français (`StoryComposerViewModel.defaultSourceLanguage`) et seule la
/// pastille langue le change.
@MainActor
final class StoryTextLanguageChoiceTests: XCTestCase {

    // MARK: - Normalisation des codes de langue (pivot Voice)

    /// `normalisedWritingLanguage` reste le pivot de déduplication des
    /// transcriptions Voice : deux transcriptions `pt-BR` et `pt` doivent se
    /// fusionner sous la même clé.
    func test_normalisedWritingLanguage_reducesRegionalCodes() {
        XCTAssertEqual(
            StoryComposerViewModel.normalisedWritingLanguage("pt-BR"), "pt")
        XCTAssertEqual(
            StoryComposerViewModel.normalisedWritingLanguage("fr-FR"), "fr")
    }

    /// Le clavier emoji annonce `emoji` comme langue primaire, la dictée
    /// `dictation` : les prendre au mot produirait une clé de langue
    /// « emoji » — intraduisible et absente du sélecteur.
    func test_normalisedWritingLanguage_rejectsNonLanguageInputModes() {
        XCTAssertNil(StoryComposerViewModel.normalisedWritingLanguage("emoji"))
        XCTAssertNil(StoryComposerViewModel.normalisedWritingLanguage("dictation"))
        XCTAssertNil(StoryComposerViewModel.normalisedWritingLanguage("  "))
        XCTAssertNil(StoryComposerViewModel.normalisedWritingLanguage(nil))
    }

    // MARK: - Choix explicite de l'auteur

    func test_updateElementLanguage_stampsTheChosenLanguageOnTheText() {
        let vm = StoryComposerViewModel()
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(id: "t1", text: "Bonjour", sourceLanguage: "en")]
        vm.currentEffects = effects

        vm.updateElementLanguage(elementId: "t1", language: "fr")

        XCTAssertEqual(vm.currentEffects.textObjects.first?.sourceLanguage, "fr",
                       "le choix de l'auteur doit primer sur la valeur devinée")
    }

    /// Le choix ne doit toucher QUE l'élément visé — les autres textes de la
    /// story gardent leur propre langue.
    func test_updateElementLanguage_leavesSiblingsUntouched() {
        let vm = StoryComposerViewModel()
        var effects = StoryEffects()
        effects.textObjects = [
            StoryTextObject(id: "t1", text: "Bonjour", sourceLanguage: "fr"),
            StoryTextObject(id: "t2", text: "Hello", sourceLanguage: "en")
        ]
        vm.currentEffects = effects

        vm.updateElementLanguage(elementId: "t2", language: "es")

        XCTAssertEqual(vm.currentEffects.textObjects.first(where: { $0.id == "t1" })?.sourceLanguage, "fr")
        XCTAssertEqual(vm.currentEffects.textObjects.first(where: { $0.id == "t2" })?.sourceLanguage, "es")
    }

    // MARK: - Le contrôle est offert à l'auteur

    /// Sans entrée dans la barre d'outils, `updateElementLanguage` restait du
    /// code mort — c'était précisément le cas avant cette correction.
    func test_languageIsOfferedAmongTheTextEditingTools() {
        XCTAssertTrue(TextEditTool.allCases.contains(.language),
                      "la langue doit être réglable à côté des autres attributs de texte")
    }
}
