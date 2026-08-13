import XCTest
@testable import Meeshy

// MARK: - Widget / App Shortcut deep links

/// Les widgets et les App Shortcuts écrivent leurs `meeshy://` À LA MAIN, dans
/// des cibles qui n'importent pas le routeur. Un couple host/forme qui n'existe
/// dans la table de routage de personne compile, s'affiche, se tape — et ne
/// fait rien. Ces suites confrontent chaque forme réellement émise au parseur
/// ET au routeur.
@MainActor
final class DeepLinkWidgetSurfaceParserTests: XCTestCase {

    /// `WidgetDataManager.publishFavoriteContacts` écrit `conv.id` dans
    /// `FavoriteContact.id` : le host s'appelle « contact » parce que la ligne
    /// MONTRE un contact, mais l'identifiant porté est une conversation.
    func test_parse_customScheme_contact_returnsConversation() {
        let destination = DeepLinkParser.parse(URL(string: "meeshy://contact/conv123")!)

        guard case .conversation(let id) = destination else {
            return XCTFail("Expected .conversation, got \(destination)")
        }
        XCTAssertEqual(id, "conv123")
    }

    func test_parse_customScheme_quickReply_returnsConversation() {
        let destination = DeepLinkParser.parse(URL(string: "meeshy://quickreply/conv456?text=OK")!)

        guard case .conversation(let id) = destination else {
            return XCTFail("Expected .conversation, got \(destination)")
        }
        XCTAssertEqual(id, "conv456")
    }

    func test_parse_customScheme_send_readsConversationIdFromQuery() {
        let destination = DeepLinkParser.parse(
            URL(string: "meeshy://send?contactId=conv789&message=Bonjour")!
        )

        guard case .conversation(let id) = destination else {
            return XCTFail("Expected .conversation, got \(destination)")
        }
        XCTAssertEqual(id, "conv789")
    }

    /// Sans destinataire, l'App Shortcut ne désigne rien : mieux vaut rendre la
    /// main (`.external`) que d'ouvrir une conversation d'identifiant vide.
    func test_parse_customScheme_send_withoutContactId_returnsExternal() {
        let destination = DeepLinkParser.parse(URL(string: "meeshy://send?message=Bonjour")!)

        guard case .external = destination else {
            return XCTFail("Expected .external, got \(destination)")
        }
    }

    func test_parse_customScheme_contact_emptyId_returnsExternal() {
        let destination = DeepLinkParser.parse(URL(string: "meeshy://contact/")!)

        guard case .external = destination else {
            return XCTFail("Expected .external, got \(destination)")
        }
    }
}

@MainActor
final class DeepLinkWidgetSurfaceRouterTests: XCTestCase {

    private func makeSUT() -> (sut: DeepLinkRouter, drafts: DraftStore) {
        let suiteName = "DeepLinkWidgetSurfaceRouterTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        let drafts = DraftStore(userDefaults: defaults, userIdProvider: { "user1" })
        return (DeepLinkRouter(drafts: drafts), drafts)
    }

    // MARK: - Favoris

    func test_handle_contactURL_routesToConversation() {
        let (sut, _) = makeSUT()

        let handled = sut.handle(url: URL(string: "meeshy://contact/conv123")!)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv123"))
    }

