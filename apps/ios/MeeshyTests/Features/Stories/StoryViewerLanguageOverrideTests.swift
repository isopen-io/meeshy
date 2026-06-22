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
}
