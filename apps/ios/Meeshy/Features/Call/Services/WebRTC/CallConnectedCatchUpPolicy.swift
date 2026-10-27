import Foundation

extension CallReliabilityPolicy {
    /// #8270 — `.connected` is also read by LEVEL, not only by edge.
    ///
    /// `webRTCServiceDidConnect` fires on a `RTCPeerConnectionState` TRANSITION.
    /// An ICE restart on a pair that still carries media never leaves
    /// `.connected`, so no edge comes back; and an edge that lands while the FSM
    /// is still `.ringing` is dropped. Either way the FSM sat in
    /// `.connecting`/`.reconnecting` — "Connexion…" on screen, the watchdog
    /// escalating every 12 s — while media was flowing (incident 2026-09-27).
    /// A still-negotiating FSM whose peer connection already reports
    /// `.connected` catches up.
    static func shouldCatchUpConnected(callState: CallState, peerState: PeerConnectionState) -> Bool {
        guard peerState == .connected else { return false }
        switch callState {
        case .connecting, .reconnecting: return true
        case .idle, .ringing, .offering, .connected, .ended: return false
        }
    }
}
