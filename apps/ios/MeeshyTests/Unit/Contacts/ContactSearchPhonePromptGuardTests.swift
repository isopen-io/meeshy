import XCTest
@testable import Meeshy

/// #8843 — les DEUX gestes qui lancent la recherche de ses contacts
/// (« Synchroniser le répertoire », « Retrouver mes contacts sur Meeshy »)
/// passent par la proposition d'ajouter son numéro, et le flux SMS reste UN :
/// `SecurityView` et la proposition partagent `PhoneChangeFlowModel`.
///
/// Garde de SOURCE : un bouton SwiftUI ne s'inspecte pas sans hôte. La
/// synchronisation SILENCIEUSE de première ouverture n'est pas visée — la
/// personne n'a rien demandé, on ne l'interrompt pas.
final class ContactSearchPhonePromptGuardTests: XCTestCase {

    private static let entryPoints = [
        "Meeshy/Features/Contacts/PhonebookListView.swift",
        "Meeshy/Features/Contacts/DiscoverTab.swift",
    ]
    private static let securityView = "Meeshy/Features/Main/Views/SecurityView.swift"
    private static let promptSheet = "Meeshy/Features/Contacts/PhonePromptSheet.swift"
    private static let catalog = "Meeshy/Localizable.xcstrings"
    private static let sevenLanguages: Set<String> = ["fr", "en", "es", "pt-BR", "de", "it", "ar"]

    func test_contactSearchEntryPoints_offerThePhoneFirst() throws {
        for path in Self.entryPoints {
            let source = try MyStoriesSourceCorpus.text(of: path)
            XCTAssertTrue(source.contains(".phonePromptBeforeContactSearch("),
                          "\(path) : la recherche de contacts propose d'abord le numéro")
            XCTAssertTrue(source.contains("offerPhoneThenSearch"),
                          "\(path) : le geste explicite passe par la proposition")
        }
    }

    func test_phonebookSilentFirstSync_isNotGated() throws {
        let viewModel = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Contacts/PhonebookViewModel.swift")
        XCTAssertFalse(viewModel.contains("PhonePromptPolicy"),
                       "le view model ne décide pas : seul le GESTE de l'utilisateur ouvre la proposition")
    }

    func test_securityView_usesTheSharedPhoneFlow() throws {
        let source = try MyStoriesSourceCorpus.text(of: Self.securityView)
        XCTAssertTrue(source.contains("PhoneChangeFlowModel"),
                      "SecurityView consomme le flux partagé")
        XCTAssertFalse(source.contains("UserService.shared.changePhone"),
                       "aucune seconde implémentation de l'envoi du code")
        XCTAssertFalse(source.contains("UserService.shared.verifyPhoneChange"),
                       "aucune seconde implémentation de la vérification")
    }

    func test_promptSheet_reusesTheFlow_andAlwaysLetsTheSearchContinue() throws {
        let source = try MyStoriesSourceCorpus.text(of: Self.promptSheet)
        XCTAssertTrue(source.contains("PhoneChangeFlowModel"), "même flux que la Sécurité")
        XCTAssertFalse(source.contains("changePhone("), "aucune logique réseau réimplémentée")
        XCTAssertTrue(source.contains("contacts.phonePrompt.later"), "« Plus tard » existe")
        XCTAssertTrue(source.contains("minHeight: 44"), "cibles tactiles de 44 pt")
        XCTAssertFalse(source.contains("interactiveDismissDisabled"),
                       "jamais bloquant : la feuille se ferme toujours d'un geste")
        XCTAssertTrue(source.contains("onDismiss:"),
                      "quelle que soit la façon de fermer (Plus tard, glisser, numéro vérifié), la recherche CONTINUE")
    }

    func test_catalog_phonePromptKeysAreTranslatedInSevenLanguages() throws {
        let url = MyStoriesSourceCorpus.appRoot().appendingPathComponent(Self.catalog)
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let strings = try XCTUnwrap(json?["strings"] as? [String: Any])
        let keys = [
            "contacts.phonePrompt.title",
            "contacts.phonePrompt.benefit",
            "contacts.phonePrompt.add",
            "contacts.phonePrompt.later",
            "contacts.phonePrompt.later.a11y",
        ]
        for key in keys {
            let entry = try XCTUnwrap(strings[key] as? [String: Any], "clé \(key) absente du catalogue")
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])
            XCTAssertEqual(Set(localizations.keys), Self.sevenLanguages, "\(key) : sept langues")
        }
    }
}
