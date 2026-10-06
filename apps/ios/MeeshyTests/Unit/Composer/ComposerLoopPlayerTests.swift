import XCTest
import AVFoundation
import CoreImage
import ImageIO
@testable import Meeshy

/// **La vidéo en boucle, lue au tick, peinte par le peintre** (#9352, spec § 4.4).
@MainActor
final class ComposerLoopPlayerTests: XCTestCase {

    // MARK: - L'orientation que la piste déclare

    func test_orientation_cameraPortraitTransform_isRight() {
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 1080, ty: 0)), .right)
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: .identity), .up)
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: CGAffineTransform(a: -1, b: 0, c: 0, d: -1, tx: 0, ty: 0)), .down)
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: CGAffineTransform(a: 0, b: -1, c: 1, d: 0, tx: 0, ty: 1920)), .left)
    }

    func test_orientation_frontCameraMirroredTransforms_keepTheirMirror() {
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: CGAffineTransform(a: -1, b: 0, c: 0, d: 1, tx: 1920, ty: 0)), .upMirrored)
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: 1080)), .downMirrored)
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: CGAffineTransform(a: 0, b: 1, c: 1, d: 0, tx: 0, ty: 0)), .leftMirrored)
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: CGAffineTransform(a: 0, b: -1, c: -1, d: 0, tx: 1080, ty: 1920)), .rightMirrored)
    }

    /// Une rotation écrite par `cos` / `sin` n'est pas un entier exact.
    func test_orientation_rotationWithRoundingNoise_isStillRead() {
        let quartDeTour = CGAffineTransform(rotationAngle: .pi / 2)
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: quartDeTour), .right)
    }

    // MARK: - La cadence de l'édition

    func test_editFPS_followsTheTier_neverZero() {
        XCTAssertEqual(ComposerCaptureSurfaceRule.editFPS(ComposerThermalBudget.budget(for: .nominal)), 30)
        XCTAssertEqual(ComposerCaptureSurfaceRule.editFPS(ComposerThermalBudget.budget(for: .serious)), 15)
        XCTAssertGreaterThan(ComposerCaptureSurfaceRule.editFPS(ComposerThermalBudget.budget(for: .critical)), 0,
                             "la photo figée et la boucle se dessinent encore au palier critique, lentement")
    }

    // MARK: - `✓` ouvre la retouche

    func test_validateSegments_entersVideoEditing_withTheWholeClipAsRange() async throws {
        let lecteur = MockComposerLoopPlayer(duration: 4)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("seg_\(UUID().uuidString).mov")
        try Data([0]).write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        var livrees = 0
        session.onDeliver = { _ in livrees += 1 }
        session.collectSegment(url)
        session.validateSegments()
        await ComposerCaptureTakesTests.waitUntil { session.phase.isEditing }
        XCTAssertEqual(session.phase, .editing(.video(url)))
        XCTAssertEqual(session.trim, 0...4)
        XCTAssertEqual(lecteur.playCount, 1)
        XCTAssertEqual(lecteur.configuredFPS, 30, "la boucle suit le palier thermique, pas une horloge fixe")
        XCTAssertTrue(session.segments.isEmpty)
        XCTAssertFalse(session.isRenderingLook, "l'assemblage fini, plus rien n'attend")
        XCTAssertEqual(livrees, 0, "rien ne part avant « Terminé »")
        XCTAssertTrue(session.gestureContext.editing)
    }

    func test_validateSegments_withoutSegment_staysCapturing() {
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in MockComposerLoopPlayer(duration: 1) })
        session.validateSegments()
        XCTAssertEqual(session.phase, .capturing)
        XCTAssertFalse(session.isRenderingLook)
    }

    func test_beginEditingVideo_theLoopIsTheEditedSource_atItsUprightSize() async {
        let lecteur = MockComposerLoopPlayer(duration: 2)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        session.openFamily = .filters
        await session.beginEditing(video: Self.clip())
        XCTAssertTrue(session.editSource === lecteur, "le peintre lit la boucle")
        XCTAssertEqual(session.editExtent, CGRect(x: 0, y: 0, width: 1080, height: 1920),
                       "le cadrage connaît la vidéo avant sa première trame")
        XCTAssertEqual(session.framing, .identity)
        XCTAssertNil(session.openFamily, "la retouche s'ouvre bande repliée")
    }

    func test_beginEditingVideo_unreadableClip_deliversItRaw() async {
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in nil })
        var livrees: [URL] = []
        session.onDeliver = { resultat in
            if case .video(let url) = resultat { livrees.append(url) }
        }
        let url = Self.clip()
        await session.beginEditing(video: url)
        XCTAssertEqual(livrees, [url], "une vidéo qui ne se lit pas part telle quelle plutôt que d'être perdue")
        XCTAssertEqual(session.phase, .capturing)
        XCTAssertNil(session.loopPlayer)
    }

    func test_beginEditingVideo_viewfinderClosedWhileLoading_opensNothing() async {
        let lecteur = MockComposerLoopPlayer(duration: 2)
        let porte = ComposerLoopPlayerTestsDoor()
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in
            porte.session?.disarm()
            return lecteur
        })
        porte.session = session
        var livrees = 0
        session.onDeliver = { _ in livrees += 1 }
        await session.beginEditing(video: Self.clip())
        XCTAssertEqual(session.phase, .capturing, "un viseur fermé pendant le chargement ne rouvre pas une retouche")
        XCTAssertNil(session.loopPlayer)
        XCTAssertEqual(lecteur.playCount, 0)
        XCTAssertEqual(livrees, 0)
    }

    // MARK: - La boucle s'arrête avec la retouche

    func test_cancelEditingVideo_stopsTheLoop() async throws {
        let lecteur = MockComposerLoopPlayer(duration: 2)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        session.cancelEditing()
        XCTAssertEqual(lecteur.stopCount, 1)
        XCTAssertNil(session.loopPlayer)
        XCTAssertNil(session.trim)
        XCTAssertNil(session.editSource)
        XCTAssertEqual(session.phase, .capturing)
    }

    func test_disarm_whileEditingVideo_stopsTheLoop() async {
        let lecteur = MockComposerLoopPlayer(duration: 2)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        session.disarm()
        XCTAssertEqual(lecteur.stopCount, 1, "un viseur fermé ne laisse aucune boucle tourner")
        XCTAssertNil(session.loopPlayer)
    }

    func test_applyThermal_whileLooping_slowsTheLoopToTheTier() async {
        let lecteur = MockComposerLoopPlayer(duration: 2)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        session.applyThermal(.serious)
        XCTAssertEqual(lecteur.configuredFPS, 15)
        session.applyThermal(.critical)
        XCTAssertEqual(lecteur.configuredFPS, ComposerCaptureSurfaceRule.editFPS(ComposerThermalBudget.budget(for: .critical)))
    }

    // MARK: - Le lecteur réel, sur le film de recette

    #if DEBUG
    func test_loopPlayer_onTheFixtureMovie_servesFrames() async throws {
        let film = await ComposerCaptureFixture.movie()
        let url = try XCTUnwrap(film)
        let charge = await ComposerLoopPlayer.load(url: url)
        let lecteur = try XCTUnwrap(charge)
        XCTAssertEqual(lecteur.duration, 3, accuracy: 0.2)
        XCTAssertEqual(lecteur.uprightSize, CGSize(width: 1080, height: 1920))
        let trame = expectation(description: "le lecteur prévient à chaque trame")
        trame.assertForOverFulfill = false
        lecteur.setFrameHandler({ _ in trame.fulfill() }, for: ObjectIdentifier(self))
        lecteur.play()
        await fulfillment(of: [trame], timeout: 5)
        XCTAssertEqual(lecteur.latestImage()?.extent.size, CGSize(width: 1080, height: 1920),
                       "la trame sort debout, à la taille que la piste déclare")
        lecteur.setFrameHandler(nil, for: ObjectIdentifier(self))
        lecteur.setRange(0.5...1.5)
        lecteur.setRange(2...2)
        lecteur.stop()
    }

    func test_loopPlayer_onAFileThatIsNoMovie_loadsNothing() async {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("vide_\(UUID().uuidString).mov")
        try? Data([0]).write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let charge = await ComposerLoopPlayer.load(url: url)
        XCTAssertNil(charge)
    }
    #endif

    private static func clip() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("clip_\(UUID().uuidString).mov")
    }
}

