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

/// Applies one best-effort `AVAudioSession` preference.
///
/// These calls legitimately throw on platforms that do not support them
/// (iOS-app-on-Mac) and the OS may ignore the hint anyway, so the failure is
/// expected rather than exceptional — logged at `.debug` so it stays available
/// when diagnosing audio routing without polluting `.error`.
///
/// File-level (not a method) because call sites include closures that do not
/// capture the `CallManager` as `self`.
fileprivate func applyBestEffortAudioSetting(
    _ name: String,
    _ apply: () throws -> Void
) {
    do {
        try apply()
    } catch {
        Logger.calls.debug("AVAudioSession \(name, privacy: .public) not applied (expected on unsupported platforms): \(error.localizedDescription, privacy: .public)")
    }
}



// MARK: - Call End Reason Mapping

/// Maps the gateway's raw `call:ended` reason string to the CallKit
/// `CXCallEndedReason` (drives the Recents UX) and the local `CallEndReason`
/// (drives analytics + in-app UI). Pure + `nonisolated` so the mapping is unit
/// tested at behaviour instead of by string-matching the switch source — a
/// wrong mapping (e.g. `"missed" → .rejected`) previously slipped past the
/// source-string tests. Handles both camelCase and snake_case gateway variants;
/// any unknown/`nil` reason is a plain remote hang-up.
nonisolated enum CallEndReasonMapper {
    static func map(_ raw: String?) -> (cx: CXCallEndedReason, local: CallEndReason) {
        switch raw?.lowercased() {
        case "missed", "no_answer", "unanswered":
            return (.unanswered, .missed)
        case "rejected", "declined":
            return (.declinedElsewhere, .rejected)
        case "answeredelsewhere", "answered_elsewhere":
            return (.answeredElsewhere, .remote)
        case "failed", "connectionlost":
            return (.failed, .connectionLost)
        default:
            return (.remoteEnded, .remote)
        }
    }
}

// MARK: - Call State

enum CallState: Equatable, Sendable {
    case idle
    case ringing(isOutgoing: Bool)
    /// Outgoing call: peer joined the room, we created and sent the SDP offer,
    /// awaiting the SDP answer. Distinct from `ringing` because at this point
    /// our local description is set and ICE candidates are flying.
    /// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.2
    case offering
    case connecting
    case connected
    case reconnecting(attempt: Int)
    case ended(reason: CallEndReason)

    nonisolated var isActive: Bool {
        switch self {
        case .idle, .ended: return false
        default: return true
        }
    }

    nonisolated var isRinging: Bool {
        if case .ringing = self { return true }
        return false
    }

    /// `true` only for the terminal `.ended(reason:)` state. Distinct from
    /// `isActive` (which is `false` for both `.idle` AND `.ended`) because the
    /// UI must keep showing the end-of-call panel during the 1.5 s settle window
    /// that `CallManager.endCallInternal` holds before resetting to `.idle`.
    nonisolated var isEnded: Bool {
        if case .ended = self { return true }
        return false
    }

    /// Whether the full-screen call cover should remain presented for a given
    /// state + display mode. Includes `.ended` so the end-of-call panel
    /// (`CallView.endedView` — reason + final duration) is actually reachable:
    /// gating purely on `isActive` dismissed the cover the instant the call
    /// ended, making that panel dead code. The cover only ever shows in
    /// `.fullScreen`; in `.pip` the floating pill carries the ended state.
    static func shouldPresentFullScreenCover(
        callState: CallState,
        displayMode: CallDisplayMode
    ) -> Bool {
        (callState.isActive || callState.isEnded) && displayMode == .fullScreen
    }
}

extension CallState {
    nonisolated static func == (lhs: CallState, rhs: CallState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle), (.offering, .offering),
             (.connecting, .connecting), (.connected, .connected): return true
        case (.ringing(let a), .ringing(let b)): return a == b
        case (.reconnecting(let a), .reconnecting(let b)): return a == b
        case (.ended(let a), .ended(let b)): return a == b
        default: return false
        }
    }
}

// MARK: - Call Manager

