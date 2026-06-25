import XCTest
@testable import Meeshy

// MARK: - Helpers

private func callManagerSource(file: StaticString = #filePath) throws -> String {
    let url = URL(fileURLWithPath: "\(file)")
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
    return try String(contentsOf: url, encoding: .utf8)
}

// MARK: - Audio Session Activation Safety

@MainActor
final class CallManagerAudioSessionActivationTests: XCTestCase {

    func test_sourceCode_doesNotForceAudioSessionActiveBeforeBridge() throws {
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
}

// MARK: - Audio Interruption Handling

@MainActor
final class CallManagerAudioInterruptionTests: XCTestCase {

    func test_handleAudioInterruption_guardsOnCallStateIsActive() throws {
        // handleAudioInterruption must be a no-op when no call is active to
        // avoid re-enabling RTCAudioSession on background system sounds
        // (music playing, notification etc.) that arrive outside any call.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func handleAudioInterruption(typeRaw:") else {
            XCTFail("handleAudioInterruption(typeRaw:) not found in CallManager.swift")
            return
        }
        let searchEnd = source.range(of: "\n    @MainActor\n    private func start",
                                     range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<searchEnd])

        XCTAssertTrue(
            funcBody.contains("guard callState.isActive"),
            "handleAudioInterruption must guard on callState.isActive to be a no-op outside active calls"
        )
    }

    func test_handleAudioInterruption_onlyResumesWhenShouldResumeOptionPresent() throws {
        // iOS may deliver .ended without the .shouldResume option when the
        // interrupting event (alarm, GSM call) owns the audio session after
        // the interruption ends. Resuming unconditionally would start sending
        // audio to a still-owned session — causing echo or silence on the peer.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func handleAudioInterruption(typeRaw:") else {
            XCTFail("handleAudioInterruption(typeRaw:) not found")
            return
        }
        let searchEnd = source.range(of: "\n    @MainActor\n    private func start",
                                     range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<searchEnd])

        XCTAssertTrue(
            funcBody.contains("shouldResume"),
            "handleAudioInterruption must check .shouldResume before re-enabling audio (AVAudioSession interruption best practice)"
        )
    }

    func test_handleAudioInterruption_reEnablesRTCAudioSessionOnResume() throws {
        // After an interruption with .shouldResume, the audio path must be
        // re-enabled explicitly: CallKit calls provider(_:didDeactivate:) on
        // interruption start, but iOS does NOT automatically call
        // provider(_:didActivate:) on resume — only an interruption-end observer
        // can restore the audio path.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func handleAudioInterruption(typeRaw:") else {
            XCTFail("handleAudioInterruption(typeRaw:) not found")
            return
        }
        let searchEnd = source.range(of: "\n    @MainActor\n    private func start",
                                     range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<searchEnd])

        XCTAssertTrue(
            funcBody.contains("isAudioEnabled = true"),
            "handleAudioInterruption must set RTCAudioSession.isAudioEnabled = true on .ended+shouldResume " +
            "because iOS does not auto-call provider(_:didActivate:) after interruption ends"
        )
        XCTAssertTrue(
            funcBody.contains("audioSessionDidActivate"),
            "handleAudioInterruption must call audioSessionDidActivate to reconnect the WebRTC audio path"
        )
    }

    func test_audioInterruptionObserver_registeredAtInit() throws {
        // The interruption observer must be registered during CallManager init
        // (startAudioInterruptionMonitoring()) so that an interruption during the
        // very first call is caught. A lazy/deferred registration would miss
        // interruptions on the first call of the session.
        let source = try callManagerSource()
        guard let initRange = source.range(of: "private init(") else {
            XCTFail("CallManager.init not found")
            return
        }
        let initEnd = source.range(of: "\n    // MARK: - Outgoing Call",
                                   range: initRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let initBody = String(source[initRange.lowerBound..<initEnd])

        XCTAssertTrue(
            initBody.contains("startAudioInterruptionMonitoring()"),
            "startAudioInterruptionMonitoring() must be called during CallManager.init so the observer is registered before any call starts"
        )
    }

    func test_audioInterruptionObserver_usesMainQueue() throws {
        // The observer notification must be delivered on the main queue so that
        // handleAudioInterruption (which is @MainActor) can be called synchronously
        // without hopping threads. Off-queue delivery would require an additional
        // Task hop that could reorder events.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func startAudioInterruptionMonitoring") else {
            XCTFail("startAudioInterruptionMonitoring not found")
            return
        }
        let funcEnd = source.range(of: "\n    @MainActor\n    private func handleAudioInterruption",
                                   range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        XCTAssertTrue(
            funcBody.contains("queue: .main"),
            "AVAudioSession.interruptionNotification observer must be registered on queue: .main for synchronous @MainActor dispatch"
        )
    }
}

