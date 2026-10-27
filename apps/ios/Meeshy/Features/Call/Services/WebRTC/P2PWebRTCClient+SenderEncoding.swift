import Foundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC

/// Paramètres d'encodage appliqués à l'émetteur (sender) audio et vidéo d'un appel.
enum WebRTCSenderEncoding {
    // P1-1 + P1-2 — SOTA video sender parameters. libwebrtc otherwise lets the
    // encoder run open-loop (no native cap; the SDP `x-google-max-bitrate` hint is
    // soft and non-authoritative on iOS). We set an explicit max bitrate / max
    // framerate / resolution-downscale on every encoding, mirroring the audio
    // bitrate path (applyAudioCodecPreferences :295). `degradationPreference`
    // defaults to `.maintainFramerate`, which keeps talking-head motion fluid
    // and drops resolution first under congestion; the network-survival FREEZE
    // floor is the one caller that asks for `.maintainResolution` — at 2 fps a
    // still, legible image beats fluid mush.
    // Called once at capture start (720p30 / 2.5 Mbps) and again by the adaptive
    // quality loop (WebRTCService.adjustBitrate) with throttled targets.
    static func applyVideo(
        to sender: RTCRtpSender,
        maxBitrateBps: Int,
        maxFramerate: Int,
        scaleResolutionDownBy: Double,
        degradationPreference: VideoDegradationPreference
    ) {
        let params = sender.parameters
        params.degradationPreference = NSNumber(value: degradationPreference.rtcPreference.rawValue)
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
            let degradationStr = degradationPreference.rawValue
            Logger.webrtc.info("[WEBRTC] video encoding applied (max=\(maxBitrateBps / 1000, privacy: .public)kbps fps=\(maxFramerate, privacy: .public) scale=\(scaleStr, privacy: .public) degradation=\(degradationStr, privacy: .public) priority=high encodings=\(count, privacy: .public))")
        } else {
            Logger.webrtc.warning("[WEBRTC] video encoding NOT applied — encodings array empty")
        }
    }

    /// Adjusts the audio sender's max bitrate at runtime. Called by the
    /// quality-adaptation loop when the network tier changes (e.g. poor link
    /// drops from 64 kbps to 24 kbps so audio competes less with video).
    /// The min bitrate floor (16 kbps) set in `applyAudioCodecPreferences`
    /// is preserved — only the ceiling is modified.
    static func applyAudio(to sender: RTCRtpSender, maxBitrateBps: Int) {
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
}

// MARK: - VideoDegradationPreference → libwebrtc

private extension VideoDegradationPreference {
    var rtcPreference: RTCDegradationPreference {
        switch self {
        case .maintainFramerate: return .maintainFramerate
        case .maintainResolution: return .maintainResolution
        }
    }
}

#endif
