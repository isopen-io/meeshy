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

    /// `providerDidReset` fires when CallKit resets ALL calls (crash recovery,
    /// force-quit during a call) — per Apple's guidance the app must behave as
    /// if no calls had ever occurred. `endCall()` alone is insufficient: it
    /// no-ops when `callState` isn't active, which would skip
    /// `deactivateAudioSession()` and leave `RTCAudioSession` stale with no
    /// matching `didDeactivate` callback. The reset handler must disable the
    /// audio session directly, independent of local call state.
    func test_providerDidReset_disablesRTCAudioSession_independentOfCallState() throws {
        let source = try callManagerSource()
        guard let range = source.range(of: "func providerDidReset(_ provider: CXProvider) {") else {
            XCTFail("providerDidReset not found"); return
        }
        let end = source.range(of: "\n    }", range: range.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let body = String(source[range.lowerBound..<end])

        XCTAssertTrue(
            body.contains("RTCAudioSession.sharedInstance()"),
            "providerDidReset must reach into RTCAudioSession directly rather than relying solely on endCall()"
        )
        XCTAssertTrue(
            body.contains("rtc.isAudioEnabled = false"),
            "providerDidReset must unconditionally disable RTCAudioSession, matching Apple's " +
            "\"treat as if no calls had ever occurred\" guidance for a full provider reset"
        )
    }

    /// Every other CXProviderDelegate method that mutates RTCAudioSession
    /// (`didActivate`, `didDeactivate`) routes the lock/mutate/unlock sequence
    /// through `manager?.audioSessionQueue.sync { … }`, the dedicated serial
    /// queue this file uses to serialize ALL RTCAudioSession reconfiguration.
    /// `providerDidReset` bypassed that queue and mutated RTCAudioSession
    /// directly on CallKit's own private delegate queue — a real (if rare,
    /// since a full provider reset is a system-level event) race window
    /// against a concurrent `audioSessionQueue` operation triggered from the
    /// MainActor (e.g. configureAudioSession/deactivateAudioSession).
    func test_providerDidReset_serializesRTCAudioSessionMutation_onAudioSessionQueue() throws {
        let source = try callManagerSource()
        guard let range = source.range(of: "func providerDidReset(_ provider: CXProvider) {") else {
            XCTFail("providerDidReset not found"); return
        }
        let end = source.range(of: "\n    }", range: range.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let body = String(source[range.lowerBound..<end])

        XCTAssertTrue(
            body.contains("manager?.audioSessionQueue.sync"),
            "providerDidReset must route its RTCAudioSession mutation through " +
            "manager?.audioSessionQueue.sync, matching didActivate/didDeactivate, " +
            "to avoid racing a concurrent audioSessionQueue operation."
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
        // P0-8, revised: when a Bluetooth/headset device connects (.newDeviceAvailable),
        // iOS routes audio to it automatically. We sync isSpeaker = false so the
        // speaker-toggle UI reflects reality, AND re-apply via applySpeakerRoute() so any
        // standing `.speaker` RTCAudioSession override from before the accessory connected
        // is cleared — applySpeakerRoute() reads the just-updated `isSpeaker` (now false),
        // so on a real device this resolves to `.none` (clears the override), not `.speaker`.
        // Without the re-apply call, audio could keep routing to the built-in speaker even
        // though the UI now shows the speaker button as off.
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
        guard let newDevRange = fnBody.range(of: "case .newDeviceAvailable:") else {
            XCTFail(".newDeviceAvailable case not found"); return
        }
        let newDevEnd = fnBody.index(newDevRange.upperBound, offsetBy: 300, limitedBy: fnBody.endIndex) ?? fnBody.endIndex
        let newDevBody = String(fnBody[newDevRange.lowerBound ..< newDevEnd])

        XCTAssertTrue(
            newDevBody.contains("isSpeaker = false"),
            ".newDeviceAvailable must set isSpeaker = false — new device (BT/headset) displaces speaker."
        )
        XCTAssertTrue(
            newDevBody.contains("applySpeakerRoute()"),
            ".newDeviceAvailable must call applySpeakerRoute() after clearing isSpeaker, to clear any " +
            "standing `.speaker` RTCAudioSession override left over from before the accessory connected."
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
        // Widened from 2000 (audit finding — toggleVideo() now also chains onto
        // signalOfferAnswerTask before actuating, see the doc-comment on
        // `survivalVideoTask`; the extra capture/await line pushes
        // downgradeFromVideo() further into the body).
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 2500, limitedBy: source.endIndex) ?? source.endIndex
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

    // MARK: - Stats-tick quality gate during ICE restart

    func test_didCollectStats_gatesQualityReportingOnConnectedState() throws {
        // Regression guard: didCollectStats must gate liveVideoQualityLevel,
        // emitCallQualityReport, and videoSurvivalController.handle on
        // callState == .connected.
        //
        // WHY: during ICE restart (.reconnecting) and initial setup (.connecting),
        // the RTP stream pauses. Both Δlost and Δreceived are zero, so the
        // adjustBitrate() heuristic reads RTT=0 and loss=0% — both below the
        // "excellent" threshold. Without the guard:
        //   • liveVideoQualityLevel flips to .excellent while the UI shows "Reconnecting…"
        //   • The gateway receives a spurious "excellent" quality report with rtt=0
        //   • The survival controller resets its degraded-streak timer prematurely
        //     (thinks the link recovered, delaying the next audio-only fallback)
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "func webRTCService(_ service: WebRTCService, didCollectStats stats: CallStats") else {
            XCTFail("didCollectStats not found in CallManager.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 2000, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("case .connected = self.callState"),
            "didCollectStats must guard quality reporting on `case .connected = self.callState` " +
            "— RTT=0/loss=0 during ICE restart produces a spurious .excellent quality reading."
        )
        // lastKnownStats must be updated BEFORE the guard so cumulative byte
        // totals accumulate through reconnection and reach the call summary.
        guard let lastKnownRange = fnBody.range(of: "self.lastKnownStats = stats"),
              let guardRange = fnBody.range(of: "case .connected = self.callState") else {
            XCTFail("lastKnownStats assignment or connected guard not found in didCollectStats"); return
        }
        XCTAssertLessThan(
            lastKnownRange.lowerBound,
            guardRange.lowerBound,
            "lastKnownStats must be updated before the callState guard — " +
            "byte counters must accumulate through ICE restart for the call summary."
        )
    }

    func test_didCollectStats_propagatesJitterMsToQualityReport() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("jitterMs: stats.jitterMs"),
            "webRTCService(_:didCollectStats:) must pass stats.jitterMs to emitCallQualityReport " +
            "so the gateway call:quality-report event carries audio jitter data for diagnostics " +
            "and the call-summary can surface Opus PLC degradation events."
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

    func test_p2pClient_toggleVideo_cancelsStaleTask() throws {
        // Regression guard: toggleVideo must cancel any in-flight capturer task from
        // a prior toggle before spawning a new one. Without this, a rapid off→on
        // sequence leaves both tasks in flight — if disconnect() fires while the
        // startCapture task is suspended the old stopCapture task can run after
        // startCapture completes, leaving the camera stopped with LED off but
        // `videoCapturer` still pointing at a running session.
        //
        // Structural invariants:
        //  1. `toggleVideoTask` property exists (task reference is stored)
        //  2. `toggleVideoTask?.cancel()` is called before the new task is created
        //  3. The new task checks `!Task.isCancelled` before starting camera work
        let source = try p2pClientSource()

        XCTAssertTrue(
            source.contains("private var toggleVideoTask: Task<Void, Never>?"),
            "P2PWebRTCClient must declare `private var toggleVideoTask` to track the in-flight capturer task"
        )
        XCTAssertTrue(
            source.contains("toggleVideoTask?.cancel()"),
            "toggleVideo must cancel the previous task before spawning a new one — prevents stale task races"
        )
        XCTAssertTrue(
            source.contains("!Task.isCancelled"),
            "The toggleVideoTask body must check !Task.isCancelled before performing camera operations"
        )
    }

    func test_p2pClient_restartCapturerIfStopped_hasSessionGenerationGuard() throws {
        // Regression guard: restartCapturerIfStopped must capture sessionGeneration
        // before `await capturer.startCapture(...)` and compare it after, stopping
        // the orphan capturer if the call ended (disconnect() increments the token)
        // during the 0.5–3 s camera warm-up window.
        //
        // Without this guard, a call that ends during toggleVideo(true) leaves the
        // capturer running with `videoCapturer == nil` — there is no path that will
        // ever stop the LED. The pattern mirrors `buildLocalVideoTrackAndStartCapture`
        // which already has the generation check.
        let source = try p2pClientSource()

        guard let fnRange = source.range(of: "private func restartCapturerIfStopped()") else {
            XCTFail("restartCapturerIfStopped not found in P2PWebRTCClient.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1200, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("let generation = sessionGeneration"),
            "restartCapturerIfStopped must capture sessionGeneration before the startCapture await"
        )
        XCTAssertTrue(
            fnBody.contains("generation != sessionGeneration"),
            "restartCapturerIfStopped must compare generation after startCapture to detect a call-end during warm-up"
        )
    }

    func test_p2pClient_switchCamera_hasSessionGenerationGuard() throws {
        // Regression guard: switchCamera() calls stopCapture then startCapture —
        // two sequential async suspensions. A disconnect() that fires in the
        // stop→start window increments sessionGeneration; without the post-start
        // generation check the camera restarts after teardown (LED stays on, no
        // shutdown path). The guard matches buildLocalVideoTrackAndStartCapture
        // and restartCapturerIfStopped.
        let source = try p2pClientSource()

        guard let fnRange = source.range(of: "func switchCamera() async throws {") else {
            XCTFail("switchCamera not found in P2PWebRTCClient.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("let generation = sessionGeneration"),
            "switchCamera must capture sessionGeneration before the stop→start async window"
        )
        XCTAssertTrue(
            fnBody.contains("generation != sessionGeneration"),
            "switchCamera must compare generation after startCapture to detect a call-end during the switch"
        )
    }

    func test_p2pClient_switchToCamera_hasSessionGenerationGuard() throws {
        // Regression guard: switchToCamera(uniqueID:) has the same stop→start race
        // as switchCamera(). A disconnect() in the async window leaves the capturer
        // restarted on a different device after teardown — the session-generation
        // token detects this and stops the orphan via the local reference.
        let source = try p2pClientSource()

        guard let fnRange = source.range(of: "func switchToCamera(uniqueID: String) async throws {") else {
            XCTFail("switchToCamera(uniqueID:) not found in P2PWebRTCClient.swift"); return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1200, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("let generation = sessionGeneration"),
            "switchToCamera(uniqueID:) must capture sessionGeneration before the stop→start async window"
        )
        XCTAssertTrue(
            fnBody.contains("generation != sessionGeneration"),
            "switchToCamera(uniqueID:) must compare generation after startCapture to detect a call-end during the switch"
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

// MARK: - BubbleCallNoticeView Accessibility Source Guards

/// `detailRow`/`qualityRow` in `CallSummaryDetailSheet` lay out icon + label + value as
/// separate sibling views. Without `.accessibilityElement(children: .combine)`, VoiceOver
/// reads each row as 3+ separate stops (e.g. icon SF-Symbol name, then label, then value)
/// instead of one coherent announcement — matches the already-correct pattern in
/// `Contacts/CallDetailSheet.detailRow`.
@MainActor
final class BubbleCallNoticeViewAccessibilityTests: XCTestCase {

    private func bubbleCallNoticeSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_detailRow_combinesAccessibilityChildren() throws {
        let source = try bubbleCallNoticeSource()
        guard let range = source.range(of: "private func detailRow(icon: String, label: String, value: String) -> some View {") else {
            XCTFail("detailRow not found"); return
        }
        let endIdx = source.index(range.upperBound, offsetBy: 900, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound..<endIdx])
        XCTAssertTrue(
            vicinity.contains(".accessibilityElement(children: .combine)"),
            "detailRow must combine its icon/label/value into a single accessibility element, " +
            "matching Contacts/CallDetailSheet.detailRow."
        )
    }

    func test_qualityRow_combinesAccessibilityChildren() throws {
        let source = try bubbleCallNoticeSource()
        guard let range = source.range(of: "private func qualityRow(_ quality: CallSummaryMetadata.NetworkQuality) -> some View {") else {
            XCTFail("qualityRow not found"); return
        }
        let endIdx = source.index(range.upperBound, offsetBy: 1000, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound..<endIdx])
        XCTAssertTrue(
            vicinity.contains(".accessibilityElement(children: .combine)"),
            "qualityRow must combine its icon/label/quality-dot/value into a single accessibility " +
            "element, matching Contacts/CallDetailSheet.detailRow."
        )
        XCTAssertTrue(
            vicinity.contains(".accessibilityHidden(true)"),
            "qualityRow's decorative quality-color Circle must be hidden from VoiceOver — the " +
            "combined element already announces the quality word as text."
        )
    }
}

// MARK: - CallView Hint Text Contrast Source Guards

/// The "waiting for peer" / "video taking longer than expected" hint captions render
/// over the near-black call background. `.white.opacity(0.45)` computes to ~4.4:1
/// contrast, just under WCAG AA's 4.5:1 threshold for small text — guards these stay
/// at a passing opacity.
@MainActor
final class CallViewHintContrastTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_outgoingWaitingHint_meetsContrastThreshold() throws {
        let source = try callViewSource()
        guard let range = source.range(of: "call.outgoing.waiting.hint") else {
            XCTFail("call.outgoing.waiting.hint not found"); return
        }
        let endIdx = source.index(range.upperBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound..<endIdx])
        XCTAssertFalse(
            vicinity.contains(".opacity(0.45)"),
            "the outgoing-waiting hint at .white.opacity(0.45) computes to ~4.4:1 contrast on the " +
            "near-black call background, just under WCAG AA's 4.5:1 threshold for small text."
        )
    }

    func test_videoConnectingSlowHint_meetsContrastThreshold() throws {
        let source = try callViewSource()
        guard let range = source.range(of: "call.video.connecting.slow.hint") else {
            XCTFail("call.video.connecting.slow.hint not found"); return
        }
        let endIdx = source.index(range.upperBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound..<endIdx])
        XCTAssertFalse(
            vicinity.contains(".opacity(0.45)"),
            "the video-connecting-slow hint at .white.opacity(0.45) computes to ~4.4:1 contrast on the " +
            "near-black call background, just under WCAG AA's 4.5:1 threshold for small text."
        )
    }
}

// MARK: - VideoFiltersPanel Accessibility Source Guards

/// Source-level guards ensuring the background-blur and skin-smoothing toggles/sliders
/// in the in-call filters panel are perceivable by VoiceOver. Both controls use
/// `.labelsHidden()` (the adjacent Text is a separate sibling, not a form label), so
/// without an explicit `.accessibilityLabel()` a VoiceOver user hears only
/// "Off/On, switch" or a bare value with no indication of what it controls.
@MainActor
final class VideoFiltersPanelAccessibilityTests: XCTestCase {

    private func filtersPanelSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/VideoFiltersPanel.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_backgroundBlurToggle_hasAccessibilityLabel() throws {
        let source = try filtersPanelSource()
        guard let toggleRange = source.range(of: "Toggle(\"\", isOn: $filterConfig.backgroundBlurEnabled)") else {
            XCTFail("backgroundBlurEnabled Toggle not found"); return
        }
        let endIdx = source.index(toggleRange.upperBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[toggleRange.lowerBound..<endIdx])
        XCTAssertTrue(
            vicinity.contains(".accessibilityLabel("),
            "The background-blur Toggle uses .labelsHidden() so it needs an explicit " +
            ".accessibilityLabel() — otherwise VoiceOver announces only \"Off/On, switch\"."
        )
    }

    func test_skinSmoothingToggle_hasAccessibilityLabel() throws {
        let source = try filtersPanelSource()
        guard let toggleRange = source.range(of: "Toggle(\"\", isOn: $filterConfig.skinSmoothingEnabled)") else {
            XCTFail("skinSmoothingEnabled Toggle not found"); return
        }
        let endIdx = source.index(toggleRange.upperBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[toggleRange.lowerBound..<endIdx])
        XCTAssertTrue(
            vicinity.contains(".accessibilityLabel("),
            "The skin-smoothing Toggle uses .labelsHidden() so it needs an explicit " +
            ".accessibilityLabel() — otherwise VoiceOver announces only \"Off/On, switch\"."
        )
    }

    func test_backgroundBlurRadiusSlider_hasAccessibilityLabel() throws {
        let source = try filtersPanelSource()
        guard let sliderRange = source.range(of: "Slider(value: $filterConfig.backgroundBlurRadius") else {
            XCTFail("backgroundBlurRadius Slider not found"); return
        }
        let endIdx = source.index(sliderRange.upperBound, offsetBy: 250, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[sliderRange.lowerBound..<endIdx])
        XCTAssertTrue(
            vicinity.contains(".accessibilityLabel("),
            "The blur-radius Slider sets .accessibilityValue() but not .accessibilityLabel() — " +
            "VoiceOver would announce the value with no indication of what it controls."
        )
    }

    func test_skinSmoothingIntensitySlider_hasAccessibilityLabel() throws {
        let source = try filtersPanelSource()
        guard let sliderRange = source.range(of: "Slider(value: $filterConfig.skinSmoothingIntensity") else {
            XCTFail("skinSmoothingIntensity Slider not found"); return
        }
        let endIdx = source.index(sliderRange.upperBound, offsetBy: 250, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[sliderRange.lowerBound..<endIdx])
        XCTAssertTrue(
            vicinity.contains(".accessibilityLabel("),
            "The skin-smoothing intensity Slider sets .accessibilityValue() but not " +
            ".accessibilityLabel() — VoiceOver would announce the value with no indication " +
            "of what it controls."
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

    func test_toolbarButton_hasExplicitAccessibilityLabel() throws {
        let source = try callEffectsSource()
        guard let range = source.range(of: "private func toolbarButton") else {
            XCTFail("toolbarButton must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".accessibilityLabel(label)"),
            "toolbarButton must set an explicit .accessibilityLabel(label) rather than relying " +
            "on the visible caption Text being auto-combined into the button's label."
        )
    }

    func test_backdrop_isExposedAsDismissButtonToVoiceOver() throws {
        let source = try callEffectsSource()
        guard let range = source.range(of: "onTapGesture { dismiss() }") else {
            XCTFail("Backdrop tap-to-dismiss gesture must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 400, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            vicinity.contains(".accessibilityAddTraits(.isButton)"),
            "The tap-outside-to-dismiss backdrop must be exposed as a button trait so " +
            "VoiceOver users can discover and trigger it."
        )
        XCTAssertTrue(
            vicinity.contains(".accessibilityLabel("),
            "The backdrop must have an explicit accessibility label describing the dismiss action."
        )
    }

    func test_overlay_pinsColorSchemeDark() throws {
        let source = try callEffectsSource()
        XCTAssertTrue(
            source.contains(".environment(\\.colorScheme, .dark)"),
            "CallEffectsOverlay must pin .dark colorScheme like its sibling call chrome " +
            "(CallWaitingBannerView, FloatingCallPillView) so it renders correctly even if " +
            "ever presented outside CallView's forced-dark subtree."
        )
    }

    func test_filtersPanel_heightIsResponsiveNotHardcoded() throws {
        let source = try callEffectsSource()
        XCTAssertFalse(
            source.contains(".frame(maxHeight: 360)"),
            "The filters panel must not hardcode a fixed maxHeight — it must derive from " +
            "available geometry so it doesn't clip content on short/landscape viewports."
        )
        XCTAssertTrue(
            source.contains("proxy.size.height"),
            "The filters panel height must be derived from a GeometryReader proxy."
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
final class CallManagerCallKitDTMFTests: XCTestCase {

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

    private func dtmfHandlerBody(in source: String) throws -> String {
        let handlerRange = try XCTUnwrap(source.range(of: "perform action: CXPlayDTMFCallAction"))
        let afterHandler = String(source[handlerRange.upperBound...])
        let nextHandlerBoundary = afterHandler.range(of: "func provider")?.lowerBound
            ?? afterHandler.endIndex
        return String(afterHandler[..<nextHandlerBoundary])
    }

    func test_dtmfHandler_forwardsDigitsToWebRTCService() throws {
        let handlerBody = try dtmfHandlerBody(in: try callManagerSource())
        XCTAssertTrue(
            handlerBody.contains("sendDTMF(digits: digits)"),
            "CXPlayDTMFCallAction handler must forward action.digits to webRTCService.sendDTMF")
    }

    func test_dtmfHandler_fulfillsAction() throws {
        let handlerBody = try dtmfHandlerBody(in: try callManagerSource())
        XCTAssertTrue(
            handlerBody.contains("action.fulfill()"),
            "CXPlayDTMFCallAction handler must call action.fulfill() so CallKit does not timeout")
    }

    /// Regression guard for the actor-isolation bug fixed 2026-07-04: `CXProvider.setDelegate(_:queue:
    /// nil)` dispatches this callback on CallKit's own private serial queue, not main, so calling straight
    /// into the @MainActor-isolated `sendDTMF` raced with other MainActor call-state work. Every sibling
    /// delegate method (answer/end/mute/hold) hops via `Task { @MainActor [weak self] in ... }`; DTMF must too.
    func test_dtmfHandler_hopsToMainActorBeforeForwarding() throws {
        let handlerBody = try dtmfHandlerBody(in: try callManagerSource())
        XCTAssertTrue(
            handlerBody.contains("Task { @MainActor [weak self] in"),
            "CXPlayDTMFCallAction handler must hop to the MainActor (matching every sibling CXProvider delegate method) instead of calling the @MainActor-isolated sendDTMF directly from CallKit's private queue")
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
            source.contains("AVAudioSession.mediaServicesWereResetNotification"),
            "mediaServicesWereResetNotification must be observed — a media server crash otherwise " +
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
            source.contains("adaptiveOnChange(of: callManager.isLinkQualityDegraded)"),
            "Quality VoiceOver announcement must use adaptiveOnChange on the " +
            "SUSTAINED degradation flag so it only fires when the link is " +
            "genuinely degraded (2+ consecutive ticks), not on transient spikes")
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

    func test_backgroundObserver_promotesStillRingingCallToCallKit() throws {
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
            bgBlock.contains("promoteRingingCallToCallKitIfNeeded"),
            "didEnterBackground handler must call promoteRingingCallToCallKitIfNeeded() — a call " +
            "that rang in while the app was foreground (CallKit skipped) has NO system-level " +
            "backing; backgrounding before answering must promote it or iOS can suspend the app " +
            "mid-ring with no lock-screen call card, silently dropping the inbound call")
    }

    func test_promoteRingingCallToCallKitIfNeeded_guardsOnRingingIncomingNotYetOnCallKit() throws {
        let source = try callManagerSource()
        guard let fnRange = source.range(of: "private func promoteRingingCallToCallKitIfNeeded()") else {
            XCTFail("promoteRingingCallToCallKitIfNeeded not found in CallManager.swift"); return
        }
        let afterFn = String(source[fnRange.upperBound...])
        guard let fnEnd = afterFn.range(of: "private func startBackgroundMonitoring")?.lowerBound else {
            XCTFail("Could not find promoteRingingCallToCallKitIfNeeded boundary"); return
        }
        let fnBody = String(afterFn[..<fnEnd])
        XCTAssertTrue(
            fnBody.contains("case .ringing(isOutgoing: false) = callState"),
            "must only promote a still-ringing INCOMING call — an outgoing call or an already " +
            "answered/connected call must never be re-reported to CallKit")
        XCTAssertTrue(
            fnBody.contains("!callUsesCallKit"),
            "must skip promotion when the call already has a CallKit registration — re-reporting " +
            "an already-registered call would be a duplicate CXProvider call")
        XCTAssertTrue(
            fnBody.contains("platformSupportsCallKit"),
            "must never attempt CallKit where the platform stack is broken — iOS-app-on-Mac " +
            "(reportNewIncomingCall fails, CXErrorCodeIncomingCallError 3, cf. CALL-FIX 2026-06-06) " +
            "and the simulator (callservicesd autonomous CXEndCallAction ~3s after start) — " +
            "gate via CallManager.platformSupportsCallKit")
        XCTAssertTrue(
            fnBody.contains("callProvider.reportNewIncomingCall"),
            "must actually register the call with CXProvider, not just flip local flags")
        XCTAssertTrue(
            fnBody.contains("callUsesCallKit = false") && fnBody.contains("error"),
            "on reportNewIncomingCall failure, must roll back callUsesCallKit so the app doesn't " +
            "believe it has system backing it never actually got")
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

// MARK: - Camera Permission Denied — All Call Entry Points

/// AVCaptureSession silently fails to start when the user has denied camera
/// access in iOS Settings: no throw, no frames, black PiP.  Every path that
/// calls `startLocalMedia(isVideo: true)` must catch `cameraPermissionDenied`
/// and degrade to audio-only rather than leaving the call in an inconsistent
/// video-enabled-but-no-camera state.
///
/// Four entry points in CallManager:
///   1. toggleVideo()             — mid-call camera toggle
///   2. setupCallTask (outgoing)  — caller side during call setup
///   3. VoIP push incoming        — callee side from PKPushPayload
///   4. Socket incoming           — callee side from socket notification:incoming-call
@MainActor
final class CallManagerCameraPermissionTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_cameraPermissionDenied_handledIn_toggleVideo() throws {
        let source = try callManagerSource()
        guard let fnRange = source.range(of: "func toggleVideo(") else {
            XCTFail("toggleVideo() not found in CallManager.swift"); return
        }
        let fnBody = String(source[fnRange.upperBound...])
        XCTAssertTrue(
            fnBody.contains("WebRTCError.cameraPermissionDenied"),
            "toggleVideo() must catch cameraPermissionDenied to degrade gracefully " +
            "to audio-only when the user has revoked camera permission mid-call")
    }

    func test_cameraPermissionDenied_handledIn_outgoingCallSetup() throws {
        let source = try callManagerSource()
        guard let setupRange = source.range(of: "setupCallTask") else {
            XCTFail("setupCallTask not found in CallManager.swift"); return
        }
        let afterSetup = String(source[setupRange.upperBound...])
        XCTAssertTrue(
            afterSetup.contains("WebRTCError.cameraPermissionDenied"),
            "outgoing call setupCallTask must catch cameraPermissionDenied — " +
            "a denied camera should not abort the call, only degrade to audio-only")
    }

    func test_cameraPermissionDenied_handledIn_voipPushIncoming() throws {
        let source = try callManagerSource()
        // VoIP push path enters via reportIncomingVoIPCall (PKPushRegistry delegate → CallKit)
        guard let voipRange = source.range(of: "func reportIncomingVoIPCall(") else {
            XCTFail("reportIncomingVoIPCall not found in CallManager.swift"); return
        }
        let afterVoip = String(source[voipRange.upperBound...])
        XCTAssertTrue(
            afterVoip.contains("WebRTCError.cameraPermissionDenied"),
            "VoIP push incoming call path must catch cameraPermissionDenied — " +
            "a user answering an incoming call without camera permission must still " +
            "connect audio-only, not silently hang or fail")
    }

    func test_cameraPermissionDenied_handledIn_socketIncoming() throws {
        let source = try callManagerSource()
        // Socket-based incoming calls arrive via handleIncomingCallNotification,
        // invoked from the callOfferReceived sink (socket "call:signal" offer path).
        guard let socketRange = source.range(of: "func handleIncomingCallNotification(") else {
            XCTFail("handleIncomingCallNotification not found in CallManager.swift"); return
        }
        let afterSocket = String(source[socketRange.upperBound...])
        XCTAssertTrue(
            afterSocket.contains("WebRTCError.cameraPermissionDenied"),
            "socket incoming call path must catch cameraPermissionDenied — " +
            "receiver with denied camera must still join audio-only without user-visible failure")
    }

    func test_cameraPermissionDenied_showsSettingsToast_inToggleVideo() throws {
        let source = try callManagerSource()
        guard let fnRange = source.range(of: "func toggleVideo(") else {
            XCTFail("toggleVideo() not found"); return
        }
        let fnBody = String(source[fnRange.upperBound...])
        // Within the cameraPermissionDenied catch, the toast must be tappable
        // and open Settings — the tap action is the primary remediation UX.
        XCTAssertTrue(
            fnBody.contains("openSettingsURLString"),
            "toggleVideo() cameraPermissionDenied handler must show a tappable toast " +
            "that deep-links to App Settings so the user can grant camera access")
    }

    func test_webRTCTypes_declaresCameraPermissionDeniedError() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/WebRTCTypes.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            source.contains("case cameraPermissionDenied"),
            "WebRTCError must declare cameraPermissionDenied so CallManager can " +
            "catch it specifically and provide an actionable recovery path")
    }

    func test_p2pWebRTCClient_checksPermissionBeforeBuildingTrack() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            source.contains("AVCaptureDevice.authorizationStatus(for: .video)"),
            "P2PWebRTCClient must check AVCaptureDevice.authorizationStatus before " +
            "building the local video track — AVCaptureSession silently fails with " +
            "denied permission, so the guard must come first and throw a typed error")
        XCTAssertTrue(
            source.contains("throw WebRTCError.cameraPermissionDenied"),
            "P2PWebRTCClient must throw cameraPermissionDenied (not silently proceed) " +
            "when camera access is .denied or .restricted")
    }
}

// MARK: - Call Duration Preserved on Reconnect

/// Guards against a UX regression where `transitionToConnected()` resets
/// `callStartDate` and `callDuration` on EVERY transition — including when
/// coming from `.reconnecting`. Without this guard the call timer jumps back
/// to 0:00 after a successful ICE restart, and the "connected" audio cue plays
/// again mid-call. A successful reconnect should continue the existing timer.
@MainActor
final class CallManagerDurationReconnectTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_transitionToConnected_doesNotResetDurationOnReconnect() throws {
        let source = try callManagerSource()
        guard let fnRange = source.range(of: "private func transitionToConnected()") else {
            XCTFail("transitionToConnected() not found in CallManager.swift"); return
        }
        // Find the callStartDate = Date() assignment within the function
        guard let assignRange = source[fnRange.upperBound...].range(of: "callStartDate = Date()") else {
            XCTFail("callStartDate = Date() not found after transitionToConnected()"); return
        }
        // The assignment must be gated by the pure clock-reset policy: reset on
        // a fresh connect AND on a first-ever connect that transited through
        // `.reconnecting` (nil clock — else the timer froze at 00:00 forever),
        // but NEVER on a genuine mid-call reconnect with a running clock (else
        // the timer jumps back to 0:00 after a successful ICE restart). The
        // decision semantics are unit-tested in CallClockPolicyTests.
        let contextStart = source.index(assignRange.lowerBound, offsetBy: -300, limitedBy: source.startIndex) ?? source.startIndex
        let contextStr = String(source[contextStart ..< assignRange.upperBound])
        XCTAssertTrue(
            contextStr.contains("shouldResetCallClock"),
            "callStartDate must only be reset when CallReliabilityPolicy.shouldResetCallClock " +
            "allows it (fresh connect or nil clock) — resetting it on every " +
            "transitionToConnected call causes the timer to jump back to 0:00 " +
            "after a successful ICE restart, which is a jarring mid-call UX regression")
        XCTAssertTrue(
            contextStr.contains("wasReconnecting: wasReconnecting"),
            "the clock-reset decision must receive the real wasReconnecting flag")
    }

    func test_transitionToConnected_doesNotPlayConnectCueOnReconnect() throws {
        let source = try callManagerSource()
        guard let fnRange = source.range(of: "private func transitionToConnected()") else {
            XCTFail("transitionToConnected() not found"); return
        }
        guard let cueRange = source[fnRange.upperBound...].range(of: "playConnected()") else {
            XCTFail("playConnected() not found after transitionToConnected()"); return
        }
        let contextStart = source.index(cueRange.lowerBound, offsetBy: -200, limitedBy: source.startIndex) ?? source.startIndex
        let contextStr = String(source[contextStart ..< cueRange.upperBound])
        XCTAssertTrue(
            contextStr.contains("!wasReconnecting") || contextStr.contains("wasReconnecting == false"),
            "playConnected() must be gated on !wasReconnecting — replaying the " +
            "connect audio cue mid-call after an ICE restart is jarring")
    }
}

// MARK: - ICE Candidate Buffer & TURN Refresh on Reconnect

/// Guards two production-grade reliability fixes:
///
/// 1. **ICE candidate buffer cap** — `pendingIceCandidates` is filled while
///    the socket is down. Without a cap, aggressive trickle-ICE (50+ candidates
///    per restart) can fill unboundedly, then flood the signalling channel on
///    reconnect with stale candidates that belong to a superseded ICE generation.
///
/// 2. **TURN refresh on socket reconnect** — the periodic scheduler fires at
///    80% of the TTL. If the socket was down for the remaining 20% of the
///    window, TURN credentials approach expiry before a refresh can fire.
///    After reconnect, proactively requesting fresh credentials ensures the
///    next ICE restart uses valid relay paths.
@MainActor
final class CallManagerIceCandidateBufferTests: XCTestCase {

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

    func test_pendingIceCandidatesBuffer_hasOverflowGuard() throws {
        let source = try callManagerSource()
        guard let appendRange = source.range(of: "pendingIceCandidates.append") else {
            XCTFail("pendingIceCandidates.append not found in CallManager.swift"); return
        }
        let contextStart = source.index(appendRange.lowerBound, offsetBy: -300, limitedBy: source.startIndex) ?? source.startIndex
        let contextStr = String(source[contextStart ..< appendRange.upperBound])
        XCTAssertTrue(
            contextStr.contains("maxPendingIceCandidates") || contextStr.contains("count <"),
            "pendingIceCandidates.append must be guarded by an overflow check — " +
            "unbounded growth during extended socket outages floods signalling on reconnect " +
            "with stale candidates from a superseded ICE generation")
    }

    func test_qualityThresholds_declaresMaxPendingIceCandidates() throws {
        let source = try webRTCTypesSource()
        XCTAssertTrue(
            source.contains("maxPendingIceCandidates"),
            "QualityThresholds must declare maxPendingIceCandidates so the cap value " +
            "is co-located with other thresholds and documented alongside the rationale")
    }

    func test_socketReconnect_requestsFreshTURNCredentials() throws {
        let source = try callManagerSource()
        guard let reconnectRange = source.range(of: "socket.didReconnect") else {
            XCTFail("socket.didReconnect sink not found in CallManager.swift"); return
        }
        let afterReconnect = String(source[reconnectRange.upperBound...])
        XCTAssertTrue(
            afterReconnect.contains("emitRequestIceServers"),
            "socket.didReconnect sink must call emitRequestIceServers after rejoining " +
            "the call room — the socket may have been down long enough for TURN " +
            "credentials to approach expiry before the periodic 80%-of-TTL refresh " +
            "fires. Proactive refresh keeps relay paths valid for the next ICE restart.")
    }
}

// MARK: - Mute state broadcast tests

final class CallManagerMuteStateTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// toggleMute() must emit call:toggle-audio so the remote peer can show a
    /// mute indicator. Without it, the remote UI always thinks our mic is live.
    func test_toggleMute_emitsCallToggleAudio() throws {
        let source = try callManagerSource()
        guard let toggleMuteRange = source.range(of: "func toggleMute()") else {
            XCTFail("toggleMute() not found in CallManager.swift"); return
        }
        // Find the closing brace of toggleMute by scanning forward.
        let afterToggleMute = String(source[toggleMuteRange.upperBound...])
        guard let nextFuncRange = afterToggleMute.range(of: "\n    func ") else {
            XCTFail("Could not isolate toggleMute body"); return
        }
        let body = String(afterToggleMute[..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("emitCallToggleAudio"),
            "toggleMute() must call emitCallToggleAudio to broadcast mute state — " +
            "WebRTC track muting silences audio locally, but the remote peer needs " +
            "call:toggle-audio to display a mute indicator in its UI")
    }

    /// The emitCallToggleAudio call must pass `enabled: !isMuted` — enabled=false
    /// means muted, enabled=true means live microphone.
    func test_toggleMute_emitsAudioEnabled_asInverseOfIsMuted() throws {
        let source = try callManagerSource()
        guard let toggleMuteRange = source.range(of: "func toggleMute()") else {
            XCTFail("toggleMute() not found"); return
        }
        let afterToggleMute = String(source[toggleMuteRange.upperBound...])
        guard let nextFuncRange = afterToggleMute.range(of: "\n    func ") else {
            XCTFail("Could not isolate toggleMute body"); return
        }
        let body = String(afterToggleMute[..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("enabled: !isMuted"),
            "emitCallToggleAudio in toggleMute() must pass `enabled: !isMuted` — " +
            "the gateway's `enabled` field means 'audio is on', which is the logical " +
            "inverse of the local isMuted flag")
    }

    /// socket.didReconnect must re-sync audio mute state. On reconnect the gateway
    /// resets participant media and the peer assumes our mic is live, which is wrong
    /// if we were muted when the socket dropped.
    func test_socketReconnect_resyncsAudioMuteState() throws {
        let source = try callManagerSource()
        guard let reconnectRange = source.range(of: "socket.didReconnect") else {
            XCTFail("socket.didReconnect sink not found"); return
        }
        // Scan to the matching .store(in: block to isolate just this sink body.
        let afterReconnect = String(source[reconnectRange.upperBound...])
        guard let storeRange = afterReconnect.range(of: ".store(in: &cancellables)") else {
            XCTFail("Could not find .store after socket.didReconnect"); return
        }
        let sinkBody = String(afterReconnect[..<storeRange.lowerBound])
        XCTAssertTrue(
            sinkBody.contains("emitCallToggleAudio"),
            "socket.didReconnect must re-emit call:toggle-audio to restore the " +
            "remote peer's view of our mute state — the gateway resets per-participant " +
            "media when a socket disconnects, so without a re-sync the peer always " +
            "assumes our mic is live after reconnect")
    }
}

// MARK: - Remote audio mute state tests

final class CallManagerRemoteAudioStateTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// CallManager must declare isRemoteAudioEnabled so the call UI can show a
    /// "contact is muted" indicator when the remote peer silences their mic.
    func test_callManager_declaresIsRemoteAudioEnabled() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("isRemoteAudioEnabled"),
            "CallManager must declare isRemoteAudioEnabled — the remote peer's " +
            "call:toggle-audio events (mediaType=audio) must drive a published " +
            "property so the UI can display a mute indicator without polling")
    }

    /// The callMediaToggled sink must handle mediaType=="audio" and update
    /// isRemoteAudioEnabled. The old guard `event.mediaType == "video"` dropped
    /// audio events silently and left isRemoteAudioEnabled permanently at true.
    func test_callMediaToggledSink_handlesAudioMediaType() throws {
        let source = try callManagerSource()
        guard let mediaToggledRange = source.range(of: "socket.callMediaToggled") else {
            XCTFail("socket.callMediaToggled sink not found"); return
        }
        guard let storeRange = source.range(of: ".store(in: &cancellables)", range: mediaToggledRange.upperBound..<source.endIndex) else {
            XCTFail("Could not find .store after callMediaToggled"); return
        }
        let sinkBody = String(source[mediaToggledRange.upperBound..<storeRange.lowerBound])
        XCTAssertTrue(
            sinkBody.contains("\"audio\""),
            "callMediaToggled sink must handle mediaType==\"audio\" — a guard that " +
            "only passes \"video\" silently drops remote audio toggle events and " +
            "leaves isRemoteAudioEnabled permanently stale at true")
        XCTAssertTrue(
            sinkBody.contains("isRemoteAudioEnabled"),
            "callMediaToggled sink must update isRemoteAudioEnabled when mediaType==\"audio\"")
    }

    /// isRemoteAudioEnabled must be reset to true in endCallInternal so it
    /// doesn't leak across calls (next caller incorrectly shown as muted).
    func test_endCallInternal_resetsIsRemoteAudioEnabled() throws {
        let source = try callManagerSource()
        guard let endInternalRange = source.range(of: "func endCallInternal(reason:") else {
            XCTFail("endCallInternal not found"); return
        }
        guard let nextFuncRange = source.range(of: "\n    private func ", range: endInternalRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate endCallInternal body"); return
        }
        let body = String(source[endInternalRange.upperBound..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("isRemoteAudioEnabled = true"),
            "endCallInternal must reset isRemoteAudioEnabled to true — otherwise " +
            "the next call's remote user appears muted if the previous call ended " +
            "while the remote peer was muted")
    }

    /// CallView must display a remote-muted indicator when isRemoteAudioEnabled is false.
    func test_callView_showsRemoteMuteIndicator() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("isRemoteAudioEnabled"),
            "CallView must check isRemoteAudioEnabled to show a 'contact is muted' " +
            "indicator — without it the local user has no indication why the remote " +
            "peer sounds silent (FaceTime parity)")
    }
}

// MARK: - call:join / call:request-ice-servers race condition tests

/// Guards the fix for the room-membership race between call:join and room-scoped events.
/// The gateway's call:join handler is async (rate-limit check + DB + socket.join) — if
/// we send call:request-ice-servers before socket.join() resolves, the gateway's
/// `socket.rooms.has(ROOMS.call(callId))` guard returns false and the event is silently
/// dropped. Fix: emitCallJoinWithAck awaits the ACK before proceeding.
@MainActor
final class CallManagerJoinRaceTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func socketManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// socket.didReconnect must use emitCallJoinWithAck (ACK-aware) rather than
    /// fire-and-forget emitCallJoin so room-scoped events are sent only after the
    /// gateway has put this socket in the call room.
    func test_socketReconnect_usesAckAwareJoin() throws {
        let source = try callManagerSource()
        guard let reconnectRange = source.range(of: "socket.didReconnect") else {
            XCTFail("socket.didReconnect sink not found in CallManager.swift"); return
        }
        let afterReconnect = String(source[reconnectRange.upperBound...])
        guard let storeRange = afterReconnect.range(of: ".store(in: &cancellables)") else {
            XCTFail("Could not find .store(in:) after socket.didReconnect"); return
        }
        let sinkBody = String(afterReconnect[..<storeRange.lowerBound])
        XCTAssertTrue(
            sinkBody.contains("emitCallJoinWithAck"),
            "socket.didReconnect must use emitCallJoinWithAck rather than emitCallJoin " +
            "— the ACK-aware variant awaits the gateway's async call:join (DB lookup + " +
            "socket.join) before sending room-scoped events. Fire-and-forget lets " +
            "call:request-ice-servers arrive while socket.rooms.has(callRoom) is still " +
            "false, silently dropping the event.")
        XCTAssertFalse(
            sinkBody.contains("emitCallJoin(callId:"),
            "socket.didReconnect must not use bare fire-and-forget emitCallJoin — " +
            "replace with emitCallJoinWithAck to await room membership before sending " +
            "room-scoped events (ICE flush, media resync, TURN refresh)")
    }

    /// Post-join operations must be deferred inside an async Task so they execute
    /// AFTER the ACK resolves.  Placing them synchronously before the await defeats
    /// the entire purpose of using the ACK-aware join variant.
    func test_socketReconnect_postsJoinWorkInsideTask() throws {
        let source = try callManagerSource()
        guard let reconnectRange = source.range(of: "socket.didReconnect") else {
            XCTFail("socket.didReconnect sink not found in CallManager.swift"); return
        }
        let afterReconnect = String(source[reconnectRange.upperBound...])
        guard let storeRange = afterReconnect.range(of: ".store(in: &cancellables)") else {
            XCTFail("Could not find .store(in:) after socket.didReconnect"); return
        }
        let sinkBody = String(afterReconnect[..<storeRange.lowerBound])
        XCTAssertTrue(
            sinkBody.contains("Task {"),
            "socket.didReconnect must wrap post-join work in an async Task so that " +
            "flushPendingIceCandidates, emitCallToggleVideo, emitCallToggleAudio, and " +
            "emitRequestIceServers are sent AFTER the ACK resolves and the gateway has " +
            "completed socket.join() for the call room")
    }

    /// The protocol must declare emitCallJoinWithAck so conforming mocks get the
    /// default no-op from the extension and need no manual update.
    func test_messageSocketProvidingProtocol_declaresEmitCallJoinWithAck() throws {
        let source = try socketManagerSource()
        guard let protocolRange = source.range(of: "public protocol MessageSocketProviding") else {
            XCTFail("MessageSocketProviding protocol not found in MessageSocketManager.swift"); return
        }
        guard let endBraceRange = source.range(of: "}", range: protocolRange.upperBound..<source.endIndex) else {
            XCTFail("Could not find closing brace of MessageSocketProviding"); return
        }
        let protocolBody = String(source[protocolRange.upperBound..<endBraceRange.lowerBound])
        XCTAssertTrue(
            protocolBody.contains("emitCallJoinWithAck"),
            "MessageSocketProviding must declare emitCallJoinWithAck(callId:) async -> Bool " +
            "so any conformer (including test mocks) automatically gets the ACK-aware join " +
            "path via the default no-op in the protocol extension")
    }

    /// MessageSocketManager must implement emitCallJoinWithAck with a timeout so
    /// callers can await room membership without blocking indefinitely.
    func test_messageSocketManager_implementsEmitCallJoinWithAck() throws {
        let source = try socketManagerSource()
        XCTAssertTrue(
            source.contains("func emitCallJoinWithAck(callId: String) async -> Bool"),
            "MessageSocketManager must implement emitCallJoinWithAck(callId:) async -> Bool " +
            "— the ACK-aware join that awaits the gateway confirmation before returning, " +
            "eliminating the race with room-scoped events on socket reconnect")
        XCTAssertTrue(
            source.contains("timingOut(after:"),
            "emitCallJoinWithAck must use socket.emitWithAck with timingOut to prevent " +
            "hanging indefinitely if the gateway is slow or the call has already ended")
    }
}

// MARK: - Remote screen capture alert tests

/// Guards the end-to-end path for notifying the local user when the remote peer
/// starts or stops capturing the call screen. The gateway relays call:screen-capture-alert
/// to the other participant — without an SDK subscriber and a CallManager property the
/// signal arrives and is silently discarded.
@MainActor
final class CallManagerScreenCaptureAlertTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func socketManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// CallManager must declare isRemoteScreenCapturing so the call UI can
    /// display a privacy warning when the remote peer is recording.
    func test_callManager_declaresIsRemoteScreenCapturing() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("isRemoteScreenCapturing"),
            "CallManager must declare isRemoteScreenCapturing — the remote peer's " +
            "call:screen-capture-alert events must drive a published property so " +
            "CallView can show a privacy warning without polling")
    }

    /// CallManager must subscribe to socket.callScreenCaptureAlert to receive
    /// the event from the SDK and update isRemoteScreenCapturing.
    func test_callManager_subscribesToScreenCaptureAlert() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("socket.callScreenCaptureAlert"),
            "CallManager must subscribe to socket.callScreenCaptureAlert — " +
            "without a sink the call:screen-capture-alert event from the gateway " +
            "is silently discarded and isRemoteScreenCapturing is never updated")
    }

    /// isRemoteScreenCapturing must be reset to false in endCallInternal so the
    /// recording indicator does not leak into the next call.
    func test_endCallInternal_resetsIsRemoteScreenCapturing() throws {
        let source = try callManagerSource()
        guard let endInternalRange = source.range(of: "func endCallInternal(reason:") else {
            XCTFail("endCallInternal not found"); return
        }
        guard let nextFuncRange = source.range(of: "\n    private func ", range: endInternalRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate endCallInternal body"); return
        }
        let body = String(source[endInternalRange.upperBound..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("isRemoteScreenCapturing = false"),
            "endCallInternal must reset isRemoteScreenCapturing to false — otherwise " +
            "the recording warning stays visible at the start of the next call even " +
            "though the new remote peer may not be capturing")
    }

    /// The SDK protocol must declare callScreenCaptureAlert so any conforming
    /// mock automatically satisfies the requirement.
    func test_messageSocketProviding_declaresCallScreenCaptureAlert() throws {
        let source = try socketManagerSource()
        guard let protocolRange = source.range(of: "public protocol MessageSocketProviding") else {
            XCTFail("MessageSocketProviding not found"); return
        }
        guard let endBraceRange = source.range(of: "}", range: protocolRange.upperBound..<source.endIndex) else {
            XCTFail("Closing brace of MessageSocketProviding not found"); return
        }
        let protocolBody = String(source[protocolRange.upperBound..<endBraceRange.lowerBound])
        XCTAssertTrue(
            protocolBody.contains("callScreenCaptureAlert"),
            "MessageSocketProviding must declare callScreenCaptureAlert publisher so " +
            "CallManager can subscribe to screen-capture-alert events without accessing " +
            "the concrete MessageSocketManager type directly")
    }

    /// The SDK must register a socket.on listener for call:screen-capture-alert
    /// and publish received events via callScreenCaptureAlert.
    func test_messageSocketManager_listensForScreenCaptureAlert() throws {
        let source = try socketManagerSource()
        XCTAssertTrue(
            source.contains("\"call:screen-capture-alert\""),
            "MessageSocketManager must register a socket.on(\"call:screen-capture-alert\") " +
            "listener — the gateway relays this event to the remote participant but " +
            "without a listener the iOS client never sees it")
        XCTAssertTrue(
            source.contains("callScreenCaptureAlert.send"),
            "MessageSocketManager must forward decoded call:screen-capture-alert events " +
            "via callScreenCaptureAlert.send() so CallManager's Combine sink fires")
    }

    /// CallView must check isRemoteScreenCapturing to display a recording indicator.
    func test_callView_showsRecordingIndicator() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("isRemoteScreenCapturing"),
            "CallView must check isRemoteScreenCapturing to display a recording warning " +
            "pill — the local user must know when the remote peer is capturing the call " +
            "so they can make an informed privacy decision")
    }
}