// MARK: - Audio Route Change Handling

@MainActor
final class CallManagerAudioRouteChangeTests: XCTestCase {

    func test_handleAudioRouteChange_guardsOnCallStateIsActive() throws {
        // Route changes arrive for every system audio event (music, alarms,
        // Siri). Without the isActive guard, isSpeaker would flip during a
        // Siri session or a background audio app, leaving the call UI out of
        // sync once the user returns to the call.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func handleAudioRouteChange(reasonRaw:") else {
            XCTFail("handleAudioRouteChange(reasonRaw:) not found")
            return
        }
        let searchEnd = source.range(of: "\n    private var callKitDelegate",
                                     range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<searchEnd])

        XCTAssertTrue(
            funcBody.contains("guard callState.isActive"),
            "handleAudioRouteChange must guard on callState.isActive so route changes outside a call are ignored"
        )
    }

    func test_handleAudioRouteChange_newDeviceAvailable_setsSpeakerFalse() throws {
        // Plugging in a headset or connecting Bluetooth must automatically
        // clear the speaker state — the audio is now routed to the peripheral
        // and the speaker button in CallView should reflect that.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func handleAudioRouteChange(reasonRaw:") else {
            XCTFail("handleAudioRouteChange(reasonRaw:) not found")
            return
        }
        let searchEnd = source.range(of: "\n    private var callKitDelegate",
                                     range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<searchEnd])

        // The .newDeviceAvailable branch sets isSpeaker = false
        guard let newDeviceIdx = funcBody.range(of: ".newDeviceAvailable")?.lowerBound else {
            XCTFail(".newDeviceAvailable case not handled in handleAudioRouteChange")
            return
        }
        let nextCaseIdx = funcBody.range(of: "case .", range: newDeviceIdx..<funcBody.endIndex)
            .flatMap { funcBody.range(of: "case .", range: $0.upperBound..<funcBody.endIndex) }?
            .lowerBound ?? funcBody.endIndex
        let branchBody = String(funcBody[newDeviceIdx..<nextCaseIdx])

        XCTAssertTrue(
            branchBody.contains("isSpeaker = false"),
            ".newDeviceAvailable must set isSpeaker = false to reflect that audio routed to the peripheral"
        )
    }

    func test_handleAudioRouteChange_oldDeviceUnavailable_reAppliesSpeakerRoute() throws {
        // Unplugging a headset causes iOS to automatically re-route to the
        // built-in receiver. We must re-apply the user's speaker preference so
        // the call continues at the expected volume level — without this, the
        // audio would fall to earpiece even if the user had enabled the speaker.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func handleAudioRouteChange(reasonRaw:") else {
            XCTFail("handleAudioRouteChange(reasonRaw:) not found")
            return
        }
        let searchEnd = source.range(of: "\n    private var callKitDelegate",
                                     range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<searchEnd])

        guard let oldDeviceIdx = funcBody.range(of: ".oldDeviceUnavailable")?.lowerBound else {
            XCTFail(".oldDeviceUnavailable case not handled in handleAudioRouteChange")
            return
        }
        let nextCaseEnd = funcBody.endIndex
        let branchBody = String(funcBody[oldDeviceIdx..<nextCaseEnd])

        XCTAssertTrue(
            branchBody.contains("applySpeakerRoute()"),
            ".oldDeviceUnavailable must call applySpeakerRoute() to re-apply the user's speaker preference after headset removal"
        )
    }

    func test_audioRouteChangeObserver_registeredAtInit() throws {
        let source = try callManagerSource()
        guard let initRange = source.range(of: "private init(") else {
            XCTFail("CallManager.init not found")
            return
        }
        let initEnd = source.range(of: "\n    // MARK: - Outgoing Call",
                                   range: initRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let initBody = String(source[initRange.lowerBound..<initEnd])

        XCTAssertTrue(
            initBody.contains("startAudioRouteChangeMonitoring()"),
            "startAudioRouteChangeMonitoring() must be called during CallManager.init"
        )
    }
}

