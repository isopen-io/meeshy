import XCTest
import SwiftUI
@testable import Meeshy

/// **C (#3882) — la rangée d'outils porte un jeu SF moderne, net, avec effet.**
///
/// Décision produit tranchée (2026-08-26) : **SF Symbols retravaillés d'abord,
/// glyphes à identité forte « dans un second temps ».** Ce lot livre donc :
/// - un jeu COHÉRENT (famille ligne, plus le mélange `.fill` daté) et
///   DESCRIPTIF (chaque glyphe dit ce que l'outil fait) ;
/// - un rendu `.hierarchical` (profondeur) et un rebond au tap
///   (`.symbolEffect(.bounce)`, gardé iOS 17, statique en repli 16) ;
/// - le CONTRASTE de la teinte des icônes mesuré sur le plateau sombre
///   (patron `ComposerPlateauTests`).
@MainActor
final class ComposerToolIconsTests: XCTestCase {

    private static let iosRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // .../Unit/Composer
        .deletingLastPathComponent()   // .../Unit
        .deletingLastPathComponent()   // .../MeeshyTests
        .deletingLastPathComponent()   // .../apps/ios

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func compact(_ text: String) -> String {
        AppSourceGuard.stripComments(text)
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    // 1 — le jeu moderne, par COMPORTEMENT (`symbolName` est une fonction pure).
    func test_chaqueOutil_porteSonSymboleModerne() {
        XCTAssertEqual(ComposerDocumentTool.photo.symbolName, "photo")
        XCTAssertEqual(ComposerDocumentTool.camera.symbolName, "camera")
        XCTAssertEqual(ComposerDocumentTool.emoji.symbolName, "face.smiling")
        XCTAssertEqual(ComposerDocumentTool.document.symbolName, "paperclip")
        XCTAssertEqual(ComposerDocumentTool.place.symbolName, "mappin.and.ellipse")
        XCTAssertEqual(ComposerDocumentTool.microphone.symbolName, "mic")
    }

    // 2 — jeu COHÉRENT : aucun `.fill` (le mélange fill/outline est ce qui datait).
    func test_leJeu_estUneFamilleLigne_aucunFill() {
        for tool in ComposerDocumentTool.canonicalRow {
            XCTAssertFalse(
                tool.symbolName.hasSuffix(".fill"),
                "\(tool.rawValue) porte `\(tool.symbolName)` — un `.fill`. Le mélange fill/outline est "
                    + "précisément ce qui datait la rangée : le jeu moderne est une famille LIGNE cohérente."
            )
        }
    }

    // 3 — la rangée applique le rendu hiérarchique ET l'effet de rebond.
    func test_laRangee_appliqueHierarchique_etRebond() throws {
        let raw = try source("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
        XCTAssertTrue(raw.contains("private var toolRow"), "toolRow introuvable ou source vide")
        let src = compact(raw)
        XCTAssertTrue(
            src.contains(".symbolRenderingMode(.hierarchical)"),
            "La rangée doit rendre ses icônes en `.hierarchical` — la profondeur du jeu moderne."
        )
        XCTAssertTrue(
            src.contains(".composerToolBounce("),
            "La rangée doit porter l'effet de rebond au tap (`.composerToolBounce`) — SF « avec effet »."
        )
    }

    // 4 — l'effet est GARDÉ derrière iOS 17, avec repli (pas de non-compilation 16).
    func test_lEffet_estGardeDerriereIOS17_avecRepli() throws {
        let src = compact(try source("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift"))
        XCTAssertTrue(
            src.contains("#available(iOS17.0,*)"),
            "L'effet doit être gardé par `#available(iOS 17.0, *)` — la cible descend à iOS 16, "
                + "qui n'a pas `.symbolEffect` : sans garde, le meuble ne compilerait pas pour 16."
        )
        XCTAssertTrue(
            src.contains(".symbolEffect(.bounce"),
            "Le rebond doit passer par `.symbolEffect(.bounce)` — l'effet SF demandé, appliqué au tap."
        )
        XCTAssertTrue(
            src.contains("AnyView"),
            "Le garde doit passer par `AnyView` (profondeur de type constante), non par un "
                + "`if #available` en `@ViewBuilder` : ce dernier ajoute un `_ConditionalContent` qui "
                + "peut déborder la pile d'un appareil réel, invisible au gate simulateur."
        )
    }

    // 5 — CONTRASTE : la teinte des icônes passe l'AA composant sur chaque plateau.
    func test_laTeinteDesIcones_passeAAComposant_surChaquePlateau() {
        let foreground = MeeshyColors.textSecondary(isDark: true)
        for tint in PlateauTint.allCases {
            let ratio = WCAGContrast.ratioOfTranslucentForeground(foreground, on: tint.color)
            XCTAssertGreaterThanOrEqual(
                ratio, 3.0,
                "Les icônes d'outils (`textSecondary`) sur le plateau \(tint.rawValue) mesurent "
                    + "\(WCAGContrast.fmt(ratio)):1 — sous AA composant (3:1)."
            )
        }
    }
}
