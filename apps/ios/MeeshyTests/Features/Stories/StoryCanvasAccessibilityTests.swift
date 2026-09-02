import XCTest
@testable import MeeshySDK
@testable import Meeshy

/// Le canvas du lecteur est rendu en `CALayer` : son contenu est totalement
/// invisible d'UIAccessibility. Le code s'en accommodait par un label fixe
/// (« Story en cours de lecture ») — un utilisateur VoiceOver entendait donc
/// qu'une story jouait, sans jamais savoir CE qu'elle disait. L'app connaît
/// pourtant le texte : il est dans `storyEffects.textObjects`, déjà résolu
/// dans la langue préférée par `resolvedText(preferredLanguages:)`.
///
/// On assure ici que le label PORTE le contenu. Les assertions portent sur les
/// données (nom d'auteur, texte de la story, transcription) et non sur la
/// phrase localisée qui les enrobe : ces fragments sont identiques quelle que
/// soit la locale du simulateur, ce qui garde le test vert en local (fr) comme
/// en CI (en).
final class StoryCanvasAccessibilityTests: XCTestCase {

    // MARK: - Fixtures

    private func makeText(_ text: String,
                          id: String = "t1",
                          translations: [String: String]? = nil,
                          sourceLanguage: String? = nil) -> StoryTextObject {
        StoryTextObject(id: id,
                        text: text,
                        translations: translations,
                        sourceLanguage: sourceLanguage)
    }

    // MARK: - Le contenu est restitué

    /// #4825 — les stickers sont DITS, après les textes, dans l'ordre de pose.
    func test_label_carriesTheStickers_afterTheTexts() {
        let label = StoryCanvasAccessibility.label(
            index: 0, total: 1,
            authorName: nil,
            textObjects: [makeText("Bon anniversaire")],
            preferredLanguages: ["fr"],
            voiceTranscript: nil,
            stickerDescriptions: ["Cadran — 14:32", "Cœur, qui bat", "   "]
        )
        let texte = label.range(of: "Bon anniversaire")
        let cadran = label.range(of: "Cadran — 14:32")
        XCTAssertNotNil(texte); XCTAssertNotNil(cadran)
        XCTAssertTrue(label.contains("Cœur, qui bat"))
        if let texte, let cadran {
            XCTAssertLessThan(texte.lowerBound, cadran.lowerBound, "les textes d'abord, les stickers ensuite")
        }
        XCTAssertFalse(label.hasSuffix(". "), "une description vide ne laisse pas de séparateur orphelin")
    }

    func test_label_carriesTheStoryText() {
        let label = StoryCanvasAccessibility.label(
            index: 1, total: 5,
            authorName: "Alice",
            textObjects: [makeText("Vraiment fan de la lune")],
            preferredLanguages: ["fr"],
            voiceTranscript: nil
        )

        XCTAssertTrue(label.contains("Vraiment fan de la lune"),
                      "Le texte visible de la story doit être restitué — sinon VoiceOver n'annonce qu'un contenant vide")
    }

    func test_label_carriesAuthorAndPosition() {
        let label = StoryCanvasAccessibility.label(
            index: 1, total: 5,
            authorName: "Alice",
            textObjects: [],
            preferredLanguages: ["fr"],
            voiceTranscript: nil
        )

        XCTAssertTrue(label.contains("Alice"), "L'auteur doit être annoncé")
        XCTAssertTrue(label.contains("2"), "La position courante doit être annoncée")
        XCTAssertTrue(label.contains("5"), "Le total doit être annoncé")
    }

    /// Plusieurs textes posés sur le canvas : tous comptent, dans l'ordre.
    func test_label_joinsEveryTextObject() {
        let label = StoryCanvasAccessibility.label(
            index: 0, total: 1,
            authorName: "Alice",
            textObjects: [makeText("Premier", id: "a"), makeText("Second", id: "b")],
            preferredLanguages: ["fr"],
            voiceTranscript: nil
        )

        XCTAssertTrue(label.contains("Premier"))
        XCTAssertTrue(label.contains("Second"))
        guard let first = label.range(of: "Premier"), let second = label.range(of: "Second") else {
            return XCTFail("Les deux textes doivent être présents")
        }
        XCTAssertTrue(first.lowerBound < second.lowerBound,
                      "L'ordre de pose sur le canvas doit être conservé à l'oral")
    }

    // MARK: - Prisme Linguistique

    /// Le label doit dire ce que l'écran MONTRE. Si le viewer lit en anglais,
    /// VoiceOver annonce l'anglais — sinon l'oral contredit le visuel.
    func test_label_followsPreferredLanguage() {
        let text = makeText("Bonjour",
                            translations: ["en": "Hello"],
                            sourceLanguage: "fr")

        let label = StoryCanvasAccessibility.label(
            index: 0, total: 1,
            authorName: "Alice",
            textObjects: [text],
            preferredLanguages: ["en"],
            voiceTranscript: nil
        )

        XCTAssertTrue(label.contains("Hello"),
                      "Le label doit suivre le Prisme, comme le rendu visuel")
        XCTAssertFalse(label.contains("Bonjour"),
                       "L'original ne doit pas doubler la traduction affichée")
    }

    // MARK: - Transcription vocale

    func test_label_includesVoiceTranscript() {
        let label = StoryCanvasAccessibility.label(
            index: 0, total: 1,
            authorName: "Alice",
            textObjects: [],
            preferredLanguages: ["fr"],
            voiceTranscript: "Salut tout le monde"
        )

        XCTAssertTrue(label.contains("Salut tout le monde"),
                      "Une story dont le contenu est un vocal doit rester audible pour VoiceOver")
    }

    // MARK: - Dégradations

    /// Story sans texte ni vocal (image seule) : le label reste informatif et
    /// ne se termine pas par une ponctuation orpheline.
    func test_label_withoutContent_staysClean() {
        let label = StoryCanvasAccessibility.label(
            index: 0, total: 3,
            authorName: "Alice",
            textObjects: [],
            preferredLanguages: ["fr"],
            voiceTranscript: nil
        )

        XCTAssertFalse(label.isEmpty)
        XCTAssertFalse(label.hasSuffix(","), "Pas de virgule orpheline en fin de label")
        XCTAssertFalse(label.contains("  "), "Pas de double espace issu d'un segment vide")
    }

    /// Les textes vides ou blancs du composer ne polluent pas l'annonce.
    func test_label_ignoresBlankTextObjects() {
        let label = StoryCanvasAccessibility.label(
            index: 0, total: 1,
            authorName: "Alice",
            textObjects: [makeText("   ", id: "a"), makeText("Utile", id: "b")],
            preferredLanguages: ["fr"],
            voiceTranscript: nil
        )

        XCTAssertTrue(label.contains("Utile"))
        XCTAssertFalse(label.contains("  "), "Un texte blanc ne doit pas laisser de trou dans l'annonce")
    }

    func test_label_withoutAuthor_stillAnnouncesContent() {
        let label = StoryCanvasAccessibility.label(
            index: 0, total: 1,
            authorName: nil,
            textObjects: [makeText("Sans auteur")],
            preferredLanguages: ["fr"],
            voiceTranscript: nil
        )

        XCTAssertTrue(label.contains("Sans auteur"))
    }
}
