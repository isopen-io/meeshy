import XCTest
import SwiftUI
@testable import MeeshyUI

/// Lisibilité du chrome glass selon le FOND de la slide (capture user
/// 2026-07-11 : icônes indigo950 sur fond bleu nuit = illisibles). Le scheme
/// suit la luminance WCAG du fond, pas le thème de l'app.
final class CanvasChromeSchemeTests: XCTestCase {

    // MARK: - Luminance

    func test_relativeLuminance_blackAndWhite() {
        XCTAssertEqual(CanvasChromeScheme.relativeLuminance(hex: "000000") ?? -1, 0, accuracy: 0.0001)
        XCTAssertEqual(CanvasChromeScheme.relativeLuminance(hex: "FFFFFF") ?? -1, 1, accuracy: 0.0001)
    }

    func test_relativeLuminance_acceptsHashPrefix() {
        XCTAssertEqual(CanvasChromeScheme.relativeLuminance(hex: "#FFFFFF") ?? -1, 1, accuracy: 0.0001)
    }

    func test_relativeLuminance_invalidHex_returnsNil() {
        XCTAssertNil(CanvasChromeScheme.relativeLuminance(hex: "nope"))
        XCTAssertNil(CanvasChromeScheme.relativeLuminance(hex: "FFF"))
        XCTAssertNil(CanvasChromeScheme.relativeLuminance(hex: ""))
    }

    // MARK: - Fond sérialisé (hex / gradient)

    func test_backgroundLuminance_gradient_averagesStops() {
        let lum = CanvasChromeScheme.backgroundLuminance("gradient:000000:FFFFFF")
        XCTAssertEqual(lum ?? -1, 0.5, accuracy: 0.0001)
    }

    // MARK: - Scheme

    func test_scheme_midnightBlueBackground_isDark() {
        // Le fond de la capture user : bleu nuit — icônes claires requises.
        XCTAssertEqual(CanvasChromeScheme.scheme(background: "1A2744", hasMediaBackground: false), .dark)
    }

    func test_scheme_pastelBackground_isLight() {
        XCTAssertEqual(CanvasChromeScheme.scheme(background: "EEF2FF", hasMediaBackground: false), .light)
    }

    func test_scheme_mediaBackground_forcesDark() {
        XCTAssertEqual(CanvasChromeScheme.scheme(background: "FFFFFF", hasMediaBackground: true), .dark)
    }

    func test_scheme_missingOrInvalidBackground_fallsBackDark() {
        XCTAssertEqual(CanvasChromeScheme.scheme(background: nil, hasMediaBackground: false), .dark)
        XCTAssertEqual(CanvasChromeScheme.scheme(background: "oops", hasMediaBackground: false), .dark)
    }

    func test_scheme_hashPrefixedComposerBackground_isHandled() {
        // Le composer stocke `backgroundColor` AVEC le préfixe `#`.
        XCTAssertEqual(CanvasChromeScheme.scheme(background: "#0B1220", hasMediaBackground: false), .dark)
        XCTAssertEqual(CanvasChromeScheme.scheme(background: "#F8F7FF", hasMediaBackground: false), .light)
    }
}
