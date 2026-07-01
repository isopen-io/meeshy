import Foundation
import AVFoundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC

// PERF-001: Cache RTCPeerConnectionFactory + SSL init as a process-wide singleton.
// RTCInitializeSSL() and RTCPeerConnectionFactory(...) are heavy (boringssl init,
// codec enumeration, GPU probing). Doing this on every P2PWebRTCClient.init blew
// ~150–250ms of main-thread time per call setup. The factory is internally
// thread-safe and meant to be reused for the process lifetime.
//
// PERF-002: Strip software fallback codecs (VP8/VP9) by pinning the encoder's
// preferred codec to H.264 when available. Hardware H.264 is ~3× more energy
// efficient than software VP8/VP9 on iOS and matches what the Apple ecosystem
// negotiates by default for FaceTime-style calls.
private enum WebRTCSharedFactory {
    static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        let encoder = RTCDefaultVideoEncoderFactory()
        let h264Codecs = encoder.supportedCodecs().filter { $0.name == kRTCVideoCodecH264Name }
        if let preferred = h264Codecs.first {
            encoder.preferredCodec = preferred
        }
        let decoder = RTCDefaultVideoDecoderFactory()
        return RTCPeerConnectionFactory(encoderFactory: encoder, decoderFactory: decoder)
    }()
}

// `@unchecked Sendable` contract: every property mutation is serialised on the
// main queue — callers arrive via @MainActor (WebRTCService / CallManager), and
// RTCPeerConnectionDelegate callbacks are `nonisolated` + dispatch to
// DispatchQueue.main.async before touching state (see MARK: RTCPeerConnectionDelegate).
// `@MainActor` on the class is not viable: WebRTC's signaling_thread / network_thread
// call the @objc delegate thunks off-main; Swift 6 would assert isolation and crash.
final class P2PWebRTCClient: NSObject, WebRTCClientProviding, @unchecked Sendable {
    weak var delegate: (any WebRTCClientDelegate)?

    private var peerConnection: RTCPeerConnection?
    private let factory: RTCPeerConnectionFactory
    private var localAudioTrack: RTCAudioTrack?
    private var audioTransceiver: RTCRtpTransceiver?
    private var videoTransceiver: RTCRtpTransceiver?
    private var localVideoTrack_: RTCVideoTrack?
    private var videoCapturer: RTCCameraVideoCapturer?
    private var videoFilterDelegate: VideoFilterCapturerDelegate?
    /// Génération de session : incrémentée par `disconnect()` ET `configure()`.
    /// Capturée avant l'await non-cancellation-aware de `startCapture` et
    /// re-comparée après : sans ce token, un appel terminé pendant le warm-up
    /// caméra (0,5–3 s) laissait la capture démarrer APRÈS le teardown —
    /// caméra allumée sans aucun chemin d'extinction. Un simple booléen ne
    /// suffit pas : un raccrocher→recomposer rapide le remettait à false
    /// avant la reprise de l'await (capture orpheline ressuscitée).
    private var sessionGeneration = 0
    private var remoteVideoTrack_: RTCVideoTrack?
    private var remoteAudioTrack_: RTCAudioTrack?
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

    private(set) var videoFilterPipeline = VideoFilterPipeline()
    private var transcriptionDataChannel: RTCDataChannel?
    private var dataChannelPingTask: Task<Void, Never>?
    private var toggleVideoTask: Task<Void, Never>?
    private let _audioEffectsService: CallAudioEffectsService

    var audioEffectsService: CallAudioEffectsServiceProviding? { _audioEffectsService }

    var isConnected: Bool {
        peerConnection?.connectionState == .connected
    }

    var localVideoTrack: Any? { localVideoTrack_ }
    var remoteVideoTrack: Any? { remoteVideoTrack_ }

    override init() {
        self._audioEffectsService = CallAudioEffectsService()

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
        // that invariant is ever violated, closing any stale peer connection
        // here prevents it from leaking silently with its native threads/sockets.
        if let stalePeerConnection = peerConnection {
            Logger.webrtc.warning("configure() called with a live peerConnection — closing it before creating a new one")
            stalePeerConnection.close()
        }
        let config = RTCConfiguration()
        config.iceServers = iceServers.map { server in
            RTCIceServer(
                urlStrings: server.urls,
                username: server.username,
                credential: server.credential
            )
        }
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually
        config.bundlePolicy = .maxBundle
        config.rtcpMuxPolicy = .require
        // PERF-003: pre-warm ICE candidate gathering while the user is still
        // tapping Answer. With pool size = 4, host/srflx/relay candidates start
        // resolving as soon as setConfiguration runs, so ICE checks can begin
        // immediately after the SDP answer is sent — typically shaving 200–400ms
        // off the connect time on cellular.
        config.iceCandidatePoolSize = Int32(QualityThresholds.iceCandidatePoolSize)

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
        guard let camera = Self.pickCaptureDevice(preferring: .front) else {
            // Aucune caméra : simulator iOS (device list vide) OU Mac sans caméra.
            // Renvoyer l'erreur typée fait remonter l'échec proprement au lieu de
            // laisser RTCCameraVideoCapturer throw une NSException plus tard.
            Logger.webrtc.error("[WEBRTC] no capture device available — throwing noCameraAvailable")
            throw WebRTCError.noCameraAvailable
        }
        // Sur Mac la caméra rapporte `.unspecified` ; ne pas présumer "front".
        usingFrontCamera = camera.position == .front

        Logger.webrtc.info("[WEBRTC] selectFormat begin")
        let selectedFormat = selectFormat(for: camera)
        guard let format = selectedFormat else {
            Logger.webrtc.error("[WEBRTC] no usable camera format — throwing noCameraFormatAvailable")
            throw WebRTCError.noCameraFormatAvailable
        }

        let fps = targetFrameRate(for: format)
        let generation = sessionGeneration
        Logger.webrtc.info("[WEBRTC] capturer.startCapture begin fps=\(fps)")
        try await capturer.startCapture(with: camera, format: format, fps: fps)
        if generation != sessionGeneration {
            // L'appel s'est terminé (ou un nouvel appel a été configuré)
            // pendant le warm-up : on éteint la caméra via la référence
            // LOCALE et on ne nil-e les propriétés que si elles pointent
            // encore notre capturer — un nouvel appel a pu poser les siennes.
            Logger.webrtc.warning("[WEBRTC] session changed during camera warm-up — stopping orphan capture")
            await capturer.stopCapture()
            if videoCapturer === capturer {
                localVideoTrack_ = nil
                videoCapturer = nil
                videoFilterDelegate = nil
            }
            throw CancellationError()
        }
        // applyVideoEncoding() is deferred — it runs once the video track is
        // attached to its transceiver; a sender does not exist yet at this point.
        Logger.webrtc.info("[WEBRTC] video track prepared (\(camera.position == .front ? "front" : "device") camera, \(fps)fps)")
        #endif
    }

