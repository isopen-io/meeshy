import XCTest
import CoreGraphics
@testable import Meeshy

/// #8441 — zoom de la caméra envoyée pendant un appel.
///
/// La politique ne voit que des nombres : ce que l'appareil rapporte
/// (`minAvailableVideoZoomFactor`, `maxAvailableVideoZoomFactor`,
/// `virtualDeviceSwitchOverVideoZoomFactors`) et ce que l'utilisateur lit
/// (« 0,5× · 1× · 3× »). Un triple objectif rapporte 1.0 pour l'ULTRA grand-angle :
/// sans la conversion, « 1× » ouvrirait l'appel en ultra grand-angle.
@MainActor
final class CameraZoomPolicyTests: XCTestCase {

    // MARK: - Factories

    private func descriptor(
        isFront: Bool = false,
        lenses: CameraLensKit = .single,
        min: CGFloat = 1,
        max: CGFloat = 16,
        switchOvers: [CGFloat] = [],
        isLocked: Bool = false
    ) -> CameraZoomDescriptor {
        CameraZoomDescriptor(
            isFront: isFront,
            lenses: lenses,
            minAvailable: min,
            maxAvailable: max,
            switchOvers: switchOvers,
            isLocked: isLocked
        )
    }

    private func tripleProfile() throws -> CameraZoomProfile {
        try XCTUnwrap(CameraZoomPolicy.profile(for: descriptor(lenses: .triple, max: 123, switchOvers: [2, 6])))
    }

    private func frontProfile() throws -> CameraZoomProfile {
        try XCTUnwrap(CameraZoomPolicy.profile(for: descriptor(isFront: true, max: 16)))
    }

    // MARK: - Préférence d'objectif arrière

    func test_backLensPreference_ordersRichestVirtualDeviceFirst() {
        XCTAssertEqual(CameraZoomPolicy.backLensPreference, [.triple, .ultraWideWide, .wideTele, .single])
    }

    // MARK: - Bornes par caméra

    func test_profile_tripleCamera_opensOnWideLensAndReachesUltraWide() throws {
        let profile = try tripleProfile()

        XCTAssertEqual(profile.baselineDisplay, 1)
        XCTAssertEqual(profile.deviceFactor(forDisplay: profile.baselineDisplay), 2, "« 1× » = le grand-angle, commuté à 2.0 sur l'appareil virtuel")
        XCTAssertEqual(profile.minDisplay, 0.5)
        XCTAssertEqual(profile.deviceFactor(forDisplay: 0.5), 1)
    }

    func test_profile_backCamera_capsDisplayAtTen() throws {
        let profile = try tripleProfile()

        XCTAssertEqual(profile.maxDisplay, 10)
        XCTAssertEqual(profile.deviceFactor(forDisplay: profile.maxDisplay), 20)
    }

    func test_profile_frontCamera_isDigitalUpToThree() throws {
        let profile = try frontProfile()

        XCTAssertEqual(profile.minDisplay, 1)
        XCTAssertEqual(profile.maxDisplay, 3)
        XCTAssertEqual(profile.baselineDisplay, 1)
        XCTAssertEqual(profile.lensStops, [1])
    }

    func test_profile_deviceBelowCap_keepsDeviceMaximum() throws {
        let profile = try XCTUnwrap(CameraZoomPolicy.profile(for: descriptor(max: 4)))

        XCTAssertEqual(profile.maxDisplay, 4)
    }

    func test_profile_wideTeleCamera_keepsWideAsOneAndTeleAsTwo() throws {
        let profile = try XCTUnwrap(CameraZoomPolicy.profile(for: descriptor(lenses: .wideTele, max: 16, switchOvers: [2])))

        XCTAssertEqual(profile.minDisplay, 1)
        XCTAssertEqual(profile.deviceFactor(forDisplay: 1), 1)
        XCTAssertEqual(profile.lensStops, [1, 2])
    }

    func test_profile_ultraWideWideCamera_exposesHalfAndOne() throws {
        let profile = try XCTUnwrap(CameraZoomPolicy.profile(for: descriptor(lenses: .ultraWideWide, max: 16, switchOvers: [2])))

        XCTAssertEqual(profile.lensStops, [0.5, 1])
        XCTAssertEqual(profile.maxDisplay, 8)
    }

    func test_profile_tripleCamera_listsEveryLensSwitchOver() throws {
        let profile = try tripleProfile()

        XCTAssertEqual(profile.lensStops, [0.5, 1, 3])
    }

