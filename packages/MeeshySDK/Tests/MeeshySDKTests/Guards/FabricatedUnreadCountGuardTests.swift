import XCTest

/// **Aucune vue ne FABRIQUE un non-lu.** (#6998)
///
/// `RootView.navigateToConversationById` portait un paramètre `ensureUnread`
/// qui, à la seule ouverture par notification, posait
/// `conv.userState.unreadCount = 1` sur une copie locale de la ligne — hors de
/// tout store, hors du cache, hors de toute règle. La conversation s'ouvrait
/// donc sur un non-lu FICTIF : séparateur « nouveaux messages » au-dessus d'un
/// message déjà lu, et une pastille inventée dans l'agrégat. Le deep link
/// `/c/:id` du même écran ne le faisait pas : deux chemins vers la MÊME
/// conversation ne montraient pas la même chose. La jumelle iPad portait le
/// même paramètre, aux mêmes trois endroits.
///
/// Ce cliquet interdit le RETOUR du motif, et il est volontairement asymétrique :
///
/// | écriture | verdict | pourquoi |
/// |---|---|---|
/// | `userState.unreadCount = 0` | **autorisée** | c'est l'optimistic update de « j'ai lu » : la pastille tombe dans le tour de boucle du geste |
/// | `userState.unreadCount = <autre chose>` | **refusée** | ALLUMER une pastille est une information, et une information vient du serveur ou du registre — jamais d'une vue |
///
/// Le registre (`ConversationReadLedger`) est le seul endroit où un non-lu non
/// nul se pose, et il ne le fait qu'en réponse à un événement nommé.
final class FabricatedUnreadCountGuardTests: XCTestCase {

    private static let appTree = "apps/ios/Meeshy"

    func test_aucunSiteDeLAppNAllumeUnNonLuALaMain() throws {
        let offenders = try nonZeroUnreadAssignments()
        XCTAssertTrue(
            offenders.isEmpty,
            """
            Ces sites POSENT un compteur de non-lus non nul à la main :

            \(offenders.joined(separator: "\n"))

            Allumer une pastille est une information, pas une décision de vue. \
            Elle vient du serveur (`conversation:unread-updated`, \
            `read-status:updated`) ou du registre de lecture \
            (`ConversationReadLedger.apply(.localMarkUnread(…))`, qui porte la \
            règle « au moins 1, et le serveur reste autoritaire sur le compte \
            exact »). Seul `= 0` reste autorisé : c'est l'optimistic update de \
            la lecture.
            """
        )
    }

    /// Un balayage qui ne voit rien serait VERT pour la pire des raisons. Les
    /// deux zéros légitimes de `ConversationListViewModel.clearUnreadLocally`
    /// prouvent que le détecteur trouve bien la FORME qu'il mesure — sans eux,
    /// il pourrait être cassé sans que personne ne le sache.
    func test_leDetecteurVoitBienLesEcrituresLegitimes() throws {
        let zeros = try unreadAssignments().filter { $0.value == "0" }
        XCTAssertFalse(
            zeros.isEmpty,
            "aucune écriture `userState.unreadCount = 0` trouvée sous \(Self.appTree) — le détecteur ne mesure plus rien"
        )
    }

    /// **Le détecteur est mis à l'épreuve sur les LIGNES EXACTES du défaut**,
    /// relevées dans `RootView.swift` avant sa suppression. Un cliquet dont on
    /// ne montre pas qu'il mord sur le code qu'il refuse n'a pas été vérifié —
    /// il a été écrit.
    func test_leDetecteurAuraitAttrapeEnsureUnread() {
        XCTAssertEqual(
            Self.assignedUnreadValues("                conv.userState.unreadCount = 1"),
            ["1"]
        )
        // La ligne compacte, celle où le nom apparaît DEUX fois.
        XCTAssertEqual(
            Self.assignedUnreadValues(
                "                if ensureUnread && c.userState.unreadCount == 0 { c.userState.unreadCount = 1 }"
            ),
            ["1"]
        )
        // Ce qu'il ne doit PAS attraper.
        XCTAssertEqual(Self.assignedUnreadValues("        conversations[idx].userState.unreadCount = 0"), ["0"])
        XCTAssertEqual(Self.assignedUnreadValues("            case .unread: return c.userState.unreadCount > 0"), [])
        XCTAssertEqual(Self.assignedUnreadValues("where a.userState.unreadCount != b.userState.unreadCount {"), [])
        XCTAssertEqual(Self.assignedUnreadValues("if conv.userState.unreadCount == 0 {"), [])
        XCTAssertEqual(Self.assignedUnreadValues("// conv.userState.unreadCount = 1"), [])
    }