    // Phase 2 — Apply audio codec preferences via libwebrtc 141 API.
    // Order: Opus first (primary), RED second (RFC 2198 redundancy).
    // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + ADR-4
    //
    // RED was previously enabled via SDP munging (`addAudioRedundancy`) which
    // triggered an iOS libwebrtc bug with `a=fmtp:63 PT/PT` (silent audio after
    // ICE connected, commit 9e663039). Using setCodecPreferences avoids the
    // SDP regex path entirely — libwebrtc 141 negotiates RED via the standard
    // API correctly.
    private func applyAudioCodecPreferences(audioTransceiver: RTCRtpTransceiver) {
        let factory = WebRTCSharedFactory.factory
        // Audit P1-5 — `setCodecPreferences` is validated against
        // `RTCRtpSender.getCapabilities()` per the W3C WebRTC spec (and
        // libwebrtc's internal RTPMediaSection::CreateMediaContent). For
        // sendRecv transceivers we want the SENDER caps; using receiver caps
        // matches in the common case but can leak codecs (notably RED) with
        // asymmetric sender/receiver definitions, causing setCodecPreferences
        // to throw "Invalid codec".
        let capabilities = factory.rtpSenderCapabilities(forKind: kRTCMediaStreamTrackKindAudio)

        let opusCodecs = capabilities.codecs.filter { $0.name.lowercased() == "opus" }
        let redCodecs = capabilities.codecs.filter { $0.name.lowercased() == "red" }

        // Opus primary, RED secondary. Drop CN, telephone-event, G722, PCMU.
        let preferred = opusCodecs + redCodecs
        guard !preferred.isEmpty else {
            Logger.webrtc.warning("[WEBRTC] no Opus/RED codecs available — leaving default preferences")
            return
        }

        // Audit 2026-05-11 — the previous typed-function-reference trick
        // (`let setCodecs: ([X]) throws -> Void = transceiver.setCodecPreferences`)
        // still selected the deprecated void overload at compile time —
        // confirmed by the persistent deprecation warning emitted at the
        // assignment site. With the deprecated variant, the catch block was
        // unreachable and any setCodecPreferences error (codec list empty,
        // transceiver stopped, peer rejected the preference) was silently
        // swallowed. Force the throwing `setCodecPreferences:error:` selector
        // via a dynamic ObjC dispatch that bypasses Swift's overload picker.
        do {
            try Self.invokeSetCodecPreferences(on: audioTransceiver, codecs: preferred)
            let names = preferred.map { $0.name }.joined(separator: ", ")
            Logger.webrtc.info("[WEBRTC] audio codec preferences applied: \(names, privacy: .public)")
        } catch {
            Logger.webrtc.warning("[WEBRTC] setCodecPreferences (audio) threw: \(error.localizedDescription, privacy: .public)")
        }

        // Phase 2 — apply Opus bitrate range via RTCRtpEncodingParameters.
        // DTX in libwebrtc 141 iOS Objective-C binding is NOT exposed on
        // RTCRtpEncodingParameters (the WebIDL `dtx` field has no ObjC analog
        // in this xcframework — verified against
        // WebRTC.xcframework/.../RTCRtpEncodingParameters.h). DTX therefore
        // remains driven by `usedtx=1` injected into Opus fmtp via
        // mungeOpusSDP. Bitrate min/max are honored by the encoder directly
        // through RtpEncodingParameters.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + ADR-4
        let params = audioTransceiver.sender.parameters
        for encoding in params.encodings {
            // DTX: no native API — see comment above; handled via SDP fmtp `usedtx=1`.
            encoding.maxBitrateBps = NSNumber(value: QualityThresholds.defaultBitrate)
            encoding.minBitrateBps = NSNumber(value: QualityThresholds.audioCodecFloorBitrateBps)
            // networkPriority = .high → DSCP EF (Expedited Forwarding, 46) for VoIP audio.
            // Maps to the highest WebRTC pacer priority and signals QoS to the OS network stack.
            encoding.networkPriority = .high
        }
        audioTransceiver.sender.parameters = params
        let encodingsCount = params.encodings.count
        let maxKbps = QualityThresholds.defaultBitrate / 1000
        let minKbps = QualityThresholds.audioCodecFloorBitrateBps / 1000
        if encodingsCount > 0 {
            Logger.webrtc.info("[WEBRTC] audio bitrate range applied via RtpEncodingParameters (max=\(maxKbps, privacy: .public)kbps, min=\(minKbps, privacy: .public)kbps, priority=high, encodings=\(encodingsCount, privacy: .public))")
        } else {
            Logger.webrtc.warning("[WEBRTC] audio bitrate NOT applied — encodings array empty")
        }
    }

    // Phase 2 — Apply video codec preferences via libwebrtc 141 API.
    // Order H264 > VP8 > VP9 (cross-platform iOS↔Web compatibility — §6.7).
    // AV1 excluded (uneven HW support across iOS/Chrome/Safari).
    // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + §6.7
    //
    // Priority rationale:
    // - H264: hardware-accelerated on iOS (VideoToolbox), supported by Chrome 80+, Safari 13+
    // - VP8: software but ubiquitous, fallback for clients without H264 HW
    // - VP9: better compression, software-only on most iOS, optional fallback
    private func applyVideoCodecPreferences(videoTransceiver: RTCRtpTransceiver) {
        let factory = WebRTCSharedFactory.factory
        // Audit P1-5 — see applyAudioCodecPreferences for rationale.
        let capabilities = factory.rtpSenderCapabilities(forKind: kRTCMediaStreamTrackKindVideo)

        let priorityOrder = ["H264", "VP8", "VP9"]
        let preferred = priorityOrder.flatMap { name in
            capabilities.codecs.filter { $0.name == name }
        }
        guard !preferred.isEmpty else {
            Logger.webrtc.warning("[WEBRTC] no preferred video codecs available — leaving default")
            return
        }

        // Same dynamic ObjC dispatch rationale as applyAudioCodecPreferences.
        do {
            try Self.invokeSetCodecPreferences(on: videoTransceiver, codecs: preferred)
            let names = preferred.map { $0.name }.joined(separator: ", ")
            Logger.webrtc.info("[WEBRTC] video codec preferences applied: \(names, privacy: .public)")
        } catch {
            Logger.webrtc.warning("[WEBRTC] setCodecPreferences (video) threw: \(error.localizedDescription, privacy: .public)")
        }
    }

