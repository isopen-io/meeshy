import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("CatmullRomSmoother — pure-function curve interpolation")
struct CatmullRomSmootherTests {

    @Test("Empty input returns empty output")
    func catmullRom_empty() {
        let result = CatmullRomSmoother.smooth([], samplesPerSegment: 8)
        #expect(result.isEmpty)
    }

    @Test("Single-point input returns the same single point (a dot)")
    func catmullRom_singlePoint() {
        let input = [CGPoint(x: 100, y: 200)]
        let result = CatmullRomSmoother.smooth(input, samplesPerSegment: 8)
        #expect(result == input)
    }

    @Test("Two-point input is already a line — pass through")
    func catmullRom_twoPoints() {
        let input = [CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 100)]
        let result = CatmullRomSmoother.smooth(input, samplesPerSegment: 8)
        #expect(result == input, "Two points cannot be smoothed; algorithm should return input unchanged")
    }

    @Test("Three-point input produces an interpolated curve (more than 3 points out)")
    func catmullRom_threePoints() {
        let input = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 50, y: 100),
            CGPoint(x: 100, y: 0)
        ]
        let result = CatmullRomSmoother.smooth(input, samplesPerSegment: 8)
        #expect(result.count > 3, "Three+ points should yield interpolated samples between segments")
    }

    @Test("Endpoints are preserved exactly")
    func catmullRom_preservesEndpoints() {
        let input = [
            CGPoint(x: 10, y: 20),
            CGPoint(x: 30, y: 40),
            CGPoint(x: 50, y: 60),
            CGPoint(x: 70, y: 80)
        ]
        let result = CatmullRomSmoother.smooth(input, samplesPerSegment: 4)
        #expect(result.first == input.first, "First point must be preserved")
        #expect(result.last == input.last, "Last point must be preserved")
    }

    @Test("samplesPerSegment scales output count")
    func catmullRom_samplesPerSegmentScaling() {
        let input = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 25, y: 50),
            CGPoint(x: 50, y: 0),
            CGPoint(x: 75, y: 50),
            CGPoint(x: 100, y: 0)
        ]
        let low = CatmullRomSmoother.smooth(input, samplesPerSegment: 2)
        let high = CatmullRomSmoother.smooth(input, samplesPerSegment: 16)
        #expect(high.count > low.count)
    }

    @Test("samplesPerSegment of 1 still preserves endpoints exactly")
    func catmullRom_samplesPerSegmentOne() {
        let input = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 50, y: 50),
            CGPoint(x: 100, y: 0),
            CGPoint(x: 150, y: 50)
        ]
        let result = CatmullRomSmoother.smooth(input, samplesPerSegment: 1)
        #expect(result.first == input.first)
        #expect(result.last == input.last)
    }
}

@Suite("RamerDouglasPeucker — line simplification (straighten)")
struct RamerDouglasPeuckerTests {

    @Test("Empty input returns empty output")
    func rdp_empty() {
        let result = RamerDouglasPeucker.straighten([], tolerance: 5)
        #expect(result.isEmpty)
    }

    @Test("Single point returns the same single point")
    func rdp_singlePoint() {
        let input = [CGPoint(x: 100, y: 200)]
        let result = RamerDouglasPeucker.straighten(input, tolerance: 5)
        #expect(result == input)
    }

    @Test("Two points pass through (already a straight line)")
    func rdp_twoPoints() {
        let input = [CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 100)]
        let result = RamerDouglasPeucker.straighten(input, tolerance: 5)
        #expect(result == input)
    }

    @Test("Tolerance zero returns input unchanged")
    func rdp_toleranceZero() {
        let input = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 10, y: 1),
            CGPoint(x: 20, y: 0),
            CGPoint(x: 30, y: 1),
            CGPoint(x: 40, y: 0)
        ]
        let result = RamerDouglasPeucker.straighten(input, tolerance: 0)
        #expect(result == input, "Tolerance 0 disables simplification")
    }

    @Test("All-collinear points collapse to the two endpoints")
    func rdp_collinearCollapses() {
        let input = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 10, y: 10),
            CGPoint(x: 20, y: 20),
            CGPoint(x: 30, y: 30),
            CGPoint(x: 40, y: 40)
        ]
        let result = RamerDouglasPeucker.straighten(input, tolerance: 0.001)
        #expect(result.count == 2, "Collinear points should collapse to endpoints only")
        #expect(result.first == input.first)
        #expect(result.last == input.last)
    }

    @Test("Very large tolerance returns only endpoints")
    func rdp_largeToleranceReducesToEndpoints() {
        let input = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 10, y: 100),  // wildly off the line 0,0 → 50,0
            CGPoint(x: 20, y: -50),
            CGPoint(x: 30, y: 80),
            CGPoint(x: 50, y: 0)
        ]
        let result = RamerDouglasPeucker.straighten(input, tolerance: 10_000)
        #expect(result.count == 2, "Tolerance larger than any deviation collapses to endpoints")
        #expect(result.first == input.first)
        #expect(result.last == input.last)
    }

    @Test("L-shape preserves the corner")
    func rdp_LShapePreservesCorner() {
        // Points along the horizontal segment, then turning 90° down
        let input = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 10, y: 0),
            CGPoint(x: 20, y: 0),
            CGPoint(x: 30, y: 0),   // corner
            CGPoint(x: 30, y: 10),
            CGPoint(x: 30, y: 20),
            CGPoint(x: 30, y: 30)
        ]
        let result = RamerDouglasPeucker.straighten(input, tolerance: 0.5)
        #expect(result.count == 3, "Should keep [start, corner, end]")
        #expect(result.first == CGPoint(x: 0, y: 0))
        #expect(result.last == CGPoint(x: 30, y: 30))
        #expect(result.contains(CGPoint(x: 30, y: 0)), "Corner must be preserved")
    }

    @Test("Endpoints are always preserved")
    func rdp_endpointsAlwaysPreserved() {
        let input = [
            CGPoint(x: 5, y: 5),
            CGPoint(x: 10, y: 8),
            CGPoint(x: 15, y: 7),
            CGPoint(x: 20, y: 9),
            CGPoint(x: 25, y: 6),
            CGPoint(x: 30, y: 5)
        ]
        for tolerance in [CGFloat(0.1), 0.5, 1.0, 5.0, 100.0] {
            let result = RamerDouglasPeucker.straighten(input, tolerance: tolerance)
            #expect(result.first == input.first, "First preserved at tolerance \(tolerance)")
            #expect(result.last == input.last, "Last preserved at tolerance \(tolerance)")
        }
    }
}
