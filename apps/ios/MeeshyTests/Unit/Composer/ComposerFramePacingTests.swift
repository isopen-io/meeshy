import XCTest
import CoreImage
@testable import Meeshy

/// **Un passage par image, rien quand rien ne change** (#9349, spec § 5).
@MainActor
final class ComposerFramePacingTests: XCTestCase {

    func test_admit_firstFrame_isDrawn() {
        var cadence = ComposerFramePacer(fps: 30)
        XCTAssertTrue(cadence.admit(presentedAt: 10))
    }

    func test_admit_zeroFPS_neverDraws() {
        XCTAssertEqual(Self.drawn(fps: 0), 0)
    }

    /// Au palier fair, une caméra à 30 i/s donne 24 images, pas 15 : l'écart
    /// depuis le dernier dessin ne laissait passer qu'une trame sur deux.
    func test_admit_fairTierOnA30FPSCamera_draws24PerSecond() {
        XCTAssertEqual(Double(Self.drawn(fps: 24)), 24, accuracy: 1)
    }

    func test_admit_seriousTierOnA30FPSCamera_draws15PerSecond_oneInTwo() {
        XCTAssertEqual(Double(Self.drawn(fps: 15)), 15, accuracy: 1)
        var cadence = ComposerFramePacer(fps: 15)
        XCTAssertTrue(cadence.admit(presentedAt: 10))
        XCTAssertFalse(cadence.admit(presentedAt: 10 + 1.0 / 30), "30 i/s offerts, 15 permis : une sur deux")
        XCTAssertTrue(cadence.admit(presentedAt: 10 + 2.0 / 30))
    }

    /// Au palier nominal, une gigue de quelques ms ne fait perdre aucune image.
    func test_admit_nominalTierWithFourMsJitter_losesNoFrame() {
        let gigue: [TimeInterval] = [0, 0.004, -0.004, 0.003, -0.002, -0.004, 0.004, 0.001, -0.003]
        XCTAssertEqual(Self.drawn(fps: 30, jitter: gigue), 30)
    }

    /// Une caméra plus lente que le budget (basse lumière) : rien n'est jeté.
    func test_admit_cameraSlowerThanTheBudget_drawsEveryFrame() {
        XCTAssertEqual(Self.drawn(fps: 30, camera: 24, frames: 24), 24)
    }

    /// Après une pause, l'échéance en retard se recale sur la trame qui
    /// reprend : ni rafale de rattrapage, ni cadence perdue.
    func test_admit_afterAPause_recalibratesWithoutABurst() {
        var cadence = ComposerFramePacer(fps: 15)
        let avant = (0..<15).map { cadence.admit(presentedAt: 10 + Double($0) / 30) }
        XCTAssertEqual(avant.filter { $0 }.count, 8)
        let reprise = (0..<30).map { cadence.admit(presentedAt: 13 + Double($0) / 30) }
        XCTAssertTrue(reprise[0], "la première trame après la pause se montre")
        XCTAssertFalse(reprise[1], "aucune rafale pour rattraper la pause")
        XCTAssertEqual(Double(reprise.filter { $0 }.count), 15, accuracy: 1)
    }

    /// Le palier change : la nouvelle cadence s'applique ; le même palier
    /// redit à chaque rendu ne remet pas l'échéance à zéro.
    func test_gate_sameFPS_keepsTheDeadline_newFPS_appliesIt() {
        let porte = ComposerFrameGate(fps: 15)
        XCTAssertTrue(porte.admit(presentedAt: 10))
        porte.setFPS(15)
        XCTAssertFalse(porte.admit(presentedAt: 10 + 1.0 / 30), "le même palier garde l'échéance")
        porte.setFPS(30)
        XCTAssertEqual(porte.fps, 30)
        XCTAssertTrue(porte.admit(presentedAt: 10 + 2.0 / 30))
        XCTAssertTrue(porte.admit(presentedAt: 10 + 3.0 / 30))
    }

