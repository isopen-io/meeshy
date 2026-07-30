import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Ancrage du texte pendant l'édition en place (user 2026-07-30) :
///
/// « Le TEXTE doit toujours être au-dessus des outils, quitte à ce que les longs
///   textes sortent vers le haut de l'écran. La dernière ligne doit être
///   au-dessus des chips de contrôle de l'outil texte. »
///
/// La croissance de `StoryInlineTextEditor.sizeToFitTextContent` est symétrique
/// autour du centre : sans plafond, chaque ligne ajoutée poussait la dernière
/// sous les chips (et sous le clavier). La règle ci-dessous colle le BAS du bloc
/// au plafond dès qu'il le touche, et ne borne jamais le haut.
@MainActor
final class StoryInlineTextEditAnchorTests: XCTestCase {

    private let canvasMidY: CGFloat = 366   // canvas 412×732

    // MARK: - Règle pure

    func test_noFloor_keepsHistoricCentering() {
        let y = StoryCanvasUIView.inlineEditCenterY(canvasMidY: canvasMidY,
                                                    floorY: nil,
                                                    blockHeight: 600)
        XCTAssertEqual(y, canvasMidY,
                       "Sans plafond mesuré, le bloc reste centré — comportement d'origine")
    }

    func test_shortBlock_staysCentered() {
        let y = StoryCanvasUIView.inlineEditCenterY(canvasMidY: canvasMidY,
                                                    floorY: 500,
                                                    blockHeight: 60)
        XCTAssertEqual(y, canvasMidY,
                       "Un texte court tient au-dessus des chips : on ne le décale pas")
    }

    func test_blockTallerThanRoom_hasItsBottomOnTheFloor() {
        let floorY: CGFloat = 500
        let height: CGFloat = 400
        let y = StoryCanvasUIView.inlineEditCenterY(canvasMidY: canvasMidY,
                                                    floorY: floorY,
                                                    blockHeight: height)

        XCTAssertEqual(y + height / 2, floorY, accuracy: 0.001,
                       "La dernière ligne se pose EXACTEMENT sur le plafond des chips")
        XCTAssertLessThan(y, canvasMidY, "Le bloc est remonté, pas descendu")
    }

    func test_growingBlock_overflowsUpwardsOnly() {
        let floorY: CGFloat = 500
        var previousTop = CGFloat.greatestFiniteMagnitude

        for height in stride(from: CGFloat(100), through: 900, by: 100) {
            let y = StoryCanvasUIView.inlineEditCenterY(canvasMidY: canvasMidY,
                                                        floorY: floorY,
                                                        blockHeight: height)
            let bottom = y + height / 2
            let top = y - height / 2

            XCTAssertLessThanOrEqual(bottom, floorY + 0.001,
                                     "Le bas ne franchit JAMAIS le plafond (hauteur \(height))")
            XCTAssertLessThan(top, previousTop,
                              "Chaque ligne ajoutée pousse le bloc vers le HAUT (hauteur \(height))")
            previousTop = top
        }

        // Un texte très haut sort volontairement du canvas par le haut.
        let tall = StoryCanvasUIView.inlineEditCenterY(canvasMidY: canvasMidY,
                                                       floorY: floorY,
                                                       blockHeight: 900)
        XCTAssertLessThan(tall - 900 / 2, 0,
                          "Un texte long déborde hors de l'écran par le haut plutôt que sous les chips")
    }

    // MARK: - Conversion écran → canvas

    func test_floorY_isNilWithoutReportedControls() {
        let canvas = makeCanvas()
        XCTAssertNil(canvas.inlineEditFloorY,
                     "Tant que le composer n'a rien mesuré, aucun plafond n'est appliqué")
    }

    func test_floorY_convertsScreenCoordinatesAndKeepsTheGap() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 412, height: 900))
        let canvas = makeCanvas()
        // Canvas posé à 84 pt du haut de la fenêtre (letterbox 9:16).
        canvas.frame = CGRect(x: 0, y: 84, width: 412, height: 732)
        window.addSubview(canvas)
        window.isHidden = false

        canvas.inlineEditFloorGlobalY = 600   // haut des chips, repère écran

        let floor = try? XCTUnwrap(canvas.inlineEditFloorY)
        XCTAssertEqual(floor ?? .nan,
                       600 - 84 - StoryCanvasUIView.inlineEditFloorGap,
                       accuracy: 0.5,
                       "Le plafond passe en repère canvas et garde la marge sous la dernière ligne")
    }

    private func makeCanvas() -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: StorySlide(id: "s", effects: StoryEffects(), duration: 5),
                                     mode: .edit)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        view.layoutIfNeeded()
        return view
    }
}
