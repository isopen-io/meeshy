import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class MeeshyStrokeCanvasTests: XCTestCase {

    private func stroke(id: String = "a", colorHex: String = "FF0000") -> StoryDrawingStroke {
        StoryDrawingStroke(
            id: id,
            points: [StoryDrawingStrokePoint(x: 0, y: 0), StoryDrawingStrokePoint(x: 10, y: 10)],
            colorHex: colorHex,
            width: 5,
            tool: .pen,
            smoothing: .raw
        )
    }

    func test_equatable_sameStrokesAndSelection_areEqual() {
        let s = [stroke()]
        let a = MeeshyStrokeCanvas(strokes: s, selectedId: "a")
        let b = MeeshyStrokeCanvas(strokes: s, selectedId: "a")
        XCTAssertEqual(a, b)
    }

    func test_equatable_differentSelection_areNotEqual() {
        let s = [stroke()]
        let a = MeeshyStrokeCanvas(strokes: s, selectedId: "a")
        let b = MeeshyStrokeCanvas(strokes: s, selectedId: nil)
        XCTAssertNotEqual(a, b)
    }

    func test_equatable_differentStrokes_areNotEqual() {
        let a = MeeshyStrokeCanvas(strokes: [stroke(colorHex: "FF0000")], selectedId: nil)
        let b = MeeshyStrokeCanvas(strokes: [stroke(colorHex: "00FF00")], selectedId: nil)
        XCTAssertNotEqual(a, b)
    }
}
