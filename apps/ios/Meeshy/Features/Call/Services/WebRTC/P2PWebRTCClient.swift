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
    var localAudioTrack: RTCAudioTrack?
    var audioTransceiver: RTCRtpTransceiver?
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
    var sessionGeneration = 0
    var remoteVideoTrack_: RTCVideoTrack?
    var remoteAudioTrack_: RTCAudioTrack?
    var usingFrontCamera = true

    // §3.4 perfect negotiation (W3C/MDN). These three flags + the polite role
    // make renegotiation and offer-glare safe. `makingOffer` is true only while
    // we build+set our local offer; `isSettingRemoteAnswerPending` true only
    // while we apply a remote answer (so an offer arriving in that window is not
    // treated as a collision); `ignoreOffer` records that the impolite peer
    // dropped a colliding offer. `isPolite` (the lexicographically-smaller
    // userId) decides who yields on a collision.
    var makingOffer = false
    var ignoreOffer = false
    var isSettingRemoteAnswerPending = false
    private(set) var isPolite = false
    // P0-4 — flag set by `restartIce()` so the next `createOffer()` injects
    // `IceRestart: true` constraint, forcing new ICE credentials in the SDP.
    var pendingIceRestart = false

    /// Paresseux (#7955) : une requête Vision de segmentation et un
    /// `CIContext(mtlDevice:)` naissent ici — au premier appel vidéo filtré.
    private(set) lazy var videoFilterPipeline = VideoFilterPipeline()
    var transcriptionDataChannel: RTCDataChannel?
    var dataChannelPingTask: Task<Void, Never>?
    var toggleVideoTask: Task<Void, Never>?
    /// Vrai entre `disableLocalVideo()` et `enableLocalVideo()` : la caméra a
    /// été retirée volontairement (coupure, « Répondre sans vidéo », gel de
    /// survie). `attachAnswererTracks` ne doit alors PAS rattacher la piste
    /// vidéo ni repasser la section en sendRecv — sinon un appel décroché sans
    /// vidéo, ou une renégociation reçue caméra coupée, renverrait la caméra.
    var localVideoWithheld = false

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
        // A bare `.close` left `audioTransceiver` /
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
    func buildLocalVideoTrackAndStartCapture() async throws {
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

    func applyAudioCodecPreferences(audioTransceiver: RTCRtpTransceiver) {
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

    // MARK: - Disconnect

    func disconnect() {
        sessionGeneration += 1
        toggleVideoTask?.cancel()
        toggleVideoTask = nil
        stopDataChannelPing()
        videoCapturer?.stopCapture()
        // Sans ce nil, le delegate (qui retient le RTCVideoSource du dernier
        // appel + DarkFrameDetector) survivait jusqu'au prochain appel vidéo.
        videoFilterDelegate = nil
        // #17039 — couper les pistes, les détacher des émetteurs, fermer le canal
        // et la connexion attendent les fils de libwebrtc (jusqu'à 1,24 s sur le
        // fil principal, HangTracer). L'état Swift se vide ICI ; ces objets
        // partent sur la file du moteur, dans le même ordre qu'avant : pistes
        // détachées AVANT close(), pour que libwebrtc lâche ses références aux
        // RTCMediaStreamTrack sans attendre la libération de la connexion. Les
        // rappels de la connexion fermée sont écartés par identité
        // (`self.peerConnection === peerConnection`, PeerDelegates).
        let closing = (
            peerConnection: peerConnection,
            dataChannel: transcriptionDataChannel,
            transceivers: [audioTransceiver, videoTransceiver].compactMap { $0 },
            localTracks: [localAudioTrack as RTCMediaStreamTrack?, localVideoTrack_].compactMap { $0 }
        )
        transcriptionDataChannel = nil
        peerConnection = nil
        CallEngineQueue.run {
            closing.localTracks.forEach { $0.isEnabled = false }
            closing.transceivers.forEach { $0.sender.track = nil }
            closing.dataChannel?.close()
            closing.peerConnection?.close()
        }
        localAudioTrack = nil
        localVideoTrack_ = nil
        localVideoWithheld = false
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

    static func addTransportCC(_ sdp: String) -> String { WebRTCSdpRules.addTransportCC(sdp) }

    static func addVideoBitrateHints(_ sdp: String) -> String { WebRTCSdpRules.addVideoBitrateHints(sdp) }
}

#endif
