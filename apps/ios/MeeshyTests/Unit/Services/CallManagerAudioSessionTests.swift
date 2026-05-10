import XCTest
@testable import Meeshy

final class CallManagerAudioSessionTests: XCTestCase {

    func test_callManager_sourceCode_doesNotForceAudioSessionActiveBeforeBridge() throws {
        // Guard against regression: B3 fix mandates that provider(_:didActivate:)
        // must NOT call audioSession.setActive(true) before audioSessionDidActivate.
        // CallKit owns AVAudioSession activation; forcing it creates desync between
        // AVAudioSession and RTCAudioSession.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertFalse(
            source.contains("audioSession.setActive(true, options:"),
            "CallManager must not force AVAudioSession.setActive(true). " +
            "CallKit owns the lifecycle. See docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.2"
        )
    }
}
