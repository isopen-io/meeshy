import XCTest
import MeeshyUI
@testable import Meeshy

/// **Les options d'un outil s'ouvrent en colonne à DROITE de sa porte, et les
/// boutons flottants sont plus petits et plus hauts** (#8558, directive porteur
/// 2026-09-28).
final class ComposerRailFlyoutTests: XCTestCase {

    private static let portesAvecOutils: [ComposerRailDoor] = [.media, .drawing, .text, .sticker]

    /// **Un texte en saisie accroche ses options à SA porte**, et le rail garde
    /// toutes les siennes (directive porteur 2026-09-28).
    @MainActor
    func test_leTexte_accrocheSesOptions_aLaPorteTexte() {
        let mode = ComposerRailMode.resolve(drawing: false, textEditing: true,
                                            expandedDrawingTool: nil, expandedTextTool: .color,
                                            doors: Self.portesAvecOutils, anchorsToDoor: true)
        guard case .flyout(let volet) = mode else { return XCTFail("attendu : une colonne, reçu \(mode)") }
        XCTAssertEqual(volet.anchor, .text)
        XCTAssertEqual(volet.doors, Self.portesAvecOutils, "la colonne ne retire aucune porte")
        XCTAssertEqual(volet.controls.map(\.id), TextEditTool.all.map { "text.\($0.rawValue)" })
        XCTAssertEqual(volet.controls.filter(\.isExpanded).map(\.id), ["text.color"])
        XCTAssertEqual(volet.entryCount, TextEditTool.all.count + 1, "le `(x)` ferme la colonne")
        XCTAssertTrue(mode.opensTool)
    }

    /// Le dessin prime sur le texte, et s'accroche à la porte DESSIN.
    @MainActor
    func test_leDessin_accrocheSesOptions_aLaPorteDessin() {
        let mode = ComposerRailMode.resolve(drawing: true, textEditing: true,
                                            expandedDrawingTool: nil, expandedTextTool: nil,
                                            doors: Self.portesAvecOutils, anchorsToDoor: true)
        guard case .flyout(let volet) = mode else { return XCTFail("attendu : une colonne, reçu \(mode)") }
        XCTAssertEqual(volet.anchor, .drawing)
        XCTAssertTrue(volet.controls.allSatisfy { $0.id.hasPrefix("drawing.") })
    }

    /// **Sans porte à laquelle s'accrocher, les contrôleurs REMPLACENT le rail**
    /// comme avant — une colonne sans bouton n'aurait nulle part où paraître.
    @MainActor
    func test_sansSaPorte_lOutilRetombeSurLeRemplacement() {
        let mode = ComposerRailMode.resolve(drawing: false, textEditing: true,
                                            expandedDrawingTool: nil, expandedTextTool: nil,
                                            doors: [.media, .sticker], anchorsToDoor: true)
        guard case .tool = mode else { return XCTFail("attendu : le remplacement, reçu \(mode)") }
    }

    /// Aucun outil ouvert ⇒ les portes, colonne demandée ou non.
    @MainActor
    func test_sansOutilOuvert_lesPortesSeules() {
        let mode = ComposerRailMode.resolve(drawing: false, textEditing: false,
                                            expandedDrawingTool: nil, expandedTextTool: nil,
                                            doors: Self.portesAvecOutils, anchorsToDoor: true)
        XCTAssertEqual(mode, .doors(Self.portesAvecOutils))
        XCTAssertFalse(mode.opensTool)
    }

    /// **La colonne défile quand elle ne tient pas**, et ne sort jamais de la
    /// zone : son haut suit celui de la porte, puis remonte juste assez.
    func test_laColonne_seCaleSurSaPorte_sansSortirDeLaZone() {
        let hauteur = ComposerRailGeometry.floatingColumnHeight(entries: 9)
        XCTAssertEqual(hauteur, 9 * 44 + 8 * ComposerRailGeometry.floatingEntrySpacing + 16)
        XCTAssertEqual(ComposerRailGeometry.flyoutTop(anchorTop: 100, columnHeight: 200, available: 600), 92,
                       "assez de place : le haut suit la porte")
        XCTAssertEqual(ComposerRailGeometry.flyoutTop(anchorTop: 500, columnHeight: 200, available: 600), 400,
                       "trop bas : la colonne remonte pour tenir")
        XCTAssertEqual(ComposerRailGeometry.flyoutTop(anchorTop: 500, columnHeight: 800, available: 600), 0,
                       "plus haute que la zone : elle part du haut et défile")
    }

    /// **Des boutons plus petits, une cible intacte, et plus hauts d'un
    /// bouton** (directive porteur 2026-09-28).
    func test_lesBoutonsFlottants_sontPlusPetits_etPlusHauts() {
        XCTAssertLessThan(ComposerRailGeometry.floatingButtonSize, ComposerRailGeometry.railWidth)
        XCTAssertEqual(ComposerRailGeometry.railWidth, 44, "la cible tactile ne rétrécit pas")
        XCTAssertGreaterThanOrEqual(ComposerRailGeometry.floatingBottomInset,
                                    ComposerRailGeometry.gutter + ComposerRailGeometry.railWidth)
    }
}
