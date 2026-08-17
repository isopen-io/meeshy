import XCTest
@testable import Meeshy

/// Témoin de structure OFF (R-133) — « l'écran n'existe pas drapeau OFF,
/// aucun modificateur monté, même discipline que R-a/`LentilleStickyHeaderInsetModifier` ».
///
/// Ce lot livre la PEAU (`Riviere/View/`) et son drapeau
/// (`LentilleFeatureFlag.riviereMode`), mais AUCUN site de montage : ni
/// `ConversationView.swift`, ni `LentilleModeMenu.swift` (qui garde Rivière
/// TOUJOURS grisée « jusqu'à R-133 » — dégrisage réel = R-135), ni aucun
/// autre fichier du dépôt ne référence `RiverStreamHost`. Le snapshot OFF
/// est donc identique NON PAS parce qu'un gate applicatif le décide (ce qui
/// pourrait se tromper), mais parce qu'AUCUN call site n'existe encore — la
/// preuve la plus forte possible qu'aucun bit de rendu n'a bougé.
///
/// Ce témoin verrouille cet état : si un futur lot (R-135) monte
/// effectivement l'écran, il doit AUSSI mettre à jour/retirer cette suite —
/// jamais la laisser rougir en silence en croyant à une régression.
final class RiverScreenNotMountedTests: XCTestCase {

    private static var meeshyRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Riviere
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    /// Tout `.swift` sous `Meeshy/`, HORS `Features/Main/Riviere/` (le
    /// producteur légitime) — découvert, jamais recopié.
    private func nonRiviereSwiftFiles() throws -> [URL] {
        var results: [URL] = []
        let riviereRoot = Self.meeshyRoot.appendingPathComponent("Features/Main/Riviere")
        guard let enumerator = FileManager.default.enumerator(
            at: Self.meeshyRoot,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            XCTFail("Impossible d'énumérer \(Self.meeshyRoot.path)")
            return []
        }
        for case let url as URL in enumerator {
            if url.path.hasPrefix(riviereRoot.path) {
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
        let files = try nonRiviereSwiftFiles()
        XCTAssertFalse(files.isEmpty, "Aucun fichier .swift découvert hors Riviere/ — vérifier le chemin de scan.")
    }

    /// `RiverStreamHost` — l'hôte de l'écran — n'apparaît NULLE PART hors de
    /// `Riviere/` : aucun call site ne le monte encore.
    func test_riverStreamHost_isReferencedNowhereOutsideRiviere() throws {
        for url in try nonRiviereSwiftFiles() {
            guard let code = try? String(contentsOf: url, encoding: .utf8) else { continue }
            XCTAssertFalse(
                code.contains("RiverStreamHost"),
                "\(url.lastPathComponent) référence `RiverStreamHost` — l'écran Rivière ne doit " +
                "être monté nulle part par ce lot (R-133 livre la peau, pas son point d'entrée " +
                "dans l'app — R-135). Si ce fichier est le nouveau site de montage légitime, " +
                "mettre à jour ce témoin en le documentant plutôt que de le supprimer."
            )
        }
    }

    /// Le menu de mode garde SA raison d'être grisée TOUJOURS (documentée
    /// dans son propre commentaire de tête) — cette garde re-prouve que
    /// R-133 n'a pas touché `LentilleModeMenu.swift` en douce.
    func test_modeMenu_stillHardcodesRiviereAsAlwaysDisabled() throws {
        let url = Self.meeshyRoot.appendingPathComponent("Features/Main/Lentille/Mode/LentilleModeMenu.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            code.contains("isDisabled = true"),
            "LentilleModeMenu.swift ne grise plus Rivière en dur — si ce lot (R-133) a dégrisé " +
            "le menu, c'est en réalité R-135 (dégrisage, 3 plateformes) qui vient d'être livré : " +
            "documenter le changement plutôt que de laisser ce témoin rougir en silence."
        )
    }
}
