import Foundation
import XCTest

/// **Une écriture persistante de l'app n'échoue plus en silence.** (#11473)
///
/// `try? await store.save(…)` jette l'erreur : un disque plein, une base
/// verrouillée ou un encodage cassé ne laissent aucune trace, et le cache
/// diverge sans que personne puisse le dire. `bestEffort(_:category:_:)`
/// garde le même flux (non bloquant, résultat ignoré, annulation silencieuse)
/// mais journalise toute autre erreur.
///
/// Ce cliquet compte, ligne par ligne, les écritures silencieuses restantes
/// et ne tolère que celles de `allowance`. Il tient dans les deux sens : un
/// fichier absent de la table n'en a pas le droit, et un nom qui n'écrit plus
/// en silence doit sortir de la table.
final class SilentPersistenceWriteGuardTests: XCTestCase {

    private static let allowance: [String: Int] = [
        "apps/ios/Meeshy/Features/Contacts/AffiliatesViewModel.swift": 1,
        "apps/ios/Meeshy/Features/Contacts/CallsViewModel.swift": 1,
        "apps/ios/Meeshy/Features/Contacts/ContactsListViewModel.swift": 2,
        "apps/ios/Meeshy/Features/Contacts/PhonebookViewModel.swift": 1,
        "apps/ios/Meeshy/Features/Contacts/RequestsViewModel.swift": 1,
        "apps/ios/Meeshy/Features/Main/Components/MentionContactsStore.swift": 1,
        "apps/ios/Meeshy/Features/Main/Game/GameReferralLink.swift": 1,
        "apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+StoreObservation.swift": 2,
        "apps/ios/Meeshy/Features/Main/ViewModels/FeedSocketHandler.swift": 1,
        "apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift": 13,
        "apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift": 1,
        "apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift": 3,
        "apps/ios/Meeshy/Features/Main/Views/CommunityLinksView.swift": 1,
        "apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet+Loading.swift": 3,
        "apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift": 2,
        "apps/ios/Meeshy/Features/Main/Views/ProfileView.swift": 1,
        "apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift": 4,
        "apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift": 2,
        "apps/ios/Meeshy/Features/Main/Views/TrackingLinksView.swift": 1,
    ]

    private static let scannedTrees = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyNotificationContentExtension",
        "apps/ios/MeeshyWidgets",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyBroadcastExtension",
    ]

    private static let silentWritePattern = #"try\?\s*await\s+[A-Za-z_.]*\.(save|applyEvent|upsert|write)"#

    func test_aucuneEcriturePersistanteSilencieuseHorsTolerance() throws {
        let counts = try silentWriteCounts()
        for (path, count) in counts.sorted(by: { $0.key < $1.key }) {
            let tolerated = Self.allowance[path] ?? 0
            XCTAssertLessThanOrEqual(
                count, tolerated,
                """
                \(path) contient \(count) écriture(s) persistante(s) \
                silencieuse(s) (`try? await …save`) pour \(tolerated) tolérée(s).

                Utiliser `await bestEffort("<domaine>.<magasin>.<verbe>", \
                category: .cache) { try await … }` : même flux, mais l'échec \
                est journalisé.
                """
            )
        }
    }

    func test_laTableNeGardePasDeNomQuiNEcritPlus() throws {
        let counts = try silentWriteCounts()
        for (path, tolerated) in Self.allowance.sorted(by: { $0.key < $1.key }) {
            XCTAssertGreaterThan(
                counts[path] ?? 0, 0,
                """
                \(path) est encore listé pour \(tolerated) écriture(s) \
                silencieuse(s) et n'en contient plus aucune. Retirer son nom \
                de `allowance`.
                """
            )
        }
    }

    func test_leBalayageVoitBienLArbre() throws {
        let app = repoRoot().appendingPathComponent("apps/ios/Meeshy")
        var isDirectory: ObjCBool = false
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: app.path, isDirectory: &isDirectory) && isDirectory.boolValue,
            "apps/ios/Meeshy est introuvable depuis \(repoRoot().path)"
        )
        let lines = try swiftSources(in: "apps/ios/Meeshy")
            .reduce(0) { $0 + $1.source.split(separator: "\n", omittingEmptySubsequences: false).count }
        XCTAssertGreaterThan(lines, 500, "le balayage ne lit presque rien : le détecteur est aveugle")
    }

    func test_leDetecteurReconnaitLesFormesDuDepot() {
        let recognised = [
            #"try? await CacheCoordinator.shared.feed.save(p, for: "k")"#,
            "_ = try? await messagePersistence.applyEvent(localId: id, event: .retryExhausted)",
            "try? await persistence.upsertPostTranslation(",
            #"Task { try? await CacheCoordinator.shared.shareLinks.save(snapshot, for: "list") }"#,
        ]
        let ignored = [
            #"await bestEffort("feed.cache.save", category: .cache) { try await feed.save(p, for: "k") }"#,
            "if let v = try? await store.load(for: k)",
            "// try? await x.save(y)",
            "/// try? await x.save(y)",
            "* try? await x.save(y)",
        ]
        recognised.forEach { XCTAssertTrue(Self.isSilentWrite($0), $0) }
        ignored.forEach { XCTAssertFalse(Self.isSilentWrite($0), $0) }
    }

    static func isSilentWrite(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard !trimmed.hasPrefix("//"), !trimmed.hasPrefix("*") else { return false }
        return trimmed.range(of: silentWritePattern, options: .regularExpression) != nil
    }

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func swiftSources(in tree: String) throws -> [(relative: String, source: String)] {
        let root = repoRoot()
        let treeURL = root.appendingPathComponent(tree)
        guard let walker = FileManager.default.enumerator(at: treeURL, includingPropertiesForKeys: nil) else {
            return []
        }
        return try walker.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map { url in
                let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
                return (relative, try String(contentsOf: url, encoding: .utf8))
            }
    }

    private func silentWriteCounts() throws -> [String: Int] {
        var counts: [String: Int] = [:]
        for tree in Self.scannedTrees {
            for (relative, source) in try swiftSources(in: tree) {
                let hits = source
                    .split(separator: "\n", omittingEmptySubsequences: false)
                    .filter { Self.isSilentWrite(String($0)) }
                    .count
                if hits > 0 { counts[relative] = hits }
            }
        }
        return counts
    }
}
