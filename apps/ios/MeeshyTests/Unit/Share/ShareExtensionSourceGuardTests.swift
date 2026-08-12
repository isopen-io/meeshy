import XCTest

/// Gardes contre la RÉAPPARITION des trois ruptures qui rendaient l'extension
/// de partage inerte tout en paraissant fonctionnelle :
///
/// 1. un repli de contacts fabriqués, qui masquait toute lecture cassée ;
/// 2. la lecture d'une clé App Group que personne n'écrit ;
/// 3. l'écriture d'une clé App Group que personne ne lit.
///
/// Les motifs sont cherchés APRÈS retrait des commentaires : sans ça, ce
/// fichier-ci et les commentaires d'explication du code produiraient des faux
/// positifs — piège déjà rencontré sur ce dépôt.
final class ShareExtensionSourceGuardTests: XCTestCase {

    private var extensionDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Share
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("MeeshyShareExtension", isDirectory: true)
    }

    private func swiftSources() throws -> [(name: String, code: String)] {
        let files = try FileManager.default.contentsOfDirectory(
            at: extensionDirectory,
            includingPropertiesForKeys: nil
        )
        return try files
            .filter { $0.pathExtension == "swift" }
            .map { (name: $0.lastPathComponent, code: try String(contentsOf: $0, encoding: .utf8)) }
    }

    /// Retire les commentaires `//` et `/* */` ainsi que le contenu des
    /// littéraux de chaîne, pour ne juger que du code exécuté.
    private func strippingComments(_ source: String) -> String {
        var output = ""
        var iterator = source.startIndex
        var inLineComment = false
        var inBlockComment = false

        while iterator < source.endIndex {
            let remaining = source[iterator...]
            if inLineComment {
                if source[iterator] == "\n" { inLineComment = false; output.append("\n") }
                iterator = source.index(after: iterator)
                continue
            }
            if inBlockComment {
                if remaining.hasPrefix("*/") {
                    inBlockComment = false
                    iterator = source.index(iterator, offsetBy: 2)
                    continue
                }
                iterator = source.index(after: iterator)
                continue
            }
            if remaining.hasPrefix("//") {
                inLineComment = true
                iterator = source.index(iterator, offsetBy: 2)
                continue
            }
            if remaining.hasPrefix("/*") {
                inBlockComment = true
                iterator = source.index(iterator, offsetBy: 2)
                continue
            }
            output.append(source[iterator])
            iterator = source.index(after: iterator)
        }
        return output
    }

    private func assertAbsent(_ needle: String, because reason: String) throws {
        for file in try swiftSources() {
            XCTAssertFalse(
                strippingComments(file.code).contains(needle),
                "\(file.name) contient encore « \(needle) » — \(reason)"
            )
        }
    }

    // MARK: - Les trois ruptures

    /// LA cause racine. Tant qu'un repli fabriqué existe, une lecture cassée
    /// affiche une liste plausible au lieu d'un écran vide : la panne devient
    /// invisible, ce qui lui a permis de survivre à trois itérations d'audit.
    func test_extension_hasNoFabricatedContactFallback() throws {
        try assertAbsent(
            "sampleContacts",
            because: "un repli fabriqué rend toute lecture cassée invisible ; la liste doit rester VIDE"
        )
    }

    func test_extension_doesNotReadTheOrphanRecentContactsKey() throws {
        try assertAbsent(
            "recent_contacts",
            because: "personne n'écrit cette clé ; la liste vient de recent_conversations"
        )
    }

    func test_extension_doesNotWriteTheOrphanPendingSharedContentKey() throws {
        try assertAbsent(
            "pending_shared_content",
            because: "personne ne lisait cette clé ; le relais différé passe par share_pending_sends/"
        )
    }

    /// L'extension est autonome : elle n'ouvre plus l'app, donc plus aucun
    /// deep link `?contactId=` que le parser ne sait pas interpréter.
    func test_extension_doesNotOpenTheHostAppWithAnUnparsedDeepLink() throws {
        try assertAbsent(
            "contactId=",
            because: "DeepLinkParser ne comprend que text=/url= ; l'extension poste elle-même"
        )
    }

    // MARK: - Cohérence de la portée annoncée

    /// Ne jamais s'annoncer pour un type qu'on ne sait pas traiter : Meeshy
    /// apparaîtrait dans la feuille de partage de Photos et y échouerait.
    func test_infoPlist_advertisesOnlyTextAndURL() throws {
        let plist = try String(
            contentsOf: extensionDirectory.appendingPathComponent("Info.plist"),
            encoding: .utf8
        )

        XCTAssertTrue(plist.contains("NSExtensionActivationSupportsText"))
        XCTAssertTrue(plist.contains("NSExtensionActivationSupportsWebURLWithMaxCount"))

        for unsupported in [
            "NSExtensionActivationSupportsImageWithMaxCount",
            "NSExtensionActivationSupportsMovieWithMaxCount",
            "NSExtensionActivationSupportsAttachmentsWithMinCount",
            "NSExtensionActivationSupportsAttachmentsWithMaxCount"
        ] {
            XCTAssertFalse(
                plist.contains(unsupported),
                "\(unsupported) annonce un type que le lot 1 ne sait pas envoyer"
            )
        }
    }

    /// Sans cet entitlement, la lecture du JWT renvoie `errSecItemNotFound`
    /// silencieusement et l'extension paraît « jamais connectée ».
    func test_entitlements_declareTheSharedKeychainGroup() throws {
        let entitlements = try String(
            contentsOf: extensionDirectory
                .appendingPathComponent("MeeshyShareExtension.entitlements"),
            encoding: .utf8
        )

        XCTAssertTrue(entitlements.contains("keychain-access-groups"))
        XCTAssertTrue(entitlements.contains("$(AppIdentifierPrefix)me.meeshy.app"))
        XCTAssertTrue(entitlements.contains("group.me.meeshy.apps"))
    }
}
