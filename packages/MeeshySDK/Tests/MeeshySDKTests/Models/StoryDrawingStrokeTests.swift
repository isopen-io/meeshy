import Testing
import Foundation
@testable import MeeshySDK

@Suite("StoryDrawingStroke — data model for per-stroke editing")
struct StoryDrawingStrokeTests {

    // MARK: - StoryDrawingStrokePoint

    @Test("StoryDrawingStrokePoint default pressure is 1.0")
    func point_defaultPressure() {
        let p = StoryDrawingStrokePoint(x: 100, y: 200)
        #expect(p.x == 100)
        #expect(p.y == 200)
        #expect(p.pressure == 1.0)
    }

    @Test("StoryDrawingStrokePoint roundtrips through Codable preserving all fields")
    func point_codableRoundtrip() throws {
        let original = StoryDrawingStrokePoint(x: 543.25, y: 1024.5, pressure: 0.7)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryDrawingStrokePoint.self, from: data)
        #expect(decoded == original)
    }

    @Test("Two StoryDrawingStrokePoints with same fields are equal")
    func point_equatable() {
        let a = StoryDrawingStrokePoint(x: 1, y: 2, pressure: 0.5)
        let b = StoryDrawingStrokePoint(x: 1, y: 2, pressure: 0.5)
        let c = StoryDrawingStrokePoint(x: 1, y: 2, pressure: 0.9)
        #expect(a == b)
        #expect(a != c)
    }

    // MARK: - StrokeTool

    @Test("StrokeTool roundtrips via raw string")
    func strokeTool_codable() throws {
        for tool in StrokeTool.allCases {
            let data = try JSONEncoder().encode(tool)
            let decoded = try JSONDecoder().decode(StrokeTool.self, from: data)
            #expect(decoded == tool)
        }
    }

    @Test("StrokeTool.allCases exposes pen, marker, eraser")
    func strokeTool_allCases() {
        #expect(StrokeTool.allCases.contains(.pen))
        #expect(StrokeTool.allCases.contains(.marker))
        #expect(StrokeTool.allCases.contains(.eraser))
        #expect(StrokeTool.allCases.count == 3)
    }

    // MARK: - StrokeSmoothing

    @Test("StrokeSmoothing roundtrips via raw string")
    func strokeSmoothing_codable() throws {
        for smoothing in StrokeSmoothing.allCases {
            let data = try JSONEncoder().encode(smoothing)
            let decoded = try JSONDecoder().decode(StrokeSmoothing.self, from: data)
            #expect(decoded == smoothing)
        }
    }

    @Test("StrokeSmoothing.allCases exposes raw, curve, line")
    func strokeSmoothing_allCases() {
        #expect(StrokeSmoothing.allCases.contains(.raw))
        #expect(StrokeSmoothing.allCases.contains(.curve))
        #expect(StrokeSmoothing.allCases.contains(.line))
        #expect(StrokeSmoothing.allCases.count == 3)
    }

    // MARK: - StoryDrawingStroke

    @Test("StoryDrawingStroke default init assigns non-empty UUID id")
    func stroke_initAssignsUuid() {
        let a = StoryDrawingStroke(colorHex: "FF0000", width: 4)
        let b = StoryDrawingStroke(colorHex: "FF0000", width: 4)
        #expect(!a.id.isEmpty)
        #expect(a.id != b.id, "Default ids must be unique UUIDs")
    }

    @Test("StoryDrawingStroke default init uses sensible defaults")
    func stroke_initDefaults() {
        let s = StoryDrawingStroke(colorHex: "FFFFFF", width: 5)
        #expect(s.points.isEmpty, "Empty points is valid — caller fills via capture")
        #expect(s.tool == .pen)
        #expect(s.smoothing == .raw)
        #expect(s.colorHex == "FFFFFF")
        #expect(s.width == 5)
    }

    @Test("StoryDrawingStroke with single point is valid (a dot)")
    func stroke_singlePointDot() {
        let p = StoryDrawingStrokePoint(x: 540, y: 960)
        let s = StoryDrawingStroke(points: [p], colorHex: "000000", width: 8)
        #expect(s.points.count == 1)
        #expect(s.points[0] == p)
    }

    @Test("StoryDrawingStroke roundtrips through Codable preserving all fields")
    func stroke_codableRoundtrip() throws {
        let original = StoryDrawingStroke(
            id: "stroke-abc",
            points: [
                StoryDrawingStrokePoint(x: 100, y: 200, pressure: 1.0),
                StoryDrawingStrokePoint(x: 300, y: 400, pressure: 0.8),
                StoryDrawingStrokePoint(x: 500, y: 600, pressure: 0.5)
            ],
            colorHex: "FF2E63",
            width: 12.5,
            tool: .marker,
            smoothing: .curve,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryDrawingStroke.self, from: data)
        #expect(decoded.id == original.id)
        #expect(decoded.points == original.points)
        #expect(decoded.colorHex == original.colorHex)
        #expect(decoded.width == original.width)
        #expect(decoded.tool == original.tool)
        #expect(decoded.smoothing == original.smoothing)
        #expect(decoded.createdAt == original.createdAt)
    }

    @Test("StoryDrawingStroke equality compares all stored fields")
    func stroke_equatable() {
        let pts = [StoryDrawingStrokePoint(x: 1, y: 2)]
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let a = StoryDrawingStroke(id: "same", points: pts, colorHex: "FFFFFF", width: 4, tool: .pen, smoothing: .raw, createdAt: date)
        let b = StoryDrawingStroke(id: "same", points: pts, colorHex: "FFFFFF", width: 4, tool: .pen, smoothing: .raw, createdAt: date)
        let differentColor = StoryDrawingStroke(id: "same", points: pts, colorHex: "000000", width: 4, tool: .pen, smoothing: .raw, createdAt: date)
        let differentPoints = StoryDrawingStroke(id: "same", points: [], colorHex: "FFFFFF", width: 4, tool: .pen, smoothing: .raw, createdAt: date)
        #expect(a == b)
        #expect(a != differentColor)
        #expect(a != differentPoints)
    }

    @Test("StoryDrawingStroke is Identifiable — id is the primary key")
    func stroke_identifiable() {
        let s = StoryDrawingStroke(id: "key-1", colorHex: "FF0000", width: 3)
        #expect(s.id == "key-1")
    }

    @Test("StoryDrawingStroke supports many points (50 sample)")
    func stroke_manyPoints() {
        let pts = (0..<50).map { i in
            StoryDrawingStrokePoint(x: Double(i) * 10, y: Double(i) * 20, pressure: 1.0)
        }
        let s = StoryDrawingStroke(points: pts, colorHex: "FFFFFF", width: 3)
        #expect(s.points.count == 50)
        #expect(s.points.first?.x == 0)
        #expect(s.points.last?.x == 490)
    }
}