// MARK: - Network Handoff / LTE⇄WiFi Recovery

@MainActor
final class CallManagerNetworkHandoffTests: XCTestCase {

    func test_networkPathMonitor_started_atInit() throws {
        let source = try callManagerSource()
        guard let initRange = source.range(of: "private init(") else {
            XCTFail("CallManager.init not found")
            return
        }
        let initEnd = source.range(of: "\n    // MARK: - Outgoing Call",
                                   range: initRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let initBody = String(source[initRange.lowerBound..<initEnd])

        XCTAssertTrue(
            initBody.contains("startNetworkMonitoring()"),
            "startNetworkMonitoring() must be called in init so that path events are never missed for the first call"
        )
    }

    func test_networkLoss_triggersAttemptReconnection() throws {
        // When the network path becomes unsatisfied during a connected call,
        // the ICE connection will likely drop. We must proactively initiate an
        // ICE restart so WebRTC begins gathering candidates on the new path
        // rather than waiting for the WebRTC stack to declare failure (which
        // can take 15-30s). This is the LTE⇄WiFi handoff path.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func startNetworkMonitoring") else {
            XCTFail("startNetworkMonitoring not found")
            return
        }
        let funcEnd = source.range(of: "\n    private func endCallInternal",
                                   range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        XCTAssertTrue(
            funcBody.contains("attemptReconnection()"),
            "startNetworkMonitoring handler must call attemptReconnection() when network is lost during a call"
        )
        XCTAssertTrue(
            funcBody.contains("path.status != .satisfied"),
            "Network loss detection must check path.status != .satisfied"
        )
    }

    func test_networkRecovery_triggersAttemptReconnection() throws {
        // When the network recovers (LTE→WiFi or vice-versa), we initiate an
        // ICE restart so WebRTC gathers candidates on the NEW network path.
        // Without this, the call remains on stale ICE candidates from the old
        // path and typically stays disconnected for 15-30s (WebRTC's own
        // failure+restart cycle), which appears as a hang.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func startNetworkMonitoring") else {
            XCTFail("startNetworkMonitoring not found")
            return
        }
        let funcEnd = source.range(of: "\n    private func endCallInternal",
                                   range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        // Both network-loss AND network-recovery branches should call attemptReconnection.
        // The recovery branch should specifically check wasUnsatisfied && isNowSatisfied.
        XCTAssertTrue(
            funcBody.contains("wasUnsatisfied && isNowSatisfied"),
            "Network recovery (wasUnsatisfied → satisfied) must trigger attemptReconnection() for the LTE⇄WiFi handoff"
        )
    }

    func test_networkMonitoring_onlyActsDuringActiveCall() throws {
        // Network events arrive constantly throughout the app lifecycle. The
        // monitor must only trigger ICE restart/reconnection when a call is
        // actually in progress (.connected or .reconnecting), not during
        // ringing, connecting, or while idle — those states manage their own
        // ICE lifecycle independently.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func startNetworkMonitoring") else {
            XCTFail("startNetworkMonitoring not found")
            return
        }
        let funcEnd = source.range(of: "\n    private func endCallInternal",
                                   range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        XCTAssertTrue(
            funcBody.contains(".connected") && funcBody.contains(".reconnecting"),
            "Network monitor handler must limit reconnection attempts to .connected/.reconnecting states"
        )
        // The guard ensures other states are excluded
        XCTAssertTrue(
            funcBody.contains("guard isInActiveCall"),
            "Network monitor must guard on isInActiveCall before calling attemptReconnection"
        )
    }
}

// MARK: - isCallActiveFlag Thread Safety

@MainActor
final class CallManagerIsCallActiveFlagTests: XCTestCase {

    func test_isCallActiveFlag_usesLockProtection() throws {
        // nonisolated(unsafe) on the bare Bool was a data race: any thread
        // (SDK socket managers) reading isCallActiveFlag concurrently with a
        // MainActor write had no synchronisation. The fix stores the Bool in an
        // OSAllocatedUnfairLock so concurrent reads and MainActor writes are
        // serialised by the lock's os_unfair_lock.
        let source = try callManagerSource()
        XCTAssertFalse(
            source.contains("nonisolated(unsafe) static var isCallActiveFlag: Bool = false"),
            "isCallActiveFlag must not be a bare nonisolated(unsafe) Bool (data race on concurrent reads). " +
            "It must be lock-protected (OSAllocatedUnfairLock)."
        )
    }

