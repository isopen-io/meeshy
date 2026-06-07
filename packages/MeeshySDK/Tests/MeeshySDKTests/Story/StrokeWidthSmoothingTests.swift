import Testing
import CoreGraphics
@testable import MeeshySDK

// Largeurs attendues alignées sur `StrokeWidthMapping` depuis le changement
// 2026-06-03 (« lent/pression forte = largeur choisie [plafond ×1.0] ; rapide/
// pression légère = on raffine [×0.4] ») : pression 0 → base×0.4 (=4 pour base 10),
// pression 1 → base×1.0 (=10). Avant : ×0.5 (=5) / ×1.6 (=16).
@Suite("Width-carrying smoothing — Catmull-Rom & RDP keep width in lockstep")
struct StrokeWidthSmoothingTests {
    private func stroke(_ pts: [(CGFloat, CGFloat, Double)], smoothing: StrokeSmoothing) -> StoryDrawingStroke {
        StoryDrawingStroke(points: pts.map { StoryDrawingStrokePoint(x: $0.0, y: $0.1, pressure: $0.2) },
                           colorHex: "FF0000", width: 10, tool: .pen, smoothing: smoothing, captureVersion: 1)
    }
    @Test("raw: one width-point per captured point, effWidth applied")
    func raw_lockstep() {
        let wp = StrokePathBuilder.renderWidthPoints(for: stroke([(0,0,0), (100,0,1)], smoothing: .raw))
        #expect(wp.count == 2); #expect(wp[0].point == CGPoint(x: 0, y: 0))
        #expect(wp[0].width == 4); #expect(wp[1].width == 10)
    }
    @Test("curve: interpolated points carry interpolated width (bracketed)")
    func curve_carriesWidth() {
        let wp = StrokePathBuilder.renderWidthPoints(for: stroke([(0,0,0), (50,100,1), (100,0,0)], smoothing: .curve))
        #expect(wp.count > 3)
        #expect(wp.first?.point == CGPoint(x: 0, y: 0)); #expect(wp.last?.point == CGPoint(x: 100, y: 0))
        #expect(wp.first?.width == 4); #expect(wp.last?.width == 4)
        #expect(wp.allSatisfy { $0.width >= 4 - 0.001 && $0.width <= 10 + 0.001 })
    }
    @Test("line: RDP keeps kept-points' width in lockstep")
    func line_keepsWidth() {
        let wp = StrokePathBuilder.renderWidthPoints(for: stroke([(0,0,0), (10,10,0.5), (20,20,0.5), (30,30,1)], smoothing: .line))
        #expect(wp.count == 2)
        #expect(wp.first?.point == CGPoint(x: 0, y: 0)); #expect(wp.last?.point == CGPoint(x: 30, y: 30))
        #expect(wp.first?.width == 4); #expect(wp.last?.width == 10)
    }
    @Test("legacy captureVersion 0 → all widths equal constant base")
    func legacy_constantWidth() {
        let s = StoryDrawingStroke(points: [StoryDrawingStrokePoint(x: 0, y: 0, pressure: 0),
                                            StoryDrawingStrokePoint(x: 100, y: 0, pressure: 1)],
                                   colorHex: "FF0000", width: 10, tool: .pen, smoothing: .raw, captureVersion: 0)
        #expect(StrokePathBuilder.renderWidthPoints(for: s).allSatisfy { $0.width == 10 })
    }
}