    // P1-1 + P1-2 — SOTA video sender parameters. libwebrtc otherwise lets the
    // encoder run open-loop (no native cap; the SDP `x-google-max-bitrate` hint is
    // soft and non-authoritative on iOS). We set an explicit max bitrate / max
    // framerate / resolution-downscale on every encoding, mirroring the audio
    // bitrate path (applyAudioCodecPreferences :295). `degradationPreference =
    // .maintainFramerate` keeps talking-head motion fluid and drops resolution
    // first under congestion (reserve .maintainResolution for screen-share).
    // Called once at capture start (720p30 / 2.5 Mbps) and again by the adaptive
    // quality loop (WebRTCService.adjustBitrate) with throttled targets.
    func applyVideoEncoding(
        maxBitrateBps: Int = 2_500_000,
        maxFramerate: Int = 30,
        scaleResolutionDownBy: Double = 1.0
    ) {
        guard let sender = videoTransceiver?.sender else { return }
        let params = sender.parameters
        params.degradationPreference = NSNumber(value: RTCDegradationPreference.maintainFramerate.rawValue)
        for encoding in params.encodings {
            encoding.maxBitrateBps = NSNumber(value: maxBitrateBps)
            encoding.maxFramerate = NSNumber(value: maxFramerate)
            encoding.scaleResolutionDownBy = NSNumber(value: max(1.0, scaleResolutionDownBy))
            // networkPriority = .high → DSCP AF41 (Assured Forwarding, 34) for real-time video.
            // Signals to WebRTC pacer and OS that this stream deserves elevated QoS.
            encoding.networkPriority = .high
        }
        sender.parameters = params
        let count = params.encodings.count
        if count > 0 {
            let scaleStr = String(format: "%.2f", scaleResolutionDownBy)
            Logger.webrtc.info("[WEBRTC] video encoding applied (max=\(maxBitrateBps / 1000, privacy: .public)kbps fps=\(maxFramerate, privacy: .public) scale=\(scaleStr, privacy: .public) degradation=maintainFramerate priority=high encodings=\(count, privacy: .public))")
        } else {
            Logger.webrtc.warning("[WEBRTC] video encoding NOT applied — encodings array empty")
        }
    }

    func setMaxAudioBitrate(_ bitrate: Int) {
        guard let at = audioTransceiver else { return }
        let params = at.sender.parameters
        guard !params.encodings.isEmpty else { return }
        for encoding in params.encodings {
            encoding.maxBitrateBps = NSNumber(value: bitrate)
        }
        at.sender.parameters = params
        Logger.webrtc.info("[WEBRTC] audio max bitrate updated to \(bitrate / 1000, privacy: .public)kbps")
    }

    /// Adjusts the audio sender's max bitrate at runtime. Called by the
    /// quality-adaptation loop when the network tier changes (e.g. poor link
    /// drops from 64 kbps to 24 kbps so audio competes less with video).
    /// The min bitrate floor (16 kbps) set in `applyAudioCodecPreferences`
    /// is preserved — only the ceiling is modified.
    func applyAudioEncoding(maxBitrateBps: Int) {
        guard let sender = audioTransceiver?.sender else { return }
        let params = sender.parameters
        for encoding in params.encodings {
            encoding.maxBitrateBps = NSNumber(value: maxBitrateBps)
        }
        sender.parameters = params
        let count = params.encodings.count
        if count > 0 {
            Logger.webrtc.info("[WEBRTC] audio encoding applied (max=\(maxBitrateBps / 1000, privacy: .public)kbps encodings=\(count, privacy: .public))")
        } else {
            Logger.webrtc.warning("[WEBRTC] audio encoding NOT applied — encodings array empty")
        }
    }

    /// Selects a capture device for a desired logical position. On iPhone/iPad the
    /// front/back cameras report `.front`/`.back`. On **iOS-app-on-Mac** the
    /// built-in / Continuity / USB cameras report `.unspecified`, so a strict
    /// `.front` filter finds nothing and the call silently degrades to audio
    /// (P0-1). Fallback chain: exact position → `.unspecified` (Mac) → opposite
    /// camera → first available.
    static func pickCaptureDevice(preferring position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        let cams = RTCCameraVideoCapturer.captureDevices()
        if let exact = cams.first(where: { $0.position == position }) { return exact }
        if let unspecified = cams.first(where: { $0.position == .unspecified }) { return unspecified }
        let opposite: AVCaptureDevice.Position = position == .front ? .back : .front
        return cams.first(where: { $0.position == opposite }) ?? cams.first
    }

    /// Calls the throwing `setCodecPreferences:error:` selector on the given
    /// transceiver via the ObjC runtime, bypassing Swift's overload resolution
    /// which silently prefers the deprecated void overload (see audit
    /// 2026-05-11 §B-Claim-1). The function-pointer cast matches the real
    /// ObjC method signature: `BOOL (*)(NSObject, Selector, NSArray, NSError**)`.
    private static func invokeSetCodecPreferences(
        on transceiver: RTCRtpTransceiver,
        codecs: [RTCRtpCodecCapability]
    ) throws {
        typealias SetCodecsIMP = @convention(c) (
            NSObject, Selector, NSArray, AutoreleasingUnsafeMutablePointer<NSError?>
        ) -> Bool
        // Use #selector with the typed protocol reference so the compiler
        // verifies the selector exists at build time (Swift's recommendation
        // over string-literal Selector). The Protocol-suffixed name is
        // libwebrtc's auto-generated Swift name for the ObjC protocol.
        let selector = #selector(RTCRtpTransceiverProtocol.setCodecPreferences(_:error:))
        guard transceiver.responds(to: selector) else {
            throw NSError(
                domain: "MeeshyWebRTC", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "setCodecPreferences:error: selector not exposed by libwebrtc binding"]
            )
        }
        guard let imp = transceiver.method(for: selector) else {
            throw NSError(
                domain: "MeeshyWebRTC", code: -2,
                userInfo: [NSLocalizedDescriptionKey: "setCodecPreferences:error: IMP unavailable"]
            )
        }
        let fn = unsafeBitCast(imp, to: SetCodecsIMP.self)
        var nsError: NSError?
        let ok = fn(transceiver, selector, codecs as NSArray, &nsError)
        if !ok {
            throw nsError ?? NSError(
                domain: "MeeshyWebRTC", code: -3,
                userInfo: [NSLocalizedDescriptionKey: "setCodecPreferences returned false with no error"]
            )
        }
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

