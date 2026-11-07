import XCTest
import AVFoundation
@testable import Meeshy

/// **Le soleil éclaircit ou assombrit après le toucher** (OPUS-5, audit CAM-3) :
/// environ 1 EV pour 100 pt, borné à ±2 EV et à ce que l'objectif sert,
/// remis à 0 au toucher suivant et à la bascule.
@MainActor
final class ComposerCaptureExposureTests: XCTestCase {

    // MARK: - La loi

    func test_usable_clampsToTwoEV_andToTheLens() {
        XCTAssertEqual(ComposerCaptureExposure.usable(-8...8), -2...2)
        XCTAssertEqual(ComposerCaptureExposure.usable(-1.5...3), -1.5...2)
        XCTAssertNil(ComposerCaptureExposure.usable(0...0), "objectif sans biais : pas de soleil")
        XCTAssertNil(ComposerCaptureExposure.usable(0.5...2), "une plage qui exclut le neutre est refusée")
    }

    func test_bias_fingerUp_brightens_aboutOneEVPer100Points() {
        XCTAssertEqual(ComposerCaptureExposure.bias(from: 0, dragY: -100, range: -8...8), 1, accuracy: 0.001)
        XCTAssertEqual(ComposerCaptureExposure.bias(from: 0, dragY: 50, range: -8...8), -0.5, accuracy: 0.001)
        XCTAssertEqual(ComposerCaptureExposure.bias(from: 1, dragY: -50, range: -8...8), 1.5, accuracy: 0.001,
                       "le glissé part du biais déjà posé")
    }

    func test_bias_isBounded() {
        XCTAssertEqual(ComposerCaptureExposure.bias(from: 0, dragY: -1_000, range: -8...8), 2)
        XCTAssertEqual(ComposerCaptureExposure.bias(from: 0, dragY: 1_000, range: -8...8), -2)
        XCTAssertEqual(ComposerCaptureExposure.bias(from: 0, dragY: -1_000, range: -1...1), 1,
                       "l'objectif qui sert moins borne plus tôt")
        XCTAssertEqual(ComposerCaptureExposure.bias(from: 0, dragY: -100, range: 0...0), 0)
    }

    func test_bias_snapsToNeutral() {
        XCTAssertEqual(ComposerCaptureExposure.bias(from: 0, dragY: -5, range: -8...8), 0)
        XCTAssertEqual(ComposerCaptureExposure.bias(from: 1, dragY: 96, range: -8...8), 0)
    }

    func test_stepped_isAThirdOfEV_andBounded() {
        XCTAssertEqual(ComposerCaptureExposure.stepped(0, up: true, range: -8...8), 1.0 / 3, accuracy: 0.001)
        XCTAssertEqual(ComposerCaptureExposure.stepped(0, up: false, range: -8...8), -1.0 / 3, accuracy: 0.001)
        XCTAssertEqual(ComposerCaptureExposure.stepped(2, up: true, range: -8...8), 2)
        XCTAssertEqual(ComposerCaptureExposure.stepped(1.0 / 3, up: false, range: -8...8), 0)
    }

    func test_sun_risesWhenBrighter_andStaysOnScreen() {
        XCTAssertLessThan(ComposerCaptureExposure.sunOffsetY(1), 0)
        XCTAssertEqual(ComposerCaptureExposure.sunOffsetY(0), 0)
        XCTAssertGreaterThan(ComposerCaptureExposure.sunX(ringX: 100, ringDiameter: 72, width: 390), 100)
        XCTAssertLessThan(ComposerCaptureExposure.sunX(ringX: 370, ringDiameter: 72, width: 390), 370,
                          "près du bord droit, le soleil passe à gauche")
    }

    func test_markLifetime_givesTimeToReachTheSun() {
        XCTAssertEqual(ComposerCaptureExposure.markLifetime(adjustable: false, voiceOver: false),
                       ComposerCaptureFocus.markLifetime)
        XCTAssertGreaterThan(ComposerCaptureExposure.markLifetime(adjustable: true, voiceOver: false),
                             ComposerCaptureFocus.markLifetime)
        XCTAssertGreaterThan(ComposerCaptureExposure.markLifetime(adjustable: true, voiceOver: true),
                             ComposerCaptureExposure.markLifetime(adjustable: true, voiceOver: false))
    }

    func test_valueText_readsSignedEV() {
        let posix = Locale(identifier: "en_US_POSIX")
        XCTAssertEqual(ComposerCaptureExposure.valueText(0, locale: posix), "0 EV")
        XCTAssertEqual(ComposerCaptureExposure.valueText(0.7, locale: posix), "+0.7 EV")
        XCTAssertEqual(ComposerCaptureExposure.valueText(-1, locale: posix), "-1.0 EV")
        XCTAssertEqual(ComposerCaptureExposure.valueText(0.7, locale: Locale(identifier: "fr_FR")), "+0,7 EV")
    }

