import Testing
import Foundation
import CoreGraphics
import PencilKit
import UIKit
@testable import MeeshySDK

@Suite("StoryDrawingStroke.fromLegacyPKDrawing — best-effort migration")
struct LegacyDrawingMigrationTests {

    // MARK: - Helpers

    /// Constructs a minimal `PKDrawing` with one stroke of the given ink and points.
    @MainActor
    private func makeLegacyData(ink: PKInk, controlPoints: [PKStrokePoint]) -> Data {
        let path = PKStrokePath(controlPoints: controlPoints, creationDate: Date())
        let stroke = PKStroke(ink: ink, path: path)
        let drawing = PKDrawing(strokes: [stroke])
        return drawing.dataRepresentation()
    }

    /// Convenience stroke-point builder with sensible defaults.
    private func point(_ x: CGFloat, _ y: CGFloat, force: CGFloat = 1) -> PKStrokePoint {
        PKStrokePoint(
            location: CGPoint(x: x, y: y),
            timeOffset: 0,
            size: CGSize(width: 5, height: 5),
            opacity: 1,
            force: force,
            azimuth: 0,
            altitude: 0
        )
    }

    // MARK: - Edge cases

    @Test("Empty data yields an empty array")
    func empty_data_returns_empty() {
        let result = StoryDrawingStroke.fromLegacyPKDrawing(Data())
        #expect(result.isEmpty)
    }

    @Test("Invalid (garbage) data yields an empty array")
    func garbage_data_returns_empty() {
        let garbage = Data([0xDE, 0xAD, 0xBE, 0xEF])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(garbage)
        #expect(result.isEmpty, "Best-effort: cannot decode → empty, no crash")
    }

    @Test("Drawing with no strokes yields an empty array")
    @MainActor
    func no_strokes_returns_empty() {
        let drawing = PKDrawing(strokes: [])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(drawing.dataRepresentation())
        #expect(result.isEmpty)
    }

    // MARK: - Stroke count

    @Test("Drawing with one stroke yields one StoryDrawingStroke")
    @MainActor
    func one_stroke_returns_one() {
        let ink = PKInk(.pen, color: .red)
        let data = makeLegacyData(ink: ink, controlPoints: [
            point(100, 200), point(150, 250), point(200, 300)
        ])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(data)
        #expect(result.count == 1)
    }

    @Test("Drawing with three strokes yields three StoryDrawingStrokes")
    @MainActor
    func three_strokes_returns_three() {
        let ink = PKInk(.pen, color: .blue)
        let path1 = PKStrokePath(controlPoints: [point(0, 0), point(10, 10), point(20, 20)], creationDate: Date())
        let path2 = PKStrokePath(controlPoints: [point(30, 30), point(40, 40), point(50, 50)], creationDate: Date())
        let path3 = PKStrokePath(controlPoints: [point(60, 60), point(70, 70), point(80, 80)], creationDate: Date())
        let drawing = PKDrawing(strokes: [
            PKStroke(ink: ink, path: path1),
            PKStroke(ink: ink, path: path2),
            PKStroke(ink: ink, path: path3)
        ])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(drawing.dataRepresentation())
        #expect(result.count == 3)
    }

    // MARK: - Color extraction

    @Test("Red ink is extracted to colorHex \"FF0000\"")
    @MainActor
    func extracts_red() {
        let data = makeLegacyData(ink: PKInk(.pen, color: .red), controlPoints: [point(0, 0), point(10, 10), point(20, 20)])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(data)
        #expect(result.first?.colorHex == "FF0000")
    }

    @Test("Black ink is extracted to colorHex \"000000\"")
    @MainActor
    func extracts_black() {
        let data = makeLegacyData(ink: PKInk(.pen, color: .black), controlPoints: [point(0, 0), point(10, 10), point(20, 20)])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(data)
        #expect(result.first?.colorHex == "000000")
    }

    @Test("Custom RGB ink is extracted faithfully")
    @MainActor
    func extracts_custom_rgb() {
        let color = UIColor(red: 0.5, green: 0.25, blue: 0.75, alpha: 1.0)
        let data = makeLegacyData(ink: PKInk(.pen, color: color), controlPoints: [point(0, 0), point(10, 10), point(20, 20)])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(data)
        // 0.5*255=127.5 → 127 ("7F"), 0.25*255=63.75 → 63 ("3F"), 0.75*255=191.25 → 191 ("BF")
        #expect(result.first?.colorHex == "7F3FBF")
    }

