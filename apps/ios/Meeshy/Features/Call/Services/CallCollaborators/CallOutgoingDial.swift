import Foundation
@preconcurrency import CallKit
import UIKit
import MeeshySDK
import MeeshyUI
import os

/// Un appel qui PART : permissions, démarrage, nouvelle tentative après un
/// échec transitoire, rejoindre l'appel en cours d'une conversation, et reprise
/// d'un appel actif après un plantage. Le collaborateur tient l'appel
/// faiblement (#11522) ; CallKit, WebRTC et le fil sont appelés dans le même
/// ordre qu'avant son extraction.
@MainActor
final class CallOutgoingDial: CallOutgoingDialProviding {
    nonisolated deinit {}

    private weak var call: CallManager?

    func attach(to call: CallManager) {
        self.call = call
    }

    /// Point d'entrée de composition pour TOUTE surface produit (header de
    /// conversation, liste, clavier, journal d'appels, rappel).
    ///
    /// Le micro est tranché AVANT de composer : auparavant, aucun chemin ne le
    /// demandait et le prompt système arrivait pendant le setup CallKit — refusé,
    /// l'appel se « connectait » et restait muet, l'interlocuteur parlant dans le
    /// vide. Un refus micro annule donc l'appel, avec renvoi vers les Réglages.
    ///
    /// La caméra n'est jamais bloquante : un refus fait simplement composer en
    /// audio (la dégradation aval de `performLocalMediaStart` reste le filet).
    @discardableResult
    func requestPermissionsThenStartCall(
        conversationId: String,
        userId: String,
        displayName: String,
        isVideo: Bool
    ) async -> Bool {
        guard await MediaPermissionCoordinator.ensureMicrophone() else {
            Logger.calls.warning("[CALL] outgoing call aborted: microphone permission refused")
            return false
        }

        var video = isVideo
        if video, await MediaPermissionCoordinator.ensureCamera(announcesRefusal: false) == false {
            video = false
            Logger.calls.warning("[CALL] camera refused — dialing audio-only")
            FeedbackToastManager.shared.showError(
                String(localized: "call.video.permission.denied",
                       defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                       bundle: .main)
            ) { MediaPermissionCoordinator.openSettings() }
        }

        return await startOrJoinLiveCall(conversationId: conversationId, userId: userId, displayName: displayName, isVideo: video, router: .live)
    }

    /// « Appeler » une conversation dont l'appel est EN COURS le rejoint, sans
    /// `call:force-leave` — qui quitterait la ligne qu'on vient retrouver.
    func startOrJoinLiveCall(
        conversationId: String,
        userId: String,
        displayName: String,
        isVideo: Bool,
        router: CallDialRouter
    ) async -> Bool {
        if call?.callState == .idle, let request = await router.liveCall(
            conversationId: conversationId,
            peerUserId: userId,
            displayName: displayName
        ) {
            await router.join(request)
            return true
        }
        return startCall(conversationId: conversationId, userId: userId, displayName: displayName, isVideo: isVideo)
    }

