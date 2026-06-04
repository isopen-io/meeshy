import Testing
import CoreGraphics
@testable import MeeshySDK

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
        #expect(wp[0].width == 5); #expect(wp[1].width == 16)
    }
    @Test("curve: interpolated points carry interpolated width (bracketed)")
    func curve_carriesWidth() {
        let wp = StrokePathBuilder.renderWidthPoints(for: stroke([(0,0,0), (50,100,1), (100,0,0)], smoothing: .curve))
        #expect(wp.count > 3)
        #expect(wp.first?.point == CGPoint(x: 0, y: 0)); #expect(wp.last?.point == CGPoint(x: 100, y: 0))
        #expect(wp.first?.width == 5); #expect(wp.last?.width == 5)
        #expect(wp.allSatisfy { $0.width >= 5 - 0.001 && $0.width <= 16 + 0.001 })
    }
    @Test("line: RDP keeps kept-points' width in lockstep")
    func line_keepsWidth() {
        let wp = StrokePathBuilder.renderWidthPoints(for: stroke([(0,0,0), (10,10,0.5), (20,20,0.5), (30,30,1)], smoothing: .line))
        #expect(wp.count == 2)
        #expect(wp.first?.point == CGPoint(x: 0, y: 0)); #expect(wp.last?.point == CGPoint(x: 30, y: 30))
        #expect(wp.first?.width == 5); #expect(wp.last?.width == 16)
    }
    @Test("legacy captureVersion 0 → all widths equal constant base")
    func legacy_constantWidth() {
        let s = StoryDrawingStroke(points: [StoryDrawingStrokePoint(x: 0, y: 0, pressure: 0),
                                            StoryDrawingStrokePoint(x: 100, y: 0, pressure: 1)],
                                   colorHex: "FF0000", width: 10, tool: .pen, smoothing: .raw, captureVersion: 0)
        #expect(StrokePathBuilder.renderWidthPoints(for: s).allSatisfy { $0.width == 10 })
    }
}
