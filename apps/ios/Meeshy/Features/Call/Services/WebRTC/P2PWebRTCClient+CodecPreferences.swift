import Foundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC

/// Préférences de codec des transceivers d'un appel : Opus puis RED pour l'audio,
/// H264 > VP8 > VP9 pour la vidéo. Ne lit que le transceiver et la fabrique reçus.
enum WebRTCCodecPreferences {
    // Phase 2 — Apply audio codec preferences via libwebrtc 141 API.
    // Order: Opus first (primary), RED second (RFC 2198 redundancy).
    // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.8 + ADR-4
    //
    // RED was previously enabled via SDP munging (`addAudioRedundancy`) which
    // triggered an iOS libwebrtc bug with `a=fmtp:63 PT/PT` (silent audio after
    // ICE connected, commit 9e663039). Using setCodecPreferences avoids the
    // SDP regex path entirely — libwebrtc 141 negotiates RED via the standard
    // API correctly.
    static func applyAudio(to audioTransceiver: RTCRtpTransceiver, factory: RTCPeerConnectionFactory) {
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
    static func applyVideo(to videoTransceiver: RTCRtpTransceiver, factory: RTCPeerConnectionFactory) {
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
}

#endif
