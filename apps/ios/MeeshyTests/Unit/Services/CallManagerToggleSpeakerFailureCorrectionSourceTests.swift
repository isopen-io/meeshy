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
            ((try? AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager.swift")) ?? ""),
            from: "func toggleSpeaker() {",
            to: "/// §5.4"
        ) else { return }
        XCTAssertTrue(
            fn.contains("let previousSpeaker = isSpeaker"),
            "toggleSpeaker must capture the pre-toggle speaker state before flipping it optimistically."
        )
        XCTAssertTrue(
            fn.contains("applySpeakerRouteOffMain { [weak self] applied in")
                && fn.contains("guard let self, !applied, self.isSpeaker == intended else { return }"),
            "toggleSpeaker must inspect the route override's outcome — discarding it silently accepts a " +
            "failed route override as if it had succeeded — and revert only if no later tap moved the state."
        )
        XCTAssertTrue(
            fn.contains("self.isSpeaker = previousSpeaker"),
            "toggleSpeaker must revert isSpeaker when the underlying route override fails — otherwise the " +
            "speaker button desyncs from the real audio route (e.g. Bluetooth stays active) with no " +
            "correction path until an unrelated route-change event happens to re-apply it."
        )
    }

    /// #8735 — « Sortie » répond au premier toucher : l'état basculé et
    /// l'haptique partent dans l'image du toucher, la route s'applique HORS du
    /// fil principal. Un `audioSessionQueue.sync` ici bloquait le dessin de
    /// l'état basculé jusqu'au retour de la session audio.
    func test_toggleSpeaker_neverWaitsForTheAudioSessionOnTheMainThread() {
        guard let fn = body(
            ((try? AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager.swift")) ?? ""),
            from: "func toggleSpeaker() {",
            to: "/// §5.4"
        ) else { return }
        XCTAssertFalse(fn.contains(".sync"), "toggleSpeaker must never block the main thread on audioSessionQueue")
        XCTAssertFalse(fn.contains("applySpeakerRoute()"), "the synchronous route is for the audio-session lifecycle, not a tap")
        guard let flip = fn.range(of: "isSpeaker.toggle()"),
              let haptic = fn.range(of: "HapticFeedback.light()"),
              let route = fn.range(of: "applySpeakerRouteOffMain") else {
            return XCTFail("toggleSpeaker must flip, give its haptic, then apply the route off the main thread")
        }
        XCTAssertLessThan(flip.lowerBound, route.lowerBound)
        XCTAssertLessThan(haptic.lowerBound, route.lowerBound)
    }

    func test_applySpeakerRouteOffMain_appliesOnTheAudioQueue_andAnswersOnTheMainActor() {
        guard let fn = body(
            source(for: "CallManager+Speaker.swift"),
            from: "func applySpeakerRouteOffMain(",
            to: "fileprivate extension Logger"
        ) else { return }
        XCTAssertTrue(fn.contains("completion: @escaping @MainActor @Sendable (Bool) -> Void"))
        XCTAssertTrue(fn.contains("audioSessionQueue.async {"))
        XCTAssertFalse(fn.contains(".sync"))
        XCTAssertTrue(fn.contains("Task { @MainActor in completion(applied) }"))
    }

    func test_speakerRoute_reportsAFailedOverride() {
        guard let fn = body(
            source(for: "CallManager+Speaker.swift"),
            from: "static func override(_ port: AVAudioSession.PortOverride, isSpeaker: Bool) -> Bool {",
            to: "extension CallManager {"
        ) else { return }
        XCTAssertTrue(fn.contains("try session.overrideOutputAudioPort(port)"))
        XCTAssertTrue(fn.contains("return false"), "a thrown override must surface as a failure the caller can revert")
    }

    func test_applySpeakerRoute_reportsOutcomeToCaller() {
        guard let fn = body(
            ((try? AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager.swift")) ?? ""),
            from: "func applySpeakerRoute() -> Bool {",
            to: "func updateProximityMonitoring()"
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

    /// #8978 — basculer la caméra ne bloque plus le fil principal sur la session audio : le mode
    /// `.videoChat`/`.voiceChat` s'applique sur la file audio, sans que l'interface l'attende. Un
    /// `audioSessionQueue.sync` ici figeait l'écran d'appel le temps de reconfigurer la session.
    func test_videoModeUpdate_neverWaitsForTheAudioSessionOnTheMainThread() {
        guard let fn = body(
            ((try? AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager.swift")) ?? ""),
            from: "func updateAudioSessionModeForCurrentVideoState() {",
            to: "func applySpeakerRoute() -> Bool {"
        ) else { return }
        XCTAssertFalse(fn.contains("audioSessionQueue.sync"), "the video mode update must never block the main thread")
        XCTAssertTrue(fn.contains("audioSessionQueue.async {"))
    }

    /// #8978 — la qualité du lien ne se republie que si elle CHANGE : chaque publication recalcule
    /// tout l'écran d'appel, et ce relevé tombe toutes les 5 s même quand rien ne bouge.
    func test_linkQuality_republishesOnlyOnChange() {
        let manager = ((try? AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager.swift")) ?? "")
        XCTAssertFalse(manager.contains("self.liveVideoQualityLevel = level\n"), "unconditional quality publish")
        XCTAssertTrue(manager.contains("if self.liveVideoQualityLevel != level { self.liveVideoQualityLevel = level }"))
        XCTAssertTrue(manager.contains("if self.isLinkQualityDegraded != degraded { self.isLinkQualityDegraded = degraded }"))
    }
}
