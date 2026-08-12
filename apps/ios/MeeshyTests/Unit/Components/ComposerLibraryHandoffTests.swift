import XCTest
@testable import Meeshy

/// Passage de relais panneau → photothèque système.
///
/// La photothèque complète est le picker SYSTÈME (hors-process) : sa
/// présentation appartient à iOS. Ce qui se teste ici est donc l'AMONT — la
/// géométrie de l'étirement qui rend le geste continu — et le câblage qui
/// garantit que le panneau s'étire au lieu de retomber.
final class ComposerLibraryHandoffTests: XCTestCase {

    private func height(resting: CGFloat, window: CGFloat) -> CGFloat {
        ComposerLibraryHandoff.expandedHeight(resting: resting, windowHeight: window)
    }

    // MARK: - Géométrie de l'étirement

    /// iPhone portrait : le panneau gagne `expandLift`, franchement sous le
    /// plafond de fenêtre — c'est le cas nominal du raccourci.
    func test_expandedHeight_liftsTheRestingPanel() {
        XCTAssertEqual(height(resting: 324, window: 874), 464, accuracy: 0.001)
    }

    /// Le plafond mord avant le gain quand la fenêtre est courte : un panneau
    /// qui remplirait l'écran ne se lirait plus comme un étirement.
    func test_expandedHeight_isCappedByWindowRatio() {
        XCTAssertEqual(height(resting: 324, window: 600), 432, accuracy: 0.001)
    }

    /// Écran très court (iPhone en paysage) : le plafond tombe SOUS la hauteur
    /// au repos. L'étirement doit alors ne rien faire — jamais se retourner en
    /// rétrécissement, sinon le geste se sentirait à l'envers.
    func test_expandedHeight_neverShrinksTheRestingPanel() {
        XCTAssertEqual(height(resting: 324, window: 390), 324, accuracy: 0.001)
    }

    /// iPad : plancher au repos plus haut, même gain — le raccourci se comporte
    /// pareil sur les deux idiomes.
    func test_expandedHeight_appliesTheSameLiftOnPad() {
        XCTAssertEqual(height(resting: 460, window: 1366), 600, accuracy: 0.001)
    }

    /// Le délai est celui que l'ancien chemin observait déjà pour laisser
    /// retomber le panneau : le raccourci ne doit pas être devenu plus lent, son
    /// attente est simplement devenue visible.
    func test_expandDelay_doesNotSlowTheShortcutDown() {
        XCTAssertEqual(ComposerLibraryHandoff.expandDelay, 0.2, accuracy: 0.001)
    }

    // MARK: - Câblage

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Components
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
        return try strippingComments(
            String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        )
    }

    /// Les commentaires de ce chantier décrivent la règle et citent forcément
    /// les motifs inspectés : les lire reviendrait à tester de la prose.
    private func strippingComments(_ source: String) -> String {
        var out = ""
        var inBlock = false
        for rawLine in source.split(separator: "\n", omittingEmptySubsequences: false) {
            var line = String(rawLine)
            if inBlock {
                guard let end = line.range(of: "*/") else { continue }
                line = String(line[end.upperBound...])
                inBlock = false
            }
            while let start = line.range(of: "/*") {
                if let end = line.range(of: "*/", range: start.upperBound..<line.endIndex) {
                    line = String(line[..<start.lowerBound]) + String(line[end.upperBound...])
                } else {
                    line = String(line[..<start.lowerBound])
                    inBlock = true
                }
            }
            if let comment = line.range(of: "//") {
                line = String(line[..<comment.lowerBound])
            }
            out += line + "\n"
        }
        return out
    }

    /// Le geste vers le HAUT doit étirer le panneau vers le haut. L'ancien
    /// chemin appelait `fire(_:)`, qui le refermait vers le BAS pendant que la
    /// feuille montait : deux mouvements contraires sur un seul geste.
    func test_openFullPhotoLibrary_expandsThePanelInsteadOfCollapsingIt() throws {
        let src = try source("Meeshy/Features/Main/Components/UniversalComposerBar+Attachments.swift")
        XCTAssertTrue(
            src.contains("isExpandingToLibrary = true"),
            "Le raccourci doit armer l'étirement avant de présenter la photothèque"
        )
        XCTAssertTrue(
            src.contains("ComposerLibraryHandoff.expandDelay"),
            "Le délai avant présentation doit venir de la loi, pas d'un littéral local"
        )
    }

    /// Reduce Motion garde le chemin direct : l'étirement est décoratif, il ne
    /// porte aucune information que l'utilisateur perdrait en le désactivant.
    func test_openFullPhotoLibrary_honoursReduceMotion() throws {
        let src = try source("Meeshy/Features/Main/Components/UniversalComposerBar+Attachments.swift")
        XCTAssertTrue(
            src.contains("guard !reduceMotion else"),
            "Reduce Motion doit court-circuiter l'étirement vers le chemin direct"
        )
    }

    /// La hauteur étirée doit venir de la loi : la recalculer dans la vue
    /// rouvrirait la porte au cas « écran court » où l'étirement rétrécit.
    func test_attachmentPanelHeight_derivesTheExpansionFromTheLaw() throws {
        let src = try source("Meeshy/Features/Main/Components/UniversalComposerBar.swift")
        XCTAssertTrue(
            src.contains("ComposerLibraryHandoff.expandedHeight"),
            "Le panneau doit dériver sa hauteur étirée de la loi pure"
        )
    }
}