    private func forceSendRecv(_ transceiver: RTCRtpTransceiver) {
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

        let sdp: RTCSessionDescription = try await withCheckedThrowingContinuation { continuation in
            pc.offer(for: constraints) { sdp, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let sdp else {
                    continuation.resume(throwing: WebRTCError.failedToCreateSDP)
                    return
                }
                continuation.resume(returning: sdp)
            }
        }

        var mungedSDP = Self.mungeOpusSDP(sdp.sdp)
        // Phase 2 — RED is now negotiated via setCodecPreferences (libwebrtc 141 API).
        // The previous SDP munging path (addAudioRedundancy) was disabled in 9e663039
        // due to a PT/PT negotiation bug. The setCodecPreferences API avoids the
        // regex entirely. The legacy addAudioRedundancy munger was removed.
        // Reference §3.8 + ADR-4.
        mungedSDP = Self.addTransportCC(mungedSDP)
        mungedSDP = Self.addVideoBitrateHints(mungedSDP)
        let mungedDescription = RTCSessionDescription(type: sdp.type, sdp: mungedSDP)
        try await setLocalDescription(mungedDescription, on: pc)
        Logger.webrtc.info("local OFFER directions: \(Self.sdpDirections(mungedSDP), privacy: .public)")
        Logger.webrtc.info("SDP offer created and set as local description (Opus munged)")
        return SessionDescription(type: .offer, sdp: mungedSDP)
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
            try await setLocalDescription(RTCSessionDescription(type: .rollback, sdp: ""), on: pc)
        }

        try Self.validateRemoteSDP(offer.sdp)
        let rtcOffer = RTCSessionDescription(type: .offer, sdp: offer.sdp)
        try await setRemoteDescription(rtcOffer, on: pc)

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

        let sdp: RTCSessionDescription = try await withCheckedThrowingContinuation { continuation in
            pc.answer(for: constraints) { sdp, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let sdp else {
                    continuation.resume(throwing: WebRTCError.failedToCreateSDP)
                    return
                }
                continuation.resume(returning: sdp)
            }
        }