// MARK: - ICE / TURN Hardening Tests

/// Source-analysis tests for the three reliability fixes:
/// (1) pendingIceRestart cleared on P2PWebRTCClient.disconnect(),
/// (2) TURN TTL zero guard,
/// (3) flushPendingIceCandidates socket liveness check.
@MainActor
final class CallManagerHardeningTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func p2pClientSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
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

    /// P2PWebRTCClient.disconnect() must nil the transceiver sender tracks before
    /// calling peerConnection.close() to release libwebrtc's internal track refs.
    /// Without this, RTCMediaStreamTrack objects survive until the RTCPeerConnection
    /// is deallocated, which can happen long after the call ends if a pending
    /// callback holds a strong reference to it.
    func test_p2pWebRTCClient_disconnect_nilsTransceiverSenderTracksBeforeClose() throws {
        let source = try p2pClientSource()
        guard let disconnectRange = source.range(of: "func disconnect()") else {
            XCTFail("disconnect() not found in P2PWebRTCClient"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: disconnectRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate disconnect() body"); return
        }
        let body = String(source[disconnectRange.upperBound..<closingBrace.lowerBound])

        XCTAssertTrue(
            body.contains("audioTransceiver?.sender.track = nil"),
            "disconnect() must nil audioTransceiver.sender.track before close() — " +
            "libwebrtc holds a strong ref to the track until the peer connection is " +
            "deallocated, which can outlive the call if a pending callback retains it")
        XCTAssertTrue(
            body.contains("videoTransceiver?.sender.track = nil"),
            "disconnect() must nil videoTransceiver.sender.track before close() — " +
            "same reasoning as the audio track: explicit nil forces ARC to collect " +
            "the camera capture pipeline at call teardown, not at some later deinit")

        // Confirm ordering: sender.track nils must appear before peerConnection.close()
        guard let audioNilIdx = body.range(of: "audioTransceiver?.sender.track = nil"),
              let closeIdx = body.range(of: "peerConnection?.close()") else {
            XCTFail("Could not locate both sender.track nil and peerConnection.close() in disconnect() body"); return
        }
        XCTAssertTrue(
            audioNilIdx.upperBound < closeIdx.lowerBound,
            "audioTransceiver?.sender.track = nil must precede peerConnection?.close() — " +
            "after close() the sender is stopped; the nil must happen before to ensure " +
            "the track is detached while the transceiver is still in a valid state")
    }

    /// P2PWebRTCClient.disconnect() must reset pendingIceRestart so the flag
    /// never leaks into the next call and causes a spurious ICE restart offer.
    func test_p2pWebRTCClient_disconnect_resetsPendingIceRestart() throws {
        let source = try p2pClientSource()
        guard let disconnectRange = source.range(of: "func disconnect()") else {
            XCTFail("disconnect() not found in P2PWebRTCClient"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: disconnectRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate disconnect() body"); return
        }
        let body = String(source[disconnectRange.upperBound..<closingBrace.lowerBound])
        XCTAssertTrue(
            body.contains("pendingIceRestart = false"),
            "P2PWebRTCClient.disconnect() must reset pendingIceRestart — without this " +
            "a stale flag from a prior ICE restart persists into the next call and " +
            "causes the first offer to unnecessarily request an ICE restart")
    }

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `WebRTCService.close()` must tear down via `disconnectAfterFlushingPendingSend()`,
    /// not `client.disconnect()` directly. `CallManager.endCall()` sends the P2P
    /// hangup `bye` on the DataChannel immediately before this runs; `sendData`
    /// only enqueues onto libwebrtc's SCTP thread, so closing the peer connection
    /// synchronously right after can silently drop the just-enqueued `bye` —
    /// degrading the "instant hangup" fast path back to the slower socket
    /// `call:end` fanout it exists to bypass.
    func test_webRTCService_close_usesFlushAwareDisconnect() throws {
        let source = try webRTCServiceSource()
        guard let closeRange = source.range(of: "func close()") else {
            XCTFail("close() not found in WebRTCService"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: closeRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate close() body"); return
        }
        let body = String(source[closeRange.upperBound..<closingBrace.lowerBound])
        XCTAssertTrue(
            body.contains("client.disconnectAfterFlushingPendingSend()"),
            "close() must call client.disconnectAfterFlushingPendingSend() so a just-sent " +
            "hangup `bye` gets a chance to flush before the transport is torn down")
        XCTAssertFalse(
            body.contains("client.disconnect()"),
            "close() must not call client.disconnect() directly — that races the hangup " +
            "`bye` send against the peer connection teardown")
    }

    /// `disconnectAfterFlushingPendingSend()` must be a no-op difference from
    /// `disconnect()` when nothing is buffered on the DataChannel — it should not
    /// add latency to the overwhelming majority of hangups (remote hangup, error
    /// paths, or a `bye` that already flushed before this runs).
    func test_p2pWebRTCClient_disconnectAfterFlushingPendingSend_earlyReturnsWhenNothingBuffered() throws {
        let source = try p2pClientSource()
        guard let methodRange = source.range(of: "func disconnectAfterFlushingPendingSend()") else {
            XCTFail("disconnectAfterFlushingPendingSend() not found in P2PWebRTCClient"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: methodRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate disconnectAfterFlushingPendingSend() body"); return
        }
        let body = String(source[methodRange.upperBound..<closingBrace.lowerBound])
        XCTAssertTrue(
            body.contains("bufferedAmount > 0"),
            "disconnectAfterFlushingPendingSend() must guard on bufferedAmount > 0 and fall " +
            "through to an immediate disconnect() otherwise")
        XCTAssertTrue(
            body.contains("sessionGeneration"),
            "disconnectAfterFlushingPendingSend() must capture sessionGeneration before " +
            "waiting so a fresh call reconfiguring this same client instance during the " +
            "flush window isn't torn down by this stale wait")
    }

    /// scheduleTURNCredentialRefresh must clamp TTL to at least
    /// turnMinRefreshDelaySeconds so a malformed TTL=0 from the gateway never
    /// schedules an immediate refresh that would hammer the signalling server.
    /// The clamp lives in CallReliabilityPolicy.turnRefreshDelay (which defaults
    /// its floor to turnMinRefreshDelaySeconds and is behaviour-tested in
    /// TurnRefreshDelayPolicyTests) — here we guard that the scheduler wires
    /// through it instead of computing a raw delay.
    func test_scheduleTURNCredentialRefresh_clampsZeroTTL() throws {
        let source = try callManagerSource()
        guard let methodRange = source.range(of: "func scheduleTURNCredentialRefresh(ttl:") else {
            XCTFail("scheduleTURNCredentialRefresh not found"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: methodRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate scheduleTURNCredentialRefresh body"); return
        }
        let body = String(source[methodRange.upperBound..<closingBrace.lowerBound])
        XCTAssertTrue(
            body.contains("CallReliabilityPolicy.turnRefreshDelay"),
            "scheduleTURNCredentialRefresh must compute its delay via " +
            "CallReliabilityPolicy.turnRefreshDelay — a TTL=0 response would otherwise " +
            "schedule a 0-second refresh that fires immediately on every credential " +
            "event, hammering the gateway")
    }

    /// QualityThresholds must declare turnMinRefreshDelaySeconds so the TURN
    /// clamp has a named, testable constant rather than a magic number.
    func test_qualityThresholds_declaresTurnMinRefreshDelaySeconds() throws {
        let source = try webRTCTypesSource()
        XCTAssertTrue(
            source.contains("turnMinRefreshDelaySeconds"),
            "QualityThresholds must declare turnMinRefreshDelaySeconds — magic numbers " +
            "in the refresh clamp are untestable and easy to change by accident")
    }

    /// flushPendingIceCandidates must guard on socket liveness before emitting.
    /// A second socket drop between reconnect and flush causes silent ICE loss.
    func test_flushPendingIceCandidates_guardsSocketLiveness() throws {
        let source = try callManagerSource()
        guard let flushRange = source.range(of: "func flushPendingIceCandidates()") else {
            XCTFail("flushPendingIceCandidates not found"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: flushRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate flushPendingIceCandidates body"); return
        }
        let body = String(source[flushRange.upperBound..<closingBrace.lowerBound])
        XCTAssertTrue(
            body.contains("isConnected"),
            "flushPendingIceCandidates must check MessageSocketManager.shared.isConnected " +
            "before emitting — if the socket dropped again between the reconnect event " +
            "and the flush, candidates are sent to a closed transport and silently lost")
    }

    /// CallManager must track the offer retry Task so endCallInternal can cancel it.
    /// Without tracking, the retry loop continues emitting into a dead call room
    /// during the 1.5s settle window when currentCallId still matches.
    func test_callManager_tracksOfferRetryTask() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("offerRetryTask"),
            "CallManager must declare offerRetryTask — the SDP offer backoff loop runs " +
            "in an untracked Task that cannot be cancelled by endCallInternal, allowing " +
            "stale SDP offers to reach the gateway during the call settle window")
    }

    /// endCallInternal must cancel the offer retry task.
    func test_endCallInternal_cancelsOfferRetryTask() throws {
        let source = try callManagerSource()
        guard let endInternalRange = source.range(of: "func endCallInternal(reason:") else {
            XCTFail("endCallInternal not found"); return
        }
        guard let nextFuncRange = source.range(of: "\n    private func ", range: endInternalRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate endCallInternal body"); return
        }
        let body = String(source[endInternalRange.upperBound..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("offerRetryTask?.cancel()"),
            "endCallInternal must cancel offerRetryTask — otherwise the backoff loop " +
            "continues emitting SDP offers to a torn-down call room for the duration " +
            "of the 1.5s settle window where currentCallId is still non-nil")
        XCTAssertTrue(
            body.contains("answerRetryTask?.cancel()"),
            "endCallInternal must cancel answerRetryTask — same reasoning as offerRetryTask")
    }

    /// emitOfferWithRetry must check Task.isCancelled so cancellation from
    /// endCallInternal exits the loop without waiting for the next sleep cycle.
    func test_emitOfferWithRetry_checksCancellation() throws {
        let source = try callManagerSource()
        guard let methodRange = source.range(of: "func emitOfferWithRetry(") else {
            XCTFail("emitOfferWithRetry not found"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: methodRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate emitOfferWithRetry body"); return
        }
        let body = String(source[methodRange.upperBound..<closingBrace.lowerBound])
        XCTAssertTrue(
            body.contains("Task.isCancelled"),
            "emitOfferWithRetry must check Task.isCancelled — the generation guard alone " +
            "only catches cancellation AFTER waking from sleep; Task.isCancelled exits " +
            "immediately when the task was cancelled while the sleep was ongoing")
    }
}

// MARK: - VideoSurvivalController × Hold/Background Interaction Tests

/// Source-analysis tests verifying that VideoSurvivalController cannot re-enable
/// video during a CallKit hold or when the app is backgrounded.
@MainActor
final class CallManagerSurvivalHoldInteractionTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// applySurvivalVideoSend(enabled: true) must guard on isVideoSuspendedByHold.
    /// A network-quality recovery must not emit "camera active" to the peer while
    /// the call is held — the peer would see incorrect camera state.
    func test_applySurvivalVideoSend_guardsHoldOnResume() throws {
        let source = try callManagerSource()
        guard let methodRange = source.range(of: "func applySurvivalVideoSend(enabled: Bool) async -> Bool") else {
            XCTFail("applySurvivalVideoSend not found"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: methodRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate applySurvivalVideoSend body"); return
        }
        let body = String(source[methodRange.upperBound..<closingBrace.lowerBound])
        XCTAssertTrue(
            body.contains("isVideoSuspendedByHold"),
            "applySurvivalVideoSend resume path must check isVideoSuspendedByHold — " +
            "VideoSurvivalController's network-quality recovery must not override a " +
            "CallKit hold: emitting 'camera active' while on hold lies to the peer")
    }

    /// applySurvivalVideoSend(enabled: true) must guard on isVideoSuspendedByBackground.
    /// iOS blocks camera access in the background; restoring video from a quality
    /// recovery would emit a false "camera active" signal while no frames are produced.
    func test_applySurvivalVideoSend_guardsBackgroundOnResume() throws {
        let source = try callManagerSource()
        guard let methodRange = source.range(of: "func applySurvivalVideoSend(enabled: Bool) async -> Bool") else {
            XCTFail("applySurvivalVideoSend not found"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: methodRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate applySurvivalVideoSend body"); return
        }
        let body = String(source[methodRange.upperBound..<closingBrace.lowerBound])
        XCTAssertTrue(
            body.contains("isVideoSuspendedByBackground"),
            "applySurvivalVideoSend resume path must check isVideoSuspendedByBackground — " +
            "iOS blocks camera access in the background; a network recovery restoring " +
            "video would send a false 'camera active' signal with no frames produced")
    }
}

// MARK: - CallKit Hold/Unhold Tests

/// Structural tests verifying that CallKit hold events correctly suspend/restore
/// video so the peer receives a proper "camera off" signal rather than a frozen
/// last frame when an incoming cellular call pre-empts the Meeshy call.
@MainActor
final class CallManagerHoldTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// CallManager must declare isVideoSuspendedByHold so hold and background
    /// suspension can be tracked independently without interfering.
    func test_callManager_declaresIsVideoSuspendedByHold() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("isVideoSuspendedByHold"),
            "CallManager must declare isVideoSuspendedByHold — independent tracking of " +
            "hold-originated video suspension prevents unhold from restoring video " +
            "when background suspension is still active (and vice versa)")
    }

    /// CallManager must declare handleHold(_:) so CallKitDelegateProxy can
    /// drive video suspension without duplicating logic inside the delegate.
    func test_callManager_declaresHandleHold() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("func handleHold(_ isOnHold: Bool)"),
            "CallManager must declare handleHold(_ isOnHold:) — the CXSetHeldCallAction " +
            "handler should delegate to this method rather than duplicating suspension " +
            "logic inside CallKitDelegateProxy")
    }

    /// handleHold must notify the peer via emitCallToggleVideo on hold so the
    /// peer's UI switches to the avatar placeholder.
    func test_handleHold_emitsCallToggleVideoOnHold() throws {
        let source = try callManagerSource()
        guard let holdFuncRange = source.range(of: "func handleHold(_ isOnHold: Bool)") else {
            XCTFail("handleHold not found in CallManager"); return
        }
        guard let nextFuncRange = source.range(of: "\n    // MARK:", range: holdFuncRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate handleHold body"); return
        }
        let body = String(source[holdFuncRange.upperBound..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("emitCallToggleVideo"),
            "handleHold must call emitCallToggleVideo so the remote peer receives the " +
            "media-toggled event and shows the avatar placeholder during hold")
        XCTAssertTrue(
            body.contains("isVideoSuspendedByHold = true"),
            "handleHold must set isVideoSuspendedByHold = true on hold so that " +
            "unhold can correctly restore video only if hold was the cause")
    }

    /// handleHold unhold path must guard on isVideoSuspendedByBackground to avoid
    /// restoring video when background suspension is still active.
    func test_handleHold_guardsBackgroundSuspensionOnUnhold() throws {
        let source = try callManagerSource()
        guard let holdFuncRange = source.range(of: "func handleHold(_ isOnHold: Bool)") else {
            XCTFail("handleHold not found in CallManager"); return
        }
        guard let nextFuncRange = source.range(of: "\n    // MARK:", range: holdFuncRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate handleHold body"); return
        }
        let body = String(source[holdFuncRange.upperBound..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("!isVideoSuspendedByBackground"),
            "handleHold unhold path must guard on !isVideoSuspendedByBackground — " +
            "restoring video while backgrounded would send a false 'camera active' " +
            "signal to the peer because iOS prevents actual camera capture anyway")
    }

    /// CallKitDelegateProxy must handle CXSetHeldCallAction and delegate to
    /// handleHold so video is correctly managed across hold/unhold cycles.
    func test_callKitDelegateProxy_handlesCXSetHeldCallAction() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("CXSetHeldCallAction"),
            "CallKitDelegateProxy must implement provider(_:perform:CXSetHeldCallAction) — " +
            "without this handler a cellular call pre-empting Meeshy leaves video " +
            "tracks enabled: the peer sees a frozen last frame instead of an avatar")
        XCTAssertTrue(
            source.contains("action.isOnHold"),
            "CXSetHeldCallAction handler must read action.isOnHold to distinguish " +
            "hold from unhold before delegating to handleHold(_:)")
        XCTAssertTrue(
            source.contains("handleHold(isOnHold)"),
            "CXSetHeldCallAction handler must call handleHold(isOnHold) — logic belongs " +
            "in CallManager, not in the delegate proxy")
    }

    /// Bug: unlike CXAnswerCallAction/CXEndCallAction (which this file explicitly
    /// documents as calling `action.fulfill()` synchronously BEFORE creating a
    /// Task, per CallKit's contract), CXSetHeldCallAction fulfilled from
    /// *inside* its Task — after hopping to MainActor. That violates the same
    /// documented contract: fulfill() must be called synchronously before the
    /// delegate method returns, not after an async hop that isn't guaranteed
    /// to run before the method returns.
    func test_callKitDelegateProxy_fulfillsHeldActionSynchronously() throws {
        let source = try callManagerSource()
        guard let methodRange = source.range(of: "func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction)") else {
            XCTFail("CXSetHeldCallAction handler not found"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: methodRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate CXSetHeldCallAction handler body"); return
        }
        let body = String(source[methodRange.upperBound..<closingBrace.lowerBound])
        guard let fulfillRange = body.range(of: "action.fulfill()") else {
            XCTFail("CXSetHeldCallAction handler must call action.fulfill()"); return
        }
        guard let taskRange = body.range(of: "Task {") else {
            XCTFail("CXSetHeldCallAction handler must dispatch a Task"); return
        }
        XCTAssertTrue(
            fulfillRange.lowerBound < taskRange.lowerBound,
            "CXSetHeldCallAction must call action.fulfill() BEFORE creating its Task — " +
            "fulfilling from inside the Task hops through an async MainActor boundary " +
            "that CallKit does not guarantee completes before the delegate method " +
            "returns, exactly the violation this file documents for CXAnswerCallAction " +
            "and CXEndCallAction")
    }

    /// isVideoSuspendedByHold must be reset in endCallInternal so hold state
    /// never leaks into the next call.
    func test_endCallInternal_resetsIsVideoSuspendedByHold() throws {
        let source = try callManagerSource()
        guard let endInternalRange = source.range(of: "func endCallInternal(reason:") else {
            XCTFail("endCallInternal not found"); return
        }
        guard let nextFuncRange = source.range(of: "\n    private func ", range: endInternalRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate endCallInternal body"); return
        }
        let body = String(source[endInternalRange.upperBound..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("isVideoSuspendedByHold = false"),
            "endCallInternal must reset isVideoSuspendedByHold to false — otherwise " +
            "the hold flag leaks into the next call and prevents video restoration")
    }

    /// isVideoSuspendedByHold must be reset in resetEndedStateForNewCall so an
    /// immediate second call after a held call starts with clean state.
    func test_resetEndedStateForNewCall_resetsIsVideoSuspendedByHold() throws {
        let source = try callManagerSource()
        guard let resetRange = source.range(of: "func resetEndedStateForNewCall()") else {
            XCTFail("resetEndedStateForNewCall not found"); return
        }
        guard let nextFuncRange = source.range(of: "\n    func ", range: resetRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate resetEndedStateForNewCall body"); return
        }
        let body = String(source[resetRange.upperBound..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("isVideoSuspendedByHold = false"),
            "resetEndedStateForNewCall must clear isVideoSuspendedByHold — a new call " +
            "arriving within the 1.5s settle window after a held+ended call would " +
            "otherwise inherit stale hold state and suppress the user's camera")
    }

    /// CallKit contract: CXSetHeldCallAction.fulfill() must be called synchronously
    /// before the delegate method returns, NOT inside a Task {} block. Fulfilling
    /// inside a Task delays settlement to the next main-runloop tick, which violates
    /// the contract (CallKit can time out the action) and is inconsistent with the
    /// synchronous pattern used for CXAnswerCallAction and CXEndCallAction.
    func test_cxSetHeldCallAction_fulfillCalledSynchronouslyBeforeTask() throws {
        let source = try callManagerSource()

        guard let handlerStart = source.range(of: "perform action: CXSetHeldCallAction)") else {
            XCTFail("CXSetHeldCallAction handler not found in CallManager.swift"); return
        }
        // Grab enough context to contain the handler body (≈20 lines).
        let bodyEnd = source.index(handlerStart.lowerBound, offsetBy: 800, limitedBy: source.endIndex) ?? source.endIndex
        let handlerBody = String(source[handlerStart.lowerBound ..< bodyEnd])

        guard let fulfillRange = handlerBody.range(of: "action.fulfill()") else {
            XCTFail("CXSetHeldCallAction handler must call action.fulfill()"); return
        }
        guard let taskRange = handlerBody.range(of: "Task {") else {
            XCTFail("CXSetHeldCallAction handler must contain a Task {} block for async work"); return
        }
        XCTAssertTrue(
            fulfillRange.lowerBound < taskRange.lowerBound,
            "CXSetHeldCallAction: action.fulfill() must appear BEFORE Task {} — " +
            "CallKit requires synchronous settlement before the delegate method returns. " +
            "Fulfilling inside Task delays it to the next run-loop tick and can cause " +
            "CallKit to time out the action.")
    }

    /// Bug: `handleHold(true)` calls `downgradeFromVideo()` and discards the
    /// returned `needsRenegotiation` flag, unlike every other call site
    /// (toggleVideo, applySurvivalVideoSend, thermalStateDidChange) which all
    /// follow up with createOffer()+emitCallOffer() when renegotiation is
    /// needed. Without it, `RTCRtpTransceiver.direction` is flipped to
    /// recvOnly locally but never actually renegotiated with the peer. If an
    /// ICE restart (WiFi/cellular handoff, exactly what a GSM call causes)
    /// fires while on hold, it bakes the stale recvOnly direction into the
    /// SDP and permanently negotiates it — unhold flips direction back
    /// locally but (before this fix) never re-offers, so outbound video
    /// stays silently broken for the rest of the call.
    func test_handleHold_renegotiatesAfterVideoDowngradeOnHold() throws {
        let source = try callManagerSource()
        guard let holdFuncRange = source.range(of: "func handleHold(_ isOnHold: Bool)") else {
            XCTFail("handleHold not found in CallManager"); return
        }
        guard let nextFuncRange = source.range(of: "\n    // MARK:", range: holdFuncRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate handleHold body"); return
        }
        let body = String(source[holdFuncRange.upperBound..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("let needsRenegotiation = await self.webRTCService.downgradeFromVideo()") ||
            body.contains("let needsRenegotiation = await self?.webRTCService.downgradeFromVideo()"),
            "handleHold's hold path must capture downgradeFromVideo()'s needsRenegotiation " +
            "return value instead of discarding it with `_ =`")
        XCTAssertTrue(
            body.contains("self.emitCallOffer(callId: callId, toUserId: userId, isVideo: false, sdp: offer)"),
            "handleHold's hold path must follow a needed renegotiation with " +
            "createOffer()+emitCallOffer(isVideo: false) — mirroring toggleVideo/" +
            "applySurvivalVideoSend — so the peer's negotiated SDP direction " +
            "actually matches the locally suspended video track")
    }

    /// Companion to the hold-side fix above: `handleHold(false)` must also
    /// renegotiate after `upgradeToVideo()` when needed, or the unhold never
    /// actually restores outbound video at the negotiated-SDP level (only
    /// the local track/direction flip back, which the peer never sees).
    func test_handleHold_renegotiatesAfterVideoUpgradeOnUnhold() throws {
        let source = try callManagerSource()
        guard let holdFuncRange = source.range(of: "func handleHold(_ isOnHold: Bool)") else {
            XCTFail("handleHold not found in CallManager"); return
        }
        guard let nextFuncRange = source.range(of: "\n    // MARK:", range: holdFuncRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate handleHold body"); return
        }
        let body = String(source[holdFuncRange.upperBound..<nextFuncRange.lowerBound])
        // Audit finding (fixed) — this test previously asserted the PRESENCE of
        // `try? await … upgradeToVideo()`, which is exactly the bug: `try?`
        // discarded a camera-permission failure, leaving isVideoEnabled stuck at
        // true with no video track and no user feedback. The fix wraps the call
        // in a do/catch instead (see CallManagerHoldTaskTrackingTests's newer
        // coverage in CallManagerTests.swift for the full catch-branch checks).
        XCTAssertTrue(
            body.contains("try await self.webRTCService.upgradeToVideo()") ||
            body.contains("try await self?.webRTCService.upgradeToVideo()"),
            "handleHold's unhold path must capture upgradeToVideo()'s needsRenegotiation " +
            "return value inside a do/catch — not discard it with `try?`")
        XCTAssertFalse(
            body.contains("try? await self.webRTCService.upgradeToVideo()") ||
            body.contains("try? await self?.webRTCService.upgradeToVideo()"),
            "handleHold's unhold path must not use `try?` here — a camera-permission " +
            "failure must not be silently discarded, leaving isVideoEnabled stuck at true " +
            "with no video track and no user feedback.")
        XCTAssertTrue(
            body.contains("self.emitCallOffer(callId: callId, toUserId: userId, isVideo: true, sdp: offer)"),
            "handleHold's unhold path must follow a needed renegotiation with " +
            "createOffer()+emitCallOffer(isVideo: true) so outbound video is actually " +
            "restored at the negotiated-SDP level, not just the local track/direction")
    }
}

// MARK: - Audio interruption recovery hardening

/// Source-analysis guards ensuring that AVAudioSession reactivation failure
/// after an interruption (alarm, Siri) is handled safely. Without these guards,
/// a failed `setActive(true)` would proceed to configure RTCAudioSession with an
/// inactive system session, leaving the audio engine in a corrupted state.
@MainActor
final class CallManagerAudioInterruptionHardeningTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_interruptionEnd_guardsRTCConfigOnReactivationFailure() throws {
        let source = try callManagerSource()
        // Locate the interruption-ended branch by finding the setActive call
        // followed by a catch block that returns early.
        guard let setActiveRange = source.range(of: "setActive(true, options: [])") else {
            XCTFail("setActive call not found in CallManager"); return
        }
        let afterSetActive = String(source[setActiveRange.upperBound...])
        // The catch block must contain a `return` to prevent RTCAudioSession
        // configuration from running when the system session is inactive.
        guard let catchRange = afterSetActive.range(of: "} catch {") else {
            XCTFail("catch block not found after setActive"); return
        }
        guard let closingBrace = afterSetActive.range(of: "}", range: catchRange.upperBound..<afterSetActive.endIndex) else {
            XCTFail("catch block closing brace not found"); return
        }
        let catchBody = String(afterSetActive[catchRange.upperBound..<closingBrace.lowerBound])
        XCTAssertTrue(
            catchBody.contains("return"),
            "Interruption-ended handler must `return` inside the catch block so that " +
            "RTCAudioSession.audioSessionDidActivate and isAudioEnabled are NOT set when " +
            "AVAudioSession.setActive(true) fails — otherwise the audio engine is configured " +
            "on an inactive system session, causing silent calls")
    }

    func test_turnRefreshTask_cancelledBeforeReconnectRefreshRequest() throws {
        let source = try callManagerSource()
        // Scope to the socket-reconnect handler specifically (anchored on
        // socket.didReconnect) rather than searching the whole file — the raw
        // emitRequestIceServers call now lives one level down inside
        // requestFreshTurnCredentials (shared by every TURN-refresh trigger, see
        // CallManagerTURNRefreshWatchdogTests), so a file-wide first-occurrence
        // search would land on the wrong call site.
        guard let reconnectRange = source.range(of: "socket.didReconnect") else {
            XCTFail("socket.didReconnect handler not found"); return
        }
        let reconnectHandlerEnd = source.range(
            of: ".store(in: &cancellables)",
            range: reconnectRange.upperBound..<source.endIndex
        )?.upperBound ?? source.endIndex
        let handlerBody = String(source[reconnectRange.lowerBound..<reconnectHandlerEnd])

        guard let requestRange = handlerBody.range(of: "requestFreshTurnCredentials(callId: callId)") else {
            XCTFail("requestFreshTurnCredentials not found in the socket-reconnect handler"); return
        }
        // The cancel of turnRefreshTask must appear BEFORE the refresh request in
        // the reconnect handler so the old deadline cannot fire while the fresh
        // response is in flight, causing duplicate credential requests.
        let beforeRequest = String(handlerBody[..<requestRange.lowerBound])
        guard let cancelRange = beforeRequest.range(of: "turnRefreshTask?.cancel()", options: .backwards) else {
            XCTFail("turnRefreshTask?.cancel() must precede requestFreshTurnCredentials on the reconnect path"); return
        }
        // Verify the cancel is in the same reconnect context by checking there's
        // no function definition boundary between the cancel and the request.
        let between = String(beforeRequest[cancelRange.upperBound...])
        XCTAssertFalse(
            between.contains("func "),
            "turnRefreshTask?.cancel() must be in the same function as requestFreshTurnCredentials — " +
            "a function boundary would mean the cancel is in a different code path")
    }

    func test_stopQualityMonitor_clearsLastStats() throws {
        let source = try webRTCServiceSource()
        guard let stopRange = source.range(of: "func stopQualityMonitor()") else {
            XCTFail("stopQualityMonitor not found in WebRTCService"); return
        }
        guard let closingBrace = source.range(of: "\n    }", range: stopRange.upperBound..<source.endIndex) else {
            XCTFail("Could not find closing brace of stopQualityMonitor"); return
        }
        let body = String(source[stopRange.upperBound..<closingBrace.upperBound])
        XCTAssertTrue(
            body.contains("lastStats = nil"),
            "stopQualityMonitor must nil lastStats so that a call starting immediately " +
            "after does not inherit stale cumulative counters from the previous call, " +
            "which would produce incorrect packet-loss deltas in the first quality sample")
    }
}

// MARK: - Video toggle concurrency safety

/// Source-analysis guards ensuring rapid video-toggle taps cannot leave
/// `isVideoEnabled` desynchronised from the WebRTC track state. Without a
/// tracked task slot, a second tap cancels nothing: if the upgrade finishes
/// AFTER the downgrade, the user's camera is streaming but `isVideoEnabled`
/// reads `false` — a silent privacy violation.
@MainActor
final class CallManagerVideoToggleConcurrencyTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_toggleVideo_cancelsExistingTaskBeforeStartingNew() throws {
        let source = try callManagerSource()
        guard let toggleRange = source.range(of: "func toggleVideo()") else {
            XCTFail("toggleVideo not found"); return
        }
        guard let nextFuncRange = source.range(of: "\n    func ", range: toggleRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate toggleVideo body"); return
        }
        let body = String(source[toggleRange.upperBound..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("videoToggleTask?.cancel()"),
            "toggleVideo must cancel the previous videoToggleTask before starting — " +
            "without this a second tap can't preempt a slow upgrade, leaving the camera " +
            "streaming with isVideoEnabled=false")
    }

    func test_toggleVideo_checksTaskCancellationAfterAwait() throws {
        let source = try callManagerSource()
        guard let toggleRange = source.range(of: "func toggleVideo()") else {
            XCTFail("toggleVideo not found"); return
        }
        guard let nextFuncRange = source.range(of: "\n    func ", range: toggleRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate toggleVideo body"); return
        }
        let body = String(source[toggleRange.upperBound..<nextFuncRange.lowerBound])
        // Must have at least two isCancelled checks (before and after the await).
        let checkCount = body.components(separatedBy: "Task.isCancelled").count - 1
        XCTAssertGreaterThanOrEqual(
            checkCount, 2,
            "toggleVideo must check Task.isCancelled both before and after the async " +
            "upgrade/downgrade await — a single check only prevents starting, not " +
            "acting on a stale result from a superseded intent")
    }

    func test_endCallInternal_cancelsVideoToggleTask() throws {
        let source = try callManagerSource()
        guard let endCallRange = source.range(of: "func endCallInternal(") else {
            XCTFail("endCallInternal not found"); return
        }
        guard let nextFuncRange = source.range(of: "\n    func ", range: endCallRange.upperBound..<source.endIndex) else {
            XCTFail("Could not isolate endCallInternal body"); return
        }
        let body = String(source[endCallRange.upperBound..<nextFuncRange.lowerBound])
        XCTAssertTrue(
            body.contains("videoToggleTask?.cancel()"),
            "endCallInternal must cancel videoToggleTask so an in-flight upgrade " +
            "cannot run after the call has torn down, re-activating the camera")
    }
}

// MARK: - Socket-reconnect video re-sync correctness

/// Source-analysis guards ensuring the video state re-synced to the peer on
/// socket reconnect accounts for ALL suspension sources: survival controller,
/// background, AND CallKit hold. Before this fix, a hold-suspended call that
/// survived a socket reconnect would incorrectly report video as active to the
/// peer while iOS was blocking camera access.
@MainActor
final class CallManagerReconnectVideoSyncTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_reconnectVideoSync_includesHoldSuspensionGuard() throws {
        let source = try callManagerSource()
        // Locate the socket-reconnect handler's effectiveVideoOn computation.
        // It must include all three suspension sources to be correct.
        guard let reconnectRange = source.range(of: "Socket reconnect — re-syncing video state") else {
            XCTFail("reconnect video sync log not found"); return
        }
        // Walk back to find the effectiveVideoOn assignment.
        let beforeLog = String(source[..<reconnectRange.lowerBound])
        guard let assignRange = beforeLog.range(of: "let effectiveVideoOn", options: .backwards) else {
            XCTFail("effectiveVideoOn not found before reconnect log"); return
        }
        // Take the line containing the assignment and a few lines after it.
        let fromAssign = String(source[assignRange.lowerBound...])
        guard let endLineRange = fromAssign.range(of: "\n") else {
            XCTFail("Could not find end of effectiveVideoOn expression"); return
        }
        // Expand to capture multi-line expressions (up to 5 lines).
        let exprLines = String(fromAssign.prefix(
            fromAssign.distance(from: fromAssign.startIndex, to: endLineRange.upperBound) + 200
        ))
        XCTAssertTrue(
            exprLines.contains("isVideoSuspendedByHold"),
            "Socket-reconnect effectiveVideoOn must check isVideoSuspendedByHold — " +
            "a held call whose socket reconnects would otherwise falsely signal " +
            "\"camera active\" to the peer while iOS blocks camera access")
        XCTAssertTrue(
            exprLines.contains("isVideoSuspendedByBackground"),
            "Socket-reconnect effectiveVideoOn must also check isVideoSuspendedByBackground")
        XCTAssertTrue(
            exprLines.contains("isVideoSuspended"),
            "Socket-reconnect effectiveVideoOn must also check isVideoSuspended (survival controller)")
    }
}

// MARK: - Background/Foreground video restore hold guard

/// Guards the foreground-return video-restore path against the
/// "background while held" scenario:
///
///   1. Video call on hold  → `isVideoSuspendedByHold = true`
///   2. App backgrounds     → `isVideoSuspendedByBackground = true`
///   3. App foregrounds     → MUST NOT emit call:media-toggled(true)
///                            because the call is STILL held
///
/// Without the `isVideoSuspendedByHold` guard the peer would receive
/// a false "camera active" signal while iOS blocks camera access.
@MainActor
final class CallManagerForegroundRestoreHoldGuardTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_foregroundRestore_guardsOnHoldSuspension() throws {
        let source = try callManagerSource()

        // Locate the willEnterForeground observer body.
        guard let fgRange = source.range(of: "willEnterForegroundNotification") else {
            XCTFail("willEnterForegroundNotification observer not found"); return
        }
        // Scan forward to find the isVideoSuspendedByBackground guard block.
        let afterFg = String(source[fgRange.upperBound...])
        guard let bgFlagRange = afterFg.range(of: "isVideoSuspendedByBackground") else {
            XCTFail("isVideoSuspendedByBackground not found in foreground observer"); return
        }
        // Capture the restore guard expression (up to 400 chars covers multi-line &&).
        let restoreExpr = String(afterFg[bgFlagRange.lowerBound...].prefix(400))

        XCTAssertTrue(
            restoreExpr.contains("isVideoSuspendedByHold"),
            "Foreground-return video restore must check isVideoSuspendedByHold — " +
            "foregrounding does not lift a CallKit hold, so the peer must not receive " +
            "a false call:media-toggled(true) while the call is still held."
        )
    }

    func test_foregroundRestore_guardsOnSurvivalControllerSuspension() throws {
        // Belt-and-suspenders: confirm the existing isVideoSuspended guard is still
        // present after the hold guard was added (regressions are easy here).
        let source = try callManagerSource()

        guard let fgRange = source.range(of: "willEnterForegroundNotification") else {
            XCTFail("willEnterForegroundNotification observer not found"); return
        }
        let afterFg = String(source[fgRange.upperBound...])
        guard let bgFlagRange = afterFg.range(of: "isVideoSuspendedByBackground") else {
            XCTFail("isVideoSuspendedByBackground not found in foreground observer"); return
        }
        let restoreExpr = String(afterFg[bgFlagRange.lowerBound...].prefix(400))

        XCTAssertTrue(
            restoreExpr.contains("isVideoSuspended"),
            "Foreground-return video restore must still check isVideoSuspended (survival controller)."
        )
    }
}

// MARK: - Reliability monitor half-open re-arm after reconnect

/// Guards the invariant that half-open detection re-arms after every
/// (re)connect. Since the HalfOpenMonitorState refactor the re-arm is driven
/// by `connectionEpoch` (bumped in `transitionToConnected`) instead of a
/// loop-local `halfOpenSettled` bool — the old mechanism was only reset when
/// the poll loop *observed* `.reconnecting`, so a reconnection completing
/// between two 2s ticks froze self-heal for the rest of the call, and its
/// cumulative-counter comparison masked post-restart half-opens anyway.
/// The delta/epoch behaviour itself is unit-tested in HalfOpenMonitorStateTests;
/// here we guard the CallManager wiring.
@MainActor
final class CallManagerHalfOpenReArmTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_transitionToConnected_bumpsConnectionEpoch() throws {
        let source = try callManagerSource()
        guard let fnRange = source.range(of: "private func transitionToConnected()") else {
            XCTFail("transitionToConnected not found"); return
        }
        let fnBody = String(source[fnRange.upperBound...].prefix(4000))
        XCTAssertTrue(
            fnBody.contains("connectionEpoch += 1"),
            "transitionToConnected must bump connectionEpoch — it is the signal that " +
            "re-arms half-open detection with a fresh RTP baseline after every " +
            "(re)connect, even when the reconnection completed between two poll ticks."
        )
    }

    func test_reliabilityMonitor_connectedBranch_evaluatesViaEpochMonitor() throws {
        let source = try callManagerSource()
        guard let monitorRange = source.range(of: "private func startReliabilityMonitor()") else {
            XCTFail("startReliabilityMonitor not found"); return
        }
        let monitorBody = String(source[monitorRange.upperBound...].prefix(6000))
        XCTAssertTrue(
            monitorBody.contains("halfOpenMonitor.evaluate("),
            ".connected branch must evaluate half-open via HalfOpenMonitorState — " +
            "a raw evaluateHalfOpen call on cumulative counters would instantly " +
            "report .healthy after an ICE restart from pre-restart traffic."
        )
        XCTAssertTrue(
            monitorBody.contains("epoch: self.connectionEpoch"),
            "HalfOpenMonitorState must be keyed off self.connectionEpoch so a " +
            "reconnect that completes between two poll ticks still re-arms detection."
        )
    }
}

// MARK: - Background-entry duplicate-emit guard

@MainActor
final class CallManagerBackgroundDuplicateEmitTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Background entry must NOT emit a second "camera off" to the peer when hold
    /// or the survival controller has already done so.  The fix: emit only when
    /// !isVideoSuspendedByHold && !isVideoSuspended.
    func test_backgroundEntry_doesNotEmitVideoOff_whenHoldAlreadySentIt() throws {
        let source = try callManagerSource()

        // Locate the didEnterBackgroundNotification observer body.
        guard let bgRange = source.range(of: "UIApplication.didEnterBackgroundNotification") else {
            XCTFail("didEnterBackgroundNotification observer not found"); return
        }
        // Capture the next 800 chars — enough to cover the full handler block.
        let observerBody = String(source[bgRange.upperBound...].prefix(800))

        // The background flag must always be set (so the foreground restore works)
        // unconditionally relative to the emit guard.
        XCTAssertTrue(
            observerBody.contains("isVideoSuspendedByBackground = true"),
            "Background entry must set isVideoSuspendedByBackground = true before the emit guard"
        )

        // The emit must be gated on !isVideoSuspendedByHold so that when hold
        // has already sent "camera off", we don't flood the peer with a duplicate.
        XCTAssertTrue(
            observerBody.contains("isVideoSuspendedByHold"),
            "Background entry emit must be gated on !isVideoSuspendedByHold to suppress " +
            "duplicate 'camera off' events when the call is already on hold"
        )

        // The emit must also be gated on !isVideoSuspended (survival controller).
        XCTAssertTrue(
            observerBody.contains("isVideoSuspended"),
            "Background entry emit must be gated on !isVideoSuspended (survival controller) " +
            "to suppress duplicate events when the controller already sent 'camera off'"
        )
    }
}

