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
    @Test("driver 1 (slow / full effort) maps to EXACTLY the chosen width (the ceiling)")
    func pressureHighIsChosen() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 1, pressure: 1), pressure: 1) == 10) }
    @Test("driver 0 (fast / light) refines thinner: 0.4×base")
    func pressureLowRefines() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 1, pressure: 0), pressure: 0) == 4) }
    @Test("never below 1pt even when refined on a tiny width")
    func lowClampFloor() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 1, tool: .pen, captureVersion: 1, pressure: 0), pressure: 0) == 1) }
    @Test("chosen width is the CEILING — never exceeded across the whole driver range")
    func neverAboveChosen() {
        for p in stride(from: 0.0, through: 1.0, by: 0.1) {
            #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 12, tool: .pen, captureVersion: 1, pressure: p), pressure: p) <= 12 + 0.0001)
        }
    }
    @Test("marker multiplier flows through base (driver 1 → 10×2 = 20)")
    func markerThrough() { #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .marker, captureVersion: 1, pressure: 1), pressure: 1) == 20) }
    @Test("legacy captureVersion 0 → constant base (pressure ignored)")
    func legacyConstant() {
        #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 0, pressure: 0), pressure: 0) == 10)
        #expect(StrokeWidthMapping.effectiveWidth(of: stroke(width: 10, tool: .pen, captureVersion: 0, pressure: 1), pressure: 1) == 10)
    }
}
