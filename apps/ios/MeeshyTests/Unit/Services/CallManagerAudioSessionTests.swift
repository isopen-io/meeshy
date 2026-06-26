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

    // MARK: - TURN Credential TTL

    func test_callManager_turnCredentialRefresh_usesQualityThresholdsConstant() throws {
        // Regression guard: all scheduleTURNCredentialRefresh call sites must use
        // QualityThresholds.turnDefaultCredentialTTLSeconds, not a bare literal 480.
        // The constant is the single source of truth for the default TURN TTL so the
        // 80%-TTL refresh timing can be tuned in one place across outgoing ACK path,
        // incoming VoIP push path, and incoming CallKit path.
        let source = try callManagerSource()

        XCTAssertTrue(
            source.contains("turnDefaultCredentialTTLSeconds"),
            "CallManager must reference QualityThresholds.turnDefaultCredentialTTLSeconds — " +
            "not a hardcoded TTL literal — so the default TURN credential lifetime is tunable."
        )
        XCTAssertFalse(
            source.contains("scheduleTURNCredentialRefresh(ttl: 480)"),
            "scheduleTURNCredentialRefresh must not be called with the bare literal 480. " +
            "Use QualityThresholds.turnDefaultCredentialTTLSeconds."
        )
    }

    // MARK: - Negotiation Epoch Guards (§3.5)

    func test_callManager_emitOfferWithRetry_hasEpochGuard() throws {
        // §3.5 regression guard: emitOfferWithRetry must guard `generation >= negotiationId`
        // on every retry attempt. Without this check a background retry could deliver an
        // SDP offer that belongs to a superseded negotiation, causing SDP glare on the peer
        // that has already moved to a newer epoch.
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func emitOfferWithRetry(") else {
            XCTFail("emitOfferWithRetry not found in CallManager.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("generation >= negotiationId"),
            "emitOfferWithRetry must guard `generation >= negotiationId` — drops retries " +
            "superseded by a newer negotiation epoch (§3.5)."
        )
    }

    func test_callManager_emitAnswerRetry_hasEpochGuard() throws {
        // §3.5 regression guard: emitAnswerRetry must guard `generation >= negotiationId`.
        // An un-ACK'd answer in flight at the time of a renegotiation must not be
        // re-delivered — it belongs to the old epoch and would confuse the peer's JSEP
        // state machine. The gateway dedupes by negotiationId (§3.5) but the client-side
        // guard avoids the unnecessary network round-trip.
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func emitAnswerRetry(") else {
            XCTFail("emitAnswerRetry not found in CallManager.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("generation >= negotiationId"),
            "emitAnswerRetry must guard `generation >= negotiationId` — drops retries " +
            "superseded by a newer negotiation epoch (§3.5)."
        )
    }

    func test_callManager_isStaleNegotiation_isPureStaticFunction() throws {
        // §3.5 regression guard: isStaleNegotiation must remain `static func` — pure
        // epoch comparison rule with no side effects or instance state. If it becomes an
        // instance method the rule is no longer directly testable in isolation and hidden
        // dependencies on singleton state could corrupt the symmetric polite/impolite
        // negotiation invariant.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("static func isStaleNegotiation(incoming: Int, highWaterMark: Int)"),
            "isStaleNegotiation must be declared `static func` — pure epoch rule (§3.5), no side effects."
        )
    }

    func test_callManager_isPolitePeer_isPureStaticFunction() throws {
        // §3.4 regression guard: isPolitePeer must stay a pure static func. Both peers
        // derive the same polite/impolite role from the lexicographic order of their userIds
        // WITHOUT exchanging extra signals. Making it async or instance-bound would break
        // this symmetric, deterministic invariant.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("static func isPolitePeer(localUserId: String, remoteUserId: String)"),
            "isPolitePeer must be declared `static func` — deterministic symmetric role (§3.4)."
        )
    }

    func test_callManager_negotiationId_resetPerCall_inApplyNegotiationRole() throws {
        // §3.5 regression guard: negotiationId must be reset to 0 inside applyNegotiationRole().
        // CallManager is a process-wide singleton. If the epoch is not zeroed at call start,
        // a peer with a higher generation counter from a prior call would wrongly drop the new
        // call's first offer (gen 1 < old high-water mark N) — causing a one-way silent call.
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func applyNegotiationRole()") else {
            XCTFail("applyNegotiationRole not found in CallManager.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("negotiationId = 0"),
            "applyNegotiationRole must reset negotiationId = 0 — CallManager singleton must " +
            "not carry a prior call's epoch into the next call (§3.5)."
        )
    }

    // MARK: - SDP Offer Timeout — QualityThresholds usage

    func test_callManager_sdpOfferTimeout_usesQualityThresholdsConstant() throws {
        // Regression guard: SDP offer timeout must reference the QualityThresholds constant,
        // not a hardcoded literal. A hardcoded `30` here would silently desync from the
        // gateway's offer-expiry window if the constant is tuned in future.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("sdpOfferTimeoutSeconds"),
            "sdpOfferTimeoutTask must use QualityThresholds.sdpOfferTimeoutSeconds, not a literal"
        )
        XCTAssertFalse(
            source.contains("Task.sleep(for: .seconds(30))"),
            "Hardcoded .seconds(30) in sdpOfferTimeoutTask — replace with QualityThresholds.sdpOfferTimeoutSeconds"
        )
    }

    // MARK: - Call-End Settle — QualityThresholds usage

    func test_callManager_callEndSettle_usesQualityThresholdsConstant() throws {
        // Regression guard: the call-end settle timer must not hardcode 1500 milliseconds.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("callEndSettleSeconds"),
            "Call-end settle must use QualityThresholds.callEndSettleSeconds, not a literal"
        )
        XCTAssertFalse(
            source.contains(".milliseconds(1500)"),
            "Hardcoded .milliseconds(1500) found — replace with QualityThresholds.callEndSettleSeconds"
        )
    }

    // MARK: - VoIP Freshness Timeout — QualityThresholds usage

    func test_callManager_voipFreshness_usesQualityThresholdsConstant() throws {
        // Regression guard: URLRequest timeout in checkVoIPCallFreshness must not be hardcoded.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("voipFreshnessTimeoutSeconds"),
            "checkVoIPCallFreshness URLRequest must use QualityThresholds.voipFreshnessTimeoutSeconds"
        )
        XCTAssertFalse(
            source.contains("timeoutInterval: 4.0"),
            "Hardcoded timeoutInterval: 4.0 — replace with QualityThresholds.voipFreshnessTimeoutSeconds"
        )
    }

    // MARK: - Remote Quality Reset — QualityThresholds usage

    func test_callManager_remoteQualityReset_usesQualityThresholdsConstant() throws {
        // Regression guard: scheduleRemoteQualityReset must not hardcode the reset window.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("remoteQualityResetSeconds"),
            "scheduleRemoteQualityReset must use QualityThresholds.remoteQualityResetSeconds"
        )
    }

    func test_callManager_pipFrameRate_usesQualityThresholdsConstants() throws {
        // Regression guard: pipFrameRate(for:) must not hardcode 8/10/15 fps.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("pipFrameRateCritical"),
            "pipFrameRate(for:) must reference QualityThresholds.pipFrameRateCritical"
        )
        XCTAssertTrue(
            source.contains("pipFrameRateSerious"),
            "pipFrameRate(for:) must reference QualityThresholds.pipFrameRateSerious"
        )
        XCTAssertTrue(
            source.contains("pipFrameRateDefault"),
            "pipFrameRate(for:) must reference QualityThresholds.pipFrameRateDefault"
        )
    }

    func test_callManager_signalRetry_usesQualityThresholdsConstants() throws {
        // Regression guard: emitOfferWithRetry / emitAnswerRetry must not hardcode
        // the initial delay (500 ms) or attempt counts (3, 4).
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("signalRetryInitialDelaySeconds"),
            "emitOfferWithRetry / emitAnswerRetry must use QualityThresholds.signalRetryInitialDelaySeconds"
        )
        XCTAssertTrue(
            source.contains("signalOfferMaxAttempts"),
            "emitOfferWithRetry must use QualityThresholds.signalOfferMaxAttempts"
        )
        XCTAssertTrue(
            source.contains("signalAnswerTotalAttempts"),
            "emitAnswerRetry must use QualityThresholds.signalAnswerTotalAttempts"
        )
        XCTAssertFalse(
            source.contains("nanoseconds: delayMs"),
            "Hardcoded nanoseconds: delayMs — replace with Task.sleep(for: .seconds(...))"
        )
    }
}