    func test_handle_contactURL_withoutId_returnsFalse() {
        let (sut, _) = makeSUT()

        let handled = sut.handle(url: URL(string: "meeshy://contact/")!)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    // MARK: - Réponse rapide

    func test_handle_quickReplyURL_stagesDraftAndRoutesToConversation() {
        let (sut, drafts) = makeSUT()

        let handled = sut.handle(url: URL(string: "meeshy://quickreply/conv456?text=Thanks!")!)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv456"))
        XCTAssertEqual(drafts.loadText(for: "conv456"), "Thanks!")
    }

    /// Le texte est déposé, pas envoyé : rien ne doit partir sans que le
    /// composer s'ouvre. Le seul effet observable est le brouillon.
    func test_handle_quickReplyURL_percentEncodedText_isDecoded() {
        let (sut, drafts) = makeSUT()

        let handled = sut.handle(url: URL(string: "meeshy://quickreply/conv456?text=Call%20me")!)

        XCTAssertTrue(handled)
        XCTAssertEqual(drafts.loadText(for: "conv456"), "Call me")
    }

    /// LA garde qui compte : un brouillon en cours est de la saisie utilisateur
    /// non envoyée. Un tap de widget ne peut pas être une instruction de la
    /// détruire — on navigue, l'utilisateur tranche.
    func test_handle_quickReplyURL_withExistingDraftText_preservesUserDraft() {
        let (sut, drafts) = makeSUT()
        drafts.saveText("message a moitie ecrit", for: "conv456")

        let handled = sut.handle(url: URL(string: "meeshy://quickreply/conv456?text=OK")!)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv456"))
        XCTAssertEqual(drafts.loadText(for: "conv456"), "message a moitie ecrit")
    }

    func test_handle_quickReplyURL_withoutText_routesWithoutStagingADraft() {
        let (sut, drafts) = makeSUT()

        let handled = sut.handle(url: URL(string: "meeshy://quickreply/conv456")!)

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv456"))
        XCTAssertEqual(drafts.loadText(for: "conv456"), "")
    }

    func test_handle_quickReplyURL_withoutConversationId_returnsFalse() {
        let (sut, _) = makeSUT()

        let handled = sut.handle(url: URL(string: "meeshy://quickreply/?text=OK")!)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    // MARK: - App Shortcut « Send Message »

    func test_handle_sendURL_stagesDraftAndRoutesToConversation() {
        let (sut, drafts) = makeSUT()

        let handled = sut.handle(
            url: URL(string: "meeshy://send?contactId=conv789&message=Bonjour%20Marie")!
        )

        XCTAssertTrue(handled)
        XCTAssertEqual(sut.pendingDeepLink, .conversation(id: "conv789"))
        XCTAssertEqual(drafts.loadText(for: "conv789"), "Bonjour Marie")
    }

    func test_handle_sendURL_withoutContactId_returnsFalse() {
        let (sut, _) = makeSUT()

        let handled = sut.handle(url: URL(string: "meeshy://send?message=Bonjour")!)

        XCTAssertFalse(handled)
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_handle_sendURL_withExistingDraftText_preservesUserDraft() {
        let (sut, drafts) = makeSUT()
        drafts.saveText("brouillon en cours", for: "conv789")

        let handled = sut.handle(url: URL(string: "meeshy://send?contactId=conv789&message=Salut")!)

        XCTAssertTrue(handled)
        XCTAssertEqual(drafts.loadText(for: "conv789"), "brouillon en cours")
    }

    // MARK: - Parseur et routeur en phase

    /// Les deux voies d'entrée (tap `Link` in-app → `DeepLinkParser.open`,
    /// ouverture système → `DeepLinkRouter.handle`) doivent résoudre le MÊME
    /// identifiant. C'est la divergence exacte que le cycle précédent avait
    /// trouvée sur `meeshy://c/<id>`.
    func test_parserAndRouter_agreeOnEveryWidgetSurface() {
        let cases = [
            "meeshy://contact/conv1",
            "meeshy://quickreply/conv2?text=OK",
            "meeshy://send?contactId=conv3&message=Salut"
        ]

        for raw in cases {
            let url = URL(string: raw)!

            guard case .conversation(let parsedId) = DeepLinkParser.parse(url) else {
                XCTFail("Parser n'a pas résolu \(raw) en .conversation")
                continue
            }

            let (sut, _) = makeSUT()
            _ = sut.handle(url: url)

            guard case .conversation(let routedId) = sut.pendingDeepLink else {
                XCTFail("Routeur n'a pas résolu \(raw) en .conversation")
                continue
            }

            XCTAssertEqual(parsedId, routedId, "Parseur et routeur divergent sur \(raw)")
        }
    }
}