    /// Starts an outgoing call. Returns `false` (no-op) if a call is already
    /// active — callers that need to tell the user why nothing happened
    /// (e.g. `CallStarter`, which shows a busy toast) should check this;
    /// callers that don't care can ignore it.
    ///
    /// N'appelle PAS de permission : les surfaces produit passent par
    /// `requestPermissionsThenStartCall`. Cette méthode reste le moteur brut,
    /// utilisé par les chemins déjà autorisés (CallKit) et les tests.
    @discardableResult
    func startCall(conversationId: String, userId: String, displayName: String, isVideo: Bool) -> Bool {
        guard let call else { return false }
        call.resetEndedStateForNewCall()
        guard call.callState == .idle else {
            Logger.calls.warning("Cannot start call: already in state \(String(describing: call.callState))")
            // Every dial entry point (conversation header, call-summary "call
            // back", conversation-list context menu, CallStarter) previously
            // no-op'd here with zero user feedback — a tap that visibly did
            // nothing. Surface it once, centrally, instead of duplicating this
            // toast at every call site.
            FeedbackToastManager.shared.showError(
                String(localized: "call.starter.busy", defaultValue: "Un appel est déjà en cours", bundle: .main)
            )
            return false
        }

        call.analytics.callInitiatedDate = Date()

        // Optimistic local state — `currentCallId` is reassigned to the real
        // gateway-issued ObjectId once the ACK lands.
        call.remoteUserId = userId
        call.remoteUsername = displayName
        call.conversationId = conversationId
        call.isVideoEnabled = isVideo
        call.isMuted = false
        call.isSpeaker = isVideo
        // Force displayMode = .fullScreen pour que RootView présente le
        // `.fullScreenCover { CallView() }`. Sans ça, displayMode peut être
        // resté à `.pip` après le dismiss d'un appel précédent (le binding
        // setter de fullScreenCover passe à .pip quand isPresented passe à
        // false), et tous les appels suivants n'affichent que le mini-PiP
        // `FloatingCallPillView` au lieu de la vue plein écran.
        call.displayMode = .fullScreen
        call.callState = .ringing(isOutgoing: true)
        call.lastCallWasOutgoing = true
        // Snapshot the dial context so a transient failure can be « Réessayer »-ed.
        call.lastOutgoingContext = OutgoingCallContext(conversationId: conversationId, userId: userId, displayName: displayName, kind: CallKind(isVideo: isVideo))

        // Phase 1.5 — Ringback tone démarré dans `provider:didActivate:audioSession`
        // (PAS ici). Démarrer AVAudioPlayer AVANT que CallKit ait posé sa
        // catégorie `.playAndRecord / .voiceChat` activait implicitement la
        // session en `.soloAmbient` (la default iOS pour AVAudioPlayer) —
        // CallKit voyait alors la session « already active in wrong category »
        // et NE firait PAS `provider:didActivate:audioSession`, ce qui
        // déclenchait son timeout autonome ~3-5s avec un CXEndCallAction
        // (le fameux « calls drop after 2-4 seconds » + le « wont be a UI
        // to host the call » sur simulateur, qui sont en réalité le même
        // symptôme : CallKit rejette le lifecycle).
        // Le ringback démarre maintenant après que CallKit confirme l'audio
        // session activée — `playPendingRingback()` est appelé depuis
        // `CallKitDelegateProxy.provider(_:didActivate:)`. Si CallKit ne
        // fire jamais didActivate (cas d'erreur), `outgoingRingTimeoutTask`
        // de 45s prend le relais comme avant.
        call.startOutgoingRingTimeout()

        let uuid = beginOutgoingRing(userId: userId, displayName: displayName, isVideo: isVideo)

        // Await call:initiate ACK to obtain the real callId + per-user ICE
        // servers. WebRTC MUST be configured with these BEFORE local media or
        // SDP offer creation, otherwise the offer carries STUN-only candidates.
        //
        // Audit P1-1 — capture `uuid` and re-check `activeCallUUID == uuid`
        // after every `await`. If the user tapped end (or another call took
        // its place) while the ACK was in flight, `endCallInternal` has
        // already cleared `activeCallUUID`; without this guard the Task would
        // resurrect the call by re-arming `currentCallId`, configuring
        // WebRTC, and starting microphone capture on a call the user has
        // already cancelled.
        call.setupCallTask?.cancel()
        call.setupCallTask = Task { [weak self, uuid] in
            guard let self else { return }
            await self.runOutgoingCallSetup(
                uuid: uuid, conversationId: conversationId, userId: userId,
                displayName: displayName, isVideo: isVideo
            )
        }

        HapticFeedback.medium()
        return true
    }

