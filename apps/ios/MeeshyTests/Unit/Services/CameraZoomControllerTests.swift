import XCTest
import CoreGraphics
@testable import Meeshy

/// #8441 — le contrôleur relie le geste à l'appareil : ce qu'il affiche
/// (`displayFactor`) et ce qu'il envoie à la caméra (`applyZoom`) doivent
/// rester la même valeur vue dans deux échelles.
@MainActor
final class CameraZoomControllerTests: XCTestCase {

    // MARK: - Factories

    private func makeTripleDevice() -> MockZoomableCaptureDevice {
        MockZoomableCaptureDevice(descriptor: CameraZoomDescriptor(
            isFront: false, lenses: .triple, minAvailable: 1, maxAvailable: 123, switchOvers: [2, 6], isLocked: false
        ))
    }

    private func makeFrontDevice(isLocked: Bool = false) -> MockZoomableCaptureDevice {
        MockZoomableCaptureDevice(descriptor: CameraZoomDescriptor(
            isFront: true, lenses: .single, minAvailable: 1, maxAvailable: 16, switchOvers: [], isLocked: isLocked
        ))
    }

    private func makeController() -> CameraZoomController {
        CameraZoomController(applier: ImmediateZoomApplier())
    }

    // MARK: - attach

    func test_attach_tripleCamera_opensOnWideLensWithoutRamp() {
        let controller = makeController()
        let device = makeTripleDevice()

        controller.attach(device)

        XCTAssertEqual(controller.displayFactor, 1)
        XCTAssertEqual(device.applied.last?.factor, 2, "L'appareil virtuel ouvrirait en ultra grand-angle à 1.0")
        XCTAssertNil(device.applied.last?.rampRate)
    }

    func test_attach_lockedDevice_isNotZoomableAndLeavesDeviceUntouched() {
        let controller = makeController()
        let device = makeFrontDevice(isLocked: true)

        controller.attach(device)
        controller.updatePinch(scale: 2)

        XCTAssertNil(controller.profile)
        XCTAssertTrue(device.applied.isEmpty)
    }

    func test_attach_afterZoom_resetsToBaseline() {
        let controller = makeController()
        controller.attach(makeTripleDevice())
        controller.updatePinch(scale: 3)
        controller.endPinch()
        let front = makeFrontDevice()

        controller.attach(front)

        XCTAssertEqual(controller.displayFactor, 1, "Changer de caméra ramène à 1×")
        XCTAssertEqual(front.applied.last?.factor, 1)
    }

    // MARK: - pincement

    func test_updatePinch_multipliesFactorAtGestureStart_andRamps() {
        let controller = makeController()
        let device = makeTripleDevice()
        controller.attach(device)

        controller.updatePinch(scale: 1.5)
        controller.updatePinch(scale: 2)

        XCTAssertEqual(controller.displayFactor, 2)
        XCTAssertEqual(device.applied.last?.factor, 4)
        XCTAssertEqual(device.applied.last?.rampRate, CameraZoomPolicy.pinchRampRate)
        XCTAssertTrue(controller.isPinching)
    }

    func test_endPinch_thenNewPinch_startsFromReachedFactor() {
        let controller = makeController()
        controller.attach(makeTripleDevice())
        controller.updatePinch(scale: 2)
        controller.endPinch()

        controller.updatePinch(scale: 1.5)

        XCTAssertEqual(controller.displayFactor, 3)
    }

    func test_endPinch_nearLens_snapsToOpticalStop() {
        let controller = makeController()
        let device = makeTripleDevice()
        controller.attach(device)
        controller.updatePinch(scale: 2.9)

        controller.endPinch()

        XCTAssertEqual(controller.displayFactor, 3)
        XCTAssertEqual(device.applied.last?.factor, 6)
        XCTAssertEqual(device.applied.last?.rampRate, CameraZoomPolicy.settleRampRate)
        XCTAssertFalse(controller.isPinching)
    }

    func test_updatePinch_frontCamera_clampsAtThree() {
        let controller = makeController()
        let device = makeFrontDevice()
        controller.attach(device)

        controller.updatePinch(scale: 8)

        XCTAssertEqual(controller.displayFactor, 3)
        XCTAssertEqual(device.applied.last?.factor, 3)
    }

    // MARK: - double-tap et VoiceOver

    func test_resetToBaseline_afterZoom_returnsToOne() {
        let controller = makeController()
        let device = makeTripleDevice()
        controller.attach(device)
        controller.updatePinch(scale: 4)
        controller.endPinch()

        controller.resetToBaseline()

        XCTAssertEqual(controller.displayFactor, 1)
        XCTAssertEqual(device.applied.last?.factor, 2)
    }

    func test_step_increment_thenDecrement_walksStops() {
        let controller = makeController()
        controller.attach(makeTripleDevice())

        controller.step(.increment)
        XCTAssertEqual(controller.displayFactor, 2)
        controller.step(.decrement)
        controller.step(.decrement)
        XCTAssertEqual(controller.displayFactor, 0.5)
    }

    // MARK: - detach

    func test_detach_forgetsDeviceAndProfile() {
        let controller = makeController()
        let device = makeTripleDevice()
        controller.attach(device)
        let appliedBefore = device.applied.count

        controller.detach()
        controller.updatePinch(scale: 2)

        XCTAssertNil(controller.profile)
        XCTAssertEqual(controller.displayFactor, 1)
        XCTAssertEqual(device.applied.count, appliedBefore)
    }
}

// MARK: - Doubles

private struct ImmediateZoomApplier: CameraZoomApplying {
    func apply(_ work: @escaping @Sendable () -> Void) { work() }
}

private final class MockZoomableCaptureDevice: ZoomableCaptureDevice, @unchecked Sendable {
    struct Applied: Equatable {
        let factor: CGFloat
        let rampRate: Float?
    }

    let zoomDescriptor: CameraZoomDescriptor
    private(set) var applied: [Applied] = []

    init(descriptor: CameraZoomDescriptor) {
        zoomDescriptor = descriptor
    }

    func applyZoom(deviceFactor: CGFloat, rampRate: Float?) {
        applied.append(Applied(factor: deviceFactor, rampRate: rampRate))
    }
}
