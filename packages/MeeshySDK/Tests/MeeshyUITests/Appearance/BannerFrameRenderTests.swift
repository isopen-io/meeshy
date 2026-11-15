import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// #10935 — le cadre de bannière se pose SUR la photo : son centre reste transparent parce que le
/// rendu DÉCOUPE tout ce qu'il dessine à sa région (le schéma ne borne que la portée déclarée, pas
/// les chemins). Mêmes témoins que le web (`packages/shared/__tests__/frame-render.test.ts`).
@MainActor
final class BannerFrameRenderTests: XCTestCase {

    private func frame(_ extra: String = "", pieces: String? = nil, border: String = #"{ "width": 9.6, "color": 0, "opacity": 1, "filets": [{ "inset": 7.6, "width": 0.5, "color": 2, "opacity": 1 }] }"#) throws -> BannerFrameDesign {
        let defaultPieces = #"""
        [
          { "anchor": "start", "paths": [{ "d": "M2 2 h10 v10 h-10 Z", "color": 3, "opacity": 1, "group": "rosaces" }] },
          { "anchor": "end", "paths": [{ "d": "M288 2 h10 v10 h-10 Z", "color": 3, "opacity": 1, "group": "rosaces" }] },
          { "anchor": "center", "paths": [{ "d": "M140 0 L150 14 L160 0 Z", "color": 3, "opacity": 1 }] }
        ]
        """#
        let json = """
        {
          "key": "haussmannien",
          "viewBox": [0, 0, 300, 100],
          "palette": ["#DCD2C0", "#A99B83", "#22262B", "#B8954F"],
          "border": \(border),
          "reach": { "corner": 14, "cartouche": { "width": 40, "depth": 16, "edge": "top" } },
          "pieces": \(pieces ?? defaultPieces),
          "friezes": [{ "module": 4, "from": 16, "to": 16, "fit": "repeat", "paths": [{ "d": "M16.5 2.2 h2.6 v3.2 h-2.6 Z", "color": 1, "opacity": 1 }] }]
          \(extra)
        }
        """
        return try JSONDecoder().decode(BannerFrameDesign.self, from: Data(json.utf8))
    }

    private let intruder = #"[{ "anchor": "center", "paths": [{ "d": "M100 30 h100 v40 h-100 Z", "color": 2, "opacity": 1, "group": "intrus" }] }]"#

    private func pixel(_ image: UIImage, x: Int, y: Int) -> (r: UInt8, g: UInt8, b: UInt8, a: UInt8) {
        let cg = image.cgImage!
        var data = [UInt8](repeating: 0, count: 4)
        let context = CGContext(data: &data, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(cg, in: CGRect(x: -CGFloat(x), y: -CGFloat(cg.height - 1 - y), width: CGFloat(cg.width), height: CGFloat(cg.height)))
        return (data[0], data[1], data[2], data[3])
    }

    // MARK: Le centre transparent

    func test_staticImage_aPathPosedInTheHole_isNeverPainted() throws {
        let design = try frame(pieces: intruder)
        let image = try XCTUnwrap(BannerFrameRenderer.staticImage(design, size: CGSize(width: 360, height: 120), screenScale: 1))
        XCTAssertEqual(pixel(image, x: 180, y: 60).a, 0, "le chemin posé au milieu du trou n'y est pas peint")
        XCTAssertEqual(pixel(image, x: 140, y: 50).a, 0)
        XCTAssertGreaterThan(pixel(image, x: 4, y: 60).a, 200, "la bordure, elle, est peinte")
    }

    func test_clipPath_excludesTheHole_keepsBorderCornersAndCartouche() throws {
        let clip = BannerFrameRenderer.clipPath(try frame(), width: 450, scale: 1)
        XCTAssertFalse(clip.contains(CGPoint(x: 225, y: 50), using: .winding))
        XCTAssertFalse(clip.contains(CGPoint(x: 225, y: 85), using: .winding), "pas de cartouche en bas")
        XCTAssertTrue(clip.contains(CGPoint(x: 4, y: 50), using: .winding))
        XCTAssertTrue(clip.contains(CGPoint(x: 12, y: 12), using: .winding), "le coin mord dans le trou")
        XCTAssertTrue(clip.contains(CGPoint(x: 225, y: 15), using: .winding), "le cartouche du haut aussi")
    }

    func test_motionContent_anAnimatedPathInTheHole_isMaskedOut() throws {
        let design = try frame(#", "motion": [{ "kind": "pulse", "targets": ["intrus"], "duration": 2 }]"#, pieces: intruder)
        let size = CGSize(width: 360, height: 120)
        let plan = BannerFrameRenderer.plan(design, size: size)
        XCTAssertEqual(plan.animated, [67], "les 67 modules de la frise d'abord, l'intrus ensuite")
        let content = BannerFrameRenderer.motionContent(design, size: size, plan: plan)
        let mask = try XCTUnwrap(content.root.mask as? CAShapeLayer)
        let path = try XCTUnwrap(mask.path)
        XCTAssertFalse(path.contains(CGPoint(x: 180, y: 60), using: .winding), "la couche animée est découpée à la région")
        XCTAssertTrue(path.contains(CGPoint(x: 4, y: 60), using: .winding))
    }

    // MARK: La géométrie

    func test_elements_bordersFollowTheWidth_piecesKeepTheirAnchor_friezesRepeatWholeModules() throws {
        let elements = BannerFrameRenderer.elements(try frame(), width: 600)
        XCTAssertEqual(elements.first { $0.path.d.hasPrefix("M288") }?.tx, 300)
        XCTAssertEqual(elements.first { $0.path.d.hasPrefix("M140") }?.tx, 150)
        let modules = elements.filter { $0.path.d.hasPrefix("M16.5") }
        XCTAssertEqual(modules.count, 142)
        XCTAssertEqual(modules[1].tx - modules[0].tx, 4, accuracy: 1e-9)
    }

    /// #10936 — les FRISES se peignent d'abord : un coin et un cartouche se posent PAR-DESSUS la frise
    /// qui court dessous, à toutes les largeurs (miroir de `bannerFrameElements`).
    func test_elements_friezesComeFirst_piecesArePaintedOverThem() throws {
        for width in [300.0, 450, 900] {
            let elements = BannerFrameRenderer.elements(try frame(), width: width)
            let isFrieze = elements.map { $0.path.d.hasPrefix("M16.5") }
            let firstPiece = try XCTUnwrap(isFrieze.firstIndex(of: false))
            XCTAssertGreaterThan(firstPiece, 0)
            XCTAssertTrue(isFrieze[..<firstPiece].allSatisfy { $0 })
            XCTAssertTrue(isFrieze[firstPiece...].allSatisfy { !$0 }, "aucune frise après la première pièce")
            XCTAssertEqual(elements[firstPiece...].map { String($0.path.d.prefix(4)) }, ["M2 2", "M288", "M140"], "les pièces gardent l'ordre du document")
        }
    }

    func test_staticImage_aCornerPieceCoversTheFriezeBeneathIt() throws {
        let pieces = #"[{ "anchor": "start", "paths": [{ "d": "M16 0 h4 v8 h-4 Z", "color": 3, "opacity": 1 }] }]"#
        let image = try XCTUnwrap(BannerFrameRenderer.staticImage(try frame(pieces: pieces), size: CGSize(width: 300, height: 100), screenScale: 1))
        let covered = pixel(image, x: 17, y: 4)
        XCTAssertEqual(covered.r, 0xB8, accuracy: 2, "la pièce (or) se peint par-dessus la frise (taupe)")
        XCTAssertEqual(covered.g, 0x95, accuracy: 2)
    }

    func test_elements_aJustifiedFrieze_endsExactlyAtItsMargin() throws {
        let json = #"""
        { "key": "j", "viewBox": [0, 0, 300, 100], "palette": ["#000000"], "border": { "width": 4, "color": 0, "opacity": 1 }, "reach": { "corner": 0 },
          "friezes": [{ "module": 5, "from": 16, "to": 16, "fit": "justify", "paths": [{ "d": "M16 2 h5 v3 h-5 Z", "color": 0, "opacity": 1 }] }] }
        """#
        let design = try JSONDecoder().decode(BannerFrameDesign.self, from: Data(json.utf8))
        let modules = BannerFrameRenderer.elements(design, width: 400)
        XCTAssertEqual(modules.count, 74)
        let last = try XCTUnwrap(modules.last)
        XCTAssertEqual(last.tx + 21 * last.sx, 384, accuracy: 1e-6)
    }

    func test_staticImage_anUnreadableGradient_fallsBackToTheColour() throws {
        let design = try frame(#", "gradients": [{ "kind": "radial", "stops": [] }]"#,
                               border: #"{ "width": 9.6, "color": 2, "gradient": 0, "opacity": 1 }"#)
        XCTAssertEqual(design.gradients.count, 1)
        XCTAssertNil(design.gradients[0])
        let image = try XCTUnwrap(BannerFrameRenderer.staticImage(design, size: CGSize(width: 300, height: 100), screenScale: 1))
        let border = pixel(image, x: 4, y: 50)
        XCTAssertEqual(border.r, 0x22, accuracy: 2)
        XCTAssertEqual(border.g, 0x26, accuracy: 2)
        XCTAssertEqual(border.b, 0x2B, accuracy: 2)
    }

    // MARK: Les mouvements, sur le GPU

    func test_motionContent_twinkle_animatesOpacityPerTarget_staggered() throws {
        let design = try frame(#", "motion": [{ "kind": "twinkle", "targets": ["rosaces"], "duration": 3.4, "stagger": 0.8 }]"#)
        let size = CGSize(width: 300, height: 100)
        let plan = BannerFrameRenderer.plan(design, size: size)
        XCTAssertEqual(plan.layers.map(\.elements), [[67], [68]], "les rosaces suivent les 67 modules de la frise")
        XCTAssertEqual(plan.layers.map { $0.chain[0].delay }, [0, 0.8])
        let content = BannerFrameRenderer.motionContent(design, size: size, plan: plan)
        XCTAssertEqual(content.animations.map { ($0.animation as? CABasicAnimation)?.keyPath }, ["opacity", "opacity"])
        XCTAssertEqual(content.animations.map(\.delay), [0, 0.8])
    }

    func test_host_installsAnimations_onlyWhenMotionIsAllowed_andPausesOutOfWindow() throws {
        let design = try frame(#", "motion": [{ "kind": "rotate", "targets": ["rosaces"], "duration": 12 }]"#)
        let size = CGSize(width: 300, height: 100)
        let content = BannerFrameRenderer.motionContent(design, size: size, plan: BannerFrameRenderer.plan(design, size: size))
        let host = FrameMotionHostView(frame: CGRect(origin: .zero, size: size))
        host.animates = false
        host.show(content)
        XCTAssertFalse(host.hasInstalledAnimations, "cadre fixe : aucune animation posée")
        XCTAssertNil(content.animations.first?.layer.animation(forKey: FrameMotionLayers.animationKey))
        host.animates = true
        XCTAssertEqual(host.hasInstalledAnimations, host.motionAllowed)
        XCTAssertTrue(host.isPaused, "hors fenêtre, les couches sont figées")
    }
}
