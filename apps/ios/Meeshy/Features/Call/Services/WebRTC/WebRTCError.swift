import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Errors

enum WebRTCError: Error, LocalizedError, Sendable {
    case noPeerConnection
    case failedToCreatePeerConnection
    case failedToCreateSDP
    case noCameraAvailable
    case noCameraFormatAvailable
    case notSupported
    case simulatorVideoUnsupported
    case offerIgnored
    /// The user has denied camera access in iOS Settings. The call can continue
    /// as audio-only; the user must re-grant permission to enable video.
    case cameraPermissionDenied

    var errorDescription: String? {
        switch self {
        case .noPeerConnection: "No peer connection available"
        case .failedToCreatePeerConnection: "Failed to create peer connection"
        case .failedToCreateSDP: "Failed to create SDP"
        case .noCameraAvailable: "No camera available"
        case .noCameraFormatAvailable: "No suitable camera format"
        case .notSupported: "WebRTC not available on this device"
        case .simulatorVideoUnsupported:
            "Video unsupported on iOS Simulator (FigCaptureSourceRemote XPC failure). " +
            "Use a real device for video calls."
        case .offerIgnored:
            "Colliding offer ignored by the impolite peer (perfect negotiation glare)"
        case .cameraPermissionDenied:
            "Camera access denied. Enable it in Settings → Meeshy → Camera."
        }
    }
}