        var mungedSDP = Self.mungeOpusSDP(sdp.sdp)
        // Phase 2 — RED is now negotiated via setCodecPreferences (libwebrtc 141 API).
        // The previous SDP munging path (addAudioRedundancy) was disabled in 9e663039
        // due to a PT/PT negotiation bug. The setCodecPreferences API avoids the
        // regex entirely. The legacy addAudioRedundancy munger was removed.
        // Reference §3.8 + ADR-4.
        mungedSDP = Self.addTransportCC(mungedSDP)
        mungedSDP = Self.addVideoBitrateHints(mungedSDP)
        let mungedDescription = RTCSessionDescription(type: sdp.type, sdp: mungedSDP)
        try await setLocalDescription(mungedDescription, on: pc)
        Logger.webrtc.info("local ANSWER directions: \(Self.sdpDirections(mungedSDP), privacy: .public)")
        Logger.webrtc.info("SDP answer created and set as local description (Opus munged)")
        return SessionDescription(type: .answer, sdp: mungedSDP)
    }

    func setRemoteAnswer(_ answer: SessionDescription) async throws {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }
        try Self.validateRemoteSDP(answer.sdp)
        // §3.4 — mark the answer-application window so a remote offer arriving
        // mid-apply is not misread as a glare collision (MDN invariant).
        isSettingRemoteAnswerPending = true
        defer { isSettingRemoteAnswerPending = false }
        let rtcAnswer = RTCSessionDescription(type: .answer, sdp: answer.sdp)
        try await setRemoteDescription(rtcAnswer, on: pc)
        Logger.webrtc.info("remote ANSWER directions: \(Self.sdpDirections(answer.sdp), privacy: .public)")
        Logger.webrtc.info("Remote answer set")
    }

    /// Extracts per-m-section direction (sendrecv/sendonly/recvonly/inactive)
    /// from an SDP string. Used in logs to diagnose one-way media: a peer whose
    /// answer is `recvonly`/`inactive` for a given m-section is not sending RTP
    /// for that track, which appears as zero inbound packets on our side.
    static func sdpDirections(_ sdp: String) -> String {
        var out: [String] = []
        var media = "?"
        for line in sdp.components(separatedBy: "\r\n") {
            if line.hasPrefix("m=") {
                media = String(line.dropFirst(2).split(separator: " ").first ?? "?")
            } else if line == "a=sendrecv" || line == "a=sendonly" || line == "a=recvonly" || line == "a=inactive" {
                out.append("\(media)=\(line.dropFirst(2))")
            }
        }
        return out.isEmpty ? "(none)" : out.joined(separator: " ")
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
        // Input validation: reject candidates with out-of-range indices, oversized
        // sdpMid strings, or oversized candidate lines. libwebrtc processes these
        // strings without bounds checks; malformed input from a hostile peer could
        // cause parsing errors or memory pressure inside the library.
        guard candidate.sdpMLineIndex >= 0, candidate.sdpMLineIndex <= 255 else {
            Logger.webrtc.error("Ignoring ICE candidate — sdpMLineIndex out of range: \(candidate.sdpMLineIndex)")
            return
        }
        if let mid = candidate.sdpMid {
            guard mid.count <= QualityThresholds.iceCandidateSdpMidMaxLength else {
                Logger.webrtc.error("Ignoring ICE candidate — sdpMid too long (\(mid.count) chars)")
                return
            }
        }
        guard candidate.candidate.count <= QualityThresholds.iceCandidateLineMaxBytes else {
            Logger.webrtc.error("Ignoring ICE candidate — candidate line too long (\(candidate.candidate.count) chars)")
            return
        }
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
        toggleVideoTask = Task { [weak self] in
            guard let self, !Task.isCancelled else { return }
            if enabled {
                await self.restartCapturerIfStopped()
            } else {
                await self.videoCapturer?.stopCapture()
            }
        }
    }

    /// Whether a local camera track currently exists (drives the UI's
    /// self-preview / camera-toggle affordance).
    var hasLocalVideoTrack: Bool { localVideoTrack_ != nil }

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
              let format = selectFormat(for: camera) else {
            Logger.webrtc.warning("[WEBRTC] toggleVideo on — no camera/format available, skipping capturer restart")
            return
        }
        let fps = targetFrameRate(for: format)
        // Capture the session generation before the async suspension point.
        // If disconnect() is called while startCapture is in flight (0.5–3 s
        // warm-up window), `sessionGeneration` is incremented and the post-await
        // check detects the stale context — stopping the orphan capturer via
        // the local reference before returning, mirroring the identical guard
        // in buildLocalVideoTrackAndStartCapture.
        let generation = sessionGeneration
        do {
            try await capturer.startCapture(with: camera, format: format, fps: fps)
            if generation != sessionGeneration {
                Logger.webrtc.warning("[WEBRTC] session changed during capturer restart — stopping orphan capture")
                await capturer.stopCapture()
                return
            }
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

        let format = selectFormat(for: camera)
        guard let selectedFormat = format else {
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
        let fps = targetFrameRate(for: selectedFormat)
        try await capturer.startCapture(with: camera, format: selectedFormat, fps: fps)
        if generation != sessionGeneration {
            Logger.webrtc.warning("[WEBRTC] session changed during camera switch — stopping orphan capture")
            await capturer.stopCapture()
            return
        }
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

    private static func facing(for device: AVCaptureDevice) -> CameraFacing {
        switch device.position {
        case .front: return .front
        case .back: return .back
        default:
            // iOS-on-Mac / iPad: Continuity & USB cameras report `.unspecified`
            // with an external-class device type.
            if #available(iOS 17.0, *), device.deviceType == .external || device.deviceType == .continuityCamera {
                return .external
            }
            return .unspecified
        }
    }

    // §7.1 — switch to a specific capture device by uniqueID. Mirrors
    // `switchCamera` (stop → reselect format → start) but targets a named device
    // (Continuity / USB) rather than toggling front/back.
    func switchToCamera(uniqueID: String) async throws {
        guard let capturer = videoCapturer else { return }
        guard let camera = RTCCameraVideoCapturer.captureDevices().first(where: { $0.uniqueID == uniqueID }) else {
            throw WebRTCError.noCameraAvailable
        }
        guard let selectedFormat = selectFormat(for: camera) else {
            throw WebRTCError.noCameraFormatAvailable
        }
        // Same session-generation guard as switchCamera / restartCapturerIfStopped:
        // if disconnect() fires during the stop→start window, abort and stop the
        // orphan capturer rather than leaving the camera LED on with no shutdown path.
        let generation = sessionGeneration
        await capturer.stopCapture()
        let fps = targetFrameRate(for: selectedFormat)
        try await capturer.startCapture(with: camera, format: selectedFormat, fps: fps)
        if generation != sessionGeneration {
            Logger.webrtc.warning("[WEBRTC] session changed during camera switch (by ID) — stopping orphan capture")
            await capturer.stopCapture()
            return
        }
        usingFrontCamera = (camera.position == .front)
        Logger.webrtc.info("[WEBRTC] switched to camera \(camera.localizedName, privacy: .public)")
    }

    func getStats() async -> CallStats? {
        guard let pc = peerConnection else { return nil }
        // Project the framework's `RTCStatisticsReport` into `[CallStats.RawEntry]`
        // inside the nonisolated `pc.statistics` callback, then reduce it after the
        // continuation returns (`CallStats.init` is @MainActor; getStats() runs on
        // the main actor). The arithmetic lives in the pure, tested
        // `CallStats.reduce` (§5.7) — here we only adapt NSObject → Double.
        let entries: [CallStats.RawEntry] = await withCheckedContinuation { continuation in
            pc.statistics { report in
                let numericKeys = [
                    "currentRoundTripTime", "availableOutgoingBitrate",
                    "packetsLost", "packetsReceived",
                    "packetsSent", "bytesSent", "bytesReceived"
                ]
                var parsed: [CallStats.RawEntry] = []
                parsed.reserveCapacity(report.statistics.count)
                for (id, stats) in report.statistics {
                    let values = stats.values
                    var nums: [String: Double] = [:]
                    for key in numericKeys {
                        if let number = values[key] as? NSNumber { nums[key] = number.doubleValue }
                    }
                    parsed.append(CallStats.RawEntry(
                        id: id,
                        type: stats.type,
                        kind: (values["kind"] as? String) ?? (values["mediaType"] as? String),
                        codecId: values["codecId"] as? String,
                        mimeType: values["mimeType"] as? String,
                        values: nums
                    ))
                }
                continuation.resume(returning: parsed)
            }
        }

        let result = CallStats.reduce(entries: entries)
        Logger.webrtc.info(
            "[CALL-DIAG][STATS] sent=\(result.bandwidth)B/\(result.outboundPacketsSent)pkt recvAudio=\(result.inboundAudioPackets)pkt recvVideo=\(result.inboundVideoPackets)pkt rtt=\(result.roundTripTimeMs)ms lost=\(result.packetsLost) bwe=\(result.availableOutgoingBitrateBps)bps codec=\(result.codec ?? "?", privacy: .public)"
        )
        return result
    }

    // MARK: - DataChannel

    func createDataChannel(label: String) -> Bool {
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
        Logger.webrtc.info("DTMF: sending '\(digits)'")
    }

    private func startDataChannelPing() {
        stopDataChannelPing()
        dataChannelPingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(QualityThresholds.dataChannelPingIntervalSeconds))
                guard !Task.isCancelled, let self else { break }
                self.sendDataChannelMessage(Data("{\"type\":\"ping\"}".utf8))
            }
        }
    }

    private func stopDataChannelPing() {
        dataChannelPingTask?.cancel()
        dataChannelPingTask = nil
    }

    // MARK: - Audio Effects

    func setAudioEffect(_ effect: AudioEffectConfig?) throws {
        try _audioEffectsService.setEffect(effect)
        Logger.webrtc.info("Audio effect set: \(effect?.effectType.rawValue ?? "none")")
    }

    func updateAudioEffectParams(_ config: AudioEffectConfig) throws {
        try _audioEffectsService.updateParams(config)
    }

    // MARK: - Disconnect

    func disconnect() {
        sessionGeneration += 1
        _audioEffectsService.reset()
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
        pendingIceRestart = false
        Logger.webrtc.info("Peer connection disconnected and cleaned up")
    }

    deinit {
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

    private func setLocalDescription(_ sdp: RTCSessionDescription, on pc: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setLocalDescription(sdp) { error in
                if let error { cont.resume(throwing: error) }
                else { cont.resume() }
            }
        }
    }

    /// Validates a remote SDP string before passing it to libwebrtc. A hostile peer
    /// could send an arbitrarily large or malformed SDP that triggers parsing errors
    /// or memory pressure inside libwebrtc. We guard against the most obvious attacks:
    /// excessive length and missing mandatory first line.
    private static func validateRemoteSDP(_ sdp: String) throws {
        guard sdp.count <= 1_000_000 else {
            Logger.webrtc.error("Remote SDP too large (\(sdp.count) bytes) — rejecting")
            throw WebRTCError.failedToCreateSDP
        }
        guard sdp.hasPrefix("v=0") else {
            Logger.webrtc.error("Remote SDP missing required v=0 line — rejecting")
            throw WebRTCError.failedToCreateSDP
        }
    }

    private func setRemoteDescription(_ sdp: RTCSessionDescription, on pc: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(sdp) { error in
                if let error { cont.resume(throwing: error) }
                else { cont.resume() }
            }
        }
    }

    private func selectFormat(for device: AVCaptureDevice) -> AVCaptureDevice.Format? {
        // Préférer un format <=720p qui supporte 30fps. Sans le filtre fps,
        // l'iPhone Pro peut sélectionner un format slow-motion 720p@120/240fps
        // (où minFrameRate=maxFrameRate=120) — `RTCCameraVideoCapturer.startCapture`
        // est alors appelé en fps=120, ce qui produit `FigCaptureSourceRemote
        // err=-17281` (kCMIOHardwareDeviceUnsupportedFormatError) sur certains
        // devices et gaspille batterie/CPU sur tous.
        // Ceiling derived from VideoConfig.hd720p30 so the camera picker and the
        // encoding config stay in sync when the preset is updated.
        let targetFPS = Float64(VideoConfig.hd720p30.maxFrameRate)
        let maxW = Int32(VideoConfig.hd720p30.maxResolution.width)
        let maxH = Int32(VideoConfig.hd720p30.maxResolution.height)
        let supports30fps: (AVCaptureDevice.Format) -> Bool = { f in
            f.videoSupportedFrameRateRanges.contains { $0.minFrameRate <= targetFPS && targetFPS <= $0.maxFrameRate }
        }

        let supported = RTCCameraVideoCapturer.supportedFormats(for: device)
        let sorted = supported.sorted { f1, f2 in
            let d1 = CMVideoFormatDescriptionGetDimensions(f1.formatDescription)
            let d2 = CMVideoFormatDescriptionGetDimensions(f2.formatDescription)
            return d1.width * d1.height < d2.width * d2.height
        }

        if let format = sorted.last(where: { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return d.width <= maxW && d.height <= maxH && supports30fps(f)
        }) {
            return format
        }

        if let format = sorted.last(where: { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return d.width <= maxW && d.height <= maxH
        }) {
            return format
        }

        return sorted.first(where: supports30fps) ?? supported.last
    }

    static func mungeOpusSDP(_ sdp: String) -> String {
        // Phase 2 — `usedtx=1` enables Opus discontinuous transmission (silence
        // suppression). libwebrtc 141 iOS ObjC binding does NOT expose a `dtx`
        // property on RTCRtpEncodingParameters, so DTX remains driven via fmtp
        // here. `useinbandfec=1` is similarly fmtp-only (no native API).
        // maxaveragebitrate, stereo, maxplaybackrate remain as quality hints.
        // The earlier diagnostic that toggled `usedtx=0` (suspected of silent
        // audio after ICE) was disproven once RED munging was disabled in
        // 9e663039 — the PT/PT bug was the real cause, not DTX.
        // Reference §3.8 + ADR-4.
        let opusParams = [
            "maxaveragebitrate=\(QualityThresholds.opusFmtpMaxAverageBitrate)",
            "stereo=1",
            "useinbandfec=1",
            "usedtx=1",
            "maxplaybackrate=\(QualityThresholds.opusFmtpMaxPlaybackRate)"
        ]
        let paramString = opusParams.joined(separator: ";")

        var lines = sdp.components(separatedBy: "\r\n")
        var opusPayloadType: String?

        for line in lines where line.hasPrefix("a=rtpmap:") && line.contains("opus/48000") {
            let parts = line.dropFirst("a=rtpmap:".count).split(separator: " ", maxSplits: 1)
            if let pt = parts.first {
                opusPayloadType = String(pt)
            }
        }

        guard let payloadType = opusPayloadType else { return sdp }

        let fmtpPrefix = "a=fmtp:\(payloadType) "
        var found = false
        lines = lines.map { line in
            guard line.hasPrefix(fmtpPrefix) else { return line }
            found = true
            let existing = line.dropFirst(fmtpPrefix.count)
            var params = existing.split(separator: ";").map(String.init)
            let newKeys = Set(opusParams.map { $0.split(separator: "=", maxSplits: 1).first.map(String.init) ?? "" })
            params.removeAll { param in
                let key = param.split(separator: "=", maxSplits: 1).first.map(String.init) ?? ""
                return newKeys.contains(key)
            }
            params.append(contentsOf: opusParams)
            return fmtpPrefix + params.joined(separator: ";")
        }

        if !found {
            if let rtpmapIndex = lines.firstIndex(where: { $0.hasPrefix("a=rtpmap:\(payloadType) ") }) {
                lines.insert(fmtpPrefix + paramString, at: rtpmapIndex + 1)
            }
        }

        return lines.joined(separator: "\r\n")
    }

    static func addTransportCC(_ sdp: String) -> String {
        let transportCCURI = "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"
        guard !sdp.contains(transportCCURI) else { return sdp }

        var lines = sdp.components(separatedBy: "\r\n")
        var usedExtmapIDs = Set<Int>()
        for line in lines where line.hasPrefix("a=extmap:") {
            let idStr = line.dropFirst("a=extmap:".count).split(separator: " ", maxSplits: 1).first ?? ""
            let cleanID = idStr.split(separator: "/").first ?? idStr
            if let id = Int(cleanID) { usedExtmapIDs.insert(id) }
        }

        var extID = QualityThresholds.extmapStartId
        while usedExtmapIDs.contains(extID) { extID += 1 }
        guard extID <= QualityThresholds.extmapMaxId else {
            // All 1-byte IDs exhausted — IDs ≥15 require the 2-byte extmap
            // form (RFC 5285 §4.2) which not all peers handle. Do not inject
            // rather than risk an invalid SDP.
            Logger.webrtc.fault("[WEBRTC] extmap ID exhausted (IDs \(QualityThresholds.extmapStartId)–\(QualityThresholds.extmapMaxId) all taken) — Transport-CC not injected into SDP")
            return sdp
        }
        let extmapLine = "a=extmap:\(extID) \(transportCCURI)"

        for i in 0..<lines.count where lines[i].hasPrefix("m=audio ") || lines[i].hasPrefix("m=video ") {
            var insertIdx = i + 1
            while insertIdx < lines.count && !lines[insertIdx].hasPrefix("m=") {
                if lines[insertIdx].hasPrefix("a=extmap:") {
                    insertIdx += 1
                    continue
                }
                if lines[insertIdx].hasPrefix("a=") && !lines[insertIdx].hasPrefix("a=extmap:") { break }
                insertIdx += 1
            }
            lines.insert(extmapLine, at: insertIdx)
        }

        return lines.joined(separator: "\r\n")
    }

    static func addVideoBitrateHints(_ sdp: String) -> String {
        var lines = sdp.components(separatedBy: "\r\n")
        var inVideoSection = false

        for i in 0..<lines.count {
            if lines[i].hasPrefix("m=video ") {
                inVideoSection = true
                continue
            }
            if lines[i].hasPrefix("m=") { inVideoSection = false }
            guard inVideoSection && lines[i].hasPrefix("a=fmtp:") else { continue }
            guard !lines[i].contains("x-google-max-bitrate") else { continue }
            lines[i] += ";x-google-max-bitrate=\(QualityThresholds.sdpVideoMaxBitrateKbps);x-google-min-bitrate=\(QualityThresholds.sdpVideoMinBitrateKbps)"
        }

        return lines.joined(separator: "\r\n")
    }

    private func targetFrameRate(for format: AVCaptureDevice.Format) -> Int {
        // Visons 30fps pour les appels vidéo (assez lisse, ~2x moins de CPU/batterie
        // que 60fps). Si le format ne contient pas 30 dans une de ses ranges
        // (ex: format slow-mo pure 120fps-only), fallback sur la valeur la plus
        // proche de 30 atteignable — JAMAIS le maxFrameRate brut, qui pour un
        // format 120fps-only ferait crasher `startCapture` avec
        // `FigCaptureSourceRemote err=-17281`.
        let target: Float64 = 30
        let ranges = format.videoSupportedFrameRateRanges
        if ranges.contains(where: { $0.minFrameRate <= target && target <= $0.maxFrameRate }) {
            return Int(target)
        }
        let candidates = ranges.flatMap { range in
            [max(range.minFrameRate, min(range.maxFrameRate, target)), range.minFrameRate, range.maxFrameRate]
        }
        let closest = candidates.min(by: { abs($0 - target) < abs($1 - target) }) ?? target
        return Int(closest)
    }
}

