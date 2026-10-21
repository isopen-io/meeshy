import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// #10935 — les mouvements d'un contour d'avatar sont des couches Core Animation : les chemins
/// animés quittent le `Canvas` fixe, chaque mouvement est une animation que le serveur de composition
/// interpole (rotation, échelle, opacité, inclinaison, position du reflet) — jamais un redessin.
@MainActor
final class AvatarRingMotionTests: XCTestCase {

    private func ring(motion: String) throws -> AvatarRingDesign {
        let json = """
        {
          "key": "etoile",
          "stroke": { "style": "solid", "width": 0.04, "colors": ["#B8954F", "#FFD98A"] },
          "ornament": { "paths": [
            { "d": "M50 2 L52 6 L48 6 Z", "color": 1, "opacity": 1, "group": "etoiles" },
            { "d": "M50 94 L52 98 L48 98 Z", "color": 1, "opacity": 1, "group": "etoiles" },
            { "d": "M2 50 L6 52 L6 48 Z", "color": 0, "opacity": 1 }
          ] },
          "motion": \(motion)
        }
        """
        return try JSONDecoder().decode(AvatarRingDesign.self, from: Data(json.utf8))
    }

    private func keyPaths(_ content: FrameMotionContent) -> [String?] {
        content.animations.map { ($0.animation as? CAPropertyAnimation)?.keyPath }
    }

    func test_motionPlan_rotatingTargets_shareOneLayerAroundTheCentre() throws {
        let plan = AvatarRingView.motionPlan(try ring(motion: #"[{ "kind": "rotate", "targets": ["etoiles"], "duration": 12 }]"#))
        XCTAssertEqual(plan.layers.map(\.elements), [[0, 1]])
        XCTAssertEqual(plan.animated, [0, 1], "le troisième chemin reste dans le dessin fixe")
        XCTAssertEqual(plan.layers[0].chain[0].origin, CGPoint(x: 50, y: 50))
        XCTAssertTrue(plan.layers[0].chain[0].linear, "un tour complet tourne à vitesse constante")
    }

    func test_motionPlan_aRingWithoutMotion_isStill() throws {
        let still = try JSONDecoder().decode(AvatarRingDesign.self, from: Data(##"{ "key": "filet", "stroke": { "style": "solid", "width": 0.04, "colors": ["#6366F1"] } }"##.utf8))
        XCTAssertTrue(AvatarRingView.motionPlan(still).isStill)
    }

    func test_content_eachMotionIsAGPUAnimationOnItsHolder() throws {
        let design = try ring(motion: #"""
        [{ "kind": "rotate", "targets": ["etoiles"], "duration": 12 },
         { "kind": "pulse", "targets": ["etoiles"], "duration": 2 },
         { "kind": "skew", "targets": ["etoiles"], "duration": 3, "amplitude": 6 },
         { "kind": "sweep", "targets": ["etoiles"], "duration": 6 }]
        """#)
        let content = AvatarRingLayerView.content(design, plan: AvatarRingView.motionPlan(design), size: CGSize(width: 100, height: 100))
        let paths = keyPaths(content)
        XCTAssertTrue(paths.contains("transform.rotation.z"))
        XCTAssertTrue(paths.contains("transform.scale"))
        XCTAssertTrue(paths.contains("transform"), "l'inclinaison est une transformation")
        XCTAssertTrue(paths.contains("position.x"), "le reflet glisse, il ne se redessine pas")
        content.animations.forEach { XCTAssertEqual($0.animation.repeatCount, .infinity) }
    }

    func test_content_aPulseIsAnchoredOnItsTarget() throws {
        let design = try ring(motion: #"[{ "kind": "pulse", "targets": ["etoiles"], "duration": 2 }]"#)
        let content = AvatarRingLayerView.content(design, plan: AvatarRingView.motionPlan(design), size: CGSize(width: 200, height: 200))
        let holders = content.animations.map(\.layer)
        XCTAssertEqual(holders.count, 2, "une origine propre par cible")
        XCTAssertEqual(holders[0].position.x, 100, accuracy: 0.5)
        XCTAssertEqual(holders[0].position.y, 8, accuracy: 0.5, "le centre de l'étoile du haut, à l'échelle 2")
    }

    func test_skew_isAPureShearOfTheXAxis() {
        let shear = FrameMotionLayers.skew(degrees: 45)
        XCTAssertEqual(shear.m21, 1, accuracy: 1e-9)
        XCTAssertEqual(shear.m11, 1)
        XCTAssertEqual(shear.m22, 1)
    }

    func test_equality_followsTheAnimationDecision() throws {
        let design = try ring(motion: "[]")
        XCTAssertEqual(AvatarRingView(design: design), AvatarRingView(design: design, animates: true))
        XCTAssertNotEqual(AvatarRingView(design: design), AvatarRingView(design: design, animates: false))
    }
}