    /// Who rings the outgoing call (CallKit, or the app where there is none).
    private func beginOutgoingRing(userId: String, displayName: String, isVideo: Bool) -> UUID {
        let uuid = UUID()
        guard let call else { return uuid }
        // Outgoing is always foreground (the user just tapped Call), so the only
        // no-CallKit cases here are the platform ones (Mac, simulator).
        // (Suppressing CallKit for outgoing on a real iPhone would drop the
        // system call UI / Recents the user expects there.)
        call.callUsesCallKit = CallManager.platformSupportsCallKit
        call.ringbackPlayer.shouldSelfActivateSession = !call.callUsesCallKit
        call.activeCallUUID = uuid
        if !call.callUsesCallKit {
            // No CallKit (iOS-app-on-Mac): CXStartCallAction half-succeeds and the
            // later CXEndCallAction can't clear it → CallKit shows a stuck "call in
            // progress" after hangup. Drive the call entirely in-app; the
            // call:initiate flow runs independently. Start the ringback
            // directly (provider:didActivate never fires without CallKit).
            Logger.calls.info("[no-callkit] outgoing call — in-app ringback")
            call.startRingbackIfNeeded()
        } else {
            requestCallKitStart(uuid: uuid, userId: userId, displayName: displayName, isVideo: isVideo)
        }
        return uuid
    }

    /// CallKit's half of an outgoing call: the start transaction, then the
    /// progress reports that keep CallKit from ending the call on its own.
    private func requestCallKitStart(uuid: UUID, userId: String, displayName: String, isVideo: Bool) {
        guard let call else { return }
        // CXHandle.value persists in the iOS Phone app Recents list — use the
        // userId for stable identity rather than a (possibly localized) name.
        let handle = CXHandle(type: .generic, value: userId)
        let startAction = CXStartCallAction(call: uuid, handle: handle)
        startAction.isVideo = isVideo
        startAction.contactIdentifier = displayName
        let transaction = CXTransaction(action: startAction)
        let provider = call.callProvider
        call.callController.request(transaction) { [weak call] error in
            if let error {
                Logger.calls.error("CallKit start call failed: \(error.localizedDescription)")
                Task { @MainActor [weak call] in call?.endCallInternal(reason: .failed("CallKit error")) }
            } else {
                let update = CXCallUpdate()
                update.remoteHandle = CXHandle(type: .generic, value: userId)
                update.localizedCallerName = displayName
                update.hasVideo = isVideo
                provider.reportCall(with: uuid, updated: update)

                // Audit P2-iOS-CALLKIT-OUTGOING-TIMEOUT —
                // CallKit autonomously fires `CXEndCallAction` (~4-5 seconds
                // after `CXStartCallAction.fulfill()`) on outgoing calls that
                // never report progress, which surfaced in production as
                // "calls drop after 2-4 seconds" before the SDP answer round-
                // trip completes. Reporting `startedConnectingAt` here as
                // soon as the transaction is accepted signals to CallKit
                // that the call is making progress, so it waits for our
                // explicit `outgoingRingTimeoutSeconds` budget (45 s) instead
                // of killing the call out from under us. The later call from
                // `handleRemoteAnswer` (P1-12) still fires once the real
                // answer lands — CallKit accepts that as a refresh of the
                // connecting timestamp and uses it to drive the system UI.
                provider.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
            }
        }
    }