// MARK: - P2PWebRTCClient — Perfect Negotiation Source Guards (W3C §3.4)

/// Source-level guards for the perfect-negotiation implementation in P2PWebRTCClient.swift.
/// These tests verify that the three critical §3.4 flags and glare-resolution paths are
/// present and have not been accidentally deleted. They complement the functional tests in
/// CallManagerTests.swift by targeting the WebRTC client layer directly.
@MainActor
final class P2PWebRTCClientPerfectNegotiationTests: XCTestCase {

    private func p2pClientSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_p2pClient_makingOffer_flagExists() throws {
        // §3.4: `makingOffer` must be true only while we're building+setting the local
        // offer description. Without it, the polite peer can't detect offer glare.
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("private var makingOffer"),
            "P2PWebRTCClient must declare `private var makingOffer` for §3.4 perfect negotiation"
        )
    }

    func test_p2pClient_ignoreOffer_flagExists() throws {
        // §3.4: `ignoreOffer` signals the impolite peer to discard a colliding remote offer.
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("private var ignoreOffer"),
            "P2PWebRTCClient must declare `private var ignoreOffer` for §3.4 glare detection"
        )
    }

    func test_p2pClient_isSettingRemoteAnswerPending_flagExists() throws {
        // §3.4: `isSettingRemoteAnswerPending` prevents the polite peer from treating
        // answer-application as offer-ready, avoiding a spurious second rollback.
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("private var isSettingRemoteAnswerPending"),
            "P2PWebRTCClient must declare `private var isSettingRemoteAnswerPending` for §3.4"
        )
    }

    func test_p2pClient_politeRollback_isImplemented() throws {
        // §3.4: the polite peer must roll back its local offer on glare by setting a
        // `.rollback` session description before applying the remote offer.
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains(".rollback"),
            "P2PWebRTCClient must implement polite-peer rollback (RTCSessionDescription type .rollback) for §3.4"
        )
    }

    func test_p2pClient_impoliteIgnoreOffer_setsFlag() throws {
        // §3.4: when the impolite peer detects glare it must set `ignoreOffer = true` and
        // throw (not silently continue), so the remote description is never applied.
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("ignoreOffer = true") || source.contains("ignoreOffer=true"),
            "P2PWebRTCClient must set ignoreOffer = true when the impolite peer detects offer glare"
        )
    }

    func test_p2pClient_offerIgnoredError_isThrown() throws {
        // §3.4: the impolite peer must throw when it ignores a colliding offer so the
        // `handleSignalOffer` call site can log the drop without crashing the call.
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("WebRTCError.offerIgnored"),
            "P2PWebRTCClient must throw WebRTCError.offerIgnored when impolite peer ignores a glare offer"
        )
    }

    func test_p2pClient_dataChannelPing_usesQualityThresholdsConstant() throws {
        // Regression guard: startDataChannelPing must not hardcode the 15 s interval.
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("dataChannelPingIntervalSeconds"),
            "startDataChannelPing must use QualityThresholds.dataChannelPingIntervalSeconds"
        )
        XCTAssertFalse(
            source.contains("Task.sleep(for: .seconds(15))"),
            "Hardcoded .seconds(15) in startDataChannelPing — replace with QualityThresholds.dataChannelPingIntervalSeconds"
        )
    }

    func test_p2pClient_opusMunge_usesQualityThresholdsConstants() throws {
        // Regression guard: mungeOpusSDP must not hardcode 64000 / 48000.
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("opusFmtpMaxAverageBitrate"),
            "mungeOpusSDP must reference QualityThresholds.opusFmtpMaxAverageBitrate"
        )
        XCTAssertTrue(
            source.contains("opusFmtpMaxPlaybackRate"),
            "mungeOpusSDP must reference QualityThresholds.opusFmtpMaxPlaybackRate"
        )
        XCTAssertFalse(
            source.contains("\"maxaveragebitrate=64000\""),
            "Hardcoded maxaveragebitrate=64000 in mungeOpusSDP — replace with QualityThresholds.opusFmtpMaxAverageBitrate"
        )
        XCTAssertFalse(
            source.contains("\"maxplaybackrate=48000\""),
            "Hardcoded maxplaybackrate=48000 in mungeOpusSDP — replace with QualityThresholds.opusFmtpMaxPlaybackRate"
        )
    }

    func test_p2pClient_videoBitrateHints_usesQualityThresholdsConstants() throws {
        // Regression guard: addVideoBitrateHints must not hardcode 2500 / 100.
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("sdpVideoMaxBitrateKbps"),
            "addVideoBitrateHints must reference QualityThresholds.sdpVideoMaxBitrateKbps"
        )
        XCTAssertTrue(
            source.contains("sdpVideoMinBitrateKbps"),
            "addVideoBitrateHints must reference QualityThresholds.sdpVideoMinBitrateKbps"
        )
        XCTAssertFalse(
            source.contains("x-google-max-bitrate=2500"),
            "Hardcoded x-google-max-bitrate=2500 — replace with QualityThresholds.sdpVideoMaxBitrateKbps"
        )
    }

    func test_p2pClient_cameraFormat_referencesVideoConfigPreset() throws {
        // Regression guard: selectFormat(for:) must derive its resolution and fps
        // ceiling from VideoConfig.hd720p30 — hardcoding 1280/720/30 would drift
        // if the preset is ever updated.
        let source = try p2pClientSource()
        XCTAssertTrue(
            source.contains("VideoConfig.hd720p30.maxResolution"),
            "selectFormat(for:) must reference VideoConfig.hd720p30.maxResolution for width/height ceiling"
        )
        XCTAssertTrue(
            source.contains("VideoConfig.hd720p30.maxFrameRate"),
            "selectFormat(for:) must reference VideoConfig.hd720p30.maxFrameRate for fps ceiling"
        )
    }
}

