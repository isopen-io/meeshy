import XCTest
@testable import MeeshyUI

/// Les règles PURES de la mention « @ ». Elles servent trois surfaces — le
/// composeur de post, l'éditeur de texte de story, et le contrôleur de mention
/// de la conversation côté app — d'où l'intérêt de les épingler ici une fois.
final class ComposerMentionQueryTests: XCTestCase {

    // MARK: - Handle en cours de frappe

    func test_trailingHandle_afterASpace_isTheFragmentBeingTyped() {
        XCTAssertEqual(ComposerMentionQuery.trailingHandle(in: "Bonjour @ali"), "ali")
    }

    func test_trailingHandle_atTheVeryStart_isRecognised() {
        XCTAssertEqual(ComposerMentionQuery.trailingHandle(in: "@ali"), "ali")
    }

    /// Le `@` qui vient d'être tapé n'est pas une absence : c'est le moment où
    /// la liste par défaut (les contacts) doit s'ouvrir.
    func test_trailingHandle_justAfterTheAt_isTheEmptyQuery_notNil() {
        XCTAssertEqual(ComposerMentionQuery.trailingHandle(in: "Bonjour @"), "")
    }

    func test_trailingHandle_withoutAnyAt_isNil() {
        XCTAssertNil(ComposerMentionQuery.trailingHandle(in: "Bonjour tout le monde"))
    }

    /// Un espace clôt le handle — sinon la liste resterait ouverte sur toute la
    /// phrase qui suit.
    func test_trailingHandle_onceASpaceFollows_isNil() {
        XCTAssertNil(ComposerMentionQuery.trailingHandle(in: "Bonjour @alice ça va"))
    }

    /// Le défaut que la règle partagée corrige : le contrôleur de conversation
    /// coupait sur le DERNIER `@` sans vérifier qu'il ouvre un handle, et
    /// ouvrait donc une recherche sur « exemple.com » à chaque adresse tapée.
    func test_trailingHandle_insideAnEmailAddress_isNil() {
        XCTAssertNil(ComposerMentionQuery.trailingHandle(in: "écris à contact@exemple.com"))
    }

    func test_trailingHandle_pastedOverlyLongFragment_isNil() {
        let long = String(repeating: "a", count: 40)
        XCTAssertNil(ComposerMentionQuery.trailingHandle(in: "@" + long))
    }

    // MARK: - Remplacement

    func test_replacingTrailingHandle_swapsTheFragmentAndLeavesATrailingSpace() {
        XCTAssertEqual(
            ComposerMentionQuery.replacingTrailingHandle(in: "Salut @ali", with: "alice"),
            "Salut @alice "
        )
    }

    func test_replacingTrailingHandle_withoutAHandleInProgress_leavesTheTextIntact() {
        XCTAssertEqual(
            ComposerMentionQuery.replacingTrailingHandle(in: "Salut @alice ça va", with: "bob"),
            "Salut @alice ça va"
        )
    }

    // MARK: - Récolte

    func test_handles_collectsEveryHandleInOrder() {
        XCTAssertEqual(
            ComposerMentionQuery.handles(in: "@alice et @bob se sont vus"),
            ["alice", "bob"]
        )
    }

    func test_handles_deduplicatesCaseInsensitively() {
        XCTAssertEqual(ComposerMentionQuery.handles(in: "@alice @Alice @ALICE"), ["alice"])
    }

    func test_handles_ignoresAnAtThatDoesNotOpenAHandle() {
        XCTAssertEqual(ComposerMentionQuery.handles(in: "contact@exemple.com"), [])
    }

    func test_handles_keepsDotsAndUnderscoresOfAPseudonym() {
        XCTAssertEqual(ComposerMentionQuery.handles(in: "@marie_l.dupont !"), ["marie_l.dupont"])
    }

    // MARK: - Contenu publié

    /// Le canevas d'une story voyage dans `StoryEffects`, que le gateway ne lit
    /// PAS pour les mentions : `POST /posts` n'accepte aucune liste de
    /// mentionnés, et le serveur extrait les `@handle` du `content`. Sans cette
    /// récolte, une pastille posée sur la slide ne préviendrait personne.
    func test_publishedContent_liftsCanvasHandlesIntoTheContent() {
        XCTAssertEqual(
            ComposerMentionQuery.publishedContent(existing: nil, canvasTexts: ["@alice", "Bonne journée"]),
            "@alice"
        )
    }

    func test_publishedContent_appendsToAnExistingCaptionWithoutRepeatingIt() {
        XCTAssertEqual(
            ComposerMentionQuery.publishedContent(existing: "coucou @alice", canvasTexts: ["@alice", "@bob"]),
            "coucou @alice @bob"
        )
    }

    /// Le texte LIBRE du canevas ne monte pas dans `content` : les stories se
    /// publient RAW et se re-traduisent chez chaque lecteur depuis
    /// `effects.textObjects`. L'y recopier doublerait le texte et le ferait
    /// traduire une seconde fois côté serveur.
    func test_publishedContent_neverLiftsPlainCanvasText() {
        XCTAssertNil(
            ComposerMentionQuery.publishedContent(existing: nil, canvasTexts: ["Bonjour tout le monde"])
        )
    }

    func test_publishedContent_withNothingToSay_isNil() {
        XCTAssertNil(ComposerMentionQuery.publishedContent(existing: "   ", canvasTexts: []))
    }
}