    func test_mirrorsSystemLayer_untilMetalHasPresentedAFrame() {
        XCTAssertTrue(ComposerCaptureSurfaceRule.mirrorsSystemLayer(paintsWithMetal: false, metalHasFrame: false))
        XCTAssertTrue(ComposerCaptureSurfaceRule.mirrorsSystemLayer(paintsWithMetal: true, metalHasFrame: false),
                      "la vue Metal n'a rien présenté : l'aperçu système reste, jamais un écran noir")
        XCTAssertFalse(ComposerCaptureSurfaceRule.mirrorsSystemLayer(paintsWithMetal: true, metalHasFrame: true),
                       "la vue Metal peint : un passage par image, jamais deux")
        XCTAssertTrue(ComposerCaptureSurfaceRule.mirrorsSystemLayer(paintsWithMetal: false, metalHasFrame: true))
    }

    func test_paintsWithMetal_onlyWithALook_andNeverInCriticalState() {
        let nominal = ComposerThermalBudget.budget(for: .nominal)
        let critique = ComposerThermalBudget.budget(for: .critical)
        XCTAssertFalse(ComposerCaptureSurfaceRule.paintsWithMetal(look: ComposerPhotoLook(), budget: nominal, fixture: false),
                       "sans effet : la couche système seule, aucun rendu")
        XCTAssertTrue(ComposerCaptureSurfaceRule.paintsWithMetal(look: ComposerPhotoLook(filter: .warm), budget: nominal, fixture: false))
        XCTAssertFalse(ComposerCaptureSurfaceRule.paintsWithMetal(look: ComposerPhotoLook(filter: .warm), budget: critique, fixture: false))
        XCTAssertTrue(ComposerCaptureSurfaceRule.showsThermalNotice(look: ComposerPhotoLook(filter: .warm), budget: critique))
        XCTAssertFalse(ComposerCaptureSurfaceRule.showsThermalNotice(look: ComposerPhotoLook(), budget: critique))
    }

    func test_feed_announcesEachFrameToItsHandler() {
        let flux = ComposerCameraFeed()
        let annonce = expectation(description: "trame annoncée")
        flux.setFrameHandler({ instant in
            XCTAssertEqual(instant, 42)
            annonce.fulfill()
        }, for: ObjectIdentifier(self))
        flux.isActive = true
        flux.announceForTesting(at: 42)
        wait(for: [annonce], timeout: 1)
    }

    func test_feed_servesThePreviewAndTheStrip_removingOneKeepsTheOther() {
        let flux = ComposerCameraFeed()
        let apercu = NSObject(), bande = NSObject()
        let pourLApercu = expectation(description: "l'aperçu est prévenu")
        let pourLaBande = expectation(description: "la bande est prévenue")
        pourLaBande.expectedFulfillmentCount = 2
        flux.setFrameHandler({ _ in pourLApercu.fulfill() }, for: ObjectIdentifier(apercu))
        flux.setFrameHandler({ _ in pourLaBande.fulfill() }, for: ObjectIdentifier(bande))
        flux.isActive = true
        flux.announceForTesting()
        flux.setFrameHandler(nil, for: ObjectIdentifier(apercu))
        flux.announceForTesting()
        wait(for: [pourLApercu, pourLaBande], timeout: 1)
    }

    func test_preview_neverStacksTheSystemLayerUnderMetal() throws {
        let apercu = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("mirrorsFrames: ComposerCaptureSurfaceRule.mirrorsSystemLayer("),
                      "avec effet, la couche système est détachée : un passage par image, jamais deux")
        XCTAssertTrue(apercu.contains("onFirstFrame: { metalHasFrame = true }"),
                      "la couche système ne se détache qu'à la première image Metal")
        XCTAssertTrue(apercu.contains("argument: ComposerCaptureCopy.thermalNotice"),
                      "la mention thermique est annoncée à VoiceOver quand elle paraît")
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift")
        XCTAssertTrue(surface.contains("view.enableSetNeedsDisplay = true"), "la vue ne dessine qu'à l'arrivée d'une trame")
        XCTAssertTrue(surface.contains("view.isPaused = true"))
        XCTAssertFalse(surface.contains("CIContext("), "un seul CIContext, partagé")
    }

    private static func drawn(fps: Int, camera: Double = 30, frames: Int = 30,
                              jitter: [TimeInterval] = [0]) -> Int {
        var cadence = ComposerFramePacer(fps: fps)
        return (0..<frames).map { trame in
            cadence.admit(presentedAt: 10 + Double(trame) / camera + jitter[trame % jitter.count])
        }.filter { $0 }.count
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
