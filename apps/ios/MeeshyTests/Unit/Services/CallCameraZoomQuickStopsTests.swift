import XCTest
import CoreGraphics
@testable import Meeshy

/// #8441 — le zoom se choisit aussi D'UN DOIGT, dans les commandes de ma
/// caméra : des pastilles « 0,5× · 1× · 2× · 3× » quand mon image est en plein
/// écran, un seul bouton de 44 pt qui passe d'un facteur au suivant dans ma
/// vignette. Les facteurs viennent de l'appareil, bornés par son zoom réel.
@MainActor
final class CallCameraZoomQuickStopsTests: XCTestCase {

    // MARK: - Factories

    private func profile(
        isFront: Bool = false,
        lenses: CameraLensKit,
        max: CGFloat = 123,
        switchOvers: [CGFloat] = []
    ) throws -> CameraZoomProfile {
        try XCTUnwrap(CameraZoomPolicy.profile(for: CameraZoomDescriptor(
            isFront: isFront, lenses: lenses, minAvailable: 1, maxAvailable: max, switchOvers: switchOvers, isLocked: false
        )))
    }

    private func makeController() -> CameraZoomController {
        CameraZoomController(applier: QuickStopImmediateApplier())
    }

    // MARK: - Facteurs par appareil

    func test_quickStops_tripleCamera_offersHalfOneTwoThree() throws {
        XCTAssertEqual(try profile(lenses: .triple, switchOvers: [2, 6]).quickStops, [0.5, 1, 2, 3])
    }

    func test_quickStops_ultraWideWide_offersHalfOneTwo() throws {
        XCTAssertEqual(try profile(lenses: .ultraWideWide, max: 16, switchOvers: [2]).quickStops, [0.5, 1, 2])
    }

    func test_quickStops_wideTele_offersOneTwo() throws {
        XCTAssertEqual(try profile(lenses: .wideTele, max: 16, switchOvers: [2]).quickStops, [1, 2])
    }

    func test_quickStops_frontCamera_offersOneTwo() throws {
        XCTAssertEqual(try profile(isFront: true, lenses: .single, max: 16).quickStops, [1, 2])
    }

    func test_quickStops_deviceBelowTwo_keepsWithinItsZoom() throws {
        XCTAssertEqual(try profile(lenses: .single, max: 1.5).quickStops, [1])
    }

    // MARK: - Le bouton replié passe au facteur suivant

    func test_nextQuickStop_fromOne_goesToTwo() throws {
        XCTAssertEqual(try profile(lenses: .triple, switchOvers: [2, 6]).nextQuickStop(after: 1), 2)
    }

    func test_nextQuickStop_fromLast_wrapsToWidest() throws {
        XCTAssertEqual(try profile(lenses: .triple, switchOvers: [2, 6]).nextQuickStop(after: 3), 0.5)
    }

    func test_nextQuickStop_betweenStops_goesToNextOne() throws {
        XCTAssertEqual(try profile(lenses: .triple, switchOvers: [2, 6]).nextQuickStop(after: 2.4), 3)
    }

    // MARK: - Où le zoom se pose dans les commandes de ma caméra

    func test_control_fullScreenImage_showsLensChips() throws {
        let control = CallCameraRail.zoomControl(profile: try profile(lenses: .triple, switchOvers: [2, 6]), placement: .topCenter, tileSize: nil)
        XCTAssertEqual(control, .lensChips([0.5, 1, 2, 3]))
    }

    func test_control_selfTile_foldsIntoOneButton() throws {
        let control = CallCameraRail.zoomControl(
            profile: try profile(lenses: .triple, switchOvers: [2, 6]), placement: .selfTile, tileSize: CGSize(width: 120, height: 160))
        XCTAssertEqual(control, .cycleButton)
    }

    /// #8747 — les commandes de ma caméra ont quitté la vignette : le bouton
    /// de zoom y a sa place à chaque palier, même le plus petit.
    func test_control_everySelfTileStep_hasTheCycleButton() throws {
        let zoomable = try profile(lenses: .triple, switchOvers: [2, 6])
        for scale in CallSelfTileScale.allCases {
            XCTAssertEqual(CallCameraRail.zoomControl(profile: zoomable, placement: .selfTile, tileSize: scale.size), .cycleButton, "\(scale)")
        }
    }

    func test_control_selfTileSmallerThanOneTarget_showsNothing() throws {
        let control = CallCameraRail.zoomControl(
            profile: try profile(lenses: .triple, switchOvers: [2, 6]), placement: .selfTile, tileSize: CGSize(width: 48, height: 80))
        XCTAssertNil(control)
    }

    func test_control_selfTileWithoutSize_showsNothing() throws {
        XCTAssertNil(CallCameraRail.zoomControl(profile: try profile(lenses: .triple, switchOvers: [2, 6]), placement: .selfTile, tileSize: nil))
    }

    func test_control_menuPlacement_showsNothing() throws {
        XCTAssertNil(CallCameraRail.zoomControl(profile: try profile(lenses: .triple, switchOvers: [2, 6]), placement: .menu, tileSize: nil))
    }

    func test_control_notZoomable_showsNothing() {
        XCTAssertNil(CallCameraRail.zoomControl(profile: nil, placement: .topCenter, tileSize: nil))
    }

    func test_control_singleStop_showsNothing() throws {
        XCTAssertNil(CallCameraRail.zoomControl(profile: try profile(lenses: .single, max: 1.5), placement: .topCenter, tileSize: nil))
    }

    // MARK: - Contrôleur

    func test_select_lensChip_movesDeviceToThatLens() {
        let controller = makeController()
        let device = QuickStopMockDevice(descriptor: CameraZoomDescriptor(
            isFront: false, lenses: .triple, minAvailable: 1, maxAvailable: 123, switchOvers: [2, 6], isLocked: false))
        controller.attach(device)

        controller.select(0.5)

        XCTAssertEqual(controller.displayFactor, 0.5)
        XCTAssertEqual(device.appliedFactors.last, 1, "0,5× = l'ultra grand-angle, 1.0 sur l'appareil virtuel")
    }

    func test_cycleQuickStop_fromBaseline_goesToTwo() {
        let controller = makeController()
        controller.attach(QuickStopMockDevice(descriptor: CameraZoomDescriptor(
            isFront: true, lenses: .single, minAvailable: 1, maxAvailable: 16, switchOvers: [], isLocked: false)))

        controller.cycleQuickStop()

        XCTAssertEqual(controller.displayFactor, 2)
    }

    func test_cycleQuickStop_fromTwoOnFront_foldsBackToOne() {
        let controller = makeController()
        controller.attach(QuickStopMockDevice(descriptor: CameraZoomDescriptor(
            isFront: true, lenses: .single, minAvailable: 1, maxAvailable: 16, switchOvers: [], isLocked: false)))

        controller.cycleQuickStop()
        controller.cycleQuickStop()

        XCTAssertEqual(controller.displayFactor, 1)
    }
}

// MARK: - Doubles

private struct QuickStopImmediateApplier: CameraZoomApplying {
    func apply(_ work: @escaping @Sendable () -> Void) { work() }
}

private final class QuickStopMockDevice: ZoomableCaptureDevice, @unchecked Sendable {
    let zoomDescriptor: CameraZoomDescriptor
    private(set) var appliedFactors: [CGFloat] = []

    init(descriptor: CameraZoomDescriptor) {
        zoomDescriptor = descriptor
    }

    func applyZoom(deviceFactor: CGFloat, rampRate: Float?) {
        appliedFactors.append(deviceFactor)
    }
}
