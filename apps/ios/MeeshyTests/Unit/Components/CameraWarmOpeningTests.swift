import XCTest
import AVFoundation
@testable import Meeshy

/// **La caméra s'arme vite à la réouverture, sans micro pour une photo** (#16504).
/// Le simulateur n'a pas de caméra : ces témoins gardent la conduite, aucun ne
/// prouve une accélération.
@MainActor
final class CameraWarmOpeningTests: XCTestCase {

    // MARK: - Factories

    private final class MockCamera: CameraWarmable {
        var isIdle = true
        var stopCallCount = 0
        var rewindCallCount = 0
        func stopIfRunning() { stopCallCount += 1 }
        func rewindForNewHolder() { rewindCallCount += 1 }
    }

    private func makeKeeper() -> (keeper: CameraWarmKeeper<MockCamera>, made: () -> Int) {
        var fabriquees = 0
        let keeper = CameraWarmKeeper<MockCamera> {
            fabriquees += 1
            return MockCamera()
        }
        return (keeper, { fabriquees })
    }

    private func warmed(_ keeper: CameraWarmKeeper<MockCamera>) async {
        for _ in 0..<200 where !keeper.hasWarmCamera { await Task.yield() }
    }

    private func source(_ chemin: String) throws -> String {
        try String(contentsOf: Self.racine.appendingPathComponent(chemin), encoding: .utf8)
    }

    private static let racine = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    // MARK: - La session chaude

    func test_lease_afterTheHolderLeft_reusesTheSameCamera() async {
        let (keeper, fabriquees) = makeKeeper()
        var pret: CameraWarmLease<MockCamera>? = keeper.lease()
        let premiere = pret?.camera
        pret = nil
        await warmed(keeper)
        let seconde = keeper.lease()
        XCTAssertTrue(seconde.camera === premiere, "la réouverture ne reconfigure pas la caméra")
        XCTAssertEqual(fabriquees(), 1)
    }

    func test_lease_whileAnotherHolderIsAlive_neverSharesTheCamera() {
        let (keeper, _) = makeKeeper()
        let premier = keeper.lease()
        let second = keeper.lease()
        XCTAssertFalse(premier.camera === second.camera, "une caméra n'a qu'un seul viseur")
    }

    func test_lease_handedBack_stopsTheCamera_andRewindsItForTheNextHolder() async {
        let (keeper, _) = makeKeeper()
        var pret: CameraWarmLease<MockCamera>? = keeper.lease()
        let camera = pret?.camera
        pret = nil
        await warmed(keeper)
        XCTAssertEqual(camera?.stopCallCount, 1, "un viseur parti sans s'arrêter ne laisse jamais l'objectif allumé")
        _ = keeper.lease()
        XCTAssertEqual(camera?.rewindCallCount, 1)
    }

    func test_lease_handedBackWhileBusy_isNotKept() async {
        let (keeper, _) = makeKeeper()
        var pret: CameraWarmLease<MockCamera>? = keeper.lease()
        let camera = pret?.camera
        camera?.isIdle = false
        pret = nil
        for _ in 0..<200 where camera?.stopCallCount == 0 { await Task.yield() }
        XCTAssertEqual(camera?.stopCallCount, 1)
        XCTAssertFalse(keeper.hasWarmCamera, "une prise en vol ne passe pas au viseur suivant")
    }

    func test_dropWarmCamera_forgetsTheIdleCamera() async {
        let (keeper, fabriquees) = makeKeeper()
        var pret: CameraWarmLease<MockCamera>? = keeper.lease()
        pret = nil
        await warmed(keeper)
        keeper.dropWarmCamera()
        XCTAssertFalse(keeper.hasWarmCamera)
        _ = keeper.lease()
        XCTAssertEqual(fabriquees(), 2, "sous pression mémoire, la session oisive ne reste pas")
        _ = pret
    }

