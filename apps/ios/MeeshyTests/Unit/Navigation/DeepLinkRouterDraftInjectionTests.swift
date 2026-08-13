import XCTest
@testable import Meeshy

/// Sémantique du dépôt de brouillon des raccourcis (widget « Réponse rapide »,
/// App Shortcut « Send Message ») — `DraftStore.stageShortcutDraft`, la source
/// de vérité UNIQUE partagée par les deux voies d'entrée :
/// `DeepLinkRouter.handle` (ouverture système) et
/// `Router.handleConversationDeepLink` (tap `Link` in-app).
///
/// Chaque test isole ses `UserDefaults` (suite jetable) — aucun état du
/// simulateur n'est touché.
@MainActor
final class DeepLinkRouterDraftInjectionTests: XCTestCase {

    private func makeDrafts() -> DraftStore {
        let suiteName = "DeepLinkRouterDraftInjectionTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        return DraftStore(userDefaults: defaults, userIdProvider: { "user1" })
    }

    func test_stageShortcutDraft_withText_setsDraft() {
        let drafts = makeDrafts()

        drafts.stageShortcutDraft("Test message from shortcut", for: "conv-test-123")

        XCTAssertEqual(drafts.loadText(for: "conv-test-123"), "Test message from shortcut")
    }

    /// LA garde qui compte : un brouillon en cours est de la saisie utilisateur
    /// non envoyée — un deep link ne peut pas être une instruction de la
    /// détruire.
    func test_stageShortcutDraft_withExistingUserDraft_preservesIt() {
        let drafts = makeDrafts()
        drafts.saveText("Existing draft", for: "conv-test-456")

        drafts.stageShortcutDraft("OK", for: "conv-test-456")

        XCTAssertEqual(drafts.loadText(for: "conv-test-456"), "Existing draft")
    }

    func test_stageShortcutDraft_withNilText_doesNothing() {
        let drafts = makeDrafts()

        drafts.stageShortcutDraft(nil, for: "conv-test-789")

        XCTAssertNil(drafts.load(for: "conv-test-789"))
    }

    func test_stageShortcutDraft_withEmptyText_doesNothing() {
        let drafts = makeDrafts()

        drafts.stageShortcutDraft("", for: "conv-test-789")

        XCTAssertNil(drafts.load(for: "conv-test-789"))
    }

    /// Un brouillon qui ne porte QUE des effets (pas de texte tapé) n'est pas
    /// de la saisie à protéger : le texte du raccourci s'y dépose.
    func test_stageShortcutDraft_overDraftWithoutText_setsText() {
        let drafts = makeDrafts()
        drafts.save(MessageDraft(text: "", effectFlags: 1), for: "conv-effects")

        drafts.stageShortcutDraft("Salut", for: "conv-effects")

        XCTAssertEqual(drafts.loadText(for: "conv-effects"), "Salut")
    }

    /// Les deux voies d'entrée déposent EXACTEMENT pareil : la voie système
    /// (`DeepLinkRouter.handle`, testée dans DeepLinkWidgetSurfaceTests) et la
    /// voie in-app reproduite ici — parse de la destination puis dépôt du
    /// `draftText` capturé, comme `Router.handleConversationDeepLink` le fait.
    func test_inAppPath_parseThenStage_matchesSystemPath() {
        let drafts = makeDrafts()
        let url = URL(string: "meeshy://quickreply/conv-inapp?text=Call%20me")!

        guard case .conversation(let id, let draftText) = DeepLinkParser.parse(url) else {
            return XCTFail("Expected .conversation")
        }
        drafts.stageShortcutDraft(draftText, for: id)

        XCTAssertEqual(drafts.loadText(for: "conv-inapp"), "Call me")
    }
}