// MARK: - CallView PiP Landscape Safe Area Source Guards

/// Source-level guards ensuring `pipCenter(_:in:safeArea:)` in CallView.swift
/// threads `geo.safeAreaInsets` from both GeometryReader call sites so PiP
/// positioning adapts correctly in landscape (Dynamic Island cutout, etc.).
@MainActor
final class CallViewPiPLandscapeSourceGuardTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_pipCenter_acceptsSafeAreaEdgeInsets_parameter() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("safeArea: EdgeInsets"),
            "pipCenter must accept `safeArea: EdgeInsets` — hardcoded insets break landscape layout"
        )
    }

    func test_pipCenter_usesSafeAreaLeading_forLandscapeCutout() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("safeArea.leading"),
            "pipCenter must add safeArea.leading to leadingX — PiP must clear the Dynamic Island cutout in landscape"
        )
    }

    func test_pipCenter_usesSafeAreaTrailing_forLandscapeCutout() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("safeArea.trailing"),
            "pipCenter must subtract safeArea.trailing from trailingX — PiP must clear the Dynamic Island cutout in landscape"
        )
    }

    func test_pipCenter_usesPipTopBottomClearanceConstants() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("QualityThresholds.pipTopClearance"),
            "pipCenter must reference QualityThresholds.pipTopClearance — no hardcoded top inset"
        )
        XCTAssertTrue(
            source.contains("QualityThresholds.pipBottomClearance"),
            "pipCenter must reference QualityThresholds.pipBottomClearance — no hardcoded bottom inset"
        )
    }

    func test_bothGeometryReaderSites_passSafeAreaInsets() throws {
        let source = try callViewSource()
        let passCount = source.components(separatedBy: "geo.safeAreaInsets").count - 1
        XCTAssertGreaterThanOrEqual(
            passCount, 2,
            "Both pipView and localVideoSuspendedTile must pass geo.safeAreaInsets to pipCenter — found \(passCount) site(s)"
        )
    }

    func test_nearestCorner_threadsSafeAreaInsets() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("nearestCorner(to: dropped, in: geo.size, safeArea: geo.safeAreaInsets)"),
            "nearestCorner must receive geo.safeAreaInsets so snap targets match pipCenter positions in landscape"
        )
    }
}