    // MARK: - Le câblage

    private func makeSUT(stage: ComposerSceneCameraStage = .armed) -> (ComposerCaptureSession, MockComposerCaptureCamera) {
        let camera = MockComposerCaptureCamera()
        return (ComposerCaptureSession(stage: stage, mode: .photo, controls: camera), camera)
    }

    func test_drag_sendsTheBiasToTheLens_fromTheDragStart() {
        let (session, camera) = makeSUT()
        session.dragExposure(translationY: -50)
        session.dragExposure(translationY: -100)
        XCTAssertEqual(camera.exposureBiasRequests.count, 2)
        XCTAssertEqual(camera.exposureBiasRequests.last ?? 0, 1, accuracy: 0.001)
        XCTAssertEqual(session.exposureBias, 1, accuracy: 0.001)

        session.endExposureDrag()
        session.dragExposure(translationY: -50)
        XCTAssertEqual(session.exposureBias, 1.5, accuracy: 0.001, "un nouveau glissé part du biais posé")
    }

    func test_drag_sameValue_doesNotHitTheLensAgain() {
        let (session, camera) = makeSUT()
        session.dragExposure(translationY: -1_000)
        session.dragExposure(translationY: -1_200)
        XCTAssertEqual(camera.exposureBiasRequests, [2])
    }

    func test_stepExposure_forVoiceOver() {
        let (session, camera) = makeSUT()
        session.stepExposure(up: true)
        XCTAssertEqual(camera.exposureBiasRequests.count, 1)
        XCTAssertEqual(session.exposureBias, 1.0 / 3, accuracy: 0.001)
    }

    func test_noSun_whenTheLensHasNoBias_orTheViewfinderIsOff() {
        let (session, camera) = makeSUT()
        camera.exposureBiasRange = 0...0
        XCTAssertFalse(session.offersExposure)
        session.dragExposure(translationY: -100)
        XCTAssertTrue(camera.exposureBiasRequests.isEmpty)

        let (eteint, _) = makeSUT(stage: .off)
        XCTAssertFalse(eteint.offersExposure)
    }

    func test_editing_offersNoSun() {
        let (session, camera) = makeSUT()
        session.phase = .editing(.photo)
        XCTAssertFalse(session.offersExposure, "en retouche, l'objectif se repose")
        session.stepExposure(up: true)
        XCTAssertTrue(camera.exposureBiasRequests.isEmpty)
    }

    func test_switch_resetsTheBias() {
        let (session, camera) = makeSUT()
        session.dragExposure(translationY: -100)
        session.flipCamera()
        camera.finishSwitch()
        XCTAssertEqual(session.exposureBias, 0)
        XCTAssertNil(session.exposureDragStart)
    }

    func test_forgetExposure_isWhatTheNextTapDoes() {
        let (session, _) = makeSUT()
        session.dragExposure(translationY: -100)
        session.forgetExposure()
        XCTAssertEqual(session.exposureBias, 0)
    }

    // MARK: - Les gardes de source

    private static func code(_ chemin: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: racine.appendingPathComponent(chemin), encoding: .utf8)
    }

    func test_source_aimResetsTheBias_andTheTapForgetsIt() throws {
        let visee = try Self.code("Meeshy/Features/Main/Components/CameraFocusControl.swift")
        XCTAssertTrue(visee.contains("apply(plan, to: device, resettingBias: true)"),
                      "le toucher suivant rend le biais de l'objectif à 0")
        XCTAssertTrue(visee.contains("device.setExposureTargetBias(0, completionHandler: nil)"))
        let toucher = try Self.code("Meeshy/Features/Composer/ComposerCaptureSession+Tap.swift")
        XCTAssertTrue(toucher.contains("forgetExposure()"), "la machine oublie le biais avec l'objectif")
    }

    func test_source_lensWritesTheBiasUnderLock() throws {
        let objectif = try Self.code("Meeshy/Features/Main/Components/CameraModel+Lens.swift")
        XCTAssertTrue(objectif.contains("func setExposureBias(_ ev: Float)"))
        XCTAssertTrue(objectif.contains("device.setExposureTargetBias(borne, completionHandler: nil)"))
    }

    func test_source_sunHasItsOwnGesture_besideTheRing() throws {
        let vues = try Self.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(vues.contains("exposureSun(beside: focusMark"))
        XCTAssertTrue(vues.contains(".highPriorityGesture("),
                      "le glissé du soleil ne doit pas zoomer ni ranger le viseur")
        XCTAssertTrue(vues.contains("session.stepExposure(up: true)"), "VoiceOver règle aussi l'exposition")
    }
}
