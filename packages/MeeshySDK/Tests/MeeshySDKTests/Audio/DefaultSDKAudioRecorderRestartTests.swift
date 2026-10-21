import XCTest

/// `DefaultSDKAudioRecorder.startRecording()` relancé sans arrêt (double appui,
/// relance après le prompt micro) écrasait `recorder` et `timer` : l'ancien
/// minuteur 20 Hz restait au run loop jusqu'à la fin du processus et le fichier
/// partiel restait dans le dossier temporaire. Un échec de création laissait
/// aussi la session d'enregistrement active (indicateur micro allumé). Même
/// correctif que `AudioRecorderManager` (app).
final class DefaultSDKAudioRecorderRestartTests: XCTestCase {

    private static var sourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Audio/DefaultSDKAudioRecorder.swift")
    }

    private func startRecordingBody() throws -> String {
        let code = try String(contentsOf: Self.sourceURL, encoding: .utf8)
        let start = try XCTUnwrap(code.range(of: "public func startRecording() {"))
        let end = try XCTUnwrap(code.range(of: "public func stopRecording()", range: start.upperBound..<code.endIndex))
        return String(code[start.upperBound..<end.lowerBound])
    }

    func test_restart_invalidatesPreviousTimerBeforeSchedulingANewOne() throws {
        let body = try startRecordingBody()
        let invalidate = try XCTUnwrap(body.range(of: "timer?.invalidate()"),
                                       "le minuteur précédent doit être invalidé")
        let schedule = try XCTUnwrap(body.range(of: "Timer.scheduledTimer("))
        XCTAssertLessThan(invalidate.lowerBound, schedule.lowerBound)
        XCTAssertTrue(body.contains("previous.stop()"), "l'enregistrement précédent doit être arrêté")
    }

    func test_recorderCreationFailure_releasesTheRecordingSession() throws {
        let body = try startRecordingBody()
        let catchBlock = try XCTUnwrap(body.range(of: "} catch {"))
        let afterCatch = String(body[catchBlock.upperBound...].prefix(400))
        XCTAssertTrue(afterCatch.contains("MeeshyRecordingSession.shared.finish(handingBackSession: true)"),
                      "un échec de création doit rendre la session activée")
    }
}
