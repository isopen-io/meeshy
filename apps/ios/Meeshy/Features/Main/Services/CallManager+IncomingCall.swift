import Foundation
import AVFoundation
@preconcurrency import CallKit
import Combine
import Network
import UIKit
import MeeshySDK
import MeeshyUI
@preconcurrency import WebRTC
import os

/// Un appel qui ARRIVE : push VoIP (fraîcheur, annulation, appel fantôme),
/// nom de l'appelant, et notification d'appel par le socket.

extension CallManager {

    // MARK: - VoIP Push Incoming Call

    func reportIncomingVoIPCall(callId: String, callerUserId: String, callerName: String, isVideo: Bool, iceServers: [IceServer]? = nil, conversationId: String? = nil) {
        let uuid = UUID()
        let update = CXCallUpdate()
        // Use the callerUserId as the CXHandle.value so Recents stays stable
        // across language/avatar changes; localizedCallerName is what the lock
        // screen displays.
        update.remoteHandle = CXHandle(type: .generic, value: callerUserId.isEmpty ? callerName : callerUserId)
        update.localizedCallerName = callerName
        update.hasVideo = isVideo
        update.supportsGrouping = false
        update.supportsHolding = false

        // Audit finding — the socket path (`call:offer`) and this VoIP-push
        // path can both deliver the SAME callId (e.g. the socket wins the
        // race while foreground, then the push for the identical call lands
        // moments later). Guarded BEFORE any state mutation below (resetEnded/
        // callUsesCallKit/etc.) so a duplicate push never disturbs the call
        // already active. Without this guard the push fell into the busy
        // branch below for a call the user is CURRENTLY being rung for:
        // a phantom second CXCallUpdate/UUID retired as "Missed" in Recents,
        // plus a call-waiting banner offering Answer/Reject over the very
        // ring already on screen. Mirrors the guard the socket path already
        // has in handleIncomingCallNotification / call:offer handling.
        if currentCallId == callId, callState.isActive {
            Logger.calls.info("VoIP push for callId \(callId) already active — phantom-acking, no duplicate UI")
            reportPhantomVoIPCall(uuid: uuid, update: update, callId: callId)
            return
        }

        resetEndedStateForNewCall()

        guard callState == .idle else {
            // Busy: report + immediately end the secondary call. Mirror the
            // idle-path failure handling below — if CallKit refuses this
            // report (two call groups already used, restricted mode, a
            // transient CallKit error), the dedup ring already recorded this
            // callId when the push arrived, and it must be evicted or a
            // legitimate APNs retry gets silently dropped as a duplicate,
            // leaving the callee with zero call UI for a call CallKit never
            // actually reported.
            callProvider.reportNewIncomingCall(with: uuid, update: update) { error in
                guard let error else { return }
                Logger.calls.error("CallKit VoIP report failed (busy path): \(error.localizedDescription)")
                Task { @MainActor in
                    VoIPPushManager.shared.clearDedup(callId: callId)
                }
            }
            // A nil `endedAt` means "unknown" to CallKit (produces an inaccurate/missing
            // timestamp in Recents) — every other reportCall site in this file passes
            // Date(); this synthesized busy-path report ends right now, so do the same.
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
            rejectSupersededPendingCall(replacingWithCallId: callId)
            pendingIncomingCall = (callId: callId, fromUserId: callerUserId, fromUsername: callerName, isVideo: isVideo, iceServers: iceServers, conversationId: conversationId)
            showCallWaitingBanner = true
            Logger.calls.info("VoIP push while busy — ended secondary call, showing banner")
            HapticFeedback.medium()
            return
        }

        // Session flags of the NEW call — written only once the busy branch is
        // ruled out. Above the guard they also hit the call ALREADY in progress
        // (a foreground in-app call legitimately runs with callUsesCallKit ==
        // false), corrupting it from a second ring it never answered.
        lastCallWasOutgoing = false
        // The VoIP-push path ALWAYS uses CallKit — Apple mandates a synchronous
        // reportNewIncomingCall from the push handler. Reset the flag (a prior
        // foreground in-app call may have left it false).
        callUsesCallKit = true
        ringbackPlayer.shouldSelfActivateSession = false

        // Set state BEFORE reporting to CallKit to avoid race
        currentCallId = callId
        remoteUserId = callerUserId
        remoteUsername = callerName
        self.conversationId = conversationId
        isVideoEnabled = isVideo
        isMuted = false
        isSpeaker = isVideo
        // Force displayMode = .fullScreen (cf. startCall pour le rationale).
        displayMode = .fullScreen
        callState = .ringing(isOutgoing: false)
        activeCallUUID = uuid

        callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            guard let error else { return }
            Logger.calls.error("CallKit VoIP report failed: \(error.localizedDescription)")
            Task { @MainActor [weak self] in
                // Audit 2026-07-10 — route through failCall so this teardown
                // also reports `.failed` to CallKit (via reportCall). Calling
                // endCallInternal directly left a partially-registered system
                // Recents entry never explicitly ended, unlike every other
                // failure path in this file (see failCall's doc comment).
                self?.failCall("CallKit error")
                // The dedup ring already recorded this callId when the push
                // arrived; since CallKit refused to report it, evict it so a
                // legitimate APNs retry isn't dropped as a duplicate.
                VoIPPushManager.shared.clearDedup(callId: callId)
            }
        }