// MARK: - CallEffectsOverlay Accessibility + Dynamic Type Source Guards

/// Source-level guards for `CallEffectsOverlay.toolbarButton`:
/// - Dynamic Type: caption text must use a semantic font, not a fixed pixel size.
/// - Accessibility: VoiceOver must be able to announce the active/inactive state
///   and what the button does when tapped.
@MainActor
final class CallEffectsOverlayAccessibilityTests: XCTestCase {

    private func callEffectsSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallEffectsOverlay.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_toolbarButtonCaption_usesSemanticFont_forDynamicType() throws {
        let source = try callEffectsSource()
        XCTAssertTrue(
            source.contains(".caption2"),
            "toolbarButton caption must use .caption2 (Dynamic Type) — not a hardcoded pixel size"
        )
    }

    func test_toolbarButtonCaption_doesNotUseFixedSize10() throws {
        let source = try callEffectsSource()
        XCTAssertFalse(
            source.contains(".font(.system(size: 10"),
            "toolbarButton caption must not use .font(.system(size: 10)) — breaks Dynamic Type accessibility"
        )
    }

    func test_toolbarButton_hasAccessibilityValue_forToggleState() throws {
        let source = try callEffectsSource()
        XCTAssertTrue(
            source.contains(".accessibilityValue("),
            "toolbarButton must declare .accessibilityValue so VoiceOver announces active/inactive state"
        )
    }