// MARK: - ICE restart stale-offer guard

@MainActor
final class CallManagerICERestartStaleOfferTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// After the backoff sleep the ICE restart Task must verify we are STILL in
    /// `.reconnecting(attempt:)` with the same attempt number, not merely that the
    /// call `isActive`. Sending a restart offer on an already-connected peer
    /// connection resets ICE to gathering and breaks the live media path.
    /// (The Task body lives in `scheduleICERestart` since the trigger-arbitration
    /// refactor — `attemptReconnection` delegates to it.)
    func test_iceRestartTask_afterBackoffSleep_guardsOnReconnectingState() throws {
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func scheduleICERestart(") else {
            XCTFail("scheduleICERestart() not found"); return
        }
        // Widened from 1500, then 3000 (audit finding — scheduleICERestart now also
        // chains onto videoToggleTask/holdVideoTask/survivalVideoTask/
        // signalOfferAnswerTask before arming the restart, see the doc-comment on
        // `survivalVideoTask`; the extra capture/await lines push the post-backoff
        // guard further into the body).
        let fnBody = String(source[fnRange.upperBound...].prefix(4000))

        // The post-backoff guard must pattern-match on `.reconnecting` (not just
        // isActive) to detect a natural recovery during the sleep window.
        XCTAssertTrue(
            fnBody.contains("case .reconnecting(let current) = self.callState"),
            "Post-backoff guard must match .reconnecting(let current) = self.callState, " +
            "not callState.isActive — .connected is also active and would allow a stale " +
            "restart offer to disrupt a naturally recovered connection"
        )

        // Both guards (post-sleep AND post-performICERestart) must verify that the
        // captured attempt number still matches the live state.
        let matchCount = fnBody.components(separatedBy: "current == attempt").count - 1
        XCTAssertGreaterThanOrEqual(
            matchCount, 2,
            "attemptReconnection must check 'current == attempt' at least twice: " +
            "once after the backoff sleep and once after the async performICERestart() call"
        )
    }
}

