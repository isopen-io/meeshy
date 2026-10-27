import Foundation
@preconcurrency import CallKit
import UIKit
import MeeshySDK
import MeeshyUI
import os

/// Un appel qui ARRIVE : push VoIP (fraîcheur, annulation, appel fantôme),
/// nom de l'appelant, notification d'appel par le socket et son tap d'alerte,
/// `call:initiated`, et le double appel (§11.15) — un second appel entrant
/// pendant un appel en cours se refuse, ou remplace l'appel en cours.
/// Le collaborateur tient l'appel faiblement (#11522) ; CallKit, WebRTC et le
/// fil sont appelés dans le même ordre qu'avant son extraction.
@MainActor
final class CallIncomingRing: CallIncomingRingProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    private var voipFreshnessTask: Task<Void, Never>?

    func attach(to call: CallManager) {
        self.call = call
    }

    // MARK: - VoIP Push Incoming Call

    func reportIncomingVoIPCall(callId: String, callerUserId: String, callerName: String, isVideo: Bool, iceServers: [IceServer]? = nil, conversationId: String? = nil) {
        guard let call else { return }
        let uuid = UUID()
        let update = CXCallUpdate.incoming(callerUserId: callerUserId, callerName: callerName, isVideo: isVideo)

        // The socket (`call:offer`) and this push can deliver the SAME callId.
        // Guarded BEFORE any state mutation so a duplicate push never disturbs
        // the active call — otherwise it fell into the busy branch: a phantom
        // "Missed" in Recents and a call-waiting banner over the ring on screen.
        if call.currentCallId == callId, call.callState.isActive {
            Logger.calls.info("VoIP push for callId \(callId) already active — phantom-acking, no duplicate UI")
            reportPhantomVoIPCall(uuid: uuid, update: update, callId: callId)
            return
        }

        call.resetEndedStateForNewCall()

        guard call.callState == .idle else {
            endSecondaryVoIPCallWhileBusy(
                uuid: uuid, update: update,
                waiting: IncomingCall(callId: callId, fromUserId: callerUserId, fromUsername: callerName, kind: CallKind(isVideo: isVideo), iceServers: iceServers, conversationId: conversationId)
            )
            return
        }

        // Session flags of the NEW call — written only once the busy branch is
        // ruled out. Above the guard they also hit the call ALREADY in progress
        // (a foreground in-app call legitimately runs with callUsesCallKit ==
        // false), corrupting it from a second ring it never answered.
        call.lastCallWasOutgoing = false
        // The VoIP-push path ALWAYS uses CallKit — Apple mandates a synchronous
        // reportNewIncomingCall from the push handler. Reset the flag (a prior
        // foreground in-app call may have left it false).
        call.callUsesCallKit = true
        call.ringbackPlayer.shouldSelfActivateSession = false

        // Set state BEFORE reporting to CallKit to avoid race
        enterIncomingRinging(callId: callId, callerUserId: callerUserId, callerName: callerName, conversationId: conversationId, isVideo: isVideo)
        call.activeCallUUID = uuid

        call.callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak call] error in
            guard let error else { return }
            Logger.calls.error("CallKit VoIP report failed: \(error.localizedDescription)")
            Task { @MainActor [weak call] in
                // Audit 2026-07-10 — route through failCall so this teardown
                // also reports `.failed` to CallKit (via reportCall). Calling
                // endCallInternal directly left a partially-registered system
                // Recents entry never explicitly ended, unlike every other
                // failure path in this file (see failCall's doc comment).
                call?.failCall("CallKit error")
                // The dedup ring already recorded this callId when the push
                // arrived; since CallKit refused to report it, evict it so a
                // legitimate APNs retry isn't dropped as a duplicate.
                VoIPPushManager.shared.clearDedup(callId: callId)
            }
        }

        armVoIPFreshnessCheck(uuid: uuid, callId: callId)

        // Auto-join call room + configure WebRTC so SDP offer can be received while ringing.
        // The VoIP push payload carries the per-user ICE servers (TURN credentials)
        // so RTCPeerConnection is built with TURN BEFORE the offer is set.
        Logger.calls.info("[CALL_SETUP] incoming 1/4 webRTC.configure begin (isVideo=\(isVideo))")
        // Audit fix (calling-stack audit 2026-08-15): abort on a genuine
        // peer-connection creation failure instead of silently proceeding.
        guard call.webRTCService.configure(isVideo: isVideo, iceServers: iceServers) else {
            Logger.calls.error("[CALL_SETUP] incoming (VoIP) webRTC.configure failed — aborting")
            call.failCall("Failed to configure WebRTC")
            return
        }
        startRingingPipeline(callId: callId, isVideo: isVideo, iceServers: iceServers, source: .voipPush)

        Logger.calls.info("VoIP push incoming call reported: \(callId) from \(callerName)")
        HapticFeedback.medium()
    }

    private func endSecondaryVoIPCallWhileBusy(uuid: UUID, update: CXCallUpdate, waiting: IncomingCall) {
        guard let call else { return }
        let callId = waiting.callId
        // Busy: report + immediately end the secondary call, then offer it as a
        // call-waiting banner. Mirror the
        // idle-path failure handling below — if CallKit refuses this
        // report (two call groups already used, restricted mode, a
        // transient CallKit error), the dedup ring already recorded this
        // callId when the push arrived, and it must be evicted or a
        // legitimate APNs retry gets silently dropped as a duplicate,
        // leaving the callee with zero call UI for a call CallKit never
        // actually reported.
        call.callProvider.reportNewIncomingCall(with: uuid, update: update) { error in
            guard let error else { return }
            Logger.calls.error("CallKit VoIP report failed (busy path): \(error.localizedDescription)")
            Task { @MainActor in
                VoIPPushManager.shared.clearDedup(callId: callId)
            }
        }
        // A nil `endedAt` means "unknown" to CallKit (produces an inaccurate/missing
        // timestamp in Recents) — every other reportCall site in this file passes
        // Date(); this synthesized busy-path report ends right now, so do the same.
        call.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
        rejectSupersededPendingCall(replacingWithCallId: callId)
        call.pendingIncomingCall = waiting
        call.showCallWaitingBanner = true
        Logger.calls.info("VoIP push while busy — ended secondary call, showing banner")
        HapticFeedback.medium()
    }

    private func armVoIPFreshnessCheck(uuid: UUID, callId: String) {
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
        voipFreshnessTask?.cancel()
        voipFreshnessTask = Task { [weak self] in
            await self?.checkVoIPCallFreshness(uuid: uuid, callId: callId)
        }
    }

    /// Fin d'appel : la vérification de fraîcheur en vol n'a plus d'appel à juger.
    func cancelFreshnessCheck() {
        voipFreshnessTask?.cancel()
        voipFreshnessTask = nil
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
                if let call, call.activeCallUUID == uuid, case .ringing = call.callState {
                    call.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
                    call.endCallInternal(reason: .missed)
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
                if let call, call.activeCallUUID == uuid, case .ringing = call.callState {
                    call.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
                    call.endCallInternal(reason: .missed)
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
        guard let call else { return }
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
            currentCallId: call.currentCallId,
            callState: call.callState
        ) else {
            Logger.calls.info("call_cancel push ignored (callId=\(callId)) — no matching incoming ring")
            return
        }
        Logger.calls.info("call_cancel push — ending still-ringing call \(callId)")
        if call.callUsesCallKit, let uuid = call.activeCallUUID {
            call.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        }
        call.endCallInternal(reason: .remote)
    }

    /// Pendant multi-device de `endRingingFromCancellation` : un AUTRE device
    /// du même compte a décroché (push background `call_answered_elsewhere`,
    /// miroir socketless de `call:already-answered`). Même garde FSM pure ;
    /// seule la raison CallKit diffère — `.answeredElsewhere` pour que
    /// Recents affiche « répondu sur un autre appareil » et non « manqué ».
    func endRingingAnsweredElsewhere(callId: String) {
        guard let call else { return }
        // Same rationale as endRingingFromCancellation() above — this is the
        // socketless counterpart of call:already-answered, which also clears
        // the waiting banner FIRST (see its clearPendingIncomingCall call).
        clearPendingIncomingCall(ifMatching: callId)
        guard CallReliabilityPolicy.shouldEndRingingOnCancellation(
            pushCallId: callId,
            currentCallId: call.currentCallId,
            callState: call.callState
        ) else {
            Logger.calls.info("call_answered_elsewhere push ignored (callId=\(callId)) — no matching incoming ring")
            return
        }
        Logger.calls.info("call_answered_elsewhere push — dismissing ring for \(callId)")
        if call.callUsesCallKit, let uuid = call.activeCallUUID {
            call.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .answeredElsewhere)
        }
        call.endCallInternal(reason: .remote, reportsAnalytics: false)
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
        guard let call else { return }
        call.callProvider.reportNewIncomingCall(with: uuid, update: update) { error in
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
        call.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
    }

    // MARK: - Update Incoming Call Name

    func updateIncomingCallName(_ name: String) {
        guard let call, let uuid = call.activeCallUUID else { return }
        // Audit P3 — skip the CallKit update if the user has already
        // answered/declined. The cache-resolution Task that calls this
        // method can finish AFTER the user has acted; updating the CallKit
        // card at that point either flashes a stale name or no-ops with a
        // log noise.
        guard case .ringing = call.callState else { return }
        call.remoteUsername = name
        let update = CXCallUpdate()
        update.localizedCallerName = name
        call.callProvider.reportCall(with: uuid, updated: update)
        Logger.calls.info("Updated incoming call name to: \(name)")
    }

    // MARK: - Incoming Call (Socket)

    /// Un `call:initiated` reçu par le socket. Site UNIQUE, appelé par
    /// l'abonnement de `CallManager` ET par `IncomingCallWakeGate`, qui remet
    /// l'événement qui a réveillé la pile (#7955).
    func handleCallOffer(_ event: CallOfferData) {
        let myUserId = AuthManager.shared.currentUser?.id
        guard event.principalUserId != myUserId else { return }
        guard call?.currentCallId != event.callId else { return }
        // `mode` est l'architecture WebRTC ('p2p' | 'sfu'), PAS le type média,
        // porté par `type` ('audio' | 'video'). Absent (anciens builds
        // gateway) : repli sur `mode == "video"`.
        let isVideo = event.type.map { $0 == "video" } ?? (event.mode == "video")
        // #8433 — une invitation dit QUI m'invite, pas seulement qui a lancé l'appel.
        let callerName = CallOfferPresentation.callerName(
            initiator: event.initiator.displayName ?? event.initiator.username,
            inviter: event.invitedBy.map { $0.displayName ?? $0.username }
        )
        let dynamicIceServers = event.iceServers?.map { server in
            IceServer(urls: server.urls.asArray, username: server.username, credential: server.credential)
        }
        handleIncomingCallNotification(
            callId: event.callId,
            fromUserId: event.principalUserId,
            fromUsername: callerName,
            isVideo: isVideo,
            iceServers: dynamicIceServers,
            conversationId: event.conversationId
        )
    }

    /// Le TAP sur l'alerte d'appel entrant (push sans VoIP : région Chine,
    /// appareil sans jeton VoIP, app sur Mac). Contrairement au socket et au
    /// VoIP, ce chemin n'avait aucune garde « même appel » ni « appel encore
    /// vivant » :
    /// - l'appel X qui sonne déjà, tapé dans le bandeau, partait dans la
    ///   branche « occupé » : bandeau d'appel en attente par-dessus SA propre
    ///   sonnerie, « Refuser » rejetait l'appel qui sonnait ;
    /// - une alerte périmée touchée dans le centre de notifications faisait
    ///   sonner ~75 s un appel terminé et rejoindre une salle morte.
    func handleIncomingCallAlertTap(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, iceServers: [IceServer]? = nil, conversationId: String? = nil) {
        guard let call else { return }
        guard Self.alertTapStartsRinging(
            callId: callId, currentCallId: call.currentCallId, callState: call.callState,
            pendingCallId: call.pendingIncomingCall?.callId
        ) else {
            Logger.calls.info("Incoming-call alert tapped for callId \(callId) already ringing/waiting — no duplicate UI")
            return
        }
        handleIncomingCallNotification(
            callId: callId, fromUserId: fromUserId, fromUsername: fromUsername,
            isVideo: isVideo, iceServers: iceServers, conversationId: conversationId
        )
        guard call.currentCallId == callId, case .ringing = call.callState, let uuid = call.activeCallUUID else { return }
        Task { [weak self] in await self?.checkVoIPCallFreshness(uuid: uuid, callId: callId) }
    }

    /// Le tap d'alerte n'ouvre une sonnerie que pour un appel ni déjà en cours,
    /// ni déjà en attente.
    nonisolated static func alertTapStartsRinging(
        callId: String, currentCallId: String?, callState: CallState, pendingCallId: String?
    ) -> Bool {
        if currentCallId == callId, callState.isActive { return false }
        if pendingCallId == callId { return false }
        return true
    }

    func handleIncomingCallNotification(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, iceServers: [IceServer]? = nil, conversationId: String? = nil) {
        guard let call else { return }
        call.resetEndedStateForNewCall()
        guard call.callState == .idle else {
            Logger.calls.info("Incoming call while busy — showing call waiting banner")
            rejectSupersededPendingCall(replacingWithCallId: callId)
            call.pendingIncomingCall = IncomingCall(callId: callId, fromUserId: fromUserId, fromUsername: fromUsername, kind: CallKind(isVideo: isVideo), iceServers: iceServers, conversationId: conversationId)
            call.showCallWaitingBanner = true
            HapticFeedback.medium()
            return
        }

        call.analytics.callInitiatedDate = Date()
        enterIncomingRinging(callId: callId, callerUserId: fromUserId, callerName: fromUsername, conversationId: conversationId, isVideo: isVideo)

        let uuid = UUID()
        call.activeCallUUID = uuid
        let update = CXCallUpdate.incoming(callerUserId: fromUserId, callerName: fromUsername, isVideo: isVideo)

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
        call.callUsesCallKit = CallManager.platformSupportsCallKit
            && UIApplication.shared.applicationState != .active
        call.ringbackPlayer.shouldSelfActivateSession = !call.callUsesCallKit
        if !call.callUsesCallKit {
            Logger.calls.info("[no-callkit] incoming via in-app UI (foreground/macOS) — CallKit banner skipped")
            // CallKit plays the ringtone on iOS via `config.ringtoneSound`; without
            // CallKit we play the incoming ringtone in-app.
            call.ringbackPlayer.startRingtone()
        } else {
            call.callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak call] error in
                if let error {
                    Logger.calls.error("CallKit report incoming failed: \(error.localizedDescription)")
                    // Audit 2026-07-10 — failCall (not endCallInternal directly)
                    // also reports `.failed` back to CallKit, matching every
                    // other failure path in this file (see failCall's doc
                    // comment) instead of leaving Recents with a stranded entry.
                    Task { @MainActor [weak call] in call?.failCall("CallKit error") }
                }
            }
        }

        // Auto-join call room + configure WebRTC so SDP offer can be received while ringing
        // Audit fix (calling-stack audit 2026-08-15): abort on a genuine
        // peer-connection creation failure instead of silently proceeding.
        guard call.webRTCService.configure(isVideo: isVideo, iceServers: iceServers) else {
            Logger.calls.error("[CALL_SETUP] incoming (notification) webRTC.configure failed — aborting")
            call.failCall("Failed to configure WebRTC")
            return
        }
        startRingingPipeline(callId: callId, isVideo: isVideo, iceServers: iceServers, source: .socket)

        Logger.calls.info("Incoming call notification from \(fromUsername): \(callId)")
        HapticFeedback.medium()
    }

    private func enterIncomingRinging(callId: String, callerUserId: String, callerName: String, conversationId: String?, isVideo: Bool) {
        guard let call else { return }
        call.currentCallId = callId
        call.remoteUserId = callerUserId
        call.remoteUsername = callerName
        call.conversationId = conversationId
        call.isVideoEnabled = isVideo
        call.isMuted = false
        call.isSpeaker = isVideo
        // Force displayMode = .fullScreen (cf. startCall pour le rationale).
        call.displayMode = .fullScreen
        call.callState = .ringing(isOutgoing: false)
        call.startIncomingRingTimeout()
    }

    /// Ringing-time setup shared by both incoming paths once the peer connection
    /// is configured: TURN, negotiation role, audio session, reliability
    /// monitor, background observer, the reliable `call:join`, then local media
    /// in parallel.
    private func startRingingPipeline(callId: String, isVideo: Bool, iceServers: [IceServer]?, source: IncomingCallSource) {
        guard let call else { return }
        call.armTurnCredentialsAfterConfigure(callId: callId, iceServers: iceServers)
        call.applyNegotiationRole()
        if source == .voipPush { Logger.calls.info("[CALL_SETUP] incoming 2/4 configureAudioSession begin") }
        call.configureAudioSession()
        call.startReliabilityMonitor()
        // Audit fix (calling-stack audit 2026-08-24) — arm the background
        // observer HERE, at ring time, not only from transitionToConnected().
        // promoteRingingCallToCallKitIfNeeded() is only ever invoked by the
        // observer startBackgroundMonitoring() registers; gating that
        // registration on the call already being connected made the whole
        // promotion path permanently unreachable for the exact case it exists
        // to cover — a call ringing in-app (CallKit skipped because the app
        // was foreground) that backgrounds before being answered. Without a
        // live observer, iOS can suspend the app mid-ring with no lock-screen
        // call card, silently dropping the inbound call. On the VoIP-push path
        // it runs the applyCameraSuspension(false, cause: "foreground") safety
        // net and notifies the peer of the background/foreground transition
        // while still ringing. Safe to call twice per call (once here, once at
        // connect): startBackgroundMonitoring() starts with
        // stopBackgroundMonitoring() to stay idempotent.
        call.appStateObserver.startBackgroundMonitoring()

        // Phase 2 fix — Bug 2: emit call:join IMMEDIATELY (before awaiting
        // startLocalMedia) so the caller receives PARTICIPANT_JOINED without
        // waiting for our camera/mic warmup. Media init runs in parallel; the
        // answer creation paths (answerCall*, handleSignalOffer .connecting)
        // await `localMediaTask` before invoking createAnswer.
        // [Fix 2026-07-02] via joinCallRoomReliably: on a VoIP cold start the
        // socket has never connected — a bare emit vanishes (prod-observed).
        call.joinCallRoomReliably(callId: callId)
        switch source {
        case .voipPush:
            Logger.calls.info("VoIP push — reliable call:join dispatched; starting media in parallel: \(callId) (\(iceServers?.count ?? 0) ICE servers)")
        case .socket:
            Logger.calls.info("Incoming call — reliable call:join dispatched; starting media in parallel: \(callId)")
        }

        call.localMediaTask?.cancel()
        call.localMediaTask = Task { [weak call] in
            guard let call else { return }
            if source == .voipPush { Logger.calls.info("[CALL_SETUP] incoming 3/4 startLocalMedia begin (isVideo=\(isVideo))") }
            await call.performLocalMediaStart(isVideo: isVideo, callId: callId)
            switch source {
            case .voipPush: Logger.calls.info("[CALL_SETUP] incoming 4/4 startLocalMedia done")
            case .socket: Logger.calls.info("Incoming call — local media ready: \(callId)")
            }
        }
    }

    // MARK: - Call Waiting (§11.15)

    func rejectPendingCall() {
        guard let call, let pending = call.pendingIncomingCall else { return }
        // Refus du call-waiting : porte aussi reason=rejected et hérite du
        // différé socket-down via le helper (cf. emitCallReject).
        call.emitCallReject(callId: pending.callId)
        call.pendingIncomingCall = nil
        call.showCallWaitingBanner = false
        Logger.calls.info("Rejected pending call: \(pending.callId)")
    }

    /// Audit 2026-07-07 (Finding 2) — `pendingIncomingCall` holds a single
    /// waiting call, not a queue. A third caller arriving while a second is
    /// already waiting used to silently overwrite `pendingIncomingCall`,
    /// leaving the second caller ringing forever with no local signal. Mirror
    /// `rejectPendingCall()`'s socket signal for the call being displaced so
    /// its caller sees a clean end instead of a silent local drop.
    ///
    /// Audit 2026-08-10 (Vague 87 fix) — this used to call the raw
    /// `MessageSocketManager.shared.emitCallEnd(callId:)` directly instead of
    /// the `emitCallReject(callId:)` helper this doc comment already claimed
    /// to mirror. Two consequences: (1) the gateway's `CallService.endCall`
    /// resolves a pre-answer `call:end` with no `reason` to `CallStatus
    /// .missed`, not `.rejected` — the displaced caller got a false "missed
    /// call" notification/history entry for a call A was simply busy
    /// juggling, not one A never noticed; (2) `emitCallReject` guards on
    /// `MessageSocketManager.shared.isConnected` and defers+replays on
    /// reconnect, while the raw `emitCallEnd` is silently dropped by the SDK
    /// when the socket is down — plausible here since one call site
    /// (`reportIncomingVoIPCall`) can run synchronously off a cold-start
    /// PushKit delivery, before the socket handshake completes.
    func rejectSupersededPendingCall(replacingWithCallId newCallId: String) {
        guard let call, let superseded = call.pendingIncomingCall, superseded.callId != newCallId else { return }
        call.emitCallReject(callId: superseded.callId)
        Logger.calls.info("Superseded waiting call ended: \(superseded.callId) (replaced by \(newCallId))")
    }

    /// Audit 2026-07-02 (bug 3) — the caller of the WAITING call hung up (or it
    /// was answered/force-ended elsewhere) before the user acted on the banner.
    /// Every terminal socket listener guards on `currentCallId` (the ACTIVE
    /// call) and early-returns for the waiting call's id — without this check
    /// the banner lingers until its 15s auto-dismiss and "End & Answer" would
    /// end the healthy active call to join one already torn down server-side.
    func clearPendingIncomingCall(ifMatching callId: String) {
        guard let call else { return }
        // PENDANT la passation de « Raccrocher et répondre », `pendingIncomingCall` est déjà vide : seul le jeton
        // nomme l'appel. Le lever AVANT le garde du bandeau — sinon la passation sonnait pour un appel raccroché.
        if call.answeringPendingCallId == callId {
            call.answeringPendingCallId = nil
            Logger.calls.info("Waiting call ended remotely during the handoff — answer cancelled (callId=\(callId))")
        }
        guard call.pendingIncomingCall?.callId == callId else { return }
        call.pendingIncomingCall = nil
        call.showCallWaitingBanner = false
        Logger.calls.info("Waiting call ended remotely — call-waiting banner dismissed (callId=\(callId))")
    }

    func endCurrentAndAnswerPending() {
        guard let call, let pending = call.pendingIncomingCall else { return }
        call.showCallWaitingBanner = false
        call.pendingIncomingCall = nil
        call.answeringPendingCallId = pending.callId

        call.endCall()

        Task { @MainActor [weak self, weak call] in
            _ = await cancellableSleep(for: .seconds(QualityThresholds.endAndAnswerPendingHandoffSeconds))
            guard let self, let call else { return }
            // The waiting call may have been ended, answered elsewhere, or
            // replaced by a newer incoming call while we were asleep — only
            // answer if it's still the exact call the user acted on. `endCall()`
            // above unconditionally nils `pendingIncomingCall` as a side effect
            // (unrelated busy-banner cleanup), so this dedicated token — not
            // `pendingIncomingCall` — is the source of truth for revalidation.
            guard call.answeringPendingCallId == pending.callId else { return }
            call.answeringPendingCallId = nil
            self.handleIncomingCallNotification(
                callId: pending.callId,
                fromUserId: pending.fromUserId,
                fromUsername: pending.fromUsername,
                isVideo: pending.kind.isVideo,
                iceServers: pending.iceServers,
                conversationId: pending.conversationId
            )
            // La passation remet l'appel à sonner ; l'utilisateur a déjà choisi
            // de répondre — y répondre, sans second appui sur Accepter.
            guard call.currentCallId == pending.callId,
                  case .ringing(isOutgoing: false) = call.callState else { return }
            call.answerCall()
        }
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallIncomingRingProviding: AnyObject {
    func attach(to call: CallManager)
    func reportIncomingVoIPCall(callId: String, callerUserId: String, callerName: String, isVideo: Bool, iceServers: [IceServer]?, conversationId: String?)
    func reportPhantomVoIPCall(uuid: UUID, update: CXCallUpdate, callId: String?)
    func updateIncomingCallName(_ name: String)
    func endRingingFromCancellation(callId: String)
    func endRingingAnsweredElsewhere(callId: String)
    func cancelFreshnessCheck()
    func handleCallOffer(_ event: CallOfferData)
    func handleIncomingCallAlertTap(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, iceServers: [IceServer]?, conversationId: String?)
    func handleIncomingCallNotification(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, iceServers: [IceServer]?, conversationId: String?)
    func rejectPendingCall()
    func rejectSupersededPendingCall(replacingWithCallId newCallId: String)
    func clearPendingIncomingCall(ifMatching callId: String)
    func endCurrentAndAnswerPending()
}

extension CXCallUpdate {
    /// What CallKit shows for an incoming call. The caller's userId is the
    /// `CXHandle.value` so Recents stays stable across language/avatar
    /// changes; `localizedCallerName` is what the lock screen displays.
    static func incoming(callerUserId: String, callerName: String, isVideo: Bool) -> CXCallUpdate {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerUserId.isEmpty ? callerName : callerUserId)
        update.localizedCallerName = callerName
        update.hasVideo = isVideo
        update.supportsGrouping = false
        update.supportsHolding = false
        return update
    }
}

/// Where an incoming call came from: a VoIP push (always CallKit) or the
/// socket notification (in-app UI when foreground).
enum IncomingCallSource {
    case voipPush, socket
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