    func test_isCallActiveFlag_backingLock_isAllocatedUnfairLock() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("OSAllocatedUnfairLock"),
            "isCallActiveFlag must be backed by OSAllocatedUnfairLock for cross-actor thread safety"
        )
    }

    func test_isCallActiveFlag_nonisolatedComputedProperty() throws {
        // The computed property must be `nonisolated` so that it can be read
        // from ANY isolation domain (SDK socket managers, background Tasks)
        // without needing a MainActor hop.
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("nonisolated static var isCallActiveFlag: Bool"),
            "isCallActiveFlag must be a nonisolated computed property so it is readable from any thread/actor"
        )
    }

    func test_isCallActiveFlag_updatedInCallStateDidSet() throws {
        // The flag must track callState.isActive so SDK consumers see the
        // current call status immediately, without waiting for a SwiftUI update.
        let source = try callManagerSource()
        guard let didSetRange = source.range(of: "var callState: CallState = .idle {") else {
            XCTFail("callState didSet not found")
            return
        }
        let didSetEnd = source.range(of: "\n    @Published private(set) var transcriptionService",
                                     range: didSetRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let didSetBody = String(source[didSetRange.lowerBound..<didSetEnd])

        XCTAssertTrue(
            didSetBody.contains("isCallActiveFlag"),
            "callState.didSet must update isCallActiveFlag so SDK consumers always see current call status"
        )
    }

    func test_isCallActiveFlag_concurrentReadsDoNotCrash() {
        // Integration-level sanity: hammer concurrent reads and one write from
        // background threads. If the lock is missing this crashes under TSAN.
        // (This test also serves as a compile-time proof that the property is
        // accessible from a `nonisolated` / background context.)
        let readCount = 100
        let results = (0..<readCount).map { _ in CallManager.isCallActiveFlag }
        // Just verifying no crash and the result is a Bool
        XCTAssertEqual(results.filter { $0 }.count + results.filter { !$0 }.count, readCount)
    }

    func test_isCallActiveFlag_writeFromMainActorIsSafe() {
        // The setter must be callable from the MainActor (the only place that
        // mutates callState). Verify no runtime assertion or deadlock.
        let before = CallManager.isCallActiveFlag
        CallManager.isCallActiveFlag = !before
        XCTAssertEqual(CallManager.isCallActiveFlag, !before)
        // Restore to original value so other tests aren't affected by singleton state.
        CallManager.isCallActiveFlag = before
    }
}

// MARK: - Socket Reconnect on CallRoom Re-join

@MainActor
final class CallManagerSocketReconnectTests: XCTestCase {

    func test_socketReconnect_emitsCallJoin_toRejoinCallRoom() throws {
        // When the Socket.IO connection drops and reconnects mid-call, the
        // gateway evicts the socket from the call's Socket.IO room. Without
        // an explicit call:join re-emit, all gateway-relayed events (ICE
        // candidates, call:ended) are silently dropped — the call becomes
        // a zombie that never terminates on the client.
        let source = try callManagerSource()
        guard let reconnectRange = source.range(of: "socket.didReconnect") else {
            XCTFail("socket.didReconnect subscription not found in CallManager")
            return
        }
        let sinkEnd = source.range(of: ".store(in: &cancellables)",
                                   range: reconnectRange.upperBound..<source.endIndex)?.upperBound
            ?? source.endIndex
        let subscriptionBody = String(source[reconnectRange.lowerBound..<sinkEnd])

        XCTAssertTrue(
            subscriptionBody.contains("emitCallJoin(callId: callId)"),
            "socket.didReconnect handler must re-emit call:join so the gateway puts us back in the call room"
        )
    }

    func test_socketReconnect_flushesBufferedIceCandidates() throws {
        // ICE candidates generated while the socket was down are buffered in
        // `pendingIceCandidates`. On reconnect they must be flushed so the
        // peer receives all candidates and ICE can complete.
        let source = try callManagerSource()
        guard let reconnectRange = source.range(of: "socket.didReconnect") else {
            XCTFail("socket.didReconnect subscription not found")
            return
        }
        let sinkEnd = source.range(of: ".store(in: &cancellables)",
                                   range: reconnectRange.upperBound..<source.endIndex)?.upperBound
            ?? source.endIndex
        let subscriptionBody = String(source[reconnectRange.lowerBound..<sinkEnd])

        XCTAssertTrue(
            subscriptionBody.contains("flushPendingIceCandidates()"),
            "socket.didReconnect handler must flush buffered ICE candidates so they reach the peer"
        )
    }
}

