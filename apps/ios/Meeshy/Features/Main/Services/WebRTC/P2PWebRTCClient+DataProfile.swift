import Foundation

#if canImport(WebRTC)

extension P2PWebRTCClient: CallDataProfileApplying {
    /// The next local description (offer, answer, ICE restart) carries the
    /// profile's Opus fmtp; the sender parameters are driven live by
    /// `WebRTCService`, so no renegotiation is forced here (#8697).
    func applyDataProfile(_ profile: CallDataProfile) {
        dataProfile = profile
    }

    static func mungeOpusSDP(_ sdp: String, audio: CallAudioBudget = CallDataProfile.wifi.budget.audio) -> String {
        OpusFmtpMunger.munge(sdp, audio: audio)
    }
}

#else

extension P2PWebRTCClient: CallDataProfileApplying {
    func applyDataProfile(_ profile: CallDataProfile) {}
}

#endif
