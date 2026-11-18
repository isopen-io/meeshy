import XCTest

/// **Qui a le droit d'écrire une traduction sur le disque ?** (#18934)
///
/// `TranslationRecordWriter.upsert` — et sa façade `saveTranslation` — écrivent
/// la table `message_translations` sans regarder la ligne du message. Ce qui
/// décide qu'une traduction peut s'y garder est `MessageEnrichmentLaw`, et deux
/// sites seulement la consultent avant d'écrire : le socket
/// (`MessageEnrichmentWriter`, conversation ouverte ou fermée) et le REST
/// (`APIMessageUpsert.persistTranslations`). Un troisième écrivain contournerait
/// la loi sans que rien ne rougisse — une traduction en clair sous une vue unique
/// ouverte ou un message chiffré de bout en bout. Ce cliquet l'interdit, et
/// l'autre moitié du cliquet retire de la table un site qui n'écrit plus.
final class TranslationWriterCallSitesGuardTests: XCTestCase {

    /// L'appel → les seuls fichiers qui ont le droit de le faire.
    private static let allowance: [String: Set<String>] = [
        "TranslationRecordWriter.upsert(": [
            "packages/MeeshySDK/Sources/MeeshySDK/Persistence/APIMessageUpsert+Merge.swift",
            "packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+Mutations.swift",
        ],
        ".saveTranslation(": [
            "packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageEnrichmentWriter.swift",
        ],
    ]

    /// Les arbres Swift qui peuvent atteindre la base des messages.
    private static let scannedTrees = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "packages/MeeshySDK/Sources",
    ]

    func test_onlyTheWritersOfTheLawWriteATranslation() throws {
        let callers = try callSites()
        for (call, allowed) in Self.allowance.sorted(by: { $0.key < $1.key }) {
            let found = callers[call] ?? []
            XCTAssertEqual(
                found.subtracting(allowed).sorted(), [],
                """
                \(call) est appelé hors des écrivains de `MessageEnrichmentLaw`. \
                Faire passer l'écriture par `MessageEnrichmentWriter` (socket) ou par \
                `APIMessageUpsert.persistTranslations` (REST), qui consultent la loi.
                """
            )
            XCTAssertEqual(
                allowed.subtracting(found).sorted(), [],
                "\(call) n'est plus appelé par ces fichiers : retirer leur nom de `allowance`."
            )
        }
    }

    /// Un balayage qui ne voit rien serait VERT pour la pire des raisons.
    func test_theScanSeesTheTrees() throws {
        for tree in Self.scannedTrees {
            var isDirectory: ObjCBool = false
            let path = repoRoot().appendingPathComponent(tree).path
            XCTAssertTrue(
                FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) && isDirectory.boolValue,
                "\(tree) est introuvable depuis \(repoRoot().path)"
            )
        }
        XCTAssertFalse(try callSites().isEmpty, "aucun appel trouvé : le détecteur ne mesure plus rien")
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

    /// Par appel surveillé, les fichiers qui le font. Les lignes de commentaire
    /// sont écartées : une documentation qui cite l'appel n'écrit rien.
    private func callSites() throws -> [String: Set<String>] {
        let root = repoRoot()
        var sites: [String: Set<String>] = [:]
        for tree in Self.scannedTrees {
            guard let walker = FileManager.default.enumerator(
                at: root.appendingPathComponent(tree), includingPropertiesForKeys: nil
            ) else { continue }
            for case let url as URL in walker where url.pathExtension == "swift" {
                let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
                let code = try String(contentsOf: url, encoding: .utf8)
                    .split(separator: "\n", omittingEmptySubsequences: false)
                    .map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.hasPrefix("//") && !$0.hasPrefix("*") }
                for call in Self.allowance.keys where code.contains(where: { $0.contains(call) }) {
                    sites[call, default: []].insert(relative)
                }
            }
        }
        return sites
    }
}
