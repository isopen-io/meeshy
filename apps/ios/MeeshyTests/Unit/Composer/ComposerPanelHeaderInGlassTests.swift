import XCTest
@testable import Meeshy

/// **Ce qui accompagne le message vit dans le verre** (#8417, directive
/// porteur 2026-09-27) : bandeau de réponse (message, story, mood,
/// commentaire), bandeau d'édition, aperçus de pièces jointes et contenu
/// presse-papiers sont posés DANS la plaque de verre de la barre, jamais
/// au-dessus d'elle.
final class ComposerPanelHeaderInGlassTests: XCTestCase {

    func test_lEnTeteDuComposeur_estMonteDansLeVerre() throws {
        let plaque = try Self.plaqueDeVerre()
        XCTAssertTrue(plaque.contains("panelHeader"), "l'en-tête (réponse, édition, pièces jointes) est monté dans le verre")
    }

    func test_rienNeFlotteAuDessusDuVerre() throws {
        let plaque = try Self.plaqueDeVerre()
        XCTAssertEqual(
            plaque.components(separatedBy: "VStack(spacing: 0) {").count - 1, 1,
            "la plaque de verre est la racine du composeur déployé — aucune pile ne l'enveloppe pour poser un bandeau au-dessus"
        )
    }

    func test_lEnTete_porteChaqueBandeau() throws {
        let layout = try Self.source("Meeshy/Features/Main/Components/UniversalComposerBar+Layout.swift")
        let enTete = try XCTUnwrap(layout.components(separatedBy: "var panelHeader: some View {").dropFirst().first)
        ["editBanner", "replyBanner", "customAttachmentsPreview", "attachmentsPreview", "clipboardContentPreview"].forEach {
            XCTAssertTrue(enTete.contains($0), "\($0) vit dans l'en-tête du verre")
        }
    }

    /// Le composeur déployé, de sa déclaration jusqu'au modificateur de verre.
    private static func plaqueDeVerre() throws -> String {
        let layout = try source("Meeshy/Features/Main/Components/UniversalComposerBar+Layout.swift")
        let composeur = try XCTUnwrap(layout.components(separatedBy: "var expandedComposer: some View {").dropFirst().first)
        return try XCTUnwrap(composeur.components(separatedBy: ".adaptiveLiquidGlass(in: Self.panelShape").first)
    }

    private static func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }
}
