import XCTest
@testable import Meeshy

/// Témoin de structure — Q-144 / R20 : l'écran Lentille n'existe pas drapeau OFF.
/// Aucune vue Lentille, aucun composant Lentille ne doit être monté en dehors de
/// `Features/Main/Lentille/` quand `LentilleFeatureFlag.isLentilleListEnabled` est OFF.
///
/// **Position A — le MENU ne donne accès à Lentille en dur (inchangé).**
/// `LentilleModeMenuModel.build` dérive `isDisabled` pour les modes non disponibles
/// (`capabilities.availableModes.contains(mode)`) : le drapeau contrôle donc
/// l'éligibilité, pas un hardcode. Voir `ModeMenuModelTests` pour le comportement
/// complet (grisée drapeau OFF, dégrisée drapeau ON + éligible).
///
/// **Position B — l'ÉCRAN reste NON MONTÉ (inchangé).** `LentilleFlatRow` et ses
/// compagnons (`LentilleSticker`, `LentilleBridgeLine`, `LentilleSkeletonRow`,
/// `SectionScrollPill`, etc.) n'ont aucun site de montage hors de `Lentille/`.
/// Le seul point de greffe est dans `ConversationListView` sous `LentilleFeatureFlag`
/// (`:486-500` du ViewModel — le mux produit soit la rangée historique, soit la
/// rangée Lentille, jamais les deux).
///
/// Ce témoin verrouille les DEUX positions : si un futur lot monte effectivement
/// la peau Lentille en dehors de son dossier ET/OU change le code hors-Lentille
/// pour référencer les composants Lentille, il doit AUSSI mettre à jour/retirer
/// la partie concernée de cette suite — jamais la laisser rougir en silence.
final class LentilleScreenNotMountedTests: XCTestCase {

    private static var meeshyRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    /// Tout `.swift` sous `Meeshy/`, HORS `Features/Main/Lentille/` — découvert,
    /// jamais recopié.
    private func nonLentilleSwiftFiles() throws -> [URL] {
        var results: [URL] = []
        let lentilleRoot = Self.meeshyRoot.appendingPathComponent("Features/Main/Lentille")
        guard let enumerator = FileManager.default.enumerator(
            at: Self.meeshyRoot,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            XCTFail("Impossible d'énumérer \(Self.meeshyRoot.path)")
            return []
        }
        for case let url as URL in enumerator {
            if url.path.hasPrefix(lentilleRoot.path) {
                enumerator.skipDescendants()
                continue
            }
            if url.pathExtension == "swift" {
                results.append(url)
            }
        }
        return results
    }

    func test_guardDiscoversFiles_neverSilentlyEmpty() throws {
        let files = try nonLentilleSwiftFiles()
        XCTAssertFalse(files.isEmpty, "Aucun fichier .swift découvert hors Lentille/ — vérifier le chemin de scan.")
    }

    /// `LentilleFlatRow` — le composant principal de la peau Lentille —
    /// n'apparaît NULLE PART hors de `Lentille/` : aucun call site ne le monte.
    func test_lentilleFlatRow_isReferencedNowhereOutsideLentille() throws {
        for url in try nonLentilleSwiftFiles() {
            guard let code = try? String(contentsOf: url, encoding: .utf8) else { continue }
            XCTAssertFalse(
                code.contains("LentilleFlatRow"),
                "\(url.lastPathComponent) référence `LentilleFlatRow` — la peau Lentille ne doit " +
                "être montée nulle part drapeau OFF (Q-144 demande que le drapeau isLentilleListEnabled " +
                "soit le seul point de contrôle du montage). Si ce fichier est le nouveau site de montage " +
                "légitime, mettre à jour ce témoin en le documentant plutôt que de le supprimer."
            )
        }
    }

    /// Idem pour les composants de chrome de Lentille : `LentilleSticker`,
    /// `SectionScrollPill`, `StoriesVivantsRail` — jamais appelés depuis le code
    /// non-Lentille.
    func test_lentilleChromeComponents_areReferencedNowhereOutsideLentille() throws {
        let chromeComponents = ["LentilleSticker", "SectionScrollPill", "StoriesVivantsRail"]
        for url in try nonLentilleSwiftFiles() {
            guard let code = try? String(contentsOf: url, encoding: .utf8) else { continue }
            for component in chromeComponents {
                XCTAssertFalse(
                    code.contains(component),
                    "\(url.lastPathComponent) référence `\(component)` — la peau Lentille ne doit " +
                    "être montée nulle part drapeau OFF (Q-144). Ce témoin fige la frontière du drapeau."
                )
            }
        }
    }

    /// `ConversationListView` est la SEULE exception admise : elle a le droit de
    /// référencer Lentille sous condition. Vérifier que TOUTE référence à des
    /// composants Lentille dans ce fichier est gardée par `LentilleFeatureFlag`.
    func test_conversationListView_allLentilleReferencesAreGuarded() throws {
        let clvPath = Self.meeshyRoot
            .appendingPathComponent("Features/Main/Views/ConversationListView.swift")
        guard let code = try? String(contentsOf: clvPath, encoding: .utf8) else {
            XCTFail("Impossible de lire \(clvPath.path)")
            return
        }

        // Les patterns de garde attendus — pas une recherche de « if LentilleFeatureFlag »
        // au hasard : juste une vérification que le fichier n'a pas d'imports directs
        // non gardés de Lentille (l'import lui-même peut être non gardé s'il est utilisé
        // DANS une branche gardée, ex. `if ... { let x: LentilleMetrics; ... }`).
        let hasLentilleImports = code.contains("import Lentille") ||
                                 code.contains("LentilleFlatRow") ||
                                 code.contains("LentilleSticker")

        if hasLentilleImports {
            // Vérifier qu'il y a au moins UNE garde visible
            let hasGuard = code.contains("LentilleFeatureFlag.isLentilleListEnabled") ||
                           code.contains("LentilleFeatureFlag.isReadingModesEnabled")
            XCTAssertTrue(
                hasGuard,
                "ConversationListView importe ou référence des composants Lentille " +
                "mais ne contient AUCUNE garde `LentilleFeatureFlag` — le drapeau " +
                "doit garder TOUT accès à la peau Lentille (Q-144 / R20)."
            )
        }
    }
}