// MARK: - Survival controller ICE-restart guard

@MainActor
final class CallManagerSurvivalControllerReconnectGuardTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `applySurvivalVideoSend` must bail out when the call is in `.reconnecting`
    /// state. During ICE restart the SDP exchange is already in flight; overlapping
    /// it with a survival-controller renegotiation causes SDP glare that breaks the
    /// reconnection.
    func test_applySurvivalVideoSend_guardsAgainstReconnectingState() throws {
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func applySurvivalVideoSend(enabled: Bool) async -> Bool {") else {
            XCTFail("applySurvivalVideoSend not found"); return
        }
        let fnBody = String(source[fnRange.upperBound...].prefix(800))

        // The guard must pattern-match on .reconnecting to detect that an ICE
        // restart is in progress.
        XCTAssertTrue(
            fnBody.contains("case .reconnecting = callState"),
            "applySurvivalVideoSend must guard 'if case .reconnecting = callState { return false }' " +
            "to prevent SDP glare when the survival controller fires during ICE restart"
        )
    }
}

// MARK: - Dynamic audio bitrate adaptation

@MainActor
final class WebRTCServiceAudioBitrateAdaptationTests: XCTestCase {

    private func webRTCServiceSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTCService.swift")
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

    /// `adjustBitrate` must call `client.applyAudioEncoding` when the computed
    /// bitrate tier changes — this sets sender.parameters.encodings on the live
    /// transceiver. The old `setMaxAudioBitrate` call was a no-op hint.
    func test_adjustBitrate_callsApplyAudioEncoding_whenBitrateChanges() throws {
        let source = try webRTCServiceSource()

        guard let fnRange = source.range(of: "private func adjustBitrate(") else {
            XCTFail("adjustBitrate not found in WebRTCService"); return
        }
        // Bound to the next top-level function rather than a fixed character
        // count — a fixed prefix(3000) started failing once the
        // JitterBitrateCapTracker hysteresis addition (see WebRTCTypes.swift)
        // pushed applyAudioEncoding past the window, even though the code
        // was still correct. A function-boundary window can't regress that
        // way as the body grows.
        let nextFnRange = source.range(of: "\n    private func ", range: fnRange.upperBound..<source.endIndex)
        let fnBody = String(source[fnRange.upperBound..<(nextFnRange?.lowerBound ?? source.endIndex)])

        XCTAssertTrue(
            fnBody.contains("client.applyAudioEncoding(maxBitrateBps:"),
            "adjustBitrate must call client.applyAudioEncoding(maxBitrateBps:) when currentBitrate changes. " +
            "setMaxAudioBitrate is a hint-only API with no effect on the live sender encoding."
        )
    }