@MainActor
final class CallManager: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = CallManager()

    // MARK: - Published State

    @Published private(set) var callState: CallState = .idle {
        didSet {
            let active = callState.isActive
            CallManager.isCallActiveFlag = active
            // Étape B unification audio — point de propagation unique de l'état
            // d'appel : informe MediaSessionCoordinator pour qu'il ne reconfigure
            // NI ne teardown la session audio partagée pendant un appel (sinon le
            // micro est coupé — RTCAudioSession possède .playAndRecord/.voiceChat).
            // Synchrone (setCallActive est nonisolated) → pas de reorder de Task.
            MediaSessionCoordinator.shared.setCallActive(active)

            // Au DÉMARRAGE d'un appel (transition inactif→actif uniquement) : couper
            // tout média en cours (voice notes, vidéo, story). L'appel VoIP prend la
            // main sur l'audio. Placé APRÈS setCallActive → le stop est call-aware (la
            // session reste à l'appel, aucun teardown). Évite le média orphelin qui
            // resterait « muet définitivement » au raccrochage : plus rien à réactiver,
            // le prochain tap utilisateur reconfigure proprement la session.
            if active && !oldValue.isActive {
                // AVANT stopAll() : celui-ci détruit le lecteur (`player = nil`,
                // `isPlaying = false`), or la suspension doit capturer si la
                // lecture était en cours pour décider de la reprise. `@Published`
                // émettant en `willSet`, un abonné différé par `.receive(on:)`
                // lirait déjà `false` — d'où ce push synchrone.
                ConversationAudioCoordinator.shared.suspendForSystemCall()
                PlaybackCoordinator.shared.stopAll()
            }

            // Retour au repos : rendre les surfaces système au lecteur de vocaux.
            //
            // On s'accroche à `.idle` plutôt qu'à un délai maison : c'est déjà
            // CallManager qui arbitre les trois fenêtres de settle (1,5 s
            // standard, 12 s retryable, 0,5 s de handoff call-waiting) via son
            // `settleToken`. Dupliquer ces constantes ici les désynchroniserait
            // à la première évolution.
            //
            // Différé d'un tour de runloop ET revérifié, parce que
            // `resetEndedStateForNewCall` pose `.idle` TRANSITOIREMENT avant de
            // démarrer l'appel suivant : reprendre synchroniquement relancerait
            // un vocal une fraction de seconde avant que le nouvel appel ne le
            // tue — le flap exact qu'on cherche à éviter.
            if callState == .idle, oldValue != .idle {
                Task { @MainActor [weak self] in
                    guard let self, self.callState == .idle else { return }
                    ConversationAudioCoordinator.shared.resumeAfterSystemCall()
                }
            }

            // Keep the screen on for the duration of the call (ringing →
            // connecting → connected). Without this, the device's auto-lock
            // timer fires during the call — catastrophic for video calls.
            // Restore immediately when the call ends.
            UIApplication.shared.isIdleTimerDisabled = active

            // Proximity sensor: enable during audio-only calls so the screen
            // dims when held to the ear (battery + accidental-tap prevention).
            // Disabled for video calls (user must see the remote camera) and
            // cleared when no call is active.
            updateProximityMonitoring()
        }
    }
    @Published private(set) var transcriptionService = CallTranscriptionService()
    @Published private(set) var remoteUserId: String?
    @Published private(set) var remoteUsername: String?
    /// Conversation (DM) qui héberge l'appel courant, quand elle est connue.
    /// Renseignée pour les appels sortants (`startCall`) et les appels entrants
    /// livrés par socket (`CallOfferData.conversationId`). Peut rester `nil` pour
    /// un appel entrant réveillé par un push VoIP dont le payload ne la contient
    /// pas — l'affordance « ouvrir la conversation » dans l'écran d'appel se
    /// masque alors gracieusement plutôt que de deviner.
    @Published private(set) var conversationId: String?
    @Published var isVideoEnabled: Bool = false {
        didSet { if isVideoEnabled != oldValue { updateProximityMonitoring() } }
    }
    /// P0-3 — the REMOTE peer's camera state, driven by `call:media-toggled`.
    /// Defaults to `true` (assume on) and flips to `false` when the peer turns
    /// its camera off, so the UI can show an avatar placeholder instead of the
    /// peer's frozen last frame. 1:1 only — the gateway routes the toggle to the
    /// other participant via `socket.to(room)` so we never see our own echo.
    @Published private(set) var isRemoteVideoEnabled: Bool = true
    /// `false` when the remote peer has muted their microphone (call:media-toggled
    /// audioType=="audio"). Drives the mute indicator in the call UI so the local
    /// user knows why the remote peer sounds silent. Resets to `true` on call end.
    @Published private(set) var isRemoteAudioEnabled: Bool = true
    /// `true` when the remote peer is actively screen-capturing this call
    /// (call:screen-capture-alert with isCapturing==true). Drives a privacy warning
    /// banner in CallView. Resets to `false` on call end to prevent leaking state
    /// into subsequent calls.
    @Published private(set) var isRemoteScreenCapturing: Bool = false
    /// Set to `true` when the gateway reports the remote peer has high RTT or packet
    /// loss (call:quality-alert). Auto-resets after 15 s of silence — sustained poor
    /// conditions keep resetting the timer, so the indicator stays up as long as
    /// alerts keep arriving.
    @Published private(set) var isRemoteQualityDegraded: Bool = false
    /// EXIGENCE №1 — true while the signaling socket is down during an
    /// established call. The P2P media keeps flowing; CallView shows a
    /// discreet banner and signaling ops resync on the socket reconnect.
    @Published private(set) var isSignalingDegraded: Bool = false
    @Published var isMuted: Bool = false

    /// CALL-FIX 2026-06-06 — whether THIS call drives CallKit. CallKit is only
    /// needed to (a) ring a backgrounded/locked device woken by a VoIP push and
    /// (b) provide the system call UI. We bypass it when the app already shows its
    /// own in-app call UI: ALWAYS on iOS-app-on-Mac (no system call UI there), and
    /// for socket-delivered INCOMING calls while the app is in the FOREGROUND (the
    /// in-app banner is enough — the redundant CallKit banner is suppressed). The
    /// VoIP-push incoming path (`reportIncomingVoIPCall`) ALWAYS keeps CallKit —
    /// Apple requires `reportNewIncomingCall` there. Set per call in `startCall` /
    /// `handleIncomingCallNotification` / `reportIncomingVoIPCall` /
    /// `rejoinActiveCall` (always `false` — a rejoin never has a CallKit
    /// transaction behind it); gates CallKit transactions + audio-session
    /// self-activation (when false, no CallKit means we own the session lifecycle).
    private var callUsesCallKit = true
    @Published var isSpeaker: Bool = false
    @Published private(set) var callDuration: TimeInterval = 0
    @Published private(set) var currentCallId: String?
    @Published private(set) var connectionQuality: PeerConnectionState = .new
    /// RTT+packet-loss quality level from stats samples; nil until first sample.
    @Published private(set) var liveVideoQualityLevel: VideoQualityLevel? = nil
    /// Sustained-degradation flag for the "Connexion instable" pill — set only
    /// after `DegradedLinkTracker.consecutiveTicksToAlert` consecutive
    /// poor/critical stats ticks, cleared on the first healthy one. A single
    /// bad 5 s sample never alerts the user.
    @Published private(set) var isLinkQualityDegraded = false
    private var degradedLinkTracker = DegradedLinkTracker()
    /// Most-recent stats snapshot collected during the active call. Updated every
    /// `QualityThresholds.statsIntervalSeconds`; nil before the first sample.
    /// Persisted to UserDefaults at call teardown for post-call diagnostics.
    private(set) var lastKnownStats: CallStats?
    @Published var displayMode: CallDisplayMode = .fullScreen
    /// Indice one-shot posé par la bannière PiP juste avant de repasser en
    /// `.fullScreen` : CallView le consomme à son apparition pour jouer
    /// l'animation d'AGRANDISSEMENT depuis la bannière (le fullScreenCover
    /// est présenté sans animation système — le morph interne est LA
    /// transition). Pas `@Published` : lu une fois, jamais rendu.
    private var pendingPipExpansion = false

    /// Pose l'indice d'expansion — appelé par `FloatingCallPillView` avant de
    /// basculer `displayMode` vers `.fullScreen`.
    func requestPipExpansionMorph() {
        pendingPipExpansion = true
    }

    /// Consomme l'indice d'expansion (one-shot) — appelé par `CallView.onAppear`.
    func consumePendingPipExpansion() -> Bool {
        defer { pendingPipExpansion = false }
        return pendingPipExpansion
    }

    /// Une fenêtre PiP SYSTÈME (AVPictureInPicture) est affichée. Orthogonal à
    /// `displayMode` : tant qu'il est vrai, la `FloatingCallPillView` in-app est
    /// masquée pour éviter le doublon visuel au retour au premier plan.
    @Published private(set) var isSystemPiPActive: Bool = false
    /// Bord d'ancrage de la bulle d'appel repliée (`.bubble` displayMode). Vit
    /// sur CallManager (pas en `@State` local d'une View) car visible depuis
    /// deux sites de montage distincts (`RootView`, `iPadRootView`) — même
    /// rationale que `displayMode` juste au-dessus.
    @Published var bubbleEdge: BubbleHorizontalEdge = .trailing
    /// Position verticale de la bulle, en fraction de la zone sûre (0 = haut,
    /// 1 = bas) — survit à la rotation/redimensionnement, contrairement à un
    /// point absolu. Proche du haut par défaut, sous la Dynamic Island.
    @Published var bubbleVerticalFraction: CGFloat = 0.08
    /// Palier de taille du PiP quand la bulle est repliée (`.bubble`
    /// displayMode) — cercle par défaut, agrandi par pincement jusqu'à
    /// `.large` (spec 2026-08-03-call-bubble-pip-resize-morph-design.md).
    /// Contrairement à `bubbleEdge`/`bubbleVerticalFraction` juste au-dessus
    /// (mutés par le drag de repositionnement, donc réinitialisés
    /// explicitement en fin d'appel), celui-ci n'a qu'un seul point d'entrée
    /// en mode bulle — `FloatingCallPillView.collapseToBubble()` — qui le
    /// repose déjà à `.circle` à chaque fois : pas de reset défensif
    /// redondant nécessaire ici.
    @Published var bubbleSizeTier: CallBubbleSizeTier = .circle
    @Published private(set) var hasLocalVideoTrack = false
    @Published private(set) var hasRemoteVideoTrack = false
    /// Pairs qui ont OUVERT leur panneau de sous-titres — un ensemble, pas un
    /// booléen : avec un seul drapeau, la fermeture d'UN pair dans un appel à
    /// trois éteignait la capture locale et privait celui qui lisait encore.
    private var listeningPeers: Set<String> = []
    /// Au moins un pair écoute (`call:transcription-active`, nom estampillé
    /// gateway) — pilote l'indicateur sur l'icône captions de CallView ET la
    /// capture locale (`TranscriptionCapturePolicy`). JAMAIS gâté par la
    /// visibilité du panneau local. Reset au teardown d'appel.
    @Published private(set) var remoteTranscriptionActive = false
    /// Outbound video FROZEN by the graceful-degradation survival layer
    /// (sustained poor link): the encoder is pinned to its floor at 2 fps, the
    /// TRACK and the CAPTURE are intact — nothing is detached, nothing is
    /// renegotiated, and the peer is told nothing (L6-1/L6-2). Distinct from
    /// `isVideoEnabled` (the user's camera intent, which stays true): the user
    /// still WANTS video, the network can't carry it at full rate. Kept under
    /// its historical name because it drives the same local affordance
    /// (`CallView.videoAutoPaused`); it is NOT a "the camera is released"
    /// signal, and must never be read as one — `isVideoSuspendedByHold` /
    /// `isVideoSuspendedByCaptureInterruption` are the two flags that mean that.
    /// Mirrors `videoSurvivalController.isVideoSuspended` for the UI.
    @Published private(set) var isVideoSuspended = false
    /// §7.7 — whether the local capture is the front camera. Drives mirroring
    /// in the UI: only the front camera is mirrored (a mirrored back camera
    /// shows reversed text/scene — bug k). Tracked optimistically (toggled on
    /// switchCamera, reset per call). Default true on iPhone/iPad (front camera
    /// at start), false on iOS-on-Mac (built-in/Continuity cameras are not
    /// mirrored).
    @Published private(set) var isUsingFrontCamera = true
    /// §7.1 — capture cameras available for the in-call device picker (Mac/iPad
    /// Continuity/USB). Refreshed via `refreshAvailableCameras()`. Empty on
    /// iPhone where the front/back flip is the affordance.
    @Published private(set) var availableCameras: [CameraDeviceOption] = []
    /// §7.1 — uniqueID of the active capture camera (drives the picker's check).
    @Published private(set) var selectedCameraId: String?
    @Published var pendingIncomingCall: (callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, iceServers: [IceServer]?, conversationId: String?)?

    // MARK: - Audio Guard (DEBUG override for tests)

    #if DEBUG
    private var _testOverrideCallActive: Bool = false
    var testOverrideCallActive: Bool {
        get { _testOverrideCallActive }
        set { _testOverrideCallActive = newValue }
    }
    #endif

    /// True iff a CallKit call is currently active (ringing/offering/connecting/connected/reconnecting).
    /// Consumed by `ConversationAudioCoordinator` to short-circuit message-audio playback while
    /// a voice/video call is in progress. DEBUG-only override exists for unit tests.
    var isCallActiveForAudioGuard: Bool {
        #if DEBUG
        if _testOverrideCallActive { return true }
        #endif
        return callState.isActive
    }

    /// Thread-safe, nonisolated mirror of `callState.isActive`, updated on every
    /// `callState` change (see the `didSet`). CALL-FIX 2026-06-05: lets the SDK
    /// socket managers (which must stay call-agnostic — SDK purity) consult
    /// "is a call active?" from ANY thread via an injected closure, without
    /// referencing CallManager or hopping to the MainActor. Used to suppress
    /// `forceReconnect()` mid-call (token rotation / re-auth) so the WebRTC
    /// signaling socket is never torn down during a call.
    private nonisolated static let _isCallActiveLock = OSAllocatedUnfairLock(initialState: false)
    /// Thread-safe read/write. Written only from @MainActor (callState.didSet);
    /// read from non-isolated socket-manager closures — guarded by an unfair lock
    /// so concurrent reads never observe a torn write.
    nonisolated static var isCallActiveFlag: Bool {
        get { _isCallActiveLock.withLock { $0 } }
        set { _isCallActiveLock.withLock { $0 = newValue } }
    }

    /// CallKit `provider:didActivate:` observation flag for the stuck-muted
    /// fallback (see `scheduleStuckMutedFallback`). Written from the
    /// CXProviderDelegate proxy (non-isolated CallKit queue), read from the
    /// MainActor fallback task — guarded by an unfair lock, mirroring
    /// `isCallActiveFlag`. Reset in `endCallInternal` so each call observes
    /// its own activation.
    private nonisolated static let _didActivateLock = OSAllocatedUnfairLock(initialState: false)
    nonisolated static var callKitDidActivateFired: Bool {
        get { _didActivateLock.withLock { $0 } }
        set { _didActivateLock.withLock { $0 = newValue } }
    }

    /// Guards `RTCAudioSession` reactivation in `handleAudioInterruption`'s `.ended`
    /// branch against a hangup racing that dispatch. Written `true` at call setup
    /// (`configureAudioSession`, CallKit `didActivate`) and `false` at teardown
    /// (`deactivateAudioSession`, CallKit `didDeactivate`/`providerDidReset`) — both
    /// writers can run from different threads (MainActor vs. CallKit's private
    /// delegate queue), mirroring `isCallActiveFlag`/`callKitDidActivateFired`. The
    /// reactivation block reads this from INSIDE `audioSessionQueue`, so the
    /// check-then-act is serialized against every other writer that also routes
    /// through `audioSessionQueue` — closing the race regardless of which thread's
    /// write reaches the queue first.
    private nonisolated static let _audioSessionExpectedActiveLock = OSAllocatedUnfairLock(initialState: false)
    nonisolated static var isAudioSessionExpectedActive: Bool {
        get { _audioSessionExpectedActiveLock.withLock { $0 } }
        set { _audioSessionExpectedActiveLock.withLock { $0 = newValue } }
    }

    /// Single platform gate for every `callUsesCallKit` assignment — see
    /// `CallReliabilityPolicy.platformUsesCallKit` for why Mac and the
    /// simulator must drive calls in-app.
    nonisolated static let platformSupportsCallKit: Bool = {
        #if targetEnvironment(simulator)
        let isSimulator = true
        #else
        let isSimulator = false
        #endif
        return CallReliabilityPolicy.platformUsesCallKit(
            isiOSAppOnMac: ProcessInfo.processInfo.isiOSAppOnMac,
            isSimulator: isSimulator,
            isChinaRegion: Locale.current.region?.identifier == "CN"
        )
    }()

    // MARK: - Internal

    private let webRTCService: WebRTCService
    /// Drives the graceful audio-only survival layer from quality samples.
    private let videoSurvivalController: VideoSurvivalController
    private let ringbackPlayer = RingbackTonePlayer()
    // PERF-011: replace Timer.scheduledTimer with cancellable @MainActor Tasks.
    // Timers run on RunLoop.main and have no native cancellation hand-off; Tasks
    // are cooperative, energy-efficient (no RunLoop wakeup overhead), and
    // immediately stop their work loop on cancel.
    private var durationTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    /// §5.8 — single periodic monitor that owns BOTH the `.connecting` watchdog
    /// (timeout → ICE restart → fail) and the `.connected` half-open self-heal
    /// (inbound stalled while outbound flows → one ICE restart). It reads
    /// `callState` each tick and applies `CallReliabilityPolicy`, so there is a
    /// single wiring point instead of a timer per state. Replaces the old
    /// purely-informational `rtpGateTask`.
    private var reliabilityMonitorTask: Task<Void, Never>?
    /// Phase 2 fix — Bug 2 (caller stays ringing while callee shows Connecting).
    /// Tracks the startLocalMedia Task so that:
    ///   1. `emitCallJoin` can be sent IMMEDIATELY (decoupled from media init)
    ///      → the caller receives PARTICIPANT_JOINED in <100ms instead of after
    ///      the callee's camera/mic warmup (0.5–3s on real devices).
    ///   2. `answerCall`, `answerCallReady`, and `handleSignalOffer(.connecting)`
    ///      can `await` this task before invoking `createAnswer` — guaranteeing
    ///      the audio/video transceivers exist before SDP answer negotiation.
    private var localMediaTask: Task<Void, Never>?

    /// [CALL_JOIN] Reliable `call:join` emission for incoming calls — see
    /// `joinCallRoomReliably(callId:)`. Cancelled on teardown and superseded
    /// by any newer incoming call.
    private var callJoinTask: Task<Void, Never>?

    /// [Fix 2026-07-02] CallKit answer action held until the call actually
    /// connects. CallKit starts the callee's elapsed timer the moment the
    /// answer action is fulfilled — fulfilling at tap time made the counter
    /// run while WebRTC was still connecting (user-reported "0:00 before the
    /// connection exists"). Held here, fulfilled in `transitionToConnected`,
    /// failed on pre-connection teardown, force-fulfilled by a safety net
    /// (`QualityThresholds.pendingAnswerActionSafetyNetSeconds`) so CallKit
    /// can never time the action out.
    private var pendingAnswerAction: CXAnswerCallAction?
    private var pendingAnswerSafetyTask: Task<Void, Never>?

    /// Called on the MainActor from `provider(_:perform: CXAnswerCallAction)`,
    /// which hops there via `Task { @MainActor ... }` — never synchronously,
    /// since `CXProvider.setDelegate(_:queue: nil)` delivers on CallKit's own
    /// private serial queue, not main (see the `[Fix 2026-07-03]` comment at
    /// that call site for why assuming synchronous main-queue delivery was
    /// itself the bug).
    func holdPendingAnswerAction(_ action: CXAnswerCallAction) {
        // CallKit's contract requires every CX*Action to eventually be
        // completed — settle any still-pending action instead of silently
        // dropping its reference, or an uncompleted action can get the app
        // killed by the system.
        if pendingAnswerAction != nil {
            settlePendingAnswerAction(fulfilled: false, reason: "superseded by a new CXAnswerCallAction")
        }
        pendingAnswerAction = action
        pendingAnswerSafetyTask?.cancel()
        pendingAnswerSafetyTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.pendingAnswerActionSafetyNetSeconds))
            guard !Task.isCancelled else { return }
            self?.settlePendingAnswerAction(fulfilled: true, reason: "safety-net \(Int(QualityThresholds.pendingAnswerActionSafetyNetSeconds))s — still not connected")
        }
    }

    private func settlePendingAnswerAction(fulfilled: Bool, reason: String) {
        pendingAnswerSafetyTask?.cancel()
        pendingAnswerSafetyTask = nil
        guard let action = pendingAnswerAction else { return }
        pendingAnswerAction = nil
        if fulfilled {
            action.fulfill()
        } else {
            action.fail()
        }
        Logger.calls.info("[CALLKIT] answer action \(fulfilled ? "fulfilled" : "failed") (\(reason))")
    }

    /// Called from `CallKitDelegateProxy.provider(_:timedOutPerforming:)` when
    /// CallKit's OWN internal deadline elapses on a held `CXAnswerCallAction`
    /// before we settle it. CallKit has already given up on the action by the
    /// time this fires — `.fulfill()`/`.fail()` must never be called on it
    /// again. Clear the held reference (and its safety-net task) so a later
    /// `transitionToConnected` doesn't try to fulfill an action CallKit no
    /// longer tracks.
    func discardTimedOutAnswerAction(_ action: CXAnswerCallAction) {
        guard pendingAnswerAction === action else { return }
        pendingAnswerSafetyTask?.cancel()
        pendingAnswerSafetyTask = nil
        pendingAnswerAction = nil
        Logger.calls.error("[CALLKIT] discarded answer action after CallKit-side timeout")
    }

    /// Caller-side ringing timeout — ends the call as `.missed` if the recipient
    /// hasn't joined within `outgoingRingTimeoutSeconds`. Cancelled when the
    /// state leaves `.ringing(isOutgoing: true)` (offering / connecting / ended).
    private var outgoingRingTimeoutTask: Task<Void, Never>?
    /// Task de setup d'un appel sortant (force-leave + ACK + media + listen).
    /// Auparavant un Task non-tracké : si endCallInternal fire pendant le
    /// setup (ex: CallKit teardown), le Task continuait à tourner — gardant
    /// la connexion WebRTC active hors-vue. On le stocke pour pouvoir le
    /// cancel proprement dans endCallInternal. Le Task vérifie aussi
    /// `Task.isCancelled` aux points clés en plus du guard `activeCallUUID`.
    private var setupCallTask: Task<Void, Never>?
    /// Audit P1-2 — token bumped each time we leave `.ended`. The 1.5s settle
    /// task captures the token at scheduling time and bails if it has changed
    /// (i.e. a new call already grabbed `currentCallId`/`remoteUserId` between
    /// the ended transition and the timer firing).
    private var settleToken: UUID?
    /// Audit 2026-07-07 — `endCurrentAndAnswerPending`'s revalidation guard used
    /// to read `pendingIncomingCall`, but `endCall()` (called earlier in the same
    /// function) synchronously drives `endCallInternal`, which unconditionally
    /// nils `pendingIncomingCall` for an unrelated reason (dropping a stale busy
    /// banner). That made the revalidation guard always fail, so "End & Answer"
    /// never answered the waiting call. This dedicated token survives the
    /// `endCall()` side effect and is cleared only by `clearPendingIncomingCall`
    /// (remote cancellation) or once consumed.
    private var answeringPendingCallId: String?
    /// Audit P1-12 — direction tracking for CallKit timer reporting.
    /// `reportOutgoingCall(_:connectedAt:)` is for the caller side only;
    /// the callee's elapsed timer is started by CallKit when CXAnswerCallAction
    /// is fulfilled. Calling reportOutgoingCall on the callee silently no-ops
    /// and the Phone-app Recents entry shows no duration.
    private var lastCallWasOutgoing: Bool = false
    /// The last OUTGOING call's dial context, captured at `startCall`. Powers
    /// `retryCall()` (« Réessayer ») — `resetEndedStateForNewCall` clears the
    /// live identity fields, so the retry must re-dial from this snapshot rather
    /// than the (already-torn-down) call state. Parité web/Android retry.
    private var lastOutgoingContext: (conversationId: String, userId: String, displayName: String, isVideo: Bool)?
    /// `private(set)` (not `private`) so CallView can compute a "since call
    /// start" elapsed time for each live-caption row — the only other
    /// existing consumer of call timing is `callDuration`, which is a ticking
    /// counter, not a fixed reference point captions can anchor to.
    private(set) var callStartDate: Date?
    /// True dès que la PREMIÈRE connexion média de cet appel a eu lieu (chrono
    /// démarré). CallView s'en sert pour ne rendre le layout connecté en
    /// `.reconnecting` que si un média a réellement existé — un ICE restart
    /// pré-établissement (depuis `.connecting`) garde l'UI "Connexion…".
    /// Lu au re-render déclenché par le changement de `callState` (@Published) ;
    /// pas besoin d'être publié lui-même.
    var hasEstablishedMedia: Bool { callStartDate != nil }
    private var reconnectAttempt = 0
    /// Connection epoch — bumped on every `transitionToConnected`. The
    /// reliability monitor's `HalfOpenMonitorState` keys off it to re-arm
    /// half-open detection with a fresh RTP baseline after each (re)connect,
    /// even when a reconnection cycle completes between two poll ticks.
    private var connectionEpoch = 0

    // MARK: - Analytics accumulators (reset in endCallInternal)
    private var analyticsCallInitiatedDate: Date?
    /// answer/join → début de la négociation WebRTC : answerCall côté appelé,
    /// participant-joined côté appelant. Sépare le temps de sonnerie humain
    /// (dans setupTimeMs) du temps technique (negotiationTimeMs).
    private var analyticsNegotiationStartDate: Date?
    private var analyticsConnectedDate: Date?
    private var analyticsNetworkTransitions: Int = 0
    private var analyticsQualitySeconds: [VideoQualityLevel: Double] = [:]
    private var analyticsLastQualityDate: Date?
    private var analyticsCurrentLevel: VideoQualityLevel?
    /// Snapshots analytics périodiques (60 s, endReason "in_progress") — un
    /// kill de l'app en background ne perd plus la télémétrie de l'appel.
    private var analyticsSnapshotTask: Task<Void, Never>?
    private var analyticsRttSum: Double = 0
    private var analyticsSampleCount: Int = 0
    private var analyticsMaxPacketLoss: Double = 0
    private var analyticsPacketLossSum: Double = 0
    private var analyticsEffectsUsed: Set<String> = []
    private var analyticsVideoFiltersUsed: Bool = false
    /// Cumulative reconnection attempts across the WHOLE call, for the
    /// "reconnectionCount" analytics field. Deliberately separate from
    /// `reconnectAttempt` (the live FSM retry budget, capped at
    /// `maxReconnectAttempts` and zeroed by every `transitionToConnected` —
    /// including a mid-call ICE-restart recovery, not just call start). Without
    /// this, a call that survived several network blips and then ended
    /// normally reported `reconnectionCount: 0`, identical to a call that never
    /// had any trouble — defeating the one metric meant to flag connectivity
    /// issues. Incremented alongside `reconnectAttempt` in `attemptReconnection`
    /// and reset only in `endCallInternal`.
    private var analyticsTotalReconnects: Int = 0

    /// Periodic refresh of TURN credentials before TTL expiry. Cancelled on call end.
    private var turnRefreshTask: Task<Void, Never>?
    /// Watchdog armed after every `call:request-ice-servers` emit — retries if
    /// `call:ice-servers-refreshed` doesn't arrive within
    /// `turnRefreshRetryTimeoutSeconds`. `emitRequestIceServers` carries no ACK,
    /// so without this a single dropped emit/reply killed the refresh chain for
    /// the rest of the call. Cancelled on call end and on every successful
    /// response (via `scheduleTURNCredentialRefresh`).
    private var turnRefreshWatchdogTask: Task<Void, Never>?
    /// Consecutive watchdog retries for the current refresh cycle. Reset to 0
    /// whenever a fresh cycle starts (`scheduleTURNCredentialRefresh`).
    private var turnRefreshRetryAttempt = 0
    private var participantJoinedCancellable: AnyCancellable?
    /// Audit P3 — replaces the never-assigned `signalOfferCancellable`
    /// (AnyCancellable, dead) with a properly typed Task slot. Two callers
    /// (`answerCall` and `answerCallReady`) schedule a 30s SDP-offer
    /// timeout; both now store the Task here so `endCallInternal` can
    /// cancel it cleanly instead of leaking it for the remaining sleep.
    private var sdpOfferTimeoutTask: Task<Void, Never>?
    /// Tracks the at-most-one in-flight offer retry loop so `endCallInternal`
    /// can cancel it promptly instead of waiting for the settle window to expire.
    /// A new offer supersedes the previous one via the generation guard inside
    /// `emitOfferWithRetry`, but cancelling the Task is cheaper than sleeping.
    private var offerRetryTask: Task<Void, Never>?
    /// Same as `offerRetryTask` for the SDP answer backoff path.
    private var answerRetryTask: Task<Void, Never>?
    /// Tracks the in-flight toggleVideo Task. Cancelled when a rapid second tap arrives
    /// so the later intent always wins and `isVideoEnabled` stays consistent with WebRTC.
    private var videoToggleTask: Task<Void, Never>?
    /// Tracks the in-flight hold/unhold video Task. Chained onto (not cancelled) so a
    /// rapid hold→unhold sequence serializes rather than running both concurrently.
    private var holdVideoTask: Task<Void, Never>?
    /// Tracks the in-flight network-survival video suspend/resume Task (see
    /// `applySurvivalVideoSend`). `videoToggleTask`, `holdVideoTask`, `iceRestartTask`,
    /// `signalOfferAnswerTask`, `cameraSwitchTask`, and this one all end up driving the
    /// peer connection's local or remote description (directly, or via
    /// `performICERestart()`/`createAnswer()`), or the shared `RTCCameraVideoCapturer`
    /// (directly, or via `switchCamera()`), neither of which has a re-entrancy guard —
    /// a second concurrent call re-enters `pc.offer(for:)`/`pc.answer(for:)`/
    /// `setLocalDescription`, or interleaves `stopCapture()`/`startCapture()` on the
    /// same capturer, while the first is still in flight.
    /// Every one of the six chains onto the other five's `.value` before proceeding
    /// so at most one renegotiation/camera actuation ever runs at a time.
    private var survivalVideoTask: Task<Bool, Never>?
    private var remoteQualityResetTask: Task<Void, Never>?
    /// In-flight ICE restart task. Tracked so overlapping `attemptReconnection`
    /// calls (e.g. watchdog fires while backoff is sleeping) cancel the previous
    /// attempt before starting the new one — prevents two concurrent restart
    /// offers from corrupting the perfect-negotiation state machine. Also part of
    /// the `videoToggleTask`/`holdVideoTask`/`survivalVideoTask`/
    /// `signalOfferAnswerTask` chain (see `survivalVideoTask`'s doc-comment) since
    /// it calls `createOffer()` too.
    private var iceRestartTask: Task<Void, Never>?
    /// In-flight `createAnswer()` task started from `handleSignalOffer` (a
    /// peer-initiated renegotiation offer, e.g. their own A/V toggle or an ICE
    /// restart they initiated). Audit finding — this path called
    /// `webRTCService.createAnswer()` directly, unserialized against the
    /// `videoToggleTask`/`holdVideoTask`/`survivalVideoTask`/`iceRestartTask`
    /// family: a peer offer landing while a local hold/toggle/ICE-restart is
    /// mid-`createOffer()` could run `createAnswer()` concurrently on the same
    /// `RTCPeerConnection` — `createOffer()` has no glare check against an
    /// in-flight answer either, so the perfect-negotiation guard alone doesn't
    /// catch it. Part of the same chain now — see `survivalVideoTask`'s doc-comment.
    private var signalOfferAnswerTask: Task<Void, Never>?
    /// Tracks the in-flight `switchCamera()`/`selectCamera(id:)` Task. Chained onto
    /// (not cancelled) so a rapid flip→flip or flip→select serializes rather than
    /// running two `RTCCameraVideoCapturer` actuations concurrently. Also part of the
    /// `videoToggleTask`/`holdVideoTask`/`survivalVideoTask`/`iceRestartTask`/
    /// `signalOfferAnswerTask` chain (see `survivalVideoTask`'s doc-comment) —
    /// `switchCamera()`/`selectCamera(id:)` drive the SAME capturer via
    /// `stopCapture()`/`startCapture()` as `toggleVideo`/`handleHold`/the thermal
    /// downgrade do. Audit finding — without this, a video-toggle tap immediately
    /// followed by a camera flip could let the flip's `startCapture()` finish AFTER a
    /// concurrent downgrade's `stopCapture()`, leaving the camera physically on (LED
    /// lit, streaming) while `isVideoEnabled == false` — a privacy regression, not
    /// just a UI desync.
    private var cameraSwitchTask: Task<Void, Never>?
    /// One-shot stuck-muted fallback (§RC-2): armed when `.connected` is
    /// reached on iPhone/iPad before CallKit delivered `provider:didActivate:`.
    private var audioActivationFallbackTask: Task<Void, Never>?
    private var voipFreshnessTask: Task<Void, Never>?
    private var pendingRemoteOffer: SessionDescription?
    // P0-3 — ICE candidates generated while the socket is down are buffered
    // here and replayed after the socket reconnects + emitCallJoin fires.
    private var pendingIceCandidates: [[String: Any]] = []
    private var cancellables = Set<AnyCancellable>()
    fileprivate let audioSessionQueue = DispatchQueue(label: "me.meeshy.callmanager.audiosession")

    // Screen capture monitoring
    private var screenCaptureObserver: NSObjectProtocol?
    private var backgroundObserver: NSObjectProtocol?
    private var foregroundObserver: NSObjectProtocol?
    /// C3 — `true` quand la session de capture caméra a été INTERROMPUE par le
    /// système, donc que le pair doit voir notre avatar plutôt qu'un dernier
    /// frame figé (`call:media-toggled false`).
    ///
    /// Le déclencheur est l'interruption de capture, PAS le passage en
    /// arrière-plan. La nuance est le correctif : avec un
    /// `AVPictureInPictureController` actif et
    /// `isMultitaskingCameraAccessEnabled` posé avant `startRunning`, la caméra
    /// SURVIT à l'arrière-plan — annoncer « caméra coupée » y était un mensonge,
    /// et le pair perdait une vidéo qui continuait pourtant d'arriver.
    ///
    /// Un prédicat « ne pas émettre si le PiP est actif » ne marcherait pas : il
    /// serait évalué dans le handler de `didEnterBackgroundNotification`, or
    /// l'auto-start du PiP est déclenché par cette même transition et
    /// `willStartPictureInPicture` peut arriver après. Le déclencheur par
    /// interruption est en revanche auto-corrigeant : si la caméra survit, rien
    /// n'est posté.
    ///
    /// Levé par la fin d'interruption OU par le retour en avant-plan — ce
    /// dernier est le garde-fou : `AVCaptureSession.h` documente la fin
    /// d'interruption comme survenant « when your app comes back to
    /// foreground », donc un signal de fin peut ne jamais arriver tant que l'app
    /// reste en arrière-plan.
    private var isVideoSuspendedByCaptureInterruption = false
    /// `true` while CallKit has placed the call on hold (e.g. incoming cellular
    /// call). The user's camera intent (`isVideoEnabled`) is preserved so video
    /// resumes automatically on unhold. Cleared on unhold or call teardown.
    private var isVideoSuspendedByHold = false

    // Network monitoring
    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "me.meeshy.callmanager.network")
    private var lastNetworkPath: NWPath.Status = .satisfied
    private var lastNetworkInterfaceType: NWInterface.InterfaceType? = nil
    private let thermalMonitor = ThermalStateMonitor()

    // CallKit
    private let callProvider: CXProvider
    private let callController = CXCallController()
    // fileprivate (not private): CallKitDelegateProxy, below in this file, reads it to
    // validate that a CXProviderDelegate action targets the call we're actually tracking
    // before mutating shared state — see the action.callUUID guards in that class.
    fileprivate var activeCallUUID: UUID?

    private init(webRTCService: WebRTCService? = nil) {
        self.webRTCService = webRTCService ?? WebRTCService()
        // Survival controller is created with no actuator yet; `attach(self)` wires
        // it below once `self` is fully initialized (avoids a self-before-init use).
        self.videoSurvivalController = VideoSurvivalController()

        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        // Restauré à 2 (rollback audit P2-iOS-5 qui l'avait baissé à 1) :
        // entre commits 4dbb387e (état fonctionnel) et HEAD, lowering this
        // value à 1 a coïncidé avec la régression "CallKit teardown autonome
        // à ~3s sur appels sortants". Le couple maximumCallGroups=1 +
        // supportsHolding=false était valide en théorie mais a confondu
        // l'iOS runtime au point de tuer l'appel avant que
        // provider:didActivate:audioSession ne se déclenche. 2 est la valeur
        // par défaut (sans config) et celle utilisée par FaceTime/WhatsApp.
        config.maximumCallGroups = 2
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = true
        // Custom CallKit icon: a 40x40 pt template PNG named "CallKitIcon".
        // `iconTemplateImageData` is a TEMPLATE — iOS discards the colour
        // channels and reads the alpha channel only, so the asset carries an
        // opaque glyph on a fully transparent background. An opaque PNG would
        // render as a filled rectangle.
        //
        // Never silence a miss here: this branch was guarded by a bare `if let`
        // against an asset that had never existed, so the call card shipped
        // without brand identity from the very first build and nothing said so.
        if let icon = UIImage(named: "CallKitIcon"), let data = icon.pngData() {
            config.iconTemplateImageData = data
        } else {
            Logger.calls.error("[CALLKIT] CallKitIcon asset missing — call UI ships without brand identity")
            assertionFailure("CallKitIcon asset missing from Assets.xcassets")
        }
        // Phase 1.5 fix — explicit ringtone for incoming calls.
        // CallKit's default `ringtoneSound = nil` falls back to system ringtone,
        // but iOS 17+ has been reporting unreliable behavior (UI shows but no
        // audio) on real devices. Apple's SOTA pattern (FaceTime, WhatsApp) is
        // to bundle a custom .caf and set it explicitly. The file must be in
        // the main app bundle, ≤30s, CAF format.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.3
        config.ringtoneSound = "Ringtone.caf"
        callProvider = CXProvider(configuration: config)

        let delegateProxy = CallKitDelegateProxy()
        delegateProxy.manager = self
        callProvider.setDelegate(delegateProxy, queue: nil)
        self.callKitDelegate = delegateProxy

        self.webRTCService.delegate = self

        // Wire the survival controller now that `self` exists. The controller holds
        // the actuator weakly, so no retain cycle (CallManager owns the controller).
        self.videoSurvivalController.attach(actuator: self)
        self.videoSurvivalController.$isVideoSuspended
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] suspended in
                guard let self else { return }
                self.isVideoSuspended = suspended
                // Le gel a DEUX propriétaires : le contrôleur (politique) et
                // WebRTCService (encodeur). `reset()` n'efface que le premier ;
                // sans ce dégel branché sur le FRONT DESCENDANT, un reset
                // pendant un gel (toggleVideo, unhold, thermique critique, fin
                // d'appel) épingle l'encodeur au plancher pour tout le reste de
                // l'appel, sans affordance ni chemin de reprise. `removeDuplicates()`
                // en amont ne laisse donc passer que les vraies transitions.
                if !suspended { self.webRTCService.unfreezeVideoAfterSurvival() }
            }
            .store(in: &cancellables)

        setupSocketListeners()
        startNetworkMonitoring()
        startAudioInterruptionMonitoring()
        startAudioRouteChangeMonitoring()
        startMediaServicesResetMonitoring()
        Logger.calls.info("CallManager initialized")
    }

    /// Audit P1-31 — observe `AVAudioSession.interruptionNotification`
    /// throughout the singleton's lifetime. When iOS interrupts a VoIP call
    /// for a system event (cellular GSM call, alarm, Siri), CallKit suspends
    /// the audio session via `provider:didDeactivate:` (which sets
    /// `RTCAudioSession.isAudioEnabled = false`) but iOS does NOT
    /// automatically call `didActivate` on resume — it waits for a user
    /// action. Without an explicit interruption-end observer, the VoIP
    /// audio path stayed silent indefinitely after the interrupting event
    /// ended, even though WebRTC ICE was still connected.
    @MainActor
    private func startAudioInterruptionMonitoring() {
        // Swift 6 : Notification n'est pas Sendable, donc on extrait les
        // valeurs primitives (UInt? sont Sendable) AVANT de traverser la
        // frontière Task. Le closure d'observateur exécute déjà sur .main
        // (queue: .main), l'extraction est donc synchrone et sûre.
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            let info = notification.userInfo
            let typeRaw = info?[AVAudioSessionInterruptionTypeKey] as? UInt
            let optionsRaw = info?[AVAudioSessionInterruptionOptionKey] as? UInt
            Task { @MainActor [weak self] in
                self?.handleAudioInterruption(typeRaw: typeRaw, optionsRaw: optionsRaw)
            }
        }
    }

    @MainActor
    private func handleAudioInterruption(typeRaw: UInt?, optionsRaw: UInt?) {
        guard callState.isActive else { return }
        guard let typeRaw,
              let type = AVAudioSession.InterruptionType(rawValue: typeRaw) else {
            return
        }
        switch type {
        case .began:
            Logger.calls.info("Audio interruption began (call active)")
        case .ended:
            // `.shouldResume` is an opportunistic hint from iOS, NOT a guarantee.
            // After an alarm / Siri / GSM interruption iOS frequently omits it
            // AND never calls provider:didActivate: on its own — which left the
            // rest of the call silent (mic + output dead) while ICE stayed
            // connected. For a VoIP call we KNOW must continue (callState.isActive
            // was checked above) we reactivate the RTCAudioSession regardless of
            // the hint; deferring to a hint that may never come is the bug.
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw ?? 0)
            if options.contains(.shouldResume) {
                Logger.calls.info("Audio interruption ended (shouldResume) — re-enabling RTCAudioSession")
            } else {
                Logger.calls.info("Audio interruption ended without shouldResume — reactivating anyway (call active)")
            }
            // Use async dispatch to avoid blocking the MainActor while
            // AVAudioSession.setActive (which can take 10–100ms) and
            // RTCAudioSession configuration run. The audio reconfiguration is
            // fire-and-forget: the call stays active; the next ICE heartbeat
            // will surface any persistent failure to the user.
            audioSessionQueue.async {
                // Re-check INSIDE the queue, not just via the `callState.isActive`
                // guard above: a hangup can race this async dispatch from a
                // different thread (MainActor teardown, or CallKit's own
                // `didDeactivate` on its private delegate queue) and land on
                // `audioSessionQueue` either before or after this block. Reading
                // `isAudioSessionExpectedActive` here — rather than trusting the
                // stale outer check — serializes the decision against every other
                // writer that also routes through this queue.
                guard CallManager.isAudioSessionExpectedActive else {
                    Logger.calls.info("Skipping interruption-ended reactivation — audio session already torn down")
                    return
                }
                // Re-activate the system AVAudioSession first — the interruption
                // deactivated it, so RTCAudioSession.audioSessionDidActivate is a
                // no-op until the OS session is active again.
                do {
                    try AVAudioSession.sharedInstance().setActive(true, options: [])
                } catch {
                    Logger.calls.error("AVAudioSession reactivation failed after interruption: \(error.localizedDescription)")
                    return
                }
                let rtc = RTCAudioSession.sharedInstance()
                rtc.lockForConfiguration()
                rtc.audioSessionDidActivate(AVAudioSession.sharedInstance())
                rtc.isAudioEnabled = true
                rtc.unlockForConfiguration()
            }
        @unknown default:
            break
        }
    }

    // P0-8 — reconcile `isSpeaker` when iOS changes the audio route (headset
    // plug/unplug, Bluetooth connect/disconnect, AirPlay). Without this, the
    // UI speaker button stays out of sync: the user taps "speaker on", plugs
    // headphones → audio routes to headphones but `isSpeaker` stays true;
    // unplugging then re-routes to the built-in speaker unexpectedly.
    @MainActor
    private func startAudioRouteChangeMonitoring() {
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            let reasonRaw = (notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 0
            Task { @MainActor [weak self] in
                self?.handleAudioRouteChange(reasonRaw: reasonRaw)
            }
        }
    }

    @MainActor
    private func handleAudioRouteChange(reasonRaw: UInt) {
        guard callState.isActive else { return }
        let reason = AVAudioSession.RouteChangeReason(rawValue: reasonRaw) ?? .unknown
        switch reason {
        case .newDeviceAvailable:
            // Headset / Bluetooth connected — clear a stale speaker override.
            // Same discipline as toggleSpeaker() (§7.8): overrideOutputAudioPort
            // can throw (e.g. `insufficientPriority` when the just-connected
            // accessory itself holds route priority), and discarding that failure
            // here left `isSpeaker` at `false` even when the override never
            // actually applied — desyncing the speaker-toggle UI from the real
            // audio route until an unrelated route change or manual toggle
            // happened to reconcile it.
            let previousSpeaker = isSpeaker
            isSpeaker = false
            if !applySpeakerRoute() {
                isSpeaker = previousSpeaker
            }
            Logger.calls.info("Audio route: new device available — isSpeaker = \(self.isSpeaker)")
        case .oldDeviceUnavailable:
            // Headset / Bluetooth disconnected — iOS routes back to built-in;
            // re-apply the current speaker preference so RTCAudioSession follows.
            applySpeakerRoute()
            Logger.calls.info("Audio route: device removed — re-applying speaker route (isSpeaker=\(self.isSpeaker))")
        case .override:
            // Software override (our own `overrideOutputAudioPort`); no action needed.
            break
        default:
            // Category change, wake-from-sleep, etc. — re-apply to stay consistent.
            applySpeakerRoute()
        }
    }

    private func startMediaServicesResetMonitoring() {
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.handleMediaServicesReset()
            }
        }
    }

    @MainActor
    private func handleMediaServicesReset() {
        guard callState.isActive else { return }
        Logger.calls.fault("AVAudioSession media services reset during call — rebuilding audio stack")
        // The media server process crashed and restarted. All session state is
        // gone. Reconstruct: reconfigure RTCAudioSession (category / mode /
        // options), then notify libwebrtc that the session cycled so it
        // restarts its audio I/O unit. Re-apply the speaker route last, once
        // the engine is live again.
        configureAudioSession()
        audioSessionQueue.async { [weak self] in
            // Re-check INSIDE the queue, not just via the `callState.isActive`
            // guard above: a hangup can race this async dispatch from a
            // different thread (MainActor teardown, or CallKit's own
            // `didDeactivate`/`providerDidReset` on its private delegate
            // queue) — mirrors handleAudioInterruption's reactivation guard.
            guard self != nil, CallManager.isAudioSessionExpectedActive else {
                Logger.calls.info("Skipping media-services-reset reactivation — audio session already torn down")
                return
            }
            do {
                try AVAudioSession.sharedInstance().setActive(true, options: [])
            } catch {
                Logger.calls.error("AVAudioSession reactivation after media-services reset failed: \(error.localizedDescription)")
                // Do not proceed: telling RTCAudioSession the session is active when
                // setActive(true) just failed would corrupt the WebRTC audio state.
                // The next ICE heartbeat or user action will surface the failure.
                return
            }
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.audioSessionDidDeactivate(AVAudioSession.sharedInstance())
            rtc.audioSessionDidActivate(AVAudioSession.sharedInstance())
            rtc.isAudioEnabled = true
            rtc.unlockForConfiguration()
        }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.mediaServicesResetSpeakerDelaySeconds))
            self?.applySpeakerRoute()
        }
    }

    private var callKitDelegate: CallKitDelegateProxy?

    // MARK: - Outgoing Call

    /// Force reset à `.idle` quand l'état est encore `.ended` au moment où
    /// un nouveau call (entrant ou sortant) arrive. Sans ça la fenêtre de
    /// 1.5s laisse passer une seconde tentative qui se voit refusée avec
    /// "already in state ended(...)" — le signal disparaît côté user.
    @MainActor
    private func resetEndedStateForNewCall() {
        // Audit P1-2 — bump the settle token so any pending 1.5s settle Task
        // bails out instead of clobbering the new call's identity fields.
        settleToken = nil
        if case .ended = callState {
            callState = .idle
            currentCallId = nil
            remoteUserId = nil
            remoteUsername = nil
            conversationId = nil
            callDuration = 0
            isVideoEnabled = false
            isRemoteVideoEnabled = true
            isRemoteAudioEnabled = true
            isRemoteScreenCapturing = false
            isMuted = false
            isSpeaker = false
            bubbleEdge = .trailing
            bubbleVerticalFraction = 0.08
            videoSurvivalController.reset()
            isVideoSuspended = false
            isVideoSuspendedByCaptureInterruption = false
            isVideoSuspendedByHold = false
            Logger.calls.info("Force-reset .ended → .idle to accept new call")
        }
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

        return startCall(conversationId: conversationId, userId: userId, displayName: displayName, isVideo: video)
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
        resetEndedStateForNewCall()
        guard callState == .idle else {
            Logger.calls.warning("Cannot start call: already in state \(String(describing: self.callState))")
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

        analyticsCallInitiatedDate = Date()

        // Optimistic local state — `currentCallId` is reassigned to the real
        // gateway-issued ObjectId once the ACK lands.
        remoteUserId = userId
        remoteUsername = displayName
        self.conversationId = conversationId
        isVideoEnabled = isVideo
        isMuted = false
        isSpeaker = isVideo
        // Force displayMode = .fullScreen pour que RootView présente le
        // `.fullScreenCover { CallView() }`. Sans ça, displayMode peut être
        // resté à `.pip` après le dismiss d'un appel précédent (le binding
        // setter de fullScreenCover passe à .pip quand isPresented passe à
        // false), et tous les appels suivants n'affichent que le mini-PiP
        // `FloatingCallPillView` au lieu de la vue plein écran.
        displayMode = .fullScreen
        callState = .ringing(isOutgoing: true)
        lastCallWasOutgoing = true
        // Snapshot the dial context so a transient failure can be « Réessayer »-ed.
        lastOutgoingContext = (conversationId, userId, displayName, isVideo)

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
        startOutgoingRingTimeout()

        // Outgoing is always foreground (the user just tapped Call), so the only
        // no-CallKit cases here are the platform ones (Mac, simulator).
        // (Suppressing CallKit for outgoing on a real iPhone would drop the
        // system call UI / Recents the user expects there.)
        callUsesCallKit = Self.platformSupportsCallKit
        ringbackPlayer.shouldSelfActivateSession = !callUsesCallKit
        let uuid = UUID()
        activeCallUUID = uuid
        if !callUsesCallKit {
            // No CallKit (iOS-app-on-Mac): CXStartCallAction half-succeeds and the
            // later CXEndCallAction can't clear it → CallKit shows a stuck "call in
            // progress" after hangup. Drive the call entirely in-app; the
            // call:initiate flow below runs independently. Start the ringback
            // directly (provider:didActivate never fires without CallKit).
            Logger.calls.info("[no-callkit] outgoing call — in-app ringback")
            startRingbackIfNeeded()
        } else {
            // CXHandle.value persists in the iOS Phone app Recents list — use the
            // userId for stable identity rather than a (possibly localized) name.
            let handle = CXHandle(type: .generic, value: userId)
            let startAction = CXStartCallAction(call: uuid, handle: handle)
            startAction.isVideo = isVideo
            startAction.contactIdentifier = displayName
            let transaction = CXTransaction(action: startAction)
            let provider = callProvider
            callController.request(transaction) { [weak self] error in
                if let error {
                    Logger.calls.error("CallKit start call failed: \(error.localizedDescription)")
                    Task { @MainActor [weak self] in self?.endCallInternal(reason: .failed("CallKit error")) }
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
        setupCallTask?.cancel()
        setupCallTask = Task { [weak self, uuid] in
            guard let self else { return }
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
                try? await Task.sleep(for: .milliseconds(250))
                guard self.activeCallUUID == uuid else {
                    Logger.calls.info("[CALL_SETUP] force-leave wait — uuid changed, discarding")
                    return
                }

                let ack = try await MessageSocketManager.shared.emitCallInitiate(
                    conversationId: conversationId,
                    isVideo: isVideo
                )
                guard self.activeCallUUID == uuid else {
                    Logger.calls.info("[CALL_SETUP] ACK arrived after end — discarding (uuid changed)")
                    return
                }
                let dynamicServers = ack.iceServers.map { server in
                    IceServer(urls: server.urls.asArray, username: server.username, credential: server.credential)
                }
                self.currentCallId = ack.callId
                Logger.calls.info("[CALL_SETUP] outgoing 1/4 webRTC.configure begin (isVideo=\(isVideo))")
                // Audit fix (calling-stack audit 2026-08-15): abort setup on
                // a genuine peer-connection creation failure instead of
                // silently proceeding — see WebRTCService.configure's doc.
                guard self.webRTCService.configure(isVideo: isVideo, iceServers: dynamicServers) else {
                    Logger.calls.error("[CALL_SETUP] outgoing webRTC.configure failed — aborting")
                    self.failCall("Failed to initiate call")
                    return
                }
                self.scheduleTURNCredentialRefresh(ttl: TimeInterval(ack.ttl ?? Int(QualityThresholds.turnDefaultCredentialTTLSeconds)))
                self.applyNegotiationRole()
                Logger.calls.info("[CALL_SETUP] outgoing 2/4 configureAudioSession begin")
                self.configureAudioSession()
                self.startReliabilityMonitor()
                Logger.calls.info("[CALL_SETUP] outgoing 3/4 startLocalMedia begin (isVideo=\(isVideo))")
                await self.performLocalMediaStart(isVideo: isVideo, callId: ack.callId)
                guard self.currentCallId == ack.callId else { return }
                Logger.calls.info("[CALL_SETUP] outgoing 4/4 startLocalMedia done")
                self.listenForParticipantJoined(callId: ack.callId, toUserId: userId, isVideo: isVideo)
                Logger.calls.info("Outgoing call initiated: \(ack.callId) to \(displayName), waiting for participant joined (\(dynamicServers.count) ICE servers)")
            } catch {
                Logger.calls.error("call:initiate ACK failed: \(error.localizedDescription)")
                if self.activeCallUUID == uuid {
                    self.failCall("Failed to initiate call")
                }
            }
        }

        HapticFeedback.medium()
        return true
    }

    // MARK: - Retry a transiently-failed call (« Réessayer »)

    /// True when the ended call failed transiently (`.failed`/`.connectionLost`)
    /// and its outgoing dial context is known — the ended view offers
    /// « Réessayer ». Parité web/Android retry-on-failure.
    var canRetryCall: Bool {
        guard case .ended(let reason) = callState else { return false }
        return CallRetryPolicy.isRetryable(reason) && lastOutgoingContext != nil
    }

    /// Re-dial the last outgoing call after a transient failure. `startCall`
    /// resets the ended state to idle before re-initiating, so this simply
    /// replays the captured dial context. Inert unless `canRetryCall`.
    @discardableResult
    func retryCall() -> Bool {
        guard canRetryCall, let ctx = lastOutgoingContext else { return false }
        return startCall(
            conversationId: ctx.conversationId,
            userId: ctx.userId,
            displayName: ctx.displayName,
            isVideo: ctx.isVideo
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
        resetEndedStateForNewCall()
        guard callState == .idle else {
            Logger.calls.warning("Cannot rejoin call: already in state \(String(describing: self.callState))")
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

        analyticsCallInitiatedDate = Date()
        currentCallId = callId
        self.remoteUserId = remoteUserId
        self.remoteUsername = remoteUsername
        self.conversationId = conversationId
        isVideoEnabled = isVideo
        isMuted = false
        isSpeaker = isVideo
        displayMode = .fullScreen
        callState = .connecting
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
        callUsesCallKit = false

        // iceServers: nil — a rejoin has no incoming push/ACK payload to source
        // them from. armTurnCredentialsAfterConfigure detects the empty case
        // and fetches real TURN credentials over the socket on its own
        // (requestFreshTurnCredentials → emitRequestIceServers), same as every
        // other path that lacks a payload-embedded ICE server list.
        // Audit fix (calling-stack audit 2026-08-15): abort on a genuine
        // peer-connection creation failure instead of silently proceeding.
        guard webRTCService.configure(isVideo: isVideo, iceServers: nil) else {
            Logger.calls.error("[CALL_SETUP] rejoin webRTC.configure failed — aborting")
            failCall("Failed to configure WebRTC")
            return false
        }
        armTurnCredentialsAfterConfigure(callId: callId, iceServers: nil)
        applyNegotiationRole()
        configureAudioSession()
        startReliabilityMonitor()

        joinCallRoomReliably(callId: callId)
        Logger.calls.info("Rejoining active call — reliable call:join dispatched: \(callId)")

        localMediaTask?.cancel()
        localMediaTask = Task { [weak self] in
            guard let self else { return }
            await self.performLocalMediaStart(isVideo: isVideo, callId: callId)
            Logger.calls.info("Rejoin — local media ready: \(callId)")
        }

        HapticFeedback.medium()
        return true
    }

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

    @Published var showCallWaitingBanner = false

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

    // MARK: - Local Media Start Helper

    @MainActor
    private func performLocalMediaStart(isVideo: Bool, callId: String) async {
        do {
            try await webRTCService.startLocalMedia(isVideo: isVideo)
            guard currentCallId == callId else { return }
            if isVideo { hasLocalVideoTrack = true }
        } catch WebRTCError.simulatorVideoUnsupported {
            Logger.calls.warning("Simulator video unsupported — continuing audio-only")
            guard currentCallId == callId else { return }
            isVideoEnabled = false
            do {
                try await webRTCService.startLocalMedia(isVideo: false)
            } catch {
                // Le repli a échoué à son tour : l'appel n'a PLUS AUCUN média
                // (ni vidéo ni audio) — état muet invisible sans cette trace.
                Logger.calls.error("Audio-only fallback failed, call has no local media at all: \(error.localizedDescription, privacy: .public)")
            }
            guard currentCallId == callId else { return }
        } catch WebRTCError.cameraPermissionDenied {
            Logger.calls.warning("[CALL_SETUP] camera permission denied — degrading to audio-only")
            guard currentCallId == callId else { return }
            isVideoEnabled = false
            do {
                try await webRTCService.startLocalMedia(isVideo: false)
            } catch {
                // Le repli a échoué à son tour : l'appel n'a PLUS AUCUN média
                // (ni vidéo ni audio) — état muet invisible sans cette trace.
                Logger.calls.error("Audio-only fallback failed, call has no local media at all: \(error.localizedDescription, privacy: .public)")
            }
            guard currentCallId == callId else { return }
            FeedbackToastManager.shared.showError(
                String(localized: "call.video.permission.denied",
                       defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                       bundle: .main)
            ) {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            }
        } catch is CancellationError {
            return
        } catch {
            Logger.calls.error("startLocalMedia failed: \(error.localizedDescription)")
            if currentCallId == callId {
                failCall(String(localized: "call.error.media"))
            }
        }
    }

    // MARK: - Signal Offer (real SDP from caller after auto-join)

    func handleSignalOffer(callId: String, sdp: SessionDescription, generation: Int = 0) {
        guard currentCallId == callId else {
            Logger.calls.warning("Signal offer for unknown call: \(callId)")
            return
        }
        // §3.5 — drop offers from an older negotiation epoch (churned socket /
        // replayed buffer). The newest generation always wins.
        guard acceptIncomingNegotiation(generation) else { return }
        guard let userId = remoteUserId else { return }

        switch callState {
        case .ringing:
            // User hasn't accepted yet — buffer the offer
            pendingRemoteOffer = sdp
            Logger.calls.info("SDP offer buffered for call: \(callId), waiting for user to accept")

        case .connecting:
            // User already accepted but SDP arrived late — create answer immediately
            let previousToggleConnecting = videoToggleTask
            let previousHoldConnecting = holdVideoTask
            let previousSurvivalConnecting = survivalVideoTask
            let previousICERestartConnecting = iceRestartTask
            let previousAnswerConnecting = signalOfferAnswerTask
            let previousCameraSwitchConnecting = cameraSwitchTask
            signalOfferAnswerTask = Task { [weak self] in
                // Serialize with every other in-flight video-transition/renegotiation
                // path — see the doc-comment on `survivalVideoTask`.
                await previousToggleConnecting?.value
                await previousHoldConnecting?.value
                _ = await previousSurvivalConnecting?.value
                await previousICERestartConnecting?.value
                await previousAnswerConnecting?.value
                await previousCameraSwitchConnecting?.value
                guard let self else { return }
                // Phase 2 fix — Bug 2: wait for local media transceivers before
                // createAnswer (called concurrently with emitCallJoin).
                await self.localMediaTask?.value
                guard let answer = await self.webRTCService.createAnswer(from: sdp) else {
                    guard self.currentCallId == callId else { return }
                    // Local SDP generation failure is invisible to the peer — without
                    // this signal the caller sits in .connecting/.ringing until the
                    // gateway's CallCleanupService cron reaps the zombie (~60s).
                    MessageSocketManager.shared.emitCallEnd(callId: callId)
                    self.failCall("Failed to create SDP answer")
                    return
                }
                guard self.currentCallId == callId else {
                    Logger.calls.info("[CALL] late-offer answer discarded: call ended during createAnswer")
                    return
                }
                await self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                Logger.calls.info("SDP answer created from late offer for call: \(callId)")
            }

        case .connected, .reconnecting:
            // §4.2 — mid-call renegotiation (the peer's A/V switch, or an ICE
            // restart it initiated). Previously this fell into `default` and was
            // DROPPED, leaving the peer's newly-enabled video one-way. Apply the
            // offer in place and answer it; the perfect-negotiation glare guard
            // in the client handles a simultaneous local offer.
            //
            // Audit finding — this used to call createAnswer() directly here,
            // unserialized against videoToggleTask/holdVideoTask/survivalVideoTask/
            // iceRestartTask: a peer offer landing while a local hold/toggle/ICE
            // restart is mid-createOffer() could run createAnswer() concurrently on
            // the same RTCPeerConnection. Chained onto `signalOfferAnswerTask` — see
            // the doc-comment on `survivalVideoTask`.
            let previousToggle = videoToggleTask
            let previousHold = holdVideoTask
            let previousSurvival = survivalVideoTask
            let previousICERestart = iceRestartTask
            let previousAnswer = signalOfferAnswerTask
            let previousCameraSwitch = cameraSwitchTask
            signalOfferAnswerTask = Task { [weak self] in
                await previousToggle?.value
                await previousHold?.value
                _ = await previousSurvival?.value
                await previousICERestart?.value
                await previousAnswer?.value
                await previousCameraSwitch?.value
                guard let self else { return }
                guard let answer = await self.webRTCService.createAnswer(from: sdp) else {
                    guard self.currentCallId == callId else { return }
                    Logger.calls.error("Failed to answer mid-call renegotiation offer for call: \(callId)")
                    return
                }
                guard self.currentCallId == callId else {
                    Logger.calls.info("[CALL] renegotiation answer discarded: call ended during createAnswer")
                    return
                }
                await self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                Logger.calls.info("Renegotiation answer sent for call: \(callId)")
            }

        default:
            Logger.calls.warning("Signal offer received in unexpected state: \(String(describing: self.callState))")
        }
    }

    // MARK: - Reliable call:join (incoming paths)

    /// [Fix 2026-07-02] Reliable `call:join` — replaces the fire-and-forget
    /// `emitCallJoin` on BOTH incoming-call paths.
    ///
    /// On a VoIP-push cold start (locked phone, answer from the CallKit lock
    /// screen) no view is mounted, so `connect()` — only triggered by
    /// RootView/ConversationView appearing in the foreground — has never run:
    /// the socket is nil and `socket?.emit("call:join")` vanishes. The gateway
    /// never creates our CallParticipant, then rejects every `call:signal` we
    /// send ("Sender not a participant") and the caller times out to `missed`
    /// even though the user answered (observed in prod, callIds
    /// 6a461091/6a46110c, 2026-07-02). The P1-30 rejoin net doesn't cover this:
    /// the FIRST connection never fires `didReconnect` (`hadPreviousConnection`).
    ///
    /// Strategy: force `connect()` when needed, wait for `isConnected`
    /// (200 ms poll, 30 s budget — under the 45 s ring), then ACK-aware
    /// `call:join` with one retry. Gateway-side joinCall is idempotent, so a
    /// duplicate join from the foreground path is harmless.
    private func joinCallRoomReliably(callId: String) {
        callJoinTask?.cancel()
        callJoinTask = Task { @MainActor [weak self] in
            let socket = MessageSocketManager.shared
            if !socket.isConnected {
                Logger.calls.warning("[CALL_JOIN] socket not connected — forcing connect() (callId=\(callId))")
                socket.connect()
            }
            var waitedNs: UInt64 = 0
            while !socket.isConnected && waitedNs < 30_000_000_000 && !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 200_000_000)
                waitedNs += 200_000_000
            }
            guard let self, !Task.isCancelled else { return }
            guard self.currentCallId == callId, self.callState.isActive else { return }
            guard socket.isConnected else {
                Logger.calls.error("[CALL_JOIN] socket still not connected after 30s — join impossible (callId=\(callId))")
                return
            }
            var joined = await socket.emitCallJoinWithAck(callId: callId)
            if !joined, !Task.isCancelled, self.currentCallId == callId, self.callState.isActive {
                Logger.calls.warning("[CALL_JOIN] call:join ACK failed — retrying once (callId=\(callId))")
                joined = await socket.emitCallJoinWithAck(callId: callId)
            }
            Logger.calls.info("[CALL_JOIN] call:join \(joined ? "ACKed" : "NOT ACKed") (callId=\(callId))")
        }
    }

    // MARK: - Answer Call

    func answerCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        // Micro absolument requis pour répondre. Sur le chemin in-app,
        // `IncomingCallView` a déjà demandé la permission avant d'afficher
        // Accepter/Refuser ; sur le chemin CallKit, l'acceptation vient de
        // l'UI système et rien ne peut être demandé en amont — on tranche donc
        // ici. Sans micro, l'appel se connecterait muet : on raccroche tout de
        // suite avec un renvoi vers les Réglages, plutôt que de laisser
        // l'appelant parler dans le vide.
        guard MediaPermissionState.microphone.isUsable else {
            Logger.calls.warning("[CALL] answer refused: microphone permission missing — ending call")
            FeedbackToastManager.shared.showError(
                MediaPermissionCoordinator.deniedMessage(for: .microphone)
            ) { MediaPermissionCoordinator.openSettings() }
            endCall()
            return
        }

        // CALL-FIX 2026-06-06 — stop the incoming ringtone the INSTANT the user
        // accepts, not at .connected (which is seconds later after ICE). Otherwise
        // the ringtone keeps playing through the connecting phase.
        ringbackPlayer.stop()
        ringbackPlayer.stopRingtone()

        analyticsNegotiationStartDate = Date()
        callState = .connecting
        // Audio session is configured at peer-connection setup (handleIncoming…),
        // not here — CallKit drives activation via provider:didActivate:.

        // Guard behind `callUsesCallKit`: a foreground in-app call (or iOS-app-on-Mac)
        // never calls `reportNewIncomingCall`, so requesting CXAnswerCallAction for its
        // UUID is guaranteed to fail (CallKit never heard of it) — same rationale as
        // the `callUsesCallKit` guard on `toggleMute()`.
        if let uuid = activeCallUUID, callUsesCallKit {
            let answerAction = CXAnswerCallAction(call: uuid)
            let transaction = CXTransaction(action: answerAction)
            callController.request(transaction) { error in
                if let error { Logger.calls.error("CallKit answer failed: \(error.localizedDescription)") }
            }
        }

        if let remoteOffer = pendingRemoteOffer {
            // SDP offer already received while ringing — create answer immediately.
            // Audit finding — this called webRTCService.createAnswer() directly,
            // unserialized against the videoToggleTask/holdVideoTask/survivalVideoTask/
            // iceRestartTask family: a foreground answer landing while a local
            // hold/toggle/ICE-restart is mid-createOffer() could run createAnswer()
            // concurrently on the same RTCPeerConnection. Chained onto
            // `signalOfferAnswerTask` — see the doc-comment on `survivalVideoTask`.
            let previousToggle = videoToggleTask
            let previousHold = holdVideoTask
            let previousSurvival = survivalVideoTask
            let previousICERestart = iceRestartTask
            let previousAnswer = signalOfferAnswerTask
            let previousCameraSwitch = cameraSwitchTask
            signalOfferAnswerTask = Task { [weak self] in
                await previousToggle?.value
                await previousHold?.value
                _ = await previousSurvival?.value
                await previousICERestart?.value
                await previousAnswer?.value
                await previousCameraSwitch?.value
                guard let self else { return }
                // Phase 2 fix — Bug 2: wait for local media transceivers
                // (emitCallJoin is now decoupled from startLocalMedia).
                await self.localMediaTask?.value
                guard let answer = await self.webRTCService.createAnswer(from: remoteOffer) else {
                    guard self.currentCallId == callId else { return }
                    // Local SDP generation failure is invisible to the peer — without
                    // this signal the caller sits in .connecting/.ringing until the
                    // gateway's CallCleanupService cron reaps the zombie (~60s).
                    MessageSocketManager.shared.emitCallEnd(callId: callId)
                    self.failCall("Failed to create SDP answer")
                    return
                }
                guard self.currentCallId == callId else {
                    Logger.calls.info("[CALL] buffered-offer answer discarded: call ended during createAnswer")
                    return
                }
                await self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                self.pendingRemoteOffer = nil
                Logger.calls.info("Call answered with buffered SDP offer: \(callId)")
            }
        } else {
            // SDP offer not yet received — wait for it via handleSignalOffer with timeout
            Logger.calls.info("Call answered but SDP offer not yet received, waiting: \(callId)")
            scheduleSdpOfferTimeout(callId: callId)
        }

        HapticFeedback.success()
    }

    /// Arms the "peer never sent an SDP offer" watchdog shared by `answerCall()`
    /// and `answerCallReady()` — both enter `.connecting` before the offer has
    /// arrived and must proactively fail (and notify the gateway) instead of
    /// hanging until the cron reaper eventually cleans up the zombie call.
    private func scheduleSdpOfferTimeout(callId: String) {
        sdpOfferTimeoutTask?.cancel()
        sdpOfferTimeoutTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.sdpOfferTimeoutSeconds))
            guard let self, !Task.isCancelled else { return }
            guard case .connecting = self.callState, self.currentCallId == callId else { return }
            Logger.calls.error("SDP offer timeout for call: \(callId)")
            // The peer is still waiting on an answer that will never come —
            // tell the gateway now instead of leaving it to the cron reaper.
            MessageSocketManager.shared.emitCallEnd(callId: callId)
            self.failCall(String(localized: "call.error.timeout"))
        }
    }

    /// Async SDP+media setup kicked off by `CXAnswerCallAction`. As of the
    /// [Fix 2026-07-02]/[Fix 2026-07-03] hold-and-settle model, the action is
    /// NOT fulfilled synchronously here: `provider(_:perform: CXAnswerCallAction)`
    /// holds it via `holdPendingAnswerAction` (so CallKit's callee elapsed-timer
    /// doesn't start before the connection exists) and this method settles it
    /// later — fulfilled in `transitionToConnected`, failed on pre-connect
    /// teardown, or fulfilled by the 10s safety net — never inline here. A
    /// `createAnswer` failure in this method tears the call down via
    /// `endCallInternal`/`failCall`, which routes back to `settlePendingAnswerAction`
    /// rather than calling `action.fail()` directly.
    func answerCallReady() async {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        // Same guard as `answerCall()` — on THIS path the acceptance came from
        // CallKit's system UI (lock screen, Dynamic Island, CarPlay, AirPods),
        // so nothing could be requested upstream either. Without it, a call
        // answered via CallKit with the microphone denied/revoked connects
        // silently muted: no toast, no Settings redirect, no hangup — the
        // caller just talks into silence. Routed through `failCall()` rather
        // than `endCall()`/`endCallInternal()` directly because a
        // `CXAnswerCallAction` is already held (`holdPendingAnswerAction`) and
        // must be resolved via `settlePendingAnswerAction`, which `failCall()`
        // reaches through `endCallInternal`.
        guard MediaPermissionState.microphone.isUsable else {
            Logger.calls.warning("[CALL] CallKit answer refused: microphone permission missing — ending call")
            FeedbackToastManager.shared.showError(
                MediaPermissionCoordinator.deniedMessage(for: .microphone)
            ) { MediaPermissionCoordinator.openSettings() }
            failCall("Microphone permission missing")
            return
        }

        analyticsNegotiationStartDate = Date()
        callState = .connecting

        if let remoteOffer = pendingRemoteOffer {
            self.pendingRemoteOffer = nil
            // Audit finding — this called webRTCService.createAnswer() directly,
            // unserialized against the videoToggleTask/holdVideoTask/survivalVideoTask/
            // iceRestartTask family: a CallKit answer landing while a local
            // hold/toggle/ICE-restart is mid-createOffer() could run createAnswer()
            // concurrently on the same RTCPeerConnection — a race that can bake a
            // wrong transceiver direction into the SDP answer, producing a
            // one-way/silent-video call. Chained onto `signalOfferAnswerTask` —
            // see the doc-comment on `survivalVideoTask`.
            let previousToggle = videoToggleTask
            let previousHold = holdVideoTask
            let previousSurvival = survivalVideoTask
            let previousICERestart = iceRestartTask
            let previousAnswer = signalOfferAnswerTask
            let previousCameraSwitch = cameraSwitchTask
            let answerTask = Task { [weak self] in
                await previousToggle?.value
                await previousHold?.value
                _ = await previousSurvival?.value
                await previousICERestart?.value
                await previousAnswer?.value
                await previousCameraSwitch?.value
                guard let self else { return }
                // Phase 2 fix — Bug 2: wait for local media transceivers before
                // createAnswer. CallKit gives ample time for CXAnswerCallAction
                // (10s+), so awaiting camera/mic warmup here is safe.
                await self.localMediaTask?.value
                guard let answer = await self.webRTCService.createAnswer(from: remoteOffer) else {
                    guard self.currentCallId == callId else { return }
                    // Local SDP generation failure is invisible to the peer — without
                    // this signal the caller sits in .connecting/.ringing until the
                    // gateway's CallCleanupService cron reaps the zombie (~60s).
                    MessageSocketManager.shared.emitCallEnd(callId: callId)
                    self.failCall("Failed to create SDP answer")
                    return
                }
                guard self.currentCallId == callId else {
                    Logger.calls.info("[CALL] CallKit answer discarded: call ended during createAnswer")
                    return
                }
                // PERF-004: await the gateway ACK (3s) so when answerCallReady
                // returns, the CXAnswerCallAction fulfill is paired with an SDP
                // answer that has actually been relayed to the peer.
                await self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                Logger.calls.info("Call answered (CallKit) with buffered SDP offer: \(callId)")
            }
            signalOfferAnswerTask = answerTask
            await answerTask.value
        } else {
            Logger.calls.info("Call answered (CallKit), awaiting SDP offer: \(callId)")
            scheduleSdpOfferTimeout(callId: callId)
        }

        HapticFeedback.success()
    }

    // MARK: - Reject Call

    func rejectCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, remoteUserId != nil else { return }

        // CALL-FIX 2026-06-06 — stop the ringtone the INSTANT the user declines.
        ringbackPlayer.stop()
        ringbackPlayer.stopRingtone()

        emitCallReject(callId: callId)

        // Same rationale as answerCall(): a foreground/Mac call never reported to
        // CallKit must not fire a doomed-to-fail CXEndCallAction.
        if let uuid = activeCallUUID, callUsesCallKit {
            let endAction = CXEndCallAction(call: uuid)
            callController.request(CXTransaction(action: endAction)) { error in
                if let error { Logger.calls.error("CallKit reject failed: \(error.localizedDescription)") }
            }
        }

        endCallInternal(reason: .rejected)
        HapticFeedback.error()
        Logger.calls.info("Call rejected: \(callId)")
    }

    // MARK: - End Call

    /// [Chaos-test prod 2026-07-02, EXIGENCE №1] A local hang-up that never
    /// reaches the gateway leaves the PEER in a zombie call: the server keeps
    /// the CallSession active, keeps accepting the peer's re-joins, and never
    /// broadcasts participant-left — the peer only dies ~48s later on its own
    /// watchdogs (proven from prod logs: zero call:end received in the window).
    /// Deferred here + replayed by the connectionState observer when the
    /// hang-up happens during a signaling outage; the gateway end handler is
    /// idempotent and resolves pre-answer ends to `missed` (C3/C4).
    /// Deferred call-teardown reconciliations — one entry per call whose
    /// `call:end`/`call:reject` needs replaying once the socket reconnects.
    /// An ARRAY, not a single scalar slot: `pendingIncomingCall` had the
    /// exact same class of bug — a single slot silently overwritten by a
    /// second caller — fixed at `rejectSupersededPendingCall` (Vague 87, see
    /// its doc comment below). This slot never got the equivalent fix: a
    /// user on call A who ALSO hangs up/declines a second call B while the
    /// socket is down needs BOTH replayed on reconnect, not just the last
    /// write's callId (audit gateway-calls 2026-08-15).
    /// `reason == "rejected"` marks a DECLINE — the replay must preserve it,
    /// or it resurrects the `missed` mislabel (arc reject 2026-07-12).
    private var pendingEndReconciliations: [(callId: String, reason: String?)] = []

    /// Records (or refreshes) `callId`'s pending reconciliation without
    /// dropping any OTHER call's still-pending entry.
    private func armPendingEndReconciliation(callId: String, reason: String?) {
        pendingEndReconciliations.removeAll { $0.callId == callId }
        pendingEndReconciliations.append((callId: callId, reason: reason))
    }

    private func emitCallEndReliably(callId: String) {
        guard MessageSocketManager.shared.isConnected else {
            armPendingEndReconciliation(callId: callId, reason: nil)
            Logger.calls.warning("call:end deferred — socket down, will reconcile on reconnect (callId=\(callId))")
            return
        }
        Task { [weak self] in
            let acked = await MessageSocketManager.shared.emitCallEndWithAck(callId: callId)
            if !acked {
                MessageSocketManager.shared.emitCallEnd(callId: callId)
                // [Chaos-test 2, callId 6a4690a2…] An unacked end during churn
                // means the socket LOOKED up but the emit may never have
                // materialised server-side (the CallSession decayed to
                // failed/91s via GC instead of missed). Remember it and replay
                // on the next connect — the gateway end handler is idempotent,
                // a duplicate is a logged no-op.
                self?.armPendingEndReconciliation(callId: callId, reason: nil)
                Logger.calls.warning("call:end ACK failed pour \(callId) — fallback émis + réconciliation armée pour le prochain connect")
            }
        }
    }

    func endCall() {
        guard callState.isActive else { return }

        // Refus lock-screen (arc reject 2026-07-12) : un `CXEndCallAction` sur
        // un entrant PRÉ-décroché est le bouton « Refuser » de CallKit — le
        // seul chemin de refus d'un appel reçu en background. Il aboutit ici,
        // pas dans rejectCall() : sans cette branche, l'end part sans raison,
        // le gateway le résout `missed` et notifie « appel manqué » celui qui
        // vient de refuser (exactement le bug corrigé sur les autres chemins).
        let isDecliningIncoming: Bool = {
            if case .ringing(isOutgoing: false) = callState { return true }
            return false
        }()

        // Le second guard historique (`guard let callId = currentCallId`)
        // retournait early si l'ACK call:initiate n'avait pas encore
        // atterri — laissant `activeCallUUID` non-cleared et le Task de
        // setup tournant pour rien. Or CallKit peut fire `CXEndCallAction`
        // AVANT l'ACK (cas du simulateur iOS 18+ qui disconnect les
        // hosted calls « because there wont be a UI to host the call »,
        // mais aussi en prod sur certaines race conditions). On rend les
        // identifiants OPTIONNELS et on garantit `endCallInternal` dans
        // tous les cas pour nettoyer l'état local + cancel les Tasks.
        let callId = currentCallId

        // Phase finale — émettre `call:end` avec ACK garanti pour que le
        // gateway broadcast `call:ended` au peer. Avant : emit fire-and-forget
        // sans confirmation → si le socket était saturé / déconnecté au
        // moment du raccroché, l'appelé restait bloqué en `.connecting` /
        // `.connected` indéfiniment sans aucun signal d'arrêt. On utilise
        // `emitCallEndWithAck` (3s timeout, retry interne au gateway) en
        // Task détaché : ne bloque pas le cleanup local mais garantit que
        // le gateway sait que l'appel est fini.
        // Raccroché instantané côté pair (parité WhatsApp) : `bye` in-band sur
        // le data channel P2P — arrive en millisecondes, sans dépendre des
        // allers-retours DB du gateway avant son fanout `call:ended`. Émis
        // AVANT `endCallInternal` (qui ferme la peer connection). No-op si le
        // channel n'est pas ouvert ; le chemin socket ci-dessous reste
        // l'autorité et le filet de sécurité.
        webRTCService.sendHangupBye()

        if let callId {
            if isDecliningIncoming {
                // Mêmes garanties que rejectCall() (fire-and-forget) : le refus
                // porte reason=rejected, l'ACK/réconciliation reste le filet du
                // chemin raccroché.
                emitCallReject(callId: callId)
            } else {
                emitCallEndReliably(callId: callId)
            }
        }

        // H1 — rendre le teardown local atomique vis-à-vis de CallKit. On capture
        // l'UUID, puis on exécute `endCallInternal` EN PREMIER pour que `callState`
        // soit `.ended` AVANT de demander à CallKit de raccrocher. Le loop-back
        // `CXEndCallAction` ré-entre dans `endCall()`, et son `guard callState.isActive`
        // (en tête de méthode) rejette alors de façon fiable la ré-entrée — pas de
        // double teardown. (`endCallInternal` nil-e `activeCallUUID`, d'où la capture
        // locale ci-dessus.)
        let endUUID = activeCallUUID
        let endUsedCallKit = callUsesCallKit
        endCallInternal(reason: isDecliningIncoming ? .rejected : .local)
        if let endUUID, endUsedCallKit {
            let endAction = CXEndCallAction(call: endUUID)
            callController.request(CXTransaction(action: endAction)) { error in
                if let error { Logger.calls.error("CallKit end failed: \(error.localizedDescription)") }
            }
        }
        Logger.calls.info("Call ended by local: \(callId ?? "(pre-ACK)")")
    }

    // MARK: - System Picture-in-Picture

    #if canImport(WebRTC)
    private let pip: PiPCallProviding = PiPCallController.shared
    #else
    private let pip: PiPCallProviding = NoOpPiPController()
    #endif
    /// `true` entre un tap « revenir » (restore) et la fermeture effective du PiP,
    /// pour distinguer ce chemin de la croix système (qui retombe sur la pilule).
    private var pipRestoring = false
    private weak var pipConfiguredTrack: AnyObject?
    private weak var pipConfiguredSource: UIView?
    /// Mode d'affichage en vigueur au démarrage de la fenêtre PiP, restauré à sa
    /// fermeture. Poser `.pip` inconditionnellement dégradait en pilule un appel
    /// qui était plein écran (retour dans l'app) ou en bulle (repli manuel).
    ///
    /// `nil` = aucune fenêtre n'a démarré. Indispensable :
    /// `failedToStartPictureInPictureWithError` appelle `onStop` sans qu'`onStart`
    /// ait tiré, et une valeur persistante y ferait restaurer le mode du PiP
    /// PRÉCÉDENT.
    private var pipDisplayModeAtStart: CallDisplayMode?

    /// L'UI d'appel doit rendre le layout vidéo dès qu'un flux est visible :
    /// caméra locale active OU vidéo distante reçue (escalade unilatérale du
    /// correspondant pendant un appel audio). Voir
    /// `CallReliabilityPolicy.videoLayoutActive`.
    var isVideoUIActive: Bool {
        CallReliabilityPolicy.videoLayoutActive(
            localVideoEnabled: isVideoEnabled,
            hasRemoteVideoTrack: hasRemoteVideoTrack,
            remoteVideoEnabled: isRemoteVideoEnabled
        )
    }

    /// Le PiP vidéo système rend le flux DISTANT : il peut s'activer dès que le
    /// track distant est présent et la caméra distante allumée, sur un appareil
    /// compatible (≠ iOS-app-on-Mac) — même si la caméra locale est coupée
    /// (escalade vidéo unilatérale d'un appel audio).
    var canActivateSystemPiP: Bool {
        hasRemoteVideoTrack && isRemoteVideoEnabled && pip.isPiPSupported
    }

    /// Configure le PiP système pour cet appel (appelé par la vue avec la
    /// `sourceView` vidéo inline). No-op si l'appel n'est pas éligible.
    func attachSystemPiP(sourceView: UIView) {
        guard canActivateSystemPiP, let track = remoteVideoTrack else { return }
        let trackObject = track as AnyObject
        // Idempotence : `configure()` reconstruit le controller AVKit — et commence
        // par `tearDown()`, donc `stopPictureInPicture()`. Deux ancres coexistent
        // (plein écran + mode réduit) et `PiPSourceAnchor` n'a aucune propriété
        // stockée : chaque bascule de mode monte une nouvelle vue, donc l'identité
        // de la sourceView change à chaque fois. Sans le refus pendant un PiP actif,
        // la bascule tuerait la fenêtre en cours. Cf. `CallPiPPolicy`.
        guard CallPiPPolicy.shouldReconfigure(
            isPiPActive: isSystemPiPActive,
            sourceChanged: pipConfiguredSource !== sourceView,
            trackChanged: pipConfiguredTrack !== trackObject
        ) else { return }
        pipConfiguredSource = sourceView
        pipConfiguredTrack = trackObject
        pip.configure(
            sourceView: sourceView, remoteTrack: trackObject, autoStart: true,
            onStart: { [weak self] in
                guard let self else { return }
                self.pipDisplayModeAtStart = self.displayMode
                self.isSystemPiPActive = true
            },
            onRestoreUI: { [weak self] in
                self?.pipRestoring = true
                self?.displayMode = .fullScreen
            },
            onStop: { [weak self] in
                guard let self else { return }
                self.isSystemPiPActive = false
                let restored = CallPiPPolicy.displayModeAfterStop(
                    callIsActive: self.callState.isActive,
                    isRestoringUI: self.pipRestoring,
                    modeAtStart: self.pipDisplayModeAtStart
                )
                self.pipRestoring = false
                self.pipDisplayModeAtStart = nil
                // Ré-armement AVANT de toucher `displayMode` : `PiPSourceAnchor`
                // n'a pas de propriété stockée, `updateUIView` est son unique
                // déclencheur, et c'est le changement de mode qui le provoque.
                // Sans ce reset, la garde ci-dessus resterait épinglée sur une
                // ancre morte et aucun second PiP ne pourrait plus être configuré.
                self.pipConfiguredSource = nil
                self.pipConfiguredTrack = nil
                if let restored { self.displayMode = restored }
            }
        )
        // Aligne le framerate sur l'état thermique courant dès la config (le
        // handler thermal ignore les changements hors-appel → évite un héritage
        // périmé entre deux appels).
        pip.setMaxFrameRate(pipFrameRate(for: ProcessInfo.processInfo.thermalState))
    }

    /// Démarre le PiP manuellement (bouton). No-op si impossible/déjà actif.
    func startSystemPiP() { pip.start() }

    /// Quitte le PiP manuellement (bouton, second tap). No-op si aucun PiP
    /// n'est actif. Symétrique de `startSystemPiP()` — sans ce wrapper, le
    /// bouton in-app n'avait aucun moyen de fermer une fenêtre PiP déjà
    /// ouverte hormis le chrome système de la fenêtre flottante elle-même.
    func stopSystemPiP() { pip.stop() }

    /// Libère le PiP (fin d'appel / éligibilité perdue).
    func detachSystemPiP() {
        pip.tearDown()
        isSystemPiPActive = false
        pipRestoring = false
        pipDisplayModeAtStart = nil
        pipConfiguredTrack = nil
        pipConfiguredSource = nil
    }

    /// Framerate cible du PiP selon l'état thermique (vignette petite → throttle
    /// agressif sous stress). Partagé par la config et le handler thermal.
    private func pipFrameRate(for state: ProcessInfo.ThermalState) -> Int {
        switch state {
        case .critical: return QualityThresholds.pipFrameRateCritical
        case .serious: return QualityThresholds.pipFrameRateSerious
        default: return QualityThresholds.pipFrameRateDefault
        }
    }

    // MARK: - Media Controls

    /// `reportToCallKit` is `false` only when this call originates FROM
    /// CallKit itself (`CXSetMutedCallAction` delegate handler, e.g. Apple
    /// Watch / lock-screen / CarPlay mute) — in that case CallKit's state
    /// already reflects `isMuted`, and resubmitting a `CXSetMutedCallAction`
    /// transaction back to it would be an avoidable no-op round-trip
    /// answering CallKit's own notification. All other call sites (the
    /// in-app mute button) keep the default and DO report to CallKit, so its
    /// system UI (Watch, lock screen, CarPlay) stays in sync.
    func toggleMute(reportToCallKit: Bool = true) {
        // Audit P1-13 — keep optimistic UX (instant local flip) but rollback
        // local state + WebRTC if CallKit refuses the transaction. Without
        // the rollback, the app's `isMuted` and the WebRTC track were
        // permanently out of sync with CallKit's system mute UI — once
        // diverged, only a call hangup recovered it.
        isMuted.toggle()
        webRTCService.muteAudio(isMuted)
        // Broadcast the new mute state so the remote peer can update its
        // "muted" indicator. This must fire regardless of CallKit path (the
        // guard below returns early for Mac / foreground in-app calls).
        if let callId = currentCallId {
            MessageSocketManager.shared.emitCallToggleAudio(callId: callId, enabled: !isMuted)
        }

        guard reportToCallKit else {
            HapticFeedback.light()
            return
        }

        // CALL-FIX 2026-06-06 (macOS) — `CXSetMutedCallAction` fails on iOS-app-on-Mac
        // (CallKit requesttransaction error 4) and the rollback below then UNDOES the
        // mute → the mute button never sticks. On Mac the WebRTC track toggle above IS
        // the mute (no CallKit system UI), so short-circuit before the transaction.
        guard let uuid = activeCallUUID, callUsesCallKit else {
            // No CallKit (Mac / foreground in-app call) — the WebRTC track toggle
            // above IS the mute; skip CXSetMutedCallAction (it fails + rolls back).
            HapticFeedback.light()
            return
        }
        let muteAction = CXSetMutedCallAction(call: uuid, muted: isMuted)
        callController.request(CXTransaction(action: muteAction)) { error in
            if let error {
                // CALL-FIX 2026-06-06 — do NOT roll back the WebRTC mute when CallKit
                // refuses the transaction (CXSetMutedCallAction error 4). The WebRTC
                // track toggle above IS the real mute; the old rollback UN-muted the
                // user against their intent ("impossible de mute — ça fall back").
                // Keep the mute; CallKit's system UI may briefly desync but the audio
                // is correctly muted.
                Logger.calls.error("CallKit mute transaction failed (keeping WebRTC mute): \(error.localizedDescription)")
            }
        }

        HapticFeedback.light()
    }

    func toggleSpeaker() {
        // §7.8 — optimistic speaker toggle, corrected on failure. Same class of
        // bug already fixed for switchCamera()/selectCamera(id:) above:
        // `overrideOutputAudioPort` can throw (e.g. `insufficientPriority` when
        // a higher-priority route — a connected Bluetooth headset — is active),
        // and without a revert `isSpeaker` stays desynced from the real audio
        // route: the button renders "on" while audio keeps playing through
        // Bluetooth, and a second tap becomes a no-op relative to the actual
        // route since it flips back to a state that was never truly applied.
        let previousSpeaker = isSpeaker
        isSpeaker.toggle()
        if !applySpeakerRoute() {
            isSpeaker = previousSpeaker
        }
        HapticFeedback.light()
    }

    /// §5.4 — mid-call audio↔video switch (FaceTime-style asymmetric). Acquires/
    /// releases the camera, attaches/detaches it on the reserved video
    /// transceiver and, when the SDP direction changes, drives a renegotiation
    /// (createOffer → emit; the peer answers via handleSignalOffer's connected
    /// case). Replaces the old track.enabled flip, which left the upgrade
    /// invisible to the peer (no transceiver / no renegotiation).
    func toggleVideo() {
        let previousToggle = videoToggleTask
        let previousHold = holdVideoTask
        let previousSurvival = survivalVideoTask
        let previousICERestart = iceRestartTask
        let previousAnswer = signalOfferAnswerTask
        let previousCameraSwitch = cameraSwitchTask
        videoToggleTask?.cancel()
        let target = !isVideoEnabled
        // Optimistic update: reflect intent immediately so rapid double-taps
        // read the new isVideoEnabled value and don't launch a duplicate toggle.
        // The tracked videoToggleTask ensures the later intent always wins:
        // if a second tap cancels this Task, the cancelled path does not update
        // any state — the second Task's result is authoritative.
        isVideoEnabled = target
        videoToggleTask = Task { @MainActor [weak self] in
            // Serialize on every other in-flight video-transition path before
            // starting ours: `cancel()` above only replaces a same-kind toggle and
            // is cooperative — upgradeToVideo/downgradeFromVideo never observe it
            // mid-flight (they await stopCapture/startCapture) — so without waiting
            // on hold, survival, and ICE restart too, a manual toggle landing
            // mid-hold/mid-survival-recovery/mid-ICE-restart could run two
            // concurrent camera/transceiver/createOffer() actuations and corrupt
            // state (audit finding — ICE restart used to be excluded from this
            // chain, see the doc-comment on `survivalVideoTask`).
            await previousToggle?.value
            await previousICERestart?.value
            await previousHold?.value
            _ = await previousSurvival?.value
            await previousAnswer?.value
            await previousCameraSwitch?.value
            guard let self, !Task.isCancelled else { return }
            // Audit finding (Vague 158): re-enabling video while CallKit holds the
            // call (cellular pre-emption) or the OS has suspended capture must NOT
            // actually acquire the camera / announce "camera active" to the peer —
            // mirrors the guard `applySurvivalVideoSend` already applies for the
            // automatic survival-recovery path. Without this, a hold→toggle-off→
            // toggle-on sequence (a normal double-tap while the CallKit hold banner
            // is up) called `upgradeToVideo()` unconditionally, starting capture and
            // renegotiating with the peer while the call is still on hold — exactly
            // the false "camera active" signal `applyCameraSuspension`'s doc-comment
            // and `applySurvivalVideoSend`'s guard both exist to prevent.
            // `isVideoEnabled` (already set to the new intent above) stays the
            // source of truth: `handleHold`'s unhold branch resumes video
            // automatically once the suspension lifts, so intent is never lost —
            // only the actuation is deferred.
            if target, self.isVideoSuspendedByHold || self.isVideoSuspendedByCaptureInterruption {
                FeedbackToastManager.shared.showError(
                    String(localized: "call.video.hold.blocked",
                           defaultValue: "Vidéo indisponible pendant la mise en attente de l'appel",
                           bundle: .main)
                )
                return
            }
            // Caméra jamais demandée : sans ce pré-flight, le prompt système
            // surgissait au beau milieu de `upgradeToVideo()` — l'utilisateur
            // voyait la vidéo « s'activer » puis retomber. On tranche avant.
            // Un refus est déjà annoncé par le `catch cameraPermissionDenied`
            // en aval, d'où `announcesRefusal: false` (pas deux toasts).
            if target, await MediaPermissionCoordinator.ensureCamera(announcesRefusal: false) == false {
                guard !Task.isCancelled else { return }
                self.isVideoEnabled = false
                // Same reset as the success path below and toggleVideo's own
                // catch branches: isVideoEnabled = false alone only clears
                // survival state on the controller's NEXT quality tick, and
                // handle() no-ops entirely while a suspend/resume transition
                // is already in flight — user intent (video refused) must win
                // immediately, not after that transition settles.
                self.videoSurvivalController.reset()
                FeedbackToastManager.shared.showError(
                    String(localized: "call.video.permission.denied",
                           defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                           bundle: .main)
                ) { MediaPermissionCoordinator.openSettings() }
                return
            }
            do {
                let needsRenegotiation: Bool
                if target {
                    needsRenegotiation = try await self.webRTCService.upgradeToVideo()
                } else {
                    needsRenegotiation = await self.webRTCService.downgradeFromVideo()
                }
                guard !Task.isCancelled else { return }
                self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                self.updateAudioSessionModeForCurrentVideoState()

                // User intent is authoritative: forget any survival state so the
                // controller never fights a manual toggle (and re-evaluates fresh).
                self.videoSurvivalController.reset()

                // Inform CallKit of the updated media type so the call appears
                // as audio or video in the lock screen, Recents, and Car Play.
                if let uuid = self.activeCallUUID, self.callUsesCallKit {
                    let update = CXCallUpdate()
                    update.hasVideo = target
                    self.callProvider.reportCall(with: uuid, updated: update)
                }

                // P0-3 — tell the peer so it shows our avatar placeholder instead
                // of a frozen last frame. Gateway broadcasts to the other peer only.
                if let callId = self.currentCallId {
                    MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: target)
                }

                // Renegotiate so the peer actually starts/stops receiving our
                // video stream (a track.enabled flip alone never reaches it).
                // Guard post-await: if the call ended while createOffer() was
                // building the SDP, currentCallId is nil — don't emit a stale
                // offer for a dead call (mirrors applySurvivalVideoSend).
                if needsRenegotiation,
                   let callId = self.currentCallId,
                   let userId = self.remoteUserId,
                   let offer = await self.webRTCService.createOffer(),
                   self.currentCallId == callId {
                    self.emitCallOffer(callId: callId, toUserId: userId, isVideo: target, sdp: offer)
                    Logger.calls.info("[CALL] A/V switch renegotiation offer sent (video=\(target))")
                }
                HapticFeedback.light()
            } catch WebRTCError.cameraPermissionDenied {
                guard !Task.isCancelled else { return }
                Logger.calls.error("toggleVideo failed: camera permission denied — prompting settings redirect")
                self.isVideoEnabled = false
                self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                // Audit finding (Vague 169) — mirrors handleHold's unhold catches
                // (Vague 167/168) and this same function's success path above:
                // isVideoEnabled = false alone only clears survival state on the
                // controller's NEXT quality tick, and handle() no-ops entirely
                // while a suspend/resume transition is already in flight.
                self.videoSurvivalController.reset()
                // Show a tappable error so the user can open Settings to grant
                // camera access without ending the audio-only call. The toast's
                // tap action is the primary affordance; the message text says "tap"
                // so screen-reader users also know the toast is actionable.
                FeedbackToastManager.shared.showError(
                    String(localized: "call.video.permission.denied",
                           defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                           bundle: .main)
                ) {
                    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                    UIApplication.shared.open(url)
                }
            } catch {
                guard !Task.isCancelled else { return }
                Logger.calls.error("toggleVideo failed: \(error.localizedDescription)")
                self.isVideoEnabled = false
                self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                // Same reset as the cameraPermissionDenied catch just above —
                // any OTHER upgradeToVideo()/downgradeFromVideo() failure disables
                // video for the rest of the call just as surely, and owes the
                // survival controller the same immediate clear.
                self.videoSurvivalController.reset()
                FeedbackToastManager.shared.showError(String(localized: "call.video.enable.error", defaultValue: "Impossible d'activer la vidéo", bundle: .main))
            }
        }
    }

    func switchCamera() {
        // §7.7 — optimistic front/back tracking for mirroring. On iPhone/iPad a
        // flip alternates front↔back; on Mac switchCamera is usually a no-op so
        // the flag rarely matters there. Corrected on failure (hardware busy,
        // single-camera device) so the mirror flag never stays desynced from
        // the camera actually in use for the rest of the call.
        let previousFrontCamera = isUsingFrontCamera
        isUsingFrontCamera.toggle()
        HapticFeedback.light()

        // Serialize with every other in-flight video-transition/renegotiation path
        // — see the doc-comment on `cameraSwitchTask`/`survivalVideoTask`. Chained
        // (not cancelled) onto the previous cameraSwitchTask so a rapid double-flip
        // still applies both flips in order instead of dropping one.
        let previousToggle = videoToggleTask
        let previousHold = holdVideoTask
        let previousSurvival = survivalVideoTask
        let previousICERestart = iceRestartTask
        let previousAnswer = signalOfferAnswerTask
        let previousCameraSwitch = cameraSwitchTask
        cameraSwitchTask = Task { @MainActor [weak self] in
            await previousCameraSwitch?.value
            await previousToggle?.value
            await previousHold?.value
            _ = await previousSurvival?.value
            await previousICERestart?.value
            await previousAnswer?.value
            guard let self, !Task.isCancelled else { return }
            // Audit finding (Vague 159): mirrors the toggleVideo() guard
            // (Vague 158). A hold or a capture-interruption has RELEASED the
            // camera — flipping front/back here would call capturer.startCapture
            // and silently reacquire it (camera hardware + OS indicator turn
            // back on) even though the transceiver stays recvOnly and the peer
            // never sees the switch. Revert the optimistic mirror flag instead
            // of actuating; `handleHold`'s unhold branch restores the real
            // camera state once suspension lifts.
            //
            // L6-1 — `isVideoSuspended` is deliberately NOT part of this guard
            // any more: the survival layer FREEZES the encoder, it no longer
            // stops the capture. Keeping it here made flipping the camera INERT
            // for a whole degraded episode (a silent revert of the mirror flag),
            // for a camera that was running the entire time.
            if self.isVideoSuspendedByHold || self.isVideoSuspendedByCaptureInterruption {
                self.isUsingFrontCamera = previousFrontCamera
                return
            }
            let success = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                self.webRTCService.switchCamera { success in
                    continuation.resume(returning: success)
                }
            }
            guard !success else { return }
            self.isUsingFrontCamera = previousFrontCamera
        }
    }

    // §7.1 — Continuity / external camera picker. On iPhone the front/back flip
    // (`switchCamera`) is the right affordance; on Mac/iPad with named external
    // (Continuity / USB) cameras the UI offers this device picker instead.
    func refreshAvailableCameras() {
        availableCameras = webRTCService.availableCameras()
        if selectedCameraId == nil {
            selectedCameraId = availableCameras.first(where: { $0.facing == .front })?.id
                ?? availableCameras.first?.id
        }
    }

    func selectCamera(id: String) {
        guard id != selectedCameraId else { return }
        // §7.1/§7.7 — optimistic picker/mirroring state, corrected on failure
        // (camera busy, no matching capture format) so neither the picker
        // selection nor the self-preview mirror stays desynced from the
        // camera actually in use for the rest of the call. Mirrors the
        // revert-on-failure pattern already established for switchCamera().
        let previousSelectedCameraId = selectedCameraId
        let previousFrontCamera = isUsingFrontCamera
        selectedCameraId = id
        if let cam = availableCameras.first(where: { $0.id == id }) {
            // §7.7 — only the front camera is mirrored; external/back are not.
            isUsingFrontCamera = (cam.facing == .front)
        }
        HapticFeedback.light()

        // Serialize with every other in-flight video-transition/renegotiation path
        // — see the doc-comment on `cameraSwitchTask`/`survivalVideoTask`. Same
        // rationale as `switchCamera()`: this drives the same capturer.
        let previousToggle = videoToggleTask
        let previousHold = holdVideoTask
        let previousSurvival = survivalVideoTask
        let previousICERestart = iceRestartTask
        let previousAnswer = signalOfferAnswerTask
        let previousCameraSwitch = cameraSwitchTask
        cameraSwitchTask = Task { @MainActor [weak self] in
            await previousCameraSwitch?.value
            await previousToggle?.value
            await previousHold?.value
            _ = await previousSurvival?.value
            await previousICERestart?.value
            await previousAnswer?.value
            guard let self, !Task.isCancelled else { return }
            // Audit finding (Vague 159): same guard as switchCamera() above —
            // both drive the same capturer through the same OS-level suspension
            // state. L6-1 — and, for the same reason as its twin, WITHOUT the
            // survival freeze: a frozen encoder still owns a running camera.
            if self.isVideoSuspendedByHold || self.isVideoSuspendedByCaptureInterruption {
                self.selectedCameraId = previousSelectedCameraId
                self.isUsingFrontCamera = previousFrontCamera
                return
            }
            let success = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                self.webRTCService.switchToCamera(uniqueID: id) { success in
                    continuation.resume(returning: success)
                }
            }
            guard !success else { return }
            self.selectedCameraId = previousSelectedCameraId
            self.isUsingFrontCamera = previousFrontCamera
        }
    }

    /// Dernière valeur de `call:transcription-active` annoncée aux pairs.
    /// Évite de ré-émettre à chaque réconciliation — et surtout de renvoyer
    /// un signal quand c'est le PAIR qui vient de bouger.
    private var publishedListeningIntent = false

    /// Annonce aux pairs que ce device ÉCOUTE (panneau local ouvert) — jamais
    /// qu'il capture. La distinction est vitale : la capture démarre aussi
    /// pour servir un pair, donc l'annoncer depuis la capture faisait que deux
    /// devices s'entretenaient mutuellement (« l'autre est actif, je reste
    /// actif ») sans qu'aucun ne puisse plus s'arrêter. Piloté par le panneau,
    /// le signal reste la propriété du seul utilisateur local.
    private func publishListeningIntentIfChanged() {
        guard let callId = currentCallId else { return }
        let isListening = transcriptionService.isShowingOverlay
        guard isListening != publishedListeningIntent else { return }
        publishedListeningIntent = isListening
        MessageSocketManager.shared.emitCallTranscriptionActive(callId: callId, active: isListening)
    }

    /// Un participant vient d'entrer : le gateway ne rejoue PAS les
    /// `call:transcription-active` émis avant son arrivée. Sans ce renvoi, un
    /// arrivant ignorerait que quelqu'un lit déjà, ne capturerait donc pas, et
    /// resterait muet pour tout le monde alors que l'appel a des lecteurs.
    private func reannounceListeningIntent() {
        guard publishedListeningIntent, let callId = currentCallId else { return }
        MessageSocketManager.shared.emitCallTranscriptionActive(callId: callId, active: true)
    }

    /// **Réconcilie la capture locale avec l'écoute RÉELLE de l'appel** —
    /// le nom « toggle » est historique : ce n'est plus le panneau local seul
    /// qui décide. Un device ne transcrit que son PROPRE micro (jamais l'audio
    /// distant), donc lier la capture au seul panneau local faisait de celui
    /// qui active les sous-titres un pur ÉMETTEUR : le pair recevait tout, lui
    /// ne recevait rien tant que le pair n'avait pas activé de son côté. C'est
    /// exactement le symptôme rapporté (« il reçoit mes transcriptions, je ne
    /// reçois pas les siennes »). La règle vit dans
    /// `TranscriptionCapturePolicy` ; appeler cette méthode est idempotent.
    ///
    /// Appelée par les DEUX entrées d'écoute : le panneau local
    /// (`CallView.advanceCaptionsMode`) et le signal du pair
    /// (`call:transcription-active`).
    func toggleTranscription() {
        publishListeningIntentIfChanged()
        switch TranscriptionCapturePolicy.action(
            localPanelOpen: transcriptionService.isShowingOverlay,
            peerCaptionsActive: remoteTranscriptionActive,
            isCapturing: transcriptionService.isTranscribing
        ) {
        case .stop:
            transcriptionService.stopTranscribing()
            return
        case .none:
            return
        case .start:
            break
        }
        guard let callId = currentCallId else { return }
        let localUser = AuthManager.shared.currentUser
        let localLang = CallManager.preferredCallLanguage(for: localUser)
        let localUserId = localUser?.id ?? ""
        let localDisplayName = localUser?.displayName ?? localUser?.username ?? ""
        // Chemin P2P du journal : chaque segment final part aussi sur le data
        // channel WebRTC quand il est ouvert (no-op silencieux sinon — le
        // relais socket reste systématique et le pair fusionne par wireId).
        transcriptionService.sendPeerEntry = { [weak self] entry in
            self?.webRTCService.sendTranscriptEntry(entry)
        }
        Task { @MainActor [weak self] in
            guard let self else { return }
            if self.transcriptionService.permission != .authorized {
                _ = await self.transcriptionService.requestPermission()
            }
            // Audit gateway-calls (2026-08-15) — re-valider APRÈS l'await.
            // `requestPermission()` suspend sur l'alerte système de
            // reconnaissance vocale, que l'utilisateur peut laisser ouverte
            // aussi longtemps qu'il veut : l'appel peut se terminer (ou être
            // remplacé par un rappel) entre-temps. `endCallInternal` a alors
            // déjà passé `resetForCallEnd`, et démarrer ici installerait un
            // tap micro + un moteur on-device que PLUS RIEN n'arrête du reste
            // de la session (ni appel, ni CallView, ni appelant de
            // `stopTranscribing`), en estampillant `call:transcription-active`
            // et chaque segment du callId d'un appel mort. Même garde
            // d'identité que tous les autres chemins post-await de ce fichier
            // (handleRemoteAnswer, answerCallReady, scheduleICERestart) et que
            // `applyRecognitionResult` côté réception.
            guard self.currentCallId == callId, self.callState.isActive else {
                Logger.calls.info("toggleTranscription abandonné — appel plus actif après le prompt de permission (callId=\(callId))")
                return
            }
            self.transcriptionService.startTranscribing(
                callId: callId,
                localLanguage: localLang,
                localUserId: localUserId,
                localDisplayName: localDisplayName
            )
        }
    }

    var videoFilters: VideoFilterPipeline { webRTCService.videoFilters }
    var localVideoTrack: Any? { webRTCService.localVideoTrack }
    var remoteVideoTrack: Any? { webRTCService.remoteVideoTrack }

    // MARK: - Call Waiting (§11.15)

    func rejectPendingCall() {
        guard let pending = pendingIncomingCall else { return }
        // Refus du call-waiting : porte aussi reason=rejected et hérite du
        // différé socket-down via le helper (cf. emitCallReject).
        emitCallReject(callId: pending.callId)
        pendingIncomingCall = nil
        showCallWaitingBanner = false
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
    private func rejectSupersededPendingCall(replacingWithCallId newCallId: String) {
        guard let superseded = pendingIncomingCall, superseded.callId != newCallId else { return }
        emitCallReject(callId: superseded.callId)
        Logger.calls.info("Superseded waiting call ended: \(superseded.callId) (replaced by \(newCallId))")
    }

    /// Audit 2026-07-02 (bug 3) — the caller of the WAITING call hung up (or it
    /// was answered/force-ended elsewhere) before the user acted on the banner.
    /// Every terminal socket listener guards on `currentCallId` (the ACTIVE
    /// call) and early-returns for the waiting call's id — without this check
    /// the banner lingers until its 15s auto-dismiss and "End & Answer" would
    /// end the healthy active call to join one already torn down server-side.
    private func clearPendingIncomingCall(ifMatching callId: String) {
        guard pendingIncomingCall?.callId == callId else { return }
        pendingIncomingCall = nil
        showCallWaitingBanner = false
        if answeringPendingCallId == callId {
            answeringPendingCallId = nil
        }
        Logger.calls.info("Waiting call ended remotely — call-waiting banner dismissed (callId=\(callId))")
    }

    func endCurrentAndAnswerPending() {
        guard let pending = pendingIncomingCall else { return }
        showCallWaitingBanner = false
        pendingIncomingCall = nil
        answeringPendingCallId = pending.callId

        endCall()

        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.endAndAnswerPendingHandoffSeconds))
            guard let self else { return }
            // The waiting call may have been ended, answered elsewhere, or
            // replaced by a newer incoming call while we were asleep — only
            // answer if it's still the exact call the user acted on. `endCall()`
            // above unconditionally nils `pendingIncomingCall` as a side effect
            // (unrelated busy-banner cleanup), so this dedicated token — not
            // `pendingIncomingCall` — is the source of truth for revalidation.
            guard self.answeringPendingCallId == pending.callId else { return }
            self.answeringPendingCallId = nil
            self.handleIncomingCallNotification(
                callId: pending.callId,
                fromUserId: pending.fromUserId,
                fromUsername: pending.fromUsername,
                isVideo: pending.isVideo,
                iceServers: pending.iceServers,
                conversationId: pending.conversationId
            )
        }
    }

    // MARK: - Remote Events

    func handleRemoteAnswer(callId: String, sdp: SessionDescription, generation: Int = 0) {
        guard currentCallId == callId else { return }
        // §3.5 — drop answers from a stale negotiation epoch.
        guard acceptIncomingNegotiation(generation) else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            let success = await self.webRTCService.setRemoteDescription(sdp)
            guard self.currentCallId == callId else { return }
            // A peer connection without a remote description will never produce
            // media even if ICE connects — fail fast instead of letting the call
            // hang silently in `.offering` / `.connecting`.
            guard success else {
                Logger.calls.error("Failed to apply remote answer for call \(callId) — ending call")
                self.failCall(String(localized: "call.error.sdp"))
                return
            }
            // L'answer SDP = l'appelé a décroché : désarmer le cutoff 45s
            // "pas de réponse" (resté armé pendant .offering).
            self.cancelOutgoingRingTimeout()
            // Phase 1 fix E5: now that remote answer is applied, ICE
            // checking starts. Transition .offering → .connecting.
            // The single source of truth for `.connected` remains
            // webRTCServiceDidConnect (driven by ICE-connected) — we only
            // bridge .offering → .connecting here.
            if case .offering = self.callState {
                self.callState = .connecting
                // Audit P1-12 — surface the "Connecting…" state to CallKit
                // so the caller's system UI shows the connecting indicator
                // instead of staying frozen on "Calling…" until ICE
                // completes.
                if let uuid = self.activeCallUUID {
                    self.callProvider.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
                }
            }
            Logger.calls.info("Remote answer received for: \(callId), awaiting ICE connected")
        }
    }

    func handleRemoteICECandidate(callId: String, candidate: IceCandidate, generation: Int = 0) {
        guard currentCallId == callId else { return }
        // §3.5 — drop ICE candidates from a stale negotiation epoch (their
        // ufrag/pwd belong to a superseded negotiation and would never pair).
        guard acceptIncomingNegotiation(generation) else { return }
        webRTCService.addICECandidate(candidate)
    }

    func handleRemoteEnd(callId: String, rawReason: String? = nil) {
        // Dedup (idempotence testable — cf. CallReliabilityPolicy.shouldProcessRemoteEnd) :
        // le serveur peut émettre `call:ended` plusieurs fois (CXEndCallAction côté
        // peer + cleanup serveur, et depuis 2026-07-12 le broadcast REST end/leave),
        // tous routés vers ce handler via le publisher `callEnded`. On traite le
        // premier ; un doublon sur un état déjà `.ended`, ou un event d'un AUTRE
        // call, est ignoré.
        guard CallReliabilityPolicy.shouldProcessRemoteEnd(
            currentCallId: currentCallId,
            incomingCallId: callId,
            callState: callState
        ) else { return }

        // Audit P1-24 — map the gateway's `reason` string to the right
        // CXCallEndedReason (Recents UX) + CallEndReason (analytics + in-app UI).
        // Extracted to the pure, unit-tested CallEndReasonMapper.
        let (cxReason, localReason) = CallEndReasonMapper.map(rawReason)

        if callUsesCallKit, let uuid = activeCallUUID {
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: cxReason)
        }
        endCallInternal(reason: localReason)
        playNotificationHaptic(.warning)
        Logger.calls.info("Call ended by remote: \(callId) (rawReason=\(rawReason ?? "nil"), cx=\(cxReason.rawValue))")
    }

    // MARK: - Private: Outgoing Ring Timeout

    /// Schedules a defensive `outgoingRingTimeoutSeconds` cutoff for the caller.
    /// If the recipient hasn't joined within the window, ends the call as
    /// `.missed`. The gateway has its own 60s timeout but this guards against
    /// dropped `call:ended` events and gives the user a snappier failure path.
    @MainActor
    private func startOutgoingRingTimeout() {
        outgoingRingTimeoutTask?.cancel()
        let timeout = QualityThresholds.outgoingRingTimeoutSeconds
        outgoingRingTimeoutTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(timeout))
            guard let self else { return }
            guard !Task.isCancelled else { return }
            // `.offering` compte comme "sonne encore" : le join de l'appelé est
            // automatique à la sonnerie, l'offer part avant tout décroché
            // humain. Seule l'answer SDP (= accept) désarme ce cutoff.
            switch self.callState {
            case .ringing(isOutgoing: true), .offering: break
            default: return
            }
            Logger.calls.warning("Outgoing call ring timeout after \(timeout)s — no answer; ending call")
            if let uuid = self.activeCallUUID {
                self.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
            }
            self.endCallInternal(reason: .missed)
        }
    }

    @MainActor
    private func cancelOutgoingRingTimeout() {
        outgoingRingTimeoutTask?.cancel()
        outgoingRingTimeoutTask = nil
    }

    /// Démarre le ringback tone si l'appel est toujours en .ringing(outgoing).
    /// Appelé depuis `provider:didActivate:audioSession` — voir le commentaire
    /// long là-bas pour le rationale (AVAudioPlayer ne doit PAS être démarré
    /// avant que CallKit ait posé sa catégorie `.playAndRecord`).
    @MainActor
    func startRingbackIfNeeded() {
        guard case .ringing(isOutgoing: true) = callState else { return }
        ringbackPlayer.start()
    }

    // MARK: - Private: State Transitions

    /// §5.8 — unified reliability monitor. One periodic task that, each tick,
    /// branches on `callState`:
    ///   - `.connecting` (answer reçue, ICE réel en cours) : applies the
    ///     watchdog (`evaluateConnecting`) so a wedged ICE/DTLS handshake gets
    ///     ONE ICE restart, then fails, instead of spinning "Connexion…"
    ///     forever (bug h).
    ///   - `.offering` : PAS de watchdog ICE — l'appelé sonne encore (join
    ///     automatique à la sonnerie) ; l'horloge est le ring timeout 45s.
    ///   - `.connected`: applies the half-open self-heal (`evaluateHalfOpen`).
    ///     We stay `.connected` for snappy UX, but if after the grace window the
    ///     peer's RTP never arrives while ours flows, we trigger ONE ICE restart
    ///     (the heal is one-shot per call to honour "un ICE restart").
    /// Real disconnects/hangups remain handled by the PC-state delegate, remote
    /// `call:ended`, the user, and `outgoingRingTimeoutSeconds` (armed through
    /// `.ringing` AND `.offering`).
    @MainActor
    private func startReliabilityMonitor() {
        reliabilityMonitorTask?.cancel()
        reliabilityMonitorTask = Task { @MainActor [weak self] in
            guard let self else { return }
            var connectingSince: Date?
            var didAttemptConnectingRestart = false
            // Half-open detection state, keyed off `connectionEpoch` so it
            // re-arms with a fresh RTP baseline after every (re)connect — even
            // when a reconnection cycle completes entirely between two poll
            // ticks (the old loop-local bool missed that and froze self-heal).
            var halfOpenMonitor = HalfOpenMonitorState()
            // `.reconnecting` watchdog state. `reconnectingWatchedAttempt` pins the
            // attempt number whose budget clock `reconnectingSince` is timing; a
            // change in attempt (any reconnection trigger advanced the counter)
            // restarts the clock for the new attempt.
            var reconnectingSince: Date?
            var reconnectingWatchedAttempt: Int?
            let nanos = UInt64(QualityThresholds.rtpGatePollIntervalSeconds * 1_000_000_000)

            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: nanos)
                guard !Task.isCancelled else { return }

                switch self.callState {
                case .offering:
                    // Offer envoyé, l'appelé SONNE encore (le join est
                    // automatique à la sonnerie — un délai humain > 12s est
                    // normal, pas une panne ICE : aucune remote description
                    // n'existe, un ICE restart est impossible). L'horloge de
                    // l'appel non répondu est le ring timeout 45s
                    // (startOutgoingRingTimeout) + le reaper gateway 60s.
                    // L'horloge ICE (.connecting) ne démarre qu'à l'answer.
                    connectingSince = nil
                    didAttemptConnectingRestart = false
                    reconnectingSince = nil
                    reconnectingWatchedAttempt = nil
                case .connecting:
                    reconnectingSince = nil
                    reconnectingWatchedAttempt = nil
                    let since = connectingSince ?? Date()
                    connectingSince = since
                    let elapsed = Date().timeIntervalSince(since)
                    switch CallReliabilityPolicy.evaluateConnecting(
                        secondsInConnecting: elapsed,
                        didAttemptRestart: didAttemptConnectingRestart
                    ) {
                    case .waiting:
                        break
                    case .restartICE:
                        didAttemptConnectingRestart = true
                        Logger.calls.info(".connecting watchdog (\(Int(elapsed))s) → triggering ICE restart")
                        self.attemptReconnection()
                    case .fail:
                        Logger.calls.error(".connecting watchdog (\(Int(elapsed))s) — failing call")
                        self.failCall(String(localized: "call.error.timeout"))
                        return
                    }
                case .connected:
                    connectingSince = nil
                    didAttemptConnectingRestart = false
                    reconnectingSince = nil
                    reconnectingWatchedAttempt = nil
                    // Cheap pre-check: once this epoch settled (media confirmed
                    // healthy OR the one allowed self-heal fired) skip the stats
                    // fetch — ongoing transport faults surface via the PC-state
                    // delegate, not by polling stats forever.
                    guard halfOpenMonitor.needsEvaluation(epoch: self.connectionEpoch) else { break }
                    guard let stats = await self.webRTCService.getStats() else { continue }
                    switch halfOpenMonitor.evaluate(
                        epoch: self.connectionEpoch,
                        inboundPackets: stats.inboundPacketsReceived,
                        outboundPackets: stats.outboundPacketsSent
                    ) {
                    case .healthy?:
                        Logger.calls.debug("media bidirectional (inAudio=\(stats.inboundAudioPackets) inVideo=\(stats.inboundVideoPackets) out=\(stats.outboundPacketsSent))")
                    case .waiting?, nil:
                        break
                    case .healHalfOpen?:
                        Logger.calls.warning("half-open detected (inbound delta stalled, epoch \(self.connectionEpoch)) — auto ICE restart")
                        self.attemptReconnection()
                    }
                case .reconnecting(let attempt):
                    connectingSince = nil
                    didAttemptConnectingRestart = false
                    // Restart the budget clock whenever a new attempt begins (any
                    // reconnection trigger advanced the counter).
                    if attempt != reconnectingWatchedAttempt {
                        reconnectingWatchedAttempt = attempt
                        reconnectingSince = Date()
                    }
                    let since = reconnectingSince ?? Date()
                    reconnectingSince = since
                    let elapsed = Date().timeIntervalSince(since)
                    switch CallReliabilityPolicy.evaluateReconnecting(secondsInAttempt: elapsed) {
                    case .waiting:
                        break
                    case .retry:
                        // This attempt's ICE restart overran its budget without
                        // reaching `.connected`. Escalate: `attemptReconnection`
                        // advances the counter (or trips the cap → `.connectionLost`).
                        // Clear the clock so the next tick re-arms for the new attempt.
                        Logger.calls.warning(".reconnecting watchdog (\(Int(elapsed))s, attempt \(attempt)) — ICE restart stalled, escalating")
                        reconnectingSince = nil
                        reconnectingWatchedAttempt = nil
                        self.attemptReconnection(escalate: true)
                    }
                default:
                    connectingSince = nil
                    reconnectingSince = nil
                    reconnectingWatchedAttempt = nil
                }
            }
        }
    }

    private func transitionToConnected() {
        // Idempotent : si déjà .connected, no-op. Appelée par webRTCServiceDidConnect
        // (immédiat sur RTCPeerConnectionState.connected, §3.2). Le guard évite de
        // relancer durationTask / heartbeat / haptics si re-déclenchée.
        if case .connected = callState { return }

        // [Fix 2026-07-02] Le chrono CallKit du callee démarre au fulfill de
        // l'answer action : la settle ICI (connexion réelle), pas au tap.
        settlePendingAnswerAction(fulfilled: true, reason: "connected")
        let wasReconnecting: Bool
        if case .reconnecting = callState { wasReconnecting = true } else { wasReconnecting = false }

        // §2.3/§6.4 — audio activation is gated on the PLATFORM, not on the
        // fragile `!rtc.isAudioEnabled` heuristic.
        //   - iPhone/iPad (`callUsesCallKit == true`): CallKit owns activation via
        //     `provider:didActivate:`. We must NEVER self-activate here — calling
        //     `setActive(true)` before `didActivate` makes iOS fail the audio
        //     device module silently ("no sound on 1st call"). Log only.
        //   - Mac (`callUsesCallKit == false`, iOS-app-on-Mac): `didActivate`
        //     never fires, so this `[AUDIO_FALLBACK]` IS the activation path.
        if !callUsesCallKit {
            Logger.calls.warning("[AUDIO_FALLBACK] Mac (no CallKit didActivate) — activation manuelle de RTCAudioSession")
            audioSessionQueue.sync {
                let rtc = RTCAudioSession.sharedInstance()
                rtc.lockForConfiguration()
                do {
                    let configuration = RTCAudioSessionConfiguration.webRTC()
                    configuration.category = AVAudioSession.Category.playAndRecord.rawValue
                    // CALL-FIX 2026-06-06 (macOS) — `.default` avoids the voice-processing
                    // I/O unit that faults on the mic uplink on iOS-app-on-Mac.
                    configuration.mode = AVAudioSession.Mode.default.rawValue
                    configuration.categoryOptions = [.allowBluetoothHFP, .duckOthers]
                    try rtc.setConfiguration(configuration, active: true)
                    rtc.isAudioEnabled = true
                    Logger.calls.info("[AUDIO_FALLBACK] RTCAudioSession activée manuellement (mode=\(configuration.mode), category=\(configuration.category))")
                } catch {
                    Logger.calls.error("[AUDIO_FALLBACK] échec activation manuelle: \(error.localizedDescription)")
                }
                rtc.unlockForConfiguration()
            }
        } else if !RTCAudioSession.sharedInstance().isAudioEnabled {
            Logger.calls.warning("[AUDIO] connected but RTCAudioSession not yet active — awaiting CallKit provider:didActivate (do NOT self-activate on iPhone/iPad)")
            // §RC-2 — if `didActivate` never arrives, the call would stay
            // connected-but-muted forever. Arm the one-shot fallback; it
            // re-checks the full stuck condition after a short delay and
            // no-ops when CallKit did its job in the meantime.
            scheduleStuckMutedFallback()
        }

        // CALL-FIX 2026-06-06 — call established: stop ringback/ringtone + play the
        // "connected" cue. transitionToConnected is idempotent (guarded above) so
        // the cue plays exactly once. On a reconnect (wasReconnecting=true) the
        // ringback is already stopped, the cue already played, and the timer is
        // already running — replaying the cue or resetting the timer mid-call
        // would be a jarring UX regression.
        ringbackPlayer.stop()
        ringbackPlayer.stopRingtone()
        if !wasReconnecting {
            ringbackPlayer.playConnected()
        }
        callState = .connected
        // New connection period: re-arms the reliability monitor's half-open
        // detection with a fresh RTP baseline (see HalfOpenMonitorState).
        connectionEpoch += 1

        // EXIGENCE №1 — the connectionState sink only fires on socket-state
        // CHANGES; evaluate once here in case the call establishes while the
        // socket is already down (e.g. media connected during a gateway blip).
        isSignalingDegraded = CallReliabilityPolicy.signalingDegraded(
            callEstablished: true,
            socketConnected: MessageSocketManager.shared.isConnected
        )
        // Audio session was configured ONCE at peer-connection setup; CallKit
        // drives activation via provider:didActivate:, which is the single
        // place that flips RTCAudioSession.isAudioEnabled.
        // On reconnect use a lighter haptic — the user is mid-call, not initiating.
        playHaptic(wasReconnecting ? .light : .heavy)
        startScreenCaptureMonitoring()
        // Preserve the call start time and running duration on a genuine
        // mid-call reconnect (ICE restart) — but a nil callStartDate means this
        // is the FIRST real connection even if the FSM transited through
        // `.reconnecting` (pre-establishment ICE restart): without the reset,
        // durationTask died on the nil date and the timer froze at 00:00.
        if CallReliabilityPolicy.shouldResetCallClock(
            wasReconnecting: wasReconnecting,
            hasExistingStartDate: callStartDate != nil
        ) {
            callStartDate = Date()
            analyticsConnectedDate = callStartDate
            callDuration = 0
        }
        // Snapshots analytics périodiques — idempotent (les reconnexions
        // repassent ici sans re-armer) ; annulé dans endCallInternal.
        if let callId = currentCallId {
            startAnalyticsSnapshots(callId: callId)
        }
        // Hygiène timer — l'appel est établi : le cutoff "pas de réponse" n'a
        // plus d'objet (son fire-site ne couvre que .ringing/.offering, mais
        // autant ne pas laisser une task morte armée).
        cancelOutgoingRingTimeout()
        reconnectAttempt = 0

        // Notify gateway that the ICE restart succeeded so call DB status is
        // reset to `active` and the peer sees reconnection as complete.
        if wasReconnecting, let callId = currentCallId {
            let userId = AuthManager.shared.currentUser?.id ?? ""
            MessageSocketManager.shared.emitCallReconnected(callId: callId, participantId: userId)
        }
        durationTask?.cancel()
        durationTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { return }
                guard let self else { return }
                // Défense en profondeur : un callStartDate momentanément nil ne
                // doit PAS tuer la boucle (l'ancien `return` gelait le chrono à
                // 00:00 pour tout le reste de l'appel) — on saute juste le tick.
                guard let start = self.callStartDate else { continue }
                self.callDuration = Date().timeIntervalSince(start)
            }
        }

        startHeartbeat()
        webRTCService.startQualityMonitor()
        startThermalMonitoring()
        startBackgroundMonitoring()

        // Audit P1-12 — `reportOutgoingCall(_:connectedAt:)` is the caller-
        // side timer trigger. On the callee side, CallKit starts its own
        // timer when CXAnswerCallAction is fulfilled — calling
        // reportOutgoingCall here would silently no-op and leave the
        // Recents entry with zero duration.
        // Guard on !wasReconnecting: calling this again after an ICE restart
        // resets CallKit's own timer in Recents/History, making the displayed
        // call duration shorter than the actual elapsed time.
        if !wasReconnecting, lastCallWasOutgoing, let uuid = activeCallUUID {
            callProvider.reportOutgoingCall(with: uuid, connectedAt: Date())
        }
    }

    private func startThermalMonitoring() {
        thermalMonitor.delegate = self
        thermalMonitor.startMonitoring()
    }

    private func startHeartbeat() {
        heartbeatTask?.cancel()
        let interval = QualityThresholds.heartbeatIntervalSeconds
        heartbeatTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                let nanos = UInt64(interval * 1_000_000_000)
                try? await Task.sleep(nanoseconds: nanos)
                guard !Task.isCancelled else { return }
                guard let self, let callId = self.currentCallId else { return }
                // Use the dedicated `call:heartbeat` event. The previous
                // `call:signal` with a "heartbeat" type was rejected by the
                // gateway's strict signal schema (type ∈ offer / answer /
                // ice-candidate / ice-restart), so `recordHeartbeat` never fired
                // for iOS participants: the gateway could not detect a dead iOS
                // peer via heartbeat liveness and zombie calls lingered until the
                // 2h GC (the reason startCall needs a call:force-leave preflight).
                // `call:heartbeat` matches socketHeartbeatSchema and the gateway
                // resolves the participant from the socket userId — no from/to
                // payload needed. Mirrors the web client.
                MessageSocketManager.shared.emitCallHeartbeat(callId: callId)
                Logger.calls.debug("Heartbeat sent for call: \(callId)")
            }
        }
        Logger.calls.info("Heartbeat task started (\(interval)s interval)")
    }

    private func stopHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
    }

    // MARK: - Haptic Helpers

    private func playHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    private func playNotificationHaptic(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        UINotificationFeedbackGenerator().notificationOccurred(type)
    }

    // MARK: - Screen Capture Monitoring

    private func startScreenCaptureMonitoring() {
        // Garantir qu'un seul observateur est actif — évite les doublons sur reconnexion
        stopScreenCaptureMonitoring()
        screenCaptureObserver = NotificationCenter.default.addObserver(
            forName: UIScreen.capturedDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                // Swift 6: Notification is not Sendable — avoid capturing it into the Task.
                // Query all connected window scenes on the MainActor instead. This is
                // correct for multi-screen setups (Stage Manager, external displays) and
                // avoids UIScreen.main (deprecated in iOS 16+).
                let isCapturing = UIApplication.shared.connectedScenes
                    .compactMap { $0 as? UIWindowScene }
                    .contains { $0.screen.isCaptured }
                Logger.calls.info("Screen capture state changed: \(isCapturing)")
                if let callId = self.currentCallId {
                    let userId = AuthManager.shared.currentUser?.id ?? ""
                    MessageSocketManager.shared.emitCallScreenCaptureDetected(
                        callId: callId,
                        participantId: userId,
                        isCapturing: isCapturing
                    )
                }
            }
        }
    }

    private func stopScreenCaptureMonitoring() {
        if let observer = screenCaptureObserver {
            NotificationCenter.default.removeObserver(observer)
            screenCaptureObserver = nil
        }
    }

    // MARK: - Background/Foreground Monitoring (H1)

    /// Registers a still-ringing, in-app-only incoming call with CallKit.
    /// No-op unless we're genuinely in that gap: ringing, incoming, and
    /// `callUsesCallKit` is false because `handleIncomingCallNotification`
    /// skipped CallKit for being foreground/macOS at arrival time. macOS
    /// never gets a system call UI (`reportNewIncomingCall` fails there),
    /// so it's excluded here too.
    ///
    /// Guideline 5 (MIIT) — `Self.platformSupportsCallKit` is also `false`
    /// for China-region devices, so this promotion is permanently a no-op
    /// there too: an incoming call ringing in-app that backgrounds before
    /// being answered can be silently suspended by iOS with no lock-screen
    /// card, and falls back to the existing 60s server-side ringing timeout
    /// (missed call) — an accepted, documented degradation inherent to
    /// Apple disallowing CallKit while contractually requiring it as the
    /// only reliable background wake mechanism. See
    /// `test_promoteRingingCallToCallKitIfNeeded_neverPromotesInChina_evenWhileRinging`.
    @MainActor
    private func promoteRingingCallToCallKitIfNeeded() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard !callUsesCallKit, Self.platformSupportsCallKit else { return }
        guard let uuid = activeCallUUID else { return }

        let handleValue = (remoteUserId?.isEmpty == false ? remoteUserId : nil) ?? (remoteUsername ?? "")
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: handleValue)
        update.localizedCallerName = remoteUsername
        update.hasVideo = isVideoEnabled
        update.supportsGrouping = false
        update.supportsHolding = false

        callUsesCallKit = true
        ringbackPlayer.shouldSelfActivateSession = false
        callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let error {
                    Logger.calls.error("CallKit late-promote on background failed: \(error.localizedDescription)")
                    self.callUsesCallKit = false
                    self.ringbackPlayer.shouldSelfActivateSession = true
                } else {
                    // CallKit now owns ringing (its own `config.ringtoneSound`,
                    // same "Ringtone.caf" asset). Stop the in-app loop or it
                    // plays doubled on top of CallKit's, and the self-activated
                    // AVAudioSession it was holding (`shouldSelfActivateSession`,
                    // just cleared above) risks blocking CallKit's `didActivate`.
                    self.ringbackPlayer.stopRingtone()
                    Logger.calls.info("Promoted ringing call to CallKit on background entry")
                }
            }
        }
    }

    private func startBackgroundMonitoring() {
        // Garantir un seul observateur actif par type — évite les doublons sur reconnexion
        stopBackgroundMonitoring()
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let callId = self.currentCallId else { return }
                self.promoteRingingCallToCallKitIfNeeded() // see doc above — no-op unless still ringing
                let userId = AuthManager.shared.currentUser?.id ?? ""
                MessageSocketManager.shared.emitCallBackgrounded(callId: callId, participantId: userId)
                Logger.calls.info("Call backgrounded")
                // C3 — AUCUNE émission « caméra coupée » ici. Passer en
                // arrière-plan n'éteint pas la caméra quand un PiP système est
                // actif : la seule preuve est l'interruption de la session de
                // capture, republiée par `P2PWebRTCClient` et traitée dans
                // `webRTCService(_:didChangeCameraInterruption:)`. Ce
                // déclencheur est auto-corrigeant — si la caméra survit, rien
                // n'est posté et le pair continue de nous voir.
            }
        }

        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let callId = self.currentCallId else { return }
                let userId = AuthManager.shared.currentUser?.id ?? ""
                MessageSocketManager.shared.emitCallForegrounded(callId: callId, participantId: userId)
                Logger.calls.info("Call foregrounded")
                // C3 — garde-fou. `AVCaptureSession.h` documente la fin
                // d'interruption comme survenant « when your app comes back to
                // foreground » : un signal de fin peut donc ne JAMAIS arriver
                // tant que l'app reste en arrière-plan (PiP rangé sur le bord,
                // par exemple). Sans cette levée, le pair resterait sur l'avatar
                // jusqu'à la fin de l'appel — un mode de panne pire que le bug
                // corrigé. Le retour en avant-plan, lui, garantit la reprise.
                self.applyCameraSuspension(false, cause: "foreground")
            }
        }
    }

    /// C3 — unique porte d'entrée du signal `call:toggle-video` lié à la vie de
    /// la capture caméra. Deux appelants : l'interruption de session (autorité)
    /// et le retour en avant-plan (garde-fou).
    ///
    /// Les gardes de sortie sont celles qui existaient déjà, à l'identique :
    /// • `isVideoEnabled` — ne pas faire de bruit quand la caméra est éteinte
    ///   par choix de l'utilisateur ; toutes les émissions du fichier sont
    ///   gardées ainsi, sinon on désynchronise l'état du pair ;
    /// • `isVideoSuspendedByHold` — CallKit tient l'appel en pause (préemption
    ///   cellulaire) : revenir en avant-plan ne lève PAS un hold, donc annoncer
    ///   « caméra active » serait faux.
    ///
    /// L6-1 — `isVideoSuspended` (gel réseau) N'EST PLUS une garde ici : le gel
    /// laisse la capture tourner, donc il ne dit rien sur la vie de la caméra.
    /// L'y garder faisait taire un VRAI signal caméra (une interruption de
    /// capture survenant pendant un épisode dégradé) — l'inverse de ce que cette
    /// porte existe pour faire.
    private func applyCameraSuspension(_ suspended: Bool, cause: StaticString) {
        guard let callId = currentCallId, callState.isActive else { return }
        guard isVideoSuspendedByCaptureInterruption != suspended else { return }
        isVideoSuspendedByCaptureInterruption = suspended
        guard isVideoEnabled, !isVideoSuspendedByHold else { return }
        MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: !suspended)
        Logger.calls.info("Camera \(suspended ? "suspended" : "resumed") (\(cause)) — peer notified")
    }

    private func stopBackgroundMonitoring() {
        if let observer = backgroundObserver {
            NotificationCenter.default.removeObserver(observer)
            backgroundObserver = nil
        }
        if let observer = foregroundObserver {
            NotificationCenter.default.removeObserver(observer)
            foregroundObserver = nil
        }
    }

    // MARK: - CallKit Hold/Unhold

    /// Called by `CXSetHeldCallAction`. Suspends/restores outbound video on hold so
    /// the peer receives a proper "camera off" signal rather than a frozen frame.
    /// Mirrors the background-suspension pattern: `isVideoEnabled` (user intent) is
    /// preserved; video auto-resumes on unhold unless the survival controller or
    /// background is also suspending it.
    func handleHold(_ isOnHold: Bool) {
        guard callState.isActive, let callId = currentCallId else { return }
        if isOnHold {
            if isVideoEnabled {
                isVideoSuspendedByHold = true
                // Chain onto the previous hold-video task instead of cancelling it:
                // `Task.cancel()` is cooperative and `disableLocalVideo`/`enableLocalVideo`
                // never check `Task.isCancelled` mid-flight (they await `stopCapture`/
                // `startCapture`), so a rapid hold→unhold→hold could otherwise let a
                // cancelled downgrade and a fresh upgrade mutate the same camera
                // capturer/transceiver concurrently, leaving video stuck broken.
                // Awaiting the prior task's `.value` first serializes every hold
                // transition without relying on cancellation to stop in-flight work.
                //
                // Mirrors toggleVideo/applySurvivalVideoSend: a direction flip alone
                // (inside downgradeFromVideo) never reaches the peer. If ANY other
                // renegotiation fires while on hold (e.g. an ICE restart from a
                // WiFi↔cellular handoff — exactly what a GSM call causes), it would
                // otherwise bake the stale recvOnly direction into the SDP and
                // permanently negotiate it, breaking outbound video for the rest of
                // the call even after unhold. Renegotiating immediately keeps the
                // locally-flipped direction and the negotiated SDP state in sync.
                let previousToggle = videoToggleTask
                let previousHold = holdVideoTask
                let previousSurvival = survivalVideoTask
                let previousICERestart = iceRestartTask
                let previousAnswer = signalOfferAnswerTask
                let previousCameraSwitch = cameraSwitchTask
                holdVideoTask = Task { [weak self] in
                    // Serialize with every other in-flight video-transition path
                    // (manual toggle, prior hold/unhold, survival suspend/resume,
                    // ICE restart, peer-initiated renegotiation answer) — see the
                    // doc-comment on `survivalVideoTask`.
                    await previousHold?.value
                    await previousToggle?.value
                    _ = await previousSurvival?.value
                    await previousICERestart?.value
                    await previousAnswer?.value
                    await previousCameraSwitch?.value
                    guard let self, !Task.isCancelled else { return }
                    let needsRenegotiation = await self.webRTCService.downgradeFromVideo()
                    guard !Task.isCancelled else { return }
                    self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                    if needsRenegotiation,
                       let callId = self.currentCallId,
                       let userId = self.remoteUserId,
                       let offer = await self.webRTCService.createOffer(),
                       self.currentCallId == callId {
                        self.emitCallOffer(callId: callId, toUserId: userId, isVideo: false, sdp: offer)
                        Logger.calls.info("[CALL] hold renegotiation offer sent (video=false)")
                    }
                }
                MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                Logger.calls.info("CallKit hold — video suspended, peer notified (callId=\(callId))")
            }
        } else {
            if isVideoSuspendedByHold {
                isVideoSuspendedByHold = false
                // L6-1 — `isVideoSuspended` retiré de cette condition : un gel
                // réseau ne relâche pas la caméra, donc il ne doit pas empêcher
                // le unhold de la REPRENDRE. L'y laisser gardait la vidéo noire
                // jusqu'à la reprise indépendante du contrôleur de survie.
                if isVideoEnabled && !isVideoSuspendedByCaptureInterruption {
                    // Companion fix: without renegotiating here, unhold only flips
                    // the local track/direction back — the peer's negotiated SDP
                    // state (possibly stuck at recvOnly from a hold-time ICE
                    // restart) never actually gets corrected, leaving outbound
                    // video silently broken for the rest of the call. Chains onto
                    // the previous task rather than cancelling it for the same
                    // reason as the hold path above.
                    let previousToggle = videoToggleTask
                    let previousHold = holdVideoTask
                    let previousSurvival = survivalVideoTask
                    let previousICERestart = iceRestartTask
                    let previousAnswer = signalOfferAnswerTask
                    let previousCameraSwitch = cameraSwitchTask
                    holdVideoTask = Task { [weak self] in
                        // Serialize with every other in-flight video-transition path —
                        // see the doc-comment on `survivalVideoTask`.
                        await previousHold?.value
                        await previousToggle?.value
                        _ = await previousSurvival?.value
                        await previousICERestart?.value
                        await previousAnswer?.value
                        await previousCameraSwitch?.value
                        guard let self, !Task.isCancelled else { return }
                        do {
                            let needsRenegotiation = try await self.webRTCService.upgradeToVideo()
                            guard !Task.isCancelled else { return }
                            self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                            if needsRenegotiation,
                               let callId = self.currentCallId,
                               let userId = self.remoteUserId,
                               let offer = await self.webRTCService.createOffer(),
                               self.currentCallId == callId {
                                self.emitCallOffer(callId: callId, toUserId: userId, isVideo: true, sdp: offer)
                                Logger.calls.info("[CALL] unhold renegotiation offer sent (video=true)")
                            }
                        } catch WebRTCError.cameraPermissionDenied {
                            // Audit finding — this previously swallowed the error via
                            // `try?`, which left `isVideoEnabled == true` with no video
                            // track, no peer correction, and no user feedback: a silent,
                            // unrecoverable video outage for the rest of the call.
                            // Mirror toggleVideo/actuateSurvivalVideoSend's handling.
                            guard !Task.isCancelled else { return }
                            Logger.calls.error("unhold video recovery failed: camera permission denied — disabling video")
                            self.isVideoEnabled = false
                            self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                            self.videoSurvivalController.reset()
                            if let callId = self.currentCallId {
                                MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                            }
                            FeedbackToastManager.shared.showError(
                                String(localized: "call.video.permission.denied",
                                       defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                                       bundle: .main)
                            ) {
                                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                                UIApplication.shared.open(url)
                            }
                        } catch {
                            guard !Task.isCancelled else { return }
                            Logger.calls.error("unhold video recovery failed: \(error.localizedDescription)")
                            self.isVideoEnabled = false
                            self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                            // Same discipline as the cameraPermissionDenied branch above:
                            // isVideoEnabled=false alone only resets survival state on its
                            // NEXT quality tick, and `handle()` no-ops entirely while a
                            // transition is already in flight — leaving a stale
                            // isVideoSuspended/isTransitioning behind this generic failure.
                            self.videoSurvivalController.reset()
                            if let callId = self.currentCallId {
                                MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                            }
                        }
                    }
                    MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: true)
                    Logger.calls.info("CallKit unhold — video restored, peer notified (callId=\(callId))")
                }
            }
        }
    }

    // MARK: - DTMF Forwarding

    /// Called by `CXPlayDTMFCallAction` to forward CallKit keypad digits to WebRTC.
    func sendDTMF(digits: String) {
        let validCharacters = CharacterSet(charactersIn: "0123456789*#ABCD")
        guard !digits.isEmpty, digits.unicodeScalars.allSatisfy({ validCharacters.contains($0) }) else { return }
        webRTCService.sendDTMF(digits: digits)
    }

    // MARK: - Network Monitoring

    private func startNetworkMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasUnsatisfied = self.lastNetworkPath != .satisfied
                let isNowSatisfied = path.status == .satisfied

                // Detect active interface type (WiFi > cellular > other). Used to
                // trigger ICE restart on WiFi↔cellular handoff — the path remains
                // "satisfied" across the transition so status alone is insufficient.
                let currentInterfaceType: NWInterface.InterfaceType?
                if path.usesInterfaceType(.wifi) { currentInterfaceType = .wifi }
                else if path.usesInterfaceType(.cellular) { currentInterfaceType = .cellular }
                else if path.usesInterfaceType(.wiredEthernet) { currentInterfaceType = .wiredEthernet }
                else { currentInterfaceType = path.availableInterfaces.first?.type }

                let previousInterfaceType = self.lastNetworkInterfaceType
                // `previousInterfaceType == nil` means first observation — no actual
                // interface change happened, so exclude it from the ICE-restart trigger.
                let interfaceChanged = previousInterfaceType != nil && currentInterfaceType != previousInterfaceType
                self.lastNetworkPath = path.status
                self.lastNetworkInterfaceType = currentInterfaceType

                // FSM §3.2 — mirrors CallReliabilityPolicy.reconnectingAllowed(from:):
                // .connecting (answer received, ICE negotiating) is reconnect-eligible
                // just like .connected/.reconnecting. Excluding it here left a WiFi↔
                // cellular handoff mid-answer unhandled until the connectingRestartSeconds
                // watchdog escalated, instead of triggering an immediate reconnect.
                let isInActiveCall: Bool
                switch self.callState {
                case .connected, .reconnecting, .connecting: isInActiveCall = true
                default: isInActiveCall = false
                }
                if interfaceChanged && isInActiveCall {
                    self.analyticsNetworkTransitions += 1
                }
                guard isInActiveCall else { return }

                if path.status != .satisfied {
                    Logger.calls.warning("Network lost during call — starting reconnection")
                    self.attemptReconnection()
                } else if wasUnsatisfied && isNowSatisfied {
                    Logger.calls.info("Network recovered during call — performing ICE restart")
                    self.attemptReconnection()
                } else if interfaceChanged {
                    // WiFi ↔ cellular handoff: local IP addresses change, existing ICE
                    // candidates go stale. Trigger ICE restart so WebRTC negotiates new
                    // candidates on the active interface and the call stays alive.
                    Logger.calls.info("Network interface changed to \(String(describing: currentInterfaceType)) — ICE restart for handoff")
                    self.attemptReconnection()
                }
            }
        }
        networkMonitor.start(queue: networkQueue)
    }

    // MARK: - Post-call diagnostics persistence

    /// UserDefaults key for the last persisted call quality summary.
    static let lastCallSummaryDefaultsKey = "me.meeshy.lastCallQualitySummary"

    /// Lightweight call quality summary persisted to UserDefaults at call teardown.
    /// Survives app termination so quality issues are debuggable after the fact.
    struct CallQualitySummary: Codable, Sendable {
        let callId: String?
        let remoteUser: String?
        let durationSeconds: TimeInterval
        let endReason: String
        let stats: CallStats?
    }

    /// Returns the last persisted call summary from a previous call (or the
    /// current session, if already torn down). Nil when no call has been made yet.
    static var lastCallSummary: CallQualitySummary? {
        guard let data = UserDefaults.standard.data(forKey: lastCallSummaryDefaultsKey) else { return nil }
        return JSONDecoder().decodeOrLog(CallQualitySummary.self, from: data,
                                         field: "last call summary", logger: Logger.calls)
    }

    private static func persistCallSummary(
        stats: CallStats?,
        callId: String?,
        duration: TimeInterval,
        remote: String?,
        reason: CallEndReason
    ) {
        let summary = CallQualitySummary(
            callId: callId,
            remoteUser: remote,
            durationSeconds: duration,
            endReason: String(describing: reason),
            stats: stats
        )
        guard let data = JSONEncoder().encodeOrLog(summary, field: "call summary",
                                                   id: callId ?? "-", logger: Logger.calls) else { return }
        UserDefaults.standard.set(data, forKey: lastCallSummaryDefaultsKey)
    }

    private func emitCallAnalyticsIfNeeded(reason: CallEndReason) {
        guard let callId = currentCallId else { return }
        // Émission finale — le snapshot est PUR (la fenêtre de niveau ouverte
        // est repliée virtuellement par qualityDistribution, plus de flush
        // mutatif ici) ; le gateway écrase le dernier snapshot in_progress
        // avec la raison terminale réelle.
        emitCallAnalyticsSnapshot(callId: callId, endReasonLabel: String(describing: reason))

        // Reset accumulators so a subsequent call starts clean.
        analyticsCallInitiatedDate = nil
        analyticsNegotiationStartDate = nil
        analyticsConnectedDate = nil
        analyticsNetworkTransitions = 0
        analyticsQualitySeconds = [:]
        analyticsLastQualityDate = nil
        analyticsCurrentLevel = nil
        analyticsRttSum = 0
        analyticsSampleCount = 0
        analyticsMaxPacketLoss = 0
        analyticsPacketLossSum = 0
        analyticsEffectsUsed = []
        analyticsVideoFiltersUsed = false
    }

    /// Snapshot analytics NON destructif — payload complet construit depuis
    /// les accumulateurs sans les muter (la fenêtre de niveau ouverte est
    /// repliée virtuellement par `CallReliabilityPolicy.qualityDistribution`).
    /// Sert (a) aux émissions périodiques `in_progress` pendant l'appel et
    /// (b) à l'émission finale de teardown. Le gateway persiste par
    /// updateMany : chaque envoi écrase le précédent — un kill de l'app en
    /// background (vécu 2026-07-03 : row analytics perdue après 29 min
    /// d'appel) ne perd plus que la dernière fenêtre.
    private func emitCallAnalyticsSnapshot(callId: String, endReasonLabel: String) {
        let setupMetrics = CallReliabilityPolicy.callSetupMetrics(
            initiatedAt: analyticsCallInitiatedDate,
            negotiationStartAt: analyticsNegotiationStartDate,
            connectedAt: analyticsConnectedDate
        )
        let qualityDistribution = CallReliabilityPolicy.qualityDistribution(
            accumulatedSeconds: analyticsQualitySeconds,
            openWindowLevel: analyticsCurrentLevel,
            openWindowSince: analyticsLastQualityDate,
            now: Date()
        )

        let averageRtt = analyticsSampleCount > 0
            ? analyticsRttSum / Double(analyticsSampleCount) : 0
        let averagePacketLoss = analyticsSampleCount > 0
            ? analyticsPacketLossSum / Double(analyticsSampleCount) : 0
        let codec = lastKnownStats?.codec ?? "unknown"
        let filtersUsed = analyticsVideoFiltersUsed || webRTCService.videoFilters.config.isEnabled

        let payload: [String: Any] = [
            "setupTimeMs":         setupMetrics.setupTimeMs,
            "negotiationTimeMs":   setupMetrics.negotiationTimeMs,
            "durationSeconds":     callDuration,
            "reconnectionCount":   analyticsTotalReconnects,
            "networkTransitions":  analyticsNetworkTransitions,
            "averageRtt":          averageRtt,
            "averagePacketLoss":   averagePacketLoss,
            "maxPacketLoss":       analyticsMaxPacketLoss,
            "codec":               codec,
            "effectsUsed":         Array(analyticsEffectsUsed),
            "filtersUsed":         filtersUsed,
            "transcriptionUsed":   transcriptionService.isTranscribing,
            "qualityDistribution": qualityDistribution,
            "platform":            "ios",
            "deviceModel":         UIDevice.current.model,
            "isVideo":             isVideoEnabled,
            "endReason":           endReasonLabel
        ]
        MessageSocketManager.shared.emitCallAnalytics(callId: callId, payload: payload)
    }

    /// Démarre les snapshots analytics périodiques (60 s) pour l'appel
    /// courant. Idempotent (une seule task par appel — les reconnexions
    /// mid-call repassent par connected sans re-armer). Annulé au teardown.
    private func startAnalyticsSnapshots(callId: String) {
        guard analyticsSnapshotTask == nil else { return }
        analyticsSnapshotTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(QualityThresholds.analyticsSnapshotIntervalSeconds))
                guard !Task.isCancelled, let self else { return }
                // Un autre appel a remplacé celui-ci sans passer par le cancel
                // (défensif) : cette task ne parle plus pour personne.
                guard self.currentCallId == callId else { return }
                // Pendant une reconnexion, les stats sont gelées (RTT/loss à 0
                // liraient "excellent") — sauter la fenêtre, pas la task.
                guard case .connected = self.callState else { continue }
                self.emitCallAnalyticsSnapshot(callId: callId, endReasonLabel: "in_progress")
            }
        }
    }

    /// Audit 2026-07-02 (bug 1) — shared failure teardown. `endCallInternal`
    /// never reports to CallKit on its own (its only CallKit side effect is
    /// failing a still-pending CXAnswerCallAction), so every failure path that
    /// reached it directly left the system call UI stranded on a call the app
    /// had already abandoned (caller-side ACK/SDP/media failures, connecting
    /// watchdog, server call:error). Report the failure first, while
    /// `activeCallUUID` is still set — the wrapper sites for local/remote ends
    /// (endCall, handleRemoteEnd, …) keep doing their own CallKit teardown with
    /// end-specific reasons.
    ///
    /// Audit 2026-07-08 — guard `callState.isActive` like its sibling paths
    /// (`endCall`, `handleRemoteEnd`). Several async call sites (SDP
    /// offer/answer handling, the participant-joined offer) only check
    /// `currentCallId == callId` for liveness, and `currentCallId` stays
    /// populated for ~1.5s after a local hangup (the "settle window"). Without
    /// this guard, hanging up right as an SDP exchange is in flight lets that
    /// in-flight failure call `failCall()` on an already-ended call, and
    /// `endCallInternal(.failed(...))` overwrites the real end reason
    /// (`.local`/`.missed`/`.rejected`) in the UI, the UserDefaults snapshot,
    /// and — because the gateway's last-write-wins on the call-history
    /// snapshot — the call history too.
    private func failCall(_ reasonMessage: String) {
        guard callState.isActive else { return }
        if callUsesCallKit, let uuid = activeCallUUID {
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
        }
        // Capture BEFORE endCallInternal nils it — the gateway must learn of
        // this teardown or the peer stays in a zombie call (see
        // emitCallEndReliably).
        if let callId = currentCallId {
            emitCallEndReliably(callId: callId)
        }
        endCallInternal(reason: .failed(reasonMessage))
    }

    private func endCallInternal(reason: CallEndReason) {
        // CALL-FIX 2026-06-06 — stop any ringing loop + play the "ended" cue, but
        // ONLY if the call was actually active (ringing/connecting/connected). The
        // `isActive` guard means a re-entrant endCallInternal (already .ended/.idle)
        // won't double-play the cue.
        let wasActive = callState.isActive
        ringbackPlayer.stop()
        ringbackPlayer.stopRingtone()
        if wasActive { ringbackPlayer.playEnded() }
        durationTask?.cancel()
        durationTask = nil
        reliabilityMonitorTask?.cancel()
        reliabilityMonitorTask = nil
        localMediaTask?.cancel()
        localMediaTask = nil
        callJoinTask?.cancel()
        callJoinTask = nil
        // L'appel se termine avant la connexion : échouer l'answer action encore
        // pendante pour que CallKit démonte proprement (no-op si déjà settled).
        settlePendingAnswerAction(fulfilled: false, reason: "teardown before connect")
        outgoingRingTimeoutTask?.cancel()
        outgoingRingTimeoutTask = nil
        // Cancel le Task de setup outgoing (force-leave + ACK + media +
        // listenForParticipantJoined). Sans ça, après endCallInternal, ce
        // Task continuait à tourner et pouvait re-armer la connexion, faire
        // des emit/setup sur un appel déjà clos, ou laisser des observables
        // attachés.
        setupCallTask?.cancel()
        setupCallTask = nil
        turnRefreshTask?.cancel()
        turnRefreshTask = nil
        turnRefreshWatchdogTask?.cancel()
        turnRefreshWatchdogTask = nil
        turnRefreshRetryAttempt = 0
        stopHeartbeat()
        stopScreenCaptureMonitoring()
        stopBackgroundMonitoring()
        transcriptionService.resetForCallEnd(
            callId: currentCallId,
            conversationId: conversationId ?? "",
            callStartedAt: callStartDate,
            localUserId: AuthManager.shared.currentUser?.id ?? "",
            localSpeakerName: AuthManager.shared.currentUser?.displayName ?? AuthManager.shared.currentUser?.username ?? "",
            remoteSpeakerName: remoteUsername ?? ""
        )
        participantJoinedCancellable?.cancel()
        participantJoinedCancellable = nil
        sdpOfferTimeoutTask?.cancel()
        sdpOfferTimeoutTask = nil
        offerRetryTask?.cancel()
        offerRetryTask = nil
        answerRetryTask?.cancel()
        answerRetryTask = nil
        videoToggleTask?.cancel()
        videoToggleTask = nil
        holdVideoTask?.cancel()
        holdVideoTask = nil
        survivalVideoTask?.cancel()
        survivalVideoTask = nil
        remoteQualityResetTask?.cancel()
        remoteQualityResetTask = nil
        iceRestartTask?.cancel()
        iceRestartTask = nil
        signalOfferAnswerTask?.cancel()
        signalOfferAnswerTask = nil
        cameraSwitchTask?.cancel()
        cameraSwitchTask = nil
        audioActivationFallbackTask?.cancel()
        audioActivationFallbackTask = nil
        CallManager.callKitDidActivateFired = false
        voipFreshnessTask?.cancel()
        voipFreshnessTask = nil
        analyticsSnapshotTask?.cancel()
        analyticsSnapshotTask = nil
        isRemoteQualityDegraded = false
        isSignalingDegraded = false
        pendingRemoteOffer = nil
        pendingIceCandidates = []
        thermalMonitor.stopMonitoring()
        // Snapshot analytics before state is torn down so the payload has access
        // to callId, callDuration, callStartDate, etc.
        emitCallAnalyticsIfNeeded(reason: reason)
        hasLocalVideoTrack = false
        hasRemoteVideoTrack = false
        remoteTranscriptionActive = false
        listeningPeers = []
        publishedListeningIntent = false
        callStartDate = nil
        reconnectAttempt = 0
        analyticsTotalReconnects = 0
        // Reset inconditionnel de l'état vidéo per-call. Avant, seul
        // `resetEndedStateForNewCall` (fenêtre settle 1,5 s) le faisait : un
        // appel démarré plus tard héritait d'`isRemoteVideoEnabled == false`
        // (placeholder "Caméra désactivée" fantôme) et d'un FSM de survie
        // vidéo potentiellement suspendu — violation du contrat documenté de
        // `VideoSurvivalControlling.reset()`.
        isRemoteVideoEnabled = true
        isRemoteAudioEnabled = true
        isRemoteScreenCapturing = false
        videoSurvivalController.reset()
        isVideoSuspended = false
        isVideoSuspendedByCaptureInterruption = false
        isVideoSuspendedByHold = false
        // Même rationale que le reset vidéo ci-dessus : `resetEndedStateForNewCall`
        // ne reset la bulle QUE si le nouvel appel arrive dans la fenêtre de
        // settle 1,5s (callState encore `.ended`). Le cas ordinaire — un appel
        // qui démarre plus tard — passe par `callState == .idle`, où ce garde
        // ne se déclenche jamais. Sans ce reset inconditionnel, la bulle
        // réapparaît silencieusement à la position de l'appel PRÉCÉDENT.
        bubbleEdge = .trailing
        bubbleVerticalFraction = 0.08
        // C6 — l'appel se termine pendant que la fenêtre PiP flotte au-dessus
        // d'une autre app. La pilule et la bulle se masquent toutes deux dès
        // `.ended`, et le `fullScreenCover` exige `.fullScreen` : sans ça,
        // l'utilisateur revient dans une app où l'appel a disparu sans motif.
        // Posé AVANT `detachSystemPiP()` (qui remet `isSystemPiPActive` à faux)
        // et avant `.ended` — `shouldPresentFullScreenCover` accepte encore
        // l'état actif, puis reste vrai par `isEnded` jusqu'au reset `.idle`.
        // La condition sur le PiP est ce qui évite d'imposer un modal plein
        // écran à chaque raccrochage depuis la pilule, le flux le plus courant.
        if CallPiPPolicy.shouldRestoreFullScreenBeforeTeardown(
            isPiPActive: isSystemPiPActive,
            currentMode: displayMode
        ) {
            displayMode = .fullScreen
        }
        detachSystemPiP()
        Self.persistCallSummary(stats: lastKnownStats, callId: currentCallId,
                                duration: callDuration, remote: remoteUsername, reason: reason)
        lastKnownStats = nil
        webRTCService.close()
        deactivateAudioSession()
        callState = .ended(reason: reason)
        connectionQuality = .new
        liveVideoQualityLevel = nil
        degradedLinkTracker.reset()
        isLinkQualityDegraded = false
        activeCallUUID = nil
        // Audit P2-iOS-1 — drop any pending "busy" incoming call. If a 2nd
        // call arrived while this one was active and got immediately ended
        // (.unanswered), the banner kept pointing at a callId that the
        // gateway has already torn down — tapping it joined a phantom room.
        pendingIncomingCall = nil
        showCallWaitingBanner = false

        // L'UI se base sur `callState == .ended` pour afficher le panneau de
        // fin d'appel ; on garde l'état visible 1.5s avant de reset à `.idle`
        // pour laisser le user voir le motif. Si une nouvelle tentative
        // d'appel arrive PENDANT ce délai, on accepte et on force-reset
        // (cf. `forceResetIfEndedThenStart`/branches `case .ended` dans
        // startCall et handleIncomingCallNotification). Le délai legacy de
        // 3s + double-call entrant via VoIP push faisait que tout appel
        // entrant ou sortant suivant un ended remote était rejeté avec
        // "already in state ended(...)" pendant 3s — le user voyait le
        // signal d'appel disparaître. 1.5s suffit pour le feedback UI.
        // Audit P1-2 — stamp this settle window with a token. If a new call
        // arrives within 1.5s, `resetEndedStateForNewCall` nils the token and
        // we must NOT clobber its freshly-assigned identity.
        let token = UUID()
        settleToken = token
        // A retryable transient failure holds the ended screen LONGER so the user
        // has time to tap « Réessayer » (parité web/Android), then auto-dismisses
        // like any other ended call. Tapping retry re-enters startCall, whose
        // resetEndedStateForNewCall nils this token so the pending settle bails.
        let settleDelay = canRetryCall
            ? QualityThresholds.callEndRetryableSettleSeconds
            : QualityThresholds.callEndSettleSeconds
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(settleDelay))
            guard let self else { return }
            guard self.settleToken == token else { return }
            if case .ended = self.callState {
                self.settleToken = nil
                self.callState = .idle
                self.currentCallId = nil
                self.remoteUserId = nil
                self.remoteUsername = nil
                self.conversationId = nil
                self.callDuration = 0
                self.isVideoEnabled = false
                self.isMuted = false
                self.isSpeaker = false
            }
        }
    }

    // MARK: - Audio Session
    //
    // CallKit controls audio activation via `provider:didActivate:` and
    // `provider:didDeactivate:`. We MUST NOT call `setActive(true)` ourselves
    // — doing so causes priority inversion and silent audio. Our job is to
    // pre-configure the RTCAudioSessionConfiguration so when CallKit fires
    // didActivate, WebRTC's audio engine starts immediately with the right
    // category/mode. RTCAudioSession.isAudioEnabled is only flipped from
    // didActivate/didDeactivate.

    private func configureAudioSession() {
        Logger.calls.info("[AUDIO_SESS] configure begin")
        let videoUIActive = isVideoUIActive
        let configuration = RTCAudioSessionConfiguration.webRTC()
        configuration.category = AVAudioSession.Category.playAndRecord.rawValue
        // CALL-FIX 2026-06-06 (macOS) — on iOS-app-on-Mac the voice-processing I/O unit
        // (engaged by `.voiceChat`/`.videoChat`) faults on the mic uplink ("failed to
        // write uplink microphone input signal (state fault)") → the Mac mic captures
        // silence and the peer hears nothing. `.default` bypasses the voice processor;
        // WebRTC's own software AEC/NS still runs. C7 — le prédicat est
        // `isVideoUIActive` (caméra locale OU flux distant), pas `isVideoEnabled` :
        // le PiP système exige `.videoChat`, y compris sur escalade unilatérale.
        configuration.mode = CallAudioSessionPolicy.mode(
            videoUIActive: videoUIActive,
            isiOSAppOnMac: ProcessInfo.processInfo.isiOSAppOnMac
        ).rawValue
        // PERF-010: use HFP only (not A2DP) — A2DP is output-only and
        // conflicts with the bidirectional voice path (forces the OS to flap
        // between Bluetooth profiles, causing periodic ~200ms audio glitches). HFP
        // already covers BT headsets via the SCO bidirectional voice link.
        // .preferNoInterruptionsFromSystemAlerts = 0x100 (iOS 14.5+) is API_UNAVAILABLE(macos);
        // the macOS AVAudioSession shim for "Designed for iPad" builds omits it entirely.
        // Use raw value to avoid SDK symbol resolution by the compiler; skip on Mac.
        var categoryOptions: AVAudioSession.CategoryOptions = [.allowBluetoothHFP, .duckOthers]
        if !ProcessInfo.processInfo.isiOSAppOnMac {
            categoryOptions.insert(AVAudioSession.CategoryOptions(rawValue: 0x100))
        }
        configuration.categoryOptions = categoryOptions
        let activateNow = !callUsesCallKit

        audioSessionQueue.sync {
            CallManager.isAudioSessionExpectedActive = true
            let session = RTCAudioSession.sharedInstance()
            Logger.calls.info("[AUDIO_SESS] lockForConfiguration")
            session.lockForConfiguration()
            defer {
                Logger.calls.info("[AUDIO_SESS] unlockForConfiguration")
                session.unlockForConfiguration()
            }
            do {
                Logger.calls.info("[AUDIO_SESS] setConfiguration call")
                // CALL-FIX 2026-06-06 — iOS defers activation to CallKit's
                // provider:didActivate (active:false here). On iOS-app-on-Mac there is
                // no CallKit, so activate NOW (active:true) — otherwise this call would
                // DEACTIVATE the session the ring-sound manager just brought up, cutting
                // the ringback/ringtone after a few hundred ms. The [AUDIO_FALLBACK] at
                // connect then finds it already active (no-op).
                // When CallKit drives the call it activates the session via
                // provider:didActivate (active:false here). Without CallKit (Mac, or a
                // foreground in-app call) WE own activation, so activate now — otherwise
                // this would DEACTIVATE the session the ring-sound manager just brought
                // up. The [AUDIO_FALLBACK] at connect then finds it already active.
                try session.setConfiguration(configuration, active: activateNow)
                // Prevent Siri, low-battery, and other system alerts from ducking
                // or interrupting the call (iOS 14.5+). This is an AVAudioSession
                // *instance* preference, NOT a CategoryOptions flag — best-effort
                // (it throws on iOS-app-on-Mac, where it is unsupported).
                applyBestEffortAudioSetting("prefersNoInterruptionsFromSystemAlerts") {
                    try session.session.setPrefersNoInterruptionsFromSystemAlerts(true)
                }
                // Align AVFoundation's I/O with Opus's native codec parameters.
                // 48 kHz avoids a sample-rate conversion stage inside the driver;
                // 20 ms buffer matches Opus's default frame duration and reduces
                // packetization jitter. Both are best-effort hints — the OS may
                // silently ignore them when the hardware doesn't support the value.
                applyBestEffortAudioSetting("preferredSampleRate") {
                    try session.session.setPreferredSampleRate(48_000)
                }
                applyBestEffortAudioSetting("preferredIOBufferDuration") {
                    try session.session.setPreferredIOBufferDuration(0.02)
                }
                Logger.calls.info("RTCAudioSession pre-configured — videoUI: \(videoUIActive), activeNow=\(activateNow)")
            } catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == 4099 {
                // "Session deactivation failed" — le call précédent a laissé
                // AVAudioSession dans un état non-deactivable depuis ce process
                // (CallKit gère la deactivation via provider:didDeactivate:).
                // Bénin : RTCAudioSession.useManualAudio est déjà setté, et
                // CallKit pilote l'activation via didActivate. Downgrade en
                // warning pour ne pas polluer les crash dashboards.
                Logger.calls.warning("RTCAudioSession setConfiguration deactivation skipped — CallKit owns the session lifecycle (\(error.localizedDescription))")
            } catch {
                Logger.calls.error("RTCAudioSession configuration failed: \(error.localizedDescription)")
            }
        }
    }

    /// Re-applies just the AVAudioSession `.mode` (`.videoChat` vs `.voiceChat`)
    /// to match the CURRENT `isVideoEnabled`, without touching category,
    /// options, or activation. `configureAudioSession()` only ever runs once
    /// at call setup — a mid-call A/V switch (manual `toggleVideo()`, or the
    /// thermal-critical forced video downgrade) flips the WebRTC transceiver
    /// and the local track but never re-applies this, leaving the session
    /// tuned for the WRONG acoustic path (`.videoChat` expects loudspeaker +
    /// camera framing; `.voiceChat` is tuned for near-field/earpiece AEC) for
    /// the rest of the call. Calling the full `configureAudioSession()`
    /// instead would risk a mid-call activation glitch (it decides
    /// `active:` from `callUsesCallKit`); this only ever changes `.mode`.
    private func updateAudioSessionModeForCurrentVideoState() {
        guard !ProcessInfo.processInfo.isiOSAppOnMac else { return }
        // C7 — `isVideoUIActive`, pas `isVideoEnabled`. Un correspondant qui
        // allume seul sa caméra fait basculer l'UI en layout vidéo et rend le
        // PiP éligible ; la session doit suivre, sinon elle reste en
        // `.voiceChat` et `AVPictureInPictureVideoCallViewController` peut
        // refuser de démarrer. Appelé aussi depuis les deux écritures d'état
        // vidéo distant (track reçu, `call:media-toggled`).
        let videoUIActive = isVideoUIActive
        let mode = CallAudioSessionPolicy.mode(videoUIActive: videoUIActive, isiOSAppOnMac: false)
        audioSessionQueue.sync {
            let session = RTCAudioSession.sharedInstance()
            session.lockForConfiguration()
            defer { session.unlockForConfiguration() }
            // `call:media-toggled` peut arriver plusieurs fois pour la même
            // valeur ; `setMode` réinitialise les options implicites de la
            // catégorie (dont le routage par défaut de `.videoChat`), donc on
            // n'y touche que si le mode change réellement.
            guard session.session.mode != mode else { return }
            do {
                try session.session.setMode(mode)
                Logger.calls.info("[AUDIO_SESS] mode updated to \(mode.rawValue) for videoUI=\(videoUIActive)")
            } catch {
                Logger.calls.error("[AUDIO_SESS] mode update failed: \(error.localizedDescription)")
            }
        }
    }

    /// Returns whether the route override actually applied. `toggleSpeaker()`
    /// uses this to revert its optimistic `isSpeaker` flip on failure — see
    /// the doc-comment there. The early-return below (call not active yet) is
    /// reported as success: there is nothing to revert, the route simply
    /// hasn't been applied yet (it will be, once the call becomes active and
    /// this is invoked again from the audio-session lifecycle call sites).
    @discardableResult
    fileprivate func applySpeakerRoute() -> Bool {
        guard callState.isActive else { return true }
        let speaker = isSpeaker

        // CRITIQUE simulator : `.none` (= défaut earpiece/Receiver) ne route
        // PAS vers les haut-parleurs macOS sur iOS Simulator. L'audio est
        // décodé par WebRTC mais joué sur un port virtuel qui n'existe pas
        // côté Mac → silence total même si l'ADM tourne. On force `.speaker`
        // sur simulator pour mapper vers la sortie audio macOS.
        // Sur device réel, on garde le routing par défaut (`.none` = earpiece
        // pour `.voiceChat` mode) — l'utilisateur tient l'iPhone à l'oreille
        // ou tap le bouton speaker pour basculer.
        #if targetEnvironment(simulator)
        let port: AVAudioSession.PortOverride = .speaker
        #else
        // CALL-FIX 2026-06-05 (macOS) — same failure as the simulator on
        // iOS-app-on-Mac ("Designed for iPad", NOT Catalyst): there is no
        // earpiece, so `.none` routes to a virtual port that doesn't exist →
        // total silence even though the ADM is decoding. Force `.speaker` on Mac
        // so the audio maps to the Mac's output. Runtime check (`isiOSAppOnMac`)
        // because Mac uses the iphoneos slice, not a separate compile target.
        let forceSpeakerForMac = ProcessInfo.processInfo.isiOSAppOnMac
        let port: AVAudioSession.PortOverride = (speaker || forceSpeakerForMac) ? .speaker : .none
        #endif

        var succeeded = true
        audioSessionQueue.sync {
            let session = RTCAudioSession.sharedInstance()
            session.lockForConfiguration()
            defer { session.unlockForConfiguration() }
            do {
                try session.overrideOutputAudioPort(port)
                Logger.calls.info("Audio route override applied: \(port.rawValue) (isSpeaker=\(speaker))")
            } catch {
                Logger.calls.error("Audio route change failed: \(error.localizedDescription)")
                succeeded = false
            }
        }
        return succeeded
    }

    private func updateProximityMonitoring() {
        // Enable proximity monitoring only while the call UI is audio-only. The
        // sensor dims the screen (and blocks touch) when the phone is pressed to
        // the ear — essential for voice calls, harmful during video (blocks the
        // remote face). iOS handles dimming automatically once monitoring is on.
        //
        // Gated on `isVideoUIActive` (C7), not `isVideoEnabled`: a unilateral
        // video escalation by the REMOTE peer switches this device's UI to the
        // video layout without ever touching local `isVideoEnabled`. Gating on
        // the local-only flag left proximity monitoring armed for the whole
        // remote-video call — the sensor blanks the screen and eats touch input
        // the instant anything (a hand, a case flap) covers the sensor, exactly
        // the failure this function exists to avoid.
        let shouldMonitor = callState.isActive && !isVideoUIActive
        UIDevice.current.isProximityMonitoringEnabled = shouldMonitor
    }

    /// §RC-2 stuck-muted fallback. On iPhone/iPad the audio session is activated
    /// exclusively by CallKit's `provider:didActivate:` — self-activating BEFORE
    /// it fires breaks the audio device module ("no sound on 1st call"), so
    /// `transitionToConnected` is log-only there. But if CallKit never delivers
    /// `didActivate` (rare; observed after provider glitches), the call sits
    /// connected with dead mic + speaker and NO safety net — the half-open
    /// detector can't catch it (comfort-noise/DTX keeps RTP counters non-zero).
    /// After a short delay we re-check; if — and only if — the session is still
    /// stuck (didActivate never fired, audio disabled, call still active) we
    /// bridge the session exactly like the interruption-end path does. At that
    /// point audio is already broken, so the fallback can only improve things.
    /// NOTE: exercised in simulator only so far — needs a real-device pass
    /// (CallKit timing differs on hardware).
    private func scheduleStuckMutedFallback() {
        let armedForCallId = currentCallId
        audioActivationFallbackTask?.cancel()
        audioActivationFallbackTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.stuckMutedFallbackDelaySeconds))
            guard !Task.isCancelled, let self else { return }
            // Défensif : si l'appel qui a armé ce fallback s'est terminé et qu'un
            // autre a démarré entre-temps, ce timer ne parle plus pour personne —
            // sans ce guard il forcerait l'activation audio du NOUVEL appel avant
            // que CallKit n'ait eu la chance de le faire lui-même (cf. commentaire
            // ci-dessus sur le risque de casser l'audio device module).
            guard self.currentCallId == armedForCallId else { return }
            guard CallReliabilityPolicy.shouldForceAudioSessionActivation(
                usesCallKit: self.callUsesCallKit,
                didActivateFired: CallManager.callKitDidActivateFired,
                isAudioEnabled: RTCAudioSession.sharedInstance().isAudioEnabled,
                callIsActive: self.callState.isActive
            ) else { return }
            Logger.calls.fault("[AUDIO_FALLBACK] CallKit didActivate never fired \(Int(QualityThresholds.stuckMutedFallbackDelaySeconds))s after connect — forcing RTCAudioSession activation")
            self.audioSessionQueue.async {
                // Mirror of the interruption-end recovery: activate the system
                // session first, then bridge it to libwebrtc. Re-check the
                // flag INSIDE the queue — the outer checks above (armedForCallId,
                // shouldForceAudioSessionActivation) were read before this
                // deferred dispatch, and a hangup can race it from CallKit's
                // own private delegate queue.
                guard CallManager.isAudioSessionExpectedActive else {
                    Logger.calls.info("Skipping stuck-muted fallback reactivation — audio session already torn down")
                    return
                }
                do {
                    try AVAudioSession.sharedInstance().setActive(true, options: [])
                } catch {
                    Logger.calls.error("[AUDIO_FALLBACK] AVAudioSession activation failed: \(error.localizedDescription)")
                    return
                }
                let rtc = RTCAudioSession.sharedInstance()
                rtc.lockForConfiguration()
                rtc.audioSessionDidActivate(AVAudioSession.sharedInstance())
                rtc.isAudioEnabled = true
                rtc.unlockForConfiguration()
            }
        }
    }

    private func deactivateAudioSession() {
        // CallKit deactivates the AVAudioSession on its own when the call ends.
        // We only flip RTCAudioSession.isAudioEnabled; setActive(false) is the
        // job of provider:didDeactivate:.
        audioSessionQueue.sync {
            CallManager.isAudioSessionExpectedActive = false
            let session = RTCAudioSession.sharedInstance()
            session.lockForConfiguration()
            session.isAudioEnabled = false
            session.unlockForConfiguration()
        }
        // Sans CallKit (appel entrant app au premier plan, iOS-app-on-Mac),
        // `provider:didDeactivate:` ne viendra JAMAIS : la session
        // `.playAndRecord` + `.duckOthers` auto-activée restait active après
        // raccrochage — l'audio des autres apps restait ducké jusqu'à une
        // reconfiguration fortuite. Désactivation explicite symétrique.
        if !callUsesCallKit {
            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                Logger.calls.error("[no-callkit] AVAudioSession deactivation failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Socket.IO Signaling

    /// Maps a gateway-translated segment into the local `TranscriptionSegment` model.
    /// `text` ALWAYS carries the ORIGINAL (untranslated) text — never overwritten by
    /// `translatedText` — so the UI can offer an original/translated toggle
    /// (`docs/superpowers/specs/2026-07-11-call-captions-multispeaker-design.md`).
    /// `static` and testable without standing up a full `CallManager` + mock
    /// socket — the only non-deterministic input is `capturedAt` (wall clock
    /// at receipt, used for ordering + the "since call start" timestamp
    /// shown per row; `startMs`/`endMs` are the ORIGINATING device's
    /// ASR-buffer-relative timings and unsuitable for either — see
    /// `TranscriptionSegment.capturedAt` doc comment).
    static func makeTranscriptionSegment(from event: CallTranslatedSegmentData) -> TranscriptionSegment {
        let seg = event.segment
        // `capturedAtMs` (horloge murale de capture, estampillée par le device
        // du locuteur ou à défaut par le gateway à réception) est la clé
        // d'ordre du journal — le fallback `Date()` (heure de réception
        // locale) ne subsiste que pour les gateways antérieurs au champ.
        let capturedAt = seg.capturedAtMs.map { Date(timeIntervalSince1970: Double($0) / 1000) } ?? Date()
        return TranscriptionSegment(
            id: UUID(),
            wireId: seg.id,
            text: seg.text,
            speakerId: seg.speakerId,
            speakerDisplayName: seg.speakerDisplayName,
            startTime: Double(seg.startMs) / 1000,
            endTime: Double(seg.endMs) / 1000,
            isFinal: seg.isFinal,
            confidence: seg.confidence,
            // Tag de langue du Prisme : la langue dans laquelle le segment a
            // été TRANSCRIT (sourceLanguage), jamais la langue cible — la
            // traduction porte la sienne dans `translatedLanguage`.
            language: seg.sourceLanguage,
            translatedText: seg.translatedText,
            translatedLanguage: seg.translatedText != nil ? seg.targetLanguage : nil,
            capturedAt: capturedAt
        )
    }

    /// Entrée de journal arrivée en P2P direct par le data channel WebRTC —
    /// miroir de `makeTranscriptionSegment` pour l'autre transport. Pas de
    /// bornes ASR sur ce chemin (`startMs`/`endMs` sont de toute façon
    /// buffer-relatifs et inutilisables pour l'ordre) : `capturedAtMs` est la
    /// seule horloge, et `wireId` la clé de fusion avec le relais serveur
    /// traduit qui suit.
    static func makeTranscriptionSegment(from entry: DataChannelTranscriptEntry) -> TranscriptionSegment {
        TranscriptionSegment(
            id: UUID(),
            wireId: entry.id,
            text: entry.text,
            speakerId: entry.speakerId,
            speakerDisplayName: entry.speakerDisplayName.isEmpty ? nil : entry.speakerDisplayName,
            startTime: 0,
            endTime: 0,
            isFinal: entry.isFinal,
            confidence: entry.confidence,
            language: entry.language,
            capturedAt: Date(timeIntervalSince1970: Double(entry.capturedAtMs) / 1000)
        )
    }

    private func setupSocketListeners() {
        let socket = MessageSocketManager.shared

        // EXIGENCE №1 — degraded-signaling indicator. This subscription has NO
        // power over the call lifecycle (media is P2P; `didReconnect` re-joins
        // and resyncs); it only drives the discreet CallView banner.
        socket.$connectionState
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self else { return }
                self.isSignalingDegraded = CallReliabilityPolicy.signalingDegraded(
                    callEstablished: self.callState == .connected,
                    socketConnected: state == .connected
                )
                // Reconciliation — every hang-up/decline that happened while
                // the socket was down is replayed as soon as the transport
                // returns, even if no call is active anymore (the gateway end
                // handler is idempotent). ALL pending entries replay, not just
                // one — see pendingEndReconciliations' doc comment.
                if state == .connected, !self.pendingEndReconciliations.isEmpty {
                    let pending = self.pendingEndReconciliations
                    self.pendingEndReconciliations.removeAll()
                    for entry in pending {
                        let wasReject = entry.reason == "rejected"
                        Logger.calls.info("Reconciling deferred call:end after reconnect (callId=\(entry.callId), rejected=\(wasReject))")
                        if wasReject {
                            // Rejouer un refus en end plat ressusciterait le mislabel
                            // `missed` — la raison voyage avec la réconciliation.
                            self.emitCallReject(callId: entry.callId)
                        } else {
                            self.emitCallEndReliably(callId: entry.callId)
                        }
                    }
                }
            }
            .store(in: &cancellables)

        socket.callOfferReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                let myUserId = AuthManager.shared.currentUser?.id
                guard event.initiator.userId != myUserId else { return }
                guard self.currentCallId != event.callId else { return }
                // `mode` est l'architecture WebRTC ('p2p' | 'sfu'), PAS le
                // type média. Le type média est dans `type` ('audio' | 'video').
                // Avant le fix gateway, `mode` était lu et valait toujours 'p2p'
                // → isVideo == false même pour les appels vidéo.
                // On lit maintenant `type`. Si absent (anciens builds gateway),
                // on retombe sur `mode == "video"` pour compat ascendante.
                let isVideo: Bool
                if let typeValue = event.type {
                    isVideo = typeValue == "video"
                } else {
                    isVideo = event.mode == "video"
                }
                let callerName = event.initiator.displayName ?? event.initiator.username
                let dynamicIceServers = event.iceServers?.map { server in
                    IceServer(urls: server.urls.asArray, username: server.username, credential: server.credential)
                }
                self.handleIncomingCallNotification(
                    callId: event.callId,
                    fromUserId: event.initiator.userId,
                    fromUsername: callerName,
                    isVideo: isVideo,
                    iceServers: dynamicIceServers,
                    conversationId: event.conversationId
                )
            }
            .store(in: &cancellables)

        socket.callTranslatedSegmentReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                // Réception liée au panneau : panneau caché ⇒ désabonné du
                // canal (le segment est ignoré, pas accumulé en silence). Le
                // journal déjà reçu reste dans le service et se réaffiche à
                // la réouverture — seule resetForCallEnd le purge.
                guard self.transcriptionService.isShowingOverlay else { return }
                let segment = CallManager.makeTranscriptionSegment(from: event)
                self.transcriptionService.receiveTranslatedSegment(segment)
            }
            .store(in: &cancellables)

        // Signal de présence transcription : le pair a activé/fermé son
        // panneau → indicateur d'invitation sur l'icône captions. PAS de
        // garde isShowingOverlay ici — le signal doit précisément atteindre
        // un panneau fermé. Les échos de ses propres autres devices (même
        // compte, exclus du fanout socket par socket.to mais possibles via
        // un autre socket du même user) sont ignorés.
        socket.callTranscriptionActiveReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                guard event.speakerId != AuthManager.shared.currentUser?.id else { return }
                if event.active {
                    self.listeningPeers.insert(event.speakerId)
                } else {
                    self.listeningPeers.remove(event.speakerId)
                }
                self.remoteTranscriptionActive = !self.listeningPeers.isEmpty
                // Un pair qui ouvre son panneau devient un AUDITEUR : ce
                // device doit alors capturer son propre micro, panneau local
                // ouvert ou non — sinon le pair n'a rien à lire. Symétrie
                // stricte : quand le dernier auditeur ferme, la capture
                // s'arrête (cf. TranscriptionCapturePolicy).
                self.toggleTranscription()
            }
            .store(in: &cancellables)

        // Un pair peut quitter l'appel (raccroché, crash, coupure) panneau
        // OUVERT, sans jamais émettre `{active: false}` — son entrée
        // survivrait dans `listeningPeers` pour le reste de l'appel et ce
        // device continuerait de tapper le micro pour un auditeur qui n'existe
        // plus. Miroir exact du nettoyage web (`use-remote-transcription-active`,
        // Vague 134) : identité résolue par `userId` puis `participantId`.
        socket.callParticipantLeft
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                guard let identity = event.userId ?? event.participantId else { return }
                guard self.listeningPeers.remove(identity) != nil else { return }
                self.remoteTranscriptionActive = !self.listeningPeers.isEmpty
                self.toggleTranscription()
            }
            .store(in: &cancellables)

        // ⚠️ Crash SIGTRAP (≤ build 1175) — ces `.sink` sont implicitement @MainActor
        // (CallManager est @MainActor + SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor).
        // Les livrer sur `DispatchQueue.global` faisait échouer l'assertion
        // d'isolation Swift 6 (`dispatch_assert_queue` → EXC_BREAKPOINT) DÈS l'entrée
        // de la closure, sur le thread de fond → l'app crashait à CHAQUE
        // offer/answer/ICE candidate reçu pendant un appel (boucle crash → socket
        // tombe → reconnexion → recrash = le « connecte puis coupe »). On livre sur
        // la main queue : le wrapping SDP/ICE est trivial et `handle*` est déjà
        // @MainActor (le `Task { @MainActor }` interne était donc redondant).
        socket.callSignalOfferReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let sdpString = event.signal.sdp else { return }
                let sdp = SessionDescription(type: .offer, sdp: sdpString)
                self.handleSignalOffer(callId: event.callId, sdp: sdp, generation: event.signal.negotiationId ?? 0)
            }
            .store(in: &cancellables)

        socket.callAnswerReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let sdpString = event.signal.sdp else { return }
                let sdp = SessionDescription(type: .answer, sdp: sdpString)
                self.handleRemoteAnswer(callId: event.callId, sdp: sdp, generation: event.signal.negotiationId ?? 0)
            }
            .store(in: &cancellables)

        socket.callICECandidateReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let candidateString = event.signal.candidate else { return }
                let candidate = IceCandidate(
                    sdpMid: event.signal.sdpMid,
                    sdpMLineIndex: Int32(event.signal.sdpMLineIndex ?? 0),
                    candidate: candidateString
                )
                self.handleRemoteICECandidate(callId: event.callId, candidate: candidate, generation: event.signal.negotiationId ?? 0)
            }
            .store(in: &cancellables)

        socket.callEnded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                self.clearPendingIncomingCall(ifMatching: event.callId)
                self.handleRemoteEnd(callId: event.callId, rawReason: event.reason)
            }
            .store(in: &cancellables)

        // Audit P1-25 — surface missed calls explicitly. The gateway emits
        // both `call:ended` and `call:missed` for ringing-timeout scenarios;
        // listening here lets future UX (banner, badge) react to missed
        // calls without the ambiguity of `endedBy != self`.
        socket.callMissed
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                Logger.calls.info("call:missed received: callId=\(event.callId), caller=\(event.callerName ?? "?")")
                self.clearPendingIncomingCall(ifMatching: event.callId)
                if self.currentCallId == event.callId {
                    self.handleRemoteEnd(callId: event.callId, rawReason: "missed")
                }
            }
            .store(in: &cancellables)

        // Audit WS — `call:error` était décodé (MessageSocketManager.callError)
        // mais n'avait AUCUN abonné : un rejet serveur d'opération d'appel émis
        // hors de l'ACK `call:initiate` (ex. salle pleine, conversation fermée,
        // permission) laissait l'écran d'appel figé sans feedback ni teardown. On
        // surface le message et on termine l'appel si l'un est en cours/connexion.
        socket.callError
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                let message = event.message
                    ?? String(localized: "call.error.generic", defaultValue: "Erreur lors de l'appel", bundle: .main)
                Logger.calls.error("call:error received: code=\(event.code ?? "?") message=\(message)")
                // Call-scoping guard: RATE_LIMIT_EXCEEDED/TARGET_NOT_FOUND/etc. below
                // were each hardened one prod incident at a time, but none of them
                // (nor any future code) can be call-scoped without this — `CallError`
                // carries no callId at all until now. An error naming a DIFFERENT call
                // than the one currently active must never affect this device's
                // healthy call (e.g. a stale relay failure from a call that already
                // ended, or cross-talk from a duplicate-device session). Errors with
                // no callId (emit sites not yet call-scoped server-side, or pre-call
                // failures like auth) fall through to the existing per-code handling.
                if let errorCallId = event.callId, errorCallId != self.currentCallId {
                    Logger.calls.warning("call:error for a different call (\(errorCallId, privacy: .public) vs current \(self.currentCallId ?? "nil", privacy: .public)) — ignoring")
                    return
                }
                // INVALID_SIGNAL is a per-message relay rejection (a malformed or
                // non-WebRTC signal type), NOT a call-fatal operation error. It
                // must never tear down a healthy WebRTC call nor surface a user
                // toast — defense in depth against a stray app-level signal ever
                // reaching the strict gateway schema again.
                if event.code == "INVALID_SIGNAL" {
                    return
                }
                // [Audit prod 2026-07-02, C2] RATE_LIMIT_EXCEEDED is throttling
                // of ONE event (gateway cap `socket:call:ice` = 50 per 5 s; a
                // legitimate ICE-gathering flush emits 15-25 candidates per
                // millisecond) — dropping a candidate degrades nothing (ICE is
                // redundant by design). Treating it as fatal killed a live call
                // 382 ms after connection (callId 6a461199…935c, prod).
                if event.code == "RATE_LIMIT_EXCEEDED" {
                    Logger.calls.warning("call:error RATE_LIMIT_EXCEEDED — non-fatal, dropping throttled event")
                    return
                }
                // [Chaos-test prod 2026-07-02, EXIGENCE №1] TARGET_NOT_FOUND is
                // a TRANSIENT relay failure: the peer momentarily has no socket
                // in the call room (socket churn, re-join in flight after a
                // gateway restart). The P2P media is untouched — tearing down
                // here killed a healthy call while the peer re-joined seconds
                // later. ICE candidates are redundant by design and the answer
                // path has its own bounded retry; dropping the failed relay is
                // safe.
                if event.code == "TARGET_NOT_FOUND" {
                    Logger.calls.warning("call:error TARGET_NOT_FOUND — transient relay failure, keeping the call")
                    return
                }
                // CALL_ENDED is terminal-state reconciliation, NOT a user error:
                // the gateway rejected a late emit (join/signal/end) because the
                // call already ended — a benign race with the normal end fanout
                // (#12). Route through the canonical remote-end path (dedup on
                // .ended + correct Recents reason) instead of toasting "already
                // ended" and calling failCall, which would flag a healthy end as
                // a failure. Idempotent: handleRemoteEnd no-ops if already ended.
                if event.code == "CALL_ENDED" {
                    Logger.calls.info("call:error CALL_ENDED — reconciling to ended (benign terminal race, #12)")
                    if let endCallId = event.callId ?? self.currentCallId {
                        self.handleRemoteEnd(callId: endCallId)
                    }
                    return
                }
                FeedbackToastManager.shared.showError(message)
                // Ne teardown que si un appel est réellement en vol (ringing →
                // reconnecting). Une erreur hors-appel ne fait qu'afficher le toast.
                if self.callState.isActive {
                    self.failCall(message)
                }
            }
            .store(in: &cancellables)

        // Audit P1-30 — on Socket.IO reconnect, re-emit `call:join` so the
        // gateway puts us back in the call's room. Without this rejoin, ICE
        // continued via NWPathMonitor restart but every gateway-relayed
        // event targeting `ROOMS.call(callId)` (ICE candidates from peer,
        // re-offer on ICE restart, `call:ended`) was silently dropped — the
        // call became a zombie.
        socket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                guard self.callState.isActive, let callId = self.currentCallId else { return }
                Logger.calls.info("Socket reconnected — re-joining call room \(callId)")
                // Await the gateway's ACK before sending room-scoped events.
                // call:join is async server-side (DB lookup + socket.join); if we
                // fire call:request-ice-servers or call:toggle-video immediately the
                // gateway's `socket.rooms.has(ROOMS.call(callId))` guard fails and
                // those events are silently dropped.
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    let ackResult = await MessageSocketManager.shared.emitCallJoinWithAckDetailed(callId: callId)
                    guard self.callState.isActive, self.currentCallId == callId else { return }
                    // Vague 162 — the call already ended server-side during the
                    // disconnection (lost the race against the gateway's
                    // DISCONNECT_GRACE_MS window, or ended for another reason
                    // while we were offline) and the `call:ended` broadcast that
                    // would normally tell us was itself dropped by the very
                    // outage this handler exists to recover from. Previously we
                    // only logged "proceeding anyway" and never transitioned
                    // `callState` — the app stayed on the active-call screen
                    // forever, no retry offered, no indication anything ended.
                    // Route through the canonical remote-end path (same one
                    // `call:ended`/`call:error CALL_ENDED` use) with the real
                    // `endReason` so a transient cause (connectionLost/
                    // heartbeatTimeout) still offers « Réessayer ».
                    if ackResult.errorCode == "CALL_ENDED" {
                        Logger.calls.warning("Socket reconnect — call:join rejected, call already ended server-side (callId=\(callId), endReason=\(ackResult.endReason ?? "nil"))")
                        self.handleRemoteEnd(callId: callId, rawReason: ackResult.endReason)
                        return
                    }
                    if !ackResult.joined {
                        Logger.calls.warning("Socket reconnect — call:join ACK timed out (callId=\(callId)), proceeding anyway")
                    }
                    self.flushPendingIceCandidates()
                    // Re-sync video state with the peer. The gateway resets the peer's
                    // call:media-toggled view when our socket disconnects; after reconnect
                    // the peer defaults to assuming our camera is on, which is wrong if we
                    // toggled video off, are on hold, or are backgrounded.
                    //
                    // L6-2 — `isVideoSuspended` is deliberately absent: a socket
                    // reconnect is MOST likely precisely during a survival freeze,
                    // and folding the freeze in here re-emitted the very
                    // `media-toggled(video,false)` the actuator stopped sending —
                    // the peer would destroy the last frame anyway, one layer down.
                    // Only the two flags that mean "capture really stopped" count.
                    if self.isVideoEnabled {
                        let effectiveVideoOn = !self.isVideoSuspendedByCaptureInterruption
                            && !self.isVideoSuspendedByHold
                        MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: effectiveVideoOn)
                        Logger.calls.info("Socket reconnect — re-syncing video state to peer (effectiveVideoOn=\(effectiveVideoOn))")
                    }
                    // Re-sync audio mute state. The gateway resets per-participant
                    // media state when a socket disconnects; the peer defaults to
                    // assuming our mic is live, which is wrong if we were muted.
                    // Always emit (even when !isMuted) to overwrite any stale state.
                    MessageSocketManager.shared.emitCallToggleAudio(callId: callId, enabled: !self.isMuted)
                    Logger.calls.info("Socket reconnect — re-syncing audio mute state to peer (isMuted=\(self.isMuted))")
                    // Request fresh TURN credentials after reconnect. The socket may
                    // have been down long enough for our credentials to approach
                    // expiry (the periodic refresh only fires at 80% of the TTL,
                    // leaving a window of vulnerability for the remaining 20%).
                    // Cancel the periodic scheduler first so the
                    // old deadline doesn't fire while the fresh response is in flight,
                    // causing duplicate requests. The response re-arms the scheduler
                    // at the new TTL via `call:ice-servers-refreshed`.
                    self.turnRefreshTask?.cancel()
                    self.turnRefreshTask = nil
                    self.requestFreshTurnCredentials(callId: callId)
                    Logger.calls.info("Socket reconnect — requesting fresh TURN credentials for call \(callId)")
                }
            }
            .store(in: &cancellables)

        // Audit P1-27 — fired when another device of the same user answered.
        // Dismiss the local ringing UI with .answeredElsewhere so CallKit
        // displays "Answered on another device" in Recents.
        socket.callAlreadyAnswered
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                self.clearPendingIncomingCall(ifMatching: event.callId)
                guard self.currentCallId == event.callId,
                      case .ringing = self.callState else { return }
                Logger.calls.info("call:already-answered received — dismissing local ring (callId=\(event.callId))")
                if let uuid = self.activeCallUUID {
                    self.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .answeredElsewhere)
                }
                self.endCallInternal(reason: .remote)
            }
            .store(in: &cancellables)

        // P0-3 — the peer toggled its camera (call:media-toggled). The gateway
        // routes this to the OTHER participant only (socket.to(room)), so every
        // event we receive reflects the REMOTE peer's video state. Drives the
        // avatar placeholder in CallView instead of a frozen last frame.
        socket.callMediaToggled
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                guard event.callId == self.currentCallId else { return }
                switch event.mediaType {
                case "video":
                    self.isRemoteVideoEnabled = event.enabled
                    // C7 — la caméra du pair fait basculer `isVideoUIActive`, donc
                    // l'éligibilité au PiP système. `AVPictureInPictureVideoCall-
                    // ViewController` exige `.videoChat` : sans cette ré-application
                    // la session reste en `.voiceChat` sur escalade unilatérale et
                    // le PiP peut refuser de démarrer.
                    self.updateAudioSessionModeForCurrentVideoState()
                    // Le capteur de proximité doit se désarmer/réarmer en miroir de
                    // `isVideoUIActive` — sans cette ligne il reste actif pendant tout
                    // un appel vidéo escaladé unilatéralement par le pair et bloque
                    // l'écran/le tactile dès qu'un objet couvre le capteur.
                    self.updateProximityMonitoring()
                    // System PiP renders the raw remote track directly onto an
                    // AVSampleBufferDisplayLayer (bypassing SwiftUI's declarative
                    // placeholder branch below) — it needs an explicit nudge or
                    // it keeps showing the last live frame frozen indefinitely.
                    self.pip.setRemoteVideoMuted(!event.enabled)
                    Logger.calls.info("Remote video \(event.enabled ? "enabled" : "disabled") (callId=\(event.callId))")
                case "audio":
                    self.isRemoteAudioEnabled = event.enabled
                    Logger.calls.info("Remote audio \(event.enabled ? "enabled" : "muted") (callId=\(event.callId))")
                default:
                    break
                }
            }
            .store(in: &cancellables)

        socket.callScreenCaptureAlert
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                guard event.callId == self.currentCallId else { return }
                self.isRemoteScreenCapturing = event.isCapturing
                Logger.calls.info("Remote screen capture \(event.isCapturing ? "started" : "stopped") (callId=\(event.callId))")
            }
            .store(in: &cancellables)

        socket.callForcedLeave
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                self.clearPendingIncomingCall(ifMatching: event.callId)
                guard self.currentCallId == event.callId else { return }
                Logger.calls.warning("call:force-leave received — ending call (callId=\(event.callId) reason=\(event.reason ?? "unspecified"))")
                if let uuid = self.activeCallUUID {
                    self.callProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
                }
                self.endCallInternal(reason: .remote)
            }
            .store(in: &cancellables)

        socket.callIceServersRefreshed
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                let updated = event.iceServers.map { s in
                    IceServer(urls: s.urls.asArray, username: s.username, credential: s.credential)
                }
                self.webRTCService.updateIceServers(updated)
                Logger.calls.info("TURN credentials refreshed — \(updated.count) ICE servers updated")
                self.scheduleTURNCredentialRefresh(ttl: TimeInterval(event.ttl))
                // Audit #9 — `updateIceServers` is setConfiguration-only. When
                // these credentials were requested BY a reconnection cycle
                // (attemptReconnection → requestFreshTurnCredentials), the
                // in-flight restart may already be gathering with the
                // near-expiry ones; re-arm it now (same coalesce path as a
                // redundant network edge — no budget burned) so the re-gather
                // runs with the credentials just applied instead of idling
                // until the `.reconnecting` watchdog escalates.
                if CallReliabilityPolicy.shouldRearmRestartOnCredentialRefresh(state: self.callState) {
                    Logger.calls.info("fresh TURN credentials mid-reconnect — re-arming ICE restart (attempt \(self.reconnectAttempt))")
                    self.scheduleICERestart(attempt: self.reconnectAttempt, backoffSeconds: 0)
                }
            }
            .store(in: &cancellables)

        // Gateway emits call:quality-alert when the REMOTE peer's RTT or
        // packet loss exceeds thresholds. Surface this as a transient indicator
        // so the UI can show "Your contact is experiencing network issues" —
        // FaceTime-parity. Auto-clears 15 s after the last alert (sustained
        // poor quality keeps resetting the timer).
        socket.callQualityAlert
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                self.isRemoteQualityDegraded = true
                Logger.calls.info("Remote quality degraded: metric=\(event.metric) value=\(event.value) (callId=\(event.callId))")
                self.scheduleRemoteQualityReset()
            }
            .store(in: &cancellables)
    }

    private func scheduleRemoteQualityReset() {
        remoteQualityResetTask?.cancel()
        remoteQualityResetTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.remoteQualityResetSeconds))
            guard !Task.isCancelled else { return }
            self?.isRemoteQualityDegraded = false
        }
    }

    // MARK: - Participant Joined (Outgoing Call)

    private func listenForParticipantJoined(callId: String, toUserId: String, isVideo: Bool) {
        // Idempotent join handler: creates the offer exactly once. Guarded so a
        // replayed buffered event + the live event can't both fire it.
        let handleJoin: (CallParticipantData) -> Void = { [weak self] event in
            guard let self else { return }
            guard self.currentCallId == callId else { return }
            // Once we've started offering/connecting, ignore further joins.
            switch self.callState {
            case .offering, .connecting, .connected, .reconnecting: return
            default: break
            }
            self.participantJoinedCancellable?.cancel()
            Logger.calls.info("Participant joined call \(callId), creating offer")
            // Ancrage négociation côté appelant : l'appelé vient de décrocher,
            // la sonnerie est finie — tout ce qui suit est du setup technique.
            self.analyticsNegotiationStartDate = Date()

            // Update ICE servers with TURN credentials without recreating the peer connection
            if let servers = event.iceServers, !servers.isEmpty {
                let dynamicServers = servers.map { server in
                    IceServer(urls: server.urls.asArray, username: server.username, credential: server.credential)
                }
                self.webRTCService.updateIceServers(dynamicServers)
            }

            // Phase 1 fix E5: distinct .offering state. We're no longer ringing
            // (peer joined) but not yet connecting (no answer received). This
            // makes the FSM observable and matches the SOTA spec §2.2.
            // Le ring timeout 45s RESTE armé : le join est automatique à la
            // sonnerie (avant tout décroché humain), donc `.offering` = l'appelé
            // sonne encore. Il n'est annulé qu'à la réception de l'answer SDP
            // (handleRemoteAnswer) — sinon un appel sans réponse pendait sans
            // aucune horloge cliente une fois l'offer envoyé.
            self.callState = .offering
            Task { [weak self] in
                guard let self else { return }
                guard let offer = await self.webRTCService.createOffer() else {
                    // Post-await guard: if the call ended while createOffer() was
                    // building the SDP, peerConnection is nil → nil return.
                    // Don't clobber a clean end with .failed.
                    guard self.currentCallId == callId else { return }
                    // The callee already joined and is waiting for our offer —
                    // tell the gateway now instead of leaving them hanging until
                    // the cron reaper.
                    MessageSocketManager.shared.emitCallEnd(callId: callId)
                    self.failCall("Failed to create offer")
                    return
                }
                guard self.currentCallId == callId else {
                    Logger.calls.info("[CALL] participant-joined offer discarded: call ended during createOffer")
                    return
                }
                self.emitCallOffer(callId: callId, toUserId: toUserId, isVideo: isVideo, sdp: offer)
                Logger.calls.info("SDP offer sent for call: \(callId)")
            }
        }

        participantJoinedCancellable?.cancel()
        participantJoinedCancellable = MessageSocketManager.shared.callParticipantJoined
            .receive(on: DispatchQueue.main)
            .filter { $0.callId == callId }
            .sink { [weak self] event in
                handleJoin(event)
                self?.reannounceListeningIntent()
            }

        // CALL-FIX 2026-06-06 — the callee may have ALREADY joined (socket churn /
        // re-join / rapid retry) before this listener subscribed; the live
        // PassthroughSubject doesn't replay, so the offer would never be created
        // and the call would ring-timeout at 45s. Replay the SDK's buffered last
        // event if it matches this callId.
        if let buffered = MessageSocketManager.shared.lastCallParticipantJoined,
           buffered.callId == callId {
            Logger.calls.info("Replaying buffered participant-joined for \(callId)")
            handleJoin(buffered)
        }
    }

    // MARK: - Perfect Negotiation Role (§3.4) + Epoch (§3.5)

    /// §3.5 — current negotiation generation (high-water mark of generations
    /// SENT or SEEN). Stamped on every outgoing offer/answer/ICE; incoming
    /// signals older than this are dropped. Reset per call in
    /// `applyNegotiationRole` (CallManager is a singleton, so it must not carry
    /// over between calls — otherwise a peer with a higher counter from a prior
    /// call would wrongly drop the new call's first offer).
    private var negotiationId = 0

    /// Assigns the deterministic, symmetric polite/impolite role to the WebRTC
    /// client. Both peers compute it identically from the two userIds, so it is
    /// independent of who called whom and survives renegotiations. Called once
    /// per call, right after `webRTCService.configure`. Also resets the §3.5
    /// epoch for the new call (single per-call setup chokepoint).
    private func applyNegotiationRole() {
        negotiationId = 0
        // §7.7 — front camera by default on iPhone/iPad (mirror), not on Mac.
        isUsingFrontCamera = !ProcessInfo.processInfo.isiOSAppOnMac
        let localId = AuthManager.shared.currentUser?.id ?? ""
        let remoteId = remoteUserId ?? ""
        let polite = Self.isPolitePeer(localUserId: localId, remoteUserId: remoteId)
        webRTCService.setNegotiationRole(isPolite: polite)
        Logger.calls.debug("negotiation role: \(polite ? "polite" : "impolite") (local=\(localId, privacy: .public) remote=\(remoteId, privacy: .public))")
    }

    /// §3.5 — accept an incoming signal of `generation` unless it is stale
    /// (older than the high-water mark). Advances the mark on accept. The first
    /// signal of a call (generation 0 or 1) is always accepted.
    private func acceptIncomingNegotiation(_ generation: Int) -> Bool {
        if Self.isStaleNegotiation(incoming: generation, highWaterMark: negotiationId) {
            Logger.calls.info("[CALL-DIAG] dropping stale signal gen=\(generation) < current=\(self.negotiationId)")
            return false
        }
        negotiationId = max(negotiationId, generation)
        return true
    }

    /// Pure, testable epoch rule (§3.5): a signal is stale when its generation
    /// is strictly older than the highest already seen-or-sent. Equal/newer is
    /// accepted (offer, its answer, and the matching ICE share a generation).
    static func isStaleNegotiation(incoming: Int, highWaterMark: Int) -> Bool {
        incoming < highWaterMark
    }

    /// §3.5 — begin a new outgoing negotiation: bump the epoch and return it to
    /// stamp on the offer. Only offer creation starts a new generation; the
    /// answer and ICE reuse the current value.
    private func nextOutgoingNegotiationId() -> Int {
        negotiationId += 1
        return negotiationId
    }

    /// Pure, testable politeness rule (W3C perfect negotiation): the
    /// lexicographically-smaller userId is the polite peer. Symmetric — peer A
    /// comparing (idA, idB) and peer B comparing (idB, idA) both reduce to
    /// `min(idA, idB)` and therefore agree without any extra signaling. Returns
    /// `false` (impolite) when an id is missing, so a misconfigured side never
    /// yields blindly. Scales cleanly to SFU later (client always polite).
    static func isPolitePeer(localUserId: String, remoteUserId: String) -> Bool {
        guard !localUserId.isEmpty, !remoteUserId.isEmpty, localUserId != remoteUserId else { return false }
        return localUserId < remoteUserId
    }

    /// Resolves the preferred transcription/call language for a participant per
    /// Prisme Linguistique (full 5-level chain, mirroring `MeeshyUser.preferredContentLanguages`):
    ///   1. `systemLanguage`            — primary in-app preference
    ///   2. `regionalLanguage`          — secondary in-app preference
    ///   3. `customDestinationLanguage` — per-conversation override
    ///   4. `deviceLocale`              — OS-level locale (4th priority, normalised to ISO 639-1)
    ///   5. `"fr"`                      — ultimate fallback
    /// Pure + static — no side effects, no async, safe to unit test directly.
    static func preferredCallLanguage(for user: MeeshyUser?) -> String {
        user?.systemLanguage
            ?? user?.regionalLanguage
            ?? user?.customDestinationLanguage
            ?? MeeshyUser.normalizeLanguageCode(user?.deviceLocale)
            ?? "fr"
    }

    // MARK: - Socket Emit Helpers

    private func emitCallOffer(callId: String, toUserId: String, isVideo: Bool, sdp: SessionDescription) {
        let fromUserId = AuthManager.shared.currentUser?.id ?? ""
        // §3.5 — a new offer opens a new negotiation generation.
        let generation = nextOutgoingNegotiationId()
        let payload: [String: Any] = [
            "sdp": sdp.sdp, "to": toUserId, "from": fromUserId, "negotiationId": generation
        ]
        // §6.3 — at-least-once delivery. The offer is the single most critical
        // signal (no offer ⇒ caller rings forever, callee stuck "Connexion…").
        // Fire-and-forget dropped it silently on socket churn; the gateway
        // buffer/replay (§4.6) is the *backstop* for a target not-yet-in-room,
        // but the EMITTER must also retry when its own socket lost the frame.
        offerRetryTask?.cancel()
        offerRetryTask = Task { [weak self] in
            await self?.emitOfferWithRetry(callId: callId, payload: payload, generation: generation)
        }
    }

    /// §6.3 — ACK + bounded exponential backoff for the SDP offer. Stops early
    /// if the call ended or a newer negotiation superseded this offer (epoch),
    /// so a stale retry never lands on the peer after a renegotiation.
    private func emitOfferWithRetry(callId: String, payload: [String: Any], generation: Int) async {
        let maxAttempts = QualityThresholds.signalOfferMaxAttempts
        var delay: TimeInterval = QualityThresholds.signalRetryInitialDelaySeconds
        for attempt in 1...maxAttempts {
            guard !Task.isCancelled, currentCallId == callId, generation >= negotiationId else {
                Logger.calls.info("[CALL-DIAG] offer gen=\(generation) superseded/cancelled — stop retry")
                return
            }
            let acked = await MessageSocketManager.shared.emitCallSignalWithAck(
                callId: callId, type: "offer", payload: payload
            )
            if acked {
                if attempt > 1 { Logger.calls.info("[CALL-DIAG] offer ACK'd on attempt \(attempt)") }
                return
            }
            Logger.calls.warning("[CALL-DIAG] offer ACK timed out (attempt \(attempt)/\(maxAttempts)) call=\(callId)")
            if attempt < maxAttempts {
                try? await Task.sleep(for: .seconds(delay))
                delay *= 2
            }
        }
        Logger.calls.error("[CALL-DIAG] offer never ACK'd after \(maxAttempts) attempts — relying on gateway replay (§4.6)")
    }

    /// PERF-004: Awaits gateway ACK (3s timeout) confirming the SDP answer
    /// was relayed to the remote peer. Returning from this method means the
    /// answer is on the wire — so CXAnswerCallAction.fulfill() can run with
    /// confidence that the ICE/SDP exchange has actually started.
    @discardableResult
    private func emitCallAnswer(callId: String, toUserId: String, sdp: SessionDescription) async -> Bool {
        let fromUserId = AuthManager.shared.currentUser?.id ?? ""
        // §3.5 — the answer belongs to the offer's generation (the current
        // high-water mark, advanced when the offer was accepted).
        let generation = negotiationId
        let payload: [String: Any] = [
            "sdp": sdp.sdp, "to": toUserId, "from": fromUserId, "negotiationId": generation
        ]
        // PERF-004 — first attempt awaited inline so CXAnswerCallAction.fulfill()
        // is paired with a relayed answer in the common case.
        let acked = await MessageSocketManager.shared.emitCallSignalWithAck(
            callId: callId, type: "answer", payload: payload
        )
        if acked { return true }
        // H3 — an un-ACK'd answer used to be dropped silently, leaving the peer
        // stuck on "Connexion…" until the reliability watchdog fired. The offer
        // already retries (`emitOfferWithRetry`); mirror it for the answer, but
        // in the BACKGROUND so the CallKit fulfill window isn't blocked. The
        // gateway dedupes the duplicate by `negotiationId` (§3.5), so a re-sent
        // answer never causes glare.
        Logger.calls.warning("[CALL-DIAG] answer ACK timed out (attempt 1) call=\(callId) — retrying in background")
        answerRetryTask?.cancel()
        answerRetryTask = Task { [weak self] in
            await self?.emitAnswerRetry(callId: callId, payload: payload, generation: generation)
        }
        return false
    }

    /// H3 — bounded exponential backoff for the SDP answer (attempts 2…4, the
    /// first having run inline in `emitCallAnswer`). Stops early if the call
    /// ended or a newer negotiation superseded this answer (epoch), so a stale
    /// answer never lands on the peer after a renegotiation.
    private func emitAnswerRetry(callId: String, payload: [String: Any], generation: Int) async {
        var delay: TimeInterval = QualityThresholds.signalRetryInitialDelaySeconds
        let total = QualityThresholds.signalAnswerTotalAttempts
        for attempt in 2...total {
            guard !Task.isCancelled, currentCallId == callId, generation >= negotiationId else {
                Logger.calls.info("[CALL-DIAG] answer gen=\(generation) superseded/cancelled — stop retry")
                return
            }
            try? await Task.sleep(for: .seconds(delay))
            delay *= 2
            guard !Task.isCancelled, currentCallId == callId, generation >= negotiationId else { return }
            let acked = await MessageSocketManager.shared.emitCallSignalWithAck(
                callId: callId, type: "answer", payload: payload
            )
            if acked {
                Logger.calls.info("[CALL-DIAG] answer ACK'd on attempt \(attempt)")
                return
            }
            Logger.calls.warning("[CALL-DIAG] answer ACK timed out (attempt \(attempt)/\(total)) call=\(callId)")
        }
        Logger.calls.error("[CALL-DIAG] answer never ACK'd after \(total) attempts — relying on gateway replay (§4.6)")
    }

    // Refus explicite = `call:end {reason: "rejected"}` (plus `call:leave`) :
    // le leave pré-décroché terminait bien l'appel 1:1 mais le serveur le
    // résolvait en `missed` — notification « appel manqué » envoyée au callee
    // qui venait de REFUSER, et refus compté dans le filtre « manqués » du
    // journal. Parité Android/web (fix 2026-07-12).
    private func emitCallReject(callId: String) {
        // Refus socket-down (parité Android DeclinedCallStore) : un refus émis
        // dans une socket morte est JETÉ par le SDK — l'appelant sonnerait les
        // 60 s de la fenêtre serveur et l'appel se résoudrait `missed`. Cas
        // typique : push VoIP à froid, l'utilisateur refuse avant la fin du
        // handshake socket. Différé + rejoué avec sa raison au reconnect.
        guard MessageSocketManager.shared.isConnected else {
            armPendingEndReconciliation(callId: callId, reason: "rejected")
            Logger.calls.warning("call:end (rejected) deferred — socket down, will reconcile on reconnect (callId=\(callId))")
            return
        }
        // ACK parity avec emitCallEndReliably (2026-08-11) : un socket vu
        // "connecté" au moment du refus n'implique pas que l'emit atteint le
        // gateway — un blip qui s'auto-répare avant que `connectionState` ne
        // publie la coupure le laisse filer sans ACK ni réconciliation. Le
        // déclinant a déjà fermé localement (endCallInternal a tourné avant
        // cet appel), l'appelant sonne alors jusqu'au timeout (~45-60s) et le
        // gateway résout `missed` au lieu de `rejected` — le même mislabel
        // que l'arc reject 2026-07-12 fermait déjà sur les autres chemins,
        // ici rouvert par la seule fenêtre "connecté mais jamais livré".
        Task { [weak self] in
            let acked = await MessageSocketManager.shared.emitCallRejectWithAck(callId: callId)
            if !acked {
                MessageSocketManager.shared.emitCallReject(callId: callId)
                self?.armPendingEndReconciliation(callId: callId, reason: "rejected")
                Logger.calls.warning("call:end (rejected) ACK failed pour \(callId) — fallback émis + réconciliation armée pour le prochain connect")
            }
        }
    }

    // MARK: - Duration Formatting

    var formattedDuration: String {
        Self.formatDuration(callDuration)
    }

    /// Ce que VoiceOver ENTEND de la durée d'appel — « 2 minutes 5 secondes ».
    ///
    /// Six sites (`CallView` ×5, `FloatingCallPillView`) passaient
    /// `formattedDuration` à `.accessibilityValue` : le synthétiseur lit
    /// « 02:05 » comme une HEURE. 206i/210i/211i avaient donné son libellé à
    /// cette valeur (« Durée de l'appel ») ; le libellé nomme la mesure, il ne
    /// corrige pas l'orthographe de ce qu'il introduit.
    var spokenDuration: String {
        Self.spokenDuration(callDuration)
    }

    /// Pure helper — extracted for unit-testability without touching `callDuration`.
    ///
    /// L'orthographe est celle de l'app Téléphone : minutes remplies à deux
    /// chiffres sous l'heure (« 02:05 »), heures dès qu'il y en a
    /// (« 1:05:00 »). Elle diffère volontairement de celle des minuteries média
    /// (« 2:05 », `DurationClock.minuteSecond`), et c'est le seul appelant du
    /// dépôt à promouvoir les heures.
    ///
    /// `locale` est un paramètre — et non `.current` en dur — pour la raison
    /// devenue idiomatique depuis 234i : sans elle, une suite jugerait la
    /// locale du SIMULATEUR, verte en local et rouge en CI.
    nonisolated static func formatDuration(
        _ duration: TimeInterval,
        locale: Locale = .current
    ) -> String {
        let total = LocalizedNumber.wholeSeconds(from: duration)
        return LocalizedNumber.duration(
            seconds: total,
            clock: total >= 3600 ? .hourMinuteSecond : .paddedMinuteSecond,
            locale: locale
        )
    }

    nonisolated static func spokenDuration(
        _ duration: TimeInterval,
        locale: Locale = .current
    ) -> String {
        LocalizedNumber.spokenDuration(seconds: duration, locale: locale)
    }
}

