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
}
