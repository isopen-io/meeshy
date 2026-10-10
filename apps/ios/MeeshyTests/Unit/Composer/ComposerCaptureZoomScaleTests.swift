import XCTest
import AVFoundation
@testable import Meeshy

/// **Le viseur dézoome jusqu'à ×0,5** (#9350, spec § 4.5).
@MainActor
final class ComposerCaptureZoomScaleTests: XCTestCase {

    func test_base_tripleCamera_isTheFirstSwitchOver() {
        XCTAssertEqual(ComposerCaptureZoomScale.base(switchOvers: [2, 6], hasUltraWide: true), 2)
    }

    func test_base_dualWithoutUltraWide_staysOne() {
        XCTAssertEqual(ComposerCaptureZoomScale.base(switchOvers: [2], hasUltraWide: false), 1,
                       "grand-angle + téléobjectif : ×1 est le facteur 1 de l'appareil")
    }

    func test_displayedAndDevice_areInverse() {
        let echelle = ComposerCaptureZoomScale(base: 2)
        XCTAssertEqual(echelle.displayed(1), 0.5)
        XCTAssertEqual(echelle.device(1), 2)
        XCTAssertEqual(echelle.opening, 2, "le viseur s'ouvre à ×1 affiché")
    }

    func test_displayedRange_ultraWide_startsAtHalf_andIsCeilinged() {
        let plage = ComposerCaptureZoomScale(base: 2).displayedRange(deviceMin: 1, deviceMax: 123)
        XCTAssertEqual(plage.lowerBound, 0.5)
        XCTAssertEqual(plage.upperBound, ComposerCaptureZoom.ceiling)
    }

    func test_displayedRange_fixedLens_isOneToOne() {
        XCTAssertEqual(ComposerCaptureZoomScale(base: 1).displayedRange(deviceMin: 1, deviceMax: 1), 1...1)
    }

    func test_presets_ultraWide_offersHalfOneTwo() {
        XCTAssertEqual(ComposerCaptureZoomScale.presets(in: 0.5...10), [0.5, 1, 2])
    }

    func test_presets_singleLensOrFrontCamera_excludesHalf() {
        XCTAssertEqual(ComposerCaptureZoomScale.presets(in: 1...10), [1, 2])
        XCTAssertEqual(ComposerCaptureZoomScale.presets(in: 1...1), [], "sans zoom, aucun cran")
    }

    func test_showsBadge_belowOne_too() {
        XCTAssertTrue(ComposerCaptureZoom.showsBadge(0.5))
        XCTAssertFalse(ComposerCaptureZoom.showsBadge(1))
    }

    func test_preferredDeviceTypes_virtualFirst_wideLast() {
        XCTAssertEqual(ComposerCaptureZoomScale.preferredDeviceTypes,
                       [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera])
    }

    func test_zoomPresetValue_readsLikeTheSystemCamera() {
        XCTAssertTrue(ComposerSceneCameraCopy.zoomPresetValue(0.5).hasSuffix("×"))
        XCTAssertTrue(ComposerSceneCameraCopy.zoomPresetValue(1).hasPrefix("1"))
    }

    func test_camera_opensTheVirtualDevice_andTheBarOffersThePresets() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("AVCaptureDevice.DiscoverySession("), "la caméra virtuelle d'abord")
        XCTAssertTrue(camera.contains("virtualDeviceSwitchOverVideoZoomFactors"))
        XCTAssertTrue(camera.contains("zoomScale.device("), "le facteur affiché se convertit à l'écriture")
        XCTAssertFalse(camera.contains("AVCaptureDevice.default(.builtInWideAngleCamera"),
                       "l'objectif grand-angle seul plafonnait le zoom à ×1")
        let bas = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("ComposerCaptureZoomBar("), "la barre des zooms, qui morphe à la bascule (#9753)")
        let barre = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureMotion.swift")
        XCTAssertTrue(barre.contains("ComposerCaptureZoomPresets("), "la pastille ×0,5 / ×1 / ×2")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
