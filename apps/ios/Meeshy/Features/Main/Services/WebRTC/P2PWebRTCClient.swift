import Foundation
import AVFoundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC
import MeeshySDK

// `@unchecked Sendable` contract: every property mutation is serialised on the
// main queue — callers arrive via @MainActor (WebRTCService / CallManager), and
// RTCPeerConnectionDelegate callbacks are `nonisolated` + dispatch to
// DispatchQueue.main.async before touching state (see MARK: RTCPeerConnectionDelegate).
// `@MainActor` on the class is not viable: WebRTC's signaling_thread / network_thread
// call the @objc delegate thunks off-main; Swift 6 would assert isolation and crash.
final class P2PWebRTCClient: NSObject, WebRTCClientProviding, @unchecked Sendable {
    weak var delegate: (any WebRTCClientDelegate)?

    var peerConnection: RTCPeerConnection?
    let factory: RTCPeerConnectionFactory
    private var localAudioTrack: RTCAudioTrack?
    private var audioTransceiver: RTCRtpTransceiver?
    var videoTransceiver: RTCRtpTransceiver?
    var dataProfile: CallDataProfile = .wifi
    var localVideoTrack_: RTCVideoTrack?
    var screenShareFeed: ScreenShareVideoFeed?
    var videoCapturer: RTCCameraVideoCapturer?
    var captureCeiling = CallCaptureCeiling.hd
    private var videoFilterDelegate: VideoFilterCapturerDelegate?
    /// C3 — observateurs d'interruption de la session de capture de CET appel.
    /// Scopés sur `object: capturer.captureSession` : `CameraView` instancie une
    /// SECONDE `AVCaptureSession` dans le process (composeur story), et un
    /// `object: nil` couperait la vidéo d'appel sur un événement sans rapport.
    private let captureInterruptions = CaptureInterruptionObserver()
    /// Génération de session : incrémentée par `disconnect()` ET `configure()`.
    /// Capturée avant l'await non-cancellation-aware de `startCapture` et
    /// re-comparée après : sans ce token, un appel terminé pendant le warm-up
    /// caméra (0,5–3 s) laissait la capture démarrer APRÈS le teardown —
    /// caméra allumée sans aucun chemin d'extinction. Un simple booléen ne
    /// suffit pas : un raccrocher→recomposer rapide le remettait à false
    /// avant la reprise de l'await (capture orpheline ressuscitée).
    ///
    /// The post-await re-comparison itself must run on MainActor: `startCapture`/
    /// `stopCapture` resume on whatever queue AVCaptureSession's ObjC completion
    /// fired on (not guaranteed MainActor), while `disconnect()` — always
    /// MainActor-isolated, since callers are @MainActor — mutates this same var
    /// synchronously. Every call site wraps its generation check in
    /// `await MainActor.run { ... }` so the two never interleave.
    private var sessionGeneration = 0
    var remoteVideoTrack_: RTCVideoTrack?
    var remoteAudioTrack_: RTCAudioTrack?
    private var usingFrontCamera = true

    // §3.4 perfect negotiation (W3C/MDN). These three flags + the polite role
    // make renegotiation and offer-glare safe. `makingOffer` is true only while
    // we build+set our local offer; `isSettingRemoteAnswerPending` true only
    // while we apply a remote answer (so an offer arriving in that window is not
    // treated as a collision); `ignoreOffer` records that the impolite peer
    // dropped a colliding offer. `isPolite` (the lexicographically-smaller
    // userId) decides who yields on a collision.
    private var makingOffer = false
    private var ignoreOffer = false
    private var isSettingRemoteAnswerPending = false
    private(set) var isPolite = false
    // P0-4 — flag set by `restartIce()` so the next `createOffer()` injects
    // `IceRestart: true` constraint, forcing new ICE credentials in the SDP.
    private var pendingIceRestart = false

    /// Paresseux (#7955) : une requête Vision de segmentation et un
    /// `CIContext(mtlDevice:)` naissent ici — au premier appel vidéo filtré.
    private(set) lazy var videoFilterPipeline = VideoFilterPipeline()
    var transcriptionDataChannel: RTCDataChannel?
    private var dataChannelPingTask: Task<Void, Never>?
    private var toggleVideoTask: Task<Void, Never>?

    var localVideoTrack: Any? { localVideoTrack_ }
    var remoteVideoTrack: Any? { remoteVideoTrack_ }

    override init() {
        // PERF-001: reuse the process-wide cached factory (initialized lazily once).
        // SSL init is performed inside the factory's lazy block.
        self.factory = WebRTCSharedFactory.factory

        super.init()

        // CallKit owns AVAudioSession lifecycle (didActivate/didDeactivate).
        // Switching WebRTC into manual-audio mode means it stops touching the
        // session on its own and waits for us (CallManager + CallKit delegate)
        // to flip `isAudioEnabled`. Without this, WebRTC's auto-managed mode
        // races with CallKit and the audio engine never starts cleanly.
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        session.useManualAudio = true
        session.isAudioEnabled = false
        session.unlockForConfiguration()

        // factory.audioDeviceModule is not available in the public WebRTC SDK build
        // Custom audio processing delegate requires a custom WebRTC build with ADM exposed
    }

    // MARK: - Configuration

    func configure(iceServers: [IceServer]) throws {
        // Defensive: callers are expected to `disconnect()` before
        // re-configuring (CallManager's FSM enforces `.idle` first), but if
        // that invariant is ever violated, tear the stale connection down via
        // the same `disconnect()` used everywhere else — not just `.close()`.
        // A bare `.close()` (audit 2026-07-03) left `audioTransceiver` /
        // `videoTransceiver` / local-track properties pointing at the closed
        // connection's objects; `addOffererTransceiversIfNeeded(on:)` guards
        // on `audioTransceiver == nil` and would then skip attaching media to
        // the brand-new peerConnection, producing a silently medialess SDP
        // offer (a call that "succeeds" but is completely silent).
        if peerConnection != nil {
            Logger.webrtc.warning("configure() called with a live peerConnection — disconnecting it before creating a new one")
            disconnect()
        }
        let config = WebRTCPeerConfiguration.make(
            iceServers: iceServers.map { RTCIceServer(urlStrings: $0.urls, username: $0.username, credential: $0.credential) },
            transport: CallAddressPrivacySetting.transport()
        )

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )

        guard let pc = factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: self
        ) else {
            throw WebRTCError.failedToCreatePeerConnection
        }

        peerConnection = pc
        sessionGeneration += 1
        let hasTURN = iceServers.contains(where: \.hasTURNURL)
        if !hasTURN {
            Logger.webrtc.fault("No TURN URL in ICE server list — calls through symmetric NAT will fail. Add a TURN server to the gateway TURN credential endpoint.")
        }
        Logger.webrtc.info("Peer connection created with \(iceServers.count) ICE servers (hasTURN=\(hasTURN, privacy: .public))")
    }

    func updateIceServers(_ iceServers: [IceServer]) {
        guard let pc = peerConnection else { return }
        let config = pc.configuration
        config.iceServers = iceServers.map { server in
            RTCIceServer(
                urlStrings: server.urls,
                username: server.username,
                credential: server.credential
            )
        }
        pc.setConfiguration(config)
        let hasTURN = iceServers.contains(where: \.hasTURNURL)
        if !hasTURN {
            Logger.webrtc.fault("updateIceServers: no TURN URL — symmetric NAT calls will fail.")
        }
        Logger.webrtc.info("ICE servers updated to \(iceServers.count) servers (hasTURN=\(hasTURN, privacy: .public), no reconnect)")
    }

    // §3.4 — store the deterministic polite/impolite role (computed by the
    // caller from the two userIds; the smaller is polite). Fixed once per call.
    func setNegotiationRole(isPolite: Bool) {
        self.isPolite = isPolite
        Logger.webrtc.info("negotiation role set: \(isPolite ? "polite" : "impolite", privacy: .public)")
    }

    // MARK: - Local Media

    func startLocalMedia(type: CallMediaType) async throws {
        Logger.webrtc.info("[WEBRTC] startLocalMedia begin type=\(String(describing: type))")
        // §5.2 — transceivers are no longer created here, but a live peer
        // connection is still required before we build the local media.
        guard peerConnection != nil else { throw WebRTCError.noPeerConnection }

        let audioConstraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "echoCancellation": "true",
                "noiseSuppression": "true",
                "autoGainControl": "true"
            ],
            optionalConstraints: nil
        )
        Logger.webrtc.info("[WEBRTC] audioSource begin")
        let audioSource = factory.audioSource(with: audioConstraints)
        Logger.webrtc.info("[WEBRTC] audioTrack begin")
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
        audioTrack.isEnabled = true
        localAudioTrack = audioTrack

        // §5.2 — do NOT add transceivers here. The offerer adds its sendRecv
        // transceivers in createOffer; the answerer applies the remote offer
        // FIRST (createAnswer) and only THEN attaches its local tracks to the
        // transceivers libwebrtc auto-created from the offer. Pre-adding
        // sendRecv transceivers on the answerer BEFORE setRemoteDescription was
        // the ROOT CAUSE of one-way media: libwebrtc could not associate them
        // with the offer's m-sections, so the answer advertised recvonly/
        // inactive on the section the caller reads → the caller's inbound RTP
        // stayed 0 (caller hears nothing, callee hears fine — build 465 symptom,
        // bug b). startLocalMedia now only builds the local tracks/capturer;
        // attachment happens at SDP time (addOffererTransceiversIfNeeded /
        // attachAnswererTracks).
        guard type == .audioVideo else {
            Logger.webrtc.info("[WEBRTC] local audio track prepared (audio-only)")
            return
        }

        try await buildLocalVideoTrackAndStartCapture()
        Logger.webrtc.info("[WEBRTC] local audio + video tracks prepared")
    }

    /// Builds the local video source/track + camera capturer and starts capture.
    /// Extracted from startLocalMedia so a mid-call audio→video upgrade
    /// (enableLocalVideo) can lazily create the camera without an addTransceiver
    /// — the LED stays off during an audio call until the user upgrades.
    /// Idempotent: a no-op if a video track already exists.
    private func buildLocalVideoTrackAndStartCapture() async throws {
        guard localVideoTrack_ == nil else { return }

        #if targetEnvironment(simulator)
        // iOS Simulator's AVCaptureDevice.DiscoverySession returns phantom devices,
        // but RTCCameraVideoCapturer.startCapture fails with FigCaptureSourceRemote
        // err=-17281 (kCMIOHardwareDeviceUnsupportedFormatError) on most simulator
        // images. Throw a typed error so the UI can degrade to audio-only.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §4.8
        Logger.webrtc.warning("[WEBRTC] simulator detected — skipping video capture (audio-only fallback)")
        throw WebRTCError.simulatorVideoUnsupported
        #else

        // Guard early: if the user has denied camera access, AVCaptureSession
        // silently fails to start (no throw, no frames) — leaving the local
        // PiP black and the call in a confused video-enabled state with no
        // camera. Throw a typed error before we build the track so CallManager
        // can surface an actionable "open Settings" message instead.
        let cameraAuth = AVCaptureDevice.authorizationStatus(for: .video)
        guard cameraAuth != .denied && cameraAuth != .restricted else {
            Logger.webrtc.error("[WEBRTC] camera access \(cameraAuth == .denied ? "denied" : "restricted") — throwing cameraPermissionDenied")
            throw WebRTCError.cameraPermissionDenied
        }

        Logger.webrtc.info("[WEBRTC] videoSource begin")
        let videoSource = factory.videoSource()
        Logger.webrtc.info("[WEBRTC] videoTrack begin")
        let videoTrack = factory.videoTrack(with: videoSource, trackId: "video0")
        videoTrack.isEnabled = true
        localVideoTrack_ = videoTrack

        let filterDelegate = VideoFilterCapturerDelegate(target: videoSource, pipeline: videoFilterPipeline)
        videoFilterDelegate = filterDelegate
        Logger.webrtc.info("[WEBRTC] RTCCameraVideoCapturer init")
        let capturer = RTCCameraVideoCapturer(delegate: filterDelegate)
        videoCapturer = capturer

        // PiP système — autoriser la caméra à continuer en multitâche/arrière-plan
        // (iOS 16+, appareils compatibles) pour que le pair continue de voir notre
        // flux quand on bascule l'app en arrière-plan avec le PiP actif. Pas
        // d'entitlement legacy requis sur iOS 16+ : simple propriété de session.
        if capturer.captureSession.isMultitaskingCameraAccessSupported {
            capturer.captureSession.isMultitaskingCameraAccessEnabled = true
            Logger.webrtc.info("[WEBRTC] multitasking camera access enabled")
        }

        Logger.webrtc.info("[WEBRTC] captureDevices probe")
        let cams = RTCCameraVideoCapturer.captureDevices()
        Logger.webrtc.info("[WEBRTC] captureDevices count=\(cams.count)")
        let generation = sessionGeneration
        let camera: AVCaptureDevice
        let format: AVCaptureDevice.Format
        let fps: Int
        do {
            guard let pickedCamera = Self.pickCaptureDevice(preferring: .front) else {
                // Aucune caméra : simulator iOS (device list vide) OU Mac sans caméra.
                // Renvoyer l'erreur typée fait remonter l'échec proprement au lieu de
                // laisser RTCCameraVideoCapturer throw une NSException plus tard.
                Logger.webrtc.error("[WEBRTC] no capture device available — throwing noCameraAvailable")
                throw WebRTCError.noCameraAvailable
            }
            camera = pickedCamera
            // Sur Mac la caméra rapporte `.unspecified` ; ne pas présumer "front".
            usingFrontCamera = camera.position == .front

            Logger.webrtc.info("[WEBRTC] selectFormat begin")
            guard let selectedFormat = camera.callCaptureFormat(within: captureCeiling) else {
                Logger.webrtc.error("[WEBRTC] no usable camera format — throwing noCameraFormatAvailable")
                throw WebRTCError.noCameraFormatAvailable
            }
            format = selectedFormat

            fps = format.callFrameRate(within: captureCeiling)
            // C3 — armé AVANT `startCapture` : une interruption survenant pendant le
            // warm-up caméra doit être vue. Après les gardes device/format, pour ne
            // pas s'abonner à une session qu'on s'apprête à abandonner (simulateur
            // sans caméra : `pickCaptureDevice` throw plus haut).
            captureInterruptions.observe(session: capturer.captureSession) { [weak self] interrupted in
                guard let self else { return }
                self.delegate?.webRTCClient(self, didChangeCameraInterruption: interrupted)
            }
            Logger.webrtc.info("[WEBRTC] capturer.startCapture begin fps=\(fps)")
            try await capturer.startCapture(with: camera, format: format, fps: fps)
        } catch {
            // Revert to a clean "no video" state on ANY failure past this point
            // (no camera device / no usable format / `startCapture` itself
            // failing on real hardware — camera busy, single-camera device,
            // AVCaptureSession config error). Without this, `hasLocalVideoTrack`
            // (keyed off `localVideoTrack_?.isEnabled`, see its doc-comment)
            // kept reporting true to every caller — toggleVideo's catch blocks,
            // unhold video recovery, CallView's self-preview gate — even though
            // this capturer never captured a single frame: a UI/capture desync
            // that never self-corrected for the rest of the call.
            // `await MainActor.run`: `startCapture`'s throw can resume on an
            // arbitrary executor (mirrors the isStale check below), so this
            // must not mutate `videoCapturer`/`localVideoTrack_` off MainActor.
            // Identity-guarded like that same check: a concurrent disconnect()
            // or a new call's setup may already have replaced these properties.
            await MainActor.run {
                if videoCapturer === capturer {
                    localVideoTrack_ = nil
                    videoCapturer = nil
                    videoFilterDelegate = nil
                }
            }
            throw error
        }
        // See `sessionGeneration` doc: this check-and-clear must be serialized
        // against disconnect() on MainActor, not run on whatever thread the
        // capture-session completion resumed us on.
        let isStale = await MainActor.run { () -> Bool in
            guard generation != sessionGeneration else { return false }
            // L'appel s'est terminé (ou un nouvel appel a été configuré)
            // pendant le warm-up : on ne nil-e les propriétés que si elles
            // pointent encore notre capturer — un nouvel appel a pu poser les siennes.
            if videoCapturer === capturer {
                localVideoTrack_ = nil
                videoCapturer = nil
                videoFilterDelegate = nil
            }
            return true
        }
        if isStale {
            // On éteint la caméra via la référence LOCALE (déjà détachée des
            // propriétés partagées ci-dessus si elle leur appartenait encore).
            Logger.webrtc.warning("[WEBRTC] session changed during camera warm-up — stopping orphan capture")
            await capturer.stopCapture()
            throw CancellationError()
        }
        await attachLiveCamera(camera)
        // applyVideoEncoding() is deferred — it runs once the video track is
        // attached to its transceiver; a sender does not exist yet at this point.
        Logger.webrtc.info("[WEBRTC] video track prepared (\(camera.position == .front ? "front" : "device") camera, \(fps)fps)")
        #endif
    }

    private func applyAudioCodecPreferences(audioTransceiver: RTCRtpTransceiver) {
        WebRTCCodecPreferences.applyAudio(to: audioTransceiver, factory: factory)
    }

    func applyVideoCodecPreferences(videoTransceiver: RTCRtpTransceiver) {
        WebRTCCodecPreferences.applyVideo(to: videoTransceiver, factory: factory)
    }

    /// Plafond d'encodage vidéo (voir `WebRTCSenderEncoding.applyVideo`).
    func applyVideoEncoding(
        maxBitrateBps: Int = QualityThresholds.maxVideoBitrate,
        maxFramerate: Int = VideoConfig.hd720p30.maxFrameRate,
        scaleResolutionDownBy: Double = 1.0,
        degradationPreference: VideoDegradationPreference = .maintainFramerate
    ) {
        adaptCaptureSource(scaleDownBy: scaleResolutionDownBy, framerate: maxFramerate)
        guard let sender = videoTransceiver?.sender else { return }
        WebRTCSenderEncoding.applyVideo(to: sender, maxBitrateBps: maxBitrateBps, maxFramerate: maxFramerate,
                                        scaleResolutionDownBy: scaleResolutionDownBy, degradationPreference: degradationPreference)
    }

    /// Adjusts the audio sender's max bitrate at runtime. Called by the
    /// quality-adaptation loop when the network tier changes (e.g. poor link
    /// drops from 64 kbps to 24 kbps so audio competes less with video).
    /// The min bitrate floor (16 kbps) set in `applyAudioCodecPreferences`
    /// is preserved — only the ceiling is modified.
    func applyAudioEncoding(maxBitrateBps: Int) {
        guard let sender = audioTransceiver?.sender else { return }
        WebRTCSenderEncoding.applyAudio(to: sender, maxBitrateBps: maxBitrateBps)
    }

    // MARK: - SDP Negotiation

    /// §5.2 (offerer path) — create the audio (+ video when a local video track
    /// exists) `.sendRecv` transceivers, attach the prepared local tracks, and
    /// pin codec preferences. No-op once transceivers exist so renegotiation /
    /// ICE-restart never duplicates m-lines (stable layout = safe renegotiation
    /// + SFU-ready).
    private func addOffererTransceiversIfNeeded(on pc: RTCPeerConnection) {
        guard audioTransceiver == nil else { return }

        let audioInit = RTCRtpTransceiverInit()
        audioInit.direction = .sendRecv
        audioInit.streamIds = ["meeshy-stream-0"]
        if let at = pc.addTransceiver(of: .audio, init: audioInit) {
            at.sender.track = localAudioTrack
            self.audioTransceiver = at
            applyAudioCodecPreferences(audioTransceiver: at)
        } else {
            Logger.webrtc.error("[WEBRTC] failed to add audio transceiver (offerer)")
        }

        // §5.1 — ALWAYS reserve a video m-line, even for an audio-only call, so a
        // mid-call audio→video upgrade is just a direction flip + track attach
        // (never an addTransceiver mid-call, which reorders m-lines and breaks
        // renegotiation). recvonly + no track keeps the camera/LED off until the
        // user actually upgrades.
        let videoInit = RTCRtpTransceiverInit()
        videoInit.direction = localVideoTrack_ != nil ? .sendRecv : .recvOnly
        videoInit.streamIds = ["meeshy-stream-0"]
        if let vt = pc.addTransceiver(of: .video, init: videoInit) {
            self.videoTransceiver = vt
            applyVideoCodecPreferences(videoTransceiver: vt)
            if let videoTrack = localVideoTrack_ {
                vt.sender.track = videoTrack
                applyVideoEncoding()
            }
        } else {
            Logger.webrtc.error("[WEBRTC] failed to add video transceiver (offerer)")
        }
    }

    /// §5.2 (answerer path) — MUST run AFTER setRemoteDescription(offer).
    /// Attaches the prepared local tracks to the transceivers libwebrtc created
    /// from the remote offer (matched by media kind) and forces them sendRecv so
    /// the answer is bidirectional on the sections the caller reads.
    private func attachAnswererTracks(on pc: RTCPeerConnection) {
        for transceiver in pc.transceivers {
            switch transceiver.mediaType {
            case .audio:
                if let audio = localAudioTrack {
                    transceiver.sender.track = audio
                    forceSendRecv(transceiver)
                }
                self.audioTransceiver = transceiver
                applyAudioCodecPreferences(audioTransceiver: transceiver)
            case .video:
                self.videoTransceiver = transceiver
                if let video = localVideoTrack_ {
                    transceiver.sender.track = video
                    forceSendRecv(transceiver)
                    applyVideoCodecPreferences(videoTransceiver: transceiver)
                    applyVideoEncoding()
                }
                // else: audio-only answerer to a video offer → leave recvonly
                // (receive remote video, send none). Mid-call upgrade is P1.
            default:
                break
            }
        }
    }

    func forceSendRecv(_ transceiver: RTCRtpTransceiver) {
        // `setDirection:error:` returns void → Swift imports it as a NON-throwing
        // func taking an NSErrorPointer (no return value to bridge to `throws`).
        // Passing `error: nil` would silently drop any failure; capture it instead.
        var error: NSError?
        transceiver.setDirection(.sendRecv, error: &error)
        if let error {
            Logger.webrtc.warning("[WEBRTC] setDirection(.sendRecv) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func restartIce() {
        pendingIceRestart = true
    }

    func createOffer() async throws -> SessionDescription {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }

        // §5.2 — offerer attaches its sendRecv transceivers before creating the
        // offer. Idempotent (no-op once they exist) so renegotiation/ICE-restart
        // reuses them and the m-line layout stays stable.
        addOffererTransceiversIfNeeded(on: pc)

        // §3.4 — mark the offer window. A remote offer arriving while makingOffer
        // is true is a glare collision (handled in createAnswer's guard). Cleared
        // once our local offer is set (signalingState then guards the rest).
        makingOffer = true
        defer { makingOffer = false }

        // §5.3 — NO legacy Plan-B `OfferToReceiveAudio/Video` constraints. Mixing
        // those with Unified-Plan transceivers is a classic source of direction
        // asymmetry (the legacy hints synthesize/duplicate m-sections or muddy
        // the per-section direction). The pre-added `.sendRecv` transceivers
        // (audio + video) already declare the send/receive intent, so we pass
        // empty constraints and let Unified-Plan drive the m-line layout.
        // P0-4 — If an ICE restart was requested, inject the IceRestart constraint
        // so the SDP offer carries new ICE credentials and triggers a full ICE re-gather.
        var mandatoryConstraints: [String: String]? = nil
        if pendingIceRestart {
            mandatoryConstraints = ["IceRestart": "true"]
            pendingIceRestart = false
        }
        let constraints = RTCMediaConstraints(mandatoryConstraints: mandatoryConstraints, optionalConstraints: nil)

        let sdp = try await PeerConnectionAsync.localDescription(from: pc, constraints: constraints, asOffer: true)
        return try await mungeAndSetLocal(sdp, type: .offer, on: pc)
    }

    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }

        // §3.4 — perfect-negotiation collision guard. For the INITIAL handshake
        // there is no collision (makingOffer == false, signalingState == stable)
        // so this is a transparent pass-through. It only engages on renegotiation
        // glare (both peers offer at once): the impolite peer drops the colliding
        // offer (throws .offerIgnored), the polite peer rolls its own offer back
        // before applying the remote one. libwebrtc (ObjC) has no implicit
        // rollback, so we issue an explicit `.rollback` description.
        let readyForOffer = !makingOffer &&
            (pc.signalingState == .stable || isSettingRemoteAnswerPending)
        let offerCollision = !readyForOffer
        if !isPolite && offerCollision {
            ignoreOffer = true
        } else {
            ignoreOffer = false
        }
        if ignoreOffer {
            Logger.webrtc.info("glare: impolite peer ignoring colliding offer")
            throw WebRTCError.offerIgnored
        }
        if offerCollision {
            Logger.webrtc.info("glare: polite peer rolling back local offer")
            try await PeerConnectionAsync.setLocalDescription(RTCSessionDescription(type: .rollback, sdp: ""), on: pc)
        }

        try WebRTCSdpRules.validateRemoteSDP(offer.sdp)
        let rtcOffer = RTCSessionDescription(type: .offer, sdp: offer.sdp)
        try await PeerConnectionAsync.setRemoteDescription(rtcOffer, on: pc)

        // §5.2 — canonical Unified-Plan answerer path and the REAL fix for
        // one-way media (bug b, build 465). The remote offer was applied above,
        // which makes libwebrtc auto-create the receiver transceivers matching
        // the offer's m-sections. Only NOW do we attach our local tracks to
        // those transceivers and force them sendRecv, so the answer advertises
        // sendrecv on the sections the caller reads → the caller's inbound RTP
        // flows (the callee is finally heard).
        //
        // This replaces the band-aid (commit c5b15ce) that forced sendRecv on
        // transceivers PRE-added in startLocalMedia: those were never associated
        // with the offer's m-sections, so the answer stayed recvonly/inactive
        // and the fix did nothing.
        attachAnswererTracks(on: pc)

        // §5.3 — empty constraints (no legacy Plan-B `OfferToReceive*`). Under
        // Unified-Plan the answer's per-section direction is derived from the
        // transceivers' directions, not from these constraints; keeping them
        // only risks the Plan-B/Unified-Plan mixing that skews directions.
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)

        let sdp = try await PeerConnectionAsync.localDescription(from: pc, constraints: constraints, asOffer: false)
        return try await mungeAndSetLocal(sdp, type: .answer, on: pc)
    }

    func setRemoteAnswer(_ answer: SessionDescription) async throws {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }
        try WebRTCSdpRules.validateRemoteSDP(answer.sdp)
        // §3.4 — mark the answer-application window so a remote offer arriving
        // mid-apply is not misread as a glare collision (MDN invariant).
        isSettingRemoteAnswerPending = true
        defer { isSettingRemoteAnswerPending = false }
        let rtcAnswer = RTCSessionDescription(type: .answer, sdp: answer.sdp)
        try await PeerConnectionAsync.setRemoteDescription(rtcAnswer, on: pc)
        Logger.webrtc.info("remote ANSWER directions: \(Self.sdpDirections(answer.sdp), privacy: .public)")
        Logger.webrtc.info("Remote answer set")
    }

    func addIceCandidate(_ candidate: IceCandidate) async throws {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }
        // RTCPeerConnection.add(_:) asserts/crashes on a closed connection.
        // Delayed candidates (arriving via socket after call:ended) hit this
        // guard rather than faulting inside libwebrtc.
        guard pc.signalingState != .closed else {
            Logger.webrtc.warning("Ignoring ICE candidate — peer connection already closed")
            return
        }
        guard WebRTCSdpRules.admits(candidate) else { return }
        let rtcCandidate = RTCIceCandidate(
            sdp: candidate.candidate,
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid
        )
        try await pc.add(rtcCandidate)
        Logger.webrtc.debug("ICE candidate added: \(candidate.candidate.prefix(40))...")
    }

    // MARK: - Media Controls

    func toggleAudio(_ enabled: Bool) {
        localAudioTrack?.isEnabled = enabled
        Logger.webrtc.info("Audio \(enabled ? "enabled" : "muted")")
    }

    func toggleVideo(_ enabled: Bool) {
        localVideoTrack_?.isEnabled = enabled
        Logger.webrtc.info("Video \(enabled ? "enabled" : "disabled")")

        // Audit P1-7 — also stop the capturer when video is disabled.
        // Without this, AVCaptureSession keeps the camera LED on and delivers
        // ~30fps frames at 720p (~44 MB/s NV12) through the filter pipeline
        // even though the encoder is fed disabled frames. Stopping the
        // capturer frees ~80–150 mA on iPhone 13. On re-enable we restart
        // the capturer with the same camera/format/fps as the initial start.
        //
        // Cancel any in-flight capturer task from a prior toggle so only the
        // most-recent intent races to the camera. The pending task is cancelled
        // before it starts (isCancelled check at entry); if it has already
        // suspended inside startCapture/stopCapture it finishes atomically —
        // the new task then runs after and leaves the camera in the correct state.
        toggleVideoTask?.cancel()
        // @MainActor on the Task literal: this function is a synchronous, non-isolated
        // entry point (P2PWebRTCClient is not @MainActor), so a bare `Task { }` here
        // would run on the cooperative pool, not necessarily on the same queue as
        // disconnect()'s synchronous videoCapturer/sessionGeneration mutations. Pinning
        // the task to MainActor keeps it serialized with every other mutation site.
        toggleVideoTask = Task { @MainActor [weak self] in
            guard let self, !Task.isCancelled else { return }
            if enabled {
                await self.restartCapturerIfStopped()
            } else {
                await self.videoCapturer?.stopCapture()
            }
        }
    }

    /// Whether local video is currently being sent (drives the UI's
    /// self-preview / camera-toggle affordance, `effectiveSwapStreams`, and
    /// the bitrate/quality policy's `isSendingVideo` gate). Deliberately keyed
    /// off `isEnabled`, NOT `localVideoTrack_ != nil` — `disableLocalVideo()`
    /// keeps the track object alive (just disabled + capture stopped) so a
    /// later `enableLocalVideo()` can cheaply resume the SAME track instead of
    /// rebuilding the capturer. A raw nil-check would therefore stay `true`
    /// through every survival-triggered downgrade, silently breaking the
    /// `localVideoSuspendedTile` fallback and `effectiveSwapStreams` in
    /// CallView.swift for the rest of the call.
    var hasLocalVideoTrack: Bool { localVideoTrack_?.isEnabled == true }

    /// Mid-call audio→video upgrade (FaceTime-style asymmetric — we control our
    /// own outbound video only). Lazily builds the camera track, attaches it to
    /// the reserved video transceiver and flips it to sendRecv. Returns true when
    /// the SDP direction changed and a renegotiation (createOffer) is required;
    /// false when video was already being sent (no SDP change needed).
    func enableLocalVideo() async throws -> Bool {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }
        if localVideoTrack_ == nil {
            try await buildLocalVideoTrackAndStartCapture()
        } else {
            localVideoTrack_?.isEnabled = true
            await restartCapturerIfStopped()
        }
        guard let videoTrack = localVideoTrack_ else { return false }

        if let vt = videoTransceiver {
            let wasSending = vt.direction == .sendRecv || vt.direction == .sendOnly
            vt.sender.track = videoTrack
            forceSendRecv(vt)
            applyVideoCodecPreferences(videoTransceiver: vt)
            applyVideoEncoding()
            Logger.webrtc.info("[WEBRTC] local video enabled (upgrade) renegotiation=\(!wasSending, privacy: .public)")
            return !wasSending
        }

        // Legacy peer with no reserved video m-line → add one (sendRecv).
        let vinit = RTCRtpTransceiverInit()
        vinit.direction = .sendRecv
        vinit.streamIds = ["meeshy-stream-0"]
        guard let vt = pc.addTransceiver(of: .video, init: vinit) else {
            throw WebRTCError.failedToCreateSDP
        }
        vt.sender.track = videoTrack
        self.videoTransceiver = vt
        applyVideoCodecPreferences(videoTransceiver: vt)
        applyVideoEncoding()
        Logger.webrtc.info("[WEBRTC] local video enabled (added transceiver) renegotiation=true")
        return true
    }

    /// Mid-call video→audio downgrade. Stops the camera, detaches the outbound
    /// track and flips the transceiver to recvonly (we keep receiving the peer's
    /// video). Returns true when a renegotiation is required.
    func disableLocalVideo() async -> Bool {
        localVideoTrack_?.isEnabled = false
        await videoCapturer?.stopCapture()
        guard let vt = videoTransceiver else { return false }
        let wasSending = vt.direction == .sendRecv || vt.direction == .sendOnly
        vt.sender.track = nil
        var error: NSError?
        vt.setDirection(.recvOnly, error: &error)
        if let error {
            Logger.webrtc.warning("[WEBRTC] setDirection(.recvOnly) failed: \(error.localizedDescription, privacy: .public)")
        }
        Logger.webrtc.info("[WEBRTC] local video disabled (downgrade) renegotiation=\(wasSending, privacy: .public)")
        return wasSending
    }

    /// Restarts the existing capturer using the current camera selection
    /// (front vs back) and the same format-selection logic as the initial
    /// start. No-op if there is no capturer (audio-only call).
    private func restartCapturerIfStopped() async {
        guard let capturer = videoCapturer else { return }
        let position: AVCaptureDevice.Position = usingFrontCamera ? .front : .back
        guard let camera = Self.pickCaptureDevice(preferring: position),
              let format = camera.callCaptureFormat(within: captureCeiling) else {
            Logger.webrtc.warning("[WEBRTC] toggleVideo on — no camera/format available, skipping capturer restart")
            return
        }
        let fps = format.callFrameRate(within: captureCeiling)
        // Capture the session generation before the async suspension point.
        // If disconnect() is called while startCapture is in flight (0.5–3 s
        // warm-up window), `sessionGeneration` is incremented and the post-await
        // check detects the stale context — stopping the orphan capturer via
        // the local reference before returning, mirroring the identical guard
        // in buildLocalVideoTrackAndStartCapture.
        let generation = sessionGeneration
        do {
            try await capturer.startCapture(with: camera, format: format, fps: fps)
            let isStale = await MainActor.run { generation != sessionGeneration }
            if isStale {
                Logger.webrtc.warning("[WEBRTC] session changed during capturer restart — stopping orphan capture")
                await capturer.stopCapture()
                return
            }
            await attachLiveCamera(camera)
            Logger.webrtc.info("[WEBRTC] capturer restarted on toggleVideo(true) (\(fps)fps)")
        } catch {
            Logger.webrtc.error("[WEBRTC] capturer restart failed: \(error.localizedDescription)")
        }
    }

    func switchCamera() async throws {
        guard let capturer = videoCapturer else { return }
        usingFrontCamera.toggle()
        let position: AVCaptureDevice.Position = usingFrontCamera ? .front : .back

        // Sur Mac (caméra unique `.unspecified`) il n'y a généralement pas de
        // seconde caméra : pickCaptureDevice retombe sur le même device, le
        // switch est alors un no-op visuel plutôt qu'une erreur.
        guard let camera = Self.pickCaptureDevice(preferring: position) else {
            usingFrontCamera.toggle()
            throw WebRTCError.noCameraAvailable
        }

        guard let selectedFormat = camera.callCaptureFormat(within: captureCeiling) else {
            usingFrontCamera.toggle()
            throw WebRTCError.noCameraFormatAvailable
        }

        // Capture the session generation before either async suspension point
        // (stopCapture + startCapture). If disconnect() fires in the stop→start
        // window the generation token mismatch stops the orphan capturer via the
        // local reference, matching the identical guard in buildLocalVideoTrackAndStartCapture
        // and restartCapturerIfStopped.
        let generation = sessionGeneration
        await capturer.stopCapture()
        let fps = selectedFormat.callFrameRate(within: captureCeiling)
        do {
            try await capturer.startCapture(with: camera, format: selectedFormat, fps: fps)
        } catch {
            // Mirror the two guard-throws above: a failed startCapture must not leave
            // usingFrontCamera claiming the switch succeeded. restartCapturerIfStopped()
            // reads this flag to decide which physical camera to resume — a stale value
            // here would target the camera that just failed to start (capturer is now
            // stopped, capturing nothing) instead of the one the user was actually seeing
            // before this attempt. CallManager already reverts its own optimistic
            // isUsingFrontCamera mirroring flag on this same failure (see
            // CallManagerSwitchCameraFailureCorrectionSourceTests) — this keeps the
            // internal capture-restart target in sync with that correction.
            usingFrontCamera.toggle()
            throw error
        }
        let isStale = await MainActor.run { generation != sessionGeneration }
        if isStale {
            Logger.webrtc.warning("[WEBRTC] session changed during camera switch — stopping orphan capture")
            await capturer.stopCapture()
            return
        }
        await attachLiveCamera(camera)
        Logger.webrtc.info("Switched to \(self.usingFrontCamera ? "front" : "back") camera")
    }

    // §7.1 — Continuity / external camera picker (Mac/iPad). Enumerate the
    // capture devices and project them into the framework-agnostic catalog so
    // the UI can present named cameras instead of a meaningless front/back flip.
    func availableCameras() -> [CameraDeviceOption] {
        let descriptors = RTCCameraVideoCapturer.captureDevices().map { device in
            CameraCatalog.Descriptor(
                uniqueID: device.uniqueID,
                localizedName: device.localizedName,
                facing: Self.facing(for: device)
            )
        }
        return CameraCatalog.options(from: descriptors)
    }

    // §7.1 — switch to a specific capture device by uniqueID. Mirrors
    // `switchCamera` (stop → reselect format → start) but targets a named device
    // (Continuity / USB) rather than toggling front/back.
    func switchToCamera(uniqueID: String) async throws {
        guard let capturer = videoCapturer else { return }
        guard let camera = RTCCameraVideoCapturer.captureDevices().first(where: { $0.uniqueID == uniqueID }).map(Self.zoomCapable) else {
            throw WebRTCError.noCameraAvailable
        }
        guard let selectedFormat = camera.callCaptureFormat(within: captureCeiling) else {
            throw WebRTCError.noCameraFormatAvailable
        }
        // Same session-generation guard as switchCamera / restartCapturerIfStopped:
        // if disconnect() fires during the stop→start window, abort and stop the
        // orphan capturer rather than leaving the camera LED on with no shutdown path.
        let generation = sessionGeneration
        await capturer.stopCapture()
        let fps = selectedFormat.callFrameRate(within: captureCeiling)
        try await capturer.startCapture(with: camera, format: selectedFormat, fps: fps)
        let isStale = await MainActor.run { generation != sessionGeneration }
        if isStale {
            Logger.webrtc.warning("[WEBRTC] session changed during camera switch (by ID) — stopping orphan capture")
            await capturer.stopCapture()
            return
        }
        usingFrontCamera = (camera.position == .front)
        await attachLiveCamera(camera)
        Logger.webrtc.info("[WEBRTC] switched to camera \(camera.localizedName, privacy: .public)")
    }

    func getStats() async -> CallStats? {
        guard let pc = peerConnection else { return nil }
        return await PeerConnectionAsync.callStats(of: pc)
    }

    // MARK: - DataChannel

    func createDataChannel(label: String) -> Bool {
        // Idempotent : les re-négociations (ICE restart, escalade vidéo)
        // repassent par createOffer — ne jamais empiler un second channel
        // sur la même peer connection.
        if transcriptionDataChannel != nil { return true }
        guard let pc = peerConnection else { return false }
        let config = RTCDataChannelConfiguration()
        config.isOrdered = true
        guard let channel = pc.dataChannel(forLabel: label, configuration: config) else {
            Logger.webrtc.error("Failed to create DataChannel: \(label)")
            return false
        }
        channel.delegate = self
        transcriptionDataChannel = channel
        Logger.webrtc.info("DataChannel created: \(label)")
        return true
    }

    func sendDataChannelMessage(_ data: Data) {
        guard let channel = transcriptionDataChannel, channel.readyState == .open else { return }
        let buffer = RTCDataBuffer(data: data, isBinary: false)
        channel.sendData(buffer)
    }

    func sendDTMF(digits: String) {
        guard let sender = audioTransceiver?.sender.dtmfSender, sender.canInsertDtmf else {
            Logger.webrtc.warning("DTMF unavailable — no DTMF sender or not established")
            return
        }
        sender.insertDtmf(digits, duration: 100, interToneGap: 70)
        // Never log DTMF digits: they carry conference PINs, voicemail
        // passwords, and IVR/banking security codes typed on the in-call keypad.
        Logger.webrtc.info("DTMF: sending \(digits.count) digit(s)")
    }

    func startDataChannelPing() {
        stopDataChannelPing()
        // @MainActor: keeps every transcriptionDataChannel read/send serialized with
        // disconnect()'s synchronous teardown of the same property (see toggleVideo).
        dataChannelPingTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard await cancellableSleep(for: .seconds(QualityThresholds.dataChannelPingIntervalSeconds)), !Task.isCancelled, let self else { break }
                self.sendDataChannelMessage(Data("{\"type\":\"ping\"}".utf8))
            }
        }
    }

    func stopDataChannelPing() {
        dataChannelPingTask?.cancel()
        dataChannelPingTask = nil
    }

    // MARK: - Disconnect

    func disconnect() {
        sessionGeneration += 1
        toggleVideoTask?.cancel()
        toggleVideoTask = nil
        stopDataChannelPing()
        transcriptionDataChannel?.close()
        transcriptionDataChannel = nil
        videoCapturer?.stopCapture()
        // Sans ce nil, le delegate (qui retient le RTCVideoSource du dernier
        // appel + DarkFrameDetector) survivait jusqu'au prochain appel vidéo.
        videoFilterDelegate = nil
        localAudioTrack?.isEnabled = false
        localVideoTrack_?.isEnabled = false
        // Detach sender tracks before close() so libwebrtc releases its
        // internal track references synchronously. Without this the ObjC
        // bridge holds a strong reference to RTCMediaStreamTrack until the
        // RTCPeerConnection object is deallocated, which can outlive the
        // call if the peerConnection is retained by a pending callback.
        audioTransceiver?.sender.track = nil
        videoTransceiver?.sender.track = nil
        peerConnection?.close()
        peerConnection = nil
        localAudioTrack = nil
        localVideoTrack_ = nil
        remoteVideoTrack_ = nil
        remoteAudioTrack_ = nil
        audioTransceiver = nil
        videoTransceiver = nil
        videoCapturer = nil
        Task { @MainActor in P2PWebRTCClient.releaseLiveCamera() }
        captureInterruptions.stop()
        pendingIceRestart = false
        Logger.webrtc.info("Peer connection disconnected and cleaned up")
    }

    func disconnectAfterFlushingPendingSend() {
        guard let channel = transcriptionDataChannel, channel.bufferedAmount > 0 else {
            disconnect()
            return
        }
        // Captured before the wait: `configure()` and `disconnect()` both bump
        // `sessionGeneration`, so if a fresh call reuses this same client
        // instance while we're waiting, the mismatch below stops this stale
        // flush from tearing down the NEW call's peer connection.
        let generation = sessionGeneration
        let pollInterval = Duration.milliseconds(QualityThresholds.dataChannelFlushPollIntervalMilliseconds)
        let deadline = ContinuousClock.now + .milliseconds(QualityThresholds.dataChannelFlushTimeoutMilliseconds)
        // @MainActor: this task's own disconnect() call at the end must never race a
        // fresh configure()/disconnect() pair from a rapid redial, both of which mutate
        // sessionGeneration/peerConnection synchronously on MainActor.
        Task { @MainActor [weak self] in
            while ContinuousClock.now < deadline {
                guard let self, self.sessionGeneration == generation else { return }
                guard (self.transcriptionDataChannel?.bufferedAmount ?? 0) > 0 else { break }
                _ = await cancellableSleep(for: pollInterval)
            }
            guard let self, self.sessionGeneration == generation else { return }
            self.disconnect()
        }
    }

    nonisolated deinit {
        // disconnect() is MainActor-isolated; callers must call it explicitly
        // before release. ARC handles per-property cleanup here.
        //
        // RTCCleanupSSL() must NOT be called here: `WebRTCSharedFactory.factory`
        // initializes SSL exactly once for the whole process (PERF-001), and the
        // factory keeps using the SSL context across every P2PWebRTCClient
        // instance. Tearing it down per-deinit broke any 2nd call in the same
        // app session (silent DTLS failure or crash on the next handshake).
        // SSL state is reclaimed by the OS at process exit — that is correct
        // on iOS, no explicit cleanup needed.
    }

    // MARK: - Private Helpers

    /// Phase 2 — RED is negotiated via setCodecPreferences (libwebrtc 141 API); the
    /// legacy addAudioRedundancy SDP munger was removed (9e663039, PT/PT bug). §3.8 + ADR-4.
    private func mungeAndSetLocal(_ sdp: RTCSessionDescription, type: SDPType, on pc: RTCPeerConnection) async throws -> SessionDescription {
        var mungedSDP = Self.mungeOpusSDP(sdp.sdp, audio: dataProfile.budget.audio)
        mungedSDP = Self.addTransportCC(mungedSDP)
        mungedSDP = Self.addVideoBitrateHints(mungedSDP)
        try await PeerConnectionAsync.setLocalDescription(RTCSessionDescription(type: sdp.type, sdp: mungedSDP), on: pc)
        Logger.webrtc.info("local \(type.rawValue.uppercased(), privacy: .public) directions: \(Self.sdpDirections(mungedSDP), privacy: .public)")
        Logger.webrtc.info("SDP \(type.rawValue, privacy: .public) created and set as local description (Opus munged)")
        return SessionDescription(type: type, sdp: mungedSDP)
    }

    static func addTransportCC(_ sdp: String) -> String { WebRTCSdpRules.addTransportCC(sdp) }

    static func addVideoBitrateHints(_ sdp: String) -> String { WebRTCSdpRules.addVideoBitrateHints(sdp) }
}

#endif