    /// `call:initiate`, then the peer connection, re-checked against `uuid`.
    private func runOutgoingCallSetup(
        uuid: UUID, conversationId: String, userId: String, displayName: String, isVideo: Bool
    ) async {
        do {
            // Pré-flight zombie cleanup : émettre `call:force-leave`
            // AVANT `call:initiate` pour purger toute trace persistante
            // d'un appel précédent où l'utilisateur courant aurait été
            // participant sans avoir `leftAt` peuplé (crash, kill app,
            // simulator teardown, audit du gateway pas exécuté à temps).
            // Sans ça, `call:initiate` retourne `CALL_ALREADY_ACTIVE` —
            // le gateway considère qu'il y a déjà un appel actif avec
            // au moins un participant non-leftAt. Le force-leave est
            // idempotent (no-op si pas de zombie côté DB).
            // Petit délai (250ms) pour laisser le gateway commiter le
            // cleanup MongoDB avant qu'on émette call:initiate.
            MessageSocketManager.shared.emitCallForceLeave(conversationId: conversationId)
            _ = await cancellableSleep(for: .milliseconds(250))
            guard let call, call.activeCallUUID == uuid else {
                Logger.calls.info("[CALL_SETUP] force-leave wait — uuid changed, discarding")
                return
            }

            let ack = try await MessageSocketManager.shared.emitCallInitiate(
                conversationId: conversationId,
                isVideo: isVideo
            )
            guard call.activeCallUUID == uuid else {
                Logger.calls.info("[CALL_SETUP] ACK arrived after end — discarding (uuid changed)")
                // Raccroché AVANT l'accusé : le raccroché n'avait pas d'identifiant à clore, et le
                // serveur tient maintenant un appel que personne ne terminera — l'appelé sonnait
                // jusqu'au délai du serveur pour un appelant parti.
                call.emitCallEndReliably(callId: ack.callId)
                return
            }
            let dynamicServers = ack.iceServers.map { server in
                IceServer(urls: server.urls.asArray, username: server.username, credential: server.credential)
            }
            call.currentCallId = ack.callId
            Logger.calls.info("[CALL_SETUP] outgoing 1/4 webRTC.configure begin (isVideo=\(isVideo))")
            // Audit fix (calling-stack audit 2026-08-15): abort setup on
            // a genuine peer-connection creation failure instead of
            // silently proceeding — see WebRTCService.configure's doc.
            guard call.webRTCService.configure(isVideo: isVideo, iceServers: dynamicServers) else {
                Logger.calls.error("[CALL_SETUP] outgoing webRTC.configure failed — aborting")
                call.failCall("Failed to initiate call")
                return
            }
            call.turnCredentials.scheduleTURNCredentialRefresh(ttl: TimeInterval(ack.ttl ?? Int(QualityThresholds.turnDefaultCredentialTTLSeconds)))
            call.applyNegotiationRole()
            Logger.calls.info("[CALL_SETUP] outgoing 2/4 configureAudioSession begin")
            call.configureAudioSession()
            call.reliabilityMonitor.startReliabilityMonitor()
            Logger.calls.info("[CALL_SETUP] outgoing 3/4 startLocalMedia begin (isVideo=\(isVideo))")
            await call.performLocalMediaStart(isVideo: isVideo, callId: ack.callId)
            guard call.currentCallId == ack.callId else { return }
            Logger.calls.info("[CALL_SETUP] outgoing 4/4 startLocalMedia done")
            call.listenForParticipantJoined(callId: ack.callId, toUserId: userId, isVideo: isVideo)
            Logger.calls.info("Outgoing call initiated: \(ack.callId) to \(displayName), waiting for participant joined (\(dynamicServers.count) ICE servers)")
        } catch {
            Logger.calls.error("call:initiate ACK failed: \(error.localizedDescription)")
            if let call, call.activeCallUUID == uuid {
                call.failCall("Failed to initiate call")
            }
        }
    }

    // MARK: - Retry a transiently-failed call (« Réessayer »)

    /// Re-dial the last outgoing call after a transient failure. `startCall`
    /// resets the ended state to idle before re-initiating, so this simply
    /// replays the captured dial context. Inert unless `canRetryCall`.
    @discardableResult
    func retryCall() -> Bool {
        guard let call, call.canRetryCall, let ctx = call.lastOutgoingContext else { return false }
        return startCall(
            conversationId: ctx.conversationId,
            userId: ctx.userId,
            displayName: ctx.displayName,
            isVideo: ctx.kind.isVideo
        )
    }

    // MARK: - Rejoin Active Call (crash/reconnect recovery)

