import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("StrokePathBuilder — stroke → render points / CGPath honoring smoothing")
struct StrokePathBuilderTests {

    private func stroke(points: [CGPoint],
                        smoothing: StrokeSmoothing) -> StoryDrawingStroke {
        StoryDrawingStroke(
            points: points.map { StoryDrawingStrokePoint(x: $0.x, y: $0.y) },
            colorHex: "FF0000",
            width: 5,
            tool: .pen,
            smoothing: smoothing
        )
    }

    // MARK: - renderPoints

    @Test("raw smoothing returns the captured points unchanged")
    func raw_passthrough() {
        let input = [CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 20), CGPoint(x: 30, y: 5)]
        let result = StrokePathBuilder.renderPoints(for: stroke(points: input, smoothing: .raw))
        #expect(result == input)
    }

    @Test("curve smoothing interpolates (more points out for 3+ in)")
    func curve_interpolates() {
        let input = [CGPoint(x: 0, y: 0), CGPoint(x: 50, y: 100), CGPoint(x: 100, y: 0)]
        let result = StrokePathBuilder.renderPoints(for: stroke(points: input, smoothing: .curve))
        #expect(result.count > input.count)
        #expect(result.first == input.first)
        #expect(result.last == input.last)
    }

    @Test("line smoothing simplifies collinear points to endpoints")
    func line_simplifies() {
        let input = [
            CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 10),
            CGPoint(x: 20, y: 20), CGPoint(x: 30, y: 30)
        ]
        let result = StrokePathBuilder.renderPoints(for: stroke(points: input, smoothing: .line))
        #expect(result.count == 2)
        #expect(result.first == input.first)
        #expect(result.last == input.last)
    }

    @Test("empty stroke yields empty render points")
    func empty_points() {
        let result = StrokePathBuilder.renderPoints(for: stroke(points: [], smoothing: .raw))
        #expect(result.isEmpty)
    }

    // MARK: - path

    @Test("empty stroke yields an empty path")
    func empty_path() {
        let path = StrokePathBuilder.path(for: stroke(points: [], smoothing: .raw))
        #expect(path.isEmpty)
    }

    @Test("single-point stroke yields a non-empty path (a dot)")
    func single_point_dot() {
        let input = [CGPoint(x: 100, y: 200)]
        let path = StrokePathBuilder.path(for: stroke(points: input, smoothing: .raw))
        #expect(!path.isEmpty)
        // The dot's bounding box is centered on the point (degenerate, zero-size).
        #expect(path.boundingBoxOfPath.origin == CGPoint(x: 100, y: 200))
    }

    @Test("multi-point path bounding box spans the captured points")
    func multi_point_bbox() {
        let input = [CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 50)]
        let path = StrokePathBuilder.path(for: stroke(points: input, smoothing: .raw))
        let bbox = path.boundingBoxOfPath
        #expect(bbox.minX == 0)
        #expect(bbox.minY == 0)
        #expect(bbox.maxX == 100)
        #expect(bbox.maxY == 50)
    }
}