    func test_toolbarButton_hasAccessibilityHint() throws {
        let source = try callEffectsSource()
        XCTAssertTrue(
            source.contains(".accessibilityHint("),
            "toolbarButton must declare .accessibilityHint so VoiceOver describes what the button will do"
        )
    }
}

// MARK: - Idle timer + proximity sensor management

/// Source-analysis guards ensuring the screen-on / proximity-sensor contract
/// is maintained. A regression here causes:
///   • No idle-timer disable → screen auto-locks mid-call (catastrophic for video).
///   • No proximity sensor → audio-only calls drain battery + allow accidental taps.
@MainActor
final class CallManagerIdleTimerProximityTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Idle timer (screen-on during calls)

    func test_idleTimerDisable_isBoundToCallStateIsActive() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("isIdleTimerDisabled = active"),
            "The idle timer must be set to 'active' in callState.didSet — screens must not auto-lock during calls")
    }

    func test_idleTimerDisable_isSetInCallStateDidSet() throws {
        let source = try callManagerSource()
        // Verify the idle timer assignment lives in callState's didSet block, not elsewhere.
        // Heuristic: the assignment must appear before the closing brace of the first didSet.
        let didSetRange = source.range(of: "didSet {")
        XCTAssertNotNil(didSetRange, "callState must have a didSet block")
        let afterDidSet = String(source[didSetRange!.upperBound...])
        let firstBrace = afterDidSet.range(of: "isIdleTimerDisabled")
        XCTAssertNotNil(firstBrace,
            "isIdleTimerDisabled must be set somewhere in or after callState.didSet")
    }

    func test_idleTimerDisable_usesSharedApplication() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("UIApplication.shared.isIdleTimerDisabled"),
            "Must use UIApplication.shared.isIdleTimerDisabled — not a local toggle")
    }

    // MARK: - Proximity sensor (audio-only calls)

    func test_proximityMonitoring_enabledByUpdateProximityMonitoring() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("UIDevice.current.isProximityMonitoringEnabled"),
            "Proximity monitoring must be managed via UIDevice.current.isProximityMonitoringEnabled")
    }

    func test_proximityMonitoring_helperIsCalledFromCallStateDidSet() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("updateProximityMonitoring()"),
            "updateProximityMonitoring() must be called from callState.didSet so the sensor " +
            "tracks call lifecycle automatically")
    }

    func test_proximityMonitoring_helperIsCalledFromIsVideoEnabledDidSet() throws {
        let source = try callManagerSource()
        // The isVideoEnabled.didSet must call updateProximityMonitoring so that mid-call
        // video toggle flips the proximity sensor on/off.
        let videoEnabledDidSet = source.range(of: "isVideoEnabled != oldValue")
        XCTAssertNotNil(videoEnabledDidSet,
            "isVideoEnabled.didSet must guard on value change before calling updateProximityMonitoring")
        let afterGuard = String(source[videoEnabledDidSet!.upperBound...])
        XCTAssertTrue(
            afterGuard.hasPrefix(" { updateProximityMonitoring()") ||
            afterGuard.hasPrefix("{ updateProximityMonitoring("),
            "isVideoEnabled.didSet must call updateProximityMonitoring() on change")
    }

    func test_proximityMonitoring_isDisabledDuringVideoCall() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("!isVideoEnabled"),
            "updateProximityMonitoring must guard on !isVideoEnabled: proximity must be OFF during video calls")
    }

    func test_updateProximityMonitoring_guardsBothActiveAndVideoState() throws {
        let source = try callManagerSource()
        // The helper must check BOTH conditions: call active AND audio-only.
        let helperRange = source.range(of: "private func updateProximityMonitoring()")
        XCTAssertNotNil(helperRange, "updateProximityMonitoring() helper must exist")
        let helperBody = String(source[helperRange!.upperBound...])
        XCTAssertTrue(
            helperBody.contains("isActive") && helperBody.contains("!isVideoEnabled"),
            "updateProximityMonitoring must evaluate BOTH callState.isActive AND !isVideoEnabled")
    }
}

// MARK: - DTMF forwarding via CallKit keypad

