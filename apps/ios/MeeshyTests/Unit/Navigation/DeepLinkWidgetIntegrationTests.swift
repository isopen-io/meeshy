import XCTest
@testable import Meeshy
import MeeshySDK

/// Intégration bout-en-bout des surfaces widget / App Shortcut :
/// publication App Group → ré-hydratation contact → deep link → brouillon.
///
/// `ContactQuery.entities(for:)` lit la suite RÉELLE `group.me.meeshy.apps`
/// (non injectable) ; pour rester déterministe sans polluer l'App Group du
/// simulateur, chaque étape est exercée sur une suite jetable via le MÊME
/// contrat : `WidgetDataManager.publishFavoriteContacts` écrit
/// `favorite_contacts`, et le décodage se fait avec `ContactData` — le type
/// exact que `ContactQuery` décode. Toute dérive du format JSON app↔intents
/// casse donc ici (pattern `WidgetConversationContractTests`).
@MainActor
final class DeepLinkWidgetIntegrationTests: XCTestCase {

    private func makeSuite() throws -> (defaults: UserDefaults, name: String) {
        let name = "group.test.meeshy.deeplinkintegration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        defaults.removePersistentDomain(forName: name)
        return (defaults, name)
    }

    private func makeDrafts() -> DraftStore {
        let suiteName = "DeepLinkWidgetIntegrationTests.drafts.\(UUID().uuidString)"
        return DraftStore(
            userDefaults: UserDefaults(suiteName: suiteName)!,
            userIdProvider: { "user1" }
        )
    }

    /// Miroir de `ContactQuery.entities(for:)` : même clé, même type décodé,
    /// même filtrage par identifiants.
    private func rehydrateContacts(
        for identifiers: [String], in defaults: UserDefaults
    ) throws -> [ContactData] {
        let data = try XCTUnwrap(
            defaults.data(forKey: "favorite_contacts"),
            "publishFavoriteContacts doit écrire la clé que ContactQuery lit"
        )
        return try JSONDecoder().decode([ContactData].self, from: data)
            .filter { identifiers.contains($0.id) }
    }

    func test_shortcutSendMessage_prefillsDraftWithText() throws {
        // ÉTAPE 1 — l'app publie un contact épinglé dans l'App Group.
        let (defaults, suiteName) = try makeSuite()
        let manager = WidgetDataManager(suiteName: suiteName, stagingDirectories: [])
        let conversation = MeeshyConversation(
            id: "conv-integration-1",
            identifier: "ident-integration-1",
            type: .direct,
            title: "Alice",
            isPinned: true
        )
        manager.publishFavoriteContacts([conversation])

        // ÉTAPE 2 — ré-hydratation du contact, comme le raccourci Siri le fait.
        let contacts = try rehydrateContacts(for: ["conv-integration-1"], in: defaults)
        XCTAssertEqual(contacts.map(\.id), ["conv-integration-1"])
        XCTAssertEqual(contacts.first?.name, "Alice")

        // ÉTAPE 3 — l'intent compose son deep link, le parseur le résout.
        let url = URL(string: "meeshy://send?contactId=conv-integration-1&message=Bonjour%20Alice")!
        guard case .conversation(let id, let draftText) = DeepLinkParser.parse(url) else {
            return XCTFail("Expected .conversation, got \(DeepLinkParser.parse(url))")
        }
        XCTAssertEqual(id, "conv-integration-1")
        XCTAssertEqual(draftText, "Bonjour Alice")

        // ÉTAPE 4 — le routeur dépose le texte capturé en brouillon.
        let drafts = makeDrafts()
        drafts.stageShortcutDraft(draftText, for: id)
        XCTAssertEqual(drafts.loadText(for: "conv-integration-1"), "Bonjour Alice")
    }

    func test_widgetQuickReply_prefillsDraftWithText() throws {
        // Même flow pour le widget Réponse rapide : le bouton « OK » émet
        // `meeshy://quickreply/{id}?text=OK`, ouverte via la voie système
        // (`DeepLinkRouter.handle`) — testée ici de bout en bout avec un
        // DraftStore injecté.
        let drafts = makeDrafts()
        let router = DeepLinkRouter(drafts: drafts)
        let url = URL(string: "meeshy://quickreply/conv-quickreply-1?text=OK")!

        let handled = router.handle(url: url)

        XCTAssertTrue(handled)
        XCTAssertEqual(router.pendingDeepLink, .conversation(id: "conv-quickreply-1"))
        XCTAssertEqual(drafts.loadText(for: "conv-quickreply-1"), "OK")

        // Et la voie in-app (parse → dépôt) aboutit au même brouillon.
        guard case .conversation(let id, let draftText) = DeepLinkParser.parse(url) else {
            return XCTFail("Expected .conversation")
        }
        let inAppDrafts = makeDrafts()
        inAppDrafts.stageShortcutDraft(draftText, for: id)
        XCTAssertEqual(inAppDrafts.loadText(for: "conv-quickreply-1"), "OK")
    }

    /// Le groupe et le non-épinglé ne deviennent jamais des « contacts » de
    /// raccourci — un identifiant hors de `favorite_contacts` ne se
    /// ré-hydrate pas, le raccourci n'a alors pas de destinataire.
    func test_unpublishedConversation_doesNotRehydrate() throws {
        let (defaults, suiteName) = try makeSuite()
        let manager = WidgetDataManager(suiteName: suiteName, stagingDirectories: [])
        manager.publishFavoriteContacts([
            MeeshyConversation(
                id: "conv-group", identifier: "ident-group", type: .group,
                title: "Groupe", isPinned: true
            ),
            MeeshyConversation(
                id: "conv-unpinned", identifier: "ident-unpinned", type: .direct,
                title: "Pas épinglée", isPinned: false
            ),
        ])

        let contacts = try rehydrateContacts(for: ["conv-group", "conv-unpinned"], in: defaults)

        XCTAssertTrue(contacts.isEmpty)
    }
}
