import XCTest
@testable import MeeshySDK

/// Textes lus à voix haute pour construire un profil vocal.
///
/// Un profil sert à re-synthétiser la voix de quelqu'un : il lui faut la
/// PROSODIE, pas seulement le timbre. Une phrase déclarative isolée n'en donne
/// qu'une facette — il manque la montée d'une question, l'amplitude d'une
/// exclamation, les pauses d'une énumération. Ces tests encodent ces exigences
/// pour qu'un ajout futur ne puisse pas les perdre en silence.
final class VoiceProfilePromptsTests: XCTestCase {

    /// Terminateurs de phrase des scripts couverts. `؟` est le point
    /// d'interrogation arabe ; les `¿` / `¡` espagnols sont des OUVRANTS et ne
    /// terminent rien.
    private let terminators: Set<Character> = [".", "!", "?", "؟"]

    private func sentenceCount(_ text: String) -> Int {
        text.filter { terminators.contains($0) }.count
    }

    private func wordCount(_ text: String) -> Int {
        text.split(whereSeparator: { $0.isWhitespace }).count
    }

    // MARK: - Couverture des langues

    func test_coversEveryInterfaceLanguageOfTheApp() {
        XCTAssertEqual(
            Set(VoiceProfilePrompts.supportedLanguageCodes),
            Set(LanguageData.interfaceLanguageCodes)
        )
    }

    /// « Autant de phrases que la version française » : un utilisateur ne doit
    /// pas avoir moins de variété parce qu'il parle une autre langue.
    func test_everyLanguageHasAsManyPromptsAsFrench() {
        let reference = VoiceProfilePrompts.prompts(for: "fr").count
        XCTAssertGreaterThanOrEqual(reference, 5)

        for code in VoiceProfilePrompts.supportedLanguageCodes {
            XCTAssertEqual(
                VoiceProfilePrompts.prompts(for: code).count,
                reference,
                "\(code) n'a pas le même nombre de textes que le français"
            )
        }
    }

    // MARK: - Assez de matière pour dix secondes

    /// La vue REJETTE tout échantillon sous `minimumDurationSeconds` (10 s).
    /// Un texte trop court force l'utilisateur à meubler ou à échouer.
    func test_everyPromptIsLongEnoughToFillTheMinimumDuration() {
        for code in VoiceProfilePrompts.supportedLanguageCodes {
            for prompt in VoiceProfilePrompts.prompts(for: code) {
                XCTAssertGreaterThanOrEqual(
                    wordCount(prompt.text), 15,
                    "\(code) : texte trop court pour tenir dix secondes — « \(prompt.text) »"
                )
            }
        }
    }

    func test_everyPromptHasAtLeastTwoSentences() {
        for code in VoiceProfilePrompts.supportedLanguageCodes {
            for prompt in VoiceProfilePrompts.prompts(for: code) {
                XCTAssertGreaterThanOrEqual(
                    sentenceCount(prompt.text), 2,
                    "\(code) : une seule phrase ne porte qu'une seule intonation — « \(prompt.text) »"
                )
            }
        }
    }

    func test_noPromptIsAWallOfText() {
        // Au-delà, la lecture devient un exercice de souffle et la prosodie se
        // dégrade — l'inverse de ce qu'on cherche à capturer.
        for code in VoiceProfilePrompts.supportedLanguageCodes {
            for prompt in VoiceProfilePrompts.prompts(for: code) {
                XCTAssertLessThanOrEqual(
                    sentenceCount(prompt.text), 4,
                    "\(code) : trop de phrases — « \(prompt.text) »"
                )
            }
        }
    }

    // MARK: - Variété prosodique

    /// Le cœur de la demande : capter les bonnes intonations. Sans question,
    /// aucun contour montant n'est jamais enregistré.
    func test_everyLanguageAsksAtLeastOneQuestion() {
        for code in VoiceProfilePrompts.supportedLanguageCodes {
            let hasQuestion = VoiceProfilePrompts.prompts(for: code)
                .contains { $0.text.contains("?") || $0.text.contains("؟") }
            XCTAssertTrue(hasQuestion, "\(code) : aucun contour interrogatif à lire")
        }
    }

    /// Sans exclamation, l'amplitude enregistrée reste celle d'une voix plate.
    func test_everyLanguageHasAtLeastOneExclamation() {
        for code in VoiceProfilePrompts.supportedLanguageCodes {
            let hasExclamation = VoiceProfilePrompts.prompts(for: code)
                .contains { $0.text.contains("!") }
            XCTAssertTrue(hasExclamation, "\(code) : aucune exclamation à lire")
        }
    }

