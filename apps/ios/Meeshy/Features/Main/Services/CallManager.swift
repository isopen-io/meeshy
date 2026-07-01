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
                PlaybackCoordinator.shared.stopAll()
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
    @Published var isMuted: Bool = false

    /// CALL-FIX 2026-06-06 — whether THIS call drives CallKit. CallKit is only
    /// needed to (a) ring a backgrounded/locked device woken by a VoIP push and
    /// (b) provide the system call UI. We bypass it when the app already shows its
    /// own in-app call UI: ALWAYS on iOS-app-on-Mac (no system call UI there), and
    /// for socket-delivered INCOMING calls while the app is in the FOREGROUND (the
    /// in-app banner is enough — the redundant CallKit banner is suppressed). The
    /// VoIP-push incoming path (`reportIncomingVoIPCall`) ALWAYS keeps CallKit —
    /// Apple requires `reportNewIncomingCall` there. Set per call in `startCall` /
    /// `handleIncomingCallNotification`; gates CallKit transactions + audio-session
    /// self-activation (when false, no CallKit means we own the session lifecycle).
    private var callUsesCallKit = true
    @Published var isSpeaker: Bool = false
    @Published private(set) var callDuration: TimeInterval = 0
    @Published private(set) var currentCallId: String?
    @Published private(set) var connectionQuality: PeerConnectionState = .new
    /// RTT+packet-loss quality level from stats samples; nil until first sample.
    @Published private(set) var liveVideoQualityLevel: VideoQualityLevel? = nil
    /// Most-recent stats snapshot collected during the active call. Updated every
    /// `QualityThresholds.statsIntervalSeconds`; nil before the first sample.
    /// Persisted to UserDefaults at call teardown for post-call diagnostics.
    private(set) var lastKnownStats: CallStats?
    @Published var displayMode: CallDisplayMode = .fullScreen
    /// Une fenêtre PiP SYSTÈME (AVPictureInPicture) est affichée. Orthogonal à
    /// `displayMode` : tant qu'il est vrai, la `FloatingCallPillView` in-app est
    /// masquée pour éviter le doublon visuel au retour au premier plan.
    @Published private(set) var isSystemPiPActive: Bool = false
    @Published private(set) var activeAudioEffect: AudioEffectConfig? {
        didSet {
            if let effect = activeAudioEffect {
                analyticsEffectsUsed.insert(effect.effectType.rawValue)
            }
        }
    }
    @Published private(set) var hasLocalVideoTrack = false
    @Published private(set) var hasRemoteVideoTrack = false
    /// Outbound video auto-suspended by the graceful-degradation survival layer
    /// (sustained poor link). Distinct from `isVideoEnabled` (the user's camera
    /// intent, which stays true): the user still WANTS video, the network can't
    /// carry it. Mirrors `videoSurvivalController.isVideoSuspended` for the UI.
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
    @Published var pendingIncomingCall: (callId: String, fromUserId: String, fromUsername: String, isVideo: Bool)?

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
    /// Audit P1-12 — direction tracking for CallKit timer reporting.
    /// `reportOutgoingCall(_:connectedAt:)` is for the caller side only;
    /// the callee's elapsed timer is started by CallKit when CXAnswerCallAction
    /// is fulfilled. Calling reportOutgoingCall on the callee silently no-ops
    /// and the Phone-app Recents entry shows no duration.
    private var lastCallWasOutgoing: Bool = false
    private var callStartDate: Date?
    private var reconnectAttempt = 0

    // MARK: - Analytics accumulators (reset in endCallInternal)
    private var analyticsCallInitiatedDate: Date?
    private var analyticsConnectedDate: Date?
    private var analyticsNetworkTransitions: Int = 0
    private var analyticsQualitySeconds: [VideoQualityLevel: Double] = [:]
    private var analyticsLastQualityDate: Date?
    private var analyticsCurrentLevel: VideoQualityLevel?
    private var analyticsRttSum: Double = 0
    private var analyticsSampleCount: Int = 0
    private var analyticsMaxPacketLoss: Double = 0
    private var analyticsPacketLossSum: Double = 0
    private var analyticsEffectsUsed: Set<String> = []
    private var analyticsVideoFiltersUsed: Bool = false

    /// Periodic refresh of TURN credentials before TTL expiry. Cancelled on call end.
    private var turnRefreshTask: Task<Void, Never>?
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
    /// Tracks the in-flight hold/unhold video Task so a rapid hold→unhold sequence
    /// cancels the previous operation rather than running both concurrently.
    private var holdVideoTask: Task<Void, Never>?
    private var remoteQualityResetTask: Task<Void, Never>?
    /// In-flight ICE restart task. Tracked so overlapping `attemptReconnection`
    /// calls (e.g. watchdog fires while backoff is sleeping) cancel the previous
    /// attempt before starting the new one — prevents two concurrent restart
    /// offers from corrupting the perfect-negotiation state machine.
    private var iceRestartTask: Task<Void, Never>?
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
    /// `true` while the app is in the background during a video call. iOS
    /// enforces camera suspension in the background (privacy); we set this flag
    /// and send `call:media-toggled false` so the peer shows our avatar
    /// placeholder instead of a frozen last frame. Cleared on foreground return
    /// or call teardown.
    private var isVideoSuspendedByBackground = false
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
    private var activeCallUUID: UUID?

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
        // Custom CallKit icon: bundle a 40x40 PNG named "CallKitIcon" in Assets
        // to brand the lock-screen call card. Falls back to the default phone
        // icon if the asset is missing.
        if let icon = UIImage(named: "CallKitIcon") {
            config.iconTemplateImageData = icon.pngData()
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
            .sink { [weak self] suspended in self?.isVideoSuspended = suspended }
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
            // Headset / Bluetooth connected — route left speaker automatically.
            isSpeaker = false
            Logger.calls.info("Audio route: new device available — isSpeaker = false")
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
            guard let self else { return }
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
            callDuration = 0
            isVideoEnabled = false
            isRemoteVideoEnabled = true
            isRemoteAudioEnabled = true
            isRemoteScreenCapturing = false
            isMuted = false
            isSpeaker = false
            videoSurvivalController.reset()
            isVideoSuspended = false
            isVideoSuspendedByBackground = false
            isVideoSuspendedByHold = false
            Logger.calls.info("Force-reset .ended → .idle to accept new call")
        }
    }

    func startCall(conversationId: String, userId: String, displayName: String, isVideo: Bool) {
        resetEndedStateForNewCall()
        guard callState == .idle else {
            Logger.calls.warning("Cannot start call: already in state \(String(describing: self.callState))")
            return
        }

        analyticsCallInitiatedDate = Date()

        // Optimistic local state — `currentCallId` is reassigned to the real
        // gateway-issued ObjectId once the ACK lands.
        remoteUserId = userId
        remoteUsername = displayName
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
        // no-CallKit case here is iOS-app-on-Mac. (Suppressing CallKit for outgoing
        // on iOS would drop the system call UI / Recents the user expects there.)
        callUsesCallKit = !ProcessInfo.processInfo.isiOSAppOnMac
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
                    Task { @MainActor in self?.endCallInternal(reason: .failed("CallKit error")) }
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
                self.webRTCService.configure(isVideo: isVideo, iceServers: dynamicServers)
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
                    self.endCallInternal(reason: .failed("Failed to initiate call"))
                }
            }
        }

        HapticFeedback.medium()
    }

    // MARK: - VoIP Push Incoming Call

    func reportIncomingVoIPCall(callId: String, callerUserId: String, callerName: String, isVideo: Bool, iceServers: [IceServer]? = nil) {
        resetEndedStateForNewCall()
        lastCallWasOutgoing = false
        // The VoIP-push path ALWAYS uses CallKit — Apple mandates a synchronous
        // reportNewIncomingCall from the push handler. Reset the flag (a prior
        // foreground in-app call may have left it false).
        callUsesCallKit = true
        ringbackPlayer.shouldSelfActivateSession = false
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

        guard callState == .idle else {
            // Busy: report + immediately end the secondary call
            callProvider.reportNewIncomingCall(with: uuid, update: update) { _ in }
            callProvider.reportCall(with: uuid, endedAt: nil, reason: .unanswered)
            pendingIncomingCall = (callId: callId, fromUserId: callerUserId, fromUsername: callerName, isVideo: isVideo)
            showCallWaitingBanner = true
            Logger.calls.info("VoIP push while busy — ended secondary call, showing banner")
            HapticFeedback.medium()
            return
        }

        // Set state BEFORE reporting to CallKit to avoid race
        currentCallId = callId
        remoteUserId = callerUserId
        remoteUsername = callerName
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
                self?.endCallInternal(reason: .failed("CallKit error"))
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
        webRTCService.configure(isVideo: isVideo, iceServers: iceServers)
        scheduleTURNCredentialRefresh(ttl: QualityThresholds.turnDefaultCredentialTTLSeconds)
        applyNegotiationRole()
        Logger.calls.info("[CALL_SETUP] incoming 2/4 configureAudioSession begin")
        configureAudioSession()
        startReliabilityMonitor()

        // Phase 2 fix — Bug 2: emit call:join IMMEDIATELY (before awaiting
        // startLocalMedia) so the caller receives PARTICIPANT_JOINED without
        // waiting for our camera/mic warmup. Media init runs in parallel; the
        // answer creation paths (answerCall*, handleSignalOffer .connecting)
        // await `localMediaTask` before invoking createAnswer.
        MessageSocketManager.shared.emitCallJoin(callId: callId)
        Logger.calls.info("VoIP push — emitted call:join early; starting media in parallel: \(callId) (\(iceServers?.count ?? 0) ICE servers)")

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
            let (data, response) = try await URLSession.shared.data(for: request)
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
                  let envelope = try? JSONDecoder().decode(CallFreshnessResponse.self, from: data),
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

    // MARK: - Phantom VoIP Call (defense-in-depth)

    /// Apple PushKit requires reporting a call for every incoming VoIP push,
    /// otherwise the system kills the app and revokes the token. When a push
    /// arrives without a valid call payload (malformed or stale), report a
    /// phantom call and immediately end it so the user never sees the call UI.
    func reportPhantomVoIPCall(uuid: UUID, update: CXCallUpdate) {
        callProvider.reportNewIncomingCall(with: uuid, update: update) { _ in }
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

    func handleIncomingCallNotification(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, iceServers: [IceServer]? = nil) {
        resetEndedStateForNewCall()
        guard callState == .idle else {
            Logger.calls.info("Incoming call while busy — showing call waiting banner")
            pendingIncomingCall = (callId: callId, fromUserId: fromUserId, fromUsername: fromUsername, isVideo: isVideo)
            showCallWaitingBanner = true
            HapticFeedback.medium()
            return
        }

        analyticsCallInitiatedDate = Date()
        currentCallId = callId
        remoteUserId = fromUserId
        remoteUsername = fromUsername
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
        callUsesCallKit = !ProcessInfo.processInfo.isiOSAppOnMac
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
                    Task { @MainActor in self?.endCallInternal(reason: .failed("CallKit error")) }
                }
            }
        }

        // Auto-join call room + configure WebRTC so SDP offer can be received while ringing
        webRTCService.configure(isVideo: isVideo, iceServers: iceServers)
        scheduleTURNCredentialRefresh(ttl: QualityThresholds.turnDefaultCredentialTTLSeconds)
        applyNegotiationRole()
        configureAudioSession()
        startReliabilityMonitor()

        // Phase 2 fix — Bug 2: emit call:join IMMEDIATELY so the caller receives
        // PARTICIPANT_JOINED while we initialize media in parallel. See
        // `localMediaTask` property doc for rationale and downstream contract.
        MessageSocketManager.shared.emitCallJoin(callId: callId)
        Logger.calls.info("Incoming call — emitted call:join early; starting media in parallel: \(callId)")

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
            try? await webRTCService.startLocalMedia(isVideo: false)
            guard currentCallId == callId else { return }
        } catch WebRTCError.cameraPermissionDenied {
            Logger.calls.warning("[CALL_SETUP] camera permission denied — degrading to audio-only")
            guard currentCallId == callId else { return }
            isVideoEnabled = false
            try? await webRTCService.startLocalMedia(isVideo: false)
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
                endCallInternal(reason: .failed(String(localized: "call.error.media")))
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
            Task { [weak self] in
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
                    self.endCallInternal(reason: .failed("Failed to create SDP answer"))
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
            Task { [weak self] in
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

    func handleIncomingOffer(callId: String, fromUserId: String, fromUsername: String, isVideo: Bool, sdp: SessionDescription) {
        handleIncomingCallNotification(callId: callId, fromUserId: fromUserId, fromUsername: fromUsername, isVideo: isVideo)
    }

    // MARK: - Answer Call

    func answerCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        // CALL-FIX 2026-06-06 — stop the incoming ringtone the INSTANT the user
        // accepts, not at .connected (which is seconds later after ICE). Otherwise
        // the ringtone keeps playing through the connecting phase.
        ringbackPlayer.stop()
        ringbackPlayer.stopRingtone()

        callState = .connecting
        // Audio session is configured at peer-connection setup (handleIncoming…),
        // not here — CallKit drives activation via provider:didActivate:.

        if let uuid = activeCallUUID {
            let answerAction = CXAnswerCallAction(call: uuid)
            let transaction = CXTransaction(action: answerAction)
            callController.request(transaction) { error in
                if let error { Logger.calls.error("CallKit answer failed: \(error.localizedDescription)") }
            }
        }

        if let remoteOffer = pendingRemoteOffer {
            // SDP offer already received while ringing — create answer immediately
            Task { [weak self] in
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
                    self.endCallInternal(reason: .failed("Failed to create SDP answer"))
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
            sdpOfferTimeoutTask?.cancel()
            sdpOfferTimeoutTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(QualityThresholds.sdpOfferTimeoutSeconds))
                guard let self, !Task.isCancelled else { return }
                guard case .connecting = self.callState, self.currentCallId == callId else { return }
                Logger.calls.error("SDP offer timeout for call: \(callId)")
                // The peer is still waiting on an answer that will never come —
                // tell the gateway now instead of leaving it to the cron reaper.
                MessageSocketManager.shared.emitCallEnd(callId: callId)
                self.endCallInternal(reason: .failed(String(localized: "call.error.timeout")))
            }
        }

        HapticFeedback.success()
    }

    /// Async wrapper used by CXAnswerCallAction so `action.fulfill()` is only
    /// called once the SDP+media setup task has been queued. This prevents
    /// CallKit from racing the WebRTC setup pipeline.
    func answerCallReady() async {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        callState = .connecting

        if let remoteOffer = pendingRemoteOffer {
            self.pendingRemoteOffer = nil
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
                self.endCallInternal(reason: .failed("Failed to create SDP answer"))
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
        } else {
            Logger.calls.info("Call answered (CallKit), awaiting SDP offer: \(callId)")
            sdpOfferTimeoutTask?.cancel()
            sdpOfferTimeoutTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(QualityThresholds.sdpOfferTimeoutSeconds))
                guard let self, !Task.isCancelled else { return }
                guard case .connecting = self.callState, self.currentCallId == callId else { return }
                Logger.calls.error("SDP offer timeout for call: \(callId)")
                // The peer is still waiting on an answer that will never come —
                // tell the gateway now instead of leaving it to the cron reaper.
                MessageSocketManager.shared.emitCallEnd(callId: callId)
                self.endCallInternal(reason: .failed(String(localized: "call.error.timeout")))
            }
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

        if let uuid = activeCallUUID {
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

    func endCall() {
        guard callState.isActive else { return }

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
        if let callId {
            Task {
                let acked = await MessageSocketManager.shared.emitCallEndWithAck(callId: callId)
                if !acked {
                    // Fallback : si le socket ack failed (timeout / déco),
                    // re-emit fire-and-forget. Le gateway a ses propres
                    // safeguards (CallCleanupService cron) qui finiront par
                    // ramasser le zombie après 60s.
                    MessageSocketManager.shared.emitCallEnd(callId: callId)
                    Logger.calls.warning("call:end ACK failed pour \(callId) — fallback fire-and-forget émis, gateway cron cleanup dans 60s")
                }
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
        endCallInternal(reason: .local)
        if let endUUID {
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

    /// Le PiP vidéo système peut s'activer : appel vidéo, track distant présent,
    /// caméra distante allumée, sur un appareil compatible (≠ iOS-app-on-Mac).
    var canActivateSystemPiP: Bool {
        isVideoEnabled && hasRemoteVideoTrack && isRemoteVideoEnabled && pip.isPiPSupported
    }

    /// Configure le PiP système pour cet appel (appelé par la vue avec la
    /// `sourceView` vidéo inline). No-op si l'appel n'est pas éligible.
    func attachSystemPiP(sourceView: UIView) {
        guard canActivateSystemPiP, let track = remoteVideoTrack else { return }
        let trackObject = track as AnyObject
        // Idempotence : `configure()` reconstruit le controller AVKit. Ne le refaire
        // que si la sourceView ou le track distant a changé (ce dernier peut être
        // recréé sur ICE restart / renégociation) — sinon chaque re-render SwiftUI
        // casserait un PiP en cours.
        guard pipConfiguredSource !== sourceView || pipConfiguredTrack !== trackObject else { return }
        pipConfiguredSource = sourceView
        pipConfiguredTrack = trackObject
        pip.configure(
            sourceView: sourceView, remoteTrack: trackObject, autoStart: true,
            onStart: { [weak self] in self?.isSystemPiPActive = true },
            onRestoreUI: { [weak self] in
                self?.pipRestoring = true
                self?.displayMode = .fullScreen
            },
            onStop: { [weak self] in
                guard let self else { return }
                self.isSystemPiPActive = false
                // Appel terminé pendant le PiP : ne pas forcer .pip (laisser le
                // panneau de fin d'appel en .fullScreen). detachSystemPiP a déjà
                // remis les flags au repos dans ce cas.
                guard self.callState.isActive else { self.pipRestoring = false; return }
                if self.pipRestoring {
                    self.pipRestoring = false   // restore : déjà repassé en .fullScreen
                } else {
                    self.displayMode = .pip     // croix système → la pilule reprend
                }
            }
        )
        // Aligne le framerate sur l'état thermique courant dès la config (le
        // handler thermal ignore les changements hors-appel → évite un héritage
        // périmé entre deux appels).
        pip.setMaxFrameRate(pipFrameRate(for: ProcessInfo.processInfo.thermalState))
    }

    /// Démarre le PiP manuellement (bouton). No-op si impossible/déjà actif.
    func startSystemPiP() { pip.start() }

    /// Libère le PiP (fin d'appel / éligibilité perdue).
    func detachSystemPiP() {
        pip.tearDown()
        isSystemPiPActive = false
        pipRestoring = false
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

    func toggleMute() {
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
        isSpeaker.toggle()
        applySpeakerRoute()
        HapticFeedback.light()
    }

    /// §5.4 — mid-call audio↔video switch (FaceTime-style asymmetric). Acquires/
    /// releases the camera, attaches/detaches it on the reserved video
    /// transceiver and, when the SDP direction changes, drives a renegotiation
    /// (createOffer → emit; the peer answers via handleSignalOffer's connected
    /// case). Replaces the old track.enabled flip, which left the upgrade
    /// invisible to the peer (no transceiver / no renegotiation).
    func toggleVideo() {
        videoToggleTask?.cancel()
        let target = !isVideoEnabled
        // Optimistic update: reflect intent immediately so rapid double-taps
        // read the new isVideoEnabled value and don't launch a duplicate toggle.
        // The tracked videoToggleTask ensures the later intent always wins:
        // if a second tap cancels this Task, the cancelled path does not update
        // any state — the second Task's result is authoritative.
        isVideoEnabled = target
        videoToggleTask = Task { @MainActor [weak self] in
            guard let self, !Task.isCancelled else { return }
            do {
                let needsRenegotiation: Bool
                if target {
                    needsRenegotiation = try await self.webRTCService.upgradeToVideo()
                } else {
                    needsRenegotiation = await self.webRTCService.downgradeFromVideo()
                }
                guard !Task.isCancelled else { return }
                self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack

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
                FeedbackToastManager.shared.showError("Impossible d'activer la vidéo")
            }
        }
    }

    func switchCamera() {
        webRTCService.switchCamera()
        // §7.7 — optimistic front/back tracking for mirroring. On iPhone/iPad a
        // flip alternates front↔back; on Mac switchCamera is usually a no-op so
        // the flag rarely matters there.
        isUsingFrontCamera.toggle()
        HapticFeedback.light()
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
        selectedCameraId = id
        webRTCService.switchToCamera(uniqueID: id)
        if let cam = availableCameras.first(where: { $0.id == id }) {
            // §7.7 — only the front camera is mirrored; external/back are not.
            isUsingFrontCamera = (cam.facing == .front)
        }
        HapticFeedback.light()
    }

    func toggleTranscription() {
        if transcriptionService.isTranscribing {
            transcriptionService.stopTranscribing()
        } else {
            let localUser = AuthManager.shared.currentUser
            let localLang = CallManager.preferredCallLanguage(for: localUser)
            let localUserId = localUser?.id ?? ""
            let rUserId = remoteUserId ?? ""
            Task { @MainActor [weak self] in
                guard let self else { return }
                var remoteLang = CallManager.preferredCallLanguage(for: nil)
                if !rUserId.isEmpty {
                    let cached = await CacheCoordinator.shared.profiles.load(for: rUserId)
                    if let profile = cached.snapshot()?.first {
                        remoteLang = CallManager.preferredCallLanguage(for: profile)
                    }
                }
                self.transcriptionService.startTranscribing(
                    localLanguage: localLang,
                    remoteLanguage: remoteLang,
                    localUserId: localUserId,
                    remoteUserId: rUserId
                )
            }
        }
    }

    var videoFilters: VideoFilterPipeline { webRTCService.videoFilters }
    var localVideoTrack: Any? { webRTCService.localVideoTrack }
    var remoteVideoTrack: Any? { webRTCService.remoteVideoTrack }

    // MARK: - Audio Effects

    func setAudioEffect(_ effect: AudioEffectConfig?) {
        webRTCService.setAudioEffect(effect)
        activeAudioEffect = effect
        HapticFeedback.light()
    }

    func updateAudioEffectParams(_ config: AudioEffectConfig) {
        webRTCService.updateAudioEffectParams(config)
        activeAudioEffect = config
    }

    func clearAudioEffect() {
        setAudioEffect(nil)
    }

    // MARK: - Call Waiting (§11.15)

    func rejectPendingCall() {
        guard let pending = pendingIncomingCall else { return }
        MessageSocketManager.shared.emitCallEnd(callId: pending.callId)
        pendingIncomingCall = nil
        showCallWaitingBanner = false
        Logger.calls.info("Rejected pending call: \(pending.callId)")
    }

    func endCurrentAndAnswerPending() {
        guard let pending = pendingIncomingCall else { return }
        showCallWaitingBanner = false

        endCall()

        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(0.5))
            guard let self else { return }
            self.handleIncomingCallNotification(
                callId: pending.callId,
                fromUserId: pending.fromUserId,
                fromUsername: pending.fromUsername,
                isVideo: pending.isVideo
            )
            self.pendingIncomingCall = nil
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
                self.endCallInternal(reason: .failed(String(localized: "call.error.sdp")))
                return
            }
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

    func handleRemoteReject(callId: String) {
        guard currentCallId == callId else { return }
        // Audit P2-iOS-6 — was .remoteEnded which Recents displays as
        // "Ended". The semantically correct CXCallEndedReason for an
        // explicit decline by the remote is .declinedElsewhere (Recents
        // shows "Declined" — better UX + analytics).
        if let uuid = activeCallUUID {
            callProvider.reportCall(with: uuid, endedAt: Date(), reason: .declinedElsewhere)
        }
        endCallInternal(reason: .rejected)
        HapticFeedback.error()
        Logger.calls.info("Call rejected by remote: \(callId)")
    }

    func handleRemoteEnd(callId: String, rawReason: String? = nil) {
        guard currentCallId == callId else { return }
        // Dedup : le serveur peut émettre `call:ended` plusieurs fois
        // (e.g. CXEndCallAction côté peer + cleanup serveur), et le user
        // local peut aussi avoir déjà raccroché en local. Si l'état est
        // déjà `.ended`, on ignore les doublons.
        if case .ended = callState { return }

        // Audit P1-24 — map the gateway's `reason` string to the right
        // CXCallEndedReason (drives Recents UX) and CallEndReason (drives
        // local analytics + UI). Without this, every remote end was reported
        // as `.remoteEnded`, which Recents displays as "Ended" — wrong for
        // missed/declined/answered-elsewhere.
        let cxReason: CXCallEndedReason
        let localReason: CallEndReason
        switch rawReason?.lowercased() {
        case "missed", "no_answer", "unanswered":
            cxReason = .unanswered
            localReason = .missed
        case "rejected", "declined":
            cxReason = .declinedElsewhere
            localReason = .rejected
        case "answeredelsewhere", "answered_elsewhere":
            cxReason = .answeredElsewhere
            localReason = .remote
        case "failed", "connectionlost":
            cxReason = .failed
            localReason = .connectionLost
        default:
            cxReason = .remoteEnded
            localReason = .remote
        }

        if let uuid = activeCallUUID {
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
            guard case .ringing(isOutgoing: true) = self.callState else { return }
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
    ///   - `.connecting`/`.offering`: applies the watchdog (`evaluateConnecting`)
    ///     so a wedged ICE/DTLS handshake gets ONE ICE restart, then fails,
    ///     instead of spinning "Connexion…" forever (bug h).
    ///   - `.connected`: applies the half-open self-heal (`evaluateHalfOpen`).
    ///     We stay `.connected` for snappy UX, but if after the grace window the
    ///     peer's RTP never arrives while ours flows, we trigger ONE ICE restart
    ///     (the heal is one-shot per call to honour "un ICE restart").
    /// Real disconnects/hangups remain handled by the PC-state delegate, remote
    /// `call:ended`, the user, and `outgoingRingTimeoutSeconds` (in `.ringing`).
    @MainActor
    private func startReliabilityMonitor() {
        reliabilityMonitorTask?.cancel()
        reliabilityMonitorTask = Task { @MainActor [weak self] in
            guard let self else { return }
            var connectingSince: Date?
            var connectedSince: Date?
            var didAttemptConnectingRestart = false
            // Half-open is checked only until it settles (media confirmed healthy
            // OR the one allowed self-heal fired). After that the connected branch
            // idles — ongoing transport faults surface via the PC-state delegate,
            // not by polling stats forever.
            var halfOpenSettled = false
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
                case .connecting, .offering:
                    connectedSince = nil
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
                        self.endCallInternal(reason: .failed(String(localized: "call.error.timeout")))
                        return
                    }
                case .connected:
                    connectingSince = nil
                    didAttemptConnectingRestart = false
                    reconnectingSince = nil
                    reconnectingWatchedAttempt = nil
                    let since = connectedSince ?? Date()
                    connectedSince = since
                    guard !halfOpenSettled else { break }
                    let elapsed = Date().timeIntervalSince(since)
                    guard let stats = await self.webRTCService.getStats() else { continue }
                    switch CallReliabilityPolicy.evaluateHalfOpen(
                        inboundPackets: stats.inboundPacketsReceived,
                        outboundPackets: stats.outboundPacketsSent,
                        secondsInConnected: elapsed
                    ) {
                    case .healthy:
                        halfOpenSettled = true
                        Logger.calls.debug("media bidirectional (inAudio=\(stats.inboundAudioPackets) inVideo=\(stats.inboundVideoPackets) out=\(stats.outboundPacketsSent))")
                    case .waiting:
                        break
                    case .healHalfOpen:
                        halfOpenSettled = true
                        Logger.calls.warning("half-open detected (in=0 out=\(stats.outboundPacketsSent)) after \(Int(elapsed))s — auto ICE restart")
                        self.attemptReconnection()
                    }
                case .reconnecting(let attempt):
                    connectingSince = nil
                    connectedSince = nil
                    // Re-arm half-open detection for the new connection period.
                    // Without this, an ICE restart that produces an asymmetric path
                    // (outbound OK but inbound broken) would skip the health check
                    // and silently stay `.connected` with no incoming audio/video.
                    halfOpenSettled = false
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
                        self.attemptReconnection()
                    }
                default:
                    connectingSince = nil
                    connectedSince = nil
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
        // Audio session was configured ONCE at peer-connection setup; CallKit
        // drives activation via provider:didActivate:, which is the single
        // place that flips RTCAudioSession.isAudioEnabled.
        // On reconnect use a lighter haptic — the user is mid-call, not initiating.
        playHaptic(wasReconnecting ? .light : .heavy)
        startScreenCaptureMonitoring()
        // Preserve the call start time and running duration on reconnect so the
        // timer does not reset to 0:00 mid-call after an ICE restart.
        if !wasReconnecting {
            callStartDate = Date()
            analyticsConnectedDate = callStartDate
            callDuration = 0
        }
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
                guard let self, let start = self.callStartDate else { return }
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
    @MainActor
    private func promoteRingingCallToCallKitIfNeeded() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard !callUsesCallKit, !ProcessInfo.processInfo.isiOSAppOnMac else { return }
        guard let uuid = activeCallUUID else { return }

        let handleValue = (remoteUserId?.isEmpty == false) ? remoteUserId! : (remoteUsername ?? "")
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: handleValue)
        update.localizedCallerName = remoteUsername
        update.hasVideo = isVideoEnabled
        update.supportsGrouping = false
        update.supportsHolding = false

        callUsesCallKit = true
        ringbackPlayer.shouldSelfActivateSession = false
        callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            guard let self else { return }
            if let error {
                Logger.calls.error("CallKit late-promote on background failed: \(error.localizedDescription)")
                self.callUsesCallKit = false
                self.ringbackPlayer.shouldSelfActivateSession = true
            } else {
                Logger.calls.info("Promoted ringing call to CallKit on background entry")
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
                if self.isVideoEnabled {
                    self.isVideoSuspendedByBackground = true
                    if !self.isVideoSuspendedByHold && !self.isVideoSuspended {
                        MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                        Logger.calls.info("Video backgrounded — peer notified (avatar placeholder)")
                    }
                }
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
                // Restore the peer's camera-active signal if we suspended it on
                // background entry. Guard on ALL suspension sources:
                // • isVideoSuspended — survival controller dropped to audio-only
                // • isVideoSuspendedByHold — CallKit hold still active (cellular
                //   pre-emption): foregrounding does NOT lift a hold, so we must
                //   not falsely signal "camera active" to the peer
                if self.isVideoSuspendedByBackground {
                    self.isVideoSuspendedByBackground = false
                    if self.isVideoEnabled && !self.isVideoSuspended && !self.isVideoSuspendedByHold {
                        MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: true)
                        Logger.calls.info("Video foregrounded — peer notified (camera restored)")
                    }
                }
            }
        }
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
                holdVideoTask?.cancel()
                holdVideoTask = Task { [weak self] in _ = await self?.webRTCService.downgradeFromVideo() }
                MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: false)
                Logger.calls.info("CallKit hold — video suspended, peer notified (callId=\(callId))")
            }
        } else {
            if isVideoSuspendedByHold {
                isVideoSuspendedByHold = false
                if isVideoEnabled && !isVideoSuspended && !isVideoSuspendedByBackground {
                    holdVideoTask?.cancel()
                    holdVideoTask = Task { [weak self] in _ = try? await self?.webRTCService.upgradeToVideo() }
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

    // MARK: - Metered Connection Check (M4)

    func isOnMeteredConnection() -> Bool {
        let path = networkMonitor.currentPath
        return path.isExpensive
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

                let isInActiveCall: Bool
                switch self.callState {
                case .connected, .reconnecting: isInActiveCall = true
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
        return try? JSONDecoder().decode(CallQualitySummary.self, from: data)
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
        guard let data = try? JSONEncoder().encode(summary) else { return }
        UserDefaults.standard.set(data, forKey: lastCallSummaryDefaultsKey)
    }

    private func emitCallAnalyticsIfNeeded(reason: CallEndReason) {
        guard let callId = currentCallId else { return }

        // Flush the final quality-level window into the distribution table.
        let now = Date()
        if let prevDate = analyticsLastQualityDate, let prevLevel = analyticsCurrentLevel {
            analyticsQualitySeconds[prevLevel, default: 0] += now.timeIntervalSince(prevDate)
        }

        let setupTimeMs: Int = analyticsConnectedDate.map {
            Int($0.timeIntervalSince(analyticsCallInitiatedDate ?? $0) * 1000)
        } ?? -1

        let totalSecs = analyticsQualitySeconds.values.reduce(0, +)
        let qualityDistribution: [String: Double]
        if totalSecs > 0 {
            let e = (analyticsQualitySeconds[.excellent] ?? 0) / totalSecs
            let g = (analyticsQualitySeconds[.good] ?? 0) / totalSecs
            let f = (analyticsQualitySeconds[.fair] ?? 0) / totalSecs
            let p = ((analyticsQualitySeconds[.poor] ?? 0) + (analyticsQualitySeconds[.critical] ?? 0)) / totalSecs
            qualityDistribution = ["excellent": e, "good": g, "fair": f, "poor": p]
        } else {
            qualityDistribution = ["excellent": 1.0, "good": 0.0, "fair": 0.0, "poor": 0.0]
        }

        let averageRtt = analyticsSampleCount > 0
            ? analyticsRttSum / Double(analyticsSampleCount) : 0
        let averagePacketLoss = analyticsSampleCount > 0
            ? analyticsPacketLossSum / Double(analyticsSampleCount) : 0
        let codec = lastKnownStats?.codec ?? "unknown"
        let filtersUsed = analyticsVideoFiltersUsed || webRTCService.videoFilters.config.isEnabled

        let payload: [String: Any] = [
            "setupTimeMs":         setupTimeMs,
            "durationSeconds":     callDuration,
            "reconnectionCount":   reconnectAttempt,
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
            "endReason":           String(describing: reason)
        ]
        MessageSocketManager.shared.emitCallAnalytics(callId: callId, payload: payload)

        // Reset accumulators so a subsequent call starts clean.
        analyticsCallInitiatedDate = nil
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
        stopHeartbeat()
        stopScreenCaptureMonitoring()
        stopBackgroundMonitoring()
        transcriptionService.resetForCallEnd()
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
        remoteQualityResetTask?.cancel()
        remoteQualityResetTask = nil
        iceRestartTask?.cancel()
        iceRestartTask = nil
        voipFreshnessTask?.cancel()
        voipFreshnessTask = nil
        isRemoteQualityDegraded = false
        pendingRemoteOffer = nil
        pendingIceCandidates = []
        thermalMonitor.stopMonitoring()
        // Snapshot analytics before state is torn down so the payload has access
        // to callId, callDuration, callStartDate, activeAudioEffect, etc.
        emitCallAnalyticsIfNeeded(reason: reason)
        activeAudioEffect = nil
        hasLocalVideoTrack = false
        hasRemoteVideoTrack = false
        callStartDate = nil
        reconnectAttempt = 0
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
        isVideoSuspendedByBackground = false
        isVideoSuspendedByHold = false
        detachSystemPiP()
        Self.persistCallSummary(stats: lastKnownStats, callId: currentCallId,
                                duration: callDuration, remote: remoteUsername, reason: reason)
        lastKnownStats = nil
        webRTCService.close()
        deactivateAudioSession()
        callState = .ended(reason: reason)
        connectionQuality = .new
        liveVideoQualityLevel = nil
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
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(QualityThresholds.callEndSettleSeconds))
            guard let self else { return }
            guard self.settleToken == token else { return }
            if case .ended = self.callState {
                self.settleToken = nil
                self.callState = .idle
                self.currentCallId = nil
                self.remoteUserId = nil
                self.remoteUsername = nil
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
        let isVideo = isVideoEnabled
        let configuration = RTCAudioSessionConfiguration.webRTC()
        configuration.category = AVAudioSession.Category.playAndRecord.rawValue
        // CALL-FIX 2026-06-06 (macOS) — on iOS-app-on-Mac the voice-processing I/O unit
        // (engaged by `.voiceChat`/`.videoChat`) faults on the mic uplink ("failed to
        // write uplink microphone input signal (state fault)") → the Mac mic captures
        // silence and the peer hears nothing. `.default` bypasses the voice processor;
        // WebRTC's own software AEC/NS still runs.
        configuration.mode = ProcessInfo.processInfo.isiOSAppOnMac
            ? AVAudioSession.Mode.default.rawValue
            : (isVideo ? AVAudioSession.Mode.videoChat : AVAudioSession.Mode.voiceChat).rawValue
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
                try? session.session.setPrefersNoInterruptionsFromSystemAlerts(true)
                // Align AVFoundation's I/O with Opus's native codec parameters.
                // 48 kHz avoids a sample-rate conversion stage inside the driver;
                // 20 ms buffer matches Opus's default frame duration and reduces
                // packetization jitter. Both are best-effort hints — the OS may
                // silently ignore them when the hardware doesn't support the value.
                try? session.session.setPreferredSampleRate(48_000)
                try? session.session.setPreferredIOBufferDuration(0.02)
                Logger.calls.info("RTCAudioSession pre-configured — video: \(isVideo), activeNow=\(activateNow)")
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

    fileprivate func applySpeakerRoute() {
        guard callState.isActive else { return }
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

        audioSessionQueue.sync {
            let session = RTCAudioSession.sharedInstance()
            session.lockForConfiguration()
            defer { session.unlockForConfiguration() }
            do {
                try session.overrideOutputAudioPort(port)
                Logger.calls.info("Audio route override applied: \(port.rawValue) (isSpeaker=\(speaker))")
            } catch {
                Logger.calls.error("Audio route change failed: \(error.localizedDescription)")
            }
        }
    }

    private func updateProximityMonitoring() {
        // Enable proximity monitoring only during audio-only active calls. The
        // sensor dims the screen (and blocks touch) when the phone is pressed to
        // the ear — essential for voice calls, harmful during video (blocks the
        // remote face). iOS handles dimming automatically once monitoring is on.
        let shouldMonitor = callState.isActive && !isVideoEnabled
        UIDevice.current.isProximityMonitoringEnabled = shouldMonitor
    }

    private func deactivateAudioSession() {
        // CallKit deactivates the AVAudioSession on its own when the call ends.
        // We only flip RTCAudioSession.isAudioEnabled; setActive(false) is the
        // job of provider:didDeactivate:.
        audioSessionQueue.sync {
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
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    // MARK: - Socket.IO Signaling

    private func setupSocketListeners() {
        let socket = MessageSocketManager.shared

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
                    iceServers: dynamicIceServers
                )
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
                self?.handleRemoteEnd(callId: event.callId, rawReason: event.reason)
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
                // INVALID_SIGNAL is a per-message relay rejection (a malformed or
                // non-WebRTC signal type), NOT a call-fatal operation error. It
                // must never tear down a healthy WebRTC call nor surface a user
                // toast — defense in depth against a stray app-level signal ever
                // reaching the strict gateway schema again.
                if event.code == "INVALID_SIGNAL" {
                    return
                }
                FeedbackToastManager.shared.showError(message)
                // Ne teardown que si un appel est réellement en vol (ringing →
                // reconnecting). Une erreur hors-appel ne fait qu'afficher le toast.
                if self.callState.isActive {
                    self.endCallInternal(reason: .failed(message))
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
                    let joined = await MessageSocketManager.shared.emitCallJoinWithAck(callId: callId)
                    guard self.callState.isActive, self.currentCallId == callId else { return }
                    if !joined {
                        Logger.calls.warning("Socket reconnect — call:join ACK timed out (callId=\(callId)), proceeding anyway")
                    }
                    self.flushPendingIceCandidates()
                    // Re-sync video state with the peer. The gateway resets the peer's
                    // call:media-toggled view when our socket disconnects; after reconnect
                    // the peer defaults to assuming our camera is on, which is wrong if we
                    // toggled video off, the survival controller suspended it, or we are
                    // backgrounded. Compute the effective state from all three sources.
                    if self.isVideoEnabled {
                        let effectiveVideoOn = !self.isVideoSuspended
                            && !self.isVideoSuspendedByBackground
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
                    // expiry (TTL=480s, refresh at 80%=384s — a 96-second window
                    // of vulnerability). Cancel the periodic scheduler first so the
                    // old deadline doesn't fire while the fresh response is in flight,
                    // causing duplicate requests. The response re-arms the scheduler
                    // at the new TTL via `call:ice-servers-refreshed`.
                    self.turnRefreshTask?.cancel()
                    self.turnRefreshTask = nil
                    MessageSocketManager.shared.emitRequestIceServers(callId: callId)
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
                guard let self, self.currentCallId == event.callId else { return }
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
            self.cancelOutgoingRingTimeout()
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
                    self.endCallInternal(reason: .failed("Failed to create offer"))
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
            .sink { handleJoin($0) }

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

    // Audit P3 — `toUserId` was accepted by the previous signature and
    // never used. Dropped for clarity — `call:leave` is server-routed via
    // the call room, no recipient field needed.
    private func emitCallReject(callId: String) {
        MessageSocketManager.shared.emitCallLeave(callId: callId)
    }

    // MARK: - Duration Formatting

    var formattedDuration: String {
        Self.formatDuration(callDuration)
    }

    /// Pure helper — extracted for unit-testability without touching `callDuration`.
    nonisolated static func formatDuration(_ duration: TimeInterval) -> String {
        let total = Int(duration)
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%02d:%02d", minutes, seconds)
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
                self.activeAudioEffect = nil
                self.webRTCService.setAudioEffect(nil)
                Logger.calls.warning("Thermal critical — disabled all filters (video + audio)")
                if self.isVideoEnabled {
                    self.isVideoEnabled = false
                    // §5.4 — use downgradeFromVideo (sets transceiver direction +
                    // stops capture) rather than enableVideo(false) (track.enabled
                    // only). Without the direction change the peer's SDP still
                    // advertises sendRecv and the RTP session stays open, which
                    // means the peer's decoder never tears down and the "camera off"
                    // media-toggled is the only signal it gets — race-prone and
                    // semantically wrong. Mirror the manual toggleVideo() path.
                    let needsRenegotiation = await self.webRTCService.downgradeFromVideo()
                    self.hasLocalVideoTrack = self.webRTCService.hasLocalVideoTrack
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
                // Fatal PeerConnection .failed/.closed during ICE restart.
                Logger.calls.warning("WebRTC fatal disconnect during ICE restart — triggering next attempt")
                self.attemptReconnection()
            default:
                Logger.calls.info("WebRTC disconnected in state: \(String(describing: self.callState))")
            }
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didReceiveTranscriptionData data: Data) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard let message = try? JSONDecoder().decode(DataChannelTranscriptionMessage.self, from: data) else { return }
            let segment = TranscriptionSegment(
                id: UUID(),
                text: message.text,
                speakerId: message.speakerId,
                startTime: message.startTime,
                endTime: message.startTime + 1.0,
                isFinal: message.isFinal,
                confidence: 1.0,
                language: message.language,
                translatedText: message.translatedText,
                translatedLanguage: message.translatedLanguage
            )
            self.transcriptionService.receiveRemoteSegment(segment)
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didReceiveRemoteVideoTrack track: Any) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.hasRemoteVideoTrack = true
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
            if self.webRTCService.videoFilters.config.isEnabled {
                self.analyticsVideoFiltersUsed = true
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

    @MainActor
    private func attemptReconnection() {
        reconnectAttempt += 1
        guard reconnectAttempt <= QualityThresholds.maxReconnectAttempts else {
            if let uuid = activeCallUUID {
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
        }

        let attempt = reconnectAttempt
        let backoffSeconds = attempt > 1 ? min(pow(2.0, Double(attempt - 1)), 4.0) : 0.0

        iceRestartTask?.cancel()
        iceRestartTask = Task { @MainActor [weak self] in
            guard let self, let callId = self.currentCallId, let userId = self.remoteUserId else { return }
            if backoffSeconds > 0 {
                try? await Task.sleep(for: .seconds(backoffSeconds))
                guard !Task.isCancelled, case .reconnecting(let current) = self.callState, current == attempt else { return }
            }
            guard let offer = await self.webRTCService.performICERestart() else {
                self.attemptReconnection(); return
            }
            guard !Task.isCancelled, case .reconnecting(let current) = self.callState, current == attempt else { return }
            self.emitCallOffer(callId: callId, toUserId: userId, isVideo: self.isVideoEnabled, sdp: offer)
        }
    }

    // Schedules a TURN credential refresh at 80% of the credential TTL.
    // Emits `call:request-ice-servers`; gateway responds with `call:ice-servers-refreshed`
    // which `setupSocketListeners` applies via `webRTCService.updateIceServers`.
    private func scheduleTURNCredentialRefresh(ttl: TimeInterval) {
        turnRefreshTask?.cancel()
        // Guard against a malformed or zero TTL from the gateway — a 0-second
        // delay would cause an immediate re-request, hammering the gateway in a
        // tight loop. Minimum 60 s is a reasonable floor; the expected value is
        // 480 s (8 min) or the TURN server's credential lifetime.
        guard ttl >= 60 else {
            Logger.calls.warning("TURN refresh TTL too short (\(Int(ttl))s) — skipping reschedule")
            return
        }
        // Guard against zero/negative TTL (malformed gateway response): a delay of
        // ≤0 would schedule an immediate refresh on every tick, hammering the gateway.
        let refreshDelay = max(QualityThresholds.turnMinRefreshDelaySeconds, ttl * 0.8)
        Logger.calls.info("TURN credential refresh scheduled in \(Int(refreshDelay))s (TTL=\(Int(ttl))s)")
        turnRefreshTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(refreshDelay))
            guard !Task.isCancelled, let self, self.callState.isActive,
                  let callId = self.currentCallId else { return }
            Logger.calls.info("Requesting fresh TURN credentials for call \(callId)")
            MessageSocketManager.shared.emitRequestIceServers(callId: callId)
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
    weak var manager: CallManager?

    func providerDidReset(_ provider: CXProvider) {
        Logger.calls.info("CallKit provider did reset")
        Task { @MainActor [weak self] in
            self?.manager?.endCall()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // CallKit requires fulfill()/fail() to be called synchronously before
        // the delegate method returns. Calling fulfill() from inside a Task
        // violates this contract — if the manager is nil or the task is
        // cancelled, the action is never settled and CallKit times out the call.
        action.fulfill()
        Task { @MainActor [weak self] in
            await self?.manager?.answerCallReady()
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
            let stateAtEntry = self?.manager?.callState
            Logger.calls.info(
                "CallKit -> CXEndCallAction received (callUUID=\(action.callUUID), state=\(String(describing: stateAtEntry)))"
            )
            self?.manager?.endCall()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        let isMuted = action.isMuted
        Task { @MainActor [weak self] in
            guard let manager = self?.manager else { return }
            if manager.isMuted != isMuted {
                manager.toggleMute()
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
            self?.manager?.handleHold(isOnHold)
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
        manager?.sendDTMF(digits: action.digits)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // CallKit owns AVAudioSession lifecycle; we ONLY bridge it to libwebrtc.
        // DO NOT call audioSession.setActive(true) here — CallKit already did.
        // Forcing it again creates desync between AVAudioSession and RTCAudioSession,
        // visible as alternating routes (Receiver/Speaker) in logs and silent calls.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.2
        manager?.audioSessionQueue.sync {
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.audioSessionDidActivate(audioSession)
            rtc.isAudioEnabled = true
            // Re-apply Opus-aligned I/O preferences now that CallKit owns
            // the session — setConfiguration earlier set them, but CallKit's
            // own activation may reset hardware-level parameters. Best-effort.
            try? audioSession.setPreferredSampleRate(48_000)
            try? audioSession.setPreferredIOBufferDuration(0.02)
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
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.isAudioEnabled = false
            rtc.audioSessionDidDeactivate(audioSession)
            rtc.unlockForConfiguration()
        }
        Logger.calls.info("CallKit audio session deactivated; RTCAudioSession disabled")
    }
}

// MARK: - VideoSurvivalActuating

extension CallManager: VideoSurvivalActuating {
    /// Drop outbound video to audio-only (sustained poor link). Mirrors the
    /// manual `toggleVideo` media path — downgrade + notify peer + renegotiate —
    /// but deliberately DOES NOT touch `isVideoEnabled`: the user's camera intent
    /// is preserved so video resumes automatically on recovery.
    func suspendOutboundVideo() async -> Bool {
        await applySurvivalVideoSend(enabled: false)
    }

    /// Re-acquire the camera and resume sending video once the link has recovered.
    func resumeOutboundVideo() async -> Bool {
        await applySurvivalVideoSend(enabled: true)
    }

    private func applySurvivalVideoSend(enabled: Bool) async -> Bool {
        // Only act while the user still wants video and we're in an active call.
        guard isVideoEnabled, let callId = currentCallId else { return false }
        // Do NOT renegotiate during an ICE restart: the SDP exchange is already
        // in flight, and overlapping it with a survival-controller downgrade or
        // resume causes SDP glare. The survival controller will re-evaluate once
        // the call reaches .connected and stats start flowing again.
        if case .reconnecting = callState { return false }
        // Do NOT resume video if an OS-level suspension is active: a CallKit hold
        // (cellular pre-emption) or background entry both signal "no camera" to the
        // peer. A network-quality recovery must not override either of those signals
        // — the peer would see a false "camera active" even though iOS is either
        // blocking camera access or has suspended capture for the held call.
        if enabled && (isVideoSuspendedByHold || isVideoSuspendedByBackground) { return false }
        do {
            let needsRenegotiation: Bool
            if enabled {
                needsRenegotiation = try await webRTCService.upgradeToVideo()
            } else {
                needsRenegotiation = await webRTCService.downgradeFromVideo()
            }
            hasLocalVideoTrack = webRTCService.hasLocalVideoTrack

            // The upgrade/downgrade above is a suspension point — the call may have
            // ended while we were awaiting. Re-check before signalling so we never
            // toggle video or emit a renegotiation offer for a call that is gone.
            guard currentCallId == callId else {
                Logger.calls.info("[CALL] survival A/V switch aborted: call ended mid-flight")
                return false
            }

            // Tell the peer so it shows our avatar placeholder (suspend) or
            // restores our video (resume) — a track flip alone never reaches it.
            MessageSocketManager.shared.emitCallToggleVideo(callId: callId, enabled: enabled)

            if needsRenegotiation,
               let userId = remoteUserId,
               let offer = await webRTCService.createOffer(),
               currentCallId == callId {
                emitCallOffer(callId: callId, toUserId: userId, isVideo: enabled, sdp: offer)
                Logger.calls.info("[CALL] survival A/V switch offer sent (video=\(enabled))")
            }
            return true
        } catch WebRTCError.cameraPermissionDenied where enabled {
            // Camera permission was revoked while the call was live.  The
            // survival controller would otherwise keep retrying on every
            // recovery cycle (each returning false → revert → retry next streak).
            // Permanently disable video to stop the loop: set isVideoEnabled=false
            // so the survival controller's next tick returns .initial immediately
            // (it guards on `userWantsVideo`). Then surface the Settings toast.
            Logger.calls.error("[CALL] survival resume failed: camera permission denied — permanently disabling video")
            isVideoEnabled = false
            videoSurvivalController.reset()
            FeedbackToastManager.shared.showError(
                String(localized: "call.video.permission.denied",
                       defaultValue: "Caméra : accès refusé — toucher pour ouvrir les Paramètres",
                       bundle: .main)
            ) {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            }
            return false
        } catch {
            Logger.calls.error("survival video \(enabled ? "resume" : "suspend") failed: \(error.localizedDescription)")
            return false
        }
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
