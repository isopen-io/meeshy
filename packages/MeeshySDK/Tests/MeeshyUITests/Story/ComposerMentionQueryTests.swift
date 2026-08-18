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

    // MARK: - Mentions déclarées au serveur

    /// Le canevas voyage dans `StoryEffects`, que le gateway ne lit pas pour les
    /// mentions. C'est cette récolte qui alimente le champ `mentions` de
    /// `POST /posts` — sans elle, nommer quelqu'un par une pastille imposait
    /// d'écrire son `@handle` dans la légende.
    func test_handlesInAll_collectsEveryCanvasHandleInOrder() {
        XCTAssertEqual(
            ComposerMentionQuery.handles(inAll: ["@alice", "Bonne journée", "coucou @bob"]),
            ["alice", "bob"]
        )
    }

    func test_handlesInAll_deduplicatesAcrossTexts_caseInsensitively() {
        XCTAssertEqual(
            ComposerMentionQuery.handles(inAll: ["@alice", "@Alice et @bob"]),
            ["alice", "bob"]
        )
    }

    func test_handlesInAll_withoutAnyHandle_isEmpty() {
        XCTAssertTrue(ComposerMentionQuery.handles(inAll: ["Bonjour", "contact@exemple.com"]).isEmpty)
    }
}
