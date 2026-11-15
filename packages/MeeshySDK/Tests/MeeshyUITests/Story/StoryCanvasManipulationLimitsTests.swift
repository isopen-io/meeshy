import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Les LIMITES et les lignes MAGNÉTIQUES se montrent pendant une
/// manipulation** (#8370, directive porteur 2026-09-27 : « les lignes
/// magnétiques et les limites doivent être affichées pour indiquer les
/// alignements et les limites de visibilité — le contenu se coupe si positionné
/// hors de la scène visible »).
///
/// La scène se pose désormais sur un SOL peint de son propre thumbhash : son
/// bord ne se voit plus. Pendant qu'on déplace, pince ou tourne un objet, le
/// canvas trace donc le contour où le contenu se coupe, et toutes les lignes
/// sur lesquelles il s'accroche. Au repos, rien ne se peint sur la scène.
@MainActor
final class StoryCanvasManipulationLimitsTests: XCTestCase {

    private func canvas() -> StoryCanvasUIView {
        var effects = StoryEffects()
        effects.background = "#112233"
        let vue = StoryCanvasUIView(slide: StorySlide(id: "limites", effects: effects, duration: 5),
                                    mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 360, height: 640)
        vue.layoutIfNeeded()
        return vue
    }

    private func limits(in vue: StoryCanvasUIView) -> [CALayer] {
        vue.editOverlayLayer.sublayers?.filter { $0.name == StoryCanvasUIView.limitsLayerName } ?? []
    }

    func test_auRepos_aucuneLimiteNeSePeint() {
        XCTAssertTrue(limits(in: canvas()).isEmpty)
    }

    func test_pendantUneManipulation_leContourEtLesLignesMagnetiquesSePeignent() throws {
        let vue = canvas()
        vue.showManipulationLimits()
        let calque = try XCTUnwrap(limits(in: vue).first, "le calque des limites doit exister")
        XCTAssertEqual(limits(in: vue).count, 1, "un seul calque, même montré deux fois")
        let traces = (calque.sublayers ?? []).compactMap { $0 as? CAShapeLayer }
        XCTAssertEqual(traces.count, 2, "le contour de la scène ET les lignes magnétiques")
        XCTAssertTrue(traces.allSatisfy { $0.path != nil })
        XCTAssertEqual(calque.frame, vue.bounds, "le contour épouse la scène, là où le contenu se coupe")

        vue.showManipulationLimits()
        XCTAssertEqual(limits(in: vue).count, 1)
    }

    func test_aLaFinDuGeste_lesLimitesSEffacent() {
        let vue = canvas()
        vue.showManipulationLimits()
        vue.hideManipulationLimits()
        XCTAssertTrue(limits(in: vue).isEmpty)
    }

    /// Les lignes tracées sont EXACTEMENT celles sur lesquelles un objet
    /// s'accroche : une ligne dessinée sans aimant, ou un aimant sans ligne,
    /// ferait mentir l'un des deux.
    func test_lesLignes_sontLesCiblesDuSnap() {
        XCTAssertEqual(StoryCanvasUIView.magneticLineTargets, StoryCanvasUIView.snapTargets)
    }
}
