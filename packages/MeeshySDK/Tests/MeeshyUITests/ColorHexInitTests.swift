import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

/// Verrouille le comportement EXACT de `Color(hex:)` à travers le fast-path
/// canonique ("RRGGBB" / "#RRGGBB", insensible à la casse) ET le fallback
/// legacy (espaces de garde, '#' interne, 3/8 digits, contenu vide/non-hex).
/// L'optimisation fast-path NE DOIT JAMAIS diverger de l'arithmétique de
/// masquage 24-bit historique (Scanner.scanHexInt64 + masque 0xFF0000/00/FF).
final class ColorHexInitTests: XCTestCase {

    private func rgb255(_ color: Color) -> (Int, Int, Int) {
        let ui = UIColor(color)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
    }

    private func assertHex(_ hex: String, _ expected: (Int, Int, Int),
                           file: StaticString = #filePath, line: UInt = #line) {
        let got = rgb255(Color(hex: hex))
        XCTAssertEqual(got.0, expected.0, "R mismatch for '\(hex)'", file: file, line: line)
        XCTAssertEqual(got.1, expected.1, "G mismatch for '\(hex)'", file: file, line: line)
        XCTAssertEqual(got.2, expected.2, "B mismatch for '\(hex)'", file: file, line: line)
    }

    // MARK: - Fast path (formes canoniques, zéro allocation)

    func test_sixDigitUppercase() { assertHex("FF0000", (255, 0, 0)) }
    func test_sixDigitWithHash() { assertHex("#00FF00", (0, 255, 0)) }
    func test_sixDigitLowercase() { assertHex("0000ff", (0, 0, 255)) }
    func test_brandNeutralLight() { assertHex("F5F5F0", (245, 245, 240)) }
    func test_brandNeutralDark() { assertHex("1C1917", (28, 25, 23)) }
    func test_mixedCaseWithHash() { assertHex("#aAbBcC", (170, 187, 204)) }

    // MARK: - Fallback path (comportement legacy strictement préservé)

    func test_whitespacePadded_fallsBackIdentically() { assertHex("  #1C1917  ", (28, 25, 23)) }
    func test_eightDigit_masksLow24Bits() { assertHex("FFFFFFFF", (255, 255, 255)) }
    func test_empty_isBlack() { assertHex("", (0, 0, 0)) }
    func test_threeDigit_legacyScannerBehavior() { assertHex("ABC", (0, 10, 188)) }
    func test_doubleHashPrefix_strippedThenScanned() { assertHex("##123456", (18, 52, 86)) }
    func test_sevenHexNoHash_fallsBackNotFastPath() { assertHex("1234567", (35, 69, 103)) }
}
