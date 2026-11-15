import XCTest
@testable import Meeshy
@testable import MeeshyUI
@testable import MeeshySDK

/// **L'état Dessin : une barre en bas** (#13839, inventaire J1 à J5).
@MainActor
final class ComposerDrawingBarTests: XCTestCase {

    func test_all_ordreDeLaMaquette() {
        XCTAssertEqual(ComposerDrawingBarItem.all,
                       [.brush(.pen), .brush(.marker), .brush(.eraser),
                        .option(.color), .option(.thickness), .option(.smoothing),
                        .undo, .done])
    }

    /// La carte « Pinceau » disparaît : le trio est dans la barre.
    func test_all_nOffrePlusLOptionPinceau() {
        XCTAssertFalse(ComposerDrawingBarItem.all.contains(.option(.tool)))
    }

    func test_isOn_lePinceauCourantEstAllume_seulementSansPanneauDeplie() {
        XCTAssertTrue(ComposerDrawingBarItem.brush(.marker).isOn(brush: .marker, expanded: nil))
        XCTAssertFalse(ComposerDrawingBarItem.brush(.marker).isOn(brush: .marker, expanded: .color))
        XCTAssertFalse(ComposerDrawingBarItem.brush(.pen).isOn(brush: .marker, expanded: nil))
        XCTAssertTrue(ComposerDrawingBarItem.option(.color).isOn(brush: .pen, expanded: .color))
    }

    /// Le lissage avait le glyphe de « Dessiner » : deux boutons qui se
    /// ressemblent se tapent au hasard.
    func test_symbol_leLissageNePortePasLeGlypheDeLaPorteDessin() {
        XCTAssertNotEqual(ComposerDrawingBarItem.option(.smoothing).symbol, ComposerRailDoor.drawing.symbolName)
    }

    func test_chaqueControle_aUnLibelleEtUnGlypheUniques() {
        let libelles = ComposerDrawingBarItem.all.map(ComposerDrawingBarCopy.label)
        let glyphes = ComposerDrawingBarItem.all.map(\.symbol)
        XCTAssertFalse(libelles.contains(where: \.isEmpty))
        XCTAssertEqual(Set(libelles).count, libelles.count)
        XCTAssertEqual(Set(glyphes).count, glyphes.count)
    }

    // MARK: - Ce que chaque contrôle fait au viewmodel

    private func stroke(id: String) -> StoryDrawingStroke {
        StoryDrawingStroke(
            id: id,
            points: [StoryDrawingStrokePoint(x: 0, y: 0), StoryDrawingStrokePoint(x: 10, y: 10)],
            colorHex: "FF0000", width: 5, tool: .pen, smoothing: .raw)
    }

    func test_apply_unPinceau_leRegleEtTrace() {
        let vm = StoryComposerViewModel()
        vm.beginDrawing()

        XCTAssertTrue(ComposerDrawingBarDispatch.apply(.brush(.marker), to: vm))

        XCTAssertEqual(vm.activeBrushTool, .marker)
        XCTAssertTrue(vm.isDrawingImmersive, "choisir un pinceau doit rendre un doigt qui trace")
    }

    func test_apply_unPinceau_avecUnTraitSelectionne_leveLaSelection() {
        let vm = StoryComposerViewModel()
        vm.beginDrawing()
        vm.commitStroke(stroke(id: "s1"))
        vm.selectStroke("s1")

        _ = ComposerDrawingBarDispatch.apply(.brush(.eraser), to: vm)

        XCTAssertNil(vm.drawingEditingMode.selectedStrokeId, "le pinceau règle le prochain trait")
        XCTAssertEqual(vm.activeBrushTool, .eraser)
    }

    func test_apply_unPinceau_replieLePanneauOuvert() {
        let vm = StoryComposerViewModel()
        vm.beginDrawing()
        vm.setExpandedDrawingTool(.color)

        _ = ComposerDrawingBarDispatch.apply(.brush(.pen), to: vm)

        XCTAssertNil(vm.drawingEditingMode.expandedTool)
    }

    func test_apply_uneOption_ouvrePuisReplieSonPanneau() {
        let vm = StoryComposerViewModel()
        vm.beginDrawing()

        _ = ComposerDrawingBarDispatch.apply(.option(.thickness), to: vm)
        XCTAssertEqual(vm.drawingEditingMode.expandedTool, .thickness)
        _ = ComposerDrawingBarDispatch.apply(.option(.thickness), to: vm)
        XCTAssertNil(vm.drawingEditingMode.expandedTool)
    }

    func test_apply_defaire_retireLeDernierTrait() {
        let vm = StoryComposerViewModel()
        vm.beginDrawing()
        vm.commitStroke(stroke(id: "a"))
        vm.commitStroke(stroke(id: "b"))

        _ = ComposerDrawingBarDispatch.apply(.undo, to: vm)

        XCTAssertEqual(vm.drawingStrokes.map(\.id), ["a"])
    }

    func test_apply_ok_rendLaMainAuMeuble() {
        XCTAssertFalse(ComposerDrawingBarDispatch.apply(.done, to: StoryComposerViewModel()),
                       "OK referme l'outil par le chemin unique du meuble")
    }

    /// Sur la scène, ouvrir le dessin ne déplie plus la carte « Pinceau » : le
    /// trio est dans la barre (recette simulateur #13839). La surface document,
    /// qui n'a pas de barre, garde son premier réglage déplié.
    func test_ouvrirLeDessin_surLaScene_neDeplieAucuneCarte() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Composer/MeeshyComposerHost+Intake.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("viewModel.beginDrawing()ifmountedComposerView!=.scene{viewModel.setExpandedDrawingTool(.tool)}"),
                      "la carte Pinceau se déplie encore sur la scène, par-dessus la barre de dessin")
    }

    /// La couleur, l'épaisseur et le lissage s'ouvrent AU-DESSUS de la barre
    /// qui les déplie (état D de la maquette), pas en haut de la scène :
    /// recette simulateur #13839, capture `10b-draw-color`.
    func test_lesOptionsDuPinceau_sOuvrentEnBas_auDessusDeLaBarre() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Composer/MeeshyComposerHost+InlineEdit.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("ComposerTrailingOptionsPlate(plateauTint:tint.color,preferredEdge:.bottom)"),
                      "le panneau du pinceau s'ouvre encore en haut de la scène, loin de la barre du bas")
    }
}