/// La session que la fabrique d'un témoin referme pendant le chargement.
@MainActor
final class ComposerLoopPlayerTestsDoor {
    weak var session: ComposerCaptureSession?

    nonisolated deinit {}

    init() {}
}

/// Isolé MainActor comme les membres `@MainActor` du protocole qu'il double (la
/// cible de tests est `nonisolated` par défaut).
@MainActor
final class MockComposerLoopPlayer: ComposerLoopPlayerProviding, @unchecked Sendable {
    let duration: TimeInterval
    let uprightSize = CGSize(width: 1080, height: 1920)
    nonisolated var declaredSpace: CGColorSpace? { nil }
    private(set) var configuredFPS: Int?
    private(set) var playCount = 0
    private(set) var stopCount = 0
    private(set) var ranges: [ClosedRange<TimeInterval>] = []
    private(set) var seeks: [TimeInterval] = []
    var currentTime: TimeInterval = 0

    nonisolated deinit {}

    init(duration: TimeInterval) { self.duration = duration }

    nonisolated func latestImage() -> CIImage? {
        CIImage(color: .gray).cropped(to: CGRect(origin: .zero, size: uprightSize))
    }

    nonisolated func setFrameHandler(_ handler: (@Sendable (_ presentedAt: TimeInterval) -> Void)?,
                                     for owner: ObjectIdentifier) {}

    func configure(fps: Int, declaredSpace: CGColorSpace?) { configuredFPS = fps }
    func play() { playCount += 1 }
    func stop() { stopCount += 1 }
    func setRange(_ range: ClosedRange<TimeInterval>) { ranges.append(range) }
    func seek(to time: TimeInterval) { seeks.append(time) }
}
