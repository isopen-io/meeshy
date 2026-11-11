import XCTest
@testable import Meeshy

#if DEBUG
/// **Une tenue levée avant que l'enregistrement ne parte ne laisse rien tourner** (#17469).
///
/// Entre l'appui long reconnu et le premier segment, la prise attend le micro (ajouté à une
/// session armée en photo) puis la session d'enregistrement. Une levée pendant cette attente
/// trouvait un arrêt sans rien à arrêter ; le segment partait ensuite, et personne ne
/// l'arrêtait plus : la tenue suivante attendait une prise qui ne finissait jamais.
@MainActor
final class ComposerCaptureRecordingStartTests: XCTestCase {

    private func makeSession() -> (session: ComposerCaptureSession, camera: CameraModel) {
        let camera = CameraModel(fixture: ComposerCaptureFixtureDriver())
        let session = ComposerCaptureSession(camera: camera, gallery: MockComposerGallery())
        session.arm(mode: .video)
        return (session, camera)
    }

    private func settle() async {
        for _ in 0..<50 { await Task.yield() }
    }

    func test_startFilming_releasedBeforeTheRecordingStarts_recordsNothing() async {
        let (session, camera) = makeSession()
        session.startFilming()
        session.closeTake()
        await settle()
        XCTAssertFalse(camera.isRecordingVideo, "une levée avant le départ ne laisse aucun enregistrement orphelin")
        XCTAssertNil(camera.recordingId, "la tenue suivante n'attend pas une prise fantôme")
        XCTAssertEqual(session.stage, .armed)
    }

    func test_startFilming_stillHeld_recordsAndBindsTheTake() async {
        let (session, camera) = makeSession()
        session.startFilming()
        await settle()
        XCTAssertTrue(camera.isRecordingVideo)
        XCTAssertNotNil(camera.recordingId)
        XCTAssertEqual(session.stage, .recording)
    }

    func test_startRecordingWhileWanted_notWantedAnymore_startsNothing() async {
        let camera = CameraModel(fixture: ComposerCaptureFixtureDriver())
        await camera.startRecording(whileWanted: { false })
        XCTAssertFalse(camera.isRecordingVideo)
        XCTAssertNil(camera.recordingId)
    }

    /// La session d'enregistrement est posée AVANT le premier segment : changer la session audio
    /// sous un fichier qui s'ouvre en retarde les premières images.
    func test_startRecordingWhileWanted_setsTheRecordingSessionBeforeTheSegment() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let code = AppSourceGuard.stripComments(try String(contentsOf: racine.appendingPathComponent(
            "Meeshy/Features/Main/Components/CameraModel+Video.swift"), encoding: .utf8))
        let debut = try XCTUnwrap(code.range(of: "func startRecording(whileWanted"))
        let pose = try XCTUnwrap(code.range(of: "await recordingSession.begin(.video)", range: debut.upperBound..<code.endIndex))
        let ouverture = try XCTUnwrap(code.range(of: "openRecording()", range: debut.upperBound..<code.endIndex))
        XCTAssertLessThan(pose.lowerBound, ouverture.lowerBound)
        let machine = AppSourceGuard.stripComments(try String(contentsOf: racine.appendingPathComponent(
            "Meeshy/Features/Composer/ComposerCaptureSession.swift"), encoding: .utf8))
        XCTAssertTrue(machine.contains("await camera.startRecording(whileWanted:"),
                      "la tenue n'ouvre son segment que si elle est encore tenue")
    }
}
#endif
