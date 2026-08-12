import XCTest
@testable import Meeshy

/// Tests du helper pur de chaîne de langues du viewer avec override "explore other languages".
/// Le Prisme Linguistique affiche par défaut la langue préférée (`preferredContentLanguages`),
/// mais l'utilisateur peut explorer une autre langue via le picker — l'override est alors
/// PRÉPENDU à la chaîne (priorité la plus haute), sans jamais supprimer les préférences de base.
@MainActor
final class StoryViewerLanguageOverrideTests: XCTestCase {

    func test_viewerLanguageChain_nilOverride_returnsBaseUnchanged() {
        let base = ["fr", "en"]
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: base, override: nil), ["fr", "en"])
    }

    func test_viewerLanguageChain_emptyOverride_returnsBaseUnchanged() {
        let base = ["fr", "en"]
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: base, override: ""), ["fr", "en"])
    }

    func test_viewerLanguageChain_newOverride_prependsToChain() {
        let base = ["fr", "en"]
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: base, override: "es"), ["es", "fr", "en"])
    }

    func test_viewerLanguageChain_overrideAlreadyFirst_noDuplicate() {
        let base = ["fr", "en"]
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: base, override: "fr"), ["fr", "en"])
    }

    func test_viewerLanguageChain_overrideInMiddle_movedToFrontDeduplicated() {
        let base = ["fr", "en", "de"]
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: base, override: "de"), ["de", "fr", "en"])
    }

    func test_viewerLanguageChain_emptyBase_returnsOverrideOnly() {
        XCTAssertEqual(StoryViewerView.viewerLanguageChain(base: [], override: "ja"), ["ja"])
    }

    // MARK: - « Original » — une story est multilingue par nature
    //
    // Directive user 2026-07-27 : plusieurs bouts d'une même story peuvent être
    // écrits dans des langues DIFFÉRENTES, et il faut pouvoir revenir à
    // l'original quoi qu'il arrive. Choisir la langue d'origine de la story ne
    // suffit pas : un overlay rédigé en français dans une story marquée `en`
    // possède une traduction `en`, qui serait servie à la place de son texte
    // réel. Aligner tous les bouts sur une seule langue EFFACE les autres.
    //
    // `StoryTextObject.resolvedText` rend déjà le texte source quand la chaîne
    // est vide. « Original » est donc une chaîne VIDE, pas un code langue —
    // chaque overlay retombe alors sur son propre texte, dans sa propre langue.

    func test_viewerLanguageChain_originalOverride_emptiesTheChain() {
        let base = ["fr", "en"]
        XCTAssertEqual(
            StoryViewerView.viewerLanguageChain(base: base, override: StoryViewerView.originalLanguageOverride),
            []
        )
    }

    func test_viewerLanguageChain_originalOverride_emptyBase_stillEmpty() {
        XCTAssertEqual(
            StoryViewerView.viewerLanguageChain(base: [], override: StoryViewerView.originalLanguageOverride),
            []
        )
    }

    func test_originalLanguageOverride_isNotAValidLanguageCode() {
        // La sentinelle ne doit jamais pouvoir entrer en collision avec un code
        // BCP-47 réel, sinon elle serait résolue comme une langue traduisible.
        let sentinel = StoryViewerView.originalLanguageOverride
        XCTAssertFalse(sentinel.isEmpty)
        XCTAssertNil(sentinel.range(of: "^[a-zA-Z]{2,3}([-_][a-zA-Z0-9]+)*$", options: .regularExpression))
    }
}
