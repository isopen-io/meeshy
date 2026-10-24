import XCTest
@testable import MeeshyUI
import MeeshySDK

/// #12591 — **un texte cuit dans un média ne propose ni « Langue » ni le fond « Verre »**, et le
/// composer garde tout. Les atomes reçoivent le profil ; ils ne devinent rien.
final class StoryTextEditProfileTests: XCTestCase {

    func test_composer_keepsEveryToolAndEveryBackground() {
        XCTAssertEqual(StoryTextEditProfile.composer.tools, TextEditTool.all)
        XCTAssertEqual(StoryTextEditProfile.composer.backgrounds, StoryTextBackgroundPresets.all)
    }

    func test_bakedIntoMedia_dropsTheLanguageTool() {
        let outils = StoryTextEditProfile.bakedIntoMedia.tools
        XCTAssertFalse(outils.contains(.language), "une langue source ne traduit rien d'un texte gravé")
        XCTAssertEqual(outils, TextEditTool.all.filter { $0 != .language }, "l'ordre appris par les doigts est gardé")
    }

    func test_bakedIntoMedia_dropsTheGlassBackground() {
        let fonds = StoryTextEditProfile.bakedIntoMedia.backgrounds
        XCTAssertFalse(fonds.contains { if case .glass = $0 { return true } else { return false } })
        XCTAssertEqual(fonds.count, StoryTextBackgroundPresets.all.count - 1)
    }

    func test_backgroundCycle_followsTheOfferedBackgrounds_andNeverReachesGlass() {
        let fonds = StoryTextEditProfile.bakedIntoMedia.backgrounds
        var texte = StoryTextObject(text: "x")
        var vus: [StoryTextBackgroundStyle] = []
        for _ in 0 ..< fonds.count + 1 {
            StoryTextAttributeCycle.advance(.background, on: &texte, backgrounds: fonds)
            vus.append(texte.resolvedBackgroundStyle)
        }
        XCTAssertFalse(vus.contains { if case .glass = $0 { return true } else { return false } })
        XCTAssertTrue(vus.allSatisfy { fonds.contains($0) })
    }

    func test_backgroundCycle_withTheComposerDefault_isUnchanged() {
        var texte = StoryTextObject(text: "x")
        StoryTextAttributeCycle.advance(.background, on: &texte)
        XCTAssertEqual(texte.resolvedBackgroundStyle, StoryTextBackgroundPresets.all[1])
    }
}

@MainActor
final class StoryComposerCanvasBackgroundPolicyTests: XCTestCase {

    private func canvas() -> StoryCanvasUIView {
        let objet = StoryTextObject(text: "Salut")
        let slide = StorySlide(effects: StoryEffects(background: "FF0000", textObjects: [objet]))
        let vue = StoryCanvasUIView(slide: slide, mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 270, height: 480)
        vue.layoutIfNeeded()
        return vue
    }

    func test_withoutTheSceneBackground_theCanvasIsTransparentOutsideItsObjects() throws {
        let vue = canvas()
        StoryComposerCanvasView.applyBackgroundPolicy(to: vue, paintsSceneBackground: false)
        XCTAssertTrue(vue.backgroundLayer.isHidden)
        let rendu = UIGraphicsImageRenderer(size: vue.bounds.size, format: {
            let f = UIGraphicsImageRendererFormat(); f.scale = 1; f.opaque = false; return f
        }()).image { vue.layer.render(in: $0.cgContext) }
        let cg = try XCTUnwrap(rendu.cgImage)
        var coin = [UInt8](repeating: 0, count: 4)
        let contexte = CGContext(data: &coin, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                 space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        XCTAssertEqual(coin[3], 0, "aucun fond sous la saisie : le média de la retouche se voit à travers")
    }

    func test_byDefault_theCanvasKeepsItsBackground() {
        let vue = canvas()
        StoryComposerCanvasView.applyBackgroundPolicy(to: vue, paintsSceneBackground: true)
        XCTAssertFalse(vue.backgroundLayer.isHidden)
    }
}
