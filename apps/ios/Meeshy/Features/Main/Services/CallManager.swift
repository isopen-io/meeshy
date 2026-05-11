import Foundation
import AVFoundation
@preconcurrency import CallKit
import Combine
import Network
import UIKit
import MeeshySDK
@preconcurrency import WebRTC
import os

// MARK: - Call State

enum CallState: Equatable {
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

    var isActive: Bool {
        switch self {
        case .idle, .ended: return false
        default: return true
        }
    }

    var isRinging: Bool {
        if case .ringing = self { return true }
        return false
    }
}

// MARK: - Call Manager

@MainActor
final class CallManager: ObservableObject {
    static let shared = CallManager()

    // MARK: - Published State

    @Published private(set) var callState: CallState = .idle
    @Published private(set) var transcriptionService = CallTranscriptionService()
    @Published private(set) var remoteUserId: String?
    @Published private(set) var remoteUsername: String?
    @Published var isVideoEnabled: Bool = false
    @Published var isMuted: Bool = false
    @Published var isSpeaker: Bool = false
    @Published private(set) var callDuration: TimeInterval = 0
    @Published private(set) var currentCallId: String?
    @Published private(set) var connectionQuality: PeerConnectionState = .new
    @Published var displayMode: CallDisplayMode = .fullScreen
    @Published private(set) var activeAudioEffect: AudioEffectConfig?
    @Published private(set) var hasLocalVideoTrack = false
    @Published private(set) var hasRemoteVideoTrack = false
    @Published var pendingIncomingCall: (callId: String, fromUserId: String, fromUsername: String, isVideo: Bool)?

    // MARK: - Internal

    /// Phase 0 scaffold — owned but not yet wired into transitions.
    /// Subsequent phases migrate transition logic from CallManager into this actor.
    /// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.2
    private let eventQueue = CallEventQueue()

    private let webRTCService: WebRTCService
    private let ringbackPlayer = RingbackTonePlayer()
    // PERF-011: replace Timer.scheduledTimer with cancellable @MainActor Tasks.
    // Timers run on RunLoop.main and have no native cancellation hand-off; Tasks
    // are cooperative, energy-efficient (no RunLoop wakeup overhead), and
    // immediately stop their work loop on cancel.
    private var durationTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var rtpGateTask: Task<Void, Never>?
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
    private var participantJoinedCancellable: AnyCancellable?
    /// Audit P3 — replaces the never-assigned `signalOfferCancellable`
    /// (AnyCancellable, dead) with a properly typed Task slot. Two callers
    /// (`answerCall` and `answerCallReady`) schedule a 30s SDP-offer
    /// timeout; both now store the Task here so `endCallInternal` can
    /// cancel it cleanly instead of leaking it for the remaining sleep.
    private var sdpOfferTimeoutTask: Task<Void, Never>?
    private var pendingRemoteOffer: SessionDescription?
    private var cancellables = Set<AnyCancellable>()
    private let audioSessionQueue = DispatchQueue(label: "me.meeshy.callmanager.audiosession")

    // Screen capture monitoring
    private var screenCaptureObserver: NSObjectProtocol?
    private var backgroundObserver: NSObjectProtocol?
    private var foregroundObserver: NSObjectProtocol?

