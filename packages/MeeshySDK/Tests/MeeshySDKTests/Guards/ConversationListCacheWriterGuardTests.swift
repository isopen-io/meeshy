import XCTest

/// **Qui a le droit de REMPLACER le blob du cache « list » ?** (#6997)
///
/// Le cache GRDB des conversations range la liste entière sous UNE clé,
/// `"list"`, et deux formes d'écriture y coexistent :
///
/// | forme | ce qu'elle fait | où elle vit |
/// |---|---|---|
/// | `update(for: "list") { … }` | lit-modifie-réécrit UNE ligne | uniquement dans `ConversationSyncEngine*` |
/// | `save` / `savePreservingFreshness` | **REMPLACE le blob entier** | c'est ce que ce cliquet mesure |
///
/// Seule la seconde peut graver un instantané PÉRIMÉ par-dessus une lecture
/// déjà faite — et la graver durablement, puisque le cache survit au
/// redémarrage. `ConversationSyncEngine.saveSorted` est le seul de ces
/// écrivains à réconcilier le non-lu avant de persister
/// (`reconcileUnread` : conversation ouverte ⇒ 0, frontière locale postérieure
/// au dernier message ⇒ 0). Les autres écrivent ce que leur appelant tient en
/// mémoire, sans règle.
///
/// Ce cliquet n'exige pas — pas encore — qu'il n'y en ait qu'UN : il interdit
/// qu'il en apparaisse un de plus, et que ceux qui restent se multiplient. La
/// réduction à un seul écrivain est portée par le registre de lecture unique
/// (#6998), qui commence par faire disparaître `RootView.ensureUnread` — le
/// seul écrivain qui FABRIQUE un compteur (`unreadCount = 1`) au lieu d'en
/// relayer un.
///
/// > Un inventaire qui ne rougit pas quand il s'allonge n'est pas un
/// > inventaire, c'est un commentaire.
final class ConversationListCacheWriterGuardTests: XCTestCase {

    /// Chemins RELATIFS à la racine du dépôt → nombre d'écritures en bloc
    /// tolérées. **Ce nombre ne monte jamais** ; un fichier absent de cette
    /// table n'a pas le droit d'en contenir une seule.
    ///
    /// Mesuré le 2026-09-18 sur `dev` :
    /// - `ConversationSyncEngine.saveSorted` — le chokepoint réconcilié (1) ;
    /// - `ConversationListViewModel` — `schedulePersist` (1) et les deux
    ///   chemins de `loadMore`, épuisé et nominal (2) ;
    /// - `RootView.ensureUnread` — l'écrivain qui invente la ligne « 1 »,
    ///   supprimé par #6998 (1).
    private static let allowance: [String: Int] = [
        "packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift": 1,
        "apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift": 3,
        "apps/ios/Meeshy/Features/Main/Views/RootView.swift": 1,
    ]

    /// Les deux arbres Swift qui peuvent atteindre `CacheCoordinator`.
    private static let scannedTrees = [
        "apps/ios/Meeshy",
        "packages/MeeshySDK/Sources",
    ]

    func test_aucunNouvelEcrivainDuBlobListeNApparait() throws {
        let counts = try blockWriteCounts()

        for (path, count) in counts.sorted(by: { $0.key < $1.key }) {
            let tolerated = Self.allowance[path] ?? 0
            XCTAssertLessThanOrEqual(
                count, tolerated,
                """
                \(path) contient \(count) écriture(s) EN BLOC du cache « list » \
                pour \(tolerated) tolérée(s).

                Une écriture en bloc remplace l'instantané entier : elle grave \
                ce que son appelant tient en mémoire, y compris un non-lu \
                périmé, et le cache survit au redémarrage. Faire passer le \
                besoin par `ConversationSyncEngine` (qui réconcilie avant de \
                persister) plutôt que d'ajouter un écrivain — ou, pour une \
                seule ligne, par `update(for: "list")`.
                """
            )
        }
    }

    /// L'autre moitié du cliquet : un fichier qui QUITTE la table doit en
    /// sortir. Sans cette règle, une entrée obsolète laisserait du mou — un
    /// futur écrivain pourrait réapparaître dans un fichier « déjà autorisé »
    /// sans que rien ne rougisse.
    func test_laTableNeGardePasDeNomQuiNEcritPlus() throws {
        let counts = try blockWriteCounts()
        for (path, tolerated) in Self.allowance.sorted(by: { $0.key < $1.key }) {
            XCTAssertGreaterThan(
                counts[path] ?? 0, 0,
                """
                \(path) est encore listé pour \(tolerated) écriture(s) en bloc \
                du cache « list », et n'en contient plus aucune. Retirer son \
                nom de `allowance` — un inventaire qui garde un nom mort \
                rouvre la porte en silence.
                """
            )
        }
    }

    /// Un balayage qui ne voit rien serait VERT pour la pire des raisons.
    func test_leBalayageVoitBienLesDeuxArbres() throws {
        for tree in Self.scannedTrees {
            let url = repoRoot().appendingPathComponent(tree)
            var isDirectory: ObjCBool = false
            XCTAssertTrue(
                FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
                    && isDirectory.boolValue,
                "\(tree) est introuvable depuis \(repoRoot().path) — l'arbre a-t-il bougé ?"
            )
        }
        let total = try blockWriteCounts().values.reduce(0, +)
        XCTAssertGreaterThan(total, 0, "aucune écriture trouvée : le détecteur ne mesure plus rien")
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

    /// Compte, par fichier, les appels qui REMPLACENT le blob de la clé
    /// « list ». Le prédicat tient sur une ligne parce que les deux moitiés y
    /// tiennent : `save…(` et la clé. Un appel qui les séparerait sur deux
    /// lignes échapperait au détecteur — la garde ne prétend pas lire du
    /// Swift, elle pose un cran sur une écriture qui s'écrit toujours ainsi
    /// dans ce dépôt (mesuré : 5/5 sites).
    private func blockWriteCounts() throws -> [String: Int] {
        let root = repoRoot()
        var counts: [String: Int] = [:]
        for tree in Self.scannedTrees {
            let treeURL = root.appendingPathComponent(tree)
            guard let walker = FileManager.default.enumerator(at: treeURL, includingPropertiesForKeys: nil) else {
                continue
            }
            for case let url as URL in walker where url.pathExtension == "swift" {
                let source = try String(contentsOf: url, encoding: .utf8)
                let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
                let hits = source
                    .split(separator: "\n", omittingEmptySubsequences: false)
                    .filter { Self.isBlockWrite(String($0)) }
                    .count
                if hits > 0 { counts[relative] = hits }
            }
        }
        return counts
    }

    /// Une écriture en bloc : `conversations.save(…)` ou
    /// `conversations.savePreservingFreshness(…)` visant la clé « list ».
    /// `saveCursor` en est exclu — il n'écrit que la pagination, jamais les
    /// lignes. Les lignes de COMMENTAIRE sont écartées : le ViewModel en cite
    /// une dans sa doc-comment de stratégie de cache, et compter une citation
    /// comme un appel ferait mentir le cran.
    static func isBlockWrite(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard !trimmed.hasPrefix("//"), !trimmed.hasPrefix("///"), !trimmed.hasPrefix("*") else { return false }
        guard trimmed.contains("conversations.save") else { return false }
        guard !trimmed.contains("conversations.saveCursor") else { return false }
        return trimmed.contains("\"list\"") || trimmed.contains("for: cacheKey")
    }
}
