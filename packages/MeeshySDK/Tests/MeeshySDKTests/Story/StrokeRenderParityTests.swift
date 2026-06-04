import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("Stroke render parity — live & baked consume identical geometry")
struct StrokeRenderParityTests {
    @Test("identical geometry for the same stroke")
    func liveBakedGeometryParity() {
        let a = VariableWidthStrokeBuilder(), b = VariableWidthStrokeBuilder()
        let s = StoryDrawingStroke(points: [StoryDrawingStrokePoint(x: 0, y: 0, pressure: 0.2),
                                            StoryDrawingStrokePoint(x: 100, y: 40, pressure: 0.9)],
                                   colorHex: "FF0000", width: 12, tool: .marker, smoothing: .curve, captureVersion: 1)
        #expect(a.geometry(for: s).vertices == b.geometry(for: s).vertices)
    }
}