    // Network monitoring
    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "me.meeshy.callmanager.network")
    private var lastNetworkPath: NWPath.Status = .satisfied
    private let thermalMonitor = ThermalStateMonitor()

    // CallKit
    private let callProvider: CXProvider
    private let callController = CXCallController()
    private var activeCallUUID: UUID?

    private init(webRTCService: WebRTCService? = nil) {
        self.webRTCService = webRTCService ?? WebRTCService()

        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        // Audit P2-iOS-5 — was 2 but the app declares supportsHolding=false
        // on every CXCallUpdate. Contradictory pair confused some iOS
        // versions into showing a hold button on the lock screen.
        config.maximumCallGroups = 1
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

        setupSocketListeners()
        startNetworkMonitoring()
        startAudioInterruptionMonitoring()
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
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw ?? 0)
            guard options.contains(.shouldResume) else {
                Logger.calls.info("Audio interruption ended without shouldResume hint — skipping resume")
                return
            }
            Logger.calls.info("Audio interruption ended (shouldResume) — re-enabling RTCAudioSession")
            let rtc = RTCAudioSession.sharedInstance()
            rtc.lockForConfiguration()
            rtc.audioSessionDidActivate(AVAudioSession.sharedInstance())
            rtc.isAudioEnabled = true
            rtc.unlockForConfiguration()
        @unknown default:
            break
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
            isMuted = false
            isSpeaker = false
            Logger.calls.info("Force-reset .ended → .idle to accept new call")
        }
    }

    func startCall(conversationId: String, userId: String, displayName: String, isVideo: Bool) {
        resetEndedStateForNewCall()
        guard callState == .idle else {
            Logger.calls.warning("Cannot start call: already in state \(String(describing: self.callState))")
            return
        }

        // Optimistic local state — `currentCallId` is reassigned to the real
        // gateway-issued ObjectId once the ACK lands.
        remoteUserId = userId
        remoteUsername = displayName
        isVideoEnabled = isVideo
        isMuted = false
        isSpeaker = isVideo
        callState = .ringing(isOutgoing: true)
        lastCallWasOutgoing = true

        // Phase 1.5 — start ringback tone immediately when caller initiates.
        // The tone plays until state transitions to .connected or .ended.
        ringbackPlayer.start()
        startOutgoingRingTimeout()

        let uuid = UUID()
        activeCallUUID = uuid
        // CXHandle.value persists in the iOS Phone app Recents list — use the
        // userId for stable identity rather than a (possibly localized) name.
        let handle = CXHandle(type: .generic, value: userId)
        let startAction = CXStartCallAction(call: uuid, handle: handle)
        startAction.isVideo = isVideo
        startAction.contactIdentifier = displayName
        let transaction = CXTransaction(action: startAction)
        let provider = callProvider
        Logger.calls.info("[CALLKIT_DIAG] callController.request(CXStartCallAction) submitted (uuid=\(uuid))")
        callController.request(transaction) { [weak self] error in
            if let error {
                Logger.calls.error("[CALLKIT_DIAG] CXStartCallAction request FAILED: \(error.localizedDescription)")
                Task { @MainActor in self?.endCallInternal(reason: .failed("CallKit error")) }
            } else {
                Logger.calls.info("[CALLKIT_DIAG] CXStartCallAction request ACCEPTED — reporting update + startedConnectingAt (uuid=\(uuid))")
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
                Logger.calls.info("[CALLKIT_DIAG] reportOutgoingCall(_:startedConnectingAt:) called (uuid=\(uuid))")
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
        Task { [weak self, uuid] in
            guard let self else { return }
            do {
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
                Logger.calls.info("[CALL_SETUP] outgoing 2/4 configureAudioSession begin")
                self.configureAudioSession()
                Logger.calls.info("[CALL_SETUP] outgoing 3/4 startLocalMedia begin (isVideo=\(isVideo))")
                do {
                    try await self.webRTCService.startLocalMedia(isVideo: isVideo)
                    guard self.activeCallUUID == uuid else {
                        Logger.calls.info("[CALL_SETUP] startLocalMedia completed after end — discarding")
                        return
                    }
                    if isVideo { self.hasLocalVideoTrack = true }
                } catch WebRTCError.simulatorVideoUnsupported {
                    // Phase 1 fix E7/B4: simulator can't run video — degrade to audio-only
                    Logger.calls.warning("Simulator video unsupported — continuing audio-only")
                    guard self.activeCallUUID == uuid else { return }
                    self.isVideoEnabled = false
                    try? await self.webRTCService.startLocalMedia(isVideo: false)
                    guard self.activeCallUUID == uuid else { return }
                } catch {
                    Logger.calls.error("startLocalMedia failed: \(error.localizedDescription)")
                    if self.activeCallUUID == uuid {
                        self.endCallInternal(reason: .failed(String(localized: "call.error.media")))
                    }
                    return
                }
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
        callState = .ringing(isOutgoing: false)
        activeCallUUID = uuid

        callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            guard let error else { return }
            Logger.calls.error("CallKit VoIP report failed: \(error.localizedDescription)")
            Task { @MainActor [weak self] in
                self?.endCallInternal(reason: .failed("CallKit error"))
            }
        }

        // Auto-join call room + configure WebRTC so SDP offer can be received while ringing.
        // The VoIP push payload carries the per-user ICE servers (TURN credentials)
        // so RTCPeerConnection is built with TURN BEFORE the offer is set.
        Logger.calls.info("[CALL_SETUP] incoming 1/4 webRTC.configure begin (isVideo=\(isVideo))")
        webRTCService.configure(isVideo: isVideo, iceServers: iceServers)
        Logger.calls.info("[CALL_SETUP] incoming 2/4 configureAudioSession begin")
        configureAudioSession()

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
            do {
                try await self.webRTCService.startLocalMedia(isVideo: isVideo)
                if isVideo { self.hasLocalVideoTrack = true }
            } catch WebRTCError.simulatorVideoUnsupported {
                // Phase 1 fix E7/B4: simulator can't run video — degrade to audio-only
                Logger.calls.warning("Simulator video unsupported — continuing audio-only")
                self.isVideoEnabled = false
                try? await self.webRTCService.startLocalMedia(isVideo: false)
            } catch {
                Logger.calls.error("startLocalMedia failed: \(error.localizedDescription)")
                self.endCallInternal(reason: .failed(String(localized: "call.error.media")))
                return
            }
            Logger.calls.info("[CALL_SETUP] incoming 4/4 startLocalMedia done")
        }

        Logger.calls.info("VoIP push incoming call reported: \(callId) from \(callerName)")
        HapticFeedback.medium()
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

        currentCallId = callId
        remoteUserId = fromUserId
        remoteUsername = fromUsername
        isVideoEnabled = isVideo
        isMuted = false
        isSpeaker = isVideo
        callState = .ringing(isOutgoing: false)

        let uuid = UUID()
        activeCallUUID = uuid
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: fromUserId.isEmpty ? fromUsername : fromUserId)
        update.localizedCallerName = fromUsername
        update.hasVideo = isVideo
        update.supportsGrouping = false
        update.supportsHolding = false

        callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error {
                Logger.calls.error("CallKit report incoming failed: \(error.localizedDescription)")
                Task { @MainActor in self?.endCallInternal(reason: .failed("CallKit error")) }
            }
        }

        // Auto-join call room + configure WebRTC so SDP offer can be received while ringing
        webRTCService.configure(isVideo: isVideo, iceServers: iceServers)
        configureAudioSession()

        // Phase 2 fix — Bug 2: emit call:join IMMEDIATELY so the caller receives
        // PARTICIPANT_JOINED while we initialize media in parallel. See
        // `localMediaTask` property doc for rationale and downstream contract.
        MessageSocketManager.shared.emitCallJoin(callId: callId)
        Logger.calls.info("Incoming call — emitted call:join early; starting media in parallel: \(callId)")

        localMediaTask?.cancel()
        localMediaTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.webRTCService.startLocalMedia(isVideo: isVideo)
                if isVideo { self.hasLocalVideoTrack = true }
            } catch WebRTCError.simulatorVideoUnsupported {
                // Phase 1 fix E7/B4: simulator can't run video — degrade to audio-only
                Logger.calls.warning("Simulator video unsupported — continuing audio-only")
                self.isVideoEnabled = false
                try? await self.webRTCService.startLocalMedia(isVideo: false)
            } catch {
                Logger.calls.error("startLocalMedia failed: \(error.localizedDescription)")
                self.endCallInternal(reason: .failed(String(localized: "call.error.media")))
                return
            }
            Logger.calls.info("Incoming call — local media ready: \(callId)")
        }

        Logger.calls.info("Incoming call notification from \(fromUsername): \(callId)")
        HapticFeedback.medium()
    }

    // MARK: - Signal Offer (real SDP from caller after auto-join)

    func handleSignalOffer(callId: String, sdp: SessionDescription) {
        guard currentCallId == callId else {
            Logger.calls.warning("Signal offer for unknown call: \(callId)")
            return
        }
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
                    self.endCallInternal(reason: .failed("Failed to create SDP answer"))
                    return
                }
                await self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                Logger.calls.info("SDP answer created from late offer for call: \(callId)")
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
                    self.endCallInternal(reason: .failed("Failed to create SDP answer"))
                    return
                }
                await self.emitCallAnswer(callId: callId, toUserId: userId, sdp: answer)
                self.pendingRemoteOffer = nil
                Logger.calls.info("Call answered with buffered SDP offer: \(callId)")
            }
        } else {
            // SDP offer not yet received — wait for it via handleSignalOffer with 30s timeout
            Logger.calls.info("Call answered but SDP offer not yet received, waiting: \(callId)")
            sdpOfferTimeoutTask?.cancel()
            sdpOfferTimeoutTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(30))
                guard let self, !Task.isCancelled else { return }
                guard case .connecting = self.callState, self.currentCallId == callId else { return }
                Logger.calls.error("SDP offer timeout after 30s for call: \(callId)")
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
                self.endCallInternal(reason: .failed("Failed to create SDP answer"))
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
                try? await Task.sleep(for: .seconds(30))
                guard let self, !Task.isCancelled else { return }
                guard case .connecting = self.callState, self.currentCallId == callId else { return }
                Logger.calls.error("SDP offer timeout after 30s for call: \(callId)")
                self.endCallInternal(reason: .failed(String(localized: "call.error.timeout")))
            }
        }

        HapticFeedback.success()
    }

    // MARK: - Reject Call

    func rejectCall() {
        guard case .ringing(isOutgoing: false) = callState else { return }
        guard let callId = currentCallId, let userId = remoteUserId else { return }

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
        guard let callId = currentCallId, let userId = remoteUserId else { return }

        emitCallEnd(callId: callId, toUserId: userId)

        if let uuid = activeCallUUID {
            let endAction = CXEndCallAction(call: uuid)
            callController.request(CXTransaction(action: endAction)) { error in
                if let error { Logger.calls.error("CallKit end failed: \(error.localizedDescription)") }
            }
        }

        endCallInternal(reason: .local)
        Logger.calls.info("Call ended by local: \(callId)")
    }

    // MARK: - Media Controls

    func toggleMute() {
        // Audit P1-13 — keep optimistic UX (instant local flip) but rollback
        // local state + WebRTC if CallKit refuses the transaction. Without
        // the rollback, the app's `isMuted` and the WebRTC track were
        // permanently out of sync with CallKit's system mute UI — once
        // diverged, only a call hangup recovered it.
        let previous = isMuted
        isMuted.toggle()
        webRTCService.muteAudio(isMuted)

        guard let uuid = activeCallUUID else {
            HapticFeedback.light()
            return
        }
        let muteAction = CXSetMutedCallAction(call: uuid, muted: isMuted)
        callController.request(CXTransaction(action: muteAction)) { [weak self] error in
            if let error {
                Logger.calls.error("CallKit mute failed (rolling back local state): \(error.localizedDescription)")
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    self.isMuted = previous
                    self.webRTCService.muteAudio(self.isMuted)
                }
            }
        }

        HapticFeedback.light()
    }

    func toggleSpeaker() {
        isSpeaker.toggle()
        applySpeakerRoute()
        HapticFeedback.light()
    }

    func toggleVideo() {
        isVideoEnabled.toggle()
        webRTCService.enableVideo(isVideoEnabled)
        HapticFeedback.light()
    }

    func switchCamera() {
        webRTCService.switchCamera()
        HapticFeedback.light()
    }

    func toggleTranscription() {
        if transcriptionService.isTranscribing {
            transcriptionService.stopTranscribing()
        } else {
            let localLang = "fr"
            let remoteLang = "fr"
            let localUserId = AuthManager.shared.currentUser?.id ?? ""
            let remoteUserId = remoteUserId ?? ""
            transcriptionService.startTranscribing(
                localLanguage: localLang,
                remoteLanguage: remoteLang,
                localUserId: localUserId,
                remoteUserId: remoteUserId
            )
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

    func handleRemoteAnswer(callId: String, sdp: SessionDescription) {
        guard currentCallId == callId else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            await self.webRTCService.setRemoteDescription(sdp)
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

    func handleRemoteICECandidate(callId: String, candidate: IceCandidate) {
        guard currentCallId == callId else { return }
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
        case "answeredelsewhere":
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

    // MARK: - Private: State Transitions

    @MainActor
    private func startRTPGatePolling() {
        rtpGateTask?.cancel()
        rtpGateTask = Task { @MainActor [weak self] in
            guard let self else { return }
            for attempt in 1...QualityThresholds.rtpGateMaxAttempts {
                let nanos = UInt64(QualityThresholds.rtpGatePollIntervalSeconds * 1_000_000_000)
                try? await Task.sleep(nanoseconds: nanos)
                guard !Task.isCancelled else { return }
                guard let stats = await self.webRTCService.getStats() else { continue }
                if stats.inboundPacketsReceived >= QualityThresholds.rtpGateRequiredPackets {
                    Logger.calls.info(
                        "RTP gate passed at attempt \(attempt) (packets=\(stats.inboundPacketsReceived))"
                    )
                    self.transitionToConnected()
                    return
                }
                Logger.calls.debug(
                    "RTP gate attempt \(attempt)/\(QualityThresholds.rtpGateMaxAttempts) — packets=\(stats.inboundPacketsReceived) (need \(QualityThresholds.rtpGateRequiredPackets))"
                )
            }
            Logger.calls.error(
                "RTP gate timeout after \(QualityThresholds.rtpGateMaxAttempts) attempts — ICE connected but no media. Ending call."
            )
            self.endCallInternal(reason: .failed("media path broken (no inbound RTP)"))
        }
    }

    private func transitionToConnected() {
        ringbackPlayer.stop()
        callState = .connected
        // Audio session was configured ONCE at peer-connection setup; CallKit
        // drives activation via provider:didActivate:, which is the single
        // place that flips RTCAudioSession.isAudioEnabled.
        playHaptic(.heavy)
        startScreenCaptureMonitoring()
        callStartDate = Date()
        callDuration = 0
        reconnectAttempt = 0
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
        if lastCallWasOutgoing, let uuid = activeCallUUID {
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
                let fromId = AuthManager.shared.currentUser?.id ?? ""
                let remoteId = self.remoteUserId ?? ""
                MessageSocketManager.shared.emitCallSignal(
                    callId: callId,
                    type: "heartbeat",
                    payload: ["from": fromId, "to": remoteId]
                )
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
        screenCaptureObserver = NotificationCenter.default.addObserver(
            forName: UIScreen.capturedDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let isCapturing = UIScreen.main.isCaptured
                Logger.calls.info("Screen capture state changed: \(isCapturing)")
                if let callId = self.currentCallId, let remoteId = self.remoteUserId {
                    let fromId = AuthManager.shared.currentUser?.id ?? ""
                    MessageSocketManager.shared.emitCallSignal(
                        callId: callId,
                        type: "screen-capture-detected",
                        payload: ["isCapturing": isCapturing ? "true" : "false", "from": fromId, "to": remoteId]
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

    private func startBackgroundMonitoring() {
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let callId = self.currentCallId, let remoteId = self.remoteUserId else { return }
                let fromId = AuthManager.shared.currentUser?.id ?? ""
                MessageSocketManager.shared.emitCallSignal(
                    callId: callId,
                    type: "backgrounded",
                    payload: ["from": fromId, "to": remoteId]
                )
                Logger.calls.info("Call backgrounded — notified server for extended heartbeat timeout")
            }
        }

        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let callId = self.currentCallId, let remoteId = self.remoteUserId else { return }
                let fromId = AuthManager.shared.currentUser?.id ?? ""
                MessageSocketManager.shared.emitCallSignal(
                    callId: callId,
                    type: "foregrounded",
                    payload: ["from": fromId, "to": remoteId]
                )
                Logger.calls.info("Call foregrounded — resumed normal heartbeat timeout")
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
                self.lastNetworkPath = path.status

                let isInActiveCall: Bool
                switch self.callState {
                case .connected, .reconnecting: isInActiveCall = true
                default: isInActiveCall = false
                }
                guard isInActiveCall else { return }

                if path.status != .satisfied {
                    Logger.calls.warning("Network lost during call — starting reconnection")
                    self.attemptReconnection()
                } else if wasUnsatisfied && isNowSatisfied {
                    Logger.calls.info("Network recovered during call — performing ICE restart")
                    self.attemptReconnection()
                }
            }
        }
        networkMonitor.start(queue: networkQueue)
    }

    private func endCallInternal(reason: CallEndReason) {
        ringbackPlayer.stop()
        durationTask?.cancel()
        durationTask = nil
        rtpGateTask?.cancel()
        rtpGateTask = nil
        localMediaTask?.cancel()
        localMediaTask = nil
        outgoingRingTimeoutTask?.cancel()
        outgoingRingTimeoutTask = nil
        stopHeartbeat()
        stopScreenCaptureMonitoring()
        stopBackgroundMonitoring()
        if transcriptionService.isTranscribing {
            transcriptionService.stopTranscribing()
        }
        participantJoinedCancellable?.cancel()
        participantJoinedCancellable = nil
        sdpOfferTimeoutTask?.cancel()
        sdpOfferTimeoutTask = nil
        pendingRemoteOffer = nil
        thermalMonitor.stopMonitoring()
        activeAudioEffect = nil
        hasLocalVideoTrack = false
        hasRemoteVideoTrack = false
        callStartDate = nil
        reconnectAttempt = 0
        webRTCService.close()
        deactivateAudioSession()
        callState = .ended(reason: reason)
        connectionQuality = .new
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
            try? await Task.sleep(for: .milliseconds(1500))
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
        configuration.mode = (isVideo ? AVAudioSession.Mode.videoChat : AVAudioSession.Mode.voiceChat).rawValue
        // PERF-010: drop .allowBluetoothA2DP. A2DP is an output-only profile and
        // conflicts with the bidirectional voice path (forces the OS to flap
        // between A2DP and HFP, causing periodic ~200ms audio glitches). HFP
        // already covers BT headsets via the SCO bidirectional voice link.
        configuration.categoryOptions = [.allowBluetoothHFP, .duckOthers]

        let session = RTCAudioSession.sharedInstance()
        Logger.calls.info("[AUDIO_SESS] lockForConfiguration")
        session.lockForConfiguration()
        defer {
            Logger.calls.info("[AUDIO_SESS] unlockForConfiguration")
            session.unlockForConfiguration()
        }
        do {
            Logger.calls.info("[AUDIO_SESS] setConfiguration call")
            try session.setConfiguration(configuration, active: false)
            Logger.calls.info("RTCAudioSession pre-configured — video: \(isVideo) (CallKit will activate)")
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

    fileprivate func applySpeakerRoute() {
        guard callState.isActive else { return }
        let speaker = isSpeaker
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        defer { session.unlockForConfiguration() }

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
        let port: AVAudioSession.PortOverride = speaker ? .speaker : .none
        #endif

        do {
            try session.overrideOutputAudioPort(port)
            Logger.calls.info("Audio route override applied: \(port.rawValue) (isSpeaker=\(speaker))")
        } catch {
            Logger.calls.error("Audio route change failed: \(error.localizedDescription)")
        }
    }

    private func deactivateAudioSession() {
        // CallKit deactivates the AVAudioSession on its own when the call ends.
        // We only flip RTCAudioSession.isAudioEnabled; setActive(false) is the
        // job of provider:didDeactivate:.
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        session.isAudioEnabled = false
        session.unlockForConfiguration()
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

        socket.callSignalOfferReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let sdpString = event.signal.sdp else { return }
                let sdp = SessionDescription(type: .offer, sdp: sdpString)
                self?.handleSignalOffer(callId: event.callId, sdp: sdp)
            }
            .store(in: &cancellables)

        socket.callAnswerReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let sdpString = event.signal.sdp else { return }
                let sdp = SessionDescription(type: .answer, sdp: sdpString)
                self?.handleRemoteAnswer(callId: event.callId, sdp: sdp)
            }
            .store(in: &cancellables)

        socket.callICECandidateReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let candidateString = event.signal.candidate else { return }
                let candidate = IceCandidate(
                    sdpMid: event.signal.sdpMid,
                    sdpMLineIndex: Int32(event.signal.sdpMLineIndex ?? 0),
                    candidate: candidateString
                )
                self?.handleRemoteICECandidate(callId: event.callId, candidate: candidate)
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
                MessageSocketManager.shared.emitCallJoin(callId: callId)
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
    }

    // MARK: - Participant Joined (Outgoing Call)

    private func listenForParticipantJoined(callId: String, toUserId: String, isVideo: Bool) {
        participantJoinedCancellable?.cancel()
        participantJoinedCancellable = MessageSocketManager.shared.callParticipantJoined
            .receive(on: DispatchQueue.main)
            .filter { $0.callId == callId }
            .first()
            .sink { [weak self] event in
                guard let self else { return }
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
                        self.endCallInternal(reason: .failed("Failed to create offer"))
                        return
                    }
                    self.emitCallOffer(callId: callId, toUserId: toUserId, isVideo: isVideo, sdp: offer)
                    Logger.calls.info("SDP offer sent for call: \(callId)")
                }
            }
    }

    // MARK: - Socket Emit Helpers

    private func emitCallOffer(callId: String, toUserId: String, isVideo: Bool, sdp: SessionDescription) {
        let fromUserId = AuthManager.shared.currentUser?.id ?? ""
        MessageSocketManager.shared.emitCallSignal(
            callId: callId,
            type: "offer",
            payload: ["sdp": sdp.sdp, "to": toUserId, "from": fromUserId]
        )
    }

    /// PERF-004: Awaits gateway ACK (3s timeout) confirming the SDP answer
    /// was relayed to the remote peer. Returning from this method means the
    /// answer is on the wire — so CXAnswerCallAction.fulfill() can run with
    /// confidence that the ICE/SDP exchange has actually started.
    @discardableResult
    private func emitCallAnswer(callId: String, toUserId: String, sdp: SessionDescription) async -> Bool {
        let fromUserId = AuthManager.shared.currentUser?.id ?? ""
        let acked = await MessageSocketManager.shared.emitCallSignalWithAck(
            callId: callId,
            type: "answer",
            payload: ["sdp": sdp.sdp, "to": toUserId, "from": fromUserId]
        )
        if !acked {
            Logger.calls.warning("SDP answer ACK timed out (3s) for call: \(callId) — proceeding optimistically")
        }
        return acked
    }

    // Audit P3 — `toUserId` was accepted by the previous signature and
    // never used. Dropped for clarity — `call:leave` is server-routed via
    // the call room, no recipient field needed.
    private func emitCallReject(callId: String) {
        MessageSocketManager.shared.emitCallLeave(callId: callId)
    }

    private func emitCallEnd(callId: String, toUserId: String) {
        MessageSocketManager.shared.emitCallEnd(callId: callId)
    }

    // MARK: - Duration Formatting

    var formattedDuration: String {
        let minutes = Int(callDuration) / 60
        let seconds = Int(callDuration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

// MARK: - ThermalStateMonitorDelegate

extension CallManager: ThermalStateMonitorDelegate {
    nonisolated func thermalStateDidChange(to state: ProcessInfo.ThermalState) {
        Task { @MainActor [weak self] in
            guard let self, self.callState == .connected else { return }
            if state == .critical {
                self.webRTCService.videoFilterPipeline.reset()
                self.activeAudioEffect = nil
                self.webRTCService.setAudioEffect(nil)
                Logger.calls.warning("Thermal critical — disabled all filters (video + audio)")
                if self.isVideoEnabled {
                    self.isVideoEnabled = false
                    self.webRTCService.enableVideo(false)
                    Logger.calls.warning("Thermal critical — disabled video")
                }
            } else if state == .serious {
                self.webRTCService.videoFilterPipeline.config.backgroundBlurEnabled = false
                self.webRTCService.videoFilterPipeline.config.skinSmoothingEnabled = false
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
                "from": fromUserId
            ]
            if let sdpMid = candidate.sdpMid {
                payload["sdpMid"] = sdpMid
            }
            MessageSocketManager.shared.emitCallSignal(
                callId: callId,
                type: "ice-candidate",
                payload: payload
            )
            Logger.calls.debug("Sent ICE candidate for call: \(callId)")
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
            switch self.callState {
            case .connecting:
                // Phase 1 fix E6: ICE connected does not guarantee media flows.
                // Poll stats every 2s up to 5 attempts (10s budget). Require
                // ≥5 inbound RTP packets before declaring .connected. If no
                // RTP after 10s, end with .failed("media path broken").
                self.startRTPGatePolling()
            case .reconnecting:
                Logger.calls.info("Reconnection successful — running RTP gate")
                self.startRTPGatePolling()
            case .offering:
                // Audit 2026-05-11 §B-Claim-3 — defensive recovery path.
                // Normally handleRemoteAnswer transitions .offering → .connecting
                // before ICE establishes. If that transition is missed (callId
                // guard mismatch, setRemoteDescription throw inside the await,
                // a re-entrant flow that left state at .offering), the call
                // silently hangs in .offering with media flowing — the original
                // outgoing-ring timeout was already cancelled, so there's no
                // fallback. Treat ICE-connected on .offering as an implicit
                // catch-up to .connecting and run the RTP gate so the user
                // sees the call connect rather than spin until they cancel.
                Logger.calls.warning("[CallFSM] ICE connected while state=.offering — recovering via RTP gate")
                self.callState = .connecting
                self.startRTPGatePolling()
            default:
                Logger.calls.debug("[CallFSM] webRTCServiceDidConnect ignored in state \(String(describing: self.callState))")
            }
        }
    }

    nonisolated func webRTCServiceDidDisconnect(_ service: WebRTCService) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            switch self.callState {
            case .connected, .reconnecting:
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
            self?.hasRemoteVideoTrack = true
            Logger.calls.info("Remote video track received in CallManager")
        }
    }

    nonisolated func webRTCService(_ service: WebRTCService, didChangeQualityLevel level: VideoQualityLevel, from previous: VideoQualityLevel) {
        Task { @MainActor [weak self] in
            guard self != nil else { return }
            guard UIAccessibility.isReduceMotionEnabled == false else { return }
            switch level {
            case .poor, .critical:
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            case .excellent, .good:
                if previous <= .fair {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
            case .fair:
                break
            }
        }
    }

    @MainActor
    private func attemptReconnection() {
        reconnectAttempt += 1
        guard reconnectAttempt <= QualityThresholds.maxReconnectAttempts else {
            Logger.calls.error("Max reconnect attempts (\(QualityThresholds.maxReconnectAttempts)) reached — ending call")
            if let uuid = activeCallUUID {
                callProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
            }
            endCallInternal(reason: .connectionLost)
            return
        }

        callState = .reconnecting(attempt: reconnectAttempt)
        playHaptic(.light)
        Logger.calls.warning("Attempting ICE restart (\(self.reconnectAttempt)/\(QualityThresholds.maxReconnectAttempts))")

        Task { [weak self] in
            guard let self, let callId = self.currentCallId, let userId = self.remoteUserId else { return }
            guard let offer = await self.webRTCService.performICERestart() else {
                Logger.calls.error("ICE restart failed to produce offer")
                self.attemptReconnection()
                return
            }
            self.emitCallOffer(callId: callId, toUserId: userId, isVideo: self.isVideoEnabled, sdp: offer)
            Logger.calls.info("ICE restart offer sent for call: \(callId)")
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
        Task { @MainActor [weak self] in
            await self?.manager?.answerCallReady()
            action.fulfill()
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
        Task { @MainActor [weak self] in
            let stateAtEntry = self?.manager?.callState
            Logger.calls.info(
                "CallKit -> CXEndCallAction received (callUUID=\(action.callUUID), state=\(String(describing: stateAtEntry)))"
            )
            self?.manager?.endCall()
            action.fulfill()
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

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        // The outgoing call path is initiated by the user's UI tap; CallManager
        // builds the WebRTC stack asynchronously. Fulfilling immediately here is
        // safe because we don't await any media setup from this delegate.
        Logger.calls.info("[CALLKIT_DIAG] provider:perform:CXStartCallAction RECEIVED (callUUID=\(action.callUUID)) — fulfilling")
        action.fulfill()
        Logger.calls.info("[CALLKIT_DIAG] CXStartCallAction.fulfill() RETURNED")
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // CallKit owns AVAudioSession lifecycle; we ONLY bridge it to libwebrtc.
        // DO NOT call audioSession.setActive(true) here — CallKit already did.
        // Forcing it again creates desync between AVAudioSession and RTCAudioSession,
        // visible as alternating routes (Receiver/Speaker) in logs and silent calls.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.2
        Logger.calls.info("[CALLKIT_DIAG] provider:didActivate:audioSession RECEIVED — CallKit considers the call active")
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        rtc.audioSessionDidActivate(audioSession)
        rtc.isAudioEnabled = true
        rtc.unlockForConfiguration()

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
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        rtc.isAudioEnabled = false
        rtc.audioSessionDidDeactivate(audioSession)
        rtc.unlockForConfiguration()
        Logger.calls.info("CallKit audio session deactivated; RTCAudioSession disabled")
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