    /// The `WebRTCClientProviding` protocol must declare `applyAudioEncoding`
    /// so all conformers (real + stub) implement it.
    func test_webRTCClientProviding_declaresApplyAudioEncoding() throws {
        let source = try webRTCTypesSource()

        guard let protocolRange = source.range(of: "protocol WebRTCClientProviding:") else {
            XCTFail("WebRTCClientProviding protocol not found"); return
        }
        let protocolBody = String(source[protocolRange.upperBound...].prefix(4000))

        XCTAssertTrue(
            protocolBody.contains("applyAudioEncoding"),
            "WebRTCClientProviding must declare applyAudioEncoding so the protocol " +
            "enforces the implementation across P2PWebRTCClient and test stubs"
        )
    }
}

// MARK: - Media Services Reset — setActive guard

/// Source-analysis guards for the media-services-reset recovery path.
///
/// When the iOS media server process crashes, `handleMediaServicesReset` must:
///   1. Call `setActive(true)` to bring AVAudioSession back online.
///   2. Only proceed to `audioSessionDidActivate` if `setActive` succeeded.
///   3. Use `QualityThresholds.mediaServicesResetSpeakerDelaySeconds` for the
///      post-rebuild speaker-route delay — no hardcoded literal.
///
/// The asymmetry between the interruption handler and the media-services reset
/// handler was a real bug: the interruption handler returned early on setActive
/// failure, but the media-services reset handler continued anyway, incorrectly
/// telling WebRTC the audio session was active when it wasn't.
@MainActor
final class CallManagerMediaServicesResetSetActiveGuardTests: XCTestCase {

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