    // MARK: - Mesure

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Tests/MeeshySDKTests/Guards
            .deletingLastPathComponent()   // .../Tests/MeeshySDKTests
            .deletingLastPathComponent()   // .../Tests
            .deletingLastPathComponent()   // .../MeeshySDK
            .deletingLastPathComponent()   // .../packages
            .deletingLastPathComponent()   // racine du dépôt
    }

    private func nonZeroUnreadAssignments() throws -> [String] {
        try unreadAssignments()
            .filter { $0.value != "0" }
            .map { "\($0.site) — `\($0.value)`" }
            .sorted()
    }

    private func unreadAssignments() throws -> [(site: String, value: String)] {
        let root = repoRoot()
        let treeURL = root.appendingPathComponent(Self.appTree)
        guard let walker = FileManager.default.enumerator(at: treeURL, includingPropertiesForKeys: nil) else {
            return []
        }
        var out: [(site: String, value: String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            let lines = try String(contentsOf: url, encoding: .utf8)
                .split(separator: "\n", omittingEmptySubsequences: false)
            for (index, raw) in lines.enumerated() {
                for value in Self.assignedUnreadValues(String(raw)) {
                    out.append((site: "\(relative):\(index + 1)", value: value))
                }
            }
        }
        return out
    }

    /// Rend TOUTES les valeurs assignées à `userState.unreadCount` sur cette
    /// ligne.
    ///
    /// **Toutes, et pas la première** : la forme exacte du défaut tenait sur
    /// une seule ligne où le nom apparaît DEUX fois —
    /// `if ensureUnread && c.userState.unreadCount == 0 { c.userState.unreadCount = 1 }`.
    /// Un détecteur qui s'arrête à la première occurrence y lit une
    /// COMPARAISON, conclut « rien à voir », et laisse passer l'assignation
    /// qui suit sur la même ligne. C'est le piège classique du détecteur par
    /// sous-chaîne, et il aurait rendu ce cliquet vert sur le code même qu'il
    /// existe pour refuser.
    ///
    /// Le prédicat écarte les commentaires, les comparaisons (`==`, `!=`,
    /// `>=`, `<=`) et les arguments nommés (`unreadCount: 3`, qui
    /// CONSTRUISENT une valeur au lieu de muter une ligne affichée). Il ne
    /// prétend pas lire du Swift : il pose un cran sur la forme que le défaut
    /// prenait, et qu'un correctif reprendrait.
    static func assignedUnreadValues(_ line: String) -> [String] {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard !trimmed.hasPrefix("//"), !trimmed.hasPrefix("*") else { return [] }
        let needle = "userState.unreadCount"
        var values: [String] = []
        var cursor = trimmed.startIndex
        while let range = trimmed.range(of: needle, range: cursor..<trimmed.endIndex) {
            cursor = range.upperBound
            let after = trimmed[range.upperBound...].trimmingCharacters(in: .whitespaces)
            guard after.hasPrefix("=") else { continue }
            let rhs = after.dropFirst().trimmingCharacters(in: .whitespaces)
            // `==` (comparaison) : le second `=` survit au `dropFirst`.
            guard !rhs.hasPrefix("=") else { continue }
            // La valeur s'arrête au premier séparateur d'instruction — sur une
            // ligne compacte (`{ x = 1 }`), tout ce qui suit appartient à la
            // syntaxe de l'hôte, pas à la valeur assignée.
            let value = rhs.prefix { $0 != ";" && $0 != "}" }.trimmingCharacters(in: .whitespaces)
            guard !value.isEmpty else { continue }
            values.append(value)
        }
        return values
    }
}
