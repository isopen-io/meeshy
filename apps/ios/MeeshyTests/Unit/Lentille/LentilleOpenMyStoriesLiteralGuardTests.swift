import XCTest
@testable import Meeshy

/// R-j (réserve tracée Porte V1, `tasks/lentille-workshop-execution.md` §8,
/// notes REV-3 de la ligne V3) : re-preuve — QUATRE sites répétaient le
/// littéral `Notification.Name("openMyStories")` sans domicile partagé :
/// `RootView.swift` et `iPadRootView.swift` (écouteurs, les deux racines) ;
/// `ConversationListView.swift` (rail « moi ») et `ProfileUserPostsList.swift`
/// (tuile Stories du profil), tous deux émetteurs. Le correctif introduit
/// `Notification.Name.openMyStories` (déclarée UNE fois, `RootView.swift` —
/// l'une des deux racines qui observent ce nom, même patron que
/// `Router.meeshyNavigateToConversation`) ; les quatre sites d'usage la
/// consomment désormais par le membre statique, jamais par la chaîne.
///
/// Cette suite garde la source qui INTERDIT le retour du littéral : les
/// quatre fichiers ne doivent plus contenir `Notification.Name("openMyStories")`
/// nulle part — la SEULE occurrence de la chaîne littérale `"openMyStories"`
/// dans tout ce périmètre doit être celle de la déclaration elle-même.
final class LentilleOpenMyStoriesLiteralGuardTests: XCTestCase {

    // MARK: - Localisation des sources

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    /// Les quatre sites re-prouvés — DÉCOUVERTS par leur rôle documenté dans
    /// le contrat (2 écouteurs racines + 2 émetteurs), jamais une liste plus
    /// large : ce périmètre est celui de la réserve R-j, pas un scan global
    /// du dépôt.
    private static let guardedFiles: [String] = [
        "Meeshy/Features/Main/Views/RootView.swift",
        "Meeshy/Features/Main/Views/iPadRootView.swift",
        "Meeshy/Features/Main/Views/ConversationListView.swift",
        "Meeshy/Features/Main/Views/ProfileUserPostsList.swift"
    ]

    private func sources() throws -> [(name: String, code: String)] {
        try Self.guardedFiles.map { relativePath in
            let url = Self.iosRoot.appendingPathComponent(relativePath)
            return (relativePath, try String(contentsOf: url, encoding: .utf8))
        }
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    // MARK: - Garde d'ensemble (leçon 257)

    func test_guardActuallyLoadsAllFourFiles_neverSilentlyEmpty() throws {
        let loaded = try sources()
        XCTAssertEqual(
            loaded.count, 4,
            "cette garde doit charger EXACTEMENT les 4 fichiers re-prouvés par R-j — un chemin " +
            "manquant ferait passer la suite au vert sans avoir rien vérifié (leçon 257)."
        )
        for file in loaded {
            XCTAssertFalse(file.code.isEmpty, "\(file.name) : contenu vide, vérifier le chemin résolu depuis #filePath.")
        }
    }

    // MARK: - Zéro appel recopiant `Notification.Name("openMyStories")`

    func test_none_ofTheFourSites_reconstructTheRawNotificationNameLiteral() throws {
        for source in try sources() {
            let stripped = AppSourceGuard.stripComments(source.code)
            let count = occurrences(of: "Notification.Name(\"openMyStories\")", in: stripped)
            XCTAssertEqual(
                count, 0,
                "\(source.name) contient \(count) occurrence(s) de " +
                "`Notification.Name(\"openMyStories\")` — le littéral doit passer EXCLUSIVEMENT " +
                "par la constante partagée `.openMyStories` (extension déclarée dans " +
                "`RootView.swift`), jamais recopié en dur (garde R-j)."
            )
        }
    }

    /// La chaîne brute `"openMyStories"` elle-même ne doit apparaître qu'une
    /// SEULE fois dans tout le périmètre gardé — celle de la déclaration de
    /// la constante (`static let openMyStories = Notification.Name("openMyStories")`,
    /// `RootView.swift`). Ce témoin est plus strict que le précédent : il
    /// attrape aussi une éventuelle réintroduction sous une forme qui
    /// contournerait le motif exact `Notification.Name("openMyStories")`
    /// (espace différent, retour à la ligne entre parenthèses, etc.).
    func test_rawStringLiteral_appearsExactlyOnce_acrossTheGuardedScope_atTheDeclaration() throws {
        var totalOccurrences = 0
        var declarationSiteCount = 0
        for source in try sources() {
            let stripped = AppSourceGuard.stripComments(source.code)
            let count = occurrences(of: "\"openMyStories\"", in: stripped)
            totalOccurrences += count
            if source.name.hasSuffix("RootView.swift") && !source.name.contains("iPad") {
                declarationSiteCount = occurrences(
                    of: "static let openMyStories = Notification.Name(\"openMyStories\")",
                    in: stripped
                )
            }
        }
        XCTAssertEqual(
            totalOccurrences, 1,
            "la chaîne brute « openMyStories » doit apparaître EXACTEMENT une fois dans tout le " +
            "périmètre des 4 fichiers gardés — celle de la déclaration de la constante. Trouvé " +
            "\(totalOccurrences) occurrence(s) : un site recopie encore le littéral (R-j)."
        )
        XCTAssertEqual(
            declarationSiteCount, 1,
            "la déclaration `static let openMyStories = Notification.Name(\"openMyStories\")` " +
            "doit exister, EXACTEMENT une fois, dans `RootView.swift` — introuvable ou dupliquée."
        )
    }

    // MARK: - Les quatre sites consomment bien la constante partagée

    func test_rootView_listensViaTheSharedConstant() throws {
        let stripped = AppSourceGuard.stripComments(try sources()[0].code)
        XCTAssertTrue(
            stripped.contains("NotificationCenter.default.publisher(for: .openMyStories)"),
            "RootView.swift doit écouter via `NotificationCenter.default.publisher(for: .openMyStories)`."
        )
    }

    func test_iPadRootView_listensViaTheSharedConstant() throws {
        let stripped = AppSourceGuard.stripComments(try sources()[1].code)
        XCTAssertTrue(
            stripped.contains("NotificationCenter.default.publisher(for: .openMyStories)"),
            "iPadRootView.swift doit écouter via `NotificationCenter.default.publisher(for: .openMyStories)`."
        )
    }

    func test_conversationListView_postsViaTheSharedConstant() throws {
        let stripped = AppSourceGuard.stripComments(try sources()[2].code)
        XCTAssertTrue(
            stripped.contains("NotificationCenter.default.post(name: .openMyStories, object: nil)"),
            "ConversationListView.swift (rail « moi ») doit poster via `.openMyStories`."
        )
    }

    func test_profileUserPostsList_postsViaTheSharedConstant() throws {
        let stripped = AppSourceGuard.stripComments(try sources()[3].code)
        XCTAssertTrue(
            stripped.contains("NotificationCenter.default.post(name: .openMyStories, object: nil)"),
            "ProfileUserPostsList.swift (tuile Stories du profil) doit poster via `.openMyStories`."
        )
    }
}
