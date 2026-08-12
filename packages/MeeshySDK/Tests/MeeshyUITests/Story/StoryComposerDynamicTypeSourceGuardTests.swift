import XCTest
@testable import MeeshyUI

/// D3 — polices relatives (`MeeshyFont.relative`) sur les libellés textuels
/// restants du composer.
///
/// NB : la surface initialement ciblée (`emptyStateLargePicker`/
/// `largeToolTile`, la grande grille de tuiles de l'état vide) a été
/// entièrement remplacée par le chantier « état vide vivant » (amorces
/// caméra/galerie, `BlankCanvasStarterLabel`) — celui-ci est DÉJÀ passé par
/// `MeeshyFont.relative` dès son écriture (cf. doc-comment au-dessus de
/// `BlankCanvasStarterLabel` dans `StoryComposerView+Canvas.swift`). Cette
/// suite couvre donc le résidu réel trouvé par relecture de l'état actuel :
/// le libellé de chargement média (`mediaLoadingOverlay`) et l'en-tête du
/// panneau d'outil (`ComposerToolPanelHost`), seuls sites encore figés.
///
/// Gardes ancrées sur un COMPTE d'occurrences dans une fenêtre bornée, jamais
/// sur une concaténation `Text(x).font(` : le formatage réel scinde parfois
/// l'appel `Text(...)` de son `.font(...)` sur deux lignes, ce qu'une
/// concaténation littérale ne peut jamais matcher.
final class StoryComposerDynamicTypeSourceGuardTests: XCTestCase {

    // MARK: - StoryComposerView+Canvas.swift — libellé de chargement média

    func test_mediaLoadingLabel_usesRelativeFont() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var mediaLoadingOverlay: some View {", in: code),
            "mediaLoadingOverlay introuvable"
        )
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "MeeshyFont.relative(12, weight: .medium)", in: body), 1,
                       "Text(mediaLoadLabel) doit utiliser une police relative.")
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: ".font(.system(size: 12, weight: .medium))", in: body), 0,
                       "Plus aucune police figée à 12 pt medium dans ce panneau.")
    }

    func test_mediaLoadingPercentageBadge_remainsFixedSize() throws {
        // Garde négative (doctrine 86i) : le badge numérique dans le cercle
        // de progression de 56 pt reste figé — ce n'est pas un libellé de
        // lecture, le faire scaler le ferait déborder du cercle.
        let code = try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var mediaLoadingOverlay: some View {", in: code)
        )
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: ".font(.system(size: 13, weight: .bold, design: .rounded))", in: body), 1)
    }

    // MARK: - ComposerToolPanelHost.swift — en-tête de panneau

    /// Fenêtre `backButton` → `switchChip` (jusqu'à `title(for tool:)`,
    /// exclu) : encadre exactement les deux vues visées, sans capturer les
    /// ~20 autres `.font(.system(` du reste du fichier (panneaux média/son/
    /// dessin/texte…, hors périmètre de cette passe).
    private func toolPanelHostHeaderWindow() throws -> String {
        let code = try ComposerSourceGuard.source("Controls/ComposerToolPanelHost.swift")
        guard let start = code.range(of: "private var backButton: some View {"),
              let end = code.range(of: "private static func title(for tool:", range: start.upperBound..<code.endIndex)
        else {
            XCTFail("Fenêtre backButton → switchChip introuvable")
            return ""
        }
        return String(code[start.lowerBound..<end.lowerBound])
    }

    func test_toolPanelHostHeader_backButtonLabel_usesRelativeFont() throws {
        let window = try toolPanelHostHeaderWindow()
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "MeeshyFont.relative(14, weight: .semibold)", in: window), 1,
                       "Text(toolTitle) doit utiliser une police relative.")
        // Passe de 2 (icône + texte) à 1 (l'icône chevron.backward SEULE,
        // volontairement non migrée) — pas à 0.
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: ".font(.system(size: 14, weight: .semibold))", in: window), 1,
                       "Seule l'icône chevron doit garder une taille figée ici.")
    }

    func test_toolPanelHostHeader_switchChipLabel_usesRelativeFont() throws {
        let window = try toolPanelHostHeaderWindow()
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "MeeshyFont.relative(12, weight: .medium)", in: window), 1,
                       "Text(Self.title(for: other)) doit utiliser une police relative.")
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: ".font(.system(size: 12, weight: .medium))", in: window), 0)
    }

    func test_toolPanelHostHeader_icons_remainFixedSize() throws {
        let window = try toolPanelHostHeaderWindow()
        // chevron.backward (14 pt) et l'icône du chip (11 pt) restent figées —
        // ce sont des glyphes SF Symbols, hors périmètre D3.
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: ".font(.system(size: 14, weight: .semibold))", in: window), 1)
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: ".font(.system(size: 11, weight: .semibold))", in: window), 1)
    }
}