// MARK: - ThermalStateMonitorDelegate

extension CallManager: ThermalStateMonitorDelegate {
    nonisolated func thermalStateDidChange(to state: ProcessInfo.ThermalState) {
        Task { @MainActor [weak self] in
            guard let self, self.callState == .connected else { return }
            // PiP : framerate thermal-aware (la vignette est petite → throttle
            // agressif possible). Restauré à 15 fps dès le retour en nominal/fair.
            self.pip.setMaxFrameRate(self.pipFrameRate(for: state))
            if state == .critical {
                self.webRTCService.videoFilters.reset()
                Logger.calls.warning("Thermal critical — disabled all filters (video)")
                if self.isVideoEnabled {
                    self.isVideoEnabled = false
                    // Audit finding — this used to call downgradeFromVideo()
                    // directly here, unserialized against videoToggleTask/
                    // holdVideoTask/survivalVideoTask. A thermal-critical event
                    // firing mid-toggle (or mid-hold/unhold) ran a fourth,
                    // concurrent camera/transceiver actuation — exactly what
                    // every other site in this file chains onto the previous
                    // task to prevent (upgradeToVideo/downgradeFromVideo never
                    // check cancellation mid-flight and two concurrent calls
                    // corrupt state). Route through the same chained-task
                    // pattern as toggleVideo/handleHold/applySurvivalVideoSend.
                    let previousToggle = self.videoToggleTask
                    let previousHold = self.holdVideoTask
                    let previousSurvival = self.survivalVideoTask
                    let previousICERestart = self.iceRestartTask
                    let previousAnswer = self.signalOfferAnswerTask
                    let previousCameraSwitch = self.cameraSwitchTask
                    self.videoToggleTask?.cancel()
                    self.videoToggleTask = Task { @MainActor [weak self] in
                        await previousToggle?.value
                        await previousHold?.value
                        _ = await previousSurvival?.value
                        await previousICERestart?.value
                        await previousAnswer?.value
                        await previousCameraSwitch?.value
                        guard let self, !Task.isCancelled else { return }
                        // §5.4 — use downgradeFromVideo (sets transceiver direction +
                        // stops capture) rather than enableVideo(false) (track.enabled
                        // only). Without the direction change the peer's SDP still
                        // advertises sendRecv and the RTP session stays open, which
                        // means the peer's decoder never tears down and the "camera off"
                        // media-toggled is the only signal it gets — race-prone and
                        // semantically wrong. Mirror the manual toggleVideo() path.
                        let needsRenegotiation = await self.webRTCService.downgradeFromVideo()
                        guard !Task.isCancelled else { return }
                        // Audit finding — the line above was missing: without it, an
                        // in-flight thermal downgrade that got cancelled (e.g. the user
                        // re-enabled video, which cancels this Task via videoToggleTask)
                        // ran to completion anyway, emitting a stale "video off" offer to
                        // the peer right after the newer task's "video on" offer — a
                        // real, avoidable flicker. Mirrors toggleVideo/handleHold, which
                        // both recheck cancellation immediately after this same await.
                        self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
                        self.updateAudioSessionModeForCurrentVideoState()
                        self.videoSurvivalController.reset()
                        // P0-3 — signal the peer (avatar placeholder, not a frozen frame).
                        if let callId = self.currentCallId {
                            MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                        }
                        // Renegotiate so the peer's SDP transceiver direction matches
                        // the video downgrade (media-toggled alone does not update the
                        // remote offer's m-sections).
                        if needsRenegotiation,
                           let callId = self.currentCallId,
                           let userId = self.remoteUserId,
                           let offer = await self.webRTCService.createOffer(),
                           self.currentCallId == callId {
                            self.emitCallOffer(callId: callId, toUserId: userId, isVideo: false, sdp: offer)
                            Logger.calls.warning("Thermal critical — SDP renegotiation offer emitted (video downgrade)")
                        }
                        Logger.calls.warning("Thermal critical — disabled video")
                    }
                }
            } else if state == .serious {
                self.webRTCService.videoFilters.config.backgroundBlurEnabled = false
                self.webRTCService.videoFilters.config.skinSmoothingEnabled = false
                Logger.calls.warning("Thermal serious — disabled advanced filters")
            }
        }
    }
}