    func test_profile_fiveTimesTelephoto_placesTeleAtFive() throws {
        let profile = try XCTUnwrap(CameraZoomPolicy.profile(for: descriptor(lenses: .triple, max: 123, switchOvers: [2, 10])))

        XCTAssertEqual(profile.lensStops, [0.5, 1, 5])
    }

    func test_profile_deviceWithoutZoomRange_isNotZoomable() {
        XCTAssertNil(CameraZoomPolicy.profile(for: descriptor(min: 1, max: 1)))
    }

    func test_profile_lockedDevice_isNotZoomable() {
        XCTAssertNil(CameraZoomPolicy.profile(for: descriptor(isFront: true, isLocked: true)), "Center Stage actif : le zoom est piloté par le système")
    }

    // MARK: - Clamp

    func test_clampedDisplay_outOfRange_staysWithinBounds() throws {
        let profile = try tripleProfile()

        XCTAssertEqual(profile.clampedDisplay(0.1), 0.5)
        XCTAssertEqual(profile.clampedDisplay(40), 10)
        XCTAssertEqual(profile.clampedDisplay(2.5), 2.5)
    }

    // MARK: - Pincement

    func test_displayForPinchScale_multipliesStartFactor() throws {
        let profile = try tripleProfile()

        XCTAssertEqual(profile.display(forPinchScale: 2, from: 1), 2)
        XCTAssertEqual(profile.display(forPinchScale: 0.5, from: 2), 1)
    }

    func test_displayForPinchScale_beyondBounds_isClamped() throws {
        let profile = try frontProfile()

        XCTAssertEqual(profile.display(forPinchScale: 10, from: 1), 3)
        XCTAssertEqual(profile.display(forPinchScale: 0.1, from: 2), 1)
        XCTAssertEqual(profile.display(forPinchScale: 0, from: 2), 1)
    }

    func test_settled_nearLensStop_snapsToIt() throws {
        let profile = try tripleProfile()

        XCTAssertEqual(profile.settled(2.9), 3)
        XCTAssertEqual(profile.settled(1.04), 1)
    }

    func test_settled_farFromLensStop_keepsValue() throws {
        let profile = try tripleProfile()

        XCTAssertEqual(profile.settled(2), 2)
    }

    // MARK: - VoiceOver (incrément / décrément)

    func test_stepped_increment_walksLensThenDigitalStops() throws {
        let profile = try tripleProfile()

        XCTAssertEqual(profile.stepped(from: 0.5, .increment), 1)
        XCTAssertEqual(profile.stepped(from: 1, .increment), 2)
        XCTAssertEqual(profile.stepped(from: 2, .increment), 3)
        XCTAssertEqual(profile.stepped(from: 3, .increment), 5)
        XCTAssertEqual(profile.stepped(from: 10, .increment), 10)
    }

    func test_stepped_decrement_walksBackToMinimum() throws {
        let profile = try tripleProfile()

        XCTAssertEqual(profile.stepped(from: 2.4, .decrement), 2)
        XCTAssertEqual(profile.stepped(from: 1, .decrement), 0.5)
        XCTAssertEqual(profile.stepped(from: 0.5, .decrement), 0.5)
    }

    func test_stepped_frontCamera_stopsAtThree() throws {
        let profile = try frontProfile()

        XCTAssertEqual(profile.stepped(from: 1, .increment), 2)
        XCTAssertEqual(profile.stepped(from: 2, .increment), 3)
        XCTAssertEqual(profile.stepped(from: 3, .increment), 3)
    }

    // MARK: - Libellé

    func test_label_french_usesCommaAndMultiplicationSign() {
        let fr = Locale(identifier: "fr_FR")

        XCTAssertEqual(CameraZoomPolicy.label(forDisplay: 0.5, locale: fr), "0,5×")
        XCTAssertEqual(CameraZoomPolicy.label(forDisplay: 1, locale: fr), "1×")
        XCTAssertEqual(CameraZoomPolicy.label(forDisplay: 2, locale: fr), "2×")
        XCTAssertEqual(CameraZoomPolicy.label(forDisplay: 3, locale: fr), "3×")
    }

    func test_label_intermediateFactor_keepsOneDecimal() {
        XCTAssertEqual(CameraZoomPolicy.label(forDisplay: 2.44, locale: Locale(identifier: "fr_FR")), "2,4×")
        XCTAssertEqual(CameraZoomPolicy.label(forDisplay: 2.44, locale: Locale(identifier: "en_US")), "2.4×")
    }

    func test_label_nearlyWholeFactor_dropsDecimal() {
        XCTAssertEqual(CameraZoomPolicy.label(forDisplay: 0.999, locale: Locale(identifier: "en_US")), "1×")
    }
}
