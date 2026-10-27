import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - WebRTC Client Delegate

protocol WebRTCClientDelegate: AnyObject {
    func webRTCClient(_ client: any WebRTCClientProviding, didGenerateCandidate candidate: IceCandidate)
    func webRTCClient(_ client: any WebRTCClientProviding, didChangeConnectionState state: PeerConnectionState)
    // `sending` lets the non-Sendable RTC track cross from the WebRTC framework's
    // own thread into our `@MainActor` Task without a Swift 6 strict-concurrency
    // diagnostic. The framework hands us a unique reference and never reads it
    // again after the delegate fires, so exclusive transfer is sound.
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteVideoTrack track: sending Any)
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteAudioTrack track: sending Any)
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveDataChannelMessage data: Data)
    /// C3 — la session de capture caméra locale a été interrompue par le système
    /// (ou l'interruption a pris fin). C'est le SEUL fait qui prouve que la
    /// caméra ne délivre plus : passer en arrière-plan ne l'éteint pas quand un
    /// `AVPictureInPictureController` est actif et que la session porte
    /// `isMultitaskingCameraAccessEnabled`.
    func webRTCClient(_ client: any WebRTCClientProviding, didChangeCameraInterruption interrupted: Bool)
}

extension WebRTCClientDelegate {
    // Optionnelle : seul `WebRTCService` relaie l'interruption de capture.
    func webRTCClient(_ client: any WebRTCClientProviding, didChangeCameraInterruption interrupted: Bool) {}
}