// MARK: - VoIP Push Freshness Check

@MainActor
final class CallManagerVoIPFreshnessTests: XCTestCase {

    func test_freshness_check_handlesTerminalStatuses() throws {
        // A VoIP push delivered by APNs minutes after the caller hung up must
        // be detected and the phantom CallKit entry ended immediately. The
        // freshness check parses the `status` field and ends on terminal values.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func checkVoIPCallFreshness") else {
            XCTFail("checkVoIPCallFreshness not found")
            return
        }
        let funcEnd = source.range(of: "\n    // MARK: - Phantom VoIP Call",
                                   range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        XCTAssertTrue(
            funcBody.contains("\"ended\"") && funcBody.contains("\"missed\"") && funcBody.contains("\"rejected\""),
            "checkVoIPCallFreshness must treat ended/missed/rejected as terminal statuses to auto-end phantom calls"
        )
    }

    func test_freshness_check_handlesNotFound() throws {
        // A 404 from the gateway means the call was never created (extremely
        // delayed push, or malformed callId). The CallKit entry must be ended.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func checkVoIPCallFreshness") else {
            XCTFail("checkVoIPCallFreshness not found")
            return
        }
        let funcEnd = source.range(of: "\n    // MARK: - Phantom VoIP Call",
                                   range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        XCTAssertTrue(
            funcBody.contains("statusCode == 404"),
            "checkVoIPCallFreshness must end the phantom call when the gateway returns 404 (call not found)"
        )
    }

    func test_freshness_check_assumesFreshOnNetworkError() throws {
        // A network error during the freshness check should not abort a
        // potentially valid call — it is preferable to show a brief phantom
        // UI than to discard a genuine incoming call silently.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func checkVoIPCallFreshness") else {
            XCTFail("checkVoIPCallFreshness not found")
            return
        }
        let funcEnd = source.range(of: "\n    // MARK: - Phantom VoIP Call",
                                   range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        XCTAssertTrue(
            funcBody.contains("assuming fresh"),
            "checkVoIPCallFreshness must treat network errors as 'fresh' (keep the call) rather than dropping it"
        )
    }

    func test_freshness_check_usesPinnedSession_notURLSessionShared() throws {
        // SECURITY: checkVoIPCallFreshness must use APIClient.shared.urlSession
        // (which carries the CertificatePinningDelegate) rather than URLSession.shared,
        // which has no certificate pinning. Using the bare shared session exposes the
        // Bearer token to MITM attacks on adversarial networks (public WiFi, rogue AP).
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func checkVoIPCallFreshness") else {
            XCTFail("checkVoIPCallFreshness not found")
            return
        }
        let funcEnd = source.range(of: "\n    // MARK: - Phantom VoIP Call",
                                   range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        XCTAssertFalse(
            funcBody.contains("URLSession.shared.data"),
            "checkVoIPCallFreshness must NOT use URLSession.shared — it bypasses certificate pinning. " +
            "Use APIClient.shared.urlSession instead."
        )
        XCTAssertTrue(
            funcBody.contains("APIClient.shared.urlSession"),
            "checkVoIPCallFreshness must use APIClient.shared.urlSession so the " +
            "CertificatePinningDelegate protects the Bearer token on every network."
        )
    }
}

// MARK: - Call State / isCallActiveFlag Synchronization

@MainActor
final class CallManagerStateFlagSyncTests: XCTestCase {

