import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// Mode Script : l'arc-en-ciel ne dessine aucun contour — il colore chaque
/// lettre. La couleur d'une lettre est STABLE pour un même message (graine =
/// id du message) : sinon les lettres clignoteraient à chaque rendu.
final class RainbowLettersTests: XCTestCase {

    func test_theSameMessage_alwaysGetsTheSameColors() {
        let a = RainbowLetters.colorIndices(count: 40, seed: "msg-1", paletteSize: 6)
        let b = RainbowLetters.colorIndices(count: 40, seed: "msg-1", paletteSize: 6)
        XCTAssertEqual(a, b, "même graine, mêmes couleurs : aucun clignotement d'un rendu à l'autre")
    }

    func test_twoMessages_getDifferentSequences() {
        XCTAssertNotEqual(RainbowLetters.colorIndices(count: 40, seed: "msg-1", paletteSize: 6),
                          RainbowLetters.colorIndices(count: 40, seed: "msg-2", paletteSize: 6))
    }

    func test_colorsVary_andNeverRepeatOnNeighbouringLetters() {
        let indices = RainbowLetters.colorIndices(count: 200, seed: "msg-3", paletteSize: 6)
        XCTAssertEqual(indices.count, 200)
        XCTAssertTrue(indices.allSatisfy { (0..<6).contains($0) })
        XCTAssertGreaterThanOrEqual(Set(indices).count, 5, "aléatoire : la palette est réellement parcourue")
        XCTAssertFalse(zip(indices, indices.dropFirst()).contains { $0 == $1 }, "deux voisines ne se confondent pas")
    }

    /// Lisible dans les deux thèmes : chaque teinte tient AA (4,5:1) contre le
    /// fond du thème.
    func test_bothPalettes_areReadable() {
        for hex in RainbowLetters.paletteHex(isDark: false) {
            XCTAssertGreaterThanOrEqual(Self.contrast(hex, "#FFFFFF"), 4.5, "clair : \(hex)")
        }
        for hex in RainbowLetters.paletteHex(isDark: true) {
            XCTAssertGreaterThanOrEqual(Self.contrast(hex, "#111118"), 4.5, "sombre : \(hex)")
        }
    }

    /// Les lettres ordinaires prennent les couleurs ; mentions, liens et
    /// espaces gardent les leurs.
    func test_painting_coloursPlainLettersOnly() {
        let base = Color.black
        var text = AttributedString("ab @c")
        text.foregroundColor = base
        let mention = text.range(of: "@c")!
        text[mention].foregroundColor = Color.blue
        let painted = RainbowLetters.painting(text, baseColor: base, seed: "m", isDark: false)
        let runs = painted.runs.map { (String(painted[$0.range].characters), $0.foregroundColor) }
        XCTAssertTrue(runs.contains { $0.0 == "@c" && $0.1 == Color.blue }, "la mention garde sa couleur")
        XCTAssertFalse(runs.contains { $0.0.contains("a") && $0.1 == base }, "les lettres ne restent pas à l'encre de base")
        XCTAssertEqual(String(painted.characters), "ab @c", "le texte ne change pas")
    }

    /// La rangée plate ne trace pas de contour : le drapeau passe aux lettres,
    /// les autres effets restent.
    func test_theFlatRow_dropsTheOutline_andSeedsTheLettersWithTheMessageId() {
        let effects = MessageEffects(flags: [.rainbow, .glow])
        XCTAssertFalse(RainbowLetters.rowEffects(effects).flags.contains(.rainbow))
        XCTAssertTrue(RainbowLetters.rowEffects(effects).flags.contains(.glow))
        XCTAssertEqual(RainbowLetters.seed(for: effects, messageId: "m-9"), "m-9")
        XCTAssertNil(RainbowLetters.seed(for: MessageEffects(flags: [.glow]), messageId: "m-9"))
    }

    func test_focalRow_wiresTheLetters_andNotTheOutline() throws {
        let row = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Focal/Row/FocalRow.swift"))
        XCTAssertTrue(row.contains("rainbowSeed: RainbowLetters.seed(for: input.effects, messageId: input.localId)"))
        XCTAssertTrue(row.contains(".messageEffects(RainbowLetters.rowEffects(input.effects))"))
        XCTAssertFalse(row.contains(".messageEffects(input.effects)"))
    }

    private static func luminance(_ hex: String) -> Double {
        let v = Int(hex.dropFirst(), radix: 16)!
        func lin(_ c: Int) -> Double {
            let s = Double(c) / 255
            return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255)
    }

    private static func contrast(_ a: String, _ b: String) -> Double {
        let la = luminance(a), lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }
}
