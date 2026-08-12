import XCTest
@testable import MeeshySDK

/// Langues disponibles pour le CONTENU TEXTUEL d'une story.
///
/// Le viewer proposait jusqu'ici uniquement les langues de la LÉGENDE du post
/// (`StoryItem.translations`). Or le texte d'une story vit presque toujours sur
/// le canvas, dans les `StoryTextObject` — chacun portant sa propre
/// `sourceLanguage` et son propre dictionnaire `translations`. Une story
/// composée de texte sans légende n'offrait donc AUCUNE langue à explorer.
final class StoryTextLanguageAvailabilityTests: XCTestCase {

    // MARK: - Factories

    private func makeText(_ id: String,
                          text: String = "Bonjour",
                          source: String? = nil,
                          translations: [String: String]? = nil) -> StoryTextObject {
        StoryTextObject(id: id, text: text, translations: translations, sourceLanguage: source)
    }

    // MARK: - Absence de contenu

    func test_availableLanguages_nilEverything_returnsEmpty() {
        XCTAssertEqual(
            StoryTextLanguageAvailability.availableLanguages(
                effects: nil, postTranslations: nil),
            [])
    }

    /// Un texte sans `sourceLanguage` ni traduction n'apporte aucune langue :
    /// on ne sait pas dans quelle langue il est écrit.
    func test_availableLanguages_textWithoutLanguageInfo_returnsEmpty() {
        let effects = StoryEffects(textObjects: [makeText("t1")])
        XCTAssertEqual(
            StoryTextLanguageAvailability.availableLanguages(
                effects: effects, postTranslations: nil),
            [])
    }

    /// Un texte VIDE ne compte pas, même s'il porte une langue source — il n'y
    /// a rien à lire dans cette langue.
    func test_availableLanguages_emptyTextObject_isIgnored() {
        let effects = StoryEffects(textObjects: [
            makeText("t1", text: "   ", source: "en", translations: ["fr": "Salut"])
        ])
        XCTAssertEqual(
            StoryTextLanguageAvailability.availableLanguages(
                effects: effects, postTranslations: nil),
            [])
    }

    // MARK: - Textes du canvas

    func test_availableLanguages_canvasText_includesSourceAndTranslations() {
        let effects = StoryEffects(textObjects: [
            makeText("t1", source: "en", translations: ["fr": "Salut", "es": "Hola"])
        ])
        XCTAssertEqual(
            StoryTextLanguageAvailability.availableLanguages(
                effects: effects, postTranslations: nil),
            ["en", "es", "fr"])
    }

    /// Union sur TOUS les textes : sélectionner une langue couverte par un seul
    /// objet reste utile — les autres retombent sur leur original (règle n°1 du
    /// Prisme).
    func test_availableLanguages_multipleTexts_unionsLanguages() {
        let effects = StoryEffects(textObjects: [
            makeText("t1", source: "fr", translations: ["en": "Hello"]),
            makeText("t2", text: "Deux", source: "fr", translations: ["de": "Zwei"])
        ])
        XCTAssertEqual(
            StoryTextLanguageAvailability.availableLanguages(
                effects: effects, postTranslations: nil),
            ["de", "en", "fr"])
    }

    // MARK: - Légende du post (non-régression)

    func test_availableLanguages_postTranslations_stillCounted() {
        XCTAssertEqual(
            StoryTextLanguageAvailability.availableLanguages(
                effects: nil,
                postTranslations: [StoryTranslation(language: "it", content: "Ciao")]),
            ["it"])
    }

    func test_availableLanguages_mixesCanvasAndCaption() {
        let effects = StoryEffects(textObjects: [makeText("t1", source: "en")])
        XCTAssertEqual(
            StoryTextLanguageAvailability.availableLanguages(
                effects: effects,
                postTranslations: [StoryTranslation(language: "ja", content: "こんにちは")]),
            ["en", "ja"])
    }

    // MARK: - Normalisation

    /// `fr-FR`, `FR` et `fr` désignent le même drapeau : une seule entrée.
    func test_availableLanguages_normalisesRegionAndCase() {
        let effects = StoryEffects(textObjects: [
            makeText("t1", source: "fr-FR", translations: ["EN": "Hello"]),
            makeText("t2", text: "Deux", source: "fr", translations: ["en-GB": "Two"])
        ])
        XCTAssertEqual(
            StoryTextLanguageAvailability.availableLanguages(
                effects: effects, postTranslations: nil),
            ["en", "fr"])
    }

    /// Une chaine vide n'est pas un code de langue.
    func test_availableLanguages_blankCodes_areDropped() {
        let effects = StoryEffects(textObjects: [
            makeText("t1", source: "  ", translations: ["": "vide", "fr": "Salut"])
        ])
        XCTAssertEqual(
            StoryTextLanguageAvailability.availableLanguages(
                effects: effects, postTranslations: nil),
            ["fr"])
    }

    // MARK: - Présence de texte traduisible

    func test_hasTranslatableText_canvasTextOnly_returnsTrue() {
        let effects = StoryEffects(textObjects: [makeText("t1")])
        XCTAssertTrue(StoryTextLanguageAvailability.hasTranslatableText(effects: effects, content: nil))
    }

    func test_hasTranslatableText_captionOnly_returnsTrue() {
        XCTAssertTrue(StoryTextLanguageAvailability.hasTranslatableText(effects: nil, content: "Légende"))
    }

    func test_hasTranslatableText_blankEverywhere_returnsFalse() {
        let effects = StoryEffects(textObjects: [makeText("t1", text: "  ")])
        XCTAssertFalse(StoryTextLanguageAvailability.hasTranslatableText(effects: effects, content: "   "))
    }

    func test_hasTranslatableText_noTextAtAll_returnsFalse() {
        XCTAssertFalse(StoryTextLanguageAvailability.hasTranslatableText(effects: StoryEffects(), content: nil))
    }
}
