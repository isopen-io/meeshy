import CoreImage
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

/// LE VOILE SE RÈGLE SUR LA BANDE QU'IL COUVRE (#9777, recette #9755). Un voile fixe à 55 %
/// assombrissait aussi le viseur sous un cadre déjà sombre ; il se mesure désormais sur la
/// luminance des bandes du cadre peint, juste assez dense pour garder 4,5:1.
final class ComposerCaptureChromeBandTests: XCTestCase {
    func test_veil_onADarkBand_isNotNeeded() {
        XCTAssertEqual(ComposerCaptureChromeLegibility.veilOpacity(bandLuminance: 0.02), 0,
                       "le blanc garde déjà 4,5:1 sur un cadre sombre : rien n'assombrit le viseur")
    }

    func test_veil_onAnyBand_keepsAAWithTheLightestVeil() {
        for luminance in stride(from: 0.0, through: 1.0, by: 0.05) {
            let veil = ComposerCaptureChromeLegibility.veilOpacity(bandLuminance: luminance)
            let fond = ComposerCaptureChromeLegibility.encoded(luminance)
            XCTAssertGreaterThanOrEqual(ComposerCaptureChromeLegibility.whiteInkContrast(background: fond, veil: veil),
                                        ComposerCaptureChromeLegibility.minimumContrast, "luminance \(luminance)")
            XCTAssertLessThanOrEqual(veil, ComposerCaptureChromeLegibility.veilOpacity, "jamais plus dense qu'avant")
        }
    }

    func test_veil_growsWithTheBrightnessOfTheBand() {
        let pale = ComposerCaptureChromeLegibility.veilOpacity(bandLuminance: 0.4)
        let blanc = ComposerCaptureChromeLegibility.veilOpacity(bandLuminance: 1)
        XCTAssertGreaterThan(pale, 0)
        XCTAssertGreaterThan(blanc, pale)
    }

    func test_veil_unmeasuredUnderAFrame_staysConservative() {
        XCTAssertEqual(ComposerCaptureChromeLegibility.veilOpacity(framed: true, bandLuminance: nil),
                       ComposerCaptureChromeLegibility.veilOpacity, "la mesure manque : le voile plein protège")
        XCTAssertEqual(ComposerCaptureChromeLegibility.veilOpacity(framed: false, bandLuminance: 1), 0)
    }

    func test_bands_measureTheFramePaintedUnderTheChrome() throws {
        let taille = CGSize(width: 108, height: 192)
        let haut = CIImage(color: .white).cropped(to: CGRect(x: 0, y: 96, width: 108, height: 96))
        let bas = CIImage(color: .black).cropped(to: CGRect(x: 0, y: 0, width: 108, height: 96))
        let scene = CallLiveFrameScene(
            inputs: CallLiveFrameLayerInputs(frameId: "test.bandes", people: [],
                                             texts: CallFrameTexts(groupName: nil, isGroup: false, date: "", accentHex: nil),
                                             size: taille),
            backdrop: haut.composited(over: bas), overlay: CIImage.empty(), slots: [])
        let bandes = try XCTUnwrap(ComposerCaptureChromeLegibility.bands(of: scene, context: CIContext()))
        XCTAssertGreaterThan(bandes.top, 0.9, "un cadre blanc sous la rangée haute")
        XCTAssertLessThan(bandes.bottom, 0.05, "un cadre noir sous la barre du bas")
    }
}
