import XCTest
@testable import Meeshy

@MainActor
final class CallManagerAudioSessionTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_callManager_sourceCode_doesNotForceAudioSessionActiveBeforeBridge() throws {
        // Guard against regression: B3 fix mandates that provider(_:didActivate:)
        // must NOT call audioSession.setActive(true) before audioSessionDidActivate.
        // CallKit owns AVAudioSession activation; forcing it creates desync between
        // AVAudioSession and RTCAudioSession.
        let source = try callManagerSource()

        XCTAssertFalse(
            source.contains("audioSession.setActive(true, options:"),
            "CallManager must not force AVAudioSession.setActive(true). " +
            "CallKit owns the lifecycle. See docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.2"
        )
    }

    func test_callManager_toggleTranscription_doesNotHardcodeLanguage() throws {
        // Regression guard: toggleTranscription() must not hardcode language strings.
        // Language resolution is delegated to CallManager.preferredCallLanguage(for:)
        // (Prisme Linguistique), which reads systemLanguage > regionalLanguage > "fr".
        let source = try callManagerSource()

        // Extract the toggleTranscription function body.
        guard let fnRange = source.range(of: "func toggleTranscription()"),
              let endRange = source[fnRange.upperBound...].range(of: "\n    }") else {
            XCTFail("toggleTranscription() function not found in CallManager.swift")
            return
        }
        let fnBody = String(source[fnRange.lowerBound ..< endRange.upperBound])

        XCTAssertFalse(
            fnBody.contains("let localLang = \"fr\""),
            "toggleTranscription() must not hardcode localLang = \"fr\". " +
            "Delegate to CallManager.preferredCallLanguage(for:) (Prisme Linguistique)."
        )
        XCTAssertFalse(
            fnBody.contains("let remoteLang = \"fr\""),
            "toggleTranscription() must not hardcode remoteLang = \"fr\". " +
            "Delegate to CallManager.preferredCallLanguage(for:) (Prisme Linguistique)."
        )
        XCTAssertTrue(
            fnBody.contains("preferredCallLanguage"),
            "toggleTranscription() must delegate language resolution to " +
            "CallManager.preferredCallLanguage(for:) (Prisme Linguistique)."
        )
    }

    func test_callManager_preferredCallLanguage_isStaticAndPure() throws {
        // Guard that preferredCallLanguage stays a pure static function — no instance
        // state, no async, safe to call from any actor in tests.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("static func preferredCallLanguage(for user: MeeshyUser?)"),
            "preferredCallLanguage must be declared `static func` for testability (pure function, no side effects)."
        )
    }

    func test_callManager_audioInterruptionHandler_usesAsyncDispatch() throws {
        // Regression guard: handleAudioInterruption must use audioSessionQueue.async
        // (non-blocking) not .sync. Using .sync blocks the MainActor for 10–100ms
        // during AVAudioSession.setActive, causing UI jank during call recovery
        // after a system interruption (alarm, GSM call, Siri).
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func handleAudioInterruption(") else {
            XCTFail("handleAudioInterruption not found in CallManager.swift")
            return
        }
        // Grab enough context to cover the function body.
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 2000, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("audioSessionQueue.async"),
            "handleAudioInterruption must use audioSessionQueue.async (non-blocking) to avoid blocking the MainActor."
        )
        XCTAssertFalse(
            fnBody.contains("audioSessionQueue.sync"),
            "handleAudioInterruption must NOT use audioSessionQueue.sync — it blocks the MainActor."
        )
    }
}
