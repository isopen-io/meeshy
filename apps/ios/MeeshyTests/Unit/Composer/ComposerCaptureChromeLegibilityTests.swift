import XCTest
@testable import Meeshy

/// LE CHROME BLANC DU VISEUR RESTE LISIBLE SUR UN CADRE CLAIR (#9777). Sur un Photomaton, une
/// Carte postale ou un Faire-part, la croix, le flash, les zooms et « Filtres / Cadres » étaient
/// blancs sur blanc. Sous un cadre, un voile sombre leur garde 4,5:1 même sur un fond blanc pur.
final class ComposerCaptureChromeLegibilityTests: XCTestCase {
    func test_whiteChrome_onAWhiteFrameWithoutVeil_isUnreadable() {
        let contrast = ComposerCaptureChromeLegibility.whiteInkContrast(background: 1, veil: 0)
        XCTAssertLessThan(contrast, ComposerCaptureChromeLegibility.minimumContrast)
    }

    func test_whiteChrome_onTheLightestFrame_keepsAA() {
        let veil = ComposerCaptureChromeLegibility.veilOpacity(framed: true)
        let contrast = ComposerCaptureChromeLegibility.whiteInkContrast(background: 1, veil: veil)
        XCTAssertGreaterThanOrEqual(contrast, ComposerCaptureChromeLegibility.minimumContrast)
    }

    func test_veil_withoutAFrame_leavesTheViewfinderUntouched() {
        XCTAssertEqual(ComposerCaptureChromeLegibility.veilOpacity(framed: false), 0)
    }
}
