import XCTest
import AVFoundation
@testable import Meeshy

/// **La caméra s'arme et déclenche vite, sans zoom ni rotation parasites, avec
/// un flash au déclenchement** (#16482).
@MainActor
final class CameraShutterSotaTests: XCTestCase {

    // MARK: - Factories

    private func dims(_ width: Int32, _ height: Int32) -> CameraPhotoDimensions {
        CameraPhotoDimensions(width: width, height: height)
    }

    private func capabilities(zsl: Bool = true, responsive: Bool = true, fast: Bool = true,
                              format: CameraPhotoDimensions = CameraPhotoDimensions(width: 1920, height: 1080),
                              photos: [CameraPhotoDimensions]? = nil) -> CameraPhotoCapabilities {
        CameraPhotoCapabilities(
            supportsZeroShutterLag: zsl, supportsResponsiveCapture: responsive,
            supportsFastCapturePrioritization: fast, formatDimensions: format,
            supportedMaxPhotoDimensions: photos ?? [dims(1920, 1080), dims(4032, 2268), dims(4032, 3024),
                                                    dims(8064, 4536)])
    }

    // MARK: - La sortie photo

    func test_plan_whenTheLensServesThem_enablesZeroShutterLagResponsiveAndFastCapture() {
        let plan = CameraPhotoTuning.plan(for: capabilities())
        XCTAssertTrue(plan.zeroShutterLag)
        XCTAssertTrue(plan.responsiveCapture)
        XCTAssertTrue(plan.fastCapturePrioritization)
    }

    func test_plan_withoutResponsiveCapture_neverEnablesFastCapture() {
        let plan = CameraPhotoTuning.plan(for: capabilities(responsive: false, fast: true))
        XCTAssertFalse(plan.responsiveCapture)
        XCTAssertFalse(plan.fastCapturePrioritization, "la priorité vitesse exige la prise réactive")
    }

    func test_plan_withoutZeroShutterLag_neverEnablesResponsiveCapture() {
        let plan = CameraPhotoTuning.plan(for: capabilities(zsl: false))
        XCTAssertFalse(plan.zeroShutterLag)
        XCTAssertFalse(plan.responsiveCapture, "la prise réactive exige l'obturateur sans latence")
        XCTAssertFalse(plan.fastCapturePrioritization)
    }

    func test_plan_qualityPrioritization_isBalancedNeverQuality() {
        XCTAssertEqual(CameraPhotoTuning.plan(for: capabilities()).qualityPrioritization, .balanced)
    }

    func test_plan_maxPhotoDimensions_isTheSmallestOfThePreviewAspectThatCoversTheProcessing() {
        let plan = CameraPhotoTuning.plan(for: capabilities(), coveringLongestSide: 2560)
        XCTAssertEqual(plan.maxPhotoDimensions, dims(4032, 2268),
                       "16:9 comme l'aperçu, jamais 4:3, et pas 36 Mpx qu'on réduira aussitôt")
    }

    func test_plan_whenNothingCoversTheProcessing_takesTheLargestOfTheAspect() {
        let plan = CameraPhotoTuning.plan(for: capabilities(photos: [dims(1280, 720), dims(1920, 1080)]),
                                          coveringLongestSide: 2560)
        XCTAssertEqual(plan.maxPhotoDimensions, dims(1920, 1080))
    }

    func test_plan_withoutAnnouncedDimensions_leavesThemUntouched() {
        XCTAssertNil(CameraPhotoTuning.plan(for: capabilities(photos: [])).maxPhotoDimensions)
    }

    func test_settings_unsupportedFlash_isOff_andQualityIsBalanced() {
        let reglages = CameraPhotoTuning.settings(flash: .on, supportedFlashModes: [.off],
                                                  outputMaxPhotoDimensions: dims(4032, 2268),
                                                  formatMaxPhotoDimensions: [dims(1920, 1080), dims(4032, 2268)])
        XCTAssertEqual(reglages.flashMode, .off)
        XCTAssertEqual(reglages.photoQualityPrioritization, .balanced)
        XCTAssertEqual(reglages.maxPhotoDimensions.width, 4032)
        XCTAssertEqual(reglages.maxPhotoDimensions.height, 2268)
    }

    func test_settings_supportedFlash_isKept() {
        let reglages = CameraPhotoTuning.settings(flash: .auto, supportedFlashModes: [.off, .auto, .on],
                                                  outputMaxPhotoDimensions: dims(0, 0),
                                                  formatMaxPhotoDimensions: [])
        XCTAssertEqual(reglages.flashMode, .auto)
    }

    /// `capturePhoto` lève si la définition demandée n'est pas celle du format
    /// ACTIF, et la sortie ne suit pas un format changé hors de la session.
    func test_settings_afterAForeignFormat_neverAsksWhatTheFormatRefuses() {
        let reglages = CameraPhotoTuning.settings(flash: .off, supportedFlashModes: [.off],
                                                  outputMaxPhotoDimensions: dims(4032, 2268),
                                                  formatMaxPhotoDimensions: [dims(1280, 720), dims(1920, 1080)])
        XCTAssertEqual(reglages.maxPhotoDimensions.width, 1920, "la plus grande que le format sert sous le plafond de la sortie")
        XCTAssertEqual(reglages.maxPhotoDimensions.height, 1080)
    }

    func test_settings_whenTheFormatServesNothingUnderTheOutput_leavesTheDefault() {
        let reglages = CameraPhotoTuning.settings(flash: .off, supportedFlashModes: [.off],
                                                  outputMaxPhotoDimensions: dims(1280, 720),
                                                  formatMaxPhotoDimensions: [dims(4032, 3024)])
        XCTAssertEqual(reglages.maxPhotoDimensions.width, 0, "(0, 0) : AVFoundation ne valide rien et sert son défaut")
    }

