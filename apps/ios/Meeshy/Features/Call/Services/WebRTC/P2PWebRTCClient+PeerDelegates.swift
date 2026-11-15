import Foundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC

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
        deliverRemoteTrack(transceiver.receiver.track, from: peerConnection)
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
        deliverRemoteTrack(rtpReceiver.track, from: peerConnection)
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        deliverRemoteTrack(stream.videoTracks.first, from: peerConnection)
        deliverRemoteTrack(stream.audioTracks.first, from: peerConnection)
    }

    /// Routes a freshly-received remote track to the delegate exactly once. Both
    /// `didStartReceivingOn` (unified-plan, primary) and `didAdd stream:` (legacy
    /// fallback) can fire for the same track — the `!==` guard prevents attaching
    /// the same track to the renderer twice.
    ///
    /// `disconnect()` calls `peerConnection?.close()` then nils the property —
    /// `.close()` synchronously queues these WebRTC-thread callbacks, which land
    /// on the main queue AFTER `disconnect()` has already returned. If a new call
    /// reuses this client (redial, or a fast VoIP-push-driven incoming call) and
    /// calls `configure()` before the stale block runs, it would otherwise deliver
    /// call A's track into call B's state. Comparing against the originating
    /// `RTCPeerConnection` instance (captured at the delegate call site, not the
    /// `self.peerConnection` snapshotted here) makes every stale callback a no-op.
    nonisolated private func deliverRemoteTrack(_ track: RTCMediaStreamTrack?, from peerConnection: RTCPeerConnection) {
        guard let track else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.peerConnection === peerConnection else { return }
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
        // Identity guard: see `deliverRemoteTrack` — a stale `.closed`/`.failed` from a
        // just-torn-down connection must not drive the FSM of a call that has already
        // moved on (e.g. attemptReconnection() firing on a healthy new call).
        DispatchQueue.main.async { [weak self] in
            guard let self, self.peerConnection === peerConnection else { return }
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
        // Identity guard: see `deliverRemoteTrack` — without this, a candidate generated
        // by a connection that's already being torn down gets tagged with the CURRENT
        // call's callId/remoteUserId by CallManager and relayed into the new call's
        // signaling, polluting its negotiation.
        DispatchQueue.main.async { [weak self] in
            guard let self, self.peerConnection === peerConnection else { return }
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
        // Identity guard: see `deliverRemoteTrack` — a data channel opened by a torn-down
        // connection must not overwrite the new call's transcriptionDataChannel.
        DispatchQueue.main.async { [weak self] in
            guard let self, self.peerConnection === peerConnection else { return }
            self.transcriptionDataChannel = dataChannel
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
        // Identity guard: see `deliverRemoteTrack` — a stale state notification from a
        // torn-down call's data channel must not start/stop the keep-alive ping owned by
        // the NEW call's transcriptionDataChannel.
        DispatchQueue.main.async { [weak self] in
            guard let self, dataChannel === self.transcriptionDataChannel else { return }
            if state == .open {
                self.startDataChannelPing()
            } else {
                self.stopDataChannelPing()
            }
        }
    }

    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        let data = buffer.data
        // Identity guard: see `deliverRemoteTrack` — a stale in-band message (notably
        // `{"type":"bye"}`, see `DataChannelInbound`) from a torn-down call's data channel
        // must not be forwarded as if it belonged to the call now in progress: CallManager
        // reads `currentCallId` (the NEW call's id) without validating the message's origin
        // channel, so an unguarded stale "bye" would hang up the wrong, active call.
        DispatchQueue.main.async { [weak self] in
            guard let self, dataChannel === self.transcriptionDataChannel else { return }
            self.delegate?.webRTCClient(self, didReceiveDataChannelMessage: data)
        }
    }
}

#endif