    /// `handleMediaServicesReset` must return early when `setActive(true)` throws,
    /// matching the interruption handler.  Proceeding to `audioSessionDidActivate`
    /// after a failed activation tells WebRTC the session is live when it is not,
    /// causing libwebrtc's audio I/O unit to run against an inactive session and
    /// silently produce silence — or, worse, trigger an AVAudioSession fault that
    /// kills the next audio operation mid-call.
    func test_handleMediaServicesReset_returnsEarlyOnSetActiveFailure() throws {
        let source = try callManagerSource()

        guard let handlerRange = source.range(of: "private func handleMediaServicesReset()") else {
            XCTFail("handleMediaServicesReset not found in CallManager.swift"); return
        }
        let endIdx = source.index(handlerRange.lowerBound, offsetBy: 2600, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[handlerRange.lowerBound ..< endIdx])

        // The error block for setActive must contain a `return` so the queued
        // work that follows (audioSessionDidActivate, etc.) is skipped.
        guard let errorRange = fnBody.range(of: "AVAudioSession reactivation after media-services reset failed") else {
            XCTFail("setActive error log not found inside handleMediaServicesReset"); return
        }
        let errorEnd = fnBody.index(errorRange.upperBound, offsetBy: 400, limitedBy: fnBody.endIndex) ?? fnBody.endIndex
        let errorBlock = String(fnBody[errorRange.lowerBound ..< errorEnd])

        XCTAssertTrue(
            errorBlock.contains("return"),
            "handleMediaServicesReset must `return` after logging the setActive error — " +
            "calling audioSessionDidActivate when the session is not active corrupts " +
            "WebRTC audio state and cannot be undone without a full stack teardown."
        )
    }