/// Source-analysis guards ensuring `CXPlayDTMFCallAction` is handled and forwards
/// digits to WebRTC via `sendDTMF`. Without this, the CallKit keypad appears but
/// pressing digits has no effect — conference PINs and IVR navigation are broken.
@MainActor
final class CallManagerDTMFTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func webRTCTypesSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_dtmfHandler_isImplemented_inCallKitDelegate() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("CXPlayDTMFCallAction"),
            "CXPlayDTMFCallAction must be handled — without it the CallKit keypad sends no tones")
    }

    func test_dtmfHandler_forwardsDigitsToWebRTCService() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("sendDTMF(digits: action.digits)"),
            "CXPlayDTMFCallAction handler must forward action.digits to webRTCService.sendDTMF")
    }

    func test_dtmfHandler_fulfillsAction() throws {
        let source = try callManagerSource()
        let handlerRange = source.range(of: "CXPlayDTMFCallAction")
        XCTAssertNotNil(handlerRange)
        let afterHandler = String(source[handlerRange!.upperBound...])
        let nextHandlerBoundary = afterHandler.range(of: "func provider")?.lowerBound
            ?? afterHandler.endIndex
        let handlerBody = String(afterHandler[..<nextHandlerBoundary])
        XCTAssertTrue(
            handlerBody.contains("action.fulfill()"),
            "CXPlayDTMFCallAction handler must call action.fulfill() so CallKit does not timeout")
    }

    func test_sendDTMF_isInWebRTCClientProvidingProtocol() throws {
        let source = try webRTCTypesSource()
        XCTAssertTrue(
            source.contains("func sendDTMF(digits: String)"),
            "sendDTMF must be declared in WebRTCClientProviding protocol so mocks can stub it")
    }
}

// MARK: - AVAudioSession media services reset recovery

/// Source-analysis guards ensuring the app survives an `AVAudioSession.mediaServicesResetNotification`.
/// Without handling this notification, a media server crash during a call leaves the audio path silent
/// for the rest of the call — no recovery, no user feedback.
@MainActor
final class CallManagerMediaServicesResetTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_mediaServicesReset_observerIsRegistered() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("AVAudioSession.mediaServicesResetNotification"),
            "mediaServicesResetNotification must be observed — a media server crash otherwise " +
            "silences the call permanently")
    }

    func test_mediaServicesReset_handlerGuardsCallActive() throws {
        let source = try callManagerSource()
        let handlerRange = source.range(of: "handleMediaServicesReset")
        XCTAssertNotNil(handlerRange, "handleMediaServicesReset handler must exist")
        let handlerBody = String(source[handlerRange!.upperBound...])
        XCTAssertTrue(
            handlerBody.contains("callState.isActive"),
            "handleMediaServicesReset must guard on callState.isActive — no-op outside active calls")
    }

    func test_mediaServicesReset_rebuildsRTCAudioSession() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("audioSessionDidDeactivate") && source.contains("audioSessionDidActivate"),
            "handleMediaServicesReset must call audioSessionDidDeactivate then audioSessionDidActivate " +
            "so libwebrtc rebuilds its audio I/O unit after the media server restart")
    }

    func test_mediaServicesReset_reactivatesAVAudioSession() throws {
        let source = try callManagerSource()
        let handlerRange = source.range(of: "handleMediaServicesReset")
        XCTAssertNotNil(handlerRange)
        let handlerBody = String(source[handlerRange!.upperBound...])
        XCTAssertTrue(
            handlerBody.contains("setActive(true"),
            "handleMediaServicesReset must call setActive(true) to bring AVAudioSession back online " +
            "after the system reset cleared all session state")
    }

    func test_mediaServicesReset_isStartedInInit() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("startMediaServicesResetMonitoring()"),
            "startMediaServicesResetMonitoring() must be called in CallManager.init so the " +
            "observer is live for the full singleton lifetime")
    }
}

// MARK: - VoiceOver announcements for call state changes

/// Source-analysis guards ensuring VoiceOver users are notified of critical
/// call state transitions. Without these announcements, a VoiceOver user has
/// no way to know when the call connects, reconnects, or degrades.
@MainActor
final class CallViewVoiceOverAnnouncementTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_voiceOver_announcesCallConnected() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("call.a11y.connected"),
            "CallView must post a UIAccessibility .announcement when the call connects " +
            "so VoiceOver users know the call is live")
    }

    func test_voiceOver_announcesReconnecting() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("call.a11y.reconnecting"),
            "CallView must post a UIAccessibility .announcement when the call enters " +
            "reconnecting state so VoiceOver users know audio may be interrupted")
    }

    func test_voiceOver_announcesQualityDegraded() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("call.a11y.quality.poor"),
            "CallView must post a UIAccessibility .announcement when quality drops " +
            "to poor/critical so VoiceOver users can decide to move to a better signal")
    }

    func test_voiceOver_usesAdaptiveOnChange_forCallState() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("adaptiveOnChange(of: callManager.callState)"),
            "VoiceOver announcements must be driven by adaptiveOnChange so they " +
            "fire only on transitions, not on every body re-evaluation")
    }

    func test_voiceOver_usesAdaptiveOnChange_forQualityLevel() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("adaptiveOnChange(of: callManager.liveVideoQualityLevel)"),
            "Quality VoiceOver announcement must use adaptiveOnChange so it " +
            "only fires when the quality tier actually changes")
    }
}