// MARK: - WebRTCServiceDelegate

extension CallManager: WebRTCServiceDelegate {
    nonisolated func webRTCService(_ service: WebRTCService, didGenerateCandidate candidate: IceCandidate) {
        Task { @MainActor [weak self] in
            guard let self, let callId = self.currentCallId, let userId = self.remoteUserId else { return }
            let fromUserId = AuthManager.shared.currentUser?.id ?? ""
            // CRITIQUE — `sdpMLineIndex` DOIT être un Int (pas une String) :
            // le gateway valide via Zod `z.number().optional()` et rejette
            // tout signal ICE avec un sdpMLineIndex string. Sans cela, AUCUN
            // candidate ICE n'est relayé au peer → ICE checking ne démarre
            // jamais et le call reste bloqué en `new` jusqu'au timeout.
            var payload: [String: Any] = [
                "candidate": candidate.candidate,
                "sdpMLineIndex": Int(candidate.sdpMLineIndex),
                "to": userId,
                "from": fromUserId,
                // §3.5 — candidates belong to the current negotiation generation.
                "negotiationId": self.negotiationId
            ]
            if let sdpMid = candidate.sdpMid {
                payload["sdpMid"] = sdpMid
            }
            if MessageSocketManager.shared.isConnected {
                MessageSocketManager.shared.emitCallSignal(
                    callId: callId,
                    type: "ice-candidate",
                    payload: payload
                )
                Logger.calls.debug("Sent ICE candidate for call: \(callId)")
            } else {
                // Cap the buffer: ICE can generate 50+ candidates in a single
                // restart round.  Candidates beyond the cap are for transports
                // we'll never relay anyway (stale ICE generation) and would
                // only bloat the flush on reconnect.
                if self.pendingIceCandidates.count < QualityThresholds.maxPendingIceCandidates {
                    self.pendingIceCandidates.append(["callId": callId, "payload": payload])
                    Logger.calls.debug("Buffered ICE candidate (socket down) for call: \(callId)")
                } else {
                    Logger.calls.warning("ICE candidate buffer full (\(QualityThresholds.maxPendingIceCandidates)) — dropping candidate for call: \(callId)")
                }
            }
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didChangeConnectionState state: PeerConnectionState) {
        Task { @MainActor [weak self] in
            self?.connectionQuality = state
        }
    }

    nonisolated func webRTCServiceDidConnect(_ service: WebRTCService) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            // FIX 2026-05-12 — transition directe à `.connected` sur ICE
            // connected, plus de gate RTP bloquant.
            //
            // Symptôme rapporté : "l'appelé se connecte mais pas l'appelant".
            // Cause racine : le caller envoyait son RTP mais ne recevait pas
            // celui du callee (NAT asymétrique, codec mismatch, ou simplement
            // 1ère seconde après ICE négociée — pas encore de packets entrants).
            // L'ancien RTP gate exigeait ≥5 inbound packets pour transitionner
            // à .connected, ce qui pour le caller pouvait ne JAMAIS arriver
            // → caller restait en .connecting indéfiniment pendant que le
            // callee (qui recevait bien le RTP du caller) passait à .connected.
            //
            // Nouvelle politique :
            // - ICE connected = call établi du point de vue signaling → on
            //   transitionne à .connected immédiatement
            // - Le RTP gate continue de tourner en parallèle MAIS uniquement
            //   pour informer la qualité (log debug si pas de RTP). Il
            //   n'affecte plus le state machine
            // - Si vraiment aucun RTP n'arrive jamais, l'utilisateur entend
            //   du silence — c'est un signal métier (mute, mic off, network)
            //   pas une raison de couper l'appel.
            // §5.8 — the reliability monitor (started at call setup) owns the
            // half-open self-heal once `.connected`; no per-connect RTP task here.
            switch self.callState {
            case .connecting:
                Logger.calls.info("[CallFSM] ICE connected — transition à .connected")
                self.transitionToConnected()
            case .reconnecting:
                Logger.calls.info("Reconnection successful — transition à .connected")
                self.transitionToConnected()
            case .offering:
                // ICE connected en .offering : handleRemoteAnswer n'a pas
                // tourné mais ICE a réussi. Catch-up direct à .connected.
                Logger.calls.warning("[CallFSM] ICE connected while state=.offering — direct catch-up à .connected")
                self.callState = .connecting
                self.transitionToConnected()
            default:
                Logger.calls.debug("[CallFSM] webRTCServiceDidConnect ignored in state \(String(describing: self.callState))")
            }
        }
    }

    nonisolated func webRTCServiceDidDisconnect(_ service: WebRTCService) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            let isFatal = self.webRTCService.connectionState == .failed
                       || self.webRTCService.connectionState == .closed
            switch self.callState {
            case .connected:
                self.attemptReconnection()
            case .reconnecting where !isFatal:
                // Transient ICE flap during renegotiation — in-flight Task owns the loop.
                Logger.calls.info("WebRTC disconnected during ICE restart — ignoring transient flap")
            case .reconnecting:
                // Fatal PeerConnection .failed/.closed during ICE restart: the
                // in-flight attempt is dead — escalate (advance the budget)
                // rather than coalesce into it.
                Logger.calls.warning("WebRTC fatal disconnect during ICE restart — triggering next attempt")
                self.attemptReconnection(escalate: true)
            default:
                Logger.calls.info("WebRTC disconnected in state: \(String(describing: self.callState))")
            }
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didReceiveTranscriptionData data: Data) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            switch DataChannelInbound.decode(data) {
            case .bye(let reason):
                // Raccroché in-band du pair : coupure IMMÉDIATE, sans attendre
                // le fanout serveur `call:ended` (qui suit et se dédup via le
                // garde `.ended` de handleRemoteEnd).
                guard let callId = self.currentCallId else { return }
                Logger.calls.info("DataChannel bye received — ending call instantly (callId=\(callId))")
                self.handleRemoteEnd(callId: callId, rawReason: reason)
            case .transcriptEntry(let entry):
                // Journal de transcription en P2P direct : même garde d'appel
                // que le sink socket `callTranslatedSegmentReceived` — une
                // entrée d'un appel déjà terminé/remplacé est ignorée, et la
                // réception est liée au panneau (caché ⇒ désabonné, comme le
                // chemin socket). Révisions partielles et final d'un même
                // énoncé partagent leur `wireId` : chaque correction remplace
                // la précédente en place, puis la traduction relayée par le
                // gateway fusionne dans CallTranscriptionService.
                guard self.currentCallId == entry.callId else { return }
                guard self.transcriptionService.isShowingOverlay else { return }
                let segment = CallManager.makeTranscriptionSegment(from: entry)
                self.transcriptionService.receivePeerEntry(segment)
            case .ignored:
                break
            }
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didReceiveRemoteVideoTrack track: Any) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            let wasVideoUIActive = self.isVideoUIActive
            self.hasRemoteVideoTrack = true
            // C7 — première arrivée du track distant sur un appel démarré en
            // audio : `configureAudioSession()` a figé `.voiceChat` au setup, où
            // `hasRemoteVideoTrack` était encore faux. Sans cette ligne la session
            // n'est jamais réalignée et le PiP peut refuser de démarrer.
            if !wasVideoUIActive && self.isVideoUIActive {
                self.updateAudioSessionModeForCurrentVideoState()
                self.updateProximityMonitoring()
            }
            // Robustesse — track distant recréé (ICE restart) : ré-attache le
            // renderer PiP au nouveau track sans reconstruire le controller AVKit
            // (no-op si le PiP n'est pas configuré). On relit `remoteVideoTrack`
            // sur le MainActor (déjà à jour côté client) plutôt que de capturer
            // le param non-Sendable `track` à travers la frontière d'isolation.
            if let current = self.remoteVideoTrack {
                self.pip.updateRemoteTrack(current as AnyObject)
                if self.pipConfiguredTrack != nil { self.pipConfiguredTrack = current as AnyObject }
            }
            Logger.calls.info("Remote video track received in CallManager")
        }
    }

    /// C3 — la session de capture caméra a été interrompue (ou l'interruption a
    /// pris fin). C'est le SEUL fait qui prouve que la caméra ne délivre plus :
    /// le passage en arrière-plan ne l'éteint pas quand un PiP système est actif
    /// et que la session porte `isMultitaskingCameraAccessEnabled`.
    nonisolated func webRTCService(_ service: WebRTCService, didChangeCameraInterruption interrupted: Bool) {
        Task { @MainActor [weak self] in
            self?.applyCameraSuspension(interrupted, cause: "capture-interruption")
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didChangeQualityLevel level: VideoQualityLevel, from previous: VideoQualityLevel) {
        Task { @MainActor [weak self] in
            guard let self, case .connected = self.callState else { return }
            guard UIAccessibility.isReduceMotionEnabled == false else { return }
            let generator = UINotificationFeedbackGenerator()
            switch level {
            case .poor, .critical:
                generator.notificationOccurred(.error)
            case .excellent, .good:
                if previous <= .fair {
                    generator.notificationOccurred(.success)
                }
            case .fair:
                break
            }
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didCollectStats stats: CallStats, level: VideoQualityLevel, packetLossPercent: Double) {
        Task { @MainActor [weak self] in
            guard let self, let callId = self.currentCallId else { return }
            // Always update cumulative stats for the call summary: byte counters
            // grow through ICE restart and the final snapshot must be fresh.
            self.lastKnownStats = stats
            // During ICE restart (.reconnecting) and initial setup (.connecting)
            // the RTP stream is paused: Δlost and Δreceived are both zero, so
            // RTT=0 and loss=0 — which reads as ".excellent" quality. Reporting
            // that level to the UI, the gateway, or the survival controller while
            // the call shows "Reconnecting…" misleads users and resets the survival
            // controller's degraded-streak timer prematurely. Gate all reporting
            // on callState == .connected.
            guard case .connected = self.callState else { return }
            self.liveVideoQualityLevel = level
            self.isLinkQualityDegraded = self.degradedLinkTracker.record(level: level)
            MessageSocketManager.shared.emitCallQualityReport(
                callId: callId,
                level: Self.connectionQualityLabel(for: level),
                rtt: stats.roundTripTimeMs,
                packetLoss: packetLossPercent,
                bytesSent: stats.bandwidth,
                bytesReceived: stats.bytesReceived,
                availableOutgoingBitrateBps: stats.availableOutgoingBitrateBps,
                jitterMs: stats.jitterMs
            )

            // Accumulate quality distribution and RTT/loss running stats.
            let now = Date()
            if let prevDate = self.analyticsLastQualityDate, let prevLevel = self.analyticsCurrentLevel {
                self.analyticsQualitySeconds[prevLevel, default: 0] += now.timeIntervalSince(prevDate)
            }
            self.analyticsLastQualityDate = now
            self.analyticsCurrentLevel = level
            self.analyticsRttSum += stats.roundTripTimeMs
            self.analyticsSampleCount += 1
            self.analyticsPacketLossSum += packetLossPercent
            self.analyticsMaxPacketLoss = max(self.analyticsMaxPacketLoss, packetLossPercent)
            // Mirrors analyticsVideoFiltersUsed's polling above it: analyticsEffectsUsed
            // was declared and serialized into the analytics payload but never actually
            // populated (no call site ever inserted into it), so every call silently
            // reported effectsUsed: []. Record the concrete effects the config exposes.
            let filterConfig = self.webRTCService.videoFilters.config
            if filterConfig.isEnabled {
                self.analyticsVideoFiltersUsed = true
                self.analyticsEffectsUsed.insert("colorFilter")
            }
            if filterConfig.backgroundBlurEnabled {
                self.analyticsEffectsUsed.insert("backgroundBlur")
            }
            if filterConfig.skinSmoothingEnabled {
                self.analyticsEffectsUsed.insert("skinSmoothing")
            }

            // Feed the graceful-degradation survival layer. One sample per quality
            // tick; the controller's time-based hysteresis decides if a sustained
            // poor link warrants dropping to audio-only (and later recovering).
            self.videoSurvivalController.handle(level: level, userWantsVideo: self.isVideoEnabled)
        }
    }

    /// Map the 5-tier client quality ladder onto the gateway's 4-tier
    /// `ConnectionQualityLevel` (critical collapses into poor).
    nonisolated static func connectionQualityLabel(for level: VideoQualityLevel) -> String {
        switch level {
        case .excellent: return "excellent"
        case .good: return "good"
        case .fair: return "fair"
        case .poor, .critical: return "poor"
        }
    }

    /// Requests a reconnection. External triggers (NWPathMonitor edges, the
    /// PC-state delegate, the `.connecting` watchdog, the half-open self-heal)
    /// use the default `escalate: false` — when a cycle is already in flight
    /// they COALESCE into it (re-arming its ICE restart) instead of advancing
    /// `reconnectAttempt`, so a single network blip whose lost/restored edges
    /// both fire no longer burns the `maxReconnectAttempts` budget. Only the
    /// `.reconnecting` watchdog and a failed restart offer pass
    /// `escalate: true` to advance the budget (and eventually trip the cap →
    /// `.connectionLost`).
    @MainActor
    private func attemptReconnection(escalate: Bool = false) {
        // FSM §3.2 — `.reconnecting` est réservé aux appels dont la négociation
        // média a commencé. Avant l'answer (.ringing/.offering) aucun ICE
        // restart n'est possible (pas de remote description) et la bascule
        // d'état faisait rendre l'écran connecté (00:00 figé) pendant que
        // l'appelé sonnait encore.
        guard CallReliabilityPolicy.reconnectingAllowed(from: callState) else {
            Logger.calls.warning("attemptReconnection ignoré en état \(String(describing: self.callState)) — réservé aux appels en négociation/établis (FSM §3.2)")
            return
        }
        let isAlreadyReconnecting: Bool
        if case .reconnecting = callState { isAlreadyReconnecting = true } else { isAlreadyReconnecting = false }

        switch CallReliabilityPolicy.evaluateReconnectTrigger(
            isAlreadyReconnecting: isAlreadyReconnecting,
            isEscalation: escalate
        ) {
        case .coalesce:
            // Redundant edge of the same outage (e.g. path-restored right after
            // path-lost). Re-arm the in-flight attempt's restart immediately —
            // a just-restored path is when a restart is most likely to succeed.
            Logger.calls.info("reconnect trigger coalesced into attempt \(self.reconnectAttempt) — re-arming ICE restart")
            scheduleICERestart(attempt: reconnectAttempt, backoffSeconds: 0)
            return
        case .startCycle, .escalate:
            break
        }

        reconnectAttempt += 1
        analyticsTotalReconnects += 1
        guard reconnectAttempt <= QualityThresholds.maxReconnectAttempts else {
            if callUsesCallKit, let uuid = activeCallUUID {
                callProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
            }
            endCallInternal(reason: .connectionLost)
            return
        }

        callState = .reconnecting(attempt: reconnectAttempt)
        playHaptic(.light)

        if let callId = currentCallId {
            let userId = AuthManager.shared.currentUser?.id ?? ""
            MessageSocketManager.shared.emitCallReconnecting(callId: callId, participantId: userId, attempt: reconnectAttempt)
            // Fresh TURN credentials for this attempt: the
            // `call:ice-servers-refreshed` listener applies the response via
            // `updateIceServers`, so this restart — or its watchdog escalation —
            // re-gathers relay candidates with fresh credentials instead of
            // reusing creds that may be near the TTL horizon (coturn rejects
            // allocation refreshes past the expiry embedded in the username).
            // Routed through `requestFreshTurnCredentials` so a dropped emit/reply
            // during a reconnection cycle still retries instead of going silent.
            // Cancel the periodic 80%-TTL scheduler first (mirrors `didReconnect`
            // below) — otherwise its deadline can fire in this same window and
            // race a second, redundant `call:request-ice-servers` emit.
            turnRefreshTask?.cancel()
            turnRefreshTask = nil
            requestFreshTurnCredentials(callId: callId)
        }

        let backoffSeconds = CallReliabilityPolicy.reconnectBackoffSeconds(
            attempt: reconnectAttempt,
            unitRandom: Double.random(in: 0..<1)
        )
        scheduleICERestart(attempt: reconnectAttempt, backoffSeconds: backoffSeconds)
    }

    /// (Re-)arms the ICE restart for `attempt`. Cancels the in-flight restart
    /// task first, then awaits it (in addition to the video-transition family)
    /// before actuating — `.cancel()` alone is cooperative and doesn't stop a
    /// restart already inside `createOffer()`, which has no re-entrancy guard.
    @MainActor
    private func scheduleICERestart(attempt: Int, backoffSeconds: Double) {
        // Audit finding — chain onto the video-transition family too (mirrors
        // toggleVideo/handleHold/applySurvivalVideoSend, see the doc-comment on
        // `survivalVideoTask`). `performICERestart()` calls `createOffer()` just
        // like they do, and it has no re-entrancy guard: a CallKit hold firing at
        // the same moment as a WiFi↔cellular handoff (exactly what a GSM call
        // causes) used to let a hold renegotiation and an ICE-restart
        // renegotiation call createOffer() concurrently.
        let previousToggle = videoToggleTask
        let previousHold = holdVideoTask
        let previousSurvival = survivalVideoTask
        // Also chain onto the PREVIOUS iceRestartTask instance itself, not just
        // `.cancel()` it. Cancellation is cooperative and neither
        // `performICERestart()` nor `createOffer()` check `Task.isCancelled` —
        // without this await, a coalesced reconnect trigger (same `attempt`,
        // `attemptReconnection`'s `.coalesce` path) re-arms this task while the
        // previous one may still be mid-flight inside `createOffer()`, and both
        // can call `pc.offer(for:)`/`setLocalDescription` concurrently.
        let previousICERestart = iceRestartTask
        // Also chain onto `signalOfferAnswerTask` — a peer-initiated renegotiation
        // offer answered concurrently with this restart's createOffer() hits the
        // same glare hazard. See the doc-comment on `survivalVideoTask`.
        let previousAnswer = signalOfferAnswerTask
        let previousCameraSwitch = cameraSwitchTask
        iceRestartTask?.cancel()
        iceRestartTask = Task { @MainActor [weak self] in
            await previousToggle?.value
            await previousHold?.value
            _ = await previousSurvival?.value
            await previousICERestart?.value
            await previousAnswer?.value
            await previousCameraSwitch?.value
            // Re-validate after the chained awaits: the call may have ended, or a
            // newer reconnect cycle may have already taken over, while this task
            // was waiting behind another renegotiation.
            guard let self, !Task.isCancelled,
                  let callId = self.currentCallId, let userId = self.remoteUserId,
                  case .reconnecting(let currentAfterChain) = self.callState, currentAfterChain == attempt
            else { return }
            if backoffSeconds > 0 {
                try? await Task.sleep(for: .seconds(backoffSeconds))
                guard !Task.isCancelled, case .reconnecting(let current) = self.callState, current == attempt else { return }
            }
            guard let offer = await self.webRTCService.performICERestart() else {
                // The call may have ended (or a newer reconnect cycle already
                // took over) while `performICERestart()` was in flight — only
                // escalate if this attempt is still the live one, otherwise
                // this would resurrect a dead call or clobber a fresher cycle.
                guard !Task.isCancelled, case .reconnecting(let current) = self.callState, current == attempt else { return }
                self.attemptReconnection(escalate: true); return
            }
            guard !Task.isCancelled, case .reconnecting(let current) = self.callState, current == attempt else { return }
            self.emitCallOffer(callId: callId, toUserId: userId, isVideo: self.isVideoEnabled, sdp: offer)
        }
    }

    /// After configuring WebRTC for an incoming VoIP/notification call, decide whether
    /// the periodic refresh is enough or a real credential fetch is needed right away.
    /// A VoIP push payload never carries a TTL, and when it also carries no usable ICE
    /// servers (missing/malformed/all dropped by `parseIceServers`'s credential-length
    /// guard) `WebRTCService.configure` falls back to STUN-only — which reliably fails
    /// to connect behind symmetric/CGNAT (common on cellular). Request real per-user
    /// TURN credentials immediately in that case instead of waiting up to
    /// `turnDefaultCredentialTTLSeconds * 0.8` for the periodic scheduler.
    private func armTurnCredentialsAfterConfigure(callId: String, iceServers: [IceServer]?) {
        guard let iceServers, !iceServers.isEmpty else {
            Logger.calls.warning("VoIP push carried no usable ICE servers — configured STUN-only fallback; requesting fresh TURN credentials immediately")
            requestFreshTurnCredentials(callId: callId)
            return
        }
        scheduleTURNCredentialRefresh(ttl: QualityThresholds.turnDefaultCredentialTTLSeconds)
    }

    // Schedules a TURN credential refresh at 80% of the credential TTL.
    // Emits `call:request-ice-servers`; gateway responds with `call:ice-servers-refreshed`
    // which `setupSocketListeners` applies via `webRTCService.updateIceServers`.
    private func scheduleTURNCredentialRefresh(ttl: TimeInterval) {
        turnRefreshTask?.cancel()
        turnRefreshWatchdogTask?.cancel()
        turnRefreshWatchdogTask = nil
        turnRefreshRetryAttempt = 0
        // Floor-clamped: a degenerate TTL (zero / negative / short) schedules at
        // the minimum cadence instead of silently disarming the refresh — the
        // old `guard ttl >= 60 else return` left mid-call credentials expiring
        // with no refresh armed at all. See CallReliabilityPolicy.turnRefreshDelay.
        let refreshDelay = CallReliabilityPolicy.turnRefreshDelay(ttl: ttl)
        Logger.calls.info("TURN credential refresh scheduled in \(Int(refreshDelay))s (TTL=\(Int(ttl))s)")
        turnRefreshTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(refreshDelay))
            guard !Task.isCancelled, let self, self.callState.isActive,
                  let callId = self.currentCallId else { return }
            self.requestFreshTurnCredentials(callId: callId)
        }
    }

    /// Emits `call:request-ice-servers` and arms the retry watchdog. Shared by
    /// the periodic scheduler, the socket-reconnect resync, and the
    /// reconnection-cycle refresh — every requester gets the same
    /// no-ACK-loss protection.
    private func requestFreshTurnCredentials(callId: String) {
        Logger.calls.info("Requesting fresh TURN credentials for call \(callId)")
        MessageSocketManager.shared.emitRequestIceServers(callId: callId)
        armTurnRefreshWatchdog(callId: callId)
    }

    /// Retries `requestFreshTurnCredentials` if `call:ice-servers-refreshed`
    /// hasn't arrived within `turnRefreshRetryTimeoutSeconds`, bounded by
    /// `CallReliabilityPolicy.turnRefreshShouldRetry`. Once retries are
    /// exhausted, falls back to re-arming the next periodic cycle at the
    /// floor delay instead of leaving the call with no refresh armed at all.
    private func armTurnRefreshWatchdog(callId: String) {
        turnRefreshWatchdogTask?.cancel()
        turnRefreshWatchdogTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.turnRefreshRetryTimeoutSeconds))
            guard !Task.isCancelled, let self, self.callState.isActive,
                  self.currentCallId == callId else { return }
            self.turnRefreshRetryAttempt += 1
            guard CallReliabilityPolicy.turnRefreshShouldRetry(attempt: self.turnRefreshRetryAttempt) else {
                Logger.calls.error("TURN credential refresh got no response after \(self.turnRefreshRetryAttempt) retries for call \(callId) — re-arming next cycle")
                self.scheduleTURNCredentialRefresh(ttl: QualityThresholds.turnMinRefreshDelaySeconds)
                return
            }
            Logger.calls.warning("TURN credential refresh got no response — retry #\(self.turnRefreshRetryAttempt) for call \(callId)")
            self.requestFreshTurnCredentials(callId: callId)
        }
    }

    // P0-3 — replay ICE candidates buffered while the socket was down.
    // Called after `emitCallJoin` on socket reconnect so the gateway has
    // already re-admitted us to the call room before forwarding candidates.
    private func flushPendingIceCandidates() {
        guard !pendingIceCandidates.isEmpty else { return }
        // Guard socket liveness: if the socket dropped again between the
        // reconnect event and this flush, the gateway never receives the
        // candidates — and they're not re-queued. Re-buffer them so the
        // next reconnect cycle can deliver them.
        guard MessageSocketManager.shared.isConnected else {
            Logger.calls.warning("flushPendingIceCandidates — socket not connected, re-buffering \(self.pendingIceCandidates.count) candidate(s)")
            return
        }
        let candidates = pendingIceCandidates
        pendingIceCandidates = []
        Logger.calls.info("Flushing \(candidates.count) buffered ICE candidate(s) after socket reconnect")
        for entry in candidates {
            guard let callId = entry["callId"] as? String,
                  let payload = entry["payload"] as? [String: Any] else { continue }
            MessageSocketManager.shared.emitCallSignal(callId: callId, type: "ice-candidate", payload: payload)
        }
    }
}

