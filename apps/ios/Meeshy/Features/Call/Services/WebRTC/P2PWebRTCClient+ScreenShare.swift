import CoreVideo
import Foundation
import os

#if canImport(WebRTC)
import WebRTC

// #8063 — la piste « écran » d'un appel. Hors de `P2PWebRTCClient.swift`,
// déjà hors budget de taille : ce fichier n'y a laissé qu'une propriété.
//
// Le partage REMPLACE la piste de l'émetteur vidéo réservé (§5.1 : la ligne
// m= vidéo existe toujours, même en audio) : aucune ligne m= de plus, donc
// aucun ordre SDP à renégocier quand la caméra tournait déjà. La caméra
// n'est pas arrêtée : l'arrêt du partage la rebranche telle quelle.

extension P2PWebRTCClient {
    func beginScreenShareTrack() async throws -> ScreenShareTrackActivation {
        guard let pc = peerConnection else { throw WebRTCError.noPeerConnection }
        let feed = ScreenShareVideoFeed(factory: factory)
        screenShareFeed = feed
        if let transceiver = videoTransceiver {
            let wasSending = transceiver.direction == .sendRecv || transceiver.direction == .sendOnly
            transceiver.sender.track = feed.track
            forceSendRecv(transceiver)
            applyScreenShareEncoding()
            Logger.webrtc.info("[WEBRTC] screen share track attached renegotiation=\(!wasSending, privacy: .public)")
            return ScreenShareTrackActivation(sink: feed, needsRenegotiation: !wasSending)
        }
        let initializer = RTCRtpTransceiverInit()
        initializer.direction = .sendRecv
        initializer.streamIds = ["meeshy-stream-0"]
        guard let transceiver = pc.addTransceiver(of: .video, init: initializer) else {
            screenShareFeed = nil
            throw WebRTCError.failedToCreateSDP
        }
        transceiver.sender.track = feed.track
        videoTransceiver = transceiver
        applyVideoCodecPreferences(videoTransceiver: transceiver)
        applyScreenShareEncoding()
        Logger.webrtc.info("[WEBRTC] screen share track attached (added transceiver) renegotiation=true")
        return ScreenShareTrackActivation(sink: feed, needsRenegotiation: true)
    }

    /// Rebranche la caméra si elle émettait, sinon repasse l'émetteur en
    /// réception seule — l'état exact d'avant le partage.
    func endScreenShareTrack(restoreCamera: Bool) async -> Bool {
        screenShareFeed = nil
        guard let transceiver = videoTransceiver else { return false }
        if restoreCamera, let camera = localVideoTrack_, camera.isEnabled {
            transceiver.sender.track = camera
            applyVideoEncoding()
            Logger.webrtc.info("[WEBRTC] screen share ended — camera track restored")
            return false
        }
        let wasSending = transceiver.direction == .sendRecv || transceiver.direction == .sendOnly
        transceiver.sender.track = nil
        var error: NSError?
        transceiver.setDirection(.recvOnly, error: &error)
        if let error {
            Logger.webrtc.warning("[WEBRTC] setDirection(.recvOnly) after screen share failed: \(error.localizedDescription, privacy: .public)")
        }
        Logger.webrtc.info("[WEBRTC] screen share ended — video back to recvonly renegotiation=\(wasSending, privacy: .public)")
        return wasSending
    }

    /// Un écran se LIT : sous congestion, mieux vaut perdre des images que
    /// de la netteté — l'inverse du visage filmé.
    private func applyScreenShareEncoding() {
        applyVideoEncoding(
            maxFramerate: ScreenShareVideoFeed.maxFramesPerSecond,
            degradationPreference: .maintainResolution
        )
    }

    /// Extracts per-m-section direction (sendrecv/sendonly/recvonly/inactive)
    /// from an SDP string. Used in logs to diagnose one-way media: a peer whose
    /// answer is `recvonly`/`inactive` for a given m-section is not sending RTP
    /// for that track, which appears as zero inbound packets on our side.
    /// Sorti de `P2PWebRTCClient.swift` (#8063) pour y payer la propriété
    /// `screenShareFeed` : le fichier est hors budget de taille.
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
}

/// La source vidéo « écran » : un `RTCVideoSource` de capture d'écran
/// alimenté à la main, trame par trame, depuis la file du socket.
nonisolated final class ScreenShareVideoFeed: ScreenShareFrameSink, @unchecked Sendable {
    static let maxFramesPerSecond = 15

    let track: RTCVideoTrack
    private let source: RTCVideoSource
    private let capturer: RTCVideoCapturer

    init(factory: RTCPeerConnectionFactory) {
        source = factory.videoSource(forScreenCast: true)
        capturer = RTCVideoCapturer(delegate: source)
        track = factory.videoTrack(with: source, trackId: "screen0")
        track.isEnabled = true
    }

    func push(pixelBuffer: CVPixelBuffer, rotationDegrees: Int, timestampNs: Int64) {
        let frame = RTCVideoFrame(
            buffer: RTCCVPixelBuffer(pixelBuffer: pixelBuffer),
            rotation: Self.rotation(degrees: rotationDegrees),
            timeStampNs: timestampNs
        )
        source.capturer(capturer, didCapture: frame)
    }

    private static func rotation(degrees: Int) -> RTCVideoRotation {
        switch degrees {
        case 90: return ._90
        case 180: return ._180
        case 270: return ._270
        default: return ._0
        }
    }
}

#endif
