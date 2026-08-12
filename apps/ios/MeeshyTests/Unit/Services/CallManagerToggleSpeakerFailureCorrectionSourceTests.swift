//
//  CallManagerToggleSpeakerFailureCorrectionSourceTests.swift
//  MeeshyTests
//
//  Source-level regression guard: `CallManager.toggleSpeaker()` optimistically
//  flips `isSpeaker` (drives the speaker button + self/remote audio route)
//  before the underlying `RTCAudioSession.overrideOutputAudioPort` call
//  resolves. `overrideOutputAudioPort` can throw — e.g. `insufficientPriority`
//  when a higher-priority route (a connected Bluetooth/AirPods headset) is
//  currently active — and a failure must not leave `isSpeaker` permanently
//  desynced from the audio route actually in use: the button would render
//  "on" while audio keeps playing through Bluetooth, and a second tap would
//  become a no-op relative to the real route since it flips back to a state
//  that was never truly applied. `applySpeakerRoute()` must report the
//  outcome; `CallManager` must revert on failure — same pattern already
//  fixed for `switchCamera()`/`selectCamera(id:)` (see
//  CallManagerSwitchCameraFailureCorrectionSourceTests /
//  CallManagerSelectCameraFailureCorrectionSourceTests). Not exercised
//  behaviorally (RTCAudioSession needs a real audio route), so this guards
//  the fix at the source level.
//

import XCTest
@testable import Meeshy

@MainActor
final class CallManagerToggleSpeakerFailureCorrectionSourceTests: XCTestCase {

    private func source(for filename: String, file: StaticString = #filePath, line: UInt = #line) -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/\(filename)")
        guard let contents = try? String(contentsOf: url, encoding: .utf8) else {
            XCTFail("Could not read \(filename)", file: file, line: line)
            return ""
        }
        return contents
    }

    private func body(_ source: String, from startMarker: String, to endMarker: String, file: StaticString = #filePath, line: UInt = #line) -> String? {
        guard let start = source.range(of: startMarker) else {
            XCTFail("Start marker not found — file structure changed: \"\(startMarker)\"", file: file, line: line)
            return nil
        }
        guard let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex) else {
            XCTFail("End marker not found — file structure changed: \"\(endMarker)\"", file: file, line: line)
            return nil
        }
        return String(source[start.lowerBound..<end.lowerBound])
    }

    func test_callManager_toggleSpeaker_revertsIsSpeakerOnFailure() {
        guard let fn = body(
            source(for: "CallManager.swift"),
            from: "func toggleSpeaker() {",
            to: "/// §5.4"
        ) else { return }
        XCTAssertTrue(
            fn.contains("let previousSpeaker = isSpeaker"),
            "toggleSpeaker must capture the pre-toggle speaker state before flipping it optimistically."
        )
        XCTAssertTrue(
            fn.contains("if !applySpeakerRoute() {"),
            "toggleSpeaker must inspect applySpeakerRoute()'s outcome — discarding it silently accepts a " +
            "failed route override as if it had succeeded."
        )
        XCTAssertTrue(
            fn.contains("isSpeaker = previousSpeaker"),
            "toggleSpeaker must revert isSpeaker when the underlying route override fails — otherwise the " +
            "speaker button desyncs from the real audio route (e.g. Bluetooth stays active) with no " +
            "correction path until an unrelated route-change event happens to re-apply it."
        )
    }

    func test_applySpeakerRoute_reportsOutcomeToCaller() {
        guard let fn = body(
            source(for: "CallManager.swift"),
            from: "fileprivate func applySpeakerRoute() -> Bool {",
            to: "private func updateProximityMonitoring()"
        ) else { return }
        XCTAssertTrue(
            fn.contains("var succeeded = true"),
            "applySpeakerRoute must track whether the override actually applied."
        )
        XCTAssertTrue(
            fn.contains("succeeded = false"),
            "applySpeakerRoute must flip its outcome to false when overrideOutputAudioPort throws — " +
            "otherwise callers can never detect the failure to revert against it."
        )
        XCTAssertTrue(
            fn.contains("return succeeded"),
            "applySpeakerRoute must return its tracked outcome so toggleSpeaker() can act on it."
        )
    }
}