// MARK: - RTCPeerConnectionDelegate
//
// Toutes ces méthodes sont invoquées par WebRTC depuis son `signaling_thread`
// (et `network_thread` pour ICE). Sous Swift 6 + default isolation = MainActor
// du target Meeshy, l'@objc thunk généré par le compilateur vérifie l'executor
// au runtime et trap (`_swift_task_checkIsolatedSwift` →
// `dispatch_assert_queue_fail`) dès que WebRTC livre un callback hors du Main
// — typiquement quand `peerConnection.add(audioTrack, …)` déclenche
// `peerConnectionShouldNegotiate(_:)` synchrone depuis le signaling thread,
// ce qui ferme l'app au lancement de l'appel.
//
// Fix : marquer chaque méthode `nonisolated` pour autoriser l'appel depuis
// n'importe quel thread. Toute mutation de state qui touche le ViewModel
// reste dispatchée vers Main via `DispatchQueue.main.async` (already in
// place pour le delegate forwarding).

extension P2PWebRTCClient: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        Logger.webrtc.info("Signaling state: \(stateChanged.rawValue)")
    }

    // P0-2 — PRIMARY remote-track path under Unified-Plan. `didStartReceivingOn`
    // fires deterministically when a receiver's track goes live, exposing it via
    // `transceiver.receiver.track`. The legacy `didAdd stream:` below is a
    // stream-based callback that under unified-plan can deliver late or be missed
    // (black/intermittent remote video). Both feed `deliverRemoteTrack`, whose
    // `!==` guard makes a second delivery of the same track a no-op.
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didStartReceivingOn transceiver: RTCRtpTransceiver) {
        Logger.webrtc.info("[WEBRTC] didStartReceivingOn mediaType=\(transceiver.mediaType.rawValue)")
        deliverRemoteTrack(transceiver.receiver.track)
    }

    // P0-2 (FIX 2026-06-06) — onTrack under Unified-Plan. Fires on
    // setRemoteDescription when each remote receiver is created, BEFORE any RTP
    // arrives — so the remote video track reaches the renderer immediately
    // instead of the UI being stuck on "Connexion vidéo…". This is the most
    // reliable remote-track signal: `didStartReceivingOn` only fires once RTP is
    // actually flowing (never, if media is delayed/blocked) and `didAdd stream:`
    // is a Plan-B legacy callback that libwebrtc may not emit under Unified-Plan.
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver, streams mediaStreams: [RTCMediaStream]) {
        Logger.webrtc.info("[WEBRTC] didAddReceiver kind=\(rtpReceiver.track?.kind ?? "nil", privacy: .public)")
        deliverRemoteTrack(rtpReceiver.track)
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        deliverRemoteTrack(stream.videoTracks.first)
        deliverRemoteTrack(stream.audioTracks.first)
    }

    /// Routes a freshly-received remote track to the delegate exactly once. Both
    /// `didStartReceivingOn` (unified-plan, primary) and `didAdd stream:` (legacy
    /// fallback) can fire for the same track — the `!==` guard prevents attaching
    /// the same track to the renderer twice.
    nonisolated private func deliverRemoteTrack(_ track: RTCMediaStreamTrack?) {
        guard let track else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let videoTrack = track as? RTCVideoTrack {
                guard self.remoteVideoTrack_ !== videoTrack else { return }
                self.remoteVideoTrack_ = videoTrack
                self.delegate?.webRTCClient(self, didReceiveRemoteVideoTrack: videoTrack)
                Logger.webrtc.info("[WEBRTC] remote video track delivered")
            } else if let audioTrack = track as? RTCAudioTrack {
                guard self.remoteAudioTrack_ !== audioTrack else { return }
                self.remoteAudioTrack_ = audioTrack
                self.delegate?.webRTCClient(self, didReceiveRemoteAudioTrack: audioTrack)
                Logger.webrtc.info("[WEBRTC] remote audio track delivered")
            }
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        Logger.webrtc.info("Remote stream removed")
    }

    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        Logger.webrtc.info("Negotiation needed")
    }

    // §3.2 — FSM AUTHORITY. `RTCPeerConnectionState` aggregates ICE *and* DTLS:
    // it only reports `.connected` once the DTLS handshake completes and SRTP
    // media keys exist. Driving the call FSM off this (rather than
    // `RTCIceConnectionState`, which can read `.connected` while DTLS is still
    // negotiating) is the reliable "connected" gate the redesign requires —
    // transitioning the UI to connected before keys exist produced silent /
    // one-way audio (bug a'). The ObjC selector is
    // `peerConnection:didChangeConnectionState:`; Swift imports it as
    // `peerConnection(_:didChange:)` disambiguated by the enum type.
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        let state: PeerConnectionState = switch newState {
        case .new: .new
        case .connecting: .connecting
        case .connected: .connected
        case .disconnected: .disconnected
        case .failed: .failed
        case .closed: .closed
        @unknown default: .new
        }
        Logger.webrtc.info("peerConnectionState (authority): \(state.rawValue, privacy: .public)")
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.webRTCClient(self, didChangeConnectionState: state)
        }
    }

    // §3.2 — DIAGNOSTIC ONLY. ICE state is retained for observability and
    // quality diagnostics but is NO LONGER the FSM authority: ICE can reach
    // `.connected` before the DTLS handshake, so transitioning the call here
    // raced media-key setup and caused one-way / silent audio. The authority
    // moved to `peerConnection(_:didChange: RTCPeerConnectionState)` above.
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        Logger.webrtc.info("iceConnectionState (diagnostic): \(newState.rawValue)")
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        Logger.webrtc.info("ICE gathering state: \(newState.rawValue)")
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        let iceCandidate = IceCandidate(
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            candidate: candidate.sdp
        )
        let diagTyp: String = {
            guard let r = candidate.sdp.range(of: "typ ") else { return "?" }
            return String(candidate.sdp[r.upperBound...].split(separator: " ").first ?? "?")
        }()
        Logger.webrtc.info("ICE_OUT typ=\(diagTyp, privacy: .public) mid=\(candidate.sdpMid ?? "nil", privacy: .public)")
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.webRTCClient(self, didGenerateCandidate: iceCandidate)
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {
        Logger.webrtc.debug("Removed \(candidates.count) ICE candidates")
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        Logger.webrtc.info("Data channel opened: \(dataChannel.label)")
        guard dataChannel.label == "transcription" else { return }
        dataChannel.delegate = self
        DispatchQueue.main.async { [weak self] in
            self?.transcriptionDataChannel = dataChannel
        }
    }
}