    func test_settings_withoutAReadableFormat_leavesTheDefault() {
        let reglages = CameraPhotoTuning.settings(flash: .off, supportedFlashModes: [.off],
                                                  outputMaxPhotoDimensions: dims(4032, 2268),
                                                  formatMaxPhotoDimensions: [])
        XCTAssertEqual(reglages.maxPhotoDimensions.width, 0)
    }

    /// La VRAIE sortie : sans connexion, `maxPhotoDimensions` lève une exception
    /// Objective-C — le processus meurt, le témoin ne peut pas rougir autrement.
    func test_adopt_onAnOutputWithoutConnection_leavesItsDimensionsAlone() {
        let sortie = AVCapturePhotoOutput()
        sortie.adopt(CameraPhotoTuningPlan(zeroShutterLag: false, responsiveCapture: false,
                                           fastCapturePrioritization: false, qualityPrioritization: .balanced,
                                           maxPhotoDimensions: dims(4032, 2268)))
        XCTAssertEqual(sortie.maxPhotoDimensions.width, 0)
    }

    // MARK: - Le zoom d'ouverture

    func test_openingZoom_onAMultiLensCamera_isTheWideLensShownAsOne() {
        let echelle = ComposerCaptureZoomScale(base: ComposerCaptureZoomScale.base(switchOvers: [2, 6],
                                                                                    hasUltraWide: true))
        XCTAssertEqual(echelle.opening, 2, "le facteur appareil du grand-angle")
        XCTAssertEqual(echelle.displayed(echelle.opening), 1, "affiché « 1× » : aucun zoom à l'ouverture")
    }

    // MARK: - Le retour au déclenchement

    #if DEBUG
    func test_takePhoto_onTheRecetteCamera_firesTheShutterBeforeTheTakeArrives() {
        let camera = CameraModel(fixture: ComposerCaptureFixtureDriver())
        XCTAssertEqual(camera.shutterCount, 0)
        camera.takePhoto(flash: .off)
        XCTAssertEqual(camera.shutterCount, 1, "le retour part au déclenchement, sans attendre le traitement")
    }
    #endif

    func test_noteShutterFired_ticksOnce() {
        let camera = CameraModel()
        camera.noteShutterFired()
        XCTAssertEqual(camera.shutterCount, 1)
    }

    func test_shootPhoto_pulsesTheShutterAtTheTouch() {
        let mock = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .armed, mode: .photo, controls: mock)
        session.perform(.photoToEdit, item: nil)
        XCTAssertEqual(session.camera.shutterPresses, 1, "le bouton répond au toucher, avant même que l'objectif ne prenne")
    }

    func test_shutterFlash_isBriefAndSofterUnderReduceMotion() {
        XCTAssertLessThanOrEqual(ComposerShutterFeedback.flashDuration, 0.15)
        XCTAssertGreaterThanOrEqual(ComposerShutterFeedback.flashDuration, 0.08)
        XCTAssertGreaterThan(ComposerShutterFeedback.flashPeak(reduceMotion: false),
                             ComposerShutterFeedback.flashPeak(reduceMotion: true))
        XCTAssertGreaterThan(ComposerShutterFeedback.flashPeak(reduceMotion: true), 0, "le retour reste visible")
    }

    func test_shutterPulse_contractsWithoutMotionWhenReduced() {
        XCTAssertLessThan(ComposerShutterFeedback.pressedScale(reduceMotion: false), 1)
        XCTAssertEqual(ComposerShutterFeedback.pressedScale(reduceMotion: true), 1, "Réduire les animations : aucun mouvement")
        XCTAssertLessThan(ComposerShutterFeedback.pressedOpacity(reduceMotion: true), 1, "mais un fondu dit le toucher")
    }

    // MARK: - La vue épurée

    func test_gestureHint_isShownOnlyUntilTheFirstTake() {
        XCTAssertTrue(ComposerShutterFeedback.showsHint(base: true, hasTakenAPhoto: false))
        XCTAssertFalse(ComposerShutterFeedback.showsHint(base: true, hasTakenAPhoto: true))
        XCTAssertFalse(ComposerShutterFeedback.showsHint(base: false, hasTakenAPhoto: false))
    }

    func test_zoomMorphPill_doesNotSpin() throws {
        let code = try String(contentsOf: Self.racine.appendingPathComponent(
            "Meeshy/Features/Composer/ComposerCaptureMotion.swift"), encoding: .utf8)
        XCTAssertFalse(code.contains("rotationEffect"), "aucune rotation pendant la bascule d'objectif")
        XCTAssertFalse(code.contains("repeatForever"))
    }

    func test_shutterFlash_coversTheFrame_notTheLoadingImage() throws {
        let code = try String(contentsOf: Self.racine.appendingPathComponent(
            "Meeshy/Features/Composer/ComposerCaptureMount.swift"), encoding: .utf8)
        let image = try XCTUnwrap(code.range(of: "private func image(rect:"))
        let cadre = try XCTUnwrap(code.range(of: ".frame(width: rect.width", range: image.upperBound..<code.endIndex))
        let flash = try XCTUnwrap(code.range(of: "ComposerShutterFlash(", range: image.upperBound..<code.endIndex))
        XCTAssertLessThan(cadre.lowerBound, flash.lowerBound,
                          "attaché à l'image qui se charge, le flash n'a pas de taille et ne se voit pas")
    }

    private static let racine = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
}
