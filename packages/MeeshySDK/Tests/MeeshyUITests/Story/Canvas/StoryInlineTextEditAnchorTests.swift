import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Zone d'édition du texte en place (spec 2026-08-01).
///
/// Le bloc édité se centre dans la ZONE — le rectangle entre le bas du bouton
/// « Terminé » et le haut des bulles d'outils — et non plus au centre du canvas.
/// Son centre ne dépend plus de sa hauteur : un texte neuf naît à la même place
/// qu'un texte de trois lignes, donc la première frappe ne le déplace pas.
///
/// Supersède la directive du 2026-07-30 (« le texte long sort par le haut de
/// l'écran, aucun clamp haut ») : la hauteur est désormais bornée à celle de la
/// zone, le débordement se réglant par défilement interne.
@MainActor
final class StoryInlineTextEditAnchorTests: XCTestCase {

    private let canvasMidY: CGFloat = 366   // canvas 412×732

    /// Bornes réalistes clavier levé : « Terminé » sous l'encoche, bulles juste
    /// au-dessus du clavier. Assez serrées pour que l'ANCIENNE règle
    /// (`min(centre canvas, plancher − hauteur/2)`) déplace réellement le bloc
    /// quand il grandit — sans quoi les tests de comportement passeraient aussi
    /// sur le code bogué.
    private func measureControls(on canvas: StoryCanvasUIView) {
        canvas.inlineEditCeilingGlobalY = 150
        canvas.inlineEditFloorGlobalY = 484
    }

    // MARK: - Règle d'ancrage

    func test_noZone_keepsHistoricCentering() {
        XCTAssertEqual(
            StoryCanvasUIView.inlineEditCenterY(zone: nil, canvasMidY: canvasMidY),
            canvasMidY,
            "Sans zone mesurée, le bloc reste au centre du canvas — repli d'origine")
    }

    func test_zone_centersInsideTheZone_notOnTheCanvas() {
        let zone = StoryInlineEditZone(top: 120, bottom: 460)
        let y = StoryCanvasUIView.inlineEditCenterY(zone: zone, canvasMidY: canvasMidY)

        XCTAssertEqual(y, 290, accuracy: 0.001,
                       "Le centre du bloc est celui de la zone")
        XCTAssertLessThan(y, canvasMidY,
                          "La zone étant décalée vers le haut par le clavier, le texte remonte")
    }

    func test_zoneCenter_leavesRoomBetweenAnEmptyTextAndTheControls() {
        // Zone typique clavier levé : « Terminé » à 120, bulles à 460.
        let zone = StoryInlineEditZone(top: 120, bottom: 460)
        let y = StoryCanvasUIView.inlineEditCenterY(zone: zone, canvasMidY: canvasMidY)
        let emptyBlockHeight: CGFloat = 44   // hauteur du placeholder seul

        XCTAssertGreaterThan(zone.bottom - (y + emptyBlockHeight / 2), 100,
                             "Un texte neuf naît au milieu de la zone, pas collé aux contrôleurs")
    }

    func test_zone_exposesHeightAndMid() {
        let zone = StoryInlineEditZone(top: 100, bottom: 400)
        XCTAssertEqual(zone.height, 300, accuracy: 0.001)
        XCTAssertEqual(zone.midY, 250, accuracy: 0.001)
    }

    func test_zone_invertedBounds_hasZeroHeight() {
        // Bornes croisées (panneau déplié plus haut que le top bar sur un très
        // petit écran) : une hauteur négative ferait un clamp absurde.
        let zone = StoryInlineEditZone(top: 400, bottom: 300)
        XCTAssertEqual(zone.height, 0, accuracy: 0.001)
    }

    // MARK: - Hauteur bornée

    func test_blockHeight_withoutZone_staysNatural() {
        XCTAssertEqual(
            StoryCanvasUIView.inlineEditBlockHeight(natural: 900, zoneHeight: nil),
            900,
            "Sans zone, aucune borne — croissance libre, comportement d'origine")
    }

    func test_blockHeight_shorterThanZone_staysNatural() {
        XCTAssertEqual(
            StoryCanvasUIView.inlineEditBlockHeight(natural: 120, zoneHeight: 340),
            120,
            "Un texte qui tient dans la zone garde sa hauteur réelle")
    }

    func test_blockHeight_tallerThanZone_isClampedToTheZone() {
        XCTAssertEqual(
            StoryCanvasUIView.inlineEditBlockHeight(natural: 900, zoneHeight: 340),
            340,
            "Un texte long est borné à la zone — il défilera à l'intérieur")
    }

    // MARK: - Conversion écran → canvas

    func test_zone_isNilWithoutReportedControls() {
        let canvas = makeCanvas()
        XCTAssertNil(canvas.inlineEditZone,
                     "Tant que le composer n'a rien mesuré, aucune zone n'est appliquée")
    }

