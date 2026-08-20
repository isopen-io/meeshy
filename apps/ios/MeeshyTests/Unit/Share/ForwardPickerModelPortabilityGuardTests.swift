import XCTest

/// `ForwardPickerModel` est compilé DANS DEUX cibles : l'app et
/// `MeeshyShareExtension`. Ajouter un fichier de l'APP aux `sources:` d'une
/// app-extension est un précédent nouveau dans ce dépôt — `project.yml` ne
/// connaissait que l'inverse (fichiers d'extension compilés dans MeeshyTests).
///
/// L'extension est sans dépendance SDK : le premier `import MeeshySDK` glissé
/// dans ce fichier casserait la compilation de l'extension, pas celle de
/// l'app — donc au moment le plus coûteux, et pour une raison que rien
/// n'expliquerait sur place. Ce garde échoue AVANT.
final class ForwardPickerModelPortabilityGuardTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Share
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
    }

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private var modelSource: String {
        get throws { try source("Meeshy/Features/Main/Components/ForwardPickerModel.swift") }
    }

    func test_forwardPickerModel_importsFoundationOnly() throws {
        let imports = try modelSource
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.hasPrefix("import ") }

        XCTAssertEqual(
            imports, ["import Foundation"],
            "ForwardPickerModel est compilé dans MeeshyShareExtension, qui n'a AUCUNE "
            + "dépendance SDK (plafond mémoire 120 Mo, GRDB + Socket.IO exclus). "
            + "Imports trouvés : \(imports)"
        )
    }

    /// `ForwardOutcome` vit dans `MessageForwardService.swift`, qui
    /// `import MeeshySDK` : le modèle ne peut pas le nommer.
    func test_forwardPickerModel_neverNamesForwardOutcome() throws {
        XCTAssertFalse(
            try modelSource.contains("ForwardOutcome"),
            "l'issue d'un envoi doit être PRIMITIVE (succeeded/reason) pour que le "
            + "fichier traverse la frontière app ↔ extension — comme la jumelle web "
            + "`forward-picker-model.ts:44` le fait déjà (finishSend(id, ok, reason?))"
        )
    }

    /// Le fichier doit être RÉELLEMENT compilé par l'extension : le déclarer
    /// portable sans le câbler laisserait l'écran de partage sans machine à
    /// états, sans que rien ne rougisse.
    func test_projectYml_compilesTheModelIntoTheShareExtension() throws {
        let projectYml = try source("project.yml")
        let extensionSection = try XCTUnwrap(
            projectYml.range(of: "  MeeshyShareExtension:").map { projectYml[$0.lowerBound...] }
        )
        let bounded = extensionSection.prefix(while: { _ in true })
        let untilNextTarget = bounded.range(of: "\n  MeeshyTests:")
            .map { String(bounded[..<$0.lowerBound]) } ?? String(bounded)

        XCTAssertTrue(
            untilNextTarget.contains("Meeshy/Features/Main/Components/ForwardPickerModel.swift"),
            "MeeshyShareExtension doit lister explicitement ForwardPickerModel.swift dans ses sources"
        )
    }
}