    #if DEBUG
    func test_warmSession_releasedThenReopened_keepsItsCameraWithoutItsLastTake() async {
        let keeper = CameraWarmKeeper<CameraModel> { CameraModel(fixture: ComposerCaptureFixtureDriver()) }
        var capture: ComposerCaptureSession? = ComposerWarmCapture.session(stage: .armed, mode: .photo, keeper: keeper)
        let camera = capture?.camera
        camera?.takePhoto(flash: .off)
        XCTAssertNotNil(camera?.capturedPhotoId)
        capture = nil
        for _ in 0..<200 where !keeper.hasWarmCamera { await Task.yield() }
        let suivante = ComposerWarmCapture.session(stage: .armed, mode: .photo, keeper: keeper)
        XCTAssertTrue(suivante.camera === camera, "la session libérée rend son objectif")
        XCTAssertNil(suivante.camera.capturedPhotoId, "le viseur suivant ne reçoit pas la prise du précédent")
        XCTAssertNil(suivante.camera.capturedPhoto)
    }

    func test_rewindForNewHolder_returnsToTheBackLens() {
        let camera = CameraModel(fixture: ComposerCaptureFixtureDriver())
        camera.switchCamera()
        XCTAssertEqual(camera.currentPosition, .front)
        camera.rewindForNewHolder()
        XCTAssertEqual(camera.currentPosition, .back, "un viseur neuf s'ouvre toujours sur l'objectif arrière")
    }

    func test_isIdle_whileTakingAPhoto_isFalse() {
        let camera = CameraModel(fixture: ComposerCaptureFixtureDriver())
        XCTAssertTrue(camera.isIdle)
        camera.isTakingPhoto = true
        XCTAssertFalse(camera.isIdle)
    }
    #endif

    func test_viewfinderAndComposer_openOnTheWarmCamera() throws {
        XCTAssertTrue(try source("Meeshy/Features/Composer/ComposerViewfinder.swift").contains("ComposerWarmCapture.session("))
        XCTAssertTrue(try source("Meeshy/Features/Composer/MeeshyComposerHost.swift").contains("ComposerWarmCapture.session("))
    }

    // MARK: - La caméra gardée n'en fait qu'à son viseur

    private final class StubRunning: ComposerCaptureRunning {
        var isRunning = false
        func startRunning() {}
        func stopRunning() {}
    }

    /// `session.isRunning` retombe tant que la file n'a pas démarré : c'est le
    /// VŒU qui dit si un objectif va s'allumer sans personne pour le regarder.
    func test_stopIfRunning_withAStartStillQueued_cancelsIt() {
        let camera = CameraModel()
        camera.sessionQueue.setRunning(true, StubRunning())
        camera.stopIfRunning()
        XCTAssertFalse(camera.sessionQueue.wantsToRun)
    }

    func test_opening_stoppedBeforeThePermissionAnswers_neverStartsTheSession() {
        let camera = CameraModel()
        let ouverture = camera.beginOpening()
        XCTAssertTrue(camera.openingIsCurrent(ouverture))
        camera.stop()
        XCTAssertFalse(camera.openingIsCurrent(ouverture), "fermé, le viseur n'allume plus l'objectif")
    }

    func test_opening_handedBackBeforeThePermissionAnswers_neverStartsTheSession() {
        let camera = CameraModel()
        let ouverture = camera.beginOpening()
        camera.rewindForNewHolder()
        XCTAssertFalse(camera.openingIsCurrent(ouverture), "gardée, la caméra n'a plus de viseur à servir")
    }

    /// Un appel posé sur l'objectif arrière écrit `activeFormat` sur l'appareil
    /// partagé : la session gardée passe en `.inputPriority` et y resterait.
    func test_reclaimLens_afterAForeignFormat_returnsToTheCapturePreset() {
        let camera = CameraModel()
        camera.session.sessionPreset = .inputPriority
        camera.reclaimLensAfterHandBack()
        camera.sessionQueue.drain()
        XCTAssertEqual(camera.session.sessionPreset, .high)
    }

    func test_setup_reclaimsTheLensBeforeStarting_onlyAfterAHandBack() throws {
        let code = try source("Meeshy/Features/Main/Components/CameraModel.swift")
        let debut = try XCTUnwrap(code.range(of: "private func setupSession("))
        let fin = try XCTUnwrap(code.range(of: "private func prepareSession(", range: debut.upperBound..<code.endIndex))
        let armement = code[debut.upperBound..<fin.lowerBound]
        let reprise = try XCTUnwrap(armement.range(of: "reclaimLensAfterHandBack()"))
        let lancement = try XCTUnwrap(armement.range(of: "setRunning(true"))
        XCTAssertLessThan(reprise.lowerBound, lancement.lowerBound, "ni zoom ni format d'un autre propriétaire au premier cadre")
    }

    // MARK: - Le micro

