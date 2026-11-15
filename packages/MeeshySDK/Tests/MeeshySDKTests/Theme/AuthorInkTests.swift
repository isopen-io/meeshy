import XCTest
@testable import MeeshySDK

/// #17863 (A1.10, A2.2) : la couleur d'auteur tient 4,5:1 sur la carte du journal,
/// claire comme sombre. Telle quelle quand elle est déjà lisible, sinon rapprochée
/// de l'encre du thème du plus PETIT pas. Miroir de `legibleTint` / `authorInk`
/// (`apps/web/src/lib/view/author-ink.ts`), mesuré sur les 39 couleurs de la palette,
/// contre les MÊMES fonds que le web : surface, carte, chaque arrêt du fond du fil
/// (`ConversationAnimatedBackground.baseGradient`) accent au pire, seul puis sous la lueur.
final class AuthorInkTests: XCTestCase {

    private struct Scheme {
        let mode: ThemeMode
        let backgrounds: [String]
        let ink: String
    }

    private let schemes = [
        Scheme(mode: .dark, backgrounds: AuthorInkTests.webBackgrounds[.dark] ?? [], ink: "EEF2FF"),
        Scheme(mode: .light, backgrounds: AuthorInkTests.webBackgrounds[.light] ?? [], ink: "1E1B4B"),
    ]

    /// `AUTHOR_INK_BACKGROUNDS` du web, relevé en hex nu : surface, carte, les trois arrêts du fond
    /// du fil (accent au pire : blanc en sombre, noir en clair), puis ces arrêts sous la lueur
    /// (12 % sombre, 7 % clair).
    private static let webBackgrounds: [ThemeMode: [String]] = [
        .dark: ["09090B", "13111C", "0F0C29", "2C2943", "24243E", "2C2943", "45435A", "3E3E55"],
        .light: ["FFFFFF", "F8F7FF", "EBEBEB", "FFFFFF", "F2F2F2", "DBDBDB", "EDEDED", "E1E1E1"],
    ]

    /// `authorInk(...)` du web sur chaque couleur de la palette, relevé en hex nu majuscule.
    private static let webInk: [ThemeMode: [String: String]] = [
        .dark: [
            "E74C3C": "EBA2A1", "C0392B": "DCA8AA", "DC4A5A": "E5A1B0", "D94452": "E5A5B3", "F43F5E": "F19CB2",
            "FF7F50": "FB9B7A", "E67E22": "E9A872", "F97316": "F5A16A", "EA580C": "ECA281", "D4763B": "DEA889",
            "D97706": "E1A86A", "B8860B": "CEB16D", "CA8A04": "D7AF5E", "2ECC71": "2ECC71", "27AE60": "6FC699",
            "059669": "75C2B1", "16A34A": "75C69A", "22C55E": "43CC78", "1ABC9C": "44C7B0", "14B8A6": "48C6BB",
            "0D9488": "79C1C1", "0891B2": "76C0D7", "00CED1": "00CED1", "3498DB": "7EBCE9", "2980B9": "8FBBDD",
            "0EA5E9": "56BEF0", "3B82F6": "91B8FA", "2563EB": "96B3F6", "6366F1": "ABAFF8", "4F46E5": "AEADF5",
            "7C3AED": "C0A8F8", "6D28D9": "C0A9F1", "9B59B6": "C6A9DC", "A855F7": "CAA0FB", "D946EF": "E399F7",
            "C026D3": "DCA0ED", "EC4899": "ED9ACA", "E91E63": "EC9DC1", "DB2777": "E6A1C9",
        ],
        .light: [
            "E74C3C": "A73C41", "C0392B": "AD352F", "DC4A5A": "9F3B55", "D94452": "A53950", "F43F5E": "A73257",
            "FF7F50": "8A4B4D", "E67E22": "864E36", "F97316": "90492F", "EA580C": "A14223", "D4763B": "844E42",
            "D97706": "874F24", "B8860B": "7A5B25", "CA8A04": "7E5923", "2ECC71": "25695C", "27AE60": "236756",
            "059669": "0E6A5E", "16A34A": "196D4A", "22C55E": "206653", "1ABC9C": "1C6872", "14B8A6": "196677",
            "0D9488": "136872", "0891B2": "10678D", "00CED1": "126381", "3498DB": "2A619C", "2980B9": "256096",
            "0EA5E9": "16639D", "3B82F6": "2F59B2", "2563EB": "2457D1", "6366F1": "5051C3", "4F46E5": "4F46E5",
            "7C3AED": "7136DA", "6D28D9": "6D28D9", "9B59B6": "7D4A9C", "A855F7": "7640B9", "D946EF": "8E35AD",
            "C026D3": "9923B2", "EC4899": "9A367A", "E91E63": "B01D5C", "DB2777": "AE246C",
        ],
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

    func test_backgrounds_areTheWebsSet_surfaceCardAndEveryThreadStopUnderItsGlow() {
        XCTAssertEqual(AuthorInk.backgrounds(for: .dark), Self.webBackgrounds[.dark])
        XCTAssertEqual(AuthorInk.backgrounds(for: .light), Self.webBackgrounds[.light])
    }

    func test_hex_everyPaletteColor_isTheWebsAuthorInk_inBothSchemes() {
        for mode in [ThemeMode.dark, .light] {
            for color in palette {
                XCTAssertEqual(AuthorInk.hex(color, for: mode), Self.webInk[mode]?[color], "\(color) \(mode)")
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
