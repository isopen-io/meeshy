import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("VariableWidthStrokeBuilder — triangle-strip along centerline + cache")
struct VariableWidthStrokeBuilderTests {
    private func stroke(_ pts: [(CGFloat, CGFloat, Double)]) -> StoryDrawingStroke {
        StoryDrawingStroke(points: pts.map { StoryDrawingStrokePoint(x: $0.0, y: $0.1, pressure: $0.2) },
                           colorHex: "FF0000", width: 10, tool: .pen, smoothing: .raw, captureVersion: 1)
    }
    @Test("strip has 2 offset vertices per width-point")
    func vertexCount() {
        let geo = VariableWidthStrokeBuilder().geometry(for: stroke([(0,0,1), (100,0,1), (200,0,1)]))
        #expect(geo.vertices.count == 6)
    }
    @Test("offsets perpendicular at half effective width")
    func offsetsPerpendicular() {
        let geo = VariableWidthStrokeBuilder().geometry(for: stroke([(0,0,1), (100,0,1)]))
        let v0 = geo.vertices[0], v1 = geo.vertices[1]
        #expect(abs(v0.y - 8) < 0.01 || abs(v0.y + 8) < 0.01)
        #expect(abs((v0.y - v1.y).magnitude - 16) < 0.01)
        #expect(abs(v0.x) < 0.01)
    }
    @Test("width varies along strip when pressure varies")
    func widthVaries() {
        let geo = VariableWidthStrokeBuilder().geometry(for: stroke([(0,0,0), (100,0,1)]))
        #expect((geo.vertices[2].y - geo.vertices[3].y).magnitude > (geo.vertices[0].y - geo.vertices[1].y).magnitude)
    }
    @Test("cache hit returns identical geometry for the same stroke")
    func cacheHit() {
        let b = VariableWidthStrokeBuilder(); let s = stroke([(0,0,1), (100,0,1)])
        let a = b.geometry(for: s); let c = b.geometry(for: s)
        #expect(b.cacheHits == 1); #expect(a.vertices == c.vertices)
    }
    @Test("cache miss when pressure changes")
    func cacheMissOnKeyChange() {
        let b = VariableWidthStrokeBuilder()
        _ = b.geometry(for: stroke([(0,0,1), (100,0,1)]))
        _ = b.geometry(for: stroke([(0,0,0), (100,0,0)]))
        #expect(b.cacheHits == 0)
    }
}