// MARK: - RTCDataChannelDelegate
//
// Idem RTCPeerConnectionDelegate — les data channel callbacks arrivent du
// signaling thread WebRTC, donc `nonisolated`.

extension P2PWebRTCClient: RTCDataChannelDelegate {
    nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        let state = dataChannel.readyState
        Logger.webrtc.info("DataChannel '\(dataChannel.label)' state: \(state.rawValue)")
        DispatchQueue.main.async { [weak self] in
            if state == .open {
                self?.startDataChannelPing()
            } else {
                self?.stopDataChannelPing()
            }
        }
    }

    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        let data = buffer.data
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.delegate?.webRTCClient(self, didReceiveDataChannelMessage: data)
        }
    }
}

#else

// MARK: - Fallback (WebRTC framework not available)

final class P2PWebRTCClient: WebRTCClientProviding {
    weak var delegate: (any WebRTCClientDelegate)?
    var isConnected: Bool { false }
    var localVideoTrack: Any? { nil }
    var remoteVideoTrack: Any? { nil }

    func configure(iceServers: [IceServer]) throws {
        Logger.webrtc.warning("WebRTC framework not available - calls are disabled")
        throw WebRTCError.notSupported
    }

    func updateIceServers(_ iceServers: [IceServer]) {}
    func setNegotiationRole(isPolite: Bool) {}
    func restartIce() {}

