import XCTest
@testable import Meeshy

/// `CallCameraActuator` actionne la caméra d'un appel (#11522). Sans appel
/// attaché, ni la coupure, ni la bascule, ni le choix d'appareil ne touchent à
/// quoi que ce soit.
@MainActor
final class CallCameraActuatorTests: XCTestCase {

    func test_toggleVideo_withoutAnAttachedCall_isANoOp() {
        let actuator = CallCameraActuator()

        actuator.toggleVideo()
    }

    func test_switchCamera_withoutAnAttachedCall_isANoOp() {
        let actuator = CallCameraActuator()

        actuator.switchCamera()
    }

    func test_selectCamera_withoutAnAttachedCall_isANoOp() {
        let actuator = CallCameraActuator()

        actuator.selectCamera(id: "front")
    }

    func test_refreshAvailableCameras_withoutAnAttachedCall_isANoOp() {
        let actuator = CallCameraActuator()

        actuator.refreshAvailableCameras()
    }

    func test_theManagerExposesItsActuator_toTheCallScreens() {
        let manager = CallManager.shared

        XCTAssertNotNil(manager.cameraActuator)
    }
}