// MARK: - CallKit Delegate Proxy

private class CallKitDelegateProxy: NSObject, CXProviderDelegate, @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    weak var manager: CallManager?

    func providerDidReset(_ provider: CXProvider) {
        Logger.calls.info("CallKit provider did reset")
        // Apple's CallKit guidance: treat this as if no calls had ever
        // occurred. `endCall()` no-ops when `callState` isn't active, which
        // would otherwise skip `deactivateAudioSession()` and leave
        // `RTCAudioSession` stale if this fires without a matching
        // `didDeactivate` (e.g. after a system-level call reset). Disabling
        // it here is idempotent and independent of local call state.
        // Routed through audioSessionQueue.sync — like didActivate/didDeactivate
        // below — so this reset can never interleave with a concurrent
        // RTCAudioSession reconfiguration dispatched from the MainActor.
        manager?.audioSessionQueue.sync {
            CallManager.isAudioSessionExpectedActive = false
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.isAudioEnabled = false
            rtc.unlockForConfiguration()
        }
        Task { @MainActor [weak self] in
            self?.manager?.endCall()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // [Fix 2026-07-02] CallKit starts the callee's elapsed timer at
        // fulfill() — fulfilling here (at tap) made the counter run before the
        // WebRTC connection existed. The manager HOLDS the action and settles
        // it in `transitionToConnected` (fulfill), on pre-connect teardown
        // (fail), or via a 10 s safety net (fulfill) so CallKit can never time
        // it out.
        //
        // [Fix 2026-07-03] `CXProvider.setDelegate(_:queue: nil)` makes
        // CallKit create its OWN private serial queue for delegate callbacks
        // — it does NOT dispatch on main (Apple's documented behaviour for a
        // `nil` queue). The previous "are we on the main queue?" check was
        // therefore always false in production, so the hold above never
        // engaged: every answered call still fulfilled at tap time and
        // reintroduced the exact "timer starts before connection" bug this
        // fix was written for. Always hop to the MainActor and hold — the
        // 10 s safety net (`holdPendingAnswerAction`) bounds the worst case,
        // and `@preconcurrency import CallKit` above permits capturing the
        // non-Sendable `CXAnswerCallAction` across the actor hop.
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else {
                action.fulfill()
                return
            }
            // Identity guard: mirrors CXEndCallAction/CXSetMutedCallAction/
            // CXSetHeldCallAction/CXPlayDTMFCallAction below — reportIncomingVoIPCall's
            // busy path reports a SECOND, distinct CXCallUpdate/UUID via
            // reportNewIncomingCall while a primary call is already active, then
            // immediately retires it with reportCall(endedAt:). activeCallUUID only
            // ever tracks the primary call, so a mismatch here is that phantom/stale
            // UUID, not ours to answer. Without this guard, `holdPendingAnswerAction`
            // would hold THIS action as THE pending answer for the call — its
            // supersede-and-fail path (or the 10s safety net) could then fail/fulfill
            // the wrong action, tearing down the real, active call's genuinely
            // pending answer instead of the phantom one. `.fail()`, not `.fulfill()`:
            // CallKit already knows this call ended (reportCall(endedAt:) above), so
            // completing it as "answered" would be a lie.
            guard action.callUUID == manager.activeCallUUID else {
                Logger.calls.warning(
                    "CallKit -> CXAnswerCallAction for non-active callUUID=\(action.callUUID), failing"
                )
                action.fail()
                return
            }
            manager.holdPendingAnswerAction(action)
            await manager.answerCallReady()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // Diagnostic — `CXEndCallAction` is the only path through which the
        // system asks us to hang up. It fires from:
        //   1. Lock-screen / in-call "End" button taps (user action),
        //   2. our own `callController.request(CXEndCallAction)` call from
        //      `endCall()` (loop-back: we asked CallKit to end the call,
        //      not the other way around),
        //   3. CallKit autonomously deciding an outgoing call is stuck
        //      (e.g. no `reportOutgoingCall(_:startedConnectingAt:)` within
        //      its internal grace window) — this is the case we suspect for
        //      the "calls drop after 2-4 seconds" symptom.
        // Logging the call's UUID and current state here distinguishes (1)/(3)
        // from the in-app loop-back: in (2), `callState` is already `.ended`
        // by the time this delegate fires because `endCall()` calls
        // `endCallInternal` BEFORE requesting the transaction, so the log
        // will show `state=ended(.local)`. In (1)/(3), state is still
        // `.ringing` / `.offering` / `.connecting` / `.connected`.
        // CallKit requires fulfill() to be called synchronously before the
        // delegate method returns. Settling the action from inside a Task
        // means CallKit may time out the action if the manager hop is delayed.
        action.fulfill()
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else { return }
            let stateAtEntry = manager.callState
            Logger.calls.info(
                "CallKit -> CXEndCallAction received (callUUID=\(action.callUUID), state=\(String(describing: stateAtEntry)))"
            )
            // Identity guard: `reportIncomingVoIPCall`'s busy path reports a SECOND,
            // distinct CXCallUpdate/UUID via `reportNewIncomingCall` while a primary
            // call is already active, then retires it with `reportCall(endedAt:)` —
            // `maximumCallGroups = 2` exists to let CallKit accept that report. If a
            // system-originated action ever arrived tagged with that phantom UUID
            // instead of the primary call's, `endCall()` must not tear down the real,
            // active call. `activeCallUUID` only ever tracks the primary call, so any
            // mismatch here is a stale/unrelated action, not ours to act on.
            guard action.callUUID == manager.activeCallUUID else {
                Logger.calls.warning(
                    "CallKit -> CXEndCallAction for non-active callUUID=\(action.callUUID), ignoring"
                )
                return
            }
            manager.endCall()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        let isMuted = action.isMuted
        Task { @MainActor [weak self] in
            guard let manager = self?.manager, action.callUUID == manager.activeCallUUID else { return }
            if manager.isMuted != isMuted {
                // reportToCallKit: false — CallKit is the SOURCE of this
                // change (Watch/lock-screen/CarPlay); its own state already
                // matches `isMuted`, so resubmitting a CXSetMutedCallAction
                // here would just be an avoidable no-op transaction back to
                // the system that just told us about it.
                manager.toggleMute(reportToCallKit: false)
            }
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        // Fires when a cellular call pre-empts or releases our call. Audio is
        // already managed by didDeactivate/didActivate; we only handle video here
        // so the peer receives a proper "camera off" signal instead of a frozen
        // last frame during the hold.
        // CallKit contract: fulfill() synchronously before the delegate method
        // returns, matching the pattern used for CXAnswerCallAction and
        // CXEndCallAction. Fulfilling inside a Task delays settlement to the next
        // main-runloop tick, which violates the contract and can cause CallKit to
        // time out the action.
        let isOnHold = action.isOnHold
        action.fulfill()
        Task { @MainActor [weak self] in
            guard let manager = self?.manager, action.callUUID == manager.activeCallUUID else { return }
            manager.handleHold(isOnHold)
        }
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        // The outgoing call path is initiated by the user's UI tap; CallManager
        // builds the WebRTC stack asynchronously. Fulfilling immediately here is
        // safe because we don't await any media setup from this delegate.
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
        // RFC 4733: forward CallKit keypad input to the WebRTC DTMF sender.
        // Enables conference PINs and IVR navigation during active calls.
        // sendDTMF is a no-op when unavailable; fulfill so CallKit doesn't timeout.
        //
        // `sendDTMF` is @MainActor-isolated (like the rest of CallManager), but
        // `CXProvider.setDelegate(_:queue: nil)` dispatches this callback on
        // CallKit's own private serial queue, NOT main (see the CXAnswerCallAction
        // fix note above). Calling straight into `manager?.sendDTMF` from that
        // queue raced with any other MainActor call-state work (renegotiation,
        // ICE restart, mute toggles) in flight at the same moment. Hop to the
        // MainActor first, matching every other delegate method in this proxy.
        let digits = action.digits
        action.fulfill()
        Task { @MainActor [weak self] in
            guard let manager = self?.manager, action.callUUID == manager.activeCallUUID else { return }
            manager.sendDTMF(digits: digits)
        }
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // Stuck-muted fallback observation — the fallback no-ops once this is
        // set (see CallManager.scheduleStuckMutedFallback).
        CallManager.callKitDidActivateFired = true
        // CallKit owns AVAudioSession lifecycle; we ONLY bridge it to libwebrtc.
        // DO NOT call audioSession.setActive(true) here — CallKit already did.
        // Forcing it again creates desync between AVAudioSession and RTCAudioSession,
        // visible as alternating routes (Receiver/Speaker) in logs and silent calls.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.2
        manager?.audioSessionQueue.sync {
            CallManager.isAudioSessionExpectedActive = true
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.audioSessionDidActivate(audioSession)
            rtc.isAudioEnabled = true
            // Re-apply Opus-aligned I/O preferences now that CallKit owns
            // the session — setConfiguration earlier set them, but CallKit's
            // own activation may reset hardware-level parameters. Best-effort.
            applyBestEffortAudioSetting("preferredSampleRate") {
                try audioSession.setPreferredSampleRate(48_000)
            }
            applyBestEffortAudioSetting("preferredIOBufferDuration") {
                try audioSession.setPreferredIOBufferDuration(0.02)
            }
            rtc.unlockForConfiguration()
        }

        // ML-based Voice Isolation (ambient-noise suppression at the capture stage,
        // complementing WebRTC's software AEC/NS) is a USER-controlled Mic Mode toggled
        // in Control Center — iOS exposes NO programmatic setter. The branch originally
        // called `setPreferredMicrophoneMode(.voiceIsolation)`, which exists on neither
        // AVAudioApplication nor AVCaptureDevice (compile error). `preferredMicrophoneMode`
        // / `activeMicrophoneMode` are read-only. Our call path already adopts the Core
        // Audio AUVoiceIO unit through RTCAudioSession (.voiceChat), so the system surfaces
        // the Voice Isolation toggle to the user on top of WebRTC's noise suppression — we
        // can observe their choice but cannot force it.
        // Ref: developer.apple.com/documentation/avfoundation/system-video-effects-and-microphone-modes

        // Audit P2-iOS-2 — `overrideOutputAudioPort` is only honored once
        // RTCAudioSession's audio engine has actually started. Calling it
        // synchronously from `didActivate` races the engine start; the
        // speaker toggle would silently fall back to earpiece. Defer by
        // ~200ms so the engine is up by the time we override.
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(200))
            self?.manager?.applySpeakerRoute()
        }
        let outputs = audioSession.currentRoute.outputs
            .map { $0.portType.rawValue }
            .joined(separator: ",")
        Logger.calls.info("CallKit audio session activated; RTCAudioSession enabled (route=\(outputs), category=\(audioSession.category.rawValue), mode=\(audioSession.mode.rawValue))")

        // Phase 1.5 — démarrer le ringback tone APRÈS que CallKit ait
        // activé la session audio. Démarrer AVAudioPlayer avant ce point
        // (comme le faisait `startCall` originel) activait implicitement
        // la session en `.soloAmbient` (default iOS), ce qui pré-emptait
        // la catégorie `.playAndRecord` de CallKit et empêchait CallKit
        // de fire `didActivate` — déclenchant son timeout autonome ~3-5s
        // (le « calls drop after 2-4 seconds » + « wont be a UI to host
        // the call » sur simulateur).
        // ⚠️ Sortie .ringing(isOutgoing:true) UNIQUEMENT : sur incoming le
        // ringback caller-side n'a pas lieu (CallKit gère son propre
        // ringtone via `ringtoneSound`).
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else { return }
            if case .ringing(isOutgoing: true) = manager.callState {
                manager.startRingbackIfNeeded()
            }
        }
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        manager?.audioSessionQueue.sync {
            CallManager.isAudioSessionExpectedActive = false
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.isAudioEnabled = false
            rtc.audioSessionDidDeactivate(audioSession)
            rtc.unlockForConfiguration()
        }
        Logger.calls.info("CallKit audio session deactivated; RTCAudioSession disabled")
    }

    func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        // CallKit's own internal per-action deadline (undocumented, historically well
        // under our app-side safety nets) is independent of any hold we place on an
        // action — e.g. `holdPendingAnswerAction`'s pendingAnswerActionSafetyNetSeconds.
        // If CallKit's deadline elapses first, it has ALREADY torn down its side of the
        // transaction: calling `.fulfill()`/`.fail()` on `action` now is undefined
        // behavior, so this only reconciles our local state, never re-settles the action.
        Logger.calls.error("CallKit timed out performing \(type(of: action)) — reconciling local call state")
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else { return }
            if let answerAction = action as? CXAnswerCallAction {
                manager.discardTimedOutAnswerAction(answerAction)
            }
            // Identity guard: mirrors CXAnswerCallAction/CXEndCallAction/
            // CXSetMutedCallAction/CXSetHeldCallAction/CXPlayDTMFCallAction above —
            // this is the only CXProviderDelegate method that was missing it.
            // reportIncomingVoIPCall's busy path reports a SECOND, distinct
            // CXCallUpdate/UUID via reportNewIncomingCall while a primary call is
            // already active, then immediately retires it — activeCallUUID only
            // ever tracks the primary call, so a timeout carrying that phantom/stale
            // UUID (or any action type this proxy doesn't otherwise implement) is not
            // ours to react to. Without this guard, a timed-out action belonging to
            // an already-settled or foreign call unconditionally hangs up whatever
            // call IS active. discardTimedOutAnswerAction above stays unguarded so a
            // genuinely pending answer action is still released either way.
            guard (action as? CXCallAction)?.callUUID == manager.activeCallUUID else {
                Logger.calls.warning(
                    "CallKit timed out performing \(type(of: action)) for non-active callUUID — not ending active call"
                )
                return
            }
            manager.endCall()
        }
    }
}

