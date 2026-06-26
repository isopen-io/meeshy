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

    // MARK: - Route Change Handler

    func test_callManager_audioRouteChange_guardsCallActive() throws {
        // P0-8: handleAudioRouteChange must be a no-op unless a call is active.
        // Without this guard, plugging headphones while idle could mutate isSpeaker,
        // corrupting the initial speaker state of the next outgoing call.
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func handleAudioRouteChange(") else {
            XCTFail("handleAudioRouteChange not found in CallManager.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("guard callState.isActive else { return }"),
            "handleAudioRouteChange must early-return when no call is active — otherwise idle route " +
            "changes (headset plug) corrupt the initial speaker state of the next call."
        )
    }

    func test_callManager_audioRouteChange_newDeviceAvailable_setsSpeakerFalse() throws {
        // P0-8: when a Bluetooth/headset device connects (.newDeviceAvailable), iOS
        // routes audio to it automatically. We only need to sync isSpeaker = false so
        // the speaker-toggle UI reflects reality. Calling applySpeakerRoute() here
        // would override back to speaker incorrectly.
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func handleAudioRouteChange(") else {
            XCTFail("handleAudioRouteChange not found in CallManager.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("case .newDeviceAvailable:"),
            "handleAudioRouteChange must handle .newDeviceAvailable"
        )
        // The .newDeviceAvailable branch must set isSpeaker = false, not call applySpeakerRoute,
        // since iOS already routed audio to the new device.
        guard let newDevRange = fnBody.range(of: "case .newDeviceAvailable:") else {
            XCTFail(".newDeviceAvailable case not found"); return
        }
        let newDevEnd = fnBody.index(newDevRange.upperBound, offsetBy: 300, limitedBy: fnBody.endIndex) ?? fnBody.endIndex
        let newDevBody = String(fnBody[newDevRange.lowerBound ..< newDevEnd])

        XCTAssertTrue(
            newDevBody.contains("isSpeaker = false"),
            ".newDeviceAvailable must set isSpeaker = false — new device (BT/headset) displaces speaker."
        )
    }

    func test_callManager_audioRouteChange_oldDeviceUnavailable_appliesRoute() throws {
        // P0-8: when a headset/BT device disconnects (.oldDeviceUnavailable), iOS routes
        // back to the built-in speaker or earpiece. We must re-apply the user's speaker
        // preference via applySpeakerRoute() so RTCAudioSession follows the intent.
        // Missing this causes the audio to stay at earpiece even if isSpeaker was true.
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func handleAudioRouteChange(") else {
            XCTFail("handleAudioRouteChange not found in CallManager.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("case .oldDeviceUnavailable:"),
            "handleAudioRouteChange must handle .oldDeviceUnavailable"
        )
        guard let oldDevRange = fnBody.range(of: "case .oldDeviceUnavailable:") else {
            XCTFail(".oldDeviceUnavailable case not found"); return
        }
        let oldDevEnd = fnBody.index(oldDevRange.upperBound, offsetBy: 300, limitedBy: fnBody.endIndex) ?? fnBody.endIndex
        let oldDevBody = String(fnBody[oldDevRange.lowerBound ..< oldDevEnd])

        XCTAssertTrue(
            oldDevBody.contains("applySpeakerRoute()"),
            ".oldDeviceUnavailable must call applySpeakerRoute() — re-applies user's speaker " +
            "preference after iOS routes back to built-in speaker/earpiece on device removal."
        )
    }

    func test_callManager_audioRouteChange_override_isNoOp() throws {
        // P0-8: the .override reason fires when WE call overrideOutputAudioPort ourselves
        // (applySpeakerRoute). Acting on our own override would cause infinite recursion.
        // The case must be a no-op (break or empty body).
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func handleAudioRouteChange(") else {
            XCTFail("handleAudioRouteChange not found in CallManager.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("case .override:"),
            "handleAudioRouteChange must have a .override case to suppress self-triggered route events"
        )
        guard let overrideRange = fnBody.range(of: "case .override:") else {
            XCTFail(".override case not found"); return
        }
        let overrideEnd = fnBody.index(overrideRange.upperBound, offsetBy: 200, limitedBy: fnBody.endIndex) ?? fnBody.endIndex
        let overrideBody = String(fnBody[overrideRange.lowerBound ..< overrideEnd])

        XCTAssertFalse(
            overrideBody.contains("applySpeakerRoute()"),
            ".override must NOT call applySpeakerRoute() — that would respond to our own route " +
            "override call and could cause loops or unexpected audio route state."
        )
    }

    // MARK: - Bluetooth Audio Configuration

    func test_callManager_audioSession_usesBluetoothHFP_notA2DP() throws {
        // PERF-010: Bluetooth call quality fix. A2DP (output-only) conflicts with
        // the bidirectional voice path — the OS flaps between A2DP and HFP modes,
        // causing periodic ~200ms audio glitches. Using only HFP keeps the SCO
        // bidirectional link stable.
        let source = try callManagerSource()

        XCTAssertTrue(
            source.contains(".allowBluetoothHFP"),
            "configureAudioSession must include .allowBluetoothHFP to route call audio " +
            "over Bluetooth headsets via the SCO voice link."
        )
        XCTAssertFalse(
            source.contains(".allowBluetoothA2DP"),
            "configureAudioSession must NOT include .allowBluetoothA2DP — it conflicts with HFP " +
            "and causes ~200ms periodic audio glitches (OS A2DP↔HFP mode flapping)."
        )
    }

    // MARK: - toggleVideo API regression guard

    func test_callManager_toggleVideo_usesProperUpgradeDowngradeAPI() throws {
        // Regression guard: CallManager.toggleVideo() must call upgradeToVideo() /
        // downgradeFromVideo() (which also changes the SDP transceiver direction) —
        // NOT enableVideo(false) which only toggles track.isEnabled without updating
        // the SDP (peer continues to receive blank frames, camera LED stays off but
        // video transceiver is still sendRecv from the peer's perspective).
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "func toggleVideo()") else {
            XCTFail("toggleVideo() not found in CallManager.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 2000, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("upgradeToVideo()"),
            "toggleVideo() must call webRTCService.upgradeToVideo() when enabling video — " +
            "this changes the transceiver direction to sendRecv and triggers SDP renegotiation."
        )
        XCTAssertTrue(
            fnBody.contains("downgradeFromVideo()"),
            "toggleVideo() must call webRTCService.downgradeFromVideo() when disabling video — " +
            "this changes the transceiver direction to recvOnly and stops the capturer."
        )
        XCTAssertFalse(
            fnBody.contains("webRTCService.enableVideo("),
            "toggleVideo() must NOT call webRTCService.enableVideo() — that is a track-level " +
            "primitive that does not update SDP. Use upgradeToVideo()/downgradeFromVideo() instead."
        )
    }

    func test_callManager_callSite_doesNotUseLowerLevelEnableVideo() throws {
        // Dead-code regression guard: webRTCService.enableVideo() is a low-level primitive
        // that only toggles track.isEnabled. CallManager should never call it directly —
        // all call-site video toggling must go through upgradeToVideo()/downgradeFromVideo()
        // which also change the SDP transceiver direction and can trigger renegotiation.
        let source = try callManagerSource()

        let callSites = source.components(separatedBy: "webRTCService.enableVideo(")
        XCTAssertEqual(
            callSites.count, 1,
            "CallManager must not call webRTCService.enableVideo(). Found \(callSites.count - 1) call site(s). " +
            "Use webRTCService.upgradeToVideo() / webRTCService.downgradeFromVideo() instead."
        )
    }
}