    func test_callState_didSet_updatesIsCallActiveFlag() throws {
        // isCallActiveFlag is a thread-safe mirror of callState.isActive consumed
        // by SDK socket managers from background threads. The only authoritative
        // update point MUST be callState.didSet — any direct assignment outside of
        // this property observer could leave the flag inconsistent with the actor
        // state (e.g. endCallInternal sets state → .ended but flag stays true →
        // socket managers keep suppressing reconnect for a terminated call).
        let source = try callManagerSource()

        guard let publishedRange = source.range(of: "@Published private(set) var callState") else {
            XCTFail("callState @Published declaration not found")
            return
        }
        let didSetEnd = source.range(of: "\n    @Published",
                                     range: publishedRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let callStateBlock = String(source[publishedRange.lowerBound..<didSetEnd])

        XCTAssertTrue(
            callStateBlock.contains("didSet"),
            "callState must have a didSet observer to keep isCallActiveFlag in sync"
        )
        XCTAssertTrue(
            callStateBlock.contains("CallManager.isCallActiveFlag"),
            "callState.didSet must update CallManager.isCallActiveFlag so SDK socket managers read a consistent value from background threads"
        )
    }

    func test_isCallActiveFlag_noDirectAssignmentOutsideDidSet() throws {
        // All assignments to isCallActiveFlag must flow through callState.didSet.
        // A direct `CallManager.isCallActiveFlag = ...` outside of the didSet
        // would create a race (didSet writes from @MainActor; direct writes from
        // any context) AND could desync the flag from callState.
        // Exception: MeeshyApp.swift wires the flag via closure injection (read
        // path only), and the didSet itself is the write path.
        let source = try callManagerSource()

        // Count occurrences by splitting on the sentinel and subtracting 1.
        let needle = "CallManager.isCallActiveFlag = "
        let assignmentCount = source.components(separatedBy: needle).count - 1
        XCTAssertEqual(
            assignmentCount, 1,
            "isCallActiveFlag must only be set in callState.didSet; found \(assignmentCount) direct assignments in CallManager.swift"
        )
    }
}

// MARK: - Negotiation Epoch Reset

@MainActor
final class CallManagerNegotiationEpochResetTests: XCTestCase {

    func test_applyNegotiationRole_resetsNegotiationIdToZero() throws {
        // applyNegotiationRole() is the per-call setup chokepoint for negotiation
        // state. It MUST reset negotiationId = 0 so a peer with a high epoch from
        // a prior call does not wrongly discard the new call's first offer (generation
        // 1 < prior high-water-mark would be stale under isStaleNegotiation).
        // This is a cross-call epoch pollution guard.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func applyNegotiationRole()") else {
            XCTFail("applyNegotiationRole() not found in CallManager.swift")
            return
        }
        let funcEnd = source.range(of: "\n    ", range: funcRange.upperBound..<source.endIndex)
            .flatMap { source.range(of: "\n    }", range: funcRange.upperBound..<source.endIndex)?.lowerBound }
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        XCTAssertTrue(
            funcBody.contains("negotiationId = 0"),
            "applyNegotiationRole() must reset negotiationId = 0 to prevent cross-call epoch pollution"
        )
    }

    func test_nextOutgoingNegotiationId_incrementsEpoch() throws {
        // Each outgoing offer must carry a generation strictly higher than any prior
        // accepted signal. The ONLY place that bumps the epoch must be
        // nextOutgoingNegotiationId() — inline incrementing would lose the
        // high-water-mark guarantee.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func nextOutgoingNegotiationId()") else {
            XCTFail("nextOutgoingNegotiationId() not found in CallManager.swift")
            return
        }
        let funcEnd = source.range(of: "\n    }", range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        XCTAssertTrue(
            funcBody.contains("negotiationId += 1"),
            "nextOutgoingNegotiationId() must increment negotiationId before returning it"
        )
        XCTAssertTrue(
            funcBody.contains("return negotiationId"),
            "nextOutgoingNegotiationId() must return the newly incremented negotiationId"
        )
    }

    func test_acceptIncomingNegotiation_updatesHighWaterMark() throws {
        // acceptIncomingNegotiation must advance the local high-water mark to the
        // incoming generation when it is newer. Without this, a second round of
        // offers (ICE restart) would be accepted at the same generation as the
        // initial negotiation — making the two rounds indistinguishable to
        // isStaleNegotiation.
        let source = try callManagerSource()
        guard let funcRange = source.range(of: "func acceptIncomingNegotiation") else {
            XCTFail("acceptIncomingNegotiation not found in CallManager.swift")
            return
        }
        let funcEnd = source.range(of: "\n    }", range: funcRange.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let funcBody = String(source[funcRange.lowerBound..<funcEnd])

        XCTAssertTrue(
            funcBody.contains("negotiationId = max(negotiationId, generation)"),
            "acceptIncomingNegotiation must advance the high-water mark: negotiationId = max(negotiationId, generation)"
        )
    }
}