    func test_zone_isNilWhenOnlyOneBoundIsMeasured() {
        let (window, canvas) = makeWindowedCanvas()
        canvas.inlineEditFloorGlobalY = 600
        XCTAssertNil(canvas.inlineEditZone,
                     "Une seule borne ne suffit pas à définir une zone")
        _ = window
    }

    func test_zone_convertsScreenCoordinatesAndKeepsBothGaps() throws {
        let (window, canvas) = makeWindowedCanvas()   // canvas posé à 84 pt du haut

        canvas.inlineEditCeilingGlobalY = 150   // bas de « Terminé », repère écran
        canvas.inlineEditFloorGlobalY = 600     // haut des bulles, repère écran

        let zone = try XCTUnwrap(canvas.inlineEditZone)
        XCTAssertEqual(zone.top, 150 - 84 + StoryCanvasUIView.inlineEditFloorGap,
                       accuracy: 0.5,
                       "Le plafond passe en repère canvas et laisse la marge sous « Terminé »")
        XCTAssertEqual(zone.bottom, 600 - 84 - StoryCanvasUIView.inlineEditFloorGap,
                       accuracy: 0.5,
                       "Le plancher garde la marge au-dessus des bulles")
        _ = window
    }

    // MARK: - Comportement observable

    func test_growingText_doesNotMoveTheBlock() throws {
        let (window, canvas) = makeWindowedCanvas()
        measureControls(on: canvas)
        canvas.beginInlineTextEdit(textId: "t1")

        let editor = try XCTUnwrap(canvas.inlineEditor)
        let initialCenterY = editor.center.y

        editor.text = "Première ligne\nDeuxième ligne\nTroisième ligne\nQuatrième ligne"
        canvas.textViewDidChange(editor)

        XCTAssertEqual(editor.center.y, initialCenterY, accuracy: 0.5,
                       "Le bloc ne saute plus à la frappe — son centre est celui de la zone")
        _ = window
    }

    func test_openingEditor_placesTheBlockInsideTheZone() throws {
        let (window, canvas) = makeWindowedCanvas()
        measureControls(on: canvas)
        canvas.beginInlineTextEdit(textId: "t1")

        let editor = try XCTUnwrap(canvas.inlineEditor)
        let zone = try XCTUnwrap(canvas.inlineEditZone)

        XCTAssertGreaterThanOrEqual(editor.frame.minY, zone.top - 0.5,
                                    "Le bloc ne déborde pas au-dessus de la zone")
        XCTAssertLessThanOrEqual(editor.frame.maxY, zone.bottom + 0.5,
                                 "Le bloc ne descend pas sous le plafond des contrôleurs")
        // Le défaut rapporté : à l'ouverture, le champ se posait à 12 pt des
        // bulles. Un simple « dans la zone » ne l'aurait pas attrapé — il faut
        // exiger une séparation FRANCHE.
        XCTAssertGreaterThan(zone.bottom - editor.frame.maxY, zone.height / 3,
                             "Un texte neuf naît franchement détaché des contrôleurs")
        _ = window
    }

    func test_veryLongText_staysInsideTheZone_andScrolls() throws {
        let (window, canvas) = makeWindowedCanvas()
        measureControls(on: canvas)
        canvas.beginInlineTextEdit(textId: "t1")

        let editor = try XCTUnwrap(canvas.inlineEditor)
        let zone = try XCTUnwrap(canvas.inlineEditZone)

        editor.text = Array(repeating: "Une ligne de texte assez longue", count: 40)
            .joined(separator: "\n")
        canvas.textViewDidChange(editor)

        XCTAssertLessThanOrEqual(editor.bounds.height, zone.height + 0.5,
                                 "Un texte long est borné à la zone au lieu de sortir par le haut")
        XCTAssertTrue(editor.isScrollEnabled,
                      "Passé la hauteur de zone, le champ défile pour rester éditable en entier")
        XCTAssertGreaterThanOrEqual(editor.frame.minY, zone.top - 0.5,
                                    "Rien ne sort de l'écran par le haut")
        _ = window
    }

    // MARK: - Harnais

    private func makeCanvas() -> StoryCanvasUIView {
        let text = StoryTextObject(id: "t1", text: "Salut", x: 0.5, y: 0.5)
        let slide = StorySlide(id: "s", effects: StoryEffects(textObjects: [text]), duration: 5)
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()
        return view
    }

    /// Canvas 412×732 posé à 84 pt du haut d'une fenêtre 412×900 — la letterbox
    /// 9:16 d'un écran 19.5:9, pour que la conversion écran → canvas soit
    /// réellement exercée.
    private func makeWindowedCanvas() -> (UIWindow, StoryCanvasUIView) {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 412, height: 900))
        let canvas = makeCanvas()
        canvas.frame = CGRect(x: 0, y: 84, width: 412, height: 732)
        window.addSubview(canvas)
        window.isHidden = false
        canvas.layoutIfNeeded()
        return (window, canvas)
    }
}