    /// `handleMediaServicesReset` must guard on the result of `setActive(true)`
    /// BEFORE calling `audioSessionDidActivate`, mirroring the interruption handler.
    /// The interruption handler has long had this guard; this test prevents it from
    /// being dropped from the media-services reset path.
    func test_handleMediaServicesReset_setActiveIsGuardedBeforeDidActivate() throws {
        let source = try callManagerSource()

        guard let handlerRange = source.range(of: "private func handleMediaServicesReset()") else {
            XCTFail("handleMediaServicesReset not found in CallManager.swift"); return
        }
        let endIdx = source.index(handlerRange.lowerBound, offsetBy: 2600, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[handlerRange.lowerBound ..< endIdx])

        guard let setActiveRange = fnBody.range(of: "setActive(true"),
              let didActivateRange = fnBody.range(of: "audioSessionDidActivate") else {
            XCTFail("setActive or audioSessionDidActivate not found in handleMediaServicesReset"); return
        }
        XCTAssertLessThan(
            setActiveRange.lowerBound,
            didActivateRange.lowerBound,
            "setActive(true) must appear BEFORE audioSessionDidActivate in " +
            "handleMediaServicesReset — the session must be active before WebRTC " +
            "is told to use it."
        )
    }

    /// The speaker-route re-application delay must use the named constant rather
    /// than a hardcoded millisecond literal.  The constant serves as documentation
    /// (the 200 ms stabilisation requirement lives at one site) and allows the
    /// CI hardware-specific threshold to be tuned without hunting for literals.
    func test_handleMediaServicesReset_speakerDelay_usesQualityThresholdsConstant() throws {
        let source = try callManagerSource()

        guard let handlerRange = source.range(of: "private func handleMediaServicesReset()") else {
            XCTFail("handleMediaServicesReset not found in CallManager.swift"); return
        }
        let endIdx = source.index(handlerRange.lowerBound, offsetBy: 2600, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[handlerRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("mediaServicesResetSpeakerDelaySeconds"),
            "handleMediaServicesReset speaker delay must use " +
            "QualityThresholds.mediaServicesResetSpeakerDelaySeconds — a hardcoded " +
            "literal makes the stabilisation window invisible to reviewers and " +
            "impossible to tune without a code search."
        )
        XCTAssertFalse(
            fnBody.contains(".milliseconds(200)"),
            "handleMediaServicesReset must not hardcode .milliseconds(200) — " +
            "use QualityThresholds.mediaServicesResetSpeakerDelaySeconds instead."
        )
    }

    /// `QualityThresholds` must declare `mediaServicesResetSpeakerDelaySeconds` so
    /// the constant is co-located with other call thresholds and its rationale is
    /// visible to future reviewers.
    func test_qualityThresholds_declaresMediaServicesResetSpeakerDelay() throws {
        let source = try webRTCTypesSource()
        XCTAssertTrue(
            source.contains("mediaServicesResetSpeakerDelaySeconds"),
            "QualityThresholds must declare mediaServicesResetSpeakerDelaySeconds — " +
            "centralised constants are the project convention for all tunable durations."
        )
    }
}

// MARK: - Network Path Monitor — WiFi ↔ Cellular Handoff

/// Source-analysis guards for the `NWPathMonitor` integration that detects
/// network-interface changes mid-call and triggers ICE restart.
///
/// Without these guards a regression could re-introduce silent call drops on
/// WiFi → cellular handoff (a common scenario when a user walks away from a
/// WiFi AP): the call-state machine would stay `.connected`, audio would stop
/// flowing (old ICE candidates went stale), and no automatic recovery would fire.
@MainActor
final class CallManagerNetworkMonitorSourceGuardTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `CallManager` must use `NWPathMonitor` — not a timer or socket-event
    /// heuristic — to detect network changes.  NWPathMonitor fires synchronously
    /// on the kernel network-change event (< 1 ms latency) whereas a poll-based
    /// approach delays ICE restart by up to one poll interval.
    func test_callManager_usesNWPathMonitor() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("NWPathMonitor"),
            "CallManager must use NWPathMonitor to detect interface changes — " +
            "a poll-based fallback delays ICE restart by up to one poll interval, " +
            "causing several seconds of silence on WiFi → cellular handoff."
        )
    }

    /// The monitor must track the current interface type so a WiFi ↔ cellular
    /// transition can be distinguished from a same-interface route change (e.g.
    /// channel switch on the same WiFi AP).  Without tracking the previous
    /// interface type, every path update that stays on the same interface would
    /// trigger a needless ICE restart.
    func test_callManager_tracksLastNetworkInterfaceType() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("lastNetworkInterfaceType"),
            "CallManager must store lastNetworkInterfaceType to detect WiFi ↔ cellular " +
            "handoff — comparing the new interface type to the previous one is the only " +
            "way to distinguish a real handoff from a same-interface route change."
        )
    }

    /// An interface change while a call is active must trigger ICE restart
    /// (`attemptReconnection`).  Without this, a WiFi → cellular switch leaves
    /// the call silently dead: the local IP address changes so all existing ICE
    /// candidates become unreachable, but the call state stays `.connected`.
    func test_callManager_interfaceChange_triggersIceRestart() throws {
        let source = try callManagerSource()

        guard let pathHandlerRange = source.range(of: "networkMonitor.pathUpdateHandler") else {
            XCTFail("networkMonitor.pathUpdateHandler not found in CallManager.swift"); return
        }
        // Scan forward far enough to cover the full handler block.
        let endIdx = source.index(pathHandlerRange.lowerBound, offsetBy: 3000, limitedBy: source.endIndex) ?? source.endIndex
        let handlerBody = String(source[pathHandlerRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            handlerBody.contains("interfaceChanged"),
            "networkMonitor.pathUpdateHandler must detect interface changes — " +
            "set a local `interfaceChanged` flag when the active interface type changes."
        )
        XCTAssertTrue(
            handlerBody.contains("attemptReconnection"),
            "networkMonitor.pathUpdateHandler must call attemptReconnection() on an " +
            "interface change — stale ICE candidates from the old interface require a " +
            "full ICE restart to re-negotiate valid candidates on the new interface."
        )
    }

    /// Network loss (path.status != .satisfied) during an active call must also
    /// trigger reconnection, not wait for the heartbeat timeout.  The monitor
    /// fires within 1 ms of the OS detecting the outage; waiting for heartbeat
    /// expiry (30 s) delays recovery by up to 30 seconds on a short network blip.
    func test_callManager_networkLoss_triggersReconnection() throws {
        let source = try callManagerSource()

        guard let pathHandlerRange = source.range(of: "networkMonitor.pathUpdateHandler") else {
            XCTFail("networkMonitor.pathUpdateHandler not found in CallManager.swift"); return
        }
        let endIdx = source.index(pathHandlerRange.lowerBound, offsetBy: 2000, limitedBy: source.endIndex) ?? source.endIndex
        let handlerBody = String(source[pathHandlerRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            handlerBody.contains("path.status != .satisfied") || handlerBody.contains("status != .satisfied"),
            "networkMonitor.pathUpdateHandler must detect path.status != .satisfied " +
            "and trigger reconnection immediately — waiting for heartbeat expiry " +
            "delays recovery on a brief network outage by up to 30 seconds."
        )
    }

    /// Network recovery (path was unsatisfied, now satisfied) must also trigger
    /// ICE restart.  Without this, a call that survives a brief network outage
    /// stays in the reconnecting/failed state even after connectivity returns.
    func test_callManager_networkRecovery_triggersIceRestart() throws {
        let source = try callManagerSource()

        guard let pathHandlerRange = source.range(of: "networkMonitor.pathUpdateHandler") else {
            XCTFail("networkMonitor.pathUpdateHandler not found in CallManager.swift"); return
        }
        let endIdx = source.index(pathHandlerRange.lowerBound, offsetBy: 2000, limitedBy: source.endIndex) ?? source.endIndex
        let handlerBody = String(source[pathHandlerRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            handlerBody.contains("wasUnsatisfied") && handlerBody.contains("isNowSatisfied"),
            "networkMonitor.pathUpdateHandler must detect wasUnsatisfied && isNowSatisfied " +
            "to trigger ICE restart on network recovery — without this the call stays " +
            "in `.reconnecting` even after full connectivity is restored."
        )
    }

    /// The monitor must guard on call state before triggering reconnection.
    /// Firing ICE restart while idle (e.g. on app launch in an elevator) wastes
    /// CPU and corrupts the `pendingIceCandidates` buffer for the next call.
    func test_callManager_networkMonitor_guardsOnCallActive() throws {
        let source = try callManagerSource()

        guard let pathHandlerRange = source.range(of: "networkMonitor.pathUpdateHandler") else {
            XCTFail("networkMonitor.pathUpdateHandler not found in CallManager.swift"); return
        }
        let endIdx = source.index(pathHandlerRange.lowerBound, offsetBy: 2000, limitedBy: source.endIndex) ?? source.endIndex
        let handlerBody = String(source[pathHandlerRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            handlerBody.contains("isInActiveCall") || handlerBody.contains("callState.isActive"),
            "networkMonitor.pathUpdateHandler must guard on call-active state before " +
            "triggering reconnection — firing ICE restart while idle wastes CPU and " +
            "can corrupt the pendingIceCandidates buffer for the next call."
        )
    }

    /// The monitor must be started with a dedicated `DispatchQueue` (not `.main`)
    /// so path-update callbacks don't block the MainActor while the OS resolves
    /// the route change (which can take several ms on cellular).
    func test_callManager_networkMonitor_startsOnDedicatedQueue() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("networkMonitor.start(queue:"),
            "NWPathMonitor must be started with a dedicated queue — not .main — " +
            "so path-update callbacks don't block the main thread during route resolution."
        )
    }
}

// MARK: - Media Server Reset Monitoring

@MainActor
final class CallManagerMediaServicesResetMonitoringTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_callManager_sourceCode_observesMediaServicesWereResetNotification() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("AVAudioSession.mediaServicesWereResetNotification"),
            "CallManager must observe AVAudioSession.mediaServicesWereResetNotification to recover " +
            "from iOS media server crashes. Without this, audio is permanently dead after a crash."
        )
    }

    func test_callManager_sourceCode_handleMediaServicesReset_callsConfigureAudioSession() throws {
        let source = try callManagerSource()
        guard let fnRange = source.range(of: "private func handleMediaServicesReset()") else {
            XCTFail("handleMediaServicesReset() not found in CallManager.swift")
            return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("configureAudioSession()"),
            "handleMediaServicesReset must call configureAudioSession() to reconfigure " +
            "RTCAudioSession after the media server crash resets all session state."
        )
    }

    func test_callManager_sourceCode_handleMediaServicesReset_cyclesRTCAudioSession() throws {
        let source = try callManagerSource()
        guard let fnRange = source.range(of: "private func handleMediaServicesReset()") else {
            XCTFail("handleMediaServicesReset() not found in CallManager.swift")
            return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("audioSessionDidDeactivate"),
            "handleMediaServicesReset must call audioSessionDidDeactivate before audioSessionDidActivate " +
            "to properly cycle the RTCAudioSession state machine after a media server crash."
        )
        XCTAssertTrue(
            fnBody.contains("audioSessionDidActivate"),
            "handleMediaServicesReset must call audioSessionDidActivate to restart WebRTC audio I/O " +
            "after media server recovery."
        )
    }

    func test_callManager_sourceCode_startMediaServicesResetMonitoring_calledFromInit() throws {
        let source = try callManagerSource()
        // Find the private init body
        guard let initRange = source.range(of: "private init(webRTCService: WebRTCService? = nil)") else {
            XCTFail("private init not found in CallManager.swift")
            return
        }
        // The init body is ~59 lines / ~2 500 chars; use 3 500 to stay robust against growth.
        let endIdx = source.index(initRange.lowerBound, offsetBy: 3500, limitedBy: source.endIndex) ?? source.endIndex
        let initBody = String(source[initRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            initBody.contains("startMediaServicesResetMonitoring()"),
            "CallManager.init must call startMediaServicesResetMonitoring() to register the " +
            "AVAudioSession.mediaServicesWereResetNotification observer at startup."
        )
    }

    func test_callManager_sourceCode_handleMediaServicesReset_guardsCallActive() throws {
        let source = try callManagerSource()
        guard let fnRange = source.range(of: "private func handleMediaServicesReset()") else {
            XCTFail("handleMediaServicesReset() not found in CallManager.swift")
            return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 300, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("guard callState.isActive"),
            "handleMediaServicesReset must guard callState.isActive — running audio reconstruction " +
            "outside an active call wastes CPU and may corrupt the idle audio state."
        )
    }
}