// MARK: - Background video suspension — peer notification

/// Source-analysis guards ensuring that when the app enters the background during
/// a video call, the remote peer receives a `call:media-toggled false` signal so
/// it shows our avatar placeholder instead of a frozen last frame.  Without this:
///   • The peer sees a motionless frozen frame while the app is backgrounded.
///   • When we return to the foreground, the peer doesn't know the camera resumed.
@MainActor
final class CallManagerBackgroundVideoTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_backgroundMonitor_declaresVideoSuspendedByBackgroundFlag() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("isVideoSuspendedByBackground"),
            "CallManager must declare isVideoSuspendedByBackground to track camera suspension " +
            "caused by backgrounding — distinguishes from user-driven video toggle")
    }

    func test_backgroundObserver_emitsToggleVideoFalse_whenVideoActive() throws {
        let source = try callManagerSource()
        guard let bgRange = source.range(of: "didEnterBackgroundNotification") else {
            XCTFail("didEnterBackgroundNotification observer not found in CallManager.swift"); return
        }
        let afterBg = String(source[bgRange.upperBound...])
        guard let blockEnd = afterBg.range(of: "foregroundObserver = NotificationCenter")?.lowerBound else {
            XCTFail("Could not find foregroundObserver boundary"); return
        }
        let bgBlock = String(afterBg[..<blockEnd])
        XCTAssertTrue(
            bgBlock.contains("isVideoEnabled") && bgBlock.contains("emitCallToggleVideo") &&
            bgBlock.contains("enabled: false"),
            "didEnterBackground handler must guard on isVideoEnabled and call " +
            "emitCallToggleVideo(callId:enabled:false) so the peer shows the avatar placeholder")
    }

    func test_backgroundObserver_setsIsVideoSuspendedByBackgroundFlag() throws {
        let source = try callManagerSource()
        guard let bgRange = source.range(of: "didEnterBackgroundNotification") else {
            XCTFail("didEnterBackgroundNotification observer not found"); return
        }
        let afterBg = String(source[bgRange.upperBound...])
        guard let blockEnd = afterBg.range(of: "foregroundObserver = NotificationCenter")?.lowerBound else {
            XCTFail("Could not find foregroundObserver boundary"); return
        }
        let bgBlock = String(afterBg[..<blockEnd])
        XCTAssertTrue(
            bgBlock.contains("isVideoSuspendedByBackground = true"),
            "didEnterBackground handler must set isVideoSuspendedByBackground = true so the " +
            "foreground handler can distinguish a background-caused suspension from a user toggle")
    }

    func test_foregroundObserver_emitsToggleVideoTrue_whenVideoStillEnabled() throws {
        let source = try callManagerSource()
        guard let fgRange = source.range(of: "willEnterForegroundNotification") else {
            XCTFail("willEnterForegroundNotification observer not found"); return
        }
        let afterFg = String(source[fgRange.upperBound...])
        XCTAssertTrue(
            afterFg.contains("isVideoSuspendedByBackground") &&
            afterFg.contains("emitCallToggleVideo") &&
            afterFg.contains("enabled: true"),
            "willEnterForeground handler must check isVideoSuspendedByBackground and call " +
            "emitCallToggleVideo(callId:enabled:true) when the user still wants video — " +
            "restores the avatar placeholder to the live camera feed at the peer")
    }

    func test_foregroundObserver_clearsFlag_unconditionally() throws {
        let source = try callManagerSource()
        guard let fgRange = source.range(of: "willEnterForegroundNotification") else {
            XCTFail("willEnterForegroundNotification observer not found"); return
        }
        let afterFg = String(source[fgRange.upperBound...])
        XCTAssertTrue(
            afterFg.contains("isVideoSuspendedByBackground = false"),
            "willEnterForeground handler must clear isVideoSuspendedByBackground = false " +
            "regardless of whether video was restored — prevents stale flag on next background cycle")
    }

    func test_endCallInternal_resetsVideoSuspendedByBackgroundFlag() throws {
        let source = try callManagerSource()
        guard let teardownRange = source.range(of: "private func endCallInternal(reason:") else {
            XCTFail("endCallInternal not found in CallManager.swift"); return
        }
        let teardownBody = String(source[teardownRange.upperBound...])
        XCTAssertTrue(
            teardownBody.contains("isVideoSuspendedByBackground = false"),
            "endCallInternal must reset isVideoSuspendedByBackground = false so the flag " +
            "does not bleed into the next call (singleton lifecycle)")
    }

    /// When the VideoSurvivalController has already suspended outbound video
    /// (weak network), the foreground observer must NOT re-signal the peer with
    /// `call:media-toggled true` — doing so would falsely indicate our camera is
    /// active while we're still not sending frames.
    func test_foregroundObserver_guardsSurvivalSuspended_beforeRestoringPeer() throws {
        let source = try callManagerSource()
        guard let fgRange = source.range(of: "willEnterForegroundNotification") else {
            XCTFail("willEnterForegroundNotification observer not found"); return
        }
        // Find the block that emits call:media-toggled true on foreground.
        let afterFg = String(source[fgRange.upperBound...])
        // The restoration condition must check `!self.isVideoSuspended` in
        // addition to `self.isVideoEnabled` so that a network-survival suspension
        // in progress before the background is not prematurely cleared.
        XCTAssertTrue(
            afterFg.contains("!self.isVideoSuspended"),
            "willEnterForeground restore must guard on !isVideoSuspended: if the " +
            "VideoSurvivalController already suspended video before we backgrounded, " +
            "emitting call:media-toggled true would signal the peer that our camera is " +
            "active while frames are still paused — showing a frozen/stale feed instead " +
            "of the correct avatar placeholder.")
    }

    /// Validates that the foreground restore emits `call:media-toggled true`
    /// only when BOTH conditions hold: user intent (isVideoEnabled) AND no
    /// network suspension (isVideoSuspended is false).
    func test_foregroundObserver_combinesVideoEnabledAndNotSuspendedGuard() throws {
        let source = try callManagerSource()
        guard let fgRange = source.range(of: "willEnterForegroundNotification") else {
            XCTFail("willEnterForegroundNotification observer not found"); return
        }
        let afterFg = String(source[fgRange.upperBound...])
        // The compound condition must appear together before the emit call.
        XCTAssertTrue(
            afterFg.contains("isVideoEnabled") && afterFg.contains("!self.isVideoSuspended"),
            "willEnterForeground restore must combine isVideoEnabled && !isVideoSuspended " +
            "before calling emitCallToggleVideo(enabled:true)")
    }
}

