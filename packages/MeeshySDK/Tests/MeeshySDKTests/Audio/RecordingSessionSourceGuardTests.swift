#if os(iOS)
import Testing
import Foundation

/// #11042 — les enregistreurs de Meeshy (vocal de l'app, vocal du SDK, caméra)
/// passent par `MeeshyRecordingSession` : aucun ne pose la session lui-même,
/// et la capture vidéo ne la reconfigure plus automatiquement (elle coupait
/// les sons de Meeshy).
struct RecordingSessionSourceGuardTests {

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    /// Le code, commentaires retirés : ils racontent l'ancien comportement.
    private static func code(_ relativePath: String) throws -> String {
        let text = try String(contentsOf: repositoryRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return text.components(separatedBy: .newlines)
            .map { $0.components(separatedBy: "//").first ?? "" }
            .joined(separator: "\n")
    }

    private static let appRecorder = "apps/ios/Meeshy/Features/Main/Services/AudioRecorderManager.swift"
    private static let sdkRecorder = "packages/MeeshySDK/Sources/MeeshySDK/Audio/DefaultSDKAudioRecorder.swift"
    private static let camera = "apps/ios/Meeshy/Features/Main/Components/CameraModel.swift"

    @Test(arguments: [appRecorder, sdkRecorder])
    func aVoiceRecorder_takesAndGivesBackTheSessionThroughTheOrchestrator(path: String) throws {
        let code = try Self.code(path)

        #expect(code.contains(".begin(.voiceMessage)"))
        #expect(code.contains(".finish(handingBackSession: true)"))
        #expect(!code.contains("setCategory("))
        #expect(!code.contains("setActive("))
        #expect(!code.contains("deactivatePlaybackSync()"))
    }

    @Test func theCamera_noLongerLetsTheCaptureConfigureTheSession() throws {
        let code = try Self.code(Self.camera)

        #expect(code.contains("automaticallyConfiguresApplicationAudioSession = false"))
        #expect(code.contains("recordingSession.begin(.video)"))
        #expect(code.contains("recordingSession.finish(handingBackSession: false)"))
        #expect(code.contains("recordingSession.handBack()"))
    }
}
#endif
