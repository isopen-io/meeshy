import AVFoundation
import XCTest
@testable import Meeshy

/// **La bascule qui morphe, l'entrée prête, le cadenas qui se scelle** (#9753,
/// directive complémentaire du porteur 2026-10-09, points 6 et 7).
@MainActor
final class ComposerCaptureMotionTests: XCTestCase {

    // MARK: - (6) La barre des zooms morphe pendant la bascule

    func test_zoomBar_morphsWhileTheCameraSwitches_thenOpensOnTheNewPresets() {
        XCTAssertEqual(ComposerZoomBarMorph.phase(switching: false, presets: [0.5, 1, 2], factor: 1),
                       .presets([0.5, 1, 2]))
        XCTAssertEqual(ComposerZoomBarMorph.phase(switching: true, presets: [0.5, 1, 2], factor: 1), .morphing,
                       "les pastilles se resserrent pendant la bascule")
        XCTAssertEqual(ComposerZoomBarMorph.phase(switching: true, presets: [], factor: 1), .morphing,
                       "même vers un objectif sans pastille, l'attente se voit")
        XCTAssertEqual(ComposerZoomBarMorph.phase(switching: false, presets: [1, 2], factor: 1), .presets([1, 2]),
                       "le nouvel objectif rouvre la capsule sur SES pastilles")
        XCTAssertEqual(ComposerZoomBarMorph.phase(switching: false, presets: [], factor: 1), .hidden)
        XCTAssertEqual(ComposerZoomBarMorph.phase(switching: false, presets: [], factor: 1.6), .chip)
    }

    func test_theBottomRow_mountsTheMorphingBar_fedByTheSwitch() throws {
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("ComposerCaptureZoomBar("))
        XCTAssertTrue(bas.contains("switching: capture.switchingCamera"))
        let session = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(session.contains("switchingCamera: camera.isSwitchingCamera"),
                      "le morphe suit la bascule, pas la finalisation d'une prise")
        let barre = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureMotion.swift")
        XCTAssertTrue(barre.contains("matchedGeometryEffect(id: \"zoom.bar\""), "une seule forme qui se transforme")
    }

    // MARK: - (6) La bascule ne recrée plus l'entrée de l'objectif

    private final class FakeInput {}

    func test_preparedInputs_serveOnce_andKeepTheRemovedInputForTheWayBack() {
        let stock = ComposerCameraPreparedInputs<FakeInput>()
        var creations = 0
        stock.prepare(.front) { creations += 1; return FakeInput() }
        stock.prepare(.front) { creations += 1; return FakeInput() }
        XCTAssertEqual(creations, 1, "déjà prête : rien ne se recrée")
        XCTAssertNotNil(stock.take(.front))
        XCTAssertNil(stock.take(.front), "une entrée ne sert qu'une fois")

        let arriere = FakeInput()
        stock.keep(after: .swapped, removed: arriere, at: .back)
        XCTAssertTrue(stock.take(.back) === arriere, "l'aller-retour reprend l'entrée retirée")
        stock.keep(after: .kept, removed: FakeInput(), at: .back)
        XCTAssertFalse(stock.isPrepared(.back), "une bascule refusée ne garde rien : l'ancienne est en place")
    }

    func test_theCameraModel_switchesWithThePreparedInput_andMeasuresTheSwitch() throws {
        let modele = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(modele.contains("prepared.take(position) ?? videoInput(position: position)"))
        XCTAssertTrue(modele.contains("prepared.keep(after: issue, removed: ancienne"))
        XCTAssertTrue(modele.contains("self?.preparedInputs.prepare(.front)"), "l'objectif avant se prépare au repos")
        XCTAssertTrue(modele.contains("ComposerCameraSwitchTiming.milliseconds("), "le temps de bascule se relève")
        XCTAssertEqual(ComposerCameraSwitchTiming.milliseconds(from: 10, to: 10.2345), 235)
    }

    // MARK: - (7) Le cadenas se ferme, élastique, avant de partir

    func test_lockSeal_sealsOnlyALockTheAuthorSaw_thenLeaves() {
        var sceau = ComposerLockSeal()
        sceau.lockChanged(from: false, to: true, wasShowing: true)
        XCTAssertTrue(sceau.sealing, "le cadenas se ferme sous les yeux")
        XCTAssertTrue(ComposerLockSeal.showsTrack(showsLock: false, seal: sceau),
                      "il reste à l'écran le temps de se sceller, AVANT de disparaître")
        let premier = sceau.generation
        sceau.finish(premier)
        XCTAssertFalse(sceau.sealing)
        XCTAssertFalse(ComposerLockSeal.showsTrack(showsLock: false, seal: sceau), "puis il part")

        var muet = ComposerLockSeal()
        muet.lockChanged(from: false, to: true, wasShowing: false)
        XCTAssertFalse(muet.sealing, "un verrou posé sans cadenas affiché n'a rien à fermer")
    }

    func test_lockSeal_aStaleDeadline_doesNotCutANewerSeal_andUnlockingClearsIt() {
        var sceau = ComposerLockSeal()
        sceau.lockChanged(from: false, to: true, wasShowing: true)
        let ancien = sceau.generation
        sceau.lockChanged(from: true, to: false, wasShowing: false)
        XCTAssertFalse(sceau.sealing, "la prise close emporte le sceau")
        sceau.lockChanged(from: false, to: true, wasShowing: true)
        sceau.finish(ancien)
        XCTAssertTrue(sceau.sealing, "l'échéance d'un ancien sceau est périmée")
    }

    func test_lockSeal_isElastic_andCalmUnderReduceMotion() {
        XCTAssertGreaterThan(ComposerLockSeal.glyphScale(progress: 1, sealed: true, reduceMotion: false),
                             ComposerLockSeal.glyphScale(progress: 1, sealed: false, reduceMotion: false),
                             "il bondit en se fermant")
        XCTAssertEqual(ComposerLockSeal.glyphScale(progress: 1, sealed: true, reduceMotion: true), 1, "sans rebond")
        XCTAssertLessThan(ComposerLockSeal.holdDuration(reduceMotion: true), ComposerLockSeal.holdDuration(reduceMotion: false))
        let piste = try? ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureLockTrack.swift")
        XCTAssertTrue(piste?.contains("ComposerLockSeal.animation(reduceMotion: reduceMotion), value: sealed") == true)
        let bas = try? ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas?.contains("lockSeal.lockChanged(from: avant, to: apres") == true)
    }
}