// MARK: - VideoSurvivalActuating

extension CallManager: VideoSurvivalActuating {
    /// FREEZE outbound video (sustained poor link): the encoder drops to its
    /// floor at 2 fps, so the peer keeps seeing a still image instead of losing
    /// the picture. Deliberately does NOT touch `isVideoEnabled` (the user's
    /// camera intent is preserved), NOT the track, NOT the capture session, and
    /// signals nothing to the peer — see `actuateSurvivalVideoSend`.
    func suspendOutboundVideo() async -> Bool {
        await applySurvivalVideoSend(enabled: false)
    }

    /// Hand the encoder back to the quality ladder once the link has recovered.
    /// There is no camera to re-acquire: the freeze never released it.
    func resumeOutboundVideo() async -> Bool {
        await applySurvivalVideoSend(enabled: true)
    }

    private func applySurvivalVideoSend(enabled: Bool) async -> Bool {
        // Only act while the user still wants video and we're in an active call.
        guard isVideoEnabled, let callId = currentCallId else { return false }
        // Do NOT act during an ICE restart: media parameters written against a
        // sender whose transport is mid-restart are lost with the old encoding,
        // and the published `isVideoSuspended` would then describe a floor that
        // is no longer applied. The survival controller re-evaluates once the
        // call reaches .connected and stats start flowing again.
        if case .reconnecting = callState { return false }
        // Do NOT act — in EITHER direction — while an OS-level suspension is
        // active: a CallKit hold (cellular pre-emption) or a background/capture
        // interruption has genuinely stopped the capture, `handleHold` already
        // owns the media transition for that window, and there is no live
        // encoding to floor or to release. Both directions are blocked, not just
        // resume: letting a suspend through mid-hold would publish
        // `isVideoSuspended = true` — the local "video paused" affordance — for
        // a call whose video is already off for an unrelated, visible reason.
        if isVideoSuspendedByHold || isVideoSuspendedByCaptureInterruption { return false }

        let previousToggle = videoToggleTask
        let previousHold = holdVideoTask
        let previousSurvival = survivalVideoTask
        let previousICERestart = iceRestartTask
        let previousAnswer = signalOfferAnswerTask
        let previousCameraSwitch = cameraSwitchTask
        let task = Task<Bool, Never> { @MainActor [weak self] in
            // Serialize with every other in-flight video-transition path (manual
            // toggle, CallKit hold/unhold, ICE restart, peer-initiated renegotiation
            // answer) — see the doc-comment on `survivalVideoTask`. The
            // `.reconnecting` state guards above already stop a NEW survival
            // transition from starting once a restart is under way, but chaining
            // here too closes the reverse window: an ICE restart beginning while
            // THIS task's own createOffer() is in flight.
            await previousToggle?.value
            await previousHold?.value
            _ = await previousSurvival?.value
            await previousICERestart?.value
            await previousAnswer?.value
            await previousCameraSwitch?.value
            guard let self, !Task.isCancelled else { return false }
            // Re-validate every guard: state may have changed while this transition
            // was queued behind a concurrent manual toggle or CallKit hold.
            guard self.isVideoEnabled, self.currentCallId == callId else { return false }
            if case .reconnecting = self.callState { return false }
            // Mirrors the pre-flight guard above — re-validated because state
            // may have changed (e.g. a hold started) while this transition
            // was queued behind a concurrent task.
            if self.isVideoSuspendedByHold || self.isVideoSuspendedByCaptureInterruption { return false }
            return await self.actuateSurvivalVideoSend(enabled: enabled, callId: callId)
        }
        survivalVideoTask = task
        return await task.value
    }

