import CoreGraphics
import ImageIO
import XCTest
@testable import Meeshy

@MainActor
final class CallFaceEffectGeometryTests: XCTestCase {

    private let face = CGRect(x: 100, y: 200, width: 200, height: 260)

    // MARK: - Landmarks

    func test_fromNormalized_scalesTheBoxAndPlacesEyesInsideIt() {
        let landmarks = CallFaceLandmarks.fromNormalized(
            boundingBox: CGRect(x: 0.25, y: 0.5, width: 0.5, height: 0.25),
            leftEye: CGPoint(x: 0.3, y: 0.6),
            rightEye: nil,
            imageSize: CGSize(width: 400, height: 800)
        )
        XCTAssertEqual(landmarks.bounds, CGRect(x: 100, y: 400, width: 200, height: 200))
        XCTAssertEqual(landmarks.leftEye?.x ?? 0, 160, accuracy: 0.001)
        XCTAssertEqual(landmarks.leftEye?.y ?? 0, 520, accuracy: 0.001)
        XCTAssertNil(landmarks.rightEye)
    }

    func test_smoothed_halfway_blendsBoundsAndEyes() {
        let from = CallFaceLandmarks(bounds: CGRect(x: 0, y: 0, width: 100, height: 100), leftEye: CGPoint(x: 10, y: 10))
        let to = CallFaceLandmarks(bounds: CGRect(x: 100, y: 50, width: 200, height: 100), leftEye: CGPoint(x: 30, y: 50))
        let blended = from.smoothed(toward: to, factor: 0.5)
        XCTAssertEqual(blended.bounds, CGRect(x: 50, y: 25, width: 150, height: 100))
        XCTAssertEqual(blended.leftEye, CGPoint(x: 20, y: 30))
    }

    func test_smoothed_factorOutOfRange_isClamped() {
        let from = CallFaceLandmarks(bounds: CGRect(x: 0, y: 0, width: 10, height: 10))
        let to = CallFaceLandmarks(bounds: CGRect(x: 40, y: 40, width: 10, height: 10))
        XCTAssertEqual(from.smoothed(toward: to, factor: 3).bounds, to.bounds)
        XCTAssertEqual(from.smoothed(toward: to, factor: -1).bounds, from.bounds)
    }

    func test_smoothed_eyeAppearsOrVanishes_followsTheNewDetection() {
        let withEye = CallFaceLandmarks(bounds: face, rightEye: CGPoint(x: 1, y: 1))
        let without = CallFaceLandmarks(bounds: face)
        XCTAssertNil(withEye.smoothed(toward: without, factor: 0.5).rightEye)
        XCTAssertEqual(without.smoothed(toward: withEye, factor: 0.5).rightEye, CGPoint(x: 1, y: 1))
    }

    // MARK: - Anchors

    func test_haloRect_floatsAboveTheHeadAndIsWiderThanTall() {
        let halo = CallFaceEffectGeometry.haloRect(for: face)
        XCTAssertGreaterThan(halo.midY, face.maxY)
        XCTAssertEqual(halo.midX, face.midX, accuracy: 0.001)
        XCTAssertGreaterThan(halo.width, halo.height)
        XCTAssertGreaterThanOrEqual(halo.width, face.width)
    }

    func test_hornRects_twoSymmetricHornsRisingFromTheForehead() {
        let horns = CallFaceEffectGeometry.hornRects(for: face)
        XCTAssertEqual(horns.count, 2)
        XCTAssertLessThan(horns[0].midX, face.midX)
        XCTAssertGreaterThan(horns[1].midX, face.midX)
        XCTAssertEqual(face.midX - horns[0].midX, horns[1].midX - face.midX, accuracy: 0.001)
        XCTAssertLessThan(horns[0].minY, face.maxY)
        XCTAssertGreaterThan(horns[0].maxY, face.maxY)
        XCTAssertTrue(horns.allSatisfy { $0.minX >= face.minX && $0.maxX <= face.maxX })
    }

    func test_eyeCenters_detectedEyes_areSortedLeftToRight() {
        let landmarks = CallFaceLandmarks(bounds: face, leftEye: CGPoint(x: 250, y: 360), rightEye: CGPoint(x: 150, y: 360))
        XCTAssertEqual(CallFaceEffectGeometry.eyeCenters(for: landmarks), [CGPoint(x: 150, y: 360), CGPoint(x: 250, y: 360)])
    }

    func test_eyeCenters_missingEyes_areEstimatedInTheUpperFace() {
        let eyes = CallFaceEffectGeometry.eyeCenters(for: CallFaceLandmarks(bounds: face))
        XCTAssertEqual(eyes.count, 2)
        XCTAssertTrue(eyes.allSatisfy { face.contains($0) && $0.y > face.midY })
        XCTAssertLessThan(eyes[0].x, eyes[1].x)
    }

    func test_cheekCenters_sitBelowTheEyesOnBothSides() {
        let cheeks = CallFaceEffectGeometry.cheekCenters(for: face)
        let eyes = CallFaceEffectGeometry.eyeCenters(for: CallFaceLandmarks(bounds: face))
        XCTAssertEqual(cheeks.count, 2)
        XCTAssertTrue(cheeks.allSatisfy { face.contains($0) && $0.y < eyes[0].y })
        XCTAssertLessThan(cheeks[0].x, face.midX)
        XCTAssertGreaterThan(cheeks[1].x, face.midX)
    }

    func test_wartCenters_deterministicAndInsideTheFace() {
        let first = CallFaceEffectGeometry.wartCenters(for: face, count: 6, seed: 42)
        let second = CallFaceEffectGeometry.wartCenters(for: face, count: 6, seed: 42)
        XCTAssertEqual(first, second)
        XCTAssertEqual(first.count, 6)
        XCTAssertTrue(first.allSatisfy { face.contains($0) })
        XCTAssertNotEqual(first, CallFaceEffectGeometry.wartCenters(for: face, count: 6, seed: 7))
    }

