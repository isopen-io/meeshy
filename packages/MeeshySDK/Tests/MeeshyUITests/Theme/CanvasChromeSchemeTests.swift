import XCTest
import SwiftUI
import UIKit
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

    // MARK: - Luminance moyenne d'un bitmap (capture user 2026-07-20 :
    // capture d'écran BLANCHE posée en fond → chrome blanc invisible si on
    // force `.dark` pour tout média)

    private func solidImage(_ color: UIColor) -> UIImage {
        let size = CGSize(width: 12, height: 12)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    func test_averageRelativeLuminance_whiteBitmap_nearOne() {
        let lum = CanvasChromeScheme.averageRelativeLuminance(of: solidImage(.white))
        XCTAssertEqual(lum ?? -1, 1, accuracy: 0.05)
    }

    func test_averageRelativeLuminance_blackBitmap_nearZero() {
        let lum = CanvasChromeScheme.averageRelativeLuminance(of: solidImage(.black))
        XCTAssertEqual(lum ?? -1, 0, accuracy: 0.05)
    }

    func test_averageRelativeLuminance_midGray_isBetween() {
        let lum = CanvasChromeScheme.averageRelativeLuminance(of: solidImage(UIColor(white: 0.5, alpha: 1)))
        XCTAssertGreaterThan(lum ?? -1, 0.1)
        XCTAssertLessThan(lum ?? 2, 0.5)
    }

    // MARK: - Scheme média piloté par la luminance du bitmap

    func test_scheme_brightMediaLuminance_flipsLight() {
        // Capture Library blanche : le chrome doit passer sombre (icônes lisibles).
        XCTAssertEqual(
            CanvasChromeScheme.scheme(background: "#0B1220", hasMediaBackground: true, mediaLuminance: 0.85),
            .light)
    }

    func test_scheme_darkMediaLuminance_staysDark() {
        // Photo fleurs magenta sombre (capture 2026-07-20 initiale) : chrome blanc.
        XCTAssertEqual(
            CanvasChromeScheme.scheme(background: "#EEF2FF", hasMediaBackground: true, mediaLuminance: 0.05),
            .dark)
    }

    func test_scheme_unknownMediaLuminance_fallsBackDark() {
        // Bitmap indisponible (vidéo sans thumbnail) : convention viewer = blanc.
        XCTAssertEqual(
            CanvasChromeScheme.scheme(background: "#EEF2FF", hasMediaBackground: true, mediaLuminance: nil),
            .dark)
    }

    func test_scheme_mediaLuminance_ignoredWithoutMediaBackground() {
        // La luminance média n'est consultée QUE si un média de fond existe.
        XCTAssertEqual(
            CanvasChromeScheme.scheme(background: "#0B1220", hasMediaBackground: false, mediaLuminance: 0.9),
            .dark)
    }

    func test_scheme_mediaThreshold_biasedAboveWCAGEquilibrium() {
        // Photos mi-claires : on GARDE la convention plein écran (chrome blanc)
        // jusqu'à un fond franchement clair — seuil média > seuil WCAG pur.
        XCTAssertGreaterThan(CanvasChromeScheme.mediaDarkThreshold, CanvasChromeScheme.darkThreshold)
        XCTAssertEqual(
            CanvasChromeScheme.scheme(background: nil, hasMediaBackground: true, mediaLuminance: 0.25),
            .dark)
    }
}