// MARK: - Socket reconnect video state resync

/// Source-analysis guards for the socket-reconnect video resync fix.
///
/// When the Socket.IO connection drops and reconnects mid-call, the gateway
/// loses the call:media-toggled state for each participant.  After `call:join`
/// is re-emitted the gateway starts fresh — the peer's `isRemoteVideoEnabled`
/// defaults to `true`.  If our camera was off (toggled, survival-suspended, or
/// backgrounded), the peer would incorrectly show our frozen last frame.
///
/// The reconnect sink must re-emit `call:media-toggled` reflecting the effective
/// video state: `isVideoEnabled && !isVideoSuspended && !isVideoSuspendedByBackground`.
@MainActor
final class CallManagerSocketReconnectVideoTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_socketReconnect_reEmitsVideoStateToResyncPeer() throws {
        let source = try callManagerSource()
        guard let reconnectRange = source.range(of: "socket.didReconnect") else {
            XCTFail("socket.didReconnect sink not found in CallManager.swift"); return
        }
        let afterReconnect = String(source[reconnectRange.upperBound...])
        XCTAssertTrue(
            afterReconnect.contains("emitCallToggleVideo"),
            "socket.didReconnect sink must call emitCallToggleVideo to resync " +
            "the peer's isRemoteVideoEnabled after a socket disconnect/reconnect — " +
            "without this, a dropped connection leaves the peer showing stale video state")
    }

    func test_socketReconnect_computesEffectiveVideoStateFromAllSources() throws {
        let source = try callManagerSource()
        guard let reconnectRange = source.range(of: "socket.didReconnect") else {
            XCTFail("socket.didReconnect sink not found in CallManager.swift"); return
        }
        let afterReconnect = String(source[reconnectRange.upperBound...])
        // The effective video state must consider all three suppression sources:
        // user toggle, survival controller, and background suspension.
        XCTAssertTrue(
            afterReconnect.contains("isVideoSuspended") &&
            afterReconnect.contains("isVideoSuspendedByBackground"),
            "socket.didReconnect video resync must factor in isVideoSuspended " +
            "(survival controller) and isVideoSuspendedByBackground (app backgrounded) " +
            "to compute the effective video-on/off state for the peer")
    }
}
