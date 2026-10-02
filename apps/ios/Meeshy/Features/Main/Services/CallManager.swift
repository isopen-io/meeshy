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
func applyBestEffortAudioSetting(
    _ name: String,
    _ apply: () throws -> Void
) {
    do {
        try apply()
    } catch {
        Logger.calls.debug("AVAudioSession \(name, privacy: .public) not applied (expected on unsupported platforms): \(error.localizedDescription, privacy: .public)")
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
    static let shared = CallManagerHost.shared.adopt(CallManager())

    // MARK: - Published State

    @Published var callState: CallState = .idle {
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
    @Published var remoteUserId: String?
    @Published var remoteUsername: String?
    /// Conversation (DM) qui héberge l'appel courant, quand elle est connue.
    /// Renseignée pour les appels sortants (`startCall`) et les appels entrants
    /// livrés par socket (`CallOfferData.conversationId`). Peut rester `nil` pour
    /// un appel entrant réveillé par un push VoIP dont le payload ne la contient
    /// pas — l'affordance « ouvrir la conversation » dans l'écran d'appel se
    /// masque alors gracieusement plutôt que de deviner.
    @Published var conversationId: String?
    @Published var isVideoEnabled: Bool = false {
        didSet { if isVideoEnabled != oldValue { updateProximityMonitoring() } }
    }
    /// P0-3 — the REMOTE peer's camera state, driven by `call:media-toggled`.
    /// Defaults to `true` (assume on) and flips to `false` when the peer turns
    /// its camera off, so the UI can show an avatar placeholder instead of the
    /// peer's frozen last frame. 1:1 only — the gateway routes the toggle to the
    /// other participant via `socket.to(room)` so we never see our own echo.
    @Published var isRemoteVideoEnabled: Bool = true
    /// `false` when the remote peer has muted their microphone (call:media-toggled
    /// audioType=="audio"). Drives the mute indicator in the call UI so the local
    /// user knows why the remote peer sounds silent. Resets to `true` on call end.
    @Published var isRemoteAudioEnabled: Bool = true
    /// #8063 — partage d'écran, local et distant (`CallManager+ScreenShare.swift`).
    private(set) lazy var screenShare: CallScreenShareController = makeScreenShareController()
    /// #8064 — l'enregistrement consenti de l'appel (`CallManager+Recording.swift`).
    private(set) lazy var recording: CallRecordingController = makeRecordingController()
    /// `true` when the remote peer is actively screen-capturing this call
    /// (call:screen-capture-alert with isCapturing==true). Drives a privacy warning
    /// banner in CallView. Resets to `false` on call end to prevent leaking state
    /// into subsequent calls.
    @Published var isRemoteScreenCapturing: Bool = false
    /// Set to `true` when the gateway reports the remote peer has high RTT or packet
    /// loss (call:quality-alert). Auto-resets after 15 s of silence — sustained poor
    /// conditions keep resetting the timer, so the indicator stays up as long as
    /// alerts keep arriving.
    @Published var isRemoteQualityDegraded: Bool = false
    /// EXIGENCE №1 — true while the signaling socket is down during an
    /// established call. The P2P media keeps flowing; CallView shows a
    /// discreet banner and signaling ops resync on the socket reconnect.
    @Published var isSignalingDegraded: Bool = false
    @Published var isMuted: Bool = false { didSet { if isMuted != oldValue { toggleTranscription() } } }

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
    var callUsesCallKit = true
    @Published var isSpeaker: Bool = false
    @Published var callDuration: TimeInterval = 0
    @Published var currentCallId: String?
    @Published var connectionQuality: PeerConnectionState = .new
    /// RTT+packet-loss quality level from stats samples; nil until first sample.
    @Published var liveVideoQualityLevel: VideoQualityLevel? = nil
    /// Sustained-degradation flag for the "Connexion instable" pill — set only
    /// after `DegradedLinkTracker.consecutiveTicksToAlert` consecutive
    /// poor/critical stats ticks, cleared on the first healthy one. A single
    /// bad 5 s sample never alerts the user.
    @Published var isLinkQualityDegraded = false
    var degradedLinkTracker = DegradedLinkTracker()
    /// Most-recent stats snapshot collected during the active call. Updated every
    /// `QualityThresholds.statsIntervalSeconds`; nil before the first sample.
    /// Persisted to UserDefaults at call teardown for post-call diagnostics.
    var lastKnownStats: CallStats?
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
    @Published var isSystemPiPActive: Bool = false
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
    @Published var hasLocalVideoTrack = false
    @Published var hasRemoteVideoTrack = false
    /// Pairs qui ont OUVERT leur panneau de sous-titres — un ensemble, pas un
    /// booléen : avec un seul drapeau, la fermeture d'UN pair dans un appel à
    /// trois éteignait la capture locale et privait celui qui lisait encore.
    var listeningPeers: Set<String> = []
    /// Au moins un pair écoute (`call:transcription-active`, nom estampillé
    /// gateway) — pilote l'indicateur sur l'icône captions de CallView ET la
    /// capture locale (`TranscriptionCapturePolicy`). JAMAIS gâté par la
    /// visibilité du panneau local. Reset au teardown d'appel.
    @Published var remoteTranscriptionActive = false
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
    @Published var isVideoSuspended = false
    /// §7.7 — whether the local capture is the front camera. Drives mirroring
    /// in the UI: only the front camera is mirrored (a mirrored back camera
    /// shows reversed text/scene — bug k). Tracked optimistically (toggled on
    /// switchCamera, reset per call). Default true on iPhone/iPad (front camera
    /// at start), false on iOS-on-Mac (built-in/Continuity cameras are not
    /// mirrored).
    @Published var isUsingFrontCamera = true
    /// §7.1 — capture cameras available for the in-call device picker (Mac/iPad
    /// Continuity/USB). Refreshed via `refreshAvailableCameras()`. Empty on
    /// iPhone where the front/back flip is the affordance.
    @Published var availableCameras: [CameraDeviceOption] = []
    /// §7.1 — uniqueID of the active capture camera (drives the picker's check).
    @Published var selectedCameraId: String?
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

    /// Construit au premier appel, jamais avec `CallManager` (#7955) : le client
    /// WebRTC et sa chaîne de filtres (Vision + Metal) n'ont rien à faire en
    /// mémoire tant qu'aucun appel n'a commencé.
    private var builtWebRTCService: WebRTCService?
    var webRTCService: WebRTCService {
        if let builtWebRTCService { return builtWebRTCService }
        let service = WebRTCService()
        service.delegate = self
        builtWebRTCService = service
        return service
    }
    /// Drives the graceful audio-only survival layer from quality samples.
    let videoSurvivalController: VideoSurvivalController
    let ringbackPlayer = RingbackTonePlayer()
    // PERF-011: replace Timer.scheduledTimer with cancellable @MainActor Tasks.
    // Timers run on RunLoop.main and have no native cancellation hand-off; Tasks
    // are cooperative, energy-efficient (no RunLoop wakeup overhead), and
    // immediately stop their work loop on cancel.
    var durationTask: Task<Void, Never>?
    var heartbeatTask: Task<Void, Never>?
    /// §5.8 — single periodic monitor that owns BOTH the `.connecting` watchdog
    /// (timeout → ICE restart → fail) and the `.connected` half-open self-heal
    /// (inbound stalled while outbound flows → one ICE restart). It reads
    /// `callState` each tick and applies `CallReliabilityPolicy`, so there is a
    /// single wiring point instead of a timer per state. Replaces the old
    /// purely-informational `rtpGateTask`.
    var reliabilityMonitorTask: Task<Void, Never>?
    /// Phase 2 fix — Bug 2 (caller stays ringing while callee shows Connecting).
    /// Tracks the startLocalMedia Task so that:
    ///   1. `emitCallJoin` can be sent IMMEDIATELY (decoupled from media init)
    ///      → the caller receives PARTICIPANT_JOINED in <100ms instead of after
    ///      the callee's camera/mic warmup (0.5–3s on real devices).
    ///   2. `answerCall`, `answerCallReady`, and `handleSignalOffer(.connecting)`
    ///      can `await` this task before invoking `createAnswer` — guaranteeing
    ///      the audio/video transceivers exist before SDP answer negotiation.
    var localMediaTask: Task<Void, Never>?

    /// [CALL_JOIN] Reliable `call:join` emission for incoming calls — see
    /// `joinCallRoomReliably(callId:)`. Cancelled on teardown and superseded
    /// by any newer incoming call.
    var callJoinTask: Task<Void, Never>?

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

    func settlePendingAnswerAction(fulfilled: Bool, reason: String) {
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
    var outgoingRingTimeoutTask: Task<Void, Never>?
    /// Task de setup d'un appel sortant (force-leave + ACK + media + listen).
    /// Auparavant un Task non-tracké : si endCallInternal fire pendant le
    /// setup (ex: CallKit teardown), le Task continuait à tourner — gardant
    /// la connexion WebRTC active hors-vue. On le stocke pour pouvoir le
    /// cancel proprement dans endCallInternal. Le Task vérifie aussi
    /// `Task.isCancelled` aux points clés en plus du guard `activeCallUUID`.
    var setupCallTask: Task<Void, Never>?
    /// Audit P1-2 — token bumped each time we leave `.ended`. The 1.5s settle
    /// task captures the token at scheduling time and bails if it has changed
    /// (i.e. a new call already grabbed `currentCallId`/`remoteUserId` between
    /// the ended transition and the timer firing).
    var settleToken: UUID?
    /// Audit 2026-07-07 — `endCurrentAndAnswerPending`'s revalidation guard used
    /// to read `pendingIncomingCall`, but `endCall()` (called earlier in the same
    /// function) synchronously drives `endCallInternal`, which unconditionally
    /// nils `pendingIncomingCall` for an unrelated reason (dropping a stale busy
    /// banner). That made the revalidation guard always fail, so "End & Answer"
    /// never answered the waiting call. This dedicated token survives the
    /// `endCall()` side effect and is cleared only by `clearPendingIncomingCall`
    /// (remote cancellation) or once consumed.
    var answeringPendingCallId: String?
    /// Audit P1-12 — direction tracking for CallKit timer reporting.
    /// `reportOutgoingCall(_:connectedAt:)` is for the caller side only;
    /// the callee's elapsed timer is started by CallKit when CXAnswerCallAction
    /// is fulfilled. Calling reportOutgoingCall on the callee silently no-ops
    /// and the Phone-app Recents entry shows no duration.
    var lastCallWasOutgoing: Bool = false
    /// The last OUTGOING call's dial context, captured at `startCall`. Powers
    /// `retryCall()` (« Réessayer ») — `resetEndedStateForNewCall` clears the
    /// live identity fields, so the retry must re-dial from this snapshot rather
    /// than the (already-torn-down) call state. Parité web/Android retry.
    var lastOutgoingContext: (conversationId: String, userId: String, displayName: String, isVideo: Bool)?
    /// `private(set)` (not `private`) so CallView can compute a "since call
    /// start" elapsed time for each live-caption row — the only other
    /// existing consumer of call timing is `callDuration`, which is a ticking
    /// counter, not a fixed reference point captions can anchor to.
    var callStartDate: Date?
    /// True dès que la PREMIÈRE connexion média de cet appel a eu lieu (chrono
    /// démarré). CallView s'en sert pour ne rendre le layout connecté en
    /// `.reconnecting` que si un média a réellement existé — un ICE restart
    /// pré-établissement (depuis `.connecting`) garde l'UI "Connexion…".
    /// Lu au re-render déclenché par le changement de `callState` (@Published) ;
    /// pas besoin d'être publié lui-même.
    var hasEstablishedMedia: Bool { callStartDate != nil }
    var reconnectAttempt = 0
    /// Connection epoch — bumped on every `transitionToConnected`. The
    /// reliability monitor's `HalfOpenMonitorState` keys off it to re-arm
    /// half-open detection with a fresh RTP baseline after each (re)connect,
    /// even when a reconnection cycle completes between two poll ticks.
    var connectionEpoch = 0

    // MARK: - Analytics accumulators (reset in endCallInternal)
    var analyticsCallInitiatedDate: Date?
    /// answer/join → début de la négociation WebRTC : answerCall côté appelé,
    /// participant-joined côté appelant. Sépare le temps de sonnerie humain
    /// (dans setupTimeMs) du temps technique (negotiationTimeMs).
    var analyticsNegotiationStartDate: Date?
    var analyticsConnectedDate: Date?
    var analyticsNetworkTransitions: Int = 0
    var analyticsQualitySeconds: [VideoQualityLevel: Double] = [:]
    var analyticsLastQualityDate: Date?
    var analyticsCurrentLevel: VideoQualityLevel?
    /// Snapshots analytics périodiques (60 s, endReason "in_progress") — un
    /// kill de l'app en background ne perd plus la télémétrie de l'appel.
    var analyticsSnapshotTask: Task<Void, Never>?
    var analyticsRttSum: Double = 0
    var analyticsSampleCount: Int = 0
    var analyticsMaxPacketLoss: Double = 0
    var analyticsPacketLossSum: Double = 0
    var analyticsEffectsUsed: Set<String> = []
    var analyticsVideoFiltersUsed: Bool = false
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
    var analyticsTotalReconnects: Int = 0

    /// Periodic refresh of TURN credentials before TTL expiry. Cancelled on call end.
    var turnRefreshTask: Task<Void, Never>?
    /// Watchdog armed after every `call:request-ice-servers` emit — retries if
    /// `call:ice-servers-refreshed` doesn't arrive within
    /// `turnRefreshRetryTimeoutSeconds`. `emitRequestIceServers` carries no ACK,
    /// so without this a single dropped emit/reply killed the refresh chain for
    /// the rest of the call. Cancelled on call end and on every successful
    /// response (via `scheduleTURNCredentialRefresh`).
    var turnRefreshWatchdogTask: Task<Void, Never>?
    /// Consecutive watchdog retries for the current refresh cycle. Reset to 0
    /// whenever a fresh cycle starts (`scheduleTURNCredentialRefresh`).
    var turnRefreshRetryAttempt = 0
    var participantJoinedCancellable: AnyCancellable?
    /// Audit P3 — replaces the never-assigned `signalOfferCancellable`
    /// (AnyCancellable, dead) with a properly typed Task slot. Two callers
    /// (`answerCall` and `answerCallReady`) schedule a 30s SDP-offer
    /// timeout; both now store the Task here so `endCallInternal` can
    /// cancel it cleanly instead of leaking it for the remaining sleep.
    var sdpOfferTimeoutTask: Task<Void, Never>?
    /// Tracks the at-most-one in-flight offer retry loop so `endCallInternal`
    /// can cancel it promptly instead of waiting for the settle window to expire.
    /// A new offer supersedes the previous one via the generation guard inside
    /// `emitOfferWithRetry`, but cancelling the Task is cheaper than sleeping.
    var offerRetryTask: Task<Void, Never>?
    /// Same as `offerRetryTask` for the SDP answer backoff path.
    var answerRetryTask: Task<Void, Never>?
    /// Tracks the in-flight toggleVideo Task. Cancelled when a rapid second tap arrives
    /// so the later intent always wins and `isVideoEnabled` stays consistent with WebRTC.
    var videoToggleTask: Task<Void, Never>?
    /// Tracks the in-flight hold/unhold video Task. Chained onto (not cancelled) so a
    /// rapid hold→unhold sequence serializes rather than running both concurrently.
    var holdVideoTask: Task<Void, Never>?
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
    var survivalVideoTask: Task<Bool, Never>?
    var remoteQualityResetTask: Task<Void, Never>?
    /// In-flight ICE restart task. Tracked so overlapping `attemptReconnection`
    /// calls (e.g. watchdog fires while backoff is sleeping) cancel the previous
    /// attempt before starting the new one — prevents two concurrent restart
    /// offers from corrupting the perfect-negotiation state machine. Also part of
    /// the `videoToggleTask`/`holdVideoTask`/`survivalVideoTask`/
    /// `signalOfferAnswerTask` chain (see `survivalVideoTask`'s doc-comment) since
    /// it calls `createOffer()` too.
    var iceRestartTask: Task<Void, Never>?
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
    var signalOfferAnswerTask: Task<Void, Never>?
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
    var cameraSwitchTask: Task<Void, Never>?
    /// One-shot stuck-muted fallback (§RC-2): armed when `.connected` is
    /// reached on iPhone/iPad before CallKit delivered `provider:didActivate:`.
    var audioActivationFallbackTask: Task<Void, Never>?
    var voipFreshnessTask: Task<Void, Never>?
    var pendingRemoteOffer: SessionDescription?
    // P0-3 — ICE candidates generated while the socket is down are buffered
    // here and replayed after the socket reconnects + emitCallJoin fires.
    var pendingIceCandidates: [[String: Any]] = []
    var cancellables = Set<AnyCancellable>()
    let audioSessionQueue = DispatchQueue(label: "me.meeshy.callmanager.audiosession")

    // Screen capture monitoring
    var screenCaptureObserver: NSObjectProtocol?
    var backgroundObserver: NSObjectProtocol?
    var foregroundObserver: NSObjectProtocol?
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
    var isVideoSuspendedByCaptureInterruption = false
    /// `true` while CallKit has placed the call on hold (e.g. incoming cellular
    /// call). The user's camera intent (`isVideoEnabled`) is preserved so video
    /// resumes automatically on unhold. Cleared on unhold or call teardown.
    var isVideoSuspendedByHold = false

    // Network monitoring
    let networkMonitor = NWPathMonitor()
    let networkQueue = DispatchQueue(label: "me.meeshy.callmanager.network")
    var lastNetworkPath: NWPath.Status = .satisfied
    var lastNetworkInterfaceType: NWInterface.InterfaceType? = nil
    let thermalMonitor = ThermalStateMonitor()

    // CallKit
    let callProvider: CXProvider
    let callController = CXCallController()
    // Internal (not private): `CallKitDelegateProxy` (`CallManager+CallKitProxy.swift`)
    // reads it to validate that a CXProviderDelegate action targets the call we are
    // actually tracking before mutating shared state — see its action.callUUID guards.
    var activeCallUUID: UUID?

    private var callKitDelegate: CallKitDelegateProxy?

    @Published var showCallWaitingBanner = false

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
    var pendingEndReconciliations: [(callId: String, reason: String?)] = []

    #if canImport(WebRTC)
    /// Paresseux (#7955) : `PiPCallController` monte une vue AVKit à sa naissance.
    lazy var pip: PiPCallProviding = PiPCallController.shared
    #else
    let pip: PiPCallProviding = NoOpPiPController()
    #endif
    /// `true` entre un tap « agrandir » (restore) et la fermeture effective du
    /// PiP, pour distinguer ce chemin de la croix système. Le reste de l'état et
    /// les rappels vivent dans `CallManager+SystemPiP.swift` (#8435).
    var pipRestoring = false
    var pipStartOrigin: CallPiPStartOrigin = .automatic
    /// Remonte les `PiPSourceAnchor` à chaque fermeture de fenêtre (#8435).
    @Published var pipAnchorGeneration = 0
    weak var pipConfiguredTrack: AnyObject?
    weak var pipConfiguredSource: UIView?
    /// Mode d'affichage en vigueur au démarrage de la fenêtre PiP, restauré à sa
    /// fermeture. Poser `.pip` inconditionnellement dégradait en pilule un appel
    /// qui était plein écran (retour dans l'app) ou en bulle (repli manuel).
    ///
    /// `nil` = aucune fenêtre n'a démarré. Indispensable :
    /// `failedToStartPictureInPictureWithError` appelle `onStop` sans qu'`onStart`
    /// ait tiré, et une valeur persistante y ferait restaurer le mode du PiP
    /// PRÉCÉDENT.
    var pipDisplayModeAtStart: CallDisplayMode?

    /// Dernière valeur de `call:transcription-active` annoncée aux pairs.
    /// Évite de ré-émettre à chaque réconciliation — et surtout de renvoyer
    /// un signal quand c'est le PAIR qui vient de bouger.
    var publishedListeningIntent = false

    /// §3.5 — current negotiation generation (high-water mark of generations
    /// SENT or SEEN). Stamped on every outgoing offer/answer/ICE; incoming
    /// signals older than this are dropped. Reset per call in
    /// `applyNegotiationRole` (CallManager is a singleton, so it must not carry
    /// over between calls — otherwise a peer with a higher counter from a prior
    /// call would wrongly drop the new call's first offer).
    var negotiationId = 0

    private init() {
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
                if !suspended { self.builtWebRTCService?.unfreezeVideoAfterSurvival() }
            }
            .store(in: &cancellables)

        setupSocketListeners()
        startNetworkMonitoring()
        startAudioInterruptionMonitoring()
        startAudioRouteChangeMonitoring()
        startMediaServicesResetMonitoring()
        Logger.calls.info("CallManager initialized")
    }

    // MARK: - System Picture-in-Picture


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

    /// Framerate cible du PiP selon l'état thermique (vignette petite → throttle
    /// agressif sous stress). Partagé par la config et le handler thermal.
    func pipFrameRate(for state: ProcessInfo.ThermalState) -> Int {
        switch state {
        case .critical: return QualityThresholds.pipFrameRateCritical
        case .serious: return QualityThresholds.pipFrameRateSerious
        default: return QualityThresholds.pipFrameRateDefault
        }
    }

}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
