import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// L'auteur choisit la langue de son texte À CÔTÉ des autres réglages de
/// texte, avant de valider (directive user 2026-07-25).
///
/// Une langue source fausse ne se voit pas à l'écriture : le texte s'affiche
/// normalement. Elle se paie à la traduction — le moteur part de la mauvaise
/// langue, et le texte ressort inchangé ou incompréhensible. D'où un choix
/// explicite plutôt qu'une déduction silencieuse.
@MainActor
final class StoryTextLanguageChoiceTests: XCTestCase {

    private func user(system: String?, regional: String? = nil) -> MeeshyUser {
        MeeshyUser(id: "u-test", username: "test",
                   systemLanguage: system, regionalLanguage: regional)
    }

    // MARK: - Langue proposée par défaut

    /// Le clavier PRINCIPAL de l'auteur est un bien meilleur indice de la
    /// langue d'écriture que sa langue de LECTURE : un francophone qui a réglé
    /// l'app en anglais écrit toujours en français.
    func test_suggestedLanguage_prefersTheKeyboardOverTheReadingPreference() {
        XCTAssertEqual(
            StoryComposerViewModel.resolveComposerSourceLanguage(
                user: user(system: "en", regional: "en"), keyboardLanguage: "fr-FR"),
            "fr")
    }

    /// Le clavier emoji annonce `emoji` comme langue primaire, la dictée
    /// `dictation` : les prendre au mot produirait une story dont la langue
    /// source est « emoji » — intraduisible et absente du sélecteur.
    func test_suggestedLanguage_ignoresNonLanguageInputModes() {
        XCTAssertEqual(StoryComposerViewModel.resolveComposerSourceLanguage(
            user: user(system: "es"), keyboardLanguage: "emoji"), "es")
        XCTAssertEqual(StoryComposerViewModel.resolveComposerSourceLanguage(
            user: user(system: "de"), keyboardLanguage: "dictation"), "de")
    }

    func test_suggestedLanguage_normalisesRegionalKeyboardCodes() {
        XCTAssertEqual(StoryComposerViewModel.resolveComposerSourceLanguage(
            user: user(system: "fr"), keyboardLanguage: "pt-BR"), "pt")
    }

    func test_suggestedLanguage_withoutKeyboard_keepsThePreferenceChain() {
        XCTAssertEqual(StoryComposerViewModel.resolveComposerSourceLanguage(
            user: user(system: "en", regional: "fr"), keyboardLanguage: nil), "en")
        XCTAssertEqual(StoryComposerViewModel.resolveComposerSourceLanguage(
            user: user(system: nil, regional: "fr"), keyboardLanguage: nil), "fr")
        XCTAssertEqual(StoryComposerViewModel.resolveComposerSourceLanguage(
            user: nil, keyboardLanguage: nil), "fr")
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