    func createOffer() async throws -> SessionDescription { throw WebRTCError.notSupported }
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription { throw WebRTCError.notSupported }
    func setRemoteAnswer(_ answer: SessionDescription) async throws { throw WebRTCError.notSupported }
    func addIceCandidate(_ candidate: IceCandidate) async throws { throw WebRTCError.notSupported }
    func startLocalMedia(type: CallMediaType) async throws { throw WebRTCError.notSupported }
    func toggleAudio(_ enabled: Bool) {}
    func toggleVideo(_ enabled: Bool) {}
    func applyVideoEncoding(maxBitrateBps: Int, maxFramerate: Int, scaleResolutionDownBy: Double) {}
    func setMaxAudioBitrate(_ bitrate: Int) {}
    var hasLocalVideoTrack: Bool { false }
    func enableLocalVideo() async throws -> Bool { throw WebRTCError.notSupported }
    func disableLocalVideo() async -> Bool { false }
    func switchCamera() async throws {}
    func availableCameras() -> [CameraDeviceOption] { [] }
    func switchToCamera(uniqueID: String) async throws {}
    func getStats() async -> CallStats? { nil }
    func createDataChannel(label: String) -> Bool { false }
    func sendDataChannelMessage(_ data: Data) {}
    func sendDTMF(digits: String) {}
    func disconnect() {}

    var audioEffectsService: CallAudioEffectsServiceProviding? { nil }
    func setAudioEffect(_ effect: AudioEffectConfig?) throws { throw WebRTCError.notSupported }
    func updateAudioEffectParams(_ config: AudioEffectConfig) throws { throw WebRTCError.notSupported }
}

#endif

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let webrtc = Logger(subsystem: "me.meeshy.app", category: "webrtc")
}