    /// L6-1/L6-2 — the actuator is an ENCODER floor, not a media transition.
    /// `freezeVideoForSurvival()` rewrites the video sender's parameters
    /// (100 kbps · 2 fps · 360p · `.maintainResolution`) and nothing else: the
    /// capture session keeps running, the track stays attached and the
    /// transceiver stays `sendRecv`. Consequences, both deliberate:
    ///
    /// • nothing to renegotiate — no `createOffer`, no `emitCallOffer`, so a
    ///   degraded link never risks SDP glare with an in-flight ICE restart;
    /// • nothing to ANNOUNCE — `call:media-toggled` stays reserved for the three
    ///   cases where capture really stops (camera button, capture interruption,
    ///   CallKit hold). Emitting it here made a weak link indistinguishable from
    ///   a deliberate camera-off, and the peer answered by DESTROYING the last
    ///   frame in favour of our avatar. It now keeps the last frame; the weak
    ///   link is surfaced by the quality channel (`call:quality-alert`) when the
    ///   gateway's own rtt/loss thresholds fire — which is NOT equivalent
    ///   coverage (a `.poor` tier reached through bandwidth or jitter alone
    ///   raises no alert), an accepted trade: a frame without a pill beats a
    ///   false "camera off".
    private func actuateSurvivalVideoSend(enabled: Bool, callId: String) async -> Bool {
        if enabled {
            webRTCService.unfreezeVideoAfterSurvival()
        } else {
            webRTCService.freezeVideoForSurvival()
        }
        hasLocalVideoTrack = webRTCService.hasLocalVideoTrack
        Logger.calls.info("[CALL] survival video \(enabled ? "thawed" : "frozen") (callId=\(callId))")
        return true
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
