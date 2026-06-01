import XCTest
import QuartzCore
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTextLayerGlyphSuppressionTests: XCTestCase {

    private func makeGlassLayer() -> StoryTextLayer {
        let text = StoryTextObject(id: "g1", text: "GLASS",
                                   x: 0.5, y: 0.5,
                                   backgroundStyle: .glass(radius: 24))
        let layer = StoryTextLayer()
        layer.configure(with: text,
                        geometry: CanvasGeometry(renderSize: CGSize(width: 390, height: 693)),
                        mode: .edit)
        return layer
    }

    func test_setGlyphsHidden_true_keepsBoundsAndBackgroundSublayer() {
        let layer = makeGlassLayer()
        let boundsBefore = layer.bounds
        let glassBefore = layer.sublayers?.contains { $0 is StoryGlassBackdropLayer } ?? false
        XCTAssertTrue(glassBefore, "le fond glass doit être un sous-calque")

        layer.setGlyphsHidden(true)

        XCTAssertEqual(layer.bounds, boundsBefore)
        XCTAssertTrue(layer.sublayers?.contains { $0 is StoryGlassBackdropLayer } ?? false,
                      "setGlyphsHidden ne doit PAS retirer le fond")
    }

    func test_setGlyphsHidden_makesForegroundTransparent_thenRestores() {
        let layer = makeGlassLayer()
        // Depuis le fix z-order glass : pour un fond VERRE, les glyphes visibles
        // vivent dans une sous-calque CATextLayer posée AU-DESSUS du backdrop (le
        // `string` propre du parent reste transparent en permanence). `setGlyphsHidden`
        // bascule donc cette sous-calque, pas `layer.string`.
        func glyphString() -> NSAttributedString? {
            let glyph = (layer.sublayers ?? []).first {
                !($0 is StoryGlassBackdropLayer) && $0 is CATextLayer
            } as? CATextLayer
            return glyph?.string as? NSAttributedString
        }

        layer.setGlyphsHidden(true)
        let hiddenColor = glyphString()?.attribute(.foregroundColor, at: 0, effectiveRange: nil)
        XCTAssertEqual((hiddenColor as! CGColor).alpha, 0, accuracy: 0.001)

        layer.setGlyphsHidden(false)
        let shownColor = glyphString()?.attribute(.foregroundColor, at: 0, effectiveRange: nil)
        XCTAssertGreaterThan((shownColor as! CGColor).alpha, 0.5)
    }
}
