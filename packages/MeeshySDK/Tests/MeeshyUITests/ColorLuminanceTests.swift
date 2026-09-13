import XCTest
import SwiftUI
@testable import MeeshyUI

final class ColorLuminanceTests: XCTestCase {

    func test_white_isCloseToOne() {
        let lum = Color.white.luminance
        XCTAssertGreaterThan(lum, 0.95)
        XCTAssertLessThanOrEqual(lum, 1.0)
    }

    func test_black_isCloseToZero() {
        let lum = Color.black.luminance
        XCTAssertGreaterThanOrEqual(lum, 0.0)
        XCTAssertLessThan(lum, 0.05)
    }

    func test_midGray_isCloseToWCAGLinear() {
        // sRGB 0.5 -> ~0.214 linear (WCAG)
        let lum = Color(red: 0.5, green: 0.5, blue: 0.5).luminance
        XCTAssertGreaterThan(lum, 0.18)
        XCTAssertLessThan(lum, 0.30)
    }

    func test_pureRed_hasExpectedLuminance() {
        // WCAG R coefficient: 0.2126
        let lum = Color(red: 1, green: 0, blue: 0).luminance
        XCTAssertGreaterThan(lum, 0.20)
        XCTAssertLessThan(lum, 0.24)
    }

    // MARK: - readableInk (#5950 — le seuil d'égalité de contraste WCAG,
    // pas un seuil arrondi en dur)

    /// Premier accent du jeu de fixtures web-v2 (L = 0,4196, dans la plage
    /// fautive 0,179 → 0,6) : l'ancien seuil `0.6` élisait le blanc (1,98:1,
    /// sous AA) ; le point d'égalité WCAG élit le noir (10,61:1).
    func test_readableInk_accentInFormerlyWrongRange_isBlack() {
        let ink = Color(hex: "#46BDCA").readableInk
        XCTAssertLessThan(ink.luminance, 0.05, "attendu noir, encre illisible servie sinon")
    }

    /// Accent proche de l'ancien seuil 0.6 (mais toujours au-dessus du point
    /// d'égalité ≈ 0,179) : doit rester noir — couvre la régression inverse
    /// qu'un simple abaissement brutal du seuil introduirait.
    func test_readableInk_accentNearFormerThreshold_staysBlack() {
        // Gris clair ~ luminance 0.57 (sous l'ancien 0.6, au-dessus du point d'égalité)
        let ink = Color(red: 0.78, green: 0.78, blue: 0.78).readableInk
        XCTAssertLessThan(ink.luminance, 0.05)
    }

    func test_readableInk_white_isBlack() {
        XCTAssertLessThan(Color.white.readableInk.luminance, 0.05)
    }

    func test_readableInk_black_isWhite() {
        XCTAssertGreaterThan(Color.black.readableInk.luminance, 0.95)
    }
}
