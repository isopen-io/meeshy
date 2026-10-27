import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Video Degradation Preference

/// Which of the two encoder dimensions is sacrificed first when the link
/// cannot carry the configured target. Agnostic mirror of libwebrtc's
/// `RTCDegradationPreference` — this file deliberately carries no WebRTC
/// framework dependency (see the header), so the mapping lives in
/// `P2PWebRTCClient`.
enum VideoDegradationPreference: String, Sendable, Equatable {
    /// Keep motion fluid, shed resolution first — the talking-head default
    /// used by every rung of the quality ladder.
    case maintainFramerate
    /// Keep the picture sharp, shed frames first — used by the network-survival
    /// FREEZE floor, where a still, legible image beats fluid mush.
    case maintainResolution
}
