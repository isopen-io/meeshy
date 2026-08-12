import XCTest
@testable import MeeshyUI

/// L'écran de purge sélective du cache expose des boutons dont le libellé est
/// DYNAMIQUE : « Vider — jusqu'à 42 Mo » annonce un volume, pas une
/// conséquence. Pour l'action destructive, c'est le hint qui porte
/// l'irréversibilité — et c'était la seule de l'écran à ne pas en avoir, alors
/// que ses voisins (en-têtes de type) en portent un depuis leur création.
///
/// Garde de source assumée : l'invariant vit dans un modificateur SwiftUI posé
/// sur un `Button` privé, sans surface publique à interroger. Le point d'ancrage
/// est donc le bouton lui-même, repéré par son état désactivé — pas un compte de
/// caractères, qui se périmerait à la première ligne ajoutée.
@MainActor
final class SelectiveCachePurgeAccessibilityTests: XCTestCase {

    private func purgeViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Accessibility
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent("Sources/MeeshyUI/Settings/SelectiveCachePurgeView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Bloc du bouton de purge : de sa désactivation conditionnelle à la fin du
    /// `VStack` qui le contient.
    private func purgeButtonBlock() throws -> String {
        let source = try purgeViewSource()
        guard let anchor = source.range(of: ".disabled(!viewModel.hasSelection || viewModel.isPurging)") else {
            XCTFail("Le bouton de purge doit rester désactivé sans sélection"); return ""
        }
        let after = source[anchor.upperBound...]
        let end = after.range(of: "\n    private var")?.lowerBound ?? after.endIndex
        return String(after[..<end])
    }

    func test_purgeButton_announcesItsConsequence_notOnlyItsSize() throws {
        let block = try purgeButtonBlock()
        XCTAssertTrue(
            block.contains("accessibilityHint"),
            "L'action la plus destructive de l'écran doit annoncer sa conséquence : "
            + "son libellé ne dit que le volume libéré, jamais que la suppression "
            + "est définitive."
        )
        XCTAssertTrue(
            block.contains("settings.cache.purge.action.hint"),
            "Le hint doit être localisé — un hint en dur ne serait lu en français "
            + "qu'aux utilisateurs francophones."
        )
    }

    /// Le composant vit dans MeeshyUI : ses chaînes doivent viser le catalogue du
    /// module. Un `bundle: .main` chercherait la clé dans le catalogue de l'app
    /// hôte, ne l'y trouverait pas, et rendrait la valeur par défaut française
    /// dans TOUTES les langues.
    func test_purgeButtonHint_readsFromTheModuleCatalog() throws {
        let block = try purgeButtonBlock()
        guard let hint = block.range(of: "settings.cache.purge.action.hint") else {
            XCTFail("hint absent"); return
        }
        let tail = String(block[hint.upperBound...].prefix(200))
        XCTAssertTrue(
            tail.contains("bundle: .module"),
            "bundle: .module — sinon la clé est cherchée dans le catalogue de l'app"
        )
    }
}