    func test_wartCenters_negativeCount_isEmpty() {
        XCTAssertTrue(CallFaceEffectGeometry.wartCenters(for: face, count: -2, seed: 1).isEmpty)
    }

    // MARK: - Animation

    func test_shimmer_staysWithinItsBand() {
        let values = stride(from: 0.0, through: 10.0, by: 0.1).map(CallFaceEffectGeometry.shimmer(time:))
        XCTAssertTrue(values.allSatisfy { $0 >= 0.7 - 0.0001 && $0 <= 1.0001 })
        XCTAssertGreaterThan(Set(values.map { Int($0 * 100) }).count, 1)
    }

    func test_eyeGlowRadius_pulsesAroundAFractionOfTheFace() {
        let radii = stride(from: 0.0, through: 3.0, by: 0.05).map { CallFaceEffectGeometry.eyeGlowRadius(for: face, time: $0) }
        XCTAssertTrue(radii.allSatisfy { $0 > 0 && $0 < face.width * 0.1 })
    }

    func test_lavaHeight_staysNearTheBottomSixth() {
        let heights = stride(from: 0.0, through: 10.0, by: 0.1).map { CallFaceEffectGeometry.lavaHeight(time: $0, canvasHeight: 1000) }
        XCTAssertTrue(heights.allSatisfy { $0 >= 130 - 0.001 && $0 <= 190 + 0.001 })
    }

    func test_embers_deterministicForAGivenTime() {
        let canvas = CGRect(x: 0, y: 0, width: 720, height: 1280)
        XCTAssertEqual(
            CallFaceEffectGeometry.embers(count: 12, time: 1.5, canvas: canvas, seed: 3),
            CallFaceEffectGeometry.embers(count: 12, time: 1.5, canvas: canvas, seed: 3)
        )
    }

    func test_embers_stayOnCanvasWithValidOpacity() {
        let canvas = CGRect(x: 0, y: 0, width: 720, height: 1280)
        let embers = stride(from: 0.0, through: 20.0, by: 0.7).flatMap {
            CallFaceEffectGeometry.embers(count: 28, time: $0, canvas: canvas, seed: 11)
        }
        XCTAssertTrue(embers.allSatisfy { canvas.insetBy(dx: -30, dy: -1).contains($0.center) })
        XCTAssertTrue(embers.allSatisfy { (0...1).contains($0.opacity) && $0.radius > 0 })
    }

    func test_embers_rise() {
        let canvas = CGRect(x: 0, y: 0, width: 720, height: 1280)
        let before = CallFaceEffectGeometry.embers(count: 28, time: 2.0, canvas: canvas, seed: 5)
        let after = CallFaceEffectGeometry.embers(count: 28, time: 2.05, canvas: canvas, seed: 5)
        let rising = zip(before, after).filter { $1.center.y > $0.center.y }.count
        XCTAssertGreaterThan(rising, 20)
    }

    func test_unit_isInTheHalfOpenUnitInterval() {
        let values = (0..<500).map { CallFaceEffectGeometry.unit(99, $0, 4) }
        XCTAssertTrue(values.allSatisfy { $0 >= 0 && $0 < 1 })
    }

    // MARK: - Budget

    func test_budget_degradedDetectsLessAndDrawsLess() {
        XCTAssertGreaterThan(CallFaceEffectBudget.detectionStride(isDegraded: true), CallFaceEffectBudget.detectionStride(isDegraded: false))
        XCTAssertLessThan(CallFaceEffectBudget.emberCount(isDegraded: true), CallFaceEffectBudget.emberCount(isDegraded: false))
        XCTAssertLessThan(CallFaceEffectBudget.wartCount(isDegraded: true), CallFaceEffectBudget.wartCount(isDegraded: false))
        XCTAssertFalse(CallFaceEffectBudget.allowsBloom(isDegraded: true))
        XCTAssertTrue(CallFaceEffectBudget.allowsBloom(isDegraded: false))
    }

    func test_budget_detectsAboutEveryFifthFrame() {
        XCTAssertEqual(CallFaceEffectBudget.detectionStride(isDegraded: false), 5)
    }

    // MARK: - Orientation

    func test_orientation_mapsWebRTCRotations() {
        XCTAssertEqual(CallFrameOrientation.orientation(forRotation: 0), .up)
        XCTAssertEqual(CallFrameOrientation.orientation(forRotation: 90), .right)
        XCTAssertEqual(CallFrameOrientation.orientation(forRotation: 180), .down)
        XCTAssertEqual(CallFrameOrientation.orientation(forRotation: 270), .left)
        XCTAssertEqual(CallFrameOrientation.orientation(forRotation: -90), .left)
        XCTAssertEqual(CallFrameOrientation.orientation(forRotation: 450), .right)
    }

    func test_inverse_undoesQuarterTurns() {
        XCTAssertEqual(CallFrameOrientation.inverse(of: .right), .left)
        XCTAssertEqual(CallFrameOrientation.inverse(of: .left), .right)
        XCTAssertEqual(CallFrameOrientation.inverse(of: .down), .down)
        XCTAssertEqual(CallFrameOrientation.inverse(of: .up), .up)
    }

    func test_uprightSize_swapsOnQuarterTurns() {
        let size = CGSize(width: 1280, height: 720)
        XCTAssertEqual(CallFrameOrientation.uprightSize(of: size, rotation: 90), CGSize(width: 720, height: 1280))
        XCTAssertEqual(CallFrameOrientation.uprightSize(of: size, rotation: 180), size)
    }
}