    /// Les pauses d'une énumération sont une prosodie à part entière.
    func test_everyLanguageHasAtLeastOneEnumeration() {
        for code in VoiceProfilePrompts.supportedLanguageCodes {
            let hasList = VoiceProfilePrompts.prompts(for: code)
                .contains { $0.text.contains(":") || $0.text.contains("：") }
            XCTAssertTrue(hasList, "\(code) : aucune énumération à lire")
        }
    }

    func test_promptsWithinALanguageAreAllDistinct() {
        for code in VoiceProfilePrompts.supportedLanguageCodes {
            let texts = VoiceProfilePrompts.prompts(for: code).map(\.text)
            XCTAssertEqual(Set(texts).count, texts.count, "\(code) : textes dupliqués")
        }
    }

    // MARK: - Résolution de la langue

    func test_localeIdentifierIsNormalized() {
        // iOS fournit `Locale.current.identifier`, donc `fr_FR`.
        XCTAssertEqual(
            VoiceProfilePrompts.prompts(for: "fr_FR").map(\.text),
            VoiceProfilePrompts.prompts(for: "fr").map(\.text)
        )
        XCTAssertEqual(
            VoiceProfilePrompts.prompts(for: "pt-BR").map(\.text),
            VoiceProfilePrompts.prompts(for: "pt").map(\.text)
        )
    }

    func test_unsupportedLanguageFallsBackToEnglish() {
        // Ni le japonais ni le français ne seraient lisibles ; l'anglais est la
        // langue véhiculaire la plus probable.
        XCTAssertEqual(
            VoiceProfilePrompts.prompts(for: "ja").map(\.text),
            VoiceProfilePrompts.prompts(for: "en").map(\.text)
        )
        XCTAssertEqual(
            VoiceProfilePrompts.prompts(for: nil).map(\.text),
            VoiceProfilePrompts.prompts(for: "en").map(\.text)
        )
    }

    func test_promptCarriesItsResolvedLanguage() {
        // La langue RÉSOLUE, pas celle demandée : la vue doit pouvoir dire à
        // l'utilisateur ce qu'il est en train de lire.
        XCTAssertEqual(VoiceProfilePrompts.prompts(for: "fr_FR").first?.languageCode, "fr")
        XCTAssertEqual(VoiceProfilePrompts.prompts(for: "ja").first?.languageCode, "en")
    }

    // MARK: - Sens de lecture

    func test_arabicIsFlaggedRightToLeft() {
        XCTAssertTrue(VoiceProfilePrompts.prompts(for: "ar").allSatisfy(\.isRightToLeft))
    }

    func test_latinScriptsAreNotFlaggedRightToLeft() {
        for code in ["fr", "en", "es", "pt", "de", "it"] {
            XCTAssertTrue(
                VoiceProfilePrompts.prompts(for: code).allSatisfy { !$0.isRightToLeft },
                "\(code) ne doit pas être marqué droite-à-gauche"
            )
        }
    }

    // MARK: - Rotation

    /// Deux sessions d'affilée ne doivent pas servir les mêmes textes : lus une
    /// seconde fois, ils sont récités de mémoire, à plat.
    func test_rotationShiftsTheStartingPrompt() {
        let base = VoiceProfilePrompts.prompt(for: "fr", at: 0, rotation: 0)
        let shifted = VoiceProfilePrompts.prompt(for: "fr", at: 0, rotation: 1)

        XCTAssertNotEqual(base?.text, shifted?.text)
    }

    func test_rotationWrapsAround() {
        let count = VoiceProfilePrompts.prompts(for: "fr").count
        XCTAssertEqual(
            VoiceProfilePrompts.prompt(for: "fr", at: 0, rotation: count)?.text,
            VoiceProfilePrompts.prompt(for: "fr", at: 0, rotation: 0)?.text
        )
    }

    func test_indexBeyondTheSetWrapsRatherThanStalling() {
        // L'ancienne vue bloquait sur le DERNIER texte au-delà du catalogue :
        // un utilisateur qui enregistre six échantillons relisait six fois le
        // même. Boucler donne au moins de la variété.
        let count = VoiceProfilePrompts.prompts(for: "fr").count
        XCTAssertEqual(
            VoiceProfilePrompts.prompt(for: "fr", at: count)?.text,
            VoiceProfilePrompts.prompt(for: "fr", at: 0)?.text
        )
    }

    func test_negativeIndexIsTolerated() {
        XCTAssertNotNil(VoiceProfilePrompts.prompt(for: "fr", at: -1))
    }
}
