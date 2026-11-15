import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI

/// Verrouille le comportement EXACT de `Color(hex:)` à travers le fast-path
/// canonique ("RRGGBB" / "#RRGGBB", insensible à la casse) ET le fallback
/// legacy (espaces de garde, '#' interne, 3 digits, contenu vide/non-hex).
/// L'optimisation fast-path NE DOIT JAMAIS diverger de l'arithmétique de
/// masquage 24-bit historique (Scanner.scanHexInt64 + masque 0xFF0000/00/FF).
///
/// **La forme à HUIT chiffres fait exception depuis le #5045** : elle se lit
/// « RRGGBBAA », la convention du dépôt (`StoryTextObject` : « Hex "RRGGBB" ou
/// "RRGGBBAA" »), et non plus par masquage des 24 bits de POIDS FAIBLE — un
/// décalage qui rendait une couleur SANS RAPPORT avec celle demandée.
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
    func test_empty_isBlack() { assertHex("", (0, 0, 0)) }
    func test_threeDigit_legacyScannerBehavior() { assertHex("ABC", (0, 10, 188)) }
    func test_doubleHashPrefix_strippedThenScanned() { assertHex("##123456", (18, 52, 86)) }
    func test_sevenHexNoHash_fallsBackNotFastPath() { assertHex("1234567", (35, 69, 103)) }
    // MARK: - Huit chiffres : « RRGGBBAA » (#5045)

    /// **Le témoin qui ne pouvait pas tomber.** Il épinglait « FFFFFFFF » —
    /// le SEUL hex à huit chiffres du dépôt sur lequel l'ancien masquage
    /// (24 bits de poids faible) et la lecture juste rendent le MÊME RGB.
    /// Il est gardé, parce qu'il vaut toujours comme non-régression, mais il
    /// ne prouve rien seul : les trois témoins qui suivent sont ceux qui
    /// discriminent, et ils portent sur les hex que le dépôt utilise vraiment.
    func test_eightDigitOpaqueWhite_resteBlanc() { assertHex("FFFFFFFF", (255, 255, 255)) }

    /// « Noir à 65 % » — l'ancien décalage en rendait du BLEU FRANC (0,0,166).
    func test_noirTranslucide_estNoir() { assertHex("000000A6", (0, 0, 0)) }

    /// « Indigo à 65 % » — l'ancien décalage en rendait du VERT (102,241,166).
    func test_indigoTranslucide_gardeSonIndigo() { assertHex("6366F1A6", (99, 102, 241)) }

    func test_blancTranslucide_resteBlanc() { assertHex("FFFFFFA6", (255, 255, 255)) }

    /// **L'alpha est SERVI, pas seulement lu.** Sans cette assertion, un
    /// parseur qui rendrait la bonne teinte à opacité pleine passerait les
    /// trois témoins ci-dessus — et la vignette « 65 % » serait indiscernable
    /// de son opaque voisine, ce qui est le défaut d'origine sous une autre
    /// forme.
    func test_lAlphaDesHuitChiffres_atteintLaCouleur() {
        for (hex, expected) in [("000000A6", 166.0), ("FFFFFFA6", 166.0), ("6366F1FF", 255.0)] {
            let ui = UIColor(Color(hex: hex))
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            ui.getRed(&r, green: &g, blue: &b, alpha: &a)
            XCTAssertEqual(Double((a * 255).rounded()), expected, accuracy: 1,
                           "alpha de '\(hex)'")
        }
    }

    /// **Le sélecteur et le RENDERER lisent le même hex.** C'est l'assertion
    /// qui porte la loi 6 : l'aperçu ne doit pas mentir sur ce qui sera peint.
    /// `StoryTextLayer.parseHexColorNonisolated` est ce qui peint réellement le
    /// fond d'un texte de story ; il honorait déjà « RRGGBBAA » pendant que la
    /// pastille du composer, elle, le déformait.
    func test_leSélecteurEtLeRenderer_lisentLeMêmeHex() {
        for hex in ["000000", "000000A6", "FFFFFFA6", "6366F1A6", "F472B6"] {
            guard let peint = StoryTextLayer.parseHexColorNonisolated(hex) else {
                XCTFail("le renderer refuse '\(hex)'"); continue
            }
            var pr: CGFloat = 0, pg: CGFloat = 0, pb: CGFloat = 0, pa: CGFloat = 0
            peint.getRed(&pr, green: &pg, blue: &pb, alpha: &pa)

            var sr: CGFloat = 0, sg: CGFloat = 0, sb: CGFloat = 0, sa: CGFloat = 0
            UIColor(Color(hex: hex)).getRed(&sr, green: &sg, blue: &sb, alpha: &sa)

            XCTAssertEqual(sr, pr, accuracy: 0.01, "R de '\(hex)'")
            XCTAssertEqual(sg, pg, accuracy: 0.01, "G de '\(hex)'")
            XCTAssertEqual(sb, pb, accuracy: 0.01, "B de '\(hex)'")
            XCTAssertEqual(sa, pa, accuracy: 0.01, "alpha de '\(hex)'")
        }
    }
}
