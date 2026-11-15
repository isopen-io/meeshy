import Foundation

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
enum WebRTCSharedFactory {
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

/// **La configuration UNIQUE d'une connexion d'appel** — appel à deux comme lien
/// du maillage de groupe. Une connexion construite ailleurs échapperait au
/// réglage « masquer mon adresse IP » (#11296).
enum WebRTCPeerConfiguration {
    static func make(iceServers: [RTCIceServer], transport: CallIceTransport) -> RTCConfiguration {
        let config = RTCConfiguration()
        config.iceServers = iceServers
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually
        config.bundlePolicy = .maxBundle
        config.rtcpMuxPolicy = .require
        // PERF-003: pre-warm ICE candidate gathering while the user is still
        // tapping Answer — typically shaving 200–400ms off the connect time.
        config.iceCandidatePoolSize = Int32(QualityThresholds.iceCandidatePoolSize)
        config.iceTransportPolicy = transport == .relayOnly ? .relay : .all
        return config
    }
}

#endif