        // Bug D — Push VoIP décalé : APNs peut livrer la push plusieurs minutes
        // après l'émission (queueing iOS, app suspendue, latence réseau). Si
        // l'appelant a déjà raccroché entre-temps, on présenterait une fausse
        // UI d'appel entrant qui ne sonnera jamais réellement (sans ce check).
        //
        // Apple exige `reportNewIncomingCall` SYNCHRONE sous 5s du push (sous
        // peine de révocation du token APNs), donc on report d'abord puis on
        // vérifie en background. Si le gateway répond avec un statut terminal
        // (ended/missed/rejected/failed) ou 404, on end immédiatement l'appel
        // CallKit avec `.unanswered` — la lock-screen flash brièvement puis
        // disparaît, l'entrée Recents reste neutre.
        let capturedUuid = uuid
        let capturedCallId = callId
        voipFreshnessTask?.cancel()
        voipFreshnessTask = Task { [weak self] in
            await self?.checkVoIPCallFreshness(uuid: capturedUuid, callId: capturedCallId)
        }

        // Auto-join call room + configure WebRTC so SDP offer can be received while ringing.
        // The VoIP push payload carries the per-user ICE servers (TURN credentials)
        // so RTCPeerConnection is built with TURN BEFORE the offer is set.
        Logger.calls.info("[CALL_SETUP] incoming 1/4 webRTC.configure begin (isVideo=\(isVideo))")
        // Audit fix (calling-stack audit 2026-08-15): abort on a genuine
        // peer-connection creation failure instead of silently proceeding.
        guard webRTCService.configure(isVideo: isVideo, iceServers: iceServers) else {
            Logger.calls.error("[CALL_SETUP] incoming (VoIP) webRTC.configure failed — aborting")
            failCall("Failed to configure WebRTC")
            return
        }
        armTurnCredentialsAfterConfigure(callId: callId, iceServers: iceServers)
        applyNegotiationRole()
        Logger.calls.info("[CALL_SETUP] incoming 2/4 configureAudioSession begin")
        configureAudioSession()
        startReliabilityMonitor()
        // Audit fix (calling-stack audit 2026-08-24) — arm the background
        // observer HERE too, at ring time, mirroring handleIncomingCallNotification
        // (same fix, other incoming-call entry point). Without it, a VoIP-push
        // call that backgrounds before being answered has no observer to run
        // the applyCameraSuspension(false, cause: "foreground") safety net or
        // notify the peer of the background/foreground transition while still
        // ringing. Safe to call twice per call: startBackgroundMonitoring()
        // starts with stopBackgroundMonitoring() to stay idempotent.
        startBackgroundMonitoring()

