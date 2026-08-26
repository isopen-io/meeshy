import XCTest
@testable import MeeshyUI

/// **Directive 2026-08-27 — le canvas se travaille dans une carte franche.**
/// Contour ARRONDI et SOLIDE, plus de trait pointillé décoratif. Les seules
/// lignes discontinues qui restent sont les guides MAGNET, qui représentent les
/// ZONES DE VUE ET DE VIE du contenu (les bords de la zone sûre).
final class StoryCanvasContourTests: XCTestCase {

    private func sdkSource(_ rel: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()   // MeeshySDK
        return try String(contentsOf: root.appendingPathComponent(rel), encoding: .utf8)
    }

    private func body(of decl: String, in src: String) -> String? {
        guard let start = src.range(of: decl) else { return nil }
        var depth = 0, started = false
        var out = ""
        for ch in src[start.lowerBound...] {
            out.append(ch)
            if ch == "{" { depth += 1; started = true }
            else if ch == "}" { depth -= 1; if started && depth == 0 { return out } }
        }
        return out
    }

    // 1 — le contour du canvas est SOLIDE (aucun `dash:`), arrondi (RoundedRectangle).
    func test_leContourDuCanvas_estSolideArrondi() throws {
        let src = try sdkSource("Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift")
        guard let fn = body(of: "func canvasOutlineOverlay", in: src) else {
            return XCTFail("canvasOutlineOverlay introuvable")
        }
        XCTAssertTrue(fn.contains("RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)"),
                      "Le contour épouse le rayon de la carte (arrondi continu).")
        XCTAssertFalse(fn.contains("dash:"),
                       "Le contour ne doit PLUS être pointillé — carte franche, trait solide.")
        XCTAssertTrue(fn.contains(".strokeBorder(") && fn.contains("lineWidth:"),
                      "Un trait SOLIDE (`strokeBorder(_:lineWidth:)`), pas un `StrokeStyle(dash:)`.")
    }

    // 2 — le MAGNET représente les zones de VUE (haut) et de VIE (bas) : il
    // s'accroche aux bords de la zone sûre (0.18 / 0.82), pas seulement au centre.
    func test_leMagnet_representeLesZonesVueEtVie() {
        XCTAssertTrue(StoryCanvasUIView.snapTargets.contains(0.18),
                      "Le magnet s'accroche au haut de la zone de VUE (0.18).")
        XCTAssertTrue(StoryCanvasUIView.snapTargets.contains(0.82),
                      "…et au bas de la zone de VIE (0.82).")
        XCTAssertTrue(StoryCanvasUIView.snapTargets.contains(0.5),
                      "…et au centre.")
    }
}
