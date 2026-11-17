import Foundation
import AVFoundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC
import MeeshySDK

extension P2PWebRTCClient {

    /// §5.2 (offerer path) — create the audio (+ video when a local video track
    /// exists) `.sendRecv` transceivers, attach the prepared local tracks, and
    /// pin codec preferences. No-op once transceivers exist so renegotiation /
    /// ICE-restart never duplicates m-lines (stable layout = safe renegotiation
    /// + SFU-ready).
    func addOffererTransceiversIfNeeded(on pc: RTCPeerConnection) {
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
    func attachAnswererTracks(on pc: RTCPeerConnection) {
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
                if let video = localVideoTrack_, !localVideoWithheld {
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
}

#endif
