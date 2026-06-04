import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("StrokeWidthDriver — per-point pressure driver (high = thick), [0,1]")
struct StrokeWidthDriverTests {
    @Test("first point → nil velocity (no predecessor)")
    func firstPointNeutral() {
        #expect(StrokeWidthDriver.neutral == 0.5)
        #expect(StrokeWidthDriver.velocity(from: nil, to: CGPoint(x: 10, y: 10), dt: 0.016) == nil)
    }
    @Test("Δt == 0 → nil velocity (guard)")
    func zeroDtGuard() { #expect(StrokeWidthDriver.velocity(from: .zero, to: CGPoint(x: 10, y: 0), dt: 0) == nil) }
    @Test("velocity = distance / dt")
    func velocityValue() { #expect(StrokeWidthDriver.velocity(from: .zero, to: CGPoint(x: 30, y: 40), dt: 0.5) == 100) }
    @Test("moving-average smoothing over a window (3)")
    func smoothingWindow() {
        let smoothed = StrokeWidthDriver.movingAverage([0, 0, 30, 0, 0], window: 3)
        #expect(smoothed.count == 5); #expect(smoothed[2] == 10); #expect(smoothed.allSatisfy { $0 <= 30 })
    }
    @Test("normalize by Vmax, clamp [0,1]")
    func normalizeVmax() {
        #expect(StrokeWidthDriver.normalize(0, vMax: 4000) == 0)
        #expect(StrokeWidthDriver.normalize(4000, vMax: 4000) == 1)
        #expect(StrokeWidthDriver.normalize(8000, vMax: 4000) == 1)
    }
    @Test("pencil driver = clamp01(force/maxForce)")
    func pencilOrientation() {
        #expect(StrokeWidthDriver.pencilDriver(force: 0, maxForce: 4) == 0)
        #expect(StrokeWidthDriver.pencilDriver(force: 4, maxForce: 4) == 1)
        #expect(StrokeWidthDriver.pencilDriver(force: 2, maxForce: 4) == 0.5)
        #expect(StrokeWidthDriver.pencilDriver(force: 1, maxForce: 0) == StrokeWidthDriver.neutral)
    }
    @Test("finger driver = 1 - normalizedSmoothedVelocity (slow = thick)")
    func fingerOrientation() {
        #expect(StrokeWidthDriver.fingerDriver(normalizedSmoothedVelocity: 0) == 1)
        #expect(StrokeWidthDriver.fingerDriver(normalizedSmoothedVelocity: 1) == 0)
        #expect(StrokeWidthDriver.fingerDriver(normalizedSmoothedVelocity: 0.25) == 0.75)
    }
    @Test("all drivers clamp into [0,1]")
    func clampRange() {
        #expect(StrokeWidthDriver.pencilDriver(force: 99, maxForce: 4) == 1)
        #expect(StrokeWidthDriver.fingerDriver(normalizedSmoothedVelocity: 2) == 0)
    }
}