        // Phase 2 fix — Bug 2: emit call:join IMMEDIATELY (before awaiting
        // startLocalMedia) so the caller receives PARTICIPANT_JOINED without
        // waiting for our camera/mic warmup. Media init runs in parallel; the
        // answer creation paths (answerCall*, handleSignalOffer .connecting)
        // await `localMediaTask` before invoking createAnswer.
        // [Fix 2026-07-02] via joinCallRoomReliably: on a VoIP cold start the
        // socket has never connected — a bare emit vanishes (prod-observed).
        joinCallRoomReliably(callId: callId)
        Logger.calls.info("VoIP push — reliable call:join dispatched; starting media in parallel: \(callId) (\(iceServers?.count ?? 0) ICE servers)")

        localMediaTask?.cancel()
        localMediaTask = Task { [weak self] in
            guard let self else { return }
            Logger.calls.info("[CALL_SETUP] incoming 3/4 startLocalMedia begin (isVideo=\(isVideo))")
            await self.performLocalMediaStart(isVideo: isVideo, callId: callId)
            Logger.calls.info("[CALL_SETUP] incoming 4/4 startLocalMedia done")
        }

        Logger.calls.info("VoIP push incoming call reported: \(callId) from \(callerName)")
        HapticFeedback.medium()
    }

    // MARK: - VoIP Push Freshness Check (Bug D)

    /// Vérifie via REST `GET /api/v1/calls/:callId` que l'appel pour lequel
    /// on a reçu un push VoIP est toujours actif sur le gateway. Si non,
    /// end immédiatement l'appel CallKit qu'on vient de reporter — utile
    /// quand APNs livre la push plusieurs minutes après l'émission (l'app
    /// suspendue, le device offline, latence réseau).
    @MainActor
    private func checkVoIPCallFreshness(uuid: UUID, callId: String) async {
        guard let token = AuthManager.shared.authToken else {
            Logger.calls.warning("[VOIP_FRESHNESS] no auth token — cannot verify, assuming fresh")
            return
        }
        let urlString = "\(MeeshyConfig.shared.apiBaseURL)/calls/\(callId)"
        guard let url = URL(string: urlString) else { return }

        var request = URLRequest(url: url, timeoutInterval: QualityThresholds.voipFreshnessTimeoutSeconds)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await APIClient.shared.urlSession.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else { return }

            if httpResponse.statusCode == 404 {
                Logger.calls.warning("[VOIP_FRESHNESS] callId \(callId) introuvable (404) — push stale, ending phantom call")
                if activeCallUUID == uuid, case .ringing = callState {
                    callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
                    endCallInternal(reason: .missed)
                }
                return
            }

            guard httpResponse.statusCode == 200,
                  let envelope = JSONDecoder().decodeOrLog(CallFreshnessResponse.self, from: data,
                                                           field: "call freshness", logger: Logger.calls),
                  envelope.success,
                  let status = envelope.data?.status else {
                Logger.calls.info("[VOIP_FRESHNESS] response opaque — assuming fresh")
                return
            }

            let terminalStatuses: Set<String> = ["ended", "missed", "rejected", "failed"]
            if terminalStatuses.contains(status.lowercased()) {
                Logger.calls.warning("[VOIP_FRESHNESS] callId \(callId) status=\(status) (terminal) — push stale, ending phantom call")
                // Guard on `callState` too, not just `activeCallUUID` — this REST check
                // can take up to `voipFreshnessTimeoutSeconds` to resolve. If the user
                // answers while it's in flight, the call has already moved past
                // `.ringing` (connecting/connected) by the time this returns, and a
                // stale/racy terminal response must never tear down a call the user
                // is actively on.
                if activeCallUUID == uuid, case .ringing = callState {
                    callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
                    endCallInternal(reason: .missed)
                }
            } else {
                Logger.calls.info("[VOIP_FRESHNESS] callId \(callId) status=\(status) — push fresh, continuing")
            }
        } catch {
            Logger.calls.warning("[VOIP_FRESHNESS] check failed (\(error.localizedDescription)) — assuming fresh")
        }
    }

    private struct CallFreshnessResponse: Decodable {
        let success: Bool
        let data: CallFreshnessData?
        struct CallFreshnessData: Decodable {
            let status: String?
        }
    }

    // MARK: - call_cancel Silent Push (phantom-ring hardening)

    /// Le gateway envoie une push APNs background `call_cancel` quand un appel
    /// se termine SANS avoir été décroché (missed/rejected), à destination des
    /// membres dont le socket n'est jamais monté (push VoIP passée par APNs,
    /// WebSocket bloqué par le réseau) : le fanout socket `call:ended` ne peut
    /// pas les atteindre et CallKit sonnerait jusqu'au timeout local. Gardé par
    /// `CallReliabilityPolicy.shouldEndRingingOnCancellation` : seul l'appel
    /// ENTRANT encore en sonnerie au callId EXACT est terminé — un cancel
    /// tardif/rejoué ne touche jamais un appel décroché ni un ring sortant.
    func endRingingFromCancellation(callId: String) {
        // Audit gateway-calls (2026-08-15) — mirror every socket-based
        // terminal listener (call:ended/missed/already-answered/forced-leave,
        // see their `clearPendingIncomingCall(ifMatching:)` calls above):
        // this push is the socketless counterpart of the SAME event family,
        // and `shouldEndRingingOnCancellation` only ever matches the PRIMARY
        // ringing call. Without this, a cancel for the WAITING/call-waiting-
        // banner call (not the primary one) no-ops below and the banner
        // lingers offering "Answer/Reject" for a call already cancelled,
        // until its own 15s auto-dismiss.
        clearPendingIncomingCall(ifMatching: callId)
        guard CallReliabilityPolicy.shouldEndRingingOnCancellation(
            pushCallId: callId,
            currentCallId: currentCallId,
            callState: callState
        ) else {
            Logger.calls.info("call_cancel push ignored (callId=\(callId)) — no matching incoming ring")
            return
        }
        Logger.calls.info("call_cancel push — ending still-ringing call \(callId)")
        if callUsesCallKit, let uuid = activeCallUUID {
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        }
        endCallInternal(reason: .remote)
    }

    /// Pendant multi-device de `endRingingFromCancellation` : un AUTRE device
    /// du même compte a décroché (push background `call_answered_elsewhere`,
    /// miroir socketless de `call:already-answered`). Même garde FSM pure ;
    /// seule la raison CallKit diffère — `.answeredElsewhere` pour que
    /// Recents affiche « répondu sur un autre appareil » et non « manqué ».
    func endRingingAnsweredElsewhere(callId: String) {
        // Same rationale as endRingingFromCancellation() above — this is the
        // socketless counterpart of call:already-answered, which also clears
        // the waiting banner FIRST (see its clearPendingIncomingCall call).
        clearPendingIncomingCall(ifMatching: callId)
        guard CallReliabilityPolicy.shouldEndRingingOnCancellation(
            pushCallId: callId,
            currentCallId: currentCallId,
            callState: callState
        ) else {
            Logger.calls.info("call_answered_elsewhere push ignored (callId=\(callId)) — no matching incoming ring")
            return
        }
        Logger.calls.info("call_answered_elsewhere push — dismissing ring for \(callId)")
        if callUsesCallKit, let uuid = activeCallUUID {
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: .answeredElsewhere)
        }
        endCallInternal(reason: .remote)
    }

    // MARK: - Phantom VoIP Call (defense-in-depth)

    /// Apple PushKit requires reporting a call for every incoming VoIP push,
    /// otherwise the system kills the app and revokes the token. When a push
    /// arrives without a valid call payload (malformed or stale), report a
    /// phantom call and immediately end it so the user never sees the call UI.
    ///
    /// Audit finding — `callId` is passed for the dedup-hit phantom path (a
    /// duplicate push for a callId already recorded in `VoIPDedupRing`) so
    /// that if CallKit refuses this synthetic report (e.g.
    /// `maximumCallGroups` already saturated), the dedup entry is evicted —
    /// otherwise a genuine APNs retry for the same callId within the dedup
    /// TTL would be silently phantom-acked again with no CallKit UI ever
    /// actually surfacing (mirrors the failure handling in
    /// `reportIncomingVoIPCall`). Nil for the malformed-payload path, which
    /// never touched the dedup ring in the first place.
    func reportPhantomVoIPCall(uuid: UUID, update: CXCallUpdate, callId: String? = nil) {
        callProvider.reportNewIncomingCall(with: uuid, update: update) { error in
            guard let error, let callId else { return }
            Logger.calls.error("CallKit phantom-call report failed (callId=\(callId)): \(error.localizedDescription)")
            Task { @MainActor in
                VoIPPushManager.shared.clearDedup(callId: callId)
            }
        }
        // Audit P3 — was `.failed` which Recents shows as a "Failed call"
        // entry. `.unanswered` is the documented phantom-call idiom on
        // iOS 17+ — the lock-screen flash is suppressed and Recents shows
        // a neutral "Missed" entry instead of a hard failure.
        callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
    }

    // MARK: - Update Incoming Call Name

    func updateIncomingCallName(_ name: String) {
        guard let uuid = activeCallUUID else { return }
        // Audit P3 — skip the CallKit update if the user has already
        // answered/declined. The cache-resolution Task that calls this
        // method can finish AFTER the user has acted; updating the CallKit
        // card at that point either flashes a stale name or no-ops with a
        // log noise.
        guard case .ringing = callState else { return }
        remoteUsername = name
        let update = CXCallUpdate()
        update.localizedCallerName = name
        callProvider.reportCall(with: uuid, updated: update)
        Logger.calls.info("Updated incoming call name to: \(name)")
    }

    // MARK: - Incoming Call (Socket)


    func handleIncomingCallNotification(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, iceServers: [IceServer]? = nil, conversationId: String? = nil) {
        resetEndedStateForNewCall()
        guard callState == .idle else {
            Logger.calls.info("Incoming call while busy — showing call waiting banner")
            rejectSupersededPendingCall(replacingWithCallId: callId)
            pendingIncomingCall = (callId: callId, fromUserId: fromUserId, fromUsername: fromUsername, isVideo: isVideo, iceServers: iceServers, conversationId: conversationId)
            showCallWaitingBanner = true
            HapticFeedback.medium()
            return
        }

        analyticsCallInitiatedDate = Date()
        currentCallId = callId
        remoteUserId = fromUserId
        remoteUsername = fromUsername
        self.conversationId = conversationId
        isVideoEnabled = isVideo
        isMuted = false
        isSpeaker = isVideo
        // Force displayMode = .fullScreen (cf. startCall pour le rationale).
        displayMode = .fullScreen
        callState = .ringing(isOutgoing: false)

        let uuid = UUID()
        activeCallUUID = uuid
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: fromUserId.isEmpty ? fromUsername : fromUserId)
        update.localizedCallerName = fromUsername
        update.hasVideo = isVideo
        update.supportsGrouping = false
        update.supportsHolding = false

        // CALL-FIX 2026-06-06 (macOS) — CallKit's `reportNewIncomingCall` FAILS on
        // iOS-app-on-Mac (no system call UI → CXErrorCodeIncomingCallError 3), which
        // previously killed every Mac incoming call (`endCallInternal(.failed)`).
        // On Mac we skip CallKit entirely and keep `callState=.ringing(incoming)` so
        // the in-app `IncomingCallView` presents; `answerCall()`/`rejectCall()`/`endCall()`
        // already tolerate the CX*Action being a no-op (their failures are logged &
        // ignored, the SDP answer is still created+sent). The audio session is then
        // activated by the `[AUDIO_FALLBACK]` path (`provider:didActivate:` never fires
        // on Mac) + the `.speaker` route fix.
        // CallKit only when we genuinely need the SYSTEM call UI — i.e. to ring a
        // backgrounded/locked device. When the app is in the FOREGROUND the in-app
        // IncomingCallView already presents (callState == .ringing), so suppress the
        // redundant CallKit banner. Never use CallKit on iOS-app-on-Mac (no system
        // call UI; reportNewIncomingCall fails error 3). NB: a device woken from
        // suspension by a VoIP push comes through `reportIncomingVoIPCall`, NOT here,
        // and that path always keeps CallKit (Apple requirement).
        callUsesCallKit = Self.platformSupportsCallKit
            && UIApplication.shared.applicationState != .active
        ringbackPlayer.shouldSelfActivateSession = !callUsesCallKit
        if !callUsesCallKit {
            Logger.calls.info("[no-callkit] incoming via in-app UI (foreground/macOS) — CallKit banner skipped")
            // CallKit plays the ringtone on iOS via `config.ringtoneSound`; without
            // CallKit we play the incoming ringtone in-app.
            ringbackPlayer.startRingtone()
        } else {
            callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
                if let error {
                    Logger.calls.error("CallKit report incoming failed: \(error.localizedDescription)")
                    // Audit 2026-07-10 — failCall (not endCallInternal directly)
                    // also reports `.failed` back to CallKit, matching every
                    // other failure path in this file (see failCall's doc
                    // comment) instead of leaving Recents with a stranded entry.
                    Task { @MainActor [weak self] in self?.failCall("CallKit error") }
                }
            }
        }

        // Auto-join call room + configure WebRTC so SDP offer can be received while ringing
        // Audit fix (calling-stack audit 2026-08-15): abort on a genuine
        // peer-connection creation failure instead of silently proceeding.
        guard webRTCService.configure(isVideo: isVideo, iceServers: iceServers) else {
            Logger.calls.error("[CALL_SETUP] incoming (notification) webRTC.configure failed — aborting")
            failCall("Failed to configure WebRTC")
            return
        }
        armTurnCredentialsAfterConfigure(callId: callId, iceServers: iceServers)
        applyNegotiationRole()
        configureAudioSession()
        startReliabilityMonitor()
        // Audit fix (calling-stack audit 2026-08-24) — arm the background
        // observer HERE, at ring time, not only from transitionToConnected().
        // promoteRingingCallToCallKitIfNeeded() is only ever invoked by the
        // observer startBackgroundMonitoring() registers; gating that
        // registration on the call already being connected made the whole
        // promotion path permanently unreachable for the exact case it exists
        // to cover — a call ringing in-app (CallKit skipped because the app
        // was foreground) that backgrounds before being answered. Without a
        // live observer, iOS can suspend the app mid-ring with no lock-screen
        // call card, silently dropping the inbound call. Safe to call twice
        // per call (once here, once at connect): startBackgroundMonitoring()
        // starts with stopBackgroundMonitoring() to stay idempotent.
        startBackgroundMonitoring()

        // Phase 2 fix — Bug 2: emit call:join IMMEDIATELY so the caller receives
        // PARTICIPANT_JOINED while we initialize media in parallel. See
        // `localMediaTask` property doc for rationale and downstream contract.
        // [Fix 2026-07-02] via joinCallRoomReliably — ACK-aware, survives a
        // not-yet-connected socket (notification received during app launch).
        joinCallRoomReliably(callId: callId)
        Logger.calls.info("Incoming call — reliable call:join dispatched; starting media in parallel: \(callId)")

        localMediaTask?.cancel()
        localMediaTask = Task { [weak self] in
            guard let self else { return }
            await self.performLocalMediaStart(isVideo: isVideo, callId: callId)
            Logger.calls.info("Incoming call — local media ready: \(callId)")
        }

        Logger.calls.info("Incoming call notification from \(fromUsername): \(callId)")
        HapticFeedback.medium()
    }

}

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