    /// Silently rejoins a call the SERVER still considers active but this
    /// device's own `CallManager` session lost track of (app relaunch after
    /// a crash, force-quit, etc.) — see `ActiveCallService` (SDK) and
    /// `ConversationView+Header.swift`, which detects this via
    /// `GET /conversations/:id/active-call` and drives this method when the
    /// user taps the header's "rejoin" indicator.
    ///
    /// Unlike `startCall`/`handleIncomingCallNotification` this NEVER touches
    /// CallKit and never shows a ringing UI — the call was already accepted
    /// once (by this device or the peer) before the session was lost, so
    /// there's nothing left to ring/accept, only WebRTC media to resume.
    /// Goes straight to `.connecting` and reuses the SAME `call:join` +
    /// buffered-offer/rehydrate path the gateway already serves for
    /// reconnects (`CallEventsHandler-join-buffered-offer`/`-rehydrate`
    /// server-side tests) — no new signaling contract needed.
    @discardableResult
    func rejoinActiveCall(callId: String, conversationId: String, remoteUserId: String, remoteUsername: String, isVideo: Bool) -> Bool {
        guard let call else { return false }
        call.resetEndedStateForNewCall()
        guard call.callState == .idle else {
            Logger.calls.warning("Cannot rejoin call: already in state \(String(describing: call.callState))")
            return false
        }

        // Micro absolument requis pour reprendre l'appel — ce chemin partage le
        // même pipeline média que answerCall()/answerCallReady() (voir leur
        // garde) mais n'a, lui, aucun appel entrant à raccrocher : rien n'a
        // encore été mutée avant ce point, on refuse simplement la reprise.
        guard MediaPermissionState.microphone.isUsable else {
            Logger.calls.warning("[CALL] rejoin refused: microphone permission missing")
            FeedbackToastManager.shared.showError(
                MediaPermissionCoordinator.deniedMessage(for: .microphone)
            ) { MediaPermissionCoordinator.openSettings() }
            return false
        }

        call.analytics.callInitiatedDate = Date()
        call.currentCallId = callId
        CallResumeLedger.shared.begin(callId)
        call.remoteUserId = remoteUserId
        call.remoteUsername = remoteUsername
        call.conversationId = conversationId
        call.isVideoEnabled = isVideo
        call.isMuted = false
        call.isSpeaker = isVideo
        call.displayMode = .fullScreen
        call.callState = .connecting
        // Audio-recovery fix (2026-08-14): this method's own doc comment says
        // it "NEVER touches CallKit" — but it never reset the flag that says
        // otherwise. `callUsesCallKit` defaults to `true` and is left over
        // from whatever the last call was (or never touched at all on a
        // fresh relaunch), so `configureAudioSession()`/`transitionToConnected()`
        // deferred activation to CallKit's `provider:didActivate:`, which is
        // never called for a rejoin (no `reportNewIncomingCall` /
        // `CXStartCallAction`). Net effect: every rejoined call started with
        // dead audio (no mic, no speaker) until the unrelated stuck-muted
        // fallback timer force-activated it ~2s later.
        call.callUsesCallKit = false

        // iceServers: nil — a rejoin has no incoming push/ACK payload to source
        // them from. armTurnCredentialsAfterConfigure detects the empty case
        // and fetches real TURN credentials over the socket on its own
        // (requestFreshTurnCredentials → emitRequestIceServers), same as every
        // other path that lacks a payload-embedded ICE server list.
        // Audit fix (calling-stack audit 2026-08-15): abort on a genuine
        // peer-connection creation failure instead of silently proceeding.
        guard call.webRTCService.configure(isVideo: isVideo, iceServers: nil) else {
            Logger.calls.error("[CALL_SETUP] rejoin webRTC.configure failed — aborting")
            call.failCall("Failed to configure WebRTC")
            return false
        }
        call.turnCredentials.armTurnCredentialsAfterConfigure(callId: callId, iceServers: nil)
        call.applyNegotiationRole()
        call.configureAudioSession()
        call.reliabilityMonitor.startReliabilityMonitor()

        call.joinCallRoomReliably(callId: callId)
        Logger.calls.info("Rejoining active call — reliable call:join dispatched: \(callId)")

        call.localMediaTask?.cancel()
        call.localMediaTask = Task { [weak call] in
            guard let call else { return }
            await call.performLocalMediaStart(isVideo: isVideo, callId: callId)
            Logger.calls.info("Rejoin — local media ready: \(callId)")
        }

        HapticFeedback.medium()
        return true
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallOutgoingDialProviding: AnyObject {
    func attach(to call: CallManager)
    @discardableResult
    func requestPermissionsThenStartCall(conversationId: String, userId: String, displayName: String, isVideo: Bool) async -> Bool
    func startOrJoinLiveCall(conversationId: String, userId: String, displayName: String, isVideo: Bool, router: CallDialRouter) async -> Bool
    @discardableResult
    func startCall(conversationId: String, userId: String, displayName: String, isVideo: Bool) -> Bool
    @discardableResult
    func retryCall() -> Bool
    @discardableResult
    func rejoinActiveCall(callId: String, conversationId: String, remoteUserId: String, remoteUsername: String, isVideo: Bool) -> Bool
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