    func test_armsAtSetup_forAPhoto_neverArmsTheMicrophone() {
        XCTAssertFalse(CameraAudioArming.armsAtSetup(microphone: .authorized, otherAudioPlaying: false, filming: false),
                       "une photo n'allume ni le micro, ni son voyant, ni la session audio")
    }

    func test_armsAtSetup_forAFilmingOpening_armsTheAuthorizedMicrophone() {
        XCTAssertTrue(CameraAudioArming.armsAtSetup(microphone: .authorized, otherAudioPlaying: false, filming: true))
    }

    func test_arm_tellsTheCameraWhetherItFilms() throws {
        let code = try source("Meeshy/Features/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(code.contains("camera.configure(filming: mode != .photo)"))
        XCTAssertTrue(try source("Meeshy/Features/Composer/ComposerViewfinder.swift")
            .contains("camera.configure(filming: initialMode == .video)"))
    }

    // MARK: - La configuration initiale

    func test_initialConfiguration_adoptsThePhotoPlanInsideItsOwnTransaction() throws {
        let code = try source("Meeshy/Features/Main/Components/CameraModel.swift")
        let debut = try XCTUnwrap(code.range(of: "private func prepareSession("))
        let ouvre = try XCTUnwrap(code.range(of: "self.session.beginConfiguration()", range: debut.upperBound..<code.endIndex))
        let ferme = try XCTUnwrap(code.range(of: "self.session.commitConfiguration()", range: ouvre.upperBound..<code.endIndex))
        XCTAssertTrue(code[ouvre.upperBound..<ferme.lowerBound].contains("photoPlan"),
                      "le plan de photo se pose dans la transaction initiale, pas dans une seconde")
    }

    func test_afterCommit_aPlanAlreadyAdopted_opensNoSecondTransaction() {
        var ouvertes = 0
        CameraPhotoTuning.confirm(adopted: true) { ouvertes += 1 }
        XCTAssertEqual(ouvertes, 0)
    }

    func test_afterCommit_aPlanTheOutputDidNotKeep_isAdoptedInOneTransaction() {
        var ouvertes = 0
        CameraPhotoTuning.confirm(adopted: false) { ouvertes += 1 }
        XCTAssertEqual(ouvertes, 1, "si la sortie n'a su répondre qu'après le commit, le plan passe quand même")
    }

    func test_frontLens_isPreparedAfterTheSessionStarts() throws {
        let code = try source("Meeshy/Features/Main/Components/CameraModel.swift")
        let debut = try XCTUnwrap(code.range(of: "private func setupSession("))
        let fin = try XCTUnwrap(code.range(of: "private func prepareSession(", range: debut.upperBound..<code.endIndex))
        let armement = code[debut.upperBound..<fin.lowerBound]
        let lancement = try XCTUnwrap(armement.range(of: "setRunning(true"))
        let avant = try XCTUnwrap(armement.range(of: "prepareFrontLens()"), "l'autre objectif attend le lancement")
        XCTAssertLessThan(lancement.lowerBound, avant.lowerBound)
    }

    // MARK: - Les mesures

    func test_shutterClock_reportsOnceInMilliseconds() {
        let horloge = ComposerShutterClock()
        horloge.start(at: 10)
        XCTAssertEqual(horloge.report(at: 10.25), 250)
        XCTAssertNil(horloge.report(at: 11), "une seule mesure par toucher")
    }

    func test_shutterClock_withoutATouch_reportsNothing() {
        XCTAssertNil(ComposerShutterClock().report(at: 1))
    }

    func test_touchThenShutter_isMeasuredFromTheTouch() {
        let camera = CameraModel()
        camera.noteShutterPress()
        camera.noteShutterFired()
        XCTAssertNil(camera.shutterClock.report(), "le toucher a été mesuré par l'obturateur, la mesure est close")
        XCTAssertEqual(camera.lastShutterDelay != nil, true)
    }

    func test_openingAndShutter_carrySignposts() throws {
        XCTAssertTrue(try source("Meeshy/Features/Main/Components/ComposerCameraFirstFrameClock.swift")
            .contains("CameraSignposts.signposter.beginInterval(CameraSignposts.open"))
        XCTAssertTrue(try source("Meeshy/Features/Main/Components/ComposerShutterClock.swift")
            .contains("CameraSignposts.signposter.beginInterval(CameraSignposts.shutter"))
    }
}
