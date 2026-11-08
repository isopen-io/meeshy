import Foundation

/// Ce que l'aperçu avant décroché (#8480) lit de l'état d'appel : la phase à
/// montrer et si l'appel sonne dans l'app. Règles pures, sorties de
/// `CallManager` qui ne fait que les appliquer à son appel
/// (`CallManager.previewHostState`).
enum CallPreviewPhaseRule {

    /// #8627 — CallKit ne montre pas de vidéo, mais un appel qu'il signale
    /// sonne aussi dans l'app dès qu'elle est au premier plan.
    nonisolated static func ringsInApp(usesCallKit: Bool, isAppActive: Bool) -> Bool {
        !usesCallKit || isAppActive
    }

    nonisolated static func phase(of state: CallState, ringsInApp: Bool) -> CallPreviewPhase {
        switch state {
        case .idle: return .none
        case .ringing(let isOutgoing) where isOutgoing: return .outgoingRinging
        case .ringing: return ringsInApp ? .incomingRinging : .none
        case .offering: return .outgoingRinging
        case .connecting: return .answering
        case .connected, .reconnecting: return .connected
        case .ended: return .ended
        }
    }
}