    // MARK: - Tool mapping

    @Test("PKInk pen maps to StrokeTool.pen")
    @MainActor
    func tool_pen() {
        let data = makeLegacyData(ink: PKInk(.pen, color: .red), controlPoints: [point(0, 0), point(10, 10), point(20, 20)])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(data)
        #expect(result.first?.tool == .pen)
    }

    @Test("PKInk marker maps to StrokeTool.marker")
    @MainActor
    func tool_marker() {
        let data = makeLegacyData(ink: PKInk(.marker, color: .green), controlPoints: [point(0, 0), point(10, 10), point(20, 20)])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(data)
        #expect(result.first?.tool == .marker)
    }

    // MARK: - Points

    @Test("Stroke points are present and within design-space range")
    @MainActor
    func extracts_points() {
        let data = makeLegacyData(ink: PKInk(.pen, color: .red), controlPoints: [
            point(100, 200), point(150, 250), point(200, 300), point(250, 350)
        ])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(data)
        #expect(result.first?.points.isEmpty == false)
    }

    // MARK: - Smoothing default

    @Test("Migrated strokes default to .raw smoothing (no algorithm re-applied)")
    @MainActor
    func default_smoothing_is_raw() {
        let data = makeLegacyData(ink: PKInk(.pen, color: .red), controlPoints: [point(0, 0), point(10, 10), point(20, 20)])
        let result = StoryDrawingStroke.fromLegacyPKDrawing(data)
        #expect(result.first?.smoothing == .raw)
    }

    // MARK: - StoryEffects integration

    @Test("StoryEffects decoding a legacy drawingData payload migrates into drawingStrokes")
    @MainActor
    func storyEffects_decode_migration() throws {
        let ink = PKInk(.pen, color: .red)
        let data = makeLegacyData(ink: ink, controlPoints: [point(0, 0), point(10, 10), point(20, 20)])
        let base64 = data.base64EncodedString()
        let json = """
        {
            "drawingData": "\(base64)",
            "textObjects": []
        }
        """.data(using: .utf8)!

        let effects = try JSONDecoder().decode(StoryEffects.self, from: json)
        #expect(effects.drawingStrokes?.isEmpty == false, "Legacy drawingData should populate new drawingStrokes")
        #expect(effects.drawingStrokes?.first?.colorHex == "FF0000")
    }

    @Test("StoryEffects decoding new format (drawingStrokes only) skips migration")
    func storyEffects_decode_new_format_no_migration() throws {
        let json = """
        {
            "drawingStrokes": [{
                "id": "stroke-1",
                "points": [{"x": 100, "y": 200, "pressure": 1.0}],
                "colorHex": "00FF00",
                "width": 4.0,
                "tool": "pen",
                "smoothing": "raw",
                "createdAt": 0
            }],
            "textObjects": []
        }
        """.data(using: .utf8)!

        let effects = try JSONDecoder().decode(StoryEffects.self, from: json)
        #expect(effects.drawingStrokes?.count == 1)
        #expect(effects.drawingStrokes?.first?.colorHex == "00FF00")
        #expect(effects.drawingStrokes?.first?.id == "stroke-1")
    }

    @Test("StoryEffects decoding with neither drawingData nor drawingStrokes results in nil drawingStrokes")
    func storyEffects_decode_neither() throws {
        let json = """
        { "textObjects": [] }
        """.data(using: .utf8)!

        let effects = try JSONDecoder().decode(StoryEffects.self, from: json)
        #expect(effects.drawingStrokes == nil || effects.drawingStrokes?.isEmpty == true)
    }

    @Test("StoryEffects encoding emits drawingStrokes when set")
    func storyEffects_encode_drawingStrokes() throws {
        var effects = StoryEffects()
        effects.drawingStrokes = [
            StoryDrawingStroke(
                id: "stroke-99",
                points: [StoryDrawingStrokePoint(x: 1, y: 2)],
                colorHex: "FFFFFF",
                width: 3,
                tool: .pen,
                smoothing: .curve
            )
        ]
        let data = try JSONEncoder().encode(effects)
        let json = String(data: data, encoding: .utf8) ?? ""
        #expect(json.contains("drawingStrokes"))
        #expect(json.contains("stroke-99"))
        #expect(json.contains("FFFFFF"))
    }
}