// MARK: - CallView auto-hide controls source guards

/// Source guards ensuring `shouldAutoHideControls` in CallView.swift correctly
/// blocks auto-hide for Mac Catalyst, VoiceOver, non-video calls, and when
/// the effects toolbar is open — any of these missing would cause controls to
/// vanish in a context where they must remain permanently visible.
@MainActor
final class CallViewAutoHideControlsSourceGuardTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_shouldAutoHideControls_gatesOnVideoLayoutActive() throws {
        let source = try callViewSource()
        guard let fnRange = source.range(of: "private var shouldAutoHideControls: Bool") else {
            XCTFail("shouldAutoHideControls not found in CallView.swift")
            return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 300, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("isVideoUIActive"),
            "shouldAutoHideControls must gate on isVideoUIActive (local OR remote video, Fix 7) — " +
            "controls must never auto-hide on a voice-only layout (no video surface to tap for " +
            "recall), but must auto-hide once the video layout is active even when only the " +
            "REMOTE camera is on."
        )
    }

    func test_shouldAutoHideControls_gatesOnIsiOSAppOnMac() throws {
        let source = try callViewSource()
        guard let fnRange = source.range(of: "private var shouldAutoHideControls: Bool") else {
            XCTFail("shouldAutoHideControls not found in CallView.swift")
            return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 300, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("isiOSAppOnMac"),
            "shouldAutoHideControls must gate on isiOSAppOnMac — on Mac the user cannot " +
            "tap the video surface to recall hidden controls (no touch), so controls must " +
            "always be visible."
        )
    }

    func test_shouldAutoHideControls_gatesOnVoiceOver() throws {
        let source = try callViewSource()
        guard let fnRange = source.range(of: "private var shouldAutoHideControls: Bool") else {
            XCTFail("shouldAutoHideControls not found in CallView.swift")
            return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 300, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("isVoiceOverRunning"),
            "shouldAutoHideControls must gate on UIAccessibility.isVoiceOverRunning — " +
            "VoiceOver users navigate via swipe gestures, not taps on the video surface, " +
            "so hidden controls are unreachable and must always stay visible."
        )
    }

    func test_shouldAutoHideControls_gatesOnEffectsToolbar() throws {
        let source = try callViewSource()
        guard let fnRange = source.range(of: "private var shouldAutoHideControls: Bool") else {
            XCTFail("shouldAutoHideControls not found in CallView.swift")
            return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 300, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("showEffectsToolbar"),
            "shouldAutoHideControls must gate on showEffectsToolbar — hiding the controls " +
            "while the effects toolbar is open would leave the user unable to close it."
        )
    }
}

// MARK: - CallView video connect watchdog source guards

/// Source guards ensuring the `connectingVideoPlaceholder` watchdog Task uses
/// cancellation-aware sleep (not Timer) and correctly posts a VoiceOver
/// announcement when the video takes longer than expected.
@MainActor
final class CallViewVideoWatchdogSourceGuardTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_videoWatchdog_usesTaskSleep_notTimer() throws {
        let source = try callViewSource()
        guard let fnRange = source.range(of: "private var connectingVideoPlaceholder") else {
            XCTFail("connectingVideoPlaceholder not found in CallView.swift")
            return
        }
        // The .task { } block with Task.sleep is ~1 400 chars into the function body;
        // use 3 000 to cover the full property including the closing }.
        let end = source.index(fnRange.lowerBound, offsetBy: 3000, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("Task.sleep"),
            "connectingVideoPlaceholder watchdog must use Task.sleep so the delay is " +
            "automatically cancelled (by SwiftUI .task lifecycle) when remote video arrives."
        )
        XCTAssertFalse(
            body.contains("Timer.scheduledTimer") || body.contains("Timer.publish"),
            "connectingVideoPlaceholder watchdog must NOT use a Timer — Timer cannot be " +
            "cancelled cooperatively when the view disappears."
        )
    }

    func test_videoWatchdog_checksCancellationBeforeSlowFlag() throws {
        let source = try callViewSource()
        guard let fnRange = source.range(of: "private var connectingVideoPlaceholder") else {
            XCTFail("connectingVideoPlaceholder not found in CallView.swift")
            return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 3000, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("Task.isCancelled"),
            "connectingVideoPlaceholder watchdog must check Task.isCancelled after sleep " +
            "so it does not set videoConnectSlow = true after remote video has already arrived."
        )
    }

    func test_videoWatchdog_postsAccessibilityAnnouncement() throws {
        let source = try callViewSource()
        guard let fnRange = source.range(of: "private var connectingVideoPlaceholder") else {
            XCTFail("connectingVideoPlaceholder not found in CallView.swift")
            return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 3000, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("UIAccessibility.post") && body.contains(".announcement"),
            "connectingVideoPlaceholder watchdog must post a UIAccessibility .announcement " +
            "when the video is slow so VoiceOver users are informed without visual feedback."
        )
    }

    func test_videoWatchdog_usesConstant_notBareLiteral() throws {
        let source = try callViewSource()
        guard let fnRange = source.range(of: "private var connectingVideoPlaceholder") else {
            XCTFail("connectingVideoPlaceholder not found in CallView.swift")
            return
        }
        let end = source.index(fnRange.lowerBound, offsetBy: 3000, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[fnRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("videoConnectWatchdogSeconds"),
            "connectingVideoPlaceholder watchdog must reference videoConnectWatchdogSeconds " +
            "constant — not a bare numeric literal — so the threshold is tuneable in one place."
        )
    }

}

// MARK: - Screen Capture Monitoring (iOS 16+ deprecation guard)

@MainActor
final class CallManagerScreenCaptureMonitoringTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_screenCaptureMonitoring_doesNotUseUIScreenMain_isCaptured() throws {
        // Regression guard: UIScreen.main is deprecated in iOS 16+ for multi-window apps.
        // startScreenCaptureMonitoring() must never use UIScreen.main.isCaptured.
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func startScreenCaptureMonitoring()") else {
            XCTFail("startScreenCaptureMonitoring() not found in CallManager.swift")
            return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertFalse(
            fnBody.contains("UIScreen.main.isCaptured"),
            "startScreenCaptureMonitoring() must not use UIScreen.main.isCaptured — " +
            "UIScreen.main is deprecated in iOS 16+. Use UIApplication.shared.connectedScenes " +
            "→ UIWindowScene → .screen.isCaptured instead."
        )
    }

    func test_screenCaptureMonitoring_usesConnectedScenes_forMultiScreenDetection() throws {
        // Regression guard (Swift 6): Notification is not Sendable and cannot be captured
        // into a Task { @MainActor } closure. The observer must query connectedScenes on the
        // MainActor instead, which also correctly handles multi-screen (Stage Manager, Catalyst).
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func startScreenCaptureMonitoring()") else {
            XCTFail("startScreenCaptureMonitoring() not found in CallManager.swift")
            return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertTrue(
            fnBody.contains("UIApplication.shared.connectedScenes"),
            "startScreenCaptureMonitoring() must use UIApplication.shared.connectedScenes " +
            "to detect screen capture — UIScreen.main is deprecated in iOS 16+ and Notification " +
            "is not Sendable in Swift 6 (cannot be captured into Task { @MainActor })."
        )
    }

    func test_screenCaptureMonitoring_doesNotCaptureNotification_intoTask() throws {
        // Regression guard (Swift 6): capturing `notification` (non-Sendable) into a
        // Task { @MainActor } closure is a hard compile error under -swift-version 6 with
        // NonisolatedNonsendingByDefault. The observer closure must use `_ in`.
        let source = try callManagerSource()

        guard let fnRange = source.range(of: "private func startScreenCaptureMonitoring()") else {
            XCTFail("startScreenCaptureMonitoring() not found in CallManager.swift")
            return
        }
        let endIdx = source.index(fnRange.lowerBound, offsetBy: 1500, limitedBy: source.endIndex) ?? source.endIndex
        let fnBody = String(source[fnRange.lowerBound ..< endIdx])

        XCTAssertFalse(
            fnBody.contains("notification.object"),
            "startScreenCaptureMonitoring() must not reference notification.object inside the " +
            "Task { @MainActor } closure — Notification is not Sendable in Swift 6."
        )
    }

    // MARK: - Regression 2026-07-05: AVAudioSession mode must track isVideoEnabled mid-call

    /// `configureAudioSession()` only runs once at call setup and picks
    /// `.videoChat`/`.voiceChat` from `isVideoEnabled` at that moment. A manual
    /// `toggleVideo()` mid-call flips the WebRTC transceiver/track but must also
    /// re-apply the AVAudioSession mode — otherwise the session stays tuned for
    /// the acoustic path (loudspeaker + camera framing vs. near-field/earpiece
    /// AEC) of whichever A/V type the call STARTED as, not what it is now.
    func test_toggleVideo_reappliesAudioSessionMode() throws {
        let source = try callManagerSource()
        guard let range = source.range(of: "func toggleVideo() {") else {
            XCTFail("toggleVideo() not found"); return
        }
        let end = source.range(of: "\n    }", range: range.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let body = String(source[range.lowerBound..<end])

        XCTAssertTrue(
            body.contains("updateAudioSessionModeForCurrentVideoState()"),
            "toggleVideo() must re-apply the AVAudioSession mode after the media switch " +
            "succeeds — otherwise a mid-call A/V switch leaves the session tuned for the " +
            "wrong acoustic path (.videoChat vs .voiceChat) for the rest of the call."
        )
    }

    /// The thermal-critical branch forces a one-way video→audio-only downgrade
    /// (distinct from the user-initiated, bidirectional `toggleVideo()`), and
    /// flips `isVideoEnabled` itself — so it needs the same mode re-application.
    func test_thermalCriticalVideoDowngrade_reappliesAudioSessionMode() throws {
        let source = try callManagerSource()
        guard let range = source.range(of: "nonisolated func thermalStateDidChange(to state: ProcessInfo.ThermalState) {") else {
            XCTFail("thermalStateDidChange(to:) not found"); return
        }
        let end = source.range(of: "\n    }", range: range.upperBound..<source.endIndex)?.upperBound ?? source.endIndex
        let body = String(source[range.lowerBound..<end])

        XCTAssertTrue(
            body.contains("updateAudioSessionModeForCurrentVideoState()"),
            "thermalStateDidChange's critical-state video downgrade must re-apply the " +
            "AVAudioSession mode after flipping isVideoEnabled to false, mirroring toggleVideo()."
        )
    }
}
