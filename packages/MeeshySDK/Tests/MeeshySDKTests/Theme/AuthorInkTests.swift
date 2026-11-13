import XCTest
@testable import MeeshySDK

/// #17863 (A1.10, A2.2) : la couleur d'auteur tient 4,5:1 sur la carte du journal,
/// claire comme sombre. Telle quelle quand elle est déjà lisible, sinon rapprochée
/// de l'encre du thème du plus PETIT pas. Miroir de `legibleTint` / `authorInk`
/// (`apps/web/src/lib/view/author-ink.ts`), mesuré sur les 39 couleurs de la palette.
final class AuthorInkTests: XCTestCase {

    private struct Scheme {
        let mode: ThemeMode
        let backgrounds: [String]
        let ink: String
    }

    private let schemes = [
        Scheme(mode: .dark, backgrounds: ["09090B", "13111C"], ink: "EEF2FF"),
        Scheme(mode: .light, backgrounds: ["FFFFFF", "F8F7FF"], ink: "1E1B4B"),
    ]

    private var palette: [String] { DynamicColorGenerator.vibrantPalette }

    private func channels(_ hex: String) -> [Double] {
        [0, 2, 4].map { offset in
            let start = hex.index(hex.startIndex, offsetBy: offset)
            return Double(Int(hex[start..<hex.index(start, offsetBy: 2)], radix: 16) ?? 0)
        }
    }

    private func luminance(_ hex: String) -> Double {
        let lin = channels(hex).map { c -> Double in
            let s = c / 255
            return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    }

    private func contrast(_ a: String, _ b: String) -> Double {
        let la = luminance(a), lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    private func mix(_ a: String, _ b: String, _ t: Double) -> String {
        let ca = channels(a), cb = channels(b)
        return (0..<3).map { i in
            String(format: "%02X", Int((ca[i] + (cb[i] - ca[i]) * t).rounded()))
        }.joined()
    }

    private func legible(_ hex: String, on scheme: Scheme) -> Bool {
        scheme.backgrounds.allSatisfy { contrast(hex, $0) >= 4.5 }
    }

    func test_palette_hasThirtyNineColors() {
        XCTAssertEqual(palette.count, 39)
    }

    func test_hex_everyPaletteColor_holdsFourPointFiveOnTheCardInBothSchemes() {
        for scheme in schemes {
            for color in palette {
                let ink = AuthorInk.hex(color, for: scheme.mode)
                for background in scheme.backgrounds {
                    XCTAssertGreaterThanOrEqual(contrast(ink, background), 4.5, "\(color) \(scheme.mode) sur \(background) -> \(ink)")
                }
            }
        }
    }

    func test_hex_aColorAlreadyLegible_isNotModified() {
        for scheme in schemes {
            for color in palette where legible(color, on: scheme) {
                XCTAssertEqual(AuthorInk.hex(color, for: scheme.mode), color, "\(color) \(scheme.mode) est déjà lisible")
            }
        }
    }

    func test_hex_aColorThatIsNot_getsTheSmallestStepTowardTheInk() {
        for scheme in schemes {
            for color in palette where !legible(color, on: scheme) {
                let steps = (0...25).map { min(1.0, Double($0) * 0.04) }
                let expected = steps.map { mix(color, scheme.ink, $0) }.first { legible($0, on: scheme) } ?? scheme.ink
                XCTAssertEqual(AuthorInk.hex(color, for: scheme.mode), expected, "\(color) \(scheme.mode)")
            }
        }
    }

    func test_hex_lightMode_noLongerStopsAtTheFixedBrightnessCeiling() {
        let stuck = palette.filter { color in
            let capped = DynamicColorGenerator.adaptedColor(color, for: .light)
            return contrast(capped, "FFFFFF") < 4.5
        }
        XCTAssertFalse(stuck.isEmpty, "le plafond fixe laissait des couleurs sous 4,5:1 sur blanc")
        for color in stuck {
            XCTAssertGreaterThanOrEqual(contrast(AuthorInk.hex(color, for: .light), "FFFFFF"), 4.5, color)
        }
    }

    func test_hex_acceptsADiezeAndLowercase_andAnswersInTheBareUppercaseForm() {
        XCTAssertEqual(AuthorInk.hex("#e74c3c", for: .dark), AuthorInk.hex("E74C3C", for: .dark))
        XCTAssertEqual(AuthorInk.hex("e74c3c", for: .light), AuthorInk.hex("E74C3C", for: .light))
        XCTAssertEqual(AuthorInk.hex("e74c3c", for: .light).count, 6)
    }
}
