import XCTest
import SwiftUI
@testable import MeeshyUI

/// L'ENCRE LISIBLE SUR UNE SURFACE TEINTÉE (#5950) — `contentColor` de
/// `ConversationScrollControlsView` élisait l'encre par
/// `luminance > 0.6 ? .black : .white`, un seuil qui se trompe sur toute la
/// plage `0,179 → 0,6`. Miroir Swift des tests `apps/web-v3/src/lib/accent.test.ts`
/// (`inkOnAccent`), même formule (`√(0,05 × 1,05) − 0,05`).
final class ReadableInkTests: XCTestCase {

    private func linear(_ c: CGFloat) -> CGFloat {
        c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }

    private func luminance(ofHex hex: String) -> CGFloat {
        let v = hex.replacingOccurrences(of: "#", with: "")
        func channel(_ offset: String.Index) -> CGFloat {
            let end = v.index(offset, offsetBy: 2)
            return CGFloat(Int(v[offset..<end], radix: 16) ?? 0) / 255.0
        }
        let r = linear(channel(v.startIndex))
        let g = linear(channel(v.index(v.startIndex, offsetBy: 2)))
        let b = linear(channel(v.index(v.startIndex, offsetBy: 4)))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    private func contrast(_ a: String, _ b: String) -> CGFloat {
        let (la, lb) = (luminance(ofHex: a), luminance(ofHex: b))
        let (hi, lo) = la > lb ? (la, lb) : (lb, la)
        return (hi + 0.05) / (lo + 0.05)
    }

    /// Accent du premier fixture (`#46BDCA`, L ≈ 0,4196) — au milieu de la
    /// plage `0,179 → 0,6` où l'ancien seuil `0,6` élisait à tort le blanc
    /// (1,98:1 en schéma clair, 2,98:1 en sombre, sous AA et sous 3:1).
    func test_midRangeAccent_electsBlackInk() {
        XCTAssertEqual(Color(hex: "#46BDCA").readableInk, .black)
    }

    func test_white_electsBlackInk() {
        XCTAssertEqual(Color(hex: "#FFFFFF").readableInk, .black)
    }

    func test_black_electsWhiteInk() {
        XCTAssertEqual(Color(hex: "#000000").readableInk, .white)
    }

    func test_darkIndigo_electsWhiteInk() {
        XCTAssertEqual(Color(hex: "#1B1464").readableInk, .white)
    }

    /// Régression inverse : une teinte dont la luminance dépasse déjà 0,6
    /// (`#CCCCCC`, L ≈ 0,603) était correctement classée par l'ancien seuil —
    /// le nouveau doit la classer pareil.
    func test_aboveOldThreshold_stillElectsBlackInk() {
        XCTAssertEqual(Color(hex: "#CCCCCC").readableInk, .black)
    }

    /// La vraie assertion : sur toute la plage RVB, l'encre servie contraste
    /// AU MOINS autant que l'autre. Un seuil faux (0,6) fait rougir ce témoin
    /// sur la plage 0,179 → 0,6 ; la formule ne peut pas le faire rougir.
    func test_acrossFullRange_servedInkAlwaysContrastsAtLeastAsMuchAsTheOther() {
        var worse: [String] = []
        for r in stride(from: 0, through: 255, by: 17) {
            for g in stride(from: 0, through: 255, by: 17) {
                for b in stride(from: 0, through: 255, by: 17) {
                    let hex = String(format: "#%02X%02X%02X", r, g, b)
                    let servedIsBlack = Color(hex: hex).readableInk == .black
                    let served = servedIsBlack ? "#000000" : "#FFFFFF"
                    let other = servedIsBlack ? "#FFFFFF" : "#000000"
                    if contrast(served, hex) < contrast(other, hex) {
                        worse.append(hex)
                    }
                }
            }
        }
        XCTAssertEqual(worse, [])
    }
}
