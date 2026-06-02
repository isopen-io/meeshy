import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("StrokeWidthMapping — pressure → effective width, legacy non-regression")
struct StrokeWidthMappingTests {
    private func stroke(width: Double, tool: StrokeTool, captureVersion: Int, pressure: Double) -> StoryDrawingStroke {
        StoryDrawingStroke(points: [StoryDrawingStrokePoint(x: 0, y: 0, pressure: pressure)],
                           colorHex: "FF0000", width: width, tool: tool, smoothing: .raw, captureVersion: captureVersion)
    }
    @Test("base width: pen ×1, marker ×2")
    func baseWidth() {
        #expect(StrokeWidthMapping.base(width: 10, tool: .pen) == 10)
        #expect(StrokeWidthMapping.base(width: 10, tool: .marker) == 20)
    }
    @Test("pressure 0 maps to EXACTLY base (chosen width is the floor, never thinner)")
    func pressureLow() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 1, pressure: 0), pressure: 0) == 10) }
    @Test("chosen width respected at min pressure even for tiny widths")
    func lowClampFloor() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 1, tool: .pen, captureVersion: 1, pressure: 0), pressure: 0) == 1) }
    @Test("pressure only GROWS the stroke: pressure 1 maps to 1.8×base (≤2.5×base)")
    func pressureHigh() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 1, pressure: 1), pressure: 1) == 18) }
    @Test("never thinner than the chosen width across the whole pressure range")
    func neverBelowBase() {
        for p in stride(from: 0.0, through: 1.0, by: 0.1) {
            #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 12, tool: .pen, captureVersion: 1, pressure: p), pressure: p) >= 12)
        }
    }
    @Test("marker multiplier flows through base (1.8 × 10×2 = 36)")
    func markerThrough() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .marker, captureVersion: 1, pressure: 1), pressure: 1) == 36) }
    @Test("legacy captureVersion 0 → constant base (pressure ignored)")
    func legacyConstant() {
        #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 0, pressure: 0), pressure: 0) == 10)
        #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 0, pressure: 1), pressure: 1) == 10)
    }
}
